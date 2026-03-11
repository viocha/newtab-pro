export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
};

export type BookmarkViewMode = 'list' | 'icon' | 'browser-tree' | 'iframe';
export type IconSize = 'sm' | 'md' | 'lg';

export type BookmarkSubgroup = {
  id: string;
  title: string;
  collapsed: boolean;
  bookmarks: BookmarkItem[];
  viewMode: BookmarkViewMode;
  iconSize: IconSize;
};

export type BookmarkGroup = {
  id: string;
  title: string;
  color: string;
  collapsed: boolean;
  bookmarks: BookmarkItem[];
  subgroups: BookmarkSubgroup[];
  viewMode: BookmarkViewMode;
  iconSize: IconSize;
  /** 书签树视图：绑定的浏览器书签文件夹 ID */
  browserTreeFolderId?: string;
  /** 书签树视图：可见区域最多展示的条目数（决定最大高度） */
  browserTreeMaxItems?: number;
  /** 内嵌网页视图：要嵌入的 URL */
  iframeUrl?: string;
  /** 内嵌网页视图：iframe 高度（px） */
  iframeHeight?: number;
};

export type BookmarkBoard = {
  groups: BookmarkGroup[];
};

export type BookmarkContainerTarget = {
  groupId: string;
  subgroupId?: string;
};

export type BookmarkNodeTarget = BookmarkContainerTarget & {
  bookmarkId: string;
};

export type InsertTarget = {
  groupId: string;
  subgroupId: string;
};

export type TabDragPayload = {
  title: string;
  url: string;
};

export type SortDragPayload =
  | {
    type: 'group';
    groupId: string;
  }
  | {
    type: 'subgroup';
    groupId: string;
    subgroupId: string;
  }
  | {
    type: 'bookmark';
    groupId: string;
    subgroupId?: string;
    bookmarkId: string;
  };

export type DeletedBookmarkSnapshot = {
  target: BookmarkContainerTarget;
  bookmark: BookmarkItem;
  index: number;
};

export type DeletedGroupSnapshot = {
  group: BookmarkGroup;
  index: number;
};

export type DeletedSubgroupSnapshot = {
  groupId: string;
  subgroup: BookmarkSubgroup;
  index: number;
};

export type DeletedSpaceSnapshot = {
  space: Space;
  index: number;
  prevActiveSpaceId: string;
};

export type Space = {
  id: string;
  title: string;
  board: BookmarkBoard;
  /** 覆盖全局列数设置；undefined 表示跟随全局 */
  columns?: 'auto' | 1 | 2 | 3 | 4 | 5 | 6;
  /** 覆盖全局搜索栏显示；true=强制显示, false=强制隐藏, undefined=跟随全局 */
  showSearch?: boolean;
  /** 覆盖全局 iframe 自动运行；true=自动运行, false=手动运行, undefined=跟随全局 */
  iframeAutoRun?: boolean;
};

export type SpaceStore = {
  spaces: Space[];
  activeSpaceId: string;
};

// ── App settings ──────────────────────────────────────────────────────

export type SearchEngine = {
  id: string;
  name: string;
  /** URL template, use {query} as placeholder */
  searchUrl: string;
  /** OpenSearch suggestion URL template (returns JSON [query, [suggestions, ...]]) */
  suggestUrl?: string;
  /** Direct icon image URL; if set, used instead of auto-resolved favicon */
  iconUrl?: string;
};

export type BackupSettings = {
  webdavUrl: string;
  username: string;
  password: string;
  remotePath: string;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastBackupAt?: string;
  lastBackupError?: string;
};

export type AppSettings = {
  showSearchBar: boolean;
  searchEngines: SearchEngine[];
  activeSearchEngineId: string;
  openSearchInNewTab: boolean;
  spaceNextShortcut: string;
  spacePrevShortcut: string;
  /** Fallback suggestion URL used when an engine has no suggestUrl */
  defaultSuggestUrl: string;
  /** Recent search queries, newest first, max 50 */
  searchHistory: string[];
  /** 切换到 Space 时是否自动运行 iframe 分组，默认 true */
  iframeAutoRun: boolean;
  backup: BackupSettings;
};
