// シフト管理・持ち物チェック・一週間のふりかえり
(function () {
  const JKEY = 'gl.jobs', CKEY = 'gl.itemsChk', RKEY = 'gl.reviews', DLOG = 'gl.doneLog', WLOG = 'gl.wentLog';
  const f = G.fmtMin;
  const toMin = (v) => { const [h, m] = String(v || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const parse = (s) => new Date(s + 'T00:00:00');
  const addDays = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };
  const md = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${G.WD[d.getDay()]})`; };
  const hrs = (m) => `${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + '分' : ''}`;
  const yen = (n) => '¥' + Math.round(n).toLocaleString();

  /* ===================== シフト ===================== */
  // バイト先：{ id, name, wage（時給）, dest（マイ駅の id。あれば電車を計算）, items（いつもの持ち物）}
  const jobs = () => G.load(JKEY, []);
  const jobOf = (id) => jobs().find((j) => j.id === id);
  // 1回のシフトの働いた分（休憩を引く。日をまたぐシフトにも対応）
  function shiftMin(e) {
    if (!e.start || !e.end) return 0;
    let m = toMin(e.end) - toMin(e.start); if (m < 0) m += 1440;
    return Math.max(0, m - (Number(e.brk) || 0));
  }
  // その月のシフト（毎週くり返しも1回ずつ数える）
  function monthShifts(y, m) {
    const out = [];
    for (let d = new Date(y, m, 1); d.getMonth() === m; d = addDays(d, 1)) {
      const day = G.ymd(d);
      G.calendar.mineOn(day).filter((e) => e.job).forEach((e) => out.push({ e, day }));
    }
    return out;
  }
  function monthSummary(y, m) {
    const by = {};
    for (const { e, day } of monthShifts(y, m)) {
      const j = jobOf(e.job); const k = e.job;
      by[k] ||= { job: j, min: 0, count: 0, days: [] };
      by[k].min += shiftMin(e); by[k].count++; by[k].days.push(day);
    }
    let min = 0, pay = 0;
    Object.values(by).forEach((x) => { x.pay = x.job && x.job.wage ? (x.min / 60) * x.job.wage : 0; min += x.min; pay += x.pay; });
    return { by, min, pay };
  }

  // シフト・バイト先の画面（カレンダーの月表示から開く）
  function openJobs(ym) {
    const now = new Date(); const [y, m] = ym || [now.getFullYear(), now.getMonth()];
    const sum = monthSummary(y, m);
    const ms = G.commute.mySt();
    const list = jobs();
    G.openEditor(`<h3>💼 シフト（${y}年${m + 1}月）</h3>
      <div class="card" style="margin-bottom:8px"><div class="muted">今月の勤務</div>
        <div style="font-size:22px;font-weight:800">${hrs(sum.min)}${sum.pay ? `<span style="font-size:15px;margin-left:8px">給料の目安 ${yen(sum.pay)}</span>` : ''}</div>
        ${Object.values(sum.by).map((x) => `<div class="muted">${G.esc(x.job ? x.job.name : '（消したバイト先）')}：${x.count}回・${hrs(x.min)}${x.pay ? '・' + yen(x.pay) : ''}</div>`).join('') || '<div class="muted">今月のシフトはまだありません</div>'}
        <div class="muted" style="margin-top:4px">休憩を引いた時間 × 時給の目安です（交通費・深夜手当・税金などは含みません）</div></div>
      <button class="btn pri full" id="jbAddShift">＋ シフトを追加</button>
      <label class="f" style="margin-top:12px">バイト先</label>
      ${list.map((j) => `<div class="ms-row"><div><b>${G.esc(j.name)}</b><small>${j.wage ? '時給 ' + yen(j.wage) : '時給未設定'}${j.dest && ms.find((x) => x.id === j.dest) ? '・📍' + G.esc(G.commute.stName(ms.find((x) => x.id === j.dest))) + '駅' : ''}${j.items ? '・持ち物：' + G.esc(j.items) : ''}</small></div><button class="btn" data-jedit="${j.id}">直す</button></div>`).join('') || '<p class="muted">まだありません</p>'}
      <button class="btn full" id="jbNew">＋ バイト先を追加</button>
      <button class="btn full" id="jbClose">閉じる</button>`, (root) => {
      root.querySelector('#jbClose').onclick = G.closeEditor;
      root.querySelector('#jbNew').onclick = () => editJob(null);
      root.querySelector('#jbAddShift').onclick = () => {
        if (!jobs().length) { G.toast('先にバイト先を追加してください'); editJob(null); return; }
        G.calendar.newEvent(G.ymd(new Date()), { job: jobs()[0].id });
      };
      root.querySelectorAll('[data-jedit]').forEach((b) => { b.onclick = () => editJob(b.dataset.jedit); });
    });
  }
  function editJob(id) {
    const j = jobOf(id) || { id: 'j' + Date.now().toString(36), name: '', wage: '', dest: '', items: '' };
    const isNew = !jobOf(id);
    const ms = G.commute.mySt();
    G.openEditor(`<h3>${isNew ? 'バイト先を追加' : 'バイト先を直す'}</h3>
      <label class="f">名前</label><input id="jbN" value="${G.esc(j.name)}" placeholder="例：コンビニ">
      <label class="f">時給（円）</label><input id="jbW" type="number" min="0" value="${j.wage || ''}" placeholder="例：1100">
      <label class="f">最寄りの駅（マイ駅。選ぶと電車を計算します）</label><select id="jbD"><option value="">なし（家の近くなど）</option>${ms.map((m) => `<option value="${m.id}"${m.id === j.dest ? ' selected' : ''}>${G.esc(G.commute.stName(m))}駅${m.label ? '（' + G.esc(m.label) + '）' : ''}</option>`).join('')}</select>
      <small class="muted">マイ駅は通学タブの設定で登録できます</small>
      <label class="f">いつもの持ち物（「、」で区切る）</label><input id="jbI" value="${G.esc(j.items || '')}" placeholder="例：制服、名札">
      <button class="btn pri full" id="jbSave">保存</button>
      ${isNew ? '' : '<button class="btn danger full" id="jbDel">このバイト先を消す</button>'}
      <button class="btn full" id="jbBack">戻る</button>`, (root) => {
      const q = (x) => root.querySelector(x);
      q('#jbSave').onclick = () => {
        const n = { ...j, name: q('#jbN').value.trim(), wage: Number(q('#jbW').value) || 0, dest: q('#jbD').value, items: q('#jbI').value.trim() };
        if (!n.name) { q('#jbN').focus(); return; }
        G.save(JKEY, [...jobs().filter((x) => x.id !== j.id), n]); openJobs();
      };
      const del = q('#jbDel'); if (del) del.onclick = () => { G.save(JKEY, jobs().filter((x) => x.id !== j.id)); openJobs(); };
      q('#jbBack').onclick = () => openJobs();
    });
  }

  /* ===================== 持ち物 ===================== */
  const split = (s) => String(s || '').split(/[、,，\n]/).map((x) => x.trim()).filter(Boolean);
  // その日の持ち物（予定・部活ごとの持ち物 ＋ バイト先のいつもの持ち物）
  function itemsFor(day) {
    const out = [], seen = new Set();
    for (const e of G.calendar.mineOn(day)) {
      const j = e.job && jobOf(e.job);
      for (const name of [...split(e.items), ...(j ? split(j.items) : [])]) {
        if (seen.has(name)) continue; seen.add(name);
        out.push({ name, from: e.title });
      }
    }
    return out;
  }
  const checked = (day) => (G.load(CKEY, {})[day] || {});
  function toggle(day, name) {
    const all = G.load(CKEY, {});
    all[day] ||= {}; all[day][name] = !all[day][name];
    // 古い日の記録は消す
    const lim = G.ymd(addDays(new Date(), -14));
    Object.keys(all).forEach((d) => { if (d < lim) delete all[d]; });
    G.save(CKEY, all);
  }
  // チェックリスト（ホーム・シンプル表示で使う）
  function itemsHtml(day, small) {
    const items = itemsFor(day); if (!items.length) return '';
    const ck = checked(day), done = items.filter((i) => ck[i.name]).length;
    return `<div class="items${small ? ' small' : ''}">${items.map((i) => `<button class="it${ck[i.name] ? ' on' : ''}" data-item="${G.esc(i.name)}" data-iday="${day}" title="${G.esc(i.from)}">${ck[i.name] ? '✅' : '⬜'} ${G.esc(i.name)}</button>`).join('')}</div>
      <div class="muted" style="font-size:12px">${done}/${items.length} 入れた</div>`;
  }
  // ホームのカード：今日の持ち物（18時以降は明日の分も）
  function itemsCard(now = new Date()) {
    const today = G.ymd(now), tm = G.ymd(addDays(now, 1));
    let h = '';
    const a = itemsHtml(today);
    if (a) h += `<div class="t1">今日の持ち物</div>${a}`;
    if (now.getHours() >= 18) { const b = itemsHtml(tm); if (b) h += `<div class="t1" style="margin-top:8px">明日の持ち物</div>${b}`; }
    return h ? `<div class="gh">🎒 持ち物チェック</div><div class="card">${h}</div>` : '';
  }
  // タップでチェック（どの画面でも）
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-item]'); if (!b) return;
    e.stopPropagation();
    toggle(b.dataset.iday, b.dataset.item);
    const on = !!checked(b.dataset.iday)[b.dataset.item];
    document.querySelectorAll(`[data-item="${CSS.escape(b.dataset.item)}"][data-iday="${b.dataset.iday}"]`).forEach((x) => { x.classList.toggle('on', on); x.textContent = `${on ? '✅' : '⬜'} ${b.dataset.item}`; });
    document.querySelectorAll('.items').forEach((box) => {
      const n = box.querySelectorAll('.it').length, k = box.querySelectorAll('.it.on').length;
      if (box.nextElementSibling) box.nextElementSibling.textContent = `${k}/${n} 入れた`;
    });
  }, true);

  /* ===================== 一週間のふりかえり ===================== */
  // 記録：課題を完了にした日・大学（駅）に出かけた日
  function logDone(id, title) { const a = G.load(DLOG, []); a.push({ id, t: Date.now(), title }); G.save(DLOG, a.slice(-300)); }
  function logWent() { const a = G.load(WLOG, {}); a[G.ymd(new Date())] = 1; G.save(WLOG, a); }
  const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function weekStats(mon) {
    const s = { cls: 0, online: 0, classDays: 0, went: 0, events: 0, bukatsu: 0, shiftMin: 0, pay: 0, done: [], due: 0 };
    const went = G.load(WLOG, {});
    for (let i = 0; i < 7; i++) {
      const d = addDays(mon, i), day = G.ymd(d);
      const list = G.classes.dayList(d);
      s.cls += list.length; s.online += list.filter((x) => G.classes.isOnline(x.c)).length;
      if (list.some((x) => !G.classes.isOnline(x.c))) s.classDays++;
      if (went[day]) s.went++;
      for (const e of G.calendar.mineOn(day)) {
        if (e.job) { const m = shiftMin(e), j = jobOf(e.job); s.shiftMin += m; if (j && j.wage) s.pay += (m / 60) * j.wage; }
        else if (e.dest) s.bukatsu++;
        else s.events++;
      }
    }
    const t0 = +mon, t1 = +addDays(mon, 7);
    s.done = G.load(DLOG, []).filter((x) => x.t >= t0 && x.t < t1);
    return s;
  }
  const reviews = () => G.load(RKEY, {});
  function reviewHtml(mon) {
    const key = G.ymd(mon), s = weekStats(mon), r = reviews()[key] || {};
    const end = addDays(mon, 6);
    const thisWeek = key === G.ymd(monday(new Date()));
    const cell = (n, l) => `<div class="rv-c"><b>${n}</b><span>${l}</span></div>`;
    return `<div class="cal-head"><button class="btn" data-wmv="-1" aria-label="前の週">‹</button><b>${md(key)}〜${md(G.ymd(end))}</b><button class="btn" data-wmv="1" aria-label="次の週">›</button><button class="btn" data-wtoday="1">今週</button></div>
      <div class="card"><div class="t1 muted">${thisWeek ? '今週' : 'この週'}のまとめ</div>
        <div class="rv-grid">${cell(s.cls + 'コマ', '授業' + (s.online ? `（オンライン${s.online}）` : ''))}${cell(s.went + '日', '出かけた日' + (s.classDays ? `（授業の日${s.classDays}）` : ''))}${cell(s.done.length + '件', '課題を完了')}${cell(hrs(s.shiftMin), 'バイト' + (s.pay ? '・' + yen(s.pay) : ''))}${cell(s.bukatsu + '回', '部活など')}${cell(s.events + '件', 'その他の予定')}</div>
        ${s.done.length ? `<div class="muted" style="margin-top:6px">完了した課題：${s.done.map((x) => G.esc((x.title || '').slice(0, 16))).join('、')}</div>` : ''}
        <div class="muted" style="font-size:11px;margin-top:4px">「出かけた日」と「課題を完了」は、この機能を入れた日から数えています</div></div>
      <div class="card"><label class="f" style="margin-top:0">😊 よかったこと</label><textarea id="rvGood" rows="2" placeholder="例：課題を全部締切前に出せた">${G.esc(r.good || '')}</textarea>
        <label class="f">🎯 来週の目標</label><textarea id="rvGoal" rows="2" placeholder="例：1限に遅れない">${G.esc(r.goal || '')}</textarea>
        <button class="btn pri full" data-rvsave="${key}">保存</button>
        ${(() => { const p = reviews()[G.ymd(addDays(mon, -7))]; return p && p.goal ? `<div class="muted" style="margin-top:8px">先週の目標：${G.esc(p.goal)}</div>` : ''; })()}</div>`;
  }
  function saveReview(key, root) {
    const all = reviews();
    all[key] = { good: root.querySelector('#rvGood').value.trim(), goal: root.querySelector('#rvGoal').value.trim(), at: Date.now() };
    G.save(RKEY, all); G.toast('ふりかえりを保存しました');
  }
  // ホームのお知らせ：日曜18時〜月曜12時、その週のふりかえりをまだ書いていなければ
  function reviewCard(now = new Date()) {
    const dw = now.getDay(), h = now.getHours();
    if (!((dw === 0 && h >= 18) || (dw === 1 && h < 12))) return '';
    const mon = dw === 0 ? monday(now) : addDays(monday(now), -7);
    if (reviews()[G.ymd(mon)]) return '';
    const s = weekStats(mon);
    return `<div class="card tile" onclick="G.life.openReview('${G.ymd(mon)}')"><div class="ic">📝</div><div class="tx"><div class="t1">一週間のふりかえり</div>
      <div class="t2" style="font-size:16px">授業${s.cls}コマ・課題${s.done.length}件完了${s.shiftMin ? '・バイト' + hrs(s.shiftMin) : ''}</div><div class="t3">よかったこと・来週の目標を書こう</div></div><div class="go">›</div></div>`;
  }
  // 通知用の文
  function reviewMsg(mon) {
    const s = weekStats(mon);
    return `授業${s.cls}コマ・出かけた日${s.went}日・課題${s.done.length}件完了${s.shiftMin ? '・バイト' + hrs(s.shiftMin) : ''}${s.bukatsu ? '・部活など' + s.bukatsu + '回' : ''}\nアプリで「よかったこと」「来週の目標」を書こう`;
  }

  /* ===================== SubPal（同じスマホのサブスク管理アプリ）を読む ===================== */
  // SubPal のデータ（localStorage 'subpal.v1'）は同じ zenithextremers.github.io なので読める。書き換えはしない
  const SUBPAL_URL = 'https://zenithextremers.github.io/subpal/';
  function subpalSubs() {
    try { const s = JSON.parse(localStorage.getItem('subpal.v1') || 'null'); return (s && s.subs || []).filter((x) => x.status === 'active'); } catch (e) { return []; }
  }
  // 支払い日を周期で進める（SubPal と同じ考え方：毎月・毎年・毎週 × interval）
  function nextCycle(ds, sub) {
    const d = parse(ds), i = sub.interval || 1;
    if (sub.cycle === 'week') d.setDate(d.getDate() + 7 * i);
    else { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (sub.cycle === 'year' ? 12 : 1) * i); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    return G.ymd(d);
  }
  // from〜to（ymd）のあいだの支払い・無料期間の終わり
  function subpalEvents(from, to) {
    const out = [];
    for (const s of subpalSubs()) {
      if (s.trialEnd && s.trialEnd >= from && s.trialEnd <= to) out.push({ day: s.trialEnd, type: 'trial', s });
      let d = s.nextDate, g = 0;
      while (d && d <= to && g++ < 60) { if (d >= from && d !== s.trialEnd) out.push({ day: d, type: 'bill', s }); d = nextCycle(d, s); }
    }
    return out.sort((a, b) => a.day.localeCompare(b.day));
  }
  const subLabel = (x) => (x.type === 'trial' ? `${x.s.name} の無料期間が終わる` : `${x.s.name} の支払い${x.s.price ? ' ' + yen(Number(x.s.price)) : ''}`);
  // ホームのカード：7日以内
  function subpalCard(now = new Date()) {
    const today = G.ymd(now), ev = subpalEvents(today, G.ymd(addDays(now, 7)));
    if (!ev.length) return '';
    const dl = (d) => { const k = Math.round((parse(d) - parse(today)) / 864e5); return k === 0 ? '今日' : k === 1 ? '明日' : md(d); };
    return `<a class="card tile" href="${SUBPAL_URL}" style="text-decoration:none;color:inherit"><div class="ic">💳</div><div class="tx"><div class="t1">サブスク（SubPal）</div>
      ${ev.slice(0, 3).map((x) => `<div class="t3" style="white-space:normal">${x.type === 'trial' ? '⚠ ' : ''}<b>${dl(x.day)}</b> ${G.esc(subLabel(x))}</div>`).join('')}${ev.length > 3 ? `<div class="t3">ほか${ev.length - 3}件</div>` : ''}</div><div class="go">›</div></a>`;
  }

  /* ===================== 起きる時刻 ===================== */
  // 家を出る時刻 − 支度の時間。その日の一番早い「家を出る」（大学・バイト・部活）から逆算
  const prepMin = () => Number(G.load('gl.prep', 60)) || 60;
  function firstLeave(D) {
    const now = new Date(), k = Math.round((new Date(D).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 864e5);
    const cand = [];
    const campus = G.classes.dayList(D).filter((x) => !G.classes.isOnline(x.c));
    if (campus.length) { const o = G.commute.arrivePlan('school', now, campus[0].s, k, 'home').opts[0]; if (o) cand.push({ leave: o.leave, why: `${campus[0].n}限 ${campus[0].c.name}` }); }
    const day = G.ymd(D);
    for (const e of G.calendar.mineOn(day)) {
      const p = G.calendar.destPlans(e, day), o = p && p.go && p.go.main;
      if (o) cand.push({ leave: o.leave, why: e.title });
    }
    cand.sort((a, b) => a.leave - b.leave);
    return cand[0] || null;
  }
  function wakeFor(D) { const f1 = firstLeave(D); return f1 ? { wake: f1.leave - prepMin(), leave: f1.leave, why: f1.why } : null; }
  // ホーム：18時以降は明日の起きる時刻
  function wakeCard(now = new Date()) {
    if (now.getHours() < 18) return '';
    const w = wakeFor(addDays(now, 1)); if (!w) return '';
    return `<div class="card tile" onclick="G.life.openPrep()"><div class="ic">⏰</div><div class="tx"><div class="t1">明日起きる時刻</div><div class="t2">${f(w.wake)} に起きる</div>
      <div class="t3">${f(w.leave)} に家を出る（${G.esc(w.why)}）・支度${prepMin()}分</div></div><div class="go">›</div></div>`;
  }
  function openPrep() {
    G.openEditor(`<h3>⏰ 起きる時刻</h3><p>家を出る時刻から、支度の時間を引いて「起きる時刻」を出します。前の日の夜にホームと通知でお知らせします。</p>
      <label class="f">支度にかかる時間</label><select id="prepM">${[30, 45, 60, 75, 90, 120].map((m) => `<option value="${m}"${m === prepMin() ? ' selected' : ''}>${m}分</option>`).join('')}</select>
      <button class="btn pri full" id="prepSave">保存</button><button class="btn full" id="prepClose">閉じる</button>`, (root) => {
      root.querySelector('#prepSave').onclick = () => { G.save('gl.prep', Number(root.querySelector('#prepM').value)); G.closeEditor(); if (G.mods[G.cur]) G.mods[G.cur].render(); };
      root.querySelector('#prepClose').onclick = G.closeEditor;
    });
  }

  /* ===================== 常磐線の運行情報（GitHub Actions が10分おきに確認） ===================== */
  const TI_URL = 'https://raw.githubusercontent.com/ZenithExtremers/godlife/status/traininfo.json';
  let ti = G.load('gl.traininfo', null), tiBusy = false;
  async function loadTrain() {
    if (tiBusy) return ti; tiBusy = true;
    try { const r = await fetch(TI_URL + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { ti = await r.json(); G.save('gl.traininfo', ti); } } catch (e) {}
    tiBusy = false; return ti;
  }
  // 40分以内に確認できていて、常磐線に遅延・運休があるとき
  const trainFresh = () => ti && ti.ok && Date.now() - Date.parse(ti.checked) < 40 * 60e3;
  const trainTrouble = () => (trainFresh() ? ti.trouble || [] : []);
  function trainBanner() {
    const t = trainTrouble(); if (!t.length) return '';
    return `<a class="banner" href="https://transit.yahoo.co.jp/diainfo/area/4" target="_blank" rel="noopener" style="display:block;text-decoration:none">⚠ <b>${t.map((l) => `${G.esc(l.name)}：${G.esc(l.status)}`).join('／')}</b>
      ${t[0].detail ? `<div style="margin-top:2px">${G.esc(t[0].detail.slice(0, 90))}</div>` : ''}<div style="font-size:11px;margin-top:2px">${new Date(ti.checked).getHours()}:${G.pad(new Date(ti.checked).getMinutes())} 時点・時刻表どおりに走らないかもしれません（タップで運行情報）</div></a>`;
  }
  // 通学タブ：問題なしのときも小さく
  function trainNote() {
    if (!ti) return '';
    const at = `${new Date(ti.checked).getHours()}:${G.pad(new Date(ti.checked).getMinutes())}`;
    if (!trainFresh()) return `<div class="muted" style="margin:-4px 0 8px">常磐線の運行情報：確認できていません（最終 ${at}）</div>`;
    return trainTrouble().length ? trainBanner() : `<div class="muted" style="margin:-4px 0 8px">✅ 常磐線：遅延・運休の情報なし（${at} 時点）</div>`;
  }

  G.life = { loadTrain, trainTrouble, trainBanner, trainNote,
    subpalEvents, subLabel, subpalCard, SUBPAL_URL, wakeFor, wakeCard, openPrep, prepMin,
    jobs, jobOf, shiftMin, monthSummary, openJobs,
    itemsFor, itemsHtml, itemsCard, split,
    logDone, logWent, monday, weekStats, reviewHtml, saveReview, reviewCard, reviewMsg,
    openReview: (key) => G.calendar.openWeek(key), hrs, yen,
  };
})();
