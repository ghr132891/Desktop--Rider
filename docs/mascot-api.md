# 萌版人物接口（给外部 AI）

萌版人物（`modules/mascot.js` + 共享渲染器 `mascot-view.js`）自带一套基础行为：呼吸、眨眼、发呆、睡觉，戳一下开心、连戳生气、按住摸头、拖动摇晃，听到桌面歌词时摇摆并唱出当前句。想让它更"活"，可以从外面接一个 AI（本地脚本、LLM 代理、游戏引擎都行）：**读事件，发指令**。两端用同一套 JSON。

## 指令

| type | 字段 | 作用 |
|---|---|---|
| `emote` | `name`（见下）、`ms` 可选时长、`silent:true` 不配台词 | 做一个表情动作 |
| `say` | `text`（≤80 字）、`ms` 可选 | 头顶气泡说话 |
| `mood` | `happy` 0–1、`energy` 0–1 | 设定情绪；情绪会慢慢回到中性 |
| `music` | `playing`、`energy` 0–1、`line`、`progress` 0–1 | 告诉它音乐状态（客户端已自动接桌面歌词，外部也可覆盖） |
| `pose` | `head:{rot,y}`、`body:{rot,x}`、`ms` | 精细姿态：覆盖 `ms` 毫秒内的自动动作（角度为度，`y` 为头高比例，`x` 为像素） |
| `move` | `left`、`top`（像素数或 CSS 长度） | 移动脚下位置 |
| `style` | `patch`（size、flip、shadow、stickers:{blush,eyes,mouth}、mouthOffset:{x,y}、singBubble…） | 改外观 |
| `phrases` | `phrases:{tap:[…],pat:[…],angry:[…],cheer:[…],surprise:[…],shy:[…],sleep:[…],wake:[…],drag:[…],drop:[…],dance:[…],idle:[…]}` | 换台词库 |
| `rig` | `rig:{head:{url,x,y,w,h,pivot:{x,y}},body:{url,x,y,w,h},width,height,face:{eyes,mouth,blush,size}}` | 换一套头 / 身部件（PNG data URL + 合成坐标，格式同 `/api/mascot/rig` 返回的），例如外部 AI 生成的全身 Q 版 |
| `wake` | — | 叫醒 |
| `state` | — | 返回当前状态 |

表情 `name`：`happy` 开心跳一下 · `love` 摸头害羞 · `angry` 生气抖动 · `cheer` 欢呼 · `surprise` 惊讶 · `shy` 害羞转头 · `sleep` 睡着（直到 `wake`） · `dizzy` 头晕 · `dance` 跳舞 · `sing` 张嘴唱 · `wave` 挥手 · `think` 思考 · `stretch` 伸懒腰。

## 事件

`{type:'tap',head:bool}` 点击 · `doubletap` · `pat` 摸头 · `angry` 被连戳 · `drag` / `dragging{dx,dy}` / `drop{dx,dy}` 拖动 · `emote{name}` 开始某表情 · `idle{act}` 发呆动作 · `wake` · `music{playing}`。

## 在网页里

```js
Rider.api.mascot.command({type:'say',text:'你好'});
Rider.api.mascot.on(ev=>console.log(ev));   // 返回取消函数
Rider.api.mascot.state();
```

## 在 Windows 客户端里（HTTP，本机回环）

客户端的回环服务在随机端口上，地址和令牌显示在客户端面板「萌版人物」状态行，也写在 `%APPDATA%\desktop-rider-windows\mascot-api.json`：`{"url":"http://127.0.0.1:PORT","token":"…"}`。每个请求带 `Authorization: Bearer <token>`（或 `?token=`）。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/mascot/command` | 请求体为一条指令或指令数组；返回 `{ok, results}` |
| `GET` | `/api/mascot/state` | 当前状态（情绪、表情、音乐、位置、是否识别到脸） |
| `GET` | `/api/mascot/rig` | 当前骨架：头 / 身体 PNG（data URL）、五官位置，供精细化设计 |
| `GET` | `/api/mascot/events` | `text/event-stream`，每条事件一行 `data: {...}` |

例子（PowerShell）：

```powershell
$t = (Get-Content "$env:APPDATA\desktop-rider-windows\mascot-api.json" | ConvertFrom-Json)
Invoke-RestMethod -Method Post -Uri "$($t.url)/api/mascot/command" -Headers @{Authorization="Bearer $($t.token)"} -ContentType 'application/json' -Body '{"type":"emote","name":"cheer"}'
```

一个最小的"AI 行为"循环：订阅 `/events`，收到 `pat` 就 `say` 一句温柔的话并把 `mood.happy` 调高；收到 `music{playing:true}` 就按曲风挑 `dance` 或 `sing`；长时间没事件就发一条 `idle` 台词。精细化设计用 `pose`（逐帧姿态）、`phrases`（人设台词）、`style`（贴纸与体型），或直接拿 `/rig` 里的头身 PNG 做自己的渲染。

## 安全

接口只监听 127.0.0.1，令牌随机生成且只存在本机；指令中的文本会被截断，不会被当作代码执行。

## 做一个全身的萌版（外部 AI 流程）

壁纸里的人物多半只有半身。本地的做法是：检测到是半身图时，用人物的肤色（鼻尖附近）与衣服主色（身体区域下半部中间）程序化画一个 Q 版身体接在真头下面（`MascotView.chibiBody`），立刻就有全身小人可以动；但它是卡通简笔的，补不出原画风格的服装细节与腿脚；"认出人物并补全全身"需要生成式模型，目前 GitHub 上没有一键的开源方案，但可以用现成组件拼：

1. 从 `GET /api/mascot/rig`（或网页 `Rider.api.mascot.rig()`）拿到抠出的人物 PNG。
2. 用 Stable Diffusion / ComfyUI 生成全身 Q 版：SDXL 动漫底模 + **IP-Adapter / IP-Adapter-FaceID**（保持人物长相与配色，见 [h94/IP-Adapter-FaceID](https://huggingface.co/h94/IP-Adapter-FaceID)）+ **ControlNet OpenPose**（给一个站立的全身骨架）+ chibi / 缩放类 LoRA（如 [envy-zoom-slider-xl](https://huggingface.co/e-n-v-y/envy-zoom-slider-xl-01) 推到全身构图）；参考 [makeanime](https://github.com/arig23498/makeanime) 这类把人脸 + 风格参考喂给 IP-Adapter 的脚本。直接 img2img 外扩往往要么拉长原图要么丢失长相，IP-Adapter 走 txt2img 更稳。
3. 把生成图抠背景（可以回传给本应用的抠图，或用 rembg），再用 `MascotView.buildRig(图, {face})` 切头身（在网页里或 Node 里调用），也可以自己分层。
4. `POST /api/mascot/command` 发 `{type:'rig',rig:{…}}`，人物立即换成全身版；想持久化就把它存进自己的方案里重新应用。

想要更"活"的面部（转头、眨眼、嘴型由神经网络生成），可以接 [talking-head-anime-3](https://github.com/pkhungurn/talking-head-anime-3-demo)（单张 512×512 动漫立绘即可，需要 GPU），把它的输出帧通过 `rig` 指令或自己的渲染喂进来。单图自动绑骨的开源项目如 [img2rig](https://github.com/SSnemo/img2rig)、分层工具 see-through 也可作为部件来源。
