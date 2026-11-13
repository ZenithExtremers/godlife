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
    if (!o.search) return '#';
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

  /* ---- 現在地 ---- */
  // 経路上の地点。lat/lng は GPS で一番近い地点を選ぶとき用（家は端末に登録した位置）
  const PLACES = {
    home: { name: '家', short: '家' },
    ara: { name: '荒川沖駅', short: '荒川沖', lat: 36.0306, lng: 140.1742, r: 900 },
    kashiwa: { name: '柏駅', short: '柏', lat: 35.8623, lng: 139.9710, r: 700 },
    train: { name: '電車内（荒川沖〜柏）', short: '車内' },
    mk: { name: '南柏駅', short: '南柏', lat: 35.8441, lng: 139.9540, r: 600 },
    univ: { name: '麗澤大学', short: '大学', lat: 35.8325, lng: 139.9560, r: 700 },
  };
  const ORDER = ['home', 'ara', 'train', 'kashiwa', 'mk', 'univ'];
  const LKEY = 'gl.loc';
  // 選んだ現在地は3時間で「自動」（行きは家、帰りは大学）に戻す
  function getLoc() {
    const l = G.load(LKEY, null);
    if (!l || Date.now() - l.t > 3 * 3600e3) return null;
    return l.loc;
  }
  const setLoc = (loc) => (loc ? G.save(LKEY, { loc, t: Date.now() }) : G.raw(LKEY, null));
  const defFrom = (dir) => (dir === 'school' ? 'home' : 'univ');
  // その向きで、現在地から出発できるか（行きで大学にいる、などは無理）
  function fromFor(dir) {
    const l = getLoc();
    if (!l) return defFrom(dir);
    const i = ORDER.indexOf(l);
    if (dir === 'school' && i >= ORDER.length - 1) return null;
    if (dir === 'home' && i <= 0) return null;
    return l;
  }

  // 帰り：大学 → 南柏 → 柏（乗換）→ 荒川沖 → 家。from で途中駅から乗る
  function homeOptions(tt, from = 'univ') {
    const out = [];
    if (from === 'train') { // 柏→荒川沖の電車に乗っている
      for (const [kDep, type, dest, araArr] of tt.chuDown) out.push({
        leave: kDep, arrive: araArr + CFG.bikeHome, onboard: [kDep, araArr],
        search: { from: '柏', to: '荒川沖', dep: kDep },
        legs: [['柏', fmt(kDep) + ' 発', `${type} ${dest}行（乗車中）`], ['荒川沖', fmt(araArr) + ' 着', '自転車 ' + CFG.bikeHome + '分']],
        steps: [{ arr: 'ara', t: kDep, do: `${type} ${dest}行に乗っている` }, { arr: 'home', t: araArr, do: `荒川沖 ${fmt(araArr)} 着 → 自転車で家へ（${CFG.bikeHome}分）` }],
      });
      return out;
    }
    for (const [kDep, type, dest, araArr] of tt.chuDown) {
      const tail = [
        { arr: 'ara', t: kDep, do: `柏 ${fmt(kDep)} 発 ${type} ${dest}行に乗る` },
        { arr: 'home', t: araArr, do: `荒川沖 ${fmt(araArr)} 着 → 自転車で家へ（${CFG.bikeHome}分）` },
      ];
      if (from === 'kashiwa') {
        out.push({
          leave: kDep - CFG.margin, arrive: araArr + CFG.bikeHome,
          search: { from: '柏', to: '荒川沖', dep: kDep },
          legs: [['柏', fmt(kDep) + ' 発', `${type} ${dest}行`], ['荒川沖', fmt(araArr) + ' 着', '自転車 ' + CFG.bikeHome + '分']],
          steps: [{ arr: 'kashiwa', t: kDep - CFG.margin, do: '柏駅のホームへ' }, ...tail],
        });
        continue;
      }
      let mk = null;
      for (const d of tt.mkDown) if (d + CFG.mkKashiwa + CFG.transfer <= kDep) mk = d; else break;
      if (mk === null) continue;
      const walk = from === 'univ' ? CFG.walkUniv : 0;
      out.push({
        leave: mk - walk - CFG.margin,
        arrive: araArr + CFG.bikeHome,
        search: { from: '南柏', to: '荒川沖', dep: mk },
        legs: [
          ['南柏', fmt(mk) + ' 発', '各駅停車'],
          ['柏', `${fmt(mk + CFG.mkKashiwa)} 着 → ${fmt(kDep)} 発`, `${type} ${dest}行`],
          ['荒川沖', fmt(araArr) + ' 着', '自転車 ' + CFG.bikeHome + '分'],
        ],
        // 移動中の表示用（t はその時刻、do はその時にやること）
        steps: [
          walk ? { arr: 'mk', t: mk - walk, do: `南柏駅まで歩く（${walk}分）` } : { arr: 'mk', t: mk - CFG.margin, do: '南柏駅のホームへ' },
          { arr: 'kashiwa', t: mk, do: `南柏 ${fmt(mk)} 発 各駅停車に乗る` },
          { arr: 'kashiwa', t: mk + CFG.mkKashiwa, do: `柏で乗り換え → ${fmt(kDep)} 発 ${type} ${dest}行` },
          ...tail,
        ],
      });
    }
    return prune(out);
  }
  // 行き：家 → 荒川沖 → 柏（乗換）→ 南柏 → 大学。from で途中駅から乗る
  function schoolOptions(tt, from = 'home') {
    const out = [];
    if (from === 'train') { // 荒川沖→柏の電車に乗っている
      for (const [araDep, type, dest, kArr] of tt.chuUp) {
        const mk = tt.mkUp.find((u) => u - CFG.mkKashiwa >= kArr + CFG.transfer);
        if (mk === undefined) continue;
        out.push({
          leave: araDep, arrive: mk + CFG.walkUniv, onboard: [araDep, kArr],
          search: { from: '荒川沖', to: '南柏', dep: araDep },
          legs: [['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行（乗車中）`], ['柏', `${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発`, '各駅停車'], ['南柏', fmt(mk) + ' 着', '徒歩 ' + CFG.walkUniv + '分']],
          steps: [{ arr: 'kashiwa', t: araDep, do: `${type} ${dest}行に乗っている` },
            { arr: 'kashiwa', t: kArr, do: `柏 ${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発 各駅停車に乗り換え` },
            { arr: 'mk', t: mk - CFG.mkKashiwa, do: `柏 ${fmt(mk - CFG.mkKashiwa)} 発 各駅停車に乗る` },
            { arr: 'univ', t: mk, do: `南柏 ${fmt(mk)} 着 → 大学まで歩く（${CFG.walkUniv}分）` }],
        });
      }
      return out;
    }
    if (from === 'kashiwa') {
      for (const mk of tt.mkUp) {
        const kd = mk - CFG.mkKashiwa;
        out.push({
          leave: kd - CFG.margin, arrive: mk + CFG.walkUniv,
          search: { from: '柏', to: '南柏', dep: kd },
          legs: [['柏', fmt(kd) + ' 発', '各駅停車'], ['南柏', fmt(mk) + ' 着', '徒歩 ' + CFG.walkUniv + '分']],
          steps: [{ arr: 'kashiwa', t: kd - CFG.margin, do: '柏駅のホームへ' }, { arr: 'mk', t: kd, do: `柏 ${fmt(kd)} 発 各駅停車に乗る` },
            { arr: 'univ', t: mk, do: `南柏 ${fmt(mk)} 着 → 大学まで歩く（${CFG.walkUniv}分）` }],
        });
      }
      return prune(out);
    }
    for (const [araDep, type, dest, kArr] of tt.chuUp) {
      const mk = tt.mkUp.find((u) => u - CFG.mkKashiwa >= kArr + CFG.transfer);
      if (mk === undefined) continue;
      const bike = from === 'home' ? CFG.bikeHome : 0;
      out.push({
        leave: araDep - bike - CFG.margin,
        arrive: mk + CFG.walkUniv,
        search: { from: '荒川沖', to: '南柏', dep: araDep },
        legs: [
          ['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行`],
          ['柏', `${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発`, '各駅停車'],
          ['南柏', fmt(mk) + ' 着', '徒歩 ' + CFG.walkUniv + '分'],
        ],
        steps: [
          bike ? { arr: 'ara', t: araDep - CFG.margin - bike, do: `荒川沖駅まで自転車（${bike}分）` } : { arr: 'ara', t: araDep - CFG.margin, do: '荒川沖駅のホームへ' },
          { arr: 'kashiwa', t: araDep, do: `荒川沖 ${fmt(araDep)} 発 ${type} ${dest}行に乗る` },
          { arr: 'kashiwa', t: kArr, do: `柏 ${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発 各駅停車に乗り換え` },
          { arr: 'mk', t: mk - CFG.mkKashiwa, do: `柏 ${fmt(mk - CFG.mkKashiwa)} 発 各駅停車に乗る` },
          { arr: 'univ', t: mk, do: `南柏 ${fmt(mk)} 着 → 大学まで歩く（${CFG.walkUniv}分）` },
        ],
      });
    }
    return prune(out);
  }
  // 電車に乗らない区間（南柏→大学は徒歩、荒川沖→家は自転車）
  const moveOnly = (dir, from) => (dir === 'school' && from === 'mk') || (dir === 'home' && from === 'ara');
  function moveOption(dir, start) {
    const m = dir === 'school' ? CFG.walkUniv : CFG.bikeHome;
    const what = dir === 'school' ? `大学まで歩く（${m}分）` : `家まで自転車（${m}分）`;
    return { leave: start, arrive: start + m, search: null, move: true,
      legs: [[dir === 'school' ? '南柏' : '荒川沖', fmt(start) + ' 出発', what]], steps: [{ arr: dir === 'school' ? 'univ' : 'home', t: start, do: what }] };
  }
  // 同じ時刻以前に着く、もっと遅く出られる候補があれば、早く出るほうは省く
  function prune(list) {
    list.sort((a, b) => a.leave - b.leave);
    return list.filter((o, i) => !list.slice(i + 1).some((x) => x.arrive <= o.arrive));
  }
  const shift = (o, k) => ({ ...o, leave: o.leave + k, arrive: o.arrive + k, onboard: o.onboard && o.onboard.map((x) => x + k), search: o.search && { ...o.search, dep: o.search.dep + k }, steps: o.steps.map((x) => ({ ...x, t: x.t + k })) });
  const build = (dir, tt, from) => (dir === 'home' ? homeOptions(tt, from) : schoolOptions(tt, from));

  // 「今すぐ」：これから乗れる候補（深夜0〜3時は前日のダイヤ扱い）。from を省くと家／大学から
  function nowPlan(dir, now, from = defFrom(dir)) {
    let nowMin = G.minOfDay(now);
    const svc = new Date(now);
    if (now.getHours() < 3) { svc.setDate(svc.getDate() - 1); nowMin += 1440; }
    const next = new Date(svc); next.setDate(next.getDate() + 1);
    let opts, before = null;
    if (moveOnly(dir, from)) opts = [moveOption(dir, Math.ceil(nowMin))];
    else if (from === 'train') {
      // 今走っている電車（出発済みで、まだ着いていない）を時刻表から探す。遅れも見込んで到着後15分までは候補に残す
      const run = build(dir, TIMETABLE[typeOf(svc)], from).filter((o) => o.onboard[0] <= nowMin + 1 && nowMin < o.onboard[1] + 15);
      opts = run.length ? [run[run.length - 1]] : [];
    } else {
      const today = build(dir, TIMETABLE[typeOf(svc)], from);
      opts = today.filter((o) => o.leave >= nowMin);
      if (opts.length < 4) opts = opts.concat(build(dir, TIMETABLE[typeOf(next)], from).map((o) => shift(o, 1440)));
      opts = opts.slice(0, 4);
      // 1本前：出発時刻を過ぎたばかりの電車（3時間以内）
      const past = today.filter((o) => o.leave < nowMin && o.leave > nowMin - 180);
      before = past[past.length - 1] || null;
      if (before) { before.leaveAbs = before.leave; before.tomorrow = false; }
    }
    for (const o of opts) {
      const d = new Date(svc); d.setDate(d.getDate() + Math.floor(o.leave / 1440));
      o.tomorrow = ymd(d) !== ymd(now);
      o.leaveAbs = o.leave;
    }
    return { opts, before, after: opts[1] || null, base: svc, nowAbs: nowMin, type: typeOf(svc), from };
  }
  // 「到着時刻を指定」：T（分）までに着く一番遅い電車（opts[0]）と、その1本前（before）・1本後（after）
  // dayOffset を渡すと「今日から何日後の T」に固定する（ホームで次の授業日を出すとき用）
  // 特例：2限に行くときは、10:40ちょうどに着く電車ではなく荒川沖 9:14 発に乗る
  const SPECIAL = { period: 2, from: '荒川沖', dep: 9 * 60 + 14 };
  const specialOn = () => S.special2 !== false;
  const isSpecialT = (dir, T, from) => dir === 'school' && (from === 'home' || from === 'ara') && specialOn() && T === G.PERIODS.find((p) => p.n === SPECIAL.period).s;
  function arrivePlan(dir, now, T, dayOffset, from = defFrom(dir)) {
    if (from === 'train') return { ...nowPlan(dir, now, from), before: null, after: null, isTomorrow: false, special: false };
    const nowClock = G.minOfDay(now);
    const D = dayStart(now);
    if (dayOffset != null) D.setDate(D.getDate() + dayOffset);
    else if (T <= nowClock) D.setDate(D.getDate() + 1);
    const isTomorrow = ymd(D) !== ymd(now);
    const nowAbs = (now - D) / 60000;
    const prev = new Date(D); prev.setDate(prev.getDate() - 1);
    const sp = isSpecialT(dir, T, from);
    let all, ok;
    if (moveOnly(dir, from)) { all = [moveOption(dir, T - (dir === 'school' ? CFG.walkUniv : CFG.bikeHome))]; ok = all; }
    else {
      all = build(dir, TIMETABLE[typeOf(prev)], from).map((o) => shift(o, -1440)).concat(build(dir, TIMETABLE[typeOf(D)], from))
        .sort((a, b) => a.leave - b.leave);
      ok = all.filter((o) => o.arrive <= T && (!sp || o.search.dep <= SPECIAL.dep));
    }
    const main = ok[ok.length - 1] || null;
    const before = ok.length > 1 ? ok[ok.length - 2] : null;
    const after = main ? all.find((o) => o.leave > main.leave) || null : all.find((o) => o.arrive > T) || null;
    const opts = main ? [main] : [];
    for (const o of [main, before, after]) if (o) { o.leaveAbs = o.leave; o.tomorrow = isTomorrow && o.leave >= 0; }
    return { opts, before, after, base: D, nowAbs, isTomorrow, type: typeOf(D), special: sp, from };
  }

  /* ---- 画面 ---- */
  // 今日なら空、明日なら「明日 」、それより先なら「11/16(月) 」
  function dayLabel(D, now) {
    const k = Math.round((dayStart(D) - dayStart(now)) / 864e5);
    return k <= 0 ? '' : k === 1 ? '明日 ' : `${D.getMonth() + 1}/${D.getDate()}(${G.WD[D.getDay()]}) `;
  }
  const getArrive = () => S.arrive[S.dir] || (S.dir === 'school' ? '08:50' : '18:00');
  const legsHtml = (o) => `<ol class="legs">${o.legs.map(([st, t, how]) => `<li><b>${st}</b><span>${t}</span><em>${how}</em></li>`).join('')}</ol>`;
  const jrLink = (o, base) => (o.search ? `<a class="jr" href="${routeUrl(o, base)}">Yahoo!乗換案内で遅れを確認 ›</a>` : '');
  // 候補1本分のカード。tag は「1本前」「1本後」などの見出し
  const itemHtml = (o, base, nowAbs, to, tag) => {
    const inner = `<div class="row"><span>${tag ? `<span class="tag">${tag}</span>` : ''}${o.tomorrow ? '明日 ' : ''}${fmt(o.leave)} 出発 <small>${o.leaveAbs - nowAbs >= 0 ? 'あと' + G.dur(o.leaveAbs - nowAbs) : tag ? '' : '出発時刻を過ぎています'}</small></span><span>${to} ${fmt(o.arrive)} 着</span></div>
      <div class="sub">${o.legs.map(([st, t]) => `${st} ${t.split(' → ').pop()}`).join(' ・ ')}</div>`;
    return o.search ? `<li><a class="card" style="display:block;color:inherit;text-decoration:none" href="${routeUrl(o, base)}">${inner}</a></li>` : `<li><div class="card">${inner}</div></li>`;
  };

  /* ---- 現在地（手で選ぶ・GPS） ---- */
  // 端末で登録し直した位置（家、または駅の位置の手直し）。{ home: {lat,lng}, kashiwa: {...} }
  const PKEY = 'gl.placePos';
  function myPos() {
    const m = G.load(PKEY, {});
    const h = G.load('gl.homePos', null); // 旧形式
    if (h && !m.home) m.home = h;
    return m;
  }
  function distM(a, b) {
    const R = 6371e3, r = Math.PI / 180;
    const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
    return Math.sqrt(x * x + y * y) * R;
  }
  // 点 p と線分 a-b の距離（m）
  function segDist(p, a, b) {
    const r = Math.PI / 180, R = 6371e3, c = Math.cos(p.lat * r);
    const X = (q) => (q.lng - p.lng) * r * c * R, Y = (q) => (q.lat - p.lat) * r * R;
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
    return Math.hypot(ax + t * dx, ay + t * dy);
  }
  function pickLoc(loc) {
    setLoc(loc);
    if (loc === 'home') S.dir = 'school';
    if (loc === 'univ') S.dir = 'home';
    delete S.arriveDay; saveS();
  }
  const km = (d) => (d < 1000 ? `${Math.round(d / 10) * 10}m` : `${(d / 1000).toFixed(1)}km`);
  // 位置はボタンを押したときに1回だけ取り、一番近い地点を選ぶ。位置そのものは保存しない（登録したときを除く）
  function locate(register, done) {
    if (!navigator.geolocation) { G.toast('この端末では位置情報が使えません'); return; }
    G.toast('現在地を調べています…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const acc = Math.round(pos.coords.accuracy || 0);
      if (register) {
        const m = myPos(); m[register] = { lat: Math.round(me.lat * 1e4) / 1e4, lng: Math.round(me.lng * 1e4) / 1e4 };
        G.save(PKEY, m);
        pickLoc(register); S.gpsMsg = `「${PLACES[register].name}」の位置を登録しました（精度±${km(acc)}）${acc > 200 ? '。精度が低いので、屋外でもう一度登録するのがおすすめです' : ''}`;
        saveS(); G.toast(S.gpsMsg); done && done(); return;
      }
      const mine = myPos();
      const near = ORDER.map((k) => ({ k, ...PLACES[k], ...(mine[k] ? { lat: mine[k].lat, lng: mine[k].lng } : {}), r: k === 'home' ? 400 : PLACES[k].r }))
        .filter((p) => p.lat).map((p) => ({ ...p, d: distM(me, p) })).sort((a, b) => a.d - b.d);
      const best = near[0];
      // 駅の近くでなければ、荒川沖〜柏の線路沿い（2.5km以内）なら「車内」
      const A = { ...PLACES.ara, ...(mine.ara || {}) }, K = { ...PLACES.kashiwa, ...(mine.kashiwa || {}) };
      const onLine = segDist(me, A, K);
      if (!(best && best.d <= best.r + Math.min(acc, 1000)) && onLine <= 2500) {
        pickLoc('train');
        S.gpsMsg = `📍 荒川沖〜柏の線路沿い（約${km(onLine)}）なので「車内」を選びました（精度±${km(acc)}）`;
        saveS(); G.toast(S.gpsMsg); done && done(); return;
      }
      // GPSの誤差（屋内だと数百m〜1km）も見込んで判定し、3km以内なら一番近い地点を選ぶ
      if (best && (best.d <= best.r + Math.min(acc, 1000) || best.d <= 3000)) {
        pickLoc(best.k);
        S.gpsMsg = `📍 ${best.name}を選びました（約${km(best.d)}・精度±${km(acc)}）`;
      } else {
        S.gpsMsg = `近くに登録した地点がありません（一番近いのは${best ? best.name + '・約' + km(best.d) : 'なし'}、精度±${km(acc)}）。手で選んでください`;
      }
      saveS(); G.toast(S.gpsMsg); done && done();
    }, (err) => {
      S.gpsMsg = err.code === 1 ? '位置情報が許可されていません（ブラウザやスマホの設定から、このサイトの位置情報を許可してください）' : '現在地を取得できませんでした（電波の良い場所でもう一度）';
      saveS(); G.toast(S.gpsMsg); done && done();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  // 現在地のボタン一式（通学タブとホームで共通）
  function locChips(compact) {
    const l = getLoc();
    const reg = l && l !== 'train' ? l : 'home';
    return `<div class="locbox${compact ? ' compact' : ''}"><div class="days">
      <button data-gps="1" class="gps">📍GPS</button>${ORDER.map((k) => `<button data-loc="${k}" class="${l === k ? 'on' : ''}">${PLACES[k].short}</button>`).join('')}
      <button data-loc="" class="${l ? '' : 'on'}">自動</button></div>
      ${compact ? '' : `<div class="muted" style="margin-top:6px"><a href="#" data-reg="${reg}">今いる場所を「${PLACES[reg].short}」として登録</a></div>`}</div>`;
  }
  // 現在地ボタンが押されたら true を返す（rerender はその画面を描き直す関数）
  function handleLoc(e, rerender) {
    const reg = e.target.closest('[data-reg]');
    if (reg) { e.preventDefault(); locate(reg.dataset.reg, rerender); return true; }
    const b = e.target.closest('button'); if (!b) return false;
    if (b.dataset.loc !== undefined) { pickLoc(b.dataset.loc || null); delete S.gpsMsg; saveS(); rerender(); return true; }
    if (b.dataset.gps) { locate(null, rerender); return true; }
    return false;
  }
  const locCard = () => `<div class="card loc"><b>📍 現在地</b>${locChips(false)}</div>`;

  function render() {
    const v = G.$('v-commute');
    const now = new Date();
    const fromK = fromFor(S.dir);
    const to = S.dir === 'home' ? '家' : '大学';
    let h = locCard();
    h += `<div class="seg"><button data-dir="school" class="${S.dir === 'school' ? 'on' : ''}">行き（→大学）</button><button data-dir="home" class="${S.dir === 'home' ? 'on' : ''}">帰り（→家）</button></div>
      <div class="seg"><button data-mode="now" class="${S.mode === 'now' ? 'on' : ''}">今すぐ</button><button data-mode="arrive" class="${S.mode === 'arrive' ? 'on' : ''}">到着時刻を指定</button></div>`;
    if (!fromK) {
      h += `<div class="card muted">${PLACES[getLoc()].name}にいるので、${S.dir === 'school' ? '行き' : '帰り'}の電車はありません。${S.dir === 'school' ? '帰り' : '行き'}に切り替えるか、現在地を変えてください。</div>`;
      v.innerHTML = h; return;
    }
    const from = PLACES[fromK].name;
    let plan, mainHtml, listTitle, listItems;
    if (fromK === 'train') {
      // 車内：今乗っている電車を時刻表から推定して、着く時刻を出す
      plan = nowPlan(S.dir, now, 'train');
      const main = plan.opts[0];
      mainHtml = main ? `<section class="card lc-main">
          <div class="label">いま乗っている電車（時刻表から推定）</div>
          <div class="lc-count">${fmt(main.arrive)}<small>${to}着</small></div>
          <div class="lc-times"><div>${to}まで あと <span>${G.dur(Math.max(0, main.arrive - plan.nowAbs))}</span></div></div>
          ${legsHtml(main)}${jrLink(main, plan.base)}</section>`
        : `<section class="card lc-main urgent"><div class="label">今走っている${S.dir === 'school' ? '荒川沖→柏' : '柏→荒川沖'}の電車が時刻表に見つかりません。向き（行き／帰り）を確かめるか、駅に着いたら現在地を変えてください</div></section>`;
      listItems = '';
    } else if (S.mode === 'arrive') {
      const [th, tm] = getArrive().split(':').map(Number);
      const T = th * 60 + tm;
      // ホームから「◯曜の1限」を開いたときは、その日に固定する
      let off = null;
      if (S.arriveDay) {
        const k = Math.round((new Date(S.arriveDay + 'T00:00:00') - dayStart(now)) / 864e5);
        if (k >= 0 && !(k === 0 && T <= G.minOfDay(now))) off = k; else delete S.arriveDay;
      }
      // 行きは時限の開始時刻ボタン。その日に授業がある時限には印を付ける
      const target = dayStart(now); target.setDate(target.getDate() + (off != null ? off : T <= G.minOfDay(now) ? 1 : 0));
      const mine = new Set(G.classes.dayList(target).filter((x) => !G.classes.isOnline(x.c)).map((x) => x.n));
      h += `<div class="card">${S.dir === 'school' ? `<div class="periods">${G.PERIODS.map((p) => {
        const t = `${pad(Math.floor(p.s / 60))}:${pad(p.s % 60)}`;
        return `<button class="${getArrive() === t ? 'on' : ''}" data-p="${t}">${p.n}限${mine.has(p.n) ? '•' : ''}<small>${fmt(p.s)}</small></button>`;
      }).join('')}</div>` : ''}
        <label class="arrive-row"><span>${to}に着きたい時刻</span><input type="time" id="lcArrive" value="${getArrive()}"></label></div>`;
      plan = arrivePlan(S.dir, now, T, off, fromK);
      const dl = dayLabel(plan.base, now);
      const main = plan.opts[0];
      if (!main) {
        mainHtml = `<section class="card lc-main urgent"><div class="label">${dl}${fmt(T)}までに${to}に着く電車はありません</div></section>`;
      } else {
        const left = main.leave - plan.nowAbs;
        mainHtml = `<section class="card lc-main${left < 5 ? ' urgent' : ''}">
          <div class="label">${dl}${fmt(T)}までに${to}に着くには${plan.special ? `<br><b>2限の特例：${SPECIAL.from} ${fmt(SPECIAL.dep)} 発までの電車</b>` : ''}</div>
          <div class="lc-count">${fmt(main.leave)}</div>
          <div class="lc-times"><div>までに${from}を出る　${left < 0 ? '<b class="late">もう間に合いません</b>' : `あと <span>${G.dur(left)}</span>`}</div>
          <div>${to}に <b>${fmt(main.arrive)}</b> 着</div></div>
          ${legsHtml(main)}${jrLink(main, plan.base)}</section>`;
      }
      // 前後1本ずつ
      listTitle = '前後の電車';
      listItems = '';
      if (plan.before) listItems += itemHtml(plan.before, plan.base, plan.nowAbs, to, '1本前');
      if (plan.after) {
        const late = plan.after.arrive - T;
        listItems += itemHtml(plan.after, plan.base, plan.nowAbs, to, `1本後${late > 0 ? `・<b class="late">${late}分遅れ</b>` : ''}`);
      }
    } else {
      plan = nowPlan(S.dir, now, fromK);
      const main = plan.opts[0];
      if (!main) mainHtml = '<section class="card lc-main"><p class="muted">候補がありません</p></section>';
      else {
        const left = main.leave - plan.nowAbs;
        const mins = Math.floor(left), secs = Math.floor((left - mins) * 60);
        mainHtml = `<section class="card lc-main${left < 5 ? ' urgent' : ''}">
          <div class="label">${from}を出るまで</div>
          <div class="lc-count">${left >= 60 ? `${Math.floor(mins / 60)}<small>時間</small>${mins % 60}` : mins}<small>分</small><span class="sec">${pad(Math.max(0, secs))}秒</span></div>
          <div class="lc-times"><div><span>${main.tomorrow ? '明日 ' : ''}${fmt(main.leave)}</span>に${from}を出る</div>
          <div>${to}に <b>${fmt(main.arrive)}</b> 着</div></div>
          ${legsHtml(main)}${jrLink(main, plan.base)}</section>`;
      }
      listTitle = '前後の電車';
      listItems = '';
      if (plan.before) listItems += itemHtml(plan.before, plan.base, plan.nowAbs, to, `1本前・<b class="late">${Math.ceil(plan.nowAbs - plan.before.leave)}分前に出発時刻</b>`);
      if (plan.after) listItems += itemHtml(plan.after, plan.base, plan.nowAbs, to, '1本後');
    }
    h += `<a class="btn" style="display:block;margin-bottom:10px;text-align:left" href="${infoLink}">運行情報（Yahoo!乗換案内）›</a>`;
    h += mainHtml;
    if (listItems) h += `<div class="gh">${listTitle}</div><ul class="lc-list">${listItems}</ul>`;
    h += `<div class="gh">移動時間の設定</div><div class="card">${Object.keys(CHOICES).map((k) => `<div class="set-row"><span>${k === 'walkUniv' ? '大学 ⇄ 南柏（徒歩）' : '荒川沖 ⇄ 家（自転車）'}</span>
      <div class="seg" style="margin:0">${CHOICES[k].map((x) => `<button class="${x === CFG[k] ? 'on' : ''}" data-k="${k}" data-v="${x}">${x}分</button>`).join('')}</div></div>`).join('')}
      <div class="set-row" style="margin:0"><span>2限の特例（2限に行くときは ${SPECIAL.from} ${fmt(SPECIAL.dep)} 発までの電車に乗る）</span>
      <div class="seg" style="margin:0"><button data-sp="1" class="${specialOn() ? 'on' : ''}">オン</button><button data-sp="0" class="${specialOn() ? '' : 'on'}">オフ</button></div></div></div>`;
    h += `<div class="foot"><button class="daytype" id="lcDay">${(S.dayMode === 'auto' ? '' : '手動：') + { wk: '平日', ho: '土休日' }[plan.type]}ダイヤ</button><br>
      タップで「自動→平日→土休日」を切り替え<br>時刻表どおりの表示です（遅延は反映されません）<br>出典：JR東日本 駅時刻表（南柏 2026年10月版／柏・荒川沖 2026年11月版）</div>`;
    v.innerHTML = h;
  }

  function onClick(e) {
    if (handleLoc(e, render)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dir) { S.dir = b.dataset.dir; delete S.arriveDay; }
    else if (b.dataset.mode) { S.mode = b.dataset.mode; delete S.arriveDay; }
    else if (b.dataset.p) { S.arrive[S.dir] = b.dataset.p; delete S.arriveDay; }
    else if (b.dataset.sp) { S.special2 = b.dataset.sp === '1'; }
    else if (b.dataset.k) { CFG[b.dataset.k] = S[b.dataset.k] = Number(b.dataset.v); }
    else if (b.id === 'lcDay') { S.dayMode = { auto: 'wk', wk: 'ho', ho: 'auto' }[S.dayMode]; }
    else return;
    saveS(); render();
  }
  function onChange(e) {
    if (e.target.id !== 'lcArrive' || !e.target.value) return;
    S.arrive[S.dir] = e.target.value; delete S.arriveDay; saveS(); render();
  }

  // ホームから「この時刻に着くには」「今出るなら」を聞くための窓口
  function open(dir, mode, arriveHHMM, dayYmd) {
    S.dir = dir; S.mode = mode; if (arriveHHMM) S.arrive[dir] = arriveHHMM;
    if (dayYmd) S.arriveDay = dayYmd; else delete S.arriveDay;
    saveS(); G.go('commute');
  }

  function init() {
    const v = G.$('v-commute');
    v.addEventListener('click', onClick);
    v.addEventListener('change', onChange);
  }

  /* ---- 「家を出た」「大学を出た」：出た時刻から乗れる電車をたどる ---- */
  const TKEY = 'gl.trip';
  function tripStart(dir) {
    const old = G.load(TKEY, null);
    G.save(TKEY, { dir, t: Date.now() });
    return old;
  }
  const tripEnd = () => G.raw(TKEY, null);
  // 移動中カードの手順をタップしたら、そこまで終わったことにして、その駅から乗れる一番早い電車で組み直す
  // 返り値 'end' は目的地に着いた（トリップ終了）
  function tripMark(i, now = new Date()) {
    const tr = G.load(TKEY, null); if (!tr) return;
    const cur = trip(now); if (!cur) return;
    tr.marks ||= [];
    if (i <= cur.done) { tr.marks.pop(); G.save(TKEY, tr); return; } // 終わった手順をもう一度タップ → 1つ戻す
    const st = cur.o.steps[i];
    if (!st || !st.arr || st.arr === (tr.dir === 'school' ? 'univ' : 'home')) { tripEnd(); return 'end'; }
    tr.marks.push({ from: st.arr, at: now.getTime(), prefix: cur.o.steps.slice(0, i + 1).map(({ arr, t, do: d }) => ({ arr, t, do: d })) });
    G.save(TKEY, tr);
  }
  function trip(now) {
    const tr = G.load(TKEY, null);
    if (!tr) return null;
    const dep = new Date(tr.t);
    // 出た時刻の1分前までに出ていれば乗れる電車を探す（ボタンを押すのが少し遅れても大丈夫なように）
    const plan = nowPlan(tr.dir, new Date(tr.t - 60e3));
    let o = plan.opts[0], done = -1;
    const nowAbs = plan.nowAbs + (now - dep) / 60000 + 1;
    const m = tr.marks && tr.marks[tr.marks.length - 1];
    if (m) {
      // タップした時刻に、その駅から出発し直したとして探す
      const p2 = nowPlan(tr.dir, new Date(m.at), m.from);
      const o2 = p2.opts[0];
      if (o2) {
        const k = Math.round(p2.nowAbs - (plan.nowAbs + (m.at - dep) / 60000 + 1)); // 日付またぎの差（ふつうは0）
        o = { ...o2, arrive: o2.arrive - k, steps: [...m.prefix, ...o2.steps.map((x) => ({ ...x, t: x.t - k }))], search: o2.search };
        done = m.prefix.length - 1;
      }
    }
    if (!o || nowAbs > o.arrive + 30 || now - dep > 4 * 3600e3) { tripEnd(); return null; } // 着いて30分たったら自動で終わり
    return { dir: tr.dir, dep, o, base: plan.base, nowAbs, done };
  }

  G.commute = { PLACES, getLoc, fromFor, locChips, handleLoc, trip, tripStart, tripEnd, tripMark, nowPlan, arrivePlan, routeUrl, open, init, dayLabel };
  // 秒まで数えるので、表示中は1秒ごとに描き直す（入力中は止める）
  G.reg('commute', { title: '通学', render, tick: 1, skipTick: () => document.activeElement && document.activeElement.id === 'lcArrive' });
})();
