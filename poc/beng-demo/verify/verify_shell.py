# 验收脚本：外壳接线。回答一个问题 —— 双击 poc/beng-demo/index.html，出来的到底是
# 哪几个目录。
#
# 这个脚本的由来：组件清单原先抄了三份（index.html 的 steps、flow-nav.js 的 steps、
# flow-nav.js 里手写的路径判断），把主线切到三个 v2 目录时三处不同步，出现过"导航点亮
# v2、iframe 还在加载旧目录"这种一半生效的状态。现在清单收成 flow-nav.js 一份，
# 这个脚本盯着它别再散开。
#
#   A. iframe 指向    前两个 key 的 src 必须是 v2（旧目录名一个都不许出现）
#   B. 导航           左下角 4 个点、序号与标签、当前项高亮、点了真的换屏
#   C. 各屏真渲染     切过去之后 iframe 里的根节点确实在（不是白屏）
#   D. 单独打开       四个组件目录直接双击时，左下角**没有**切换点（导航只属于外壳）
#
# 用法：uv run python poc/beng-demo/verify/verify_shell.py
import os
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "beng-demo-shell-verify"))

# 主线现在是两个 v2 + 诊断台 + 知识图谱。改主线就改这张表，断言跟着走。
EXPECT = [
    ("overview", "1", "大屏总览", "hunan-pump-overview-v2", ".ov-map-panel, .hunan-map"),
    ("station", "2", "泵站态势", "pump-station-situation-v2", ".st-map-panel, .pump3d-canvas"),
    ("diagnosis", "3", "诊断台 / 知识库", "diagnosis-flow", ".app-shell"),
    ("graph", "4", "知识图谱", "kg-template", "canvas, svg"),
]
# 旧目录没删（仍可单独打开），但主线里一个都不该出现。
# 注意结尾的 "/"：没有它，"hunan-pump-overview-v2/index.html" 会把
# "hunan-pump-overview" 当成命中，断言反而永远红。
RETIRED = ["hunan-pump-overview/", "pump-station-situation/"]

CONSOLE_ALLOW = ('Scripts "build/three.js"', "SwiftShader", "build/three.js")

PASS = 0
FAIL = 0


def check(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("[PASS] " + msg)
    else:
        FAIL += 1
        print("[FAIL] " + msg)


def main():
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    errors = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1680, "height": 1050})
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text)
                if m.type == "error" and not any(a in m.text for a in CONSOLE_ALLOW) else None)

        page.goto(INDEX)
        # 外壳是懒加载的：overview 立刻建，其余三个按 500 / 1200 / 1900ms 排队预热。
        page.wait_for_timeout(4500)

        # ---------------- A. iframe 指向 ----------------
        srcs = page.evaluate("""() => {
          const out = {};
          document.querySelectorAll('iframe.demo-frame').forEach(f => { out[f.dataset.key] = f.getAttribute('src'); });
          return out;
        }""")
        check(len(srcs) == 4, "四个组件的 iframe 都建起来了（实际 %s 个）" % len(srcs))
        for key, _no, _label, folder, _sel in EXPECT:
            check(srcs.get(key) == folder + "/index.html",
                  "%s 指向 %s（实际 %s）" % (key, folder + "/index.html", srcs.get(key)))
        joined = " ".join(srcs.values())
        for old in RETIRED:
            check(old not in joined, "★ 主线里不再出现退役目录 %s" % old)

        # ---------------- B. 导航 ----------------
        nav = page.evaluate("""() => Array.from(document.querySelectorAll('.inspection-flow-nav a')).map(a => ({
          key: a.dataset.key, label: a.dataset.label, no: a.textContent,
          href: a.getAttribute('href'), active: a.classList.contains('is-active')
        }))""")
        check(len(nav) == 4, "左下角 4 个切换点（实际 %s）" % len(nav))
        for i, (key, no, label, folder, _sel) in enumerate(EXPECT):
            item = nav[i] if i < len(nav) else {}
            check(item.get("key") == key and item.get("no") == no and item.get("label") == label,
                  "第 %s 个点是 %s / %s（实际 %s / %s）" % (no, key, label, item.get("key"), item.get("label")))
            # 顶层页面里前缀是空串：index.html 和组件目录同级。
            check(item.get("href") == folder + "/index.html",
                  "第 %s 个点的链接指向 %s（实际 %s）" % (no, folder, item.get("href")))
        check(nav[0].get("active") is True, "初始高亮在大屏总览")

        # ---------------- C. 逐屏切过去，看是不是真渲染 ----------------
        for key, no, label, folder, sel in EXPECT:
            page.eval_on_selector('.inspection-flow-nav a[data-key="%s"]' % key, "el => el.click()")
            page.wait_for_timeout(1800)
            state = page.evaluate("""(key) => {
              const f = document.querySelector('iframe.demo-frame[data-key="' + key + '"]');
              return { active: f.classList.contains('is-active'), loaded: f.dataset.loaded,
                       others: Array.from(document.querySelectorAll('iframe.demo-frame.is-active')).length,
                       mask: document.getElementById('bootMask').classList.contains('is-hidden'),
                       navActive: document.querySelector('.inspection-flow-nav a.is-active').dataset.key };
            }""", key)
            check(state["active"] and state["others"] == 1,
                  "切到 %s 后只有它一个 iframe 是 is-active（实际 %s 个）" % (label, state["others"]))
            check(state["loaded"] == "1" and state["mask"], "%s 已加载完、启动遮罩已隐藏" % label)
            check(state["navActive"] == key, "导航高亮跟着切到 %s" % label)

            frame = [f for f in page.frames if folder + "/index.html" in f.url]
            check(len(frame) == 1, "%s 的 frame 找得到（实际 %s 个）" % (label, len(frame)))
            if frame:
                found = frame[0].evaluate("(sel) => !!document.querySelector(sel)", sel)
                check(found, "★ %s 不是白屏：frame 内 %s 存在" % (label, sel))
            page.screenshot(path=str(SHOT_DIR / ("shell-%s-%s.png" % (no, key))))

        check(not errors, "外壳全程无 pageerror / console.error（实际 %s 条）%s"
              % (len(errors), ("：" + errors[0]) if errors else ""))

        # ---------------- D. 组件单独打开时不该有导航 ----------------
        # 【设计口径】1~4 号切换点只属于外壳（本文件测的这个 index.html）。组件是独立页面，
        # 单独双击打开时**不出现左下角图标** —— 组件之间的串联由外壳负责，组件自己不该长出
        # 一个指向兄弟目录的入口。所以每个组件的 index.html 都不加载 ../flow-nav/。
        # （这条以前反着做过：给三个 v2 加过 flow-nav，口径明确之后已全部摘除。）
        for key, no, label, folder, _sel in EXPECT:
            solo = browser.new_page(viewport={"width": 1680, "height": 1050})
            solo.goto((ROOT / folder / "index.html").as_uri())
            solo.wait_for_timeout(2000)
            probe = solo.evaluate("""() => ({
              nav: document.querySelectorAll('.inspection-flow-nav').length,
              links: document.querySelectorAll('.inspection-flow-nav a').length,
              navAssets: Array.from(document.querySelectorAll('link[href], script[src]'))
                .map(e => e.getAttribute('href') || e.getAttribute('src'))
                .filter(u => u && u.indexOf('flow-nav') >= 0).length
            })""")
            check(probe["nav"] == 0 and probe["links"] == 0,
                  "★ %s 单独打开时左下角没有切换点（实际 %s 容器 / %s 点）"
                  % (folder, probe["nav"], probe["links"]))
            check(probe["navAssets"] == 0,
                  "%s 的 index.html 不引用 flow-nav 资源（实际 %s 处）" % (folder, probe["navAssets"]))
            solo.close()

        browser.close()

    print("\n截图目录：%s" % SHOT_DIR)
    print("\n===== 汇总：%s passed, %s failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%s 项断言）" % PASS)


if __name__ == "__main__":
    main()
