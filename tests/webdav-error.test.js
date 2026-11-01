import { expect, test } from 'bun:test';
import { createWebDavResponseError } from '../entrypoints/newtab/webdav-error';

test('错误显示 HTTP 状态文字、请求方法及服务端摘要', async () => {
  for (const [status, body, expected] of [
    [401, '{"error":"Invalid credentials"}', 'HTTP 401 Unauthorized） — Invalid credentials'],
    [403, '<!doctype html><html><title>Vercel Security Checkpoint</title><script>hidden script</script></html>', 'HTTP 403 Forbidden） — Vercel Security Checkpoint'],
    [404, ' File not found\n', 'HTTP 404 Not Found） — File not found'],
    [500, '', 'HTTP 500 Internal Server Error）'],
    [403, '{"error":{"message":"Access denied"}}', 'HTTP 403 Forbidden） — Access denied'],
    [403, '<d:error xmlns:d="DAV:"><d:responsedescription>Access &amp; permission denied</d:responsedescription></d:error>', 'HTTP 403 Forbidden） — Access & permission denied'],
    [403, '<html><head><title>Security&#32;Check &amp; Access</title></head></html>', 'HTTP 403 Forbidden） — Security Check & Access'],
  ]) {
    const error = await createWebDavResponseError(new Response(body, { status }), '连接测试失败', 'PROPFIND');
    expect(error.message).toBe(`连接测试失败（PROPFIND，${expected}`);
  }
});

test('错误摘要规范空白并限制长度，HTML 无标题时不展示页面源码', async () => {
  const response = new Response(JSON.stringify({ message: 'rejected\n' + '错误'.repeat(200) }), { status: 403 });
  const error = await createWebDavResponseError(response, '备份上传失败', 'PUT');
  expect(error.message).toContain('rejected 错误');
  const summary = error.message.split(' — ')[1];
  expect(Array.from(summary)).toHaveLength(301);
  expect(summary.endsWith('…')).toBe(true);
  expect(summary).not.toContain('\n');
  const htmlError = await createWebDavResponseError(new Response('<html><script>do not show</script></html>', { status: 403 }), '请求失败', 'GET');
  expect(htmlError.message).toBe('请求失败（GET，HTTP 403 Forbidden）');
});

test('读取错误响应正文失败时保留 HTTP 状态，优先保留服务端状态文字', async () => {
  const response = new Response('', { status: 503, statusText: 'Temporarily Unavailable' });
  response.text = async () => { throw new Error('流已关闭'); };
  const error = await createWebDavResponseError(response, '备份下载失败', 'GET');
  expect(error.message).toBe('备份下载失败（GET，HTTP 503 Temporarily Unavailable）');
});
