// Local static server reused from fashion-news/scripts/serve.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.resolve(__dirname, '..', 'public');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4175);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname); }
  catch { res.writeHead(400); res.end(); return; }
  const file = path.resolve(publicDir, pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, ''));
  if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});
server.on('error', error => { console.error(`サーバー起動失敗: ${error.code}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Game News: http://${host}:${port}`));
