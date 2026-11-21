// 朝の天気通知（Claude のスケジュール済みタスク）に、これから7日分の予定を渡す
// アプリを開いたとき、予定を合言葉で暗号化して GitHub の「sync」ブランチに保存する（中身は合言葉がないと読めない）
// トークンと合言葉はこの端末にだけ保存し、バックアップにも含めない
(function () {
  const KEY = 'gl.sync', LAST = 'gl.syncLast';
  const REPO = 'ZenithExtremers/godlife', BRANCH = 'sync', PATH = 'schedule.json';
  const API = `https://api.github.com/repos/${REPO}`;
  const conf = () => G.load(KEY, { on: false, token: '', pass: '' });
  const saveConf = (c) => G.save(KEY, c);

  /* ---- 渡す中身（今日から7日分） ---- */
  function build() {
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const k = G.ymd(d);
      const items = [];
      G.classes.dayList(d).forEach((x) => items.push({
        kind: '授業', start: G.fmtMin(x.s), end: G.fmtMin(x.e), title: `${x.n}限 ${x.c.name || ''}`.trim(),
        place: x.c.online ? 'オンライン' : (x.c.room || ''),
      }));
      try {
        G.calendar.mineOn(k).forEach((e) => items.push({
          kind: '予定', start: e.allDay ? '' : (e.start || ''), end: e.allDay ? '' : (e.end || ''), allDay: !!e.allDay, title: e.title || '', place: e.place || '',
        }));
        G.calendar.uniOn(k).forEach((e) => items.push({ kind: '大学', allDay: true, start: '', end: '', title: e.title || '', place: '' }));
      } catch (e) {}
      try {
        G.kadai.summary().items.filter((i) => i.due.slice(0, 10) === k)
          .forEach((i) => items.push({ kind: '締切', start: i.due.slice(11, 16), end: '', title: i.title || '', place: '' }));
      } catch (e) {}
      items.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      days.push({ date: k, wd: G.WD[d.getDay()], holiday: G.commute.HOLIDAYS.has(k), items });
    }
    return { v: 1, days };
  }

  /* ---- 暗号化（課題と同じ PBKDF2-SHA256 + AES-GCM） ---- */
  const b64 = (u) => { let s = ''; u.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s); };
  async function encrypt(obj, pass) {
    const iter = 200000, salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    return { v: 1, iter, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function hash(s) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
    return b64(h);
  }

  /* ---- GitHub に保存 ---- */
  async function gh(token, path, opt = {}) {
    const r = await fetch(API + path, {
      ...opt, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    });
    return r;
  }
  async function ensureBranch(token) {
    if ((await gh(token, `/git/ref/heads/${BRANCH}`)).ok) return;
    const m = await gh(token, '/git/ref/heads/main');
    if (!m.ok) throw new Error(m.status === 401 ? 'トークンが正しくありません' : `リポジトリを読めませんでした（${m.status}）`);
    const sha = (await m.json()).object.sha;
    const c = await gh(token, '/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }) });
    if (!c.ok && c.status !== 422) throw new Error(`同期用のブランチを作れませんでした（${c.status}）。トークンの権限（Contents：Read and write）を確認してください`);
  }
  async function upload(c, force) {
    const data = build();
    const h = await hash(JSON.stringify(data) + c.pass);
    const last = G.load(LAST, {});
    // 中身が同じで、前回から6時間以内なら送らない（日付が変わったら中身が変わるので送られる）
    if (!force && last.h === h && Date.now() - (last.at || 0) < 6 * 3600e3) return false;
    await ensureBranch(c.token);
    const cur = await gh(c.token, `/contents/${PATH}?ref=${BRANCH}`);
    const sha = cur.ok ? (await cur.json()).sha : undefined;
    const enc = await encrypt({ ...data, updated: new Date().toISOString() }, c.pass);
    const body = { message: '予定を同期', branch: BRANCH, content: btoa(JSON.stringify(enc)), ...(sha ? { sha } : {}) };
    const r = await gh(c.token, `/contents/${PATH}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status === 401 ? 'トークンが正しくありません' : r.status === 403 || r.status === 404 ? 'トークンに書き込みの権限がありません（Contents：Read and write）' : `保存できませんでした（${r.status}）`);
    G.save(LAST, { h, at: Date.now(), ok: new Date().toISOString() });
    return true;
  }
  // 開いたときに呼ぶ（失敗しても画面は止めない）
  async function auto() {
    const c = conf();
    if (!c.on || !c.token || !c.pass) return;
    try { await upload(c, false); } catch (e) { G.save(LAST, { ...G.load(LAST, {}), err: e.message }); }
  }

  /* ---- 設定画面 ---- */
  function newPass() {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(20));
    return [...r].map((x) => a[x % a.length]).join('').replace(/(.{5})(?!$)/g, '$1-');
  }
  function open() {
    const c = conf();
    if (!c.pass) c.pass = newPass();
    const last = G.load(LAST, {});
    const lastTxt = last.ok ? `最後に保存：${new Date(last.ok).toLocaleString('ja-JP')}` : 'まだ保存していません';
    const tokenUrl = 'https://github.com/settings/personal-access-tokens/new';
    G.openEditor(`<h3>☁ 朝の天気通知に予定を渡す</h3>
      <p>アプリを開くたびに、今日から7日分の授業・予定・締切を<b>暗号化して</b>GitHubに保存します。毎朝の天気通知（Claude）がそれを読んで、天気と一緒に予定を知らせます。</p>
      <p><b>1.</b> <a href="${tokenUrl}" target="_blank" rel="noopener">GitHubでトークンを作る ↗</a><br>Repository access：Only select repositories → <code>godlife</code><br>Permissions：Contents → <b>Read and write</b></p>
      <input id="syTok" type="password" autocomplete="off" placeholder="github_pat_..." value="${G.esc(c.token)}">
      <p><b>2.</b> 合言葉（自動で作りました）。これを Claude に送ってください。</p>
      <div class="row"><input id="syPass" value="${G.esc(c.pass)}" readonly><button class="btn" id="syCopy">コピー</button></div>
      <p class="muted">${G.esc(lastTxt)}${last.err ? '<br>前回のエラー：' + G.esc(last.err) : ''}</p>
      <button class="btn pri full" id="sySave">${c.on ? '保存して今すぐ同期' : 'オンにして今すぐ同期'}</button>
      ${c.on ? '<button class="btn danger full" id="syOff">オフにする</button>' : ''}
      <button class="btn full" id="syClose">閉じる</button>`, (r) => {
      r.querySelector('#syCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c.pass).then(() => G.toast('合言葉をコピーしました')); r.querySelector('#syPass').select(); };
      r.querySelector('#syClose').onclick = G.closeEditor;
      const off = r.querySelector('#syOff');
      if (off) off.onclick = () => { saveConf({ ...conf(), on: false }); G.closeEditor(); G.toast('予定の同期をオフにしました'); };
      r.querySelector('#sySave').onclick = async (ev) => {
        const token = r.querySelector('#syTok').value.trim();
        if (!token) { G.toast('トークンを入れてください'); return; }
        const nc = { on: true, token, pass: c.pass };
        ev.target.disabled = true; ev.target.textContent = '同期中…';
        try { await upload(nc, true); saveConf(nc); G.closeEditor(); G.toast('予定を保存しました'); }
        catch (e) { G.toast(e.message); ev.target.disabled = false; ev.target.textContent = 'もう一度試す'; }
      };
    });
  }

  G.sync = { open, auto };
})();
