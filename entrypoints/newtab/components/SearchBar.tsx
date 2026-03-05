import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, Check, X, Clock, Trash2 } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { FaviconImage } from './FaviconImage';
import type { AppSettings, SearchEngine } from '../types';

// ── helpers ─────────────────────────────────────────────────────────

function buildSearchUrl(engine: SearchEngine, query: string): string {
  return engine.searchUrl.replace('{query}', encodeURIComponent(query));
}

function buildSuggestUrl(engine: SearchEngine, query: string, defaultSuggestUrl = ''): string {
  const url = engine.suggestUrl || defaultSuggestUrl;
  if (!url) return '';
  return url.replace('{query}', encodeURIComponent(query));
}

async function fetchSuggestions(
  engine: SearchEngine,
  query: string,
  defaultSuggestUrl = '',
): Promise<string[]> {
  const url = buildSuggestUrl(engine, query, defaultSuggestUrl);
  if (!url || !query.trim()) return [];
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
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
        .map((s) => (typeof s === 'string' ? s : (s as Record<string, string>)?.phrase ?? ''))
        .filter(Boolean)
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

// ── EngineIcon ──────────────────────────────────────────────────────
function EngineIcon({ engine, className }: { engine: SearchEngine; className?: string }) {
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

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { settings, onSetActiveEngine, onAddToHistory, onRemoveFromHistory, onClearHistory },
  forwardedRef,
) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [engineMenuOpen, setEngineMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge internal ref with forwarded ref
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    },
    [forwardedRef],
  );

  const suggestTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeEngine =
    settings.searchEngines.find((e) => e.id === settings.activeSearchEngineId) ??
    settings.searchEngines[0];

  const history = settings.searchHistory ?? [];
  const openInNewTab = settings.openSearchInNewTab;

  // What the dropdown is currently showing
  const showingHistory = !query.trim() && showDropdown && history.length > 0;
  const showingSuggestions = !!query.trim() && showDropdown && suggestions.length > 0;
  // Unified list of items driving keyboard navigation
  const dropItems: string[] = showingHistory ? history : showingSuggestions ? suggestions : [];

  // Debounced suggestions fetch
  useEffect(() => {
    clearTimeout(suggestTimerRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const defaultSuggestUrl = settings.defaultSuggestUrl ?? '';
    if (!activeEngine?.suggestUrl && !defaultSuggestUrl) {
      setSuggestions([]);
      return;
    }
    suggestTimerRef.current = setTimeout(async () => {
      const items = await fetchSuggestions(activeEngine, query, defaultSuggestUrl);
      setSuggestions(items);
      if (items.length > 0) {
        setShowDropdown(true);
        setActiveIndex(-1);
      }
    }, 250);

    return () => clearTimeout(suggestTimerRef.current);
  }, [query, activeEngine, settings.defaultSuggestUrl]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const performSearch = useCallback(
    (searchQuery: string, forceCurrentTab = false) => {
      const q = searchQuery.trim();
      if (!q || !activeEngine) return;
      onAddToHistory(q);
      const url = buildSearchUrl(activeEngine, q);
      if (!forceCurrentTab && openInNewTab) {
        window.open(url, '_blank', 'noreferrer');
      } else {
        window.location.href = url;
      }
      setQuery('');
      setSuggestions([]);
      setShowDropdown(false);
    },
    [activeEngine, openInNewTab, onAddToHistory],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        return;
      }

      const hasItems = dropItems.length > 0;
      if (hasItems && (showingHistory || showingSuggestions)) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, dropItems.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, -1));
          return;
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const q = activeIndex >= 0 ? dropItems[activeIndex] : query;
        performSearch(q, e.altKey);
      }
    },
    [showingHistory, showingSuggestions, dropItems, activeIndex, query, performSearch],
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
    <div ref={containerRef} data-no-drag-switch className="relative w-full max-w-2xl mx-auto">
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
                <EngineIcon engine={engine} className="size-3.5 shrink-0 rounded-sm" />
                {engine.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex h-11 items-stretch rounded-xl border border-border/70 bg-card/85 shadow-sm overflow-hidden focus-within:border-primary/50 focus-within:shadow-md transition-all">
        {/* Engine picker */}
        <DropdownMenu open={engineMenuOpen} onOpenChange={setEngineMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'self-stretch flex items-center gap-1.5 px-3 text-muted-foreground transition-colors border-r border-border/50 hover:bg-muted/40 hover:text-foreground focus:outline-none shrink-0',
                engineMenuOpen && 'bg-muted/40 text-foreground',
              )}
              title="切换搜索引擎"
            >
              {activeEngine ? (
                <EngineIcon engine={activeEngine} className="size-4 rounded-sm" />
              ) : (
                <Search className="size-4" />
              )}
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {settings.searchEngines.map((engine) => (
              <DropdownMenuItem
                key={engine.id}
                onSelect={() => onSetActiveEngine(engine.id)}
                className="flex items-center gap-2"
              >
                <EngineIcon engine={engine} className="size-3.5 rounded-sm shrink-0" />
                <span className="truncate flex-1">{engine.name}</span>
                {engine.id === settings.activeSearchEngineId && (
                  <Check className="size-3.5 shrink-0 opacity-50" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Input */}
        <input
          ref={setInputRef}
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (!val.trim()) {
              setSuggestions([]);
              setShowDropdown(history.length > 0);
              setActiveIndex(-1);
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
          placeholder={activeEngine ? `在 ${activeEngine.name} 中搜索...` : '搜索...'}
          className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60"
          autoComplete="off"
          spellCheck={false}
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setShowDropdown(history.length > 0);
              setActiveIndex(-1);
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
          onClick={() => performSearch(activeIndex >= 0 ? dropItems[activeIndex] : query)}
          className="self-stretch px-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border-l border-border/50 hover:bg-muted/40 shrink-0 flex items-center gap-1"
        >
          <Search className="size-3.5" />
        </button>
      </div>

      {/* Combined dropdown: history or suggestions */}
      {(showingHistory || showingSuggestions) && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border/70 bg-popover shadow-lg overflow-hidden"
          onMouseLeave={() => setActiveIndex(-1)}
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
                    i === activeIndex && 'bg-accent/75',
                  )}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <a
                    href={itemHref(item)}
                    target={openInNewTab ? '_blank' : '_self'}
                    rel="noreferrer"
                    onClick={(e) => {
                      if (e.altKey) {
                        e.preventDefault();
                        onAddToHistory(item);
                        window.location.href = itemHref(item);
                        setShowDropdown(false);
                        return;
                      }
                      onAddToHistory(item);
                      setQuery('');
                      setSuggestions([]);
                      setShowDropdown(false);
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
                onClick={(e) => {
                  if (e.altKey) {
                    e.preventDefault();
                    onAddToHistory(s);
                    window.location.href = itemHref(s);
                    setQuery('');
                    setSuggestions([]);
                    setShowDropdown(false);
                    return;
                  }
                  onAddToHistory(s);
                  setQuery('');
                  setSuggestions([]);
                  setShowDropdown(false);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/75 transition-colors',
                  i === activeIndex && 'bg-accent/75',
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
});
