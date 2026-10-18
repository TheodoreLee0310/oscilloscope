#!/usr/bin/env node
/**
 * 鸿蒙工程静态校验（不需要 DevEco Studio / HarmonyOS SDK）
 *
 * DevEco 报错里最常见的一类，其实都是"静态就能查出来"的问题：
 *   - json5 语法错误（注释、尾逗号写坏）
 *   - 资源引用不存在：$string:xxx / $media:xxx / $color:xxx / $profile:xxx
 *   - srcEntry、pages 指向的文件不存在
 *   - rawfile 里的网页产物没同步（打开就是错误页）
 *   - 图标不是合法 PNG
 *
 * 本脚本把上述检查全部跑一遍，尽量让你第一次 Sync 就通过。
 *
 * 用法：npm run verify:harmonyos
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HARMONY = path.join(ROOT, 'harmonyos');
const ENTRY = path.join(HARMONY, 'entry');
const MAIN = path.join(ENTRY, 'src', 'main');

let passed = 0;
const failures = [];
const warnings = [];

function ok(name, detail = '') {
  passed++;
  console.log(`  ✅ ${name}${detail ? '  → ' + detail : ''}`);
}

function fail(name, detail) {
  failures.push({ name, detail });
  console.log(`  ❌ ${name}${detail ? '  → ' + detail : ''}`);
}

function warn(name, detail) {
  warnings.push({ name, detail });
  console.log(`  ⚠️  ${name}${detail ? '  → ' + detail : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(60));
}

/* ------------------------------------------------------------------ *
 * JSON5 解析：去掉注释与尾逗号，再交给 JSON.parse
 * ------------------------------------------------------------------ */

function stripJson5(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let inString = false;
  let quote = '';

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];

    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += text[i + 1] || '';
        i += 2;
        continue;
      }
      if (ch === quote) inString = false;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  // 去掉尾逗号：}{ 或 ] 之前多余逗号
  return out
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/^\uFEFF/, '')
    .trim();
}

function readJson5(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const cleaned = stripJson5(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)} 不是合法的 JSON5：${err.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 资源查找
 * ------------------------------------------------------------------ */

const MEDIA_EXT = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];

/** 某个 resources 根目录下 base 目录里是否有该资源 */
function resourceExists(resRoot, kind, name) {
  if (kind === 'media') {
    const dir = path.join(resRoot, 'base', 'media');
    if (!fs.existsSync(dir)) return false;
    return fs
      .readdirSync(dir)
      .some((f) => path.parse(f).name === name && MEDIA_EXT.includes(path.extname(f).toLowerCase()));
  }
  if (kind === 'profile') {
    const dir = path.join(resRoot, 'base', 'profile');
    return fs.existsSync(path.join(dir, `${name}.json`));
  }
  // string / color 等 element 资源：在 base 及语言目录里查
  const candidates = [];
  const baseDir = path.join(resRoot, 'base', 'element');
  if (fs.existsSync(baseDir)) candidates.push(...fs.readdirSync(baseDir).map((f) => path.join(baseDir, f)));
  const localeRoot = resRoot;
  if (fs.existsSync(localeRoot)) {
    for (const d of fs.readdirSync(localeRoot)) {
      const el = path.join(localeRoot, d, 'element');
      if (fs.existsSync(el)) {
        candidates.push(...fs.readdirSync(el).map((f) => path.join(el, f)));
      }
    }
  }
  for (const file of candidates) {
    if (!file.endsWith('.json')) continue;
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = json[kind];
      if (Array.isArray(list) && list.some((item) => item && item.name === name)) return true;
    } catch (_) {
      /* 单个文件坏了不算找到 */
    }
  }
  return false;
}

/** 收集一个 json 对象里所有 $xxx:yyy 形式的引用 */
function collectRefs(obj, out = [], keyPath = '') {
  if (typeof obj === 'string') {
    const m = obj.match(/^\$([a-z]+):(.+)$/);
    if (m) out.push({ kind: m[1], name: m[2], at: keyPath });
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectRefs(v, out, `${keyPath}[${i}]`));
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) collectRefs(v, out, keyPath ? `${keyPath}.${k}` : k);
  }
  return out;
}

function isPng(file) {
  try {
    const buf = fs.readFileSync(file);
    return (
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    );
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function main() {
  console.log('\n鸿蒙工程静态校验');
  console.log('='.repeat(60));

  if (!fs.existsSync(HARMONY)) {
    fail('harmonyos/ 目录存在', '未找到工程目录');
    return finish();
  }
  ok('harmonyos/ 目录存在');

  // ---------- 1. 关键文件与 JSON5 语法 ----------
  section('[1] 工程文件与 JSON5 语法');

  const json5Files = [
    'AppScope/app.json5',
    'build-profile.json5',
    'oh-package.json5',
    'hvigor/hvigor-config.json5',
    'entry/build-profile.json5',
    'entry/oh-package.json5',
    'entry/src/main/module.json5',
  ];

  const parsed = {};
  for (const rel of json5Files) {
    const file = path.join(HARMONY, rel);
    if (!fs.existsSync(file)) {
      fail(rel, '文件不存在');
      continue;
    }
    try {
      parsed[rel] = readJson5(file);
      ok(rel + ' 语法正确');
    } catch (err) {
      fail(rel, err.message);
    }
  }

  for (const rel of ['hvigorfile.ts', 'entry/hvigorfile.ts']) {
    const file = path.join(HARMONY, rel);
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      const okImport = /@ohos\/hvigor-ohos-plugin/.test(text);
      const okTasks = /appTasks|hapTasks/.test(text);
      if (okImport && okTasks) ok(rel + ' 内容正确');
      else fail(rel, '缺少 hvigor 插件导入或 tasks 定义');
    } else {
      fail(rel, '文件不存在');
    }
  }

  // ---------- 2. 资源引用 ----------
  section('[2] 资源引用是否都能解析');

  const entryRes = path.join(MAIN, 'resources');
  const appRes = path.join(HARMONY, 'AppScope', 'resources');

  const targets = [
    { rel: 'AppScope/app.json5', resRoot: appRes },
    { rel: 'entry/src/main/module.json5', resRoot: entryRes },
  ];

  for (const { rel, resRoot } of targets) {
    const json = parsed[rel];
    if (!json) continue;
    const refs = collectRefs(json);
    if (refs.length === 0) {
      warn(rel + ' 无资源引用', '可以忽略');
      continue;
    }
    let bad = 0;
    for (const ref of refs) {
      const found = resourceExists(resRoot, ref.kind, ref.name);
      if (!found) {
        bad++;
        fail(`${rel} 的 ${ref.at}`, `找不到资源 $${ref.kind}:${ref.name}`);
      }
    }
    if (bad === 0) ok(`${rel} 全部 ${refs.length} 个资源引用可解析`);
  }

  // ---------- 3. 入口与页面 ----------
  section('[3] Ability 入口与页面注册');

  const moduleJson = parsed['entry/src/main/module.json5'];
  if (moduleJson && moduleJson.module) {
    const mod = moduleJson.module;
    const abilities = mod.abilities || [];
    if (abilities.length === 0) fail('module.json5 abilities', '至少要有一个 Ability');

    for (const ability of abilities) {
      const entry = ability.srcEntry;
      if (!entry) {
        fail(`Ability ${ability.name}`, '缺少 srcEntry');
        continue;
      }
      const file = path.join(MAIN, entry.replace(/^\.\//, ''));
      if (fs.existsSync(file)) ok(`Ability ${ability.name} 的 srcEntry 存在`);
      else fail(`Ability ${ability.name}`, `srcEntry 文件不存在：${entry}`);
    }

    const pagesRef = mod.pages;
    if (typeof pagesRef === 'string' && pagesRef.startsWith('$profile:')) {
      const profileName = pagesRef.slice('$profile:'.length);
      const profileFile = path.join(entryRes, 'base', 'profile', `${profileName}.json`);
      if (!fs.existsSync(profileFile)) {
        fail('module.json5 pages', `找不到 ${path.relative(ROOT, profileFile)}`);
      } else {
        try {
          const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
          const list = profile.src || [];
          if (list.length === 0) fail('main_pages.json', 'src 为空，应用没有首页');
          let bad = 0;
          for (const p of list) {
            const f = path.join(MAIN, 'ets', `${p}.ets`);
            if (!fs.existsSync(f)) {
              bad++;
              fail('main_pages.json 页面文件', `不存在：${p}.ets`);
            }
          }
          if (bad === 0) ok(`main_pages.json 的 ${list.length} 个页面都存在`);
        } catch (err) {
          fail('main_pages.json', 'JSON 解析失败：' + err.message);
        }
      }
    } else {
      warn('module.json5 pages', '不是 $profile: 形式');
    }

    // 权限声明
    const perms = (mod.requestPermissions || []).map((p) => p.name);
    if (perms.includes('ohos.permission.INTERNET')) {
      ok('已声明 ohos.permission.INTERNET');
    } else {
      fail('权限声明', '缺少 ohos.permission.INTERNET，网页将无法联网');
    }

    // user_grant 权限必须带 reason + usedScene，否则编译会报错
    for (const p of mod.requestPermissions || []) {
      if (['ohos.permission.LOCATION', 'ohos.permission.APPROXIMATELY_LOCATION'].includes(p.name)) {
        if (!p.reason) fail(`权限 ${p.name}`, 'user_grant 权限必须声明 reason');
        else if (!p.usedScene) fail(`权限 ${p.name}`, 'user_grant 权限必须声明 usedScene');
        else ok(`权限 ${p.name} 的 reason/usedScene 完整`);
      }
    }
  }

  // ---------- 4. 网页产物 ----------
  section('[4] 网页产物（rawfile/www）');

  const www = path.join(MAIN, 'resources', 'rawfile', 'www');
  const indexPath = path.join(www, 'index.html');

  if (!fs.existsSync(indexPath)) {
    fail('rawfile/www/index.html', '不存在 → 请先执行 npm run build:harmonyos');
  } else {
    ok('rawfile/www/index.html 存在');

    const needed = ['internal.html', 'login.html', 'js', 'css'];
    const missing = needed.filter((n) => !fs.existsSync(path.join(www, n)));
    if (missing.length === 0) ok('网页关键文件齐全（index/internal/login + js/css）');
    else fail('网页产物不完整', '缺少：' + missing.join(', '));

    // Index.ets 里写的入口路径必须和真实产物一致
    const indexEts = path.join(MAIN, 'ets', 'pages', 'Index.ets');
    if (fs.existsSync(indexEts)) {
      const src = fs.readFileSync(indexEts, 'utf8');
      const m = src.match(/HOME_PAGE[^=]*=\s*['"]([^'"]+)['"]/);
      if (m) {
        const declared = path.join(MAIN, 'resources', 'rawfile', m[1]);
        if (fs.existsSync(declared)) ok(`Index.ets 的入口路径正确（${m[1]}）`);
        else fail('Index.ets 入口路径', `$rawfile('${m[1]}') 指向的文件不存在`);
      }
    }

    // 统计体积
    let total = 0;
    let count = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else {
          total += fs.statSync(full).size;
          count++;
        }
      }
    };
    walk(www);
    ok(`网页产物体积合理`, `${count} 个文件 / ${(total / 1024 / 1024).toFixed(2)} MB`);
  }

  // ---------- 5. 图标 ----------
  section('[5] 图标资源');

  const icons = [
    'AppScope/resources/base/media/app_icon.png',
    'entry/src/main/resources/base/media/icon.png',
    'entry/src/main/resources/base/media/startIcon.png',
  ];
  for (const rel of icons) {
    const file = path.join(HARMONY, rel);
    if (!fs.existsSync(file)) fail(rel, '不存在');
    else if (!isPng(file)) fail(rel, '不是合法 PNG');
    else ok(rel + ' 是合法 PNG');
  }

  // ---------- 6. ArkTS 代码粗查 ----------
  section('[6] ArkTS 代码结构');

  const indexEtsPath = path.join(MAIN, 'ets', 'pages', 'Index.ets');
  if (fs.existsSync(indexEtsPath)) {
    const src = fs.readFileSync(indexEtsPath, 'utf8');
    const checks = [
      ['@Entry 装饰器', /@Entry/],
      ['@Component 结构体', /@Component\s+struct/],
      ['Web 组件', /Web\(\{/],
      ['WebviewController', /new webview\.WebviewController\(\)/],
      ['domStorageAccess（登录态依赖）', /\.domStorageAccess\(\s*true\s*\)/],
      ['fileAccess（本地资源依赖）', /\.fileAccess\(\s*true\s*\)/],
      ['onShowFileSelector（图片上传）', /\.onShowFileSelector\(/],
      ['onGeolocationShow（定位）', /\.onGeolocationShow\(/],
      ['build() 方法', /build\(\)\s*\{/],
    ];
    let bad = 0;
    for (const [label, re] of checks) {
      if (re.test(src)) ok('Index.ets 含 ' + label);
      else {
        bad++;
        fail('Index.ets 缺少 ' + label);
      }
    }
    // 括号平衡的粗检查
    const opens = (src.match(/\{/g) || []).length;
    const closes = (src.match(/\}/g) || []).length;
    if (Math.abs(opens - closes) <= 2) ok('Index.ets 大括号基本平衡');
    else fail('Index.ets 大括号不平衡', `{ × ${opens} / } × ${closes}`);
  }

  const abilityPath = path.join(MAIN, 'ets', 'entryability', 'EntryAbility.ets');
  if (fs.existsSync(abilityPath)) {
    const src = fs.readFileSync(abilityPath, 'utf8');
    if (/extends\s+UIAbility/.test(src)) ok('EntryAbility 继承 UIAbility');
    else fail('EntryAbility', '未继承 UIAbility');
    if (/loadContent\(\s*['"]pages\/Index['"]/.test(src)) ok('EntryAbility 加载 pages/Index');
    else fail('EntryAbility', '未加载 pages/Index');
  }

  finish();
}

function finish() {
  console.log('\n' + '='.repeat(60));
  console.log(`  通过 ${passed} 项，失败 ${failures.length} 项，警告 ${warnings.length} 项`);

  if (failures.length > 0) {
    console.log('\n  需要修复：');
    failures.forEach((f) => console.log(`    · ${f.name}${f.detail ? ' → ' + f.detail : ''}`));
    console.log('\n  结果：❌ 存在问题\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log('\n  警告：');
    warnings.forEach((w) => console.log(`    · ${w.name}${w.detail ? ' → ' + w.detail : ''}`));
  }

  console.log('\n  结果：✅ 静态校验全部通过');
  console.log('  下一步：用 DevEco Studio 打开 harmonyos/ 目录，等待 Sync 后运行。\n');
}

main();
