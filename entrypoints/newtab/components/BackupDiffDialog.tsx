import { useEffect, useState, type ReactNode } from 'react';
import 'jsondiffpatch/formatters/styles/html.css';
import './BackupDiffDialog.css';

import {
  ArrowRightLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Cloud,
  FolderTree,
  History,
  Search,
  Server,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import type { BackupContentStats, BackupDiffDirection, BackupDiffResult } from '../backup-diff';

type BackupDiffDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  result: BackupDiffResult | null;
};

const STAT_ITEMS: Array<{ key: keyof BackupContentStats; label: string }> = [
  { key: 'spaces', label: 'Space' },
  { key: 'groups', label: '分组' },
  { key: 'subgroups', label: '小组' },
  { key: 'bookmarks', label: '书签' },
  { key: 'searchEngines', label: '搜索引擎' },
  { key: 'searchHistory', label: '搜索历史' },
];

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'rose' | 'slate';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-500/25 bg-amber-500/10 text-amber-700'
        : tone === 'rose'
          ? 'border-rose-500/25 bg-rose-500/10 text-rose-700'
          : 'border-sky-500/25 bg-sky-500/10 text-sky-700';

  return (
    <div className={['rounded-lg border px-3 py-2', toneClass].join(' ')}>
      <div className="text-[11px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function StatsGrid({
  title,
  icon,
  stats,
  compareStats,
}: {
  title: string;
  icon: ReactNode;
  stats: BackupContentStats;
  compareStats: BackupContentStats;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-muted/15 px-3 py-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {STAT_ITEMS.map(({ key, label }) => {
          const changed = stats[key] !== compareStats[key];
          return (
            <div
              key={key}
              className={cn(
                'rounded-md border border-border/50 bg-background/70 px-3 py-2 transition-colors',
                changed && 'border-mauve-500/20 bg-mauve-500/[0.05]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={cn('text-muted-foreground', changed && 'font-medium text-mauve-800/85')}>
                  {label}
                </div>
                {changed && <span className="size-1.5 rounded-full bg-mauve-600/65" aria-hidden="true" />}
              </div>
              <div className={cn('mt-1 text-sm font-medium', changed && 'text-mauve-900/90')}>
                {stats[key]}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BackupDiffDialog({
  open,
  onOpenChange,
  result,
}: BackupDiffDialogProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [direction, setDirection] = useState<BackupDiffDirection>('local-to-remote');

  useEffect(() => {
    setShowUnchanged(false);
    setDirection('local-to-remote');
  }, [open, result]);

  const activeComparison = result ? result.comparisons[direction] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,1040px)] flex-col gap-3 overflow-hidden sm:max-w-[1040px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>与云端备份的差异</DialogTitle>
          <DialogDescription>
            {result?.remoteExportedAt
              ? `云端备份时间 ${new Date(result.remoteExportedAt).toLocaleString('zh-CN')}`
              : `当前方向为 ${direction === 'local-to-remote' ? '本地 → 云端' : '云端 → 本地'}。`}
          </DialogDescription>
        </DialogHeader>

        {result && activeComparison ? (
          <>
            <div className="flex items-center justify-start gap-2">
              <Button
                type="button"
                size="sm"
                variant={direction === 'local-to-remote' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => setDirection('local-to-remote')}
              >
                本地 -&gt; 云端
              </Button>
              <Button
                type="button"
                size="sm"
                variant={direction === 'remote-to-local' ? 'default' : 'outline'}
                className="h-8"
                onClick={() => setDirection('remote-to-local')}
              >
                云端 -&gt; 本地
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryCard label="新增" value={activeComparison.summary.added} tone="emerald" />
              <SummaryCard label="修改" value={activeComparison.summary.modified} tone="amber" />
              <SummaryCard label="删除" value={activeComparison.summary.deleted} tone="rose" />
              <SummaryCard label="移动" value={activeComparison.summary.moved} tone="slate" />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
              <StatsGrid
                title="本地"
                icon={<FolderTree className="size-4 text-muted-foreground" />}
                stats={result.localStats}
                compareStats={result.remoteStats}
              />
              <div className="hidden items-center justify-center md:flex">
                <ArrowRightLeft className="size-4 text-muted-foreground" />
              </div>
              <StatsGrid
                title="云端"
                icon={<Cloud className="size-4 text-muted-foreground" />}
                stats={result.remoteStats}
                compareStats={result.localStats}
              />
            </div>

            {activeComparison.hasChanges ? (
              <section className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-background/70">
                <div className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Server className="size-3.5" />
                    结构化差异明细
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setShowUnchanged((prev) => !prev)}
                  >
                    {showUnchanged ? (
                      <>
                        <ChevronsDownUp className="mr-1 size-3.5" />
                        折叠未变化项
                      </>
                    ) : (
                      <>
                        <ChevronsUpDown className="mr-1 size-3.5" />
                        展开未变化项
                      </>
                    )}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <div
                    className={cn(
                      'backup-diff-view p-3 text-xs',
                      showUnchanged ? 'jsondiffpatch-unchanged-visible' : 'jsondiffpatch-unchanged-hidden',
                    )}
                    dangerouslySetInnerHTML={{ __html: activeComparison.deltaHtml }}
                  />
                </div>
              </section>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-6 py-12 text-center">
                <div>
                  <Search className="mx-auto mb-3 size-5 text-muted-foreground" />
                  <div className="text-sm font-medium">本地与云端暂无差异</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    当前备份内容一致，不需要恢复或重新上传。
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
