import { GROUP_GRADIENTS } from './constants';

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeUrl(input: string) {
  const raw = input.trim();
  if (!raw) {
    throw new Error('URL is required');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return parsed.toString();
}

export function tryNormalizeUrl(input: string) {
  try {
    return normalizeUrl(input);
  } catch {
    return null;
  }
}

import { browser } from 'wxt/browser';

export function createFaviconUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
      const result = new URL(browser.runtime.getURL('/_favicon/'));
      result.searchParams.set('pageUrl', url);
      result.searchParams.set('size', '64');
      return result.toString();
    }
    // Fallback to Google Favicon service if not in an extension context
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return undefined;
  }
}

export function pickGroupGradient(index: number) {
  return GROUP_GRADIENTS[index % GROUP_GRADIENTS.length];
}
