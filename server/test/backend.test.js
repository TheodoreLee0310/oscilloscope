const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../index');
const state = { version: 1, parameters: {
  expStep:'normal', currentMode:'wave', signalType:'sine', displayMode:'overlay',
  inputActive:{1:true,2:true}, timeDiv:2, voltsDiv:{1:1,2:2}, frequencies:{1:5,2:10}, peakValues:{1:2,2:3},
  freqX:1, freqY:2, phaseDiff:90, calibrationFactor:1, displayAdjustFactors:{time:1,volts:{1:1,2:1}},
  savedCalibrationSettings:{calibrationFactor:1,displayAdjustFactors:{time:1,volts:{1:1,2:1}}},
  horizontalPosition:0, verticalPosition:{1:0,2:1}, triggerActive:true, triggerSource:1, triggerSlope:'rising', triggerMode:'auto', triggerLevel:0
} };
const close = server => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));

test('persistent accounts and isolated experiment API', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-backend-test-'));
  const dbPath = path.join(directory, 'test.sqlite');
  let server, base;
  async function start(options = {}) {
    server = createServer({ dbPath, ...options });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
  }
  t.after(async () => {
    if (server.listening) await close(server);
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  await start();
  async function call(route, method = 'GET', body, token) {
    const res = await fetch(base + '/api' + route, { method,
      headers: { 'Content-Type':'application/json', ...(token ? { Authorization:'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  }
  const credentials = { username:'student1', password:'test-password-123', nickname:'学生一' };
  let alice, bob, id;
  await t.test('registration, duplicate race, password hashing and login', async () => {
    const responses = await Promise.all([call('/auth/register','POST',credentials), call('/auth/register','POST',credentials)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201,409]);
    assert.equal((await call('/auth/register','POST',{...credentials,username:'x',password:'short'})).status,400);
    assert.equal((await call('/auth/login','POST',{...credentials,password:'wrong-password'})).status,401);
    const login = await call('/auth/login','POST',credentials);
    assert.equal(login.status,200); alice = login.data.token;
    assert.match(alice,/^[a-f0-9]{64}$/); assert.equal(login.data.user.nickname,'学生一');
    assert.equal(login.data.user.password_hash,undefined);
    // 客户端需要过期时间来区分「可上传」与「仅本地可用」
    assert.ok(Date.parse(login.data.expiresAt) > Date.now(), '登录应返回未来的过期时间');
    const db = new DatabaseSync(dbPath);
    const u = db.prepare('SELECT * FROM users').get();
    assert.notEqual(u.password_hash,credentials.password);
    assert.equal(u.password_hash.length,128);
    assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get().token_hash,alice);
    db.close();
    assert.equal((await call('/auth/register','POST',{...credentials,username:'student2'})).status,201);
    bob = (await call('/auth/login','POST',{...credentials,username:'student2'})).data.token;
  });
  await t.test('save and retrieve exact experiment, no guest/forged access', async () => {
    for (const token of [undefined,'guest-token','mock-token-1','f'.repeat(64)]) assert.equal((await call('/experiments','GET',undefined,token)).status,401);
    const saved = await call('/experiments','POST',{ title:'双通道测量',notes:'观察相位差',state },alice);
    assert.equal(saved.status,201); id = saved.data.item.id;
    assert.deepEqual((await call('/experiments/'+id,'GET',undefined,alice)).data.item.state,state);
    assert.equal((await call('/experiments','GET',undefined,alice)).data.items.length,1);
  });
  await t.test('other users cannot list, read or delete records', async () => {
    assert.deepEqual((await call('/experiments','GET',undefined,bob)).data.items,[]);
    for (const method of ['GET','DELETE']) assert.equal((await call('/experiments/'+id,method,undefined,bob)).status,404);
    assert.equal((await call('/experiments/'+id,'GET',undefined,alice)).status,200);
  });
  await t.test('reject unsafe parameters, malformed input, cross-site requests and private files', async () => {
    const invalid = structuredClone(state); invalid.parameters.timeDiv = 0;
    assert.equal((await call('/experiments','POST',{title:'bad',state:invalid},alice)).status,400);
    const injected = structuredClone(state); injected.parameters.logout = 'code';
    assert.equal((await call('/experiments','POST',{title:'bad',state:injected},alice)).status,400);
    assert.equal((await call('/experiments','POST',{title:' ',state},alice)).status,400);
    assert.equal((await call('/experiments','POST',{title:'large',notes:'x'.repeat(40000),state},alice)).status,413);
    const malformed = await fetch(base+'/api/experiments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+alice},body:'{'});
    assert.equal(malformed.status,400);
    const foreign = await fetch(base+'/api/auth/logout',{method:'POST',headers:{Origin:'https://example.org',Authorization:'Bearer '+alice}});
    assert.equal(foreign.status,403);
    for (const route of ['/server/data/oscilloscope.sqlite','/.git/config','/%2e%2e%5cserver%5cindex.js']) assert.equal((await fetch(base+route)).status,404);
  });
  await t.test('server restart preserves accounts, sessions and records', async () => {
    await close(server); await start();
    const me = await call('/auth/me','GET',undefined,alice);
    assert.equal(me.status,200);
    assert.ok(Date.parse(me.data.expiresAt) > Date.now(), '/me 也应返回过期时间');
    assert.equal((await call('/auth/login','POST',credentials)).status,200);
    assert.deepEqual((await call('/experiments/'+id,'GET',undefined,alice)).data.item.state,state);
  });
  await t.test('rename, edit notes, search, pagination, export and import', async () => {
    for (const [title, notes] of [['正弦波校准', '基线校准记录'], ['方波调幅', '占空比 50%'], ['相位差观察', '两通道差 90 度']]) {
      assert.equal((await call('/experiments', 'POST', { title, notes, state }, alice)).status, 201);
    }
    const all = await call('/experiments', 'GET', undefined, alice);
    assert.equal(all.status, 200);
    assert.equal(all.data.total, 4, '共 4 条记录');
    assert.equal(all.data.items.length, 4);
    assert.equal(all.data.limit, 100);

    // 搜索：标题与备注都要能命中；LIKE 通配符必须当普通字符处理
    const byTitle = await call('/experiments?q=' + encodeURIComponent('正弦'), 'GET', undefined, alice);
    assert.equal(byTitle.data.total, 1);
    assert.equal(byTitle.data.items[0].title, '正弦波校准');
    assert.equal((await call('/experiments?q=' + encodeURIComponent('占空比'), 'GET', undefined, alice)).data.total, 1, '备注关键字也要能搜到');
    // % 必须当普通字符：只有备注里真的含 % 的那一条能命中。
    // 如果转义失效，LIKE '%%%' 会把 4 条全匹配出来，这条断言就会失败。
    const percent = await call('/experiments?q=' + encodeURIComponent('%'), 'GET', undefined, alice);
    assert.equal(percent.data.total, 1, '% 应当作普通字符，只命中含 % 的记录');
    assert.equal(percent.data.items[0].title, '方波调幅');
    assert.equal((await call('/experiments?q=' + encodeURIComponent('不存在的词'), 'GET', undefined, alice)).data.total, 0);

    // 分页：总数不变，页大小生效，两页不重叠
    const page1 = await call('/experiments?limit=2&offset=0', 'GET', undefined, alice);
    const page2 = await call('/experiments?limit=2&offset=2', 'GET', undefined, alice);
    assert.equal(page1.data.items.length, 2);
    assert.equal(page2.data.items.length, 2);
    assert.equal(page1.data.total, 4);
    assert.equal(new Set([...page1.data.items, ...page2.data.items].map(i => i.id)).size, 4, '两页内容不能重复');
    assert.equal((await call('/experiments?limit=0', 'GET', undefined, alice)).data.limit, 1, 'limit 下限为 1');
    assert.equal((await call('/experiments?limit=99999', 'GET', undefined, alice)).data.limit, 200, 'limit 上限为 200');

    // 重命名与备注修改
    const renamed = await call('/experiments/' + id, 'PUT', { title: '双通道测量（已改名）', notes: '补充说明' }, alice);
    assert.equal(renamed.status, 200);
    assert.equal(renamed.data.item.title, '双通道测量（已改名）');
    assert.equal(renamed.data.item.notes, '补充说明');
    const reread = await call('/experiments/' + id, 'GET', undefined, alice);
    assert.deepEqual(reread.data.item.state, state, '改标题不能动参数');
    assert.equal((await call('/experiments/' + id, 'PUT', { title: '   ' }, alice)).status, 400);
    assert.equal((await call('/experiments/' + id, 'PUT', { notes: 'x'.repeat(2001) }, alice)).status, 400);
    assert.equal((await call('/experiments/' + id, 'PUT', {}, alice)).status, 400);
    assert.equal((await call('/experiments/' + id, 'PUT', { title: '别人的' }, bob)).status, 404, '不能改他人记录');
    assert.equal((await call('/experiments/' + '0'.repeat(8) + '-0000-0000-0000-' + '0'.repeat(12), 'PUT', { title: 'x' }, alice)).status, 404);

    // 导出
    const exported = await call('/experiments/export', 'GET', undefined, alice);
    assert.equal(exported.status, 200);
    assert.equal(exported.data.format, 'sbq-experiments');
    assert.equal(exported.data.version, 1);
    assert.equal(exported.data.items.length, 4);
    const renamedItem = exported.data.items.find(i => i.title === '双通道测量（已改名）');
    assert.ok(renamedItem, '导出内容应包含改名后的标题');
    assert.deepEqual(renamedItem.state, state);

    // 导入到另一个账号：验证幂等归属与用户隔离
    const imported = await call('/experiments/import', 'POST', { format: 'sbq-experiments', items: exported.data.items }, bob);
    assert.equal(imported.status, 201);
    assert.equal(imported.data.imported, 4);
    assert.equal(imported.data.skipped, 0);
    assert.equal((await call('/experiments', 'GET', undefined, bob)).data.total, 4, '导入记录归属 bob');
    assert.equal((await call('/experiments', 'GET', undefined, alice)).data.total, 4, 'alice 的记录不应变化');

    // 非法条目跳过并回报，整体格式错误则拒绝
    const mixed = await call('/experiments/import', 'POST', {
      format: 'sbq-experiments',
      items: [{ title: '合法', state }, { title: '', state }, { title: '参数非法', state: { version: 9, parameters: {} } }]
    }, bob);
    assert.equal(mixed.status, 201);
    assert.equal(mixed.data.imported, 1);
    assert.equal(mixed.data.skipped, 2);
    assert.equal(mixed.data.errors.length, 2);
    assert.equal((await call('/experiments/import', 'POST', { items: 'not-an-array' }, bob)).status, 400);
    assert.equal((await call('/experiments/import', 'POST', { format: 'other', items: [] }, bob)).status, 400);
    assert.equal((await call('/experiments/import', 'POST', { items: [] }, undefined)).status, 401, '未登录不能导入');
  });
  await t.test('delete persists; logout invalidates token', async () => {
    assert.equal((await call('/experiments/'+id,'DELETE',undefined,alice)).status,200);
    assert.equal((await call('/experiments/'+id,'GET',undefined,alice)).status,404);
    assert.equal((await call('/auth/logout','POST',undefined,alice)).status,200);
    assert.equal((await call('/auth/me','GET',undefined,alice)).status,401);
    await close(server); await start({ sessionMs: -1 });
    const expired = (await call('/auth/login','POST',credentials)).data.token;
    assert.equal((await call('/auth/me','GET',undefined,expired)).status,401);
    await close(server); await start({ authLimit: 1 });
    assert.equal((await call('/auth/login','POST',credentials)).status,200);
    assert.equal((await call('/auth/login','POST',credentials)).status,429);
  });
});
