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
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), user.id, Date.now() + sessionMs);
    return { token, user: publicUser(user) };
  }
  function authenticate(req) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    if (!match) throw failure(401, '请先登录，游客不能保存实验');
    const tokenHash = hash(match[1]);
    const user = db.prepare(`SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id
      WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(tokenHash, Date.now());
    if (!user) throw failure(401, '登录已过期，请重新登录');
    return { user, tokenHash };
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw failure(415, '请使用 JSON 请求');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32768) throw failure(413, '请求数据过大');
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
        const { user, tokenHash } = authenticate(req);
        if (req.method === 'GET' && route === '/api/auth/me') return json(res, 200, { user: publicUser(user) });
        if (req.method === 'POST' && route === '/api/auth/logout') {
          db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && route === '/api/experiments') {
          const items = db.prepare("SELECT id,title,notes,created_at AS createdAt,json_extract(state,'$.version') AS stateVersion FROM experiments WHERE user_id=? ORDER BY created_at DESC, rowid DESC").all(user.id);
          return json(res, 200, { items });
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
          db.prepare('INSERT INTO experiments VALUES(?,?,?,?,?,?)').run(item.id, user.id, item.title, item.notes, JSON.stringify(state), item.createdAt);
          return json(res, 201, { item });
        }
        const match = /^\/api\/experiments\/([a-f0-9-]{36})$/.exec(route);
        if (match && ['GET', 'DELETE'].includes(req.method)) {
          const item = db.prepare('SELECT id,title,notes,state,created_at AS createdAt FROM experiments WHERE id=? AND user_id=?').get(match[1], user.id);
          if (!item) throw failure(404, '实验记录不存在');
          if (req.method === 'DELETE') {
            db.prepare('DELETE FROM experiments WHERE id=? AND user_id=?').run(match[1], user.id);
            return json(res, 200, { ok: true });
          }
          item.state = JSON.parse(item.state);
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
