# Desktop Rider · Windows 客户端

把网页原型装进 Electron，加上三件系统能力：

1. **一键设为系统壁纸**：按每台显示器的真实分辨率渲染当前设计，分别设置（`IDesktopWallpaper`，Windows 8 以上的多显示器壁纸接口）。
2. **桌面层**：悬浮人物的各份副本、桌面文字等"画在人物之上"的模块，渲染成一张透明 PNG，由一个透明、点击穿透的窗口显示，并挂到 Explorer 的壁纸宿主窗口下——在壁纸之上、桌面图标之下（Wallpaper Engine / Lively 的 WorkerW 方案）。
3. **动态壁纸**：网页侧 `modules/live.js` 导入的视频连同按显示器分辨率算好的分区几何一起发给客户端，桌面层窗口用 canvas 按同样的多边形裁切实时播放（间隙颜色一起画出），悬浮人物与桌面文字叠在其上；系统壁纸设为视频静帧，客户端不运行时桌面仍有图。重启后从 `layers.json` 恢复并继续播放。
4. **托盘与开机启动**：关闭窗口即隐藏到托盘；开机启动用 `--hidden` 静默拉起并恢复上次的桌面层。

目标系统：Windows 11（先行适配），Windows 10 1703 以上也应可用（同一套 API）。本客户端在 macOS 上编写；系统相关的部分由 GitHub Actions 在真实 Windows 上验证（见「验证」）：Windows Server 2025（Windows 11 24H2 内核）走 Progman 分支、Windows Server 2022（Windows 10 内核）走 WorkerW 分支，两者都确认了按显示器设壁纸、桌面层窗口成为壁纸宿主的子窗口并铺满显示器、重启恢复与清理。Win11 客户端版的托盘、开机启动等交互仍建议真机过一遍。

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
| `layer.html` | 桌面层窗口页面：`?img=` 透明叠加 PNG；`?live=` 时按几何方案播放分区视频；`?clips=` 时逐帧绘制图层视频（位置、旋转、翻转、圆角、滤镜、混合模式、人物上下）；`?lyrics=` 时用 `?lib=` / `?css=` 指向的共享渲染器 `lyrics-view.js` / `lyrics-view.css`（网页根目录，打包时随 web 资源一起）显示桌面歌词，主进程通过 `__setLyrics` / `__setMedia` 推送歌词与播放位置。只要有视频，整页就在一块 canvas 上合成 |
| `lib/power.js` | 桌面层视频的节能决策（纯函数）：锁屏、休眠始终暂停；桌面被全屏 / 最大化窗口遮住、电池供电时按「节能暂停」设置暂停 |
| `lib/lyrics.js` | 桌面歌词：曲目匹配，以及 QQ音乐（`musicu.fcg` GetPlayLyricInfo 的逐字 QRC，回退到 base64 LRC 接口）与网易云音乐（逐行 LRC + 翻译）的公开接口（非官方、无需登录，接口可能变动；`fetch` 可注入以便单元测试）；解析交给网页根目录的 `lyrics-view.js`，预览与桌面层解析结果一致 |
| `lib/qrc.js` | QQ音乐 QRC 逐字歌词解密：QQ 自己的 DES 变体（两处 S 盒与标准不同，普通 3DES 库解不出）三趟 ECB + zlib，移植自开源实现并用其测试向量核对；单元测试里再做加密 → 解密 → 解析的闭环 |
| `lib/live.js` | 校验网页侧发来的动态壁纸数据（视频字节、容器类型、每块分区的多边形与目标矩形） |
| `../../modules/client.js` | 网页侧模块，只有在 `window.desktopRider` 存在时注册 |
| `test/lib.test.cjs` | 单元测试（任何系统）：参数构造、句柄转换、JSON 解析、静态服务器 |
| `test/smoke.cjs` | 用 Playwright 启动真实 Electron：页面加载、桥存在、显示器列表、非 Windows 下应用失败并提示 |
| `test/windows.cjs` | 仅 Windows：真实调用 `bridge.ps1`，应用到主显示器后用 `IDesktopWallpaper` 与 Win32 回查壁纸文件、桌面层窗口的父窗口与矩形；再把左侧分区画面推出露白，分别以间隙色、本机扩图、重新开启不露白应用，用 `nativeImage` 读系统正在显示的 PNG 左缘像素核对填充结果；再录一段颜色循环的 WebM 加为人物之上的视频图层并应用，读层窗口画布确认图层中心逐帧变化、旁边壁纸不变；再把主窗口最大化遮住桌面，确认层窗口被判定为 covered、所有视频暂停且画布不再重绘，还原窗口后恢复播放；再启用手动 QRC 歌词（卡拉 OK 模式）并应用，读层窗口 DOM 确认共享渲染器与样式表已从 web 根加载、三句按自身时钟循环、某个字处于逐字填充中、字号为显示器高度的 5%、颜色与点亮色正确（运行器没有媒体会话，跟随播放的路径见真机清单）；再导入页面内录制的 WebM 作为动态壁纸，确认层窗口真的在解码并逐帧绘制，重启后恢复并继续播放，清理、还原原壁纸；整屏截图与 `report.json` 写到 `test/out/` |
| `test/screenshot.ps1` | 整个虚拟屏幕截图（供上面的测试与 CI artifact 使用） |
| `../../.github/workflows/windows.yml` | GitHub Actions：在 `windows-2025`（Win11 24H2 内核）与 `windows-2022` 上跑全部测试并上传截图；另一个任务产出 x64 安装包 |

分割线为弧形 / 波浪时方案里的多边形最多 50 个点（校验上限 128）；换成自己图片的分区不在播放方案里，层页面把静帧 PNG 铺在底下，那块就显示静帧。桌面歌词：只要有层窗口开着歌词，主进程就起一个常驻的 `bridge.ps1 -Command watch-media` 进程，每秒通过 WinRT 的 `GlobalSystemMediaTransportControlsSessionManager` 读取系统媒体会话（QQ音乐、网易云音乐、Spotify、浏览器等凡是向 Windows 媒体控件报告曲目的播放器），曲目 / 状态 / 位置变化时输出一行 JSON；曲目变化后按歌名 + 歌手在所选歌词站（`lib/lyrics.js`：网易云音乐、QQ音乐，或先网易云后 QQ）搜索并取 LRC（含翻译），缓存后推给层窗口；位置每秒同步一次，层窗口在两次更新之间按时间插值。手动 LRC 模式也跟随播放器位置；没有媒体会话时层窗口用自己的时钟循环。节能：每个有视频的层窗口由一个常驻的 `bridge.ps1 -Command watch` 进程每秒检查该显示器的桌面是否被可见、未最小化、未 cloaked、非点击穿透的顶层窗口最大化或整幅覆盖（排除 Progman / WorkerW / 任务栏等外壳窗口），状态变化时输出一行 JSON；主进程结合 `powerMonitor` 的锁屏 / 电池 / 休眠事件由 `lib/power.js` 决定是否暂停，并调用层页面的 `window.__setPaused`。层页面只在视频出新帧时重绘（`requestVideoFrameCallback`），暂停时零重绘。图层模块的视频层（最多 6 个）作为 `clips` 一起交给客户端：每个视频写成 `<key>-clip-<n>-<stamp>.<ext>`，层页面按方案在同一块画布上逐帧绘制——静帧壁纸、动态壁纸分块、人物之下的视频层、叠加 PNG、人物之上的视频层——变换、圆角、滤镜与混合模式与预览一致（混合模式以画布里的内容为底）。

渲染分层由网页侧 `wallpaperCanvas(s,width,{layers})` 提供：`background`（壁纸 + 人物之下的模块）设为系统壁纸，`overlay`（透明：人物副本 + 人物之上的模块）给桌面层；两者叠加与导出 PNG 逐像素一致（`tools/verify-client.cjs` 校验）。没有任何悬浮内容时不创建桌面层。

## 桌面层的工作方式与边界

- 应用时向 `Progman` 发送 `0x052C`，Explorer 会在壁纸与图标之间生成一个 `WorkerW`，桌面层窗口 `SetParent` 到它上面；Windows 11 24H2 把图标视图留在 `Progman` 内，此时直接挂到 `Progman` 并置于其 z 序底部。两种情况 `bridge.ps1` 都会返回实际使用的宿主（`workerw` / `progman`）。
- 桌面层窗口是 Electron 透明窗口，`setIgnoreMouseEvents(true)`，不在任务栏与 Alt-Tab 出现；坐标按物理像素相对虚拟屏幕原点定位，多显示器、不同缩放比例都按 `IDesktopWallpaper` 返回的矩形处理。
- 桌面层（静态叠加或动态视频）不随分辨率变化自动重算；重新点一次「应用」即可。视频按 `requestAnimationFrame` 逐帧画到 canvas，主进程加了 `disable-renderer-backgrounding`、`disable-background-timer-throttling` 与 `CalculateNativeWinOcclusion` 关闭，避免 Chromium 把图标后面的窗口当作被遮挡而停止绘制。视频文件写在 `%APPDATA%/desktop-rider-windows/desktop/`，每台显示器只保留最新一份。Explorer 重启（例如资源管理器崩溃）后宿主窗口失效，需要重新应用。
- 系统壁纸由 Windows 自行持久化；客户端重启只恢复桌面层窗口（读取 `%APPDATA%/desktop-rider-windows/desktop/layers.json`）。
- 不修改注册表以外的系统设置；开机启动使用 Electron 的登录项接口（`HKCU\...\Run`）。
- `SetParent` 失败时桥脚本会带 Win32 错误码报错，而不是静默继续。以管理员身份运行并不影响：CI 任务本身就是高完整性进程（`elevated=True`，与资源管理器同一会话），桌面层照样挂到了 WorkerW / Progman 之下。

## 验证

运行器测不到的部分（托盘、开机启动、锁屏 / 电池暂停、多显示器、性能）见 [REAL-DEVICE-TEST.md](REAL-DEVICE-TEST.md)，按编号在 Win11 真机上过一遍。

```bash
npm test                # 单元测试（任何系统）
npm run smoke           # Electron 启动烟测（任何系统）
node test/windows.cjs   # 仅 Windows：真调用桥、回查系统状态、截图
```

仓库根目录另有 `node tools/verify-client.cjs`，用假的 `window.desktopRider` 在普通 Chromium 中验证网页侧模块与分层渲染。

**没有 Windows 机器时**：推送到 `main`（或手动触发 Actions 里的 "Windows client"）后，GitHub 的 Windows 运行器会跑完上面三项。运行器带交互桌面且 Explorer 在运行，所以 `bridge.ps1` 是真的在设壁纸、挂桌面层；`windows-2025` 走 Progman 分支，`windows-2022` 走 WorkerW 分支。每次运行的 artifact 里有应用前后的整屏截图（`desktop-<os>`）与 x64 安装包（`DesktopRider-windows-x64`）。它是 Windows Server 而非 Win11 客户端版，托盘与开机启动的交互还是要在真机上看。

Windows 真机上建议按顺序检查：显示器列表与分辨率是否正确 → 应用后壁纸是否按屏幕变化 → 开启人物悬浮再应用，人物是否出现在图标之下、能否被图标遮挡、点击是否穿透到桌面 → 退出后重开是否恢复桌面层 → 开机启动。
