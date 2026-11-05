const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');
const { once } = require('node:events');
const { createServer } = require('../index');

/**
 * 验证真实的 ArkTS 同步客户端（SyncService + RecordsService）打到真实后端。
 * 网络层用 fetch 适配，文件系统用内存替身，服务器用临时数据库。
 *
 * 重点验证客户端的契约：
 *   - 成功后才回写 remoteId / baseServerRev / syncState；
 *   - 冲突时保留双方数据（本地内容转成新 clientId 的副本）并采纳服务器版本；
 *   - 服务器已删除时不复活，本地内容转副本；
 *   - 待同步操作的 operationId 成功后被清空，新修改会生成新的。
 */
test('native sync client against real server', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-nsync-'));
  const dbPath = path.join(work, 'sync.sqlite');
  const filesDir = '/data/app';
  let server;
  let base;
  let token;

  t.after(async () => {
    if (server && server.listening) await new Promise(resolve => server.close(resolve));
    for (const name of fs.readdirSync(work)) fs.rmSync(path.join(work, name), { recursive: true, force: true });
    fs.rmdirSync(work);
  });

  // ---- 内存文件系统 ----
  fs.writeFileSync(path.join(work, 'kit_CoreFileKit.mjs'), `
    export const __files = new Map();
    export const __dirs = new Set();
    export const __fault = { rename: false, suffix: '' };

    export const fileIo = {
      OpenMode: { CREATE: 64, READ_WRITE: 2, TRUNC: 512 },
      accessSync: p => __files.has(p) || __dirs.has(p),
      mkdirSync: p => { __dirs.add(p); },
      openSync: p => ({ fd: p }),
      writeSync: (fd, text) => { __files.set(fd, text); return text.length; },
      closeSync: () => {},
      readTextSync: p => { if (!__files.has(p)) { throw new Error('ENOENT'); } return __files.get(p); },
      renameSync: (a, b) => { if (__fault.rename || (__fault.suffix && b.endsWith(__fault.suffix))) { __fault.rename = false; __fault.suffix = ''; throw new Error('disk failure'); } if (!__files.has(a)) { throw new Error('ENOENT'); } __files.set(b, __files.get(a)); __files.delete(a); },
      unlinkSync: p => { __files.delete(p); }
    };
  `);

  // ---- fetch 版网络层 ----
  fs.writeFileSync(path.join(work, 'kit_NetworkKit.mjs'), `
    export const __control = { afterResponse: null, pageLimit: 0 };
    export const http = {
      RequestMethod: { GET: 'GET', POST: 'POST', PUT: 'PUT', DELETE: 'DELETE' },
      HttpDataType: { STRING: 0 },
      createHttp() {
        return {
          async request(url, options) {
            if (__control.pageLimit && url.includes('/sync/changes?')) url = url.replace('limit=100', 'limit=' + __control.pageLimit);
            const response = await fetch(url, {
              method: options.method,
              headers: options.header,
              body: options.extraData === undefined || options.method === 'GET' ? undefined : options.extraData
            });
            const result = { result: await response.text(), responseCode: response.status };
            const hook = __control.afterResponse;
            __control.afterResponse = null;
            if (hook) await hook();
            return result;
          },
          destroy() {}
        };
      }
    };
  `);

  const root = path.resolve(__dirname, '../../harmonyos-native/entry/src/main/ets');
  for (const [outName, rel] of Object.entries({
    LocalStore: 'service/LocalStore',
    RecordsService: 'service/RecordsService',
    DraftService: 'service/DraftService',
    ScopeTypes: 'model/ScopeTypes',
    ApiService: 'service/ApiService',
    SyncService: 'service/SyncService'
  })) {
    const code = fs.readFileSync(path.join(root, rel + '.ets'), 'utf8');
    const output = stripTypeScriptTypes(code)
      .replace(/from ['"](@kit\.[A-Za-z]+)['"]/g, (_m, full) => `from './kit_${full.split('.')[1]}.mjs'`)
      .replace(/from ['"](?:\.\.\/[a-z]+\/|\.\/)([A-Za-z0-9_]+)['"]/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(work, outName + '.mjs'), output);
  }

  const { RecordsService, newOperationId } = await import(pathToFileURL(path.join(work, 'RecordsService.mjs')));
  const { __control } = await import(pathToFileURL(path.join(work, 'kit_NetworkKit.mjs')));
  const { __fault } = await import(pathToFileURL(path.join(work, 'kit_CoreFileKit.mjs')));
  const { SyncService } = await import(pathToFileURL(path.join(work, 'SyncService.mjs')));

  server = createServer({ dbPath });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;

  const call = async (route, method, body, auth) => {
    const response = await fetch(base + '/api' + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };

  const nativeState = () => ({
    version: 2,
    parameters: {
      displayMode: 'dual', timeDiv: 0.005, triggerEnabled: true, triggerLevel: 0,
      triggerRising: true, runTimeSec: 0,
      ch1: { enabled: true, waveType: 'sine', frequency: 50, amplitude: 2, voltsDiv: 1, offsetDiv: 0, phaseDeg: 0 },
      ch2: { enabled: true, waveType: 'square', frequency: 100, amplitude: 2, voltsDiv: 1, offsetDiv: 0, phaseDeg: 90 }
    }
  });

  assert.equal((await call('/auth/register', 'POST', { username: 'client', password: 'password-123', nickname: '客户端' })).status, 201);
  token = (await call('/auth/login', 'POST', { username: 'client', password: 'password-123' })).data.token;

  const records = new RecordsService(filesDir);
  const SERVER = base;
  const USER = 1;

  await t.test('首次同步：创建成功后回写 remoteId 与服务器版本', async () => {
    const made = records.create(SERVER, USER, '离线实验', '备注', JSON.stringify(nativeState().parameters));
    assert.ok(made.pendingOpId.startsWith('op-'), '创建时就应有待同步操作 id');
    assert.equal(made.baseServerRev, 0);

    const outcome = await SyncService.syncAll(filesDir, SERVER, USER, token);
    assert.equal(outcome.applied, 1, outcome.message);
    assert.equal(outcome.failed, 0);

    const synced = records.list(SERVER, USER)[0];
    assert.equal(synced.syncState, 'synced');
    assert.ok(synced.remoteId.length > 0, '应记录服务器 id');
    assert.equal(synced.baseServerRev, 1, '应记录服务器版本');
    assert.equal(synced.pendingOpId, '', '成功后清空待同步操作 id');

    const listed = await call('/experiments', 'GET', undefined, token);
    assert.equal(listed.data.total, 1);
  });

  await t.test('再次修改：用 update 同步，版本前进', async () => {
    const current = records.list(SERVER, USER)[0];
    assert.equal(records.update(SERVER, USER, current.clientId, '改过的标题', '', current.setupJson), true);
    const edited = records.list(SERVER, USER)[0];
    assert.equal(edited.syncState, 'pending');
    assert.notEqual(edited.pendingOpId, current.pendingOpId, '内容变了必须换新的操作 id');

    const outcome = await SyncService.syncAll(filesDir, SERVER, USER, token);
    assert.equal(outcome.applied, 1, outcome.message);
    const synced = records.list(SERVER, USER)[0];
    assert.equal(synced.baseServerRev, 2);
    assert.equal(synced.syncState, 'synced');
  });

  await t.test('双客户端冲突：本地内容转副本，原记录采纳服务器版本', async () => {
    // 模拟另一台设备把服务器改到 rev 3
    const current = records.list(SERVER, USER)[0];
    const otherState = nativeState(); otherState.parameters.ch1.frequency = 333;
    const other = await call('/sync/apply', 'POST', {
      operationId: newOperationId(), type: 'update', clientId: current.clientId,
      baseServerRev: 2, title: '另一台设备改的', notes: '', state: otherState
    }, token);
    assert.equal(other.data.status, 'applied');
    assert.equal(other.data.item.rev, 3);

    // 本机基于 rev 2 再改一次，同步时应冲突
    assert.equal(records.update(SERVER, USER, current.clientId, '本机改的', '本机备注', current.setupJson), true);
    const outcome = await SyncService.syncAll(filesDir, SERVER, USER, token);
    assert.equal(outcome.conflicts, 1, outcome.message);

    const all = records.list(SERVER, USER);
    assert.equal(all.length, 2, '冲突必须保留双方数据');
    const original = all.find(r => r.clientId === current.clientId);
    const copy = all.find(r => r.conflictOfId === current.clientId);
    assert.ok(copy, '应有一条冲突副本');
    assert.equal(original.title, '另一台设备改的', '原记录采纳服务器版本');
    assert.equal(JSON.parse(original.setupJson).ch1.frequency, 333, '完整采纳服务器波形参数');
    assert.equal(JSON.parse(copy.setupJson).ch1.frequency, 50, '冲突副本保留本机波形');
    assert.equal(original.baseServerRev, 3);
    assert.equal(original.syncState, 'synced');
    assert.equal(original.lastSyncResult, 'conflict');
    assert.equal(copy.title, '本机改的', '副本保留本机的修改');
    assert.equal(copy.syncState, 'local', '副本等待后续同步');

    const listed = await call('/experiments', 'GET', undefined, token);
    assert.equal(listed.data.total, 1, '冲突不会在服务器上新建副本，服务器内容保持原样');
    assert.equal(listed.data.items[0].title, '另一台设备改的');
  });

  await t.test('服务器已删除：不复活，本地内容转副本', async () => {
    const original = records.list(SERVER, USER).find(r => r.baseServerRev === 3 && r.conflictOfId === '');
    // 服务器端删除（用正确版本，模拟另一台设备删除）
    const removed = await call('/sync/apply', 'POST', {
      operationId: newOperationId(), type: 'delete', clientId: original.clientId,
      baseServerRev: original.baseServerRev
    }, token);
    assert.equal(removed.data.status, 'applied');

    // 本机不知道，仍然编辑后同步
    assert.equal(records.update(SERVER, USER, original.clientId, '删除后又改', '', original.setupJson), true);
    const outcome = await SyncService.syncAll(filesDir, SERVER, USER, token);
    assert.equal(outcome.deletedOnServer, 1, outcome.message);

    const all = records.list(SERVER, USER);
    const copy = all.find(r => r.title === '删除后又改');
    assert.ok(copy, '本地修改应保留为副本而不是消失');
    const tomb = all.find(r => r.clientId === original.clientId);
    assert.equal(tomb, undefined, '服务器已删除的记录不应再出现在本机列表');

    const item = await call('/experiments/' + original.remoteId + '?includeDeleted=1', 'GET', undefined, token);
    assert.equal(item.data.item.deleted, true, '服务器上仍是墓碑，不能被复活');
    assert.equal(item.data.item.title, '另一台设备改的', '内容没有被旧数据覆盖');
  });

  await t.test('删除墓碑：同步成功后本机不再保留墓碑', async () => {
    // 先把前面产生的冲突副本同步上去
    await SyncService.syncAll(filesDir, SERVER, USER, token);
    const target = records.list(SERVER, USER).find(r => r.syncState === 'synced');
    assert.ok(target, '前置：应有一条已同步记录');
    const result = records.remove(SERVER, USER, target.clientId);
    assert.equal(result.kind, 'tombstoned');
    assert.equal(records.list(SERVER, USER).some(r => r.clientId === target.clientId), false);

    const outcome = await SyncService.syncAll(filesDir, SERVER, USER, token);
    assert.equal(outcome.applied, 1, outcome.message);
    assert.equal(records.listPending(SERVER, USER).length, 0, '墓碑上报后不应留在待同步队列');
  });

  await t.test('游客不能同步，未登录也不能同步', async () => {
    records.create(SERVER, 0, '游客记录', '', JSON.stringify(nativeState().parameters));
    const guest = await SyncService.syncAll(filesDir, SERVER, 0, token);
    assert.equal(guest.applied, 0);
    assert.match(guest.message, /游客/);

    const noToken = await SyncService.syncAll(filesDir, SERVER, USER, '');
    assert.equal(noToken.applied, 0);
    assert.match(noToken.message, /登录/);
  });

  await t.test('账号隔离：另一个账号看不到也同步不到', async () => {
    assert.equal((await call('/auth/register', 'POST', { username: 'other2', password: 'password-123', nickname: '另一个' })).status, 201);
    const otherToken = (await call('/auth/login', 'POST', { username: 'other2', password: 'password-123' })).data.token;
    const otherRecords = new RecordsService(filesDir);
    assert.equal(otherRecords.list(SERVER, 2).length, 0, '本地分区按账号隔离');
    const listed = await call('/experiments', 'GET', undefined, otherToken);
    assert.equal(listed.data.total, 0, '服务器也按账号隔离');
  });
  await t.test('上传期间再次编辑：保留新 operationId 并能再次同步', async () => {
    const dir = filesDir + '/edit-race'; const local = new RecordsService(dir);
    const made = local.create(SERVER, USER, '上传前', '', JSON.stringify(nativeState().parameters));
    let newOp;
    __control.afterResponse = () => {
      local.update(SERVER, USER, made.clientId, '上传中的修改', '', made.setupJson);
      newOp = local.list(SERVER, USER)[0].pendingOpId;
    };
    const first = await SyncService.syncAll(dir, SERVER, USER, token);
    assert.equal(first.failed, 0);
    const changed = local.list(SERVER, USER)[0];
    assert.equal(changed.syncState, 'pending'); assert.equal(changed.pendingOpId, newOp);
    const second = await SyncService.syncAll(dir, SERVER, USER, token);
    assert.equal(second.applied, 1); assert.equal(second.failed, 0);
    assert.equal((await call('/experiments/' + changed.remoteId, 'GET', undefined, token)).data.item.title, '上传中的修改');
  });

  await t.test('本机确认落盘失败：不能报成功，重试复用原操作', async () => {
    const dir = filesDir + '/disk-failure'; const local = new RecordsService(dir);
    const made = local.create(SERVER, USER, '写盘失败测试', '', JSON.stringify(nativeState().parameters));
    __control.afterResponse = () => { __fault.rename = true; };
    const failed = await SyncService.syncAll(dir, SERVER, USER, token);
    assert.equal(failed.failed, 1); assert.equal(failed.applied, 0);
    assert.equal(local.list(SERVER, USER)[0].pendingOpId, made.pendingOpId);
    const retried = await SyncService.syncAll(dir, SERVER, USER, token);
    assert.equal(retried.applied, 1); assert.equal(retried.failed, 0);
    assert.equal(local.list(SERVER, USER)[0].baseServerRev, 1);
  });

  await t.test('冲突响应期间的新编辑和上传快照都保留，缓存响应不重复造副本', async () => {
    const dir = filesDir + '/conflict-race'; const local = new RecordsService(dir);
    const made = local.create(SERVER, USER, '起始', '', JSON.stringify(nativeState().parameters));
    await SyncService.syncAll(dir, SERVER, USER, token);
    const state = nativeState(); state.parameters.ch1.frequency = 234;
    await call('/sync/apply', 'POST', { operationId: newOperationId(), type: 'update', clientId: made.clientId,
      baseServerRev: 1, title: '服务器更新', notes: '', state }, token);
    local.update(SERVER, USER, made.clientId, '上传快照', '', made.setupJson);
    const sent = local.snapshot(local.list(SERVER, USER)[0]);
    __control.afterResponse = () => { local.update(SERVER, USER, made.clientId, '响应前的新编辑', '', made.setupJson); };
    const result = await SyncService.syncAll(dir, SERVER, USER, token);
    assert.equal(result.conflicts, 1);
    const all = local.list(SERVER, USER);
    assert.equal(all.length, 3);
    assert.ok(all.some(r => r.title === '上传快照')); assert.ok(all.some(r => r.title === '响应前的新编辑'));
    const original = all.find(r => r.clientId === made.clientId);
    assert.equal(JSON.parse(original.setupJson).ch1.frequency, 234);
    const remote = { id: original.remoteId, clientId: made.clientId, title: original.title, notes: '',
      rev: original.baseServerRev, deleted: false, setupJson: original.setupJson, updatedAtMs: Date.now() };
    assert.equal(local.markConflict(SERVER, USER, sent, remote), true);
    assert.equal(local.list(SERVER, USER).length, 3);
  });

  let pullTarget;
  const pullDir = filesDir + '/second-device';
  await t.test('换设备拉取：分页处理原生记录，跳过网页，重放不会重复', async () => {
    const state = nativeState(); state.parameters.ch2.frequency = 432;
    const saved = await call('/experiments', 'POST', { title: '仅在服务器', notes: '拉取备注', state }, token);
    pullTarget = saved.data.item.id;
    const web = { version:1, parameters:{ expStep:'normal',currentMode:'wave',signalType:'sine',displayMode:'independent',
      inputActive:{1:true,2:false},timeDiv:1,voltsDiv:{1:1,2:1},frequencies:{1:1,2:1},peakValues:{1:1,2:1},
      freqX:1,freqY:1,phaseDiff:90,calibrationFactor:1,displayAdjustFactors:{time:1,volts:{1:1,2:1}},
      savedCalibrationSettings:{calibrationFactor:1,displayAdjustFactors:{time:1,volts:{1:1,2:1}}},
      horizontalPosition:0,verticalPosition:{1:0,2:0},triggerActive:true,triggerSource:1,triggerSlope:'rising',triggerMode:'auto',triggerLevel:0 }};
    assert.equal((await call('/experiments','POST',{title:'网页记录',notes:'',state:web},token)).status,201);
    __control.pageLimit = 2;
    try {
      const result = await SyncService.pullChanges(pullDir, SERVER, USER, token);
      assert.equal(result.failed, 0, result.message); assert.ok(result.pulled > 2); assert.equal(result.skipped, 1);
      const local = new RecordsService(pullDir); const all = local.list(SERVER, USER);
      const item = all.find(r => r.remoteId === pullTarget);
      assert.ok(item); assert.equal(JSON.parse(item.setupJson).ch2.frequency, 432);
      assert.equal(item.syncState, 'synced'); assert.equal(item.clientId, 'legacy-' + pullTarget);
      const again = await SyncService.pullChanges(pullDir, SERVER, USER, token);
      assert.equal(again.pulled, 0); assert.equal(local.list(SERVER, USER).length, all.length);
      local.update(SERVER, USER, item.clientId, '旧接口创建的记录也可更新', '', item.setupJson);
      assert.equal((await SyncService.syncAll(pullDir, SERVER, USER, token)).failed, 0);
      assert.equal((await call('/experiments/' + pullTarget, 'GET', undefined, token)).data.item.title, '旧接口创建的记录也可更新');
    } finally { __control.pageLimit = 0; }
  });

  await t.test('拉取远端修改和删除：待上传本机内容保留为副本', async () => {
    const local = new RecordsService(pullDir); const current = local.list(SERVER, USER).find(r => r.remoteId === pullTarget);
    local.update(SERVER, USER, current.clientId, '断网期间的本机修改', '', current.setupJson);
    await call('/experiments/' + pullTarget, 'PUT', { title: '别处改名', notes: '别处备注' }, token);
    const result = await SyncService.pullChanges(pullDir, SERVER, USER, token);
    assert.equal(result.failed, 0, result.message);
    const all = local.list(SERVER, USER);
    assert.equal(all.find(r => r.remoteId === pullTarget).title, '别处改名');
    assert.ok(all.some(r => r.conflictOfId === current.clientId && r.title === '断网期间的本机修改'));
    await call('/experiments/' + pullTarget, 'DELETE', undefined, token);
    assert.equal((await SyncService.pullChanges(pullDir, SERVER, USER, token)).failed, 0);
    assert.equal(local.list(SERVER, USER).some(r => r.remoteId === pullTarget), false);
  });

  await t.test('游标落盘失败：重新拉取不会生成重复记录或冲突副本', async () => {
    const dir = filesDir + '/cursor-failure'; const local = new RecordsService(dir);
    __fault.suffix = '.sync-cursor.json';
    const first = await SyncService.pullChanges(dir, SERVER, USER, token);
    assert.equal(first.failed, 1, first.message);
    const before = local.list(SERVER, USER).length;
    const retry = await SyncService.pullChanges(dir, SERVER, USER, token);
    assert.equal(retry.failed, 0, retry.message); assert.equal(local.list(SERVER, USER).length, before);
    assert.equal(local.list(SERVER, USER).some(r => r.conflictOfId), false);
  });

  await t.test('双向手动同步一次完成推送与拉取，游客不能拉取', async () => {
    const dir = filesDir + '/both'; const local = new RecordsService(dir);
    local.create(SERVER, USER, '双向同步', '', JSON.stringify(nativeState().parameters));
    const result = await SyncService.syncBoth(dir, SERVER, USER, token);
    assert.equal(result.failed, 0, result.message); assert.equal(result.applied, 1); assert.ok(result.pulled > 1);
    const guest = await SyncService.pullChanges(dir, SERVER, 0, token);
    assert.equal(guest.pulled, 0); assert.equal(new RecordsService(dir).list(SERVER, 0).length, 0);
  });

  await t.test('拉取账号隔离、游标校验和固定水位期间的并发变更', async () => {
    const start = (await call('/sync/changes?limit=1', 'GET', undefined, token)).data;
    assert.equal(start.hasMore, true);
    const target = (await call('/experiments?limit=1','GET',undefined,token)).data.items[0];
    assert.equal((await call('/experiments/' + target.id, 'PUT', { title:'分页期间更新' }, token)).status,200);
    let cursor = start.nextCursor;
    while (cursor < start.until) {
      const response = await call('/sync/changes?cursor='+cursor+'&until='+start.until+'&limit=1', 'GET', undefined, token);
      assert.equal(response.status,200); assert.ok(response.data.nextCursor > cursor);
      cursor = response.data.nextCursor;
    }
    const next = await call('/sync/changes?cursor='+start.until, 'GET', undefined, token);
    assert.ok(next.data.items.some(item => item.id === target.id && item.title === '分页期间更新'));
    for (const query of ['limit=0','limit=201','cursor=-1','cursor=1.5','until=99999999999999999999']) {
      assert.equal((await call('/sync/changes?'+query,'GET',undefined,token)).status,400);
    }
    assert.equal((await call('/sync/changes','GET')).status,401);
    const otherToken = (await call('/auth/login','POST',{username:'other2',password:'password-123'})).data.token;
    assert.deepEqual((await call('/sync/changes','GET',undefined,otherToken)).data.items,[]);
  });

  await t.test('首次上传期间删除：保留墓碑，下次同步删除远端而不复活', async () => {
    const dir = filesDir + '/delete-race'; const local = new RecordsService(dir);
    const made = local.create(SERVER, USER, '正在上传时删除', '', JSON.stringify(nativeState().parameters));
    __control.afterResponse = () => { assert.equal(local.remove(SERVER, USER, made.clientId).kind,'tombstoned'); };
    assert.equal((await SyncService.syncAll(dir,SERVER,USER,token)).applied,1);
    assert.equal(local.list(SERVER,USER).length,0);
    assert.equal(local.listPending(SERVER,USER).length,1);
    assert.equal((await SyncService.syncBoth(dir,SERVER,USER,token)).failed,0);
    assert.equal(local.list(SERVER,USER).some(r => r.clientId === made.clientId),false);
    assert.equal(local.listPending(SERVER,USER).length,0);
  });

});
