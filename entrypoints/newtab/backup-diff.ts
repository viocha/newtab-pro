import * as jsondiffpatch from 'jsondiffpatch';
import { format as formatHtml } from 'jsondiffpatch/formatters/html';

import { createBackupPayload, parseBackupPayload } from './backup';
import { sanitizeSettings } from './use-settings-store';
import { sanitizeSpaceStore } from './use-board-store';
import type { AppSettings, Space, SpaceStore } from './types';

export type BackupDiffDocument = {
  spaces: unknown;
  settings?: unknown;
};

export type BackupDiffSummary = {
  added: number;
  modified: number;
  deleted: number;
  moved: number;
};

export type BackupContentStats = {
  spaces: number;
  groups: number;
  subgroups: number;
  bookmarks: number;
  searchEngines: number;
};

export type BackupDiffSnapshot = {
  document: BackupDiffDocument;
  exportedAt?: string;
};

export type BackupDiffDirection = 'local-to-remote' | 'remote-to-local';

export type BackupDirectionalDiff = {
  hasChanges: boolean;
  deltaHtml: string;
  summary: BackupDiffSummary;
};

export type BackupDiffResult = {
  localStats: BackupContentStats;
  remoteStats: BackupContentStats;
  remoteExportedAt?: string;
  comparisons: Record<BackupDiffDirection, BackupDirectionalDiff>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createObjectHash(value: unknown): string {
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }

  if (typeof value.id === 'string' && value.id) {
    return `id:${value.id}`;
  }

  if (typeof value.title === 'string' && typeof value.url === 'string') {
    return `bookmark:${value.title}:${value.url}`;
  }

  if (typeof value.name === 'string' && value.name) {
    return `name:${value.name}`;
  }

  return JSON.stringify(value);
}

const diffPatcher = jsondiffpatch.create({
  objectHash: createObjectHash,
  arrays: {
    detectMove: true,
    includeValueOnMove: false,
  },
});

function createEmptySummary(): BackupDiffSummary {
  return {
    added: 0,
    modified: 0,
    deleted: 0,
    moved: 0,
  };
}

function summarizeDeltaNode(delta: unknown, summary: BackupDiffSummary) {
  if (!delta) {
    return;
  }

  if (Array.isArray(delta)) {
    if (delta.length === 1) {
      summary.added += 1;
      return;
    }

    if (delta.length === 2) {
      summary.modified += 1;
      return;
    }

    if (delta.length >= 3) {
      if (delta[1] === 0 && delta[2] === 0) {
        summary.deleted += 1;
        return;
      }

      if (typeof delta[2] === 'number') {
        summary.moved += 1;
        return;
      }

      summary.modified += 1;
    }
    return;
  }

  if (!isRecord(delta)) {
    return;
  }

  for (const [key, child] of Object.entries(delta)) {
    if (key === '_t') {
      continue;
    }
    summarizeDeltaNode(child, summary);
  }
}

function countSpaceStats(space: Space, stats: BackupContentStats) {
  stats.groups += Array.isArray(space.board?.groups) ? space.board.groups.length : 0;

  for (const group of space.board?.groups ?? []) {
    stats.bookmarks += Array.isArray(group.bookmarks) ? group.bookmarks.length : 0;
    stats.subgroups += Array.isArray(group.subgroups) ? group.subgroups.length : 0;

    for (const subgroup of group.subgroups ?? []) {
      stats.bookmarks += Array.isArray(subgroup.bookmarks) ? subgroup.bookmarks.length : 0;
    }
  }
}

function collectBackupContentStats(document: BackupDiffDocument): BackupContentStats {
  const stats: BackupContentStats = {
    spaces: 0,
    groups: 0,
    subgroups: 0,
    bookmarks: 0,
    searchEngines: 0,
  };

  if (isRecord(document.spaces) && Array.isArray(document.spaces.spaces)) {
    const spaces = document.spaces.spaces as Space[];
    stats.spaces = spaces.length;
    for (const space of spaces) {
      countSpaceStats(space, stats);
    }
  }

  if (isRecord(document.settings)) {
    stats.searchEngines = Array.isArray(document.settings.searchEngines)
      ? document.settings.searchEngines.length
      : 0;
  }

  return stats;
}

export function createLocalBackupDiffSnapshot(
  spaceStore: SpaceStore,
  settings: AppSettings,
): BackupDiffSnapshot {
  const payload = createBackupPayload(spaceStore, settings);
  return {
    document: {
      spaces: payload.spaces,
      settings: payload.settings,
    },
    exportedAt: payload.exportedAt,
  };
}

export function parseBackupDiffSnapshot(raw: unknown): BackupDiffSnapshot {
  const parsed = parseBackupPayload(raw);
  if (!parsed) {
    throw new Error('版本不匹配或文件格式错误');
  }

  const normalized = createBackupPayload(sanitizeSpaceStore(parsed.spaceStore), sanitizeSettings(parsed.settings));

  return {
    document: {
      spaces: normalized.spaces,
      ...(parsed.settings !== undefined ? { settings: normalized.settings } : {}),
    },
    exportedAt: parsed.exportedAt,
  };
}

export function compareBackupSnapshots(
  localSnapshot: BackupDiffSnapshot,
  remoteSnapshot: BackupDiffSnapshot,
): BackupDiffResult {
  const createDirectionalDiff = (
    primarySnapshot: BackupDiffSnapshot,
    secondarySnapshot: BackupDiffSnapshot,
  ): BackupDirectionalDiff => {
    const delta = diffPatcher.diff(secondarySnapshot.document, primarySnapshot.document);
    const summary = createEmptySummary();
    summarizeDeltaNode(delta, summary);

    return {
      hasChanges: delta !== undefined,
      deltaHtml: delta ? formatHtml(delta, secondarySnapshot.document) ?? '' : '',
      summary,
    };
  };

  return {
    localStats: collectBackupContentStats(localSnapshot.document),
    remoteStats: collectBackupContentStats(remoteSnapshot.document),
    remoteExportedAt: remoteSnapshot.exportedAt,
    comparisons: {
      'local-to-remote': createDirectionalDiff(localSnapshot, remoteSnapshot),
      'remote-to-local': createDirectionalDiff(remoteSnapshot, localSnapshot),
    },
  };
}
