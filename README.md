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
├── docs/                      # 构建产物（npm run build 输出，已纳入版本管理）
├── packaging/                 # Electron 打包脚本与配置
├── electron-main.js           # Electron 主进程入口
├── webpack.config.js
└── package.json
```

## 快速开始

环境要求：**Node.js ≥ 18**、npm。

```bash
npm install
npm run dev
```

开发服务器默认运行在 <http://localhost:8081>，并会自动打开 `index.html`。

> **注意**：`index.html` 与 `internal.html` 都已接入登录守卫，**未登录会自动跳转到 `login.html`**。首次使用请先注册一个账号，详见下文「登录与用户系统」。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（端口 8081，热更新） |
| `npm run build` | 生产构建，输出到 `docs/` |
| `npm run electron` | 以 Electron 运行已构建产物 |
| `npm run electron:dev` | 同时启动开发服务器与 Electron |
| `npm run dist` | 打包当前平台桌面安装包 |
| `npm run dist:win` / `dist:mac` / `dist:linux` | 打包指定平台 |

## 页面说明

| 页面 | 模板 | 产物 | 说明 |
| --- | --- | --- | --- |
| 登录 / 注册 | `public/login.html` | `login.html` | 自包含静态页，用户登录与注册 |
| 面板 / 示波器 | `public/external.html` | `index.html` | 2D 波形操作面板（Vue 2） |
| 内部原理 | `public/internal.html` | `internal.html` | 三维 CRT 原理演示（Three.js） |

两个主页面由 HtmlWebpackPlugin 从 `public/` 下的模板生成；页面右上角的切换控件可在「外部（面板 / 示波器）」与「内部原理」之间跳转。

> 提示：VR 寻波功能依赖百度地图 API，需要联网才能正常加载地图。

## 登录与用户系统

当前为**前端 Mock 模式**，无需后端即可跑通完整流程：

- 账号数据存放于浏览器 `localStorage`，键名 `sbq_mock_users`
- 登录态存放于 `sbq_token`（令牌）与 `sbq_user`（用户信息）
- 主界面右上角显示当前用户昵称，并提供「退出登录」

后端（Express + MySQL）尚在规划中。接入后只需修改 `public/login.html` 中的两个开关即可切换到真实接口：

```js
var API_BASE = 'http://localhost:3000/api'; // 后端服务地址
var USE_MOCK = false;                       // 关闭 Mock，改为请求真实后端
```

预留的接口约定：

| 方法 | 路径 | 请求体 | 响应 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{ username, password, nickname }` | `{ token, user }` |
| POST | `/api/auth/login` | `{ username, password }` | `{ token, user }` |

## 部署

`npm run build` 会把完整可发布的站点输出到 `docs/`（含 `login.html`、bundle、样式、静态资源与贴图）。可将其部署到任意静态服务器。

若要使用 GitHub Pages：进入仓库 **Settings → Pages**，将 Source 设为 `master` 分支的 `/docs` 目录即可。

## 参与贡献

1. Fork 本仓库
2. 新建 `Feat_xxx` 分支
3. 提交代码
4. 新建 Pull Request

## 多语言

- 简体中文（本文件）
- [English](Readme_en.md)
