import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, Link2, Search } from 'lucide-react';
import { browser, type Browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { Space } from '../types';
import { FaviconImage } from './FaviconImage';

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

function createTreeNode(node: Partial<TreeNode> & Pick<TreeNode, 'id' | 'title'>): TreeNode {
  return {
    dateAdded: 0,
    dateGroupModified: 0,
    index: 0,
    parentId: '',
    syncing: false,
    ...node,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已有的 URL（回填选中状态） */
  initialUrl?: string;
  /** 用户点击确认时回调，携带选中的 url 和 title */
  onConfirm: (url: string, title: string) => void;
  /** 当前应用所有空间的书签数据，用于在顶部显示"应用书签"分区 */
  spaces?: Space[];
};

function nodeMatchesQuery(node: TreeNode, query: string) {
  if (!query) return true;
  const text = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  return text.includes(query);
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) return nodes;
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const children = node.children ? filterTree(node.children, query) : [];
    const isMatch = nodeMatchesQuery(node, query);
    if (!isMatch && children.length === 0) continue;
    result.push({ ...node, children: children.length > 0 ? children : undefined });
  }
  return result;
}

/** 将应用内所有空间的书签数据转换为与浏览器书签相同的树节点格式 */
function spacesToTreeNodes(spaces: Space[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const space of spaces) {
    for (const group of space.board.groups) {
      const children: TreeNode[] = [];
      // 分组直属书签
      for (const bm of group.bookmarks) {
        children.push(createTreeNode({ id: `app-bm-${bm.id}`, title: bm.title, url: bm.url }));
      }
      // 小组（过滤空小组）
      for (const sg of group.subgroups) {
        if (sg.bookmarks.length === 0) continue;
        const sgChildren: TreeNode[] = sg.bookmarks.map((bm) =>
          createTreeNode({
            id: `app-bm-${bm.id}`,
            title: bm.title,
            url: bm.url,
          }),
        );
        children.push(createTreeNode({ id: `app-sg-${sg.id}`, title: sg.title, children: sgChildren }));
      }
      if (children.length === 0) continue; // 过滤空分组
      result.push(createTreeNode({ id: `app-gr-${group.id}`, title: group.title, children }));
    }
  }
  return result;
}

export function IframeUrlPickerDialog({ open, onOpenChange, initialUrl, onConfirm, spaces }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedUrl, setSelectedUrl] = useState('');
  const [selectedTitle, setSelectedTitle] = useState('');

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 打开时加载书签树
  useEffect(() => {
    if (!open) return;
    setSelectedUrl(initialUrl ?? '');
    setSelectedTitle('');
    setQuery('');
    setDebouncedQuery('');
    setLoading(true);
    setError('');

    let alive = true;
    void (async () => {
      try {
        const payload = await browser.bookmarks.getTree();
        if (!alive) return;
        const roots = payload.flatMap((n) => n.children ?? []);
        const bookmarksBar = roots.find((n) => n.folderType === 'bookmarks-bar') || roots[0];
        setTree(roots);
        setExpandedIds(new Set(bookmarksBar?.id ? [bookmarksBar.id] : []));
      } catch (e) {
        if (!alive) return;
        setError(`读取浏览器书签失败：${String(e)}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const forceExpanded = normalizedQuery.length > 0;
  const visibleTree = useMemo(() => filterTree(tree, normalizedQuery), [tree, normalizedQuery]);

  // 应用书签树
  const appNodes = useMemo(() => (spaces?.length ? spacesToTreeNodes(spaces) : []), [spaces]);
  const visibleAppNodes = useMemo(() => filterTree(appNodes, normalizedQuery), [appNodes, normalizedQuery]);

  const hasMultiSection = visibleAppNodes.length > 0 && visibleTree.length > 0;

  const toggleExpanded = (id: string) => {
    if (forceExpanded) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    [...nodes].sort((a, b) => {
      const aFolder = !a.url;
      const bFolder = !b.url;
      if (aFolder === bFolder) return 0;
      return aFolder ? -1 : 1;
    }).map((node) => {
      const key = node.id || `${node.title}-${node.url}`;
      const isFolder = !node.url;
      const hasChildren = !!node.children?.length;
      const isExpanded = forceExpanded || expandedIds.has(node.id);
      const isSelected = !!node.url && node.url === selectedUrl;

      if (isFolder) {
        return (
          <div key={key} className="select-none">
            <div
              className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => node.id && hasChildren && toggleExpanded(node.id)}
            >
              <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                {hasChildren ? (
                  isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
                ) : null}
              </span>
              <span className="inline-flex size-4 items-center justify-center">
                {isExpanded
                  ? <FolderOpen className="size-3.5 text-amber-500" />
                  : <Folder className="size-3.5 text-amber-500" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{node.title || '未命名文件夹'}</span>
            </div>
            {hasChildren && isExpanded ? renderNodes(node.children!, depth + 1) : null}
          </div>
        );
      }

      // 书签叶子节点
      return (
        <div key={key} className="select-none">
          <div
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs',
              isSelected
                ? 'bg-primary/12 text-primary font-medium'
                : 'hover:bg-accent',
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (node.url) {
                setSelectedUrl(node.url);
                setSelectedTitle(node.title || node.url || '');
              }
            }}
            onDoubleClick={() => {
              // 双击直接确认
              if (node.url) {
                onConfirm(node.url, node.title || node.url || '');
                onOpenChange(false);
              }
            }}
          >
            <span className="inline-flex size-4 items-center justify-center" />
            <span className="inline-flex size-4 shrink-0 items-center justify-center">
              <FaviconImage url={node.url || ''} className="size-3.5 rounded-sm" loading="lazy" />
            </span>
            <span className="min-w-0 flex-1 truncate">{node.title || node.url}</span>
            {isSelected && <Check className="ml-1 size-3 shrink-0 text-primary" />}
          </div>
        </div>
      );
    });

  const handleConfirm = () => {
    if (!selectedUrl) return;
    onConfirm(selectedUrl, selectedTitle);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(96vw,720px)] flex-col gap-3 overflow-hidden sm:max-w-[720px] [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>从书签选择 URL</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索书签..."
            className="pl-9"
          />
        </div>

        <div className="h-[min(60vh,480px)] overflow-y-auto rounded-lg border border-border/70 bg-background/60">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">加载中…</div>
          ) : error ? (
            <div className="flex h-32 items-center justify-center px-4 text-xs text-destructive">{error}</div>
          ) : visibleAppNodes.length === 0 && visibleTree.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5" />
              没有匹配结果
            </div>
          ) : (
            <div className="py-1">
              {/* ── 应用书签分区 ── */}
              {visibleAppNodes.length > 0 && (
                <>
                  {hasMultiSection && (
                    <div className="bg-background px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      应用书签
                    </div>
                  )}
                  {renderNodes(visibleAppNodes, 0)}
                </>
              )}
              {/* ── 浏览器书签分区 ── */}
              {visibleTree.length > 0 && (
                <>
                  {hasMultiSection && (
                    <div className="border-t border-border/40 bg-background px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      浏览器书签
                    </div>
                  )}
                  {renderNodes(visibleTree, 0)}
                </>
              )}
            </div>
          )}
        </div>

        {/* 已选 URL 预览（始终占位，避免点击时布局跳动） */}
        <div className={cn(
          'flex min-w-0 items-center gap-2 overflow-hidden rounded-md px-3 py-1.5 text-xs transition-colors',
          selectedUrl ? 'bg-muted/50 text-muted-foreground' : 'bg-muted/20 text-muted-foreground/40',
        )}>
          <Link2 className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {selectedUrl || '点击书签以选择 URL'}
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" disabled={!selectedUrl} onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
