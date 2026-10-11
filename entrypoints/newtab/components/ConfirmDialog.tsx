import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  destructive,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  const contentRef = useRef({ title, description });
  const confirmAfterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) {
      contentRef.current = { title, description };
    }
  }, [description, open, title]);

  const displayTitle = open ? title : contentRef.current.title;
  const displayDescription = open
    ? description
    : contentRef.current.description;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen && confirmAfterClose.current) {
          const confirm = confirmAfterClose.current;
          confirmAfterClose.current = null;
          confirm();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{displayTitle}</DialogTitle>
          {displayDescription ? (
            <DialogDescription>{displayDescription}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelText}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              confirmAfterClose.current = onConfirm;
              onOpenChange(false);
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
