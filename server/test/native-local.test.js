const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');

/**
 * 在电脑上执行真实的 ArkTS 服务源码（剥掉类型后），用内存替身模拟
 * Asset Store / 文件系统 / util，覆盖本机存储与离线记录：
 *
 *   1. 本地 JSON 存储：原子替换、归属核对（服务器 + userId + 数据名）、
 *      损坏隔离、旧版信封保留、哈希分区与规范化
 *   2. 自动草稿：往返、越界拒绝、旧字符键**不自动迁入**
 *   3. 本机离线记录：稳定 clientId、修订号/时间/墓碑/同步状态、
 *      离线增改删、重启后仍在、账号隔离、游客迁移需显式调用
 *   4. 五个验收点：断网重启、账号切换、保存中断、损坏恢复、重复删除
 *
 * 只证明逻辑正确，不代表设备上的真实文件系统与密钥库行为。
 */
test('local store, draft, offline records and session logic on host', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-local-test-'));
  t.after(() => {
    for (const name of fs.readdirSync(work)) fs.rmSync(path.join(work, name), { recursive: true, force: true });
    fs.rmdirSync(work);
  });

  // ---- 内存文件系统替身（支持目录、可注入写失败） ----
  fs.writeFileSync(path.join(work, 'kit_CoreFileKit.mjs'), `
    export const __files = new Map();
    export const __dirs = new Set();
    export const __fail = { rename: false };
    export const fileIo = {
      OpenMode: { CREATE: 64, READ_WRITE: 2, TRUNC: 512 },
      accessSync: p => __files.has(p) || __dirs.has(p),
      mkdirSync: p => { __dirs.add(p); },
      openSync: p => ({ fd: p }),
      writeSync: (fd, text) => { __files.set(fd, text); return text.length; },
      closeSync: () => {},
      readTextSync: p => { if (!__files.has(p)) { throw new Error('ENOENT'); } return __files.get(p); },
      renameSync: (a, b) => {
        if (__fail.rename) { throw new Error('EIO'); }
        if (!__files.has(a)) { throw new Error('ENOENT'); }
        __files.set(b, __files.get(a)); __files.delete(a);
      },
      unlinkSync: p => { __files.delete(p); },
      listFileSync: dir => [...__files.keys()]
        .filter(p => p.startsWith(dir + '/') && p.substring(dir.length + 1).indexOf('/') < 0)
        .map(p => p.substring(dir.length + 1)),
      statSync: p => {
        if (!__files.has(p)) { throw new Error('ENOENT'); }
        return { size: __files.get(p).length, mtime: Math.floor(Date.now() / 1000), isDirectory: () => false, isFile: () => true };
      }
    };
  `);

  // ---- 内存 Asset Store 替身（按字节值比较别名） ----
  fs.writeFileSync(path.join(work, 'kit_AssetStoreKit.mjs'), `
    const vault = new Map();
    const clone = m => new Map(m);
    const keyOf = v => (v instanceof Uint8Array ? Buffer.from(v).toString('hex') : String(v));
    export const __vault = vault;
    export const asset = {
      Tag: { ALIAS: 'ALIAS', SECRET: 'SECRET', ACCESSIBILITY: 'ACCESSIBILITY', RETURN_TYPE: 'RETURN_TYPE' },
      Accessibility: { DEVICE_FIRST_UNLOCKED: 1 },
      ReturnType: { ALL: 0 },
      async add(attributes) {
        const key = keyOf(attributes.get('ALIAS'));
        if (vault.has(key)) { throw new Error('24000003 duplicate'); }
        vault.set(key, clone(attributes));
      },
      async remove(query) {
        const key = keyOf(query.get('ALIAS'));
        if (!vault.has(key)) { throw new Error('24000002 not found'); }
        vault.delete(key);
      },
      async query(query) {
        const key = keyOf(query.get('ALIAS'));
        return vault.has(key) ? [clone(vault.get(key))] : [];
      }
    };
  `);

  fs.writeFileSync(path.join(work, 'kit_ArkTS.mjs'), `
    class StubEncoder { encodeInto(text) { return new Uint8Array(Buffer.from(text, 'utf8')); } }
    class StubDecoder { decodeToString(bytes) { return Buffer.from(bytes).toString('utf8'); } }
    export const util = { TextEncoder: StubEncoder, TextDecoder: StubDecoder };
  `);

  // ---- 剥类型 + 重写 import ----
  const root = path.resolve(__dirname, '../../harmonyos-native/entry/src/main/ets');
  const sources = {
    ScopeTypes: 'model/ScopeTypes',
    LocalStore: 'service/LocalStore',
    DraftService: 'service/DraftService',
    RecordsService: 'service/RecordsService',
    SessionService: 'service/SessionService',
    ExperimentTransfer: 'service/ExperimentTransfer',
    ExportFiles: 'service/ExportFiles'
  };
  for (const [outName, rel] of Object.entries(sources)) {
    const code = fs.readFileSync(path.join(root, rel + '.ets'), 'utf8');
    const output = stripTypeScriptTypes(code)
      .replace(/from ['"](@kit\.[A-Za-z]+)['"]/g, (_m, full) => `from './kit_${full.split('.')[1]}.mjs'`)
      .replace(/from ['"](?:\.\.\/[a-z]+\/|\.\/)([A-Za-z0-9_]+)['"]/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(work, outName + '.mjs'), output);
  }

  const { LocalStore, StoreStatus } = await import(pathToFileURL(path.join(work, 'LocalStore.mjs')));
  const { DraftService, isValidDraftSetup } = await import(pathToFileURL(path.join(work, 'DraftService.mjs')));
  const { RecordsService } = await import(pathToFileURL(path.join(work, 'RecordsService.mjs')));
  const { SessionService, SessionInfo } = await import(pathToFileURL(path.join(work, 'SessionService.mjs')));
  const { ScopeSetup } = await import(pathToFileURL(path.join(work, 'ScopeTypes.mjs')));
  const { classifyImport, containsSensitiveField, exportFileName } = await import(pathToFileURL(path.join(work, 'ExperimentTransfer.mjs')));
  const { ExportFiles } = await import(pathToFileURL(path.join(work, 'ExportFiles.mjs')));
  const { __files, __fail } = await import(pathToFileURL(path.join(work, 'kit_CoreFileKit.mjs')));
  const { __vault } = await import(pathToFileURL(path.join(work, 'kit_AssetStoreKit.mjs')));

  const SERVER = 'http://127.0.0.1:3000';
  const OTHER_SERVER = 'http://10.0.0.2:3000';
  const DIR = '/data/app';
  const store = new LocalStore(DIR);
  const storePath = (server, userId, name) =>
    DIR + '/sbq-store/' + LocalStore.profileKey(server, userId) + '.' + name + '.json';

  /* ---------------------------------------------------------------- 存储层 */

  await t.test('写入后能读回，且不残留临时文件', () => {
    assert.equal(store.write(SERVER, 7, 'probe', 'hello'), true);
    const result = store.read(SERVER, 7, 'probe');
    assert.equal(result.status, StoreStatus.OK);
    assert.equal(result.payload, 'hello');
    assert.equal([...__files.keys()].some(p => p.endsWith('.tmp')), false);
    assert.equal(store.read(SERVER, 7, 'nothing').status, StoreStatus.MISSING);
  });

  await t.test('信封记录并核对服务器与 userId，不一致则保留原文件不读取', () => {
    const target = storePath(SERVER, 7, 'probe');
    const envelope = JSON.parse(__files.get(target));

    const forgedUser = JSON.stringify({ ...envelope, userId: 8 });
    __files.set(target, forgedUser);
    assert.equal(store.read(SERVER, 7, 'probe').status, StoreStatus.FOREIGN, '账号不一致必须判为 FOREIGN');
    assert.equal(__files.get(target), forgedUser, '不能删除或改名归属不明的数据');

    const forgedServer = JSON.stringify({ ...envelope, server: OTHER_SERVER });
    __files.set(target, forgedServer);
    assert.equal(store.read(SERVER, 7, 'probe').status, StoreStatus.FOREIGN, '服务器不一致必须判为 FOREIGN');

    const forgedName = JSON.stringify({ ...envelope, name: 'records' });
    __files.set(target, forgedName);
    assert.equal(store.read(SERVER, 7, 'probe').status, StoreStatus.FOREIGN, '数据名不一致必须判为 FOREIGN');

    __files.set(target, JSON.stringify(envelope));
    assert.equal(store.read(SERVER, 7, 'probe').status, StoreStatus.OK);
  });

  await t.test('旧版信封（缺少归属字段）保留但不解析', () => {
    const target = storePath(SERVER, 7, 'legacy-envelope');
    const old = JSON.stringify({ format: 'sbq-local-store', version: 1, profile: 'x', payload: 'old' });
    __files.set(target, old);
    assert.equal(store.read(SERVER, 7, 'legacy-envelope').status, StoreStatus.UNSUPPORTED);
    assert.equal(__files.get(target), old, '旧版数据必须原样保留');
  });

  await t.test('内容损坏时隔离为 .bad- 并返回 CORRUPT', () => {
    const target = storePath(SERVER, 7, 'broken');
    __files.set(target, '{ not json');
    assert.equal(store.read(SERVER, 7, 'broken').status, StoreStatus.CORRUPT);
    assert.ok([...__files.keys()].some(p => p.includes('.bad-')), '坏文件应被改名隔离');
  });

  await t.test('哈希分区：规范化地址、不同账号/服务器彼此隔离', () => {
    const a = LocalStore.profileKey('http://192.168.1.10:3000', 7);
    assert.match(a, /^p[0-9a-f]{16}$/);
    assert.equal(LocalStore.profileKey('HTTP://192.168.1.10:3000/', 7), a, '大小写与尾斜杠应规范化');
    assert.notEqual(LocalStore.profileKey('http://192.168.1.10:3000', 8), a);
    assert.notEqual(LocalStore.profileKey(OTHER_SERVER, 7), a);
    assert.notEqual(LocalStore.profileKey('http://192.168.1.10:3000', 0), a, '游客与账号隔离');
    assert.notEqual(LocalStore.profileKey('http://a-b', 7), LocalStore.profileKey('http://a_b', 7),
      '字符替换会碰撞的地址，哈希后必须不同');
  });

  await t.test('保存中断：rename 失败时旧数据保持完整', () => {
    store.write(SERVER, 7, 'interrupt', 'old-content');
    __fail.rename = true;
    assert.equal(store.write(SERVER, 7, 'interrupt', 'new-content'), false, '写失败应返回 false');
    __fail.rename = false;
    const result = store.read(SERVER, 7, 'interrupt');
    assert.equal(result.status, StoreStatus.OK);
    assert.equal(result.payload, 'old-content', '中断不能破坏旧数据');
  });

  /* ---------------------------------------------------------------- 草稿 */

  await t.test('草稿保存/读取往返，运行时长归零', () => {
    const drafts = new DraftService(DIR);
    const setup = new ScopeSetup();
    setup.displayMode = 'overlay';
    setup.ch1.waveType = 'triangle';
    setup.ch2.phaseDeg = 90;
    assert.equal(drafts.save(SERVER, 7, setup), true);
    const loaded = drafts.load(SERVER, 7);
    assert.ok(loaded, '草稿应能读回');
    assert.equal(loaded.setup.displayMode, 'overlay');
    assert.equal(loaded.setup.runTimeSec, 0);
    assert.equal(drafts.status(), StoreStatus.OK);
  });

  await t.test('越界草稿读回时被拒绝', () => {
    const drafts = new DraftService(DIR);
    const bad = new ScopeSetup();
    bad.timeDiv = 5;
    assert.equal(isValidDraftSetup(bad), false);
    assert.equal(drafts.save(SERVER, 8, bad), true);
    assert.equal(drafts.load(SERVER, 8), null, '读取时必须拒绝越界数据');

    const setup = new ScopeSetup();
    drafts.save(SERVER, 8, setup);
    __fail.rename = true;
    assert.equal(drafts.save(SERVER, 8, bad), false, '写失败返回 false');
    __fail.rename = false;
  });

  await t.test('旧字符键草稿不会被自动迁入，只提示存在', () => {
    const drafts = new DraftService(DIR);
    const legacyPath = DIR + '/sbq-store/' + LocalStore.legacyProfileKey(SERVER, 42) + '.draft.json';
    const record = { savedAtMs: Date.now(), setup: new ScopeSetup() };
    __files.set(legacyPath, JSON.stringify({
      format: 'sbq-local-store', version: 2, name: 'draft', server: SERVER, userId: 42,
      profile: LocalStore.legacyProfileKey(SERVER, 42), payload: JSON.stringify(record)
    }));
    assert.equal(drafts.load(SERVER, 42), null, '不能把归属不明的旧数据当成当前账号的草稿');
    assert.equal(drafts.hasLegacy(SERVER, 42), true, '应能提示存在旧数据');
    assert.equal(__files.has(legacyPath), true, '旧文件必须保留');
    drafts.discardLegacy(SERVER, 42);
    assert.equal(__files.has(legacyPath), false, '只有显式调用才删除');
  });

  /* ---------------------------------------------------------------- 离线记录 */

  await t.test('新增记录：生成稳定 clientId，带修订号/时间/同步状态', () => {
    const records = new RecordsService(DIR);
    const setup = new ScopeSetup();
    const made = records.create(SERVER, 7, '第一次实验', '备注 A', JSON.stringify(setup));
    assert.ok(made, '创建应成功');
    assert.match(made.clientId, /^c[0-9a-z]+-[0-9a-f]{8}-[0-9a-z]+$/);
    assert.equal(made.rev, 1);
    assert.equal(made.deleted, false);
    assert.equal(made.syncState, 'local');
    assert.equal(made.remoteId, '');
    assert.ok(made.updatedAtMs >= made.createdAtMs);
    const list = records.list(SERVER, 7);
    assert.equal(list.length, 1);
    assert.equal(list[0].clientId, made.clientId, 'clientId 必须稳定');
    assert.equal(records.create(SERVER, 7, '   ', '', '{}'), null, '空标题应被拒绝');
  });

  await t.test('断网重启：换一个服务实例仍能读到记录', () => {
    const fresh = new RecordsService(DIR);
    const list = fresh.list(SERVER, 7);
    assert.equal(list.length, 1);
    assert.equal(list[0].title, '第一次实验');
    assert.equal(fresh.status(), StoreStatus.OK);
  });

  await t.test('账号切换：不同 userId / 服务器互不可见', () => {
    const records = new RecordsService(DIR);
    assert.equal(records.list(SERVER, 8).length, 0, '别的账号看不到');
    assert.equal(records.list(OTHER_SERVER, 7).length, 0, '别的服务器看不到');
    assert.equal(records.list(SERVER, 0).length, 0, '游客分区为空');
  });

  await t.test('编辑记录：修订号递增，已同步记录转待同步', () => {
    const records = new RecordsService(DIR);
    const made = records.list(SERVER, 7)[0];
    assert.equal(records.update(SERVER, 7, made.clientId, '改名后', '备注 B', made.setupJson), true);
    const after = records.list(SERVER, 7)[0];
    assert.equal(after.title, '改名后');
    assert.equal(after.rev, 2, '修订号应递增');
    assert.equal(after.syncState, 'local', '从未上传的记录仍是仅保存在本机');

    const synced = records.create(SERVER, 7, '已同步记录', '', made.setupJson);
    const payloadPath = storePath(SERVER, 7, 'records');
    const envelope = JSON.parse(__files.get(payloadPath));
    const payload = JSON.parse(envelope.payload);
    for (const r of payload.records) {
      if (r.clientId === synced.clientId) { r.syncState = 'synced'; r.remoteId = 'server-id-1'; }
    }
    envelope.payload = JSON.stringify(payload);
    __files.set(payloadPath, JSON.stringify(envelope));
    assert.equal(records.update(SERVER, 7, synced.clientId, '同步后改名', '', synced.setupJson), true);
    const changed = records.list(SERVER, 7).find(r => r.clientId === synced.clientId);
    assert.equal(changed.syncState, 'pending', '已同步记录被编辑后应待同步');
  });

  await t.test('恢复参数：可解析且通过范围校验', () => {
    const records = new RecordsService(DIR);
    const record = records.list(SERVER, 7)[0];
    const setup = JSON.parse(record.setupJson);
    assert.equal(isValidDraftSetup(setup), true);
  });

  await t.test('删除未上传记录：直接移除；重复删除安全', () => {
    const records = new RecordsService(DIR);
    const before = records.list(SERVER, 7);
    const target = before.find(r => r.title === '改名后');
    const first = records.remove(SERVER, 7, target.clientId);
    assert.equal(first.ok, true);
    assert.equal(first.kind, 'removed', '从未上传的记录应直接移除');
    assert.equal(records.list(SERVER, 7).some(r => r.clientId === target.clientId), false);

    const again = records.remove(SERVER, 7, target.clientId);
    assert.equal(again.ok, false);
    assert.equal(again.kind, 'missing', '重复删除应安全返回 missing');
  });

  await t.test('删除已同步记录：保留删除墓碑', () => {
    const records = new RecordsService(DIR);
    const synced = records.list(SERVER, 7).find(r => r.syncState === 'pending');
    assert.ok(synced, '前置：应有一条待同步记录');
    const result = records.remove(SERVER, 7, synced.clientId);
    assert.equal(result.kind, 'tombstoned', '曾有远端副本必须留墓碑');
    assert.equal(records.list(SERVER, 7).some(r => r.clientId === synced.clientId), false, '列表不再显示');

    const payload = JSON.parse(JSON.parse(__files.get(storePath(SERVER, 7, 'records'))).payload);
    const tomb = payload.records.find(r => r.clientId === synced.clientId);
    assert.ok(tomb, '墓碑必须留在文件里');
    assert.equal(tomb.deleted, true);
    assert.equal(tomb.syncState, 'deleted');
    assert.ok(tomb.rev > synced.rev, '墓碑也要递增修订号');
  });

  await t.test('损坏恢复：记录文件损坏不影响草稿，且列表为空而不是崩溃', () => {
    const records = new RecordsService(DIR);
    const drafts = new DraftService(DIR);
    const setup = new ScopeSetup();
    drafts.save(SERVER, 9, setup);
    records.create(SERVER, 9, '将被损坏', '', JSON.stringify(setup));

    __files.set(storePath(SERVER, 9, 'records'), '{ broken');
    assert.deepEqual(records.list(SERVER, 9), [], '损坏时返回空列表');
    assert.equal(records.status(), StoreStatus.CORRUPT);
    assert.ok(drafts.load(SERVER, 9), '草稿与记录分开存储，不能被一起破坏');
  });

  await t.test('游客记录迁入账号：显式调用才迁移，且不重复', () => {
    const records = new RecordsService(DIR);
    const setup = new ScopeSetup();
    const g1 = records.create(SERVER, 0, '游客记录一', '', JSON.stringify(setup));
    const g2 = records.create(SERVER, 0, '游客记录二', '', JSON.stringify(setup));
    assert.equal(records.guestCount(SERVER), 2);
    assert.equal(records.list(SERVER, 11).length, 0, '迁入前账号为空');

    assert.equal(records.migrateGuest(SERVER, 11), 2, '确认后迁入 2 条');
    assert.equal(records.list(SERVER, 11).length, 2);
    assert.equal(records.guestCount(SERVER), 0, '游客分区应被清空');
    assert.equal(records.list(SERVER, 11).some(r => r.clientId === g1.clientId), true, 'clientId 保持不变');
    assert.equal(records.list(SERVER, 11).some(r => r.clientId === g2.clientId), true);

    assert.equal(records.migrateGuest(SERVER, 11), 0, '再次调用不再迁移');
    assert.equal(records.migrateGuest(SERVER, 0), 0, '迁入游客分区无意义，直接拒绝');
  });

  /* ---------------------------------------------------------------- 会话 */

  await t.test('会话：写入密钥库后能恢复，过期只代表不能上传', async () => {
    const info = new SessionInfo();
    info.server = SERVER;
    info.userId = 7;
    info.displayName = '学生一';
    info.token = 'a'.repeat(64);
    info.expiresAtMs = Date.now() + 3600_000;
    await SessionService.save(info);
    const restored = await SessionService.restore();
    assert.equal(restored.userId, 7);
    assert.equal(SessionService.isTokenUsable(restored), true);

    const expired = new SessionInfo();
    expired.server = SERVER;
    expired.userId = 7;
    expired.token = 'c'.repeat(64);
    expired.expiresAtMs = Date.now() - 1000;
    await SessionService.save(expired);
    const back = await SessionService.restore();
    assert.equal(back.token, expired.token, '过期后仍能读回供本机使用');
    assert.equal(SessionService.isTokenUsable(back), false, '过期即不可上传');

    await SessionService.clear();
    assert.equal(await SessionService.restore(), null);
    assert.equal(__vault.size, 0);
  });

  /* ---------------------------------------------------------------- 导入导出 */

  await t.test('导入分类：v2 有效、网页 v1 跳过、结构错误失败', () => {
    const summary = classifyImport(JSON.stringify({
      format: 'sbq-experiments',
      items: [
        { title: 'v2 记录', state: { version: 2, parameters: {} } },
        { title: '网页记录', state: { version: 1, parameters: {} } },
        { title: '', state: { version: 2, parameters: {} } },
        { title: '坏版本', state: { version: 9, parameters: {} } }
      ]
    }));
    assert.equal(summary.validCount, 1);
    assert.equal(summary.skippedV1, 1);
    assert.equal(summary.failed, 2);
    assert.equal(classifyImport('not json').failed, 1);
    assert.equal(classifyImport('{"items":"x"}').failed, 1);
  });

  await t.test('导出内容敏感字段检查与文件名格式', () => {
    assert.equal(containsSensitiveField('{"token":"a"}'), true);
    assert.equal(containsSensitiveField('{"items":[{"title":"实验"}]}'), false);
    assert.equal(exportFileName(new Date(2026, 10, 4, 8, 5, 9)), 'sbq-experiments-20261104-080509.json');
  });

  await t.test('导出文件：写入后可列举可读回，不残留临时文件', () => {
    const files = new ExportFiles(DIR);
    const info = files.write('{"items":[]}');
    assert.ok(info.path.endsWith('.json'));
    assert.equal(files.list().length, 1);
    assert.equal(files.read(info.path), '{"items":[]}');
    // 只检查导出目录：前面"保存中断"用例会故意留下 .tmp，那是预期行为
    assert.equal([...__files.keys()].some(p => p.startsWith('/data/app/exports/') && p.endsWith('.tmp')),
      false, '导出目录不应残留 .tmp');
  });
});
