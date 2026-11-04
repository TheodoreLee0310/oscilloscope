#!/usr/bin/env node
/**
 * 一致性备份 SQLite 数据库。
 *
 * 为什么不能直接复制 .sqlite 文件：WAL 模式下还有 -wal / -shm，
 * 运行中直接拷这三个文件可能得到**不一致**的快照。
 * 这里用 SQLite 自带的 `VACUUM INTO`，由数据库自己保证一致性。
 *
 * 用法：
 *   node server/backup-db.js                       # 备份默认库到同目录带时间戳的文件
 *   node server/backup-db.js <源库> [目标文件]
 *
 * 建议：仍然先停止服务再备份（最稳妥）；本脚本只是让"不停服"也有可靠办法。
 */
const fs = require('node:fs');
const path = require('node:path');

// node:sqlite 在 Node 22+ 是实验特性，需要显式开关
const { DatabaseSync } = require('node:sqlite');

function stamp() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function main() {
  const source = path.resolve(process.argv[2] ||
    path.join(__dirname, 'data', 'oscilloscope.sqlite'));
  if (!fs.existsSync(source)) {
    console.error(`源数据库不存在：${source}`);
    process.exit(1);
  }
  const target = path.resolve(process.argv[3] ||
    source.replace(/\.sqlite$/i, '') + `-backup-${stamp()}.sqlite`);
  if (fs.existsSync(target)) {
    console.error(`目标文件已存在，拒绝覆盖：${target}`);
    process.exit(1);
  }

  const db = new DatabaseSync(source);
  try {
    // 转义单引号，避免路径里的引号破坏 SQL
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const size = fs.statSync(target).size;
  console.log(`已生成一致性备份：${target}（${(size / 1024).toFixed(1)} KB）`);
  console.log('恢复方式：停止服务 → 用备份文件替换源库 → 删除同目录的 -wal / -shm → 启动服务。');
}

main();
