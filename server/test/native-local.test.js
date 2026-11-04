const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');

/**
 * 在电脑上执行真实的 ArkTS 服务源码（剥掉类型后），用内存替身模拟
 * Asset Store / 文件系统 / util，验证 P0 的三块逻辑：
 *   1. 本地 JSON 存储：原子替换、版本识别、损坏隔离
 *   2. 自动草稿：往返一致、越界拒绝
 *   3. 会话：Asset Store 往返、过期判定（过期≠必须退出）
 *
 * 注意：这只证明「逻辑正确」，不证明设备上的真实文件系统与密钥库行为。
 */
test('local store, draft and session logic on host', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-local-test-'));
  t.after(() => {
    for (const name of fs.readdirSync(work)) fs.rmSync(path.join(work, name), { recursive: true, force: true });
    fs.rmdirSync(work);
  });

  // ---- 内存文件系统替身 ----
  fs.writeFileSync(path.join(work, 'kit_CoreFileKit.mjs'), `
    export const __files = new Map();
    export const fileIo = {
      OpenMode: { CREATE: 64, READ_WRITE: 2, TRUNC: 512 },
      accessSync: p => __files.has(p),
      mkdirSync: () => {},
      openSync: p => ({ fd: p }),
      writeSync: (fd, text) => { __files.set(fd, text); return text.length; },
      closeSync: () => {},
      readTextSync: p => { if (!__files.has(p)) { throw new Error('ENOENT'); } return __files.get(p); },
      renameSync: (a, b) => { if (!__files.has(a)) { throw new Error('ENOENT'); } __files.set(b, __files.get(a)); __files.delete(a); },
      unlinkSync: p => { __files.delete(p); }
    };
  `);

  // ---- 内存 Asset Store 替身 ----
  // 注意：真实密钥库按「字节值」比较 ALIAS，而 JS 的 Map 用对象引用比较，
  // 所以这里必须先把别名转成十六进制字符串再当键，否则每次 encodeInto 都得到不同键。
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

  // ---- util 替身（真实 SDK 的 encodeInto/decodeToString 签名）----
  fs.writeFileSync(path.join(work, 'kit_ArkTS.mjs'), `
    class StubEncoder { encodeInto(text) { return new Uint8Array(Buffer.from(text, 'utf8')); } }
    class StubDecoder { decodeToString(bytes) { return Buffer.from(bytes).toString('utf8'); } }
    export const util = { TextEncoder: StubEncoder, TextDecoder: StubDecoder };
  `);

  // ---- 剥类型 + 重写 import 路径 ----
  const root = path.resolve(__dirname, '../../harmonyos-native/entry/src/main/ets');
  const sources = {
    ScopeTypes: 'model/ScopeTypes',
    LocalStore: 'service/LocalStore',
    DraftService: 'service/DraftService',
    SessionService: 'service/SessionService'
  };
  for (const [outName, rel] of Object.entries(sources)) {
    const code = fs.readFileSync(path.join(root, rel + '.ets'), 'utf8');
    const output = stripTypeScriptTypes(code)
      .replace(/from ['"](@kit\.[A-Za-z]+)['"]/g, (_m, full) => `from './kit_${full.split('.')[1]}.mjs'`)
      .replace(/from ['"](?:\.\.\/[a-z]+\/|\.\/)([A-Za-z0-9_]+)['"]/g, "from './$1.mjs'");
    fs.writeFileSync(path.join(work, outName + '.mjs'), output);
  }

  const { LocalStore } = await import(pathToFileURL(path.join(work, 'LocalStore.mjs')));
  const { DraftService, isValidDraftSetup } = await import(pathToFileURL(path.join(work, 'DraftService.mjs')));
  const { SessionService, SessionInfo } = await import(pathToFileURL(path.join(work, 'SessionService.mjs')));
  const { ScopeSetup } = await import(pathToFileURL(path.join(work, 'ScopeTypes.mjs')));
  const { __files } = await import(pathToFileURL(path.join(work, 'kit_CoreFileKit.mjs')));
  const { __vault } = await import(pathToFileURL(path.join(work, 'kit_AssetStoreKit.mjs')));

  const store = new LocalStore('/data/app');

  await t.test('本地存储写入后能读回，且不残留临时文件', () => {
    store.write('profile-a', 'hello');
    assert.equal(store.read('profile-a'), 'hello');
    const paths = [...__files.keys()];
    assert.equal(paths.some(p => p.endsWith('.tmp')), false, '原子写入不应残留 .tmp');
    assert.equal(store.read('profile-missing'), null);
  });

  await t.test('损坏文件被隔离并返回 null，不抛异常', () => {
    const target = '/data/app/sbq-store/profile-bad.json';
    __files.set(target, '{ this is not json');
    const before = [...__files.keys()].length;
    assert.equal(store.read('profile-bad'), null);
    const quarantined = [...__files.keys()].filter(p => p.includes('.bad-'));
    assert.equal(quarantined.length, 1, '坏文件应被改名隔离');
    assert.ok([...__files.keys()].length > before - 1);
  });

  await t.test('格式版本不认识时返回 null 且不覆盖文件', () => {
    const target = '/data/app/sbq-store/profile-v2.json';
    const envelope = JSON.stringify({ format: 'sbq-local-store', version: 2, profile: 'profile-v2', payload: 'future' });
    __files.set(target, envelope);
    assert.equal(store.read('profile-v2'), null, '未来版本不应被当成本版本解析');
    assert.equal(__files.get(target), envelope, '不能覆盖更高版本的文件');
  });

  await t.test('账号隔离键：服务器 + userId，游客单独一份', () => {
    const a = LocalStore.profileKey('http://192.168.1.10:3000', 7);
    const b = LocalStore.profileKey('http://192.168.1.10:3000', 8);
    const c = LocalStore.profileKey('http://192.168.1.10:3000', 0);
    const d = LocalStore.profileKey('http://10.0.0.2:3000', 7);
    assert.notEqual(a, b, '不同 userId 必须隔离');
    assert.notEqual(a, d, '不同服务器必须隔离');
    assert.ok(c.includes('guest'), '游客使用独立分区');
    assert.equal(a.includes(':'), false, '文件名里不能出现冒号');
    assert.equal(a.includes('/'), false, '文件名里不能出现斜杠');
  });

  await t.test('草稿保存/读取往返一致', () => {
    const drafts = new DraftService('/data/app');
    const setup = new ScopeSetup();
    setup.displayMode = 'overlay';
    setup.timeDiv = 0.01;
    setup.ch1.waveType = 'triangle';
    setup.ch2.frequency = 120;
    setup.ch2.phaseDeg = 90;
    assert.equal(drafts.save('u7', setup), true);
    const loaded = drafts.load('u7');
    assert.ok(loaded, '草稿应能读回');
    assert.equal(loaded.setup.displayMode, 'overlay');
    assert.equal(loaded.setup.ch1.waveType, 'triangle');
    assert.equal(loaded.setup.ch2.frequency, 120);
    assert.equal(loaded.setup.runTimeSec, 0, '运行时长应被归零');
    assert.ok(loaded.savedAtMs > 0);
    drafts.clear('u7');
    assert.equal(drafts.load('u7'), null);
  });

  await t.test('越界草稿被拒绝，不把坏数据画到屏幕', () => {
    const drafts = new DraftService('/data/app');
    const bad = new ScopeSetup();
    bad.timeDiv = 5;           // 上限 0.5
    assert.equal(isValidDraftSetup(bad), false);
    assert.equal(drafts.save('u8', bad), true, '保存不做校验（当前现场就是用户所见）');
    assert.equal(drafts.load('u8'), null, '读取时必须拒绝越界数据');
  });

  await t.test('会话：写入密钥库后能恢复', async () => {
    const info = new SessionInfo();
    info.server = 'http://127.0.0.1:3000';
    info.userId = 7;
    info.displayName = '学生一';
    info.token = 'a'.repeat(64);
    info.expiresAtMs = Date.now() + 3600_000;
    await SessionService.save(info);
    assert.equal(__vault.size, 1, '会话应写入密钥库');
    const restored = await SessionService.restore();
    assert.equal(restored.server, info.server);
    assert.equal(restored.userId, 7);
    assert.equal(restored.token, info.token);
    assert.equal(SessionService.isTokenUsable(restored), true);
  });

  await t.test('会话覆盖写入不会因别名冲突失败', async () => {
    const info = new SessionInfo();
    info.server = 'http://127.0.0.1:3000';
    info.userId = 8;
    info.displayName = '学生二';
    info.token = 'b'.repeat(64);
    info.expiresAtMs = Date.now() + 1000;
    await SessionService.save(info);
    const restored = await SessionService.restore();
    assert.equal(restored.userId, 8, '第二次保存应覆盖第一次');
  });

  await t.test('令牌过期只代表不能上传，不代表会话损坏', async () => {
    const expired = new SessionInfo();
    expired.server = 'http://127.0.0.1:3000';
    expired.userId = 9;
    expired.token = 'c'.repeat(64);
    expired.expiresAtMs = Date.now() - 1000;
    await SessionService.save(expired);
    const restored = await SessionService.restore();
    assert.equal(restored.token, expired.token, '过期后仍应能读回，供本机继续使用');
    assert.equal(SessionService.isTokenUsable(restored), false, '过期即不可上传');
  });

  await t.test('清除会话后恢复为 null', async () => {
    await SessionService.clear();
    assert.equal(await SessionService.restore(), null);
    assert.equal(__vault.size, 0);
    await SessionService.clear(); // 重复清除不应抛异常
  });
});
