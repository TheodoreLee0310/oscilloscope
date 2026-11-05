# ShiBoQI · 智波助梦

**简体中文** · [English](README.en.md) · [繁體中文](README.zh-TW.md)

面向电子技术教学的示波器仿真项目，主要开发 **HarmonyOS 原生应用**。使用 ArkTS、ArkUI 与 Canvas 实现双通道波形、触发和参数调节，并提供本机草稿、离线实验记录和服务器同步。浏览器、ArkWeb 与 Electron 版本保留三维 CRT 原理演示、VR 寻波等扩展功能。

> **开发状态（2026-11-05）：新工作提交到 `deve`。** 手动推送与拉取代码已加入，电脑侧逻辑检查已有覆盖；这批同步改动尚未完成鸿蒙编译及设备验收，由贡献者验证后再决定是否合并主分支。已有 HAP 不代表包含最新源码。

## 选择运行方式

| 版本 | 位置 | 用途与范围 |
| --- | --- | --- |
| HarmonyOS 原生版（主要开发方向） | [`harmonyos-native/`](harmonyos-native/) | 纯 ArkTS / ArkUI；Canvas 示波器、账号、自动草稿、离线记录、手动同步 |
| HarmonyOS ArkWeb 版 | [`harmonyos/`](harmonyos/) | ArkTS 容器加载 Web 页面，补充三维 CRT、VR 寻波、地图与导览 |
| 浏览器版 | [`src/`](src/)、[`public/`](public/) | 在电脑浏览器中体验波形与三维教学；连接后端可保存账号实验 |
| Electron 桌面版 | [`electron-main.js`](electron-main.js) | 打包 Web 界面；本地页面可游客体验，账号功能使用后端网页 |

原生版当前不包含三维 CRT、VR 寻波或地图。两种鸿蒙工程的功能和验证进度应分别看待。

## 已实现的功能

### 示波器与教学

- 原生双通道支持正弦、方波、三角、锯齿、脉冲和噪声，可调整频率、幅值、相位、时基、垂直灵敏度与位置。
- 原生显示模式包括双踪、叠加与李萨如图形，提供触发电平、触发沿、栅格、辉光和屏幕读数。
- Web / ArkWeb 另提供自检校准、波形图片识别、三维 CRT 结构与电子束演示、VR 寻波、本地知识库问答和新手导览。地图功能依赖网络及对应服务配置。

### 原生数据管理

- **账号与会话**：注册、登录、退出；会话通过 Asset Store 持久化。会话过期后仍可继续本机操作，访问服务器前需重新登录。
- **自动草稿**：参数变化后定期保存，重启时提示恢复或删除；等待用户选择期间不会用默认参数覆盖草稿。
- **离线记录**：本机创建、编辑、恢复和删除，草稿与正式记录分开保存。
- **账号隔离**：按规范化服务器地址与用户 ID 分区，游客独立；游客记录迁入账号须明确确认。
- **在线实验管理**：标题与备注编辑、搜索、分页；导出服务器实验到应用沙箱文件，导入先预览再确认写入服务器。这条导入导出流程需要有效账号和后端连接。
- **手动同步**：点击后先推送本机修改，成功处理后分页拉取服务器变更与删除；冲突保留本机副本，该副本在下一次手动同步时上传。当前没有后台自动同步。

原生实验参数格式为 **v2**，Web / ArkWeb 为 **v1**。账号可以共用，实验格式不能直接互相恢复；原生导入与拉取会跳过 v1，不自动转换参数。

## 快速开始：浏览器预览

需要 **Node.js 22.13 或更高版本**和 npm，后端使用 Node.js 内置 SQLite，无需单独安装数据库服务。以下命令从仓库根目录运行：

```bash
git clone --branch deve https://github.com/TheodoreLee0310/oscilloscope.git
cd oscilloscope
npm install
npm run dev:full
```

打开 [开发网页](http://localhost:8081/login.html)。网页默认端口为 `8081`，后端为 `3000`，开发服务器会代理 `/api` 请求。可以注册并登录，也可以选择游客体验；网页游客不能向服务器保存实验。

如需使用构建后的网页：

```bash
npm run build
npm run server
```

打开 [后端提供的网页](http://127.0.0.1:3000/login.html)。`docs/` 是生成的 Web 产物，修改界面时应编辑 `src/`、`public/` 或 `scripts/`，再重新构建。

## 开发 HarmonyOS 原生应用

1. 使用 DevEco Studio 打开仓库中的 `harmonyos-native/` 目录。
2. 同步工程依赖。当前工程配置为 HarmonyOS `5.0.0(12)`，需准备对应 SDK。
3. 账号与同步开发需要在电脑或服务器上启动 `npm run server`，在应用登录页填写设备可访问的服务地址。
4. 贡献者完成编译、设备安装和交互验收后，再反馈结果与提交号。

设备上的 `127.0.0.1` 指向设备本身。通过局域网连接电脑时，后端需监听可访问的地址，应用填写电脑的局域网 IP。Windows PowerShell 示例：

```powershell
$env:SBQ_HOST = '0.0.0.0'
npm run server
```

应用服务地址示例：`http://192.168.1.10:3000`，请替换为实际电脑 IP，并允许对应防火墙端口。公网部署使用 HTTPS。

供贡献者使用的原生构建命令：

```bash
npm run harmonyos:native:build
```

脚本会查找 DevEco Studio；自定义安装位置可通过 `DEVECO_HOME` 指定。默认工程未配置签名：**签名是用证书标识应用发布者与校验安装包的步骤**，设备安装所需配置见[设备验收说明](harmonyos-native/DEVICE_ACCEPTANCE.md)。构建成功与设备验收通过是两项不同结果。

ArkWeb 补充版使用独立工程，构建顺序为：

```bash
npm run build:harmonyos
npm run harmonyos:build
```

第一条构建并同步 Web 资源，第二条打包 ArkWeb HAP。详细说明见 [ArkWeb 工程文档](harmonyos/README.md)。

## 数据保存与后端配置

| 数据 | 保存位置与行为 |
| --- | --- |
| 原生会话 | 系统 Asset Store；服务器地址等普通设置存入 preferences |
| 原生草稿与离线记录 | 应用 `filesDir` 下的 JSON 文件；原子替换、版本标记及归属校验 |
| 本机文件异常 | 损坏内容隔离；归属不符或不支持的旧格式保留原文件，不自动迁入当前账号 |
| 账号与服务器实验 | 默认 `server/data/oscilloscope.sqlite`；数据库不提交 Git |
| 原生导出文件 | 应用沙箱 `files/exports/`；系统文件选择器仍待完善 |

密码使用加盐 scrypt 哈希，服务器保存会话令牌摘要；默认会话有效期为 7 天。实验保存的是参数快照，不包含原始图片、地图位置、问答内容或三维场景。

| 环境变量 | 默认值 | 作用 |
| --- | --- | --- |
| `SBQ_HOST` | `127.0.0.1` | 后端监听地址 |
| `SBQ_API_PORT` | `3000` | 后端端口；开发代理也读取此值 |
| `SBQ_DB_PATH` | `server/data/oscilloscope.sqlite` | 数据库文件路径 |

启动后端会执行数据库结构迁移。升级真实数据库前应备份；默认数据库可使用：

```bash
node server/backup-db.js
```

自定义数据库使用 `node server/backup-db.js <source.sqlite> [backup.sqlite]`。备份脚本使用 SQLite 一致性快照；同步版本、幂等、冲突和墓碑规则见[同步协议与迁移说明](server/SYNC_PROTOCOL.md)，接口配置见[后端说明](server/README.md)。

完整账号功能需要持续运行后端，并保留数据库磁盘。GitHub Pages 等静态托管只能提供静态体验，不能运行这里的账号与实验 API。

## 代码入口

```text
harmonyos-native/           ArkTS / ArkUI 原生主工程
  entry/src/main/ets/
    pages/                 登录、示波器与记录界面
    model/                 波形数学、采样与触发
    view/                  Canvas 绘制及控件
    service/               会话、本机存储、草稿、实验与同步
harmonyos/                 ArkWeb 补充工程
src/                       Web 界面与三维场景
public/                    HTML 模板与静态资源
scripts/                   Web 波形、校准及知识库逻辑
server/                    HTTP API、SQLite、迁移及逻辑测试
shared/                    实验参数格式与校验
packaging/                 Web、Electron、HarmonyOS 构建工具
docs/                      生成的 Web 产物
NEXT_TASKS.md              后续任务与历史进度
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev:full` | 同时启动后端与 Web 开发服务器 |
| `npm run dev` / `npm run server` | 分别启动 Web 开发服务器 / 后端 |
| `npm run build` | 构建 Web 到 `docs/` |
| `npm run harmonyos:native:build` | 构建原生 HarmonyOS 工程 |
| `npm run build:harmonyos` / `npm run harmonyos:build` | 依次准备 Web 资源、打包 ArkWeb 工程 |
| `npm run electron` | 使用 Electron 打开已有 Web 产物 |
| `npm run dist` | 构建并打包当前平台桌面程序 |
| `npm test` | 运行平台、地图及后端 / 原生服务逻辑测试 |
| `npm run test:user-data` / `npm run test:smoke` | Web 账号流程 / Electron 冒烟检查 |

## 当前限制与贡献方式

- `deve` 是当前开发与协作验证分支；新贡献从该分支开始，Pull Request 以 `deve` 为目标。主分支合并等待验证结果。
- 电脑侧服务测试包含 ArkTS 源码剥类型、平台替身和临时 SQLite；它们不能替代 DevEco 编译或鸿蒙设备测试。当前同步改动的交接见[贡献者验证清单](harmonyos-native/CONTRIBUTOR_TESTING.md)。
- 后台自动同步、数据库更换或回滚后的游标重新协商、密码修改与会话管理尚待完成；邮件 / 短信找回密码尚无发送通道。
- 系统文件选择器、软键盘、小屏布局、触控及实际网络切换仍需设备验证。请在反馈中附上分支、提交号、设备 / 系统版本和复现步骤。
- 不要提交数据库、账号令牌、签名证书或私钥。后续安排见[任务单](NEXT_TASKS.md)，其中末尾的最新记录优先于早期计划。

这三个 README 提供简体中文、英文和繁体中文的项目说明；应用界面目前主要使用简体中文。
