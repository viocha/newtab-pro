import type { MouseEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';

import { Separator } from '@/components/ui/separator';
import { BrowserTreeView } from '@/entrypoints/newtab/components/BrowserTreeView';
import { SPACES_STORAGE_FALLBACK_KEY, SPACES_STORAGE_KEY } from '@/entrypoints/newtab/constants';
import { IFRAME_DEFAULT_HEIGHT } from '@/entrypoints/newtab/constants';
import type { BookmarkGroup, BookmarkItem, BookmarkSubgroup, Space, SpaceStore } from '@/entrypoints/newtab/types';
import { FaviconImage } from '@/entrypoints/newtab/components/FaviconImage';
import { cn } from '@/lib/utils';

const POPUP_SELECTED_SPACE_KEY = 'newtab-pro:popup:selected-space-id';
const POPUP_SELECTED_GROUP_KEY = 'newtab-pro:popup:selected-group-id';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
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
        id: toText(item.id, crypto.randomUUID()),
        title: toText(item.title, url || '未命名书签'),
        url,
      };
    })
    .filter((item) => item.url.length > 0);
}

function sanitizeGroup(raw: unknown, index: number): BookmarkGroup {
  const input = isObject(raw) ? raw : {};
  const subgroupsRaw = Array.isArray(input.subgroups) ? input.subgroups : [];

  return {
    id: toText(input.id, `group-${index}`),
    title: toText(input.title, `分组 ${index + 1}`),
    color: typeof input.color === 'string' ? input.color : '',
    collapsed: !!input.collapsed,
    bookmarks: sanitizeBookmarkList(input.bookmarks),
    subgroups: subgroupsRaw
      .filter(isObject)
      .map((subgroup, subgroupIndex) => ({
        id: toText(subgroup.id, `subgroup-${index}-${subgroupIndex}`),
        title: toText(subgroup.title, `小组 ${subgroupIndex + 1}`),
        collapsed: !!subgroup.collapsed,
        bookmarks: sanitizeBookmarkList(subgroup.bookmarks),
        viewMode:
          subgroup.viewMode === 'icon' ||
          subgroup.viewMode === 'browser-tree' ||
          subgroup.viewMode === 'iframe'
            ? subgroup.viewMode
            : 'list',
        iconSize: subgroup.iconSize === 'sm' || subgroup.iconSize === 'lg' ? subgroup.iconSize : 'md',
      })),
    viewMode:
      input.viewMode === 'icon' || input.viewMode === 'browser-tree' || input.viewMode === 'iframe'
        ? input.viewMode
        : 'list',
    iconSize: input.iconSize === 'sm' || input.iconSize === 'lg' ? input.iconSize : 'md',
    browserTreeFolderId:
      typeof input.browserTreeFolderId === 'string' && input.browserTreeFolderId
        ? input.browserTreeFolderId
        : undefined,
    browserTreeMaxItems:
      typeof input.browserTreeMaxItems === 'number' && input.browserTreeMaxItems > 0
        ? Math.round(input.browserTreeMaxItems)
        : undefined,
    iframeUrl: typeof input.iframeUrl === 'string' && input.iframeUrl ? input.iframeUrl : undefined,
    iframeHeight:
      typeof input.iframeHeight === 'number' && input.iframeHeight > 0
        ? Math.round(input.iframeHeight)
        : undefined,
  };
}

function sanitizeSpaceStore(raw: unknown): SpaceStore {
  if (!isObject(raw) || !Array.isArray(raw.spaces) || raw.spaces.length === 0) {
    return {
      spaces: [],
      activeSpaceId: '',
    };
  }

  const spaces: Space[] = raw.spaces
    .filter(isObject)
    .map((space, index) => {
      const groupsRaw = isObject(space.board) && Array.isArray(space.board.groups) ? space.board.groups : [];
      return {
        id: toText(space.id, `space-${index}`),
        title: toText(space.title, `Space ${index + 1}`),
        board: {
          groups: groupsRaw.map((group, groupIndex) => sanitizeGroup(group, groupIndex)),
        },
        columns:
          space.columns === 'auto' ||
          space.columns === 1 ||
          space.columns === 2 ||
          space.columns === 3 ||
          space.columns === 4 ||
          space.columns === 5 ||
          space.columns === 6
            ? space.columns
            : undefined,
        showSearch: typeof space.showSearch === 'boolean' ? space.showSearch : undefined,
        iframeAutoRun: typeof space.iframeAutoRun === 'boolean' ? space.iframeAutoRun : undefined,
      };
    });

  const activeSpaceId =
    typeof raw.activeSpaceId === 'string' && spaces.some((space) => space.id === raw.activeSpaceId)
      ? raw.activeSpaceId
      : spaces[0]?.id ?? '';

  return {
    spaces,
    activeSpaceId,
  };
}

async function loadSpaceStore() {
  const payload = await browser.storage.local.get(SPACES_STORAGE_KEY);
  const fromStorage = payload[SPACES_STORAGE_KEY];

  if (fromStorage) {
    return sanitizeSpaceStore(fromStorage);
  }

  const fallbackRaw = localStorage.getItem(SPACES_STORAGE_FALLBACK_KEY);
  if (!fallbackRaw) {
    return { spaces: [], activeSpaceId: '' } satisfies SpaceStore;
  }

  try {
    return sanitizeSpaceStore(JSON.parse(fallbackRaw));
  } catch {
    return { spaces: [], activeSpaceId: '' } satisfies SpaceStore;
  }
}

function GroupContent({ group }: { group: BookmarkGroup }) {
  const renderRootBookmarks = () => {
    if (group.bookmarks.length === 0) {
      return null;
    }

    if (group.viewMode === 'icon') {
      return <BookmarkIconList bookmarks={group.bookmarks} iconSize={group.iconSize} />;
    }

    return <BookmarkRowList bookmarks={group.bookmarks} />;
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm">
      <header
        className={cn('flex min-h-10 items-center border-b border-border/50 px-2 py-0.5', !group.color && 'bg-muted/80')}
        style={group.color ? { background: group.color } : undefined}
      >
        <p className="truncate text-sm font-semibold text-black/90">{group.title}</p>
      </header>

      {group.collapsed ? null : (
      <div
        className={cn(
          'min-h-0 flex-1',
          group.viewMode === 'browser-tree' ? 'overflow-hidden py-1' : 'overflow-y-auto overflow-x-hidden',
          group.viewMode !== 'browser-tree' && group.viewMode !== 'iframe' ? 'p-2' : '',
        )}
      >
        {group.viewMode === 'iframe' ? (
          group.iframeUrl ? (
            <div className="rounded-md" style={{ minHeight: group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT, overflow: 'clip' }}>
              <iframe
                src={group.iframeUrl}
                title={group.title}
                className="h-full w-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-downloads"
                allow="fullscreen *; autoplay *; camera *; microphone *; geolocation *; clipboard-read *; clipboard-write *; payment *; encrypted-media *; picture-in-picture *; display-capture *; web-share *; accelerometer *; gyroscope *; magnetometer *; midi *; usb *; bluetooth *; hid *; serial *; gamepad *; screen-wake-lock *; idle-detection *; storage-access *; xr-spatial-tracking *; publickey-credentials-get *"
              />
            </div>
          ) : (
            <div className="flex h-9 items-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 text-[11px] text-muted-foreground">
              该分组未设置 iframe URL
            </div>
          )
        ) : group.viewMode === 'browser-tree' ? (
          group.browserTreeFolderId ? (
            <div className="h-full min-w-0 max-w-full overflow-x-hidden">
              <BrowserTreeView
                folderId={group.browserTreeFolderId}
                maxItems={group.browserTreeMaxItems}
                fitParentHeight
                disableCustomContextMenu
              />
            </div>
          ) : (
            <div className="flex h-9 items-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 text-[11px] text-muted-foreground">
              该分组未绑定书签文件夹
            </div>
          )
        ) : group.bookmarks.length === 0 && group.subgroups.length === 0 ? (
          <div className="flex h-9 items-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 text-[11px] text-muted-foreground">
            暂无内容
          </div>
        ) : (
          <>
            {renderRootBookmarks()}

            <div className={cn('flex flex-col gap-2', group.bookmarks.length > 0 && 'pt-1')}>
              {group.subgroups.map((subgroup) => (
                <SubgroupReadOnly key={subgroup.id} subgroup={subgroup} />
              ))}
            </div>
          </>
        )}
      </div>
      )}
    </section>
  );
}

function openBookmarkUrl(url: string, e?: MouseEvent<HTMLAnchorElement>) {
  if (
    url.startsWith('edge://') ||
    url.startsWith('chrome://') ||
    url.startsWith('about:')
  ) {
    e?.preventDefault();
    if (e?.ctrlKey && e.shiftKey) {
      void browser.tabs.create({ url, active: true });
      return;
    }
    if (e?.ctrlKey || e?.metaKey) {
      void browser.tabs.create({ url, active: false });
      return;
    }
    if (e?.shiftKey) {
      void browser.windows.create({ url });
      return;
    }
    void browser.tabs.update({ url });
  }
}

function BookmarkLink({
  bookmark,
  iconClassName,
  labelClassName,
  compact,
}: {
  bookmark: BookmarkItem;
  iconClassName: string;
  labelClassName?: string;
  compact?: boolean;
}) {
  return (
    <a
      href={bookmark.url}
      target="_self"
      title={`${bookmark.title}\n${bookmark.url}`}
      className={cn(
        compact
          ? 'grid grid-cols-[16px_1fr] items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-accent/75'
          : 'flex flex-col items-center gap-1 rounded-md p-1.5 hover:bg-accent/75',
      )}
      onClick={(e) => openBookmarkUrl(bookmark.url, e)}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        const url = bookmark.url;
        if (url.startsWith('edge://') || url.startsWith('chrome://') || url.startsWith('about:')) {
          e.preventDefault();
          if (e.shiftKey) {
            void browser.tabs.create({ url, active: true });
          } else {
            void browser.tabs.create({ url, active: false });
          }
        }
      }}
    >
      <FaviconImage url={bookmark.url} className={iconClassName} loading="lazy" />
      <span className={cn('truncate text-foreground', labelClassName)}>{bookmark.title}</span>
    </a>
  );
}

function BookmarkRowList({ bookmarks }: { bookmarks: BookmarkItem[] }) {
  return (
    <div className="space-y-0.5">
      {bookmarks.map((bookmark) => (
        <BookmarkLink
          key={bookmark.id}
          bookmark={bookmark}
          compact
          iconClassName="size-3.5 rounded-[3px]"
        />
      ))}
    </div>
  );
}

function BookmarkIconList({
  bookmarks,
  iconSize,
}: {
  bookmarks: BookmarkItem[];
  iconSize: 'sm' | 'md' | 'lg';
}) {
  const iconClassName = iconSize === 'sm' ? 'size-4 rounded-[4px]' : iconSize === 'lg' ? 'size-8 rounded-[4px]' : 'size-6 rounded-[4px]';
  const labelClassName = iconSize === 'sm' ? 'hidden' : iconSize === 'lg' ? 'w-full text-center text-[10px] leading-tight' : 'w-full text-center text-[8px] leading-tight';
  const minWidth = iconSize === 'sm' ? 32 : iconSize === 'lg' ? 64 : 56;

  return (
    <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}>
      {bookmarks.map((bookmark) => (
        <BookmarkLink
          key={bookmark.id}
          bookmark={bookmark}
          iconClassName={iconClassName}
          labelClassName={labelClassName}
        />
      ))}
    </div>
  );
}

function SubgroupReadOnly({ subgroup }: { subgroup: BookmarkSubgroup }) {
  const renderBookmarks = () => {
    if (subgroup.bookmarks.length === 0) {
      return <div className="px-1 py-0.5 text-xs text-muted-foreground">暂无书签</div>;
    }
    if (subgroup.viewMode === 'icon') {
      return <BookmarkIconList bookmarks={subgroup.bookmarks} iconSize={subgroup.iconSize} />;
    }
    return <BookmarkRowList bookmarks={subgroup.bookmarks} />;
  };

  return (
    <section className="rounded-lg border border-border/70 bg-card/70 px-1.5 py-1 shadow-sm">
      <header className="px-1 py-0.5">
        <p className="truncate text-xs font-semibold text-foreground">{subgroup.title}</p>
      </header>
      {!subgroup.collapsed ? <div className="mt-1">{renderBookmarks()}</div> : null}
    </section>
  );
}

export default function App() {
  const [store, setStore] = useState<SpaceStore>({ spaces: [], activeSpaceId: '' });
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');

  useEffect(() => {
    let alive = true;

    void (async () => {
      const loaded = await loadSpaceStore();
      if (!alive) {
        return;
      }
      setStore(loaded);
      const savedSpaceId = localStorage.getItem(POPUP_SELECTED_SPACE_KEY) || '';
      const defaultSpaceId =
        savedSpaceId && loaded.spaces.some((space) => space.id === savedSpaceId)
          ? savedSpaceId
          : loaded.activeSpaceId || loaded.spaces[0]?.id || '';
      setSelectedSpaceId(defaultSpaceId);
      const defaultSpace = loaded.spaces.find((space) => space.id === defaultSpaceId) || loaded.spaces[0];
      const savedGroupId = localStorage.getItem(POPUP_SELECTED_GROUP_KEY) || '';
      const defaultGroupId =
        savedGroupId && defaultSpace?.board.groups.some((group) => group.id === savedGroupId)
          ? savedGroupId
          : defaultSpace?.board.groups[0]?.id ?? '';
      setSelectedGroupId(defaultGroupId);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const selectedSpace = useMemo(
    () => store.spaces.find((space) => space.id === selectedSpaceId) ?? store.spaces[0],
    [selectedSpaceId, store.spaces],
  );

  const selectedGroup = useMemo(
    () => selectedSpace?.board.groups.find((group) => group.id === selectedGroupId) ?? selectedSpace?.board.groups[0],
    [selectedGroupId, selectedSpace],
  );

  useEffect(() => {
    if (!selectedSpace) {
      setSelectedGroupId('');
      return;
    }

    const hasGroup = selectedSpace.board.groups.some((group) => group.id === selectedGroupId);
    if (!hasGroup) {
      setSelectedGroupId(selectedSpace.board.groups[0]?.id ?? '');
    }
  }, [selectedGroupId, selectedSpace]);

  useEffect(() => {
    if (selectedSpaceId) {
      localStorage.setItem(POPUP_SELECTED_SPACE_KEY, selectedSpaceId);
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    if (selectedGroupId) {
      localStorage.setItem(POPUP_SELECTED_GROUP_KEY, selectedGroupId);
    }
  }, [selectedGroupId]);

  return (
    <div className="bg-page h-full overflow-hidden">
      {store.spaces.length === 0 ? (
        <div className="flex h-full items-center justify-center px-3 text-xs text-muted-foreground">暂无数据</div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-2 pb-1 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {store.spaces.map((space) => (
                <button
                  key={space.id}
                  type="button"
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs transition-colors',
                    selectedSpace?.id === space.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/30',
                  )}
                  onClick={() => setSelectedSpaceId(space.id)}
                >
                  {space.title}
                </button>
              ))}
            </div>
          </div>

          <div className="px-2 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {selectedSpace?.board.groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs transition-colors',
                    selectedGroup?.id === group.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-muted/30',
                  )}
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  {group.title}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="min-h-0 flex-1 overflow-hidden p-2">
            {selectedGroup ? (
              <GroupContent group={selectedGroup} />
            ) : (
              <div className="px-2 py-3 text-xs text-muted-foreground">当前 Space 没有分组</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
