# 验收脚本：外壳接线。回答两个问题：
# 1. 双击 poc/beng-demo/index.html，五个可切换组件的 iframe 是否仍然接对。
# 2. 顶部是否只剩主线三项，诊断台左侧是否承担总览/态势的上下文入口。
#
# 这个脚本的由来：组件清单原先抄了三份（index.html 的 steps、flow-nav.js 的 steps、
# flow-nav.js 里手写的路径判断），把主线切到三个 v2 目录时三处不同步，出现过"导航点亮
# v2、iframe 还在加载旧目录"这种一半生效的状态。现在清单收成 flow-nav.js 一份，
# 这个脚本盯着它别再散开。
#
#   A. iframe 指向    五个组件 src 必须接到新版入口（旧目录名一个都不许出现）
#   B. 顶部主线       只有 智能助手 / 诊断台 / 知识图谱，且无数字序号
#   C. 上下文入口     从诊断台左侧圆形浮窗进入 大屏总览 / 泵站态势
#   D. 各屏真渲染     切过去之后 iframe 里的根节点确实在（不是白屏）
#   E. 单独打开       组件目录直接双击时，没有外壳顶部导航
#
# 用法：uv run python poc/beng-demo/verify/verify_shell.py
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "beng-demo-shell-verify"))

# 真实 iframe 清单。总览/态势虽然不再放顶部，但仍是外壳可切换组件。
EXPECT = [
    # 智能助手是**单文件页面**（不是目录），所以 folder 那一列直接给文件名；
    # 它不加载 flow-nav，E 组「单独打开时没有外壳导航」对它同样成立。
    ("agent", "智能助手", "智能巡检数智员工-泵.html", ".agent-card, .composer"),
    ("diagnosis", "诊断台", "diagnosis-flow-v2", ".wb-scene, .app-shell"),
    ("graph", "知识图谱", "kg-template", "canvas, svg"),
    ("overview", "大屏总览", "hunan-pump-overview-v2", ".ov-map-panel, .hunan-map"),
    ("station", "泵站态势", "pump-station-situation-v2", ".st-map-panel, .pump3d-canvas"),
]
PRIMARY = EXPECT[:3]
CONTEXT = EXPECT[3:]
# 旧目录没删（仍可单独打开），但主线里一个都不该出现。
# 注意结尾的 "/"：没有它，"hunan-pump-overview-v2/index.html" 会把
# "hunan-pump-overview" 当成命中，断言反而永远红。
RETIRED = ["hunan-pump-overview/", "pump-station-situation/", "diagnosis-flow/"]

CONSOLE_ALLOW = ('Scripts "build/three.js"', "SwiftShader", "build/three.js")

# EXPECT 的第 3 列（folder）对目录型组件是目录名、对单文件组件是文件名。
# 这个小函数把两者都变成 iframe 该有的 src —— 否则单文件那一屏会被拼成
# 「智能巡检数智员工-泵.html/index.html」，五处断言全红。
def href_of(folder):
    return folder if folder.endswith(".html") else folder + "/index.html"


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
        # 外壳是懒加载的：overview 立刻建，其余几屏按 500 + n*700ms 排队预热，
        # 每个还套一层 requestIdleCallback（1200ms 超时）。
        #
        # 【必须轮询等待，不能固定 sleep】屏数从 4 变 5 之后预热链更长（最后一个约
        # 2600ms 才开始排队，再加上 3D 场景自身的加载时间），原先固定等 4500ms
        # 变成了偶发失败：实测同一份代码连跑两次，一次 57 passed、一次报「只建了 3 个」。
        # 那种红是假的 —— 产品没问题，是断言比页面跑得快。
        page.wait_for_function(
            "n => document.querySelectorAll('iframe.demo-frame').length >= n",
            arg=len(EXPECT), timeout=30000)
        # 再等全部 iframe 的 load 事件落地（dataset.loaded 由 createFrame 的 onload 置位）
        page.wait_for_function(
            "n => document.querySelectorAll('iframe.demo-frame[data-loaded=\"1\"]').length >= n",
            arg=len(EXPECT), timeout=45000)

        # ---------------- A. iframe 指向 ----------------
        srcs = page.evaluate("""() => {
          const out = {};
          document.querySelectorAll('iframe.demo-frame').forEach(f => { out[f.dataset.key] = f.getAttribute('src'); });
          return out;
        }""")
        check(len(srcs) == len(EXPECT), "%s 个组件的 iframe 都建起来了（实际 %s 个）" % (len(EXPECT), len(srcs)))
        for key, _label, folder, _sel in EXPECT:
            check(srcs.get(key) == href_of(folder),
                  "%s 指向 %s（实际 %s）" % (key, href_of(folder), srcs.get(key)))
        joined = " ".join(srcs.values())
        for old in RETIRED:
            check(old not in joined, "★ 主线里不再出现退役目录 %s" % old)

        def check_active_frame(key, label, folder, sel, expected_nav_key):
            page.wait_for_timeout(1800)
            state = page.evaluate("""(key) => {
              const f = document.querySelector('iframe.demo-frame[data-key="' + key + '"]');
              const nav = document.querySelector('.inspection-flow-nav a.is-active');
              return { active: f.classList.contains('is-active'), loaded: f.dataset.loaded,
                       others: Array.from(document.querySelectorAll('iframe.demo-frame.is-active')).length,
                       mask: document.getElementById('bootMask').classList.contains('is-hidden'),
                       navActive: nav ? nav.dataset.key : null };
            }""", key)
            check(state["active"] and state["others"] == 1,
                  "切到 %s 后只有它一个 iframe 是 is-active（实际 %s 个）" % (label, state["others"]))
            check(state["loaded"] == "1" and state["mask"], "%s 已加载完、启动遮罩已隐藏" % label)
            check(state["navActive"] == expected_nav_key,
                  "%s 对应的顶部主线高亮为 %s（实际 %s）" % (label, expected_nav_key, state["navActive"]))

            # 中文文件名在 URL 里是百分号编码的（智能巡检… → %E6%99%BA%E8%83%BD…），
            # 直接用中文子串匹配永远找不到 —— 必须先 unquote。
            frame = [f for f in page.frames if href_of(folder) in unquote(f.url)]
            check(len(frame) == 1, "%s 的 frame 找得到（实际 %s 个）" % (label, len(frame)))
            if frame:
                found = frame[0].evaluate("(sel) => !!document.querySelector(sel)", sel)
                check(found, "★ %s 不是白屏：frame 内 %s 存在" % (label, sel))
            page.screenshot(path=str(SHOT_DIR / ("shell-%s.png" % key)))

        # ---------------- B. 顶部主线 ----------------
        nav = page.evaluate("""() => Array.from(document.querySelectorAll('.inspection-flow-nav a')).map(a => ({
          key: a.dataset.key, label: a.dataset.label, no: a.dataset.no, text: a.textContent.trim(),
          href: a.getAttribute('href'), active: a.classList.contains('is-active')
        }))""")
        check(len(nav) == len(PRIMARY), "顶部只有 %s 个主线入口（实际 %s）" % (len(PRIMARY), len(nav)))
        for i, (key, label, folder, _sel) in enumerate(PRIMARY):
            item = nav[i] if i < len(nav) else {}
            check(item.get("key") == key and item.get("label") == label and item.get("text") == label,
                  "主线第 %s 项是 %s / %s（实际 %s / %s）" % (i + 1, key, label, item.get("key"), item.get("text")))
            check(item.get("no") is None, "主线第 %s 项不再带数字序号" % (i + 1))
            # 顶层页面里前缀是空串：index.html 和组件目录同级。
            check(item.get("href") == href_of(folder),
                  "主线第 %s 项的链接指向 %s（实际 %s）" % (i + 1, folder, item.get("href")))
        check(nav[0].get("active") is True, "初始高亮在智能助手")

        # ---------------- C. 主线逐屏切换 ----------------
        for key, label, folder, sel in PRIMARY:
            page.eval_on_selector('.inspection-flow-nav a[data-key="%s"]' % key, "el => el.click()")
            check_active_frame(key, label, folder, sel, key)

        # ---------------- D. 诊断台上下文浮窗 ----------------
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        check_active_frame("diagnosis", "诊断台", "diagnosis-flow-v2", ".wb-scene, .app-shell", "diagnosis")
        diag_frame = [f for f in page.frames if href_of("diagnosis-flow-v2") in unquote(f.url)][0]
        rail = diag_frame.evaluate("""() => Array.from(document.querySelectorAll('.context-fab')).map(b => ({
          key: b.dataset.shellKey, label: b.getAttribute('aria-label'), mark: b.textContent.trim()
        }))""")
        check(len(rail) == len(CONTEXT), "诊断台左侧有 %s 个圆形上下文入口（实际 %s）" % (len(CONTEXT), len(rail)))
        for i, (key, label, _folder, _sel) in enumerate(CONTEXT):
            item = rail[i] if i < len(rail) else {}
            check(item.get("key") == key and item.get("label") == label,
                  "上下文第 %s 项是 %s / %s（实际 %s / %s）"
                  % (i + 1, key, label, item.get("key"), item.get("label")))

        for key, label, folder, sel in CONTEXT:
            page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
            check_active_frame("diagnosis", "诊断台", "diagnosis-flow-v2", ".wb-scene, .app-shell", "diagnosis")
            diag_frame = [f for f in page.frames if href_of("diagnosis-flow-v2") in unquote(f.url)][0]
            diag_frame.eval_on_selector('.context-fab[data-shell-key="%s"]' % key, "el => el.click()")
            check_active_frame(key, label, folder, sel, "diagnosis")

        check(not errors, "外壳全程无 pageerror / console.error（实际 %s 条）%s"
              % (len(errors), ("：" + errors[0]) if errors else ""))

        # ---------------- E. 组件单独打开时不该有外壳导航 ----------------
        # 【设计口径】顶部主线只属于外壳（本文件测的这个 index.html）。组件是独立页面，
        # 单独双击打开时**不出现顶部主线条**。诊断台内部的上下文浮窗属于诊断台自身，
        # 不引用 ../flow-nav/。
        # （这条以前反着做过：给三个 v2 加过 flow-nav，口径明确之后已全部摘除。）
        for key, label, folder, _sel in EXPECT:
            solo = browser.new_page(viewport={"width": 1680, "height": 1050})
            solo.goto((ROOT / href_of(folder)).as_uri())
            solo.wait_for_timeout(2000)
            probe = solo.evaluate("""() => ({
              nav: document.querySelectorAll('.inspection-flow-nav').length,
              links: document.querySelectorAll('.inspection-flow-nav a').length,
              navAssets: Array.from(document.querySelectorAll('link[href], script[src]'))
                .map(e => e.getAttribute('href') || e.getAttribute('src'))
                .filter(u => u && u.indexOf('flow-nav') >= 0).length
            })""")
            check(probe["nav"] == 0 and probe["links"] == 0,
                  "★ %s 单独打开时没有外壳顶部主线（实际 %s 容器 / %s 点）"
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
