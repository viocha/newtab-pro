import { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, ChevronDown, ChevronRight, Folder, FolderOpen, Link2, Search } from 'lucide-react';
import { browser, type Browser } from 'wxt/browser';


import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';



import { FaviconImage } from './FaviconImage';

type BookmarkTreeDialogProps = {
  open: boolean;
  targetLabel?: string;
  onOpenChange: (next: boolean) => void;
  onAddBookmark: (bookmark: { title: string; url: string }) => void;
};

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

function nodeMatchesQuery(node: TreeNode, query: string) {
  if (!query) {
    return true;
  }

  const text = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  return text.includes(query);
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query) {
    return nodes;
  }

  const result: TreeNode[] = [];

  for (const node of nodes) {
    const children = node.children ? filterTree(node.children, query) : [];
    const isMatch = nodeMatchesQuery(node, query);
    if (!isMatch && children.length === 0) {
      continue;
    }

    result.push({
      ...node,
      children: children.length > 0 ? children : undefined,
    });
  }

  return result;
}

export function BookmarkTreeDialog({ open, targetLabel, onOpenChange, onAddBookmark }: BookmarkTreeDialogProps) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Debounce the query so filterTree only runs after typing pauses
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let alive = true;
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const payload = await browser.bookmarks.getTree();
        if (!alive) {
          return;
        }

        const roots = payload.flatMap((node) => node.children || []);
        const bookmarksBar = roots.find((node) => node.folderType === 'bookmarks-bar') || roots[0];
        setTree(roots);
        setExpandedIds(new Set(bookmarksBar?.id ? [bookmarksBar.id] : []));
      } catch (reason) {
        if (!alive) {
          return;
        }

        setError(`读取浏览器书签失败：${String(reason)}`);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [open]);

  // Reset search when dialog is closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  // forceExpanded tracks the debounced value so the tree layout follows the filter result
  const forceExpanded = normalizedQuery.length > 0;
  const visibleTree = useMemo(() => filterTree(tree, normalizedQuery), [tree, normalizedQuery]);

  const toggleExpanded = (id: string) => {
    if (forceExpanded) {
      return;
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number) => {
    const sorted = [...nodes].sort((a, b) => {
      const aFolder = !a.url;
      const bFolder = !b.url;
      if (aFolder === bFolder) return 0;
      return aFolder ? -1 : 1;
    });
    return sorted.map((node) => {
      const key = node.id || `${node.title}-${node.url}`;
      const isFolder = !node.url;
      const hasChildren = !!node.children?.length;
      const isExpanded = forceExpanded || expandedIds.has(node.id);

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

              <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                {isExpanded ? <FolderOpen className="size-3.5 text-amber-600" /> : <Folder className="size-3.5 text-amber-600" />}
              </span>

              <span className="min-w-0 flex-1 truncate">{node.title || '未命名文件夹'}</span>
            </div>

            {hasChildren && isExpanded ? renderNodes(node.children || [], depth + 1) : null}
          </div>
        );
      }

      // Bookmark node — clickable to add directly
      return (
        <div key={key} className="select-none">
          <div
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => {
              if (node.url) {
                onAddBookmark({
                  title: node.title || node.url || '未命名',
                  url: node.url,
                });
              }
            }}
          >
            <span className="inline-flex size-4 items-center justify-center" />

            <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
              <FaviconImage
                url={node.url || ''}
                className="size-3.5 rounded-sm"
                loading="lazy"
              />
            </span>

            <span className="min-w-0 flex-1 truncate">{node.title || node.url}</span>

            <BookmarkPlus className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,720px)]">
        <DialogHeader>
          <DialogTitle>从浏览器书签导入</DialogTitle>
          <DialogDescription>
            {targetLabel ? `目标位置：${targetLabel}` : '选择书签后会直接添加。'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书签或文件夹..."
            className="pl-9"
          />
        </div>

        <div className="h-[min(62vh,540px)] overflow-y-auto rounded-lg border border-border/70 bg-background/60">
          {error ? (
            <div className="flex h-32 items-center justify-center px-4 text-xs text-destructive">{error}</div>
          ) : visibleTree.length === 0 ? (
            <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5" />
              没有匹配结果
            </div>
          ) : (
            <div className="py-1">{renderNodes(visibleTree, 0)}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
