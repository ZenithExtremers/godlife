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
      const u = uniOn(k), my = mineOn(k), kd = kadaiOn(k), sp = G.life.subpalEvents(k, k);
      const cls = ['cal-d', d.getMonth() !== m && 'out', k === today && 'today', k === st.sel && 'sel',
        (d.getDay() === 0 || holiday(k)) && 'sun', d.getDay() === 6 && 'sat', u.some((e) => /休|休業|休講/.test(e.kind || e.title)) && 'off'].filter(Boolean).join(' ');
      const dots = (u.length ? '<i class="dot-u"></i>' : '') + (kd.length ? '<i class="dot-k"></i>' : '') + (my.length ? '<i class="dot-m"></i>' : '') + (sp.length ? '<i class="dot-s"></i>' : '');
      h += `<button class="${cls}" data-day="${k}"><span>${d.getDate()}</span><em>${dots}</em></button>`;
    }
    h += '</div><div class="cal-legend"><span><i class="dot-u"></i>大学</span><span><i class="dot-k"></i>課題の締切</span><span><i class="dot-m"></i>自分の予定</span><span><i class="dot-s"></i>サブスク</span></div>';
    return h;
  }

  /* ---------- 選んだ日の一覧 ---------- */
  function dayList(day) {
    const u = uniOn(day), my = mineOn(day), kd = kadaiOn(day);
    let h = `<div class="gh">${md(day)}${holiday(day) ? '・祝日' : ''}<a href="#" data-add="${day}">＋ 予定を追加</a></div><div class="card cal-list">`;
    const rows = [];
    u.forEach((e) => rows.push(`<div class="ci"><span class="tag u">${G.esc(e.kind || '大学')}</span><div class="ct"><b>${G.esc(e.title)}</b>${e.end && e.end !== e.date ? `<small>${md(e.date)}〜${md(e.end)}</small>` : ''}</div></div>`));
    kd.forEach((i) => rows.push(`<div class="ci" onclick="G.go('kadai')"><span class="tag k">締切 ${G.esc(i.due.slice(11))}</span><div class="ct"><b>${G.esc(i.title)}</b><small>${G.esc(i.teacher || '')}${i.teacher ? '・' : ''}${G.esc(i.remain)}</small></div></div>`));
    my.forEach((e) => rows.push(`<div class="ci" data-edit="${e.id}"><span class="tag m">${e.allDay ? '終日' : `${G.esc(e.start || '')}${e.end ? '–' + G.esc(e.end) : ''}`}</span><div class="ct"><b>${G.esc(e.title)}</b><small>${e.place ? '📍' + G.esc(e.place) + '駅　' : ''}${e.repeat === 'weekly' ? '🔁 毎週' + wd(e.date) + '曜' : ''}${e.repeat === 'weekly' && e.memo ? '・' : ''}${G.esc(e.memo || '')}</small>${e.job ? `<small>💼 ${G.life.hrs(G.life.shiftMin(e))}${e.brk ? `（休憩${e.brk}分）` : ''}</small>` : ''}${e.items || (e.job && G.life.jobOf(e.job) && G.life.jobOf(e.job).items) ? `<small>🎒 ${G.esc(G.life.split(e.items).concat(e.job && G.life.jobOf(e.job) ? G.life.split(G.life.jobOf(e.job).items) : []).join('、'))}</small>` : ''}${destNote(e, day)}${routeLinks(e, day)}${machiLink(e, day) ? `<span class="rl">${machiLink(e, day)}</span>` : ''}</div></div>`));
    G.life.subpalEvents(day, day).forEach((x) => rows.push(`<a class="ci" href="${G.life.SUBPAL_URL}" style="text-decoration:none;color:inherit"><span class="tag s">${x.type === 'trial' ? '無料期間' : 'サブスク'}</span><div class="ct"><b>${G.esc(G.life.subLabel(x))}</b><small>SubPal で見る</small></div></a>`));
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

  /* ---------- 行き先（マイ駅）：部活など、大学の代わりに行く日 ---------- */
  const shift = (v, k) => { const [h, m] = v.split(':').map(Number); const t = Math.max(0, h * 60 + m + k); return `${G.pad(Math.floor(t / 60) % 24)}:${G.pad(t % 60)}`; };
  const stOf = (id) => G.commute.mySt().find((m) => m.id === id);
  // 行きはどこから出るか。e.from：''（自動）| 'home' | 'univ'
  // 自動：その日、予定より前に終わる大学の授業（オンライン以外）があれば大学から
  const mmOf = (v) => { if (!v) return 0; const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  function goFrom(e, day, startV) {
    const t = startV || e.dA || e.start;
    const campus = G.classes.dayList(parse(day)).filter((x) => !G.classes.isOnline(x.c) && (!t || x.e <= mmOf(t)));
    const lastEnd = campus.length ? campus[campus.length - 1].e : 0;
    if (e.from === 'home') return { from: 'home', auto: false };
    if (e.from === 'univ') return { from: 'univ', after: lastEnd, auto: false, last: campus[campus.length - 1] };
    return campus.length ? { from: 'univ', after: lastEnd, auto: true, last: campus[campus.length - 1] } : { from: 'home', auto: true };
  }
  // 予定 e の行き・帰りの計算（開始時刻に着く便・終了後に乗る便）
  function destPlans(e, day) {
    const st = e.dest && stOf(e.dest);
    if (!st) return null;
    const manual = !st.key; // 常磐線以外：入れた時刻で計算するので、開始・終了時刻がなくてもいい
    if (e.allDay && !manual) return null;
    const D = parse(day), mm = mmOf, gf = goFrom(e, day);
    const man = gf.from === 'univ' ? { mk: e.dM } : { ara: e.dL };
    return {
      st, from: gf.from,
      go: manual ? (e.dA || e.start ? G.commute.destPlan(st, D, 'go', mm(e.dA || e.start), man, gf) : null)
        : (e.start ? G.commute.destPlan(st, D, 'go', mm(e.start), null, gf) : null),
      back: manual ? (e.bL || e.end ? G.commute.destPlan(st, D, 'back', mm(e.bL || e.end), { ara: e.bA }) : null)
        : (e.end ? G.commute.destPlan(st, D, 'back', mm(e.end)) : null),
    };
  }
  function destNote(e, day) {
    const p = destPlans(e, day); if (!p) return '';
    const f = G.fmtMin, nm = G.commute.stName(p.st);
    const g = p.go && p.go.main, b = p.back && p.back.main;
    const need = (p.go && p.go.manualNeeded) || (p.back && p.back.manualNeeded);
    return `<small>🚃 📍${G.esc(nm)}駅${g ? `・行き：${f(g.leave)} に${leaveWord(g)}${g.late ? '（遅れます）' : ''}` : ''}${b ? `・帰り：${f(b.leave)} に出る → 家 ${f(b.arrive)} 着` : ''}${need ? `・${p.go && p.go.manualNeeded && p.from === 'univ' ? '南柏' : '荒川沖'}の時刻を入れてください` : ''}${(p.go && p.go.est) ? '（推定）' : ''}</small>`;
  }
  // 行きの出発の言い方（大学から直接行く日は「大学を出る」）
  const leaveWord = (o) => (o && o.fromUniv ? '大学を出る' : '家を出る');
  // 行きの最初の駅の一言（荒川沖 7:12 発・／南柏 16:40 発・）
  const firstLeg = (o) => (o && o.legs && o.legs[0] && ['荒川沖', '南柏'].includes(o.legs[0][0]) ? `${o.legs[0][0]} ${o.legs[0][1]}・` : '');
  // その日、大学から直接マイ駅に行く予定があるか（あれば大学から家への帰りは出さない）
  const directDay = (day) => mineOn(day).some((e) => { const p = destPlans(e, day); return p && p.from === 'univ' && p.go && (p.go.main || p.go.manualNeeded); });
  function destForm(e) {
    const ms = G.commute.mySt();
    if (!ms.length) return `<label class="f">行き先（部活など、大学の代わりに行く駅）</label><p class="muted" style="margin:4px 0">通学タブの設定で「マイ駅」を登録すると、ここで選べます。</p>`;
    return `<label class="f">行き先（部活など、大学の代わりに行く駅）</label>
      <select id="evDest"><option value="">なし</option>${ms.map((m) => `<option value="${m.id}"${m.id === e.dest ? ' selected' : ''}>${G.esc(G.commute.stName(m))}駅${m.label ? '（' + G.esc(m.label) + '）' : ''}</option>`).join('')}</select>
      <small class="muted" id="evDestHint">開始時刻に着く電車と、終了時刻のあとに乗る電車を計算します（家側は荒川沖のまま）</small>
      <div id="evFromBox"><label class="f">行きはどこから出る？</label>
        <select id="evFrom"><option value="">自動（授業がある日は大学から）</option><option value="home"${e.from === 'home' ? ' selected' : ''}>家から</option><option value="univ"${e.from === 'univ' ? ' selected' : ''}>大学から（授業のあと直接）</option></select>
        <small class="muted" id="evFromHint"></small></div>
      <div id="evDestM" hidden><small class="muted" id="evDestMH">常磐線以外の駅：着きたい時刻だけ入れておいて、あとで Yahoo!乗換案内で調べた「荒川沖」の時刻を入れてください</small>
        <div class="row2"><div><small class="muted">着きたい時刻（行き先）</small><input id="evDA" type="time" value="${e.dA || ''}"></div><div id="evDLBox"><small class="muted">荒川沖を出る時刻（あとで）</small><input id="evDL" type="time" value="${e.dL || ''}"></div><div id="evDMBox" hidden><small class="muted">南柏を出る時刻（あとで）</small><input id="evDM" type="time" value="${e.dM || ''}"></div></div>
        <a class="btn full" id="evDgY" target="_blank" rel="noopener" style="display:block;margin:4px 0">🚃 行きの経路を調べる</a>
        <div class="row2"><div><small class="muted">帰りに行き先を出る時刻</small><input id="evBL" type="time" value="${e.bL || ''}"></div><div><small class="muted">荒川沖に着く時刻（あとで）</small><input id="evBA" type="time" value="${e.bA || ''}"></div></div>
        <a class="btn full" id="evDbY" target="_blank" rel="noopener" style="display:block;margin:4px 0">🚃 帰りの経路を調べる</a>
        <small class="muted">家を出る時刻・家に着く時刻は、自転車（雨の日はバス）の時間で計算します。</small></div>`;
  }
  function bindDestForm(root, getDay) {
    const q = (x) => root.querySelector(x);
    if (!q('#evDest')) return;
    // 着きたい時刻・駅を出る時刻が空なら、予定の開始・終了をそのまま使う
    const fill = () => { if (!q('#evDA').value && q('#evS').value) q('#evDA').value = q('#evS').value; if (!q('#evBL').value && q('#evE').value) q('#evBL').value = q('#evE').value; };
    q('#evS').addEventListener('change', fill); q('#evE').addEventListener('change', fill); fill();
    const upd = () => {
      const st = stOf(q('#evDest').value), d = parse(getDay());
      q('#evDestM').hidden = !st || !!st.key;
      q('#evFromBox').hidden = !st;
      // 行きはどこから：自動のときは、どちらになるかを一言で
      const gf = goFrom({ from: q('#evFrom').value, dA: st && !st.key ? q('#evDA').value : '', start: q('#evS').value }, getDay());
      const fromNm = gf.from === 'univ' ? '南柏' : '荒川沖';
      q('#evFromHint').textContent = gf.from === 'univ'
        ? (gf.last ? `→ 大学から（${gf.last.n}限 ${G.fmtMin(gf.last.e)} に終わったあと、南柏から）` : '→ 大学から（南柏から）')
        : (gf.auto ? '→ 家から（この日は予定の前に大学の授業がありません）' : '→ 家から（荒川沖から）');
      q('#evDLBox').hidden = gf.from === 'univ'; q('#evDMBox').hidden = gf.from !== 'univ';
      q('#evDestMH').textContent = `常磐線以外の駅：着きたい時刻だけ入れておいて、あとで Yahoo!乗換案内で調べた「${fromNm}」の時刻を入れてください`;
      if (st && !st.key) {
        const nm = G.commute.stName(st);
        // 行き：入れた「駅に着く時刻」→ 予定の開始時刻 の順で、その時刻に着く経路。帰り：「駅を出る時刻」→ 終了時刻
        // 駅からの移動の分だけずらして調べる（行き：行き先に着く時刻 − 移動、帰り：行き先を出る時刻 ＋ 移動）
        q('#evDgY').href = G.commute.yahooUrl(fromNm, nm, d, shift(q('#evDA').value || q('#evS').value || '18:00', -st.access), 4);
        q('#evDbY').href = G.commute.yahooUrl(nm, '荒川沖', d, shift(q('#evBL').value || q('#evE').value || '21:00', st.access), 1);
      }
    };
    ['#evDest', '#evD', '#evS', '#evE', '#evDA', '#evBL', '#evFrom'].forEach((x) => { q(x).addEventListener('change', upd); q(x).addEventListener('input', upd); }); upd();
  }
  function readDestForm(root) {
    const q = (x) => root.querySelector(x);
    if (!q('#evDest')) return {};
    return { dest: q('#evDest').value || null, from: q('#evFrom').value || '', dL: q('#evDL').value, dM: q('#evDM').value, dA: q('#evDA').value, bL: q('#evBL').value, bA: q('#evBA').value, cgo: null, cback: null };
  }

  /* ---------- 1日の予定（時刻順の流れ） ---------- */
  function dayView(day) {
    const D = parse(day), now = new Date(), today = ymd(now), isToday = day === today;
    const k = Math.round((D - parse(today)) / 864e5); // 今日から何日後か
    const f = G.fmtMin, items = [], tops = [];
    const add = (t, icon, title, sub, cls) => items.push({ t, icon, title, sub: sub || '', cls: cls || '' });
    // 終日のもの（大学の行事・祝日・終日の予定）
    if (holiday(day)) tops.push('🎌 祝日');
    G.life.subpalEvents(day, day).forEach((x) => tops.push(`💳 ${G.esc(G.life.subLabel(x))}`));
    const wk = G.life.wakeFor(D); if (wk) add(wk.wake, '⏰', '起きる', `支度${G.life.prepMin()}分・${G.esc(wk.why)}`, 'move');
    uniOn(day).forEach((e) => tops.push(`🏫 ${G.esc(e.title)}`));
    // 授業と、大学への行き帰り
    const list = G.classes.dayList(D);
    const campus = list.filter((x) => !G.classes.isOnline(x.c));
    list.forEach((x) => add(x.s, G.classes.isOnline(x.c) ? '💻' : '🎓', `${x.n}限 ${G.esc(x.c.name)}`, `${f(x.s)}–${f(x.e)}${G.classes.isOnline(x.c) ? '・オンライン' : x.c.room ? '・' + G.esc(x.c.room) : ''}`, 'cls'));
    if (campus.length) {
      const first = campus[0], last = campus[campus.length - 1];
      const go = G.commute.arrivePlan('school', now, first.s, k, 'home').opts[0];
      if (go) {
        add(go.leave, '🚪', '家を出る', `${go.bus ? G.commute.busText(go) + '・' : ''}荒川沖 ${G.esc(go.legs[0][1])}・${G.esc(go.legs[0][2])}`, 'move');
        add(go.arrive, '🏫', '大学に着く', first.s - go.arrive > 0 ? `${first.n}限の${G.dur(first.s - go.arrive)}前` : `${first.n}限にちょうど`, 'move');
      }
      const end = new Date(D); end.setMinutes(last.e);
      const back = directDay(day) ? null : G.commute.nowPlan('home', end, 'univ').opts[0]; // 大学から直接部活などに行く日は、家への帰りを出さない
      if (back && !back.tomorrow) {
        add(back.leave, '🚃', '大学を出る', `南柏 ${G.esc(back.legs[0][1])}`, 'move');
        add(back.arrive, '🏠', '家に着く', '', 'move');
      }
    }
    // 自分の予定・部活の行き帰り
    mineOn(day).forEach((e) => {
      if (e.allDay || !e.start) tops.push(`📌 ${G.esc(e.title)}`);
      else add(toMin(e.start), e.job ? '💼' : '📌', G.esc(e.title) + (e.job ? `（${G.life.hrs(G.life.shiftMin(e))}）` : ''), `${G.esc(e.start)}${e.end ? '–' + G.esc(e.end) : ''}${e.place ? '・📍' + G.esc(e.place) : ''}`, 'ev');
      const p = destPlans(e, day); if (!p) return;
      const nm = G.esc(G.commute.stName(p.st)), go = p.go && p.go.main, bk = p.back && p.back.main;
      if (go) { add(go.leave, go.fromUniv ? '🏫' : '🚪', `${leaveWord(go)}（${G.esc(e.title)}）`, (go.bus ? G.commute.busText(go) + '・' : '') + G.esc(firstLeg(go).replace(/・$/, '')) + (go.late ? '・⚠ 授業のあとだと間に合いません' : ''), 'move'); add(go.arrive, '📍', `${G.esc(G.commute.placeName(p.st))}に着く`, `${nm}駅`, 'move'); }
      else if (p.go && p.go.manualNeeded) tops.push(`⚠ ${G.esc(e.title)}：${p.from === 'univ' ? '南柏' : '荒川沖'}の時刻がまだです`);
      if (bk) { add(bk.leave, '🚃', `${G.esc(G.commute.placeName(p.st))}を出る`, '', 'move'); add(bk.arrive, '🏠', '家に着く', '', 'move'); }
    });
    // 課題の締切
    kadaiOn(day).forEach((i) => add(toMin(i.due.slice(11)), '📝', `締切：${G.esc(i.title)}`, G.esc(i.remain), 'due'));
    const rank = { move: 0, cls: 1, ev: 2, due: 3 }; // 同じ時刻なら移動を先に
    items.sort((a, b) => a.t - b.t || (rank[a.cls] ?? 9) - (rank[b.cls] ?? 9));
    // まとめ
    const nCls = list.length, nEv = mineOn(day).length, nDue = kadaiOn(day).length;
    const sum = [nCls && `授業${nCls}コマ`, nEv && `予定${nEv}件`, nDue && `締切${nDue}件`].filter(Boolean).join('・') || '予定はありません';
    const wx = G.weather && G.weather.probIn(0, day, 6, 22);
    let h = `<div class="cal-head"><button class="btn" data-dmv="-1" aria-label="前の日">‹</button><b>${md(day)}</b><button class="btn" data-dmv="1" aria-label="次の日">›</button><button class="btn" data-dtoday="1">今日</button></div>`;
    h += `<div class="card day-sum"><div class="t1">${isToday ? '今日はこんな予定です' : k === 1 ? '明日はこんな予定です' : md(day) + 'の予定'}</div><div class="t2">${sum}</div>${wx != null ? `<div class="t3">☂ 家の周りの降水確率 ${wx}%${G.commute.rainy() && isToday ? '・雨モード' : ''}</div>` : ''}
      ${tops.length ? `<div class="day-tops">${tops.map((t) => `<span>${t}</span>`).join('')}</div>` : ''}
      ${G.life.itemsHtml(day) ? `<div class="t1" style="margin-top:8px">🎒 持ち物</div>${G.life.itemsHtml(day)}` : ''}</div>`;
    if (!items.length) return h + '<div class="card muted">時刻のある予定はありません。</div>';
    const nowMin = G.minOfDay(now);
    let marked = !isToday;
    h += '<div class="card day-line">' + items.map((it) => {
      let pre = '';
      if (!marked && it.t > nowMin) { marked = true; pre = `<div class="dl-now"><span>いま ${now.getHours()}:${G.pad(now.getMinutes())}</span></div>`; }
      const past = isToday && it.t <= nowMin;
      return `${pre}<div class="dl ${it.cls}${past ? ' past' : ''}"><b>${f(it.t)}</b><i>${it.icon}</i><div><div class="dl-t">${it.title}</div>${it.sub ? `<div class="dl-s">${it.sub}</div>` : ''}</div></div>`;
    }).join('') + (marked ? '' : `<div class="dl-now"><span>いま ${now.getHours()}:${G.pad(now.getMinutes())}</span></div>`) + '</div>';
    return h;
  }
  const toMin = (v) => { const [hh, mm] = String(v).split(':').map(Number); return hh * 60 + (mm || 0); };

  /* ---------- まちあわせ（待ち合わせアプリ）への入口 ---------- */
  const machiUrl = () => G.load('gl.machiUrl', '');
  // 予定のタイトル・日時・場所を入れた状態で、まちあわせの作成画面を開くリンク
  function machiLink(e, day) {
    const base = machiUrl(); if (!base || !e.start) return '';
    const st = e.dest && G.commute.mySt().find((m) => m.id === e.dest);
    const place = st ? (st.label ? `${G.commute.stName(st)}駅（${st.label}）` : G.commute.stName(st) + '駅') : e.place ? e.place + '駅' : '';
    const q = new URLSearchParams({ title: e.title, time: `${day}T${e.start}`, ...(place ? { place } : {}), ...(e.memo ? { note: e.memo } : {}) });
    return `<a class="btn" href="${G.esc(base.replace(/\/+$/, ''))}/?${q}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📍 まちあわせを作る</a>`;
  }
  function openMachiUrl() {
    G.openEditor(`<h3>📍 まちあわせのURL</h3><p>まちあわせアプリ（Render で公開したもの）の URL を入れると、カレンダーの予定から「📍 まちあわせを作る」で、タイトル・日時・場所を入れた状態の作成画面を開けます。</p>
      <input id="mcU" value="${G.esc(machiUrl())}" placeholder="https://machiawase-xxxx.onrender.com" autocapitalize="off" spellcheck="false">
      <button class="btn pri full" id="mcSave">保存</button><button class="btn full" id="mcClose">閉じる</button>`, (root) => {
      root.querySelector('#mcSave').onclick = () => {
        const v = root.querySelector('#mcU').value.trim();
        if (v && !/^https:\/\//.test(v)) { G.toast('https:// から始まる URL を入れてください'); return; }
        G.save('gl.machiUrl', v); G.closeEditor(); G.toast(v ? '保存しました' : 'まちあわせのURLを消しました');
      };
      root.querySelector('#mcClose').onclick = G.closeEditor;
    });
  }

  /* ---------- 予定の編集 ---------- */
  function edit(id, day, preset) {
    const all = mine();
    const e = all.find((x) => x.id === id) || { id: 'e' + Date.now().toString(36), title: '', date: day, allDay: false, start: '', end: '', memo: '', repeat: '', ...(preset || {}) };
    const jobs = G.life.jobs();
    const isNew = !all.some((x) => x.id === e.id);
    G.openEditor(`<h3>${isNew ? '予定を追加' : '予定を編集'}</h3>
      ${jobs.length ? `<label class="f">バイト先（シフトのとき）</label><select id="evJ"><option value="">バイトではない</option>${jobs.map((j) => `<option value="${j.id}"${j.id === e.job ? ' selected' : ''}>💼 ${G.esc(j.name)}</option>`).join('')}</select>` : ''}
      <label class="f">タイトル</label><input id="evT" value="${G.esc(e.title || (e.job && G.life.jobOf(e.job) ? G.life.jobOf(e.job).name : ''))}" placeholder="例：部活">
      <label class="f">日付</label><input id="evD" type="date" value="${e.date}">
      <label class="ocr-mode" style="color:var(--text);font-size:15px"><input type="checkbox" id="evA"${e.allDay ? ' checked' : ''}> 終日</label>
      <div class="row2" id="evTimes"${e.allDay ? ' hidden' : ''}><div><label class="f">開始</label><input id="evS" type="time" value="${e.start || ''}"></div><div><label class="f">終了</label><input id="evE" type="time" value="${e.end || ''}"></div></div>
      <label class="f">行き先の駅（入れると Yahoo!乗換案内で経路を調べられます）</label><input id="evP" value="${G.esc(e.place || '')}" placeholder="例：土浦（「駅」はなくてOK）">
      ${destForm(e)}
      <div id="evBrkBox"${e.job ? '' : ' hidden'}><label class="f">休憩（分）</label><input id="evBrk" type="number" min="0" value="${e.brk || ''}" placeholder="例：60"></div>
      <label class="f">持ち物（「、」で区切る。前日の夜とホームでチェック）</label><input id="evI" value="${G.esc(e.items || '')}" placeholder="例：ユニフォーム、タオル">
      <label class="f">くり返し</label><select id="evR"><option value="">しない</option><option value="weekly"${e.repeat === 'weekly' ? ' selected' : ''}>毎週</option></select>
      <label class="f">メモ</label><input id="evM" value="${G.esc(e.memo || '')}">
      <button class="btn pri full" id="evSave">保存</button>
      ${isNew ? '' : `<a class="btn full" style="display:block" target="_blank" rel="noopener" href="${gcal(e)}">📅 Googleカレンダーに追加</a><button class="btn danger full" id="evDel">この予定を消す</button>`}
      <button class="btn full" id="evCancel">閉じる</button>`, (root) => {
      const q = (s) => root.querySelector(s);
      q('#evA').onchange = () => { q('#evTimes').hidden = q('#evA').checked; };
      // バイト先を選んだら、タイトルと行き先（バイト先の最寄りのマイ駅）を入れる
      const jsel = q('#evJ');
      if (jsel) jsel.onchange = () => {
        const j = G.life.jobOf(jsel.value); q('#evBrkBox').hidden = !j;
        if (j) { if (!q('#evT').value || jobs.some((x) => x.name === q('#evT').value)) q('#evT').value = j.name; if (j.dest && q('#evDest')) { q('#evDest').value = j.dest; q('#evDest').dispatchEvent(new Event('change')); } }
      };
      if (jsel && jsel.value && !e.dest) jsel.onchange();
      bindDestForm(root, () => q('#evD').value || day);
      q('#evSave').onclick = () => {
        const t = q('#evT').value.trim(); if (!t) { q('#evT').focus(); return; }
        const n = { ...e, title: t, date: q('#evD').value || day, allDay: q('#evA').checked, start: q('#evS').value, end: q('#evE').value, memo: q('#evM').value.trim(), repeat: q('#evR').value, place: q('#evP').value.trim().replace(/駅$/, ''), ...readDestForm(root),
          job: jsel ? jsel.value || null : e.job || null, brk: Number(q('#evBrk').value) || 0, items: q('#evI').value.trim() };
        saveMine([...mine().filter((x) => x.id !== e.id), n]);
        st.sel = n.date; G.closeEditor(); render(); if (G.cur !== 'class' && G.mods[G.cur]) G.mods[G.cur].render(); // ホームから開いたときも描き直す
      };
      const del = q('#evDel');
      if (del) del.onclick = () => {
        const before = mine(); saveMine(before.filter((x) => x.id !== e.id)); G.closeEditor(); render(); if (G.cur !== 'class' && G.mods[G.cur]) G.mods[G.cur].render();
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
    const seg = `<div class="seg"><button data-cv="cal" class="${st.view === 'cal' ? 'on' : ''}">📅 月</button><button data-cv="day" class="${st.view === 'day' ? 'on' : ''}">📋 1日の予定</button><button data-cv="tt" class="${st.view === 'tt' ? 'on' : ''}">🗓 時間割</button><button data-cv="week" class="${st.view === 'week' ? 'on' : ''}">📝 週</button></div>`;
    G.$('title').textContent = { cal: 'カレンダー', day: '1日の予定', tt: '時間割', week: 'ふりかえり' }[st.view];
    if (st.view === 'week') { if (!st.wk) st.wk = G.ymd(G.life.monday(new Date())); v.innerHTML = seg + G.life.reviewHtml(parse(st.wk)); return; }
    if (st.view === 'tt') { v.innerHTML = seg + '<div id="ttBox"></div>'; G.classes.renderTT(); return; }
    if (st.view === 'day') { if (!st.sel) st.sel = ymd(new Date()); v.innerHTML = seg + dayView(st.sel); return; }
    const now = new Date();
    if (!st.ym) st.ym = [now.getFullYear(), now.getMonth()];
    if (!st.sel) st.sel = ymd(now);
    const ms = G.life.monthSummary(st.ym[0], st.ym[1]);
    v.innerHTML = seg + `<div class="card cal">${monthGrid()}</div>` +
      `<button class="btn full" data-jobs="1" style="margin-bottom:6px">💼 シフト・バイト先${ms.min ? `（${st.ym[1] + 1}月：${G.life.hrs(ms.min)}${ms.pay ? '・' + G.life.yen(ms.pay) : ''}）` : ''}</button>` + dayList(st.sel) +
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
    if (b.dataset.dmv) { st.sel = ymd(addDays(parse(st.sel), Number(b.dataset.dmv))); const d = parse(st.sel); st.ym = [d.getFullYear(), d.getMonth()]; render(); return; }
    if (b.dataset.dtoday) { st.sel = ymd(new Date()); render(); return; }
    if (b.dataset.wmv) { st.wk = ymd(addDays(parse(st.wk), 7 * Number(b.dataset.wmv))); render(); return; }
    if (b.dataset.wtoday) { st.wk = ymd(G.life.monday(new Date())); render(); return; }
    if (b.dataset.rvsave) { G.life.saveReview(b.dataset.rvsave, G.$('v-class')); return; }
    if (b.dataset.jobs) { G.life.openJobs(st.ym); return; }
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

  // ホームから予定の編集を開く
  function editById(id) { const e = mine().find((x) => x.id === id); if (e) edit(id, e.date); }
  // 荒川沖の時刻を入れる前の Yahoo!乗換案内（行き：着きたい時刻に着く／帰り：駅を出る時刻から）
  function destYahoo(e, day, kind) {
    const st = e.dest && stOf(e.dest); if (!st) return '#';
    const nm = G.commute.stName(st), d = parse(day);
    return kind === 'go' ? G.commute.yahooUrl(goFrom(e, day).from === 'univ' ? '南柏' : '荒川沖', nm, d, shift(e.dA || e.start || '18:00', -st.access), 4) : G.commute.yahooUrl(nm, '荒川沖', d, shift(e.bL || e.end || '21:00', st.access), 1);
  }
  // ほかの画面から：予定を新しく作る／ふりかえりを開く
  const newEvent = (day, preset) => edit(null, day, preset);
  function openWeek(key) { st.view = 'week'; st.wk = key; if (G.cur === 'class') render(); else G.go('class'); }
  G.calendar = { leaveWord, firstLeg, directDay, goFrom, openMachiUrl, machiLink, newEvent, openWeek, editById, destYahoo, destPlans, routeLinks, fromStation, view: (x) => { st.view = x; if (G.cur === 'class') render(); }, mineOn, uniOn };
  G.reg('class', { title: 'カレンダー', render, tick: 60, skipTick: () => st.view === 'tt', onShow: () => { loadUni().then(() => G.cur === 'class' && render()); if (!G.kadai.summary().locked) G.kadai.refresh(); } });
})();
