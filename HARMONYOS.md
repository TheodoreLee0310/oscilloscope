# 鸿蒙（HarmonyOS）兼容性评估与改造报告

> 评估对象：`shi-bo-qi` / oscilloscope —— 基于 WebGL 的智能示波器交互式虚拟仿真系统
> 结论一句话：**这个项目的 JS 不能在鸿蒙的 ArkTS 原生环境里直接跑，但可以在鸿蒙的 ArkWeb（Web 组件）里完整跑起来；本仓库已按这条路线完成改造，并附一个可直接构建的鸿蒙工程。**

---

## 一、先说结论：三层代码，三种命运

| 代码层 | 举例 | 能否在鸿蒙运行 | 说明 |
| --- | --- | --- | --- |
| **浏览器前端**（页面渲染与业务逻辑） | `src/**`、`scripts/**`、`public/**` | ✅ **能**（在 ArkWeb 中） | 纯 Web 标准 API，零 Node 依赖。ArkWeb 是 Chromium 内核，WebGL / Canvas / localStorage / fetch 都支持 |
| **Node 侧构建与打包脚本** | `webpack.config.js`、`packaging/**` | ⚠️ 不在设备上运行 | 这些只在开发机执行，不属于"应用运行时"，与鸿蒙兼容性无关 |
| **Electron 桌面外壳** | `electron-main.js` | ❌ **不能** | Electron 依赖 Node.js 运行时与 Chromium 桌面壳，鸿蒙既没有 Node 运行时也不提供 Electron；这是平台定位问题，无法通过改代码解决 |

**关键事实：渲染层代码里 Node / Electron API 的命中数是 0。**
全项目 13 处 `require('fs'|'path'|'electron')`、`process.*`、`__dirname`、`ipcRenderer`
**全部集中在 `electron-main.js` 主进程**，`src/` 与 `scripts/` 里一处都没有。
这正是"换一个容器就能跑"的前提。

---

## 二、为什么选 ArkWeb 容器路线

鸿蒙的 Web 组件（ArkWeb）内置 Chromium 内核，与桌面浏览器同源。
因此不必用 ArkTS 重写三维渲染、波形绘制与 Vue 界面，**同一份构建产物既跑浏览器也跑鸿蒙**。

| 维度 | ArkWeb 容器化（本方案） | ArkTS 原生重写 |
| --- | --- | --- |
| 工作量 | 已完成，1 个工程 + 少量兼容改造 | 需重写 Three.js 场景、波形算法、UI，数十倍工作量 |
| 渲染性能 | 原生 WebGL，Chromium 直接加速 | 理论上更贴近系统，但需重写整个渲染管线 |
| 功能完整度 | 现有功能基本全覆盖（少数联网功能降级） | 需逐项重新实现 |
| 风险 | 低（ArkWeb 能力边界清晰） | 高（工期与正确性都难保证） |

> 需要保留的认知：ArkWeb 是"网页跑在鸿蒙里"，不是"网页变成了鸿蒙原生应用"。
> 如果后续要做卡片、元服务、系统级能力深度集成，才需要考虑把部分模块 ArkTS 原生化。

---

## 三、清点数据：这个项目有多"Web"

对 `src/**`（27 个 JS）、`scripts/**`（8 个 JS）、`public/**`、`electron-main.js` 共 45 个文件、
19,739 行代码做了全量平台敏感 API 清点，命中 **499 处**：

| 类别 | 命中 | 对鸿蒙的意义 |
| --- | --- | --- |
| DOM / BOM API | 216 | ArkWeb 完整支持 |
| Web Storage | 13 | 仅登录态 3 个 key；**需宿主开启 `domStorageAccess`** |
| 网络请求 | 47 | 无 XHR / WebSocket / 长连接；含 4 处远程 `<script>` 与 41 条外网图片 |
| 文件与媒体 | 11 | `<input type=file>` 1 处，**必须由宿主 `onShowFileSelector` 接管** |
| Canvas / WebGL | 11 | 1 个 WebGLRenderer + 3 个 2D canvas，ArkWeb 支持 |
| Node / Electron | 13 | **全部在 `electron-main.js`**，渲染层 0 命中 |
| 模块与语法 | 182 | 纯 ESM（96 import / 53 export），无 `module.exports` |
| 设备能力 | 6 | 无传感器 / 打印 / 分享 / 全屏 / UA 嗅探，仅 CSS 媒体查询 |

**对鸿蒙有利的**：零长连接、零 `window.open`、零 `confirm/prompt`、渲染层零 Node 依赖、
`scripts/` 8 个模块不碰 DOM 也不碰存储（耦合最低的一层）。
**对鸿蒙不利的**：无 Web Worker / OffscreenCanvas（三维渲染与图像分析都在主线程）、
交互最初只按鼠标设计（无触摸事件）、无 `webglcontextlost` 监听。

---

## 四、本次做了哪些兼容性改造

### 1. 新增平台适配层 `src/utils/platform.js`（本次核心）

把"浏览器 / Electron / 鸿蒙 ArkWeb"的差异收敛到一个模块：

| 能力 | 解决的问题 |
| --- | --- |
| `runtime` 环境探测 | 识别 ArkWeb / HarmonyOS / Electron / 触摸设备，业务代码可按需分支 |
| `storage` 分层降级 | `localStorage → sessionStorage → cookie → 内存`，**宿主关闭 DOM Storage 时不再抛 SecurityError** |
| `toast()` | 替代 `alert()`：ArkWeb 下原生对话框不可靠，自绘提示一定能显示 |
| `loadScriptOnce()` | 远程脚本按需加载，带超时、失败不抛异常、同一 URL 只加载一次 |
| `onViewportChange()` | 统一订阅 resize / 旋转 / 软键盘 / 分屏引起的视口变化 |
| `adoptUrlSession()` | 宿主不支持持久化存储时，从 URL 吸收登录态 |

### 2. 修掉会在鸿蒙上"静默失败"的具体缺陷

| 文件 | 问题 | 改造 |
| --- | --- | --- |
| `public/login.html` | 3 处裸 `localStorage.setItem`，存储被禁用时 `saveSession` 抛异常 → **点登录毫无反应、不跳转** | 改为降级存储；并新增**游客模式**入口；存储受限时给出明确提示 |
| `public/login.html` | 宿主不支持持久化存储时，跳转后新文档读不到 token → **被守卫弹回登录页（死循环）** | 登录态通过 URL 桥接传递，落地页吸收进可用存储层 |
| `public/index.html`(external) / `internal.html` | 内联守卫只认 `localStorage` | 同时认 URL 上的 token；任何异常一律放行 |
| `public/external.html` | `<head>` 里**同步阻塞**加载百度地图 SDK，离线/弱网时首屏长时间白屏 | 改为点击「初始化地图」时按需加载，10 秒超时后自动进入离线沙箱模式 |
| `public/external.html` / `internal.html` | **没有 viewport 声明**，鸿蒙 Web 组件会按 980px 桌面宽度渲染，手机上界面整体缩小到没法点 | 补 `width=device-width, initial-scale=1.0, viewport-fit=cover` |
| `public/internal.html` | Coze SDK **同一 URL 加载 3 次**，且 `new CozeWebSDK` 无 `typeof` 保护 → 网络不通时抛 `ReferenceError` 打断同页脚本 | 合并为 1 次加载 + 可用性守卫 + 失败静默降级；令牌改为可注入配置 |
| `src/external.js` | 6 处 `alert()`，ArkWeb 下提示丢失、用户点完毫无反馈 | 全部替换为自绘 toast |
| `src/external.js` | 微调滑块用 `event.movementX` 计算位移，**触摸事件没有该属性 → 手机/平板上滑块完全拖不动** | 改为按相邻两次指针坐标求差，鼠标与触摸通用；并补 `touchstart/touchmove/touchend` 监听 |
| `src/main.js` | `new THREE.WebGLRenderer()` 未做可用性检测，失败则整页卡在加载层 | 增加 WebGL 前置检测 + 明确提示；补 `webglcontextlost/restored` 监听（移动端切后台回来不再永久黑屏）；页面不可见时暂停渲染省电 |
| `src/main.js` | 仅监听 `resize`，手机旋转/软键盘不生效 | 统一走 `onViewportChange` |
| `src/materials/MaterialManager.js` | 任一贴图加载失败会让 `Promise.all` 整体 reject，**所有贴图一起丢失** | 失败改为返回占位贴图，其余贴图照常加载 |
| `src/widgets/tour-guide/TourGuide.js` | 构造时一次性快照视口，旋转后引导浮层错位 | 订阅视口变化重新定位 |
| `webpack.config.js` + `package.json` | `set NODE_ENV=production` 只在 Windows cmd 下有效，其他 shell 静默失效 → **`npm run build` 打出的是 8.6MB 未压缩的开发版产物** | 改为以 CLI `--mode` 为准；脚本去掉 `set`，跨平台可用 |

**构建产物体积：8.62 MB → 1.17 MB。**（顺带发现并修复：仓库里提交的 `docs/` 一直是开发版产物）

### 3. 新增鸿蒙工程 `harmonyos/`

标准的 DevEco Studio 工程，核心是 `entry/src/main/ets/pages/Index.ets` 里的 Web 容器：
开齐 WebGL / Canvas / 存储 / 本地资源 / 定位 / 文件选择所需的全部开关，
实现 `onShowFileSelector`（图片上传）、`onGeolocationShow`（定位授权）、
`onPermissionRequest`、返回键接管、加载进度与失败兜底页。

### 4. 新增工具与验证

- `packaging/sync-harmonyos.js` + `npm run build:harmonyos`：一键把 Web 产物同步进 `rawfile/www`；
- `packaging/test-platform.js` + `npm test`：**8 个用例全部通过**，覆盖存储降级、URL 桥接、鸿蒙 UA 识别、无 DOM 健壮性；
- `packaging/smoke-test.js` + `npm run test:smoke`：用 Electron 真实内核跑一遍构建产物做冒烟测试。

---

## 五、依赖外网的功能：降级行为一览

鸿蒙设备可能离线，或 rawfile 来源不在第三方服务的域名白名单内。这些功能的实际表现：

| 功能 | 依赖 | 无网络 / 未授权时的行为 |
| --- | --- | --- |
| VR 寻波地图 | 百度地图 JS API（AK 白名单按域名校验） | 提示「已切换为离线沙箱模式」，用模拟坐标 + 地形演示，功能可演示不报错 |
| 地形实景图 | 41 条 `images.unsplash.com` 硬编码图片 | 图片区域空白（`onerror` 仅告警），不影响波形逻辑 |
| AI 助手挂件 | `lf-cdn.coze.cn` 的 Coze SDK | 静默跳过，控制台一条 warning，不影响页面其他部分 |
| 游客 / 模拟账号登录 | 无（纯本地） | **完全可用**，不依赖网络 |
| 波形绘制 / 校准 / 李萨如 / 图片识别算法 | 无（纯本地计算） | **完全可用** |

> 补充事实：`scripts/deepseekService.js`（949 行，名字像云服务）实际**零网络调用**，
> 是纯本地的 Otsu 阈值 + 行列暗像素统计图像启发式算法；`knowledgeBase.js` 也是本地关键词问答。
> 所以"AI 分析"按钮在完全离线时依然工作。

### ⚠️ 安全提醒（与鸿蒙无关，但必须处理）

仓库里有两个**明文密钥已经进入公开 GitHub 仓库**，等同泄露：

1. `public/internal.html` 中的 Coze 个人访问令牌（PAT，`pat_ZFX...`）——**请立即到 Coze 控制台吊销**；
2. `public/external.html` 中的百度地图 AK（`tMz9...`）——请在百度控制台设置域名白名单或更换。

本次改造已把两处都改为**可注入配置**（`window.SBQ_COZE_CONFIG` / `window.SBQ_BAIDU_MAP_AK`），
但已泄露的值仍需你手动吊销 —— 代码层面无法补救。

---

## 六、验证状态（诚实标注）

| 验证项 | 状态 | 说明 |
| --- | --- | --- |
| Web 生产构建通过 | ✅ 已执行 | `npm run build` 成功，产物 1.17 MB |
| 产物同步进 rawfile | ✅ 已执行 | 16 个文件 / 1.17 MB 就位 |
| 平台适配层单元测试 | ✅ 8/8 通过 | `npm test`，覆盖存储降级与 URL 桥接 |
| Electron 真实内核冒烟测试 | ⚠️ **未能执行** | 本次工作环境的沙箱禁止 Chromium 启动（Mojo IPC 需要命名管道）。脚本已写好，请在正常桌面环境执行 `npm run test:smoke` |
| 鸿蒙工程编译与真机运行 | ⚠️ **未验证** | 本环境未安装 DevEco Studio 与 HarmonyOS SDK，无法编译。ArkTS 代码按 ArkWeb 公开 API 编写，**必须经一次真实编译确认**，详见 [`harmonyos/README.md`](harmonyos/README.md) 第五节 |

**下一步建议顺序**：
1. `npm run build:harmonyos` → 用 DevEco Studio 打开 `harmonyos/` → Sync → Run；
2. 按 [`harmonyos/README.md`](harmonyos/README.md) 第四节的验收清单逐项点一遍；
3. 若编译报错，优先怀疑 hvigor 版本号与 API 版本（README 第五节列了对应改法）；
4. 确认无误后再吊销上文两个泄露的密钥。

---

## 七、后续可选项（本次未做，按需再做）

1. **替换 41 条 Unsplash 外链图片为本地资源** —— 彻底摆脱外网依赖，离线也完整；
2. **把波形计算与图像识别移入 Web Worker** —— 移动端主线程更流畅（当前无 Worker）；
3. **接入 `@ohos/network` 等原生能力** —— 例如用系统定位替换 H5 定位，精度与成功率更高；
4. **关键模块 ArkTS 原生化** —— 若后续要发元服务或做卡片，再把波形/校准等纯计算层迁到 ArkTS；
5. **替换登录为真实后端** —— `public/login.html` 里 `USE_MOCK` 置 false 并配置 `API_BASE` 即可，
   注意鸿蒙上不要用 `localhost`（指向设备自身），也不要依赖明文 HTTP。
