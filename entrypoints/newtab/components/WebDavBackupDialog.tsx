import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  CloudDownload,
  CloudUpload,
  GitCompareArrows,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from '@/components/ui/toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import type { BackupDiffResult } from '../backup-diff';
import { DEFAULT_SETTINGS } from '../constants';
import type { BackupSettings } from '../types';
import { BackupDiffDialog } from './BackupDiffDialog';
import { ConfirmDialog } from './ConfirmDialog';

function SectionCard({
  title,
  children,
  action,
  className,
  contentClassName,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="gap-0 bg-muted/15 px-4 py-2.5">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className={cn('px-0', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const switchId = useId();
  return (
    <Label
      htmlFor={switchId}
      className={cn(
        'w-full items-start justify-between gap-4 px-4 py-2.5 font-normal text-foreground',
        disabled && 'opacity-55',
      )}
    >
      <span className="min-w-0">{label}</span>
      <Switch
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
    </Label>
  );
}

function getEditableAccount(backup: BackupSettings) {
  return {
    webdavUrl: backup.webdavUrl,
    username: backup.username,
    password: backup.password,
    remotePath: backup.remotePath || DEFAULT_SETTINGS.backup.remotePath,
  };
}

type WebDavBackupDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  backupSettings: BackupSettings;
  onSaveAccount: (next: BackupSettings) => void;
  onRemoveAccount: () => void;
  onUpdateBackupSettings: (partial: Partial<BackupSettings>) => void;
  onTestConnection: (config: BackupSettings) => Promise<void>;
  onManualBackup: () => Promise<void>;
  onManualRestore: () => Promise<void>;
  onOpenRemoteDiff: () => Promise<BackupDiffResult>;
};

function clampBackupIntervalHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 6;
  }

  return Math.max(1, Math.min(168, Math.round(value)));
}

export function WebDavBackupDialog({
  open,
  onOpenChange,
  backupSettings,
  onSaveAccount,
  onRemoveAccount,
  onUpdateBackupSettings,
  onTestConnection,
  onManualBackup,
  onManualRestore,
  onOpenRemoteDiff,
}: WebDavBackupDialogProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const hasSavedAccount = !!(
    backupSettings.webdavUrl.trim() &&
    backupSettings.username.trim() &&
    backupSettings.password &&
    backupSettings.remotePath.trim()
  );

  const [editing, setEditing] = useState(!hasSavedAccount);
  const [draft, setDraft] = useState(() => getEditableAccount(backupSettings));
  const [testing, setTesting] = useState(false);
  const [workingAction, setWorkingAction] = useState<
    null | 'backup' | 'restore' | 'diff'
  >(null);
  const [intervalDraft, setIntervalDraft] = useState(() =>
    String(backupSettings.autoBackupIntervalHours),
  );
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [diffDialogOpen, setDiffDialogOpen] = useState(false);
  const [diffResult, setDiffResult] = useState<BackupDiffResult | null>(null);

  useEffect(() => {
    if (!open) {
      setEditing(!hasSavedAccount);
      setDraft(getEditableAccount(backupSettings));
      setDiffDialogOpen(false);
      setDiffResult(null);
    }
  }, [backupSettings, hasSavedAccount, open]);

  useEffect(() => {
    setIntervalDraft(String(backupSettings.autoBackupIntervalHours));
  }, [backupSettings.autoBackupIntervalHours]);

  const accountComplete = !!(
    draft.webdavUrl.trim() && draft.username.trim() &&
    draft.password && draft.remotePath.trim()
  );
  const accountChanged =
    draft.webdavUrl.trim() !== backupSettings.webdavUrl.trim() ||
    draft.username.trim() !== backupSettings.username.trim() ||
    draft.password !== backupSettings.password ||
    draft.remotePath.trim() !== backupSettings.remotePath.trim();
  const canSaveAccount = accountComplete && accountChanged;
  const accountUsable = hasSavedAccount && !editing;

  const updateDraft = useCallback((partial: Partial<typeof draft>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const commitIntervalDraft = useCallback(() => {
    const normalized = clampBackupIntervalHours(Number(intervalDraft));
    setIntervalDraft(String(normalized));
    onUpdateBackupSettings({ autoBackupIntervalHours: normalized });
  }, [intervalDraft, onUpdateBackupSettings]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    try {
      await onTestConnection({
        ...backupSettings,
        ...draft,
      });
      toast.add({
        title: '连接测试成功',
      });
    } catch (error) {
      toast.add({
        title: '连接测试失败',
        description: error instanceof Error ? error.message : '测试连接失败',
      });
    } finally {
      setTesting(false);
    }
  }, [backupSettings, draft, onTestConnection]);

  const handleSave = useCallback(() => {
    if (!canSaveAccount) {
      return;
    }
    onSaveAccount({
      ...backupSettings,
      ...draft,
      webdavUrl: draft.webdavUrl.trim(),
      username: draft.username.trim(),
      remotePath: draft.remotePath.trim(),
    });
    setEditing(false);
  }, [
    backupSettings,
    canSaveAccount,
    draft,
    onSaveAccount,
  ]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[min(96vw,760px)] gap-0 overflow-hidden border-border/60 bg-background p-0 shadow-xl sm:max-w-[760px]"
          aria-describedby={undefined}
        >
          <DialogHeader className="border-b border-border/50 bg-background px-5 py-3.5">
            <DialogTitle>WebDAV 备份</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[min(78vh,660px)]">
            <div className="flex flex-col gap-2 p-4">
              <SectionCard
                title="WebDAV 账户"
                action={
                  !editing && hasSavedAccount ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveConfirmOpen(true)}
                      >
                        <Trash2 className="size-3.5" />
                        移除
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="size-3.5" />
                        编辑
                      </Button>
                    </div>
                  ) : null
                }
              >
                {!editing && hasSavedAccount ? (
                  <div className="grid gap-3 px-4 py-2.5 sm:grid-cols-3">
                    {[
                      ['地址', backupSettings.webdavUrl],
                      ['用户名', backupSettings.username],
                      ['路径', backupSettings.remotePath],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-border/60 bg-muted/15 p-3"
                      >
                        <div className="text-sm font-normal text-foreground">
                          {label}
                        </div>
                        <div className="mt-1 break-all text-sm text-foreground">
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <FieldGroup className="flex flex-col gap-2.5 px-4 py-2.5">
                    <Field>
                      <FieldLabel htmlFor="webdavbackupdialog-field-1" className="font-normal text-foreground">
                        WebDAV 地址
                      </FieldLabel>
                      <Input
                        id="webdavbackupdialog-field-1"
                        value={draft.webdavUrl}
                        onChange={(e) =>
                          updateDraft({ webdavUrl: e.target.value })
                        }
                        placeholder="https://dav.example.com/remote.php/dav/files/name/"
                      />
                    </Field>

                    <FieldGroup className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="webdavbackupdialog-field-2" className="font-normal text-foreground">
                          用户名
                        </FieldLabel>
                        <Input
                          id="webdavbackupdialog-field-2"
                          value={draft.username}
                          onChange={(e) =>
                            updateDraft({ username: e.target.value })
                          }
                          placeholder="user"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="webdavbackupdialog-field-3" className="font-normal text-foreground">
                          密码
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id="webdavbackupdialog-field-3"
                            type={passwordVisible ? 'text' : 'password'}
                            value={draft.password}
                            onChange={(e) =>
                              updateDraft({ password: e.target.value })
                            }
                            placeholder="app password"
                          />
                          <InputGroupAddon align="inline-end">
                            <InputGroupButton
                              size="icon-xs"
                              aria-label={
                                passwordVisible ? '隐藏密码' : '显示密码'
                              }
                              onClick={() =>
                                setPasswordVisible((value) => !value)
                              }
                            >
                              {passwordVisible ? <EyeOff /> : <Eye />}
                            </InputGroupButton>
                          </InputGroupAddon>
                        </InputGroup>
                      </Field>
                    </FieldGroup>

                    <Field>
                      <FieldLabel htmlFor="webdavbackupdialog-field-4" className="font-normal text-foreground">
                        远程备份路径
                      </FieldLabel>
                      <Input
                        id="webdavbackupdialog-field-4"
                        value={draft.remotePath}
                        onChange={(e) =>
                          updateDraft({ remotePath: e.target.value })
                        }
                        placeholder="newtab-pro/backup.json"
                      />
                    </Field>

                    <div className="flex justify-end gap-2 pt-0.5">
                      {hasSavedAccount ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(false);
                            setDraft(getEditableAccount(backupSettings));
                          }}
                        >
                          取消
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testing || !accountComplete}
                        onClick={() => void handleTestConnection()}
                        aria-busy={testing}
                      >
                        {testing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        测试连接
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canSaveAccount}
                        onClick={handleSave}
                      >
                        保存账户
                      </Button>
                    </div>
                  </FieldGroup>
                )}
              </SectionCard>

              <SectionCard
                title="备份与恢复"
                className={!accountUsable ? 'opacity-60' : undefined}
              >
                <SwitchRow
                  checked={backupSettings.autoBackupEnabled}
                  onCheckedChange={(next) =>
                    onUpdateBackupSettings({ autoBackupEnabled: next })
                  }
                  label="启用定期自动备份"
                  disabled={!accountUsable}
                />

                {backupSettings.autoBackupEnabled ? (
                  <>
                    <div
                      className={cn(
                        'flex items-center justify-between gap-4 px-4 py-2.5',
                        !accountUsable && 'opacity-55',
                      )}
                    >
                      <div className="text-sm font-normal text-foreground">
                        备份间隔
                      </div>
                      <div className="flex h-9 w-24 overflow-hidden rounded-lg border border-input bg-background shadow-xs transition-colors focus-within:ring-1 focus-within:ring-ring">
                        <Input
                          type="number"
                          min={1}
                          max={168}
                          disabled={!accountUsable}
                          value={intervalDraft}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!/^\d*$/.test(next)) {
                              return;
                            }
                            setIntervalDraft(next);
                          }}
                          onBlur={commitIntervalDraft}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitIntervalDraft();
                            }
                          }}
                          className="hide-number-spin h-full flex-1 rounded-none border-0 bg-transparent px-3 pr-2 text-right shadow-none focus-visible:ring-0"
                        />
                        <div className="flex w-5 flex-col border-l border-border/70 bg-muted/25">
                          <button
                            type="button"
                            aria-label="增加备份间隔"
                            disabled={!accountUsable}
                            onClick={() => {
                              const base = intervalDraft
                                ? Number(intervalDraft)
                                : backupSettings.autoBackupIntervalHours;
                              const next = clampBackupIntervalHours(base + 1);
                              setIntervalDraft(String(next));
                              onUpdateBackupSettings({
                                autoBackupIntervalHours: next,
                              });
                            }}
                            className="flex flex-1 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ChevronUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="减少备份间隔"
                            disabled={!accountUsable}
                            onClick={() => {
                              const base = intervalDraft
                                ? Number(intervalDraft)
                                : backupSettings.autoBackupIntervalHours;
                              const next = clampBackupIntervalHours(base - 1);
                              setIntervalDraft(String(next));
                              onUpdateBackupSettings({
                                autoBackupIntervalHours: next,
                              });
                            }}
                            className="flex flex-1 items-center justify-center border-t border-border/70 text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ChevronDown className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="flex flex-col gap-3 px-4 py-2.5">
                  <div
                    className="min-w-0 truncate text-xs text-muted-foreground"
                    title={backupSettings.lastBackupError ? `最近失败：${backupSettings.lastBackupError}` : undefined}
                  >
                    最近备份：
                    {backupSettings.lastBackupAt
                      ? ` ${new Date(backupSettings.lastBackupAt).toLocaleString('zh-CN')}`
                      : ' 暂无'}
                    {backupSettings.lastBackupError ? (
                      <span className="ml-3 text-destructive">
                        最近失败：{backupSettings.lastBackupError}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!accountUsable || workingAction !== null}
                      aria-busy={workingAction === 'diff'}
                      onClick={async () => {
                        setWorkingAction('diff');
                        try {
                          const result = await onOpenRemoteDiff();
                          setDiffResult(result);
                          setDiffDialogOpen(true);
                        } finally {
                          setWorkingAction(null);
                        }
                      }}
                    >
                      {workingAction === 'diff' ? <LoaderCircle className="size-3.5 animate-spin" /> : <GitCompareArrows className="size-3.5" />}
                      查看差异
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!accountUsable || workingAction !== null}
                      aria-busy={workingAction === 'backup'}
                      onClick={async () => {
                        setWorkingAction('backup');
                        try {
                          await onManualBackup();
                        } finally {
                          setWorkingAction(null);
                        }
                      }}
                    >
                      {workingAction === 'backup' ? <LoaderCircle className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
                      立即备份
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!accountUsable || workingAction !== null}
                      onClick={() => setRestoreConfirmOpen(true)}
                    >
                      <CloudDownload className="size-3.5" />
                      恢复备份
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeConfirmOpen}
        onOpenChange={setRemoveConfirmOpen}
        title="移除 WebDAV 账户"
        description="移除后将清空已保存的 WebDAV 账号，并关闭自动备份。确认继续？"
        confirmText="移除"
        destructive
        onConfirm={() => {
          onRemoveAccount();
          setEditing(true);
          setDraft(getEditableAccount(DEFAULT_SETTINGS.backup));
          toast.add({ title: '已移除 WebDAV 账户' });
        }}
      />

      <ConfirmDialog
        open={restoreConfirmOpen}
        onOpenChange={setRestoreConfirmOpen}
        title="恢复远程备份"
        description="恢复会用 WebDAV 里的备份覆盖当前本地数据。此操作不可撤销，确认继续？"
        confirmText="恢复"
        closeOnConfirm={false}
        confirming={workingAction === 'restore'}
        destructive
        onConfirm={() => {
          setWorkingAction('restore');
          void onManualRestore().finally(() => {
            setWorkingAction(null);
          });
        }}
      />

      <BackupDiffDialog
        open={diffDialogOpen}
        onOpenChange={setDiffDialogOpen}
        result={diffResult}
      />
    </>
  );
}
