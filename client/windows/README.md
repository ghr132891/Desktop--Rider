# Desktop Rider · Windows 客户端

把网页原型装进 Electron，加上三件系统能力：

1. **一键设为系统壁纸**：按每台显示器的真实分辨率渲染当前设计，分别设置（`IDesktopWallpaper`，Windows 8 以上的多显示器壁纸接口）。
2. **桌面层**：悬浮人物的各份副本、桌面文字等"画在人物之上"的模块，渲染成一张透明 PNG，由一个透明、点击穿透的窗口显示，并挂到 Explorer 的壁纸宿主窗口下——在壁纸之上、桌面图标之下（Wallpaper Engine / Lively 的 WorkerW 方案）。
3. **托盘与开机启动**：关闭窗口即隐藏到托盘；开机启动用 `--hidden` 静默拉起并恢复上次的桌面层。

目标系统：Windows 11（先行适配），Windows 10 1703 以上也应可用（同一套 API；24H2 的 Progman 结构差异已做分支，但 Win10 需要实测）。本客户端在 macOS 上编写，这里只能做单元测试与 Electron 启动烟测，**真机验证需要在 Windows 上进行**。

## 运行（Windows）

需要 Node.js 20 以上。

```bash
cd client/windows
npm install
npm start
```

网页从客户端内置的回环地址静态服务器加载（与 `tools/serve.py` 等价，Worker 与 WASM 需要 http 协议）。侧栏会多出「应用到桌面」：列出显示器，点击某一台即渲染并应用；「应用到所有显示器」逐台处理；「开机启动」开关写入系统登录项。

打包：

```bash
npm run dist
```

生成 `dist/DesktopRider-<版本>-x64.exe`（NSIS 安装包）与便携版。网页文件（`index.html`、`*.js`、`assets/`、`vendor/`、`modules/`）作为 `resources/web` 一起打进去，运行时不依赖仓库目录。

## 结构

| 文件 | 作用 |
| --- | --- |
| `main.js` | Electron 主进程：静态服务器、主窗口、托盘、登录项、IPC；每台显示器一个桌面层窗口；`layers.json` 记录以便重启恢复 |
| `preload.js` | `window.desktopRider`：`monitors / applyWallpaper / clearLayer / layers / getSettings / setSettings / onStatus` |
| `lib/server.js` | 回环静态服务器，只服务网页根目录，拒绝越界路径 |
| `lib/native.js` | 调起 `native/bridge.ps1` 并解析 JSON；参数全部作为 PowerShell 参数传递，不拼接字符串 |
| `native/bridge.ps1` | Windows PowerShell 5.1 脚本，`Add-Type` 内嵌 C#：`IDesktopWallpaper`（枚举显示器、设壁纸）、`EnumDisplaySettings`（物理分辨率与位置，不受 DPI 虚拟化影响）、WorkerW 查找、`SetParent` / `SetWindowPos`、线程级每显示器 DPI 感知 |
| `layer.html` | 桌面层窗口页面：透明背景 + 一张铺满的 PNG |
| `../../modules/client.js` | 网页侧模块，只有在 `window.desktopRider` 存在时注册 |
| `test/lib.test.cjs` | 单元测试（任何系统）：参数构造、句柄转换、JSON 解析、静态服务器 |
| `test/smoke.cjs` | 用 Playwright 启动真实 Electron：页面加载、桥存在、显示器列表、非 Windows 下应用失败并提示 |

渲染分层由网页侧 `wallpaperCanvas(s,width,{layers})` 提供：`background`（壁纸 + 人物之下的模块）设为系统壁纸，`overlay`（透明：人物副本 + 人物之上的模块）给桌面层；两者叠加与导出 PNG 逐像素一致（`tools/verify-client.cjs` 校验）。没有任何悬浮内容时不创建桌面层。

## 桌面层的工作方式与边界

- 应用时向 `Progman` 发送 `0x052C`，Explorer 会在壁纸与图标之间生成一个 `WorkerW`，桌面层窗口 `SetParent` 到它上面；Windows 11 24H2 把图标视图留在 `Progman` 内，此时直接挂到 `Progman` 并置于其 z 序底部。两种情况 `bridge.ps1` 都会返回实际使用的宿主（`workerw` / `progman`）。
- 桌面层窗口是 Electron 透明窗口，`setIgnoreMouseEvents(true)`，不在任务栏与 Alt-Tab 出现；坐标按物理像素相对虚拟屏幕原点定位，多显示器、不同缩放比例都按 `IDesktopWallpaper` 返回的矩形处理。
- 桌面层是静态图片，不随壁纸切换、分辨率变化自动重绘；重新点一次「应用」即可。Explorer 重启（例如资源管理器崩溃）后宿主窗口失效，需要重新应用。
- 系统壁纸由 Windows 自行持久化；客户端重启只恢复桌面层窗口（读取 `%APPDATA%/desktop-rider-windows/desktop/layers.json`）。
- 不修改注册表以外的系统设置；开机启动使用 Electron 的登录项接口（`HKCU\...\Run`）。

## 验证

```bash
npm test          # 单元测试
npm run smoke     # Electron 启动烟测（需已安装 electron）
```

仓库根目录另有 `node tools/verify-client.cjs`，用假的 `window.desktopRider` 在普通 Chromium 中验证网页侧模块与分层渲染。

Windows 真机上建议按顺序检查：显示器列表与分辨率是否正确 → 应用后壁纸是否按屏幕变化 → 开启人物悬浮再应用，人物是否出现在图标之下、能否被图标遮挡、点击是否穿透到桌面 → 退出后重开是否恢复桌面层 → 开机启动。
