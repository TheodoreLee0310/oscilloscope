# 设备验收runbook（签名 → 安装 → 按清单实测）

> 状态：**尚未开始设备实测**。截至 2026-11-04 22:52，本机三项前置条件均不满足（见下）。
> 本文档把"拿到设备后要做的每一步"固定下来，避免临场遗漏。

## 0. 当前阻塞项（已核实）

| 前置条件 | 实测结果 | 影响 |
|---|---|---|
| 已连接设备 | `hdc list targets` → `[Empty]` | 无法安装与验收 |
| 模拟器系统镜像 | `DevEco Studio\plugins\platform-images\lib` 为空 | 模拟器无法启动 |
| 签名配置 | `build-profile.json5` → `"signingConfigs": []` | 产物是 unsigned HAP，设备拒绝安装 |

三项都需要**你本机登录华为账号后操作**，我无法代为完成（涉及账号与证书签发）。

## 1. 打通设备（三选一）

**A. 真机（推荐，最接近实际教学场景）**

1. 手机/平板：设置 → 关于本机 → 连续点击版本号进入开发者模式。
2. 设置 → 系统和更新 → 开发人员选项 → 打开「USB 调试」，连接电脑后选「传输文件」。
3. 手机上弹出授权框 → 允许。
4. 验证：`hdc list targets` 应显示设备序列号。

**B. 模拟器**

1. DevEco Studio → Tools → Device Manager → Local Emulator。
2. 首次使用需登录华为账号，下载一个系统镜像（数 GB）。
3. 创建并启动，`hdc list targets` 出现 `emulator-xxxx`。

**C. 无线调试**（设备与电脑同网）

```
hdc tconn <设备IP>:<端口>
```

## 2. 配置签名

三条路径，按可用性选：

1. **DevEco 自动签名**（最省事，需登录）
   File → Project Structure → Signing Configs → 勾选「Automatically generate signature」→ 登录华为账号 → Apply。
   之后 `signingConfigs` 会自动写入，`hvigor assembleHap` 产出已签名 HAP。

2. **手动证书 + Profile**（团队/CI 常用）
   需要：`.p12` 密钥库（可用 `keytool` 生成）、`.cer` 证书、`.p7b` Profile。
   三者都绑定 `bundleName = com.example.oscilloscope`；**debug Profile 还必须包含目标设备的 UDID**，
   否则安装报签名/PROFILE 不匹配。

3. **OpenHarmony 本地自签**（仅限 OpenHarmony 设备或部分模拟器）
   用 SDK 的 `hap-sign-tool.jar` 自签。**HarmonyOS NEXT 真机通常不接受自签应用**，
   不要把它当成正式验收路径。

验证签名是否生效：`hdc install` 不再报 `9568320 / signature verify failed` 一类错误。

## 3. 安装与启动

```powershell
$hdc = 'D:\huawei-devp\DevEco Studio\sdk\default\openharmony\toolchains\hdc.exe'
$hap = 'harmonyos-native\entry\build\default\outputs\default\entry-default-signed.hap'

& $hdc list targets
& $hdc install -r $hap
& $hdc shell aa start -a EntryAbility -b com.example.oscilloscope
& $hdc shell hilog | Select-String 'oscilloscope'      # 抓日志
& $hdc uninstall com.example.oscilloscope               # 卸载
```

也可以用 `harmonyos-native\install-and-log.ps1`（本仓库提供，自动做这三步）。

## 4. 验收清单

每项填「实际结果」，不要只写"通过"。发现问题的记录到第 6 节。

### 4.1 账号与会话（对应第 2 步）

| # | 操作 | 预期 | 实际 |
|---|---|---|---|
| 1 | 注册新账号 | 提示成功并进入主界面 | |
| 2 | 杀进程后重开 | 自动恢复会话，不需要重新登录 | |
| 3 | 用已过期令牌（服务器把 session 置过期）打开 | 仍能进入、能看本机记录；点同步时提示重新登录 | |
| 4 | A 账号保存记录 → 退出 → B 账号登录 | B 看不到 A 的本机记录与草稿 | |
| 5 | 切换服务器地址后重开 | 分区随服务器变化，旧分区数据不被串用 | |

### 4.2 本机记录与文件（对应第 3 步）

| # | 操作 | 预期 | 实际 |
|---|---|---|---|
| 6 | 调参 → 杀进程 → 重开 | 顶部出现"发现上次未保存的现场"，可恢复/删除 | |
| 7 | 恢复提示出现后不动，等 10 秒 | 不自动覆盖旧草稿（提示仍在） | |
| 8 | 存为本机记录 → 改名/改备注 → 删除 | 列表即时更新；未同步的删除直接消失 | |
| 9 | 导出到文件 | 显示路径与大小；文件内容不含 token/密码 | |
| 10 | 导入含 v1 的文件 | 显示「有效/跳过/失败」数量，v1 被跳过 | |
| 11 | 软键盘弹出 | 输入框不被遮挡，可滚动到可见 | |
| 12 | 小屏 / 横竖屏切换 | 布局不重叠、按钮可点 | |
| 13 | 返回键 | 从主界面返回不会丢草稿 | |
| 14 | 文件路径输入 | 能输入、能粘贴；键盘类型合理 | |

> 说明：当前导入用「手填路径 + 选最近导出」，**没有系统文件选择器**。这是已知限制，
> 验收时按"手填路径可完成导入"判定；若必须支持系统选择器，另开任务。

### 4.3 手动同步（对应第 4 步）

| # | 操作 | 预期 | 实际 |
|---|---|---|---|
| 15 | 登录后点「同步到服务器」 | 提示"成功 N 条"，记录显示「已同步」 | |
| 16 | 断网后点同步 | 提示失败；记录仍是「待同步」，operationId 不变 | |
| 17 | 恢复网络再点同步 | 成功，且服务器只有一条（幂等） | |
| 18 | 同步进行中立刻修改该记录 | 本次成功后该记录仍为「待同步」 | |
| 19 | 另一台设备改同一条后再同步 | 本机保留冲突副本（来源 clientId 可见），原记录变服务器版本 | |
| 20 | 另一台设备删除该条后本机再改并同步 | 服务器仍是墓碑；本机修改转副本，不复活 | |
| 21 | 删除已同步记录并同步 | 墓碑上报成功，本机列表不再出现 | |

### 4.4 稳定性

| # | 操作 | 预期 | 实际 |
|---|---|---|---|
| 22 | 连续杀进程 5 次 | 每次都能恢复，无白屏/崩溃 | |
| 23 | 飞行模式重启应用 | 可进入、可看本机数据 | |
| 24 | 电量/内存压力下（可选） | 无 ANR、无闪退 | |

## 5. 数据准备与备份

设备实测会打到真实后端，动手前先处理数据：

- **停服备份（最稳）**：停掉服务 → 复制 `server/data/oscilloscope.sqlite`（连同 `-wal`/`-shm`）→ 启动。
- **不停服的一致性备份**：

  ```powershell
  node server/backup-db.js
  # 或指定路径
  node server/backup-db.js server/data/oscilloscope.sqlite D:\backup\osc-20261104.sqlite
  ```

  它用 SQLite 的 `VACUUM INTO` 生成一致快照。**不要**在服务运行时直接复制 .sqlite + WAL 当备份。
- **隔离环境**（推荐给验收）：用临时库跑一台独立服务，避免污染真实数据。

  ```powershell
  $env:SBQ_DB_PATH = 'D:\tmp\osc-acceptance.sqlite'
  npm run start
  ```

## 6. 记录格式

验收完成后按下面格式回填，不要只写"通过"：

```
设备：<型号>（<序列号>）
系统：HarmonyOS <版本> / API <版本>
应用：<bundleName>，versionName <x.y.z>，提交 <git short hash>
签名：自动签名 / 手动证书（证书名）
服务端：<地址>，提交 <hash>，数据库 <是否用临时库>
结论：<n>/24 通过；失败项：<编号 + 现象 + 日志片段>
```

失败项一律先修再复测，不要以"偶现"结案。
