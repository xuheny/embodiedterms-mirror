#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EmbodiedTerms 镜像站 · 自动同步脚本

工作原理：
  1. 抓取原站首页（中文 / 英文），解析 <meta name="glossary-data" content="...">
     指向的最新数据文件（文件名带内容 hash，原站每次更新都会变化）；
  2. 下载最新 JSON，对比其中的 today 字段（数据日期）；
  3. 有更新则覆盖本地 data/zh.json、data/en.json，本站刷新即为最新内容。

用法：
  python3 sync.py            # 检查并同步（有更新才写入）
  python3 sync.py --force    # 强制重新下载
  python3 sync.py --json     # 只输出 JSON 结果（供脚本/定时任务调用）

可配合 cron 或 macOS launchd 定时运行（见 README.md）。
仅依赖 Python 3 标准库。
"""
import argparse
import json
import os
import re
import sys
import urllib.request

BASE = "https://embodiedterms.com"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
UA = {"User-Agent": "EmbodiedTerms-Mirror-Sync/1.0 (+local mirror)"}

PAGES = {
    "zh": "/",
    "en": "/en/",
}
TARGETS = {
    "zh": os.path.join(DATA_DIR, "zh.json"),
    "en": os.path.join(DATA_DIR, "en.json"),
}
# 网站通过 <script> 加载的 JS 包装文件（file:// 双击打开时使用）
JS_TARGETS = {
    "zh": os.path.join(DATA_DIR, "zh.js"),
    "en": os.path.join(DATA_DIR, "en.js"),
}


def wrap_as_js(lang, raw):
    """把 JSON 数据包成赋值给全局变量的 JS 文件。"""
    return (b"window.ET_DATA=window.ET_DATA||{};window.ET_DATA."
            + lang.encode("ascii") + b"=" + raw + b";\n")


def fetch(url, timeout=30, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw if binary else raw.decode("utf-8", errors="replace")


def resolve_data_path(html_text):
    """从首页 HTML 中解析最新数据文件路径。"""
    m = re.search(
        r'<meta\s+name="glossary-data"\s+content="([^"]+)"', html_text)
    if not m:
        # 兜底：直接在页面里找 /data/xx.json
        m = re.search(r'(/data/[a-z]{2}\.[a-f0-9]+\.json)', html_text)
    if not m:
        raise RuntimeError("未能在首页解析到数据文件路径")
    return m.group(1)


def local_version(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("today", "")
    except Exception:
        return None


def sync_one(lang, force=False):
    page_url = BASE + PAGES[lang]
    html_text = fetch(page_url)
    data_path = resolve_data_path(html_text)
    data_url = BASE + data_path if data_path.startswith("/") else data_path

    raw = fetch(data_url, binary=True)
    remote = json.loads(raw.decode("utf-8"))
    remote_date = remote.get("today", "")
    target = TARGETS[lang]
    cur_date = local_version(target)

    changed = force or cur_date != remote_date or not os.path.exists(target)
    result = {
        "lang": lang,
        "remote_file": data_path,
        "remote_date": remote_date,
        "local_date": cur_date,
        "bytes": len(raw),
        "updated": False,
    }
    if changed:
        os.makedirs(DATA_DIR, exist_ok=True)
        # 写 JSON
        tmp = target + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, target)
        # 同步写 JS 包装文件
        js_target = JS_TARGETS[lang]
        jtmp = js_target + ".tmp"
        with open(jtmp, "wb") as f:
            f.write(wrap_as_js(lang, raw))
        os.replace(jtmp, js_target)
        result["updated"] = True
    return result


def main():
    ap = argparse.ArgumentParser(description="同步 EmbodiedTerms 镜像数据")
    ap.add_argument("--force", action="store_true", help="强制重新下载")
    ap.add_argument("--json", action="store_true", help="输出 JSON 结果")
    args = ap.parse_args()

    results = []
    had_error = False
    for lang in ("zh", "en"):
        try:
            results.append(sync_one(lang, force=args.force))
        except Exception as e:
            had_error = True
            results.append({"lang": lang, "error": str(e)})

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        sys.exit(1 if had_error else 0)

    for r in results:
        if "error" in r:
            print("[%s] 同步失败: %s" % (r["lang"], r["error"]))
            continue
        flag = "已更新" if r["updated"] else "无变化"
        print("[%s] %s | 数据日期 %s (本地 %s) | %d KB | %s"
              % (r["lang"], flag, r["remote_date"],
                 r["local_date"] or "无", r["bytes"] // 1024,
                 r["remote_file"]))
    print("完成。" if not had_error else "部分语言同步失败，请检查网络后重试。")
    sys.exit(1 if had_error else 0)


if __name__ == "__main__":
    main()
