import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      visibleToasts={6}
      expand={false}
      gap={6}
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'w-[300px] rounded-md border border-border bg-card text-card-foreground shadow-md',
          title: 'text-[11px] font-medium',
          description: 'text-[10px] text-muted-foreground',
          actionButton:
            'h-6 rounded-sm border border-border bg-secondary px-2 text-[11px] text-secondary-foreground',
          cancelButton:
            'h-6 rounded-sm border border-border bg-secondary px-2 text-[11px] text-secondary-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--card-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': '0.5rem',
        } as CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
