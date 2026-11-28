# GOD Life 引き継ぎメモ（v1.28.0 / 2026-11-28）

## 概要
- 麗澤大学の大学生活まとめ PWA。ReiMind（課題）と LASTCALL（通学）を統合し、機能を足してきた
- リポジトリ：ZenithExtremers/godlife（公開は `main` → GitHub Actions → GitHub Pages）
- 公開URL：https://zenithextremers.github.io/godlife/
- ビルドなし。素の HTML / CSS / JS。データは基本すべて端末の localStorage（キーは `gl.*`、課題は `kadai-*`）
- 利用者は Android（Pixel 系）。ホーム画面に追加して使っている。回答は日本語・やさしい言葉で

## 更新するときのルール
- `js/core.js` の `G.VERSION` と `sw.js` の `VERSION`（`godlife-x.y.z`）をそろえて上げる。上げないとスマホに反映されにくい
- 更新のたびにバージョンをユーザーに伝える
- push 前に `git fetch origin` して `main` の最新を取り込む（別のセッションが `main` に入れることがある。例：1.24.0 の sync.js）
- 公開の Actions が GitHub 側の一時エラー（"Deployment failed" / artifact が見つからない）で落ちることがある → 「同じ実行の再実行」ではなく、workflow_dispatch で新しく実行する
- 手元の確認は Playwright（`clock.setFixedTime` で時刻を固定、Open-Meteo・ntfy・raw.githubusercontent は `route` で差し替え）

## ファイル
| ファイル | 中身 |
|---|---|
| index.html / css/app.css / sw.js / manifest.json | 骨組み・見た目・オフライン |
| js/core.js | 共通（保存、時限、トースト、シート）、バージョン |
| js/classes.js | 時間割（月〜土×1〜5限、オンライン授業の印） |
| js/ocr.js | スクショから時間割を読む（Tesseract.js を CDN から） |
| js/kadai.js | 課題（暗号化された kadai.json を合言葉で開く。完了のつけまちがいは未完了に戻す） |
| js/commute.js | 通学の計算（荒川沖⇄柏⇄南柏、雨の日のバス、特例、現在地・GPS、車内、移動中カード、マイ駅＝部活などの行き先） |
| js/campus.js | 学食メニュー・空き教室（data/menu.json・rooms.json。中身はまだ空） |
| js/calendar.js | カレンダー（月／1日の予定／時間割／週＝ふりかえり）、予定の編集、行き先（マイ駅）、まちあわせへのリンク |
| js/life.js | シフト・持ち物・ふりかえり・SubPal 読み取り・起きる時刻・常磐線の運行情報の表示 |
| js/weather.js | 天気（Open-Meteo、荒川沖と柏） |
| js/notify.js | ntfy の予約通知（出発前・明日の持ち物・起きる時刻・ふりかえり） |
| js/sync.js | 別セッションで作ったもの（朝の天気通知用に予定を暗号化して sync ブランチへ） |
| js/home.js | ホーム（上の1行ウィジェット、移動中カード、通学欄、各カード）、シンプル表示の中身 |
| js/app.js | タブ切り替え、メニュー、シンプル表示、バックアップ |
| data/trains.js | 南柏・柏・荒川沖の時刻表（LASTCALL から） |
| data/bus.js | 雨の日のバス（並木大橋→荒川沖駅西口、平日4本。帰りはまだ） |
| scraper/reitaku_kadai.py | 課題取得（ReiMind から。Actions の deploy.yml で 7・10・13・16・19・22時） |
| scraper/traininfo.py | 常磐線の運行情報（Actions の traininfo.yml で5〜23時台に10分おき → `status` ブランチの traininfo.json） |

## 決まっていること（ユーザーの希望）
- 通学：家→荒川沖は自転車30分（雨の日はバス：家→並木大橋 徒歩15分、乗り換え3分）、南柏→大学は徒歩25分
- 2限の特例：荒川沖 9:36 発（9:14 の1本後）まで。金曜の特例：3限のあと 14:50 に出て南柏 15:11 発
- 時限：1限 8:50–10:30 … 5限 16:50–18:30（100分授業）
- 通知はすべて ntfy の `NTFY_TOPIC`（GitHub Secrets）。トピック名はコードに書かない（課題データと一緒に暗号化して配っている）。優先度 high でポップアップ
- シンプル表示：自動で出すのは「大学に行く日の出発前」だけ。ホーム上の1行からはいつでも開ける
- 「授業に合わせて家を出る時刻」は今日と明日だけ表示
- GPS はアプリを開いたとき・戻ったときに1回（5分に1回まで）
- 「マイ駅」は大学側の駅（南柏）の代わり（部活・バイト）。家側の荒川沖は固定。常磐線以外の駅は「着きたい時刻」だけ先に入れて、あとで Yahoo で調べた荒川沖の時刻を入れる
- 大学からマイ駅へ直接行く（1.28.0）：予定の「行きはどこから出る？」＝自動／家から／大学から（`e.from`）。自動は、その日に予定より前に終わる対面授業があれば大学から（あき時間が長くても家には戻らない前提）。大学から行く日は「大学→家」の帰りを出さず、起きる時刻にも数えない。授業のあとでは間に合わないときは「間に合いません」と出す。松戸より先の駅は松戸で乗り換えの推定。常磐線以外の駅は Yahoo! を南柏発で調べ、「南柏を出る時刻」（`e.dM`）を入れる
- Yahoo!乗換案内のリンクは Web 版で開く（アプリ直接だと時刻が伝わらない）
- お金の記録は作らない（SubPal がある）。SubPal は読むだけ

## ほかのアプリ
- SubPal（ZenithExtremers/subpal）：localStorage `subpal.v1` を読む
- まちあわせ（ZenithExtremers/machiawase、Render。既定ブランチは `claude/machiaawase-app-jpjhp1`）：`?title=&place=&time=&note=` で作成画面に入る。GOD Life のメニューで公開URLを入れて使う
- 俺たちの秋学期（ZenithExtremers/oretachi-shugakki）：連携は今回見送り（テスト日 1/6・1/7 あり）

## やり残し・待ち
- 帰りのバス（荒川沖駅西口→並木大橋）・土休日のバスの時刻表（ユーザーが送る予定）
- 学食メニュー・空き教室・大学の行事（data/*.json が空）
- まちあわせの公開URLをユーザーがメニューに入れたかは未確認
