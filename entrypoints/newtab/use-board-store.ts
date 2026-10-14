import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';

import { SPACES_STORAGE_KEY, SPACES_STORAGE_FALLBACK_KEY, IFRAME_DEFAULT_HEIGHT } from './constants';
import type {
  BookmarkBoard,
  BookmarkContainerTarget,
  BookmarkGroup,
  BookmarkItem,
  BookmarkNodeTarget,
  BookmarkSubgroup,
  BookmarkViewMode,
  DeletedBookmarkSnapshot,
  DeletedGroupSnapshot,
  DeletedSpaceSnapshot,
  DeletedSubgroupSnapshot,
  IconSize,
  InsertTarget,
  Space,
  SpaceStore,
} from './types';
import { createId, normalizeUrl, pickGroupGradient } from './utils';
import { GROUP_COLOR_PRESETS } from './constants';

// ── helpers ──────────────────────────────────────────────────────────

function createEmptySubgroup(title = '未分组'): BookmarkSubgroup {
  return {
    id: createId(),
    title,
    collapsed: false,
    bookmarks: [],
    viewMode: 'list',
    iconSize: 'md',
  };
}

function createEmptyGroup(index: number, title = `分组 ${index + 1}`, color?: string): BookmarkGroup {
  return {
    id: createId(),
    title,
    color: color ?? pickGroupGradient(index),
    collapsed: false,
    bookmarks: [],
    subgroups: [],
    viewMode: 'list',
    iconSize: 'md',
  };
}

function createEmptyBoard(): BookmarkBoard {
  return { groups: [] };
}

function createDefaultBoard(): BookmarkBoard {
  return {
    groups: [
      {
        id: createId(),
        title: '默认',
        color: pickGroupGradient(0),
        collapsed: false,
        bookmarks: [],
        subgroups: [],
        viewMode: 'list',
        iconSize: 'md',
      },
    ],
  };
}

function createDefaultSpace(title = '默认'): Space {
  return {
    id: createId(),
    title,
    board: createDefaultBoard(),
  };
}

function createDefaultSpaceStore(): SpaceStore {
  const space = createDefaultSpace();
  return {
    spaces: [space],
    activeSpaceId: space.id,
  };
}

// ── validation helpers ───────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function toText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function toViewMode(value: unknown): BookmarkViewMode {
  return value === 'icon' ? 'icon' : value === 'browser-tree' ? 'browser-tree' : value === 'iframe' ? 'iframe' : 'list';
}

function toIconSize(value: unknown): IconSize {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

function sanitizeBookmarkList(raw: unknown): BookmarkItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(isObject)
    .map((item) => {
      const url = toText(item.url, '');
      return {
        id: toText(item.id, createId()),
        title: toText(item.title, url || '未命名'),
        url,
      };
    })
    .filter((item) => item.url.length > 0);
}

function sanitizeBoard(raw: unknown): BookmarkBoard {
  if (!isObject(raw) || !Array.isArray(raw.groups)) {
    return createDefaultBoard();
  }

  const groups: BookmarkGroup[] = raw.groups
    .filter(isObject)
    .map((group, index) => {
      const subgroupsRaw = Array.isArray(group.subgroups) ? group.subgroups : [];
      const subgroups: BookmarkSubgroup[] = subgroupsRaw.filter(isObject).map((subgroup) => ({
        id: toText(subgroup.id, createId()),
        title: toText(subgroup.title, '小组'),
        collapsed: toBoolean(subgroup.collapsed),
        bookmarks: sanitizeBookmarkList(subgroup.bookmarks),
        viewMode: toViewMode(subgroup.viewMode),
        iconSize: toIconSize(subgroup.iconSize),
      }));

      return {
        id: toText(group.id, createId()),
        title: toText(group.title, `分组 ${index + 1}`),
        columnSpan: typeof group.columnSpan === 'number' && Number.isFinite(group.columnSpan)
          ? Math.max(1, Math.min(6, Math.round(group.columnSpan))) : 1,
        color: toText(group.color, pickGroupGradient(index)),
        collapsed: toBoolean(group.collapsed),
        bookmarks: sanitizeBookmarkList(group.bookmarks),
        subgroups,
        viewMode: toViewMode(group.viewMode),
        iconSize: toIconSize(group.iconSize),        browserTreeFolderId: typeof group.browserTreeFolderId === 'string' && group.browserTreeFolderId ? group.browserTreeFolderId : undefined,
        browserTreeMaxItems: typeof group.browserTreeMaxItems === 'number' && group.browserTreeMaxItems > 0 ? Math.round(group.browserTreeMaxItems) : undefined,
        iframeUrl: typeof group.iframeUrl === 'string' && group.iframeUrl ? group.iframeUrl : undefined,
        iframeHeight: typeof group.iframeHeight === 'number' && group.iframeHeight > 0 ? Math.round(group.iframeHeight) : undefined,      };
    });

  return { groups };
}

export function sanitizeSpaceStore(raw: unknown): SpaceStore {
  if (!isObject(raw) || !Array.isArray(raw.spaces)) {
    return createDefaultSpaceStore();
  }

  const spaces: Space[] = raw.spaces
    .filter(isObject)
    .map((space) => {
      const rawCols = space.columns;
      const cols: Space['columns'] =
        rawCols === 'auto' ? 'auto'
        : typeof rawCols === 'number' && [1, 2, 3, 4, 5, 6].includes(rawCols)
          ? (rawCols as 1 | 2 | 3 | 4 | 5 | 6)
          : undefined;
      return {
        id: toText(space.id, createId()),
        title: toText(space.title, 'Space'),
        board: sanitizeBoard(space.board),
        ...(cols !== undefined ? { columns: cols } : {}),
        ...(typeof space.showSearch === 'boolean' ? { showSearch: space.showSearch } : {}),
        ...(typeof space.iframeAutoRun === 'boolean' ? { iframeAutoRun: space.iframeAutoRun } : {}),
      };
    });

  if (spaces.length === 0) {
    return createDefaultSpaceStore();
  }

  const activeSpaceId =
    typeof raw.activeSpaceId === 'string' &&
      spaces.some((s) => s.id === (raw.activeSpaceId as string))
      ? (raw.activeSpaceId as string)
      : spaces[0].id;

  return { spaces, activeSpaceId };
}


export function restoreSpaceStore(raw: unknown, current: SpaceStore): SpaceStore {
  const next = sanitizeSpaceStore(raw);
  next.activeSpaceId = next.spaces.some((space) => space.id === current.activeSpaceId)
    ? current.activeSpaceId : next.spaces[0].id;
  const localGroups = new Map(current.spaces.flatMap((space) => space.board.groups.map((group) => [group.id, group] as const)));
  for (const space of next.spaces) for (const group of space.board.groups) {
    const local = localGroups.get(group.id);
    group.collapsed = local?.collapsed ?? false;
    group.browserTreeFolderId = local?.browserTreeFolderId;
    const localSubgroups = new Map(local?.subgroups.map((subgroup) => [subgroup.id, subgroup]) ?? []);
    for (const subgroup of group.subgroups) subgroup.collapsed = localSubgroups.get(subgroup.id)?.collapsed ?? false;
  }
  return next;
}

// ── clone ────────────────────────────────────────────────────────────

function cloneBoard(board: BookmarkBoard): BookmarkBoard {
  return {
    groups: board.groups.map((group) => ({
      ...group,
      bookmarks: [...group.bookmarks],
      subgroups: group.subgroups.map((subgroup) => ({
        ...subgroup,
        bookmarks: [...subgroup.bookmarks],
      })),
    })),
  };
}

function cloneSpaceStore(store: SpaceStore): SpaceStore {
  return {
    activeSpaceId: store.activeSpaceId,
    spaces: store.spaces.map((space) => ({
      ...space,
      board: cloneBoard(space.board),
    })),
  };
}

// ── persistence ──────────────────────────────────────────────────────

function hasChromeStorage() {
  return typeof browser !== 'undefined' && !!browser.storage?.local;
}

async function loadSpaceStore(): Promise<SpaceStore> {
  if (hasChromeStorage()) {
    const payload = await browser.storage.local.get(SPACES_STORAGE_KEY);
    return sanitizeSpaceStore(payload[SPACES_STORAGE_KEY]);
  }

  const raw = localStorage.getItem(SPACES_STORAGE_FALLBACK_KEY);
  if (!raw) {
    return createDefaultSpaceStore();
  }

  try {
    return sanitizeSpaceStore(JSON.parse(raw));
  } catch {
    return createDefaultSpaceStore();
  }
}

async function persistSpaceStore(store: SpaceStore) {
  if (hasChromeStorage()) {
    await browser.storage.local.set({
      [SPACES_STORAGE_KEY]: store,
    });
    return;
  }

  localStorage.setItem(SPACES_STORAGE_FALLBACK_KEY, JSON.stringify(store));
}

// ── internal refs ────────────────────────────────────────────────────

function normalizeInputBookmark(input: { title?: string; url: string }) {
  const normalizedUrl = normalizeUrl(input.url);
  return {
    title: input.title?.trim() || normalizedUrl,
    url: normalizedUrl,
  };
}

function findGroupIndex(groups: BookmarkGroup[], groupId: string) {
  return groups.findIndex((group) => group.id === groupId);
}

function findSubgroupIndex(group: BookmarkGroup, subgroupId: string) {
  return group.subgroups.findIndex((subgroup) => subgroup.id === subgroupId);
}

function getBookmarkList(board: BookmarkBoard, target: BookmarkContainerTarget): BookmarkItem[] | null {
  const group = board.groups.find((item) => item.id === target.groupId);
  if (!group) {
    return null;
  }

  if (!target.subgroupId) {
    return group.bookmarks;
  }

  const subgroup = group.subgroups.find((item) => item.id === target.subgroupId);
  return subgroup ? subgroup.bookmarks : null;
}

/** Get the active space's board reference from a mutable SpaceStore draft. */
function getActiveBoard(store: SpaceStore): BookmarkBoard {
  const space = store.spaces.find((s) => s.id === store.activeSpaceId);
  return space!.board;
}

// ── hook ─────────────────────────────────────────────────────────────

export function useBoardStore() {
  const [store, setStore] = useState<SpaceStore>(() => createDefaultSpaceStore());
  const [loading, setLoading] = useState(true);
  const storeRef = useRef(store);
  const pendingLocalWritesRef = useRef<string[]>([]);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  // Load on mount
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await loadSpaceStore();
      if (!alive) {
        return;
      }
      storeRef.current = next;
      setStore(next);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Cross-tab sync
  useEffect(() => {
    if (hasChromeStorage()) {
      const handleChromeStorageChanged = (
        changes: Record<string, any>,
        area: string,
      ) => {
        if (area !== 'local') return;
        if (!changes[SPACES_STORAGE_KEY]) return;
        const newValue = changes[SPACES_STORAGE_KEY].newValue;
        const next = sanitizeSpaceStore(newValue);
        const signature = JSON.stringify(next);
        const ownWriteIndex = pendingLocalWritesRef.current.indexOf(signature);
        if (ownWriteIndex >= 0) {
          pendingLocalWritesRef.current.splice(ownWriteIndex, 1);
          return;
        }
        storeRef.current = next;
        setStore(next);
      };

      browser.storage.onChanged.addListener(handleChromeStorageChanged);
      return () => {
        browser.storage.onChanged.removeListener(handleChromeStorageChanged);
      };
    } else {
      const handleStorageEvent = (event: StorageEvent) => {
        if (event.key !== SPACES_STORAGE_FALLBACK_KEY) return;
        if (event.newValue == null) return;
        try {
          const next = sanitizeSpaceStore(JSON.parse(event.newValue));
          storeRef.current = next;
          setStore(next);
        } catch {
          // ignore parse errors
        }
      };

      window.addEventListener('storage', handleStorageEvent);
      return () => {
        window.removeEventListener('storage', handleStorageEvent);
      };
    }
  }, []);

  // ── commit primitives ──────────────────────────────────────────────

  const enqueuePersist = useCallback((next: SpaceStore) => {
    if (!hasChromeStorage()) {
      void persistSpaceStore(next);
      return;
    }

    const signature = JSON.stringify(next);
    pendingLocalWritesRef.current.push(signature);
    const task = persistQueueRef.current.then(() => persistSpaceStore(next));
    persistQueueRef.current = task.catch(() => {
      const index = pendingLocalWritesRef.current.indexOf(signature);
      if (index >= 0) {
        pendingLocalWritesRef.current.splice(index, 1);
      }
    });
  }, []);

  const commit = useCallback((mutator: (draft: SpaceStore) => void) => {
    const draft = cloneSpaceStore(storeRef.current);
    mutator(draft);
    const next = sanitizeSpaceStore(draft);
    storeRef.current = next;
    setStore(next);
    enqueuePersist(next);
  }, [enqueuePersist]);

  const commitWithResult = useCallback(
    <T,>(mutator: (draft: SpaceStore) => T): T => {
      const draft = cloneSpaceStore(storeRef.current);
      const result = mutator(draft);
      const next = sanitizeSpaceStore(draft);
      storeRef.current = next;
      setStore(next);
      enqueuePersist(next);
      return result;
    },
    [enqueuePersist],
  );

  // ── derived values ─────────────────────────────────────────────────

  const board = useMemo<BookmarkBoard>(() => {
    const space = store.spaces.find((s) => s.id === store.activeSpaceId);
    return space?.board ?? createDefaultBoard();
  }, [store]);

  // ── space operations ───────────────────────────────────────────────

  const addSpace = useCallback(
    (title?: string): string => {
      return commitWithResult((draft) => {
        const idx = draft.spaces.length + 1;
        const space: Space = {
          id: createId(),
          title: title || `Space ${idx}`,
          board: createEmptyBoard(),
        };
        draft.spaces.push(space);
        draft.activeSpaceId = space.id;
        return space.id;
      });
    },
    [commitWithResult],
  );

  const renameSpace = useCallback(
    (spaceId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      commit((draft) => {
        const space = draft.spaces.find((s) => s.id === spaceId);
        if (space) {
          space.title = nextTitle;
        }
      });
    },
    [commit],
  );

  const setSpaceColumns = useCallback(
    (spaceId: string, cols: Space['columns']) => {
      commit((draft) => {
        const space = draft.spaces.find((s) => s.id === spaceId);
        if (space) {
          if (cols === undefined) {
            delete space.columns;
          } else {
            space.columns = cols;
          }
        }
      });
    },
    [commit],
  );

  const setSpaceShowSearch = useCallback(
    (spaceId: string, show: boolean | undefined) => {
      commit((draft) => {
        const space = draft.spaces.find((s) => s.id === spaceId);
        if (space) {
          if (show === undefined) {
            delete space.showSearch;
          } else {
            space.showSearch = show;
          }
        }
      });
    },
    [commit],
  );

  const setSpaceIframeAutoRun = useCallback(
    (spaceId: string, autoRun: boolean | undefined) => {
      commit((draft) => {
        const space = draft.spaces.find((s) => s.id === spaceId);
        if (space) {
          if (autoRun === undefined) {
            delete space.iframeAutoRun;
          } else {
            space.iframeAutoRun = autoRun;
          }
        }
      });
    },
    [commit],
  );

  const deleteSpace = useCallback(
    (spaceId: string): DeletedSpaceSnapshot | null => {
      return commitWithResult((draft) => {
        if (draft.spaces.length <= 1) return null;
        const index = draft.spaces.findIndex((s) => s.id === spaceId);
        if (index < 0) return null;
        const prevActiveSpaceId = draft.activeSpaceId;
        const [space] = draft.spaces.splice(index, 1);
        if (draft.activeSpaceId === spaceId) {
          draft.activeSpaceId = draft.spaces[Math.min(index, draft.spaces.length - 1)].id;
        }
        return { space, index, prevActiveSpaceId };
      });
    },
    [commitWithResult],
  );

  const restoreSpace = useCallback(
    (snapshot: DeletedSpaceSnapshot) => {
      commit((draft) => {
        const insertionIndex = Math.max(0, Math.min(snapshot.index, draft.spaces.length));
        draft.spaces.splice(insertionIndex, 0, snapshot.space);
        draft.activeSpaceId = snapshot.prevActiveSpaceId;
      });
    },
    [commit],
  );

  const switchSpace = useCallback(
    (spaceId: string) => {
      commit((draft) => {
        if (draft.spaces.some((s) => s.id === spaceId)) {
          draft.activeSpaceId = spaceId;
        }
      });
    },
    [commit],
  );

  // ── group operations ───────────────────────────────────────────────

  const addGroup = useCallback(
    (title?: string): string => {
      return commitWithResult((draft) => {
        const board = getActiveBoard(draft);
        const usedColors = new Set(board.groups.map((g) => g.color).filter(Boolean));
        const unusedColor = GROUP_COLOR_PRESETS.find((c) => !usedColors.has(c));
        const color = unusedColor ??
          GROUP_COLOR_PRESETS[Math.floor(Math.random() * GROUP_COLOR_PRESETS.length)];
        const group = createEmptyGroup(board.groups.length, title || `分组 ${board.groups.length + 1}`, color);
        board.groups.push(group);
        return group.id;
      });
    },
    [commitWithResult],
  );

  const renameGroup = useCallback(
    (groupId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) {
          group.title = nextTitle;
        }
      });
    },
    [commit],
  );

  const setGroupColor = useCallback(
    (groupId: string, color: string) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) {
          group.color = color;
        }
      });
    },
    [commit],
  );

  const deleteGroup = useCallback(
    (groupId: string): DeletedGroupSnapshot | null => {
      return commitWithResult((draft) => {
        const board = getActiveBoard(draft);
        const index = findGroupIndex(board.groups, groupId);
        if (index < 0) return null;
        const [group] = board.groups.splice(index, 1);
        return { group, index };
      });
    },
    [commitWithResult],
  );

  const restoreGroup = useCallback(
    (snapshot: DeletedGroupSnapshot) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const insertionIndex = Math.max(0, Math.min(snapshot.index, board.groups.length));
        board.groups.splice(insertionIndex, 0, snapshot.group);
      });
    },
    [commit],
  );

  const moveGroupBefore = useCallback(
    (sourceGroupId: string, targetGroupId: string) => {
      if (sourceGroupId === targetGroupId) return;
      commit((draft) => {
        const board = getActiveBoard(draft);
        const fromIndex = findGroupIndex(board.groups, sourceGroupId);
        const toIndex = findGroupIndex(board.groups, targetGroupId);
        if (fromIndex < 0 || toIndex < 0) return;
        const [moved] = board.groups.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        board.groups.splice(insertIndex, 0, moved);
      });
    },
    [commit],
  );

  const moveGroupToEnd = useCallback(
    (sourceGroupId: string) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const fromIndex = findGroupIndex(board.groups, sourceGroupId);
        if (fromIndex < 0) return;
        const [moved] = board.groups.splice(fromIndex, 1);
        if (!moved) return;
        board.groups.push(moved);
      });
    },
    [commit],
  );

  const toggleGroup = useCallback(
    (groupId: string) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) {
          group.collapsed = !group.collapsed;
        }
      });
    },
    [commit],
  );

  const setGroupViewMode = useCallback(
    (groupId: string, mode: BookmarkViewMode) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) group.viewMode = mode;
      });
    },
    [commit],
  );

  const setGroupIconSize = useCallback(
    (groupId: string, size: IconSize) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) group.iconSize = size;
      });
    },
    [commit],
  );

  const setGroupColumnSpan = useCallback((groupId: string, span: number) => {
    commit((draft) => {
      const group = getActiveBoard(draft).groups.find((item) => item.id === groupId);
      if (group) group.columnSpan = Math.max(1, Math.min(6, Math.round(span)));
    });
  }, [commit]);

  const setGroupBrowserTreeConfig = useCallback(
    (groupId: string, folderId: string | null, maxItems: number) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (group) {
          group.browserTreeFolderId = folderId ?? undefined;
          group.browserTreeMaxItems = Math.max(5, Math.min(300, Math.round(maxItems)));
        }
      });
    },
    [commit],
  );

  const setGroupIframeConfig = useCallback(
    (spaceId: string, groupId: string, url: string, height: number) => {
      commit((draft) => {
        const space = draft.spaces.find((item) => item.id === spaceId);
        const group = space?.board.groups.find((item) => item.id === groupId);
        if (group) {
          group.iframeUrl = url || undefined;
          group.iframeHeight = Math.max(100, Math.min(2000, Math.round(height)));
        }
      });
    },
    [commit],
  );

  // ── subgroup operations ────────────────────────────────────────────

  const addSubgroup = useCallback(
    (groupId: string, title?: string): string | null => {
      return commitWithResult((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (!group) return null;
        group.collapsed = false;
        const subgroup = createEmptySubgroup(title || `小组 ${group.subgroups.length + 1}`);
        group.subgroups.push(subgroup);
        return subgroup.id;
      });
    },
    [commitWithResult],
  );

  const renameSubgroup = useCallback(
    (target: InsertTarget, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === target.groupId);
        if (!group) return;
        const subgroup = group.subgroups.find((item) => item.id === target.subgroupId);
        if (subgroup) {
          subgroup.title = nextTitle;
        }
      });
    },
    [commit],
  );

  const deleteSubgroup = useCallback(
    (target: InsertTarget): DeletedSubgroupSnapshot | null => {
      return commitWithResult((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === target.groupId);
        if (!group) return null;
        const index = findSubgroupIndex(group, target.subgroupId);
        if (index < 0) return null;
        const [subgroup] = group.subgroups.splice(index, 1);
        return { groupId: target.groupId, subgroup, index };
      });
    },
    [commitWithResult],
  );

  const restoreSubgroup = useCallback(
    (snapshot: DeletedSubgroupSnapshot) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === snapshot.groupId);
        if (!group) return;
        const insertionIndex = Math.max(0, Math.min(snapshot.index, group.subgroups.length));
        group.subgroups.splice(insertionIndex, 0, snapshot.subgroup);
      });
    },
    [commit],
  );

  const moveSubgroupBefore = useCallback(
    (source: InsertTarget, target: InsertTarget) => {
      if (source.groupId === target.groupId && source.subgroupId === target.subgroupId) return;
      commit((draft) => {
        const board = getActiveBoard(draft);
        const sourceGroup = board.groups.find((item) => item.id === source.groupId);
        const targetGroup = board.groups.find((item) => item.id === target.groupId);
        if (!sourceGroup || !targetGroup) return;
        const sourceIndex = findSubgroupIndex(sourceGroup, source.subgroupId);
        let targetIndex = findSubgroupIndex(targetGroup, target.subgroupId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [moved] = sourceGroup.subgroups.splice(sourceIndex, 1);
        if (!moved) return;
        if (sourceGroup.id === targetGroup.id && sourceIndex < targetIndex) {
          targetIndex -= 1;
        }
        targetGroup.subgroups.splice(targetIndex, 0, moved);
      });
    },
    [commit],
  );

  const moveSubgroupToEnd = useCallback(
    (source: InsertTarget, targetGroupId: string) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const sourceGroup = board.groups.find((item) => item.id === source.groupId);
        const targetGroup = board.groups.find((item) => item.id === targetGroupId);
        if (!sourceGroup || !targetGroup) return;
        const sourceIndex = findSubgroupIndex(sourceGroup, source.subgroupId);
        if (sourceIndex < 0) return;
        const [moved] = sourceGroup.subgroups.splice(sourceIndex, 1);
        if (!moved) return;
        targetGroup.subgroups.push(moved);
      });
    },
    [commit],
  );

  const toggleSubgroup = useCallback(
    (target: InsertTarget) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === target.groupId);
        if (!group) return;
        const subgroup = group.subgroups.find((item) => item.id === target.subgroupId);
        if (subgroup) {
          subgroup.collapsed = !subgroup.collapsed;
        }
      });
    },
    [commit],
  );

  const setSubgroupViewMode = useCallback(
    (groupId: string, subgroupId: string, mode: BookmarkViewMode) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (!group) return;
        const subgroup = group.subgroups.find((item) => item.id === subgroupId);
        if (subgroup) subgroup.viewMode = mode;
      });
    },
    [commit],
  );

  const setSubgroupIconSize = useCallback(
    (groupId: string, subgroupId: string, size: IconSize) => {
      commit((draft) => {
        const board = getActiveBoard(draft);
        const group = board.groups.find((item) => item.id === groupId);
        if (!group) return;
        const subgroup = group.subgroups.find((item) => item.id === subgroupId);
        if (subgroup) subgroup.iconSize = size;
      });
    },
    [commit],
  );

  // ── bookmark operations ────────────────────────────────────────────

  const insertBookmark = useCallback(
    (
      target: BookmarkContainerTarget,
      input: { id?: string; title?: string; url: string },
      index?: number,
    ) => {
      const normalized = normalizeInputBookmark(input);
      commit((draft) => {
        const board = getActiveBoard(draft);
        const list = getBookmarkList(board, target);
        if (!list) return;
        const insertionIndex =
          typeof index === 'number'
            ? Math.max(0, Math.min(index, list.length))
            : list.length;
        list.splice(insertionIndex, 0, {
          id: input.id || createId(),
          ...normalized,
        });
      });
    },
    [commit],
  );

  const addBookmark = useCallback(
    (target: BookmarkContainerTarget, input: { title?: string; url: string }) => {
      insertBookmark(target, input);
    },
    [insertBookmark],
  );

  const editBookmark = useCallback(
    (
      target: BookmarkContainerTarget,
      bookmarkId: string,
      input: { title?: string; url: string },
    ) => {
      const normalized = normalizeInputBookmark(input);
      commit((draft) => {
        const board = getActiveBoard(draft);
        const list = getBookmarkList(board, target);
        if (!list) return;
        const bookmark = list.find((item) => item.id === bookmarkId);
        if (!bookmark) return;
        bookmark.title = normalized.title;
        bookmark.url = normalized.url;
      });
    },
    [commit],
  );

  const removeBookmark = useCallback(
    (target: BookmarkContainerTarget, bookmarkId: string): DeletedBookmarkSnapshot | null => {
      return commitWithResult((draft) => {
        const board = getActiveBoard(draft);
        const list = getBookmarkList(board, target);
        if (!list) return null;
        const index = list.findIndex((item) => item.id === bookmarkId);
        if (index < 0) return null;
        const [bookmark] = list.splice(index, 1);
        if (!bookmark) return null;
        return {
          target: { groupId: target.groupId, subgroupId: target.subgroupId },
          bookmark,
          index,
        } satisfies DeletedBookmarkSnapshot;
      });
    },
    [commitWithResult],
  );

  const restoreBookmark = useCallback(
    (snapshot: DeletedBookmarkSnapshot) => {
      insertBookmark(snapshot.target, snapshot.bookmark, snapshot.index);
    },
    [insertBookmark],
  );

  const moveBookmark = useCallback(
    (source: BookmarkNodeTarget, target: BookmarkContainerTarget, insertIndex?: number) => {
      if (
        source.groupId === target.groupId &&
        source.subgroupId === target.subgroupId &&
        typeof insertIndex !== 'number'
      ) {
        return;
      }

      commit((draft) => {
        const board = getActiveBoard(draft);
        const sourceList = getBookmarkList(board, source);
        const targetList = getBookmarkList(board, target);
        if (!sourceList || !targetList) return;

        const originalTargetLength = targetList.length;

        const sourceIndex = sourceList.findIndex((item) => item.id === source.bookmarkId);
        if (sourceIndex < 0) return;
        const [moved] = sourceList.splice(sourceIndex, 1);
        if (!moved) return;

        const targetIndex =
          typeof insertIndex === 'number'
            ? Math.max(0, Math.min(insertIndex, originalTargetLength))
            : targetList.length;

        if (sourceList === targetList && sourceIndex < targetIndex) {
          targetList.splice(targetIndex - 1, 0, moved);
          return;
        }

        targetList.splice(targetIndex, 0, moved);
      });
    },
    [commit],
  );

  // ── cross-space move operations ────────────────────────────────────

  /**
   * Move a group from the active space to another space.
   * Returns false if the move is not allowed (e.g. source is the only group).
   */
  const moveGroupToSpace = useCallback(
    (groupId: string, targetSpaceId: string): boolean => {
      return commitWithResult((draft) => {
        if (targetSpaceId === draft.activeSpaceId) return false;
        const sourceSpace = draft.spaces.find((s) => s.id === draft.activeSpaceId);
        const targetSpace = draft.spaces.find((s) => s.id === targetSpaceId);
        if (!sourceSpace || !targetSpace) return false;
        const idx = findGroupIndex(sourceSpace.board.groups, groupId);
        if (idx < 0) return false;
        const [group] = sourceSpace.board.groups.splice(idx, 1);
        if (!group) return false;
        targetSpace.board.groups.push(group);
        return true;
      });
    },
    [commitWithResult],
  );

  /**
   * Move a subgroup from the active space's group to another space's specific group.
   */
  const moveSubgroupToSpace = useCallback(
    (source: InsertTarget, targetSpaceId: string, targetGroupId: string): boolean => {
      return commitWithResult((draft) => {
        const sourceSpace = draft.spaces.find((s) => s.id === draft.activeSpaceId);
        const targetSpace = draft.spaces.find((s) => s.id === targetSpaceId);
        if (!sourceSpace || !targetSpace) return false;
        const sourceGroup = sourceSpace.board.groups.find((g) => g.id === source.groupId);
        const targetGroup = targetSpace.board.groups.find((g) => g.id === targetGroupId);
        if (!sourceGroup || !targetGroup) return false;
        const idx = findSubgroupIndex(sourceGroup, source.subgroupId);
        if (idx < 0) return false;
        const [subgroup] = sourceGroup.subgroups.splice(idx, 1);
        if (!subgroup) return false;
        targetGroup.subgroups.push(subgroup);
        return true;
      });
    },
    [commitWithResult],
  );

  /**
   * Move a bookmark from the active space to a target space's group (and optionally subgroup).
   */
  const moveBookmarkToSpace = useCallback(
    (
      source: BookmarkNodeTarget,
      targetSpaceId: string,
      targetGroupId: string,
      targetSubgroupId?: string,
    ): boolean => {
      return commitWithResult((draft) => {
        const sourceSpace = draft.spaces.find((s) => s.id === draft.activeSpaceId);
        const targetSpace = draft.spaces.find((s) => s.id === targetSpaceId);
        if (!sourceSpace || !targetSpace) return false;
        const sourceList = getBookmarkList(sourceSpace.board, source);
        const targetGroup = targetSpace.board.groups.find((g) => g.id === targetGroupId);
        if (!sourceList || !targetGroup) return false;
        let targetList: BookmarkItem[];
        if (targetSubgroupId) {
          const targetSubgroup = targetGroup.subgroups.find((sg) => sg.id === targetSubgroupId);
          if (!targetSubgroup) return false;
          targetList = targetSubgroup.bookmarks;
        } else {
          targetList = targetGroup.bookmarks;
        }
        const sourceIndex = sourceList.findIndex((item) => item.id === source.bookmarkId);
        if (sourceIndex < 0) return false;
        const [moved] = sourceList.splice(sourceIndex, 1);
        if (!moved) return false;
        targetList.push(moved);
        return true;
      });
    },
    [commitWithResult],
  );

  const importSpaceStore = useCallback(
    (raw: unknown) => {
      const next = restoreSpaceStore(raw, storeRef.current);
      storeRef.current = next;
      setStore(next);
      enqueuePersist(next);
    },
    [enqueuePersist],
  );

  // ── space reorder ──────────────────────────────────────────────────

  const moveSpaceBefore = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      commit((draft) => {
        const fromIndex = draft.spaces.findIndex((s) => s.id === sourceId);
        const toIndex = draft.spaces.findIndex((s) => s.id === targetId);
        if (fromIndex < 0 || toIndex < 0) return;
        const [moved] = draft.spaces.splice(fromIndex, 1);
        const insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        draft.spaces.splice(insertIndex, 0, moved);
      });
    },
    [commit],
  );

  const moveSpaceToEnd = useCallback(
    (sourceId: string) => {
      commit((draft) => {
        const fromIndex = draft.spaces.findIndex((s) => s.id === sourceId);
        if (fromIndex < 0) return;
        const [moved] = draft.spaces.splice(fromIndex, 1);
        if (!moved) return;
        draft.spaces.push(moved);
      });
    },
    [commit],
  );

  return {
    // state
    board,
    loading,
    spaces: store.spaces,
    activeSpaceId: store.activeSpaceId,
    /** The raw SpaceStore object, for export serialization */
    spaceStore: store,
    // space ops
    addSpace,
    renameSpace,
    setSpaceColumns,
    setSpaceShowSearch,
    setSpaceIframeAutoRun,
    deleteSpace,
    restoreSpace,
    switchSpace,
    moveSpaceBefore,
    moveSpaceToEnd,
    // group ops
    addGroup,
    renameGroup,
    setGroupColor,
    deleteGroup,
    restoreGroup,
    moveGroupBefore,
    moveGroupToEnd,
    toggleGroup,
    setGroupViewMode,
    setGroupIconSize,
    setGroupColumnSpan,
    setGroupBrowserTreeConfig,
    setGroupIframeConfig,
    // subgroup ops
    addSubgroup,
    renameSubgroup,
    deleteSubgroup,
    restoreSubgroup,
    moveSubgroupBefore,
    moveSubgroupToEnd,
    toggleSubgroup,
    setSubgroupViewMode,
    setSubgroupIconSize,
    // bookmark ops
    addBookmark,
    insertBookmark,
    editBookmark,
    removeBookmark,
    restoreBookmark,
    moveBookmark,
    // cross-space move ops
    moveGroupToSpace,
    moveSubgroupToSpace,
    moveBookmarkToSpace,
    importSpaceStore,
  };
}
