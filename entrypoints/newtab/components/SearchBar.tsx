import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Search,
  ChevronDown,
  Check,
  X,
  Clock,
  Trash2,
  LayoutGrid,
  PanelsTopLeft,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { browser } from 'wxt/browser';

import {
  DropdownMenuGroup,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FaviconImage } from './FaviconImage';
import type { AppSettings, SearchEngine } from '../types';
import {
  openUrlsInGrid,
  restoreOriginWindow,
  useWindowOpenPrefs,
  type GridOpenOriginWindow,
} from '../window-open';

// ── helpers ─────────────────────────────────────────────────────────

const SEARCH_BAR_UI_PREFS_KEY = 'newtab-pro:search-bar-batch-prefs';
const SUGGESTION_DEBOUNCE_MS = 250;
const SUGGESTION_REQUEST_TIMEOUT_MS = 2000;

type SearchBarUiPrefs = {
  selectedBatchEngineIds?: string[];
};

function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.searchUrl.replace('{query}', encodeURIComponent(query));
}

type SearchOpenMode = 'default' | 'current' | 'background' | 'foreground';

function getSearchOpenMode(event: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): SearchOpenMode {
  if (event.altKey) return 'current';
  if (event.ctrlKey || event.metaKey)
    return event.shiftKey ? 'foreground' : 'background';
  return 'default';
}

function buildSuggestUrl(
  engine: SearchEngine,
  query: string,
  defaultSuggestUrl = '',
): string {
  const url = engine.suggestUrl || defaultSuggestUrl;
  if (!url) return '';
  return url.replace('{query}', encodeURIComponent(query));
}

function readSearchBarUiPrefs(): SearchBarUiPrefs {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SEARCH_BAR_UI_PREFS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as SearchBarUiPrefs;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeSearchBarUiPrefs(prefs: SearchBarUiPrefs) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SEARCH_BAR_UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

async function fetchSuggestions(
  engine: SearchEngine,
  query: string,
  defaultSuggestUrl = '',
): Promise<string[]> {
  const url = buildSuggestUrl(engine, query, defaultSuggestUrl);
  if (!url || !query.trim()) return [];
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(SUGGESTION_REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    // Baidu sugrec format: {q, p, g: [{q: string, ...}]}
    if (!Array.isArray(data) && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (Array.isArray(d.g)) {
        return (d.g as Array<{ q?: string }>)
          .map((item) => item.q ?? '')
          .filter(Boolean)
          .slice(0, 8);
      }
      if (Array.isArray(d.s)) {
        return (d.s as string[]).filter(Boolean).slice(0, 8);
      }
    }
    // OpenSearch format: [query, [suggestions, ...]]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as unknown[])
        .map((s) =>
          typeof s === 'string'
            ? s
            : ((s as Record<string, string>)?.phrase ?? ''),
        )
        .filter(Boolean)
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

// ── EngineIcon ──────────────────────────────────────────────────────
function EngineIcon({
  engine,
  className,
}: {
  engine: SearchEngine;
  className?: string;
}) {
  if (engine.iconUrl) {
    return <img src={engine.iconUrl} className={className} alt="" />;
  }
  let origin = '';
  try {
    origin = new URL(engine.searchUrl.replace('{query}', 'q')).origin;
  } catch {}
  if (!origin) return null;
  return <FaviconImage url={origin} className={className} />;
}

// ── Component ────────────────────────────────────────────────────────

type SearchBarProps = {
  settings: AppSettings;
  onSetActiveEngine: (id: string) => void;
  onAddToHistory: (query: string) => void;
  onRemoveFromHistory: (query: string) => void;
  onClearHistory: () => void;
};

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    {
      settings,
      onSetActiveEngine,
      onAddToHistory,
      onRemoveFromHistory,
      onClearHistory,
    },
    forwardedRef,
  ) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [engineMenuOpen, setEngineMenuOpen] = useState(false);
    const [batchMenuOpen, setBatchMenuOpen] = useState(false);
    const [batchWindowIds, setBatchWindowIds] = useState<number[]>([]);
    const [selectedBatchEngineIds, setSelectedBatchEngineIds] = useState<
      string[]
    >(() => readSearchBarUiPrefs().selectedBatchEngineIds?.slice(0, 6) ?? []);
    const { compactGridWindows: useCompactGridWindows, setCompactGridWindows } =
      useWindowOpenPrefs();
    const inputRef = useRef<HTMLInputElement>(null);

    // Merge internal ref with forwarded ref
    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        (inputRef as React.MutableRefObject<HTMLInputElement | null>).current =
          node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (
            forwardedRef as React.MutableRefObject<HTMLInputElement | null>
          ).current = node;
        }
      },
      [forwardedRef],
    );

    const suggestTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const skipNextSuggestFetchRef = useRef(false);
    const navigationBaseQueryRef = useRef<string | null>(null);
    const batchOriginWindowRef = useRef<GridOpenOriginWindow | null>(null);

    const activeEngine =
      settings.searchEngines.find(
        (e) => e.id === settings.activeSearchEngineId,
      ) ?? settings.searchEngines[0];

    const history = settings.searchHistory ?? [];
    const openInNewTab = settings.openSearchInNewTab;
    const dropdownQuery = navigationBaseQueryRef.current ?? query;
    const selectedBatchEngines = useMemo(() => {
      const selected = selectedBatchEngineIds
        .map((id) => settings.searchEngines.find((engine) => engine.id === id))
        .filter((engine): engine is SearchEngine => !!engine)
        .slice(0, 6);

      if (selected.length > 0) {
        return selected;
      }

      return activeEngine ? [activeEngine] : [];
    }, [activeEngine, selectedBatchEngineIds, settings.searchEngines]);

    // What the dropdown is currently showing
    const showingHistory =
      !dropdownQuery.trim() && showDropdown && history.length > 0;
    const showingSuggestions =
      !!dropdownQuery.trim() && showDropdown && suggestions.length > 0;
    // Unified list of items driving keyboard navigation
    const dropItems: string[] = showingHistory
      ? history
      : showingSuggestions
        ? suggestions
        : [];

    // Debounced suggestions fetch
    useEffect(() => {
      clearTimeout(suggestTimerRef.current);
      if (navigationBaseQueryRef.current !== null) {
        return;
      }
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      if (skipNextSuggestFetchRef.current) {
        skipNextSuggestFetchRef.current = false;
        setSuggestions([]);
        return;
      }
      const defaultSuggestUrl = settings.defaultSuggestUrl ?? '';
      if (!activeEngine?.suggestUrl && !defaultSuggestUrl) {
        setSuggestions([]);
        return;
      }
      suggestTimerRef.current = setTimeout(async () => {
        const items = await fetchSuggestions(
          activeEngine,
          query,
          defaultSuggestUrl,
        );
        setSuggestions(items);
        if (items.length > 0) {
          setShowDropdown(true);
          setActiveIndex(-1);
        }
      }, SUGGESTION_DEBOUNCE_MS);

      return () => clearTimeout(suggestTimerRef.current);
    }, [query, activeEngine, settings.defaultSuggestUrl]);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          if (navigationBaseQueryRef.current !== null) {
            setQuery(navigationBaseQueryRef.current);
            navigationBaseQueryRef.current = null;
            setActiveIndex(-1);
          }
          setShowDropdown(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
      setSelectedBatchEngineIds((prev) => {
        const valid = prev
          .filter((id) =>
            settings.searchEngines.some((engine) => engine.id === id),
          )
          .slice(0, 6);
        if (valid.length > 0) {
          return valid;
        }
        return settings.searchEngines.slice(0, 2).map((engine) => engine.id);
      });
    }, [settings.searchEngines]);

    useEffect(() => {
      writeSearchBarUiPrefs({
        selectedBatchEngineIds,
      });
    }, [selectedBatchEngineIds]);

    useEffect(() => {
      const handleWindowRemoved = (windowId: number) => {
        setBatchWindowIds((prev) => prev.filter((id) => id !== windowId));
      };

      browser.windows.onRemoved.addListener(handleWindowRemoved);
      return () =>
        browser.windows.onRemoved.removeListener(handleWindowRemoved);
    }, []);

    const resetNavigationPreview = useCallback(() => {
      setActiveIndex(-1);
      if (navigationBaseQueryRef.current !== null) {
        setQuery(navigationBaseQueryRef.current);
        navigationBaseQueryRef.current = null;
      }
    }, []);

    const commitQueryValue = useCallback((value: string) => {
      navigationBaseQueryRef.current = null;
      setQuery(value);
      setActiveIndex(-1);
    }, []);

    const restoreBatchOriginWindow = useCallback(async (focus = true) => {
      await restoreOriginWindow(batchOriginWindowRef.current, focus);
      batchOriginWindowRef.current = null;
    }, []);

    const syncTrackedBatchWindows = useCallback(async () => {
      if (batchWindowIds.length === 0) {
        return [];
      }

      try {
        const openWindows = await browser.windows.getAll();
        const openIds = new Set(
          openWindows
            .map((windowItem) => windowItem.id)
            .filter(
              (windowId): windowId is number => typeof windowId === 'number',
            ),
        );
        const nextIds = batchWindowIds.filter((windowId) =>
          openIds.has(windowId),
        );
        setBatchWindowIds(nextIds);
        return nextIds;
      } catch {
        return batchWindowIds;
      }
    }, [batchWindowIds]);

    const performSearch = useCallback(
      (searchQuery: string, openMode: SearchOpenMode = 'default') => {
        const q = searchQuery.trim();
        if (!q || !activeEngine) return;
        onAddToHistory(q);
        skipNextSuggestFetchRef.current = true;
        commitQueryValue(q);
        setSuggestions([]);
        setShowDropdown(false);
        const url = buildSearchUrl(activeEngine, q);
        if (openMode === 'foreground' || openMode === 'background') {
          void browser.tabs.create({ url, active: openMode === 'foreground' });
        } else if (openMode === 'default' && openInNewTab) {
          window.open(url, '_blank', 'noreferrer');
        } else {
          window.location.href = url;
        }
      },
      [activeEngine, commitQueryValue, openInNewTab, onAddToHistory],
    );

    const prepareBatchSearch = useCallback(
      (searchQuery: string) => {
        const q = searchQuery.trim();
        if (!q) {
          toast.add({ title: '请输入搜索关键词' });
          inputRef.current?.focus();
          return null;
        }
        if (selectedBatchEngines.length === 0) {
          toast.add({ title: '请至少勾选一个搜索引擎' });
          return null;
        }

        onAddToHistory(q);
        skipNextSuggestFetchRef.current = true;
        commitQueryValue(q);
        setSuggestions([]);
        setShowDropdown(false);

        return {
          query: q,
          urls: selectedBatchEngines.map((engine) => ({
            engine,
            url: buildSearchUrl(engine, q),
          })),
        };
      },
      [commitQueryValue, onAddToHistory, selectedBatchEngines],
    );

    const rememberBatchWindows = useCallback((ids: number[]) => {
      if (ids.length === 0) return;
      setBatchWindowIds((prev) => [...new Set([...prev, ...ids])]);
    }, []);

    const handleBatchOpen = useCallback(async () => {
      const payload = prepareBatchSearch(
        activeIndex >= 0 ? dropItems[activeIndex] : query,
      );
      if (!payload) return;

      const urls = payload.urls.map((item) => item.url);
      try {
        const created = await browser.windows.create({
          url: urls,
          focused: true,
        });
        if (created && typeof created.id === 'number') {
          rememberBatchWindows([created.id]);
        }
        toast.add({
          title: '已批量打开',
          description: `${payload.urls.length} 个搜索结果已在新窗口打开`,
        });
      } catch (error) {
        toast.add({
          title: '批量打开失败',
          description:
            error instanceof Error ? error.message : '无法打开批量搜索窗口',
        });
      }
    }, [
      activeIndex,
      dropItems,
      prepareBatchSearch,
      query,
      rememberBatchWindows,
    ]);

    const handleBatchGridOpen = useCallback(async () => {
      const payload = prepareBatchSearch(
        activeIndex >= 0 ? dropItems[activeIndex] : query,
      );
      if (!payload) return;

      try {
        const targetUrls = payload.urls.map((item) => item.url);
        const { windowIds: createdWindowIds, originWindow } =
          await openUrlsInGrid(targetUrls, useCompactGridWindows);
        batchOriginWindowRef.current = originWindow ?? null;

        if (createdWindowIds.length === 0) {
          await restoreBatchOriginWindow();
          toast.add({
            title: '多窗口打开失败',
            description: '未能创建任何网格窗口',
          });
          return;
        }

        if (batchOriginWindowRef.current) {
          try {
            await browser.windows.update(batchOriginWindowRef.current.id, {
              state: 'minimized',
            });
          } catch {}
        }

        const lastWindowId = createdWindowIds.at(-1);
        if (typeof lastWindowId === 'number') {
          try {
            await browser.windows.update(lastWindowId, { focused: true });
          } catch {}
        }
        rememberBatchWindows(createdWindowIds);
        toast.add({
          title: '已多窗口打开',
          description: `${payload.urls.length} 个窗口已按网格自动布局`,
        });
      } catch (error) {
        await restoreBatchOriginWindow();
        toast.add({
          title: '多窗口打开失败',
          description:
            error instanceof Error ? error.message : '无法创建网格窗口',
        });
      }
    }, [
      activeIndex,
      dropItems,
      prepareBatchSearch,
      query,
      rememberBatchWindows,
      restoreBatchOriginWindow,
      useCompactGridWindows,
    ]);

    const handleCloseBatchWindows = useCallback(async () => {
      const liveWindowIds = await syncTrackedBatchWindows();
      if (liveWindowIds.length === 0) {
        toast.add({ title: '没有可关闭的批量窗口' });
        return;
      }

      await Promise.all(
        liveWindowIds.map(async (windowId) => {
          try {
            await browser.windows.remove(windowId);
          } catch {}
        }),
      );
      setBatchWindowIds([]);
      await restoreBatchOriginWindow();
      toast.add({ title: '已关闭全部批量窗口' });
    }, [restoreBatchOriginWindow, syncTrackedBatchWindows]);

    const handleBatchMenuOpenChange = useCallback(
      (open: boolean) => {
        setBatchMenuOpen(open);
        if (open) {
          void syncTrackedBatchWindows();
        }
      },
      [syncTrackedBatchWindows],
    );

    const toggleBatchEngine = useCallback(
      (engineId: string, checked: boolean) => {
        setSelectedBatchEngineIds((prev) => {
          if (checked) {
            if (prev.includes(engineId)) return prev;
            if (prev.length >= 6) {
              toast.add({ title: '最多只能勾选 6 个搜索引擎' });
              return prev;
            }
            return [...prev, engineId];
          }

          if (prev.length <= 1 && prev.includes(engineId)) {
            toast.add({ title: '请至少保留一个搜索引擎' });
            return prev;
          }

          return prev.filter((id) => id !== engineId);
        });
      },
      [],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
          setShowDropdown(false);
          resetNavigationPreview();
          inputRef.current?.blur();
          return;
        }

        const hasItems = dropItems.length > 0;
        if (hasItems && (showingHistory || showingSuggestions)) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const baseQuery = navigationBaseQueryRef.current ?? query;
            navigationBaseQueryRef.current = baseQuery;
            const nextIndex = Math.min(activeIndex + 1, dropItems.length - 1);
            setActiveIndex(nextIndex);
            setQuery(dropItems[nextIndex] ?? baseQuery);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const baseQuery = navigationBaseQueryRef.current ?? query;
            navigationBaseQueryRef.current = baseQuery;
            const nextIndex = Math.max(activeIndex - 1, -1);
            if (nextIndex === -1) {
              resetNavigationPreview();
              return;
            }
            setActiveIndex(nextIndex);
            setQuery(dropItems[nextIndex] ?? baseQuery);
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const q = activeIndex >= 0 ? dropItems[activeIndex] : query;
          performSearch(q, getSearchOpenMode(e));
        }
      },
      [
        showingHistory,
        showingSuggestions,
        dropItems,
        activeIndex,
        query,
        performSearch,
        resetNavigationPreview,
      ],
    );

    // Build href for a suggestion/history item
    const itemHref = useCallback(
      (text: string) => {
        if (!activeEngine) return '#';
        return buildSearchUrl(activeEngine, text);
      },
      [activeEngine],
    );

    return (
      <div
        ref={containerRef}
        data-no-drag-switch
        className="relative w-full max-w-2xl mx-auto"
        onContextMenuCapture={(e) => e.stopPropagation()}
      >
        {/* Engine chip row — quick switcher */}
        {settings.searchEngines.length > 1 && (
          <div className="mb-1.5 flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {settings.searchEngines.map((engine) => {
              const isActive = engine.id === settings.activeSearchEngineId;
              return (
                <button
                  key={engine.id}
                  type="button"
                  onClick={() => onSetActiveEngine(engine.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  <EngineIcon
                    engine={engine}
                    className="size-3.5 shrink-0 rounded-sm"
                  />
                  {engine.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex h-11 items-stretch rounded-xl border border-border/70 bg-card/85 shadow-sm overflow-hidden focus-within:border-primary/50 focus-within:shadow-md transition-all">
          {/* Engine picker */}
          <DropdownMenu open={engineMenuOpen} onOpenChange={setEngineMenuOpen}>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    'self-stretch flex items-center gap-1.5 px-3 text-muted-foreground transition-colors border-r border-border/50 hover:bg-muted/40 hover:text-foreground focus:outline-none shrink-0',
                    engineMenuOpen && 'bg-muted/40 text-foreground',
                  )}
                  title="切换搜索引擎"
                />
              }
            >
              {activeEngine ? (
                <EngineIcon
                  engine={activeEngine}
                  className="size-4 rounded-sm"
                />
              ) : (
                <Search className="size-4" />
              )}
              <ChevronDown className="size-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuGroup>
                {settings.searchEngines.map((engine) => (
                  <DropdownMenuItem
                    key={engine.id}
                    onClick={() => onSetActiveEngine(engine.id)}
                    className="flex items-center gap-2"
                  >
                    <EngineIcon
                      engine={engine}
                      className="size-3.5 rounded-sm shrink-0"
                    />
                    <span className="truncate flex-1">{engine.name}</span>
                    {engine.id === settings.activeSearchEngineId && (
                      <Check className="size-3.5 shrink-0 opacity-50" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Input */}
          <input
            ref={setInputRef}
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              navigationBaseQueryRef.current = null;
              setActiveIndex(-1);
              setQuery(val);
              if (!val.trim()) {
                setSuggestions([]);
                setShowDropdown(history.length > 0);
              }
            }}
            onFocus={() => {
              if (!query.trim() && history.length > 0) {
                setShowDropdown(true);
              } else if (suggestions.length > 0) {
                setShowDropdown(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              activeEngine ? `在 ${activeEngine.name} 中搜索...` : '搜索...'
            }
            className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={() => {
                commitQueryValue('');
                setSuggestions([]);
                setShowDropdown(history.length > 0);
                inputRef.current?.focus();
              }}
              className="self-stretch px-2 flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="size-3.5" />
            </button>
          )}

          {/* Search button — always shows Search icon */}
          <button
            type="button"
            onClick={(event) =>
              performSearch(
                activeIndex >= 0 ? dropItems[activeIndex] : query,
                getSearchOpenMode(event),
              )
            }
            className="self-stretch px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border-l border-border/50 hover:bg-muted/40 shrink-0 flex items-center gap-1"
          >
            <Search className="size-3.5" />
          </button>

          <DropdownMenu
            open={batchMenuOpen}
            onOpenChange={handleBatchMenuOpenChange}
          >
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    'self-stretch px-3 text-muted-foreground transition-colors border-l border-border/50 hover:bg-muted/40 hover:text-foreground shrink-0 flex items-center gap-1.5',
                    batchMenuOpen && 'bg-muted/40 text-foreground',
                  )}
                  title="批量搜索选项"
                />
              }
            >
              <LayoutGrid className="size-3.5" />
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>批量搜索引擎</DropdownMenuLabel>
                {settings.searchEngines.map((engine) => {
                  const checked = selectedBatchEngineIds.includes(engine.id);
                  const disabled =
                    !checked && selectedBatchEngineIds.length >= 6;
                  return (
                    <DropdownMenuCheckboxItem
                      key={engine.id}
                      checked={checked}
                      disabled={disabled}
                      closeOnClick={false}
                      onCheckedChange={(next) =>
                        toggleBatchEngine(engine.id, !!next)
                      }
                      className="flex items-center gap-2"
                    >
                      <EngineIcon
                        engine={engine}
                        className="size-3.5 rounded-sm shrink-0"
                      />
                      <span className="truncate">{engine.name}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={useCompactGridWindows}
                  closeOnClick={false}
                  onCheckedChange={(next) => setCompactGridWindows(!!next)}
                >
                  简化窗口
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleBatchOpen()}>
                  <LayoutGrid className="mr-2 size-3.5" />
                  在一个新窗口中批量打开
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={
                    selectedBatchEngines.length === 0 ||
                    batchWindowIds.length > 0
                  }
                  onClick={() => void handleBatchGridOpen()}
                >
                  <PanelsTopLeft className="mr-2 size-3.5" />
                  多窗口网格打开
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={batchWindowIds.length === 0}
                  onClick={() => void handleCloseBatchWindows()}
                >
                  <X className="mr-2 size-3.5" />
                  全部关闭
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Combined dropdown: history or suggestions */}
        {(showingHistory || showingSuggestions) && (
          <div
            className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border/70 bg-popover shadow-lg overflow-hidden"
            onMouseLeave={resetNavigationPreview}
          >
            {/* ── History panel ── */}
            {showingHistory && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    搜索历史
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onClearHistory();
                      setShowDropdown(false);
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    清空
                  </button>
                </div>
                {history.slice(0, 10).map((item, i) => (
                  <div
                    key={item}
                    className={cn(
                      'group relative flex items-center',
                      i === activeIndex && 'bg-muted/40',
                    )}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <a
                      href={itemHref(item)}
                      target={openInNewTab ? '_blank' : '_self'}
                      rel="noreferrer"
                      onClick={() => {
                        skipNextSuggestFetchRef.current = true;
                        commitQueryValue(item);
                        setSuggestions([]);
                        setShowDropdown(false);
                        onAddToHistory(item);
                      }}
                      className="flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Clock className="size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{item}</span>
                    </a>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onRemoveFromHistory(item);
                        if (history.length <= 1) setShowDropdown(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 shrink-0 mr-2 p-1 rounded text-muted-foreground hover:text-foreground transition-all"
                      title="删除"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* ── Suggestions panel ── */}
            {showingSuggestions &&
              suggestions.map((s, i) => (
                <a
                  key={s}
                  href={itemHref(s)}
                  target={openInNewTab ? '_blank' : '_self'}
                  rel="noreferrer"
                  onClick={() => {
                    skipNextSuggestFetchRef.current = true;
                    commitQueryValue(s);
                    setSuggestions([]);
                    setShowDropdown(false);
                    onAddToHistory(s);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted/40',
                    i === activeIndex && 'bg-muted/40',
                  )}
                >
                  <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{s}</span>
                </a>
              ))}
          </div>
        )}
      </div>
    );
  },
);
