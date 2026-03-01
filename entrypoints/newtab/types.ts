export type BookmarkItem = {
  id: string;
  title: string;
  url: string;
};

export type BookmarkViewMode = 'list' | 'icon';
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
