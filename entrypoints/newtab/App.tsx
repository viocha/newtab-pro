import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Check, LayoutGrid, Plus, ChevronDown, ChevronRight, GripVertical, GripHorizontal, Settings, Download, Upload, Columns, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
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
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import { BookmarkFormDialog } from './components/BookmarkFormDialog';
import { BookmarkTreeDialog } from './components/BookmarkTreeDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { GroupCard } from './components/GroupCard';
import { TabsEdgeDrawer } from './components/TabsEdgeDrawer';
import { useDndUIStore } from './drag';
import type { BookmarkContainerTarget } from './types';
import { useBoardStore } from './use-board-store';
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
      <div className="flex shrink-0 items-center gap-2.5 rounded-lg py-1.5 px-1.5 bg-card border border-border/40 shadow-lg">
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
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const startEditing = useCallback(() => {
    setEditValue(title);
    setEditing(true);
  }, [title]);

  // Enter edit mode when autoFocus is requested (e.g. after addSpace)
  useEffect(() => {
    if (autoFocus) {
      setEditValue(title);
      setEditing(true);
      onAutoFocusDone?.();
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus + select all once the input is mounted
  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onRename(id, trimmed);
    }
    setEditing(false);
  }, [editValue, title, id, onRename]);

  // Delayed blur: prevents ContextMenu focus-restoration from killing edit mode
  const handleInputBlur = useCallback(() => {
    blurTimeout.current = setTimeout(() => {
      commitEdit();
    }, 120);
  }, [commitEdit]);

  const handleInputFocus = useCallback(() => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = undefined;
    }
  }, []);

  return (
    <ContextMenu onOpenChange={setContextMenuOpen}>
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
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleInputBlur}
              onFocus={handleInputFocus}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  clearTimeout(blurTimeout.current);
                  commitEdit();
                }
                if (e.key === 'Escape') {
                  clearTimeout(blurTimeout.current);
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
      <ContextMenuContent className="w-36">
        <ContextMenuItem onSelect={startEditing}>
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
    deleteSpace,
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
  } = useBoardStore();

  const [formState, setFormState] = useState<BookmarkFormState>(DEFAULT_FORM_STATE);
  const [treeDialogTarget, setTreeDialogTarget] = useState<BookmarkContainerTarget | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState>({ open: false });
  const [deleteSpaceState, setDeleteSpaceState] = useState<DeleteSpaceState>({ open: false });

  const [columns, setColumns] = useState<'auto' | 1 | 2 | 3 | 4 | 5 | 6>('auto');
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [autoEditGroupId, setAutoEditGroupId] = useState<string | null>(null);
  const [autoEditSubgroupId, setAutoEditSubgroupId] = useState<string | null>(null);
  const [autoEditSpaceId, setAutoEditSpaceId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

    if (data?.type === 'tab') {
      const bookmarkEl = document.querySelector('[id^="dnd-bookmark|"]');
      width = bookmarkEl?.getBoundingClientRect().width ?? null;
    } else {
      const el = document.getElementById(`dnd-${event.active.id}`);
      width = el?.getBoundingClientRect().width ?? null;
    }

    setActiveDrag(String(event.active.id), data, width);
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
    if (!over || !activeData) {
      setDropIndicator((dropIndicatorRef.current = null));
      setOverContainerData(null);
      return;
    }
    if (active.id === over.id) {
      setDropIndicator((dropIndicatorRef.current = null));
      // Stay in same container — don't clear container style
      return;
    }

    const overData = over.data.current;
    if (!overData) return;

    if (activeData.type === 'bookmark' || activeData.type === 'tab') {
      if (overData.type === 'bookmark-container') {
        // Pointer is in a gap between items — over.rect is the container's own bounding rect
        const containerWidth = Math.round(over.rect.width);
        setOverContainerData({ isIconGrid: !!overData.isIconGrid, iconSize: overData.iconSize, containerWidth });
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
    } else if (activeData.type === 'subgroup') {
      if (overData.type !== 'subgroup' && overData.type !== 'subgroup-end') {
        setDropIndicator((dropIndicatorRef.current = null));
        return;
      }
      if (overData.type === 'subgroup-end') {
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: 'after', type: 'subgroup' }));
        return;
      }
      const el = document.getElementById(`dnd-${over.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const y = pointerRef.current.y;
        const isAfter = y > rect.top + rect.height / 2;
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: isAfter ? 'after' : 'before', type: 'subgroup' }));
      }
    } else if (activeData.type === 'group') {
      if (overData.type !== 'group') {
        setDropIndicator((dropIndicatorRef.current = null));
        return;
      }
      const el = document.getElementById(`dnd-${over.id}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        const x = pointerRef.current.x;
        const isAfter = x > rect.left + rect.width / 2;
        setDropIndicator((dropIndicatorRef.current = { id: String(over.id), zone: isAfter ? 'after' : 'before', type: 'group' }));
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

    if (!over || active.id === over.id || !dropInd) return;

    const overData = over.data.current;
    if (!overData) return;

    if (activeData.type === 'group' && overData.type === 'group') {
      const groups = board.groups;
      if (dropInd.zone === 'after') {
        const targetIndex = groups.findIndex((g) => g.id === overData.groupId);
        if (targetIndex === groups.length - 1) {
          moveGroupToEnd(activeData.groupId);
        } else {
          moveGroupBefore(activeData.groupId, groups[targetIndex + 1].id);
        }
      } else {
        moveGroupBefore(activeData.groupId, overData.groupId);
      }
    } else if (activeData.type === 'subgroup' && (overData.type === 'subgroup' || overData.type === 'subgroup-end')) {
      const source = { groupId: activeData.groupId, subgroupId: activeData.subgroup.id };
      const targetGrpId = overData.target.groupId;
      if (overData.type === 'subgroup-end') {
        moveSubgroupToEnd(source, targetGrpId);
      } else {
        if (dropInd.zone === 'after') {
          const group = board.groups.find((g) => g.id === targetGrpId);
          if (group) {
            const targetIndex = group.subgroups.findIndex((s) => s.id === overData.target.subgroupId);
            if (targetIndex === group.subgroups.length - 1) {
              moveSubgroupToEnd(source, targetGrpId);
            } else {
              moveSubgroupBefore(source, { groupId: targetGrpId, subgroupId: group.subgroups[targetIndex + 1].id });
            }
          }
        } else {
          moveSubgroupBefore(source, { groupId: targetGrpId, subgroupId: overData.target.subgroupId });
        }
      }
    } else if (activeData.type === 'bookmark' && (overData.type === 'bookmark' || overData.type === 'bookmark-end')) {
      const source = { groupId: activeData.target.groupId, subgroupId: activeData.target.subgroupId, bookmarkId: activeData.bookmark.id };
      const targetObj = overData.target;
      if (overData.type === 'bookmark-end') {
        const group = board.groups.find(g => g.id === targetObj.groupId);
        if (group) {
          if (targetObj.subgroupId) {
            const sg = group.subgroups.find(s => s.id === targetObj.subgroupId);
            if (sg) moveBookmark(source, targetObj, sg.bookmarks.length);
          } else {
            moveBookmark(source, targetObj, group.bookmarks.length);
          }
        }
      } else {
        const insertIndex = overData.index + (dropInd.zone === 'after' ? 1 : 0);
        moveBookmark(source, targetObj, insertIndex);
      }
    } else if (activeData.type === 'tab' && (overData.type === 'bookmark' || overData.type === 'bookmark-end')) {
      const tabData = activeData.tab as { title: string; url: string };
      const targetObj = overData.target;
      if (overData.type === 'bookmark-end') {
        const group = board.groups.find(g => g.id === targetObj.groupId);
        if (group) {
          if (targetObj.subgroupId) {
            const sg = group.subgroups.find(s => s.id === targetObj.subgroupId);
            if (sg) insertBookmark(targetObj, tabData, sg.bookmarks.length);
          } else {
            insertBookmark(targetObj, tabData, group.bookmarks.length);
          }
        }
      } else {
        const idx = overData.index + (dropInd.zone === 'after' ? 1 : 0);
        insertBookmark(targetObj, tabData, idx);
      }
    } else if (activeData.type === 'space' && overData.type === 'space') {
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
      (g) => g.bookmarks.length > 0 || g.subgroups.length > 0,
    );
    if (!hasContent) {
      deleteSpace(spaceId);
      toast('已删除 Space', { description: space.title });
      return;
    }
    setDeleteSpaceState({ open: true, spaceId, title: space.title });
  }, [spaces, deleteSpace]);

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

        <div className={cn('mx-auto max-w-[1680px] px-5 py-4 pl-14 sm:px-6 sm:pl-14')}>
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/85 px-4 py-2.5 shadow-sm">
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
              <DropdownMenu onOpenChange={setSettingsMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="设置"
                    className={cn(
                      'text-muted-foreground hover:text-foreground',
                      settingsMenuOpen && 'bg-accent text-accent-foreground',
                    )}
                  >
                    <Settings className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
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
                    const exportData = { ...spaceStore, version: 1 };
                    const json = JSON.stringify(exportData, null, 2);
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
                      if (raw.version !== 1) {
                        toast('导入失败', { description: '版本不匹配或文件格式错误' });
                        return;
                      }
                      importSpaceStore(raw);
                      toast('导入成功', { description: file.name });
                    } catch {
                      toast('导入失败', { description: '文件格式不正确' });
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

          <main className="mt-3">
            <div
              className="grid items-start gap-3"
              style={{
                gridTemplateColumns: columns === 'auto'
                  ? 'repeat(auto-fill, minmax(320px, 1fr))'
                  : `repeat(${columns}, minmax(0, 1fr))`
              }}
            >
              {board.groups.map((group, index) => (
                <div key={group.id} className="relative">
                  <GroupCard
                    group={group}
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
                      if (board.groups.length <= 1) {
                        toast('无法删除', {
                          description: '至少保留一个分组',
                        });
                        return;
                      }
                      const groupRef = board.groups.find((item) => item.id === groupId);
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
                      const groupRef = board.groups.find((item) => item.id === target.groupId);
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
        </div>

        <BookmarkFormDialog
          open={formState.open}
          mode={formState.mode}
          initialTitle={formState.initialTitle}
          initialUrl={formState.initialUrl}
          targetLabel={formTargetLabel}
          onOpenChange={(next) => {
            if (!next) {
              setFormState(DEFAULT_FORM_STATE);
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
            deleteSpace(deleteSpaceState.spaceId);
            toast('已删除 Space', { description: deleteSpaceState.title });
          }}
        />

        <Toaster />
      </div>

      <SmartDragOverlay />
    </DndContext>
  );
}
