# 智波助梦 · 鸿蒙（HarmonyOS）应用

本目录是一个标准的 **DevEco Studio 工程**，把仓库根目录下已经做好的 Web 前端（Vue 2 + Three.js + WebGL）
装进鸿蒙的 **ArkWeb（Web 组件）** 里，从而得到一个可以在鸿蒙手机 / 平板 / PC 上安装运行的 `.hap` 应用。

```
┌─────────────────────────────────────────────┐
│  鸿蒙应用（本目录，ArkTS）                    │
│  ┌───────────────────────────────────────┐  │
│  │  ArkWeb（Web 组件，Chromium 内核）      │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ rawfile/www/  ← Web 构建产物      │  │  │
│  │  │ index.html / internal.html       │  │  │
│  │  │ login.html / js / css / textures │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│  职责：窗口、权限、定位放行、文件选择、深色模式  │
└─────────────────────────────────────────────┘
```

采用这种架构的原因：现有前端是纯 Web 技术栈（无 Node / Electron 依赖），
而鸿蒙的 ArkWeb 本身就是 Chromium 内核，**同一份构建产物既能跑浏览器也能跑鸿蒙**，
改造成本最低、效果最确定。完全用 ArkTS 重写三维渲染与波形绘制则是一个数十倍工作量的工程。

---

## 一、前置条件

| 项 | 要求 | 说明 |
| --- | --- | --- |
| DevEco Studio | **6.0.1 及以上**（本工程已在此版本实测编译通过） | 下载：<https://developer.huawei.com/consumer/cn/deveco-studio/> |
| HarmonyOS SDK | **API 21（随 DevEco 6.0.1 自带，6.0.1.112）** | 本工程 `compatibleSdkVersion` 声明为 `5.0.0(12)`，即最低兼容 API 12；编译使用已安装的 SDK |
| Node.js | ≥ 18 | 用来构建 Web 产物（仓库根目录） |
| 设备 | 鸿蒙真机（推荐）或模拟器 | 真机需在「设置 → 关于本机」连点版本号开启开发者模式 |

> 本工程不依赖任何三方 har / ohpm 包，**不需要执行 `ohpm install`**，也不需要联网。
> hvigor 与插件由 DevEco Studio 自带工具链提供（见 `hvigor/hvigor-config.json5` 的注释）。

---

## 二、三步跑起来

### 第 1 步：构建并同步 Web 产物

在**仓库根目录**（不是本目录）执行：

```bash
npm install
npm run build:harmonyos
```

这条命令会：
1. 用 webpack 把 `src/`、`public/`、`scripts/` 打包压缩到 `docs/`；
2. 再把 `docs/` 整个复制到 `harmonyos/entry/src/main/resources/rawfile/www/`。

成功时会输出：

```
[harmonyos:sync] ✅ 同步完成
 来源：docs
 目标：harmonyos\entry\src\main\resources\rawfile\www
 文件：16 个，共 1.17 MB
```

> ⚠️ `rawfile/www/` 被 `.gitignore` 忽略（内容与 `docs/` 重复，不入库）。
> **克隆仓库后必须先执行这一步**，否则应用打开后会停在错误页并提示
> 「请确认已执行 npm run harmonyos:sync 生成网页产物」。

如果只想同步、不想重新构建，用 `npm run harmonyos:sync`。

### 第 2 步：用 DevEco Studio 打开工程

1. DevEco Studio → **File → Open** → 选中本 `harmonyos` 目录（**不是**仓库根目录）；
2. 等待右下角 **Sync Now** 完成；
   - 如果提示 hvigor 版本不一致，点 **Sync Now** 让它自动改写 `hvigor/hvigor-config.json5` 即可；
3. 首次打开若提示签署配置，进入 **File → Project Structure → Signing Configs**，
   勾选 **Automatically generate signature**（需登录华为开发者账号），点 OK。

### 第 3 步：运行

1. 用 USB 连接鸿蒙设备（或在 Device Manager 里启动模拟器）；
2. 顶部运行目标选择你的设备，点击 ▶ **Run**；
3. 首次运行会在设备上弹出**定位权限**申请，请选择「允许」——
   VR 寻波功能依赖它，拒绝后该功能会自动退化为沙箱模拟模式（不影响其他功能）。

---

## 三、ArkTS 侧配置说明（决定了哪些网页功能可用）

这些开关都在 `entry/src/main/ets/pages/Index.ets` 里，任何一项关掉都会导致对应功能失效：

| 配置 | 作用 | 关掉会怎样 |
| --- | --- | --- |
| `javaScriptAccess(true)` | 允许执行 JS | 整个应用白屏（前端全靠 JS 渲染） |
| `domStorageAccess(true)` | 允许 localStorage | **登录后会被守卫弹回登录页**（最典型故障） |
| `fileAccess(true)` | 允许加载 rawfile 本地资源 | 页面样式错乱、bundle 加载失败 |
| `onlineImageAccess(true)` | 允许加载 https 图片 | VR 寻波的地形实景图不显示 |
| `geolocationAccess(true)` | 允许 H5 定位 | 「获取当前位置」无效 |
| `darkMode(WebDarkMode.Off)` | 关闭深色模式强制反色 | 示波器界面配色被系统改得面目全非 |
| `onShowFileSelector(...)` | 接管 `<input type="file">` | 「图片识别波形」点击后毫无反应 |
| `onGeolocationShow(...)` | 放行网页定位请求 | 网页拿不到坐标，一直报定位失败 |

权限在 `entry/src/main/module.json5` 中声明：

```json5
"requestPermissions": [
  { "name": "ohos.permission.INTERNET", ... },
  { "name": "ohos.permission.GET_NETWORK_INFO" },
  { "name": "ohos.permission.APPROXIMATELY_LOCATION", ... },
  { "name": "ohos.permission.LOCATION", ... }
]
```

---

## 四、真机验收清单

装好后请按这个顺序点一遍（前 6 项是必过项）：

- [ ] **启动**：应用能打开，先显示「正在加载示波器仿真系统…」再进入界面（不应白屏）
- [ ] **登录页**：自动跳到登录页；点「免登录体验（游客模式）」能直接进入主界面
- [ ] **主面板**：能看到示波器面板、通道 1/2 按钮、微调滑块
- [ ] **波形**：点击「通道 1」后画布上出现波形（说明 Canvas 2D 绘制正常）
- [ ] **微调滑块**：**用手指拖动**「波形显示微调」滑块，波形能跟着变（触摸支持）
- [ ] **三维原理**：点右上角切换到「内部原理」，能看到 CRT 三维模型并可拖动旋转（说明 WebGL 正常）
- [ ] **图片识别**：进入「4. 图片识别」→ 上传图片，应弹出系统图片选择器
- [ ] **VR 寻波**：进入「3. VR 寻波」→ 初始化地图；联网正常时显示地图，离线时提示已切换沙箱模式
- [ ] **旋转屏幕**：横竖屏切换后界面不错乱、三维视图不拉伸
- [ ] **返回键**：在应用内按返回键应先在网页内回退，退无可退才退出应用

---

## 五、验证状态与已知限制

### 已经验证过的（在本机 DevEco Studio 6.0.1 + SDK API 21 + hvigor 6.21.1 上实测）

- ✅ 工程结构静态校验：`npm run harmonyos:verify`，36 项全过
- ✅ **ArkTS 编译通过**：`CompileArkTS` 成功，无语法错误、无弃用警告
- ✅ **HAP 打包成功**：`BUILD SUCCESSFUL`，产物 `entry-default-unsigned.hap` 约 1.25 MB
- ✅ HAP 内容确认：含 `resources/rawfile/www/{index,internal,login}.html`、`js/`、`css/`、`textures/`、
  以及编译后的 `ets/modules.abc`

### 尚未验证的

- ⚠️ **未在真机 / 模拟器上运行过**：本环境没有连接鸿蒙设备，界面实际显示效果需你实机确认。
- ⚠️ **HAP 未签名**：`No signingConfig found for product default` 是正常警告，
  未签名的包不能装到真机，需在 DevEco Studio 里配置自动签名（见第 2 步）。

### 其它限制

1. **网页侧与网络相关的功能会降级**（不影响主体功能）：
   - 百度地图 JS API 需要按域名白名单授权，rawfile 来源通常不在白名单 →
     自动退化为「离线示意地图」（可正常演示点击选点 → 地形 → 波形）；
   - Coze AI 助手挂件在离线或域名被拦截时不显示；
   - VR 寻波的地形实景图在离线时使用内置 SVG 示意图。
2. **Electron 桌面壳无法在鸿蒙上运行**，这是设计如此：`electron-main.js` 与 `packaging/`
   下的脚本只在开发机 / 桌面端使用。鸿蒙端用的是同一份 Web 产物 + ArkWeb 容器。
3. 移动端 GPU 较弱，三维页的像素比上限被自动压到 1.5（桌面端为 2），以换取流畅度。
4. hvigor 会提示「未显式设置 targetSdkVersion」，属于建议项，不影响编译。

---

## 五之二、不用打开 DevEco 图形界面也能构建（已实测）

仓库提供了命令行构建脚本，会自动定位 DevEco Studio 并配好
`DEVECO_SDK_HOME` / `JAVA_HOME` / hvigor 用户目录：

```bash
npm run build:harmonyos      # 构建 Web 产物并同步进 rawfile
npm run harmonyos:build      # 用 hvigor 编译出 HAP
npm run harmonyos:verify     # 静态校验工程结构
```

产物路径：`harmonyos/entry/build/default/outputs/default/entry-default-unsigned.hap`

如果脚本找不到 DevEco Studio（默认会探测 `D:\huawei-devp\DevEco Studio` 等常见路径），
设置环境变量即可：

```powershell
$env:DEVECO_HOME = "你的 DevEco Studio 安装目录"
```

> 注意：命令行构建出来的同样是**未签名** HAP；签名涉及你的开发者证书，
> 只能在 DevEco Studio 里配置（第 2 步）。

---

## 六、排查手册

| 现象 | 原因与处理 |
| --- | --- |
| 打开后停在「页面加载失败」 | 没执行 `npm run build:harmonyos`，`rawfile/www/` 是空的 |
| 页面能开但样式全丢、按钮点不动 | `fileAccess(true)` 被关掉，或 `rawfile/www` 同步不完整（重新同步） |
| 登录后又被弹回登录页 | `domStorageAccess(true)` 没开；本项目已做存储降级与 URL 桥接兜底，但仍建议开启 |
| 三维页提示「不支持 WebGL」 | 设备/模拟器未启用 GPU 加速；换真机测试 |
| 图片上传点击无反应 | `onShowFileSelector` 未生效，检查 `Index.ets` 是否被改动 |
| 定位一直失败 | 应用定位权限未授予，或设备定位服务未开启 |
| 界面整体很小 | 已加 `viewport` 声明；若仍异常，检查是否被系统字体缩放影响 |

调试技巧：`EntryAbility.ets` 里已开启 `setWebDebuggingAccess(true)`，
可在电脑 Chrome 访问 `chrome://inspect` 直接调试网页内的 JS 与查看 `console` 输出；
**正式发布前建议注释掉这一行**。

---

## 七、目录说明

```
harmonyos/
├── AppScope/
│   ├── app.json5                       # 应用级配置（包名、版本、图标）
│   └── resources/base/
│       ├── element/string.json         # 应用名
│       └── media/app_icon.png          # 应用图标
├── entry/                              # 主模块
│   ├── build-profile.json5
│   ├── hvigorfile.ts
│   ├── oh-package.json5
│   └── src/main/
│       ├── module.json5                # 模块配置 + 权限声明
│       ├── ets/
│       │   ├── entryability/EntryAbility.ets   # 入口 Ability
│       │   └── pages/Index.ets                 # Web 容器（核心文件）
│       └── resources/
│           ├── base/element/           # 字符串、颜色
│           ├── base/media/             # 启动图标
│           ├── base/profile/main_pages.json
│           ├── en_US/, zh_CN/          # 多语言
│           └── rawfile/www/            # ← Web 产物同步目录（git 忽略，需自行生成）
├── hvigor/hvigor-config.json5          # 构建工具版本
├── build-profile.json5                 # 工程级构建配置
├── hvigorfile.ts
├── oh-package.json5
└── .gitignore
```
