import type { DragEvent } from 'react';
import { useState } from 'react';
import { Edit3, ExternalLink, AppWindow, EyeOff, Trash2, Link as LinkIcon } from 'lucide-react';
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

import type { BookmarkContainerTarget, BookmarkItem, BookmarkNodeTarget, IconSize } from '../types';
import { tryNormalizeUrl } from '../utils';
import { useDndUIStore, readTabDragPayload } from '../drag';
import { FaviconImage } from './FaviconImage';

// ── size config ───────────────────────────────────────────────────────

const SIZE_CONFIG: Record<IconSize, { minW: number; iconCls: string; showLabel: boolean; textCls: string }> = {
  sm: { minW: 32,  iconCls: 'size-4',  showLabel: false, textCls: '' },
  md: { minW: 56,  iconCls: 'size-6',  showLabel: true,  textCls: 'text-[8px]' },
  lg: { minW: 64,  iconCls: 'size-8',  showLabel: true,  textCls: 'text-[10px]' },
};

// ── helpers ───────────────────────────────────────────────────────────

function readExternalBookmarkFromDrop(event: DragEvent) {
  const tabPayload = readTabDragPayload(event);
  if (tabPayload?.url) return tabPayload;
  const uriList =
    event.dataTransfer.getData('text/uri-list') ||
    event.dataTransfer.getData('text/plain');
  if (!uriList) return null;
  const normalizedUrl = tryNormalizeUrl(uriList);
  if (!normalizedUrl) return null;
  return { title: normalizedUrl, url: normalizedUrl };
}

// ── IconBookmarkItemNode ──────────────────────────────────────────────

function IconBookmarkItemNode({
  bookmark,
  index,
  target,
  iconSize,
  contextOpenBookmarkId,
  setContextOpenBookmarkId,
  onEditBookmark,
  onDeleteBookmark,
}: {
  bookmark: BookmarkItem;
  index: number;
  target: BookmarkContainerTarget;
  iconSize: IconSize;
  contextOpenBookmarkId: string | null;
  setContextOpenBookmarkId: (id: string | null) => void;
  onEditBookmark: (target: BookmarkContainerTarget, b: BookmarkItem) => void;
  onDeleteBookmark: (target: BookmarkContainerTarget, id: string) => void;
}) {
  const dndId = `bookmark|${target.groupId}|${target.subgroupId}|${bookmark.id}`;
  const { activeId, dropIndicator } = useDndUIStore();

  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index, isIconGrid: true, iconSize },
  });

  // isIconGrid flag lets App.tsx use X-axis for drop zone determination
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark', target, bookmark, index, isIconGrid: true, iconSize },
  });

  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const isDragging = activeId === dndId;
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'bookmark';
  const cfg = SIZE_CONFIG[iconSize];

  return (
    <div
      ref={setNodeRef}
      id={`dnd-${dndId}`}
      className="relative"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      {/* Drop indicator – vertical line on left/right */}
      {isTarget && dropIndicator.zone === 'before' ? (
        <div className="pointer-events-none absolute -left-[2px] top-1 bottom-1 z-20 w-[2px] rounded-full bg-primary" />
      ) : null}

      <ContextMenu onOpenChange={(open) => setContextOpenBookmarkId(open ? bookmark.id : null)}>
        <ContextMenuTrigger asChild>
          <a
            href={bookmark.url}
            target="_self"
            className={cn(
              'flex flex-col items-center gap-1 rounded-md p-1.5 hover:bg-accent/75 transition-colors',
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
                if (e.altKey) { /* silent */ }
                else if (e.ctrlKey && e.shiftKey) browser.tabs.create({ url, active: true });
                else if (e.ctrlKey || e.metaKey) browser.tabs.create({ url, active: false });
                else if (e.shiftKey) browser.windows.create({ url });
                else browser.tabs.update({ url });
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
                if (e.shiftKey) browser.tabs.create({ url, active: true });
                else browser.tabs.create({ url, active: false });
              }
            }}
            {...listeners}
            {...attributes}
          >
            <FaviconImage
              url={bookmark.url}
              className={cn(cfg.iconCls, 'shrink-0 rounded-[4px]')}
              loading="lazy"
            />
            {cfg.showLabel && (
              <span
                className={cn(
                  'w-full truncate text-center text-foreground leading-tight',
                  cfg.textCls,
                )}
              >
                {bookmark.title}
              </span>
            )}
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
          <ContextMenuItem
            onSelect={() => browser.windows.create({ url: bookmark.url, incognito: true })}
          >
            <EyeOff className="mr-2 size-3.5" />
            在隐私窗口打开
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => navigator.clipboard.writeText(bookmark.url)}>
            <LinkIcon className="mr-2 size-3.5" />
            复制链接
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
        <div className="pointer-events-none absolute -right-[2px] top-1 bottom-1 z-20 w-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

// ── IconBookmarkEndNode ───────────────────────────────────────────────

function IconBookmarkEndNode({
  target,
  index,
  iconSize,
}: {
  target: BookmarkContainerTarget;
  index: number;
  iconSize: IconSize;
}) {
  const dndId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark-end', target, index, isIconGrid: true, iconSize },
  });
  const { dropIndicator } = useDndUIStore();
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'bookmark';

  return (
    <div
      ref={setNodeRef}
      id={`dnd-${dndId}`}
      className={cn(
        'col-span-full rounded-md transition-colors',
        isTarget ? 'min-h-8 bg-primary/20' : 'min-h-[2px]',
      )}
    />
  );
}

// ── BookmarkIconGrid ──────────────────────────────────────────────────

type BookmarkIconGridProps = {
  bookmarks: BookmarkItem[];
  target: BookmarkContainerTarget;
  iconSize: IconSize;
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

export function BookmarkIconGrid({
  bookmarks,
  target,
  iconSize,
  emptyHint,
  onEditBookmark,
  onDeleteBookmark,
  onDropExternalBookmark,
}: BookmarkIconGridProps) {
  const [contextOpenBookmarkId, setContextOpenBookmarkId] = useState<string | null>(null);
  const cfg = SIZE_CONFIG[iconSize];

  const resolveDropKind = (event: DragEvent) => {
    if (readExternalBookmarkFromDrop(event)) return 'external' as const;
    return null;
  };

  const containerId = `bookmark-container|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef: setContainerDropRef } = useDroppable({
    id: containerId,
    data: { type: 'bookmark-container', isIconGrid: true, iconSize },
  });

  const EmptyZoneId = `bookmark-end|${target.groupId}|${target.subgroupId}`;
  const { setNodeRef: setEmptyDropRef } = useDroppable({
    id: EmptyZoneId,
    data: { type: 'bookmark-end', target, index: 0, isIconGrid: true, iconSize },
  });
  const { dropIndicator } = useDndUIStore();
  const isEmptyTarget = dropIndicator?.id === EmptyZoneId;

  if (bookmarks.length === 0) {
    if (!emptyHint) return null;
    return (
      <div
        ref={setEmptyDropRef}
        id={`dnd-${EmptyZoneId}`}
        className={cn(
          'flex h-8 items-center rounded-md px-2 text-[11px] text-muted-foreground',
          isEmptyTarget && 'bg-primary/20',
        )}
        onDragOver={(event) => {
          if (!resolveDropKind(event)) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          if (!resolveDropKind(event)) return;
          event.preventDefault();
          event.stopPropagation();
          const payload = readExternalBookmarkFromDrop(event);
          if (payload) onDropExternalBookmark(target, payload);
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
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cfg.minW}px, 1fr))` }}
      onDragOver={(event) => {
        if (!resolveDropKind(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!resolveDropKind(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const payload = readExternalBookmarkFromDrop(event);
        if (payload) onDropExternalBookmark(target, payload, bookmarks.length);
      }}
    >
      {bookmarks.map((bookmark, index) => (
        <IconBookmarkItemNode
          key={bookmark.id}
          bookmark={bookmark}
          index={index}
          target={target}
          iconSize={iconSize}
          contextOpenBookmarkId={contextOpenBookmarkId}
          setContextOpenBookmarkId={setContextOpenBookmarkId}
          onEditBookmark={onEditBookmark}
          onDeleteBookmark={onDeleteBookmark}
        />
      ))}
      <IconBookmarkEndNode target={target} index={bookmarks.length} iconSize={iconSize} />
    </div>
  );
}
