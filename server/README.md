# 用户数据后端

使用 Node.js 内置 HTTP 服务和 SQLite（Node.js 22.13+，推荐 24）。没有额外数据库依赖。

## 启动

```powershell
cd D:\new\shi-bo-qi
npm run build
npm run server
```

打开 http://127.0.0.1:3000/login.html 注册并登录，主页面点击「我的实验」。开发时使用 `npm run dev:full`，页面端口为 8081。两个地址拥有各自的浏览器登录状态，但使用同一个数据库。

## 配置与数据

- `SBQ_HOST`：默认 `127.0.0.1`。
- `SBQ_API_PORT`：默认 `3000`，开发代理也读取此变量。
- `SBQ_DB_PATH`：数据库完整路径，默认 `server/data/oscilloscope.sqlite`。
- 密码是随机盐加 scrypt 哈希；数据库只保存会话令牌的 SHA-256 摘要。
- 会话有效期 7 天；退出仅撤销当前会话。账号密码找回与管理后台尚未实现。
- 注册与登录按连接来源 IP 限制为 15 分钟 30 次；开发代理及反向代理后用户会共享代理 IP 限额。目前不信任客户端提供的转发 IP。
- 每用户最多 500 条记录；标题 80 字符、备注 2000 字符、JSON 请求体 32 KiB。
- 备份前停止服务，复制整个数据库目录；不要把数据库放在 docs 或上传到 Git。
- 公网运行需 HTTPS 反向代理，并保留原始 Host。接口只接受同源浏览器请求；不允许任意 CORS 来源。

## 接口

除注册、登录、健康检查以外，均需 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务健康检查 |
| POST | `/api/auth/register` | `{username,password,nickname}` → `{user}` |
| POST | `/api/auth/login` | `{username,password}` → `{token,user}` |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/auth/logout` | 撤销当前会话 |
| GET | `/api/experiments` | 当前用户记录列表（不包含参数正文） |
| POST | `/api/experiments` | `{title,notes,state}` → 新记录 |
| GET | `/api/experiments/:id` | 恢复所需的完整记录 |
| DELETE | `/api/experiments/:id` | 删除当前用户的记录 |

`state` 版本 1 用于网页/ArkWeb，版本 2 用于纯 ArkTS 原生应用，两者只接受 `shared/experiment-state.js` 中定义的参数，不能写入任意 Vue 字段。图像、地图对象、浏览器状态和运行时画布不入库。

网页、ArkWeb 在线模式和原生 ArkTS 共用 `/api/auth` 账号接口。原生实验使用 v2，保留独立双通道波形；不同版本的实验不可直接互相恢复。ArkWeb 本地 rawfile 和 Electron file:// 页面仍可游客体验。

## 验证

```bash
npm test
npm run build
npm run test:user-data
npm run test:smoke
```

后端与网页数据测试均使用临时独立数据库，不会读写真实用户记录。测试覆盖重启持久化、跨账号访问拒绝、过期与撤销会话、参数校验，以及浏览器注册、保存、刷新恢复、重新登录、删除。

Node.js SQLite API 参考：https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html
