# MJ Spider-Man Easter Egg

一个适用于 Chrome 和 Edge 的 Manifest V3 浏览器扩展。在普通网页中输入 `mj` 并提交、从浏览器地址栏搜索 `mj`，或按下可配置的 `Ctrl+按键`，会以各 50% 的独立概率播放“倒挂”或“耍帅”透明蜘蛛侠彩蛋。


## 触发方式

### 输入 `mj`

扩展支持 `input`、`textarea`、`contenteditable`、`role="textbox"` 以及可注入的 iframe：

- 输入独立 token `mj` 后按 Enter，大小写不敏感。
- Enter 原本用于换行时，换行照常发生，彩蛋同时播放。
- Enter 原本用于提交或搜索并跳转页面时，扩展会在提交前记录随机结果，并在目标页面继续播放同一个特效。`Navigation search` 属于这个场景。
- 点击“发送”“提交”“发布”“回复”“评论”“搜索”等控件时也会触发。
- Bilibili 一类带“发布”文字或可识别控件语义的流程会直接支持，不依赖清空猜测。
- 对完全没有按钮语义的网站，可选的“点击后清空”兼容逻辑默认关闭。开启后，只有点击编辑框外的可交互控件，并且原内容恰好为 `mj` 的编辑区在 300ms 内被清空或替换时才会触发。
- `MJ`、`Mj`、`mJ` 均有效；`emoji`、`image`、`somethingmj` 不会误触发。

扩展不会调用 `preventDefault()` 或 `stopPropagation()`，不会改写输入内容、抢夺焦点，也不会拦截页面点击和滚动。

仅仅在网页输入框中输入或停留在 `mj` 不会触发。必须发生 Enter、明确的发送/发布点击，或者在手动开启兼容选项后发生上述短时间内的点击后清空。

一次成功触发后，该输入框中未发生变化的同一份 `mj` 会被标记为已消费。即使搜索框仍保留 `mj`，再次点击输入框、页面空白处或发送/搜索控件都不会重复触发。必须先让内容发生变化，再重新输入 `mj`，才能再次触发。

### 浏览器地址栏搜索

在 Chrome/Edge 顶部地址栏（显示 `https://` 的 Omnibox）输入 `mj` 并按 Enter 搜索后，扩展会在搜索结果页触发彩蛋。它通过导航来源和最终搜索 URL 判断，只接受从地址栏发起且 `q`、`query`、`wd`、`word`、`keyword`、`search_query`、`text` 或 `p` 参数恰好等于 `mj` 的导航。

浏览器不允许扩展读取地址栏中尚未提交的文字，因此只输入 `mj` 但不按 Enter 时无法触发；这是浏览器隐私边界。

### `Ctrl+M`

同时按住 `Ctrl` 和 `M` 会播放一次彩蛋。持续按住或键盘自动重复不会重复触发。动画结束后，必须先松开至少一个键，再次进入 `Ctrl+M` 同时按住的状态，才能播放下一次。

扩展不会阻止该组合键在网页中的原有行为。部分网页或软件会把 `Ctrl+M` 用作静音等命令；遇到冲突时，请按下一节修改第二个按键。

## 配置快捷键与声音

所有用户可调选项集中在 `src/config.js`：

```js
const config = {
  shortcut: {
    enabled: true,
    key: "m",
  },
  genericClearTriggerEnabled: false,
  effectAudioEnabled: true,
};
```

- 将 `key: "m"` 改为 `key: "k"`，快捷键就会变成 `Ctrl+K`。
- `key` 使用浏览器 `KeyboardEvent.key` 的值，不区分字母大小写；也可以使用 `"F8"`、`"ArrowUp"` 等键名。
- `key` 不能为空，也不能设为 `"Control"`。无效值会使快捷键停止工作，不影响输入 `mj` 触发。
- 将 `enabled` 改为 `false` 可完全关闭键盘组合触发。
- `genericClearTriggerEnabled` 默认为 `false`。只有确实需要兼容无文字、无按钮语义、仅通过清空输入框判断发布的网站时才建议设为 `true`；开启会扩大点击触发范围。
- 将 `effectAudioEnabled` 改为 `false` 可让彩蛋视频默认静音。即使设为 `true`，浏览器拒绝有声自动播放时仍会静音重试。

修改后需要在扩展管理页重新加载扩展，并刷新正在测试的网页。扩展始终保留 `Ctrl` 作为修饰键，只把另一个键作为可选变量，不会拦截组合键原本的页面或浏览器行为。

## 安装

### Chrome

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择包含 `manifest.json` 的项目根目录。
5. 打开或刷新一个普通网页后测试。

### Edge

1. 打开 `edge://extensions`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择包含 `manifest.json` 的项目根目录。
5. 打开或刷新一个普通网页后测试。

修改源码后，请在扩展管理页点击扩展的“重新加载”，并刷新测试标签页。扩展会在后台被唤醒时尝试补注入已打开的普通网页，但 Chromium 不保证开发者重载后立即唤醒 service worker；手动刷新是可靠做法。

## 实现规则

- 每次有效触发都以 `Math.random() < 0.5` 独立选择两个动画之一，没有“避免连续重复”逻辑，因此概率严格按两个等长区间划分。
- iframe 中的触发由 service worker 转发到顶层 frame，避免动画被 iframe 裁切或重复播放。
- 网页导航提交先把 `effectId` 暂存在 service worker；新文档握手或加载完成后复用该值，不会在目标页面重新随机。
- 地址栏搜索使用 `webNavigation` 的 `from_address_bar` 导航标记，不读取浏览历史，也不会把普通网页跳转误认为地址栏输入。
- overlay 使用 closed Shadow DOM、`position: fixed`、最高层级和 `pointer-events: none`，不参与网页布局。
- 同一页面同一时刻最多播放一个动画。播放器同时检查内存播放状态和页面中的唯一 overlay host；重复按键、多个 iframe、重复消息或脚本补注入都不能叠加第二个动画。
- 音频默认开启；若自动播放策略拒绝有声播放，会静音重试，动画仍可显示。
- 扩展不收集数据、不发送统计请求，也不包含远程执行代码。

`scripting` 和 `<all_urls>` 权限用于在 Chrome/Edge 扩展重载后向已打开的普通网页补注入脚本，以及让触发能力覆盖用户访问的网站。`webNavigation` 仅用于识别由地址栏发起的已提交导航及其目标 URL。代码只处理触发事件和本地媒体播放，不保存浏览记录。

## 平台限制

这里的“任何输入框”指浏览器允许扩展注入的普通网页编辑区。以下位置无法监听：

- 地址栏和新标签页原生搜索框中尚未按 Enter 的文字
- `chrome://`、`edge://` 等浏览器内部页面
- Chrome Web Store、Edge Add-ons 等禁止扩展注入的页面
- 页面自身放在封闭跨域环境且浏览器拒绝注入的 frame

这是 Chromium 的安全边界。地址栏搜索在按 Enter 后支持；网页中的搜索框，包括会导航到结果页的搜索表单，也属于支持范围。

## 素材与归属

本项目的两组源视频取自 [MI-KUNs/CN-TikTok-MJ](https://github.com/MI-KUNs/CN-TikTok-MJ)，该上游仓库以 Apache License 2.0 发布。素材原始内容据本项目发起者说明来自抖音官方，当前上游 README 只将其描述为“抖音蜘蛛侠彩蛋并排 Alpha 视频”，未提供进一步的官方权属证明。

抖音、Spider-Man 及相关名称、角色、声音和素材的权利归各自权利人所有。本项目为非官方、非商业的技术演示，与字节跳动、抖音、Marvel 或 Sony 无隶属、授权或背书关系。公开分发前请自行确认素材使用符合适用法律、平台规则和权利人的要求。

完整说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 素材构建

源 MP4 是 Side-by-Side Alpha：左半为亮度 Alpha Mask，右半为 RGB。构建脚本会读取实际媒体尺寸、扫描整段 Alpha 联合包围盒、保留 24px 安全边距，并通过 `alphamerge` 生成带透明通道的 VP9 WebM。音频转为 Opus，源文件的容器元数据和章节不会复制到构建产物。

| 素材 | MP4 实际尺寸 | 时长 / 帧率 | Alpha 联合范围 | WebM 尺寸 |
|---|---:|---:|---:|---:|
| 倒挂 | 2144×2352 | 3.05s / 30fps | x=203..790, y=0..1587 | 638×1612 |
| 耍帅 | 2160×2336 | 3.01s / 30fps | x=0..1079, y=0..1569 | 1080×1594 |

耍帅素材的 `config.json` 标注为 2352×2544，与实际解码尺寸不一致，因此构建以媒体探测结果为准。

```powershell
npm run build:assets
```

脚本需要 ffmpeg。它会依次尝试 `FFMPEG_PATH`、PATH，以及 Python `imageio_ffmpeg`。若 PATH 或 `FFPROBE_PATH` 中存在 ffprobe，会优先使用它读取元数据。输出完成后脚本还会解码并提取 Alpha 平面进行验证。

动画位置、尺寸和冷却时间位于 `src/effect-player.js` 顶部；快捷键与音效开关位于 `src/config.js`。

## 测试

```powershell
npm test
```

`tests/fixture.html` 覆盖普通搜索、`Navigation search`、textarea 换行、原生发送按钮、Bilibili 风格“发布”控件、无明确语义但会清空编辑区的控件、contenteditable 和 iframe。

## 目录结构

```text
.
├─ assets/                  # 构建后的透明 WebM
├─ scripts/build-assets.js  # Alpha 合成与验证脚本
├─ src/                     # 扩展运行代码
│  ├─ config.js             # 快捷键与音效配置
│  └─ ...
├─ tests/                   # 规则与浏览器测试页面
├─ 蜘蛛侠-倒挂/             # 上游源素材
├─ 蜘蛛侠-耍帅/             # 上游源素材
├─ manifest.json
├─ LICENSE
└─ THIRD_PARTY_NOTICES.md
```

## 开发说明

本项目的代码、文档、测试与工程实现全部通过 vibe coding 完成，由 AI coding agent 协助生成和修改。开源发布、合并贡献或用于生产环境前，维护者应继续进行人工代码审查、兼容性测试和权利核验。

## License

项目采用 [Apache License 2.0](LICENSE)。第三方素材同时受其来源、相关权利人及适用法律约束，详见第三方声明。
