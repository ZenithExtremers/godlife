// 出発前の通知（ntfy の予約配信）。アプリを開いたときに、次に家（大学）を出る時刻の◯分前の通知を ntfy に予約する
// ウェブアプリは閉じていると自分で通知を出せないので、ntfy.sh に「この時刻に届けて」と頼む。送るのは通知の文だけ
(function () {
  const KEY = 'gl.ntfy', SENT = 'gl.ntfySent';
  const conf = () => G.load(KEY, { on: false, topic: '', lead: 10 });
  const saveConf = (c) => G.save(KEY, c);

  // ntfy のトピック名に使えるのは半角英数字と - _ だけ（1〜64文字）
  const TOPIC_RE = /^[A-Za-z0-9_-]{1,64}$/;
  function topicError(t) {
    if (!t) return 'トピック名を入れてください';
    if (!TOPIC_RE.test(t)) return 'トピック名に使えるのは半角の英数字と「-」「_」だけです（日本語・空白・記号は使えません）';
    return '';
  }
  async function post(topic, title, msg, at) {
    // priority=high：Android の ntfy ではポップアップ（画面上部）で出る
    const q = new URLSearchParams({ title, tags: 'train', priority: 'high' });
    if (at) q.set('at', String(Math.floor(at / 1000)));
    // 本文はふつうの文字列で送る（ブラウザから送れる形）
    let r;
    try { r = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}?${q}`, { method: 'POST', body: msg }); }
    catch (e) { throw new Error('ntfy.sh につながりませんでした（電波・機内モード・広告ブロックなどを確認）'); }
    if (!r.ok) {
      let why = ''; try { why = (await r.json()).error || ''; } catch (e) {}
      throw new Error(`ntfy がエラーを返しました（${r.status}${why ? '：' + why : ''}）`);
    }
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
    // 部活など（予定の行き先がマイ駅）の行き
    for (let k = 0; k <= 1; k++) {
      const D = new Date(now); D.setHours(0, 0, 0, 0); D.setDate(D.getDate() + k);
      const day = G.ymd(D);
      for (const e of G.calendar.mineOn(day)) {
        const p = G.calendar.destPlans(e, day), o = p && p.go && p.go.main; if (!o) continue;
        out.push({ kind: 'dest-' + e.id, when: +D + o.leave * 60e3, leave: o.leave, day,
          title: 'GOD Life：家を出る時間', msg: `${G.fmtMin(o.leave)} に家を出る\n${e.title} ${e.start}（${G.commute.stName(p.st)}駅）・${G.commute.placeName(p.st)} ${G.fmtMin(o.arrive)} 着` });
      }
    }
    return out;
  }

  // 予約（同じ出発は1回だけ。予約できるのは3日先まで）
  async function schedule() {
    const c = conf(); if (!c.on || topicError(topic())) return 0;
    const now = Date.now();
    const sent = G.load(SENT, {});
    Object.keys(sent).forEach((k) => { if (sent[k] < now - 864e5) delete sent[k]; });
    let n = 0;
    for (const u of upcoming(new Date())) {
      const at = u.when - c.lead * 60e3;
      const key = `${u.kind}:${u.day}:${u.leave}`;
      if (sent[key] || at < now + 60e3 || at > now + 36 * 3600e3) continue;
      try { await post(topic(), u.title, `あと${c.lead}分：` + u.msg, at); sent[key] = at; n++; } catch (e) { break; }
    }
    G.save(SENT, sent);
    return n;
  }

  // 通知先：GitHub の NTFY_TOPIC（課題データと一緒に暗号化して届く）。届く前は、前にこの端末で入れたもの
  const topic = () => (G.kadai.topic && G.kadai.topic()) || conf().topic || '';
  const NO_TOPIC = '通知先がまだ届いていません。課題タブで合言葉を入れたあと、次の課題の更新を待ってください';

  // 設定画面（メニューから）
  function open() {
    const c = conf();
    G.openEditor(`<h3>🔔 出発前の通知</h3>
      <p>アプリを開いたときに、次に家（大学）を出る時刻の少し前の通知を ntfy に予約します。アプリを閉じていても届きます。</p>
      <label class="ocr-mode" style="color:var(--text);font-size:15px"><input type="checkbox" id="nfOn"${c.on ? ' checked' : ''}> 出発前の通知を予約する</label>
      <label class="f">何分前に知らせるか</label><select id="nfLead">${[5, 10, 15, 20, 30].map((m) => `<option value="${m}"${m === c.lead ? ' selected' : ''}>${m}分前</option>`).join('')}</select>
      <button class="btn pri full" id="nfSave">保存して予約する</button>
      <button class="btn full" id="nfTest">テスト通知を送る</button>
      <button class="btn full" id="nfClose">閉じる</button>`, (root) => {
      const q = (s) => root.querySelector(s);
      const read = () => ({ ...conf(), on: q('#nfOn').checked, lead: Number(q('#nfLead').value) });
      q('#nfSave').onclick = async () => {
        const n = read(); saveConf(n); G.closeEditor();
        if (!n.on) { G.toast('通知をオフにしました'); return; }
        if (topicError(topic())) { G.toast(NO_TOPIC); return; }
        const k = await schedule(); G.toast(k ? `${k}件の通知を予約しました` : '保存しました（予約する出発はまだありません）');
      };
      q('#nfTest').onclick = async () => {
        if (topicError(topic())) { G.toast(NO_TOPIC); return; }
        G.toast('送っています…');
        try { await post(topic(), 'GOD Life', 'テスト通知です。届いていればOK'); G.toast('送りました。ntfy に届いたか確認してください'); }
        catch (e) { G.toast('送れませんでした：' + e.message); }
      };
      q('#nfClose').onclick = G.closeEditor;
    });
  }

  G.notify = { schedule, open, upcoming, conf, post, topic }; // ほかの通知を足すときも post(topic(), …) を使う
})();
