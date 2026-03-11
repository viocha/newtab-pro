import type { AppSettings, BackupSettings, SpaceStore } from './types';

export const BACKUP_PAYLOAD_VERSION = 2;
export const AUTO_BACKUP_ALARM_NAME = 'newtab-pro:auto-backup';
export const AUTO_BACKUP_CHECK_PERIOD_MINUTES = 15;

export type BackupPayload = {
  version: typeof BACKUP_PAYLOAD_VERSION;
  exportedAt: string;
  spaces: SpaceStore;
  settings: Omit<AppSettings, 'backup'>;
};

export type BackupParseResult = {
  spaceStore: unknown;
  settings?: unknown;
  exportedAt?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function createBackupPayload(spaceStore: SpaceStore, settings: AppSettings): BackupPayload {
  const { backup: _backup, ...restSettings } = settings;
  return {
    version: BACKUP_PAYLOAD_VERSION,
    exportedAt: new Date().toISOString(),
    spaces: spaceStore,
    settings: restSettings,
  };
}

export function parseBackupPayload(raw: unknown): BackupParseResult | null {
  if (!isObject(raw)) {
    return null;
  }

  if (raw.version === BACKUP_PAYLOAD_VERSION && 'spaces' in raw) {
    return {
      spaceStore: raw.spaces,
      settings: raw.settings,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined,
    };
  }

  if (
    (raw.version === 1 || !('version' in raw)) &&
    Array.isArray(raw.spaces) &&
    typeof raw.activeSpaceId === 'string'
  ) {
    return {
      spaceStore: raw,
    };
  }

  return null;
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function createAuthHeaders(config: Pick<BackupSettings, 'username' | 'password'>) {
  return {
    Authorization: `Basic ${encodeBase64Utf8(`${config.username}:${config.password}`)}`,
  };
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function splitRemotePath(remotePath: string) {
  return remotePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildRemoteUrl(baseUrl: string, remotePath: string, isDirectory = false) {
  const base = new URL(normalizeBaseUrl(baseUrl));
  const segments = splitRemotePath(remotePath).map(encodeURIComponent);
  const path = segments.join('/');
  const suffix = isDirectory ? '/' : '';
  return new URL(`${path}${suffix}`, base).toString();
}

function getConnectionTestPath(remotePath: string) {
  const segments = splitRemotePath(remotePath);
  const fileName = segments.pop() ?? 'backup.json';
  const timestamp = Date.now();
  segments.push(`${fileName}.connection-test-${timestamp}.json`);
  return segments.join('/');
}

async function ensureRemoteFolders(config: BackupSettings) {
  const segments = splitRemotePath(config.remotePath);
  if (segments.length <= 1) {
    return;
  }

  const authHeaders = createAuthHeaders(config);
  for (let index = 0; index < segments.length - 1; index += 1) {
    const currentPath = segments.slice(0, index + 1).join('/');
    const response = await fetch(buildRemoteUrl(config.webdavUrl, currentPath, true), {
      method: 'MKCOL',
      headers: authHeaders,
    });

    if ([200, 201, 204, 301, 302, 405].includes(response.status)) {
      continue;
    }

    throw new Error(`创建远程目录失败（${response.status}）`);
  }
}

function assertBackupConfig(config: BackupSettings) {
  if (!config.webdavUrl.trim()) {
    throw new Error('请填写 WebDAV 地址');
  }
  if (!config.username.trim()) {
    throw new Error('请填写 WebDAV 用户名');
  }
  if (!config.password) {
    throw new Error('请填写 WebDAV 密码');
  }
  if (!config.remotePath.trim()) {
    throw new Error('请填写远程备份路径');
  }
}

export function isBackupReady(config: BackupSettings) {
  return !!(
    config.webdavUrl.trim() &&
    config.username.trim() &&
    config.password &&
    config.remotePath.trim()
  );
}

export function isAutoBackupDue(config: BackupSettings, now = Date.now()) {
  if (!config.autoBackupEnabled) {
    return false;
  }

  if (!config.lastBackupAt) {
    return true;
  }

  const lastBackupAt = Date.parse(config.lastBackupAt);
  if (Number.isNaN(lastBackupAt)) {
    return true;
  }

  const intervalMs = Math.max(1, config.autoBackupIntervalHours) * 60 * 60 * 1000;
  return now - lastBackupAt >= intervalMs;
}

export async function uploadBackupToWebDav(config: BackupSettings, payload: BackupPayload) {
  assertBackupConfig(config);
  await ensureRemoteFolders(config);

  const response = await fetch(buildRemoteUrl(config.webdavUrl, config.remotePath), {
    method: 'PUT',
    headers: {
      ...createAuthHeaders(config),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload, null, 2),
  });

  if (!response.ok) {
    throw new Error(`备份上传失败（${response.status}）`);
  }

  return {
    uploadedAt: new Date().toISOString(),
  };
}

export async function downloadBackupFromWebDav(config: BackupSettings) {
  assertBackupConfig(config);

  const response = await fetch(buildRemoteUrl(config.webdavUrl, config.remotePath), {
    method: 'GET',
    headers: createAuthHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`备份下载失败（${response.status}）`);
  }

  return JSON.parse(await response.text()) as unknown;
}

export async function testWebDavConnection(config: BackupSettings) {
  assertBackupConfig(config);
  await ensureRemoteFolders(config);

  const testPath = getConnectionTestPath(config.remotePath);
  const authHeaders = createAuthHeaders(config);

  const putResponse = await fetch(buildRemoteUrl(config.webdavUrl, testPath), {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ ok: true, testedAt: new Date().toISOString() }),
  });

  if (!putResponse.ok) {
    throw new Error(`测试写入失败（${putResponse.status}）`);
  }

  const deleteResponse = await fetch(buildRemoteUrl(config.webdavUrl, testPath), {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!deleteResponse.ok) {
    throw new Error(`测试清理失败（${deleteResponse.status}）`);
  }
}
