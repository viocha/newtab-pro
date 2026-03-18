import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Newtab Pro',
    description: '高效美观的新标签页，支持多分组与小组管理、拖拽排序、左侧标签页快速拖入添加书签、数据导入导出。',
    action: {
      default_title: 'Newtab Pro',
      default_popup: 'popup.html',
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Alt+E',
        },
      },
    },
    permissions: ['bookmarks', 'tabs', 'storage', 'favicon', 'management', 'history', 'declarativeNetRequest', 'declarativeNetRequestWithHostAccess', 'browsingData', 'alarms'],
    host_permissions: ['<all_urls>'],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
