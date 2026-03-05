import { useState, useCallback, useEffect, useRef } from 'react';
import {
  GripVertical,
  Check,
  Edit2,
  Plus,
  Trash2,
  ChevronLeft,
  RotateCcw,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FaviconImage } from './FaviconImage';
import { ConfirmDialog } from './ConfirmDialog';

import type { AppSettings, SearchEngine } from '../types';
import { createId } from '../utils';
import { SUGGEST_URL_PRESETS } from '../constants';

// ── Toggle ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  rounded,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
  rounded?: 'top' | 'bottom' | 'both' | 'none';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors',
        rounded === 'top' && 'rounded-t-lg',
        rounded === 'bottom' && 'rounded-b-lg',
        rounded === 'both' && 'rounded-lg',
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      <div
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </div>
    </button>
  );
}

// ── Shortcut input ───────────────────────────────────────────────────

function ShortcutInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [liveCombo, setLiveCombo] = useState('');
  const recorderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recording) recorderRef.current?.focus();
  }, [recording]);

  const formatShortcut = (raw: string) =>
    raw
      .split('+')
      .map((p) => {
        const t = p.trim().toLowerCase();
        if (t === 'alt') return 'Alt';
        if (t === 'shift') return 'Shift';
        if (t === 'ctrl' || t === 'control') return 'Ctrl';
        if (t === 'meta') return '⌘';
        return t.toUpperCase();
      })
      .join(' + ');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecording(false);
      setLiveCombo('');
      return;
    }

    // Standalone modifier key — show partial combo
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      const parts: string[] = [];
      if (e.ctrlKey || e.key === 'Control') parts.push('ctrl');
      if (e.altKey || e.key === 'Alt') parts.push('alt');
      if (e.shiftKey || e.key === 'Shift') parts.push('shift');
      setLiveCombo(parts.join('+'));
      return;
    }

    // Non-modifier key — build full combo and commit
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    parts.push(e.key.toLowerCase());
    onChange(parts.join('+'));
    setRecording(false);
    setLiveCombo('');
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('ctrl');
      if (e.altKey) parts.push('alt');
      if (e.shiftKey) parts.push('shift');
      setLiveCombo(parts.join('+'));
    }
  };

  if (recording) {
    return (
      <div
        ref={recorderRef}
        tabIndex={0}
        data-shortcut-recording
        className="flex items-center justify-between gap-2 px-3 py-2.5 bg-primary/5 outline-none ring-1 ring-inset ring-primary/30 rounded cursor-default select-none"
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => { setRecording(false); setLiveCombo(''); }}
      >
        <span className="text-sm">{label}</span>
        <span className={cn('text-xs font-mono', liveCombo ? 'text-foreground/80' : 'text-muted-foreground animate-pulse')}>
          {liveCombo ? formatShortcut(liveCombo) : '按下快捷键…'}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
    >
      <span className="text-sm">{label}</span>
      <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground/80">
        {formatShortcut(value)}
      </kbd>
    </button>
  );
}

// ── Engine Form Dialog ───────────────────────────────────────────────

type EngineFormDialogProps = {
  state: null | 'add' | SearchEngine;
  onClose: () => void;
  onSubmit: (engine: SearchEngine) => void;
};

function EngineFormDialog({ state, onClose, onSubmit }: EngineFormDialogProps) {
  const isAdd = state === 'add';
  const [name, setName] = useState('');
  const [searchUrl, setSearchUrl] = useState('');
  const [suggestUrl, setSuggestUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');

  useEffect(() => {
    if (!state) return;
    if (state === 'add') {
      setName('');
      setSearchUrl('');
      setSuggestUrl('');
      setIconUrl('');
    } else {
      setName(state.name);
      setSearchUrl(state.searchUrl);
      setSuggestUrl(state.suggestUrl ?? '');
      setIconUrl(state.iconUrl ?? '');
    }
  }, [state]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !searchUrl.trim()) return;
    onSubmit({
      id: isAdd ? createId() : (state as SearchEngine).id,
      name: name.trim(),
      searchUrl: searchUrl.trim(),
      suggestUrl: suggestUrl.trim() || undefined,
      iconUrl: iconUrl.trim() || undefined,
    });
  };

  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(96vw,440px)]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isAdd ? '添加搜索引擎' : '编辑搜索引擎'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">名称</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Google"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">搜索 URL</label>
            <Input
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://www.google.com/search?q={query}"
            />
            <p className="text-[11px] text-muted-foreground">
              用 <code className="rounded bg-muted px-0.5">{'{query}'}</code> 代表搜索词
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              搜索建议 URL（可选）
            </label>
            <Input
              value={suggestUrl}
              onChange={(e) => setSuggestUrl(e.target.value)}
              placeholder="https://suggestqueries.google.com/complete/search?output=toolbar&q={query}"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              图标链接（可选）
            </label>
            <Input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
            <p className="text-[11px] text-muted-foreground">留空则自动从搜索 URL 获取图标</p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || !searchUrl.trim()}
            >
              {isAdd ? '添加' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Sortable engine item ─────────────────────────────────────────────

type SortableEngineItemProps = {
  engine: SearchEngine;
  isActive: boolean;
  onSetActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function SortableEngineItem({
  engine,
  isActive,
  onSetActive,
  onEdit,
  onDelete,
}: SortableEngineItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: engine.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const engineIconSrc = (() => {
    if (engine.iconUrl) return engine.iconUrl;
    try { return new URL(engine.searchUrl.replace('{query}', 'q')).origin; } catch { return ''; }
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/30 transition-colors"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing rounded-sm p-1 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 touch-none transition-colors"
        tabIndex={-1}
        aria-label="拖拽排序"
      >
        <GripVertical className="size-3.5" />
      </button>

      {/* Favicon */}
      {engine.iconUrl
        ? <img src={engine.iconUrl} className="size-4 shrink-0 rounded-sm" alt="" />
        : engineIconSrc && <FaviconImage url={engineIconSrc} className="size-4 shrink-0 rounded-sm" />}

      {/* Name */}
      <span className="flex-1 min-w-0 truncate text-sm">{engine.name}</span>

      {/* Active badge */}
      {isActive && (
        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
          当前
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onSetActive}
          disabled={isActive}
          title="设为当前引擎"
          className={cn(
            'rounded-sm p-1.5 transition-colors',
            isActive
              ? 'text-primary opacity-40 cursor-default'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="编辑"
          className="rounded-sm p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Edit2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="删除"
          className="rounded-sm p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main SettingsDialog ──────────────────────────────────────────────

export type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onAddSearchEngine: (engine: Omit<SearchEngine, 'id'>) => void;
  onUpdateSearchEngine: (id: string, engine: Partial<Omit<SearchEngine, 'id'>>) => void;
  onDeleteSearchEngine: (id: string) => void;
  onSetActiveSearchEngine: (id: string) => void;
  onResetSearchEngines: () => void;
  onReorderSearchEngines: (ids: string[]) => void;
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onUpdateSettings,
  onAddSearchEngine,
  onUpdateSearchEngine,
  onDeleteSearchEngine,
  onSetActiveSearchEngine,
  onResetSearchEngines,
  onReorderSearchEngines,
}: SettingsDialogProps) {
  const [view, setView] = useState<'main' | 'engines'>('main');
  const [engineDialogState, setEngineDialogState] = useState<null | 'add' | SearchEngine>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Reset view to main when dialog closes
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) setView('main');
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = settings.searchEngines.map((e) => e.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      onReorderSearchEngines(arrayMove(ids, oldIndex, newIndex));
    },
    [settings.searchEngines, onReorderSearchEngines],
  );

  const handleEngineSubmit = useCallback(
    (engine: SearchEngine) => {
      if (engineDialogState === 'add') {
        onAddSearchEngine({
          name: engine.name,
          searchUrl: engine.searchUrl,
          suggestUrl: engine.suggestUrl,
          iconUrl: engine.iconUrl,
        });
      } else {
        onUpdateSearchEngine(engine.id, {
          name: engine.name,
          searchUrl: engine.searchUrl,
          suggestUrl: engine.suggestUrl,
          iconUrl: engine.iconUrl,
        });
      }
      setEngineDialogState(null);
    },
    [engineDialogState, onAddSearchEngine, onUpdateSearchEngine],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="w-[min(96vw,480px)]"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            if (document.querySelector('[data-shortcut-recording]')) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {view === 'engines' ? (
                <button
                  type="button"
                  onClick={() => setView('main')}
                  className="-ml-1.5 flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-muted/60 transition-colors"
                  aria-label="返回"
                >
                  <ChevronLeft className="size-4 shrink-0" />
                  搜索引擎管理
                </button>
              ) : '功能设置'}
            </DialogTitle>
          </DialogHeader>

          {/* ── Main view ── */}
          {view === 'main' && (
            <div className="space-y-4 text-sm">
              {/* Search bar section */}
              <section>
                <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  搜索栏
                </div>
                <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/20">
                  <Toggle
                    checked={settings.showSearchBar}
                    onCheckedChange={(v) => onUpdateSettings({ showSearchBar: v })}
                    label="显示搜索栏"
                    description="在新标签页顶部显示搜索框"
                    rounded={settings.showSearchBar ? 'top' : 'both'}
                  />
                  {settings.showSearchBar && (
                    <>
                      <Toggle
                        checked={settings.openSearchInNewTab}
                        onCheckedChange={(v) => onUpdateSettings({ openSearchInNewTab: v })}
                        label="在新标签页中打开搜索结果"
                      />
                      <button
                        type="button"
                        onClick={() => setView('engines')}
                        className="flex w-full items-center justify-between gap-3 rounded-b-lg px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
                      >
                        <span className="text-sm">管理搜索引擎</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {settings.searchEngines.length} 个引擎
                          <ChevronLeft className="size-3.5 rotate-180" />
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </section>

              {/* Search suggest section */}
              {settings.showSearchBar && (
                <section>
                  <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    搜索建议
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      未配置引擎专属建议 URL 时的全局回退来源
                    </p>
                    {(() => {
                      const currentVal = settings.defaultSuggestUrl ?? '';
                      const isCustom = !SUGGEST_URL_PRESETS.some((p) => p.value === currentVal);
                      return (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {[...SUGGEST_URL_PRESETS, { label: '自定义', value: null as unknown as string }].map((p) => {
                              const isActive = p.value === null ? isCustom : currentVal === p.value;
                              return (
                                <button
                                  key={p.label}
                                  type="button"
                                  onClick={() => {
                                    if (p.value === null) {
                                      if (!isCustom) onUpdateSettings({ defaultSuggestUrl: '' });
                                    } else {
                                      onUpdateSettings({ defaultSuggestUrl: p.value });
                                    }
                                  }}
                                  className={cn(
                                    'rounded-md px-2 py-0.5 text-xs transition-colors border',
                                    isActive
                                      ? 'bg-primary/15 text-primary font-medium border-primary/30'
                                      : 'text-muted-foreground border-border/50 hover:bg-muted/50 hover:text-foreground',
                                  )}
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                          </div>
                          <Input
                            autoFocus={isCustom}
                            readOnly={!isCustom}
                            value={currentVal}
                            onChange={(e) => onUpdateSettings({ defaultSuggestUrl: e.target.value })}
                            placeholder="自定义 URL，用 {query} 代表搜索词"
                            className={cn('h-8 text-xs', !isCustom && 'text-muted-foreground cursor-default select-all')}
                          />
                        </>
                      );
                    })()}
                  </div>
                </section>
              )}

              {/* Shortcuts section */}
              <section>
                <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Space 切换快捷键
                </div>
                <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/20">
                  <ShortcutInput
                    label="切换到下一个 Space"
                    value={settings.spaceNextShortcut}
                    onChange={(v) => onUpdateSettings({ spaceNextShortcut: v })}
                  />
                  <ShortcutInput
                    label="切换到上一个 Space"
                    value={settings.spacePrevShortcut}
                    onChange={(v) => onUpdateSettings({ spacePrevShortcut: v })}
                  />
                </div>
              </section>

              {/* Iframe section */}
              <section>
                <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  内嵌网页
                </div>
                <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-muted/20">
                  <Toggle
                    checked={settings.iframeAutoRun}
                    onCheckedChange={(v) => onUpdateSettings({ iframeAutoRun: v })}
                    label="切换 Space 时自动运行 iframe"
                    description="关闭后，需手动点击分组标题栏的播放按钮来加载内嵌网页"
                    rounded="both"
                  />
                </div>
              </section>
            </div>
          )}

          {/* ── Engines view ── */}
          {view === 'engines' && (
            <div className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={settings.searchEngines.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0.5 rounded-lg border border-border/50 bg-muted/20 p-1.5 max-h-72 overflow-y-auto">
                    {settings.searchEngines.map((engine) => (
                      <SortableEngineItem
                        key={engine.id}
                        engine={engine}
                        isActive={engine.id === settings.activeSearchEngineId}
                        onSetActive={() => onSetActiveSearchEngine(engine.id)}
                        onEdit={() => setEngineDialogState(engine)}
                        onDelete={() => onDeleteSearchEngine(engine.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => setResetConfirmOpen(true)}
                >
                  <RotateCcw className="size-3.5" />
                  重置默认
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setEngineDialogState('add')}
                >
                  <Plus className="size-3.5" />
                  添加自定义引擎
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Engine form dialog — outside main dialog to avoid nesting issues */}
      <EngineFormDialog
        state={engineDialogState}
        onClose={() => setEngineDialogState(null)}
        onSubmit={handleEngineSubmit}
      />

      {/* Reset confirm dialog */}
      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="重置搜索引擎"
        description="将恢复默认的 Google、Bing、百度三个引擎，自定义引擎会被删除。确认继续？"
        confirmText="重置"
        destructive
        onConfirm={onResetSearchEngines}
      />
    </>
  );
}
