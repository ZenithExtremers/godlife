// 時間割（この端末に保存）
(function () {
  const KEY = 'gl.classes';
  const OPT = 'gl.classOpt';
  const COLORS = ['#1f5f7a', '#2e7d32', '#c62828', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#5d4037', '#455a64'];
  const DAYS = [1, 2, 3, 4, 5, 6]; // 月〜土

  const all = () => G.load(KEY, {});
  const get = (d, p) => all()[`${d}-${p}`] || null;
  function put(d, p, c) {
    const a = all();
    if (c) a[`${d}-${p}`] = c; else delete a[`${d}-${p}`];
    G.save(KEY, a);
  }
  const opt = () => G.load(OPT, { sat: null });
  const showSat = () => {
    const o = opt();
    if (o.sat !== null) return o.sat;
    return Object.keys(all()).some((k) => k.startsWith('6-'));
  };

  // その日の授業（ホームや通学から使う）
  function dayList(date) {
    const d = date.getDay();
    return G.PERIODS.map((p) => ({ ...p, c: get(d, p.n) })).filter((x) => x.c);
  }
  // 今の授業と次の授業
  function status(now) {
    const min = G.minOfDay(now);
    const list = dayList(now);
    const cur = list.find((x) => min >= x.s && min < x.e) || null;
    const next = list.find((x) => x.s > min) || null;
    return { list, cur, next, first: list[0] || null, last: list[list.length - 1] || null };
  }

  function render() {
    const v = G.$('v-class');
    const now = new Date();
    const today = now.getDay();
    const min = G.minOfDay(now);
    const days = DAYS.filter((d) => d !== 6 || showSat());
    const a = all();
    let h = `<div class="tt" style="grid-template-columns:34px repeat(${days.length},1fr)"><div></div>`;
    h += days.map((d) => `<div class="hd${d === today ? ' today' : ''}">${G.WD[d]}</div>`).join('');
    for (const p of G.PERIODS) {
      h += `<div class="pd">${p.n}<small>${G.fmtMin(p.s)}</small></div>`;
      for (const d of days) {
        const c = a[`${d}-${p.n}`];
        const isNow = d === today && min >= p.s && min < p.e;
        h += c
          ? `<button class="c has${isNow ? ' now' : ''}" style="background:${G.esc(c.color || COLORS[0])}" data-d="${d}" data-p="${p.n}"><b>${G.esc(c.name)}</b><small>${G.esc(c.room || '')}</small></button>`
          : `<button class="c${isNow ? ' now' : ''}" data-d="${d}" data-p="${p.n}" aria-label="${G.WD[d]}${p.n}限を追加"></button>`;
      }
    }
    h += '</div>';
    h += `<p class="muted">マスをタップして授業を登録します。時限：${G.PERIODS.map((p) => `${p.n}限 ${G.fmtMin(p.s)}–${G.fmtMin(p.e)}`).join('／')}</p>`;
    h += '<p class="muted">教室名を「空き教室」の書き方とそろえると、自分の授業の教室に印が付きます。</p>';
    h += `<button class="btn" id="ttSat">${showSat() ? '土曜を隠す' : '土曜も表示'}</button>`;
    v.innerHTML = h;
    v.querySelector('.tt').onclick = (e) => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      edit(Number(b.dataset.d), Number(b.dataset.p));
    };
    G.$('ttSat').onclick = () => { const o = opt(); o.sat = !showSat(); G.save(OPT, o); render(); };
  }

  function edit(d, p) {
    const c = get(d, p) || {};
    const per = G.PERIODS.find((x) => x.n === p);
    // 同じ名前の授業を候補に（部屋や色を使い回せる）
    const names = [...new Set(Object.values(all()).map((x) => x.name))];
    let color = c.color || COLORS[(Object.keys(all()).length) % COLORS.length];
    G.openEditor(`
      <h3>${G.WD[d]}曜 ${p}限 <span class="muted">${G.fmtMin(per.s)}–${G.fmtMin(per.e)}</span></h3>
      <label class="f">授業名</label><input id="eName" list="eNames" value="${G.esc(c.name || '')}" placeholder="例：経済学入門">
      <datalist id="eNames">${names.map((n) => `<option value="${G.esc(n)}">`).join('')}</datalist>
      <div class="row2"><div><label class="f">教室</label><input id="eRoom" value="${G.esc(c.room || '')}" placeholder="例：か-301"></div>
      <div><label class="f">先生</label><input id="eTeacher" value="${G.esc(c.teacher || '')}"></div></div>
      <label class="f">色</label><div class="colors" id="eColors">${COLORS.map((x) => `<button style="background:${x}" data-c="${x}" class="${x === color ? 'on' : ''}" aria-label="色"></button>`).join('')}</div>
      <label class="f">メモ</label><input id="eMemo" value="${G.esc(c.memo || '')}" placeholder="例：教科書持参">
      <button class="btn pri full" id="eSave">保存</button>
      ${c.name ? '<button class="btn danger full" id="eDel">この授業を消す</button>' : ''}
      <button class="btn full" id="eCancel">閉じる</button>`, (root) => {
      const nm = root.querySelector('#eName');
      nm.oninput = () => { // 既存の授業名を選んだら部屋・先生・色を引き継ぐ
        const same = Object.values(all()).find((x) => x.name === nm.value);
        if (same) {
          root.querySelector('#eRoom').value ||= same.room || '';
          root.querySelector('#eTeacher').value ||= same.teacher || '';
          color = same.color || color; paint();
        }
      };
      const paint = () => root.querySelectorAll('#eColors button').forEach((b) => b.classList.toggle('on', b.dataset.c === color));
      root.querySelector('#eColors').onclick = (e) => { const b = e.target.closest('[data-c]'); if (b) { color = b.dataset.c; paint(); } };
      root.querySelector('#eSave').onclick = () => {
        const name = nm.value.trim();
        if (!name) { put(d, p, null); } else {
          put(d, p, { name, room: root.querySelector('#eRoom').value.trim(), teacher: root.querySelector('#eTeacher').value.trim(), memo: root.querySelector('#eMemo').value.trim(), color });
        }
        G.closeEditor(); render();
      };
      const del = root.querySelector('#eDel');
      if (del) del.onclick = () => { const old = get(d, p); put(d, p, null); G.closeEditor(); render(); G.toast('消しました：' + old.name, () => { put(d, p, old); render(); }); };
      root.querySelector('#eCancel').onclick = G.closeEditor;
      if (!c.name) nm.focus();
    });
  }

  G.classes = { all, get, dayList, status, KEY };
  G.reg('class', { title: '時間割', render, tick: null });
})();
