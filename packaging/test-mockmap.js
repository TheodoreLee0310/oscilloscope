#!/usr/bin/env node
/**
 * 离线模拟地图（MockMap）单元测试
 *
 * 背景：MockMap 依赖 Canvas 2D 与 DOM，在 Node 里没有浏览器环境。
 * 这里用一套极简的 DOM / Canvas 替身把它的构造、绘制、坐标换算、
 * 命中判断、销毁流程真实跑一遍，用来验证：
 *   - 绘制流程没有调用不存在的 API（拼写错误会立刻暴露）
 *   - 经纬度 ↔ 画布像素的换算往返一致
 *   - 点击位置能正确命中最近的已知地点
 *
 * 用法：npm run test:mockmap
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'src', 'utils', 'mockMap.js');
const TMP_DIR = path.join(os.tmpdir(), 'sbq-mockmap-test');
const TMP_MODULE = path.join(TMP_DIR, 'mockMap.mjs');

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

/* ------------------------------------------------------------------ *
 * 极简 Canvas 2D 替身：记录所有绘图调用，未实现的方法由 Proxy 兜住
 * ------------------------------------------------------------------ */

function createContext2D() {
  const props = Object.create(null);
  const calls = [];
  const gradient = { addColorStop() {} };

  const ctx = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop in props) return props[prop];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return (...args) => {
            calls.push([prop, args]);
            return gradient;
          };
        }
        if (prop === 'measureText') {
          return (text) => ({ width: String(text).length * 6 });
        }
        if (prop === 'canvas') return props.canvas;
        // 其余一律当作绘图方法，只记录调用
        return (...args) => {
          calls.push([String(prop), args]);
        };
      },
      set(_target, prop, value) {
        props[prop] = value;
        return true;
      },
    }
  );

  return { ctx, calls, props };
}

/* ------------------------------------------------------------------ *
 * 极简 DOM 替身
 * ------------------------------------------------------------------ */

function createDom() {
  const doc = {
    defaultView: {
      getComputedStyle: () => ({ position: 'relative' }),
      devicePixelRatio: 2,
    },
  };

  const createElement = (tagName) => {
    const { ctx, calls } = createContext2D();
    const el = {
      tagName,
      style: {},
      children: [],
      parentNode: null,
      className: '',
      textContent: '',
      width: 0,
      height: 0,
      _calls: calls,
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      remove() {
        if (this.parentNode) {
          this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
          this.parentNode = null;
        }
      },
      contains(child) {
        return this.children.indexOf(child) >= 0;
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 640, height: 300 };
      },
      addEventListener() {},
      removeEventListener() {},
      getContext() {
        return ctx;
      },
      ownerDocument: doc,
    };
    return el;
  };

  doc.createElement = createElement;
  return doc;
}

/** 建立全局环境，返回 flush() 用来同步执行排队的 rAF 回调 */
function setupEnvironment() {
  const doc = createDom();
  let queue = [];

  globalThis.document = doc;
  globalThis.window = {
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.requestAnimationFrame = (fn) => {
    queue.push(fn);
    return queue.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  return {
    doc,
    flush() {
      const current = queue;
      queue = [];
      current.forEach((fn) => fn());
    },
  };
}

const LOCATIONS = [
  { name: '西湖', address: '浙江省杭州市西湖区', lng: 120.148, lat: 30.242, terrainType: 'water' },
  { name: '泰山', address: '山东省泰安市', lng: 117.111, lat: 36.257, terrainType: 'mountain' },
  { name: '华北平原', address: '北京市', lng: 116.407, lat: 39.904, terrainType: 'plain' },
];

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.copyFileSync(SOURCE, TMP_MODULE);

  console.log('\n离线模拟地图单元测试');
  console.log('────────────────────────────────────────');

  const env = setupEnvironment();
  const { MockMap } = await import(url.pathToFileURL(TMP_MODULE).href);

  const container = env.doc.createElement('div');
  const picked = [];
  const map = new MockMap(container, {
    center: { lng: 112, lat: 32 },
    spanLng: 46,
    locations: LOCATIONS,
    onPick: (p) => picked.push(p),
  });
  env.flush();

  await testCase('构造后画布与提示已挂载到容器', async () => {
    assert.strictEqual(container.children.length, 3, '应有 canvas + 提示 + 角标');
    assert.ok(map.canvas.tagName === 'canvas');
    assert.ok(container.contains(map.canvas));
  });

  await testCase('绘制流程完整执行且无非法 API', async () => {
    const calls = map.canvas._calls;
    assert.ok(calls.length > 30, '绘图调用过少，可能没画出来：' + calls.length);
    const names = calls.map((c) => c[0]);
    ['clearRect', 'fillRect', 'beginPath', 'arc', 'fill'].forEach((required) => {
      assert.ok(names.indexOf(required) >= 0, '缺少绘图调用：' + required);
    });
    assert.ok(names.indexOf('fillText') >= 0, '应绘制文字（坐标/图例）');
  });

  await testCase('经纬度 ↔ 像素 往返换算一致', async () => {
    const samples = [
      { lng: 112, lat: 32 },
      { lng: 120.148, lat: 30.242 },
      { lng: 73.5, lat: 18.2 },
      { lng: 135.1, lat: 53.5 },
    ];
    for (const point of samples) {
      const p = map.project(point.lng, point.lat);
      const back = map.unproject(p.x, p.y);
      assert.ok(Math.abs(back.lng - point.lng) < 1e-6, '经度往返误差过大：' + back.lng);
      assert.ok(Math.abs(back.lat - point.lat) < 1e-6, '纬度往返误差过大：' + back.lat);
    }
  });

  await testCase('视图中心映射到画布几何中心', async () => {
    const p = map.project(map.center.lng, map.center.lat);
    assert.ok(Math.abs(p.x - map.width / 2) < 0.5, 'x 不在中心: ' + p.x);
    assert.ok(Math.abs(p.y - map.height / 2) < 0.5, 'y 不在中心: ' + p.y);
  });

  await testCase('点击位置能命中最近的已知地点', async () => {
    const westLake = LOCATIONS[0];
    const p = map.project(westLake.lng, westLake.lat);
    const hit = map._nearestLocation(p.x + 3, p.y + 2, 16);
    assert.ok(hit, '应命中地点');
    assert.strictEqual(hit.name, '西湖');

    const miss = map._nearestLocation(p.x + 200, p.y + 120, 16);
    assert.strictEqual(miss, null, '远处不应命中任何地点');
  });

  await testCase('setMarker / setCenter / highlight 可正常重绘', async () => {
    map.setMarker({ lng: 120.148, lat: 30.242 });
    map.setCenter(120.148, 30.242, { spanLng: 26, selectedKey: '西湖' });
    map.highlightLocation('泰山');
    env.flush();
    assert.ok(map.marker && Math.abs(map.marker.lng - 120.148) < 1e-9);
    assert.strictEqual(map.selectedKey, '泰山');
    assert.ok(map.spanLng > 0);
  });

  await testCase('缩放被限制在合理区间', async () => {
    map.spanLng = 1e9;
    map._clampSpan(map.spanLng);
    assert.ok(map._clampSpan(1e9) <= 240, '最大跨度应被限制');
    assert.ok(map._clampSpan(0.0001) >= 6, '最小跨度应被限制');
  });

  await testCase('destroy 后画布被移除且不再绘制', async () => {
    map.destroy();
    env.flush();
    assert.strictEqual(container.children.length, 0, '容器应被清空');
    assert.strictEqual(map.canvas, null);
    map.render(); // 销毁后再调用不应抛异常
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
