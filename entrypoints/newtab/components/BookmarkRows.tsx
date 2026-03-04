import type { DragEvent } from 'react';
import { useState } from 'react';
import { Edit3, ExternalLink, AppWindow, EyeOff, Trash2, Link as LinkIcon, FolderInput } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

import type { BookmarkContainerTarget, BookmarkItem, BookmarkNodeTarget, Space } from '../types';
import { tryNormalizeUrl } from '../utils';
import { useDndUIStore, readTabDragPayload } from '../drag';
import { FaviconImage } from './FaviconImage';

type BookmarkRowsProps = {
  bookmarks: BookmarkItem[];
  target: BookmarkContainerTarget;
  emptyHint: string;
  spaces: Space[];
  activeSpaceId: string;
  onMoveBookmarkToSpace: (
    source: BookmarkNodeTarget,
    targetSpaceId: string,
    targetGroupId: string,
    targetSubgroupId?: string,
  ) => void;
  onEditBookmark: (target: BookmarkContainerTarget, bookmark: BookmarkItem) => void;
  onDeleteBookmark: (target: BookmarkContainerTarget, bookmarkId: string) => void;
  onMoveBookmark: (
    source: BookmarkNodeTarget,
    target: BookmarkContainerTarget,
    insertIndex?: number,
  ) => void;
  onDropExternalBookmark: (
    target: BookmarkContainerTarget,
    payload: { title: string; url: string },
    insertIndex?: number,
  ) => void;
};

function readExternalBookmarkFromDrop(event: DragEvent) {
  const tabPayload = readTabDragPayload(event);
  if (tabPayload?.url) {
    return tabPayload;
  }

  const uriList = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
  if (!uriList) {
    return null;
  }

  const normalizedUrl = tryNormalizeUrl(uriList);
  if (!normalizedUrl) {
    return null;
  }

  return {
    title: normalizedUrl,
    url: normalizedUrl,
  };
}

function BookmarkItemNode({
  bookmark,
  index,
  target,
  contextOpenBookmarkId,
  setContextOpenBookmarkId,
  spaces,
  activeSpaceId,
  onMoveBookmarkToSpace,
  onEditBookmark,
  onDeleteBookmark,
}: {
  bookmark: BookmarkItem;
  index: number;
  target: BookmarkContainerTarget;
  contextOpenBookmarkId: string | null;
  setContextOpenBookmarkId: (id: string | null) => void;
  spaces: Space[];
  activeSpaceId: string;
  onMoveBookmarkToSpace: (
    source: BookmarkNodeTarget,
    targetSpaceId: string,
    targetGroupId: string,
    targetSubgroupId?: string,
  ) => void;
  onEditBookmark: (target: BookmarkContainerTarget, b: BookmarkItem) => void;
  onDeleteBookmark: (target: BookmarkContainerTarget, id: string) => void;
}) {
  const dndId = `bookmark|${target.groupId}|${target.subgroupId}|${bookmark.id}`;
  const { activeId, dropIndicator } = useDndUIStore();

  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index, isIconGrid: false },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index, isIconGrid: false },
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const isDragging = activeId === dndId;
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'bookmark';

  return (
    <div
      ref={setNodeRef}
      id={`dnd-${dndId}`}
      className="relative rounded-md"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      {isTarget && dropIndicator.zone === 'before' ? (
        <div className="pointer-events-none absolute -top-[2px] left-1 right-1 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}

      <ContextMenu onOpenChange={(open) => setContextOpenBookmarkId(open ? bookmark.id : null)}>
        <ContextMenuTrigger asChild>
          <a
            href={bookmark.url}
            target="_self"
            className={cn(
              'grid grid-cols-[16px_1fr] items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-accent/75 transition-opacity',
              contextOpenBookmarkId === bookmark.id && 'bg-accent/75',
            )}
            title={`${bookmark.title}\n${bookmark.url}`}
            onClick={(e) => {
              const url = bookmark.url;
              if (
                url.startsWith('edge://') ||
                url.startsWith('chrome://') ||
                url.startsWith('about:')
              ) {
                e.preventDefault();
                if (e.altKey) {
                  // Alt+click → 静默，不做任何事
                } else if (e.ctrlKey && e.shiftKey) {
                  // Ctrl+Shift+click → 前台新标签页
                  browser.tabs.create({ url, active: true });
                } else if (e.ctrlKey || e.metaKey) {
                  // Ctrl/Cmd+click → 后台新标签页
                  browser.tabs.create({ url, active: false });
                } else if (e.shiftKey) {
                  // Shift+click → 新窗口
                  browser.windows.create({ url });
                } else {
                  // 普通单击 → 当前标签页
                  browser.tabs.update({ url });
                }
              }
            }}
            onAuxClick={(e) => {
              const url = bookmark.url;
              if (
                e.button === 1 &&
                (url.startsWith('edge://') ||
                  url.startsWith('chrome://') ||
                  url.startsWith('about:'))
              ) {
                e.preventDefault();
                if (e.shiftKey) {
                  // Shift+中键 → 前台新标签页
                  browser.tabs.create({ url, active: true });
                } else {
                  // 中键 → 后台新标签页
                  browser.tabs.create({ url, active: false });
                }
              }
            }}
            {...listeners}
            {...attributes}
          >
            <FaviconImage
              url={bookmark.url}
              className="size-3.5 rounded-[3px]"
              loading="lazy"
            />
            <span className="truncate text-foreground">{bookmark.title}</span>
          </a>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onSelect={() => onEditBookmark(target, bookmark)}>
            <Edit3 className="mr-2 size-3.5" />
            编辑
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onDeleteBookmark(target, bookmark.id)}>
            <Trash2 className="mr-2 size-3.5" />
            删除
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput className="mr-2 size-3.5" />
              移动到
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {spaces.map((space) => {
                if (space.board.groups.length === 0) return null;
                return (
                  <ContextMenuSub key={space.id}>
                    <ContextMenuSubTrigger>
                      {space.title}
                      {space.id === activeSpaceId && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(当前)</span>
                      )}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-44">
                      {space.board.groups.map((g) => {
                        const isCurrentGroup =
                          space.id === activeSpaceId && g.id === target.groupId;
                        const isCurrentRoot = isCurrentGroup && !target.subgroupId;
                        if (g.subgroups.length === 0) {
                          return (
                            <ContextMenuItem
                              key={g.id}
                              disabled={isCurrentRoot}
                              onSelect={() =>
                                onMoveBookmarkToSpace(
                                  { ...target, bookmarkId: bookmark.id },
                                  space.id,
                                  g.id,
                                )
                              }
                            >
                              {g.title}
                            </ContextMenuItem>
                          );
                        }
                        return (
                          <ContextMenuSub key={g.id}>
                            <ContextMenuSubTrigger>
                              {g.title}
                              {isCurrentGroup && (
                                <span className="ml-1 text-[10px] text-muted-foreground">(当前)</span>
                              )}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-44">
                              <ContextMenuItem
                                disabled={isCurrentRoot}
                                onSelect={() =>
                                  onMoveBookmarkToSpace(
                                    { ...target, bookmarkId: bookmark.id },
                                    space.id,
                                    g.id,
                                  )
                                }
                              >
                                根目录
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              {g.subgroups.map((sg) => {
                                const isCurrentSG =
                                  isCurrentGroup && target.subgroupId === sg.id;
                                return (
                                  <ContextMenuItem
                                    key={sg.id}
                                    disabled={isCurrentSG}
                                    onSelect={() =>
                                      onMoveBookmarkToSpace(
                                        { ...target, bookmarkId: bookmark.id },
                                        space.id,
                                        g.id,
                                        sg.id,
                                      )
                                    }
                                  >
                                    {sg.title}
                                  </ContextMenuItem>
                                );
                              })}
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                        );
                      })}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => navigator.clipboard.writeText(bookmark.url)}>
            <LinkIcon className="mr-2 size-3.5" />
            复制链接
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => browser.tabs.create({ url: bookmark.url })}>
            <ExternalLink className="mr-2 size-3.5" />
            在新标签页打开
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => browser.windows.create({ url: bookmark.url })}>
            <AppWindow className="mr-2 size-3.5" />
            在新窗口打开
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => browser.windows.create({ url: bookmark.url, incognito: true })}>
            <EyeOff className="mr-2 size-3.5" />
            在隐私窗口打开
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isTarget && dropIndicator.zone === 'after' ? (
        <div className="pointer-events-none absolute -bottom-[2px] left-1 right-1 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

function BookmarkEndNode({ target, index }: { target: BookmarkContainerTarget; index: number }) {
  const dndId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark-end', target, index, isIconGrid: false },
  });
  const { dropIndicator } = useDndUIStore();
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'bookmark';

  return (
    <div ref={setNodeRef} id={`dnd-${dndId}`} className="relative h-1 -mt-0.5 rounded">
      {isTarget ? (
        <div className="pointer-events-none absolute top-1 left-1 right-1 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

export function BookmarkRows({
  bookmarks,
  target,
  emptyHint,
  spaces,
  activeSpaceId,
  onMoveBookmarkToSpace,
  onEditBookmark,
  onDeleteBookmark,
  onMoveBookmark,
  onDropExternalBookmark,
}: BookmarkRowsProps) {
  const [contextOpenBookmarkId, setContextOpenBookmarkId] = useState<string | null>(null);

  const resolveDropKind = (event: DragEvent) => {
    if (readExternalBookmarkFromDrop(event)) {
      return 'external' as const;
    }
    return null;
  };

  const handleDropAt = (event: DragEvent, insertIndex?: number) => {
    event.preventDefault();
    event.stopPropagation();

    // External tab drop handler ONLY. Internal moves are handled by App.tsx's DndContext.
    const externalPayload = readExternalBookmarkFromDrop(event);
    if (!externalPayload) {
      return;
    }

    onDropExternalBookmark(target, externalPayload, insertIndex);
  };

  const containerId = `bookmark-container|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef: setContainerDropRef } = useDroppable({
    id: containerId,
    data: { type: 'bookmark-container', isIconGrid: false },
  });

  const EmptyZoneId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef: setEmptyDropRef } = useDroppable({
    id: EmptyZoneId,
    data: { type: 'bookmark-end', target, index: 0, isIconGrid: false },
  });
  const { dropIndicator } = useDndUIStore();
  const isEmptyTarget = dropIndicator?.id === EmptyZoneId;

  if (bookmarks.length === 0) {
    if (!emptyHint) {
      return null;
    }
    return (
      <div
        ref={setEmptyDropRef}
        id={`dnd-${EmptyZoneId}`}
        className={cn(
          "flex h-8 items-center rounded-md px-2 text-[11px] text-muted-foreground",
          isEmptyTarget && "bg-primary/20",
        )}
        onDragOver={(event) => {
          const dropKind = resolveDropKind(event);
          if (!dropKind) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          if (!resolveDropKind(event)) return;
          handleDropAt(event);
        }}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div
      ref={setContainerDropRef}
      id={containerId}
      className="grid gap-0.5"
      onDragOver={(event) => {
        const dropKind = resolveDropKind(event);
        if (!dropKind) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!resolveDropKind(event)) return;
        handleDropAt(event, bookmarks.length);
      }}
    >
      {bookmarks.map((bookmark, index) => (
        <BookmarkItemNode
          key={bookmark.id}
          bookmark={bookmark}
          index={index}
          target={target}
          contextOpenBookmarkId={contextOpenBookmarkId}
          setContextOpenBookmarkId={setContextOpenBookmarkId}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          onMoveBookmarkToSpace={onMoveBookmarkToSpace}
          onEditBookmark={onEditBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
      ))}
      <BookmarkEndNode target={target} index={bookmarks.length} />
    </div>
  );
}
