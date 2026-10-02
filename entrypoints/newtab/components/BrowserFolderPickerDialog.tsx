import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { browser, type Browser } from 'wxt/browser';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { cn } from '@/lib/utils';

type TreeNode = Browser.bookmarks.BookmarkTreeNode;

type Props = {
  open: boolean;
  /** 当前已选中的文件夹 ID（编辑时回填） */
  initialFolderId?: string;
  onOpenChange: (open: boolean) => void;
  /** 用户点击「确认」时回调，携带文件夹 ID 和标题 */
  onConfirm: (folderId: string, folderTitle: string) => void;
};

/** 递归过滤，只保留文件夹节点 */
function keepFolders(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .filter((n) => !n.url)
    .map((n) => ({
      ...n,
      children: n.children ? keepFolders(n.children) : undefined,
    }));
}

export function BrowserFolderPickerDialog({
  open,
  initialFolderId,
  onOpenChange,
  onConfirm,
}: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedTitle, setSelectedTitle] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 打开时重置并加载书签树
  useEffect(() => {
    if (!open) return;

    setSelectedId(initialFolderId ?? '');
    setSelectedTitle('');
    setLoading(true);
    setError('');

    let alive = true;
    void (async () => {
      try {
        const payload = await browser.bookmarks.getTree();
        if (!alive) return;

        const roots = payload.flatMap((n) => n.children ?? []);
        const folders = keepFolders(roots);
        setTree(folders);
        // 默认展开第一层
        setExpandedIds(new Set(folders.map((f) => f.id)));
      } catch (e) {
        if (!alive) return;
        setError(`无法读取浏览器书签：${String(e)}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderFolders = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = !!(node.children?.length);
      const isExpanded = expandedIds.has(node.id);
      const isSelected = node.id === selectedId;

      return (
        <div key={node.id}>
          <div
            className={cn(
              'flex cursor-pointer select-none items-center gap-1 rounded-md py-1 pr-2 text-xs transition-colors',
              isSelected
                ? 'bg-primary/12 font-medium text-primary'
                : 'hover:bg-accent',
            )}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => {
              setSelectedId(node.id);
              setSelectedTitle(node.title ?? '');
              // 点击行始终切换展开/折叠
              if (hasChildren) toggleExpand(node.id);
            }}
          >
            {/* 展开/收起箭头 */}
            <span
              className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleExpand(node.id);
              }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
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

            <span className="min-w-0 flex-1 truncate">{node.title || '未命名文件夹'}</span>

            {isSelected && <Check className="ml-1 size-3 shrink-0 text-primary" />}
          </div>

          {hasChildren && isExpanded && renderFolders(node.children!, depth + 1)}
        </div>
      );
    });

  const handleConfirm = () => {
    if (!selectedId) return;
    onConfirm(selectedId, selectedTitle);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-md flex-col gap-3 overflow-hidden" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>选择书签文件夹</DialogTitle>
        </DialogHeader>

        {/* 文件夹树 */}
        {error ? (
          <div className="flex h-52 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : (
          <ScrollArea className="bookmark-scroll-area h-[420px] min-w-0 shrink-0 rounded-md border border-border/50">
            <div className="px-2.5 py-1">
              {!loading && tree.length === 0
                ? <p className="px-2 py-3 text-xs text-muted-foreground">没有找到书签文件夹</p>
                : renderFolders(tree, 0)}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!selectedId} onClick={handleConfirm}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
