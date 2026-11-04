# 智波助梦 · 鸿蒙原生（ArkTS）版示波器

本目录是一个**纯 ArkTS + ArkUI 原生**的鸿蒙工程：波形的采样、触发、栅格、荧光辉光、示波器读数（OSD）
全部由 ArkTS 实现并绘制在 ArkUI 的 `Canvas` 组件上，**不含 WebView / ArkWeb，不加载任何网页**。

它与仓库根目录的 `harmonyos/`（ArkWeb 容器方案）是**两条并行的路线**，不是替代关系。

---

## 一、两条鸿蒙路线怎么选

| | `harmonyos/`（ArkWeb 容器） | `harmonyos-native/`（本目录，原生 ArkTS） |
| --- | --- | --- |
| 实现方式 | ArkTS 外壳 + `Web` 组件加载 `rawfile/www` | 纯 ArkTS：`Canvas` 绘制 + 自研采样/触发引擎 |
| 覆盖功能 | **完整**：Three.js 电子束 CRT、VR 寻波、百度地图、导览、登录 | 示波器核心：双踪/叠加/李萨如、6 种波形、触发、时基、垂直灵敏度、OSD 读数、登录（HTTP） |
| 复用现有前端代码 | 100% 复用（同一份构建产物） | 0%（波形算法按原 `scripts/waveDrawer.js` 的数学重写） |
| 是否"原生鸿蒙开发" | 一般：核心逻辑仍在 JS 里 | 是：全部 `.ets`，课程/评审核查可直接看源码 |
| 三维 CRT 场景 | 有 | 无（用 2D 栅格 + 辉光模拟屏幕） |
| 体积 | 需带上整个 Web 产物 | 极轻，HAP 约 300 KB |
| 适合场景 | 演示完整产品、保留 VR 与地图功能 | 强调鸿蒙原生实现、性能敏感、需要二次开发 |

**建议**：答辩/评审强调"鸿蒙原生开发"时用本目录；强调"完整复刻网页版所有三维功能"时用 `harmonyos/`。
两者共用同一套示波器数学（采样点、触发相位、时基换算），波形细节一致。

---

## 二、功能

- **三种显示模式**：双踪（CH1 基线 1/4、CH2 基线 3/4）／叠加（电压相加）／李萨如（X=CH1、Y=CH2）
- **六种波形**：正弦、方波、三角、锯齿、脉冲、噪声
- **触发系统**：自动/上升沿/下降沿，触发电平可调，触发后波形静止（相位锁定），带黄色虚线电平线与沿标记
- **通道参数**：频率、峰值电压、垂直灵敏度 V/div、垂直位置、CH2 相对 CH1 的相位差
- **时基**：1~500 ms/div 连续可调
- **屏幕读数（OSD）**：CH1/CH2 波形名与频率、时基、频率比或 Vpp、触发状态，带半透明底板
- **绘制细节**：主/次栅格、中心十字轴、径向渐变屏幕底色、`shadowBlur` 荧光辉光、从右向左的扫描方向
- **登录**：`@kit.NetworkKit` 的 `http` 调用后端 `/api/auth/login`，失败可"游客模式进入"

## 三、目录

```
harmonyos-native/
├── AppScope/app.json5                 # bundleName: com.example.oscilloscope
├── entry/src/main/ets/
│   ├── common/ScopeConstants.ets      # 调色板、栅格布局、参数上下限
│   ├── model/WaveMath.ets             # 波形函数、gcd/化简、数字格式化
│   ├── model/ScopeTypes.ets           # ChannelParams / ScopeSetup / TraceBuffer
│   ├── model/ScopeEngine.ets          # 采样：buildTrace / buildOverlay / buildLissajous / findTriggerPhase
│   ├── view/ScopeRenderer.ets         # Canvas 绘制：栅格、波形、触发线、OSD
│   ├── view/ScopeSlider.ets           # 参数滑条组件
│   ├── service/AuthService.ets        # HTTP 登录
│   └── pages/Index.ets, ScopePage.ets # 登录页 / 示波器主界面
└── README.md
```

## 四、构建

要求：DevEco Studio 5.0+、HarmonyOS SDK 5.0.0（API 12）和配套 JDK。

**方式一（推荐）**：DevEco Studio 直接 `File → Open` 本目录，等 Sync 完成后 `Run`。

**方式二（命令行）**：

```bash
export DEVECO_SDK_HOME="/path/to/DevEco Studio/sdk"
export NODE_HOME="/path/to/DevEco Studio/tools/node"
export PATH="$NODE_HOME:$PATH"
export NODE_PATH="$PWD/node_modules"
export HVIGOR_USER_HOME="$PWD/.hvigor-home"

node "/path/to/DevEco Studio/tools/hvigor/hvigor/bin/hvigor.js" \
  --mode module -p product=default assembleHap --no-daemon
```

产物：`entry/build/default/outputs/default/entry-default-unsigned.hap`。以下安装命令需先配置签名并使用签名产物：

```bash
hdc install -r <配置签名后生成的HAP路径>
hdc shell aa start -a EntryAbility -b com.example.oscilloscope
```

> `build-profile.json5` 的兼容及目标 SDK 均为 `"5.0.0(12)"`。本工程未配置 `signingConfigs`；真机安装需要配置签名。

## 五、已验证

- 当前新增账号/实验功能已通过 DevEco SDK 编译，产物约 387 KiB；有 API 废弃提示，无编译错误。
- 以下旧版本模拟器记录不代表本次新增功能验收；本轮没有连接设备，新增界面与网络仍需实机验证。
- 模型层（`WaveMath` / `ScopeEngine` / `ScopeTypes`）用 SDK 自带 `tsc --strict` 单独编译后跑过 23 条断言：
  6 种波形幅值、`simplifyRatio(50,100)=[1,2]`、`findTriggerPhase` 过零与 1 V 上升沿相位、
  触发锁定时窗口相位误差 0.000000000、正弦 Vpp=4.000/Vrms=1.413、叠加 Vpp=8.000、李萨如首尾闭合

## 六、已知限制

- 没有 Three.js 的三维电子枪与 CRT 外壳（这是 `harmonyos/` 路线保留的部分）
- 仓库已提供 `server/` 后端，可注册、登录、保存、恢复、删除原生实验；连接方式见 [INSTALL.md](INSTALL.md)。默认 `http://127.0.0.1:3000` 需要设备到电脑的端口映射，不能直接视为电脑地址。
- 未做余辉拖尾（残影）动画

## 账号与实验记录

直接运行根目录 `npm run harmonyos:native:build` 可自动定位本机 DevEco 并构建。注册、登录、保存和恢复使用仓库后端；服务器地址会记忆，密码不会写入端上持久化存储。原生参数使用 v2，网页使用 v1，暂不相互恢复。安装步骤见 [INSTALL.md](INSTALL.md)。
