import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, GripVertical, MoreHorizontal, Plus, Trash2, ExternalLink, AppWindow, EyeOff } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type {
  BookmarkContainerTarget,
  BookmarkItem,
  BookmarkNodeTarget,
  BookmarkSubgroup,
  InsertTarget,
} from '../types';
import { useDndUIStore } from '../drag';
import { BookmarkRows } from './BookmarkRows';

type SubgroupPanelProps = {
  groupId: string;
  subgroup: BookmarkSubgroup;
  onToggleSubgroup: (target: InsertTarget) => void;
  onRenameSubgroup: (target: InsertTarget, nextTitle: string) => void;
  onDeleteSubgroup: (target: InsertTarget) => void;
  onOpenManualAdd: (target: BookmarkContainerTarget) => void;
  onOpenImportAdd: (target: BookmarkContainerTarget) => void;
  onOpenEditBookmark: (target: BookmarkContainerTarget, bookmark: BookmarkItem) => void;
  onDeleteBookmark: (target: BookmarkContainerTarget, bookmarkId: string) => void;
  onMoveBookmark: (
    source: BookmarkNodeTarget,
    target: BookmarkContainerTarget,
    insertIndex?: number,
  ) => void;
  onDropExternalBookmark: (
    target: BookmarkContainerTarget,
    payload: { title: string; url: string; icon?: string },
    insertIndex?: number,
  ) => void;
  autoFocusEdit?: boolean;
  onClearAutoFocus?: () => void;
};

export function SubgroupPanel({
  groupId,
  subgroup,
  onToggleSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onOpenManualAdd,
  onOpenImportAdd,
  onOpenEditBookmark,
  onDeleteBookmark,
  onMoveBookmark,
  onDropExternalBookmark,
  autoFocusEdit,
  onClearAutoFocus,
}: SubgroupPanelProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(subgroup.title);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (autoFocusEdit) {
      // Delay to let the dropdown menu close and release focus
      const timer = setTimeout(() => {
        setEditingTitle(true);
        setTitleDraft(subgroup.title);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocusEdit, subgroup.title]);

  const target = useMemo<InsertTarget>(
    () => ({
      groupId,
      subgroupId: subgroup.id,
    }),
    [groupId, subgroup.id],
  );
  const bookmarkTarget = useMemo<BookmarkContainerTarget>(
    () => ({
      groupId,
      subgroupId: subgroup.id,
    }),
    [groupId, subgroup.id],
  );

  const commitRename = () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(subgroup.title);
      setEditingTitle(false);
      return;
    }
    if (nextTitle !== subgroup.title) {
      onRenameSubgroup(target, nextTitle);
    }
    setEditingTitle(false);
    onClearAutoFocus?.();
  };

  const dndId = `subgroup|${groupId}|${subgroup.id}`;
  const { activeId, dropIndicator } = useDndUIStore();

  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: dndId,
    data: { type: 'subgroup', groupId, subgroup, target }
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: 'subgroup', target, subgroup }
  });

  const isDragging = activeId === dndId;
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'subgroup';

  return (
    <div className="relative">
      {isTarget && dropIndicator.zone === 'before' ? (
        <div className="pointer-events-none absolute -top-1.5 left-0 right-0 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}

      <section
        ref={setDropRef}
        id={`dnd-${dndId}`}
        className={cn(
          "rounded-lg border border-border/70 bg-card/70 px-1.5 py-1 shadow-sm transition-opacity",
          isDragging && "opacity-50"
        )}
      >
        <header className="group flex items-center gap-0.5 px-0.5">
          <span
            ref={setDragRef}
            {...listeners}
            {...attributes}
            className="inline-flex size-5 cursor-grab items-center justify-center text-muted-foreground outline-none"
            title="拖拽调整小组顺序"
          >
            <GripVertical className="size-3.5" />
          </span>
          <button className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => onToggleSubgroup(target)} title="折叠小组">
            {subgroup.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                className="h-6 w-full rounded border border-input bg-background px-2 text-xs outline-none ring-0"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitRename();
                  } else if (event.key === 'Escape') {
                    setTitleDraft(subgroup.title);
                    setEditingTitle(false);
                  }
                }}
                onFocus={(e) => e.target.select()}
                autoFocus
              />
            ) : (
              <p
                className="truncate text-xs font-semibold text-foreground cursor-text"
                onClick={() => {
                  setTitleDraft(subgroup.title);
                  setEditingTitle(true);
                }}
                title="点击重命名"
              >
                {subgroup.title}
              </p>
            )}
          </div>

          <div className={cn(
            'flex items-center gap-0.5 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <Button size="icon" variant="ghost" className="size-6" title="手动添加" onClick={() => onOpenManualAdd(bookmarkTarget)}>
              <Plus className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-6" title="从书签导入" onClick={() => onOpenImportAdd(bookmarkTarget)}>
              <FolderTree className="size-3.5" />
            </Button>
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn('size-6', menuOpen && 'bg-accent text-accent-foreground')}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  disabled={subgroup.bookmarks.length === 0}
                  onSelect={() => {
                    for (const b of subgroup.bookmarks) browser.tabs.create({ url: b.url });
                  }}
                >
                  <ExternalLink className="mr-2 size-3.5" />
                  打开所有书签
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={subgroup.bookmarks.length === 0}
                  onSelect={() => browser.windows.create({ url: subgroup.bookmarks.map(b => b.url) })}
                >
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开所有
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={subgroup.bookmarks.length === 0}
                  onSelect={() => browser.windows.create({ url: subgroup.bookmarks.map(b => b.url), incognito: true })}
                >
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开所有
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDeleteSubgroup(target)}>
                  <Trash2 className="mr-2 size-3.5" />
                  删除小组
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!subgroup.collapsed && (
          <div className="mt-1">
            <BookmarkRows
              bookmarks={subgroup.bookmarks}
              target={bookmarkTarget}
              emptyHint="暂无书签"
              onEditBookmark={onOpenEditBookmark}
              onDeleteBookmark={onDeleteBookmark}
              onMoveBookmark={onMoveBookmark}
              onDropExternalBookmark={onDropExternalBookmark}
            />
          </div>
        )}
      </section>

      {isTarget && dropIndicator.zone === 'after' ? (
        <div className="pointer-events-none absolute -bottom-1.5 left-0 right-0 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}
