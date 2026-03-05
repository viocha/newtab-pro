import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
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
            'group flex w-full shrink-0 items-center gap-2.5 rounded-lg py-1.5',
            'text-left transition-colors duration-100',
            'hover:bg-accent/80 active:bg-accent',
            'cursor-grab active:cursor-grabbing',
            isDragging && 'opacity-40',
            menuOpen && 'bg-accent/80',
          )}
          style={{ paddingLeft: expanded ? 6 : 0, paddingRight: expanded ? 6 : 0 }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-background/60 shadow-sm">
            <FaviconImage
              url={tab.url || ''}
              tabIconUrl={tab.favIconUrl}
              className="size-4 rounded-[3px] object-contain"
              onError={(e: any) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12px] text-foreground/85 transition-opacity duration-150 whitespace-nowrap',
              expanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            {title}
          </span>
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
    closeTimer.current = window.setTimeout(() => setManualExpanded(false), 180);
  };

  // 右键菜单关闭后，若鼠标已离开侧栏，则触发收缩
  useEffect(() => {
    if (contextMenuOpen) return;
    if (mouseInsideRef.current) return;
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    closeTimer.current = window.setTimeout(() => setManualExpanded(false), 180);
  }, [contextMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayTabs = reversed ? [...tabs].reverse() : tabs;

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex flex-col',
        'bg-card/92 backdrop-blur-md',
        'border-r border-border/60',
        'shadow-[2px_0_16px_rgba(0,0,0,0.06)]',
        'transition-[width] duration-200 ease-out overflow-hidden',
      )}
      style={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部标题 */}
      <div
        className="flex h-10 shrink-0 items-center justify-between border-b border-border/50 px-3"
        style={{ width: EXPANDED_W }}
      >
        <span
          className={cn(
            'whitespace-nowrap text-xs font-semibold text-muted-foreground tracking-wide transition-opacity duration-150',
            expanded ? 'opacity-100' : 'opacity-0',
          )}
        >
          打开的标签页
        </span>
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            'size-6 transition-opacity duration-150',
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
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
      </div>

      {/* 标签列表 */}
      <div
        className="flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-2 flex-1"
        style={{ paddingLeft: expanded ? 6 : 'calc((44px - 28px) / 2)', paddingRight: expanded ? 6 : 'calc((44px - 28px) / 2)' }}
      >
        {displayTabs.length === 0 && (
          <div className="flex items-center justify-center py-6 text-[11px] text-muted-foreground">
            …
          </div>
        )}
        {displayTabs.map((tab) => (
          <TabDraggableItem
            key={tab.id}
            tab={tab}
            expanded={expanded}
            onContextMenuOpenChange={setContextMenuOpen}
          />
        ))}
      </div>

      {/* 底部提示 */}
      <div
        className={cn(
          'flex shrink-0 items-center border-t border-border/50 px-3 py-1.5',
          'text-[10px] text-muted-foreground/70 whitespace-nowrap',
          'transition-opacity duration-150',
          expanded ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ width: EXPANDED_W }}
      >
        拖拽标签页到右侧，快速添加书签
      </div>
    </aside>
  );
}
