// カレンダー（月表示＋その日の一覧）。上の切り替えで時間割も見られる
// 表示するもの：大学の行事（data/events.json）・祝日・課題の締切・自分の予定（この端末に保存）
(function () {
  const EKEY = 'gl.events';
  const st = { view: 'cal', ym: null, sel: null, uni: null };

  const ymd = G.ymd;
  const parse = (s) => new Date(s + 'T00:00:00');
  const addDays = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
  const wd = (s) => G.WD[parse(s).getDay()];
  const md = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${G.WD[d.getDay()]})`; };

  /* ---------- データ ---------- */
  const mine = () => G.load(EKEY, []);
  const saveMine = (a) => G.save(EKEY, a);
  async function loadUni() {
    try {
      const r = await fetch('data/events.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw 0;
      st.uni = await r.json(); G.save('gl.eventsCache', st.uni);
    } catch (e) { st.uni = st.uni || G.load('gl.eventsCache', null); }
  }
  // 大学の行事（期間のものは毎日に出す）
  function uniOn(day) {
    return ((st.uni && st.uni.events) || []).filter((e) => e.date <= day && day <= (e.end || e.date));
  }
  // 自分の予定（毎週くり返しにも対応）
  function mineOn(day) {
    const d = parse(day);
    return mine().filter((e) => (e.repeat === 'weekly' ? e.date <= day && (!e.until || day <= e.until) && parse(e.date).getDay() === d.getDay() : e.date === day))
      .sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || (a.start || '').localeCompare(b.start || ''));
  }
  // 課題の締切（未完了のもの）
  function kadaiOn(day) {
    const s = G.kadai.summary();
    return s.items.filter((i) => i.due.slice(0, 10) === day).map((i) => ({ ...i, remain: s.remain(i) }));
  }
  const holiday = (day) => G.commute.HOLIDAYS.has(day);

  /* ---------- 月表示 ---------- */
  function monthGrid() {
    const [y, m] = st.ym;
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay()); // 日曜はじまり
    const today = ymd(new Date());
    let h = `<div class="cal-head"><button class="btn" data-mv="-1" aria-label="前の月">‹</button><b>${y}年${m + 1}月</b><button class="btn" data-mv="1" aria-label="次の月">›</button><button class="btn" data-today="1">今日</button></div>`;
    h += '<div class="cal-grid">' + [...G.WD].map((w, i) => `<div class="cal-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('');
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), k = ymd(d);
      if (i >= 35 && d.getMonth() !== m) break; // 6週目が丸ごと翌月なら出さない
      const u = uniOn(k), my = mineOn(k), kd = kadaiOn(k);
      const cls = ['cal-d', d.getMonth() !== m && 'out', k === today && 'today', k === st.sel && 'sel',
        (d.getDay() === 0 || holiday(k)) && 'sun', d.getDay() === 6 && 'sat', u.some((e) => /休|休業|休講/.test(e.kind || e.title)) && 'off'].filter(Boolean).join(' ');
      const dots = (u.length ? '<i class="dot-u"></i>' : '') + (kd.length ? '<i class="dot-k"></i>' : '') + (my.length ? '<i class="dot-m"></i>' : '');
      h += `<button class="${cls}" data-day="${k}"><span>${d.getDate()}</span><em>${dots}</em></button>`;
    }
    h += '</div><div class="cal-legend"><span><i class="dot-u"></i>大学</span><span><i class="dot-k"></i>課題の締切</span><span><i class="dot-m"></i>自分の予定</span></div>';
    return h;
  }

  /* ---------- 選んだ日の一覧 ---------- */
  function dayList(day) {
    const u = uniOn(day), my = mineOn(day), kd = kadaiOn(day);
    let h = `<div class="gh">${md(day)}${holiday(day) ? '・祝日' : ''}<a href="#" data-add="${day}">＋ 予定を追加</a></div><div class="card cal-list">`;
    const rows = [];
    u.forEach((e) => rows.push(`<div class="ci"><span class="tag u">${G.esc(e.kind || '大学')}</span><div class="ct"><b>${G.esc(e.title)}</b>${e.end && e.end !== e.date ? `<small>${md(e.date)}〜${md(e.end)}</small>` : ''}</div></div>`));
    kd.forEach((i) => rows.push(`<div class="ci" onclick="G.go('kadai')"><span class="tag k">締切 ${G.esc(i.due.slice(11))}</span><div class="ct"><b>${G.esc(i.title)}</b><small>${G.esc(i.teacher || '')}${i.teacher ? '・' : ''}${G.esc(i.remain)}</small></div></div>`));
    my.forEach((e) => rows.push(`<div class="ci" data-edit="${e.id}"><span class="tag m">${e.allDay ? '終日' : `${G.esc(e.start || '')}${e.end ? '–' + G.esc(e.end) : ''}`}</span><div class="ct"><b>${G.esc(e.title)}</b><small>${e.place ? '📍' + G.esc(e.place) + '駅　' : ''}${e.repeat === 'weekly' ? '🔁 毎週' + wd(e.date) + '曜' : ''}${e.repeat === 'weekly' && e.memo ? '・' : ''}${G.esc(e.memo || '')}</small>${routeLinks(e, day)}</div></div>`));
    h += rows.length ? rows.join('') : '<div class="muted">予定はありません</div>';
    h += '</div>';
    if (G.kadai.summary().locked) h += '<p class="muted">課題の締切は、「課題」タブで合言葉を入れると表示されます。</p>';
    return h;
  }

  /* ---------- 行き先の駅（Yahoo!乗換案内） ---------- */
  // 出発駅：その日に対面授業があって、予定が最後の授業より後なら大学（南柏）から、ほかは家（荒川沖）から
  function fromStation(e, day) {
    const list = G.classes.dayList(parse(day)).filter((x) => !G.classes.isOnline(x.c));
    const last = list[list.length - 1];
    if (last && e.start) { const [h, m] = e.start.split(':').map(Number); if (h * 60 + m >= last.e) return '南柏'; }
    return '荒川沖';
  }
  function routeLinks(e, day) {
    if (!e.place || e.allDay || !e.start) return '';
    const from = fromStation(e, day), d = parse(day);
    const go = G.commute.yahooUrl(from, e.place, d, e.start, 4);
    const back = e.end ? G.commute.yahooUrl(e.place, '荒川沖', d, e.end, 1) : null;
    return `<span class="rl"><a class="btn" href="${go}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🚃 ${from}→${G.esc(e.place)} ${G.esc(e.start)}着で調べる</a>${back ? `<a class="btn" href="${back}" target="_blank" rel="noopener" onclick="event.stopPropagation()">帰り ${G.esc(e.end)}発</a>` : ''}</span>`;
  }

  /* ---------- 予定の編集 ---------- */
  function edit(id, day) {
    const all = mine();
    const e = all.find((x) => x.id === id) || { id: 'e' + Date.now().toString(36), title: '', date: day, allDay: false, start: '', end: '', memo: '', repeat: '' };
    const isNew = !all.some((x) => x.id === e.id);
    G.openEditor(`<h3>${isNew ? '予定を追加' : '予定を編集'}</h3>
      <label class="f">タイトル</label><input id="evT" value="${G.esc(e.title)}" placeholder="例：バイト">
      <label class="f">日付</label><input id="evD" type="date" value="${e.date}">
      <label class="ocr-mode" style="color:var(--text);font-size:15px"><input type="checkbox" id="evA"${e.allDay ? ' checked' : ''}> 終日</label>
      <div class="row2" id="evTimes"${e.allDay ? ' hidden' : ''}><div><label class="f">開始</label><input id="evS" type="time" value="${e.start || ''}"></div><div><label class="f">終了</label><input id="evE" type="time" value="${e.end || ''}"></div></div>
      <label class="f">行き先の駅（入れると Yahoo!乗換案内で経路を調べられます）</label><input id="evP" value="${G.esc(e.place || '')}" placeholder="例：土浦（「駅」はなくてOK）">
      <label class="f">くり返し</label><select id="evR"><option value="">しない</option><option value="weekly"${e.repeat === 'weekly' ? ' selected' : ''}>毎週</option></select>
      <label class="f">メモ</label><input id="evM" value="${G.esc(e.memo || '')}">
      <button class="btn pri full" id="evSave">保存</button>
      ${isNew ? '' : `<a class="btn full" style="display:block" target="_blank" rel="noopener" href="${gcal(e)}">📅 Googleカレンダーに追加</a><button class="btn danger full" id="evDel">この予定を消す</button>`}
      <button class="btn full" id="evCancel">閉じる</button>`, (root) => {
      const q = (s) => root.querySelector(s);
      q('#evA').onchange = () => { q('#evTimes').hidden = q('#evA').checked; };
      q('#evSave').onclick = () => {
        const t = q('#evT').value.trim(); if (!t) { q('#evT').focus(); return; }
        const n = { ...e, title: t, date: q('#evD').value || day, allDay: q('#evA').checked, start: q('#evS').value, end: q('#evE').value, memo: q('#evM').value.trim(), repeat: q('#evR').value, place: q('#evP').value.trim().replace(/駅$/, '') };
        saveMine([...mine().filter((x) => x.id !== e.id), n]);
        st.sel = n.date; G.closeEditor(); render();
      };
      const del = q('#evDel');
      if (del) del.onclick = () => {
        const before = mine(); saveMine(before.filter((x) => x.id !== e.id)); G.closeEditor(); render();
        G.toast('消しました：' + e.title, () => { saveMine(before); render(); });
      };
      q('#evCancel').onclick = G.closeEditor;
      if (isNew) q('#evT').focus();
    });
  }
  function gcal(e) {
    const d = e.date.replace(/-/g, '');
    const f = (t) => d + 'T' + t.replace(':', '') + '00';
    const dates = e.allDay || !e.start ? `${d}/${ymd(addDays(parse(e.date), 1)).replace(/-/g, '')}` : `${f(e.start)}/${f(e.end || e.start)}`;
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title) + '&dates=' + dates +
      (e.repeat === 'weekly' ? '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY') : '') + '&details=' + encodeURIComponent(e.memo || '') + '&ctz=Asia/Tokyo';
  }

  /* ---------- 画面 ---------- */
  function render() {
    const v = G.$('v-class');
    const seg = `<div class="seg"><button data-cv="cal" class="${st.view === 'cal' ? 'on' : ''}">📅 カレンダー</button><button data-cv="tt" class="${st.view === 'tt' ? 'on' : ''}">🗓 時間割</button></div>`;
    G.$('title').textContent = st.view === 'cal' ? 'カレンダー' : '時間割';
    if (st.view === 'tt') { v.innerHTML = seg + '<div id="ttBox"></div>'; G.classes.renderTT(); return; }
    const now = new Date();
    if (!st.ym) st.ym = [now.getFullYear(), now.getMonth()];
    if (!st.sel) st.sel = ymd(now);
    v.innerHTML = seg + `<div class="card cal">${monthGrid()}</div>` + dayList(st.sel) +
      `<p class="muted">大学の行事は <code>data/events.json</code> に書くと全員に反映されます${st.uni && st.uni.updated ? `（最終更新 ${G.esc(st.uni.updated)}）` : ''}。自分の予定はこの端末にだけ保存されます。</p>`;
  }
  function onClick(e) {
    if (st.view === 'tt' && !e.target.closest('[data-cv]')) return; // 時間割の中のタップは classes.js が扱う
    const add = e.target.closest('[data-add]');
    if (add) { e.preventDefault(); edit(null, add.dataset.add); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { edit(ed.dataset.edit, st.sel); return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cv) { st.view = b.dataset.cv; render(); return; }
    if (b.dataset.mv) { const [y, m] = st.ym; const d = new Date(y, m + Number(b.dataset.mv), 1); st.ym = [d.getFullYear(), d.getMonth()]; render(); return; }
    if (b.dataset.today) { const n = new Date(); st.ym = [n.getFullYear(), n.getMonth()]; st.sel = ymd(n); render(); return; }
    if (b.dataset.day) {
      st.sel = b.dataset.day;
      const d = parse(st.sel); st.ym = [d.getFullYear(), d.getMonth()];
      render(); return;
    }
  }
  // 左右スワイプで月を移動
  let sx = null;
  function onTouch(e) {
    if (st.view !== 'cal') return;
    if (e.type === 'touchstart') { sx = e.target.closest('.cal') ? e.touches[0].clientX : null; return; }
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) < 60) return;
    const [y, m] = st.ym; const d = new Date(y, m + (dx < 0 ? 1 : -1), 1); st.ym = [d.getFullYear(), d.getMonth()]; render();
  }

  const v = G.$('v-class');
  v.addEventListener('click', onClick);
  v.addEventListener('touchstart', onTouch, { passive: true });
  v.addEventListener('touchend', onTouch);
  st.uni = G.load('gl.eventsCache', null);
  loadUni().then(() => { if (G.cur === 'class') render(); });

  G.calendar = { routeLinks, fromStation, view: (x) => { st.view = x; if (G.cur === 'class') render(); }, mineOn, uniOn };
  G.reg('class', { title: 'カレンダー', render, tick: 60, skipTick: () => st.view === 'tt', onShow: () => { loadUni().then(() => G.cur === 'class' && render()); if (!G.kadai.summary().locked) G.kadai.refresh(); } });
})();
