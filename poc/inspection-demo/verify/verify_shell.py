# 验收脚本：外壳接线。回答一个问题 —— 双击 poc/inspection-demo/index.html，出来的到底是
# 哪三个目录。
#
# 这个脚本的由来：组件清单原先抄了三份（index.html 的 steps、flow-nav.js 的 steps、
# flow-nav.js 里手写的路径判断），把主线切到三个 v2 目录时三处不同步，出现过"导航点亮
# v2、iframe 还在加载旧目录"这种一半生效的状态。现在清单收成 flow-nav.js 一份，
# 这个脚本盯着它别再散开。
#
#   A. iframe 指向    按需创建的 iframe 必须指向 v2（旧目录名一个都不许出现）
#   B. 导航           左下角 4 个点、序号与标签、当前项高亮、点了真的换屏
#   C. 各屏真渲染     切过去之后 iframe 里的根节点确实在（不是白屏）
#   D. 单独打开       四个组件目录直接双击时，左下角**没有**切换点（导航只属于外壳）
#
# 用法：uv run python poc/inspection-demo/verify/verify_shell.py
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "inspection-demo-shell-verify"))

# 主线现在是这三个 v2 + 知识图谱。改主线就改这张表，断言跟着走。
EXPECT = [
    ("overview", "1", "大屏总览", "hunan-overview-v2", ".hunan3d-canvas, .ov-map-panel"),
    ("station", "2", "站点态势", "inspection-station-v2", ".map3d-canvas, .st-map-panel"),
    # 第 3 位是**单文件页面**（不是目录），folder 那一列直接给文件名。
    ("agent", "3", "智能助手", "智能巡检数智员工_巡检.html", ".agent-card, .composer"),
    ("diagnosis", "4", "诊断台 / 知识库", "diagnosis-flow-v2", ".wb-scene, .app-shell"),
    ("graph", "5", "知识图谱", "kg-template", "canvas, svg"),
]
# 旧目录没删（仍可单独打开），但主线里一个都不该出现。
RETIRED = ["hunan-inspection-overview", "inspection-3d-sandbox", "diagnosis-flow/"]

CONSOLE_ALLOW = ('Scripts "build/three.js"', "SwiftShader", "build/three.js")

# EXPECT 的第 4 列（folder）对目录型组件是目录名、对单文件组件是文件名。
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
        # 外壳现在只加载当前 iframe：启动时只有 overview，点击某一屏时才创建那一屏。
        # 这样演示时不会让 3D、诊断台、知识图谱在后台同时运行，减少隐藏 iframe 的
        # 定时器 / requestAnimationFrame 抢占导致的抖动。
        page.wait_for_function(
            "() => document.querySelectorAll('iframe.demo-frame').length === 1", timeout=30000)
        page.wait_for_function(
            "() => document.querySelector('iframe.demo-frame[data-key=\"overview\"][data-loaded=\"1\"]')",
            timeout=45000)

        # ---------------- A. iframe 指向 ----------------
        srcs = page.evaluate("""() => {
          const out = {};
          document.querySelectorAll('iframe.demo-frame').forEach(f => { out[f.dataset.key] = f.getAttribute('src'); });
          return out;
        }""")
        check(len(srcs) == 1 and srcs.get("overview") == href_of("hunan-overview-v2"),
              "启动时只创建 overview iframe（实际 %s）" % srcs)
        joined = " ".join(srcs.values())
        for old in RETIRED:
            check(old not in joined, "★ 首屏 iframe 不出现退役目录 %s" % old)

        # ---------------- B. 导航 ----------------
        nav = page.evaluate("""() => Array.from(document.querySelectorAll('.inspection-flow-nav a')).map(a => ({
          key: a.dataset.key, label: a.dataset.label, no: a.dataset.no,
          href: a.getAttribute('href'), active: a.classList.contains('is-active')
        }))""")
        check(len(nav) == len(EXPECT), "左下角 %s 个切换点（实际 %s）" % (len(EXPECT), len(nav)))
        for i, (key, no, label, folder, _sel) in enumerate(EXPECT):
            item = nav[i] if i < len(nav) else {}
            check(item.get("key") == key and item.get("no") == no and item.get("label") == label,
                  "第 %s 个点是 %s / %s（实际 %s / %s）" % (no, key, label, item.get("key"), item.get("label")))
            # 顶层页面里前缀是空串：index.html 和组件目录同级。
            check(item.get("href") == href_of(folder),
                  "第 %s 个点的链接指向 %s（实际 %s）" % (no, folder, item.get("href")))
        check(nav[0].get("active") is True, "初始高亮在大屏总览")

        # ---------------- C. 逐屏切过去，看是不是真渲染 ----------------
        for key, no, label, folder, sel in EXPECT:
            page.eval_on_selector('.inspection-flow-nav a[data-key="%s"]' % key, "el => el.click()")
            page.wait_for_function(
                """key => {
                  const f = document.querySelector('iframe.demo-frame[data-key="' + key + '"]');
                  return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
                }""",
                arg=key, timeout=45000)
            page.wait_for_timeout(500)
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

            # 中文文件名在 URL 里是百分号编码的（智能巡检… → %E6%99%BA%E8%83%BD…），
            # 直接用中文子串匹配永远找不到 —— 必须先 unquote。
            frame = [f for f in page.frames if href_of(folder) in unquote(f.url)]
            check(len(frame) == 1, "%s 的 frame 找得到（实际 %s 个）" % (label, len(frame)))
            if frame:
                found = frame[0].evaluate("(sel) => !!document.querySelector(sel)", sel)
                check(found, "★ %s 不是白屏：frame 内 %s 存在" % (label, sel))
            src = page.evaluate("""key => {
              const f = document.querySelector('iframe.demo-frame[data-key="' + key + '"]');
              return f && f.getAttribute('src');
            }""", key)
            check(src == href_of(folder), "%s iframe 指向 %s（实际 %s）" % (key, href_of(folder), src))
            page.screenshot(path=str(SHOT_DIR / ("shell-%s-%s.png" % (no, key))))

        # ---------------- C2. 诊断台状态稳定 ----------------
        # 诊断台在外壳里按需创建后应一直保活：切去其它组件再切回来，不应重新加载成入口态。
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        diag_frame = [f for f in page.frames if "diagnosis-flow-v2/index.html" in unquote(f.url)][0]
        diag_frame.eval_on_selector('[data-select-id="REC-3"]', "el => el.click()")
        diag_frame.wait_for_timeout(350)
        check(diag_frame.evaluate("() => window.DemoDebug.state().recordId") == "REC-3",
              "诊断台内已切到 REC-3，作为切走前的状态标记")

        page.eval_on_selector('.inspection-flow-nav a[data-key="graph"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="graph"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        page.wait_for_timeout(800)
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        diag_after = [f for f in page.frames if "diagnosis-flow-v2/index.html" in unquote(f.url)][0]
        stable = diag_after.evaluate("""() => ({
          recordId: window.DemoDebug.state().recordId,
          scene: window.DemoDebug.state().scene,
          renders: window.DemoDebug.renderCount()
        })""")
        page.wait_for_timeout(1600)
        stable_after_wait = diag_after.evaluate("""r => ({
          recordId: window.DemoDebug.state().recordId,
          renderDelta: window.DemoDebug.renderCount() - r
        })""", stable["renders"])
        active_after_wait = page.evaluate("() => window.InspectionDemoShell.currentKey()")
        check(stable["recordId"] == "REC-3" and stable["scene"] == "workbench",
              "★ 诊断台切走再切回不会重置到入口态（recordId=%s scene=%s）"
              % (stable["recordId"], stable["scene"]))
        check(active_after_wait == "diagnosis" and stable_after_wait["recordId"] == "REC-3"
              and stable_after_wait["renderDelta"] == 0,
              "★ 切回诊断台后等待 1.6s 不自动跳屏、不后台重渲染（active=%s recordId=%s render+%s）"
              % (active_after_wait, stable_after_wait["recordId"], stable_after_wait["renderDelta"]))

        diag_after.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        diag_after.wait_for_timeout(300)
        diag_after.eval_on_selector('.ag-drawer [data-action="ask-agent"]', "el => el.click()")
        diag_after.wait_for_timeout(120)
        page.eval_on_selector('.inspection-flow-nav a[data-key="graph"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="graph"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        page.wait_for_timeout(1000)
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        diag_back = [f for f in page.frames if "diagnosis-flow-v2/index.html" in unquote(f.url)][0]
        bg_agent = diag_back.evaluate("""() => ({
          pending: window.DemoDebug.state().agentPending,
          typing: document.body.textContent.indexOf('正在检索知识库') >= 0
        })""")
        check(bg_agent["pending"] == "" and not bg_agent["typing"],
              "★ 诊断台 Agent 检索中切到后台再切回，不停留在检索中（pending=%s typing=%s）"
              % (bg_agent["pending"], bg_agent["typing"]))

        msg_guard = page.evaluate("""() => {
          const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
          const knownSource = f.contentWindow;
          const before = window.InspectionDemoShell.currentKey();
          const errors = [];
          try {
            window.InspectionDemoShellDebug.validateSwitchRequest(
              { type: 'inspection-demo:switch', key: 'missing' }, knownSource);
          } catch (err) {
            errors.push(String(err.message || err));
          }
          try {
            window.InspectionDemoShellDebug.validateSwitchRequest(
              { type: 'inspection-demo:switch', key: 'overview' }, window);
          } catch (err) {
            errors.push(String(err.message || err));
          }
          return { before, after: window.InspectionDemoShell.currentKey(), errors };
        }""")
        check(msg_guard["before"] == msg_guard["after"]
              and any("未知组件" in e for e in msg_guard["errors"])
              and any("未知来源" in e for e in msg_guard["errors"]),
              "★ 外壳切屏消息拒绝未知 key / 未知 source，且不改变当前屏（active=%s errors=%s）"
              % (msg_guard["after"], msg_guard["errors"]))

        diag_back.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        diag_back.wait_for_timeout(400)
        diag_back.eval_on_selector('[data-action="open-ingest"]', "el => el.click()")
        diag_back.wait_for_timeout(120)
        page.eval_on_selector('.inspection-flow-nav a[data-key="graph"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="graph"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        page.wait_for_timeout(1000)
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        diag_back = [f for f in page.frames if "diagnosis-flow-v2/index.html" in unquote(f.url)][0]
        bg_ingest = diag_back.evaluate("""() => ({
          ingestOpen: window.DemoDebug.state().ingestOpen,
          hasIngestOverlay: !!document.querySelector('.ig-steps')
        })""")
        check(not bg_ingest["ingestOpen"] and not bg_ingest["hasIngestOverlay"],
              "★ 诊断台入库动画进行中切到后台再切回，入库浮层已清理（ingestOpen=%s overlay=%s）"
              % (bg_ingest["ingestOpen"], bg_ingest["hasIngestOverlay"]))

        diag_back.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        diag_back.wait_for_timeout(300)
        diag_back.eval_on_selector('[data-select-id="REC-3"]', "el => el.click()")
        diag_back.wait_for_timeout(200)
        diag_back.eval_on_selector('[data-action="reset-demo"]', "el => el.click()")
        diag_back.wait_for_timeout(120)
        page.eval_on_selector('.inspection-flow-nav a[data-key="graph"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="graph"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        page.wait_for_timeout(600)
        page.eval_on_selector('.inspection-flow-nav a[data-key="diagnosis"]', "el => el.click()")
        page.wait_for_function(
            """() => {
              const f = document.querySelector('iframe.demo-frame[data-key="diagnosis"]');
              return f && f.dataset.loaded === '1' && f.classList.contains('is-active');
            }""",
            timeout=45000)
        diag_back = [f for f in page.frames if "diagnosis-flow-v2/index.html" in unquote(f.url)][0]
        bg_reset = diag_back.evaluate("""() => ({
          recordId: window.DemoDebug.state().recordId,
          resetLabel: document.querySelector('[data-action="reset-demo"]').textContent
        })""")
        check(bg_reset["recordId"] == "REC-3" and bg_reset["resetLabel"] == "重置演示",
              "★ 诊断台重置确认态切到后台再切回，确认态解除且不误重置（recordId=%s label=%s）"
              % (bg_reset["recordId"], bg_reset["resetLabel"]))

        all_srcs = page.evaluate("""() => {
          const out = {};
          document.querySelectorAll('iframe.demo-frame').forEach(f => { out[f.dataset.key] = f.getAttribute('src'); });
          return out;
        }""")
        check(len(all_srcs) == len(EXPECT), "逐屏访问后 %s 个组件的 iframe 都已按需创建（实际 %s 个）" % (len(EXPECT), len(all_srcs)))
        joined = " ".join(all_srcs.values())
        for old in RETIRED:
            check(old not in joined, "★ 主线里不再出现退役目录 %s" % old)

        check(not errors, "外壳全程无 pageerror / console.error（实际 %s 条）%s"
              % (len(errors), ("：" + errors[0]) if errors else ""))

        # ---------------- D. 组件单独打开时不该有导航 ----------------
        # 【设计口径】1~4 号切换点只属于外壳（本文件测的这个 index.html）。组件是独立页面，
        # 单独双击打开时**不出现左下角图标** —— 组件之间的串联由外壳负责，组件自己不该长出
        # 一个指向兄弟目录的入口。所以每个组件的 index.html 都不加载 ../flow-nav/。
        # （这条以前反着做过：给三个 v2 加过 flow-nav，口径明确之后已全部摘除。）
        for key, no, label, folder, _sel in EXPECT:
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
