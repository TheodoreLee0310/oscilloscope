const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const base = process.env.SBQ_TEST_URL;
const logFile = path.join(process.env.SBQ_TEST_DIR, 'result.log');
const log = text => fs.appendFileSync(logFile, text + '\n');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let win;
const run = script => win.webContents.executeJavaScript(script, true);
async function until(script) {
  for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100); }
  throw new Error('Timed out: ' + script);
}
async function main() {
  win = new BrowserWindow({show:false,width:1280,height:900,webPreferences:{partition:'backend-test-'+Date.now(),offscreen:!!process.env.SBQ_TEST_SCREENSHOT,backgroundThrottling:false}});
  await win.loadURL(base+'/login.html');
  await run(`switchTab('register'); $('r-user').value='browseruser'; $('r-pass').value='password-123'; $('r-confirm').value='password-123'; $('r-nick').value='网页测试'; $('btn-register').click()`);
  await until(`document.getElementById('msg').textContent.includes('注册成功')`);
  assert.equal(await run(`localStorage.getItem('sbq_mock_users')`),null);
  log('PASS 注册走后端，不在浏览器保存密码');
  async function login() {
    await run(`$('l-user').value='browseruser'; $('l-pass').value='password-123'; $('btn-login').click()`);
    await delay(1200);
    await until(`!!document.querySelector('#app') && !!document.querySelector('#app').__vue__ && document.querySelector('#app').__vue__.accountVerified`);
  }
  await login();
  await run(`(async()=>{const vm=document.querySelector('#app').__vue__; vm.recordsOpen=true; vm.setExpStep('normal'); vm.frequencies={1:7,2:13}; vm.inputActive={1:true,2:true}; vm.calibrationFactor=1.02; vm.triggerLevel=0.7; vm.recordTitle='保存恢复验证'; vm.recordNotes='浏览器测试'; await vm.$nextTick(); document.querySelector('.records-form button').click();})()`);
  await until(`document.querySelector('#app').__vue__.records.length===1 && !document.querySelector('#app').__vue__.recordsBusy`);
  log('PASS 网页保存实验到数据库');
  await win.loadURL(base+'/index.html');
  await until(`!!document.querySelector('#app').__vue__ && document.querySelector('#app').__vue__.records.length===1`);
  await run(`(async()=>{const vm=document.querySelector('#app').__vue__; vm.recordsOpen=true; await vm.$nextTick(); document.querySelector('.records-actions button').click();})()`);
  await until(`!document.querySelector('#app').__vue__.recordsBusy && document.querySelector('#app').__vue__.frequencies[1]===7`);
  assert.deepEqual(await run(`(()=>{const vm=document.querySelector('#app').__vue__; return [vm.frequencies[2],vm.calibrationFactor,vm.triggerLevel,vm.recordNotes,vm.expStep]})()`),[13,1.02,0.7,'浏览器测试','normal']);
  log('PASS 刷新后恢复双通道、校准、触发与备注');
  if (process.env.SBQ_TEST_SCREENSHOT) fs.writeFileSync(process.env.SBQ_TEST_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
  await run(`document.querySelector('.logout-btn').click()`);
  await delay(500);
  await until(`!!document.getElementById('btn-login')`);
  await login();
  await until(`document.querySelector('#app').__vue__.records.length===1`);
  log('PASS 退出并重新登录后仍能查看实验');
  await run(`(async()=>{const vm=document.querySelector('#app').__vue__; vm.recordsOpen=true; await vm.$nextTick(); document.querySelectorAll('.records-actions button')[1].click(); await vm.$nextTick(); document.querySelectorAll('.records-actions button')[1].click();})()`);
  await until(`document.querySelector('#app').__vue__.records.length===0 && !document.querySelector('#app').__vue__.recordsBusy`);
  log('PASS 网页删除记录');
  app.exit(0);
}
app.whenReady().then(()=>main().catch(error=>{log('FAIL '+error.stack);app.exit(1);}));
