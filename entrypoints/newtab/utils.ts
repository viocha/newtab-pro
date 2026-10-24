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

  // Non-http(s) protocols (e.g. chrome://, edge://, about:, file://)
  // Preserve exactly as entered — do NOT modify.
  if (!(/^https?:\/\//i.test(raw)) && /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(raw)) {
    return raw;
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


export function pickGroupGradient(index: number) {
  return GROUP_GRADIENTS[index % GROUP_GRADIENTS.length]!;
}
