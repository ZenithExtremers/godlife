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
    let h = `<button class="btn pri full" id="ttOcr" style="margin:4px 0 6px">📷 スクショから時間割を読み込む</button><input type="file" id="ttFile" accept="image/*" hidden>`;
    h += `<div class="tt" style="grid-template-columns:34px repeat(${days.length},1fr)"><div></div>`;
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
    G.$('ttOcr').onclick = () => G.$('ttFile').click();
    G.$('ttFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importShot(f); };
  }

  /* ---- スクショから読み込む ---- */
  async function importShot(file) {
    G.openEditor('<h3>スクショを読み取り中</h3><p id="ocrMsg">準備しています…</p><p class="muted">画像はこの端末の中だけで読み取ります（どこにも送りません）。</p>');
    let r;
    try { r = await G.ocr.run(file, (m) => { const el = G.$('ocrMsg'); if (el) el.textContent = m; }); }
    catch (e) {
      G.openEditor(`<h3>読み取れませんでした</h3><p>${G.esc(e.message || e)}</p><button class="btn full" id="oClose">閉じる</button>`, (root) => { root.querySelector('#oClose').onclick = G.closeEditor; });
      return;
    }
    review(r);
  }

  // 読み取った結果を確認・修正してから保存する
  function review(r) {
    const rows = r.entries.map((e) => ({ ...e, on: true }));
    const dayOpt = (d) => DAYS.map((x) => `<option value="${x}"${x === d ? ' selected' : ''}>${G.WD[x]}</option>`).join('');
    const perOpt = (p) => G.PERIODS.map((x) => `<option value="${x.n}"${x.n === p ? ' selected' : ''}>${x.n}限</option>`).join('');
    const rowHtml = (e, i) => `<div class="ocr-row" data-i="${i}">
        <label class="ocr-on"><input type="checkbox" data-f="on"${e.on ? ' checked' : ''}></label>
        <div class="ocr-f"><div class="sel"><select data-f="d">${dayOpt(e.d)}</select><select data-f="p">${perOpt(e.p)}</select></div>
        <input data-f="name" value="${G.esc(e.name)}" placeholder="授業名">
        <div class="row2"><input data-f="room" value="${G.esc(e.room)}" placeholder="教室"><input data-f="teacher" value="${G.esc(e.teacher)}" placeholder="先生"></div></div></div>`;
    const has = Object.keys(all()).length;
    G.openEditor(`<h3>読み取り結果（${rows.length}コマ）</h3>
      ${rows.length ? `<p>まちがっているところを直して、いらない行はチェックを外してください。${r.guessedRows ? '<br><b>⚠ 時限の数字が読み取れなかったので、位置から推測しています。時限をよく確認してください。</b>' : ''}</p>`
        : '<p>授業を見つけられませんでした。曜日（月〜金）と時限の数字が写るように撮り直すか、マスをタップして手で入れてください。</p>'}
      <div id="ocrRows">${rows.map(rowHtml).join('')}</div>
      <button class="btn full" id="oAdd">＋ 行を足す</button>
      ${has ? `<label class="ocr-mode"><input type="checkbox" id="oReplace"> 今の時間割を全部消してから入れる（チェックなしなら同じマスだけ上書き）</label>` : ''}
      <button class="btn pri full" id="oSave">時間割に入れる</button>
      <button class="btn full" id="oCancel">やめる</button>`, (root) => {
      const box = root.querySelector('#ocrRows');
      const upd = (e) => {
        const el = e.target, f = el.dataset.f; if (!f) return;
        const i = Number(el.closest('[data-i]').dataset.i);
        rows[i][f] = f === 'on' ? el.checked : (f === 'd' || f === 'p') ? Number(el.value) : el.value;
      };
      box.addEventListener('input', upd);
      box.addEventListener('change', upd);
      root.querySelector('#oAdd').onclick = () => {
        rows.push({ d: 1, p: 1, name: '', room: '', teacher: '', on: true });
        box.insertAdjacentHTML('beforeend', rowHtml(rows[rows.length - 1], rows.length - 1));
      };
      root.querySelector('#oSave').onclick = () => {
        const use = rows.filter((e) => e.on && e.name.trim());
        const rep = root.querySelector('#oReplace');
        const a = rep && rep.checked ? {} : all();
        const before = JSON.stringify(all());
        // 同じ授業名には同じ色を付ける
        const colorOf = {};
        Object.values(a).forEach((c) => { colorOf[c.name] = c.color; });
        let k = Object.keys(colorOf).length;
        for (const e of use) {
          const name = e.name.trim();
          if (!colorOf[name]) colorOf[name] = COLORS[k++ % COLORS.length];
          a[`${e.d}-${e.p}`] = { name, room: e.room.trim(), teacher: e.teacher.trim(), memo: '', color: colorOf[name] };
        }
        G.save(KEY, a);
        G.closeEditor(); render();
        G.toast(`${use.length}コマを入れました`, () => { G.raw(KEY, before); render(); });
      };
      root.querySelector('#oCancel').onclick = G.closeEditor;
    });
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
