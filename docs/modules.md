# 模块机制

`core.js` 提供一个很小的扩展层：桌面歌词、文件管理、时钟、便签这类功能各自写成一个模块文件放在 `modules/`，在 `index.html` 中于 `app.js` 之前引入即可。核心（`app.js`）负责壁纸、分裂几何、人物与方案；模块通过固定的几个钩子接入状态、侧栏、设置面板、桌面图层和导出。`modules/note.js`（桌面文字）是完整示例。

## 注册

```js
Rider.register({
 id:'lyrics',            // 小写字母开头，唯一；也是 state.modules 里的键
 name:'桌面歌词',
 order:200,              // 叠放与导出顺序：壁纸 0 … 悬浮人物 100 … 默认 200；小于 100 画在人物下面
 defaults:{...},         // 本模块在方案里的初始状态
 normalize(m,{clamp,defaults}){ return m; },  // 校验 / 迁移本模块状态，草稿与方案载入时调用
 view:{label,icon,title,description,inspectorTitle,page:false}, // 可选：侧栏入口与独立视图
 panelView:'design',     // 没有 view 时，设置面板附在哪个内置视图下（design / wallpaper / manage）
 mount({panel,layer,page,api}){},   // 启动时一次：建立控件和桌面元素
 sync({s,panel,api}){},             // 状态 → 控件，每次 update 调用
 render({s,w,h,layer,api}){},       // 状态 → 预览图层，每次桌面渲染调用（w、h 为预览像素）
 async draw({ctx,s,w,h,view,api}){},// 画进导出 PNG / 方案缩略图（ctx 已 save，结束后自动 restore）
 onView({view,api}){},              // 视图切换
});
```

所有钩子都可省略。钩子里抛出的错误（包括 async 钩子的 rejection）只记录到控制台，不会打断核心和其他模块。注意 `mount / sync / render / draw / onView / normalize` 是保留的钩子名，`id / name / order / defaults / view / panelView` 是保留的配置名，`panel / layer / page` 由核心写入；模块自己的字段和方法都不要用这些名字（例如给单台显示器渲染的方法应叫 `renderFor`，不能叫 `render`；缓存的场景对象不能叫 `view`，否则会把侧栏入口的定义覆盖掉）。

### 状态

模块只读写 `state.modules[id]`，内容必须可 JSON 序列化。它随草稿自动保存、随方案保存与载入、随「重置」回到 `defaults`；`normalize` 收到 `{...defaults,...stored}`，返回干净的对象（示例见 `note.js`，`clamp(value,min,max,fallback)` 与核心共用）。暂时未加载的模块的数据会原样保留在方案里。

不属于方案的数据（缓存、索引、上次打开的目录）用 `Rider.storage(id)`：`get(fallback)` / `set(value)` / `remove()`，键为 `desktop-rider:<id>`，独立于方案存储。

### 界面位置

- `panel`：设置面板内的容器（`#module-controls > #module-<id>`）。声明 `view` 时只在本模块视图显示；否则在 `panelView` 视图下显示。面板内沿用 `.control-section`、`.slider-control`、`.switch-row`、`.color-row`、`.inline-form` 等现有样式，`input[type=range]` 的进度条由核心统一刷新。
- `layer`：桌面预览内的图层（`#module-layers > .module-layer`，覆盖整个桌面）。图层本身不接收指针事件，模块自己的子元素接收，所以分割手柄、人物副本仍可操作。`order < 100` 的图层在悬浮人物之下，其余在人物与选中框之上、分区与 Dock 之下；分割手柄始终在最上层。位置请用桌面百分比，预览与导出共用同一份状态。
- `view`：声明后侧栏多一个入口，页面标题、面包屑与面板标题随之切换，桌面预览保持可见；`page:true` 时在预览下方再给一个 `section`（`mod.page`），放列表、文件浏览等大块内容。`icon` 取 `index.html` 里 `#i-*` 符号名。

### 导出

`draw` 在 `wallpaperCanvas` 里按 `order` 调用：`order < 100` 的模块画在壁纸之后、悬浮人物之前，其余画在人物之后；人物优先模式下全部画在合成结果之上。`s` 是导出用的状态快照，`w`、`h` 是画布像素（默认 1600 宽），`view` 含 `img`（壁纸）与 `cut`（抠出的人物，可能为 null）。预览缩略图也走同一条路径，所以 `draw` 应当既快又可在小尺寸下工作。

### api 与事件

`mount` 等钩子收到的 `api`（即 `Rider.api`）：

| 成员 | 说明 |
| --- | --- |
| `state` / `view` / `saved` | 当前状态、当前视图、已保存方案（只读取；修改状态后调用 `update`） |
| `update({custom,zones})` | 状态已改：刷新控件、安排渲染、保存草稿。模块改自己的状态用 `update({custom:false})`，不会取消当前模板 |
| `toast(text)` | 底部提示 |
| `setView(id)` | 切换视图，包括模块视图 |
| `wallpaperCanvas(s,width)` | 生成导出画布 |
| `loadImage(src)`、`source()`、`scene(s)` | 壁纸图片、当前壁纸地址、含抠图的场景 |
| `geometry(s,w,h)`、`floating(s)` | 分裂几何、人物是否悬浮 |
| `wallpaperPlacement(s,img,w,h,polygon,index)` | 某块分区里壁纸的目标矩形 `{x,y,w,h}`；`img` 只需 `naturalWidth / naturalHeight`，视频也可用 |
| `useImage(drawable,width,height,name)` | 把任意可绘制对象（图片、位图、视频帧）设为自定义壁纸，与导入图片走同一路径 |
| `scheduleRender()` / `renderDesktop()` | 重绘预览（模块自身计时器驱动的内容可直接改图层 DOM，不必走这里） |
| `createItem(name,kind)`、`moveItem(id,zoneId)` | 收纳分区中的快捷项；`kind` 为 file / folder / image / code / music |
| `download(blob,name)`、`icon(name)`、`clone`、`$`、`$$`、`desktop()`、`persist()`、`normalizeState` | 工具 |

事件：`Rider.on(event,fn)` 返回取消函数；`state`（update 之后，参数为 state）、`render`（桌面渲染完成，`{s,w,h}`；此时 `#piece-left / #piece-right` 的裁切与定位已写好，需要跟随壁纸分区的图层在这里同步）、`view`（视图切换）、`tick`（每分钟，桌面时钟刷新时）、`video`（Wallpaper Engine 导入了视频壁纸，`{file,time,name}`，由 `modules/live.js` 接收）。模块也可以 `Rider.emit` 自定义事件给其他模块。

## 后续功能的落点

- **桌面歌词**：从 `note.js` 复制，`order` 保持 200；状态存样式与位置，歌词文本不存方案。播放源（本地音频元素、系统播放器接口）在 `mount` 里建立，用自己的计时器更新 `layer` 里的文字；`draw` 画当前行以便导出截图。真正读取系统正在播放的曲目需要原生客户端提供接口，模块里预留一个 `source` 适配器即可。
- **文件管理**：声明 `view:{page:true}`，`page` 放目录浏览，`panel` 放筛选与整理选项；目录句柄与索引放 `Rider.storage('files')`，真实文件不进方案；通过 `api.createItem` / `api.moveItem` 把文件映射为分区里的快捷项。浏览器内只能读取用户选择的目录（`showDirectoryPicker`），移动、删除文件要等原生客户端。
- **时钟 / 天气 / 便签**：与桌面文字同构，各自一个模块文件。
- **逐帧视觉处理**（参考 `modules/live.js` 的逐帧人物提取）：`Portrait.segmentVideo(bitmap,timestamp)` 把一帧（缩到 384 px 宽的 ImageBitmap）送进 Worker 里 VIDEO 模式的人像模型，返回 `{width,height,values}` 置信度；一次只送一帧，拿到结果再送下一帧。合成在主线程 canvas 上做（`destination-in` 套蒙版），悬浮副本的静态 `<img>` 保留用于拖动与命中，自己的画布叠在 `z-index 15`（副本之上、选中框之下）。
- **跟随壁纸分区的图层**（参考 `modules/live.js` 动态壁纸）：`order < 100`，监听 `render` 事件后读取 `#piece-left / #piece-right` 的 `clipPath`、`backgroundSize`、`backgroundPosition`，让自己的画布与分区逐像素对齐；大文件放 IndexedDB，方案里只存元数据；给客户端提供 `exportFor(s,w,h)` 之类的方法（不要用保留钩子名）返回按显示器分辨率算好的几何。
- **原生客户端**：把 `Rider.api` 之外的系统能力（设壁纸、枚举显示器、监听播放器）做成单独的模块或 `api` 扩展，界面层无需改动。

## 验证

`node tools/verify-live.cjs`：动态壁纸模块（视频导入、静帧、分区画布对齐、播放规则、客户端方案、持久化）。

`node tools/verify-modules.cjs`：示例模块的视图、控件、拖动、键盘、导出像素、草稿与方案持久化、状态校验，运行中注册新模块与绘制顺序，处处抛错的模块不影响核心，事件、`api`、`storage` 与窄屏布局。
