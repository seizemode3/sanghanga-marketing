// 웹툰 컷 → 1080×1350(4:5) 이미지 내보내기
// SVG foreignObject는 한글 고딕이 안 잡혀 명조로 대체되므로, 캔버스에 직접 그린다.
(function () {
  const W = 1080, H = 1350, K = W / 100;            // 1cqw = 10.8px
  const GOTHIC = '"Apple SD Gothic Neo","Pretendard","Noto Sans KR",system-ui,sans-serif';
  const MYEONG = '"AppleMyungjo","Nanum Myeongjo","Songti SC",serif';
  const NUM = '"Helvetica Neue",Arial,sans-serif';

  const PAD_X = 5.4 * K, PAD_B = 5.6 * K, GAP = 2.2 * K;
  const FS = 4.15 * K, FS_Q = 4.45 * K;             // 본문 / 대사 글자크기
  const LH = FS * 1.62, LH_Q = FS_Q * 1.66;
  const ACCENT = { shock: '#ff4d4d', win: '#4ade80', next: '#f5c451' };
  const STAMP_BG = { shock: '#ff4d4d', win: '#4ade80', gold: '#f5c451', next: '#f5c451' };
  const STAMP_FG = { shock: '#fff', win: '#06210f', gold: '#241a02', next: '#241a02' };

  // 캡션 HTML → [{text,bold}] 줄 배열 (<br> 줄바꿈, <b> 강조 유지)
  function parseCaption(html) {
    const lines = [[]];
    const re = /<br\s*\/?>|<b>|<\/b>|<span[^>]*>|<\/span>|[^<]+/gi;
    let bold = false;
    for (const tok of html.match(re) || []) {
      if (/^<br/i.test(tok)) lines.push([]);
      else if (/^<b>/i.test(tok)) bold = true;
      else if (/^<\/b>/i.test(tok)) bold = false;
      else if (tok[0] === '<') continue;
      else {
        const t = tok.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        if (t) lines[lines.length - 1].push({ text: t, bold });
      }
    }
    return lines.filter(l => l.length);
  }

  const runFont = (r, q) => `${q ? (r.bold ? 700 : 400) : (r.bold ? 900 : 700)} ${q ? FS_Q : FS}px ${q ? MYEONG : GOTHIC}`;

  // 폭을 넘기는 줄은 접는다 (한글은 어절 단위, 없으면 글자 단위)
  function wrap(g, line, q, maxW) {
    const out = []; let cur = [], curW = 0;
    const push = (t, bold, w) => { cur.push({ text: t, bold }); curW += w; };
    for (const run of line) {
      for (const piece of run.text.split(/(\s+)/)) {
        if (!piece) continue;
        g.font = runFont(run, q);
        let w = g.measureText(piece).width;
        if (w > maxW) {                       // 한 어절이 통째로 넘치면 글자 단위로
          for (const ch of piece) {
            const cw = g.measureText(ch).width;
            if (curW + cw > maxW && cur.length) { out.push(cur); cur = []; curW = 0; }
            push(ch, run.bold, cw);
          }
          continue;
        }
        if (curW + w > maxW && cur.length && piece.trim()) { out.push(cur); cur = []; curW = 0; }
        push(piece, run.bold, w);
      }
    }
    if (cur.length) out.push(cur);
    return out;
  }

  async function toDataURI(url) {
    const b = await (await fetch(url)).blob();
    return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  }

  // 일부 원본 에셋(mc-30 등)은 위쪽에 흰 띠가 박혀 있다 — 그만큼 잘라내고 쓴다
  const trimCache = new Map();
  function whiteTop(img) {
    const key = img.src.slice(0, 64) + img.naturalWidth;
    if (trimCache.has(key)) return trimCache.get(key);
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    let rows = 0;
    for (let y = 0; y < cv.height; y++) {
      const d = g.getImageData(0, y, cv.width, 1).data;
      let white = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) white++;
      if (white / (d.length / 4) > 0.92) rows++; else break;
    }
    rows = rows > 8 ? rows + 2 : 0;
    trimCache.set(key, rows);
    return rows;
  }

  async function renderCut(cut, name) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);

    // 1) 배경 이미지 — cover + object-position center 22%
    const img = new Image();
    img.src = await toDataURI(cut.querySelector('img').getAttribute('src'));
    await img.decode();
    const top = whiteTop(img);
    const sw = img.naturalWidth, shh = img.naturalHeight - top;
    const s = Math.max(W / sw, H / shh);
    const dw = sw * s, dh = shh * s;
    g.drawImage(img, 0, top, sw, shh, (W - dw) / 2, (H - dh) * 0.22, dw, dh);

    const kind = ['shock', 'win', 'gold', 'next'].find(k => cut.classList.contains(k));
    const isQ = cut.classList.contains('q');
    const lh = isQ ? LH_Q : LH;
    const fs = isQ ? FS_Q : FS;

    // 2) 자막 줄 계산 (그라데이션 높이를 글 분량에 맞추기 위해 먼저 계산)
    const maxW = W - PAD_X * 2;
    const capHTML = (cut.querySelector('.cap p') || {}).innerHTML || '';
    const capLines = parseCaption(capHTML).flatMap(l => wrap(g, l, isQ, maxW));
    const stampEl = cut.querySelector('.stamp');
    const stampH = stampEl ? 3.5 * K + 2.6 * K + GAP : 0;
    const blockH = capLines.length * lh + stampH + PAD_B;
    const scrimH = Math.min(H, Math.max(H * 0.62, blockH + 16 * K));

    // 3) 그라데이션
    const grad = g.createLinearGradient(0, H - scrimH, 0, H);
    grad.addColorStop(0, 'rgba(3,4,7,0)');
    grad.addColorStop(0.30, 'rgba(3,4,7,0.55)');
    grad.addColorStop(0.62, 'rgba(3,4,7,0.88)');
    grad.addColorStop(0.84, 'rgba(3,4,7,0.97)');
    grad.addColorStop(1, '#03040a');
    g.fillStyle = grad; g.fillRect(0, H - scrimH, W, scrimH);

    // 4) 컷 번호
    g.font = `800 ${3.4 * K}px ${NUM}`;
    g.fillStyle = 'rgba(255,255,255,.42)';
    g.textBaseline = 'top';
    g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
    let nx = 4 * K;
    for (const ch of cut.querySelector('.no').textContent) {
      g.fillText(ch, nx, 3.4 * K); nx += g.measureText(ch).width + 0.1 * 3.4 * K;
    }

    // 5) 자막 — 아래에서 위로 쌓는다
    let y = H - PAD_B;
    g.textBaseline = 'alphabetic';
    g.shadowColor = 'rgba(0,0,0,.95)'; g.shadowBlur = 12; g.shadowOffsetY = 2;
    const capColor = kind === 'next' ? '#f5c451' : '#fff';
    for (let i = capLines.length - 1; i >= 0; i--) {
      let x = PAD_X;
      const base = y - (lh - fs) / 2;
      for (const r of capLines[i]) {
        g.font = runFont(r, isQ); g.fillStyle = capColor;
        g.fillText(r.text, x, base);
        x += g.measureText(r.text).width;
      }
      y -= lh;
    }

    // 6) 스탬프 칩
    if (stampEl) {
      const sfs = 3.5 * K, txt = stampEl.textContent;
      g.font = `800 ${sfs}px ${GOTHIC}`;
      const tracking = 0.14 * sfs;
      const tw = [...txt].reduce((a, c) => a + g.measureText(c).width + tracking, 0) - tracking;
      const px = 2.8 * K, py = 1.3 * K, cw = tw + px * 2, ch = sfs + py * 2;
      const cy = y - GAP - ch + lh - fs;
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.fillStyle = STAMP_BG[kind] || '#f5c451';
      g.beginPath(); g.roundRect(PAD_X, cy, cw, ch, 0.9 * K); g.fill();
      g.fillStyle = STAMP_FG[kind] || '#241a02'; g.textBaseline = 'middle';
      let sx = PAD_X + px;
      for (const c of txt) { g.fillText(c, sx, cy + ch / 2 + 1); sx += g.measureText(c).width + tracking; }
    }

    // 7) 강조 테두리
    if (ACCENT[kind]) {
      g.shadowColor = 'transparent';
      g.strokeStyle = ACCENT[kind]; g.lineWidth = 0.9 * K;
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
    }

    const r = await fetch('/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: cv.toDataURL('image/jpeg', 0.95) })
    });
    return await r.json();
  }

  window.exportAll = async function () {
    const eps = [...document.querySelectorAll('.ep')];
    const out = [];
    for (let e = 0; e < eps.length; e++) {
      const cuts = [...eps[e].querySelectorAll('.cut')];
      for (let c = 0; c < cuts.length; c++) {
        const name = `ep${e + 1}-${String(c + 1).padStart(2, '0')}.jpg`;
        const r = await renderCut(cuts[c], name);
        out.push(name + (r.ok ? '' : ' FAIL:' + r.error));
      }
    }
    return out;
  };
  window.renderCut = renderCut;
  window.__exportReady = true;
})();
