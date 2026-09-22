import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Check, LayoutGrid, Plus, ChevronDown, ChevronRight, GripVertical, GripHorizontal, Settings, Download, Upload, Columns, Pencil, Trash2, X, HelpCircle, Sliders, Search, Globe, Cloud } from 'lucide-react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  pointerWithin,
  type Modifier,
} from '@dnd-kit/core';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import { BookmarkFormDialog } from './components/BookmarkFormDialog';
import { BookmarkTreeDialog } from './components/BookmarkTreeDialog';
import { BrowserFolderPickerDialog } from './components/BrowserFolderPickerDialog';
import { IframeUrlPickerDialog } from './components/IframeUrlPickerDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GroupCard } from './components/GroupCard';
import { TabsEdgeDrawer } from './components/TabsEdgeDrawer';
import { SearchBar } from './components/SearchBar';
import { HelpDialog } from './components/HelpDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { WebDavBackupDialog } from './components/WebDavBackupDialog';
import { useDndUIStore } from './drag';
import type { BackupSettings, BookmarkContainerTarget, BookmarkNodeTarget } from './types';
import { useBoardStore } from './use-board-store';
import { useSettingsStore } from './use-settings-store';
import { createBackupPayload, parseBackupPayload } from './backup';
import {
  compareBackupSnapshots,
  createLocalBackupDiffSnapshot,
  parseBackupDiffSnapshot,
} from './backup-diff';
import { BROWSER_TREE_DEFAULT_MAX_ITEMS, IFRAME_DEFAULT_HEIGHT } from './constants';
import type { DndIndicator } from './drag';
import { FaviconImage } from './components/FaviconImage';

type BookmarkFormState = {
  open: boolean;
  mode: 'create' | 'edit';
  target: BookmarkContainerTarget | null;
  bookmarkId?: string;
  initialTitle?: string;
  initialUrl?: string;
};

type DeleteState =
  | { open: false }
  | { open: true; mode: 'group'; groupId: string; title: string }
  | { open: true; mode: 'subgroup'; target: { groupId: string; subgroupId: string }; title: string };

type DeleteSpaceState =
  | { open: false }
  | { open: true; spaceId: string; title: string };

const DEFAULT_FORM_STATE: BookmarkFormState = {
  open: false,
  mode: 'create',
  target: null,
};

function getTargetLabel(
  groups: ReturnType<typeof useBoardStore>['board']['groups'],
  target: BookmarkContainerTarget | null,
) {
  if (!target) {
    return undefined;
  }

  const group = groups.find((item) => item.id === target.groupId);
  if (!group) {
    return undefined;
  }

  if (!target.subgroupId) {
    return `${group.title}`;
  }

  const subgroup = group.subgroups.find((item) => item.id === target.subgroupId);
  if (!subgroup) {
    return undefined;
  }
  return `${group.title} / ${subgroup.title}`;
}

type GroupDropTarget = { id: string; zone: 'before' | 'after' };
type GroupDragCandidate = { id: string; rect: DOMRect };
type GroupDragRow = { top: number; bottom: number; items: GroupDragCandidate[] };

const GROUP_ROW_TOP_TOLERANCE = 4;

function getVerticalDistanceToRow(row: GroupDragRow, y: number) {
  if (y < row.top) return row.top - y;
  if (y > row.bottom) return y - row.bottom;
  return 0;
}

function resolveGroupDropTarget(pointer: { x: number; y: number }, activeId: string): GroupDropTarget | null {
  const activeDomId = `dnd-${activeId}`;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[id^="dnd-group|"]'))
    .filter((el) => el.id !== activeDomId)
    .map((el) => ({ id: el.id.slice(4), rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);

  if (candidates.length === 0) {
    return null;
  }

  const rows: GroupDragRow[] = [];
  for (const item of candidates.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)) {
    const row = rows.find((candidateRow) => Math.abs(candidateRow.top - item.rect.top) <= GROUP_ROW_TOP_TOLERANCE);
    if (!row) {
      rows.push({ top: item.rect.top, bottom: item.rect.bottom, items: [item] });
      continue;
    }
    row.top = Math.min(row.top, item.rect.top);
    row.bottom = Math.max(row.bottom, item.rect.bottom);
    row.items.push(item);
  }

  let bestRow = rows[0];
  let bestRowDistance = getVerticalDistanceToRow(bestRow, pointer.y);
  let bestRowCenterDistance = Math.abs(pointer.y - (bestRow.top + bestRow.bottom) / 2);

  for (const row of rows.slice(1)) {
    const distance = getVerticalDistanceToRow(row, pointer.y);
    const centerDistance = Math.abs(pointer.y - (row.top + row.bottom) / 2);
    if (distance < bestRowDistance || (distance === bestRowDistance && centerDistance < bestRowCenterDistance)) {
      bestRow = row;
      bestRowDistance = distance;
      bestRowCenterDistance = centerDistance;
    }
  }

  let bestItem = bestRow.items[0];
  let bestItemDistance = Math.abs(pointer.x - (bestItem.rect.left + bestItem.rect.width / 2));
  for (const item of bestRow.items.slice(1)) {
    const centerX = item.rect.left + item.rect.width / 2;
    const distance = Math.abs(pointer.x - centerX);
    if (distance < bestItemDistance) {
      bestItem = item;
      bestItemDistance = distance;
    }
  }

  const centerX = bestItem.rect.left + bestItem.rect.width / 2;
  return { id: bestItem.id, zone: pointer.x > centerX ? 'after' : 'before' };
}

/** Wrapper that passes correct size to DragOverlay depending on target container style */
const SmartDragOverlay = () => {
  const { overContainerData, activeData } = useDndUIStore();
  const wantsIconGrid = overContainerData != null
    ? overContainerData.isIconGrid
    : !!(activeData?.isIconGrid);

  // Refs let the modifier closure always read the latest values without recreating on every render
  const wantsIconGridRef = useRef(false);
  wantsIconGridRef.current = wantsIconGrid;
  const iconSizeRef = useRef<string>('md');
  iconSizeRef.current = overContainerData?.iconSize ?? (activeData?.iconSize as string | undefined) ?? 'md';
  const overContainerDataRef = useRef(overContainerData);
  overContainerDataRef.current = overContainerData;
  const activeDataRef = useRef(activeData);
  activeDataRef.current = activeData;

  // Re-anchor overlay center under cursor whenever the overlay morphs to a different size/shape.
  // dnd-kit keeps the original grab offset (cursor at grabX, grabY from source top-left).
  // After morphing, that offset is wrong because the new element has different dimensions.
  const anchorModifier: Modifier = useCallback(
    ({ transform, activatorEvent, activeNodeRect }) => {
      const ev = activatorEvent as MouseEvent | null;
      if (!ev || !('clientX' in ev) || !activeNodeRect) return transform;
      const grabX = ev.clientX - activeNodeRect.left;
      const grabY = ev.clientY - activeNodeRect.top;

      if (wantsIconGridRef.current) {
        // Morphed to icon grid: center cursor on the small icon cell
        const sz = iconSizeRef.current;
        const halfW = sz === 'sm' ? 16 : sz === 'md' ? 28 : 32;  // (32|56|64) / 2
        const halfH = sz === 'sm' ? 14 : sz === 'md' ? 27 : 33;  // approx height / 2
        return { ...transform, x: transform.x + grabX - halfW, y: transform.y + grabY - halfH };
      }

      const ocd = overContainerDataRef.current;
      if (ocd != null && !ocd.isIconGrid) {
        const ad = activeDataRef.current;
        // Row → Row: same geometry, no re-anchoring needed
        if (ad?.isIconGrid === false) return transform;
        // Icon → Row: anchor both X (center across row width) and Y
        if (ad?.isIconGrid === true) {
          const halfW = (ocd.containerWidth ?? activeNodeRect.width) / 2;
          const halfH = 12;
          return { ...transform, x: transform.x + grabX - halfW, y: transform.y + grabY - halfH };
        }
        // Sidebar (tab) → Row: anchor Y only, X is already reasonable
        const halfH = 12;
        return { ...transform, y: transform.y + grabY - halfH };
      }

      return transform;
    },
    [],
  );

  return (
    // width/height auto: release dnd-kit's locked source-element size so content controls its own dimensions
    <DragOverlay dropAnimation={null} style={{ width: 'auto', height: 'auto' }} modifiers={[anchorModifier]}>
      <DragOverlayContent />
    </DragOverlay>
  );
};

const DragOverlayContent = () => {
  const { activeData, overlayWidth, overContainerData } = useDndUIStore();
  if (!activeData) return null;
  const widthStyle = overlayWidth ? { width: overlayWidth } : undefined;

  if (activeData.type === 'tab') {
    const tab = activeData.tab;
    // Default sidebar style (not hovering any container)
    // Apply the captured native width so the overlay matches the original button width.
    const tabDefaultWidth = activeData.nativeWidth ?? overlayWidth ?? undefined;
    // Hovering over an icon-grid container → morph to icon style
    if (overContainerData?.isIconGrid) {
      const sz = overContainerData.iconSize ?? 'md';
      const iconCls = sz === 'sm' ? 'size-4' : sz === 'md' ? 'size-6' : 'size-8';
      const showLabel = sz !== 'sm';
      const textCls = sz === 'md' ? 'text-[8px]' : 'text-[10px]';
      const w = sz === 'sm' ? 32 : sz === 'md' ? 56 : 64;
      return (
        <div className="overflow-hidden flex flex-col items-center gap-1 rounded-md p-1.5 bg-card border border-border/50 shadow-lg" style={{ width: w }}>
          <FaviconImage url={tab.url} className={cn(iconCls, 'shrink-0 rounded-[4px]')} />
          {showLabel && (
            <span className={cn('w-full truncate text-center text-foreground leading-tight', textCls)}>{tab.title}</span>
          )}
        </div>
      );
    }
    // Hovering over a row-list container → morph to row-bookmark style
    if (overContainerData != null && !overContainerData.isIconGrid) {
      const w = overContainerData.containerWidth ?? overlayWidth ?? undefined;
      return (
        <div style={{ width: w }} className="grid grid-cols-[16px_1fr] items-center gap-2 rounded-md px-2 py-1 text-[13px] bg-card border border-border/50 shadow-lg">
          <FaviconImage url={tab.url} className="size-3.5 rounded-[3px]" />
          <span className="truncate text-foreground">{tab.title}</span>
        </div>
      );
    }
    return (
      <div style={{ width: tabDefaultWidth }} className="flex shrink-0 items-center gap-2.5 rounded-lg py-1.5 px-1.5 bg-card border border-border/40 shadow-lg">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm">
          <FaviconImage url={tab.url} className="size-4 rounded-[3px] object-contain" />
        </span>
        <span className="min-w-0 truncate text-[12px] text-foreground/85 whitespace-nowrap pr-1">{tab.title}</span>
      </div>
    );
  }

  if (activeData.type === 'bookmark') {
    const bm = activeData.bookmark;
    // Target container drives the appearance; fall back to source if not hovering any container
    const targetIsIconGrid = overContainerData != null ? overContainerData.isIconGrid : !!(activeData.isIconGrid);
    const targetIconSize: string = (overContainerData?.iconSize) ?? activeData.iconSize ?? 'md';

    if (targetIsIconGrid) {
      const iconCls = targetIconSize === 'sm' ? 'size-4' : targetIconSize === 'md' ? 'size-6' : 'size-8';
      const showLabel = targetIconSize !== 'sm';
      const textCls = targetIconSize === 'md' ? 'text-[8px]' : 'text-[10px]';
      // Fixed width = exact icon cell size → parent bounded so truncate works on long titles
      const w = targetIconSize === 'sm' ? 32 : targetIconSize === 'md' ? 56 : 64;
      return (
        <div className="overflow-hidden flex flex-col items-center gap-1 rounded-md p-1.5 bg-card border border-border/50 shadow-lg" style={{ width: w }}>
          <FaviconImage url={bm.url} className={cn(iconCls, 'shrink-0 rounded-[4px]')} />
          {showLabel && (
            <span className={cn('w-full truncate text-center text-foreground leading-tight', textCls)}>{bm.title}</span>
          )}
        </div>
      );
    }
    // Row style: use target container's measured width, fall back to source element width
    const rowWidth = overContainerData?.containerWidth ?? overlayWidth ?? undefined;
    return (
      <div style={{ width: rowWidth }} className="grid grid-cols-[16px_1fr] items-center gap-2 rounded-md px-2 py-1 text-[13px] bg-card border border-border/50 shadow-lg">
        <FaviconImage url={bm.url} className="size-3.5 rounded-[3px]" />
        <span className="truncate text-foreground">{bm.title}</span>
      </div>
    );
  }

  if (activeData.type === 'subgroup') {
    const subgroup = activeData.subgroup;
    return (
      <div style={widthStyle} className="rounded-lg border border-border/70 bg-card px-1.5 py-1 shadow-lg">
        <div className="flex min-h-6 items-center gap-0.5 px-0.5">
          <span className="inline-flex size-5 items-center justify-center text-muted-foreground">
            <GripVertical className="size-3.5" />
          </span>
          <span className="inline-flex size-5 items-center justify-center">
            {subgroup.collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </span>
          <p className="truncate text-xs font-semibold text-foreground">{subgroup.title}</p>
        </div>
      </div>
    );
  }

  if (activeData.type === 'group') {
    const group = activeData.group;
    return (
      <div style={widthStyle} className={cn('flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg', group.collapsed && 'h-auto')}>
        <header
          className={cn('flex min-h-10 items-center gap-1.5 px-2 py-0.5', !group.color && 'bg-muted/80')}
          style={group.color ? { background: group.color } : undefined}
        >
          <span className="inline-flex size-5 items-center justify-center text-black/80">
            <GripHorizontal className="size-4" />
          </span>
          <span className="inline-flex size-5 items-center justify-center text-black/80">
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={cn('transition-transform', group.collapsed && '-rotate-90')}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <h3 className="truncate px-1 text-sm font-semibold text-black">{group.title}</h3>
        </header>
      </div>
    );
  }

  if (activeData.type === 'space') {
    return (
      <div className="rounded-md px-3 py-1.5 text-[13px] font-medium bg-card border border-border/50 shadow-lg text-primary whitespace-nowrap">
        {activeData.spaceTitle}
      </div>
    );
  }

  return null;
};

// ── SpaceTab ────────────────────────────────────────────────────────────

function SpaceTab({
  id,
  title,
  active,
  isOnly,
  autoFocus,
  onSwitch,
  onRename,
  onDelete,
  onAutoFocusDone,
  spaceColumns,
  globalColumns,
  onSetSpaceColumns,
  spaceShowSearch,
  globalShowSearch,
  onSetSpaceShowSearch,
  spaceIframeAutoRun,
  globalIframeAutoRun,
  onSetSpaceIframeAutoRun,
}: {
  id: string;
  title: string;
  active: boolean;
  isOnly: boolean;
  autoFocus?: boolean;
  onSwitch: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onAutoFocusDone?: () => void;
  spaceColumns?: 'auto' | 1 | 2 | 3 | 4 | 5 | 6;
  globalColumns: 'auto' | 1 | 2 | 3 | 4 | 5 | 6;
  onSetSpaceColumns: (id: string, cols: 'auto' | 1 | 2 | 3 | 4 | 5 | 6 | undefined) => void;
  spaceShowSearch?: boolean;
  globalShowSearch: boolean;
  onSetSpaceShowSearch: (id: string, show: boolean | undefined) => void;
  spaceIframeAutoRun?: boolean;
  globalIframeAutoRun: boolean;
  onSetSpaceIframeAutoRun: (id: string, autoRun: boolean | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameAfterMenuCloseRef = useRef(false);
  const pendingSelectRef = useRef(false);

  // dnd-kit draggable + droppable
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `space|${id}`,
    data: { type: 'space', spaceId: id, spaceTitle: title },
  });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `space|${id}`,
    data: { type: 'space', spaceId: id },
  });
  const mergedRef = useCallback(
    (node: HTMLButtonElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  const dropIndicator = useDndUIStore((s) => s.dropIndicator);
  const showBefore = dropIndicator?.type === 'space' && dropIndicator.id === `space|${id}` && dropIndicator.zone === 'before';
  const showAfter = dropIndicator?.type === 'space' && dropIndicator.id === `space|${id}` && dropIndicator.zone === 'after';

  const focusEditInput = useCallback((node = inputRef.current) => {
    if (!node) {
      return false;
    }
    node.focus({ preventScroll: true });
    node.select();
    return true;
  }, []);

  const setInputNode = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (node && pendingSelectRef.current && focusEditInput(node)) {
      pendingSelectRef.current = false;
    }
  }, [focusEditInput]);

  const startEditing = useCallback(() => {
    setEditValue(title);
    pendingSelectRef.current = true;
    setEditing(true);
  }, [title]);

  const requestRenameFromMenu = useCallback(() => {
    renameAfterMenuCloseRef.current = true;
  }, []);

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    setContextMenuOpen(open);
  }, []);

  // Enter edit mode when autoFocus is requested (e.g. after addSpace)
  useEffect(() => {
    if (autoFocus) {
      setEditValue(title);
      pendingSelectRef.current = true;
      setEditing(true);
      onAutoFocusDone?.();
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus + select all once the input is mounted.
  useLayoutEffect(() => {
    if (editing && pendingSelectRef.current && focusEditInput()) {
      pendingSelectRef.current = false;
    }
  }, [editing, focusEditInput]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(id, trimmed);
    }
    setEditing(false);
  }, [editValue, title, id, onRename]);

  const handleInputBlur = useCallback(() => {
    commitEdit();
  }, [commitEdit]);

  return (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <button
          ref={mergedRef}
          {...attributes}
          {...listeners}
          id={`dnd-space|${id}`}
          type="button"
          title={!editing ? '双击重命名' : undefined}
          onClick={() => {
            if (!editing) onSwitch(id);
          }}
          onDoubleClick={() => {
            if (!editing) startEditing();
          }}
          className={cn(
            'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors select-none whitespace-nowrap',
            active
              ? 'bg-primary/12 text-primary'
              : contextMenuOpen
                ? 'bg-muted/60 text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            isDragging && 'opacity-40',
          )}
        >
          {/* vertical drop indicator — before */}
          {showBefore && (
            <span className="absolute -left-[3px] top-1 bottom-1 w-[3px] rounded-full bg-primary" />
          )}
          {editing ? (
            <input
              ref={setInputNode}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitEdit();
                }
                if (e.key === 'Escape') {
                  setEditing(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="w-20 bg-transparent outline-none border-b border-primary/40 text-[13px] font-medium"
            />
          ) : (
            <span className="truncate max-w-[120px]">{title}</span>
          )}
          {/* vertical drop indicator — after */}
          {showAfter && (
            <span className="absolute -right-[3px] top-1 bottom-1 w-[3px] rounded-full bg-primary" />
          )}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-44"
        onCloseAutoFocus={(event) => {
          if (renameAfterMenuCloseRef.current) {
            event.preventDefault();
            flushSync(() => {
              startEditing();
            });
            focusEditInput();
            pendingSelectRef.current = false;
            renameAfterMenuCloseRef.current = false;
          }
        }}
      >
        <ContextMenuItem onSelect={requestRenameFromMenu}>
          <Pencil className="mr-2 size-3.5" />
          重命名
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isOnly}
          onSelect={() => onDelete(id)}
        >
          <Trash2 className="mr-2 size-3.5" />
          删除
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Columns className="mr-2 size-3.5" />
            列数
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onSelect={() => onSetSpaceColumns(id, undefined)}
              className="flex items-center justify-between gap-4"
            >
              跟随全局（{globalColumns === 'auto' ? '自适应' : `${globalColumns} 列`}）
              {spaceColumns === undefined && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onSetSpaceColumns(id, 'auto')}
              className="flex items-center justify-between gap-4"
            >
              自适应
              {spaceColumns === 'auto' && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            {([1, 2, 3, 4, 5, 6] as const).map((col) => (
              <ContextMenuItem
                key={col}
                onSelect={() => onSetSpaceColumns(id, col)}
                className="flex items-center justify-between gap-4"
              >
                固定 {col} 列
                {spaceColumns === col && <Check className="size-4 opacity-50" />}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Search className="mr-2 size-3.5" />
            搜索栏
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onSelect={() => onSetSpaceShowSearch(id, undefined)}
              className="flex items-center justify-between gap-4"
            >
              跟随全局（{globalShowSearch ? '显示' : '隐藏'}）
              {spaceShowSearch === undefined && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onSetSpaceShowSearch(id, true)}
              className="flex items-center justify-between gap-4"
            >
              显示
              {spaceShowSearch === true && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onSetSpaceShowSearch(id, false)}
              className="flex items-center justify-between gap-4"
            >
              隐藏
              {spaceShowSearch === false && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Globe className="mr-2 size-3.5" />
            iframe 自动运行
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem
              onSelect={() => onSetSpaceIframeAutoRun(id, undefined)}
              className="flex items-center justify-between gap-4"
            >
              跟随全局（{globalIframeAutoRun ? '自动' : '手动'}）
              {spaceIframeAutoRun === undefined && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => onSetSpaceIframeAutoRun(id, true)}
              className="flex items-center justify-between gap-4"
            >
              自动运行
              {spaceIframeAutoRun === true && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onSetSpaceIframeAutoRun(id, false)}
              className="flex items-center justify-between gap-4"
            >
              手动运行
              {spaceIframeAutoRun === false && <Check className="size-4 opacity-50" />}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ── App ───────────────────────────────────────────────────────────────

export default function App() {
  const {
    board,
    loading,
    spaces,
    activeSpaceId,
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
    setGroupBrowserTreeConfig,
    setGroupIframeConfig,
    addSubgroup,
    renameSubgroup,
    deleteSubgroup,
    restoreSubgroup,
    moveSubgroupBefore,
    moveSubgroupToEnd,
    toggleSubgroup,
    setSubgroupViewMode,
    setSubgroupIconSize,
    addBookmark,
    insertBookmark,
    editBookmark,
    removeBookmark,
    restoreBookmark,
    moveBookmark,
    importSpaceStore,
    spaceStore,
    moveGroupToSpace,
    moveSubgroupToSpace,
    moveBookmarkToSpace,
  } = useBoardStore();

  const {
    settings,
    updateSettings,
    addSearchEngine,
    updateSearchEngine,
    deleteSearchEngine,
    resetSearchEngines,
    setActiveSearchEngine,
    reorderSearchEngines,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
    importSettings,
  } = useSettingsStore();

  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [webDavDialogOpen, setWebDavDialogOpen] = useState(false);

  const [formState, setFormState] = useState<BookmarkFormState>(DEFAULT_FORM_STATE);
  const [treeDialogTarget, setTreeDialogTarget] = useState<BookmarkContainerTarget | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>({ open: false });
  const [deleteSpaceState, setDeleteSpaceState] = useState<DeleteSpaceState>({ open: false });

  const [columns, setColumnsState] = useState<'auto' | 1 | 2 | 3 | 4 | 5 | 6>(() => {
    const saved = localStorage.getItem('newtab-pro:columns');
    if (saved === 'auto') return 'auto';
    const n = Number(saved);
    return ([1, 2, 3, 4, 5, 6] as const).includes(n as any) ? (n as 1 | 2 | 3 | 4 | 5 | 6) : 'auto';
  });
  const setColumns = (v: 'auto' | 1 | 2 | 3 | 4 | 5 | 6) => {
    setColumnsState(v);
    localStorage.setItem('newtab-pro:columns', String(v));
  };
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [autoEditGroupId, setAutoEditGroupId] = useState<string | null>(null);
  const [autoEditSubgroupId, setAutoEditSubgroupId] = useState<string | null>(null);
  const [autoEditSpaceId, setAutoEditSpaceId] = useState<string | null>(null);
  const [browserFolderPickerGroupId, setBrowserFolderPickerGroupId] = useState<string | null>(null);
  const [iframeUrlPickerTarget, setIframeUrlPickerTarget] = useState<{ spaceId: string; groupId: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchBarInputRef = useRef<HTMLInputElement>(null);
  const dragSwitchRef = useRef<{ startX: number; startY: number; switched: boolean } | null>(null);
  const addGroupAfterContextMenuCloseRef = useRef(false);

  const applyBackupData = useCallback(
    (raw: unknown) => {
      const parsed = parseBackupPayload(raw);
      if (!parsed) {
        throw new Error('版本不匹配或文件格式错误');
      }
      importSpaceStore(parsed.spaceStore);
      if (parsed.settings) {
        importSettings(parsed.settings, { preserveBackup: true });
      }
      return parsed;
    },
    [importSettings, importSpaceStore],
  );

  const handleManualBackup = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WEBDAV_UPLOAD',
        config: settings.backup,
        payload: createBackupPayload(spaceStore, settings),
      });

      if (!response?.success) {
        const errorMessage = response?.error || '备份上传失败';
        updateSettings({
          backup: {
            ...settings.backup,
            lastBackupError: errorMessage,
          },
        });
        toast('备份失败', { description: errorMessage });
        return;
      }

      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupAt: response.uploadedAt,
          lastBackupError: undefined,
        },
      });
      toast('备份成功', { description: settings.backup.remotePath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '备份上传失败';
      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupError: errorMessage,
        },
      });
      toast('备份失败', { description: errorMessage });
    }
  }, [settings, spaceStore, updateSettings]);

  const handleManualRestore = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WEBDAV_DOWNLOAD',
        config: settings.backup,
      });

      if (!response?.success) {
        const errorMessage = response?.error || '备份下载失败';
        updateSettings({
          backup: {
            ...settings.backup,
            lastBackupError: errorMessage,
          },
        });
        toast('恢复失败', { description: errorMessage });
        return;
      }

      const parsed = applyBackupData(response.payload);
      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupError: undefined,
        },
      });
      toast('恢复成功', {
        description: parsed.exportedAt
          ? `已覆盖本地数据，备份时间 ${new Date(parsed.exportedAt).toLocaleString('zh-CN')}`
          : '已覆盖本地数据',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '恢复失败';
      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupError: errorMessage,
        },
      });
      toast('恢复失败', { description: errorMessage });
    }
  }, [applyBackupData, settings.backup, updateSettings]);

  const handleOpenRemoteBackupDiff = useCallback(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WEBDAV_DOWNLOAD',
        config: settings.backup,
      });

      if (!response?.success) {
        throw new Error(response?.error || '备份下载失败');
      }

      const localSnapshot = createLocalBackupDiffSnapshot(spaceStore, settings);
      const remoteSnapshot = parseBackupDiffSnapshot(response.payload);

      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupError: undefined,
        },
      });

      return compareBackupSnapshots(localSnapshot, remoteSnapshot);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '读取云端差异失败';
      updateSettings({
        backup: {
          ...settings.backup,
          lastBackupError: errorMessage,
        },
      });
      toast('读取云端差异失败', { description: errorMessage });
      throw error;
    }
  }, [settings, spaceStore, updateSettings]);

  const handleTestWebDavConnection = useCallback(async (config: BackupSettings) => {
    const response = await browser.runtime.sendMessage({
      type: 'WEBDAV_TEST',
      config,
    });

    if (!response?.success) {
      throw new Error(response?.error || '测试连接失败');
    }
  }, []);

  const handleSaveBackupAccount = useCallback(
    (nextBackup: BackupSettings) => {
      updateSettings({
        backup: {
          ...nextBackup,
          lastBackupError: undefined,
        },
      });
    },
    [updateSettings],
  );

  const handleRemoveBackupAccount = useCallback(() => {
    updateSettings({
      backup: {
        ...settings.backup,
        webdavUrl: '',
        username: '',
        password: '',
        remotePath: 'newtab-pro/backup.json',
        autoBackupEnabled: false,
        lastBackupAt: undefined,
        lastBackupError: undefined,
      },
    });
  }, [settings.backup, updateSettings]);

  const handleUpdateBackupSettings = useCallback(
    (partial: Partial<BackupSettings>) => {
      updateSettings({
        backup: {
          ...settings.backup,
          ...partial,
        },
      });
    },
    [settings.backup, updateSettings],
  );

  useEffect(() => {
    const pokeAutoBackup = () => {
      void browser.runtime.sendMessage({ type: 'AUTO_BACKUP_POKE' }).catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pokeAutoBackup();
      }
    };

    pokeAutoBackup();
    window.addEventListener('online', pokeAutoBackup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', pokeAutoBackup);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ── Space keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const parseShortcut = (shortcut: string) => {
      const parts = shortcut.toLowerCase().split('+').map((p) => p.trim());
      const key = parts.find((p) => !['alt', 'shift', 'ctrl', 'meta'].includes(p)) ?? '';
      return {
        key,
        alt: parts.includes('alt'),
        shift: parts.includes('shift'),
        ctrl: parts.includes('ctrl'),
        meta: parts.includes('meta'),
      };
    };

    const nextShortcut = parseShortcut(settings.spaceNextShortcut);
    const prevShortcut = parseShortcut(settings.spacePrevShortcut);

    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

      const key = e.key.toLowerCase();
      const matchNext =
        key === nextShortcut.key &&
        e.altKey === nextShortcut.alt &&
        e.shiftKey === nextShortcut.shift &&
        e.ctrlKey === nextShortcut.ctrl;
      const matchPrev =
        key === prevShortcut.key &&
        e.altKey === prevShortcut.alt &&
        e.shiftKey === prevShortcut.shift &&
        e.ctrlKey === prevShortcut.ctrl;

      if (matchNext || matchPrev) {
        e.preventDefault();
        const currentIndex = spaces.findIndex((s) => s.id === activeSpaceId);
        if (currentIndex === -1) return;
        const nextIndex = matchNext
          ? (currentIndex + 1) % spaces.length
          : (currentIndex - 1 + spaces.length) % spaces.length;
        switchSpace(spaces[nextIndex].id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settings.spaceNextShortcut, settings.spacePrevShortcut, spaces, activeSpaceId, switchSpace]);

  // ── “/” 键聊焦搜索框 ────────────────────────────────────
  // ── effectiveShowSearch: 当前 Space 覆盖值，fallback 全局 ──────────────
  const _activeSpaceForSearch = spaces.find((s) => s.id === activeSpaceId);
  const effectiveShowSearch =
    _activeSpaceForSearch?.showSearch !== undefined
      ? _activeSpaceForSearch.showSearch
      : settings.showSearchBar;

  // ── "/" 键聊焦搜索框 ────────────────────────────────────
  useEffect(() => {
    if (!effectiveShowSearch) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      searchBarInputRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShowSearch]);

  // ── Board drag to switch Space ────────────────────────────────────
  const handleBoardPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if (spaces.length <= 1) return;
    const target = e.target as HTMLElement;
    // 输入框/可编辑元素内的指针按下不触发 Space 切换（防止选择文本时误触发）
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
    // 菜单/对话框 portal 通过 React 事件冒泡到此，需额外过滤
    if (target.closest('[role="menu"]') || target.closest('[role="dialog"]')) return;
    if (target.closest('[data-group-card]')) return;
    if (target.closest('[data-no-drag-switch]')) return;
    dragSwitchRef.current = { startX: e.clientX, startY: e.clientY, switched: false };
    // Prevent text selection as soon as drag intent begins
    document.body.style.userSelect = 'none';
  }, [spaces.length]);

  const handleBoardPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const state = dragSwitchRef.current;
    if (!state || state.switched) return;
    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    // If vertical movement dominates, cancel — user is scrolling
    if (Math.abs(deltaY) > Math.abs(deltaX) + 8) {
      dragSwitchRef.current = null;
      document.body.style.userSelect = '';
      return;
    }
    if (Math.abs(deltaX) < 48) return;
    state.switched = true;
    document.body.style.userSelect = '';
    const currentIndex = spaces.findIndex((s) => s.id === activeSpaceId);
    if (currentIndex === -1) return;
    const nextIndex = deltaX < 0
      ? (currentIndex + 1) % spaces.length
      : (currentIndex - 1 + spaces.length) % spaces.length;
    switchSpace(spaces[nextIndex].id);
    dragSwitchRef.current = null;
  }, [spaces, activeSpaceId, switchSpace]);

  const handleBoardPointerUp = useCallback(() => {
    dragSwitchRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  const formTargetLabel = useMemo(
    () => getTargetLabel(board.groups, formState.target),
    [board.groups, formState.target],
  );
  const treeTargetLabel = useMemo(
    () => getTargetLabel(board.groups, treeDialogTarget),
    [board.groups, treeDialogTarget],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );
  const { activeId, activeData, setActiveDrag, setDropIndicator, setOverContainerData } = useDndUIStore();
  const dropIndicatorRef = useRef<DndIndicator>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handler, { passive: true });
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handler);
      window.removeEventListener('pointerdown', handler);
    };
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    let width: number | null = null;
    let activeDragData = data;

    if (data?.type === 'tab') {
      const bookmarkEl = document.querySelector('[id^="dnd-bookmark|"]');
      width = bookmarkEl?.getBoundingClientRect().width ?? null;
      // Capture the tab button's own width for the default (non-morphed) overlay
      const tabEl = document.getElementById(`dnd-${event.active.id}`);
      const tabNativeWidth = tabEl?.getBoundingClientRect().width ?? null;
      if (tabNativeWidth) activeDragData = { ...data, nativeWidth: tabNativeWidth };
    } else {
      const el = document.getElementById(`dnd-${event.active.id}`);
      width = el?.getBoundingClientRect().width ?? null;
    }

    setActiveDrag(String(event.active.id), activeDragData, width);
    dropIndicatorRef.current = null;
    document.body.classList.add('dragging');
    if (data?.type === 'bookmark' || data?.type === 'tab' || data?.type === 'space') {
      document.body.classList.add('dragging-pointer');
    } else if (data?.type === 'group' || data?.type === 'subgroup') {
      document.body.classList.add('dragging-grab');
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;

    if (!activeData) return;

    // Group cards are laid out in a CSS grid, so resolve the visual row from
    // pointer Y first, then resolve before/after inside that row from pointer X.
    if (activeData.type === 'group') {
      const target = resolveGroupDropTarget(pointerRef.current, String(active.id));
      if (target) {
        const ind = { id: target.id, zone: target.zone, type: 'group' as const };
        if (dropIndicatorRef.current?.id !== ind.id || dropIndicatorRef.current?.zone !== ind.zone) {
          setDropIndicator((dropIndicatorRef.current = ind));
        }
      } else {
        setDropIndicator((dropIndicatorRef.current = null));
      }
      return;
    }

    // ── subgroup drag: compute indicator purely from DOM position (Y axis) ──
    // Only consider sibling subgroups in the SAME parent group to avoid
    // cross-group indicator placement.
    if (activeData.type === 'subgroup') {
      const py = pointerRef.current.y;
      const draggedDomId = `dnd-${String(active.id)}`;
      const activeGroupId = String(active.id).split('|')[1] ?? '';
      const els = Array.from(document.querySelectorAll(`[id^="dnd-subgroup|${activeGroupId}|"]`)) as HTMLElement[];
      let bestId: string | null = null;
      let bestZone: 'before' | 'after' = 'before';
      let bestDist = Infinity;
      for (const el of els) {
        if (el.id === draggedDomId) continue;
        const rect = el.getBoundingClientRect();
        const cy = rect.top + rect.height / 2;
        const dist = Math.abs(py - cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.id.slice(4);
          bestZone = py > cy ? 'after' : 'before';
        }
      }
      if (bestId) {
        const ind = { id: bestId, zone: bestZone, type: 'subgroup' as const };
        if (dropIndicatorRef.current?.id !== ind.id || dropIndicatorRef.current?.zone !== ind.zone) {
          setDropIndicator((dropIndicatorRef.current = ind));
        }
      }
      return;
    }

    if (!over) {
      setDropIndicator((dropIndicatorRef.current = null));
      setOverContainerData(null);
      return;
    }
    if (active.id === over.id) {
      setDropIndicator((dropIndicatorRef.current = null));
      return;
    }

    const overData = over.data.current;
    if (!overData) return;

    if (activeData.type === 'bookmark' || activeData.type === 'tab') {
      if (overData.type === 'bookmark-container') {
        // Pointer is over the container div — either in a gap between items or in the
        // empty trailing cells of the last row (grid not fully filled).
        // Always resolve the indicator to "after last bookmark" so that moving from
        // right-to-left into the empty area also shows the drop line.
        const containerWidth = Math.round(over.rect.width);
        setOverContainerData({ isIconGrid: !!overData.isIconGrid, iconSize: overData.iconSize, containerWidth });

        if (overData.isIconGrid) {
          // Parse "bookmark-container|groupId|subgroupId" from over.id
          const cParts = String(over.id).split('|');
          const cGroupId = cParts[1] ?? '';
          const cRawSg = cParts[2] ?? '';

          // Pointer landed in a gap (no individual droppable hit).
          // Three sub-cases handled in priority order:
          //   1. Same-row icons exist AND pointer is to the right of all of them
          //      → trailing empty cells → "after" rightmost icon in that row.
          //   2. Same-row icons exist, pointer is between them
          //      → nearest by X + before/after (no dead zones).
          //   3. Pointer is in the vertical gap between rows
          //      → nearest by Euclidean distance + X-based before/after.
          const prefix = `dnd-bookmark|${cGroupId}|${cRawSg}|`;
          const draggedDomId = `dnd-${String(active.id)}`;
          const px = pointerRef.current.x;
          const py = pointerRef.current.y;
          const iconEls = Array.from(document.querySelectorAll(`[id^="${prefix}"]`)) as HTMLElement[];
          const eligible = iconEls.filter(el => el.id !== draggedDomId);

          if (eligible.length === 0) {
            setDropIndicator((dropIndicatorRef.current = null));
          } else {
            // Icons whose rect vertically contains the pointer Y
            const sameRow = eligible.filter(el => {
              const r = el.getBoundingClientRect();
              return py >= r.top && py <= r.bottom;
            });

            let bestId: string | null = null;
            let bestZone: 'before' | 'after' = 'after';

            if (sameRow.length > 0) {
              // Find rightmost icon in this row
              let rightmost = sameRow[0];
              for (const el of sameRow) {
                if (el.getBoundingClientRect().right > rightmost.getBoundingClientRect().right) {
                  rightmost = el;
                }
              }
              if (px > rightmost.getBoundingClientRect().right) {
                // Case 1: trailing empty space → after the rightmost icon in this row
                bestId = rightmost.id.slice(4);
                bestZone = 'after';
              } else {
                // Case 2: gap between icons in same row → nearest by X
                let bestDist = Infinity;
                for (const el of sameRow) {
                  const cx = el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
                  const dist = Math.abs(px - cx);
                  if (dist < bestDist) {
                    bestDist = dist;
                    bestId = el.id.slice(4);
                    bestZone = px > cx ? 'after' : 'before';
                  }
                }
              }
            } else {
              // Case 3: vertical gap between rows → Euclidean nearest
              let bestDist = Infinity;
              for (const el of eligible) {
                const rect = el.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dist = Math.hypot(px - cx, py - cy);
                if (dist < bestDist) {
                  bestDist = dist;
                  bestId = el.id.slice(4);
                  bestZone = px > cx ? 'after' : 'before';
                }
              }
            }

            if (bestId) {
              const ind = { id: bestId, zone: bestZone, type: 'bookmark' as const };
              if (dropIndicatorRef.current?.id !== ind.id || dropIndicatorRef.current?.zone !== ind.zone) {
                setDropIndicator((dropIndicatorRef.current = ind));
              }
            }
          }
        }
        return;
      }
      if (overData.type !== 'bookmark' && overData.type !== 'bookmark-end') {
        setDropIndicator((dropIndicatorRef.current = null));
        setOverContainerData(null);
        return;
      }
      // Pointer is on an item — look up the container div by its ID to get its width
      const ovTarget = overData.target as { groupId: string; subgroupId: string };
      const containerDomId = `bookmark-container|${ovTarget.groupId}|${ovTarget.subgroupId}`;
      const containerWidth = document.getElementById(containerDomId)?.offsetWidth ?? null;
      setOverContainerData({ isIconGrid: !!overData.isIconGrid, iconSize: overData.iconSize, containerWidth });

      if (overData.type === 'bookmark-end') {
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: 'after', type: 'bookmark' }));
        return;
      }
      const el = document.getElementById(`dnd-${over.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const isIconGrid = !!(overData as any).isIconGrid;
        const isAfter = isIconGrid
          ? pointerRef.current.x > rect.left + rect.width / 2
          : pointerRef.current.y > rect.top + rect.height / 2;
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: isAfter ? 'after' : 'before', type: 'bookmark' }));
      }
    } else if (activeData.type === 'space') {
      if (overData.type !== 'space') {
        setDropIndicator((dropIndicatorRef.current = null));
        return;
      }
      const el = document.getElementById(`dnd-${over.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = pointerRef.current.x;
        const isAfter = x > rect.left + rect.width / 2;
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: isAfter ? 'after' : 'before', type: 'space' }));
      }
    }
  };

  const cleanupDragState = () => {
    setActiveDrag(null, null);
    setDropIndicator(null);
    setOverContainerData(null);
    dropIndicatorRef.current = null;
    document.body.classList.remove('dragging', 'dragging-pointer', 'dragging-grab');
  };

  const handleDragCancel = () => {
    cleanupDragState();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const dropInd = dropIndicatorRef.current;
    cleanupDragState();

    if (!dropInd) return;

    // ── bookmark / tab drops ─────────────────────────────────────────
    // dropInd contains everything needed (target group, subgroup, item, zone).
    // Do NOT rely on `over` at all — it may be null (pointer released over empty
    // trailing cells of a grid), or be the container div rather than a specific
    // item.  Using dropInd exclusively is the only reliable path.
    if ((activeData.type === 'bookmark' || activeData.type === 'tab') && dropInd.type === 'bookmark') {
      // dropInd.id is one of:
      //   "bookmark|<groupId>|<subgroupId>|<bookmarkId>"
      //   "bookmark-end|<groupId>|<subgroupId>"
      // subgroupId may be the literal string "undefined" when the bookmark lives
      // directly inside a group (subgroupId is optional on BookmarkContainerTarget).
      const parts = dropInd.id.split('|');
      let indGroupId: string;
      let rawSgId: string;
      let indBookmarkId: string | undefined;
      let insertAtEnd: boolean;

      if (parts[0] === 'bookmark' && parts.length >= 4) {
        [, indGroupId, rawSgId, indBookmarkId] = parts;
        insertAtEnd = false;
      } else if (parts[0] === 'bookmark-end' && parts.length >= 3) {
        [, indGroupId, rawSgId] = parts;
        insertAtEnd = true;
      } else {
        return;
      }

      // Normalise: treat the string "undefined" or "" as no subgroup
      const indSubgroupId = (rawSgId === 'undefined' || rawSgId === '') ? undefined : rawSgId;

      const group = board.groups.find(g => g.id === indGroupId);
      if (!group) return;
      const bms = indSubgroupId
        ? group.subgroups.find(s => s.id === indSubgroupId)?.bookmarks
        : group.bookmarks;
      if (!bms) return;

      const targetObj: BookmarkContainerTarget = { groupId: indGroupId, subgroupId: indSubgroupId };
      const insertIndex = insertAtEnd
        ? bms.length
        : (() => {
            const i = bms.findIndex(b => b.id === indBookmarkId);
            return i === -1 ? bms.length : i + (dropInd.zone === 'after' ? 1 : 0);
          })();

      if (activeData.type === 'bookmark') {
        const src: BookmarkNodeTarget = {
          groupId: activeData.target.groupId,
          subgroupId: activeData.target.subgroupId,
          bookmarkId: activeData.bookmark.id,
        };
        moveBookmark(src, targetObj, insertIndex);
      } else {
        const tabData = activeData.tab as { title: string; url: string };
        insertBookmark(targetObj, tabData, insertIndex);
      }
      return;
    }

    if (activeData.type === 'group' && dropInd.type === 'group') {
      // Parse target group ID from dropInd.id (format: "group|<groupId>")
      const targetGroupId = dropInd.id.split('|')[1];
      if (!targetGroupId) return;
      const groups = board.groups;
      if (dropInd.zone === 'after') {
        const targetIndex = groups.findIndex((g) => g.id === targetGroupId);
        if (targetIndex < 0) return;
        if (targetIndex === groups.length - 1) {
          moveGroupToEnd(activeData.groupId);
        } else {
          moveGroupBefore(activeData.groupId, groups[targetIndex + 1].id);
        }
      } else {
        moveGroupBefore(activeData.groupId, targetGroupId);
      }
      return;
    } else if (activeData.type === 'subgroup' && dropInd.type === 'subgroup') {
      // Parse from dropInd.id (format: "subgroup|<groupId>|<subgroupId>")
      const parts = dropInd.id.split('|');
      const targetGroupId = parts[1];
      const targetSubgroupId = parts[2];
      if (!targetGroupId || !targetSubgroupId) return;
      const source = { groupId: activeData.groupId, subgroupId: activeData.subgroup.id };
      if (dropInd.zone === 'after') {
        const group = board.groups.find((g) => g.id === targetGroupId);
        if (group) {
          const targetIndex = group.subgroups.findIndex((s) => s.id === targetSubgroupId);
          if (targetIndex === group.subgroups.length - 1) {
            moveSubgroupToEnd(source, targetGroupId);
          } else {
            moveSubgroupBefore(source, { groupId: targetGroupId, subgroupId: group.subgroups[targetIndex + 1].id });
          }
        }
      } else {
        moveSubgroupBefore(source, { groupId: targetGroupId, subgroupId: targetSubgroupId });
      }
      return;
    }

    // ── remaining drag types still need `over` ───────────────────────
    if (!over || active.id === over.id) return;

    const overData = over.data.current;
    if (!overData) return;

    if (activeData.type === 'space' && overData.type === 'space') {
      if (dropInd.zone === 'after') {
        const targetIndex = spaces.findIndex((s) => s.id === overData.spaceId);
        if (targetIndex === spaces.length - 1) {
          moveSpaceToEnd(activeData.spaceId);
        } else {
          moveSpaceBefore(activeData.spaceId, spaces[targetIndex + 1].id);
        }
      } else {
        moveSpaceBefore(activeData.spaceId, overData.spaceId);
      }
    }
  };

  const handleDeleteSpace = useCallback((spaceId: string) => {
    if (spaces.length <= 1) {
      toast('无法删除', { description: '至少保留一个 Space' });
      return;
    }
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const hasContent = space.board.groups.some(
      (g) =>
        g.bookmarks.length > 0 ||
        g.subgroups.length > 0 ||
        (g.viewMode === 'iframe' && !!g.iframeUrl) ||
        (g.viewMode === 'browser-tree' && !!g.browserTreeFolderId),
    );
    if (!hasContent) {
      const snapshot = deleteSpace(spaceId);
      toast('已删除 Space', {
        description: space.title,
        action: snapshot ? { label: '撤销', onClick: () => restoreSpace(snapshot) } : undefined,
      });
      return;
    }
    setDeleteSpaceState({ open: true, spaceId, title: space.title });
  }, [spaces, deleteSpace, restoreSpace]);

  if (loading) {
    return <div className="min-h-screen bg-page" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="min-h-screen bg-page text-foreground">
        <TabsEdgeDrawer />

        <div
          className={cn('mx-auto max-w-[1680px] px-5 py-4 pl-14 sm:px-6 sm:pl-14')}
          onPointerDown={handleBoardPointerDown}
          onPointerMove={handleBoardPointerMove}
          onPointerUp={handleBoardPointerUp}
          onPointerCancel={handleBoardPointerUp}
        >
          <header data-no-drag-switch className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/85 px-4 py-2.5 shadow-sm">
            {/* Space tabs */}
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto pl-1">
              {spaces.map((space) => (
                <SpaceTab
                  key={space.id}
                  id={space.id}
                  title={space.title}
                  active={space.id === activeSpaceId}
                  isOnly={spaces.length <= 1}
                  autoFocus={autoEditSpaceId === space.id}
                  onSwitch={switchSpace}
                  onRename={renameSpace}
                  onDelete={handleDeleteSpace}
                  onAutoFocusDone={() => setAutoEditSpaceId(null)}
                  spaceColumns={space.columns}
                  globalColumns={columns}
                  onSetSpaceColumns={setSpaceColumns}
                  spaceShowSearch={space.showSearch}
                  globalShowSearch={settings.showSearchBar}
                  onSetSpaceShowSearch={setSpaceShowSearch}
                  spaceIframeAutoRun={space.iframeAutoRun}
                  globalIframeAutoRun={settings.iframeAutoRun}
                  onSetSpaceIframeAutoRun={setSpaceIframeAutoRun}
                />
              ))}

              <button
                type="button"
                title="新建 Space"
                onClick={() => {
                  const newId = addSpace();
                  if (newId) setAutoEditSpaceId(newId);
                }}
                className="ml-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                title="帮助"
                className="text-muted-foreground hover:bg-muted/45 hover:text-foreground"
                onClick={() => setHelpOpen(true)}
              >
                <HelpCircle className="size-4" />
              </Button>

              <DropdownMenu onOpenChange={setSettingsMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="设置"
                    className={cn(
                      'text-muted-foreground hover:bg-muted/45 hover:text-foreground',
                      settingsMenuOpen && 'bg-muted/45 text-foreground',
                    )}
                  >
                    <Settings className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => setSettingsDialogOpen(true)}>
                    <Sliders className="mr-2 size-3.5" />
                    功能设置
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Columns className="mr-2 size-3.5" />
                      列数
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem onSelect={() => setColumns('auto')} className="flex items-center justify-between gap-4">
                        自适应
                        {columns === 'auto' && <Check className="size-4 opacity-50" />}
                      </DropdownMenuItem>
                      {[1, 2, 3, 4, 5, 6].map((col) => (
                        <DropdownMenuItem key={col} onSelect={() => setColumns(col as any)} className="flex items-center justify-between gap-4">
                          固定 {col} 列
                          {columns === col && <Check className="size-4 opacity-50" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => {
                    const json = JSON.stringify(createBackupPayload(spaceStore, settings), null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'newtab-pro-backup.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast('即将导出', { description: 'newtab-pro-backup.json' });
                  }}>
                    <Upload className="mr-2 size-3.5" />
                    导出数据
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => importInputRef.current?.click()}>
                    <Download className="mr-2 size-3.5" />
                    导入数据
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setSettingsMenuOpen(false);
                      setWebDavDialogOpen(true);
                    }}
                  >
                    <Cloud className="mr-2 size-3.5" />
                    WebDAV 备份
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        const raw = JSON.parse(reader.result as string);
                        applyBackupData(raw);
                        toast('导入成功', { description: file.name });
                      } catch (error) {
                        toast('导入失败', {
                          description: error instanceof Error ? error.message : '文件格式不正确',
                        });
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                }}
              />

              <Button size="sm" onClick={() => {
                const newGroupId = addGroup();
                if (newGroupId) {
                  setAutoEditGroupId(newGroupId);
                }
              }}>
                <Plus className="mr-1 size-3.5" />
                新建分组
              </Button>
            </div>
          </header>

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div>
          {effectiveShowSearch && (
            <div className="mt-3">
              <SearchBar
                ref={searchBarInputRef}
                settings={settings}
                onSetActiveEngine={setActiveSearchEngine}
                onAddToHistory={addToSearchHistory}
                onRemoveFromHistory={removeFromSearchHistory}
                onClearHistory={clearSearchHistory}
              />
            </div>
          )}

          {spaces.map((space) => {
            const spaceGroups = space.board.groups;
            const spaceEff = space.columns ?? columns;
            const spaceGridCols = spaceEff === 'auto'
              ? 'repeat(auto-fill, minmax(320px, 1fr))'
              : `repeat(${spaceEff}, minmax(0, 1fr))`;
            return (
              <main
                key={space.id}
                className="mt-3"
                style={space.id !== activeSpaceId ? { display: 'none' } : undefined}
              >
            <div
              className="grid items-start gap-3"
              style={{ gridTemplateColumns: spaceGridCols }}
            >
              {spaceGroups.map((group) => (
                <div key={group.id} className="relative" data-group-card="true" onContextMenu={(e) => e.stopPropagation()}>
                  <GroupCard
                    group={group}
                    spaces={spaces}
                    activeSpaceId={activeSpaceId}
                    isActiveSpace={space.id === activeSpaceId}
                    iframeAutoRun={
                      space.iframeAutoRun !== undefined
                        ? space.iframeAutoRun
                        : settings.iframeAutoRun
                    }
                    onMoveGroupToSpace={(groupId, targetSpaceId) => {
                      const ok = moveGroupToSpace(groupId, targetSpaceId);
                      if (ok) {
                        const targetSpace = spaces.find((s) => s.id === targetSpaceId);
                        toast('分组已移动', { description: `已移至 Space「${targetSpace?.title ?? targetSpaceId}」` });
                      }
                    }}
                    onMoveSubgroupToSpace={(source, targetSpaceId, targetGroupId) => {
                      const ok = moveSubgroupToSpace(source, targetSpaceId, targetGroupId);
                      if (ok) {
                        const targetSpace = spaces.find((s) => s.id === targetSpaceId);
                        toast('小组已移动', { description: `已移至 Space「${targetSpace?.title ?? targetSpaceId}」` });
                      }
                    }}
                    onMoveBookmarkToSpace={(source, targetSpaceId, targetGroupId, targetSubgroupId) => {
                      const ok = moveBookmarkToSpace(source, targetSpaceId, targetGroupId, targetSubgroupId);
                      if (ok) {
                        const targetSpace = spaces.find((s) => s.id === targetSpaceId);
                        toast('书签已移动', { description: `已移至 Space「${targetSpace?.title ?? targetSpaceId}」` });
                      }
                    }}
                    onToggleGroup={toggleGroup}
                    onAddSubgroup={(groupId) => {
                      const newSubgroupId = addSubgroup(groupId);
                      if (newSubgroupId) {
                        setAutoEditSubgroupId(newSubgroupId);
                      }
                    }}
                    onRenameGroup={renameGroup}
                    onSetGroupColor={setGroupColor}
                    onDeleteGroup={(groupId) => {
                      const groupRef = spaceGroups.find((item) => item.id === groupId);
                      if (!groupRef) return;
                      if (groupRef.bookmarks.length === 0 && groupRef.subgroups.length === 0) {
                        const snapshot = deleteGroup(groupId);
                        if (snapshot) {
                          toast('已删除分组', {
                            description: groupRef.title,
                            action: { label: '撤销', onClick: () => restoreGroup(snapshot) }
                          });
                        }
                        return;
                      }
                      setDeleteState({
                        open: true,
                        mode: 'group',
                        groupId,
                        title: groupRef.title,
                      });
                    }}
                    onToggleSubgroup={toggleSubgroup}
                    onRenameSubgroup={renameSubgroup}
                    onDeleteSubgroup={(target) => {
                      const groupRef = spaceGroups.find((item) => item.id === target.groupId);
                      const subgroup = groupRef?.subgroups.find((item) => item.id === target.subgroupId);
                      if (!subgroup) return;
                      if (subgroup.bookmarks.length === 0) {
                        const snapshot = deleteSubgroup(target);
                        if (snapshot) {
                          toast('已删除小组', {
                            description: subgroup.title,
                            action: { label: '撤销', onClick: () => restoreSubgroup(snapshot) }
                          });
                        }
                        return;
                      }
                      setDeleteState({
                        open: true,
                        mode: 'subgroup',
                        target,
                        title: subgroup.title,
                      });
                    }}
                    onSetViewMode={(mode) => setGroupViewMode(group.id, mode)}
                    onSetIconSize={(size) => setGroupIconSize(group.id, size)}
                    onSetSubgroupViewMode={(subgroupId, mode) => setSubgroupViewMode(group.id, subgroupId, mode)}
                    onSetSubgroupIconSize={(subgroupId, size) => setSubgroupIconSize(group.id, subgroupId, size)}
                    onSetBrowserTreeMaxItems={(groupId, maxItems) => {
                      const grp = spaceGroups.find((g) => g.id === groupId);
                      setGroupBrowserTreeConfig(groupId, grp?.browserTreeFolderId ?? null, maxItems);
                    }}
                    onOpenBrowserFolderPicker={setBrowserFolderPickerGroupId}
                    onSetIframeConfig={(groupId, url, height) => {
                      setGroupIframeConfig(space.id, groupId, url, height);
                    }}
                    onOpenIframeUrlPicker={(groupId) => {
                      setIframeUrlPickerTarget({ spaceId: space.id, groupId });
                    }}
                    autoFocusEdit={autoEditGroupId === group.id}
                    autoFocusSubgroupId={autoEditSubgroupId}
                    onClearAutoFocus={() => {
                      if (autoEditGroupId === group.id) setAutoEditGroupId(null);
                      if (autoEditSubgroupId) setAutoEditSubgroupId(null);
                    }}
                    onOpenManualAdd={(target) => {
                      setFormState({
                        open: true,
                        mode: 'create',
                        target,
                        initialTitle: '',
                        initialUrl: '',
                      });
                    }}
                    onOpenImportAdd={setTreeDialogTarget}
                    onOpenEditBookmark={(target, bookmark) => {
                      setFormState({
                        open: true,
                        mode: 'edit',
                        target,
                        bookmarkId: bookmark.id,
                        initialTitle: bookmark.title,
                        initialUrl: bookmark.url,
                      });
                    }}
                    onDeleteBookmark={(target, bookmarkId) => {
                      const snapshot = removeBookmark(target, bookmarkId);
                      if (!snapshot) {
                        return;
                      }
                      toast('书签已删除', {
                        description: snapshot.bookmark.title,
                        action: {
                          label: '撤销',
                          onClick: () => restoreBookmark(snapshot),
                        },
                        duration: 5000,
                      });
                    }}
                    onMoveBookmark={moveBookmark}
                    onDropExternalBookmark={(target, payload, insertIndex) => {
                      try {
                        insertBookmark(target, payload, insertIndex);
                      } catch (error) {
                        toast('添加失败', { description: String(error) });
                      }
                    }}
                  />
                </div>
              ))}
            </div>

              </main>
            );
          })}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent
              className="w-52"
              onCloseAutoFocus={(event) => {
                if (addGroupAfterContextMenuCloseRef.current) {
                  event.preventDefault();
                  addGroupAfterContextMenuCloseRef.current = false;
                  flushSync(() => {
                    const newGroupId = addGroup();
                    if (newGroupId) {
                      setAutoEditGroupId(newGroupId);
                    }
                  });
                }
              }}
            >
              <ContextMenuItem onSelect={() => {
                addGroupAfterContextMenuCloseRef.current = true;
              }}>
                <Plus className="mr-2 size-3.5" />
                添加分组
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Columns className="mr-2 size-3.5" />
                  列数
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem
                    onSelect={() => setSpaceColumns(activeSpaceId!, undefined)}
                    className="flex items-center justify-between gap-4"
                  >
                    跟随全局（{columns === 'auto' ? '自适应' : `${columns} 列`}）
                    {_activeSpaceForSearch?.columns === undefined && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => setSpaceColumns(activeSpaceId!, 'auto')}
                    className="flex items-center justify-between gap-4"
                  >
                    自适应
                    {_activeSpaceForSearch?.columns === 'auto' && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  {([1, 2, 3, 4, 5, 6] as const).map((col) => (
                    <ContextMenuItem
                      key={col}
                      onSelect={() => setSpaceColumns(activeSpaceId!, col)}
                      className="flex items-center justify-between gap-4"
                    >
                      固定 {col} 列
                      {_activeSpaceForSearch?.columns === col && <Check className="size-4 opacity-50" />}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Search className="mr-2 size-3.5" />
                  搜索栏
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem
                    onSelect={() => setSpaceShowSearch(activeSpaceId!, undefined)}
                    className="flex items-center justify-between gap-4"
                  >
                    跟随全局（{settings.showSearchBar ? '显示' : '隐藏'}）
                    {_activeSpaceForSearch?.showSearch === undefined && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => setSpaceShowSearch(activeSpaceId!, true)}
                    className="flex items-center justify-between gap-4"
                  >
                    显示
                    {_activeSpaceForSearch?.showSearch === true && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => setSpaceShowSearch(activeSpaceId!, false)}
                    className="flex items-center justify-between gap-4"
                  >
                    隐藏
                    {_activeSpaceForSearch?.showSearch === false && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Globe className="mr-2 size-3.5" />
                  iframe 自动运行
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem
                    onSelect={() => setSpaceIframeAutoRun(activeSpaceId!, undefined)}
                    className="flex items-center justify-between gap-4"
                  >
                    跟随全局（{settings.iframeAutoRun ? '自动' : '手动'}）
                    {_activeSpaceForSearch?.iframeAutoRun === undefined && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => setSpaceIframeAutoRun(activeSpaceId!, true)}
                    className="flex items-center justify-between gap-4"
                  >
                    自动运行
                    {_activeSpaceForSearch?.iframeAutoRun === true && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => setSpaceIframeAutoRun(activeSpaceId!, false)}
                    className="flex items-center justify-between gap-4"
                  >
                    手动运行
                    {_activeSpaceForSearch?.iframeAutoRun === false && <Check className="size-4 opacity-50" />}
                  </ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuContent>
          </ContextMenu>
        </div>

        <BookmarkFormDialog
          open={formState.open}
          mode={formState.mode}
          initialTitle={formState.initialTitle}
          initialUrl={formState.initialUrl}
          targetLabel={formTargetLabel}
          onOpenChange={(next) => {
            if (!next) {
              setFormState((prev) => ({ ...prev, open: false }));
            } else {
              setFormState((prev) => ({ ...prev, open: true }));
            }
          }}
          onSubmit={({ title, url }) => {
            if (!formState.target) {
              return;
            }

            try {
              if (formState.mode === 'create') {
                addBookmark(formState.target, {
                  title,
                  url,
                });
              } else if (formState.bookmarkId) {
                editBookmark(formState.target, formState.bookmarkId, {
                  title,
                  url,
                });
              }
            } catch (error) {
              toast('保存失败', { description: String(error) });
            }
          }}
        />

        <BookmarkTreeDialog
          open={!!treeDialogTarget}
          targetLabel={treeTargetLabel}
          onOpenChange={(next) => {
            if (!next) {
              setTreeDialogTarget(null);
            }
          }}
          onAddBookmark={(bookmark) => {
            if (!treeDialogTarget) {
              return;
            }
            addBookmark(treeDialogTarget, bookmark);
          }}
        />

        <IframeUrlPickerDialog
          open={!!iframeUrlPickerTarget}
          onOpenChange={(v) => { if (!v) setIframeUrlPickerTarget(null); }}
          spaces={spaceStore.spaces}
          initialUrl={
            iframeUrlPickerTarget
              ? spaceStore.spaces
                  .find((space) => space.id === iframeUrlPickerTarget.spaceId)
                  ?.board.groups.find((g) => g.id === iframeUrlPickerTarget.groupId)?.iframeUrl
              : undefined
          }
          onConfirm={(url) => {
            if (iframeUrlPickerTarget) {
              const space = spaceStore.spaces.find((item) => item.id === iframeUrlPickerTarget.spaceId);
              const g = space?.board.groups.find((grp) => grp.id === iframeUrlPickerTarget.groupId);
              setGroupIframeConfig(
                iframeUrlPickerTarget.spaceId,
                iframeUrlPickerTarget.groupId,
                url,
                g?.iframeHeight ?? IFRAME_DEFAULT_HEIGHT,
              );
              setIframeUrlPickerTarget(null);
            }
          }}
        />

        <BrowserFolderPickerDialog
          open={!!browserFolderPickerGroupId}
          initialFolderId={
            browserFolderPickerGroupId
              ? board.groups.find((g) => g.id === browserFolderPickerGroupId)?.browserTreeFolderId
              : undefined
          }
          onOpenChange={(next) => {
            if (!next) setBrowserFolderPickerGroupId(null);
          }}
          onConfirm={(folderId) => {
            if (browserFolderPickerGroupId) {
              const grp = board.groups.find((g) => g.id === browserFolderPickerGroupId);
              setGroupBrowserTreeConfig(
                browserFolderPickerGroupId,
                folderId,
                grp?.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS,
              );
            }
          }}
        />

        <ConfirmDialog
          open={deleteState.open}
          title={deleteState.open && deleteState.mode === 'group' ? '删除分组' : '删除小组'}
          description={
            deleteState.open
              ? deleteState.mode === 'group'
                ? `确定删除分组「${deleteState.title}」及其全部内容？`
                : `确定删除小组「${deleteState.title}」及其全部书签？`
              : undefined
          }
          confirmText="删除"
          destructive
          onOpenChange={(open) => {
            if (!open) {
              setDeleteState({ open: false });
            }
          }}
          onConfirm={() => {
            if (!deleteState.open) {
              return;
            }
            if (deleteState.mode === 'group') {
              const snapshot = deleteGroup(deleteState.groupId);
              if (snapshot) {
                toast('已删除分组', {
                  description: deleteState.title,
                  action: { label: '撤销', onClick: () => restoreGroup(snapshot) }
                });
              }
            } else {
              const snapshot = deleteSubgroup(deleteState.target);
              if (snapshot) {
                toast('已删除小组', {
                  description: deleteState.title,
                  action: { label: '撤销', onClick: () => restoreSubgroup(snapshot) }
                });
              }
            }
          }}
        />

        <ConfirmDialog
          open={deleteSpaceState.open}
          title="删除 Space"
          description={
            deleteSpaceState.open
              ? `确定删除 Space「${deleteSpaceState.title}」及其全部内容？`
              : undefined
          }
          confirmText="删除"
          destructive
          onOpenChange={(open) => {
            if (!open) {
              setDeleteSpaceState({ open: false });
            }
          }}
          onConfirm={() => {
            if (!deleteSpaceState.open) return;
            const snapshot = deleteSpace(deleteSpaceState.spaceId);
            toast('已删除 Space', {
              description: deleteSpaceState.title,
              action: snapshot ? { label: '撤销', onClick: () => restoreSpace(snapshot) } : undefined,
            });
          }}
        />

        <HelpDialog
          open={helpOpen}
          onOpenChange={setHelpOpen}
          settings={settings}
        />

        <SettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          settings={settings}
          onUpdateSettings={updateSettings}
          onAddSearchEngine={addSearchEngine}
          onUpdateSearchEngine={updateSearchEngine}
          onDeleteSearchEngine={deleteSearchEngine}
          onSetActiveSearchEngine={setActiveSearchEngine}
          onResetSearchEngines={resetSearchEngines}
          onReorderSearchEngines={reorderSearchEngines}
        />

        <WebDavBackupDialog
          open={webDavDialogOpen}
          onOpenChange={setWebDavDialogOpen}
          backupSettings={settings.backup}
          onSaveAccount={handleSaveBackupAccount}
          onRemoveAccount={handleRemoveBackupAccount}
          onUpdateBackupSettings={handleUpdateBackupSettings}
          onTestConnection={handleTestWebDavConnection}
          onManualBackup={handleManualBackup}
          onManualRestore={handleManualRestore}
          onOpenRemoteDiff={handleOpenRemoteBackupDiff}
        />

        <Toaster />
      </div>

      <SmartDragOverlay />
    </DndContext>
  );
}
