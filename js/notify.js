// 出発前の通知（ntfy の予約配信）。アプリを開いたときに、次に家（大学）を出る時刻の◯分前の通知を ntfy に予約する
// ウェブアプリは閉じていると自分で通知を出せないので、ntfy.sh に「この時刻に届けて」と頼む。送るのは通知の文だけ
(function () {
  const KEY = 'gl.ntfy', SENT = 'gl.ntfySent';
  const conf = () => G.load(KEY, { on: false, topic: '', lead: 10 });
  const saveConf = (c) => G.save(KEY, c);

  async function post(topic, title, msg, at) {
    const q = new URLSearchParams({ title, tags: 'train' });
    if (at) q.set('at', String(Math.floor(at / 1000)));
    // 本文はふつうの文字列で送る（ブラウザから送れる形）
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}?${q}`, { method: 'POST', body: msg });
    if (!r.ok) throw new Error('ntfy ' + r.status);
  }

  // これから先36時間の「家を出る」「大学を出る」を探す
  function upcoming(now) {
    const out = [];
    for (let k = 0; k <= 1; k++) {
      const D = new Date(now); D.setHours(0, 0, 0, 0); D.setDate(D.getDate() + k);
      const list = G.classes.dayList(D).filter((x) => !G.classes.isOnline(x.c));
      if (!list.length) continue;
      const first = list[0], last = list[list.length - 1];
      // 行き：1コマ目に間に合う電車
      const p1 = G.commute.arrivePlan('school', now, first.s, k, 'home');
      const o1 = p1.opts[0];
      if (o1) out.push({ kind: 'go', when: +D + o1.leave * 60e3, leave: o1.leave, day: G.ymd(D),
        title: 'GOD Life：家を出る時間', msg: `${G.fmtMin(o1.leave)} に家を出る\n${first.n}限 ${G.fmtMin(first.s)}（${first.c.name}）・${o1.legs[0][0]} ${o1.legs[0][1]}${G.commute.rainy() ? '・☔ バス' : ''}` });
      // 帰り：最後の授業が終わってから乗れる電車
      const end = new Date(D); end.setMinutes(last.e);
      const p2 = G.commute.nowPlan('home', end, 'univ');
      const o2 = p2.opts[0];
      if (o2 && !o2.tomorrow) out.push({ kind: 'back', when: +D + o2.leave * 60e3, leave: o2.leave, day: G.ymd(D),
        title: 'GOD Life：大学を出る時間', msg: `${G.fmtMin(o2.leave)} に大学を出る\n南柏 ${o2.legs[0][1]}・家に ${G.fmtMin(o2.arrive)} 着` });
    }
    return out;
  }

  // 予約（同じ出発は1回だけ。予約できるのは3日先まで）
  async function schedule() {
    const c = conf(); if (!c.on || !c.topic) return 0;
    const now = Date.now();
    const sent = G.load(SENT, {});
    Object.keys(sent).forEach((k) => { if (sent[k] < now - 864e5) delete sent[k]; });
    let n = 0;
    for (const u of upcoming(new Date())) {
      const at = u.when - c.lead * 60e3;
      const key = `${u.kind}:${u.day}:${u.leave}`;
      if (sent[key] || at < now + 60e3 || at > now + 36 * 3600e3) continue;
      try { await post(c.topic, u.title, `あと${c.lead}分：` + u.msg, at); sent[key] = at; n++; } catch (e) { break; }
    }
    G.save(SENT, sent);
    return n;
  }

  // 設定画面（メニューから）
  function open() {
    const c = conf();
    G.openEditor(`<h3>🔔 出発前の通知</h3>
      <p>アプリを開いたときに、次に家（大学）を出る時刻の少し前の通知を、無料の通知アプリ「ntfy」に予約します。アプリを閉じていても ntfy から届きます。</p>
      <label class="ocr-mode" style="color:var(--text);font-size:15px"><input type="checkbox" id="nfOn"${c.on ? ' checked' : ''}> 通知を使う</label>
      <label class="f">ntfy のトピック名（課題の通知と同じものでOK）</label><input id="nfTopic" value="${G.esc(c.topic)}" placeholder="例：reitaku-xxxx-8392" autocapitalize="off" autocomplete="off">
      <label class="f">何分前に知らせるか</label><select id="nfLead">${[5, 10, 15, 20, 30].map((m) => `<option value="${m}"${m === c.lead ? ' selected' : ''}>${m}分前</option>`).join('')}</select>
      <p>・トピック名はこの端末にだけ保存します。ntfy.sh に送るのは通知の文（出発時刻・授業名）だけです。<br>・予約したあとに時刻表の設定などを変えると、前の通知も届くことがあります。</p>
      <button class="btn pri full" id="nfSave">保存して予約する</button>
      <button class="btn full" id="nfTest">テスト通知を送る</button>
      <button class="btn full" id="nfClose">閉じる</button>`, (root) => {
      const q = (s) => root.querySelector(s);
      const read = () => ({ on: q('#nfOn').checked, topic: q('#nfTopic').value.trim(), lead: Number(q('#nfLead').value) });
      q('#nfSave').onclick = async () => {
        const n = read(); saveConf(n); G.closeEditor();
        if (!n.on) { G.toast('通知をオフにしました'); return; }
        if (!n.topic) { G.toast('トピック名を入れてください'); return; }
        const k = await schedule(); G.toast(k ? `${k}件の通知を予約しました` : '保存しました（予約する出発はまだありません）');
      };
      q('#nfTest').onclick = async () => {
        const n = read(); if (!n.topic) { G.toast('トピック名を入れてください'); return; }
        try { await post(n.topic, 'GOD Life', 'テスト通知です。届いていればOK'); G.toast('送りました。ntfy に届いたか確認してください'); }
        catch (e) { G.toast('送れませんでした（ネットにつながっているか確認してください）'); }
      };
      q('#nfClose').onclick = G.closeEditor;
    });
  }

  G.notify = { schedule, open, upcoming, conf };
})();
