import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_SETTINGS } from '../constants';
import type { AppSettings } from '../types';

export const BookmarkDisplayContext = createContext<AppSettings>(DEFAULT_SETTINGS);

const lineClasses = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' };

/** 各视图独立控制名称行数，网址从名称下方开始显示。 */
export function BookmarkText({ title, url, mode = 'list', className }: {
  title: string;
  url?: string;
  mode?: 'list' | 'tree' | 'icon';
  className?: string;
}) {
  const settings = useContext(BookmarkDisplayContext);
  const lines = settings[`${mode}TitleLines`];
  const showUrl = mode !== 'icon' && settings[`${mode}ShowUrl`];
  return (
    <span className={cn('block min-w-0 w-full flex-1', className)}>
      <span className={cn('whitespace-pre-line wrap-anywhere', lineClasses[lines])}>
        {title || url || '未命名'}
      </span>
      {showUrl && url && <span className="block truncate text-[10px] text-muted-foreground">{url}</span>}
    </span>
  );
}
