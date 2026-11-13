// GOD Life — 共通の道具（保存・時刻・トースト・シート）
(function () {
  const G = (window.G = {});

  G.$ = (id) => document.getElementById(id);
  G.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  G.pad = (n) => String(n).padStart(2, '0');
  // 0時からの分 → "8:50"
  G.fmtMin = (m) => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return `${Math.floor(m / 60)}:${G.pad(m % 60)}`; };
  G.ymd = (d) => `${d.getFullYear()}-${G.pad(d.getMonth() + 1)}-${G.pad(d.getDate())}`;
  G.minOfDay = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  G.WD = '日月火水木金土';
  G.dur = (m) => { m = Math.floor(m); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}` : `${m}分`; };

  // localStorage（使えない環境でも落ちないように）
  G.raw = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { return null; }
  };
  G.load = (k, d) => { try { const v = G.raw(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  G.save = (k, v) => G.raw(k, JSON.stringify(v));

  // 麗澤大学の時限（2022年度から100分授業）。開始時刻は LASTCALL と同じ
  G.PERIODS = [
    { n: 1, s: 8 * 60 + 50, e: 10 * 60 + 30 },
    { n: 2, s: 10 * 60 + 40, e: 12 * 60 + 20 },
    { n: 3, s: 13 * 60 + 10, e: 14 * 60 + 50 },
    { n: 4, s: 15 * 60, e: 16 * 60 + 40 },
    { n: 5, s: 16 * 60 + 50, e: 18 * 60 + 30 },
  ];
  // 今の時限（授業中ならその時限、休み時間なら次の時限と inBreak=true）
  G.periodAt = (min) => {
    for (const p of G.PERIODS) {
      if (min < p.s) return { p, inBreak: true };
      if (min < p.e) return { p, inBreak: false };
    }
    return null;
  };

  // トースト
  let tt;
  G.toast = (msg, undo) => {
    G.$('toastMsg').textContent = msg;
    const t = G.$('toast'), u = G.$('toastUndo');
    u.hidden = !undo;
    u.onclick = () => { t.classList.remove('show'); undo && undo(); };
    t.classList.add('show'); clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('show'), 5000);
  };

  // 下から出る編集シート
  G.openEditor = (html, bind) => {
    G.$('editorIn').innerHTML = html;
    G.$('editor').classList.add('show');
    bind && bind(G.$('editorIn'));
  };
  G.closeEditor = () => G.$('editor').classList.remove('show');

  // 画面の登録と切り替え（app.js が使う）
  // アプリのバージョン（更新のたびに上げる。sw.js の VERSION もそろえる）
  G.VERSION = '1.17.0';
  G.mods = {};
  G.reg = (name, mod) => { G.mods[name] = mod; };
  G.go = (tab) => { location.hash = tab; };
})();
