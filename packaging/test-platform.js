#!/usr/bin/env node
/**
 * 平台适配层单元测试（纯 Node，无需浏览器 / Electron）
 *
 * 覆盖 src/utils/platform.js 中最关键、也最容易在鸿蒙上出问题的逻辑：
 *   1. 存储分层降级：localStorage → sessionStorage → cookie → 内存
 *   2. 宿主禁用 DOM Storage 时不会抛异常（这是"点登录毫无反应"的根因）
 *   3. 登录态 URL 桥接（宿主不支持持久化存储时的降级通道）
 *   4. 鸿蒙 ArkWeb 的 UA 识别
 *   5. 无 DOM 环境下 toast / loadScriptOnce 不炸
 *
 * 用法：npm run test:platform
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'utils', 'platform.js');
const SOURCE_ART = path.join(ROOT, 'src', 'utils', 'terrainArt.js');

// 两个模块都是 ESM 且没有任何 import，复制成 .mjs 即可被 Node 直接加载
const TMP_DIR = path.join(os.tmpdir(), 'sbq-platform-test');
const TMP_MODULE = path.join(TMP_DIR, 'platform.mjs');
const TMP_ART = path.join(TMP_DIR, 'terrainArt.mjs');

let passed = 0;
let failed = 0;

async function testCase(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (err) {
    failed++;
    console.log('  ❌ ' + name + '\n       ' + (err && err.message ? err.message : err));
  }
}

/** 清掉所有与平台相关的全局，避免用例之间互相污染 */
function resetGlobals() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.navigator;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
}

/** 造一个可用的 Storage 替身 */
function makeStorage(options = {}) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (options.throwOnSet) {
        const err = new Error('SecurityError: storage disabled');
        err.name = 'SecurityError';
        throw err;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

/** 以指定环境重新加载 platform.js（每次带不同查询串绕过 ESM 缓存） */
let loadCounter = 0;
async function loadPlatform() {
  loadCounter++;
  return import(url.pathToFileURL(TMP_MODULE).href + '?case=' + loadCounter);
}

/** 加载离线地形示意图模块 */
let artCounter = 0;
async function loadArt() {
  artCounter++;
  return import(url.pathToFileURL(TMP_ART).href + '?case=' + artCounter);
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.copyFileSync(SOURCE, TMP_MODULE);
  fs.copyFileSync(SOURCE_ART, TMP_ART);

  console.log('\n平台适配层单元测试');
  console.log('────────────────────────────────────────');

  // ---------- 1. localStorage 可用 ----------
  await testCase('localStorage 可用时优先使用它', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', maxTouchPoints: 0 };
    globalThis.window = {
      location: { search: '', protocol: 'https:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1280,
      innerHeight: 800,
    };
    globalThis.localStorage = makeStorage();
    globalThis.sessionStorage = makeStorage();

    const { storage } = await loadPlatform();
    assert.strictEqual(storage.backend, 'localStorage');
    assert.strictEqual(storage.persistent, true);

    storage.setItem('k', 'v');
    assert.strictEqual(storage.getItem('k'), 'v');
    assert.strictEqual(globalThis.localStorage.getItem('k'), 'v', '应真正写入 localStorage');

    storage.setJSON('obj', { a: 1 });
    assert.deepStrictEqual(storage.getJSON('obj'), { a: 1 });
    assert.strictEqual(storage.getJSON('missing', 'fallback'), 'fallback');

    storage.removeItem('k');
    assert.strictEqual(storage.getItem('k'), null);
  });

  // ---------- 2. localStorage 被禁用，退回 sessionStorage ----------
  await testCase('localStorage 抛异常时自动退回 sessionStorage', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'Mozilla/5.0 Chrome/120', maxTouchPoints: 0 };
    globalThis.window = {
      location: { search: '', protocol: 'https:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1280,
      innerHeight: 800,
    };
    // 关键：模拟鸿蒙宿主关闭 DOM Storage —— 写入即抛 SecurityError
    globalThis.localStorage = makeStorage({ throwOnSet: true });
    globalThis.sessionStorage = makeStorage();

    const { storage } = await loadPlatform();
    assert.strictEqual(storage.backend, 'sessionStorage');
    assert.strictEqual(storage.persistent, true);

    storage.setItem('token', 'abc'); // 不应抛异常
    assert.strictEqual(storage.getItem('token'), 'abc');
  });

  // ---------- 3. 全部不可用 → 内存兜底 ----------
  await testCase('所有持久化存储都不可用时退化为内存且不抛异常', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'Mozilla/5.0 ArkWeb/4.1.6.1 OpenHarmony 5.0', maxTouchPoints: 5 };
    globalThis.window = {
      location: { search: '', protocol: 'resource:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 400,
      innerHeight: 800,
    };
    globalThis.localStorage = makeStorage({ throwOnSet: true });
    globalThis.sessionStorage = makeStorage({ throwOnSet: true });
    // 没有 document → cookie 层也不可用

    const { storage } = await loadPlatform();
    assert.strictEqual(storage.backend, 'memory');
    assert.strictEqual(storage.persistent, false);

    storage.setItem('token', 'mem-only'); // 关键：绝不抛异常
    assert.strictEqual(storage.getItem('token'), 'mem-only');
  });

  // ---------- 4. 鸿蒙 UA 识别 ----------
  await testCase('正确识别鸿蒙 ArkWeb 环境', async () => {
    resetGlobals();
    const arkUa =
      'Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile';
    globalThis.navigator = { userAgent: arkUa, maxTouchPoints: 5 };
    globalThis.window = {
      location: { search: '', protocol: 'resource:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 400,
      innerHeight: 800,
    };
    globalThis.localStorage = makeStorage();

    const { runtime } = await loadPlatform();
    assert.strictEqual(runtime.isArkWeb, true, 'isArkWeb 应为 true');
    assert.strictEqual(runtime.isHarmonyOS, true, 'isHarmonyOS 应为 true');
    assert.strictEqual(runtime.name, 'harmonyos-arkweb');
    assert.strictEqual(runtime.isElectron, false);
  });

  await testCase('正确识别 Electron 环境', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'Mozilla/5.0 Chrome/120 Electron/28.0.0', maxTouchPoints: 0 };
    globalThis.window = {
      location: { search: '', protocol: 'file:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 1280,
      innerHeight: 800,
    };
    globalThis.localStorage = makeStorage();

    const { runtime } = await loadPlatform();
    assert.strictEqual(runtime.isElectron, true);
    assert.strictEqual(runtime.name, 'electron');
    assert.strictEqual(runtime.isArkWeb, false);
  });

  // ---------- 5. 登录态 URL 桥接 ----------
  await testCase('从 URL 吸收登录态（存储不可用时的降级通道）', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'Mozilla/5.0 ArkWeb/4.1.6.1', maxTouchPoints: 5 };
    globalThis.window = {
      location: {
        search: '?sbq_token=bridge-token&sbq_user=' + encodeURIComponent('{"username":"guest"}'),
        protocol: 'resource:',
        assign() {},
      },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 400,
      innerHeight: 800,
    };
    globalThis.localStorage = makeStorage({ throwOnSet: true });
    globalThis.sessionStorage = makeStorage({ throwOnSet: true });

    const { storage } = await loadPlatform();
    // 模块加载时就应完成吸收
    assert.strictEqual(storage.getItem('sbq_token'), 'bridge-token');
    assert.deepStrictEqual(storage.getJSON('sbq_user'), { username: 'guest' });
  });

  // ---------- 6. 无 DOM 环境下的健壮性 ----------
  await testCase('无 DOM 时 toast / loadScriptOnce / onViewportChange 均不抛异常', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
    globalThis.window = {
      location: { search: '', protocol: 'https:', assign() {} },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 800,
      innerHeight: 600,
    };
    globalThis.localStorage = makeStorage();

    const { toast, loadScriptOnce, onViewportChange } = await loadPlatform();

    toast('这条消息没有 DOM 可以渲染'); // 不应抛异常

    const ok = await loadScriptOnce('https://example.com/x.js', { timeout: 50 });
    assert.strictEqual(ok, false, '无 document 时应安全返回 false');

    const dispose = onViewportChange(() => {});
    assert.strictEqual(typeof dispose, 'function');
    dispose();
  });

  // ---------- 7. navigate 的兜底行为 ----------
  await testCase('navigate 优先使用 location.assign', async () => {
    resetGlobals();
    globalThis.navigator = { userAgent: 'node', maxTouchPoints: 0 };
    let assigned = null;
    globalThis.window = {
      location: {
        search: '',
        protocol: 'https:',
        assign(u) {
          assigned = u;
        },
      },
      addEventListener() {},
      removeEventListener() {},
      innerWidth: 800,
      innerHeight: 600,
    };
    globalThis.localStorage = makeStorage();

    const { navigate } = await loadPlatform();
    const ok = navigate('./login.html');
    assert.strictEqual(ok, true);
    assert.strictEqual(assigned, './login.html');
  });

  // ---------- 8. 离线地形示意图 ----------
  await testCase('六种地形都能生成合法的内联 SVG 图（零网络依赖）', async () => {
    const { terrainImage } = await loadArt();
    const ids = ['mountain', 'water', 'plain', 'forest', 'valley', 'ocean'];
    for (const id of ids) {
      const uri = terrainImage(id);
      assert.ok(uri.startsWith('data:image/svg+xml'), id + ' 应为 data URI');
      assert.ok(decodeURIComponent(uri).indexOf('<svg') >= 0, id + ' 应包含 svg 元素');
    }
  });

  await testCase('未知地形回退到平原示意图', async () => {
    const { terrainImage } = await loadArt();
    assert.strictEqual(terrainImage('unknown-terrain'), terrainImage('plain'));
  });

  await testCase('allTerrainImages 返回全部 6 种地形', async () => {
    const { allTerrainImages } = await loadArt();
    const map = allTerrainImages();
    assert.strictEqual(Object.keys(map).length, 6);
    assert.ok(map.mountain && map.ocean);
  });

  console.log('────────────────────────────────────────');
  console.log(`  通过 ${passed} / ${passed + failed}`);
  if (failed > 0) {
    console.log('  结果：❌ 存在失败用例\n');
    process.exit(1);
  }
  console.log('  结果：✅ 全部通过\n');
}

main().catch((err) => {
  console.error('测试脚本自身异常:', err);
  process.exit(1);
});
