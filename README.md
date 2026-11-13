# GOD Life

麗澤大学の大学生活をまとめたスマホ用アプリ（PWA）です。GitHub Pages で公開します。

| タブ | 内容 | 元になったもの |
|---|---|---|
| ホーム | 今の授業・次の授業、家を出る時刻、課題、今日の学食 | — |
| 時間割 | 月〜土 × 1〜5限。マスをタップするか、スクショから読み込んで登録（この端末に保存） | 新規 |
| 課題 | 麗澤ポータル（UNIPA）の課題。GitHub Actions が自動で取得 | [ReiMind](https://github.com/ZenithExtremers/reimind) |
| 通学 | 「今出れば間に合う」。大学⇄南柏⇄柏乗換⇄荒川沖⇄家 | [LASTCALL](https://github.com/ZenithExtremers/lastcall) |
| 学食・教室 | 学食メニュー（`data/menu.json`）と空き教室検索（`data/rooms.json`） | 新規 |

ホームの「通学」には次の3つを出します（家にいそうな時間は行きを上、大学にいそうな時間は帰りを上に並べます）。

- **授業に合わせて**：次に授業がある日（今日の1コマ目がまだなら今日）の1コマ目に間に合うには、何時に家を出ればいいか
- **今から行くなら**：今から出ると何時に大学に着き、何限に間に合うか
- **今から帰るなら**：授業中なら、最後の授業が終わったあとに乗れる電車

## スクショから時間割を読み込む

時間割タブの「📷 スクショから時間割を読み込む」で、UNIPA などの時間割のスクショを読み取ります。
文字認識（[Tesseract.js](https://github.com/naptha/tesseract.js)）は端末の中で動くので、画像はどこにも送りません。初回だけ約3MBの日本語データをダウンロードします。

- 曜日（月〜金）が横、時限が縦に並んだ表の形と、「月曜 2限 ◯◯」が縦に並ぶ一覧の形に対応しています
- 読み取ったあと確認画面が出るので、まちがいを直してから保存します（文字が1〜2字抜けることがあります）

## 時限（2022年度からの100分授業）

1限 8:50–10:30 ／ 2限 10:40–12:20 ／ 3限 13:10–14:50 ／ 4限 15:00–16:40 ／ 5限 16:50–18:30
（`js/core.js` の `G.PERIODS` で変更できます）

## 公開のしかた

1. Settings → Pages → Source を **GitHub Actions** にする
2. Settings → Secrets and variables → Actions に次を登録する（ReiMind と同じ）

| 名前 | 中身 |
|---|---|
| `REITAKU_ID` | ポータルの User ID |
| `REITAKU_PW` | ポータルのパスワード |
| `KADAI_PASSPHRASE` | アプリで入れる合言葉（6文字以上。ポータルのパスワードとは別のもの） |
| `NTFY_TOPIC` | （任意）ntfy の通知用トピック名 |

3. `main` に push すると公開されます。その後は日本時間の 7・10・13・16・19・22時に課題を取りに行きます。
   Secrets が無いときは課題の取得だけを飛ばして、ほかの機能は公開します。

ReiMind と同じく、ログインに失敗すると自動更新を止めます（10回失敗でロックされるため）。
パスワードを直したら、Actions →「課題を更新して公開」→ Run workflow で `force` にチェックを入れて実行してください。

同じ `zenithextremers.github.io` で動くので、ReiMind の合言葉・完了の印と LASTCALL の徒歩・自転車の設定は、そのまま引き継がれます。

## データの更新

- **学食**：`data/menu.json` の `days` に、`"2026-11-16": [{"name": "カレー", "price": 400}]` の形で入れる（`regular` は定番メニュー。`note` と `kcal` も書けます）
- **空き教室**：`data/rooms.json` の `rooms` に教室（`{"id": "か-301", "building": "かえで館", "cap": 40}`）を入れ、`busy` に `"曜日-時限"`（1=月）ごとの使用中の教室を入れる。
  アプリの「編集」で端末上で直してから「rooms.json の形でコピー」して貼り付けることもできます
- **電車の時刻表**：ダイヤ改正のときに `data/trains.js` を LASTCALL と同じ手順で作り直し、`sw.js` の `VERSION` を上げる

## ファイル

```
index.html, css/app.css, sw.js, manifest.json   画面とPWA
js/core.js      共通（保存・時限・トースト）
js/classes.js   時間割
js/ocr.js       スクショの読み取り
js/kadai.js     課題（ReiMind の画面と復号）
js/commute.js   通学（LASTCALL の経路計算）
js/campus.js    学食・空き教室
js/home.js      ホーム
js/app.js       タブ切り替え・バックアップ
data/           時刻表・学食・教室のデータ
scraper/        ポータルから課題を取る Python（ReiMind から流用）
```
