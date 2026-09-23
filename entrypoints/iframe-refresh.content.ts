import { browser } from 'wxt/browser';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    if (window.parent === window) return;

    const extensionOrigin = new URL(browser.runtime.getURL('/')).origin;
    window.addEventListener('message', (event) => {
      if (
        event.source !== window.parent ||
        event.origin !== extensionOrigin ||
        event.data?.type !== 'NEWTAB_PRO_IFRAME_REFRESH'
      ) return;

      window.location.reload();
    });
  },
});
