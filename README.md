# Newtab Pro (WXT + shadcn + TypeScript)

浏览器新标签页扩展，支持紧凑多列分组布局、分组内小组折叠、以及三种书签添加方式。

## 功能

- 多行多列分组，分组与小组都可折叠
- 小组内书签支持编辑、删除
- 添加书签方式
  - 手动输入名称和 URL
  - 从浏览器书签树浏览并导入（支持搜索过滤）
  - 从左侧悬浮标签页抽屉拖拽到目标小组
- 数据持久化到 `chrome.storage.local`

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `.output/chrome-mv3`，可在 Chrome 扩展页以“加载已解压的扩展程序”方式加载。
