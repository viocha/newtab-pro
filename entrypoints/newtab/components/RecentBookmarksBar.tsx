import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { browser } from 'wxt/browser';

import type { BookmarkBoard } from '../types';
import { FaviconImage } from './FaviconImage';

type RecentItem = {
  title: string;
  url: string;
  lastVisitTime?: number;
};

type Props = {
  board: BookmarkBoard;
  count: number;
};

export function RecentBookmarksBar({ board, count }: Props) {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      // Collect all bookmarks from the board into a URL → title map
      const allBookmarks = new Map<string, string>();
      for (const group of boardRef.current.groups) {
        for (const bm of group.bookmarks) {
          allBookmarks.set(bm.url, bm.title);
        }
        for (const subgroup of group.subgroups) {
          for (const bm of subgroup.bookmarks) {
            allBookmarks.set(bm.url, bm.title);
          }
        }
      }

      if (allBookmarks.size === 0) {
        if (alive) setRecents([]);
        return;
      }

      try {
        const results = await browser.history.search({
          text: '',
          maxResults: 500,
          startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // last 30 days
        });

        if (!alive) return;

        const matches: RecentItem[] = results
          .filter((item): item is typeof item & { url: string } => !!item.url && allBookmarks.has(item.url))
          .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
          .slice(0, count)
          .map((item) => ({
            title: allBookmarks.get(item.url)! || item.title || item.url,
            url: item.url,
            lastVisitTime: item.lastVisitTime,
          }));

        setRecents(matches);
      } catch {
        setRecents([]);
      }
    };

    void refresh();

    return () => {
      alive = false;
    };
  }, [board, count]);

  if (recents.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/85 px-4 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
        <Clock className="size-3.5" />
        <span className="text-xs font-medium">最近访问</span>
      </div>

      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-none">
        {recents.map((bm) => (
          <a
            key={bm.url}
            href={bm.url}
            title={bm.title}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-foreground/75 whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground"
          >
            <FaviconImage url={bm.url} className="size-3.5 rounded-sm shrink-0" />
            <span className="max-w-[110px] truncate">{bm.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
