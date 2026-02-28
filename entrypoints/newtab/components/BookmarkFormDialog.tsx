import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { tryNormalizeUrl } from '../utils';

type BookmarkFormDialogProps = {
  open: boolean;
  mode: 'create' | 'edit';
  initialTitle?: string;
  initialUrl?: string;
  targetLabel?: string;
  onOpenChange: (next: boolean) => void;
  onSubmit: (payload: { title: string; url: string }) => void;
};

export function BookmarkFormDialog({
  open,
  mode,
  initialTitle,
  initialUrl,
  targetLabel,
  onOpenChange,
  onSubmit,
}: BookmarkFormDialogProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(initialTitle ?? '');
    setUrl(initialUrl ?? '');
    setError('');
  }, [initialTitle, initialUrl, open]);

  const isValid = useMemo(() => !!tryNormalizeUrl(url), [url]);

  const handleSubmit = () => {
    if (!isValid) {
      setError('请输入有效 URL（可不带 https://）');
      return;
    }

    onSubmit({
      title: title.trim(),
      url: url.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? '手动添加书签' : '编辑书签'}</DialogTitle>
            <DialogDescription>
              {targetLabel ? `目标位置：${targetLabel}` : '输入名称与 URL。'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="bookmark-title">
                名称
              </label>
              <Input
                id="bookmark-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：Google"
                autoFocus
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="bookmark-url">
                URL
              </label>
              <Input
                id="bookmark-url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (error) {
                    setError('');
                  }
                }}
                placeholder="https://google.com"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">
              {mode === 'create' ? '添加' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
