// ホーム：今日の授業・家を出る時刻・課題・学食をひと目で
(function () {
  const pfx = (s) => `${s.n}限 ${G.fmtMin(s.s)}`;
  const hhmm = (m) => `${G.pad(Math.floor(m / 60))}:${G.pad(m % 60)}`;

  function hero(now, cs) {
    const min = G.minOfDay(now);
    if (cs.cur) {
      const x = cs.cur, pct = Math.min(100, ((min - x.s) / (x.e - x.s)) * 100);
      return `<div class="card hero"><div class="label">授業中・${x.n}限（${G.fmtMin(x.s)}–${G.fmtMin(x.e)}）</div>
        <div class="big">${G.esc(x.c.name)}</div><div class="meta">${G.esc([x.c.room, x.c.teacher].filter(Boolean).join('・'))}　あと${G.dur(x.e - min)}で終わり</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        ${cs.next ? `<div class="meta" style="margin-top:8px">次：${pfx(cs.next)} ${G.esc(cs.next.c.name)}${cs.next.c.room ? '（' + G.esc(cs.next.c.room) + '）' : ''}</div>` : ''}</div>`;
    }
    if (cs.next) {
      const x = cs.next;
      return `<div class="card hero"><div class="label">次の授業・あと${G.dur(x.s - min)}</div>
        <div class="big">${pfx(x)}　${G.esc(x.c.name)}</div><div class="meta">${G.esc([x.c.room, x.c.teacher].filter(Boolean).join('・')) || '教室未登録'}${x.c.memo ? '　📌' + G.esc(x.c.memo) : ''}</div></div>`;
    }
    const tm = new Date(now); tm.setDate(tm.getDate() + 1);
    const tl = G.classes.dayList(tm);
    const anyClass = Object.keys(G.classes.all()).length;
    return `<div class="card hero"><div class="label">${G.WD[now.getDay()]}曜日</div>
      <div class="big">${cs.list.length ? '今日の授業は終わり 🎉' : anyClass ? '今日は授業なし' : 'ようこそ GOD Life へ'}</div>
      <div class="meta">${anyClass ? (tl.length ? `明日は ${pfx(tl[0])} ${G.esc(tl[0].c.name)} から（${tl.length}コマ）` : '明日も授業なし') : '「時間割」タブで授業を登録すると、ここに次の授業と家を出る時刻が出ます'}</div></div>`;
  }

  function commuteTile(now, cs) {
    const min = G.minOfDay(now);
    let line1, line2, line3, go;
    if (cs.first && min < cs.first.s) {
      // まだ1コマ目の前 → 1コマ目に間に合う電車
      const plan = G.commute.arrivePlan('school', now, cs.first.s);
      const o = plan.opts[0];
      line1 = `${pfx(cs.first)} に間に合うには`;
      if (o) {
        const left = o.leave - plan.nowAbs;
        line2 = `${G.fmtMin(o.leave)} までに家を出る`;
        line3 = left < 0 ? '⚠ もう間に合いません（大学にいるなら問題なし）' : `あと${G.dur(left)}・大学着 ${G.fmtMin(o.arrive)}`;
      } else { line2 = '間に合う電車がありません'; line3 = ''; }
      go = `G.commute.open('school','arrive','${hhmm(cs.first.s)}')`;
    } else {
      // 授業中・授業後・授業なし → 帰り
      const after = cs.last && min < cs.last.e ? cs.last.e : null;
      const base = after ? new Date(new Date(now).setHours(0, after, 0, 0)) : now;
      const plan = G.commute.nowPlan('home', base);
      const o = plan.opts[0];
      line1 = after ? `授業後（${G.fmtMin(after)} 終了）の帰り` : '今から帰るなら';
      if (o) {
        line2 = `${o.tomorrow ? '明日 ' : ''}${G.fmtMin(o.leave)} に大学を出る`;
        line3 = after ? `家に ${G.fmtMin(o.arrive)} 着` : `あと${G.dur(o.leave - plan.nowAbs)}・家に ${G.fmtMin(o.arrive)} 着`;
      } else { line2 = '候補がありません'; line3 = ''; }
      go = `G.commute.open('home','now')`;
    }
    return `<div class="card tile" onclick="${go}"><div class="ic">🚃</div><div class="tx"><div class="t1">${line1}</div><div class="t2">${line2}</div><div class="t3">${line3}</div></div><div class="go">›</div></div>`;
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
      <div class="n">${G.esc(x.c.name)}<small>${G.esc([x.c.room, x.c.teacher].filter(Boolean).join('・'))}</small></div></li>`).join('')}</ul></div>`;
  }

  function render() {
    const now = new Date();
    const cs = G.classes.status(now);
    G.$('v-home').innerHTML = hero(now, cs) + commuteTile(now, cs) + kadaiTile() + menuTile(now) + todayList(now, cs);
  }

  G.reg('home', { title: 'GOD Life', render, tick: 30 });
})();
