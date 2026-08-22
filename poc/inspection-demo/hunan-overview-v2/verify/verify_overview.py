# 验收脚本：以 file:// 打开 index.html（不带任何 --allow-file-access-from-files，模拟
# 真实双击），断言四组事情：
#
#   A. 加载健康        pageerror 为空 / console.error 白名单外为空 / WebGL 上下文单例
#   B. v2 布局与减法    一屏容器数 = 2、左栏块数 = 4、旧结构类名全部不存在、
#                      已删文案在页面文本里检索不到、图表槽位数与状态严格对应
#   C. 3D 契约（沿用）  [data-hunan-host] 恰好 1 个 / 作业区标签数与顺序 === ZONE_IDS /
#                      assertPinNamespace 通过 / 标签两两不重叠 / 渲染预算
#   D. 下钻联动        点作业区标签 → activeZoneId 跟随、左栏第 4 块换成只读站点表、
#                      作业区分布图从 DOM 消失；点「返回全省」→ 回到 null 且图回来
#
# 另外量化一条「文字变少了」：同时打开旧版总览，数两版左栏的中文字符数并对比。
#
# 为什么是 Python 而不是像旧目录那样用 Node：Node 的 playwright 在本机只能从
# npx 缓存目录解析（机器本地路径，不可移植），而本仓库 .venv 里装了 Python
# Playwright，poc/inspection-demo/diagnosis-flow/verify/verify_flow.py 已经是同一条路。
#
# 用法：uv run python poc/inspection-demo/hunan-overview-v2/verify/verify_overview.py
# 自定义截图目录：SHOT_DIR=/some/dir uv run python .../verify_overview.py
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
INDEX = (HERE.parent / "index.html").as_uri()
OLD_INDEX = (HERE.parent.parent / "hunan-inspection-overview" / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "hunan-overview-v2-verify"))

# 窄字符串白名单：只放 three r160 的弃用横幅与 swiftshader / GL Driver 提示。
# 不做宽松的 startswith("THREE.")——污染纹理的失败恰好以 "THREE.WebGLState:
# SecurityError" 开头，宽松匹配会把 file:// 下最可能发生的那个 bug 直接藏掉。
CONSOLE_ALLOW_PREFIXES = (
    'Scripts "build/three.js" and "build/three.min.js" are deprecated',
    "SwiftShader",
)
GL_DRIVER_STALL_RE = re.compile(
    r"^\[\.WebGL-[0-9a-fA-Fx]+\]GL Driver Message \(OpenGL, Performance, "
    r"GL_CLOSE_PATH_NV, (High|Medium|Low)\): GPU stall due to ReadPixels"
)

PASS = 0
FAIL = 0


def check(condition, message):
    global PASS, FAIL
    if condition:
        PASS += 1
        print("[PASS] " + message)
    else:
        FAIL += 1
        print("[FAIL] " + message)


def console_unexpected(text):
    if text.startswith(CONSOLE_ALLOW_PREFIXES):
        return False
    return not GL_DRIVER_STALL_RE.match(text)


# 轮询等到 debugInfo().idle 为真，再复核 frames 不再变化——不做固定等待。
# 本项目的姐妹脚本已经出现过 "frames 344->347" 这类 flaky 失败。
def wait_idle(page, timeout_ms=20000):
    info = page.wait_for_function(
        "() => { const i = window.HunanMap3D.debugInfo(); return i.idle ? i : null; }",
        timeout=timeout_ms,
    ).json_value()
    frames = info["frames"]
    page.wait_for_timeout(400)
    info2 = page.evaluate("() => window.HunanMap3D.debugInfo()")
    if not info2["idle"] or info2["frames"] != frames:
        raise RuntimeError(
            "idle 之后 frames 仍在变化（%s -> %s），场景未真正收敛" % (frames, info2["frames"])
        )
    return info2


def rects_overlap(a, b):
    return not (
        a["right"] <= b["left"]
        or b["right"] <= a["left"]
        or a["bottom"] <= b["top"]
        or b["bottom"] <= a["top"]
    )


# 只数中日韩统一表意文字，不数标点、数字、英文——用来对比两版屏上的「字量」。
CJK_RE = re.compile(r"[一-鿿]")


def cjk_count(text):
    return len(CJK_RE.findall(text))


def main():
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})

        page_errors = []
        bad_console = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "console",
            lambda m: bad_console.append(m.text)
            if m.type == "error" and console_unexpected(m.text)
            else None,
        )

        page.goto(INDEX, wait_until="load")
        info0 = wait_idle(page)

        # ---------------- A. 加载健康 ----------------
        check(not page_errors, "pageerror 为空（实际 %d 条）%s" % (len(page_errors), ("：\n" + "\n---\n".join(page_errors)) if page_errors else ""))
        check(not bad_console, "console.error 白名单外为空（实际 %d 条）%s" % (len(bad_console), ("：\n" + "\n---\n".join(bad_console)) if bad_console else ""))
        check(info0["contextCreated"] == 1, "WebGL 上下文单例 contextCreated === 1（实际 %s）" % info0["contextCreated"])

        # ---------------- B. v2 布局与减法 ----------------
        layout = page.evaluate("""() => {
          const scene = document.querySelector('.overview-scene');
          const left = document.querySelector('.ov-left-col');
          const body = document.body.textContent;
          return {
            sceneChildren: scene ? scene.children.length : -1,
            leftChildren: left ? left.children.length : -1,
            leftText: left ? left.textContent : '',
            bottombar: document.querySelectorAll('.bottombar').length,
            topbarTitle: document.querySelectorAll('.topbar-title, .topbar-wing, .topbar-title-rule').length,
            legacy: {
              qualityCard: document.querySelectorAll('.ov-quality-card').length,
              detailCard: document.querySelectorAll('.card-detail').length,
              rankCard: document.querySelectorAll('.ov-rank-card').length,
              selectList: document.querySelectorAll('.sl, .sl-table, .sl-item').length,
              crumbs: document.querySelectorAll('.crumbs').length
            },
            slots: {
              completion: document.querySelectorAll('#chart-completion').length,
              exception: document.querySelectorAll('#chart-exception').length,
              zoneStatus: document.querySelectorAll('#chart-zone-status').length
            },
            chartInstances: window.Charts.debugInfo().instances,
            deletedCopy: [
              'HUNAN OIL & GAS NETWORK OVERVIEW',
              '动态趋势',
              '作业区巡检覆盖率',
              '区域质量热区',
              '两级钻取',
              '示意坐标',
              '巡检质量保障',
              '点击下钻'
            ].filter(s => body.indexOf(s) >= 0)
          };
        }""")

        check(layout["sceneChildren"] == 2, ".overview-scene 顶层容器恰好 2 个（左栏 + 地图，实际 %s）" % layout["sceneChildren"])
        check(layout["leftChildren"] == 4, ".ov-left-col 恰好 4 块（实际 %s）" % layout["leftChildren"])
        check(layout["bottombar"] == 0, "不渲染底栏 .bottombar（实际 %s 个）" % layout["bottombar"])
        check(layout["topbarTitle"] == 0, "顶栏不渲染居中大标题与装饰翼（实际 %s 个）" % layout["topbarTitle"])
        check(layout["legacy"]["qualityCard"] == 0, "「巡检质量保障」卡已拆除，无 .ov-quality-card（实际 %s 个）" % layout["legacy"]["qualityCard"])
        check(layout["legacy"]["detailCard"] == 0, "右下详情卡已删除，无 .card-detail（实际 %s 个）" % layout["legacy"]["detailCard"])
        check(layout["legacy"]["rankCard"] == 0, "作业区排名表已删除，无 .ov-rank-card（实际 %s 个）" % layout["legacy"]["rankCard"])
        check(layout["legacy"]["selectList"] == 0, "不再加载 SelectList，无 .sl/.sl-table/.sl-item（实际 %s 个）" % layout["legacy"]["selectList"])
        check(layout["legacy"]["crumbs"] == 0, "面包屑已删除，无 .crumbs（实际 %s 个）" % layout["legacy"]["crumbs"])
        check(not layout["deletedCopy"], "已删文案在页面文本里检索不到（实际残留：%s）" % ", ".join(layout["deletedCopy"]))
        check(
            layout["slots"] == {"completion": 1, "exception": 1, "zoneStatus": 1},
            "省域态三个图表槽位各 1 个（实际 %s）" % json.dumps(layout["slots"], ensure_ascii=False),
        )
        check(layout["chartInstances"] == 3, "省域态 ECharts 实例恰好 3 个（实际 %s）" % layout["chartInstances"])

        # ---------------- C. 3D 契约 ----------------
        host_count = page.evaluate("() => document.querySelectorAll('[data-hunan-host]').length")
        check(host_count == 1, "[data-hunan-host] 恰好 1 个（实际 %s）" % host_count)

        zone_order = page.evaluate("""() => ({
          ids: Array.from(document.querySelectorAll('.hunan-labels [data-hunan-zone]'))
                    .map(el => el.getAttribute('data-hunan-zone')),
          expected: window.HunanContract.ZONE_IDS
        })""")
        check(
            zone_order["ids"] == zone_order["expected"],
            ".hunan-labels 内标签数与顺序 === ZONE_IDS（实际 [%s]，期望 [%s]）"
            % (",".join(zone_order["ids"]), ",".join(zone_order["expected"])),
        )

        pin_ns = page.evaluate("""() => {
          try { window.HunanContract.assertPinNamespace(); return {ok: true, error: ''}; }
          catch (e) { return {ok: false, error: e.message}; }
        }""")
        check(pin_ns["ok"], "assertPinNamespace() 通过%s" % ("" if pin_ns["ok"] else "：" + pin_ns["error"]))

        rects = page.evaluate("""() => Array.from(document.querySelectorAll('.hunan-labels [data-hunan-zone]'))
          .map(el => { const r = el.getBoundingClientRect();
            return {id: el.getAttribute('data-hunan-zone'), left: r.left, right: r.right, top: r.top, bottom: r.bottom}; })""")
        overlaps = [
            rects[i]["id"] + " × " + rects[j]["id"]
            for i in range(len(rects))
            for j in range(i + 1, len(rects))
            if rects_overlap(rects[i], rects[j])
        ]
        check(not overlaps, "%d 个作业区标签两两不重叠（实际重叠对：%s）" % (len(rects), ", ".join(overlaps)))

        toggle = page.evaluate("() => document.querySelectorAll('[data-action=\\\"toggle-pipelines\\\"]').length")
        check(toggle == 0, "不渲染管道显示开关（实际 %s 个）" % toggle)
        check(info0["pipelineVisible"] is False, "3D 管道组不可见（实际 %s）" % info0["pipelineVisible"])
        check(info0["pipelineChildren"] == 0, "3D 管道组为空（实际 %s 个子对象）" % info0["pipelineChildren"])
        check(info0["zonePins"] == 0, "省域态不渲染 3D 作业区热点（实际 %s 个）" % info0["zonePins"])
        check(info0["sitePins"] == 0, "省域态不渲染 3D 站点热点（实际 %s 个）" % info0["sitePins"])
        check(info0["renderCalls"] < 200, "省域态 renderCalls < 200（实际 %s）" % info0["renderCalls"])
        check(info0["triangles"] < 260000, "省域态 triangles < 260000（实际 %s）" % info0["triangles"])

        page.screenshot(path=str(SHOT_DIR / "01-province.png"))

        # ---------------- D. 下钻联动（挑站点数最多的作业区 = 最坏路径） ----------------
        worst_zone = page.evaluate("""() => {
          let best = null, bestCount = -1;
          document.querySelectorAll('.hunan-labels [data-hunan-zone]').forEach(el => {
            const n = parseInt(el.querySelector('.zone-pin-count').textContent, 10);
            if (n > bestCount) { bestCount = n; best = el.getAttribute('data-hunan-zone'); }
          });
          return best;
        }""")
        page.evaluate(
            "(zoneId) => document.querySelector('.hunan-labels [data-hunan-zone=\"' + zoneId + '\"]').click()",
            worst_zone,
        )
        info_zone = wait_idle(page)

        check(info_zone["activeZoneId"] == worst_zone, "点击作业区 %s 后 activeZoneId 跟随（实际 %s）" % (worst_zone, info_zone["activeZoneId"]))

        drill = page.evaluate("""() => {
          const left = document.querySelector('.ov-left-col');
          const table = document.querySelector('.ov-list-card .ov-table');
          return {
            leftChildren: left ? left.children.length : -1,
            listCard: document.querySelectorAll('.ov-list-card').length,
            rows: table ? table.querySelectorAll('tbody tr').length : -1,
            cols: table ? table.querySelectorAll('thead th').length : -1,
            zoneStatusSlot: document.querySelectorAll('#chart-zone-status').length,
            labels: document.querySelectorAll('.hunan-labels [data-hunan-zone]').length,
            siteTotal: window.HunanSites.sitesByZone(window.HunanMap3D.debugInfo().activeZoneId).length,
            expectedRows: window.HunanSites.sitesByZone(window.HunanMap3D.debugInfo().activeZoneId)
                            .filter(s => s.status !== 'ok').length,
            clickableRows: table ? table.querySelectorAll('tbody tr[data-select-id], tbody tr[tabindex]').length : -1,
            headMeta: (document.querySelector('.ov-list-card-meta') || {}).textContent || ''
          };
        }""")
        check(drill["leftChildren"] == 4, "下钻态左栏仍恰好 4 块，布局不跳（实际 %s）" % drill["leftChildren"])
        check(drill["listCard"] == 1, "下钻态第 4 块换成站点清单卡 .ov-list-card（实际 %s 个）" % drill["listCard"])
        check(drill["rows"] == drill["expectedRows"], "「需关注站点」表只列非正常站点（实际 %s 行 / 期望 %s 行，该区共 %s 个站点）" % (drill["rows"], drill["expectedRows"], drill["siteTotal"]))
        check(drill["rows"] < drill["siteTotal"], "表里不再逐行列出全部站点（%s 行 < %s 个站点）" % (drill["rows"], drill["siteTotal"]))
        check(drill["cols"] == 3, "站点表 3 列（站点/介质/状态，实际 %s 列）" % drill["cols"])
        check(drill["headMeta"] == "%s / %s 站点" % (drill["expectedRows"], drill["siteTotal"]), "卡头 meta 同时给出需关注数与总数（实际「%s」）" % drill["headMeta"])
        check(drill["clickableRows"] == 0, "站点表是只读表：行不可选中、不可聚焦（实际可交互行 %s 个）" % drill["clickableRows"])
        check(drill["zoneStatusSlot"] == 0, "下钻态「作业区需关注站点」图从 DOM 移除（实际 %s 个）" % drill["zoneStatusSlot"])
        check(drill["labels"] == 1, "下钻态只保留当前作业区那一个标签（实际 %s 个）" % drill["labels"])
        check(info_zone["renderCalls"] < 200, "下钻态（%s，最坏路径）renderCalls < 200（实际 %s）" % (worst_zone, info_zone["renderCalls"]))
        check(info_zone["triangles"] < 260000, "下钻态 triangles < 260000（实际 %s）" % info_zone["triangles"])

        page.screenshot(path=str(SHOT_DIR / "02-zone-drilldown.png"))

        page.evaluate("() => document.querySelector('[data-action=\\\"back-to-overview\\\"]').click()")
        info_back = wait_idle(page)
        check(info_back["activeZoneId"] is None, "点「返回全省」后 activeZoneId 回到 null（实际 %s）" % info_back["activeZoneId"])
        back_slot = page.evaluate("() => document.querySelectorAll('#chart-zone-status').length")
        check(back_slot == 1, "返回全省后「作业区需关注站点」图回到 DOM（实际 %s 个）" % back_slot)

        # ---------------- E. 字量对比：v2 左栏 vs 旧版左栏 ----------------
        new_left_cjk = cjk_count(layout["leftText"])
        old_page = browser.new_page(viewport={"width": 1600, "height": 1000})
        old_page.goto(OLD_INDEX, wait_until="load")
        wait_idle(old_page)
        old_text = old_page.evaluate("""() => {
          const left = document.querySelector('.ov-left-col');
          const right = document.querySelector('.ov-right-col');
          return (left ? left.textContent : '') + (right ? right.textContent : '');
        }""")
        old_left_cjk = cjk_count(old_text)
        old_page.close()
        check(
            new_left_cjk < old_left_cjk,
            "v2 左栏中文字符数少于旧版左右两栏之和（v2 %d 字 / 旧版 %d 字）" % (new_left_cjk, old_left_cjk),
        )

        print("\n渲染预算实测：省域态 renderCalls=%s triangles=%s" % (info0["renderCalls"], info0["triangles"]))
        print("渲染预算实测：下钻态（%s，站点数最多）renderCalls=%s triangles=%s" % (worst_zone, info_zone["renderCalls"], info_zone["triangles"]))
        print("屏上字量：v2 左栏 %d 个中文字符，旧版左+右栏 %d 个" % (new_left_cjk, old_left_cjk))
        print("截图目录：%s" % SHOT_DIR)

        browser.close()

    print("\n===== 汇总：%d passed, %d failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % PASS)


if __name__ == "__main__":
    main()
