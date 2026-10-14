# Newtab Pro (WXT + shadcn base-nova + TypeScript)

浏览器新标签页扩展，支持紧凑多列分组布局、分组内小组折叠、以及三种书签添加方式。

## 功能

- 多行多列分组，分组与小组都可折叠
- 大分组菜单可设置跨越 1–6 列；实际跨度不超过当前网格列数
- 小组内书签支持编辑、删除
- 名称和 URL 使用多行输入框，URL 支持任意字符处换行；编辑书签时自动聚焦名称并将光标定位到开头
- 设置中可分别配置列表、书签树、图标模式的名称显示行数（1–3 行）；列表与书签树可各自开启名称下方显示 URL
- 添加书签方式
  - 手动输入名称和 URL
  - 从浏览器书签树浏览并导入（支持搜索过滤）
  - 从左侧悬浮标签页抽屉拖拽到目标小组
- 数据持久化到 `chrome.storage.local`

## 云端备份与恢复

WebDAV 保存完整内容快照，上传覆盖远程文件，恢复覆盖本地内容，不进行双向合并。JSON 导入导出使用同一数据范围。

备份包含 Space、分组、小组、书签和排序，以及颜色、视图模式、跨越列数、iframe 配置、搜索引擎、批量搜索引擎选择、全局与 Space 列数、名称行数、URL 显示和快捷键等设置。

当前 Space、分组与小组折叠状态、搜索历史、滚动位置、书签树内部展开状态、浏览器书签文件夹绑定及 WebDAV 连接与备份状态保留在本机。恢复时按应用内 ID 保留对应分组的本机状态；当前 Space 已不存在时选择第一个 Space，新分组默认展开。新设备的书签树分组需要选择本机书签文件夹。

差异比较只比较参与备份的内容与设置。备份不包含浏览器书签树内容、iframe 登录状态或网页内部数据。

## 开发

```bash
bun install
bun run dev
```

## 构建

```bash
bun run build
```

构建产物输出到 `.output/chrome-mv3`，可在 Chrome 扩展页以“加载已解压的扩展程序”方式加载。

## 界面组件

界面采用 shadcn 的 `base-nova` 风格，底层为 Base UI，使用 neutral 浅色主题，默认字体为浏览器配置的 `sans-serif`。通用组件由 shadcn CLI 生成，表单位于 Field / FieldGroup，视图模式使用 Toggle Group，通知使用 Base UI Toast。

```bash
bunx --bun shadcn@latest add <组件名>
bun run typecheck
bun run build:reload
```

`build` 包含类型检查；`reload` 通过 reload-extension 重载浏览器中名为 Newtab Pro 的扩展。
