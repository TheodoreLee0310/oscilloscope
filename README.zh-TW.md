# ShiBoQI · 智波助夢

[简体中文](README.md) · [English](README.en.md) · **繁體中文**

面向電子技術教學的示波器模擬專案，主要開發 **HarmonyOS 原生應用程式**。使用 ArkTS、ArkUI 與 Canvas 實作雙通道波形、觸發和參數調整，並提供本機草稿、離線實驗紀錄和伺服器同步。瀏覽器、ArkWeb 與 Electron 版本保留三維 CRT 原理展示、VR 尋波等擴充功能。

> **開發狀態（2026-11-05）：新工作提交至 `deve`。** 手動推送與拉取程式碼已加入，電腦端邏輯檢查已有涵蓋；這批同步變更尚未完成鴻蒙編譯及裝置驗收，由貢獻者驗證後再決定是否合併至主分支。現有 HAP 不代表包含最新原始碼。

## 選擇執行方式

| 版本 | 位置 | 用途與範圍 |
| --- | --- | --- |
| HarmonyOS 原生版（主要開發方向） | [`harmonyos-native/`](harmonyos-native/) | 純 ArkTS / ArkUI；Canvas 示波器、帳號、自動草稿、離線紀錄、手動同步 |
| HarmonyOS ArkWeb 版 | [`harmonyos/`](harmonyos/) | ArkTS 容器載入 Web 頁面，補充三維 CRT、VR 尋波、地圖與導覽 |
| 瀏覽器版 | [`src/`](src/)、[`public/`](public/) | 在電腦瀏覽器中體驗波形與三維教學；連接後端可儲存帳號實驗 |
| Electron 桌面版 | [`electron-main.js`](electron-main.js) | 封裝 Web 介面；本機頁面可供訪客體驗，帳號功能使用後端網頁 |

原生版目前不包含三維 CRT、VR 尋波或地圖。兩種鴻蒙專案的功能和驗證進度應分別看待。

## 已實作的功能

### 示波器與教學

- 原生雙通道支援正弦、方波、三角、鋸齒、脈衝和雜訊，可調整頻率、振幅、相位、時基、垂直靈敏度與位置。
- 原生顯示模式包括雙軌跡、疊加與李薩如圖形，提供觸發位準、觸發邊緣、格線、輝光和螢幕讀數。
- Web / ArkWeb 另提供自我校準、波形圖片辨識、三維 CRT 結構與電子束展示、VR 尋波、本機知識庫問答和新手導覽。地圖功能需要網路及對應服務設定。

### 原生資料管理

- **帳號與工作階段**：註冊、登入、登出；透過 Asset Store 持久儲存登入資訊。工作階段過期後仍可繼續本機操作，存取伺服器前需重新登入。
- **自動草稿**：參數變更後定期儲存，重新啟動時提示還原或刪除；等待使用者選擇期間不會用預設參數覆蓋草稿。
- **離線紀錄**：本機建立、編輯、還原和刪除，草稿與正式紀錄分開儲存。
- **帳號隔離**：依正規化的伺服器位址與使用者 ID 分區，訪客獨立；將訪客紀錄移入帳號須明確確認。
- **線上實驗管理**：標題與備註編輯、搜尋、分頁；將伺服器實驗匯出至應用程式沙箱檔案，匯入時先預覽再確認寫入伺服器。這項匯入匯出流程需要有效帳號和後端連線。
- **手動同步**：點選後先推送本機修改，成功處理後分頁拉取伺服器變更與刪除；衝突保留本機副本，該副本於下一次手動同步時上傳。目前沒有背景自動同步。

原生實驗參數格式為 **v2**，Web / ArkWeb 為 **v1**。帳號可以共用，實驗格式不能直接互相還原；原生匯入與拉取會略過 v1，不自動轉換參數。

## 快速開始：瀏覽器預覽

需要 **Node.js 22.13 或更新版本**及 npm，後端使用 Node.js 內建 SQLite，無須另外安裝資料庫服務。以下指令從儲存庫根目錄執行：

```bash
git clone --branch deve https://github.com/TheodoreLee0310/oscilloscope.git
cd oscilloscope
npm install
npm run dev:full
```

開啟[開發網頁](http://localhost:8081/login.html)。網頁預設連接埠為 `8081`，後端為 `3000`，開發伺服器會代理 `/api` 請求。可以註冊並登入，也可以選擇訪客體驗；網頁訪客不能向伺服器儲存實驗。

如需使用建置後的網頁：

```bash
npm run build
npm run server
```

開啟[後端提供的網頁](http://127.0.0.1:3000/login.html)。`docs/` 是產生的 Web 成品，修改介面時應編輯 `src/`、`public/` 或 `scripts/`，再重新建置。

## 開發 HarmonyOS 原生應用程式

1. 使用 DevEco Studio 開啟儲存庫中的 `harmonyos-native/` 目錄。
2. 同步專案相依套件。目前專案設定為 HarmonyOS `5.0.0(12)`，需準備對應 SDK。
3. 帳號與同步開發需要在電腦或伺服器上啟動 `npm run server`，在應用程式登入頁填入裝置可存取的服務位址。
4. 貢獻者完成編譯、裝置安裝和互動驗收後，再回報結果與提交編號。

裝置上的 `127.0.0.1` 指向裝置本身。透過區域網路連接電腦時，後端需監聽可存取的位址，應用程式填入電腦的區域網路 IP。Windows PowerShell 範例：

```powershell
$env:SBQ_HOST = '0.0.0.0'
npm run server
```

應用程式服務位址範例：`http://192.168.1.10:3000`，請替換為實際電腦 IP，並允許對應的防火牆連接埠。公開部署使用 HTTPS。

供貢獻者使用的原生建置指令：

```bash
npm run harmonyos:native:build
```

指令碼會尋找 DevEco Studio；自訂安裝位置可透過 `DEVECO_HOME` 指定。預設專案尚未設定簽章：**簽章是以憑證識別應用程式發布者並驗證安裝套件的步驟**，裝置安裝所需設定見[裝置驗收說明](harmonyos-native/DEVICE_ACCEPTANCE.md)。建置成功與裝置驗收通過是兩項不同結果。

ArkWeb 補充版使用獨立專案，建置順序為：

```bash
npm run build:harmonyos
npm run harmonyos:build
```

第一條指令建置並同步 Web 資源，第二條封裝 ArkWeb HAP。詳細說明見 [ArkWeb 專案文件](harmonyos/README.md)。

## 資料儲存與後端設定

| 資料 | 儲存位置與行為 |
| --- | --- |
| 原生工作階段 | 系統 Asset Store；伺服器位址等一般設定存入 preferences |
| 原生草稿與離線紀錄 | 應用程式 `filesDir` 下的 JSON 檔案；原子替換、版本標記及歸屬驗證 |
| 本機檔案異常 | 損壞內容隔離；歸屬不符或不支援的舊格式保留原檔案，不自動移入目前帳號 |
| 帳號與伺服器實驗 | 預設 `server/data/oscilloscope.sqlite`；資料庫不提交 Git |
| 原生匯出檔案 | 應用程式沙箱 `files/exports/`；系統檔案選擇器仍待完善 |

密碼使用加鹽 scrypt 雜湊，伺服器儲存工作階段權杖摘要；預設工作階段有效期為 7 天。實驗儲存的是參數快照，不包含原始圖片、地圖位置、問答內容或三維場景。

| 環境變數 | 預設值 | 用途 |
| --- | --- | --- |
| `SBQ_HOST` | `127.0.0.1` | 後端監聽位址 |
| `SBQ_API_PORT` | `3000` | 後端連接埠；開發代理也讀取此值 |
| `SBQ_DB_PATH` | `server/data/oscilloscope.sqlite` | 資料庫檔案路徑 |

啟動後端會執行資料庫結構遷移。升級正式資料庫前應備份；預設資料庫可使用：

```bash
node server/backup-db.js
```

自訂資料庫使用 `node server/backup-db.js <source.sqlite> [backup.sqlite]`。備份指令碼使用 SQLite 一致性快照；同步版本、冪等性、衝突和刪除標記規則見[同步協定與遷移說明](server/SYNC_PROTOCOL.md)，介面設定見[後端說明](server/README.md)。

完整帳號功能需要持續執行後端，並保留資料庫磁碟。GitHub Pages 等靜態託管只能提供靜態體驗，不能執行這裡的帳號與實驗 API。

## 原始碼入口

```text
harmonyos-native/           ArkTS / ArkUI 原生主專案
  entry/src/main/ets/
    pages/                 登入、示波器與紀錄介面
    model/                 波形數學、取樣與觸發
    view/                  Canvas 繪製及控制項
    service/               工作階段、本機儲存、草稿、實驗與同步
harmonyos/                 ArkWeb 補充專案
src/                       Web 介面與三維場景
public/                    HTML 範本與靜態資源
scripts/                   Web 波形、校準及知識庫邏輯
server/                    HTTP API、SQLite、遷移及邏輯測試
shared/                    實驗參數格式與驗證
packaging/                 Web、Electron、HarmonyOS 建置工具
docs/                      產生的 Web 成品
NEXT_TASKS.md              後續任務與歷史進度
```

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev:full` | 同時啟動後端與 Web 開發伺服器 |
| `npm run dev` / `npm run server` | 分別啟動 Web 開發伺服器 / 後端 |
| `npm run build` | 將 Web 建置至 `docs/` |
| `npm run harmonyos:native:build` | 建置原生 HarmonyOS 專案 |
| `npm run build:harmonyos` / `npm run harmonyos:build` | 依序準備 Web 資源、封裝 ArkWeb 專案 |
| `npm run electron` | 使用 Electron 開啟現有 Web 成品 |
| `npm run dist` | 建置並封裝目前平台的桌面程式 |
| `npm test` | 執行平台、地圖及後端 / 原生服務邏輯測試 |
| `npm run test:user-data` / `npm run test:smoke` | Web 帳號流程 / Electron 冒煙檢查 |

## 目前限制與貢獻方式

- `deve` 是目前開發與協作驗證分支；新貢獻從此分支開始，Pull Request 以 `deve` 為目標。主分支合併等待驗證結果。
- 電腦端服務測試包含移除型別的 ArkTS 原始碼、平台替身和暫存 SQLite；它們不能取代 DevEco 編譯或鴻蒙裝置測試。目前同步變更的交接見[貢獻者驗證清單](harmonyos-native/CONTRIBUTOR_TESTING.md)。
- 背景自動同步、資料庫更換或回復後的游標重新協商、密碼變更與工作階段管理尚待完成；電子郵件 / 簡訊密碼復原尚無傳送服務。
- 系統檔案選擇器、螢幕鍵盤、小螢幕版面配置、觸控及實際網路切換仍需裝置驗證。回報時請附上分支、提交編號、裝置 / 系統版本和重現步驟。
- 請勿提交資料庫、帳號權杖、簽章憑證或私密金鑰。後續安排見[任務清單](NEXT_TASKS.md)，其中末尾的最新紀錄優先於早期規劃。

這三份 README 提供簡體中文、英文和繁體中文的專案說明；應用程式介面及詳細工程文件目前主要使用簡體中文。
