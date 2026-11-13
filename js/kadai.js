// 課題（ReiMind から流用）。GitHub Actions が暗号化して書き出した kadai.json を合言葉で開く
(function () {
  // ReiMind と同じ保存名にして、同じ github.io から乗り換えたときに合言葉と完了の印を引き継ぐ
  const KEY = 'kadai-pass', DONE = 'kadai-done', CACHE = 'kadai-cache';
  const DATA_URL = 'kadai.json';
  const st = { data: null, view: 'todo', loading: false };

  const doneSet = () => { try { return JSON.parse(G.raw(DONE) || '{}'); } catch (e) { return {}; } };
  function setDone(id, v) { const d = doneSet(); if (v) d[id] = Date.now(); else delete d[id]; G.raw(DONE, JSON.stringify(d)); }

  /* ---- 復号（Python 側と同じ PBKDF2-SHA256 + AES-GCM） ---- */
  function b64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function decrypt(enc, pass) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function fetchData(pass) {
    const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('まだ課題データがありません（GitHub Actions の「課題を更新」が一度も動いていない可能性があります）');
    const enc = await r.json();
    try { return await decrypt(enc, pass); } catch (e) { const x = new Error('合言葉が違います'); x.wrong = true; throw x; }
  }

  /* ---- 締切の分類 ---- */
  const GROUP = { over: '期限切れ', today: '今日が締切', soon: '明日が締切', week: '今週中', later: 'それ以降', done: '完了済み' };
  const due = (it) => new Date(it.due + ':00+09:00');
  const jstDate = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  function group(it, now, dn) {
    if (dn[it.id]) return 'done';
    const d = due(it), ms = d - now;
    if (ms < 0) return 'over';
    if (jstDate(d) === jstDate(now)) return 'today';
    if (jstDate(d) === jstDate(new Date(now.getTime() + 864e5))) return 'soon';
    if (ms < 7 * 864e5) return 'week';
    return 'later';
  }
  function remain(it, now, g) {
    if (g === 'done') return '完了';
    const s = (due(it) - now) / 1000;
    if (s < 0) return '期限切れ';
    if (s < 3600) return 'あと' + Math.max(1, Math.floor(s / 60)) + '分';
    if (s < 86400) return 'あと' + Math.floor(s / 3600) + '時間';
    return 'あと' + Math.floor(s / 86400) + '日';
  }
  function fmt(it) {
    const p = it.due.split('T'), d = p[0].split('-'), w = new Date(p[0] + 'T12:00:00+09:00');
    return Number(d[1]) + '/' + Number(d[2]) + '(' + G.WD[w.getUTCDay()] + ') ' + p[1];
  }
  function gcal(it) {
    const e = due(it), s = new Date(e - 30 * 60e3), f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('【締切】' + it.title) +
      '&dates=' + f(s) + '/' + f(e) + '&details=' + encodeURIComponent(it.teacher || '') + '&ctz=Asia/Tokyo';
  }

  // ホームとタブの赤丸用
  function summary(now = new Date()) {
    const dn = doneSet();
    const items = ((st.data && st.data.items) || []).filter((i) => !dn[i.id]);
    const cnt = {};
    items.forEach((i) => { const g = group(i, now, dn); cnt[g] = (cnt[g] || 0) + 1; });
    return { locked: !G.raw(KEY), items, cnt, data: st.data, group: (i) => group(i, now, dn), remain: (i) => remain(i, now, group(i, now, dn)), fmt };
  }

  /* ---- 画面 ---- */
  const v = () => G.$('v-kadai');
  function lockScreen(msg) {
    v().innerHTML = '<div class="lock"><h2>課題リマインダー</h2>' +
      '<p>GitHub の Secrets に設定した <b>合言葉</b>（KADAI_PASSPHRASE）を入れてください。最初の1回だけです。</p>' +
      (msg ? '<div class="banner">' + G.esc(msg) + '</div>' : '') +
      '<form id="kf"><input id="kp" type="password" autocomplete="current-password" placeholder="合言葉"><button class="btn pri full">開く</button></form></div>';
    G.$('kf').onsubmit = (e) => { e.preventDefault(); const val = G.$('kp').value.trim(); if (val) start(val); };
  }

  function render() {
    if (!G.raw(KEY)) { lockScreen(); badge(); return; }
    const d = st.data, now = new Date(), dn = doneSet();
    const items = (d && d.items) || [];
    const todo = items.filter((i) => !dn[i.id]);
    const cnt = {}; todo.forEach((i) => { const g = group(i, now, dn); cnt[g] = (cnt[g] || 0) + 1; });
    const upd = d && d.updated ? new Date(d.updated) : null;
    const updTxt = upd ? ('更新 ' + (jstDate(upd) === jstDate(now) ? '' : (upd.getMonth() + 1) + '/' + upd.getDate() + ' ') + upd.toTimeString().slice(0, 5)) : '';
    let h = '<div class="card"><div class="hrow"><b style="flex:1">' + (todo.length ? '未完了 ' + todo.length + '件' : '未完了なし 🎉') + '</b>' +
      '<button class="btn" id="kRf">' + (st.loading ? '<span class="spin">⟳</span>' : '⟳') + ' 更新</button></div><div class="kstats">' +
      ['over', 'today', 'soon'].filter((g) => cnt[g]).map((g) => '<span class="chip ' + g + '">' + { over: '期限切れ', today: '今日', soon: '明日' }[g] + ' ' + cnt[g] + '</span>').join('') +
      '<span class="upd muted">' + G.esc(updTxt) + '</span></div></div>';
    if (d && d.error) h += '<div class="banner">⚠ 最新の取得に失敗しました：' + G.esc(d.error) + '</div>';
    if (upd && now - upd > 12 * 3600e3) h += '<div class="banner">⚠ 最後の更新から12時間以上たっています。GitHub Actions が止まっていないか確認してください</div>';
    h += '<div class="seg"><button data-kv="todo" class="' + (st.view === 'todo' ? 'on' : '') + '">未完了</button><button data-kv="done" class="' + (st.view === 'done' ? 'on' : '') + '">完了済み</button></div>';
    const showDone = st.view === 'done';
    const rows = items.filter((i) => !!dn[i.id] === showDone);
    if (showDone) rows.reverse();
    if (!rows.length) {
      h += '<div class="empty">' + (showDone ? '完了済みの課題はありません' : (items.length ? 'すべて完了しました 🎉' : (d ? '締切のある課題はありません' : '読み込み中…'))) + '</div>';
    } else {
      let cur = '';
      rows.forEach((it) => {
        const g = group(it, now, dn);
        if (g !== cur) {
          cur = g; const n = rows.filter((r) => group(r, now, dn) === g).length;
          h += '<div class="gh" style="color:var(--' + g + ')">' + GROUP[g] + '　' + n + '</div>';
        }
        h += '<div class="kcard' + (g === 'done' ? ' done' : '') + '" data-id="' + G.esc(it.id) + '"><div class="stripe" style="background:var(--' + g + ')"></div>' +
          '<div class="cb"><div class="meta"><span class="badge" style="background:var(--' + g + ')">' + remain(it, now, g) + '</span>締切 ' + G.esc(fmt(it)) + '</div>' +
          '<div class="title">' + G.esc(it.title) + '</div>' + (it.teacher ? '<div class="teacher">' + G.esc(it.teacher) + '</div>' : '') + '</div>' +
          '<div class="acts">' + (g === 'done' ? '<button class="btn" data-a="undo">↩ 戻す</button>' :
            '<button class="btn pri" data-a="done">✓ 完了</button><a class="btn" href="' + gcal(it) + '" target="_blank" rel="noopener" aria-label="Googleカレンダーに追加">📅</a>') + '</div></div>';
      });
    }
    v().innerHTML = h;
    badge();
  }

  function badge() {
    const s = summary();
    const n = (s.cnt.over || 0) + (s.cnt.today || 0) + (s.cnt.soon || 0);
    const dot = G.$('kadaiDot');
    dot.hidden = !n; dot.textContent = n;
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'kRf') { refresh(); return; }
    if (b.dataset.kv) { st.view = b.dataset.kv; render(); return; }
    const a = b.dataset.a; if (!a) return;
    const card = b.closest('.kcard'), id = card.dataset.id, it = st.data.items.find((i) => i.id === id);
    const val = a === 'done';
    card.classList.add('leaving');
    setTimeout(() => {
      setDone(id, val); render(); G.mods.home && G.mods.home.render();
      G.toast((val ? '完了：' : '戻しました：') + it.title.slice(0, 18), () => { setDone(id, !val); render(); });
    }, 220);
  }

  async function refresh() {
    const pass = G.raw(KEY); if (!pass) { render(); return; }
    st.loading = true; if (G.cur === 'kadai') render();
    try {
      st.data = await fetchData(pass);
      G.raw(CACHE, JSON.stringify(st.data));
      // 消えた課題の完了印を掃除
      const dn = doneSet(), ids = {}; st.data.items.forEach((i) => { ids[i.id] = 1; });
      Object.keys(dn).forEach((k) => { if (!ids[k]) delete dn[k]; }); G.raw(DONE, JSON.stringify(dn));
    } catch (e) {
      if (e.wrong) { G.raw(KEY, null); st.loading = false; lockScreen(e.message); return; }
      if (G.cur === 'kadai') G.toast(navigator.onLine ? e.message : 'オフラインです。前回の内容を表示しています');
    }
    st.loading = false;
    render(); if (G.cur === 'home' || G.cur === 'class') G.mods[G.cur].render(); // ホームとカレンダーにも締切を出す
  }
  async function start(pass) {
    try { st.data = await fetchData(pass); G.raw(KEY, pass); G.raw(CACHE, JSON.stringify(st.data)); render(); }
    catch (e) { lockScreen(e.message); }
  }
  function logout() { G.raw(KEY, null); G.raw(CACHE, null); st.data = null; render(); }

  function init() {
    const c = G.raw(CACHE);
    if (c) { try { st.data = JSON.parse(c); } catch (e) {} }
    G.$('v-kadai').addEventListener('click', onClick);
    badge();
    if (G.raw(KEY)) refresh();
  }

  G.kadai = { summary, refresh, logout, init };
  G.reg('kadai', { title: '課題', render, tick: 60, onShow: () => { if (G.raw(KEY)) refresh(); } });
})();
