import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const faviconCache = new Map<string, string>();

// ── Chrome /_favicon/ placeholder size ───────────────────────────────
let chromePlaceholderSize = -1;
let chromePlaceholderPromise: Promise<number> | null = null;

async function getChromePlaceholderSize() {
  if (chromePlaceholderSize !== -1) return chromePlaceholderSize;
  if (!chromePlaceholderPromise) {
    chromePlaceholderPromise = (async () => {
      try {
        const dummyUrl = browser.runtime.getURL(`/_favicon/?pageUrl=https://this-is-a-placeholder-check-${Date.now()}.com&size=64`);
        const blob = await fetch(dummyUrl).then((r) => r.blob());
        return blob.size;
      } catch {
        return 0;
      }
    })();
  }
  chromePlaceholderSize = await chromePlaceholderPromise;
  return chromePlaceholderSize;
}

// ── Google S2 placeholder size ────────────────────────────────────────
let googlePlaceholderSize = -1;
let googlePlaceholderPromise: Promise<number> | null = null;

async function getGooglePlaceholderSize() {
  if (googlePlaceholderSize !== -1) return googlePlaceholderSize;
  if (!googlePlaceholderPromise) {
    googlePlaceholderPromise = (async () => {
      try {
        const fakeUrl = `https://www.google.com/s2/favicons?domain=this-is-a-placeholder-check-${Date.now()}.invalid&sz=64`;
        const blob = await fetch(fakeUrl).then((r) => r.blob());
        return blob.size;
      } catch {
        return 0;
      }
    })();
  }
  googlePlaceholderSize = await googlePlaceholderPromise;
  return googlePlaceholderSize;
}

// ── helpers ───────────────────────────────────────────────────────────
function buildChromeFavUrl(url: string) {
  return browser.runtime?.getURL
    ? browser.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`)
    : '';
}

function buildGoogleFavUrl(hostname: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
}

// ── main resolver ─────────────────────────────────────────────────────
// Resolution order:
//   1. Chrome /_favicon/ — fetch + placeholder-size check
//   2. Google S2          — fetch + placeholder-size check
//   3. Fall back to Chrome /_favicon/ URL (best-effort, onError handles remainder)
export async function resolveFaviconUrl(url: string): Promise<string> {
  if (faviconCache.has(url)) return faviconCache.get(url)!;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const chromeFavUrl = buildChromeFavUrl(url);

  if (!isHttp || !chromeFavUrl) {
    const finalUrl = chromeFavUrl || buildGoogleFavUrl(parsed.hostname);
    faviconCache.set(url, finalUrl);
    return finalUrl;
  }

  try {
    // Step 1: Try Chrome local favicon
    const [pSize, res] = await Promise.all([getChromePlaceholderSize(), fetch(chromeFavUrl)]);
    const blob = await res.blob();

    if (blob.size !== pSize) {
      faviconCache.set(url, chromeFavUrl);
      return chromeFavUrl;
    }

    // Step 2: Chrome returned placeholder → try Google
    const googleUrl = buildGoogleFavUrl(parsed.hostname);
    try {
      const [gpSize, googleRes] = await Promise.all([
        getGooglePlaceholderSize(),
        fetch(googleUrl),
      ]);
      const googleBlob = await googleRes.blob();

      if (gpSize !== 0 && googleBlob.size === gpSize) {
        // Google also placeholder → fall back to Chrome URL (best effort)
        faviconCache.set(url, chromeFavUrl);
        return chromeFavUrl;
      }

      faviconCache.set(url, googleUrl);
      return googleUrl;
    } catch {
      faviconCache.set(url, chromeFavUrl);
      return chromeFavUrl;
    }
  } catch {
    const googleUrl = buildGoogleFavUrl(parsed.hostname);
    faviconCache.set(url, googleUrl);
    return googleUrl;
  }
}

export function FaviconImage({ url, className, tabIconUrl, ...props }: { url: string; className?: string; tabIconUrl?: string;[key: string]: any }) {
  const initialUrl = tabIconUrl || faviconCache.get(url) || '';

  const [src, setSrc] = useState<string>(initialUrl);

  useEffect(() => {
    if (tabIconUrl) return;

    let alive = true;
    resolveFaviconUrl(url).then(resolved => {
      if (alive) {
        setSrc(resolved);
      }
    });

    return () => { alive = false; };
  }, [url, tabIconUrl]);

  if (!src) {
    return <span className={`inline-block ${className}`} {...props} />;
  }

  return (
    <img
      src={src}
      className={className}
      onError={(e) => {
        try {
          const parsed = new URL(url);
          const chromeFavUrl = buildChromeFavUrl(url);
          const googleUrl = buildGoogleFavUrl(parsed.hostname);
          const current = e.currentTarget.src;
          if (current !== googleUrl) {
            // First error: try Google
            e.currentTarget.src = googleUrl;
            faviconCache.set(url, googleUrl);
          } else if (chromeFavUrl && current !== chromeFavUrl) {
            // Google also failed: fall back to Chrome URL
            e.currentTarget.src = chromeFavUrl;
            faviconCache.set(url, chromeFavUrl);
          }
        } catch { }
      }}
      {...props}
    />
  );
}
