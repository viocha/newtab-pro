import React, { useEffect, useState } from 'react';
import { BookmarkText } from './BookmarkText';
import {
  AppWindow,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  EyeOff,
  Folder,
  FolderOpen,
  MapPin,
  PanelsTopLeft,
} from 'lucide-react';
import { browser, type Browser } from 'wxt/browser';

import {
  ContextMenuGroup,
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

import { BROWSER_TREE_DEFAULT_MAX_ITEMS } from '../constants';
import { FaviconImage } from './FaviconImage';
import {
  getGridOpenCounts,
  openUrlsInGrid,
  useWindowOpenPrefs,
} from '../window-open';

/** 每行的近似高度（px），用于将 maxItems 换算成 maxHeight */
const ITEM_HEIGHT_PX = 28;

/** 通过 management API 找到 Bookmark Pro 扩展并发送定位消息 */
async function locateInBookmarkPro(nodeId: string): Promise<void> {
  try {
    const extensions = await chrome.management.getAll();
    const bookmarkPro = extensions.find(
      (ext) => ext.name === 'Bookmark Pro' && ext.enabled,
    );
    if (!bookmarkPro) {
      console.warn('[Newtab Pro] Bookmark Pro 扩展未找到或未启用');
      return;
    }
    // 发送定位请求到 Bookmark Pro 的 background
    chrome.runtime.sendMessage(bookmarkPro.id, {
      type: 'LOCATE_BOOKMARK',
      nodeId,
    });
  } catch (err) {
    console.error('[Newtab Pro] 发送定位请求失败:', err);
  }
}

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

type Props = {
  /** 要展示的浏览器书签文件夹 ID */
  folderId: string;
  /**
   * 可见区域最多容纳的条目行数，超出后需向下滚动。
   * 实际高度 = maxItems × ITEM_HEIGHT_PX。
   */
  maxItems?: number;
  /** 贴合父容器高度，由自身承担滚动 */
  fitParentHeight?: boolean;
  /** 关闭自定义上下文菜单，改用浏览器原生右键菜单 */
  disableCustomContextMenu?: boolean;
  scrollViewportProps?: React.ComponentProps<typeof ScrollArea>['viewportProps'];
};

export function BrowserTreeView({
  folderId,
  maxItems = BROWSER_TREE_DEFAULT_MAX_ITEMS,
  fitParentHeight = false,
  disableCustomContextMenu = false,
  scrollViewportProps,
}: Props) {
  const { compactGridWindows, setCompactGridWindows } = useWindowOpenPrefs();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextOpenId, setContextOpenId] = useState<string | null>(null);

  // 加载指定文件夹的书签树
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const result = await browser.bookmarks.getSubTree(folderId);
        if (!alive) return;
        setNodes(result[0]?.children ?? []);
        setError('');
      } catch (e) {
        if (!alive) return;
        setError(`加载失败：${String(e)}`);
      } finally {
        if (alive) setLoading(false);
      }
    };

    setLoading(true);
    // 不立即清空节点，保持旧内容可见，避免高度闪烁；load() 成功后会替换
    void load();

    // 监听书签变化，静默重新加载（保留展开状态）
    const reload = () => {
      void load();
    };
    browser.bookmarks.onCreated.addListener(reload);
    browser.bookmarks.onRemoved.addListener(reload);
    browser.bookmarks.onChanged.addListener(reload);
    browser.bookmarks.onMoved.addListener(reload);

    return () => {
      alive = false;
      browser.bookmarks.onCreated.removeListener(reload);
      browser.bookmarks.onRemoved.removeListener(reload);
      browser.bookmarks.onChanged.removeListener(reload);
      browser.bookmarks.onMoved.removeListener(reload);
    };
  }, [folderId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 递归收集节点下所有书签 URL */
  const collectNodeUrls = (node: TreeNode): string[] => {
    const urls: string[] = [];
    const walk = (n: TreeNode) => {
      if (n.url) urls.push(n.url);
      n.children?.forEach(walk);
    };
    walk(node);
    return urls;
  };

  const renderNodes = (items: TreeNode[], depth: number): React.ReactNode =>
    [...items]
      .sort((a, b) => {
        const aFolder = !a.url;
        const bFolder = !b.url;
        if (aFolder === bFolder) return 0;
        return aFolder ? -1 : 1;
      })
      .map((node) => {
        const key = node.id || `${node.title}-${node.url}-${depth}`;
        const isFolder = !node.url;
        const hasChildren = !!node.children?.length;
        const isExpanded = expandedIds.has(node.id);
        // 书签内容比文件夹多缩进一点，与展开箭头区域对齐
        const indent = isFolder ? depth * 14 + 4 : depth * 14 + 4;

        if (isFolder) {
          const folderUrls = collectNodeUrls(node);
          const folderRow = (
            <div
              className={cn(
                'flex cursor-pointer select-none items-center gap-1 overflow-hidden rounded px-1 py-1 text-xs hover:bg-accent/60',
                contextOpenId === node.id &&
                  !disableCustomContextMenu &&
                  'bg-accent/60',
              )}
              style={{ paddingLeft: `${indent}px` }}
              onClick={() => hasChildren && toggleExpand(node.id)}
            >
              <span
                className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasChildren) toggleExpand(node.id);
                }}
              >
                {hasChildren ? (
                  isExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )
                ) : (
                  <span className="size-3" />
                )}
              </span>

              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                {isExpanded ? (
                  <FolderOpen className="size-3.5 text-amber-500" />
                ) : (
                  <Folder className="size-3.5 text-amber-500" />
                )}
              </span>

              <span className="min-w-0 flex-1 truncate text-foreground/90">
                {node.title || '未命名文件夹'}
              </span>
            </div>
          );

          if (disableCustomContextMenu) {
            return (
              <React.Fragment key={key}>
                {folderRow}
                {hasChildren &&
                  isExpanded &&
                  renderNodes(node.children!, depth + 1)}
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={key}>
              <ContextMenu
                onOpenChange={(open) => setContextOpenId(open ? node.id : null)}
              >
                <ContextMenuTrigger render={folderRow} />
                <ContextMenuContent>
                  <ContextMenuGroup>
                    {folderUrls.length > 0 && (
                      <>
                        <ContextMenuItem
                          onClick={() => {
                            for (const u of folderUrls)
                              void browser.tabs.create({ url: u });
                          }}
                        >
                          <ExternalLink className="mr-2 size-3.5" />
                          打开全部书签
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() =>
                            void browser.windows.create({ url: folderUrls })
                          }
                        >
                          <AppWindow className="mr-2 size-3.5" />
                          在新窗口打开全部
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() =>
                            void browser.windows.create({
                              url: folderUrls,
                              incognito: true,
                            })
                          }
                        >
                          <EyeOff className="mr-2 size-3.5" />
                          在隐私窗口打开全部
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger>
                            <PanelsTopLeft className="mr-2 size-3.5" />
                            多窗口网格打开
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-44">
                            <ContextMenuGroup>
                              <ContextMenuCheckboxItem
                                checked={compactGridWindows}
                                closeOnClick={false}
                                onCheckedChange={(next) =>
                                  setCompactGridWindows(!!next)
                                }
                              >
                                简化窗口
                              </ContextMenuCheckboxItem>
                              <ContextMenuSeparator />
                              {getGridOpenCounts(folderUrls.length).map(
                                (count) => (
                                  <ContextMenuItem
                                    key={count}
                                    onClick={() =>
                                      void openUrlsInGrid(
                                        folderUrls.slice(0, count),
                                        compactGridWindows,
                                      )
                                    }
                                  >
                                    打开前 {count} 个
                                  </ContextMenuItem>
                                ),
                              )}
                            </ContextMenuGroup>
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                      </>
                    )}
                    <ContextMenuItem
                      onClick={() => void locateInBookmarkPro(node.id)}
                    >
                      <MapPin className="mr-2 size-3.5" />
                      在侧栏书签中定位
                    </ContextMenuItem>
                  </ContextMenuGroup>
                </ContextMenuContent>
              </ContextMenu>
              {hasChildren &&
                isExpanded &&
                renderNodes(node.children!, depth + 1)}
            </React.Fragment>
          );
        }

        // 书签节点：普通点击在当前标签页打开，修饰键和中键沿用浏览器行为
        const bookmarkRow = (
          <a
            href={node.url}
            target="_self"
            title={node.url ? `${node.title}\n${node.url}` : node.title}
            className={cn(
              'flex select-none items-center gap-1 overflow-hidden rounded px-1 py-1 text-xs hover:bg-accent/60',
              contextOpenId === node.id &&
                !disableCustomContextMenu &&
                'bg-accent/60',
            )}
            style={{
              paddingLeft: `${indent + 4}px`,
              textDecoration: 'none',
              color: 'inherit',
            }}
            onClick={(e) => {
              const url = node.url;
              if (!url || !/^(?:edge|chrome|about):/.test(url)) return;
              e.preventDefault();
              if (e.altKey) return;
              if (e.ctrlKey && e.shiftKey)
                void browser.tabs.create({ url, active: true });
              else if (e.ctrlKey || e.metaKey)
                void browser.tabs.create({ url, active: false });
              else if (e.shiftKey) void browser.windows.create({ url });
              else void browser.tabs.update({ url });
            }}
            onAuxClick={(e) => {
              const url = node.url;
              if (
                e.button !== 1 ||
                !url ||
                !/^(?:edge|chrome|about):/.test(url)
              )
                return;
              e.preventDefault();
              void browser.tabs.create({ url, active: e.shiftKey });
            }}
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center" />

            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <FaviconImage
                url={node.url || ''}
                className="size-3.5 rounded-[3px]"
                loading="lazy"
              />
            </span>

            <BookmarkText title={node.title} url={node.url} mode="tree" className="text-foreground/80" />
          </a>
        );

        if (disableCustomContextMenu) {
          return <React.Fragment key={key}>{bookmarkRow}</React.Fragment>;
        }

        return (
          <ContextMenu
            key={key}
            onOpenChange={(open) => setContextOpenId(open ? node.id : null)}
          >
            <ContextMenuTrigger render={bookmarkRow} />
            <ContextMenuContent>
              <ContextMenuGroup>
                <ContextMenuItem
                  onClick={() => navigator.clipboard.writeText(node.url ?? '')}
                >
                  <Copy className="mr-2 size-3.5" />
                  复制链接
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => {
                    if (node.url) void browser.tabs.create({ url: node.url });
                  }}
                >
                  <ExternalLink className="mr-2 size-3.5" />
                  在新标签页打开
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    if (node.url)
                      void browser.windows.create({ url: node.url });
                  }}
                >
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    if (node.url)
                      void browser.windows.create({
                        url: node.url,
                        incognito: true,
                      });
                  }}
                >
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => void locateInBookmarkPro(node.id)}
                >
                  <MapPin className="mr-2 size-3.5" />
                  在侧栏书签中定位
                </ContextMenuItem>
              </ContextMenuGroup>
            </ContextMenuContent>
          </ContextMenu>
        );
      });

  // 可见区域最大高度
  const maxHeight = maxItems * ITEM_HEIGHT_PX;

  // 初次加载时用固定高度占位，避免高度闪烁
  if (loading && nodes.length === 0) {
    return fitParentHeight ? (
      <div className="h-full min-h-0 rounded" />
    ) : (
      <div style={{ height: maxHeight }} className="rounded" />
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[2.5rem] items-center px-2 text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-8 items-center px-2 text-xs text-muted-foreground">
        此文件夹为空
      </div>
    );
  }

  return (
    <ScrollArea
      viewportProps={scrollViewportProps}
      style={fitParentHeight ? { height: '100%' } : { maxHeight }}
      className={cn(
        'bookmark-scroll-area min-h-0 min-w-0 max-w-full rounded',
        !fitParentHeight && '[&>[data-slot=scroll-area-viewport]]:h-auto',
      )}
    >
      <div className="min-w-0 max-w-full overflow-x-hidden px-2.5 py-0.5">
        {renderNodes(nodes, 0)}
      </div>
    </ScrollArea>
  );
}
