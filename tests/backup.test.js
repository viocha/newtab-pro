import { expect, mock, spyOn, test } from 'bun:test';
mock.module('wxt/browser', () => ({ browser: {} }));
const { createBackupPayload, parseBackupPayload, testWebDavConnection } = await import('../entrypoints/newtab/backup');
const { DEFAULT_SETTINGS } = await import('../entrypoints/newtab/constants');
const { restoreSpaceStore } = await import('../entrypoints/newtab/use-board-store');
const { restoreSettings } = await import('../entrypoints/newtab/use-settings-store');
const { createLocalBackupDiffSnapshot, parseBackupDiffSnapshot, compareBackupSnapshots } = await import('../entrypoints/newtab/backup-diff');

const store = {
  activeSpaceId: 's2',
  spaces: ['s1', 's2'].map(id => ({ id, title: id, board: { groups: [{
    id: `g-${id}`, title: '分组', color: '#ffffff', collapsed: true,
    columnSpan: 2, viewMode: 'browser-tree', iconSize: 'md',
    browserTreeFolderId: 'local-folder', browserTreeMaxItems: 20,
    bookmarks: [{ id: 'b', title: '书签', url: 'https://example.com' }],
    subgroups: [{ id: 'sub', title: '小组', collapsed: true, viewMode: 'list', iconSize: 'md', bookmarks: [] }],
  }] } })),
};
const settings = { ...DEFAULT_SETTINGS, columns: 4, selectedBatchEngineIds: ['google'], searchHistory: ['本机搜索'] };

const connectionConfig = {
  ...DEFAULT_SETTINGS.backup,
  webdavUrl: ' https://dav.example.com/dav ', username: 'user', password: 'password',
  remotePath: '尚未创建的目录/backup.json',
};

test('连接测试仅查询服务自身属性，备份路径无需存在', async () => {
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 207 }));
  try {
    await testWebDavConnection(connectionConfig);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://dav.example.com/dav/');
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('0');
    expect(init.headers.Authorization).toBe('Basic ' + btoa('user:password'));
    expect(init.body).toContain('<d:resourcetype/>');
  } finally {
    request.mockRestore();
  }
});

test('连接被拒绝时直接报告状态码，普通网页响应不能视为 WebDAV 连接成功', async () => {
  const request = spyOn(globalThis, 'fetch');
  try {
    for (const status of [401, 403, 404, 405, 500, 200]) {
      request.mockResolvedValueOnce(new Response('', { status }));
      await expect(testWebDavConnection(connectionConfig)).rejects.toThrow(String(status));
    }
    expect(request).toHaveBeenCalledTimes(6);
  } finally {
    request.mockRestore();
  }
});

test('连接网络错误保留原因，配置不完整时不发出请求', async () => {
  const request = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('网络不可达'));
  try {
    await expect(testWebDavConnection(connectionConfig)).rejects.toThrow('网络不可达');
    await expect(testWebDavConnection({ ...connectionConfig, webdavUrl: '' })).rejects.toThrow('请填写 WebDAV 地址');
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    request.mockRestore();
  }
});

test('备份包含内容和配置，排除本机状态及未知字段', () => {
  const payload = createBackupPayload(store, { ...settings, unexpectedSecret: 'secret' });
  const serialized = JSON.parse(JSON.stringify(payload));
  expect(serialized.version).toBe(3);
  expect(serialized.spaces.activeSpaceId).toBeUndefined();
  const group = serialized.spaces.spaces[0].board.groups[0];
  expect(group.collapsed).toBeUndefined();
  expect(group.browserTreeFolderId).toBeUndefined();
  expect(group.subgroups[0].collapsed).toBeUndefined();
  expect(group.columnSpan).toBe(2);
  expect(group.bookmarks[0].url).toBe('https://example.com');
  expect(serialized.settings.searchHistory).toBeUndefined();
  expect(serialized.settings.backup).toBeUndefined();
  expect(serialized.settings.unexpectedSecret).toBeUndefined();
  expect(serialized.settings.columns).toBe(4);
  expect(serialized.settings.selectedBatchEngineIds).toEqual(['google']);
});

test('同设备恢复保留工作空间、折叠和绑定，新设备默认展开且不绑定', () => {
  const payload = createBackupPayload(store, settings);
  const restored = restoreSpaceStore(payload.spaces, store);
  expect(restored.activeSpaceId).toBe('s2');
  expect(restored.spaces[0].board.groups[0].collapsed).toBe(true);
  expect(restored.spaces[0].board.groups[0].browserTreeFolderId).toBe('local-folder');
  expect(restored.spaces[0].board.groups[0].subgroups[0].collapsed).toBe(true);
  const fresh = restoreSpaceStore(payload.spaces, { activeSpaceId: 'missing', spaces: [] });
  expect(fresh.activeSpaceId).toBe('s1');
  expect(fresh.spaces[0].board.groups[0].collapsed).toBe(false);
  expect(fresh.spaces[0].board.groups[0].browserTreeFolderId).toBeUndefined();
});

test('恢复设置保留本机搜索历史和 WebDAV 配置', () => {
  const local = { ...settings, backup: { ...settings.backup, password: 'local-password' } };
  const restored = restoreSettings({ ...createBackupPayload(store, settings).settings, searchHistory: ['远程搜索'], backup: { password: 'remote' }, columns: 2 }, local);
  expect(restored.searchHistory).toEqual(['本机搜索']);
  expect(restored.backup.password).toBe('local-password');
  expect(restored.columns).toBe(2);
});

test('分组 iframe 自动运行配置在备份和恢复后保留三态', () => {
  for (const autoRun of [undefined, true, false]) {
    const configured = structuredClone(store);
    configured.spaces[0].board.groups[0].iframeAutoRun = autoRun;
    const payload = JSON.parse(JSON.stringify(createBackupPayload(configured, settings)));
    expect(payload.spaces.spaces[0].board.groups[0].iframeAutoRun).toBe(autoRun);
    const restored = restoreSpaceStore(payload.spaces, store);
    expect(restored.spaces[0].board.groups[0].iframeAutoRun).toBe(autoRun);
  }
});

test('旧备份中本机状态不制造差异，新备份可以读取', () => {
  const local = createLocalBackupDiffSnapshot(store, settings);
  const remote = parseBackupDiffSnapshot({ version: 2, spaces: { ...store, activeSpaceId: 's1' }, settings: { ...settings, searchHistory: ['其他设备'], backup: { password: 'ignored' } } });
  expect(compareBackupSnapshots(local, remote).comparisons['remote-to-local'].hasChanges).toBe(false);
  expect(parseBackupPayload(createBackupPayload(store, settings))).not.toBeNull();
});
