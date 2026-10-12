import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollableTextarea } from '@/components/ScrollableTextarea';

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
  const dialogRef = useRef<HTMLDivElement>(null);

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
      <DialogContent ref={dialogRef} initialFocus={mode === 'edit' ? dialogRef : undefined}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? '手动添加书签' : '编辑书签'}
            </DialogTitle>
            <DialogDescription>
              {targetLabel ? `目标位置：${targetLabel}` : '输入名称与 URL。'}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid gap-3 py-2">
            <Field>
              <FieldLabel htmlFor="bookmark-title">名称</FieldLabel>
              <ScrollableTextarea
                id="bookmark-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：Google"
                rows={2}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="bookmark-url">URL</FieldLabel>
              <ScrollableTextarea
                id="bookmark-url"
                rows={3}
                className="break-all"
                inputMode="url"
                autoCapitalize="none"
                spellCheck={false}
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
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit">{mode === 'create' ? '添加' : '保存'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
