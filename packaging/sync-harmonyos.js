#!/usr/bin/env node
/**
 * 把 Web 构建产物（docs/）同步到鸿蒙工程的本地资源目录（rawfile/www）。
 *
 * 为什么要同步而不是直接提交两份：
 *   docs/  是 Web 端（浏览器 / GitHub Pages / Electron）的发布产物；
 *   rawfile/www 是鸿蒙应用内 Web 组件加载的本地资源。
 *   两者内容完全一致，没必要在仓库里存两份，因此 rawfile/www 被 .gitignore 忽略，
 *   每次构建后执行一次本脚本生成即可。
 *
 * 用法：
 *   npm run harmonyos:sync        # 只同步（要求 docs/ 已存在）
 *   npm run build:harmonyos       # 先构建 Web 产物，再同步
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'docs');
const TARGET_DIR = path.join(
  ROOT,
  'harmonyos',
  'entry',
  'src',
  'main',
  'resources',
  'rawfile',
  'www'
);

/** 网页运行时必须有这些文件，缺任何一个都会白屏 */
const REQUIRED_ENTRIES = ['index.html', 'internal.html', 'login.html', 'js', 'css'];

function fail(message) {
  console.error(`\n[harmonyos:sync] ❌ ${message}\n`);
  process.exit(1);
}

function dirSize(dir) {
  let total = 0;
  let files = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
        files += 1;
      }
    }
  };
  walk(dir);
  return { total, files };
}

function main() {
  console.log('[harmonyos:sync] 开始同步 Web 产物到鸿蒙工程…');

  // 1. 源目录必须存在
  if (!fs.existsSync(SOURCE_DIR)) {
    fail(
      `未找到构建产物目录：${SOURCE_DIR}\n` +
        '               请先执行 npm run build（或直接使用 npm run build:harmonyos）。'
    );
  }

  // 2. 校验关键文件
  const missing = REQUIRED_ENTRIES.filter((name) => !fs.existsSync(path.join(SOURCE_DIR, name)));
  if (missing.length > 0) {
    fail(
      `构建产物不完整，缺少：${missing.join(', ')}\n` +
        '               请重新执行 npm run build 后再同步。'
    );
  }

  // 3. 删除目标目录前先确认路径确实在工程内（防止误删）
  const expectedPrefix = path.join(ROOT, 'harmonyos') + path.sep;
  if (!TARGET_DIR.startsWith(expectedPrefix)) {
    fail(`目标路径异常，已中止：${TARGET_DIR}`);
  }
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(TARGET_DIR), { recursive: true });

  // 4. 递归复制
  fs.cpSync(SOURCE_DIR, TARGET_DIR, { recursive: true });

  const { total, files } = dirSize(TARGET_DIR);
  console.log(`[harmonyos:sync] ✅ 同步完成`);
  console.log(` 来源：${path.relative(ROOT, SOURCE_DIR)}`);
  console.log(` 目标：${path.relative(ROOT, TARGET_DIR)}`);
  console.log(` 文件：${files} 个，共 ${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log(' 下一步：用 DevEco Studio 打开 harmonyos/ 目录，连接设备后点击运行。');
}

main();
