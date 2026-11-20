// 通学（LASTCALL から流用）— 大学 ⇄ 南柏 ⇄ 柏（乗換）⇄ 荒川沖 ⇄ 家
(function () {
  const CFG = {
    walkUniv: 25,   // 大学 ⇄ 南柏駅（徒歩）
    bikeHome: 30,   // 荒川沖駅 ⇄ 家（自転車）
    margin: 2,      // 駅に着いてから乗るまでの余裕
    transfer: 3,    // 柏での乗り換え
    mkKashiwa: 3,   // 南柏 ⇄ 柏 の乗車時間
  };
  const CHOICES = { walkUniv: [15, 20, 25], bikeHome: [20, 25, 30], busHome: [30, 40, 50] };
  CFG.busHome = 40; // 雨の日：荒川沖駅 ⇄ 家（バス。待ち時間こみ）

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
  const DEF = { dir: 'home', mode: 'now', dayMode: 'auto', arrive: {} };
  const S = { ...DEF, ...(G.load(SKEY, null) || (() => {
    const s = {};
    for (const k of Object.keys(CHOICES)) { const v = Number(G.raw(k)); if (CHOICES[k].includes(v)) s[k] = v; }
    return s;
  })()) }; // 足りない項目は初期値で補う
  if (!['auto', 'wk', 'ho'].includes(S.dayMode)) S.dayMode = 'auto';
  for (const k of Object.keys(CHOICES)) if (CHOICES[k].includes(S[k])) CFG[k] = S[k];
  const saveS = () => G.save(SKEY, S);
  // 雨モード：S.rain = 'auto'（天気で決める）| 'on' | 'off'。雨なら荒川沖⇄家をバスで計算
  const rainy = () => (S.rain === 'on' ? true : S.rain === 'off' ? false : !!(G.weather && G.weather.rainToday()));
  const HM = () => (rainy() ? CFG.busHome : CFG.bikeHome);
  const HV = () => (rainy() ? 'バス' : '自転車');
  // 雨の日のバス（並木大橋 ⇄ 荒川沖駅西口）。data/bus.js に時刻表があれば時刻で、なければ「バスで◯分」で計算
  const dayKey = (tt) => (tt === TIMETABLE.ho ? 'ho' : 'wk');
  const busTT = (tt) => {
    const B = typeof BUS !== 'undefined' && BUS[dayKey(tt)];
    return rainy() && B && B.toAra && B.toAra.length ? B : null;
  };
  // 荒川沖に着いてから家まで
  function inLeg(tt, araArr) {
    const B = busTT(tt);
    if (B) {
      const b = B.fromAra.find(([dep]) => dep >= araArr + BUSCFG.transfer);
      if (b) return { arrive: b[1] + BUSCFG.walk, label: `バス ${fmt(b[0])} 発 → 並木大橋 ${fmt(b[1])}`, do: `荒川沖 ${fmt(araArr)} 着 → 西口 ${fmt(b[0])} 発のバスで並木大橋へ（家まで歩いて${BUSCFG.walk}分）` };
    }
    return { arrive: araArr + HM(), label: HV() + ' ' + HM() + '分', do: `荒川沖 ${fmt(araArr)} 着 → ${HV()}で家へ（${HM()}分）` };
  }
  // 家を出て、荒川沖 araDep 発の電車に間に合うまで（バスが時刻表にないときは null）
  function outLeg(tt, araDep) {
    const B = busTT(tt);
    if (B) {
      const ok = B.toAra.filter(([, arr]) => arr <= araDep - BUSCFG.transfer);
      const b = ok[ok.length - 1];
      if (!b) return null;
      return { leave: b[0] - BUSCFG.walk, do: `並木大橋 ${fmt(b[0])} 発のバスで荒川沖駅西口へ（${fmt(b[1])} 着。バス停まで歩いて${BUSCFG.walk}分）` };
    }
    return { leave: araDep - HM() - CFG.margin, do: `荒川沖駅まで${HV()}（${HM()}分）` };
  }
  const BUSCFG = { walk: 15, transfer: 3 }; // 家 ⇄ 並木大橋の徒歩、バスと電車の乗り換え

  /* ---- マイ駅（部活などで、大学の代わりに行く駅）。家側（荒川沖）は固定 ---- */
  // line 'k'：荒川沖から中距離電車でそのまま行く（柏からの所要分 off）
  // line 'l'：柏で各駅停車に乗り換える（南柏からの所要分 off）。柏以外は時刻表からの推定
  const DEST = {
    kashiwa: { name: '柏', line: 'k', off: 0 },
    matsudo: { name: '松戸', line: 'k', off: 10 },
    kitasenju: { name: '北千住', line: 'k', off: 19 },
    nippori: { name: '日暮里', line: 'k', off: 27 },
    ueno: { name: '上野', line: 'k', off: 31 },
    kitakogane: { name: '北小金', line: 'l', off: 2 },
    shinmatsudo: { name: '新松戸', line: 'l', off: 5 },
    mabashi: { name: '馬橋', line: 'l', off: 7 },
    kitamatsudo: { name: '北松戸', line: 'l', off: 9 },
  };
  const MKEY = 'gl.mySt';
  const mySt = () => G.load(MKEY, []).filter((m) => !m.joban); // 前の版（家側の駅）の登録は使わない
  const stName = (st) => (st.key ? DEST[st.key].name : st.name);
  const placeName = (st) => st.label || stName(st) + '駅';

  // 家 → マイ駅 → 行き先（その日の時刻表で）
  function destGo(st, D) {
    const tt = TIMETABLE[typeOf(D)], d = DEST[st.key], nm = stName(st), out = [];
    for (const [araDep, type, dest, kArr] of tt.chuUp) {
      const out1 = outLeg(tt, araDep); if (!out1) continue;
      let arrS, legs, steps;
      const first = [{ arr: null, t: out1.leave, do: out1.do }, { arr: null, t: araDep, do: `荒川沖 ${fmt(araDep)} 発 ${type} ${dest}行に乗る` }];
      if (d.line === 'k') {
        arrS = kArr + d.off;
        legs = [['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行`], [nm, fmt(arrS) + ' 着', `${st.how} ${st.access}分`]];
        steps = [...first, { arr: null, t: arrS, do: `${nm} ${fmt(arrS)} 着 → ${st.how}で${placeName(st)}へ（${st.access}分）` }];
      } else {
        const mk = tt.mkUp.find((u) => u - CFG.mkKashiwa >= kArr + CFG.transfer); if (mk === undefined) continue;
        arrS = mk + d.off;
        legs = [['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行`], ['柏', `${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発`, '各駅停車'], [nm, fmt(arrS) + ' 着', `${st.how} ${st.access}分`]];
        steps = [...first, { arr: null, t: kArr, do: `柏 ${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発 各駅停車に乗り換え` },
          { arr: null, t: arrS, do: `${nm} ${fmt(arrS)} 着 → ${st.how}で${placeName(st)}へ（${st.access}分）` }];
      }
      out.push({ leave: out1.leave, arrive: arrS + st.access, legs, steps, search: { from: '荒川沖', to: nm, dep: araDep } });
    }
    return prune(out);
  }
  // 行き先 → マイ駅 → 家
  function destBack(st, D) {
    const tt = TIMETABLE[typeOf(D)], d = DEST[st.key], nm = stName(st), out = [];
    for (const [kDep, type, dest, araArr] of tt.chuDown) {
      const inl = inLeg(tt, araArr);
      let depS, legs, steps;
      if (d.line === 'k') {
        depS = kDep - d.off;
        legs = [[nm, fmt(depS) + ' 発', `${type} ${dest}行`], ['荒川沖', fmt(araArr) + ' 着', inl.label]];
        steps = [{ arr: null, t: depS - CFG.margin - st.access, do: `${placeName(st)}を出て${nm}駅へ（${st.how} ${st.access}分）` },
          { arr: null, t: depS, do: `${nm} ${fmt(depS)} 発 ${type} ${dest}行に乗る` }, { arr: 'home', t: araArr, do: inl.do }];
      } else {
        let mk = null;
        for (const x of tt.mkDown) if (x + CFG.mkKashiwa + CFG.transfer <= kDep) mk = x; else break;
        if (mk === null) continue;
        depS = mk - d.off;
        legs = [[nm, fmt(depS) + ' 発', '各駅停車'], ['柏', `${fmt(mk + CFG.mkKashiwa)} 着 → ${fmt(kDep)} 発`, `${type} ${dest}行`], ['荒川沖', fmt(araArr) + ' 着', inl.label]];
        steps = [{ arr: null, t: depS - CFG.margin - st.access, do: `${placeName(st)}を出て${nm}駅へ（${st.how} ${st.access}分）` },
          { arr: null, t: depS, do: `${nm} ${fmt(depS)} 発 各駅停車に乗る` },
          { arr: null, t: mk + CFG.mkKashiwa, do: `柏で乗り換え → ${fmt(kDep)} 発 ${type} ${dest}行` }, { arr: 'home', t: araArr, do: inl.do }];
      }
      out.push({ leave: depS - CFG.margin - st.access, arrive: inl.arrive, legs, steps, search: { from: nm, to: '荒川沖', dep: depS } });
    }
    return prune(out);
  }
  const hm = (v) => { if (!v) return null; const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  // マイ駅の予定の計算。kind='go'：T（分）までに着く一番遅い便／'back'：T 以降に出る一番早い便
  // 常磐線以外の駅（key なし）は、予定に入れた時刻（Yahoo!で調べたもの）をそのまま使う
  function destPlan(st, D, kind, T, manual) {
    if (!st.key) {
      const lv = hm(manual && manual.leave), ar = hm(manual && manual.arrive);
      if (lv == null || ar == null) return { main: null, manualNeeded: true };
      return { main: { leave: lv, arrive: ar, manual: true, legs: [[stName(st), kind === 'go' ? '経由' : '発', 'Yahoo!乗換案内で調べた経路']], steps: [] }, before: null, after: null };
    }
    rbDate(D);
    const all = (kind === 'go' ? destGo(st, D) : destBack(st, D)).sort((a, b) => a.leave - b.leave);
    if (kind === 'go') {
      const ok = all.filter((o) => o.arrive <= T);
      const main = ok[ok.length - 1] || null;
      return { main, before: ok[ok.length - 2] || null, after: main ? all.find((o) => o.leave > main.leave) || null : null, est: st.key !== 'kashiwa' };
    }
    const i = all.findIndex((o) => o.leave >= T);
    return { main: all[i] || null, before: i > 0 ? all[i - 1] : null, after: i >= 0 ? all[i + 1] || null : null, est: st.key !== 'kashiwa' };
  }
  const rbDate = (D) => { bDate = D; };

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
    // アプリ直接（yjtransit://）だと時刻と「到着時刻指定」が伝わらないので、経路検索は Web 版で開く
    void app; return web;
  }
  // 好きな駅どうしを Yahoo!乗換案内で調べる（type 1=出発時刻、4=到着時刻）
  function yahooUrl(from, to, date, hhmm, type) {
    const [hh, mn] = hhmm.split(':').map(Number), d = date;
    const ft = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const app = `conditions?${ft}&d=${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}&t=${pad(hh)}${pad(mn)}&type=${type}`;
    const web = `https://transit.yahoo.co.jp/search/result?${ft}&y=${d.getFullYear()}&m=${pad(d.getMonth() + 1)}&d=${pad(d.getDate())}` +
      `&hh=${pad(hh)}&m1=${Math.floor(mn / 10)}&m2=${mn % 10}&type=${type}`;
    // アプリ直接（yjtransit://）だと時刻と「到着時刻指定」が伝わらないので、経路検索は Web 版で開く
    void app; return web;
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
        leave: kDep, arrive: inLeg(tt, araArr).arrive, onboard: [kDep, araArr],
        search: { from: '柏', to: '荒川沖', dep: kDep },
        legs: [['柏', fmt(kDep) + ' 発', `${type} ${dest}行（乗車中）`], ['荒川沖', fmt(araArr) + ' 着', inLeg(tt, araArr).label]],
        steps: [{ arr: 'ara', t: kDep, do: `${type} ${dest}行に乗っている` }, { arr: 'home', t: araArr, do: inLeg(tt, araArr).do }],
      });
      return out;
    }
    for (const [kDep, type, dest, araArr] of tt.chuDown) {
      const tail = [
        { arr: 'ara', t: kDep, do: `柏 ${fmt(kDep)} 発 ${type} ${dest}行に乗る` },
        { arr: 'home', t: araArr, do: inLeg(tt, araArr).do },
      ];
      if (from === 'kashiwa') {
        out.push({
          leave: kDep - CFG.margin, arrive: inLeg(tt, araArr).arrive,
          search: { from: '柏', to: '荒川沖', dep: kDep },
          legs: [['柏', fmt(kDep) + ' 発', `${type} ${dest}行`], ['荒川沖', fmt(araArr) + ' 着', inLeg(tt, araArr).label]],
          steps: [{ arr: 'kashiwa', t: kDep - CFG.margin, do: '柏駅のホームへ' }, ...tail],
        });
        continue;
      }
      let mk = null;
      for (const d of tt.mkDown) if (d + CFG.mkKashiwa + CFG.transfer <= kDep) mk = d; else break;
      if (mk === null) continue;
      let walk = from === 'univ' ? CFG.walkUniv : 0;
      // 金曜の特例：南柏 15:11 発には、3限のあと（14:50）に急いで歩いて乗る
      const fri = from === 'univ' && friOn() && bDate && bDate.getDay() === FRI.dow && mk === FRI.mk;
      if (fri) walk = mk - CFG.margin - FRI.leave;
      out.push({
        leave: mk - walk - CFG.margin,
        arrive: inLeg(tt, araArr).arrive,
        search: { from: '南柏', to: '荒川沖', dep: mk },
        legs: [
          ['南柏', fmt(mk) + ' 発', '各駅停車'],
          ['柏', `${fmt(mk + CFG.mkKashiwa)} 着 → ${fmt(kDep)} 発`, `${type} ${dest}行`],
          ['荒川沖', fmt(araArr) + ' 着', inLeg(tt, araArr).label],
        ],
        // 移動中の表示用（t はその時刻、do はその時にやること）
        steps: [
          walk ? { arr: 'mk', t: mk - walk - (fri ? CFG.margin : 0), do: fri ? `南柏駅まで急いで歩く（金曜の特例・${walk + CFG.margin}分）` : `南柏駅まで歩く（${walk}分）` } : { arr: 'mk', t: mk - CFG.margin, do: '南柏駅のホームへ' },
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
      const out1 = from === 'home' ? outLeg(tt, araDep) : null;
      if (from === 'home' && !out1) continue; // 間に合うバスがない
      out.push({
        leave: out1 ? out1.leave : araDep - CFG.margin,
        arrive: mk + CFG.walkUniv,
        search: { from: '荒川沖', to: '南柏', dep: araDep },
        legs: [
          ['荒川沖', fmt(araDep) + ' 発', `${type} ${dest}行`],
          ['柏', `${fmt(kArr)} 着 → ${fmt(mk - CFG.mkKashiwa)} 発`, '各駅停車'],
          ['南柏', fmt(mk) + ' 着', '徒歩 ' + CFG.walkUniv + '分'],
        ],
        steps: [
          out1 ? { arr: 'ara', t: out1.leave, do: out1.do } : { arr: 'ara', t: araDep - CFG.margin, do: '荒川沖駅のホームへ' },
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
    const m = dir === 'school' ? CFG.walkUniv : HM();
    const what = dir === 'school' ? `大学まで歩く（${m}分）` : `家まで${HV()}（${m}分）`;
    return { leave: start, arrive: start + m, search: null, move: true,
      legs: [[dir === 'school' ? '南柏' : '荒川沖', fmt(start) + ' 出発', what]], steps: [{ arr: dir === 'school' ? 'univ' : 'home', t: start, do: what }] };
  }
  // 同じ時刻以前に着く、もっと遅く出られる候補があれば、早く出るほうは省く
  // 出発が同じかもっと遅くて、着くのが同じかもっと早い候補があれば省く（雨の日は同じバスから乗れる電車が何本もある）
  function prune(list) {
    list.sort((a, b) => a.leave - b.leave || a.arrive - b.arrive);
    return list.filter((o, i) => !list.some((x, j) => j !== i && x.leave >= o.leave && x.arrive <= o.arrive && (x.leave > o.leave || x.arrive < o.arrive || j < i)));
  }
  const shift = (o, k) => ({ ...o, leave: o.leave + k, arrive: o.arrive + k, onboard: o.onboard && o.onboard.map((x) => x + k), search: o.search && { ...o.search, dep: o.search.dep + k }, steps: o.steps.map((x) => ({ ...x, t: x.t + k })) });
  // 金曜の特例（南柏 15:11 発に、14:50 に大学を出て急いで乗る）
  const FRI = { dow: 5, mk: 15 * 60 + 11, leave: 14 * 60 + 50 };
  const friOn = () => S.fri !== false;
  let bDate = null; // 今計算している日（曜日ごとの特例に使う）
  const build = (dir, tt, from, date) => { bDate = date || null; return dir === 'home' ? homeOptions(tt, from) : schoolOptions(tt, from); };

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
      const run = build(dir, TIMETABLE[typeOf(svc)], from, svc).filter((o) => o.onboard[0] <= nowMin + 1 && nowMin < o.onboard[1] + 15);
      opts = run.reverse(); // 出発が新しい順（たいていは一番新しく出た電車に乗っている）
    } else {
      const today = build(dir, TIMETABLE[typeOf(svc)], from, svc);
      opts = today.filter((o) => o.leave >= nowMin);
      if (opts.length < 4) opts = opts.concat(build(dir, TIMETABLE[typeOf(next)], from, next).map((o) => shift(o, 1440)));
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
  // （9:14 発の1本後＝9:36 発。10:40 ちょうどに着く）
  const SPECIAL = { period: 2, from: '荒川沖', dep: 9 * 60 + 36 };
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
    if (moveOnly(dir, from)) { all = [moveOption(dir, T - (dir === 'school' ? CFG.walkUniv : HM()))]; ok = all; }
    else {
      all = build(dir, TIMETABLE[typeOf(prev)], from, prev).map((o) => shift(o, -1440)).concat(build(dir, TIMETABLE[typeOf(D)], from, D))
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

  // マイ駅の追加
  function addMySt() {
    G.openEditor(`<h3>マイ駅を追加</h3>
      <label class="f">駅（部活などで、大学の代わりに行く駅）</label><select id="msSt">${Object.entries(DEST).map(([k, j]) => `<option value="${k}">${j.name}${k === 'kashiwa' ? '' : '（常磐線・推定）'}</option>`).join('')}<option value="">その他の駅（駅名を入れる）</option></select>
      <div id="msOther" hidden><label class="f">駅名</label><input id="msName" placeholder="例：つくば"></div>
      <label class="f">駅から行く場所</label><input id="msLabel" placeholder="例：部活の体育館">
      <div class="row2"><div><label class="f">駅からの手段</label><select id="msHow">${['徒歩', '自転車', 'バス', '車'].map((x) => `<option>${x}</option>`).join('')}</select></div>
      <div><label class="f">かかる時間（分）</label><input id="msAcc" type="number" min="0" max="120" value="10"></div></div>
      <p class="muted">柏は時刻表どおり、柏より先の常磐線の駅は柏の時刻から推定して計算します（数分ずれることがあります）。その他の駅は、予定に Yahoo!乗換案内で調べた時刻を入れて使います。家側は荒川沖のままです。</p>
      <button class="btn pri full" id="msSave">追加</button><button class="btn full" id="msCancel">閉じる</button>`, (root) => {
      const q = (x) => root.querySelector(x);
      q('#msSt').onchange = () => { q('#msOther').hidden = !!q('#msSt').value; };
      q('#msSave').onclick = () => {
        const j = q('#msSt').value, name = q('#msName').value.trim().replace(/駅$/, '');
        if (!j && !name) { q('#msName').focus(); return; }
        const m = { id: 's' + Date.now().toString(36), key: j || null, name: j ? DEST[j].name : name, label: q('#msLabel').value.trim(),
          how: q('#msHow').value, access: Math.max(0, Number(q('#msAcc').value) || 0) };
        G.save(MKEY, [...mySt(), m]); G.closeEditor(); render(); G.toast(`マイ駅に ${stName(m)}駅 を追加しました`);
      };
      q('#msCancel').onclick = G.closeEditor;
    });
  }

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
    const prev = getLoc();
    setLoc(loc);
    if (loc && loc !== 'home') markWent(); // 駅・車内・大学にいる＝もう家を出た
    if (loc === 'home') S.dir = 'school';
    if (loc === 'univ') S.dir = 'home';
    if (loc === 'train' && prev !== 'train') { S.prevLoc = prev; S.dir = guessDir(new Date()); }
    delete S.arriveDay; saveS();
  }
  // 車内のとき、行きか帰りかを推定する
  function guessDir(now) {
    const tr = G.load(TKEY, null);
    if (tr) return tr.dir; // 移動中ならその向き
    const p = S.prevLoc; // 車内になる直前にいた場所
    if (p === 'home' || p === 'ara') return 'school';
    if (p === 'kashiwa' || p === 'mk' || p === 'univ') return 'home';
    const st = G.classes.status(now), min = G.minOfDay(now); // 時間割：最初の対面授業の前なら行き
    if (st.first) return min < st.first.s ? 'school' : 'home';
    return min < 12 * 60 ? 'school' : 'home';
  }
  // 行き・帰りを入れ替える（車内の推定が違っていたとき）
  function flipDir() { S.dir = S.dir === 'school' ? 'home' : 'school'; saveS(); }
  const km = (d) => (d < 1000 ? `${Math.round(d / 10) * 10}m` : `${(d / 1000).toFixed(1)}km`);
  // 位置はボタンを押したときに1回だけ取り、一番近い地点を選ぶ。位置そのものは保存しない（登録したときを除く）
  // silent：アプリを開いたときの自動取得。場所が変わったときだけ知らせる
  function locate(register, done, silent) {
    if (!navigator.geolocation) { if (!silent) G.toast('この端末では位置情報が使えません'); return; }
    if (!silent) G.toast('現在地を調べています…');
    const before = getLoc();
    const say = (force) => { if (!silent || (force && getLoc() !== before)) G.toast(S.gpsMsg); };
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
        saveS(); say(true); done && done(); return;
      }
      // GPSの誤差（屋内だと数百m〜1km）も見込んで判定し、3km以内なら一番近い地点を選ぶ
      if (best && (best.d <= best.r + Math.min(acc, 1000) || best.d <= 3000)) {
        pickLoc(best.k);
        S.gpsMsg = `📍 ${best.name}を選びました（約${km(best.d)}・精度±${km(acc)}）`;
        saveS(); say(true); done && done(); return;
      }
      S.gpsMsg = `近くに登録した地点がありません（一番近いのは${best ? best.name + '・約' + km(best.d) : 'なし'}、精度±${km(acc)}）。手で選んでください`;
      saveS(); say(false); done && done();
    }, (err) => {
      S.gpsMsg = err.code === 1 ? '位置情報が許可されていません（ブラウザやスマホの設定から、このサイトの位置情報を許可してください）' : '現在地を取得できませんでした（電波の良い場所でもう一度）';
      saveS(); say(false); done && done();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: silent ? 120000 : 0 });
  }
  // アプリを開いたとき・画面に戻ったときに自動で1回（5分に1回まで）。メニューでオフにできる
  const autoOn = () => G.load('gl.autoGps', true) !== false;
  let lastAuto = 0;
  function autoLocate(done) {
    if (!autoOn() || Date.now() - lastAuto < 5 * 60e3) return;
    lastAuto = Date.now();
    locate(null, done, true);
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

  // 車内：今走っている電車の候補を並べる（「これに乗ってる」で移動中カードを始める）
  function onboardList(dir, now, big) {
    const plan = nowPlan(dir, now, 'train');
    const to = dir === 'school' ? '大学' : '家';
    const flip = `<button class="btn" data-flip="1">↔ ${dir === 'school' ? '帰り（柏→荒川沖）' : '行き（荒川沖→柏）'}の電車を見る</button>`;
    if (!plan.opts.length) return `<div class="card muted">今走っている${dir === 'school' ? '荒川沖→柏' : '柏→荒川沖'}の電車が時刻表に見つかりません。${flip}</div>`;
    const st = G.classes.status(now);
    return plan.opts.map((o, i) => {
      const [dep, arr] = o.onboard, n = plan.nowAbs;
      const pos = n < arr ? `あと${G.dur(Math.max(1, arr - n))}で${dir === 'school' ? '柏' : '荒川沖'}` : `${dir === 'school' ? '柏' : '荒川沖'}に着いている時刻`;
      let note = '';
      if (dir === 'school') {
        const during = st.campus.find((x) => x.s < o.arrive && x.e > o.arrive), nx = st.campus.find((x) => x.s >= o.arrive);
        note = during ? `<span class="late">⚠ ${during.n}限に${Math.round(o.arrive - during.s)}分遅れ</span>` : nx ? `${nx.n}限（${G.esc(nx.c.name)}）に間に合う` : '';
      }
      return `<div class="card onb${i === 0 ? ' first' : ''}"><div class="row"><b>${G.esc(o.legs[0][1])} ${G.esc(o.legs[0][2].replace('（乗車中）', ''))}</b></div>
        <div class="${big && i === 0 ? 'onb-big' : 'onb-mid'}">${to}に ${fmt(o.arrive)} 着</div>
        <div class="muted">${pos}${note ? '・' + note : ''}</div>
        <button class="btn pri" data-board="${dir}:${dep}">🚃 これに乗ってる</button></div>`;
    }).join('') + flip;
  }
  // 「これに乗ってる」：その電車で移動中カードを始める
  function board(dir, dep) {
    markWent();
    const old = G.load(TKEY, null);
    G.save(TKEY, { dir, t: Date.now(), train: Number(dep) });
    return old;
  }

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
      mainHtml = `<div class="gh">乗っている電車の候補（${S.dir === 'school' ? '行き・荒川沖→柏' : '帰り・柏→荒川沖'}）</div>` + onboardList(S.dir, now, true);
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
    h += `<div class="gh">移動時間の設定</div><div class="card">${Object.keys(CHOICES).map((k) => `<div class="set-row"><span>${{ walkUniv: '大学 ⇄ 南柏（徒歩）', bikeHome: '荒川沖 ⇄ 家（自転車）', busHome: '荒川沖 ⇄ 家（雨の日・バス、待ち時間こみ）' }[k]}</span>
      <div class="seg" style="margin:0">${CHOICES[k].map((x) => `<button class="${x === CFG[k] ? 'on' : ''}" data-k="${k}" data-v="${x}">${x}分</button>`).join('')}</div></div>`).join('')}
      <div class="set-row"><span>雨モード（雨の日は荒川沖 ⇄ 家をバスで計算）${G.weather && G.weather.rainToday() ? '・☔ 今日は雨の予報' : ''}</span>
      <div class="seg" style="margin:0">${[['auto', '天気で自動'], ['on', '☔ 雨'], ['off', '☀️ 晴れ']].map(([k, t]) => `<button data-rain="${k}" class="${(S.rain || 'auto') === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="set-row" style="margin:0"><span>2限の特例（2限に行くときは ${SPECIAL.from} ${fmt(SPECIAL.dep)} 発までの電車に乗る）</span>
      <div class="seg" style="margin:0"><button data-sp="1" class="${specialOn() ? 'on' : ''}">オン</button><button data-sp="0" class="${specialOn() ? '' : 'on'}">オフ</button></div></div>
      <div class="set-row" style="margin:12px 0 0"><span>金曜の特例（3限のあと急いで歩いて 南柏 ${fmt(FRI.mk)} 発に乗る）</span>
      <div class="seg" style="margin:0"><button data-fri="1" class="${friOn() ? 'on' : ''}">オン</button><button data-fri="0" class="${friOn() ? '' : 'on'}">オフ</button></div></div></div>`;
    // マイ駅（特定の日だけ別の駅を使う）
    const ms = mySt();
    h += `<div class="gh">マイ駅（部活などで大学の代わりに行く駅）</div><div class="card">
      ${ms.length ? ms.map((m) => `<div class="ms-row"><div><b>${G.esc(stName(m))}駅</b>${m.key ? '' : '<small>（常磐線以外）</small>'}<small>${m.label ? G.esc(m.label) + 'まで' : ''}${G.esc(m.how)} ${m.access}分</small></div><button class="btn" data-msdel="${m.id}">消す</button></div>`).join('')
        : '<p class="muted" style="margin-top:0">まだありません。登録した駅は、カレンダーの予定（部活など）の「行き先」で選べます。</p>'}
      <button class="btn full" data-msadd="1">＋ マイ駅を追加</button></div>`;
    h += `<div class="foot"><button class="daytype" id="lcDay">${(S.dayMode === 'auto' ? '' : '手動：') + { wk: '平日', ho: '土休日' }[plan.type]}ダイヤ</button><br>
      タップで「自動→平日→土休日」を切り替え<br>時刻表どおりの表示です（遅延は反映されません）<br>出典：JR東日本 駅時刻表（南柏 2026年10月版／柏・荒川沖 2026年11月版）</div>`;
    v.innerHTML = h;
  }

  function onClick(e) {
    if (handleLoc(e, render)) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.flip) { flipDir(); render(); return; }
    if (b.dataset.board) { const [d, t] = b.dataset.board.split(':'); board(d, t); G.go('home'); G.toast('移動中カードを始めました'); return; }
    if (b.dataset.dir) { S.dir = b.dataset.dir; delete S.arriveDay; }
    else if (b.dataset.mode) { S.mode = b.dataset.mode; delete S.arriveDay; }
    else if (b.dataset.p) { S.arrive[S.dir] = b.dataset.p; delete S.arriveDay; }
    else if (b.dataset.rain) { S.rain = b.dataset.rain; }
    else if (b.dataset.msadd) { addMySt(); return; }
    else if (b.dataset.msdel) { G.save(MKEY, mySt().filter((m) => m.id !== b.dataset.msdel)); render(); return; }
    else if (b.dataset.fri) { S.fri = b.dataset.fri === '1'; }
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
  // 今日もう大学へ向かったか（シンプル表示を出すかどうかに使う）
  const markWent = () => G.save('gl.went', G.ymd(new Date()));
  const wentToday = () => G.load('gl.went', '') === G.ymd(new Date());
  function tripStart(dir) {
    if (dir === 'school') markWent();
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
    if (!st || st.arr === (tr.dir === 'school' ? 'univ' : 'home')) { tripEnd(); return 'end'; }
    tr.marks.push({ from: st.arr, at: now.getTime(), prefix: cur.o.steps.slice(0, i + 1).map(({ arr, t, do: d }) => ({ arr, t, do: d })) });
    G.save(TKEY, tr);
  }
  function trip(now) {
    const tr = G.load(TKEY, null);
    if (!tr) return null;
    const dep = new Date(tr.t);
    // 出た時刻の1分前までに出ていれば乗れる電車を探す（ボタンを押すのが少し遅れても大丈夫なように）
    let plan = nowPlan(tr.dir, new Date(tr.t - 60e3));
    let o = plan.opts[0], done = -1;
    if (tr.train != null) { // 「これに乗ってる」で選んだ電車
      plan = nowPlan(tr.dir, new Date(tr.t), 'train');
      o = plan.opts.find((x) => x.onboard[0] === tr.train) || plan.opts[0];
      plan = { ...plan, nowAbs: plan.nowAbs - 1 }; // 下の nowAbs 計算（押した時刻の1分前から数える）と合わせる
    }
    const nowAbs = plan.nowAbs + (now - dep) / 60000 + 1;
    const m = tr.marks && tr.marks[tr.marks.length - 1];
    if (m && !m.from) done = m.prefix.length - 1; // マイ駅など：組み直さずに、そこまで終わったことにする
    if (m && m.from) {
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
    return { dir: tr.dir, dep, o, base: plan.base, nowAbs, done, boarded: tr.train != null ? tr.train : null };
  }

  G.commute = { DEST, mySt, stName, placeName, destPlan, wentToday, rainMode: () => S.rain || 'auto', yahooUrl, rainy, HOLIDAYS, dir: () => S.dir, onboardList, board, flipDir, autoLocate, autoOn, PLACES, getLoc, fromFor, locChips, handleLoc, trip, tripStart, tripEnd, tripMark, nowPlan, arrivePlan, routeUrl, open, init, dayLabel };
  // 秒まで数えるので、表示中は1秒ごとに描き直す（入力中は止める）
  G.reg('commute', { title: '通学', render, tick: 1, skipTick: () => document.activeElement && document.activeElement.id === 'lcArrive' });
})();
