import type { DragEvent } from 'react';
import { create } from 'zustand';
import { TAB_DRAG_MIME } from './constants';
import type { BookmarkNodeTarget, TabDragPayload } from './types';

export type DndIndicator = { id: string; zone: 'before' | 'after'; type: 'group' | 'subgroup' | 'bookmark' | 'space' } | null;

type DndUIState = {
  activeId: string | null;
  activeData: any | null;
  overlayWidth: number | null;
  dropIndicator: DndIndicator;
  setActiveDrag: (id: string | null, data: any | null, width?: number | null) => void;
  setDropIndicator: (ind: DndIndicator) => void;
};

export const useDndUIStore = create<DndUIState>((set) => ({
  activeId: null,
  activeData: null,
  overlayWidth: null,
  dropIndicator: null,
  setActiveDrag: (id, data, width) => set({ activeId: id, activeData: data, overlayWidth: width ?? null }),
  setDropIndicator: (ind) => set({ dropIndicator: ind }),
}));

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function setTabDragPayload(event: DragEvent, payload: TabDragPayload) {
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload));
}

export function readTabDragPayload(event: DragEvent): TabDragPayload | null {
  const raw = event.dataTransfer.getData(TAB_DRAG_MIME);
  if (!raw) {
    return null;
  }
  return safeParseJson<TabDragPayload>(raw);
}

