export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
};

export type BookmarkViewMode = 'list' | 'icon' | 'browser-tree';
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

export type Space = {
  id: string;
  title: string;
  board: BookmarkBoard;
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
};
