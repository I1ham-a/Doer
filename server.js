// Doer sync server — no dependencies. Serves the app and stores data per sync key.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000, DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const STATIC = new Set(['index.html', 'style.css', 'app.js', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest']);

function merge(a, b, dead) {
  const m = new Map();
  for (const it of [...(a || []), ...(b || [])]) { const o = m.get(it.id); if (!o || (it.updated || 0) > (o.updated || 0)) m.set(it.id, it); }
  return [...m.values()].filter(it => (dead[it.id] || 0) < (it.updated || 1));
}
const file = key => path.join(DATA, crypto.createHash('sha256').update(key).digest('hex') + '.json');
const fails = new Map();

http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    const key = String(req.headers['x-sync-key'] || '');
    if (key.length < 8) { res.writeHead(401, cors); return res.end('bad key'); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        const inc = JSON.parse(body), f = file(key);
        const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
        const dead = { ...(cur.dead || {}) };
        for (const k in inc.dead || {}) dead[k] = Math.max(dead[k] || 0, inc.dead[k]);
        const cutoff = Date.now() - 60 * 864e5; for (const k in dead) if (dead[k] < cutoff) delete dead[k];
        const out = { dead };
        for (const k of ['lists', 'tasks', 'habits', 'focus']) out[k] = merge(cur[k], inc[k], dead);
        fs.writeFileSync(f + '.tmp', JSON.stringify(out)); fs.renameSync(f + '.tmp', f);
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
      } catch (e) { res.writeHead(400, cors); res.end('bad request'); }
    });
    return;
  }
  let p = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!STATIC.has(p)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(__dirname, p), (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
}).listen(PORT, () => console.log('Doer on http://localhost:' + PORT));
