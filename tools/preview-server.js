// 웹툰 미리보기 + 컷 내보내기 서버
// 게임 이미지(assets/)는 sanghanga-web 저장소에서 그대로 읽어온다 — 복사하지 않음
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const GAME = '/Users/song/Desktop/claude/sanghanga-web';
const OUT = '/Users/song/Desktop/claude/webtoon-export';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  // 컷 저장 (POST /save)
  if (req.method === 'POST' && req.url.split('?')[0] === '/save') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 40e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, data } = JSON.parse(body);
        if (!/^[A-Za-z0-9._-]+\.(png|jpg)$/.test(name)) throw new Error('bad name: ' + name);
        fs.mkdirSync(OUT, { recursive: true });
        const buf = Buffer.from(String(data).replace(/^data:image\/\w+;base64,/, ''), 'base64');
        fs.writeFileSync(path.join(OUT, name), buf);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: buf.length }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/webtoon.html';
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const file = safe.startsWith('/assets/') ? path.join(GAME, safe) : path.join(ROOT, safe);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(8791, () => console.log('webtoon preview + export on 8791 → ' + OUT));
