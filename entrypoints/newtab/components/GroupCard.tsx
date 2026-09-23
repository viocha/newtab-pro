import { useEffect, useMemo, useRef, useState } from 'react';
import { DragEvent } from 'react';
import { flushSync } from 'react-dom';
import { Check, GripHorizontal, LayoutGrid, LayoutList, MoreHorizontal, FolderTree, FolderPlus, FolderOpen, BookOpen, Palette, Plus, Trash2, ExternalLink, AppWindow, EyeOff, FolderInput, Globe, Wrench, Play, PanelsTopLeft, RefreshCw, RotateCcw } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { GROUP_COLOR_PRESETS } from '../constants';

import type {
  BookmarkContainerTarget,
  BookmarkGroup,
  BookmarkItem,
  BookmarkNodeTarget,
  BookmarkViewMode,
  IconSize,
  InsertTarget,
  Space,
} from '../types';
import { useDndUIStore, readTabDragPayload } from '../drag';
import { BookmarkRows } from './BookmarkRows';
import { BookmarkIconGrid } from './BookmarkIconGrid';
import { BrowserTreeView } from './BrowserTreeView';
import { SubgroupPanel } from './SubgroupPanel';
import { tryNormalizeUrl } from '../utils';
import { BROWSER_TREE_DEFAULT_MAX_ITEMS, IFRAME_DEFAULT_HEIGHT } from '../constants';
import { getGridOpenCounts, openUrlsInGrid, useWindowOpenPrefs } from '../window-open';

type GroupCardProps = {
  group: BookmarkGroup;
  spaces: Space[];
  activeSpaceId: string;
  onMoveGroupToSpace: (groupId: string, targetSpaceId: string) => void;
  onMoveSubgroupToSpace: (
    source: InsertTarget,
    targetSpaceId: string,
    targetGroupId: string,
  ) => void;
  onMoveBookmarkToSpace: (
    source: BookmarkNodeTarget,
    targetSpaceId: string,
    targetGroupId: string,
    targetSubgroupId?: string,
  ) => void;
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
  /** 设置书签树模式最多显示条目数 */
  onSetBrowserTreeMaxItems: (groupId: string, maxItems: number) => void;
  /** 打开书签文件夹选择对话框 */
  onOpenBrowserFolderPicker: (groupId: string) => void;
  /** 打开 iframe URL 书签选择对话框 */
  onOpenIframeUrlPicker: (groupId: string) => void;
  /** 设置内嵌网页配置 */
  onSetIframeConfig: (groupId: string, url: string, height: number) => void;
  /** 当前分组所属 Space 是否为活跃 Space，用于 iframe 懒加载控制 */
  isActiveSpace: boolean;
  /** 该 Space 是否自动运行 iframe，由全局设置和 per-Space 设置合并计算 */
  iframeAutoRun: boolean;
  autoFocusEdit?: boolean;
  autoFocusSubgroupId?: string | null;
  onClearAutoFocus?: () => void;
};

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

interface BmNode { url?: string; children?: BmNode[] }
function collectBmUrls(nodes: BmNode[]): string[] {
  const urls: string[] = [];
  const walk = (n: BmNode) => { if (n.url) urls.push(n.url); n.children?.forEach(walk); };
  nodes.forEach(walk);
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
    target: BookmarkContainerTarget,
    payload: { title: string; url: string },
    insertIndex?: number,
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
        'flex h-9 items-center rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 text-[11px] text-muted-foreground transition-colors',
        isTarget && 'border-primary/40 bg-primary/10 text-primary',
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
  spaces,
  activeSpaceId,
  onMoveGroupToSpace,
  onMoveSubgroupToSpace,
  onMoveBookmarkToSpace,
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
  onSetBrowserTreeMaxItems,
  onOpenBrowserFolderPicker,
  onSetIframeConfig,
  onOpenIframeUrlPicker,
  autoFocusEdit,
  autoFocusSubgroupId,
  onClearAutoFocus,
  isActiveSpace,
  iframeAutoRun,
}: GroupCardProps) {
  const { compactGridWindows, setCompactGridWindows } = useWindowOpenPrefs();
  const [editingTitle, setEditingTitle] = useState(!!autoFocusEdit);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const addSubgroupAfterMenuCloseRef = useRef(false);
  const [btUrls, setBtUrls] = useState<string[]>([]);
  const [btMaxDraft, setBtMaxDraft] = useState<string>(
    String(group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS),
  );
  const [iframeUrlDraft, setIframeUrlDraft] = useState(group.iframeUrl ?? '');
  const [iframeHeightDraft, setIframeHeightDraft] = useState<string>(
    String(group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT),
  );
  // iframe 懒加载：只有 Space 被激活过才真正渲染 iframe，避免页面加载时所有 Space 的 iframe 同时请求
  // 如果 iframeAutoRun=false，则初始不激活，需要手动点击 play 按钮
  const [iframeActivated, setIframeActivated] = useState(isActiveSpace && iframeAutoRun);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const refreshIframe = () => {
    if (!iframeActivated) {
      setIframeActivated(true);
      return;
    }
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'NEWTAB_PRO_IFRAME_REFRESH' },
      '*',
    );
  };

  const resetIframe = () => {
    setIframeActivated(true);
    setIframeReloadKey((key) => key + 1);
  };

  useEffect(() => {
    if (isActiveSpace && iframeAutoRun && !iframeActivated) setIframeActivated(true);
    // iframeActivated 故意不加入依赖——单向激活闸，防止无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveSpace, iframeAutoRun]);

  useEffect(() => {
    if (autoFocusEdit) {
      setEditingTitle(true);
      setTitleDraft(group.title);
    }
  }, [autoFocusEdit, group.title]);

  // 同步外部 browserTreeMaxItems 到草稿
  useEffect(() => {
    setBtMaxDraft(String(group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS));
  }, [group.browserTreeMaxItems]);

  // 同步外部 iframeUrl / iframeHeight 到草稿
  useEffect(() => {
    setIframeUrlDraft(group.iframeUrl ?? '');
  }, [group.iframeUrl]);
  useEffect(() => {
    setIframeHeightDraft(String(group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT));
  }, [group.iframeHeight]);

  // 书签树模式下预加载 folder 中所有 URL，用于菜单中「打开所有」功能
  useEffect(() => {
    if (group.viewMode !== 'browser-tree' || !group.browserTreeFolderId) {
      setBtUrls([]);
      return;
    }
    let alive = true;
    void browser.bookmarks.getSubTree(group.browserTreeFolderId).then(([folder]) => {
      if (!alive) return;
      setBtUrls(collectBmUrls((folder?.children ?? []) as BmNode[]));
    }).catch(() => { if (alive) setBtUrls([]); });
    return () => { alive = false; };
  }, [group.viewMode, group.browserTreeFolderId]);

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
  const allUrls = group.viewMode === 'browser-tree' ? btUrls : collectGroupUrls(group);
  const keepIframeMounted = group.viewMode === 'iframe';
  const shouldRenderGroupBody = keepIframeMounted || !group.collapsed;
  const isIframeBodyHidden = keepIframeMounted && group.collapsed;

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
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-black/80 transition-colors hover:bg-black/[0.06] hover:text-black"
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
                <Input
                  className="h-7 border-black/15 bg-white/65 px-2 text-sm text-black shadow-none focus-visible:ring-black/15"
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
            {group.viewMode === 'iframe' && group.iframeUrl && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 cursor-pointer rounded-md text-black/80 hover:bg-black/[0.06] hover:text-black"
                  onClick={refreshIframe}
                  title="刷新当前网页"
                  aria-label="刷新当前网页"
                >
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 cursor-pointer rounded-md text-black/80 hover:bg-black/[0.06] hover:text-black"
                  onClick={resetIframe}
                  title="重置到配置网址"
                  aria-label="重置到配置网址"
                >
                  <RotateCcw />
                </Button>
              </>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-md text-black/80 hover:bg-black/[0.06] hover:text-black"
              onClick={() => onOpenManualAdd(groupRootTarget)}
              title="添加书签"
              style={group.viewMode === 'browser-tree' || group.viewMode === 'iframe' ? { display: 'none' } : undefined}
            >
              <Plus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 rounded-md text-black/80 hover:bg-black/[0.06] hover:text-black"
              onClick={() => onOpenImportAdd(groupRootTarget)}
              title="从书签导入"
              style={group.viewMode === 'browser-tree' || group.viewMode === 'iframe' ? { display: 'none' } : undefined}
            >
              <FolderTree className="size-3.5" />
            </Button>
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'size-7 rounded-md text-black/80 hover:bg-black/[0.06] hover:text-black',
                    menuOpen && 'bg-black/[0.06] text-black',
                  )}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-58"
                onCloseAutoFocus={(event) => {
                  if (addSubgroupAfterMenuCloseRef.current) {
                    event.preventDefault();
                    addSubgroupAfterMenuCloseRef.current = false;
                    flushSync(() => {
                      onAddSubgroup(group.id);
                    });
                  }
                }}
              >
                {/* View mode segmented */}
                <DropdownMenuLabel className="pb-1 text-xs font-medium text-muted-foreground">视图模式</DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <div className="flex items-center rounded-md bg-muted p-0.5">
                    {(
                      [['list', <LayoutList className="size-3.5" />, '列表'],
                      ['icon', <LayoutGrid className="size-3.5" />, '图标'],
                      ['browser-tree', <BookOpen className="size-3.5" />, '书签树'],
                      ['iframe', <Globe className="size-3.5" />, '内嵌网页']] as const
                    ).map(([val, icon, label]) => {
                      const isGroupEmpty =
                        group.bookmarks.length === 0 &&
                        group.subgroups.every((s) => s.bookmarks.length === 0);
                      const isDisabled = (val === 'browser-tree' || val === 'iframe') && !isGroupEmpty;
                      return (
                        <button
                          key={val}
                          disabled={isDisabled}
                          title={isDisabled ? `${label}（分组内容不为空时无法切换）` : label}
                          className={cn(
                            'flex flex-1 items-center justify-center rounded px-1.5 py-1.5 transition-all',
                            group.viewMode === val
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                            isDisabled && 'cursor-not-allowed opacity-40 hover:text-muted-foreground',
                          )}
                          onClick={() => !isDisabled && onSetViewMode(val as BookmarkViewMode)}
                        >
                          {icon}
                        </button>
                      );
                    })}
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
                {/* Iframe config – only in iframe mode */}
                {group.viewMode === 'iframe' && (
                  <>
                    <div className="px-2 py-1.5 space-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">URL</span>
                        <div className="flex gap-1">
                          <Input
                            type="url"
                            placeholder="https://example.com"
                            className="h-8 flex-1 text-xs shadow-none"
                            value={iframeUrlDraft}
                            onChange={(e) => setIframeUrlDraft(e.target.value)}
                            onBlur={() => {
                              onSetIframeConfig(
                                group.id,
                                iframeUrlDraft.trim(),
                                group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT,
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                onSetIframeConfig(
                                  group.id,
                                  iframeUrlDraft.trim(),
                                  group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT,
                                );
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">高度 (px)</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            className="size-7"
                            onClick={() => {
                              const n = Math.max(100, (group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT) - 50);
                              onSetIframeConfig(group.id, iframeUrlDraft.trim(), n);
                            }}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            min={100}
                            max={2000}
                            className="hide-number-spin h-8 w-16 text-center text-xs shadow-none"
                            value={iframeHeightDraft}
                            onChange={(e) => setIframeHeightDraft(e.target.value)}
                            onBlur={() => {
                              const v = parseInt(iframeHeightDraft, 10);
                              if (!isNaN(v) && v >= 100) {
                                onSetIframeConfig(group.id, iframeUrlDraft.trim(), Math.min(2000, v));
                              } else {
                                setIframeHeightDraft(String(group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const v = parseInt(iframeHeightDraft, 10);
                                if (!isNaN(v) && v >= 100) {
                                  onSetIframeConfig(group.id, iframeUrlDraft.trim(), Math.min(2000, v));
                                } else {
                                  setIframeHeightDraft(String(group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT));
                                }
                                (e.target as HTMLInputElement).blur();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            className="size-7"
                            onClick={() => {
                              const n = Math.min(2000, (group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT) + 50);
                              onSetIframeConfig(group.id, iframeUrlDraft.trim(), n);
                            }}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </div>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onOpenIframeUrlPicker(group.id); }}>
                      <BookOpen className="mr-2 size-3.5" />
                      从书签选择
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={(e) => {
                      if (group.iframeUrl) {
                        try {
                          const urlObj = new URL(group.iframeUrl);
                          browser.runtime.sendMessage({
                            type: 'CLEAR_SERVICE_WORKER',
                            origin: urlObj.origin
                          }).then(() => {
                            setIframeReloadKey(k => k + 1);
                          });
                        } catch (err) { }
                      }
                    }}>
                      <Wrench className="mr-2 size-3.5" />
                      清除该站 SW 缓存
                    </DropdownMenuItem>
                  </>
                )}
                {/* Browser-tree config – only in browser-tree mode */}
                {group.viewMode === 'browser-tree' && (
                  <>
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-xs font-medium text-muted-foreground">最多条目数</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          className="size-7"
                          onClick={() => {
                            const n = Math.max(5, (group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS) - 5);
                            onSetBrowserTreeMaxItems(group.id, n);
                            setBtMaxDraft(String(n));
                          }}
                        >
                          −
                        </Button>
                        <Input
                          type="number"
                          min={5}
                          max={300}
                          className="hide-number-spin h-8 w-14 text-center text-xs shadow-none"
                          value={btMaxDraft}
                          onChange={(e) => setBtMaxDraft(e.target.value)}
                          onBlur={() => {
                            const v = parseInt(btMaxDraft, 10);
                            if (!isNaN(v) && v >= 5) {
                              onSetBrowserTreeMaxItems(group.id, Math.min(300, v));
                            } else {
                              setBtMaxDraft(String(group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = parseInt(btMaxDraft, 10);
                              if (!isNaN(v) && v >= 5) {
                                onSetBrowserTreeMaxItems(group.id, Math.min(300, v));
                              } else {
                                setBtMaxDraft(String(group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS));
                              }
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          className="size-7"
                          onClick={() => {
                            const n = Math.min(300, (group.browserTreeMaxItems ?? BROWSER_TREE_DEFAULT_MAX_ITEMS) + 5);
                            onSetBrowserTreeMaxItems(group.id, n);
                            setBtMaxDraft(String(n));
                          }}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onOpenBrowserFolderPicker(group.id); }}>
                      <FolderOpen className="mr-2 size-3.5" />
                      {group.browserTreeFolderId ? '重新选择文件夹' : '选择文件夹'}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                {group.viewMode !== 'browser-tree' && group.viewMode !== 'iframe' && (
                  <DropdownMenuItem
                    onSelect={() => {
                      addSubgroupAfterMenuCloseRef.current = true;
                    }}
                  >
                    <FolderPlus className="mr-2 size-3.5" />
                    添加小组
                  </DropdownMenuItem>
                )}
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
                {spaces.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FolderInput className="mr-2 size-3.5" />
                        移动到
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-44">
                        {spaces.map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            disabled={s.id === activeSpaceId}
                            onSelect={() => onMoveGroupToSpace(group.id, s.id)}
                          >
                            {s.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
                <DropdownMenuItem onSelect={() => onDeleteGroup(group.id)}>
                  <Trash2 className="mr-2 size-3.5" />
                  删除分组
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={allUrls.length === 0}
                  onSelect={() => {
                    for (const url of allUrls) browser.tabs.create({ url });
                  }}
                >
                  <ExternalLink className="mr-2 size-3.5" />
                  打开全部书签
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={allUrls.length === 0}
                  onSelect={() => browser.windows.create({ url: allUrls })}
                >
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开全部
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={allUrls.length === 0}
                  onSelect={() => browser.windows.create({ url: allUrls, incognito: true })}
                >
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开全部
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={allUrls.length === 0}>
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
                    {getGridOpenCounts(allUrls.length).map((count) => (
                      <DropdownMenuItem
                        key={count}
                        onSelect={() => void openUrlsInGrid(allUrls.slice(0, count), compactGridWindows)}
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

        {shouldRenderGroupBody && (
          <div
            className={cn(
              'flex flex-1 flex-col overflow-hidden',
              group.viewMode !== 'browser-tree' && group.viewMode !== 'iframe' ? 'p-2' : 'py-1',
              isIframeBodyHidden && 'h-0 min-h-0 flex-none py-0 opacity-0 pointer-events-none',
            )}
            aria-hidden={isIframeBodyHidden || undefined}
          >
            {group.viewMode === 'iframe' ? (
              group.iframeUrl ? (
                <div className="rounded-md" style={{ height: group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT, overflow: 'clip' }}>
                  {iframeActivated ? (
                    <iframe
                      ref={iframeRef}
                      key={iframeReloadKey}
                      src={group.iframeUrl}
                      title={group.title}
                      className="h-full w-full border-0"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-downloads"
                      allow="fullscreen *; autoplay *; camera *; microphone *; geolocation *; clipboard-read *; clipboard-write *; payment *; encrypted-media *; picture-in-picture *; display-capture *; web-share *; accelerometer *; gyroscope *; magnetometer *; midi *; usb *; bluetooth *; hid *; serial *; gamepad *; screen-wake-lock *; idle-detection *; storage-access *; xr-spatial-tracking *; publickey-credentials-get *"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4">
                      <Globe className="size-8 text-muted-foreground/40" />
                      <p className="max-w-[80%] truncate text-xs text-muted-foreground" title={group.iframeUrl}>
                        {group.iframeUrl}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setIframeActivated(true)}
                      >
                        <Play className="size-3 fill-current" />
                        点击加载
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5">
                  <p className="text-xs text-muted-foreground">请输入要嵌入的网页 URL</p>
                  <Input
                    type="url"
                    placeholder="https://example.com"
                    className="h-9 w-full max-w-sm text-xs shadow-none"
                    value={iframeUrlDraft}
                    onChange={(e) => setIframeUrlDraft(e.target.value)}
                    onBlur={() => {
                      if (iframeUrlDraft.trim()) {
                        onSetIframeConfig(
                          group.id,
                          iframeUrlDraft.trim(),
                          group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT,
                        );
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && iframeUrlDraft.trim()) {
                        onSetIframeConfig(
                          group.id,
                          iframeUrlDraft.trim(),
                          group.iframeHeight ?? IFRAME_DEFAULT_HEIGHT,
                        );
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenIframeUrlPicker(group.id)}
                  >
                    或从书签选择
                  </Button>
                </div>
              )
            ) : group.viewMode === 'browser-tree' ? (
              group.browserTreeFolderId ? (
                <BrowserTreeView
                  folderId={group.browserTreeFolderId}
                  maxItems={group.browserTreeMaxItems}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-5">
                  <p className="text-xs text-muted-foreground">尚未选择书签文件夹</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenBrowserFolderPicker(group.id)}
                  >
                    点此选择文件夹
                  </Button>
                </div>
              )
            ) : group.bookmarks.length === 0 && group.subgroups.length === 0 ? (
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
                    bookmarks={group.bookmarks}
                    target={groupRootTarget}
                    emptyHint=""
                    spaces={spaces}
                    activeSpaceId={activeSpaceId}
                    onMoveBookmarkToSpace={onMoveBookmarkToSpace}
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
                        spaces={spaces}
                        activeSpaceId={activeSpaceId}
                        onMoveSubgroupToSpace={onMoveSubgroupToSpace}
                        onMoveBookmarkToSpace={onMoveBookmarkToSpace}
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
