// 웹툰 컷 → 1080×1350(4:5) 이미지 내보내기
// SVG foreignObject는 한글 고딕이 안 잡혀 명조로 대체되므로, 캔버스에 직접 그린다.
(function () {
  const W = 1080, H = 1350, K = W / 100;            // 1cqw = 10.8px
  const GOTHIC = '"Apple SD Gothic Neo","Pretendard","Noto Sans KR",system-ui,sans-serif';
  const MYEONG = '"AppleMyungjo","Nanum Myeongjo","Songti SC",serif';
  const NUM = '"Helvetica Neue",Arial,sans-serif';

  const PAD_X = 5.4 * K, PAD_B = 5.0 * K, GAP = 2.2 * K;
  // 그림과 글을 겹치지 않게 분리한다 — 아래쪽 '자막 띠'는 글 분량만큼 늘어난다.
  const BAND_MIN = H * 0.26, BAND_MAX = H * 0.46, FADE = 7 * K;
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

  // 캐릭터 에셋(mc-*.webp 등)은 위·아래 두 칸짜리 스프라이트다.
  // 흰 여백으로 갈린 '첫 번째 패널'만 잘라 쓰고, 주변 흰 여백도 제거한다.
  const boxCache = new Map();
  function panelBox(img) {
    const key = img.src.slice(0, 80) + img.naturalWidth + 'x' + img.naturalHeight;
    if (boxCache.has(key)) return boxCache.get(key);
    const W0 = img.naturalWidth, H0 = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = W0; cv.height = H0;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, W0, H0).data;

    const isWhiteRow = y => {
      let w = 0;
      for (let x = 0; x < W0; x++) {
        const i = (y * W0 + x) * 4;
        if (data[i] >= 238 && data[i + 1] >= 238 && data[i + 2] >= 238) w++;
      }
      return w / W0 > 0.9;
    };
    const isWhiteCol = (x, y0, y1) => {
      let w = 0, n = 0;
      for (let y = y0; y <= y1; y++) {
        const i = (y * W0 + x) * 4; n++;
        if (data[i] >= 238 && data[i + 1] >= 238 && data[i + 2] >= 238) w++;
      }
      return w / n > 0.9;
    };

    // 1) 첫 패널의 아래 경계 = 세로 40% 아래에서 처음 나오는 '흰 줄 구간'
    let bottom = H0 - 1, run = 0;
    for (let y = Math.floor(H0 * 0.4); y < H0; y++) {
      if (isWhiteRow(y)) { run++; if (run >= 4) { bottom = y - run; break; } }
      else run = 0;
    }
    // 2) 위·좌·우 흰 여백 제거
    let top = 0;
    while (top < bottom && isWhiteRow(top)) top++;
    let left = 0, right = W0 - 1;
    while (left < right && isWhiteCol(left, top, bottom)) left++;
    while (right > left && isWhiteCol(right, top, bottom)) right--;

    // 3) 테두리 선 한 겹 안쪽으로
    const inset = Math.round(Math.min(W0, H0) * 0.006);
    const box = {
      x: Math.min(left + inset, W0 - 2),
      y: Math.min(top + inset, H0 - 2),
      w: Math.max(2, (right - left + 1) - inset * 2),
      h: Math.max(2, (bottom - top + 1) - inset * 2),
    };
    boxCache.set(key, box);
    return box;
  }

  async function renderCut(cut, name) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);

    const kind = ['shock', 'win', 'gold', 'next'].find(k => cut.classList.contains(k));
    const isQ = cut.classList.contains('q');
    const lh = isQ ? LH_Q : LH;
    const fs = isQ ? FS_Q : FS;

    // 1) 자막 줄을 먼저 잡는다 (자막 블록을 세로 가운데에 놓기 위해 높이가 필요하다)
    const maxW = W - PAD_X * 2;
    const capHTML = (cut.querySelector('.cap p') || {}).innerHTML || '';
    const capLines = parseCaption(capHTML).flatMap(l => wrap(g, l, isQ, maxW));
    const stampEl = cut.querySelector('.stamp');
    const sfs = 3.5 * K, stampCH = sfs + 2.6 * K;
    const blockH = capLines.length * lh + (stampEl ? stampCH + GAP : 0);
    // 자막 블록의 중심을 화면 세로 2/3 지점에 둔다 (아래 여백은 확보)
    const blockTop = Math.min(H * (2 / 3) - blockH / 2, H - PAD_B - blockH);

    // 2) 그림 — 화면 전체를 채운다
    const img = new Image();
    img.src = await toDataURI(cut.querySelector('img').getAttribute('src'));
    await img.decode();
    const b = panelBox(img);
    const s = Math.max(W / b.w, H / b.h);
    const dw = b.w * s, dh = b.h * s;
    g.drawImage(img, b.x, b.y, b.w, b.h, (W - dw) / 2, (H - dh) * 0.22, dw, dh);

    // 3) 글자 뒤에만 부드럽게 어둡게 — 위아래로 완전히 사라지게 깃털처럼 처리한다
    const scrimH = blockH + FADE * 4;
    const scrimTop = blockTop - FADE * 2;
    const grad = g.createLinearGradient(0, scrimTop, 0, scrimTop + scrimH);
    grad.addColorStop(0, 'rgba(3,4,7,0)');
    grad.addColorStop(0.24, 'rgba(3,4,7,0.66)');
    grad.addColorStop(0.5, 'rgba(3,4,7,0.80)');
    grad.addColorStop(0.76, 'rgba(3,4,7,0.66)');
    grad.addColorStop(1, 'rgba(3,4,7,0)');
    g.fillStyle = grad; g.fillRect(0, scrimTop, W, scrimH);

    // 4) 컷 번호
    g.font = `800 ${3.4 * K}px ${NUM}`;
    g.fillStyle = 'rgba(255,255,255,.42)';
    g.textBaseline = 'top';
    g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
    let nx = 4 * K;
    for (const ch of cut.querySelector('.no').textContent) {
      g.fillText(ch, nx, 3.4 * K); nx += g.measureText(ch).width + 0.1 * 3.4 * K;
    }
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;

    // 5) 자막 블록 — 세로 한가운데에서 위에서 아래로 쌓는다
    let y = blockTop;
    g.shadowColor = 'rgba(0,0,0,.92)'; g.shadowBlur = 14; g.shadowOffsetY = 2;

    if (stampEl) {
      g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
      const txt = stampEl.textContent;
      g.font = `800 ${sfs}px ${GOTHIC}`;
      const tracking = 0.14 * sfs;
      const tw = [...txt].reduce((a, c) => a + g.measureText(c).width + tracking, 0) - tracking;
      const px = 2.8 * K, cw = tw + px * 2;
      g.fillStyle = STAMP_BG[kind] || '#f5c451';
      g.beginPath(); g.roundRect(PAD_X, y, cw, stampCH, 0.9 * K); g.fill();
      g.fillStyle = STAMP_FG[kind] || '#241a02'; g.textBaseline = 'middle';
      let sx = PAD_X + px;
      for (const c of txt) { g.fillText(c, sx, y + stampCH / 2 + 1); sx += g.measureText(c).width + tracking; }
      y += stampCH + GAP;
      g.shadowColor = 'rgba(0,0,0,.92)'; g.shadowBlur = 14; g.shadowOffsetY = 2;
    }

    g.textBaseline = 'middle';
    const capColor = kind === 'next' ? '#f5c451' : '#fff';
    for (const line of capLines) {
      let x = PAD_X;
      for (const r of line) {
        g.font = runFont(r, isQ); g.fillStyle = capColor;
        g.fillText(r.text, x, y + lh / 2);
        x += g.measureText(r.text).width;
      }
      y += lh;
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
