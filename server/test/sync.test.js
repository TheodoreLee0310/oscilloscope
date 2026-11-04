const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../index');

/**
 * 同步协议集成测试（临时数据库，绝不接触 server/data 下的真实数据）
 *
 * 覆盖需求里的优先项：
 *   重复创建 / 响应丢失后重试 / 重复更新 / 双客户端冲突 / 冲突请求重放 /
 *   墓碑重放 / 账号隔离 / 旧数据库迁移后数据完整性
 * 以及「修改与删除冲突不能让已删除记录复活」。
 */

const createNativeState = () => ({
  version: 2,
  parameters: {
    displayMode: 'dual', timeDiv: 0.005, triggerEnabled: true, triggerLevel: 0,
    triggerRising: true, runTimeSec: 0,
    ch1: { enabled: true, waveType: 'sine', frequency: 50, amplitude: 2, voltsDiv: 1, offsetDiv: 0, phaseDeg: 0 },
    ch2: { enabled: true, waveType: 'square', frequency: 100, amplitude: 2, voltsDiv: 1, offsetDiv: 0, phaseDeg: 90 }
  }
});

test('sync protocol: idempotency, version conflict, tombstone and migration', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-sync-test-'));
  const dbPath = path.join(directory, 'sync.sqlite');
  let server;
  let base;

  t.after(async () => {
    if (server && server.listening) await new Promise(resolve => server.close(resolve));
    for (const name of fs.readdirSync(directory)) fs.rmSync(path.join(directory, name), { force: true });
    fs.rmdirSync(directory);
  });

  async function start(options = {}) {
    server = createServer({ dbPath, ...options });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
  }

  async function call(route, method = 'GET', body, token) {
    const response = await fetch(base + '/api' + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }

  const sync = (token, payload) => call('/sync/apply', 'POST', payload, token);
  let token;
  let otherToken;
  let opSeq = 0;
  const nextOp = () => 'op-' + (++opSeq).toString().padStart(6, '0') + '-' + Math.random().toString(36).slice(2, 8);

  /* ------------------------------------------------------------ 迁移 */

  await t.test('旧数据库迁移：补列、回填、数据完整', async () => {
    // 手工建一个"旧版本"库（没有同步字段）
    const seed = new DatabaseSync(dbPath);
    seed.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nickname TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE experiments (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
        title TEXT NOT NULL, notes TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX experiments_user ON experiments(user_id, created_at);`);
    seed.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)')
      .run(1, 'olduser', '老用户', 'hash', 'salt', '2026-01-01T00:00:00.000Z');
    seed.prepare('INSERT INTO experiments VALUES(?,?,?,?,?,?)')
      .run('legacy-1', 1, '迁移前的实验', '备注', JSON.stringify(createNativeState()), '2026-01-02T00:00:00.000Z');
    seed.close();

    await start();

    const migrated = new DatabaseSync(dbPath);
    const columns = migrated.prepare('PRAGMA table_info(experiments)').all().map(c => c.name);
    for (const name of ['client_id', 'rev', 'updated_at', 'deleted', 'last_op_id']) {
      assert.ok(columns.includes(name), '应补上列 ' + name);
    }
    const row = migrated.prepare('SELECT * FROM experiments WHERE id=?').get('legacy-1');
    assert.equal(row.title, '迁移前的实验', '既有数据不能被改写');
    assert.equal(row.notes, '备注');
    assert.equal(row.rev, 1, '迁移后默认版本应为 1');
    assert.equal(row.deleted, 0);
    assert.equal(row.client_id, null, '老数据没有 clientId');
    assert.equal(row.updated_at, row.created_at, 'updated_at 用 created_at 回填');
    const ops = migrated.prepare("SELECT name FROM sqlite_master WHERE name='sync_operations'").get();
    assert.ok(ops, '应创建幂等表');
    migrated.close();

    // 迁移后的库仍可正常注册与同步
    assert.equal((await call('/auth/register', 'POST',
      { username: 'syncer', password: 'password-123', nickname: '同步用户' })).status, 201);
    token = (await call('/auth/login', 'POST', { username: 'syncer', password: 'password-123' })).data.token;
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal((await call('/auth/register', 'POST',
      { username: 'other', password: 'password-123', nickname: '另一个' })).status, 201);
    otherToken = (await call('/auth/login', 'POST', { username: 'other', password: 'password-123' })).data.token;
  });

  /* ------------------------------------------------------------ 创建 */

  await t.test('创建：成功并返回服务器版本', async () => {
    const response = await sync(token, {
      operationId: nextOp(), type: 'create', clientId: 'client-alpha', baseServerRev: 0,
      title: '第一条', notes: '备注一', state: createNativeState()
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'applied');
    assert.equal(response.data.created, true);
    assert.equal(response.data.item.rev, 1);
    assert.equal(response.data.item.clientId, 'client-alpha');
    assert.equal(response.data.item.deleted, false);
    assert.equal(response.data.item.stateVersion, 2);
  });

  await t.test('重复创建：同一 clientId 换 operationId 不会再建一行', async () => {
    const response = await sync(token, {
      operationId: nextOp(), type: 'create', clientId: 'client-alpha', baseServerRev: 0,
      title: '重复创建', notes: '', state: createNativeState()
    });
    assert.equal(response.data.status, 'applied');
    assert.equal(response.data.created, false, '应被 (user_id, client_id) 吸收');
    assert.equal(response.data.item.title, '第一条', '不能覆盖已有内容');
    assert.equal((await call('/experiments', 'GET', undefined, token)).data.total, 1);
  });

  await t.test('响应丢失后重试：同一 operationId 返回同一结果且只执行一次', async () => {
    const operationId = nextOp();
    const payload = {
      operationId, type: 'create', clientId: 'client-lost', baseServerRev: 0,
      title: '丢响应的记录', notes: '', state: createNativeState()
    };
    const first = await sync(token, payload);
    const second = await sync(token, payload); // 客户端没收到响应，原样重试
    assert.deepEqual(second.data, first.data, '重放必须返回同一份结果');
    assert.equal((await call('/experiments', 'GET', undefined, token)).data.total, 2);
  });

  /* ------------------------------------------------------------ 更新 */

  await t.test('重复更新：同一 operationId 只让版本 +1 一次', async () => {
    const operationId = nextOp();
    const payload = {
      operationId, type: 'update', clientId: 'client-alpha', baseServerRev: 1,
      title: '改名', notes: '改备注', state: createNativeState()
    };
    const first = await sync(token, payload);
    assert.equal(first.data.status, 'applied');
    assert.equal(first.data.item.rev, 2);
    const replay = await sync(token, payload);
    assert.deepEqual(replay.data, first.data, '重放不应再改一次');
    const row = await call('/experiments/' + first.data.item.id, 'GET', undefined, token);
    assert.equal(row.data.item.title, '改名');
  });

  await t.test('版本不匹配：冲突时不覆盖服务器数据', async () => {
    // 模拟两个客户端：B 仍以为服务器是 rev 1
    const conflict = await sync(token, {
      operationId: nextOp(), type: 'update', clientId: 'client-alpha', baseServerRev: 1,
      title: 'B 客户端的修改', notes: '', state: createNativeState()
    });
    assert.equal(conflict.data.status, 'conflict');
    assert.equal(conflict.data.item.rev, 2, '返回服务器当前版本供客户端处理');
    assert.equal(conflict.data.item.title, '改名', '服务器内容不能被覆盖');

    const row = await call('/experiments/' + conflict.data.item.id, 'GET', undefined, token);
    assert.equal(row.data.item.title, '改名');
  });

  await t.test('冲突请求重放：返回同一冲突结果，不产生额外修改', async () => {
    const operationId = nextOp();
    const payload = {
      operationId, type: 'update', clientId: 'client-alpha', baseServerRev: 1,
      title: 'B 再试一次', notes: '', state: createNativeState()
    };
    const first = await sync(token, payload);
    const replay = await sync(token, payload);
    assert.equal(first.data.status, 'conflict');
    assert.deepEqual(replay.data, first.data);
    const row = await call('/experiments/' + first.data.item.id, 'GET', undefined, token);
    assert.equal(row.data.item.rev, 2, '重放冲突不能改动版本');
    assert.equal(row.data.item.title, '改名');
  });

  await t.test('非法参数被拒绝', async () => {
    const bad = await sync(token, { operationId: 'x', type: 'create', clientId: 'abc', baseServerRev: 0 });
    assert.equal(bad.status, 400);
    const badType = await sync(token, { operationId: 'op-12345678', type: 'upsert', clientId: 'abc-def', baseServerRev: 0 });
    assert.equal(badType.status, 400);
    const badRev = await sync(token, { operationId: 'op-12345678', type: 'update', clientId: 'abc-def', baseServerRev: -1 });
    assert.equal(badRev.status, 400);
    assert.equal((await call('/sync/apply', 'POST', {}, undefined)).status, 401, '未登录不能同步');
  });

  /* ------------------------------------------------------------ 墓碑 */

  await t.test('删除：版本匹配才生效，墓碑重放幂等', async () => {
    const first = await sync(token, {
      operationId: nextOp(), type: 'delete', clientId: 'client-alpha', baseServerRev: 2
    });
    assert.equal(first.data.status, 'applied');
    assert.equal(first.data.item.deleted, true);
    assert.equal(first.data.item.rev, 3);

    const replay = await sync(token, {
      operationId: nextOp(), type: 'delete', clientId: 'client-alpha', baseServerRev: 2
    });
    assert.equal(replay.data.status, 'applied', '已删除时再删应为成功');
    assert.equal(replay.data.item.rev, 3, '重放不能再次递增版本');

    const listed = await call('/experiments', 'GET', undefined, token);
    assert.equal(listed.data.items.some(i => i.id === first.data.item.id), false, '墓碑不应出现在列表');
  });

  await t.test('修改与删除冲突：已删除记录不能被复活', async () => {
    const update = await sync(token, {
      operationId: nextOp(), type: 'update', clientId: 'client-alpha', baseServerRev: 2,
      title: '试图复活', notes: '', state: createNativeState()
    });
    assert.equal(update.data.status, 'deleted');
    assert.equal(update.data.item.deleted, true);
    assert.equal(update.data.item.title, '改名', '内容不能被旧数据覆盖');
    assert.equal(update.data.item.rev, 3);
  });

  await t.test('删除时版本不匹配：判为冲突而不是删除', async () => {
    const created = await sync(token, {
      operationId: nextOp(), type: 'create', clientId: 'client-beta', baseServerRev: 0,
      title: '待删记录', notes: '', state: createNativeState()
    });
    const id = created.data.item.id;
    const updated = await sync(token, {
      operationId: nextOp(), type: 'update', clientId: 'client-beta', baseServerRev: 1,
      title: '改过一次', notes: '', state: createNativeState()
    });
    assert.equal(updated.data.item.rev, 2);

    const stale = await sync(token, {
      operationId: nextOp(), type: 'delete', clientId: 'client-beta', baseServerRev: 1
    });
    assert.equal(stale.data.status, 'conflict', '旧版本删除必须失败');
    const row = await call('/experiments/' + id, 'GET', undefined, token);
    assert.equal(row.data.item.title, '改过一次');
  });

  /* ------------------------------------------------------------ 隔离 */

  await t.test('账号隔离：不同用户的相同 clientId 各自独立', async () => {
    const mine = await sync(token, {
      operationId: nextOp(), type: 'create', clientId: 'shared-client', baseServerRev: 0,
      title: '我的记录', notes: '', state: createNativeState()
    });
    assert.equal(mine.data.created, true);

    const theirs = await sync(otherToken, {
      operationId: nextOp(), type: 'create', clientId: 'shared-client', baseServerRev: 0,
      title: '别人的记录', notes: '', state: createNativeState()
    });
    assert.equal(theirs.data.created, true, '唯一约束是按用户划分的');
    assert.notEqual(theirs.data.item.id, mine.data.item.id);

    const theirsList = await call('/experiments', 'GET', undefined, otherToken);
    assert.equal(theirsList.data.total, 1);
    assert.equal(theirsList.data.items[0].title, '别人的记录');

    const cross = await sync(otherToken, {
      operationId: nextOp(), type: 'update', clientId: 'shared-client', baseServerRev: 0,
      title: '越权改', notes: '', state: createNativeState()
    });
    assert.equal(cross.data.status, 'conflict', '别人只能改到自己的那条（版本对不上）');
  });

  await t.test('重启后幂等记录与版本仍然有效', async () => {
    await new Promise(resolve => server.close(resolve));
    await start();
    const replay = await sync(token, {
      operationId: 'op-fixed-0001', type: 'delete', clientId: 'client-beta', baseServerRev: 2
    });
    // 用固定 operationId 先执行一次，再重启后重放
    assert.ok(['applied', 'conflict'].includes(replay.data.status));
    const firstData = replay.data;
    await new Promise(resolve => server.close(resolve));
    await start();
    const again = await sync(token, {
      operationId: 'op-fixed-0001', type: 'delete', clientId: 'client-beta', baseServerRev: 2
    });
    assert.deepEqual(again.data, firstData, '重启后同一 operationId 仍返回缓存结果');
  });
});
