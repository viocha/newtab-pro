import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';

const WINDOW_OPEN_PREFS_KEY = 'newtab-pro:window-open-prefs';
const WINDOW_OPEN_PREFS_EVENT = 'newtab-pro:window-open-prefs-change';

export type WindowOpenPrefs = {
  compactGridWindows: boolean;
};

export type GridOpenOriginWindow = {
  id: number;
  state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked-fullscreen';
};

const DEFAULT_WINDOW_OPEN_PREFS: WindowOpenPrefs = {
  compactGridWindows: false,
};
const GRID_WINDOW_OVERLAP_X = 8;
const GRID_WINDOW_OVERLAP_Y = 8;

function getGridDimensions(count: number) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function getGridBounds(index: number, count: number) {
  const { cols, rows } = getGridDimensions(count);
  const screenWithOffsets = window.screen as Screen & { availLeft?: number; availTop?: number };
  const leftBase = typeof screenWithOffsets.availLeft === 'number' ? screenWithOffsets.availLeft : 0;
  const topBase = typeof screenWithOffsets.availTop === 'number' ? screenWithOffsets.availTop : 0;
  const totalWidth = Math.max(960, window.screen.availWidth);
  const totalHeight = Math.max(640, window.screen.availHeight);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const leftEdge = Math.round((totalWidth * col) / cols);
  const rightEdge = Math.round((totalWidth * (col + 1)) / cols);
  const topEdge = Math.round((totalHeight * row) / rows);
  const bottomEdge = Math.round((totalHeight * (row + 1)) / rows);
  const left = leftBase + leftEdge - (col > 0 ? GRID_WINDOW_OVERLAP_X : 0);
  const top = topBase + topEdge - (row > 0 ? GRID_WINDOW_OVERLAP_Y : 0);
  const width = rightEdge - leftEdge + (col > 0 ? GRID_WINDOW_OVERLAP_X : 0);
  const height = bottomEdge - topEdge + (row > 0 ? GRID_WINDOW_OVERLAP_Y : 0);

  return { left, top, width, height };
}

function normalizeWindowOpenPrefs(raw: unknown): WindowOpenPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WINDOW_OPEN_PREFS };
  }

  const prefs = raw as Record<string, unknown>;
  return {
    compactGridWindows:
      typeof prefs.compactGridWindows === 'boolean'
        ? prefs.compactGridWindows
        : DEFAULT_WINDOW_OPEN_PREFS.compactGridWindows,
  };
}

export function readWindowOpenPrefs(): WindowOpenPrefs {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_WINDOW_OPEN_PREFS };
  }

  try {
    const raw = window.localStorage.getItem(WINDOW_OPEN_PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_WINDOW_OPEN_PREFS };
    }
    return normalizeWindowOpenPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WINDOW_OPEN_PREFS };
  }
}

function writeWindowOpenPrefs(next: WindowOpenPrefs) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(WINDOW_OPEN_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent<WindowOpenPrefs>(WINDOW_OPEN_PREFS_EVENT, {
        detail: next,
      }),
    );
  } catch {}
}

export function useWindowOpenPrefs() {
  const [prefs, setPrefs] = useState<WindowOpenPrefs>(() => readWindowOpenPrefs());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === WINDOW_OPEN_PREFS_KEY) {
        setPrefs(readWindowOpenPrefs());
      }
    };
    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<WindowOpenPrefs>).detail;
      setPrefs(normalizeWindowOpenPrefs(detail));
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(WINDOW_OPEN_PREFS_EVENT, handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(WINDOW_OPEN_PREFS_EVENT, handleCustomEvent);
    };
  }, []);

  const setCompactGridWindows = useCallback((value: boolean) => {
    writeWindowOpenPrefs({
      ...readWindowOpenPrefs(),
      compactGridWindows: value,
    });
  }, []);

  return {
    compactGridWindows: prefs.compactGridWindows,
    setCompactGridWindows,
  };
}

export function getGridOpenCounts(availableCount: number, maxCount = 6) {
  const safeCount = Math.max(0, Math.min(availableCount, maxCount));
  return Array.from({ length: safeCount }, (_, index) => safeCount - index);
}

async function createGridWindow(
  url: string,
  bounds: ReturnType<typeof getGridBounds>,
  compact: boolean,
) {
  try {
    return await browser.windows.create({
      url,
      type: compact ? 'popup' : 'normal',
      focused: false,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    });
  } catch (error) {
    if (!compact) {
      throw error;
    }

    return browser.windows.create({
      url,
      type: 'normal',
      focused: false,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    });
  }
}

export async function openUrlsInGrid(urls: string[], compact: boolean) {
  const validUrls = urls.filter((url) => !!url);
  if (validUrls.length === 0) {
    return {
      windowIds: [] as number[],
      originWindow: undefined as GridOpenOriginWindow | undefined,
    };
  }

  const currentWindow = await browser.windows.getCurrent();
  const originWindow =
    typeof currentWindow.id === 'number'
      ? {
          id: currentWindow.id,
          state: currentWindow.state,
        }
      : undefined;

  const windowIds = (
    await Promise.all(
      validUrls.map(async (url, index) => {
        const created = await createGridWindow(url, getGridBounds(index, validUrls.length), compact);
        return typeof created?.id === 'number' ? created.id : null;
      }),
    )
  ).filter((windowId): windowId is number => typeof windowId === 'number');

  if (originWindow && windowIds.length > 0) {
    try {
      await browser.windows.update(originWindow.id, { state: 'minimized' });
    } catch {}
  }

  const lastWindowId = windowIds.at(-1);
  if (typeof lastWindowId === 'number') {
    try {
      await browser.windows.update(lastWindowId, { focused: true });
    } catch {}
  }

  return {
    windowIds,
    originWindow,
  };
}

export async function restoreOriginWindow(originWindow?: GridOpenOriginWindow | null, focus = true) {
  if (!originWindow) {
    return;
  }

  const restoreState =
    originWindow.state && originWindow.state !== 'minimized' ? originWindow.state : 'normal';

  try {
    await browser.windows.update(originWindow.id, {
      state: restoreState,
      focused: focus,
    });
  } catch {}
}
