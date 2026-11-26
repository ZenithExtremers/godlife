#!/usr/bin/env python3
"""常磐線の運行情報をチェックする（GitHub Actions から10分おき）

Yahoo!路線情報の関東エリアのページ（事故・遅延情報の一覧）を見て、常磐線の行だけを取り出す。
結果を JSON に書き出し、前回から変わったときだけ ntfy に通知する。

使い方: python traininfo.py 前回のjson 出力するjson
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request

URL = "https://transit.yahoo.co.jp/diainfo/area/4"
JST = dt.timezone(dt.timedelta(hours=9))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; GODLife-traininfo/1.0)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def parse(page):
    """(読めたか, 常磐線の行のリスト)。行は {name, status, detail}"""
    # 事故・遅延のある路線の表（id="mdStatusTroubleLine"）
    m = re.search(r'id="mdStatusTroubleLine"(.*?)</table>', page, re.S)
    if m:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(1), re.S)
        out = []
        for r in rows:
            cells = [text(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, re.S)]
            if len(cells) >= 2 and "常磐" in cells[0]:
                out.append({"name": cells[0], "status": cells[1], "detail": cells[2] if len(cells) > 2 else ""})
        print(f"表を読めました（{len(rows)}行、常磐線 {len(out)}件）")
        return True, out
    # 表がない：遅延がないときの文言があれば「平常」
    if re.search(r"事故・遅延[^<]{0,20}(情報はありません|ありません)", page):
        print("事故・遅延の情報はありません")
        return True, []
    print("ページの形が変わったかもしれません（読めませんでした）")
    return False, []


def notify(title, msg):
    topic = os.environ.get("NTFY_TOPIC", "").strip()
    if not topic:
        return
    try:
        req = urllib.request.Request(f"https://ntfy.sh/{topic}", data=msg.encode("utf-8"),
                                     headers={"Title": title.encode("utf-8"), "Tags": "train,warning", "Priority": "high"})
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:  # 通知に失敗しても止めない
        print("通知に失敗:", type(e).__name__)


def main():
    prev_path, out_path = sys.argv[1], sys.argv[2]
    try:
        prev = json.load(open(prev_path, encoding="utf-8"))
    except Exception:
        prev = {}
    now = dt.datetime.now(JST)
    try:
        ok, lines = parse(fetch(URL))
    except Exception as e:
        print("取得に失敗:", type(e).__name__)
        ok, lines = False, []
    data = {"checked": now.isoformat(timespec="minutes"), "ok": ok, "trouble": lines if ok else prev.get("trouble", []),
            "source": URL}
    json.dump(data, open(out_path, "w", encoding="utf-8"), ensure_ascii=False)
    for l in lines:
        print("・", l["name"], l["status"])
    # 変わったときだけ通知（5時〜23時台）
    if ok and prev.get("ok") is not None:
        key = lambda ls: sorted((l["name"], l["status"]) for l in ls)
        if key(lines) != key(prev.get("trouble", [])) and 5 <= now.hour <= 23:
            if lines:
                notify("GOD Life：常磐線 " + "・".join(l["status"] for l in lines[:2]),
                       "\n".join(f"{l['name']}：{l['status']}\n{l['detail'][:80]}" for l in lines[:3]))
            elif prev.get("trouble"):
                notify("GOD Life：常磐線は平常運転に戻りました", "運行情報から常磐線の遅延・運休がなくなりました")


if __name__ == "__main__":
    main()
