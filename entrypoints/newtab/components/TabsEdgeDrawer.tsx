import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, PanelsTopLeft } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { browser, type Browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

import { useDndUIStore } from '../drag';
import { FaviconImage } from './FaviconImage';

type BrowserTab = Browser.tabs.Tab;

const COLLAPSED_W = 44;
const EXPANDED_W = 280;
const CLOSE_DELAY_MS = 180;
const TABS_REVERSED_KEY = 'newtab-pro-tabs-reversed';

function TabDraggableItem({
  tab,
  expanded,
  onContextMenuOpenChange,
}: {
  tab: BrowserTab;
  expanded: boolean;
  onContextMenuOpenChange?: (open: boolean) => void;
}) {
  const title = tab.title || tab.url || '未命名';

  // 跟踪当前项的右键菜单是否打开，用于保持高亮背景
  const [menuOpen, setMenuOpen] = useState(false);
  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    onContextMenuOpenChange?.(open);
  };

  const dndId = `tab|${tab.id}`;
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: dndId,
    data: {
      type: 'tab',
      tab: { title, url: tab.url! },
    },
  });

  const { activeId } = useDndUIStore();
  const isDragging = activeId === dndId;

  return (
    <ContextMenu onOpenChange={handleMenuOpenChange}>
      <ContextMenuTrigger asChild>
        <button
          ref={setNodeRef}
          id={`dnd-${dndId}`}
          {...listeners}
          {...attributes}
          type="button"
          title={`${title}\n${tab.url}`}
          className={cn(
            'group flex w-full min-w-0 shrink-0 items-center rounded-xl border border-transparent py-1.5',
            expanded ? 'gap-2.5 overflow-hidden' : 'justify-center gap-0 overflow-visible',
            'text-left transition-[background-color,border-color,opacity] duration-150',
            'hover:border-border/60 hover:bg-muted/45 active:bg-muted/55',
            'cursor-grab active:cursor-grabbing',
            isDragging && 'opacity-40',
            menuOpen && 'border-border/60 bg-muted/55',
          )}
          style={{ paddingLeft: expanded ? 6 : 1, paddingRight: expanded ? 6 : 1 }}
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-lg bg-background/75 shadow-xs ring-1 ring-border/40',
              expanded ? 'size-7' : 'size-[1.625rem]',
            )}
          >
            <FaviconImage
              url={tab.url || ''}
              tabIconUrl={tab.favIconUrl}
              className={cn('rounded-[3px] object-contain', expanded ? 'size-4' : 'size-3.5')}
              onError={(e: any) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </span>
          <div
            className={cn(
              'block min-w-0 flex-1 truncate whitespace-nowrap text-[12px] text-foreground/85 transition-[opacity,transform] duration-200',
              expanded ? 'opacity-100' : 'max-w-0 opacity-0',
            )}
          >
            {title}
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(title).catch(() => {})}>
          复制标题
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!tab.url}
          onSelect={() => tab.url && navigator.clipboard.writeText(tab.url).catch(() => {})}
        >
          复制 URL
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function TabsEdgeDrawer() {
  const [manualExpanded, setManualExpanded] = useState(false);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [reversed, setReversed] = useState(() => {
    try {
      return localStorage.getItem(TABS_REVERSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const closeTimer = useRef<number | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  // 跟踪鼠标是否在侧栏内，用于菜单关闭后判断是否需要收缩
  const mouseInsideRef = useRef(false);

  const { activeId } = useDndUIStore();
  const isDraggingTab = activeId?.startsWith('tab|') ?? false;
  const expanded = isDraggingTab ? false : manualExpanded;

  const loadTabs = useCallback(async () => {
    try {
      const all = await browser.tabs.query({ currentWindow: true });
      const filtered = all
        .filter(
          (t) =>
            !!t.url &&
            !t.url.startsWith('chrome://newtab') &&
            !t.url.startsWith('edge://newtab'),
        )
        .sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (a.index ?? 0) - (b.index ?? 0);
        });
      setTabs(filtered);
    } catch { }
  }, []);

  useEffect(() => {
    void loadTabs();
    const handler = () => void loadTabs();
    browser.tabs.onUpdated.addListener(handler);
    browser.tabs.onRemoved.addListener(handler);
    browser.tabs.onCreated.addListener(handler);
    // 标签拖入当前窗口（onAttached）或拖出当前窗口（onDetached）时也需要刷新
    browser.tabs.onAttached.addListener(handler);
    browser.tabs.onDetached.addListener(handler);
    return () => {
      browser.tabs.onUpdated.removeListener(handler);
      browser.tabs.onRemoved.removeListener(handler);
      browser.tabs.onCreated.removeListener(handler);
      browser.tabs.onAttached.removeListener(handler);
      browser.tabs.onDetached.removeListener(handler);
    };
  }, [loadTabs]);

  const clearTimer = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearTimer();
    mouseInsideRef.current = true;
    setManualExpanded(true);
  };

  const handleMouseLeave = () => {
    mouseInsideRef.current = false;
    if (contextMenuOpen) return;
    clearTimer();
    closeTimer.current = window.setTimeout(() => setManualExpanded(false), CLOSE_DELAY_MS);
  };

  // 右键菜单关闭后，若鼠标已离开侧栏，则触发收缩
  useEffect(() => {
    if (contextMenuOpen) return;
    if (mouseInsideRef.current) return;
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    closeTimer.current = window.setTimeout(() => setManualExpanded(false), CLOSE_DELAY_MS);
  }, [contextMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayTabs = reversed ? [...tabs].reverse() : tabs;

  return (
    <aside
      className={cn(
        'fixed inset-y-1.5 left-1.5 z-50 flex flex-col overflow-hidden rounded-2xl border border-border/60',
        'bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,247,250,0.94))] backdrop-blur-xl',
        'shadow-[0_12px_30px_rgba(15,23,42,0.08)]',
        'transition-[width,box-shadow,transform] duration-250 ease-out',
        expanded ? 'translate-x-0' : 'translate-x-0',
      )}
      style={{ width: expanded ? EXPANDED_W : COLLAPSED_W, height: 'calc(100vh - 12px)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部标题 */}
      <div
        className={cn(
          'flex h-12 shrink-0 items-center border-b border-border/50',
          expanded ? 'justify-between px-3' : 'justify-center px-1.5',
        )}
        style={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      >
        <div className={cn('flex items-center', expanded ? 'gap-2' : 'justify-center')}>
          <span
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
              expanded ? 'size-7' : 'size-[1.625rem]',
            )}
          >
            <PanelsTopLeft className="size-4" />
          </span>
          {expanded ? (
            <div className="min-w-0 transition-[opacity,transform] duration-200">
              <div className="whitespace-nowrap text-xs font-semibold tracking-wide text-foreground/85">
                打开的标签页
              </div>
              <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                拖拽到右侧即可快速创建书签
              </div>
            </div>
          ) : null}
        </div>
        {expanded ? (
          <Button
            size="icon-xs"
            variant="ghost"
            className={cn(
              'transition-[opacity,background-color,color] duration-150',
              reversed
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setReversed((prev) => {
              const next = !prev;
              try { localStorage.setItem(TABS_REVERSED_KEY, String(next)); } catch { }
              return next;
            })}
            title={reversed ? '已颠倒顺序（点击恢复）' : '颠倒顺序'}
          >
            <ArrowDownUp className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {/* 标签列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="flex min-w-0 max-w-full flex-col gap-1 py-3"
          style={{ paddingLeft: expanded ? 8 : 4, paddingRight: expanded ? 8 : 4 }}
        >
          {displayTabs.map((tab) => (
            <TabDraggableItem
              key={tab.id}
              tab={tab}
              expanded={expanded}
              onContextMenuOpenChange={setContextMenuOpen}
            />
          ))}
        </div>
      </div>

      {/* 底部提示 */}
      <div
        className={cn(
          'flex shrink-0 items-center border-t border-border/50 px-3 py-2',
          'whitespace-nowrap text-[10px] text-muted-foreground/70',
          'transition-[opacity,transform] duration-200',
          expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ width: EXPANDED_W }}
      >
        右键可复制标题或 URL
      </div>
    </aside>
  );
}
