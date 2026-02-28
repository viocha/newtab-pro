import type { DragEvent } from 'react';
import { useState } from 'react';
import { Edit3, ExternalLink, AppWindow, EyeOff, Trash2 } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

import type { BookmarkContainerTarget, BookmarkItem, BookmarkNodeTarget } from '../types';
import { createFaviconUrl, tryNormalizeUrl } from '../utils';
import { useDndUIStore, readTabDragPayload } from '../drag';

type BookmarkRowsProps = {
  bookmarks: BookmarkItem[];
  target: BookmarkContainerTarget;
  emptyHint: string;
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
  onEditBookmark,
  onDeleteBookmark,
}: {
  bookmark: BookmarkItem;
  index: number;
  target: BookmarkContainerTarget;
  contextOpenBookmarkId: string | null;
  setContextOpenBookmarkId: (id: string | null) => void;
  onEditBookmark: (target: BookmarkContainerTarget, b: BookmarkItem) => void;
  onDeleteBookmark: (target: BookmarkContainerTarget, id: string) => void;
}) {
  const dndId = `bookmark|${target.groupId}|${target.subgroupId}|${bookmark.id}`;
  const { activeId, dropIndicator } = useDndUIStore();

  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index },
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
        <div className="pointer-events-none absolute -top-[1px] left-1 right-1 z-20 h-[2px] rounded-full bg-primary" />
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
            {...listeners}
            {...attributes}
          >
            <img
              src={createFaviconUrl(bookmark.url)}
              alt=""
              className="size-3.5 rounded-[3px]"
              loading="lazy"
            />
            <span className="truncate text-foreground hover:underline">{bookmark.title}</span>
          </a>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
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
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onEditBookmark(target, bookmark)}>
            <Edit3 className="mr-2 size-3.5" />
            编辑
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onDeleteBookmark(target, bookmark.id)}>
            <Trash2 className="mr-2 size-3.5" />
            删除
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isTarget && dropIndicator.zone === 'after' ? (
        <div className="pointer-events-none absolute -bottom-[1px] left-1 right-1 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

function BookmarkEndNode({ target, index }: { target: BookmarkContainerTarget; index: number }) {
  const dndId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark-end', target, index },
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

  const EmptyZoneId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef: setEmptyDropRef } = useDroppable({
    id: EmptyZoneId,
    data: { type: 'bookmark-end', target, index: 0 },
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
          onEditBookmark={onEditBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
      ))}
      <BookmarkEndNode target={target} index={bookmarks.length} />
    </div>
  );
}
