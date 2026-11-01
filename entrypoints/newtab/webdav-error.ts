const statusTexts: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 412: 'Precondition Failed',
  413: 'Content Too Large', 415: 'Unsupported Media Type', 423: 'Locked',
  429: 'Too Many Requests', 500: 'Internal Server Error', 501: 'Not Implemented',
  502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};

function decodeXmlText(text: string) {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match;
    const value = entity.charAt(1).toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
  });
}

function responseMessage(body: string) {
  let message = body.trim();
  try {
    const value: unknown = JSON.parse(message);
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['message', 'error', 'detail', 'description']) {
        const detail = record[key];
        if (typeof detail === 'string' && detail.trim()) return detail;
        if (detail && typeof detail === 'object' && 'message' in detail && typeof detail.message === 'string') return detail.message;
      }
    }
  } catch {
    // 非 JSON 响应按 HTML、WebDAV XML 或纯文本提取。
  }
  if (/<(?:html\b|!doctype\s+html)/i.test(message)) {
    message = message.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '';
  } else if (/^<\??[a-z]/i.test(message)) {
    message = message.match(/<(?:[\w.-]+:)?(?:responsedescription|message)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:responsedescription|message)\s*>/i)?.[1] ?? '';
  }
  return decodeXmlText(message.replace(/<[^>]*>/g, ' '));
}

/** 提取服务端错误摘要，避免把整页 HTML 带入提示。 */
export async function createWebDavResponseError(response: Response, action: string, method: string) {
  let message = responseMessage(await response.text().catch(() => ''));
  message = message.replace(/\s+/g, ' ').trim();
  const characters = Array.from(message);
  if (characters.length > 300) message = characters.slice(0, 300).join('') + '…';
  const status = [response.status, response.statusText || statusTexts[response.status]].filter(Boolean).join(' ');
  return new Error(`${action}（${method}，HTTP ${status}）${message ? ` — ${message}` : ''}`);
}
