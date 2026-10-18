#!/usr/bin/env node
/**
 * 命令行构建鸿蒙 HAP（不需要打开 DevEco Studio 图形界面）
 *
 * 为什么需要这个脚本：
 *   hvigor 依赖三样东西才肯干活，缺一个就报错，而且报错信息很不直观：
 *     1. DEVECO_SDK_HOME —— SDK 位置（否则找不到编译工具链）
 *     2. JAVA_HOME       —— 打包阶段要 spawn java（否则 "spawn java ENOENT"）
 *     3. HVIGOR_USER_HOME / npm 缓存 —— 可写的用户目录
 *   本脚本会自动定位 DevEco Studio 安装目录并把这些环境变量配好。
 *
 * 用法：
 *   npm run harmonyos:build              # 默认 debug
 *   npm run harmonyos:build -- release    # release 构建
 *
 * 注意：产物是**未签名** HAP（入口 debug 构建）。
 *       要装到真机上，签名仍需在 DevEco Studio 里配置：
 *       File → Project Structure → Signing Configs → 勾选自动签名。
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.join(ROOT, 'harmonyos');
const WORKSPACE = path.resolve(ROOT, '..');

const buildMode = process.argv[2] === 'release' ? 'release' : 'debug';

/** 候选的 DevEco Studio 安装目录（按优先级） */
function findDevEcoHome() {
  const candidates = [];

  if (process.env.DEVECO_HOME) candidates.push(process.env.DEVECO_HOME);

  // 本次实测可用的路径
  candidates.push('D:\\huawei-devp\\DevEco Studio');

  candidates.push(
    'C:\\Program Files\\Huawei\\DevEco Studio',
    'C:\\Program Files\\DevEco Studio',
    '/Applications/DevEco-Studio.app/Contents',
    path.join(os.homedir(), 'DevEco Studio')
  );

  for (const dir of candidates) {
    if (!dir) continue;
    const hasSdk = fs.existsSync(path.join(dir, 'sdk'));
    const hasHvigor =
      fs.existsSync(path.join(dir, 'tools', 'hvigor', 'bin', 'hvigorw.bat')) ||
      fs.existsSync(path.join(dir, 'tools', 'hvigor', 'bin', 'hvigorw'));
    if (hasSdk && hasHvigor) return dir;
  }
  return null;
}

function fail(message) {
  console.error(`\n[harmonyos:build] ❌ ${message}\n`);
  process.exit(1);
}

function main() {
  console.log('[harmonyos:build] 准备构建鸿蒙 HAP…');

  if (!fs.existsSync(PROJECT)) fail('未找到 harmonyos/ 工程目录');

  const www = path.join(PROJECT, 'entry', 'src', 'main', 'resources', 'rawfile', 'www');
  if (!fs.existsSync(path.join(www, 'index.html'))) {
    fail('rawfile/www 里没有网页产物，请先执行 npm run build:harmonyos');
  }

  const ideHome = findDevEcoHome();
  if (!ideHome) {
    fail(
      '未找到 DevEco Studio 安装目录。\n' +
        '               请设置环境变量 DEVECO_HOME 指向安装目录，例如：\n' +
        '                 $env:DEVECO_HOME = "D:\\huawei-devp\\DevEco Studio"'
    );
  }
  console.log('[harmonyos:build] DevEco Studio:', ideHome);

  const isWin = process.platform === 'win32';
  // 直接调用 hvigorw.js（而不是 hvigorw.bat）：
  // DevEco 安装路径通常带空格（如 "D:\...\DevEco Studio"），
  // 走 shell 会因路径没加引号而失败；用 node 直接启动可完全绕开这个问题。
  const hvigorJs = path.join(ideHome, 'tools', 'hvigor', 'bin', 'hvigorw.js');
  const nodeExe = path.join(ideHome, 'tools', 'node', isWin ? 'node.exe' : 'node');
  const jbr = path.join(ideHome, 'jbr');

  if (!fs.existsSync(hvigorJs)) fail(`未找到 hvigor 入口：${hvigorJs}`);
  if (!fs.existsSync(nodeExe)) fail(`未找到 DevEco 自带 node：${nodeExe}`);

  const env = {
    ...process.env,
    DEVECO_SDK_HOME: path.join(ideHome, 'sdk'),
    // 用户目录与缓存放到工作区，避免写系统盘或权限问题
    HVIGOR_USER_HOME: path.join(WORKSPACE, '.hvigor'),
    npm_config_cache: path.join(WORKSPACE, '.npm-cache'),
    PATH: [
      path.join(jbr, 'bin'),
      path.join(ideHome, 'tools', 'node'),
      path.join(ideHome, 'tools', 'hvigor', 'bin'),
      process.env.PATH || '',
    ].join(path.delimiter),
  };

  if (fs.existsSync(path.join(jbr, 'bin', isWin ? 'java.exe' : 'java'))) {
    env.JAVA_HOME = jbr;
  } else {
    console.warn('[harmonyos:build] ⚠️ 未找到自带 JDK，打包阶段可能报 spawn java ENOENT');
  }

  const args = [
    'assembleHap',
    '--mode',
    'module',
    '-p',
    'product=default',
    '-p',
    `buildMode=${buildMode}`,
    '--no-daemon',
  ];

  console.log(`[harmonyos:build] 执行: hvigor ${args.join(' ')}\n`);

  const result = spawnSync(nodeExe, [hvigorJs, ...args], {
    cwd: PROJECT,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(`构建失败（退出码 ${result.status}）`);
  }

  // 找到产物
  const outputs = path.join(PROJECT, 'entry', 'build', 'default', 'outputs', 'default');
  if (fs.existsSync(outputs)) {
    const haps = fs.readdirSync(outputs).filter((f) => f.endsWith('.hap'));
    if (haps.length > 0) {
      console.log('\n[harmonyos:build] ✅ 构建成功');
      for (const f of haps) {
        const size = (fs.statSync(path.join(outputs, f)).size / 1024 / 1024).toFixed(2);
        console.log(`  产物: ${path.relative(ROOT, path.join(outputs, f))}  (${size} MB)`);
      }
      console.log('  提示: 未签名的 HAP 不能直接装真机，请在 DevEco Studio 里配置自动签名。\n');
    }
  }
}

main();
