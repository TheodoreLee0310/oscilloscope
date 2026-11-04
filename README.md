# ShiBoQI · 智波助梦

> 基于 WebGL 的智能示波器交互式虚拟仿真系统

一套面向电子技术教学的交互式示波器仿真系统：既可以在浏览器中通过 2D 画布操作面板与观察波形，也可以用 Three.js 呈现示波器内部结构的三维工作原理，并支持通过 Electron 打包为桌面应用。

## 功能特性

- **自检校准**：以固定参数的方波为基准，通过微调滑块完成校准，理解示波器的校准原理。
- **标准测量**：6 种波形（正弦、方波、三角、锯齿、噪声、脉冲），双通道支持独立显示 / 同向叠加 / 垂直叠加。
- **李萨如图形**：垂直叠加模式下调整两通道的频率比与相位差，观察李萨如图形变化。
- **触发系统**：自动 / 常规 / 单次触发，可调触发电平、触发源与触发斜率，稳定波形显示。
- **图片识别波形**：上传或截取波形图片，由内置算法识别波形类型与参数，并一键应用到示波器。
- **VR 寻波**：结合百度地图定位，把地形特征映射为对应波形（山脉→锯齿波、水面→正弦波、平原→低频正弦波等）。
- **三维内部原理**：Three.js 构建的 CRT 结构演示，含分解视图、爆炸动画、标签系统与电子束 / 荧光屏仿真。
- **内置 AI 助手**：基于本地知识库的问答助手，解答系统使用相关问题。
- **新手指引**：分步引导教程（Tour Guide），首次进入主界面自动弹出。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 视图层 | Vue.js 2.7.16 |
| 三维渲染 | Three.js 0.177.0 |
| 动画 | TWEEN.js |
| 参数面板 | dat.GUI |
| 构建工具 | Webpack 5 + webpack-dev-server 5 |
| 桌面端 | Electron 28 + electron-builder |
| 鸿蒙端 | ArkWeb（Web 组件）+ ArkTS 容器，见 [`harmonyos/`](harmonyos/README.md) |

## 目录结构

```
├── public/                    # HTML 模板与静态资源
│   ├── external.html          # → 生成 index.html（面板 / 示波器）
│   ├── internal.html          # → 生成 internal.html（三维内部原理）
│   ├── login.html             # → 输出 login.html（登录 / 注册）
│   ├── styles.css             # 主样式
│   └── textures/              # 贴图
├── src/                       # 前端源码
│   ├── main.js                # 三维原理页入口
│   ├── external.js            # 面板 / 示波器页入口（Vue 实例）
│   ├── components/            # 三维组件（电子束、荧光屏、CRT 外壳、标签、分解视图等）
│   ├── controllers/           # GUI / UI 控制器
│   ├── materials/             # 材质管理
│   ├── widgets/               # 页面切换控件、引导教程（Tour Guide）
│   ├── geometry/ utils/ examples/
│   └── config.json            # 三维场景配置
├── scripts/                   # 波形与业务逻辑模块
│   ├── waveDrawer.js          # 波形绘制
│   ├── lissajousDrawer.js     # 李萨如图形
│   ├── calibrationLogic.js    # 校准逻辑
│   ├── deepseekService.js     # 波形 / 图像识别算法（本地计算，无网络请求）
│   ├── knowledgeBase.js       # 本地知识库（AI 助手问答）
│   ├── WaveformUtilities.js   # 波形工具
│   ├── StepAdjustmentUtils.js # 步进调节工具
│   └── constants.js           # 常量
├── server/                    # HTTP API、SQLite 数据库与后端测试
├── shared/                    # 前后端共用的实验参数校验
├── docs/                      # 构建产物（npm run build 输出，已纳入版本管理）
├── packaging/                 # Electron 打包脚本与配置
├── electron-main.js           # Electron 主进程入口
├── webpack.config.js
└── package.json
```

## 快速开始

环境要求：完整前后端使用 **Node.js ≥ 22.13（推荐 Node.js 24）**、npm。SQLite 随 Node.js 提供，无需安装 MySQL。

```bash
npm install
npm run dev:full
```

开发页面默认运行在 <http://localhost:8081>，后端运行在 <http://127.0.0.1:3000>。开发服务器将 `/api` 请求转发到后端。

只体验已构建版本：运行 `npm run build`、`npm run server`，然后打开 <http://127.0.0.1:3000/login.html>。

> **注意**：`index.html` 与 `internal.html` 都已接入登录守卫，**未登录会自动跳转到 `login.html`**。首次使用请先注册一个账号，详见下文「登录与用户系统」。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:full` | 同时启动后端和开发网页 |
| `npm run server` | 启动后端并提供 docs 网页（端口 3000） |
| `npm run dev` | 只启动开发网页（端口 8081，热更新；账号功能需要后端） |
| `npm run build` | 生产构建，输出到 `docs/` |
| `npm run electron` | 以 Electron 运行已构建产物 |
| `npm run electron:dev` | 同时启动开发服务器与 Electron |
| `npm run dist` | 打包当前平台桌面安装包 |
| `npm run dist:win` / `dist:mac` / `dist:linux` | 打包指定平台 |
| `npm run build:harmonyos` | 构建 Web 产物并同步进鸿蒙工程（`harmonyos/.../rawfile/www`） |
| `npm run harmonyos:sync` | 只做同步（要求 `docs/` 已存在） |
| `npm test` | 平台、地图与后端测试（含隔离的临时数据库） |
| `npm run test:user-data` | 浏览器注册、登录、保存、刷新恢复和删除测试 |
| `npm run test:smoke` | 用 Electron 真实内核跑一遍构建产物做冒烟测试 |

## 鸿蒙（HarmonyOS）应用

本项目的 Web 前端**不依赖 Node / Electron**，因此可以原样装进鸿蒙的 ArkWeb（Web 组件）中运行。
仓库内的 [`harmonyos/`](harmonyos/README.md) 是一个完整的 DevEco Studio 工程：

```bash
npm run build:harmonyos      # 1. 构建并同步 Web 产物到 rawfile
# 2. 用 DevEco Studio 5.0+ 打开 harmonyos/ 目录，等待 Sync
# 3. 连接鸿蒙设备，点 Run
```

- 完整的构建步骤、真机验收清单与排查手册：**[`harmonyos/README.md`](harmonyos/README.md)**
- 兼容性评估、已改造项与待实机验证项：**[`HARMONYOS.md`](HARMONYOS.md)**

> Electron 桌面壳（`electron-main.js`）无法在鸿蒙上运行，这是平台定位决定的；
> 鸿蒙端走的是「同一份 Web 产物 + ArkWeb 容器」的路线。

### 两条鸿蒙路线

仓库里有两个互相补充、而不是互相替代的鸿蒙工程：

| 目录 | 路线 | 适用场合 |
| --- | --- | --- |
| [`harmonyos/`](harmonyos/README.md) | ArkWeb 容器 + ArkTS 外壳，100% 复用 Web 产物 | 要完整的三维 CRT、VR 寻波、地图与导览；演示与验收「功能完整」 |
| [`harmonyos-native/`](harmonyos-native/README.md) | **纯 ArkTS/ArkUI 原生**：`Canvas` 绘制 + 自研采样/触发引擎 | 要「原生鸿蒙开发」、轻量高性能、便于二次开发；HAP 约 300 KB |

`harmonyos-native/` 把采样、触发、栅格、辉光与 OSD 全部用 `.ets` 重写，不加载任何网页；
两套实现共用同一套波形数学（采样点、触发相位、时基换算），波形细节一致。

## 页面说明

| 页面 | 模板 | 产物 | 说明 |
| --- | --- | --- | --- |
| 登录 / 注册 | `public/login.html` | `login.html` | 自包含静态页，用户登录与注册 |
| 面板 / 示波器 | `public/external.html` | `index.html` | 2D 波形操作面板（Vue 2） |
| 内部原理 | `public/internal.html` | `internal.html` | 三维 CRT 原理演示（Three.js） |

两个主页面由 HtmlWebpackPlugin 从 `public/` 下的模板生成；页面右上角的切换控件可在「外部（面板 / 示波器）」与「内部原理」之间跳转。

> 提示：VR 寻波功能依赖百度地图 API，需要联网才能正常加载地图。

## 登录与用户系统

现在使用真实后端账号与 SQLite 持久化，详细配置见 [server/README.md](server/README.md)。

1. 在登录页注册账号（密码 8–128 位）并登录。
2. 调整波形，点击页头「我的实验」，填写标题与备注，点击「保存当前实验」。
3. 下次登录后打开「我的实验」，点击「恢复参数」即可继续，也可以删除旧记录。

保存内容包括双通道参数、波形类型、时基、电压、相位、触发和校准设置。图片原文件、地图位置、AI 对话和 3D 场景暂不保存。每个账号最多保存 500 条实验，保存采用手动快照，不自动覆盖旧记录。

密码通过 scrypt 加盐哈希存储；会话在 7 天后过期，退出登录会撤销当前会话。接口只允许访问当前用户的实验。游客仍可体验所有仿真页面，但不能保存实验。旧版浏览器 Mock 账号不会自动迁入数据库，需要重新注册。

数据库默认位于 `server/data/oscilloscope.sqlite`，不进入 Git。关闭服务后备份整个 `server/data/` 文件夹即可保留账号与实验；再次启动仍能读取已有数据。

## 部署

`npm run build` 将网页输出到 `docs/`。账号与保存功能需要运行 `npm run server`，由同一个地址提供网页和 `/api`。对公网部署时使用 HTTPS 反向代理并保留原始 Host；数据库目录需使用持久化磁盘。

GitHub Pages 只能提供静态游客体验，不能运行此后端或保存账号实验。若只部署静态体验：进入仓库 **Settings → Pages**，将 Source 设为 `master` 分支的 `/docs` 目录即可。

## 参与贡献

1. Fork 本仓库
2. 新建 `Feat_xxx` 分支
3. 提交代码
4. 新建 Pull Request

## 多语言

- 简体中文（本文件）
- [English](Readme_en.md)
