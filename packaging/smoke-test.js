#!/usr/bin/env node
/**
 * 运行时冒烟测试（Electron 真实内核）
 *
 * 目的：在没有鸿蒙设备的情况下，用 Electron（同样是 Chromium 内核）把构建产物
 *      真正跑一遍，验证「页面能启动、Vue 能挂载、Canvas / WebGL 能拿到上下文、
 *      没有未捕获异常」，避免改完代码只能靠肉眼看构建日志。
 *
 * 与鸿蒙的关系：ArkWeb 同样是 Chromium 系内核，本测试覆盖不到的是
 *      ArkWeb 特有的宿主权限（存储 / 定位 / 文件选择），那部分必须在真机验证。
 *
 * 用法：npm run test:smoke
 */

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

// Electron 在 Windows 上是 GUI 子系统程序，stdout 经常无法被父进程捕获，
// 因此除了打印，同时把结果写入日志文件，保证任何环境下都能拿到测试结论。
const LOG_FILE = path.join(os.tmpdir(), 'sbq-smoke-result.log');
try {
  fs.writeFileSync(LOG_FILE, '');
} catch (_) {
  /* 忽略 */
}

function log(line) {
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {
    /* 忽略 */
  }
}

const results = [];
let failed = false;

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  if (!ok) failed = true;
  const icon = ok ? '  ✅' : '  ❌';
  log(`${icon} ${name}${detail !== undefined && detail !== '' ? '  → ' + detail : ''}`);
}

function collectErrors(win, bucket) {
  win.webContents.on('console-message', (event, level, message) => {
    // level 3 = error
    if (level >= 3) bucket.push('console.error: ' + message);
  });
  win.webContents.on('render-process-gone', (event, details) => {
    bucket.push('render-process-gone: ' + JSON.stringify(details));
  });
}

/** 在页面里执行一段表达式并返回结果 */
function evaluate(win, expression) {
  return win.webContents.executeJavaScript(expression, true);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // 预加载脚本：把页面内的未捕获异常收集到一个数组里，供测试读取
  const preloadPath = path.join(os.tmpdir(), 'sbq-smoke-preload.js');
  fs.writeFileSync(
    preloadPath,
    `window.__smokeErrors = [];
     window.addEventListener('error', (e) => {
       window.__smokeErrors.push('error: ' + (e.message || (e.error && e.error.message)));
     });
     window.addEventListener('unhandledrejection', (e) => {
       const r = e.reason;
       window.__smokeErrors.push('unhandledrejection: ' + ((r && r.message) ? r.message : String(r)));
     });`,
    'utf8'
  );

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      nodeIntegration: false,
      // 允许 file:// 页面使用 localStorage，模拟鸿蒙开启 domStorageAccess 的情况
      webSecurity: false,
    },
  });

  const errors = [];
  collectErrors(win, errors);

  // ---------- 1. 示波器主面板（external → index.html）----------
  console.log('\n[1/3] 加载 docs/index.html（面板 / 示波器）…');
  await win.loadFile(path.join(DOCS, 'index.html'), { query: { sbq_token: 'smoke-token' } });
  await wait(2500);

  const indexInfo = await evaluate(
    win,
    `(() => {
      const canvas = document.querySelector('canvas#oscilloscope') || document.querySelector('canvas');
      return {
        title: document.title,
        url: location.href,
        vueMounted: !!document.querySelector('.exp-steps, .app, header h1'),
        channelButtons: document.querySelectorAll('.channel-control button').length,
        canvas: canvas ? { width: canvas.width, height: canvas.height, has2d: !!canvas.getContext('2d') } : null,
        sliderCount: document.querySelectorAll('.slider').length,
        errors: window.__smokeErrors || []
      };
    })()`
  );

  check('页面标题正确', indexInfo.title.indexOf('智波') >= 0, indexInfo.title);
  check('Vue 应用已挂载', indexInfo.vueMounted);
  check('通道控制按钮已渲染', indexInfo.channelButtons >= 2, indexInfo.channelButtons + ' 个');
  check('示波器画布存在且尺寸正确', !!indexInfo.canvas && indexInfo.canvas.width === 800, indexInfo.canvas ? indexInfo.canvas.width + 'x' + indexInfo.canvas.height : 'no canvas');
  check('画布可获取 2D 上下文', !!indexInfo.canvas && indexInfo.canvas.has2d);
  check('微调滑块已渲染（触屏改造相关）', indexInfo.sliderCount >= 1, indexInfo.sliderCount + ' 个');
  check('页面内无未捕获异常', indexInfo.errors.length === 0, indexInfo.errors.join(' | '));

  // 生成一次波形，确认绘制链路没断
  const drawCheck = await evaluate(
    win,
    `(() => {
      try {
        const canvas = document.querySelector('canvas#oscilloscope') || document.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonBlank = 0;
        for (let i = 0; i < before.length; i += 4) {
          if (before[i] > 20 || before[i + 1] > 20 || before[i + 2] > 20) { nonBlank++; }
        }
        return { nonBlankPixels: nonBlank };
      } catch (e) { return { error: String(e) }; }
    })()`
  );
  check(
    '画布已绘制出非空内容（波形渲染链路正常）',
    !drawCheck.error && drawCheck.nonBlankPixels > 1000,
    drawCheck.error || drawCheck.nonBlankPixels + ' 个非空像素'
  );

  // 平台适配层是否就位
  const platformCheck = await evaluate(
    win,
    `(() => {
      // toast 宿主由 platform.js 的 toast() 按需创建，这里直接验证样式已注入的入口存在
      return {
        hasUrlTokenAdopted: !!(window.location.search.indexOf('sbq_token') >= 0),
        localStorageToken: (() => { try { return localStorage.getItem('sbq_token'); } catch (e) { return 'THREW: ' + e.name; } })()
      };
    })()`
  );
  check(
    '登录态 URL 桥接生效（localStorage 已写入 token）',
    platformCheck.localStorageToken === 'smoke-token',
    'localStorage.sbq_token = ' + platformCheck.localStorageToken
  );

  // ---------- 2. 三维内部原理（internal.html）----------
  console.log('\n[2/3] 加载 docs/internal.html（Three.js 三维原理）…');
  await win.loadFile(path.join(DOCS, 'internal.html'), { query: { sbq_token: 'smoke-token' } });
  await wait(4000);

  const internalInfo = await evaluate(
    win,
    `(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      const glCanvas = canvases.find((c) => c.width > 100) || canvases[0] || null;
      const gl = glCanvas ? (glCanvas.getContext('webgl2') || glCanvas.getContext('webgl')) : null;
      return {
        canvasCount: canvases.length,
        canvasSize: glCanvas ? glCanvas.width + 'x' + glCanvas.height : 'none',
        hasWebGL: !!gl,
        webglVersion: gl && gl.getParameter ? (gl instanceof WebGL2RenderingContext ? 2 : 1) : 0,
        bodyText: (document.body.innerText || '').slice(0, 200),
        hasFailureText: (document.body.innerText || '').indexOf('加载失败') >= 0,
        errors: window.__smokeErrors || []
      };
    })()`
  );

  check('WebGL 上下文创建成功', internalInfo.hasWebGL, 'WebGL ' + internalInfo.webglVersion + ' / 画布 ' + internalInfo.canvasSize);
  check('三维渲染画布存在', internalInfo.canvasCount >= 1, internalInfo.canvasCount + ' 个 canvas');
  check('内部原理页未报加载失败', !internalInfo.hasFailureText, internalInfo.bodyText.replace(/\n/g, ' ').slice(0, 80));
  check('三维页无未捕获异常', internalInfo.errors.length === 0, internalInfo.errors.join(' | '));

  // ---------- 3. 登录页 + 游客模式跳转 ----------
  console.log('\n[3/3] 加载 docs/login.html（登录页 + 游客模式）…');
  await win.loadFile(path.join(DOCS, 'login.html'));
  await wait(1200);

  const loginInfo = await evaluate(
    win,
    `(() => ({
      hasGuestButton: !!document.getElementById('btn-guest'),
      hasLoginButton: !!document.getElementById('btn-login'),
      errors: window.__smokeErrors || []
    }))()`
  );
  check('登录页含游客模式入口', loginInfo.hasGuestButton);
  check('登录页含登录按钮', loginInfo.hasLoginButton);
  check('登录页无未捕获异常', loginInfo.errors.length === 0, loginInfo.errors.join(' | '));

  // 点击游客模式，验证"登录 → 跳转主界面"的完整链路
  await evaluate(win, `document.getElementById('btn-guest').click(); true`);
  await wait(2500);
  const afterGuest = await evaluate(
    win,
    `(() => ({ url: location.href, hasApp: !!document.querySelector('.exp-steps, header h1') }))()`
  );
  check(
    '游客模式可跳转到主界面',
    afterGuest.url.indexOf('index.html') >= 0 && afterGuest.hasApp,
    afterGuest.url.split('/').pop()
  );

  // ---------- 汇总 ----------
  const consoleErrors = errors.filter((e) => e.indexOf('console.error') === 0);
  log('\n──────────────── 冒烟测试汇总 ────────────────');
  const passed = results.filter((r) => r.ok).length;
  log(`  通过 ${passed}/${results.length}`);
  log('  日志文件: ' + LOG_FILE);
  if (consoleErrors.length > 0) {
    log('  控制台 error 输出：');
    consoleErrors.slice(0, 10).forEach((e) => log('    · ' + e.slice(0, 160)));
  }
  if (failed) {
    log('\n  结果：❌ 存在失败项');
    results.filter((r) => !r.ok).forEach((r) => log('    · ' + r.name + ' → ' + r.detail));
  } else {
    log('\n  结果：✅ 全部通过');
  }

  app.exit(failed ? 1 : 0);
}

app.whenReady().then(() =>
  main().catch((err) => {
    log('冒烟测试自身异常: ' + (err && err.stack ? err.stack : String(err)));
    app.exit(1);
  })
);
