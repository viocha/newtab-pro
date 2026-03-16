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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FaviconImage } from './FaviconImage';
import { ConfirmDialog } from './ConfirmDialog';

import type { AppSettings, SearchEngine } from '../types';
import { createId } from '../utils';
import { SUGGEST_URL_PRESETS } from '../constants';

function SettingsSection({
  title,
  children,
  className,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden border-border/60 bg-background shadow-sm', className)}>
      <CardHeader className="gap-0 border-b border-border/50 bg-muted/15 px-4 py-2.5">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className={cn('px-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}

function SettingsSwitchRow({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  );
}

function SettingsActionRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-muted/20"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {value}
        <ChevronLeft className="size-3.5 rotate-180" />
      </span>
    </button>
  );
}

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

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      const parts: string[] = [];
      if (e.ctrlKey || e.key === 'Control') parts.push('ctrl');
      if (e.altKey || e.key === 'Alt') parts.push('alt');
      if (e.shiftKey || e.key === 'Shift') parts.push('shift');
      setLiveCombo(parts.join('+'));
      return;
    }

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
        className="flex items-center justify-between gap-3 bg-primary/5 px-4 py-2.5 outline-none ring-1 ring-inset ring-primary/25"
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => {
          setRecording(false);
          setLiveCombo('');
        }}
      >
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span
          className={cn(
            'text-xs font-mono',
            liveCombo ? 'text-foreground/80' : 'animate-pulse text-muted-foreground',
          )}
        >
          {liveCombo ? formatShortcut(liveCombo) : '按下快捷键…'}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/20"
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <kbd className="rounded-md border border-border/70 bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground/80 shadow-xs">
        {formatShortcut(value)}
      </kbd>
    </button>
  );
}

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
      <DialogContent className="w-[min(94vw,440px)] border-border/60 bg-background shadow-xl sm:max-w-[440px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isAdd ? '添加搜索引擎' : '编辑搜索引擎'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">名称</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Google"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">搜索 URL</label>
            <Input
              value={searchUrl}
              onChange={(e) => setSearchUrl(e.target.value)}
              placeholder="https://www.google.com/search?q={query}"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              搜索建议 URL（可选）
            </label>
            <Input
              value={suggestUrl}
              onChange={(e) => setSuggestUrl(e.target.value)}
              placeholder="https://suggestqueries.google.com/complete/search?output=toolbar&q={query}"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              图标链接（可选）
            </label>
            <Input
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
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
    try {
      return new URL(engine.searchUrl.replace('{query}', 'q')).origin;
    } catch {
      return '';
    }
  })();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-xl border px-2 py-2 transition-colors',
        isDragging
          ? 'border-primary/25 bg-primary/5 shadow-sm'
          : 'border-transparent bg-background/80 hover:border-border/60 hover:bg-muted/15',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="rounded-md p-1 text-muted-foreground/45 transition-colors hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
        tabIndex={-1}
        aria-label="拖拽排序"
      >
        <GripVertical className="size-3.5" />
      </button>

      {engine.iconUrl
        ? <img src={engine.iconUrl} className="size-4 shrink-0 rounded-sm" alt="" />
        : engineIconSrc && <FaviconImage url={engineIconSrc} className="size-4 shrink-0 rounded-sm" />}

      <span className="min-w-0 flex-1 truncate text-sm">{engine.name}</span>

      {isActive && (
        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          当前
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onSetActive}
          disabled={isActive}
          title="设为当前引擎"
          className={cn(
            isActive
              ? 'text-primary opacity-45'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onEdit}
          title="编辑"
          className="text-muted-foreground hover:text-foreground"
        >
          <Edit2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onDelete}
          title="删除"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

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

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setView('main');
        setEngineDialogState(null);
        setResetConfirmOpen(false);
      }
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

  const currentSuggestUrl = settings.defaultSuggestUrl ?? '';
  const isCustomSuggestUrl = !SUGGEST_URL_PRESETS.some((preset) => preset.value === currentSuggestUrl);

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-[min(96vw,560px)] gap-0 p-0 sm:max-w-[560px]"
          onEscapeKeyDown={(e) => {
            if (document.querySelector('[data-shortcut-recording]')) e.preventDefault();
          }}
        >
          <SheetHeader className="gap-0 border-b border-border/50 bg-background px-4 py-2.5">
            <div className="flex min-h-8 items-center gap-2.5">
              {view === 'engines' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-1 h-7 shrink-0 rounded-md px-2 hover:bg-muted/45"
                  onClick={() => setView('main')}
                >
                  <ChevronLeft className="size-4" />
                  返回
                </Button>
              ) : null}
              <div className="min-w-0">
                <SheetTitle className="text-base">
                  {view === 'engines' ? '搜索引擎管理' : '功能设置'}
                </SheetTitle>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-4">
              {view === 'main' ? (
                <>
                  <SettingsSection title="搜索栏">
                    <SettingsSwitchRow
                      checked={settings.showSearchBar}
                      onCheckedChange={(next) => onUpdateSettings({ showSearchBar: next })}
                      label="显示搜索栏"
                    />
                    {settings.showSearchBar ? (
                      <>
                        <Separator />
                        <SettingsSwitchRow
                          checked={settings.openSearchInNewTab}
                          onCheckedChange={(next) => onUpdateSettings({ openSearchInNewTab: next })}
                          label="在新标签页中打开搜索结果"
                        />
                        <Separator />
                        <SettingsActionRow
                          label="管理搜索引擎"
                          value={`${settings.searchEngines.length} 个引擎`}
                          onClick={() => setView('engines')}
                        />
                      </>
                    ) : null}
                  </SettingsSection>

                  {settings.showSearchBar ? (
                    <SettingsSection title="默认搜索建议">
                      <div className="space-y-2.5 px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          {[...SUGGEST_URL_PRESETS, { label: '自定义', value: null as unknown as string }].map((preset) => {
                            const isActive = preset.value === null
                              ? isCustomSuggestUrl
                              : currentSuggestUrl === preset.value;
                            return (
                              <Button
                                key={preset.label}
                                type="button"
                                variant={isActive ? 'default' : 'outline'}
                                size="xs"
                                className="rounded-full px-3"
                                onClick={() => {
                                  if (preset.value === null) {
                                    if (!isCustomSuggestUrl) {
                                      onUpdateSettings({ defaultSuggestUrl: '' });
                                    }
                                  } else {
                                    onUpdateSettings({ defaultSuggestUrl: preset.value });
                                  }
                                }}
                              >
                                {preset.label}
                              </Button>
                            );
                          })}
                        </div>
                        <Input
                          autoFocus={isCustomSuggestUrl}
                          readOnly={!isCustomSuggestUrl}
                          value={currentSuggestUrl}
                          onChange={(e) => onUpdateSettings({ defaultSuggestUrl: e.target.value })}
                          placeholder="自定义 URL，用 {query} 代表搜索词"
                          className={cn(
                            'text-xs',
                            !isCustomSuggestUrl && 'cursor-default select-all text-muted-foreground',
                          )}
                        />
                      </div>
                    </SettingsSection>
                  ) : null}

                  <SettingsSection title="Space 切换快捷键">
                    <ShortcutInput
                      label="切换到下一个 Space"
                      value={settings.spaceNextShortcut}
                      onChange={(next) => onUpdateSettings({ spaceNextShortcut: next })}
                    />
                    <Separator />
                    <ShortcutInput
                      label="切换到上一个 Space"
                      value={settings.spacePrevShortcut}
                      onChange={(next) => onUpdateSettings({ spacePrevShortcut: next })}
                    />
                  </SettingsSection>

                  <SettingsSection title="内嵌网页">
                    <SettingsSwitchRow
                      checked={settings.iframeAutoRun}
                      onCheckedChange={(next) => onUpdateSettings({ iframeAutoRun: next })}
                      label="切换 Space 时自动运行 iframe"
                    />
                  </SettingsSection>
                </>
              ) : (
                <>
                  <Card className="gap-0 overflow-hidden border-border/60 bg-background shadow-sm">
                    <CardHeader className="items-center gap-0 border-b border-border/50 bg-muted/15 px-4 py-2.5">
                      <CardTitle className="text-sm">已配置引擎</CardTitle>
                      <CardAction>
                        <div className="flex items-center gap-2">
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
                      </CardAction>
                    </CardHeader>
                    <CardContent className="p-0">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={settings.searchEngines.map((engine) => engine.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ScrollArea className="max-h-[min(48vh,320px)]">
                            <div className="space-y-1.5 p-1.5">
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
                          </ScrollArea>
                        </SortableContext>
                      </DndContext>
                    </CardContent>
                  </Card>

                </>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <EngineFormDialog
        state={engineDialogState}
        onClose={() => setEngineDialogState(null)}
        onSubmit={handleEngineSubmit}
      />

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
