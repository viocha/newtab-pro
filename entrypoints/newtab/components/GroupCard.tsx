import { useEffect, useMemo, useRef, useState } from 'react';
import { DragEvent } from 'react';
import { Check, GripHorizontal, LayoutGrid, LayoutList, MoreHorizontal, FolderTree, FolderPlus, Palette, Plus, Trash2, ExternalLink, AppWindow, EyeOff } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
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
  BookmarkGroup,
  BookmarkItem,
  BookmarkNodeTarget,
  BookmarkViewMode,
  IconSize,
  InsertTarget,
} from '../types';
import { useDndUIStore, readTabDragPayload } from '../drag';
import { BookmarkRows } from './BookmarkRows';
import { BookmarkIconGrid } from './BookmarkIconGrid';
import { SubgroupPanel } from './SubgroupPanel';
import { tryNormalizeUrl, createFaviconUrl } from '../utils';

type GroupCardProps = {
  group: BookmarkGroup;
  onToggleGroup: (groupId: string) => void;
  onAddSubgroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, nextTitle: string) => void;
  onSetGroupColor: (groupId: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
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
  onSetSubgroupViewMode: (subgroupId: string, mode: BookmarkViewMode) => void;
  onSetSubgroupIconSize: (subgroupId: string, size: IconSize) => void;
  autoFocusEdit?: boolean;
  autoFocusSubgroupId?: string | null;
  onClearAutoFocus?: () => void;
};

const GROUP_COLOR_PRESETS = [
  // Gradients
  'linear-gradient(90deg, #8be3a6 0%, #68d694 100%)',
  'linear-gradient(90deg, #f8dd63 0%, #edd631 100%)',
  'linear-gradient(90deg, #d7a6ff 0%, #c886f4 100%)',
  'linear-gradient(90deg, #8fd7ff 0%, #5fb9ef 100%)',
  'linear-gradient(90deg, #ffc38f 0%, #ffa869 100%)',
  // Solids
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // amber
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
];

function readExternalBookmarkFromDrop(event: DragEvent) {
  const tabPayload = readTabDragPayload(event);
  if (tabPayload?.url) {
    return tabPayload;
  }
  const uriList = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain');
  if (!uriList) return null;
  const normalizedUrl = tryNormalizeUrl(uriList);
  if (!normalizedUrl) return null;
  return {
    title: normalizedUrl,
    url: normalizedUrl,
  };
}

function collectGroupUrls(group: BookmarkGroup): string[] {
  const urls: string[] = [];
  for (const b of group.bookmarks) urls.push(b.url);
  for (const sg of group.subgroups) {
    for (const b of sg.bookmarks) urls.push(b.url);
  }
  return urls;
}

function SubgroupEndNode({ groupId }: { groupId: string }) {
  const dndId = `subgroup-end|${groupId}`;
  const { setNodeRef } = useDroppable({
    id: dndId,
    data: { type: 'subgroup-end', target: { groupId } },
  });
  const { dropIndicator } = useDndUIStore();
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'subgroup';

  return (
    <div ref={setNodeRef} id={`dnd-${dndId}`} className="relative h-0">
      {isTarget ? (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

function GroupEmptyZone({
  groupId,
  onDropExternalBookmark,
}: {
  groupId: string;
  onDropExternalBookmark: (
    payload: { title: string; url: string },
  ) => void;
}) {
  const target: BookmarkContainerTarget = useMemo(() => ({ groupId, subgroupId: undefined }), [groupId]);
  const dndId = `bookmark-end|${groupId}|${undefined}`;
  const { setNodeRef } = useDroppable({
    id: dndId,
    data: { type: 'bookmark-end', target, index: 0 },
  });
  const { dropIndicator } = useDndUIStore();
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'bookmark';

  return (
    <div
      ref={setNodeRef}
      id={`dnd-${dndId}`}
      className={cn(
        'flex h-8 items-center rounded-md px-2 text-[11px] text-muted-foreground',
        isTarget && 'bg-primary/20',
      )}
      onDragOver={(event) => {
        const payload = readExternalBookmarkFromDrop(event);
        if (!payload) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        const payload = readExternalBookmarkFromDrop(event);
        if (!payload) return;
        event.preventDefault();
        event.stopPropagation();
        onDropExternalBookmark(target, payload);
      }}
    >
      暂无内容
    </div>
  );
}

function ColorPickerButton({ currentColor, onChange }: { currentColor: string; onChange: (color: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isCustom = !GROUP_COLOR_PRESETS.includes(currentColor);

  return (
    <button
      className="relative size-6 rounded-full transition-transform hover:scale-110"
      style={{ background: 'conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171)' }}
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.click();
      }}
      title="自定义颜色"
    >
      {isCustom && (
        <Check className="absolute inset-0 m-auto size-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
      )}
      <input
        ref={inputRef}
        type="color"
        className="sr-only"
        value={currentColor.startsWith('#') ? currentColor : '#94a3b8'}
        onChange={(e) => onChange(e.target.value)}
      />
    </button>
  );
}

export function GroupCard({
  group,
  onToggleGroup,
  onAddSubgroup,
  onRenameGroup,
  onSetGroupColor,
  onDeleteGroup,
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
  onSetSubgroupViewMode,
  onSetSubgroupIconSize,
  autoFocusEdit,
  autoFocusSubgroupId,
  onClearAutoFocus,
}: GroupCardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (autoFocusEdit) {
      setEditingTitle(true);
      setTitleDraft(group.title);
    }
  }, [autoFocusEdit, group.title]);

  const groupRootTarget = useMemo<BookmarkContainerTarget>(
    () => ({
      groupId: group.id,
      subgroupId: undefined,
    }),
    [group.id],
  );

  const commitRename = () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(group.title);
      setEditingTitle(false);
      return;
    }
    if (nextTitle !== group.title) {
      onRenameGroup(group.id, nextTitle);
    }
    setEditingTitle(false);
    onClearAutoFocus?.();
  };

  const dndId = `group|${group.id}`;
  const { activeId, dropIndicator } = useDndUIStore();

  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: dndId,
    data: { type: 'group', groupId: group.id, group },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: dndId,
    data: { type: 'group', groupId: group.id, group },
  });

  const isDragging = activeId === dndId;
  const isTarget = dropIndicator?.id === dndId && dropIndicator.type === 'group';

  return (
    <div className="relative flex flex-col">
      {isTarget && dropIndicator.zone === 'before' ? (
        <div className="pointer-events-none absolute bottom-2 -left-[7px] top-2 z-20 w-[2px] rounded-full bg-primary" />
      ) : null}

      <section
        ref={setDropRef}
        id={`dnd-${dndId}`}
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border border-border bg-card/50 shadow-sm transition-opacity',
          isDragging && 'opacity-50',
          group.collapsed && 'h-auto',
        )}
      >
        <header
          className={cn(
            'group/header flex min-h-10 items-center justify-between border-b border-border/50 px-2 py-0.5',
            !group.color && 'bg-muted/80',
          )}
          style={group.color ? { background: group.color } : undefined}
          onDragOver={(event) => {
            const externalPayload = readExternalBookmarkFromDrop(event);
            if (!externalPayload) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            const externalPayload = readExternalBookmarkFromDrop(event);
            if (!externalPayload) return;
            event.preventDefault();
            event.stopPropagation();
            onDropExternalBookmark(groupRootTarget, externalPayload);
          }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span
              ref={setDragRef}
              {...listeners}
              {...attributes}
              className="inline-flex size-5 cursor-grab items-center justify-center text-black/80"
              title="拖拽调整分组顺序"
            >
              <GripHorizontal className="size-4" />
            </span>
            <button
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-black/80 hover:bg-black/10 hover:text-black"
              onClick={() => onToggleGroup(group.id)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn('transition-transform', group.collapsed && '-rotate-90')}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  className="h-6 w-full rounded border border-black/20 bg-white/50 px-2 text-sm text-black outline-none ring-0 placeholder:text-black/50"
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRename();
                    } else if (event.key === 'Escape') {
                      setTitleDraft(group.title);
                      setEditingTitle(false);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  autoFocus
                />
              ) : (
                <h3
                  className="truncate px-1 text-sm font-semibold text-black cursor-text"
                  onClick={() => {
                    setTitleDraft(group.title);
                    setEditingTitle(true);
                  }}
                  title="点击重命名"
                >
                  {group.title}
                </h3>
              )}
            </div>
          </div>

          <div className={cn(
            'flex shrink-0 items-center justify-end gap-0.5 transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100',
          )}>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-black/80 hover:bg-black/10 hover:text-black"
              onClick={() => onOpenManualAdd(groupRootTarget)}
              title="添加书签"
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-black/80 hover:bg-black/10 hover:text-black"
              onClick={() => onOpenImportAdd(groupRootTarget)}
              title="从书签导入"
            >
              <FolderTree className="size-3.5" />
            </Button>
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'size-7 text-black/80 hover:bg-black/10 hover:text-black',
                    menuOpen && 'bg-black/10 text-black',
                  )}
                >
                  <MoreHorizontal className="size-4" />
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
                          group.viewMode === val
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
                {group.viewMode === 'icon' && (
                  <>
                    <DropdownMenuLabel className="pb-1 text-xs font-medium text-muted-foreground">图标尺寸</DropdownMenuLabel>
                    <div className="px-2 pb-2">
                      <div className="flex items-center rounded-md bg-muted p-0.5">
                        {([['sm', '小'], ['md', '中'], ['lg', '大']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            className={cn(
                              'flex flex-1 items-center justify-center rounded py-1 text-xs font-medium transition-all',
                              group.iconSize === val
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onAddSubgroup(group.id)}>
                  <FolderPlus className="mr-2 size-3.5" />
                  添加小组
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Palette className="mr-2 size-3.5" />
                    标题颜色
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="p-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {GROUP_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          className="relative size-6 rounded-full transition-transform hover:scale-110"
                          style={{ background: color }}
                          onClick={() => onSetGroupColor(group.id, color)}
                        >
                          {group.color === color && (
                            <Check className="absolute inset-0 m-auto size-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                          )}
                        </button>
                      ))}
                      <ColorPickerButton
                        currentColor={group.color}
                        onChange={(c) => onSetGroupColor(group.id, c)}
                      />
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={collectGroupUrls(group).length === 0}
                  onSelect={() => {
                    for (const url of collectGroupUrls(group)) browser.tabs.create({ url });
                  }}
                >
                  <ExternalLink className="mr-2 size-3.5" />
                  打开所有书签
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={collectGroupUrls(group).length === 0}
                  onSelect={() => browser.windows.create({ url: collectGroupUrls(group) })}
                >
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开所有
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={collectGroupUrls(group).length === 0}
                  onSelect={() => browser.windows.create({ url: collectGroupUrls(group), incognito: true })}
                >
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开所有
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onDeleteGroup(group.id)}>
                  <Trash2 className="mr-2 size-3.5" />
                  删除分组
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {!group.collapsed && (
          <div className="flex flex-1 flex-col p-2">
            {group.bookmarks.length === 0 && group.subgroups.length === 0 ? (
              <GroupEmptyZone
                groupId={group.id}
                onDropExternalBookmark={onDropExternalBookmark}
              />
            ) : (
              <>
                {group.viewMode === 'icon' ? (
                  <BookmarkIconGrid
                    bookmarks={group.bookmarks}
                    target={groupRootTarget}
                    iconSize={group.iconSize}
                    emptyHint=""
                    onEditBookmark={onOpenEditBookmark}
                    onDeleteBookmark={onDeleteBookmark}
                    onMoveBookmark={onMoveBookmark}
                    onDropExternalBookmark={onDropExternalBookmark}
                  />
                ) : (
                  <BookmarkRows
                    bookmarks={group.bookmarks}
                    target={groupRootTarget}
                    emptyHint=""
                    onEditBookmark={onOpenEditBookmark}
                    onDeleteBookmark={onDeleteBookmark}
                    onMoveBookmark={onMoveBookmark}
                    onDropExternalBookmark={onDropExternalBookmark}
                  />
                )}

                <div className={cn('flex flex-col gap-2 empty:hidden', group.bookmarks.length > 0 && 'mt-2')}>
                  {group.subgroups.map((subgroup) => (
                    <div key={subgroup.id} className="relative">
                      <SubgroupPanel
                        groupId={group.id}
                        subgroup={subgroup}
                        onToggleSubgroup={onToggleSubgroup}
                        onRenameSubgroup={onRenameSubgroup}
                        onDeleteSubgroup={onDeleteSubgroup}
                        onOpenManualAdd={onOpenManualAdd}
                        onOpenImportAdd={onOpenImportAdd}
                        onOpenEditBookmark={onOpenEditBookmark}
                        onDeleteBookmark={onDeleteBookmark}
                        onMoveBookmark={onMoveBookmark}
                        onDropExternalBookmark={onDropExternalBookmark}
                        onSetViewMode={(mode) => onSetSubgroupViewMode(subgroup.id, mode)}
                        onSetIconSize={(size) => onSetSubgroupIconSize(subgroup.id, size)}
                        autoFocusEdit={autoFocusSubgroupId === subgroup.id}
                        onClearAutoFocus={onClearAutoFocus}
                      />
                    </div>
                  ))}
                </div>
                {group.subgroups.length > 0 && <SubgroupEndNode groupId={group.id} />}
              </>
            )}
          </div>
        )}
      </section>

      {isTarget && dropIndicator.zone === 'after' ? (
        <div className="pointer-events-none absolute bottom-2 -right-[7px] top-2 z-20 w-[2px] rounded-full bg-primary" />
      ) : null}
    </div>
  );
}
