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
    assert.equal((await call('/auth/me','GET',undefined,alice)).status,200);
    assert.equal((await call('/auth/login','POST',credentials)).status,200);
    assert.deepEqual((await call('/experiments/'+id,'GET',undefined,alice)).data.item.state,state);
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
