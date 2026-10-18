#!/usr/bin/env node
/**
 * 百度地图加载器单元测试
 *
 * 验证 src/utils/baiduMap.js 的加载状态机：
 *   1. 走官方异步写法（URL 带 callback），SDK 回调后 resolve(true)
 *   2. 脚本 onerror（网络不可达/被拦截）时 resolve(false)，不会永久挂起
 *   3. 超时后 resolve(false)
 *   4. 失败后允许重试（缓存的 loadingPromise 会被清空）
 *   5. isBaiduMapReady 只在 BMap.Map 是函数时才为 true
 *
 * 用法：npm run test:baidumap
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'utils', 'baiduMap.js');
const TMP_DIR = path.join(os.tmpdir(), 'sbq-baidumap-test');
const TMP_MODULE = path.join(TMP_DIR, 'baiduMap.mjs');

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

/** 建一个假 document：appendChild 时把 script 记下来，方便测试手动触发回调 */
function setupDom() {
  const scripts = [];
  const doc = {
    createElement(tag) {
      return { tagName: tag, src: '', async: false, onerror: null, onload: null };
    },
    head: {
      appendChild(el) {
        scripts.push(el);
        return el;
      },
    },
  };
  globalThis.document = doc;
  globalThis.window = {};
  return scripts;
}

let counter = 0;
async function loadModule() {
  counter++;
  return import(url.pathToFileURL(TMP_MODULE).href + '?case=' + counter);
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.copyFileSync(SOURCE, TMP_MODULE);

  console.log('\n百度地图加载器单元测试');
  console.log('────────────────────────────────────────');

  await testCase('URL 使用官方异步写法（带 callback 参数）', async () => {
    const scripts = setupDom();
    const { ensureBaiduMap } = await loadModule();

    const promise = ensureBaiduMap({ ak: 'TEST_AK', timeout: 1000 });
    assert.strictEqual(scripts.length, 1, '应注入 1 个 script');

    const src = scripts[0].src;
    assert.ok(src.indexOf('api.map.baidu.com/api') >= 0, '地址不对: ' + src);
    assert.ok(src.indexOf('callback=') >= 0, '必须带 callback 参数，否则会走 document.write: ' + src);
    assert.ok(src.indexOf('TEST_AK') >= 0, 'AK 未带入');

    // 模拟 SDK 就绪后调用回调
    globalThis.window.BMap = { Map: function FakeMap() {} };
    globalThis.window.__sbqBMapReady();
    assert.strictEqual(await promise, true);
  });

  await testCase('脚本加载失败时 resolve(false)，不会挂起', async () => {
    const scripts = setupDom();
    const { ensureBaiduMap } = await loadModule();

    const promise = ensureBaiduMap({ timeout: 5000 });
    scripts[0].onerror();

    const ok = await promise;
    assert.strictEqual(ok, false);
  });

  await testCase('超时后 resolve(false)', async () => {
    const scripts = setupDom();
    const { ensureBaiduMap } = await loadModule();

    const started = Date.now();
    const ok = await ensureBaiduMap({ timeout: 40 });
    const elapsed = Date.now() - started;

    assert.strictEqual(ok, false);
    assert.ok(elapsed >= 30 && elapsed < 2000, '超时时间异常: ' + elapsed + 'ms');
    assert.strictEqual(scripts.length, 1);
  });

  await testCase('SDK 已就绪时直接返回 true 且不重复注入脚本', async () => {
    const scripts = setupDom();
    globalThis.window.BMap = { Map: function FakeMap() {} };
    const { ensureBaiduMap } = await loadModule();

    assert.strictEqual(await ensureBaiduMap(), true);
    assert.strictEqual(scripts.length, 0, '已就绪时不应再注入脚本');
  });

  await testCase('失败后允许重试（会重新注入脚本）', async () => {
    const scripts = setupDom();
    const { ensureBaiduMap } = await loadModule();

    const first = ensureBaiduMap({ timeout: 5000 });
    scripts[0].onerror();
    assert.strictEqual(await first, false);

    // 第二次调用应重新注入
    const second = ensureBaiduMap({ timeout: 5000 });
    assert.strictEqual(scripts.length, 2, '重试应重新注入脚本');
    scripts[1].onerror();
    assert.strictEqual(await second, false);
  });

  await testCase('isBaiduMapReady 只在 BMap.Map 是函数时为真', async () => {
    const { isBaiduMapReady } = await loadModule();

    globalThis.window.BMap = undefined;
    assert.strictEqual(isBaiduMapReady(), false);

    globalThis.window.BMap = {};
    assert.strictEqual(isBaiduMapReady(), false, '只有 BMap 对象还不够');

    globalThis.window.BMap = { Map: function FakeMap() {} };
    assert.strictEqual(isBaiduMapReady(), true);
  });

  await testCase('getBaiduAk 支持通过 window.SBQ_BAIDU_MAP_AK 覆盖', async () => {
    setupDom();
    const { getBaiduAk, DEFAULT_BAIDU_AK } = await loadModule();

    assert.strictEqual(getBaiduAk(), DEFAULT_BAIDU_AK, '未覆盖时应使用默认值');

    globalThis.window.SBQ_BAIDU_MAP_AK = 'MY_OWN_AK';
    assert.strictEqual(getBaiduAk(), 'MY_OWN_AK', '应使用覆盖值');
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
