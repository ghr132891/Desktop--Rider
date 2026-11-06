# Desktop Rider — 给协作 AI 的上手说明

这份文件给在本仓库里工作的 AI 助手（Codex、Claude 等）看。人类文档在 `README.md`、`docs/`、`client/windows/README.md`。

## 项目是什么

可交互桌面 DIY 工作台：网页端设计"分裂壁纸 + 悬浮人物 + 动态壁纸 + 图层 + 桌面歌词 + 萌版人物"，Windows 客户端（Electron）把设计放到真实桌面上。

- **网页端**：无构建、无依赖的原生 JS。`index.html` 按顺序加载 `core.js`（模块框架，全局 `Rider`）、`portrait.js` / `cutout.js`（MediaPipe 抠像与补全）、`wallpaper-engine.js`、`modules/*.js`（live / layers / note / lyrics / mascot / client）、`app.js`（核心状态、预览、导出）。共享渲染器 `lyrics-view.js`、`mascot-view.js`、`live-person.js` 同时被网页和客户端层窗口使用。
- **客户端**：`client/windows/`，Electron 33 + Windows PowerShell 5.1 桥（`native/bridge.ps1`，无需 SDK）。主进程 `main.js`，层窗口 `layer.html`，小人物窗口 `mascot.html`，回环静态服务 `lib/server.js`。
- **模块机制**：`docs/modules.md` 是权威说明（注册、钩子、保留名、api、广播事件、编辑态置顶模式）。新功能优先做成模块。

## 怎么跑

```bash
npm start                 # Node 版开发服务器，http://127.0.0.1:4173（等价：python3 tools/serve.py）
node tools/verify-all.cjs # 全部浏览器回归（需要开发服务器在跑，且本机装有 Chrome）
node tools/verify-all.cjs lyrics mascot   # 只跑名字里含这些词的套件
cd client/windows && npm ci && npm test && npm run smoke   # 客户端单元测试 + Electron 烟测（任何系统）
cd client/windows && node test/windows.cjs                  # 仅 Windows：真调用桥脚本、回查系统状态、截图
```

浏览器回归用 Playwright（`tools/playwright.cjs` 解析位置）：安装方式任选其一——`npm i -D playwright pngjs`、全局安装后设 `NODE_PATH`，或设环境变量 `PLAYWRIGHT_PATH` / `PNGJS_PATH` 指向现成的包。默认用系统 Chrome（`channel: 'chrome'`），可用 `PLAYWRIGHT_CHANNEL=msedge` 等改。

Windows 上：PowerShell 里 `$env:PLAYWRIGHT_PATH='C:\path\to\node_modules\playwright'`；`python3` 不存在时用 `npm start`（Node 服务器）即可。

## 测试与 CI

- 每个功能都有对应的 `tools/verify-*.cjs`，README「验证」一节列了各套件覆盖什么。改了行为就改或加断言；新模块加新套件。
- `tools/verify-live.cjs` 的背景板学习断言和 `tools/verify-layer-video.cjs` 的纯音轨夹具对机器负载敏感（和 Electron 烟测同时跑时见过一次失败），单独失败时先重跑一次。
- `.github/workflows/windows.yml` 在 `windows-2025`（Win11 24H2 内核，Progman 分支）和 `windows-2022`（Win10 内核，WorkerW 分支）上跑客户端：单元测试、烟测、`test/windows.cjs` 真桌面集成、x64 安装包。日志需要登录才能看，所以每步失败都会以注解（annotation）形式写到公开的运行页面：`test/ci-run.cjs` 包装每个步骤，`test/windows.cjs` 自己也输出 `::error` / `::notice`。看结果直接开 Actions 页面即可。
- 推送到 `main` 或更新拉取请求时，客户端代码、根目录 JS/CSS、`index.html`、`modules/`、`assets/`、`vendor/` 及工作流自身的修改会触发 CI；两种事件的路径清单须保持一致。仅修改根目录或客户端 `README.md` 不触发。新增共享代码时同时核对客户端打包清单 `extraResources` 与 CI 路径覆盖。

## 约定

- 提交信息：一行主题 + 空行 + 说明为什么与做了什么；AI 生成的提交末尾加 `Co-Authored-By: <模型名> <noreply@…>`。
- `artifacts/` 下的 PNG 由测试重新生成，提交前 `git checkout -- artifacts/`，不要把它们混进功能提交。
- 不引入构建步骤、打包器或运行时依赖；客户端只有 Electron 与 electron-builder（开发依赖）。
- `client/windows/native/bridge.ps1` 必须保留开头的 UTF-8 BOM（文件前三个字节 EF BB BF）：中文 Windows 的 PowerShell 5.1 没有 BOM 会按 GBK 解码内嵌 C#，`Add-Type` 直接编译失败。有单元测试守着；用会去掉 BOM 的编辑器或 `utf-8-sig` 读写要小心。
- 中文 UI 与文档；代码注释英文或中文皆可，但要说明"为什么"。
- 模块状态只放可 JSON 化的数据；大文件（视频）进 IndexedDB，方案里只存元数据。
- 带 `view` 的模块在自己视图下才接收指针，并让其他浮层穿透（见 `docs/modules.md` 的"编辑态置顶"）。
- 破坏性操作（删方案、清桌面层）前确认；不要改 `main` 以外分支的历史。

## 当前状态与待办

- 最近修复（2026-11-04）：视频图层导入失败后不再残留播放对象、对象 URL 或 IndexedDB 文件；视频校验及容量复查通过后才持久化。新增 `tools/verify-layer-video.cjs`，与原有画布回归均已在 Windows Chrome 通过。原因、验证范围与测试夹具注意事项见 [模块修复记录](docs/modules.md#修复记录)。
- 真机进度：2026-11-02 在一台中文 Win11（10.0.26200）上 `npm test` / `npm run smoke` / `node test/windows.cjs` 全部通过（修掉了 bridge.ps1 的 BOM 问题）。仍待人工验证：托盘、开机启动、锁屏 / 电池暂停、多显示器、真实播放器连续播放的歌词跟随、小人物交互手感——清单与进度在 `client/windows/REAL-DEVICE-TEST.md`，按编号反馈。
- 已知限制：网易云逐字歌词需要加密 eapi（未接）；半身壁纸不会补全全身（见 `docs/mascot-api.md` 的外部 AI 流程）；安装包未签名、无自动更新。
- 下一步候选：系统回环音频分析（歌词与小人物对真实声音反应）、第三方模块加载入口、把浏览器回归放进 CI。
