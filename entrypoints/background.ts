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
  chrome.runtime.onInstalled.addListener(applyFrameBypassRules);
  chrome.runtime.onStartup.addListener(applyFrameBypassRules);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
