// 通学（LASTCALL から流用）— 大学 ⇄ 南柏 ⇄ 柏（乗換）⇄ 荒川沖 ⇄ 家
(function () {
  const CFG = {
    walkUniv: 25,   // 大学 ⇄ 南柏駅（徒歩）
    bikeHome: 30,   // 荒川沖駅 ⇄ 家（自転車）
    margin: 2,      // 駅に着いてから乗るまでの余裕
    transfer: 3,    // 柏での乗り換え
    mkKashiwa: 3,   // 南柏 ⇄ 柏 の乗車時間
  };
  const CHOICES = { walkUniv: [15, 20, 25], bikeHome: [20, 25, 30] };

  // 祝日（土休日ダイヤ）。年末年始 12/30〜1/3 も土休日ダイヤ扱い。
  const HOLIDAYS = new Set([
    '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20', '2026-04-29',
    '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06', '2026-07-20', '2026-08-11',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-03', '2026-11-23',
    '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22',
    '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05', '2027-07-19', '2027-08-11',
    '2027-09-20', '2027-09-23', '2027-10-11', '2027-11-03', '2027-11-23',
  ]);

  // 設定（LASTCALL の保存値があれば最初に引き継ぐ）
  const SKEY = 'gl.commute';
  const S = G.load(SKEY, null) || (() => {
    const s = { dir: 'home', mode: 'now', dayMode: 'auto', arrive: {} };
    for (const k of Object.keys(CHOICES)) { const v = Number(G.raw(k)); if (CHOICES[k].includes(v)) s[k] = v; }
    return s;
  })();
  for (const k of Object.keys(CHOICES)) if (CHOICES[k].includes(S[k])) CFG[k] = S[k];
  const saveS = () => G.save(SKEY, S);

  const { pad, fmtMin: fmt, ymd } = G;

  function autoDayType(date) {
    const w = date.getDay(), md = (date.getMonth() + 1) * 100 + date.getDate();
    if (w === 0 || w === 6 || HOLIDAYS.has(ymd(date)) || md >= 1230 || md <= 103) return 'ho';
    return 'wk';
  }
  const typeOf = (date) => (S.dayMode === 'auto' ? autoDayType(date) : S.dayMode);
  const dayStart = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };

  // Yahoo!乗換案内で同じ経路を、その列車の発車時刻から検索する（Android はアプリを直接開く）
  const YAHOO_PKG = 'jp.co.yahoo.android.apps.transit';
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const appIntent = (path, webUrl) =>
    `intent://${path}#Intent;scheme=yjtransit;package=${YAHOO_PKG};S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
  function routeUrl(o, svc) {
    const d = new Date(svc); d.setDate(d.getDate() + Math.floor(o.search.dep / 1440));
    const m = ((o.search.dep % 1440) + 1440) % 1440, hh = Math.floor(m / 60), mn = m % 60;
    const ft = `from=${encodeURIComponent(o.search.from)}&to=${encodeURIComponent(o.search.to)}`;
    const app = `conditions?${ft}&d=${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}&t=${pad(hh)}${pad(mn)}&type=1&prop=y`;
    const web = `https://transit.yahoo.co.jp/search/result?${ft}&y=${d.getFullYear()}&m=${pad(d.getMonth() + 1)}&d=${pad(d.getDate())}` +
      `&hh=${pad(hh)}&m1=${Math.floor(mn / 10)}&m2=${mn % 10}&type=1`;
    return isAndroid ? appIntent(app, web) : web;
  }
  const INFO_WEB = 'https://transit.yahoo.co.jp/diainfo/area/4';
  const infoLink = isAndroid ? appIntent('diainfo', INFO_WEB) : INFO_WEB;

  // 帰り：大学 → 南柏 → 柏（乗換）→ 荒川沖 → 家
  function homeOptions(tt) {
    const out = [];
    for (const [kDep, type, dest, araArr] of tt.chuDown) {
      let mk = null;
      for (const d of tt.mkDown) if (d + CFG.mkKashiwa + CFG.transfer <= kDep) mk = d; else break;
      if (mk === null) continue;
      out.push({
        leave: mk - CFG.walkUniv - CFG.margin,
        arrive: araArr + CFG.bikeHome,
        search: { from: '南柏', to: '荒川沖', dep: mk },
        legs: [
          ['南柏', fmt(mk) + ' 発', '各駅停車'],
          ['柏', `${fmt(mk + CFG.mkKashiwa)} 着 → ${fmt(kDep)} 発`, `${type} ${dest}行`],
          ['荒川沖', fmt(araArr) + ' 着', '自転車 ' + CFG.bikeHome + '分'],
        ],
      });
    }
    return prune(out);
  }
  // 行き：家 → 荒川沖 → 柏（乗換）→ 南柏 → 大学
  function schoolOptions(tt) {
    const out = [];
    for (const [araDep, type, dest, kArr] of tt.chuUp) {
      const mk = tt.mkUp.find((u) => u - CFG.mkKashiwa >= kArr + CFG.transfer);
      if (mk === undefined) continue;
      out.push({
        leave: araDep - CFG.bikeHome - CFG.margin,
        arrive: mk + CFG.walkUniv,
        search: { from: '荒川沖', to: '南柏', dep: araDep },
        legs: [
          ['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行`],
          ['柏', `${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発`, '各駅停車'],
          ['南柏', fmt(mk) + ' 着', '徒歩 ' + CFG.walkUniv + '分'],
        ],
      });
    }
    return prune(out);
  }
  // 同じ時刻以前に着く、もっと遅く出られる候補があれば、早く出るほうは省く
  function prune(list) {
    list.sort((a, b) => a.leave - b.leave);
    return list.filter((o, i) => !list.slice(i + 1).some((x) => x.arrive <= o.arrive));
  }
  const shift = (o, k) => ({ ...o, leave: o.leave + k, arrive: o.arrive + k, search: { ...o.search, dep: o.search.dep + k } });
  const builder = (dir) => (dir === 'home' ? homeOptions : schoolOptions);

  // 「今すぐ」：これから乗れる候補（深夜0〜3時は前日のダイヤ扱い）
  function nowPlan(dir, now) {
    let nowMin = G.minOfDay(now);
    const svc = new Date(now);
    if (now.getHours() < 3) { svc.setDate(svc.getDate() - 1); nowMin += 1440; }
    const next = new Date(svc); next.setDate(next.getDate() + 1);
    const build = builder(dir);
    let opts = build(TIMETABLE[typeOf(svc)]).filter((o) => o.leave >= nowMin);
    if (opts.length < 4) opts = opts.concat(build(TIMETABLE[typeOf(next)]).map((o) => shift(o, 1440)));
    opts = opts.slice(0, 4);
    for (const o of opts) {
      const d = new Date(svc); d.setDate(d.getDate() + Math.floor(o.leave / 1440));
      o.tomorrow = ymd(d) !== ymd(now);
      o.leaveAbs = o.leave;
    }
    return { opts, base: svc, nowAbs: nowMin, type: typeOf(svc) };
  }
  // 「到着時刻を指定」：T（分）までに着く候補を遅い順に。過ぎていれば翌日
  function arrivePlan(dir, now, T) {
    const nowClock = G.minOfDay(now);
    const D = dayStart(now);
    if (T <= nowClock) D.setDate(D.getDate() + 1);
    const isTomorrow = ymd(D) !== ymd(now);
    const nowAbs = (now - D) / 60000;
    const prev = new Date(D); prev.setDate(prev.getDate() - 1);
    const build = builder(dir);
    const opts = build(TIMETABLE[typeOf(prev)]).map((o) => shift(o, -1440)).concat(build(TIMETABLE[typeOf(D)]))
      .filter((o) => o.arrive <= T).sort((a, b) => b.leave - a.leave).slice(0, 4);
    for (const o of opts) { o.leaveAbs = o.leave; o.tomorrow = isTomorrow && o.leave >= 0; }
    return { opts, base: D, nowAbs, isTomorrow, type: typeOf(D) };
  }

  /* ---- 画面 ---- */
  const getArrive = () => S.arrive[S.dir] || (S.dir === 'school' ? '08:50' : '18:00');
  const legsHtml = (o) => `<ol class="legs">${o.legs.map(([st, t, how]) => `<li><b>${st}</b><span>${t}</span><em>${how}</em></li>`).join('')}</ol>`;
  const listHtml = (opts, base, nowAbs, to) => opts.map((o) => `
    <li><a class="card" style="display:block;color:inherit;text-decoration:none" href="${routeUrl(o, base)}">
      <div class="row"><span>${o.tomorrow ? '明日 ' : ''}${fmt(o.leave)} 出発 <small>${o.leaveAbs - nowAbs >= 0 ? 'あと' + G.dur(o.leaveAbs - nowAbs) : '出発時刻を過ぎています'}</small></span><span>${to} ${fmt(o.arrive)} 着</span></div>
      <div class="sub">${o.legs.map(([st, t]) => `${st} ${t.split(' → ').pop()}`).join(' ・ ')}</div>
    </a></li>`).join('');

  function render() {
    const v = G.$('v-commute');
    const now = new Date();
    const from = S.dir === 'home' ? '大学' : '家';
    const to = S.dir === 'home' ? '家' : '大学';
    let h = `<div class="seg"><button data-dir="school" class="${S.dir === 'school' ? 'on' : ''}">行き（家→大学）</button><button data-dir="home" class="${S.dir === 'home' ? 'on' : ''}">帰り（大学→家）</button></div>
      <div class="seg"><button data-mode="now" class="${S.mode === 'now' ? 'on' : ''}">今すぐ</button><button data-mode="arrive" class="${S.mode === 'arrive' ? 'on' : ''}">到着時刻を指定</button></div>`;
    let plan, mainHtml;
    if (S.mode === 'arrive') {
      const [th, tm] = getArrive().split(':').map(Number);
      const T = th * 60 + tm;
      // 行きは時限の開始時刻ボタン。その日に授業がある時限には印を付ける
      const target = new Date(now); if (T <= G.minOfDay(now)) target.setDate(target.getDate() + 1);
      const mine = new Set(G.classes.dayList(target).map((x) => x.n));
      h += `<div class="card">${S.dir === 'school' ? `<div class="periods">${G.PERIODS.map((p) => {
        const t = `${pad(Math.floor(p.s / 60))}:${pad(p.s % 60)}`;
        return `<button class="${getArrive() === t ? 'on' : ''}" data-p="${t}">${p.n}限${mine.has(p.n) ? '•' : ''}<small>${fmt(p.s)}</small></button>`;
      }).join('')}</div>` : ''}
        <label class="arrive-row"><span>${to}に着きたい時刻</span><input type="time" id="lcArrive" value="${getArrive()}"></label></div>`;
      plan = arrivePlan(S.dir, now, T);
      const main = plan.opts[0];
      if (!main) {
        mainHtml = `<section class="card lc-main urgent"><div class="label">${plan.isTomorrow ? '明日 ' : ''}${fmt(T)}までに${to}に着く電車はありません</div></section>`;
      } else {
        const left = main.leave - plan.nowAbs;
        mainHtml = `<section class="card lc-main${left < 5 ? ' urgent' : ''}">
          <div class="label">${plan.isTomorrow ? '明日 ' : ''}${fmt(T)}までに${to}に着くには</div>
          <div class="lc-count">${fmt(main.leave)}</div>
          <div class="lc-times"><div>までに${from}を出る　${left < 0 ? '<b class="late">もう間に合いません</b>' : `あと <span>${G.dur(left)}</span>`}</div>
          <div>${to}に <b>${fmt(main.arrive)}</b> 着</div></div>
          ${legsHtml(main)}<a class="jr" href="${routeUrl(main, plan.base)}">Yahoo!乗換案内で遅れを確認 ›</a></section>`;
      }
    } else {
      plan = nowPlan(S.dir, now);
      const main = plan.opts[0];
      if (!main) mainHtml = '<section class="card lc-main"><p class="muted">候補がありません</p></section>';
      else {
        const left = main.leave - plan.nowAbs;
        const mins = Math.floor(left), secs = Math.floor((left - mins) * 60);
        mainHtml = `<section class="card lc-main${left < 5 ? ' urgent' : ''}">
          <div class="label">${from}を出るまで</div>
          <div class="lc-count">${left >= 60 ? `${Math.floor(mins / 60)}<small>時間</small>${mins % 60}` : mins}<small>分</small><span class="sec">${pad(secs)}秒</span></div>
          <div class="lc-times"><div><span>${main.tomorrow ? '明日 ' : ''}${fmt(main.leave)}</span>に${from}を出る</div>
          <div>${to}に <b>${fmt(main.arrive)}</b> 着</div></div>
          ${legsHtml(main)}<a class="jr" href="${routeUrl(main, plan.base)}">Yahoo!乗換案内で遅れを確認 ›</a></section>`;
      }
    }
    h += `<a class="btn" style="display:block;margin-bottom:10px;text-align:left" href="${infoLink}">運行情報（Yahoo!乗換案内）›</a>`;
    h += mainHtml;
    h += `<div class="gh">${S.mode === 'arrive' ? 'もっと早く出る候補' : '次の候補'}</div><ul class="lc-list">${listHtml(plan.opts.slice(1), plan.base, plan.nowAbs, to)}</ul>`;
    h += `<div class="gh">移動時間の設定</div><div class="card">${Object.keys(CHOICES).map((k) => `<div class="set-row"><span>${k === 'walkUniv' ? '大学 ⇄ 南柏（徒歩）' : '荒川沖 ⇄ 家（自転車）'}</span>
      <div class="seg" style="margin:0">${CHOICES[k].map((x) => `<button class="${x === CFG[k] ? 'on' : ''}" data-k="${k}" data-v="${x}">${x}分</button>`).join('')}</div></div>`).join('')}</div>`;
    h += `<div class="foot"><button class="daytype" id="lcDay">${(S.dayMode === 'auto' ? '' : '手動：') + { wk: '平日', ho: '土休日' }[plan.type]}ダイヤ</button><br>
      タップで「自動→平日→土休日」を切り替え<br>時刻表どおりの表示です（遅延は反映されません）<br>出典：JR東日本 駅時刻表（南柏 2026年10月版／柏・荒川沖 2026年11月版）</div>`;
    v.innerHTML = h;
  }

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dir) { S.dir = b.dataset.dir; }
    else if (b.dataset.mode) { S.mode = b.dataset.mode; }
    else if (b.dataset.p) { S.arrive[S.dir] = b.dataset.p; }
    else if (b.dataset.k) { CFG[b.dataset.k] = S[b.dataset.k] = Number(b.dataset.v); }
    else if (b.id === 'lcDay') { S.dayMode = { auto: 'wk', wk: 'ho', ho: 'auto' }[S.dayMode]; }
    else return;
    saveS(); render();
  }
  function onChange(e) {
    if (e.target.id !== 'lcArrive' || !e.target.value) return;
    S.arrive[S.dir] = e.target.value; saveS(); render();
  }

  // ホームから「この時刻に着くには」「今出るなら」を聞くための窓口
  function open(dir, mode, arriveHHMM) {
    S.dir = dir; S.mode = mode; if (arriveHHMM) S.arrive[dir] = arriveHHMM;
    saveS(); G.go('commute');
  }

  function init() {
    const v = G.$('v-commute');
    v.addEventListener('click', onClick);
    v.addEventListener('change', onChange);
  }

  G.commute = { nowPlan, arrivePlan, routeUrl, open, init };
  // 秒まで数えるので、表示中は1秒ごとに描き直す（入力中は止める）
  G.reg('commute', { title: '通学', render, tick: 1, skipTick: () => document.activeElement && document.activeElement.id === 'lcArrive' });
})();
