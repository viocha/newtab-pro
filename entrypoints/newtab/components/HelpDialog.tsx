import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Keyboard, PlugZap, MousePointer2, Info, Search, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppSettings } from '../types';

function formatShortcut(raw: string): string {
  return raw
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === 'alt') return 'Alt';
      if (p === 'shift') return 'Shift';
      if (p === 'ctrl' || p === 'control') return 'Ctrl';
      if (p === 'meta' || p === 'cmd') return '⌘';
      return p.toUpperCase();
    })
    .join(' + ');
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 shadow-sm">
      {children}
    </kbd>
  );
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  const parts = shortcut.split('+').map((p) => p.trim());
  const formatted = formatShortcut(shortcut);
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-foreground/80">{label}</span>
      <div className="flex items-center gap-1">
        {formatted.split(' + ').map((k, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </div>
    </div>
  );
}

type HelpDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  settings: AppSettings;
};

export function HelpDialog({ open, onOpenChange, settings }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,520px)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="size-4 text-primary" />
            帮助
          </DialogTitle>
          <DialogDescription>Newtab Pro 使用说明</DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(80vh-6rem)] overflow-y-auto space-y-5 text-sm pr-3 -mr-3">
          {/* Keyboard Shortcuts Section */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Keyboard className="size-3.5" />
              键盘快捷键
            </div>
            <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/30 px-3">
              <ShortcutRow label="切换到下一个 Space" shortcut={settings.spaceNextShortcut} />
              <ShortcutRow label="切换到上一个 Space" shortcut={settings.spacePrevShortcut} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              可在「功能设置 → 快捷键」中修改 Space 切换快捷键。
            </p>
          </section>

          {/* Search shortcuts section */}
          {settings.showSearchBar && (
            <section>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Search className="size-3.5" />
                搜索栏快捷键
              </div>
              <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/30 px-3">
                <ShortcutRow label="聚焦搜索框" shortcut="/" />
                <ShortcutRow label="强制当前标签搜索" shortcut="Alt + Enter" />
                <ShortcutRow label="历史当前标签打开" shortcut="Alt + 点击" />
              </div>
            </section>
          )}

          {/* Mouse / Drag Section */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MousePointer2 className="size-3.5" />
              鼠标操作
            </div>
            <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              {[
                ['拖入书签', '将左侧标签页侧边栏的标签拖入分组，快速创建书签'],
                ['拖拽排序', '鼠标按住分组标题栏或书签条目后拖动，调整顺序'],
                ['拖动切换', '在分组外的空白区域按住左右拖动，即可切换到上 / 下一个 Space'],
                ['点击重命名', '双击顶部 Space 标签，或单击分组/小组标题，均可直接重命名'],
              ].map(([action, desc]) => (
                <div key={action} className="flex items-start gap-2 py-0.5">
                  <span className="min-w-[88px] shrink-0 font-medium text-foreground/80 text-xs">{action}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Context Menu Section */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Menu className="size-3.5" />
              右键菜单
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <p className="mb-2 text-xs text-muted-foreground">以下区域支持右键菜单：</p>
              <ul className="space-y-1">
                {[
                  'Space 标签',
                  'Space 空白区域',
                  '书签条目',
                  '侧栏标签条目',
                ].map((area) => (
                  <li key={area} className="flex items-center gap-2 text-xs text-foreground/80">
                    <span className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {area}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Bookmark Pro Integration */}
          <section>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <PlugZap className="size-3.5" />
              与 Bookmark Pro 交互
            </div>
            <div className="space-y-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              {[
                [
                  '书签树视图',
                  '分组可设置为「书签树」视图，直接映射浏览器书签文件夹，与浏览器书签保持同步展示。',
                ],
                [
                  'Bookmark Pro 侧栏',
                  '通过右键菜单，可在 Bookmark Pro 侧栏中显示所选的书签或文件夹。',
                ],
              ].map(([title, desc]) => (
                <div key={title} className="flex flex-col py-0.5">
                  <span className="font-medium text-foreground/80 text-xs">{title}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{desc}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
