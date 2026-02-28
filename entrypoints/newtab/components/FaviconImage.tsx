import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const faviconCache = new Map<string, string>();
let placeholderSize = -1;
let placeholderPromise: Promise<number> | null = null;

async function getPlaceholderSize() {
  if (placeholderSize !== -1) return placeholderSize;
  if (!placeholderPromise) {
    placeholderPromise = (async () => {
      try {
        const dummyUrl = browser.runtime.getURL(`/_favicon/?pageUrl=https://this-is-a-placeholder-check-${Date.now()}.com&size=64`);
        const dummyRes = await fetch(dummyUrl);
        const dummyBlob = await dummyRes.blob();
        return dummyBlob.size;
      } catch {
        return 0;
      }
    })();
  }
  placeholderSize = await placeholderPromise;
  return placeholderSize;
}

export async function resolveFaviconUrl(url: string): Promise<string> {
  if (faviconCache.has(url)) return faviconCache.get(url)!;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }

  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const chromeFavUrl = typeof browser !== 'undefined' && browser.runtime?.getURL
    ? browser.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`)
    : '';

  if (!isHttp || !chromeFavUrl) {
    const finalUrl = chromeFavUrl || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
    faviconCache.set(url, finalUrl);
    return finalUrl;
  }

  try {
    const pSize = await getPlaceholderSize();
    const res = await fetch(chromeFavUrl);
    const blob = await res.blob();

    if (blob.size === pSize) {
      const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
      faviconCache.set(url, googleUrl);
      return googleUrl;
    }

    faviconCache.set(url, chromeFavUrl);
    return chromeFavUrl;
  } catch {
    const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
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
          const fb = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
          if (e.currentTarget.src !== fb) {
            e.currentTarget.src = fb;
            faviconCache.set(url, fb);
          }
        } catch { }
      }}
      {...props}
    />
  );
}
