// スクショから時間割を読み取る（文字認識は端末の中だけで行う。画像はどこにも送らない）
(function () {
  const CDN = {
    script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/jpn/4.0.0_best_int',
  };
  const DAYS = '日月火水木金土';

  /* ---------- 文字の整形 ---------- */
  const CJK = /[　-ヿ㐀-鿿！-｠ー]/;
  function norm(s) {
    return String(s || '')
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/(?<=\S)[‐－―−–](?=\d)/g, '-')
      .replace(/\s+/g, ' ').trim();
  }
  // 単語を横に並べて1行の文字にする（日本語どうしは空白なしでつなぐ）
  function joinWords(ws) {
    let out = '';
    for (const w of ws) {
      const t = norm(w.text); if (!t) continue;
      if (out && !(CJK.test(out.slice(-1)) || CJK.test(t[0]))) out += ' ';
      out += t;
    }
    return out;
  }
  // 単語を行ごとにまとめる
  function toLines(words) {
    const ws = words.slice().sort((a, b) => cy(a) - cy(b));
    const lines = [];
    for (const w of ws) {
      const h = w.bbox.y1 - w.bbox.y0;
      const L = lines.find((l) => Math.abs(l.cy - cy(w)) < Math.max(h, l.h) * 0.6);
      if (L) { L.ws.push(w); L.cy = (L.cy * (L.ws.length - 1) + cy(w)) / L.ws.length; L.h = Math.max(L.h, h); }
      else lines.push({ ws: [w], cy: cy(w), h });
    }
    lines.sort((a, b) => a.cy - b.cy);
    return lines.map((l) => ({ text: joinWords(l.ws.sort((a, b) => a.bbox.x0 - b.bbox.x0)), y: l.cy, x: Math.min(...l.ws.map((w) => w.bbox.x0)) }))
      .filter((l) => l.text);
  }
  const cx = (w) => (w.bbox.x0 + w.bbox.x1) / 2;
  const cy = (w) => (w.bbox.y0 + w.bbox.y1) / 2;

  /* ---------- 1コマ分の文字 → 授業名・教室・先生 ---------- */
  const ROOM = /(\d{2,}|^[A-Za-z]{1,4}-?\d|教室|ホール|ラボ|演習室|体育館|オンライン|遠隔)/;
  const NOISE = /^(\d{1,2}:\d{2}|[1-6]限?|[月火水木金土](曜日?)?)$/;
  function cellToClass(lines) {
    const ls = lines.map((l) => l.text).filter((t) => t && !NOISE.test(t));
    if (!ls.length) return null;
    const ri = ls.findIndex((t) => ROOM.test(t));
    let name, room = '', teacher = '';
    if (ri >= 0) { // 「か-301山田太郎」のように教室と先生が1行のとき
      const m = ls[ri].match(/^(.*\d[0-9A-Za-z]*)\s*([^\d].*)?$/);
      if (m && m[2] && ri < ls.length) { ls.splice(ri, 1, m[1], m[2]); }
    }
    if (ri > 0) { name = ls.slice(0, ri).join(''); room = ls[ri]; teacher = ls.slice(ri + 1).join(' '); }
    else if (ri === 0) { room = ls[0]; name = ls.slice(1, 2).join(''); teacher = ls.slice(2).join(' '); }
    else { name = ls[0]; teacher = ls.slice(1).join(' '); }
    name = name.replace(/\s+/g, ' ').trim();
    if (!name || name.length < 2) return null;
    return { name, room: room.trim(), teacher: teacher.trim() };
  }

  /* ---------- 表の形（曜日が横、時限が縦）として読む ---------- */
  function parseGrid(words, W, H) {
    // 見出しの曜日：同じ高さに3つ以上並んでいる行を探す
    const dayWords = words.filter((w) => /^[月火水木金土](曜日?)?$/.test(norm(w.text)));
    let best = null;
    for (const w of dayWords) {
      const row = dayWords.filter((v) => Math.abs(cy(v) - cy(w)) < H * 0.02);
      const ds = new Set(row.map((v) => norm(v.text)[0]));
      if (ds.size >= 3 && (!best || ds.size > best.size)) best = { row, size: ds.size };
    }
    if (!best) return null;
    const cols = [];
    for (const v of best.row.sort((a, b) => cx(a) - cx(b))) {
      const d = DAYS.indexOf(norm(v.text)[0]);
      if (!cols.some((c) => c.d === d)) cols.push({ d, x: cx(v) });
    }
    const colW = cols.length > 1 ? (cols[cols.length - 1].x - cols[0].x) / (cols.length - 1) : W / 6;
    const headY = Math.max(...best.row.map((v) => v.bbox.y1));
    const leftEdge = cols[0].x - colW / 2;

    // 左端の時限（数字）か開始時刻から行の位置を決める
    const left = words.filter((w) => cx(w) < leftEdge && cy(w) > headY);
    const rows = [];
    for (const w of left) {
      const t = norm(w.text).replace(/(時限|限)$/, '');
      let n = null;
      if (/^[1-6]$/.test(t)) n = Number(t);
      else if (/^\d{1,2}:\d{2}$/.test(t)) {
        const [h, m] = t.split(':').map(Number), mm = h * 60 + m;
        const p = G.PERIODS.find((x) => Math.abs(x.s - mm) <= 10); if (p) n = p.n;
      }
      if (n && !rows.some((r) => r.n === n)) rows.push({ n, y: cy(w) });
      else if (n) { const r = rows.find((r) => r.n === n); r.y = Math.min(r.y, cy(w)); }
    }
    rows.sort((a, b) => a.y - b.y);
    let rowB; // 各時限の上端と下端
    if (rows.length >= 2) {
      const step = (rows[rows.length - 1].y - rows[0].y) / (rows[rows.length - 1].n - rows[0].n);
      rowB = rows.map((r, i) => ({
        n: r.n,
        top: i ? (rows[i - 1].y + r.y) / 2 : Math.max(headY, r.y - step / 2 - step * 0.2),
        bot: i < rows.length - 1 ? (r.y + rows[i + 1].y) / 2 : r.y + step / 2 + step * 0.2,
      }));
    } else {
      // 時限が読めないときは、見出しより下を時限の数で等分する
      const n = G.PERIODS.length, step = (H - headY) / n;
      rowB = G.PERIODS.map((p, i) => ({ n: p.n, top: headY + i * step, bot: headY + (i + 1) * step }));
    }
    // 単語をマスに振り分ける
    const cells = {};
    for (const w of words) {
      if (cy(w) <= headY || cx(w) < leftEdge) continue;
      const c = cols.reduce((a, b) => (Math.abs(cx(w) - a.x) < Math.abs(cx(w) - b.x) ? a : b));
      if (Math.abs(cx(w) - c.x) > colW * 0.75) continue;
      const r = rowB.find((r) => cy(w) >= r.top && cy(w) < r.bot); if (!r) continue;
      (cells[`${c.d}-${r.n}`] ||= []).push(w);
    }
    const out = [];
    for (const [k, ws] of Object.entries(cells)) {
      const c = cellToClass(toLines(ws)); if (!c) continue;
      const [d, p] = k.split('-').map(Number);
      out.push({ d, p, ...c });
    }
    return { mode: 'grid', entries: out, guessedRows: rows.length < 2 };
  }

  /* ---------- 一覧の形（「月曜 1限 ◯◯」が縦に並ぶ）として読む ---------- */
  function parseList(words) {
    const lines = toLines(words).map((l) => l.text);
    const RE = /([月火水木金土])(?:曜日?)?\s*[\/・:：]?\s*([1-6])\s*(?:時限|限)/;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RE); if (!m) continue;
      const rest = [lines[i].slice(m.index + m[0].length).trim()];
      for (let k = i + 1; k < lines.length && !RE.test(lines[k]) && rest.length < 4; k++) rest.push(lines[k]);
      const c = cellToClass(rest.filter(Boolean).map((text) => ({ text })));
      if (c) out.push({ d: DAYS.indexOf(m[1]), p: Number(m[2]), ...c });
    }
    return { mode: 'list', entries: out };
  }

  function parse(words, W, H) {
    words = words.filter((w) => norm(w.text) && (w.confidence == null || w.confidence > 3));
    const g = parseGrid(words, W, H);
    const l = parseList(words);
    const r = g && g.entries.length >= l.entries.length ? g : l;
    // 同じマスが重なったら最初のものを使う
    const seen = new Set();
    r.entries = r.entries.filter((e) => e.d >= 1 && e.d <= 6 && G.PERIODS.some((p) => p.n === e.p) && !seen.has(`${e.d}-${e.p}`) && seen.add(`${e.d}-${e.p}`))
      .sort((a, b) => a.d - b.d || a.p - b.p);
    return r;
  }

  /* ---------- 画像の下ごしらえと認識 ---------- */
  function loadScript(src) {
    return new Promise((ok, ng) => {
      if (window.Tesseract) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = () => ng(new Error('文字認識の部品を読み込めませんでした（ネットにつながっているか確認してください）'));
      document.head.appendChild(s);
    });
  }
  async function prepare(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ng(new Error('画像を開けませんでした')); i.src = url; });
      // 小さい画像は拡大、大きすぎる画像は縮小（文字の大きさをそろえる）
      const scale = Math.min(2.5, Math.max(1, 1600 / img.width), 3000 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) { const g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = g; sum += g; }
      const dark = sum / (a.length / 4) < 110; // ダークモードのスクショは白黒反転
      if (dark) for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = 255 - a[i];
      // 濃淡を広げる（薄い文字やカードの背景色を見分けやすくする）
      const hist = new Array(256).fill(0); for (let i = 0; i < a.length; i += 4) hist[a[i] | 0]++;
      const n = a.length / 4; let lo = 0, hi = 255, acc = 0;
      for (; lo < 255 && (acc += hist[lo]) < n * 0.01; lo++);
      acc = 0; for (; hi > 0 && (acc += hist[hi]) < n * 0.4; hi--);
      if (hi - lo > 40) for (let i = 0; i < a.length; i += 4) { const v = Math.max(0, Math.min(255, ((a[i] - lo) * 255) / (hi - lo))); a[i] = a[i + 1] = a[i + 2] = v; }
      x.putImageData(d, 0, 0);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }
  function flatWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => out.push(w)))));
    return out;
  }
  async function run(file, progress) {
    progress('準備しています…（初回だけ約3MBダウンロードします）');
    await loadScript(CDN.script);
    const canvas = await prepare(file);
    const worker = await Tesseract.createWorker('jpn', 1, {
      workerPath: CDN.workerPath, corePath: CDN.corePath, langPath: CDN.langPath,
      logger: (m) => { if (m.status === 'recognizing text') progress(`文字を読み取っています… ${Math.round(m.progress * 100)}%`); },
    });
    try {
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      return parse(flatWords(data), canvas.width, canvas.height);
    } finally { worker.terminate(); }
  }

  G.ocr = { run, parse, CDN };
})();
