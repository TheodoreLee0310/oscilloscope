# 同步协议与数据库迁移

本文档对应 `POST /api/sync/apply` 与 `experiments` 表的结构升级。
本轮只做**用户手动触发**的同步；后台自动同步、下拉拉取、离线冲突副本回传等后续再加。

## 1. 数据库迁移

服务器启动时自动执行，**幂等**，可重复运行：

| 变更 | 说明 |
|---|---|
| `experiments.client_id TEXT` | 客户端稳定标识，配合 `user_id` 做幂等键 |
| `experiments.rev INTEGER NOT NULL DEFAULT 1` | 服务器版本号，每次成功修改 +1 |
| `experiments.updated_at TEXT` | 最后修改时间，旧数据用 `created_at` 回填 |
| `experiments.deleted INTEGER NOT NULL DEFAULT 0` | 删除墓碑 |
| `experiments.last_op_id TEXT` | 最后一次操作的 id，便于排查 |
| `UNIQUE INDEX experiments_client ON experiments(user_id, client_id)` | 防重复创建（按用户隔离） |
| `sync_operations(user_id, operation_id, response, created_at)` | 操作幂等缓存，保留 7 天 |

原则与边界：

- **不删除、不重写既有行**，只加列与索引；旧记录的 `client_id` 为 `NULL`（唯一索引允许多个 NULL）。
- 迁移是"就地升级"，所以**对真实库操作前请先备份**：
  `server/data/oscilloscope.sqlite`（可能还有 `-wal`、`-shm`）。
- 所有自动化测试都使用临时目录里的数据库，不会触碰 `server/data`。

## 2. 两个版本号

| 字段 | 归属 | 含义 |
|---|---|---|
| `rev` | 客户端 `LocalRecord` | 本机修改次数，仅用于本机判断"上传期间是否又被改" |
| `baseServerRev` | 客户端 `LocalRecord` | 最后一次确认的**服务器**版本；0 表示服务器还没有这条 |
| `rev` | 服务器 `experiments` | 服务器版本，成功修改后 +1 |

**不能用本地 `rev` 判断服务端冲突**：本地改了几次与服务器改了几次没有可比性。
冲突只由服务器用 `baseServerRev == rev` 原子比较后判定。

## 3. 请求与响应

```http
POST /api/sync/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "operationId": "op-...",      // 稳定操作 id，重试必须复用
  "type": "create|update|delete",
  "clientId": "c-...",
  "baseServerRev": 0,            // create 为 0；update/delete 传最后确认的服务器版本
  "title": "...", "notes": "...", "state": { "version": 2, ... }
}
```

响应 `status`：

| status | 含义 | 客户端动作 |
|---|---|---|
| `applied` | 已生效（`created` 表示是否真的新建） | 回写 `remoteId`、`baseServerRev`，转 `synced` |
| `conflict` | 版本不匹配，服务器未改动 | 本地内容存成**新 clientId 的冲突副本**，原记录采纳服务器版本 |
| `deleted` | 服务器已删除该记录 | 不复活；本地内容转副本，原记录标记已删除 |
| `not-found` | 服务器没有这条 | 回到待创建，下次重新创建 |

## 4. 幂等

- **创建**：`(user_id, client_id)` 唯一索引吸收重复创建，第二次返回 `created: false`。
- **更新 / 删除 / 冲突**：同一 `(user_id, operationId)` 第二次请求直接返回首次的缓存结果，
  不会重复执行。
- 因此客户端"请求发出但响应丢失"时，可以用**同一个 operationId** 原样重试。
- 客户端约定：内容变化时生成新的 `pendingOpId`；成功或冲突后才清空。

## 5. 冲突与墓碑

- 冲突**不覆盖**：服务器保持原值并返回当前 `rev`。
- 双方数据都保留：客户端把本次想上传的内容写成新 `clientId` 的副本，`conflictOfId` 记录来源。
- 墓碑优先：`deleted=1` 的记录收到 `update` 返回 `deleted`，不会被旧数据复活；
  `delete` 重放返回 `applied` 且版本不再递增。
- 删除未上传的记录在本机直接移除；已同步的记录打墓碑，同步成功后墓碑从本机清除。

## 6. 验收范围

- 协议与迁移：`server/test/sync.test.js`（14 项，含旧库迁移、重复创建、响应丢失重试、
  重复更新、双客户端冲突、冲突重放、墓碑重放、账号隔离、重启后幂等仍有效）。
- 客户端契约：`server/test/native-sync.test.js`（8 项，真实 ArkTS 客户端 + 真实后端）。
- 设备实测仍未进行；以上均为电脑侧验证。
