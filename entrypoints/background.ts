import { browser } from 'wxt/browser';

import { AUTO_BACKUP_ALARM_NAME, AUTO_BACKUP_CHECK_PERIOD_MINUTES, createBackupPayload, downloadBackupFromWebDav, isAutoBackupDue, isBackupReady, testWebDavConnection, uploadBackupToWebDav } from './newtab/backup';
import { SETTINGS_STORAGE_KEY, SPACES_STORAGE_KEY } from './newtab/constants';
import type { AppSettings, BackupSettings, SpaceStore } from './newtab/types';

let autoBackupRunning = false;

async function readStoredState() {
  const payload = await browser.storage.local.get([SPACES_STORAGE_KEY, SETTINGS_STORAGE_KEY]);
  return {
    spaceStore: payload[SPACES_STORAGE_KEY] as SpaceStore | undefined,
    settings: payload[SETTINGS_STORAGE_KEY] as AppSettings | undefined,
  };
}

async function patchBackupMetadata(
  mutator: (backup: BackupSettings) => BackupSettings,
) {
  const payload = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  const settings = payload[SETTINGS_STORAGE_KEY] as AppSettings | undefined;
  if (!settings?.backup) {
    return;
  }

  await browser.storage.local.set({
    [SETTINGS_STORAGE_KEY]: {
      ...settings,
      backup: mutator(settings.backup),
    } satisfies AppSettings,
  });
}

async function syncAutoBackupAlarm() {
  const payload = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  const settings = payload[SETTINGS_STORAGE_KEY] as AppSettings | undefined;
  const backup = settings?.backup;

  await chrome.alarms.clear(AUTO_BACKUP_ALARM_NAME);

  if (!backup?.autoBackupEnabled || !isBackupReady(backup)) {
    return;
  }

  await chrome.alarms.create(AUTO_BACKUP_ALARM_NAME, {
    delayInMinutes: AUTO_BACKUP_CHECK_PERIOD_MINUTES,
    periodInMinutes: AUTO_BACKUP_CHECK_PERIOD_MINUTES,
  });
}

async function runAutoBackup(trigger: 'alarm' | 'startup' | 'poke') {
  if (autoBackupRunning) {
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }

  const { spaceStore, settings } = await readStoredState();
  if (!spaceStore || !settings?.backup || !isBackupReady(settings.backup)) {
    return;
  }

  if (!isAutoBackupDue(settings.backup)) {
    return;
  }

  autoBackupRunning = true;
  try {
    const payload = createBackupPayload(spaceStore, settings);
    const result = await uploadBackupToWebDav(settings.backup, payload);
    await patchBackupMetadata((backup) => ({
      ...backup,
      lastBackupAt: result.uploadedAt,
      lastBackupAttemptAt: result.uploadedAt,
      lastBackupError: undefined,
    }));
  } catch (error) {
    const attemptedAt = new Date().toISOString();
    await patchBackupMetadata((backup) => ({
      ...backup,
      lastBackupAttemptAt: attemptedAt,
      lastBackupError: `[${trigger}] ${error instanceof Error ? error.message : String(error)}`,
    }));
  } finally {
    autoBackupRunning = false;
  }
}

export default defineBackground(() => {
  // Remove response headers that prevent framing, so iframe viewMode can load any site.
  const RULE_ID = 10001;

  async function applyFrameBypassRules() {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
          {
            id: RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
              responseHeaders: [
                { header: 'x-frame-options', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
                { header: 'content-security-policy', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
                { header: 'x-content-security-policy', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
                { header: 'x-webkit-csp', operation: 'remove' as chrome.declarativeNetRequest.HeaderOperation },
              ],
            },
            condition: {
              resourceTypes: ['sub_frame' as chrome.declarativeNetRequest.ResourceType],
              initiatorDomains: [chrome.runtime.id],
            },
          },
        ],
      });
    } catch (e) {
      console.error('[newtab-pro] Failed to apply frame bypass rules:', e);
    }
  }

  // Service Worker 启动时立即应用（如果规则已存则 updateDynamicRules 会先删开再添加）
  applyFrameBypassRules();
  void syncAutoBackupAlarm();
  void runAutoBackup('startup');
  chrome.runtime.onInstalled.addListener(() => {
    applyFrameBypassRules();
    void syncAutoBackupAlarm();
    void runAutoBackup('startup');
  });
  chrome.runtime.onStartup.addListener(() => {
    applyFrameBypassRules();
    void syncAutoBackupAlarm();
    void runAutoBackup('startup');
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SETTINGS_STORAGE_KEY]) {
      void syncAutoBackupAlarm();
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_BACKUP_ALARM_NAME) {
      void runAutoBackup('alarm');
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'WEBDAV_UPLOAD') {
      void (async () => {
        try {
          const result = await uploadBackupToWebDav(message.config, message.payload);
          sendResponse({ success: true, uploadedAt: result.uploadedAt });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return true;
    }

    if (message.type === 'WEBDAV_DOWNLOAD') {
      void (async () => {
        try {
          const payload = await downloadBackupFromWebDav(message.config);
          sendResponse({ success: true, payload });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return true;
    }

    if (message.type === 'WEBDAV_TEST') {
      void (async () => {
        try {
          await testWebDavConnection(message.config);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return true;
    }

    if (message.type === 'AUTO_BACKUP_POKE') {
      void (async () => {
        await runAutoBackup('poke');
        sendResponse({ success: true });
      })();
      return true;
    }

    if (message.type === 'CLEAR_SERVICE_WORKER' && message.origin) {
      if (chrome.browsingData && chrome.browsingData.remove) {
        chrome.browsingData.remove(
          { origins: [message.origin] },
          { serviceWorkers: true, cacheStorage: true },
          () => sendResponse({ success: true })
        );
        return true; // Keep the message channel open for async response
      } else {
        sendResponse({ success: false, error: 'browsingData API not available' });
      }
    }
  });
});
