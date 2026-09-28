import {
  Keyboard,
  PlugZap,
  MousePointer2,
  Info,
  Search,
  Menu,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
    <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 shadow-xs">
      {children}
    </kbd>
  );
}

function HelpSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 overflow-hidden border-border/60 bg-background shadow-sm">
      <CardHeader className="gap-0 border-b border-border/60 bg-muted/20 px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-xs leading-5">{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

function ShortcutRow({ label, shortcut }: { label: string; shortcut: string }) {
  const formatted = formatShortcut(shortcut);
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <span className="text-sm text-foreground/85">{label}</span>
      <div className="flex items-center gap-1">
        {formatted.split(' + ').map((key, index) => (
          <span key={`${label}-${key}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <span className="text-xs text-muted-foreground">+</span> : null}
            <Kbd>{key}</Kbd>
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
      <DialogContent className="w-[min(96vw,760px)] overflow-hidden border-border/60 bg-background p-0 shadow-xl sm:max-w-[760px]">
        <DialogHeader className="border-b border-border/60 bg-background px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Info className="size-4" />
            </span>
            帮助中心
          </DialogTitle>
          <DialogDescription>
            快捷键与鼠标操作。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[min(80vh,680px)]">
          <div className="space-y-4 px-5 py-5">
            <HelpSection
              icon={Keyboard}
              title="键盘快捷键"
              description="Space 切换快捷键可在功能设置中重新录制。"
            >
              <ShortcutRow label="切换到下一个 Space" shortcut={settings.spaceNextShortcut} />
              <Separator />
              <ShortcutRow label="切换到上一个 Space" shortcut={settings.spacePrevShortcut} />
            </HelpSection>

            <HelpSection
              icon={Search}
              title="搜索栏快捷键"
              description="搜索框启用时，按键可切换搜索结果的打开方式。"
            >
                <ShortcutRow label="聚焦搜索框" shortcut="/" />
                <Separator />
                <ShortcutRow label="按设置的方式搜索" shortcut="Enter" />
                <Separator />
                <ShortcutRow label="强制当前标签搜索" shortcut="Alt + Enter" />
                <Separator />
                <ShortcutRow label="后台新标签搜索" shortcut="Ctrl + Enter" />
                <Separator />
                <ShortcutRow label="前台新标签搜索" shortcut="Ctrl + Shift + Enter" />
                <Separator />
                <ShortcutRow label="选择历史或建议" shortcut="↑ / ↓" />
                <Separator />
                <ShortcutRow label="关闭建议并退出搜索框" shortcut="Esc" />
            </HelpSection>

            <HelpSection
              icon={MousePointer2}
              title="鼠标操作"
              description="拖拽、重命名和 Space 切换的核心交互都集中在这里。"
            >
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
                {[
                  ['拖入书签', '将左侧标签页侧边栏的标签拖入分组，快速创建书签。'],
                  ['拖拽排序', '按住分组标题栏或书签条目拖动，调整分组和书签顺序。'],
                  ['拖动切换', '在分组外空白区域按住左右拖动，即可切换到上一个或下一个 Space。'],
                  ['点击重命名', '双击 Space 标签，或点击分组/小组标题，可直接进入编辑状态。'],
                  ['打开书签', '普通点击在当前标签页打开；Ctrl/⌘ + 点击或中键在新标签页打开。'],
                ].map(([action, desc]) => (
                  <div
                    key={action}
                    className="rounded-xl border border-border/60 bg-muted/15 p-4"
                  >
                    <div className="text-sm font-medium text-foreground">{action}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </HelpSection>

            <HelpSection
              icon={Menu}
              title="右键菜单"
              description="这些区域都提供上下文操作，不同对象会显示不同能力。"
            >
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {['Space 标签', 'Space 空白区域', '书签条目', '书签树文件夹', '侧栏标签条目'].map((area) => (
                  <span
                    key={area}
                    className="rounded-full border border-border/60 bg-muted/20 px-3 py-1 text-xs text-foreground/80"
                  >
                    {area}
                  </span>
                ))}
              </div>
            </HelpSection>

            <HelpSection
              icon={PlugZap}
              title="与 Bookmark Pro 交互"
              description="你可以把浏览器书签和扩展内数据联动起来使用。"
            >
              <div className="space-y-3 px-5 py-4">
                {[
                  [
                    '书签树视图',
                    '分组可切换到书签树视图，直接映射浏览器书签文件夹，并与浏览器书签同步展示。',
                  ],
                  [
                    'Bookmark Pro 侧栏',
                    '通过右键菜单，可以在 Bookmark Pro 侧栏中展示所选书签或文件夹。',
                  ],
                ].map(([title, desc]) => (
                  <div
                    key={title}
                    className={cn(
                      'rounded-xl border border-border/60 bg-gradient-to-br from-muted/30 to-background p-4',
                    )}
                  >
                    <div className="text-sm font-medium text-foreground">{title}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </HelpSection>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
