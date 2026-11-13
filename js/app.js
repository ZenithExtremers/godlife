// 画面の切り替え・定期更新・メニュー
(function () {
  const TABS = ['home', 'class', 'kadai', 'commute', 'campus'];
  let timer = null, last = 0;

  function show(keepScroll) {
    const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    G.cur = tab;
    TABS.forEach((t) => G.$('v-' + t).classList.toggle('on', t === tab));
    document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const m = G.mods[tab];
    G.$('title').textContent = m.title;
    m.render();
    m.onShow && m.onShow();
    if (keepScroll !== true) window.scrollTo(0, 0);
    last = Date.now();
  }

  // 表示中の画面だけ、決まった間隔で描き直す
  function tick() {
    const m = G.mods[G.cur]; if (!m || !m.tick || document.hidden) return;
    if (m.skipTick && m.skipTick()) return;
    if (Date.now() - last >= m.tick * 1000 - 50) { m.render(); last = Date.now(); }
  }
  function clock() {
    const d = new Date();
    G.$('hsub').textContent = `${d.getMonth() + 1}/${d.getDate()}(${G.WD[d.getDay()]}) ${d.getHours()}:${G.pad(d.getMinutes())}`;
  }

  document.querySelectorAll('#tabbar button').forEach((b) => { b.onclick = () => G.go(b.dataset.tab); });
  window.addEventListener('hashchange', show);

  // メニュー
  const sheet = G.$('sheet');
  G.$('menuBtn').onclick = () => sheet.classList.add('show');
  G.$('mClose').onclick = () => sheet.classList.remove('show');
  sheet.onclick = (e) => { if (e.target === sheet) sheet.classList.remove('show'); };
  G.$('editor').onclick = (e) => { if (e.target.id === 'editor') G.closeEditor(); };
  // 表示の明るさ（自動＝スマホの設定に合わせる）
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#123e50' : '#1f5f7a');
    document.querySelectorAll('#mTheme button').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === (t || 'auto')));
  }
  applyTheme(G.load('gl.theme', 'auto'));
  G.$('mTheme').onclick = (e) => {
    const b = e.target.closest('[data-theme-set]'); if (!b) return;
    G.save('gl.theme', b.dataset.themeSet); applyTheme(b.dataset.themeSet);
  };
  G.$('mInstall').onclick = () => { G.$('installHelp').hidden = false; };
  G.$('mLogout').onclick = () => { sheet.classList.remove('show'); G.kadai.logout(); G.go('kadai'); };

  // バックアップ（時間割・通学設定・教室の追記・完了印）。合言葉は含めない
  const BK = ['gl.classes', 'gl.classOpt', 'gl.commute', 'gl.roomsLocal', 'kadai-done', 'gl.theme', 'gl.placePos', 'gl.events', 'gl.ntfy', 'gl.glance'];
  G.$('mBackup').onclick = () => {
    const o = {}; BK.forEach((k) => { const v = G.raw(k); if (v != null) o[k] = v; });
    const txt = 'GODLIFE1:' + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
    sheet.classList.remove('show');
    G.openEditor(`<h3>バックアップ</h3><p>この文字列をメモ帳などに保存しておき、機種変更のときに「バックアップから戻す」に貼り付けてください。</p>
      <textarea rows="6" readonly id="bkTxt">${txt}</textarea><button class="btn pri full" id="bkCopy">コピー</button><button class="btn full" id="bkClose">閉じる</button>`, (r) => {
      r.querySelector('#bkCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(txt).then(() => G.toast('コピーしました')); r.querySelector('#bkTxt').select(); };
      r.querySelector('#bkClose').onclick = G.closeEditor;
    });
  };
  G.$('mRestore').onclick = () => {
    sheet.classList.remove('show');
    G.openEditor(`<h3>バックアップから戻す</h3><p>今の時間割などは上書きされます。</p><textarea rows="6" id="rsTxt" placeholder="GODLIFE1:..."></textarea>
      <button class="btn pri full" id="rsGo">戻す</button><button class="btn full" id="rsClose">閉じる</button>`, (r) => {
      r.querySelector('#rsGo').onclick = () => {
        try {
          const s = r.querySelector('#rsTxt').value.trim();
          if (!s.startsWith('GODLIFE1:')) throw 0;
          const o = JSON.parse(decodeURIComponent(escape(atob(s.slice(9)))));
          Object.keys(o).filter((k) => BK.includes(k)).forEach((k) => G.raw(k, o[k]));
          location.reload();
        } catch (e) { G.toast('読み込めませんでした。コピーした文字列をそのまま貼り付けてください'); }
      };
      r.querySelector('#rsClose').onclick = G.closeEditor;
    });
  };

  // 開いたときに現在地を自動で取る（メニューでオン／オフ）
  const rerender = () => { const m = G.mods[G.cur]; if (m && (G.cur === 'home' || G.cur === 'commute')) m.render(); };
  function paintGps() { G.$('mGps').textContent = `📍 開いたときに現在地を取得：${G.commute.autoOn() ? 'オン' : 'オフ'}`; }
  G.$('mGps').onclick = () => { G.save('gl.autoGps', !G.commute.autoOn()); paintGps(); if (G.commute.autoOn()) G.commute.autoLocate(rerender); };
  paintGps();
  G.$('mNotify').onclick = () => { G.$('sheet').classList.remove('show'); G.notify.open(); };
  // 天気と通知の予約（開いたとき・画面に戻ったとき）
  const refreshExtra = () => {
    // 雨モードが天気で変わるので、通知の予約は天気を読んでから
    G.weather.load().then(() => { if (G.cur === 'home' || G.cur === 'commute') G.mods[G.cur].render(); })
      .finally(() => G.notify.schedule().catch(() => {}));
  };
  // シンプル表示（開いた瞬間に「あと何分で出るか」を大きく）
  const glanceOn = () => G.load('gl.glance', true) !== false;
  let glTimer = null;
  function paintGlance() {
    const g = G.home.glance();
    G.$('glLabel').textContent = g.label; G.$('glBig').textContent = g.big; G.$('glMain').textContent = g.main; G.$('glSub').textContent = g.sub;
    const w = G.weather.probIn(0, G.ymd(new Date()), new Date().getHours(), 23);
    G.$('glWx').textContent = w == null ? '' : `☂ 家の周り ${w}%（これから）${G.commute.rainy() ? '・雨モード' : ''}`;
  }
  // 大学にまだ行っていない日だけ：今日は対面授業があり、1コマ目の前で、家（または自動）にいて、まだ家を出ていない
  function glanceToday() {
    const now = new Date(), cs = G.classes.status(now), loc = G.commute.getLoc();
    if (!cs.first || G.minOfDay(now) >= cs.first.s) return false;
    if (loc && loc !== 'home') return false;
    return !G.commute.trip(now) && !G.commute.wentToday();
  }
  function openGlance() {
    if (!glanceOn() || !glanceToday()) return;
    paintGlance(); G.$('glance').hidden = false;
    clearInterval(glTimer); glTimer = setInterval(paintGlance, 15000);
  }
  G.$('glance').onclick = () => { G.$('glance').hidden = true; clearInterval(glTimer); };
  const paintGl = () => { G.$('mGlance').textContent = `⚡ シンプル表示（大学に行く日の出発前）：${glanceOn() ? 'オン' : 'オフ'}`; };
  G.$('mGlance').onclick = () => { G.save('gl.glance', !glanceOn()); paintGl(); };
  paintGl();
  G.$('mVer').textContent = `GOD Life バージョン ${G.VERSION}`;

  // 起動
  G.kadai.init();
  G.commute.init();
  G.campus.init();
  show();
  clock();
  timer = setInterval(() => { tick(); clock(); }, 1000);
  G.commute.autoLocate(rerender);
  refreshExtra();
  openGlance();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    show(true);
    G.commute.autoLocate(() => { rerender(); if (!G.$('glance').hidden) paintGlance(); });
    refreshExtra();
    openGlance();
    if (G.cur !== 'kadai') G.kadai.refresh();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
