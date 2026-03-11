import { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudDownload, CloudUpload, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { DEFAULT_SETTINGS } from '../constants';
import type { BackupSettings } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  rounded,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  description?: string;
  rounded?: 'top' | 'bottom' | 'both' | 'none';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={[
        'flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/40',
        rounded === 'top' ? 'rounded-t-lg' : '',
        rounded === 'bottom' ? 'rounded-b-lg' : '',
        rounded === 'both' ? 'rounded-lg' : '',
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div
        className={[
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </div>
    </button>
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

function toSignature(account: {
  webdavUrl: string;
  username: string;
  password: string;
  remotePath: string;
}) {
  return [
    account.webdavUrl.trim(),
    account.username.trim(),
    account.password,
    account.remotePath.trim(),
  ].join('||');
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
};

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
}: WebDavBackupDialogProps) {
  const hasSavedAccount = !!(
    backupSettings.webdavUrl.trim() &&
    backupSettings.username.trim() &&
    backupSettings.password &&
    backupSettings.remotePath.trim()
  );

  const [editing, setEditing] = useState(!hasSavedAccount);
  const [draft, setDraft] = useState(() => getEditableAccount(backupSettings));
  const [lastTestedSignature, setLastTestedSignature] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [workingAction, setWorkingAction] = useState<null | 'backup' | 'restore'>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditing(!hasSavedAccount);
      setDraft(getEditableAccount(backupSettings));
      setLastTestedSignature(null);
    }
  }, [backupSettings, hasSavedAccount, open]);

  const currentSignature = useMemo(() => toSignature(draft), [draft]);
  const connectionVerified = currentSignature === lastTestedSignature;
  const accountUsable = hasSavedAccount && !editing;

  const updateDraft = useCallback(
    (partial: Partial<typeof draft>) => {
      setDraft((prev) => ({ ...prev, ...partial }));
      setLastTestedSignature(null);
    },
    [],
  );

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    try {
      await onTestConnection({
        ...backupSettings,
        ...draft,
      });
      setLastTestedSignature(currentSignature);
      toast('连接测试成功', { description: '已通过读写校验，可以保存账户。' });
    } catch (error) {
      setLastTestedSignature(null);
      toast('连接测试失败', {
        description: error instanceof Error ? error.message : '测试连接失败',
      });
    } finally {
      setTesting(false);
    }
  }, [backupSettings, currentSignature, draft, onTestConnection]);

  const handleSave = useCallback(() => {
    if (!connectionVerified) {
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
    setLastTestedSignature(null);
    toast(hasSavedAccount ? '账户已更新' : '账户已添加');
  }, [backupSettings, connectionVerified, draft, hasSavedAccount, onSaveAccount]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(96vw,520px)]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>WebDAV 备份</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">WebDAV 账户</div>
                  <div className="text-xs text-muted-foreground">
                    先测试连接，成功后才能保存账户并使用下面的备份功能。
                  </div>
                </div>
                {!editing && hasSavedAccount ? (
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="mr-1.5 size-3.5" />
                      编辑
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveConfirmOpen(true)}>
                      <Trash2 className="mr-1.5 size-3.5" />
                      移除
                    </Button>
                  </div>
                ) : null}
              </div>

              {!editing && hasSavedAccount ? (
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 text-xs text-muted-foreground space-y-1">
                  <div>地址：{backupSettings.webdavUrl}</div>
                  <div>用户名：{backupSettings.username}</div>
                  <div>路径：{backupSettings.remotePath}</div>
                </div>
              ) : (
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-3 space-y-3">
                  {!hasSavedAccount && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Plus className="size-3.5" />
                      添加一个 WebDAV 账户
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">WebDAV 地址</label>
                    <Input
                      value={draft.webdavUrl}
                      onChange={(e) => updateDraft({ webdavUrl: e.target.value })}
                      placeholder="https://dav.example.com/remote.php/dav/files/name/"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">用户名</label>
                      <Input
                        value={draft.username}
                        onChange={(e) => updateDraft({ username: e.target.value })}
                        placeholder="user"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">密码</label>
                      <Input
                        type="password"
                        value={draft.password}
                        onChange={(e) => updateDraft({ password: e.target.value })}
                        placeholder="app password"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">远程备份路径</label>
                    <Input
                      value={draft.remotePath}
                      onChange={(e) => updateDraft({ remotePath: e.target.value })}
                      placeholder="newtab-pro/backup.json"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    {hasSavedAccount ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(false);
                          setDraft(getEditableAccount(backupSettings));
                          setLastTestedSignature(null);
                        }}
                      >
                        取消
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        testing ||
                        !draft.webdavUrl.trim() ||
                        !draft.username.trim() ||
                        !draft.password ||
                        !draft.remotePath.trim()
                      }
                      onClick={() => void handleTestConnection()}
                    >
                      <Link2 className="mr-1.5 size-3.5" />
                      {testing ? '测试中…' : '测试连接'}
                    </Button>
                    <Button type="button" size="sm" disabled={!connectionVerified} onClick={handleSave}>
                      保存账户
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section
              className={[
                'space-y-3 rounded-lg border border-border/50 px-3 py-3',
                accountUsable ? 'bg-muted/20' : 'bg-muted/10 opacity-55',
              ].join(' ')}
            >
              <div>
                <div className="text-sm font-medium">备份与恢复</div>
                <div className="text-xs text-muted-foreground">
                  {!accountUsable
                    ? '请先添加并保存一个测试通过的 WebDAV 账户。'
                    : '使用当前已保存的 WebDAV 账户执行备份与恢复。'}
                </div>
              </div>

              <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-background/60">
                <Toggle
                  checked={backupSettings.autoBackupEnabled}
                  onCheckedChange={(v) => onUpdateBackupSettings({ autoBackupEnabled: v })}
                  label="启用定期自动备份"
                  description="有网络时按设定小时数自动上传，默认 6 小时"
                  rounded={backupSettings.autoBackupEnabled ? 'top' : 'both'}
                  disabled={!accountUsable}
                />
                {backupSettings.autoBackupEnabled && (
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium">备份间隔</div>
                      <div className="text-xs text-muted-foreground">单位：小时</div>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      disabled={!accountUsable}
                      value={backupSettings.autoBackupIntervalHours}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        onUpdateBackupSettings({
                          autoBackupIntervalHours:
                            Number.isFinite(value) && value > 0
                              ? Math.max(1, Math.min(168, Math.round(value)))
                              : 6,
                        });
                      }}
                      className="h-8 w-24 text-right"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <div>
                  最近成功备份：
                  {backupSettings.lastBackupAt
                    ? ` ${new Date(backupSettings.lastBackupAt).toLocaleString('zh-CN')}`
                    : ' 暂无'}
                </div>
                {backupSettings.lastBackupError && (
                  <div className="text-destructive">最近一次失败：{backupSettings.lastBackupError}</div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!accountUsable || workingAction !== null}
                  onClick={async () => {
                    setWorkingAction('backup');
                    try {
                      await onManualBackup();
                    } finally {
                      setWorkingAction(null);
                    }
                  }}
                >
                  <CloudUpload className="mr-1.5 size-3.5" />
                  {workingAction === 'backup' ? '备份中…' : '立即备份'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!accountUsable || workingAction !== null}
                  onClick={() => setRestoreConfirmOpen(true)}
                >
                  <CloudDownload className="mr-1.5 size-3.5" />
                  从 WebDAV 恢复
                </Button>
              </div>
            </section>
          </div>
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
          setLastTestedSignature(null);
          toast('已移除 WebDAV 账户');
        }}
      />

      <ConfirmDialog
        open={restoreConfirmOpen}
        onOpenChange={setRestoreConfirmOpen}
        title="恢复远程备份"
        description="恢复会用 WebDAV 里的备份覆盖当前本地数据。此操作不可撤销，确认继续？"
        confirmText={workingAction === 'restore' ? '恢复中…' : '确认恢复'}
        destructive
        onConfirm={() => {
          setWorkingAction('restore');
          void onManualRestore().finally(() => {
            setWorkingAction(null);
          });
        }}
      />
    </>
  );
}
