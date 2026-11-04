const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stripTypeScriptTypes } = require('node:module');
const { once } = require('node:events');
const { createServer } = require('../index');

// Execute the actual ArkTS service/model source on the host with an HTTP adapter.
// This tests client serialization and contracts, not HarmonyOS networking or UI.
test('ArkTS clients register, save, restore and delete native experiments', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-arkts-test-'));
  const server = createServer({ dbPath: ':memory:' });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    delete global.AppStorage;
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  const memory = new Map();
  global.AppStorage = { get: key => memory.get(key), setOrCreate: (key, value) => memory.set(key, value) };
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  memory.set('server',origin);
  fs.writeFileSync(path.join(directory,'NetworkKit.mjs'), `export const http = {
    RequestMethod: {GET:'GET',POST:'POST',PUT:'PUT',DELETE:'DELETE'}, HttpDataType: {STRING:0},
    createHttp: () => ({ destroy() {}, async request(url, options) {
      const response = await fetch(url,{method:options.method,headers:options.header,body:options.extraData});
      return {responseCode:response.status,result:await response.text()};
    } })
  };`);
  const root = path.resolve(__dirname,'../../harmonyos-native/entry/src/main/ets');
  for (const file of ['model/ScopeTypes','service/ApiService','service/AuthService','service/ExperimentService','service/ExperimentTransfer']) {
    const code = fs.readFileSync(path.join(root,file+'.ets'),'utf8');
    const output = stripTypeScriptTypes(code).replace(/from ['"]@kit\.NetworkKit['"]/g,"from './NetworkKit.mjs'")
      .replace(/from ['"](?:\.\.\/model\/|\.\/)(\w+)['"]/g,"from './$1.mjs'");
    fs.writeFileSync(path.join(directory,path.basename(file)+'.mjs'),output);
  }
  const { AuthService } = await import(pathToFileURL(path.join(directory,'AuthService.mjs')));
  const { ApiService } = await import(pathToFileURL(path.join(directory,'ApiService.mjs')));
  const { ExperimentService } = await import(pathToFileURL(path.join(directory,'ExperimentService.mjs')));
  const { ScopeSetup } = await import(pathToFileURL(path.join(directory,'ScopeTypes.mjs')));
  assert.throws(()=>ApiService.normalizeServer('https://example.com/path'));
  assert.throws(()=>ApiService.normalizeServer('https://name:password@example.com'));
  await AuthService.register(origin,'nativeuser','password-123','鸿蒙用户');
  const login = await AuthService.login(origin,'nativeuser','password-123');
  assert.equal(login.ok,true); assert.equal(login.displayName,'鸿蒙用户');
  memory.set('token',login.token);
  const setup = new ScopeSetup();
  setup.ch1.waveType='triangle'; setup.ch2.waveType='square'; setup.ch2.frequency=100;
  setup.ch2.phaseDeg=90; setup.timeDiv=0.005; setup.runTimeSec=100;
  await ExperimentService.save('原生双通道','两个通道使用不同波形',setup);
  const list = await ExperimentService.list();
  assert.equal(list.length,1); assert.equal(list[0].stateVersion,2);
  assert.deepEqual(await ExperimentService.restore(list[0].id),JSON.parse(JSON.stringify(setup)));

  // 搜索 / 分页 / 重命名 / 导出
  const page = await ExperimentService.listPage('', 10, 0);
  assert.equal(page.total, 1);
  assert.equal(page.items.length, 1);
  assert.equal((await ExperimentService.listPage('不存在的关键字', 10, 0)).total, 0);
  await ExperimentService.update(list[0].id, '改名后的实验', '改过的备注');
  const renamed = await ExperimentService.listPage('改名', 10, 0);
  assert.equal(renamed.total, 1, '搜索应命中改后的标题');
  assert.equal(renamed.items[0].title, '改名后的实验');
  assert.equal(renamed.items[0].notes, '改过的备注');
  assert.deepEqual(await ExperimentService.restore(list[0].id), JSON.parse(JSON.stringify(setup)), '改名不应动参数');
  const exported = await ExperimentService.exportAll();
  const parsedExport = JSON.parse(exported);
  assert.equal(parsedExport.format, 'sbq-experiments');
  assert.equal(parsedExport.items.length, 1);
  assert.equal(exported.includes('token'), false, '导出内容不含令牌');
  assert.equal(exported.includes('"password"'), false, '导出内容不含密码');
  const invalid = new ScopeSetup(); invalid.ch1.frequency=0;
  await assert.rejects(()=>ExperimentService.save('invalid','',invalid),/参数/);
  await AuthService.register(origin,'otheruser','password-123','另一个用户');
  memory.set('token',(await AuthService.login(origin,'otheruser','password-123')).token);
  assert.deepEqual(await ExperimentService.list(),[]);
  // 导入到另一个账号：验证归属与幂等台账
  const imported = await ExperimentService.importItems(parsedExport.items);
  assert.equal(imported.imported, 1);
  assert.equal((await ExperimentService.listPage('', 10, 0)).total, 1, '导入记录归属当前用户');
  await assert.rejects(()=>ExperimentService.restore(list[0].id),/不存在/);
  await assert.rejects(()=>ExperimentService.remove(list[0].id),/不存在/);
  memory.set('token',login.token);
  await ExperimentService.remove(list[0].id);
  assert.deepEqual(await ExperimentService.list(),[]);
  await AuthService.logout();
  await assert.rejects(()=>ExperimentService.list(),/过期/);
});
