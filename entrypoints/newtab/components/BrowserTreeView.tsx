import React, { useEffect, useState } from 'react';
import { AppWindow, ChevronDown, ChevronRight, Copy, ExternalLink, EyeOff, Folder, FolderOpen } from 'lucide-react';
import { browser, type Browser } from 'wxt/browser';


import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

import { BROWSER_TREE_DEFAULT_MAX_ITEMS } from '../constants';
import { FaviconImage } from './FaviconImage';

/** 每行的近似高度（px），用于将 maxItems 换算成 maxHeight */
const ITEM_HEIGHT_PX = 28;

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

type Props = {
  /** 要展示的浏览器书签文件夹 ID */
  folderId: string;
  /**
   * 可见区域最多容纳的条目行数，超出后需向下滚动。
   * 实际高度 = maxItems × ITEM_HEIGHT_PX。
   */
  maxItems?: number;
};

export function BrowserTreeView({
  folderId,
  maxItems = BROWSER_TREE_DEFAULT_MAX_ITEMS,
}: Props) {
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
    setNodes([]);
    void load();

    // 监听书签变化，静默重新加载（保留展开状态）
    const reload = () => { void load(); };
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
    const walk = (n: TreeNode) => { if (n.url) urls.push(n.url); n.children?.forEach(walk); };
    walk(node);
    return urls;
  };

  const renderNodes = (items: TreeNode[], depth: number): React.ReactNode =>
    items.map((node) => {
      const key = node.id || `${node.title}-${node.url}-${depth}`;
      const isFolder = !node.url;
      const hasChildren = !!(node.children?.length);
      const isExpanded = expandedIds.has(node.id);
      // 书签内容比文件夹多缩进一点，与展开箭头区域对齐
      const indent = isFolder ? depth * 14 + 4 : depth * 14 + 4;

      if (isFolder) {
        const folderUrls = collectNodeUrls(node);
        return (
          <React.Fragment key={key}>
          <ContextMenu onOpenChange={(open) => setContextOpenId(open ? node.id : null)}>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  'flex cursor-pointer select-none items-center gap-1 overflow-hidden rounded px-1 py-1 text-xs hover:bg-accent/60',
                  contextOpenId === node.id && 'bg-accent/60',
                )}
                style={{ paddingLeft: `${indent}px` }}
                onClick={() => hasChildren && toggleExpand(node.id)}
              >
                {/* 展开箭头 */}
                <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(node.id); }}
                >
                  {hasChildren ? (
                    isExpanded
                      ? <ChevronDown className="size-3" />
                      : <ChevronRight className="size-3" />
                  ) : (
                    <span className="size-3" />
                  )}
                </span>

                {/* 文件夹图标 */}
                <span className="inline-flex size-4 shrink-0 items-center justify-center">
                  {isExpanded
                    ? <FolderOpen className="size-3.5 text-amber-500" />
                    : <Folder className="size-3.5 text-amber-500" />}
                </span>

                <span className="min-w-0 flex-1 truncate text-foreground/90">
                  {node.title || '未命名文件夹'}
                </span>
              </div>
            </ContextMenuTrigger>
            {folderUrls.length > 0 && (
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => { for (const u of folderUrls) void browser.tabs.create({ url: u }); }}>
                  <ExternalLink className="mr-2 size-3.5" />
                  打开全部书签
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void browser.windows.create({ url: folderUrls })}>
                  <AppWindow className="mr-2 size-3.5" />
                  在新窗口打开全部
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => void browser.windows.create({ url: folderUrls, incognito: true })}>
                  <EyeOff className="mr-2 size-3.5" />
                  在隐私窗口打开全部
                </ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
          {hasChildren && isExpanded && renderNodes(node.children!, depth + 1)}
          </React.Fragment>
      );
      }

      // 书签节点：左键在新标签页打开，中键后台打开，右键显示菜单
      return (
        <ContextMenu key={key} onOpenChange={(open) => setContextOpenId(open ? node.id : null)}>
          <ContextMenuTrigger asChild>
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              title={node.url ? `${node.title}\n${node.url}` : node.title}
              className={cn(
                'flex select-none items-center gap-1 overflow-hidden rounded px-1 py-1 text-xs hover:bg-accent/60',
                contextOpenId === node.id && 'bg-accent/60',
              )}
              style={{ paddingLeft: `${indent + 4}px`, textDecoration: 'none', color: 'inherit' }}
              onClick={(e) => {
                e.preventDefault();
                if (node.url) void browser.tabs.create({ url: node.url });
              }}
            >
              {/* 占位，与展开箭头列对齐 */}
              <span className="inline-flex size-4 shrink-0 items-center justify-center" />

              {/* Favicon */}
              <span className="inline-flex size-4 shrink-0 items-center justify-center">
                <FaviconImage
                  url={node.url || ''}
                  className="size-3.5 rounded-[3px]"
                  loading="lazy"
                />
              </span>

              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {node.title || node.url || '未命名'}
              </span>
            </a>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => navigator.clipboard.writeText(node.url ?? '')}>
              <Copy className="mr-2 size-3.5" />
              复制链接
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => { if (node.url) void browser.tabs.create({ url: node.url }); }}>
              <ExternalLink className="mr-2 size-3.5" />
              在新标签页打开
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => { if (node.url) void browser.windows.create({ url: node.url }); }}>
              <AppWindow className="mr-2 size-3.5" />
              在新窗口打开
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => { if (node.url) void browser.windows.create({ url: node.url, incognito: true }); }}>
              <EyeOff className="mr-2 size-3.5" />
              在隐私窗口打开
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );
    });

  // 可见区域最大高度
  const maxHeight = maxItems * ITEM_HEIGHT_PX;

  // 初次加载时静默等待，避免闪烁"正在加载"文字
  if (loading && nodes.length === 0) return null;

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
    <div style={{ maxHeight, overflowY: 'auto' }} className="rounded">
      <div className="overflow-x-hidden py-0.5 pr-1">
        {renderNodes(nodes, 0)}
      </div>
    </div>
  );
}
