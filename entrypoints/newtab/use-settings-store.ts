import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS, DEFAULT_SEARCH_ENGINES } from './constants';
import type { /* merged below */ } from './constants';
import type { AppSettings, SearchEngine } from './types';
import { createId } from './utils';

// ── helpers ──────────────────────────────────────────────────────────

function hasChromeStorage() {
  return typeof browser !== 'undefined' && !!browser.storage?.local;
}

function sanitizeSettings(raw: unknown): AppSettings {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_SETTINGS, searchEngines: [...DEFAULT_SEARCH_ENGINES] };
  }
  const r = raw as Record<string, unknown>;

  let searchEngines: SearchEngine[] = DEFAULT_SEARCH_ENGINES;
  if (Array.isArray(r.searchEngines) && r.searchEngines.length > 0) {
    const parsed: SearchEngine[] = (r.searchEngines as unknown[])
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => ({
        id: typeof e.id === 'string' && e.id ? e.id : createId(),
        name: typeof e.name === 'string' && e.name ? e.name : 'Search',
        searchUrl: typeof e.searchUrl === 'string' ? e.searchUrl : '',
        suggestUrl: typeof e.suggestUrl === 'string' && e.suggestUrl ? e.suggestUrl : undefined,
        iconUrl: typeof e.iconUrl === 'string' && e.iconUrl ? e.iconUrl : undefined,
      }))
      .filter((e) => e.searchUrl.length > 0);

    if (parsed.length > 0) {
      searchEngines = parsed;
    }
  }

  const hasEngine = (id: string) => searchEngines.some((e) => e.id === id);
  const activeId =
    typeof r.activeSearchEngineId === 'string' && hasEngine(r.activeSearchEngineId)
      ? r.activeSearchEngineId
      : searchEngines[0].id;

  return {
    showSearchBar:
      typeof r.showSearchBar === 'boolean' ? r.showSearchBar : DEFAULT_SETTINGS.showSearchBar,
    searchEngines,
    activeSearchEngineId: activeId,
    openSearchInNewTab:
      typeof r.openSearchInNewTab === 'boolean'
        ? r.openSearchInNewTab
        : DEFAULT_SETTINGS.openSearchInNewTab,
    spaceNextShortcut:
      typeof r.spaceNextShortcut === 'string' && r.spaceNextShortcut
        ? r.spaceNextShortcut
        : DEFAULT_SETTINGS.spaceNextShortcut,
    spacePrevShortcut:
      typeof r.spacePrevShortcut === 'string' && r.spacePrevShortcut
        ? r.spacePrevShortcut
        : DEFAULT_SETTINGS.spacePrevShortcut,
    defaultSuggestUrl:
      typeof r.defaultSuggestUrl === 'string' ? r.defaultSuggestUrl : DEFAULT_SETTINGS.defaultSuggestUrl,
    searchHistory: Array.isArray(r.searchHistory)
      ? (r.searchHistory as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 50)
      : DEFAULT_SETTINGS.searchHistory,
    iframeAutoRun:
      typeof r.iframeAutoRun === 'boolean' ? r.iframeAutoRun : DEFAULT_SETTINGS.iframeAutoRun,
  };
}

async function loadSettings(): Promise<AppSettings> {
  if (hasChromeStorage()) {
    const payload = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
    return sanitizeSettings(payload[SETTINGS_STORAGE_KEY]);
  }
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS, searchEngines: [...DEFAULT_SEARCH_ENGINES] };
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS, searchEngines: [...DEFAULT_SEARCH_ENGINES] };
  }
}

async function persistSettings(settings: AppSettings) {
  if (hasChromeStorage()) {
    await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
    return;
  }
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

// ── hook ─────────────────────────────────────────────────────────────

export function useSettingsStore() {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    searchEngines: [...DEFAULT_SEARCH_ENGINES],
  }));
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load on mount
  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await loadSettings();
      if (!alive) return;
      settingsRef.current = loaded;
      setSettings(loaded);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const commit = useCallback((updater: (prev: AppSettings) => AppSettings) => {
    const next = sanitizeSettings(updater(settingsRef.current));
    settingsRef.current = next;
    setSettings(next);
    void persistSettings(next);
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<AppSettings>) => {
      commit((prev) => ({ ...prev, ...partial }));
    },
    [commit],
  );

  const addSearchEngine = useCallback(
    (engine: Omit<SearchEngine, 'id'>) => {
      commit((prev) => ({
        ...prev,
        searchEngines: [...prev.searchEngines, { ...engine, id: createId() }],
      }));
    },
    [commit],
  );

  const updateSearchEngine = useCallback(
    (id: string, engine: Partial<Omit<SearchEngine, 'id'>>) => {
      commit((prev) => ({
        ...prev,
        searchEngines: prev.searchEngines.map((e) =>
          e.id === id ? { ...e, ...engine } : e,
        ),
      }));
    },
    [commit],
  );

  const deleteSearchEngine = useCallback(
    (id: string) => {
      commit((prev) => {
        const next = prev.searchEngines.filter((e) => e.id !== id);
        const engines = next.length > 0 ? next : [...DEFAULT_SEARCH_ENGINES];
        const activeId = engines.some((e) => e.id === prev.activeSearchEngineId)
          ? prev.activeSearchEngineId
          : engines[0].id;
        return { ...prev, searchEngines: engines, activeSearchEngineId: activeId };
      });
    },
    [commit],
  );

  const resetSearchEngines = useCallback(() => {
    commit((prev) => ({
      ...prev,
      searchEngines: [...DEFAULT_SEARCH_ENGINES],
      activeSearchEngineId: DEFAULT_SEARCH_ENGINES[0].id,
    }));
  }, [commit]);

  const setActiveSearchEngine = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, activeSearchEngineId: id }));
    },
    [commit],
  );

  const reorderSearchEngines = useCallback(
    (ids: string[]) => {
      commit((prev) => ({
        ...prev,
        searchEngines: ids
          .map((id) => prev.searchEngines.find((e) => e.id === id)!)
          .filter(Boolean),
      }));
    },
    [commit],
  );

  const addToSearchHistory = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return;
      commit((prev) => {
        const hist = (prev.searchHistory ?? []).filter((h) => h !== q);
        return { ...prev, searchHistory: [q, ...hist].slice(0, 50) };
      });
    },
    [commit],
  );

  const removeFromSearchHistory = useCallback(
    (query: string) => {
      commit((prev) => ({
        ...prev,
        searchHistory: (prev.searchHistory ?? []).filter((h) => h !== query),
      }));
    },
    [commit],
  );

  const clearSearchHistory = useCallback(() => {
    commit((prev) => ({ ...prev, searchHistory: [] }));
  }, [commit]);

  return {
    settings,
    updateSettings,
    addSearchEngine,
    updateSearchEngine,
    deleteSearchEngine,
    resetSearchEngines,
    setActiveSearchEngine,
    reorderSearchEngines,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
  };
}
