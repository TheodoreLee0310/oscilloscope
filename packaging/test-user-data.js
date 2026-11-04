// Run the real browser against an isolated SQLite server; never touch user data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('../server');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sbq-browser-test-'));
const server = createServer({ dbPath: path.join(directory, 'test.sqlite') });
server.listen(0, '127.0.0.1', () => {
  const child = spawn(require('electron'), [path.join(__dirname, 'user-data-browser.js')], {
    env: { ...process.env, SBQ_TEST_URL: 'http://127.0.0.1:' + server.address().port, SBQ_TEST_DIR: directory }, stdio: 'inherit'
  });
  const timer = setTimeout(() => child.kill(), 90000);
  child.once('exit', code => {
    clearTimeout(timer);
    const log = path.join(directory, 'result.log');
    if (fs.existsSync(log)) console.log(fs.readFileSync(log, 'utf8'));
    server.close(() => {
      for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
      fs.rmdirSync(directory);
      process.exitCode = code === 0 ? 0 : 1;
    });
  });
});
