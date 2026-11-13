// 学食メニュー（data/menu.json）と空き教室検索（data/rooms.json ＋ この端末での追記）
(function () {
  const LKEY = 'gl.roomsLocal';
  const st = { tab: G.load('gl.campusTab', 'menu'), menu: null, rooms: null, day: null, slot: null, editing: false, err: {} };

  async function getJSON(url) {
    const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function loadAll() {
    await Promise.all([
      getJSON('data/menu.json').then((j) => { st.menu = j; G.save('gl.menuCache', j); }).catch(() => { st.menu = st.menu || G.load('gl.menuCache', null); st.err.menu = true; }),
      getJSON('data/rooms.json').then((j) => { st.rooms = j; G.save('gl.roomsCache', j); }).catch(() => { st.rooms = st.rooms || G.load('gl.roomsCache', null); st.err.rooms = true; }),
    ]);
  }

  /* ---------- 学食 ---------- */
  function menuFor(date) {
    const m = st.menu || {};
    return { daily: (m.days && m.days[G.ymd(date)]) || [], regular: m.regular || [] };
  }
  const itemHtml = (it) => `<div class="menu-item"><div class="nm">${G.esc(it.name)}${it.note || it.kcal ? `<small>${G.esc([it.note, it.kcal ? it.kcal + 'kcal' : ''].filter(Boolean).join('・'))}</small>` : ''}</div>
    <div class="pr">${it.price ? '¥' + Number(it.price).toLocaleString() : ''}</div></div>`;

  function renderMenu() {
    const m = st.menu || {};
    const now = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(d.getDate() + i); if (d.getDay() !== 0) days.push(d); }
    const sel = st.day && days.find((d) => G.ymd(d) === st.day) || days[0];
    const { daily, regular } = menuFor(sel);
    let h = `<div class="card"><b>${G.esc(m.name || '学生食堂')}</b>${m.hours ? `<div class="muted">営業 ${G.esc(m.hours)}</div>` : ''}
      <div class="muted">昼休み 12:20–13:10 は混みます。3限が空いている日はずらすのがおすすめ。</div></div>`;
    h += `<div class="days">${days.map((d) => `<button data-day="${G.ymd(d)}" class="${d === sel ? 'on' : ''}">${G.ymd(d) === G.ymd(now) ? '今日' : (d.getMonth() + 1) + '/' + d.getDate()}(${G.WD[d.getDay()]})</button>`).join('')}</div>`;
    h += '<div class="gh">日替わり</div>';
    h += daily.length ? `<div class="card">${daily.map(itemHtml).join('')}</div>` : '<div class="card muted">この日のメニューはまだ登録されていません。</div>';
    if (regular.length) h += `<div class="gh">定番メニュー</div><div class="card">${regular.map(itemHtml).join('')}</div>`;
    h += `<p class="muted">メニューは <code>data/menu.json</code> を書き換えると全員に反映されます${m.updated ? `（最終更新 ${G.esc(m.updated)}）` : ''}。${m.source ? `<a href="${G.esc(m.source)}" target="_blank" rel="noopener">公式の案内 ↗</a>` : ''}</p>`;
    return h;
  }

  /* ---------- 空き教室 ---------- */
  const local = () => G.load(LKEY, { rooms: [], busy: {} });
  // 教室の一覧：配布データ ＋ 端末で追加した教室 ＋ 自分の時間割に出てくる教室
  function roomList() {
    const map = new Map();
    const add = (r) => { if (r && r.id && !map.has(r.id)) map.set(r.id, r); };
    ((st.rooms && st.rooms.rooms) || []).forEach(add);
    local().rooms.forEach(add);
    Object.values(G.classes.all()).forEach((c) => c.room && add({ id: c.room, building: '時間割から' }));
    return [...map.values()];
  }
  // その時限に使われている教室（配布データ → 端末の上書き → 自分の授業）
  function busySet(day, period) {
    const slot = `${day}-${period}`;
    const s = new Set(((st.rooms && st.rooms.busy && st.rooms.busy[slot]) || []));
    const o = local().busy[slot] || {};
    for (const [id, b] of Object.entries(o)) { if (b) s.add(id); else s.delete(id); }
    const mine = G.classes.get(day, period); // 自分の授業がある教室は使用中
    if (mine && mine.room && !G.classes.isOnline(mine)) s.add(mine.room);
    return s;
  }
  function defaultSlot() {
    const now = new Date();
    let day = now.getDay();
    const pa = G.periodAt(G.minOfDay(now));
    if (day === 0 || !pa) { day = day === 0 || day === 6 ? 1 : day + 1; return { day, period: 1 }; }
    return { day, period: pa.p.n };
  }

  function renderRooms() {
    if (!st.slot) st.slot = defaultSlot();
    const { day, period } = st.slot;
    const rooms = roomList();
    const busy = busySet(day, period);
    const mine = G.classes.get(day, period);
    const p = G.PERIODS.find((x) => x.n === period);
    let h = `<div class="card"><div class="sel">
      <select id="rDay">${[1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}"${d === day ? ' selected' : ''}>${G.WD[d]}曜</option>`).join('')}</select>
      <select id="rPer">${G.PERIODS.map((x) => `<option value="${x.n}"${x.n === period ? ' selected' : ''}>${x.n}限 ${G.fmtMin(x.s)}–${G.fmtMin(x.e)}</option>`).join('')}</select></div>
      <button class="btn" id="rNow">今の時限にする</button></div>`;
    if (mine) h += `<div class="banner info">この時間は <b>${G.esc(mine.name)}</b>${mine.room ? `（${G.esc(mine.room)}）` : ''} があります</div>`;
    if (!rooms.length) {
      h += `<div class="card muted">まだ教室が登録されていません。<br>・<code>data/rooms.json</code> に教室と使用状況を入れると全員に反映されます<br>・下の「編集」から、この端末だけに教室を追加することもできます<br>・時間割に教室名を入れると、その教室も一覧に出ます</div>`;
    } else {
      const free = rooms.filter((r) => !busy.has(r.id));
      h += `<div class="gh">${G.WD[day]}${period}限（${G.fmtMin(p.s)}–${G.fmtMin(p.e)}）の空き：${free.length} / ${rooms.length}室</div>`;
      const byB = {};
      rooms.forEach((r) => { (byB[r.building || 'その他'] ||= []).push(r); });
      for (const [b, list] of Object.entries(byB)) {
        list.sort((x, y) => (busy.has(x.id) - busy.has(y.id)) || x.id.localeCompare(y.id, 'ja'));
        h += `<div class="gh">${G.esc(b)}</div><div class="rooms${st.editing ? ' editing' : ''}">${list.map((r) => {
          const isMine = mine && mine.room === r.id;
          return `<button class="room ${busy.has(r.id) ? 'busy' : 'free'}${isMine ? ' mine' : ''}" data-room="${G.esc(r.id)}">${G.esc(r.id)}<small>${isMine ? '自分の授業' : busy.has(r.id) ? '使用中' : '空き'}${r.cap ? '・' + r.cap + '席' : ''}</small></button>`;
        }).join('')}</div>`;
      }
    }
    h += `<div class="gh">データ</div><div class="card">
      <p class="muted" style="margin-top:0">「空き」は登録された授業がない教室です。試験・行事・課外の利用までは分からないので、目安として使ってください。${st.rooms && st.rooms.updated ? `（配布データ ${G.esc(st.rooms.updated)}）` : ''}</p>
      ${st.editing ? `<p class="muted">編集中：教室をタップすると、この時限の「空き／使用中」が切り替わります（この端末だけ）。</p>
        <div class="row2"><input id="rNewId" placeholder="教室名（例：か-301）"><input id="rNewB" placeholder="建物（例：かえで館）"></div>
        <button class="btn full" id="rAdd">教室を追加</button>
        <button class="btn full" id="rExport">rooms.json の形でコピー</button>
        <button class="btn pri full" id="rEdit">編集を終わる</button>`
        : '<button class="btn full" id="rEdit">編集（この端末で教室・使用状況を直す）</button>'}</div>`;
    return h;
  }

  function exportRooms() {
    const rooms = roomList().map((r) => ({ id: r.id, building: r.building === '時間割から' ? '' : r.building, ...(r.cap ? { cap: r.cap } : {}) }));
    const busy = {};
    for (const d of [1, 2, 3, 4, 5, 6]) for (const p of G.PERIODS) {
      const s = [...busySet(d, p.n)]; if (s.length) busy[`${d}-${p.n}`] = s.sort();
    }
    const txt = JSON.stringify({ updated: G.ymd(new Date()), rooms, busy }, null, 1);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      () => G.toast('コピーしました。GitHub の data/rooms.json に貼り付けてください'),
      () => G.openEditor(`<h3>rooms.json</h3><textarea rows="14">${G.esc(txt)}</textarea><button class="btn full" onclick="G.closeEditor()">閉じる</button>`));
  }

  /* ---------- 画面 ---------- */
  function render() {
    const v = G.$('v-campus');
    v.innerHTML = `<div class="seg"><button data-ct="menu" class="${st.tab === 'menu' ? 'on' : ''}">🍛 学食メニュー</button><button data-ct="rooms" class="${st.tab === 'rooms' ? 'on' : ''}">🚪 空き教室</button></div>` +
      (st.tab === 'menu' ? renderMenu() : renderRooms());
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ct) { st.tab = b.dataset.ct; G.save('gl.campusTab', st.tab); }
    else if (b.dataset.day) st.day = b.dataset.day;
    else if (b.id === 'rNow') st.slot = defaultSlot();
    else if (b.id === 'rEdit') st.editing = !st.editing;
    else if (b.id === 'rExport') { exportRooms(); return; }
    else if (b.id === 'rAdd') {
      const id = G.$('rNewId').value.trim(); if (!id) return;
      const l = local(); if (!l.rooms.some((r) => r.id === id)) l.rooms.push({ id, building: G.$('rNewB').value.trim() || 'その他' });
      G.save(LKEY, l);
    } else if (b.dataset.room && st.editing) {
      const slot = `${st.slot.day}-${st.slot.period}`, id = b.dataset.room;
      const l = local(); l.busy[slot] ||= {};
      l.busy[slot][id] = !busySet(st.slot.day, st.slot.period).has(id);
      G.save(LKEY, l);
    } else return;
    render();
  }
  function onChange(e) {
    if (e.target.id === 'rDay' || e.target.id === 'rPer') {
      st.slot = { day: Number(G.$('rDay').value), period: Number(G.$('rPer').value) };
      render();
    }
  }
  function init() {
    const v = G.$('v-campus');
    v.addEventListener('click', onClick);
    v.addEventListener('change', onChange);
    st.menu = G.load('gl.menuCache', null);
    st.rooms = G.load('gl.roomsCache', null);
    loadAll().then(() => { if (G.cur === 'campus' || G.cur === 'home') G.mods[G.cur].render(); });
  }

  G.campus = { menuFor, init, hasMenu: () => !!st.menu };
  G.reg('campus', { title: '学食・空き教室', render, tick: 60, onShow: () => loadAll().then(() => G.cur === 'campus' && render()) });
})();
