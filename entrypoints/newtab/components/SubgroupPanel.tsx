import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, GripVertical, LayoutGrid, LayoutList, MoreHorizontal, Plus, Trash2, ExternalLink, AppWindow, EyeOff, FolderInput, PanelsTopLeft } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import type {
  BookmarkContainerTarget,
  BookmarkItem,
  BookmarkNodeTarget,
  BookmarkSubgroup,
  BookmarkViewMode,
  IconSize,
  InsertTarget,
  Space,
} from '../types';
import { useDndUIStore } from '../drag';
import { BookmarkRows } from './BookmarkRows';
import { BookmarkIconGrid } from './BookmarkIconGrid';
import { getGridOpenCounts, openUrlsInGrid, useWindowOpenPrefs } from '../window-open';

type SubgroupPanelProps = {
  groupId: string;
  subgroup: BookmarkSubgroup;
  spaces: Space[];
  activeSpaceId: string;
  onMoveSubgroupToSpace: (source: InsertTarget, targetSpaceId: string, targetGroupId: string) => void;
  onMoveBookmarkToSpace: (
    source: BookmarkNodeTarget,
    targetSpaceId: string,
    targetGroupId: string,
    targetSubgroupId?: string,
  ) => void;
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
    payload: { title: string; url: string },
    insertIndex?: number,
  ) => void;
  onSetViewMode: (mode: BookmarkViewMode) => void;
  onSetIconSize: (size: IconSize) => void;
  autoFocusEdit?: boolean;
  onClearAutoFocus?: () => void;
};

export function SubgroupPanel({
  groupId,
  subgroup,
  spaces,
  activeSpaceId,
  onMoveSubgroupToSpace,
  onMoveBookmarkToSpace,
  onToggleSubgroup,
  onRenameSubgroup,
  onDeleteSubgroup,
  onOpenManualAdd,
  onOpenImportAdd,
  onOpenEditBookmark,
  onDeleteBookmark,
  onMoveBookmark,
  onDropExternalBookmark,
  onSetViewMode,
  onSetIconSize,
  autoFocusEdit,
  onClearAutoFocus,
}: SubgroupPanelProps) {
  const { compactGridWindows, setCompactGridWindows } = useWindowOpenPrefs();
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
        <div className="pointer-events-none absolute -top-[5px] left-0 right-0 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}

      <section
        ref={setDropRef}
        id={`dnd-${dndId}`}
        className={cn('rounded-lg border border-border/70 bg-card/70 px-1.5 py-1 shadow-sm transition-opacity', isDragging && 'opacity-50')}
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
          <button
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground"
            onClick={() => onToggleSubgroup(target)}
            title="折叠小组"
          >
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
            <Button
              size="icon"
              variant="ghost"
              className="size-6 rounded-md text-muted-foreground hover:bg-muted/45 hover:text-foreground"
              title="手动添加"
              onClick={() => onOpenManualAdd(bookmarkTarget)}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 rounded-md text-muted-foreground hover:bg-muted/45 hover:text-foreground"
              title="从书签导入"
              onClick={() => onOpenImportAdd(bookmarkTarget)}
            >
              <FolderTree className="size-3.5" />
            </Button>
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'size-6 rounded-md text-muted-foreground hover:bg-muted/45 hover:text-foreground',
                    menuOpen && 'bg-muted/45 text-foreground',
                  )}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {/* View mode segmented */}
                <DropdownMenuLabel className="pb-1 text-xs font-medium text-muted-foreground">视图模式</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="flex items-center rounded-md bg-muted p-0.5">
                    {([['list', <LayoutList className="size-3.5" />, '列表'], ['icon', <LayoutGrid className="size-3.5" />, '图标']] as const).map(([val, icon, label]) => (
                      <button
                        key={val}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-all',
                          subgroup.viewMode === val
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={() => onSetViewMode(val as BookmarkViewMode)}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Icon size segmented – only in icon mode */}
                {subgroup.viewMode === 'icon' && (
                  <>
                    <DropdownMenuLabel className="pb-1 text-xs font-medium text-muted-foreground">图标尺寸</DropdownMenuLabel>
                    <div className="px-2 pb-2">
                      <div className="flex items-center rounded-md bg-muted p-0.5">
                        {([['sm', '小'], ['md', '中'], ['lg', '大']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            className={cn(
                              'flex flex-1 items-center justify-center rounded py-1 text-xs font-medium transition-all',
                              subgroup.iconSize === val
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => onSetIconSize(val as IconSize)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {spaces.some((s) =>
                  s.id !== activeSpaceId
                    ? s.board.groups.length > 0
                    : s.board.groups.some((g) => g.id !== groupId)
                ) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderInput className="mr-2 size-3.5" />
                        移动到
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        {spaces.map((space) => {
                          if (space.board.groups.length === 0) return null;
                          return (
                            <DropdownMenuSub key={space.id}>
                              <DropdownMenuSubTrigger>
                                {space.title}
                                {space.id === activeSpaceId && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">(当前)</span>
                                )}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                {space.board.groups.map((g) => {
                                  const isCurrentGroup =
                                    space.id === activeSpaceId && g.id === groupId;
                                  return (
                                    <DropdownMenuItem
                                      key={g.id}
                                      disabled={isCurrentGroup}
                                      onSelect={() => onMoveSubgroupToSpace(target, space.id, g.id)}
                                    >
                                      {g.title}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          );
                        })}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                <DropdownMenuItem onSelect={() => onDeleteSubgroup(target)}>
                  <Trash2 className="mr-2 size-3.5" />
                  删除小组
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={subgroup.bookmarks.length === 0} onSelect={() => {
                    for (const b of subgroup.bookmarks) browser.tabs.create({ url: b.url });
                  }}>
                  <ExternalLink className="mr-2 size-3.5" />
                  打开全部书签
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={subgroup.bookmarks.length === 0}
                  onSelect={() => browser.windows.create({ url: subgroup.bookmarks.map(b => b.url) })}
                >
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开全部
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={subgroup.bookmarks.length === 0}
                  onSelect={() => browser.windows.create({ url: subgroup.bookmarks.map(b => b.url), incognito: true })}
                >
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开全部
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={subgroup.bookmarks.length === 0}>
                    <PanelsTopLeft className="mr-2 size-3.5" />
                    多窗口网格打开
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuCheckboxItem
                      checked={compactGridWindows}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(next) => setCompactGridWindows(!!next)}
                    >
                      简化窗口
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {getGridOpenCounts(subgroup.bookmarks.length).map((count) => (
                      <DropdownMenuItem
                        key={count}
                        onSelect={() => void openUrlsInGrid(subgroup.bookmarks.slice(0, count).map((bookmark) => bookmark.url), compactGridWindows)}
                      >
                        打开前 {count} 个
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!subgroup.collapsed && (
          <div className="mt-1">
            {subgroup.viewMode === 'icon' ? (
              <BookmarkIconGrid
                bookmarks={subgroup.bookmarks}
                target={bookmarkTarget}
                iconSize={subgroup.iconSize}
                emptyHint="暂无书签"
                spaces={spaces}
                activeSpaceId={activeSpaceId}
                onMoveBookmarkToSpace={onMoveBookmarkToSpace}
                onEditBookmark={onOpenEditBookmark}
                onDeleteBookmark={onDeleteBookmark}
                onMoveBookmark={onMoveBookmark}
                onDropExternalBookmark={onDropExternalBookmark}
              />
            ) : (
              <BookmarkRows
                bookmarks={subgroup.bookmarks}
                target={bookmarkTarget}
                emptyHint="暂无书签"
                spaces={spaces}
                activeSpaceId={activeSpaceId}
                onMoveBookmarkToSpace={onMoveBookmarkToSpace}
                onEditBookmark={onOpenEditBookmark}
                onDeleteBookmark={onDeleteBookmark}
                onMoveBookmark={onMoveBookmark}
                onDropExternalBookmark={onDropExternalBookmark}
              />
            )}
          </div>
        )}
      </section>

      {isTarget && dropIndicator.zone === 'after' ? (
        <div className="pointer-events-none absolute -bottom-[5px] left-0 right-0 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}
