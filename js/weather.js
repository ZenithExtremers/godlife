// 天気（Open-Meteo・無料／APIキー不要）。荒川沖（家の周り）と柏（大学の周り）の2か所
// 送るのは駅の位置だけ（GPS の位置は送らない）。30分はこの端末に保存したものを使う
(function () {
  const PTS = [
    { k: 'ara', name: '荒川沖（家）', lat: 36.0306, lng: 140.1742 },
    { k: 'kashiwa', name: '柏（大学）', lat: 35.8623, lng: 139.9710 },
  ];
  const KEY = 'gl.weather';
  const RAIN = 50; // 降水確率がこれ以上なら「雨」
  let busy = false;

  const icon = (c) => (c == null ? '❔' : c === 0 ? '☀️' : c <= 2 ? '🌤' : c === 3 ? '☁️' : c <= 48 ? '🌫' : c <= 67 ? '🌧' : c <= 77 ? '🌨' : c <= 82 ? '🌦' : '⛈');
  const cached = () => G.load(KEY, null);

  async function load(force) {
    const c = cached();
    if (!force && c && Date.now() - c.t < 30 * 60e3) return c.data;
    if (busy) return c && c.data; busy = true;
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + PTS.map((p) => p.lat).join(',') + '&longitude=' + PTS.map((p) => p.lng).join(',') +
        '&hourly=precipitation_probability,weather_code,temperature_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=2';
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      let j = await r.json();
      if (!Array.isArray(j)) j = [j];
      G.save(KEY, { t: Date.now(), data: j });
      return j;
    } catch (e) { return c && c.data; } finally { busy = false; }
  }

  // ある地点・ある日の、時間帯（h1〜h2時）の最大降水確率
  function probIn(i, day, h1, h2) {
    const d = (cached() || {}).data; if (!d || !d[i]) return null;
    const H = d[i].hourly; let m = null;
    H.time.forEach((t, k) => { if (t.slice(0, 10) === day) { const h = Number(t.slice(11, 13)); if (h >= h1 && h <= h2 && H.precipitation_probability[k] != null) m = Math.max(m || 0, H.precipitation_probability[k]); } });
    return m;
  }
  // 今日、家の周り（自転車の区間）で6〜22時に雨が降りそうか
  function rainToday() {
    const p = probIn(0, G.ymd(new Date()), 6, 22);
    return p != null && p >= RAIN;
  }

  // ホームのカード
  function card() {
    const d = (cached() || {}).data;
    if (!d) return '';
    const day = G.ymd(new Date());
    const cols = PTS.map((p, i) => {
      const D = d[i] && d[i].daily; if (!D) return '';
      const k = D.time.indexOf(day); if (k < 0) return '';
      return `<div class="wx-c"><div class="t1">${p.name}</div><div class="wx-i">${icon(D.weather_code[k])}</div>
        <div><b>${Math.round(D.temperature_2m_max[k])}°</b> / ${Math.round(D.temperature_2m_min[k])}°</div>
        <div class="t3">朝 ${fmtP(probIn(i, day, 6, 9))}・夕 ${fmtP(probIn(i, day, 16, 20))}</div></div>`;
    }).join('');
    const rain = rainToday();
    const mode = G.commute.rainMode();
    const note = rain && mode === 'auto' ? `<div class="wx-note">☔ 家の周りで雨の予報なので、荒川沖 ⇄ 家はバスで計算しています</div>`
      : mode === 'on' ? '<div class="wx-note">☔ 雨モード（荒川沖 ⇄ 家はバス）</div>' : '';
    return `<div class="gh">今日の天気<a href="#commute">雨モード ›</a></div><div class="card"><div class="wx">${cols}</div>${note}</div>`;
  }
  const fmtP = (p) => (p == null ? '-' : `<span class="${p >= RAIN ? 'late' : ''}">☂${p}%</span>`);

  G.weather = { load, rainToday, card, probIn };
})();
