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
  G.$('mInstall').onclick = () => { G.$('installHelp').hidden = false; };
  G.$('mLogout').onclick = () => { sheet.classList.remove('show'); G.kadai.logout(); G.go('kadai'); };

  // バックアップ（時間割・通学設定・教室の追記・完了印）。合言葉は含めない
  const BK = ['gl.classes', 'gl.classOpt', 'gl.commute', 'gl.roomsLocal', 'kadai-done'];
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

  // 起動
  G.kadai.init();
  G.commute.init();
  G.campus.init();
  show();
  clock();
  timer = setInterval(() => { tick(); clock(); }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    show(true);
    if (G.cur !== 'kadai') G.kadai.refresh();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
