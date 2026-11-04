// Node.js >=22.13; no separately installed database service required.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { validateState } = require('../shared/experiment-state');
const scrypt = promisify(crypto.scrypt);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const SBQ_EXPORT_FORMAT = 'sbq-experiments';
const failure = (status, message) => Object.assign(new Error(message), { status });
const publicUser = u => ({ id: u.id, username: u.username, nickname: u.nickname, createdAt: u.created_at });

function createServer(options = {}) {
  const filename = options.dbPath || process.env.SBQ_DB_PATH || path.join(__dirname, 'data', 'oscilloscope.sqlite');
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nickname TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, notes TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS experiments_user ON experiments(user_id, created_at);`);
  // ---------------------------------------------------------------
  // 迁移：旧库没有同步所需字段，逐列补齐（幂等，可重复执行）
  // 目的：同步协议需要 (user_id, client_id) 幂等键与 rev 版本号；
  // 原则：不删除、不重写既有行，只补列与索引，updated_at 用 created_at 回填。
  // ---------------------------------------------------------------
  const experimentColumns = db.prepare('PRAGMA table_info(experiments)').all().map(column => column.name);
  for (const [name, ddl] of [
    ['client_id', 'TEXT'],
    ['rev', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', 'TEXT'],
    ['deleted', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_op_id', 'TEXT'],
  ]) {
    if (!experimentColumns.includes(name)) db.exec(`ALTER TABLE experiments ADD COLUMN ${name} ${ddl}`);
  }
  db.exec(`UPDATE experiments SET updated_at = created_at WHERE updated_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS experiments_client ON experiments(user_id, client_id);
    CREATE TABLE IF NOT EXISTS sync_operations (
      user_id INTEGER NOT NULL,
      operation_id TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, operation_id));`);
  // 幂等记录只保留 7 天，避免无限增长
  db.prepare('DELETE FROM sync_operations WHERE created_at < ?')
    .run(new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
  const docRoot = path.resolve(options.docsPath || path.join(__dirname, '..', 'docs'));
  const attempts = new Map();
  const authLimit = options.authLimit ?? 30;
  const sessionMs = options.sessionMs ?? 7 * 24 * 3600 * 1000;
  function rateLimit(req) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = req.socket.remoteAddress;
    const entry = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(key, entry);
    if (++entry.count > authLimit) throw failure(429, '操作过于频繁，请稍后再试');
  }
  function session(user) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    const expiresAt = Date.now() + sessionMs;
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), user.id, expiresAt);
    // 下发过期时间，客户端据此区分「令牌仍可上传」与「仅能本地使用」
    return { token, user: publicUser(user), expiresAt: new Date(expiresAt).toISOString() };
  }
  function authenticate(req) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    if (!match) throw failure(401, '请先登录，游客不能保存实验');
    const tokenHash = hash(match[1]);
    const user = db.prepare(`SELECT users.*, sessions.expires_at AS session_expires_at FROM users
      JOIN sessions ON users.id=sessions.user_id
      WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(tokenHash, Date.now());
    if (!user) throw failure(401, '登录已过期，请重新登录');
    return { user, tokenHash, expiresAt: user.session_expires_at };
  }

  /* ------------------------------------------------------------------ *
   * 同步协议（手动触发）
   *   - 幂等：同一 (user_id, operation_id) 只执行一次，重放返回缓存结果
   *   - 版本：客户端携带 baseServerRev，与服务器 rev 原子比较，不匹配即冲突
   *   - 墓碑：已删除的记录不会被 update 复活；delete 重放是幂等的
   * ------------------------------------------------------------------ */

  function checkSyncTitle(value) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 80) {
      throw failure(400, '标题需为 1–80 位');
    }
    return value.trim();
  }

  function checkSyncNotes(value) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string' || value.length > 2000) throw failure(400, '备注不能超过 2000 位');
    return value;
  }

  function syncItem(row) {
    let stateVersion = 0;
    try { stateVersion = JSON.parse(row.state).version || 0; } catch (_) { stateVersion = 0; }
    return {
      id: row.id,
      clientId: row.client_id,
      title: row.title,
      notes: row.notes,
      rev: row.rev,
      updatedAt: row.updated_at,
      deleted: row.deleted === 1,
      stateVersion,
    };
  }

  function applySyncOperation(input, user) {
    const operationId = typeof input.operationId === 'string' ? input.operationId : '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(operationId)) throw failure(400, 'operationId 格式不正确');
    const type = input.type;
    if (type !== 'create' && type !== 'update' && type !== 'delete') {
      throw failure(400, 'type 必须是 create / update / delete');
    }
    const clientId = typeof input.clientId === 'string' ? input.clientId : '';
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(clientId)) throw failure(400, 'clientId 格式不正确');
    const baseServerRev = Number.isInteger(input.baseServerRev) ? input.baseServerRev : -1;
    if (baseServerRev < 0) throw failure(400, 'baseServerRev 必须是非负整数');

    // 幂等：重放同一 operationId 直接返回上次结果（含冲突、墓碑等所有分支）
    const cached = db.prepare('SELECT response FROM sync_operations WHERE user_id=? AND operation_id=?')
      .get(user.id, operationId);
    if (cached) return JSON.parse(cached.response);

    const now = new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM experiments WHERE user_id=? AND client_id=?').get(user.id, clientId);
      let outcome;
      if (type === 'create') {
        if (row) {
          // (user_id, client_id) 已存在：重复创建被吸收，不新增行
          outcome = { status: 'applied', created: false, item: syncItem(row) };
        } else {
          const title = checkSyncTitle(input.title);
          const notes = checkSyncNotes(input.notes);
          const state = validateState(input.state);
          const active = db.prepare('SELECT count(*) AS n FROM experiments WHERE user_id=? AND deleted=0').get(user.id).n;
          if (active >= 500) throw failure(409, '最多保存 500 条实验，请先删除旧记录');
          const id = crypto.randomUUID();
          db.prepare(`INSERT INTO experiments
            (id,user_id,title,notes,state,created_at,client_id,rev,updated_at,deleted,last_op_id)
            VALUES (?,?,?,?,?,?,?,1,?,0,?)`)
            .run(id, user.id, title, notes, JSON.stringify(state), now, clientId, now, operationId);
          outcome = {
            status: 'applied', created: true,
            item: syncItem(db.prepare('SELECT * FROM experiments WHERE id=?').get(id)),
          };
        }
      } else if (!row) {
        outcome = { status: 'not-found' };
      } else if (row.deleted === 1) {
        // 墓碑优先：update 不能复活已删除记录；delete 重放视为成功
        outcome = type === 'delete'
          ? { status: 'applied', created: false, item: syncItem(row) }
          : { status: 'deleted', item: syncItem(row) };
      } else if (row.rev !== baseServerRev) {
        // 原子版本比较：不覆盖，返回服务器当前状态，由客户端保留双方数据
        outcome = { status: 'conflict', item: syncItem(row) };
      } else if (type === 'update') {
        const title = checkSyncTitle(input.title);
        const notes = checkSyncNotes(input.notes);
        const state = validateState(input.state);
        db.prepare('UPDATE experiments SET title=?,notes=?,state=?,rev=rev+1,updated_at=?,last_op_id=? WHERE id=?')
          .run(title, notes, JSON.stringify(state), now, operationId, row.id);
        outcome = {
          status: 'applied', created: false,
          item: syncItem(db.prepare('SELECT * FROM experiments WHERE id=?').get(row.id)),
        };
      } else {
        db.prepare('UPDATE experiments SET deleted=1,rev=rev+1,updated_at=?,last_op_id=? WHERE id=?')
          .run(now, operationId, row.id);
        outcome = {
          status: 'applied', created: false,
          item: syncItem(db.prepare('SELECT * FROM experiments WHERE id=?').get(row.id)),
        };
      }
      db.prepare('INSERT INTO sync_operations VALUES(?,?,?,?)')
        .run(user.id, operationId, JSON.stringify(outcome), now);
      db.exec('COMMIT');
      return outcome;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async function body(req, maxBytes = 32768) {    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw failure(415, '请使用 JSON 请求');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw failure(413, '请求数据过大');
      chunks.push(chunk);
    }
    try {
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result;
    } catch { throw failure(400, 'JSON 格式不正确'); }
  }
  function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      if (route.startsWith('/api/')) {
        // Same-origin requests through this server or the development proxy only.
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
          throw failure(403, '不允许跨站请求');
        }
        if (req.method === 'GET' && route === '/api/health') return json(res, 200, { ok: true });
        if (req.method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(route)) {
          rateLimit(req);
          const data = await body(req);
          const username = typeof data.username === 'string' ? data.username.trim() : '';
          if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username) || typeof data.password !== 'string' || data.password.length < 8 || data.password.length > 128) {
            throw failure(400, '用户名需为 3–20 位字母、数字、中文、下划线或短横线；密码需为 8–128 位');
          }
          if (route.endsWith('/register')) {
            const nickname = data.nickname === undefined || data.nickname === '' ? username : data.nickname;
            if (typeof nickname !== 'string' || !nickname.trim() || nickname.length > 40) throw failure(400, '昵称需为 1–40 位');
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = (await scrypt(data.password, salt, 64)).toString('hex');
            try {
              const result = db.prepare('INSERT INTO users(username,nickname,password_hash,salt,created_at) VALUES(?,?,?,?,?)')
                .run(username, nickname.trim(), passwordHash, salt, new Date().toISOString());
              return json(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid)) });
            } catch (error) {
              if (error.message.includes('UNIQUE constraint')) throw failure(409, '该用户名已被注册');
              throw error;
            }
          }
          const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
          const candidate = await scrypt(data.password, user ? user.salt : 'invalid-user-salt', 64);
          if (!user || !crypto.timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) throw failure(401, '用户名或密码错误');
          return json(res, 200, session(user));
        }
        const { user, tokenHash, expiresAt } = authenticate(req);
        if (req.method === 'GET' && route === '/api/auth/me') {
          return json(res, 200, { user: publicUser(user), expiresAt: new Date(expiresAt).toISOString() });
        }
        if (req.method === 'POST' && route === '/api/auth/logout') {
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
          return json(res, 200, { ok: true });
        }
        // 同步协议入口：一次只处理一个操作，客户端用稳定 operationId 重试
        if (req.method === 'POST' && route === '/api/sync/apply') {
          return json(res, 200, applySyncOperation(await body(req), user));
        }
        if (req.method === 'GET' && route === '/api/experiments') {
          // 关键字搜索 + 分页（limit/offset）。不带参数时行为与旧版一致，
          // 只是多返回 total，原生客户端只读 items，因此向后兼容。
          const keyword = (url.searchParams.get('q') || '').trim().slice(0, 80);
          // 注意：不能用 `parseInt(x) || 100`，否则 limit=0 会被当成 falsy 变成 100
          const rawLimit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
          const rawOffset = Number.parseInt(url.searchParams.get('offset') || '0', 10);
          const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 200);
          const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
          let where = 'user_id=? AND deleted=0';
          const params = [user.id];
          if (keyword.length > 0) {
            const escaped = keyword.replace(/[\\%_]/g, m => '\\' + m);
            where += " AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')";
            params.push('%' + escaped + '%', '%' + escaped + '%');
          }
          const total = db.prepare(`SELECT count(*) AS n FROM experiments WHERE ${where}`).get(...params).n;
          const items = db.prepare(`SELECT id,title,notes,created_at AS createdAt,json_extract(state,'$.version') AS stateVersion
            FROM experiments WHERE ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
          return json(res, 200, { items, total, limit, offset });
        }
        if (req.method === 'POST' && route === '/api/experiments') {
          const data = await body(req);
          if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 80 || (data.notes !== undefined && (typeof data.notes !== 'string' || data.notes.length > 2000))) {
            throw failure(400, '标题需为 1–80 位，备注不能超过 2000 位');
          }
          let state;
          try { state = validateState(data.state); } catch (error) { throw failure(400, error.message); }
          if (db.prepare('SELECT count(*) AS n FROM experiments WHERE user_id=?').get(user.id).n >= 500) throw failure(409, '最多保存 500 条实验，请先删除旧记录');
          const item = { id: crypto.randomUUID(), title: data.title.trim(), notes: data.notes || '', state, createdAt: new Date().toISOString() };
          db.prepare(`INSERT INTO experiments (id,user_id,title,notes,state,created_at,rev,updated_at,deleted)
            VALUES (?,?,?,?,?,?,1,?,0)`).run(item.id, user.id, item.title, item.notes, JSON.stringify(state), item.createdAt, item.createdAt);
          return json(res, 201, { item });
        }
        // 导出：整份记录打包成一个 JSON，便于备份或跨设备迁移
        if (req.method === 'GET' && route === '/api/experiments/export') {
          const rows = db.prepare(`SELECT title,notes,state,created_at AS createdAt FROM experiments
            WHERE user_id=? AND deleted=0 ORDER BY created_at ASC, rowid ASC`).all(user.id);
          const items = rows.map(row => ({
            title: row.title, notes: row.notes, state: JSON.parse(row.state), createdAt: row.createdAt
          }));
          return json(res, 200, { format: SBQ_EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), items });
        }
        // 导入：逐条校验，非法记录跳过并回报原因，合法记录在同一事务内写入
        if (req.method === 'POST' && route === '/api/experiments/import') {
          const data = await body(req, 2 * 1024 * 1024);
          if (data.format !== undefined && data.format !== SBQ_EXPORT_FORMAT) throw failure(400, '导入文件格式不正确');
          if (!Array.isArray(data.items)) throw failure(400, '导入文件缺少 items 数组');
          if (data.items.length > 500) throw failure(400, '一次最多导入 500 条实验');
          const existing = db.prepare('SELECT count(*) AS n FROM experiments WHERE user_id=?').get(user.id).n;
          if (existing + data.items.length > 500) throw failure(409, '导入后记录将超过 500 条，请先删除旧记录');
          const errors = [];
          const rows = [];
          data.items.forEach((item, index) => {
            try {
              if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new Error('记录格式不正确');
              const title = typeof item.title === 'string' ? item.title.trim() : '';
              if (title.length === 0 || title.length > 80) throw new Error('标题需为 1–80 位');
              const notes = item.notes === undefined || item.notes === null ? '' : item.notes;
              if (typeof notes !== 'string' || notes.length > 2000) throw new Error('备注不能超过 2000 位');
              const state = validateState(item.state);
              const createdAt = typeof item.createdAt === 'string' && item.createdAt.length <= 40
                ? item.createdAt : new Date().toISOString();
              rows.push({ title, notes, state, createdAt });
            } catch (error) { errors.push('第 ' + (index + 1) + ' 条：' + error.message); }
          });
          const insert = db.prepare(`INSERT INTO experiments (id,user_id,title,notes,state,created_at,rev,updated_at,deleted)
            VALUES (?,?,?,?,?,?,1,?,0)`);
          db.exec('BEGIN');
          try {
            for (const row of rows) {
              insert.run(crypto.randomUUID(), user.id, row.title, row.notes, JSON.stringify(row.state), row.createdAt, row.createdAt);
            }
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return json(res, 201, { imported: rows.length, skipped: errors.length, errors: errors.slice(0, 10) });
        }
        const match = /^\/api\/experiments\/([a-f0-9-]{36})$/.exec(route);
        // 重命名 / 修改备注
        if (match && req.method === 'PUT') {
          const data = await body(req);
          const fields = [];
          const values = [];
          if (data.title !== undefined) {
            if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 80) throw failure(400, '标题需为 1–80 位');
            fields.push('title=?'); values.push(data.title.trim());
          }
          if (data.notes !== undefined) {
            if (typeof data.notes !== 'string' || data.notes.length > 2000) throw failure(400, '备注不能超过 2000 位');
            fields.push('notes=?'); values.push(data.notes);
          }
          if (fields.length === 0) throw failure(400, '请提供要修改的标题或备注');
          const result = db.prepare(`UPDATE experiments SET ${fields.join(', ')} WHERE id=? AND user_id=?`)
            .run(...values, match[1], user.id);
          if (result.changes === 0) throw failure(404, '实验记录不存在');
          const item = db.prepare(`SELECT id,title,notes,created_at AS createdAt,json_extract(state,'$.version') AS stateVersion
            FROM experiments WHERE id=?`).get(match[1]);
          return json(res, 200, { item });
        }
        if (match && ['GET', 'DELETE'].includes(req.method)) {
          const item = db.prepare(`SELECT id,title,notes,state,created_at AS createdAt,
            rev, client_id AS clientId, updated_at AS updatedAt, deleted
            FROM experiments WHERE id=? AND user_id=?`).get(match[1], user.id);
          if (!item) throw failure(404, '实验记录不存在');
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM experiments WHERE id=? AND user_id=?').run(match[1], user.id);
            return json(res, 200, { ok: true });
          }
          item.state = JSON.parse(item.state);
          item.deleted = item.deleted === 1;
          return json(res, 200, { item });
        }
        throw failure(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw failure(405, '不支持此请求方法');
      let relative;
      try { relative = decodeURIComponent(route === '/' ? '/login.html' : route).slice(1); } catch { throw failure(400, '路径不正确'); }
      if (relative.includes('\\') || relative.includes('\0') || relative.includes(':') || relative.split('/').some(s => s.startsWith('.'))) throw failure(404, '文件不存在');
      const target = path.resolve(docRoot, relative);
      if (!target.startsWith(docRoot + path.sep)) throw failure(404, '文件不存在');
      const stat = await fs.promises.stat(target).catch(() => null);
      if (!stat || !stat.isFile()) throw failure(404, '文件不存在，请先执行 npm run build');
      const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      if (!error.status) console.error('[server]', error);
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, { message: error.status ? error.message : '服务暂时不可用，请重试' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => db.close());
  return server;
}
if (require.main === module) {
  const server = createServer();
  const host = process.env.SBQ_HOST || '127.0.0.1';
  const port = Number(process.env.SBQ_API_PORT || 3000);
  server.listen(port, host, () => console.log(`示波器后端已启动：http://${host}:${port}/login.html`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
module.exports = { createServer };
