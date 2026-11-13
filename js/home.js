// ホーム：今日の授業・家を出る時刻・課題・学食をひと目で
(function () {
  const pfx = (s) => `${s.n}限 ${G.fmtMin(s.s)}`;
  const where = (c) => (G.classes.isOnline(c) ? '💻 オンライン' + (c.teacher ? '・' + c.teacher : '') : [c.room, c.teacher].filter(Boolean).join('・'));
  const hhmm = (m) => `${G.pad(Math.floor(m / 60))}:${G.pad(m % 60)}`;

  function hero(now, cs) {
    const min = G.minOfDay(now);
    if (cs.cur) {
      const x = cs.cur, pct = Math.min(100, ((min - x.s) / (x.e - x.s)) * 100);
      return `<div class="card hero"><div class="label">授業中・${x.n}限（${G.fmtMin(x.s)}–${G.fmtMin(x.e)}）</div>
        <div class="big">${G.esc(x.c.name)}</div><div class="meta">${G.esc(where(x.c))}　あと${G.dur(x.e - min)}で終わり</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${cs.next ? `<div class="meta" style="margin-top:8px">次：${pfx(cs.next)} ${G.esc(cs.next.c.name)}${where(cs.next.c) ? '（' + G.esc(where(cs.next.c)) + '）' : ''}</div>` : ''}</div>`;
    }
    if (cs.next) {
      const x = cs.next;
      return `<div class="card hero"><div class="label">次の授業・あと${G.dur(x.s - min)}</div>
        <div class="big">${pfx(x)}　${G.esc(x.c.name)}</div><div class="meta">${G.esc(where(x.c)) || '教室未登録'}${x.c.memo ? '　📌' + G.esc(x.c.memo) : ''}</div></div>`;
    }
    const tm = new Date(now); tm.setDate(tm.getDate() + 1);
    const tl = G.classes.dayList(tm);
    const anyClass = Object.keys(G.classes.all()).length;
    return `<div class="card hero"><div class="label">${G.WD[now.getDay()]}曜日</div>
      <div class="big">${cs.list.length ? '今日の授業は終わり 🎉' : anyClass ? '今日は授業なし' : 'ようこそ GOD Life へ'}</div>
      <div class="meta">${anyClass ? (tl.length ? `明日は ${pfx(tl[0])} ${G.esc(tl[0].c.name)} から（${tl.length}コマ）` : '明日も授業なし') : '「時間割」タブで授業を登録すると、ここに次の授業と家を出る時刻が出ます'}</div></div>`;
  }

  // 次に授業がある日（今日の1コマ目がまだなら今日）
  // 家以外（駅など）にいるときは、今日まだ始まっていない次の対面授業を目標にする
  function nextClassDay(now, from) {
    const min = G.minOfDay(now);
    if (from && from !== 'home') {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      const list = G.classes.dayList(d);
      const nx = list.find((x) => !G.classes.isOnline(x.c) && x.s > min);
      if (nx) return { k: 0, date: d, first: nx, onlineBefore: [] };
    }
    for (let k = 0; k <= 7; k++) {
      const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + k);
      // オンライン授業は家で受けるので、大学に行くのは最初の対面の授業から
      const list = G.classes.dayList(d);
      const campus = list.filter((x) => !G.classes.isOnline(x.c));
      if (!campus.length || (k === 0 && min >= campus[0].s)) continue;
      return { k, date: d, first: campus[0], onlineBefore: list.filter((x) => G.classes.isOnline(x.c) && x.s < campus[0].s) };
    }
    return null;
  }
  const row = (go, label, main, sub, warn) => `<div class="crow" onclick="${go}"><div class="tx"><div class="t1">${label}</div>
    <div class="t2${warn ? ' late' : ''}">${main}</div>${sub ? `<div class="t3">${sub}</div>` : ''}</div><div class="go">›</div></div>`;

  // ① 授業に間に合うには何時に家を出るか
  function classRow(now) {
    if (!Object.keys(G.classes.all()).length)
      return row(`G.go('class')`, '授業に合わせて', '時間割を登録しよう', '1コマ目に間に合う「家を出る時刻」がここに出ます（スクショからも読み込めます）');
    // 現在地が駅なら今日はそこから、別の日は家から
    const loc = G.commute.fromFor('school');
    if (!loc) return ''; // 大学にいる
    const nd = nextClassDay(now, loc);
    if (!nd) return '';
    const from = nd.k === 0 ? loc : 'home';
    const P = G.commute.PLACES[from];
    const plan = G.commute.arrivePlan('school', now, nd.first.s, nd.k, from);
    const o = plan.opts[0];
    const label = `${G.commute.dayLabel(nd.date, now) || '今日 '}${pfx(nd.first)}（${G.esc(nd.first.c.name)}）に間に合うには${from !== 'home' ? `（📍${P.name}から）` : ''}`;
    const go = `G.commute.open('school','arrive','${hhmm(nd.first.s)}','${G.ymd(nd.date)}')`;
    if (!o) return row(go, label, '間に合う電車がありません', '', true);
    const left = o.leave - plan.nowAbs;
    const parts = [];
    if (left < 0) parts.push('⚠ もう間に合いません'); else if (left < 24 * 60) parts.push(`あと${G.dur(left)}`);
    parts.push(`大学 ${G.fmtMin(o.arrive)} 着`);
    if (plan.special) parts.push('2限の特例');
    let sub = parts.join('・');
    if (nd.onlineBefore.length) {
      const ob = nd.onlineBefore, lastOn = ob[ob.length - 1];
      sub += `<br>💻 ${ob.map((x) => x.n + '限').join('・')}はオンライン（家で受けてから出発）`;
      if (o.leave < lastOn.e) sub += `<br><span class="late">⚠ ${lastOn.n}限のオンライン授業（〜${G.fmtMin(lastOn.e)}）の途中で出発になります</span>`;
    }
    return row(go, label, `${G.fmtMin(o.leave)} に${P.short}を出る`, sub, left < 0);
  }

  // ② 今から行くなら
  function goNowRow(now, cs) {
    const from = G.commute.fromFor('school');
    if (!from) return ''; // 大学にいる
    const P = G.commute.PLACES[from];
    const label = from === 'home' ? '今から行くなら' : `今から行くなら（📍${P.name}から）`;
    const plan = G.commute.nowPlan('school', now, from);
    const o = plan.opts[0];
    if (!o) return row(`G.commute.open('school','now')`, label, '候補がありません', '');
    let note = '';
    if (!o.tomorrow) {
      const mine = cs.campus.find((x) => x.s >= o.arrive);
      const during = cs.campus.find((x) => x.s < o.arrive && x.e > o.arrive);
      if (during) note = `${during.n}限（${G.esc(during.c.name)}）の途中に着く`;
      else if (mine) note = `${pfx(mine)}（${G.esc(mine.c.name)}）に間に合う`;
      else { const p = G.PERIODS.find((x) => x.s >= o.arrive); note = p ? `${p.n}限に間に合う` : '5限にも間に合いません'; }
    }
    const left = o.leave - plan.nowAbs;
    return row(`G.commute.open('school','now')`, label,
      `${o.tomorrow ? '明日 ' : ''}${G.fmtMin(o.leave)} に${P.short}を出る`,
      `あと${G.dur(left)}・大学 ${G.fmtMin(o.arrive)} 着${note ? '・' + note : ''}`);
  }

  // ③ 帰り（授業中なら授業後の電車）
  function homeRow(now, cs) {
    const min = G.minOfDay(now);
    const from = G.commute.fromFor('home');
    if (!from) return ''; // 家にいる
    const P = G.commute.PLACES[from];
    const after = from === 'univ' && cs.last && min < cs.last.e && min >= cs.first.s ? cs.last.e : null;
    const base = after ? new Date(new Date(now).setHours(0, after, 0, 0)) : now;
    const plan = G.commute.nowPlan('home', base, from);
    const o = plan.opts[0];
    const label = after ? `授業後（${G.fmtMin(after)} 終了）に帰るなら` : from === 'univ' ? '今から帰るなら' : `今から帰るなら（📍${P.name}から）`;
    if (!o) return row(`G.commute.open('home','now')`, label, '候補がありません', '');
    return row(`G.commute.open('home','now')`, label,
      `${o.tomorrow ? '明日 ' : ''}${G.fmtMin(o.leave)} に${P.short}を出る`,
      after ? `家に ${G.fmtMin(o.arrive)} 着` : `あと${G.dur(o.leave - plan.nowAbs)}・家に ${G.fmtMin(o.arrive)} 着`);
  }

  // 移動中カード（「家を出た」「大学を出た」を押したあと）
  function tripCard(now, cs) {
    const tr = G.commute.trip(now);
    if (!tr) return '';
    const { o, nowAbs: n } = tr, school = tr.dir === 'school';
    const to = school ? '大学' : '家';
    // 最初の手順（駅まで移動）は出た時点で始まっているので、次にやることは2つ目から探す
    let idx = o.steps.findIndex((x, i) => i > 0 && x.t > n);
    const next = idx === -1 ? null : o.steps[idx];
    const cur = idx === -1 ? o.steps.length - 1 : idx - 1;
    let note = '';
    if (school && !o.tomorrow) {
      const during = cs.campus.find((x) => x.s < o.arrive && x.e > o.arrive);
      const nextC = cs.campus.find((x) => x.s >= o.arrive);
      if (during) note = `<span class="late">⚠ ${during.n}限（${G.esc(during.c.name)}）に${Math.round(o.arrive - during.s)}分遅れて着く</span>`;
      else if (nextC) note = `${nextC.n}限（${G.esc(nextC.c.name)}）の${G.dur(nextC.s - o.arrive)}前に着く`;
    }
    const steps = o.steps.map((x, i) => `<li class="${i < cur ? 'done' : i === cur ? 'cur' : ''}"><b>${G.fmtMin(x.t)}</b><span>${G.esc(x.do)}</span></li>`).join('');
    return `<div class="card trip"><div class="label">🚃 移動中（${school ? '家→大学' : '大学→家'}）・${tr.dep.getHours()}:${G.pad(tr.dep.getMinutes())} 出発</div>
      <div class="muted" style="margin-top:6px">いま：${G.esc(o.steps[cur].do)}</div>
      <div class="big">${next ? `あと${G.dur(Math.max(0, next.t - n))}` : n < o.arrive ? `あと${G.dur(o.arrive - n)}` : `まもなく${to}`}</div>
      <div class="meta">${next ? '次：' + G.esc(next.do) : `${to}に ${G.fmtMin(o.arrive)} に着く予定`}</div>
      <ol class="steps">${steps}<li class="${n >= o.arrive ? 'cur' : ''}"><b>${G.fmtMin(o.arrive)}</b><span>${to}に着く</span></li></ol>
      ${note ? `<div class="meta">${note}</div>` : ''}
      <div class="row2" style="margin-top:10px"><button class="btn pri" onclick="G.commute.tripEnd();G.mods.home.render()">✓ 着いた</button>
      <a class="btn" href="${G.commute.routeUrl(o, tr.base)}">遅れを確認</a>
      <button class="btn" onclick="G.commute.tripEnd();G.mods.home.render()">取り消す</button></div></div>`;
  }
  function leave(dir) {
    const old = G.commute.tripStart(dir);
    G.mods.home.render(); window.scrollTo(0, 0);
    G.toast(dir === 'school' ? '家を出ました。いってらっしゃい！' : '大学を出ました。おつかれさま！', () => {
      if (old) G.save('gl.trip', old); else G.commute.tripEnd();
      G.mods.home.render();
    });
  }

  function commuteTile(now, cs) {
    const min = G.minOfDay(now);
    // 家にいそうな時間（1コマ目の前・授業のない日の午前）は「行き」を上に
    const atHome = cs.first ? min < cs.first.s : min < 12 * 60;
    let rows = atHome ? [classRow(now), goNowRow(now, cs), homeRow(now, cs)] : [homeRow(now, cs), classRow(now), goNowRow(now, cs)];
    // 移動中は、その向きの行は出さない（移動中カードに出ている）
    const tr = G.commute.trip(now);
    if (tr) rows = tr.dir === 'school' ? [homeRow(now, cs)] : [classRow(now), goNowRow(now, cs)];
    const btns = `<div class="row2 tripbtns"><button class="btn${atHome ? ' pri' : ''}" onclick="G.home.leave('school')">🚪 家を出た</button><button class="btn${atHome ? '' : ' pri'}" onclick="G.home.leave('home')">🏫 大学を出た</button></div>`;
    const loc = G.commute.getLoc();
    return `<div class="gh">🚃 通学${loc ? `<span class="locchip">📍${G.commute.PLACES[loc].name}</span>` : ''}<a href="#commute">時刻表 ›</a></div><div class="card crows">${G.commute.locChips(true)}${rows.filter(Boolean).join('')}${btns}</div>`;
  }

  function kadaiTile() {
    const s = G.kadai.summary();
    if (s.locked) return `<div class="card tile" onclick="G.go('kadai')"><div class="ic">📝</div><div class="tx"><div class="t1">課題</div><div class="t2">合言葉を入れて表示</div><div class="t3">麗澤ポータルの課題を自動で取得します</div></div><div class="go">›</div></div>`;
    const urgent = (s.cnt.over || 0) + (s.cnt.today || 0);
    const first = s.items[0];
    return `<div class="card tile" onclick="G.go('kadai')"><div class="ic">📝</div><div class="tx"><div class="t1">課題</div>
      <div class="t2">${s.items.length ? `未完了 ${s.items.length}件` : '未完了なし 🎉'}
      ${['over', 'today', 'soon'].filter((g) => s.cnt[g]).map((g) => `<span class="chip ${g}">${{ over: '期限切れ', today: '今日', soon: '明日' }[g]} ${s.cnt[g]}</span>`).join(' ')}</div>
      <div class="t3">${first ? `${urgent ? '⚠ ' : ''}${G.esc(s.remain(first))}：${G.esc(first.title)}` : (s.data ? '' : '読み込み中…')}</div></div><div class="go">›</div></div>`;
  }

  function menuTile(now) {
    const { daily } = G.campus.menuFor(now);
    return `<div class="card tile" onclick="G.go('campus')"><div class="ic">🍛</div><div class="tx"><div class="t1">今日の学食</div>
      <div class="t2" style="font-size:16px">${daily.length ? G.esc(daily.slice(0, 2).map((x) => x.name).join('／')) : 'メニュー未登録'}</div>
      <div class="t3">${daily.length > 2 ? `ほか${daily.length - 2}品・` : ''}空き教室もここから</div></div><div class="go">›</div></div>`;
  }

  function todayList(now, cs) {
    if (!cs.list.length) return '';
    const min = G.minOfDay(now);
    return `<div class="gh">今日の授業<a href="#class">時間割 ›</a></div><div class="card"><ul class="today-list">${cs.list.map((x) => `
      <li class="${min >= x.e ? 'past' : min >= x.s ? 'now' : ''}"><div class="p">${x.n}限<small>${G.fmtMin(x.s)}</small></div>
      <div class="n">${G.esc(x.c.name)}<small>${G.esc(where(x.c))}</small></div></li>`).join('')}</ul></div>`;
  }

  function render() {
    const now = new Date();
    const cs = G.classes.status(now);
    G.$('v-home').innerHTML = tripCard(now, cs) + hero(now, cs) + commuteTile(now, cs) + kadaiTile() + menuTile(now) + todayList(now, cs);
  }

  G.home = { leave };
  // 現在地ボタン（通学欄）
  G.$('v-home').addEventListener('click', (e) => G.commute.handleLoc(e, render));
  G.reg('home', { title: 'GOD Life', render, tick: 15 });
})();
