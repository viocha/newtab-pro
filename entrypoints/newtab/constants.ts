export const BOARD_STORAGE_KEY = 'newtab-pro-board-v1';
export const BOARD_STORAGE_FALLBACK_KEY = 'newtab-pro-board-fallback-v1';
export const SPACES_STORAGE_KEY = 'newtab-pro-spaces-v1';
export const SPACES_STORAGE_FALLBACK_KEY = 'newtab-pro-spaces-fallback-v1';
export const SETTINGS_STORAGE_KEY = 'newtab-pro-settings-v1';
export const TAB_DRAG_MIME = 'application/x-newtab-pro-tab';
export const SORT_DRAG_MIME = 'application/x-newtab-pro-sort';

export const BROWSER_TREE_DEFAULT_MAX_ITEMS = 20;

export const GROUP_GRADIENTS = [
  'linear-gradient(90deg, #8be3a6 0%, #68d694 100%)',
  'linear-gradient(90deg, #f8dd63 0%, #edd631 100%)',
  'linear-gradient(90deg, #d7a6ff 0%, #c886f4 100%)',
  'linear-gradient(90deg, #8fd7ff 0%, #5fb9ef 100%)',
  'linear-gradient(90deg, #ffc38f 0%, #ffa869 100%)',
] as const;

export const GROUP_COLOR_PRESETS = [
  // Gradients
  'linear-gradient(90deg, #8be3a6 0%, #68d694 100%)',
  'linear-gradient(90deg, #f8dd63 0%, #edd631 100%)',
  'linear-gradient(90deg, #d7a6ff 0%, #c886f4 100%)',
  'linear-gradient(90deg, #8fd7ff 0%, #5fb9ef 100%)',
  'linear-gradient(90deg, #ffc38f 0%, #ffa869 100%)',
  // Solids
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
];

import type { SearchEngine, AppSettings } from './types';

export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q={query}',
    suggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q={query}',
    iconUrl: 'https://www.google.com/favicon.ico',
  },
  {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q={query}',
    suggestUrl: 'https://api.bing.com/osjson.aspx?query={query}&language=zh-CN',
    iconUrl: 'https://www.bing.com/favicon.ico',
  },
  {
    id: 'baidu',
    name: '百度',
    searchUrl: 'https://www.baidu.com/s?wd={query}',
    suggestUrl: 'https://www.baidu.com/sugrec?json=1&prod=pc&wd={query}',
    iconUrl: 'https://www.baidu.com/favicon.ico',
  },
];

export const SUGGEST_URL_PRESETS = [
  { label: 'Google', value: 'https://suggestqueries.google.com/complete/search?client=firefox&q={query}' },
  { label: 'Bing', value: 'https://api.bing.com/osjson.aspx?query={query}&language=zh-CN' },
  { label: '\u767e\u5ea6', value: 'https://www.baidu.com/sugrec?json=1&prod=pc&wd={query}' },
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  showSearchBar: false,
  searchEngines: DEFAULT_SEARCH_ENGINES,
  activeSearchEngineId: 'google',
  openSearchInNewTab: true,
  spaceNextShortcut: 'alt+w',
  spacePrevShortcut: 'alt+shift+w',
  defaultSuggestUrl: 'https://suggestqueries.google.com/complete/search?client=firefox&q={query}',
  searchHistory: [],
};
