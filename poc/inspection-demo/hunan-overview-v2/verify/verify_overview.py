# 验收脚本：以 file:// 打开 index.html（不带任何 --allow-file-access-from-files，模拟
# 真实双击），断言五组事情：
#
#   A. 加载健康      pageerror 为空 / console.error 白名单外为空 / WebGL 上下文单例
#   B. 回字形骨架    四行五区都在、各区块数正确、旧结构类名全部不存在、已删文案检索不到
#   C. 3D 契约       [data-hunan-host] 恰好 1 个 / 标签数与顺序 === ZONE_IDS /
#                    assertPinNamespace 通过 / **标签两两不重叠** / 渲染预算
#   D. 焦点跟随      下钻时只有三处变（地图相机 / 右栏清单 / 作业区带高亮），
#                    上带与左栏**逐字不变**；作业区带卡片可下钻、再点一次弹回全省
#   E. 字量对比      v2 侧栏中文字符数 vs 旧版左右栏之和
#
# ⚠️ C 组里「6 个作业区标签两两不重叠」是**回字形这套布局的成立条件**，不是普通断言。
# 回字形上下各加一条内容带，中段高度从 1130 降到 949，而 3D 用的是固定角度的透视相机
# ——容器变矮就是整张地图等比缩小到约 84%，标签的投影间距同步缩小。
# styles/05-hunan3d.css 的硬契约第 5 条写明标签盒 52×35.64px、minDy≈43.6px 才够排开，
# 而 engine.js 的 sweepLabels 不是收敛循环（写成 while(changed) 会因浮点误差死锁整页），
# 一趟推不开就是推不开。这一项红了，退路顺序是：① 压薄 .ov-zone-band（132 → 100）把
# 高度还给地图；② 还不够就把作业区带挪进侧栏、退回三栏。**不要去改 3D 机位。**
#
# 为什么是 Python 而不是像旧目录那样用 Node：Node 的 playwright 在本机只能从 npx 缓存
# 目录解析（机器本地路径，不可移植），而本仓库 .venv 里装了 Python Playwright，
# poc/inspection-demo/diagnosis-flow/verify/verify_flow.py 已经是同一条路。
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
def wait_idle(page, timeout_ms=25000):
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


def label_rects(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.hunan-labels [data-hunan-zone]')).map(el => {
             const r = el.getBoundingClientRect();
             return {id: el.getAttribute('data-hunan-zone'), left: r.left, right: r.right, top: r.top, bottom: r.bottom};
           })"""
    )


def overlap_pairs(rects):
    return [
        rects[i]["id"] + " × " + rects[j]["id"]
        for i in range(len(rects))
        for j in range(i + 1, len(rects))
        if rects_overlap(rects[i], rects[j])
    ]


# 只数中日韩统一表意文字，不数标点、数字、英文——用来对比两版屏上的「字量」。
CJK_RE = re.compile(r"[一-鿿]")


def cjk_count(text):
    return len(CJK_RE.findall(text))


# 上带 + 左栏的完整文本快照。下钻前后必须逐字相同——这是回字形「全省基准常驻」这条
# 设计的可执行断言，不是靠人眼看。
SNAPSHOT_JS = """() => {
  const band = document.querySelector('.ov-stat-band');
  const left = document.querySelector('.ov-left-col');
  return (band ? band.textContent : '') + '||' + (left ? left.textContent : '');
}"""


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

        # ---------------- B. 回字形骨架 ----------------
        layout = page.evaluate("""() => {
          const root = document.getElementById('appRoot');
          const scene = document.querySelector('.overview-scene');
          const body = document.body.textContent;
          return {
            rootRows: root ? root.children.length : -1,
            rootOrder: root ? Array.from(root.children).map(el => el.className.split(' ').filter(c => c.startsWith('ov-') || c === 'topbar' || c === 'stage')[0] || el.tagName.toLowerCase()) : [],
            sceneCols: scene ? scene.children.length : -1,
            statMetrics: document.querySelectorAll('.ov-stat-band .card-metric').length,
            leftBlocks: document.querySelectorAll('.ov-left-col > *').length,
            rightBlocks: document.querySelectorAll('.ov-right-col > *').length,
            zoneCards: document.querySelectorAll('.ov-zone-band .ov-zone-card').length,
            mapPlace: document.querySelectorAll('.hunan-map .ov-map-place').length,
            legendInMap: document.querySelectorAll('.hunan-map .ov-legend').length,
            mapHead: document.querySelectorAll('.ov-map-head').length,
            legacy: {
              bottombar: document.querySelectorAll('.bottombar').length,
              crumbs: document.querySelectorAll('.crumbs').length,
              wing: document.querySelectorAll('.topbar-wing').length,
              qualityCard: document.querySelectorAll('.ov-quality-card').length,
              detailCard: document.querySelectorAll('.card-detail').length,
              rankCard: document.querySelectorAll('.ov-rank-card').length,
              selectList: document.querySelectorAll('.sl, .sl-table, .sl-item').length
            },
            slots: {
              completion: document.querySelectorAll('#chart-completion').length,
              exception: document.querySelectorAll('#chart-exception').length,
              ledger: document.querySelectorAll('#chart-ledger').length,
              zoneStatus: document.querySelectorAll('#chart-zone-status').length
            },
            chartInstances: window.Charts.debugInfo().instances,
            zonePinOutsideLabels: document.querySelectorAll('[data-hunan-zone]').length
                                  - document.querySelectorAll('.hunan-labels [data-hunan-zone]').length,
            deletedCopy: [
              'HUNAN OIL & GAS NETWORK OVERVIEW',
              '动态趋势',
              '作业区巡检覆盖率',
              '区域质量热区',
              '两级钻取',
              '示意坐标',
              '巡检质量保障',
              '点击下钻',
              '所在市'
            ].filter(s => body.indexOf(s) >= 0)
          };
        }""")

        check(layout["rootRows"] == 4, "回字形四行都在 #appRoot 下（顶栏/指标带/中段/作业区带，实际 %s 个）" % layout["rootRows"])
        check(
            layout["rootOrder"] == ["topbar", "ov-stat-band", "stage", "ov-zone-band"],
            "四行顺序与 grid-template-rows 一致（实际 %s）" % json.dumps(layout["rootOrder"], ensure_ascii=False),
        )
        check(layout["sceneCols"] == 3, "中段三列（左栏/地图/右栏，实际 %s）" % layout["sceneCols"])
        check(layout["statMetrics"] == 4, "上带 4 个大数（实际 %s）" % layout["statMetrics"])
        check(layout["leftBlocks"] == 3, "左栏 3 块图（实际 %s）" % layout["leftBlocks"])
        check(layout["rightBlocks"] == 1, "右栏整格 1 块清单（实际 %s）" % layout["rightBlocks"])
        check(layout["zoneCards"] == 6, "下带 6 张作业区卡（实际 %s）" % layout["zoneCards"])
        check(layout["mapPlace"] == 1, "位置标签浮在地图内（.hunan-map .ov-map-place，实际 %s 个）" % layout["mapPlace"])
        check(layout["legendInMap"] == 1, "图例浮在地图内（实际 %s 个）" % layout["legendInMap"])
        check(layout["mapHead"] == 0, "不再渲染 .ov-map-head 那一行（实际 %s 个）" % layout["mapHead"])
        check(
            layout["zonePinOutsideLabels"] == 0,
            "[data-hunan-zone] 全部落在 .hunan-labels 内 —— 作业区卡用的是 data-action=select-zone（越界 %s 个）" % layout["zonePinOutsideLabels"],
        )
        for key, label in [
            ("bottombar", "底栏 .bottombar"),
            ("crumbs", "面包屑 .crumbs"),
            ("wing", "顶栏装饰翼 .topbar-wing"),
            ("qualityCard", "旧巡检质量保障卡 .ov-quality-card"),
            ("detailCard", "旧右下详情卡 .card-detail"),
            ("rankCard", "旧作业区排名表 .ov-rank-card"),
            ("selectList", "SelectList 一族 .sl/.sl-table/.sl-item"),
        ]:
            check(layout["legacy"][key] == 0, "已删除：%s（实际 %s 个）" % (label, layout["legacy"][key]))
        check(not layout["deletedCopy"], "已删文案在页面文本里检索不到（实际残留：%s）" % ", ".join(layout["deletedCopy"]))
        check(
            layout["slots"] == {"completion": 1, "exception": 1, "ledger": 1, "zoneStatus": 0},
            "三个图表槽位各 1 个、旧的 chart-zone-status 不存在（实际 %s）" % json.dumps(layout["slots"], ensure_ascii=False),
        )
        check(layout["chartInstances"] == 3, "ECharts 实例恰好 3 个（实际 %s）" % layout["chartInstances"])

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
            ".hunan-labels 内标签数与顺序 === ZONE_IDS（实际 [%s]）" % ",".join(zone_order["ids"]),
        )

        pin_ns = page.evaluate("""() => {
          try { window.HunanContract.assertPinNamespace(); return {ok: true, error: ''}; }
          catch (e) { return {ok: false, error: e.message}; }
        }""")
        check(pin_ns["ok"], "assertPinNamespace() 通过%s" % ("" if pin_ns["ok"] else "：" + pin_ns["error"]))

        province_overlaps = overlap_pairs(label_rects(page))
        check(
            not province_overlaps,
            "【回字形成立条件】省域态 6 个作业区标签两两不重叠（实际重叠对：%s）" % ", ".join(province_overlaps),
        )

        map_box = page.evaluate("""() => {
          const el = document.querySelector('.hunan-map');
          const r = el.getBoundingClientRect();
          const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--screen-scale'));
          return {w: Math.round(r.width / scale), h: Math.round(r.height / scale)};
        }""")
        check(map_box["h"] > 880, "地图容器设计高度仍大于 880（实际 %s，回字形上下带各让掉一部分）" % map_box["h"])

        toggle = page.evaluate("() => document.querySelectorAll('[data-action=\\\"toggle-pipelines\\\"]').length")
        check(toggle == 0, "不渲染管道显示开关（实际 %s 个）" % toggle)
        check(info0["pipelineVisible"] is False, "3D 管道组不可见（实际 %s）" % info0["pipelineVisible"])
        check(info0["pipelineChildren"] == 0, "3D 管道组为空（实际 %s 个子对象）" % info0["pipelineChildren"])
        check(info0["zonePins"] == 0, "省域态不渲染 3D 作业区热点（实际 %s 个）" % info0["zonePins"])
        check(info0["sitePins"] == 0, "省域态不渲染 3D 站点热点（实际 %s 个）" % info0["sitePins"])
        check(info0["renderCalls"] < 200, "省域态 renderCalls < 200（实际 %s）" % info0["renderCalls"])
        check(info0["triangles"] < 260000, "省域态 triangles < 260000（实际 %s）" % info0["triangles"])

        province_alerts = page.evaluate("""() => {
          const table = document.querySelector('.ov-right-col .ov-table');
          const expected = window.HunanContract.ZONE_IDS
            .flatMap(z => window.HunanSites.sitesByZone(z))
            .filter(s => s.status !== 'ok').length;
          return {
            rows: table ? table.querySelectorAll('tbody tr').length : -1,
            cols: table ? table.querySelectorAll('thead th').length : -1,
            headers: table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent) : [],
            expected: expected,
            siteTotal: window.HunanSites.sites().length,
            meta: (document.querySelector('.ov-list-card-meta') || {}).textContent || '',
            clickable: table ? table.querySelectorAll('tbody tr[data-select-id], tbody tr[tabindex]').length : -1
          };
        }""")
        check(province_alerts["rows"] == province_alerts["expected"], "省域态清单只列全省非正常站点（实际 %s 行 / 期望 %s）" % (province_alerts["rows"], province_alerts["expected"]))
        check(province_alerts["rows"] < province_alerts["siteTotal"], "清单不逐行列出全部站点（%s 行 < %s 个站点）" % (province_alerts["rows"], province_alerts["siteTotal"]))
        check(province_alerts["headers"] == ["作业区", "站点", "介质", "状态"], "省域态列头 = 作业区/站点/介质/状态（实际 %s）" % json.dumps(province_alerts["headers"], ensure_ascii=False))
        check(province_alerts["meta"] == "%s / %s 站点" % (province_alerts["expected"], province_alerts["siteTotal"]), "卡头 meta 同时给出需关注数与总数（实际「%s」）" % province_alerts["meta"])
        check(province_alerts["clickable"] == 0, "清单是只读表：行不可选中、不可聚焦（实际可交互行 %s 个）" % province_alerts["clickable"])

        baseline = page.evaluate(SNAPSHOT_JS)
        province_left_cjk = cjk_count(baseline.replace("||", ""))
        province_right_cjk = cjk_count(page.evaluate("() => document.querySelector('.ov-right-col').textContent"))

        page.screenshot(path=str(SHOT_DIR / "01-province.png"))

        # ---------------- D. 焦点跟随（点下带卡片下钻，挑站点数最多的作业区） ----------------
        worst_zone = page.evaluate("""() => {
          const rows = window.HunanSeries.zoneStatusMix();
          let best = null, bestCount = -1;
          rows.forEach(r => { const n = r.ok + r.warn + r.danger; if (n > bestCount) { bestCount = n; best = r.zoneId; } });
          return best;
        }""")
        page.evaluate(
            "(zoneId) => document.querySelector('.ov-zone-band [data-action=\"select-zone\"][data-zone-id=\"' + zoneId + '\"]').click()",
            worst_zone,
        )
        info_zone = wait_idle(page)
        check(info_zone["activeZoneId"] == worst_zone, "点下带作业区卡（%s）后 activeZoneId 跟随（实际 %s）" % (worst_zone, info_zone["activeZoneId"]))

        drill = page.evaluate("""() => {
          const table = document.querySelector('.ov-right-col .ov-table');
          const zoneId = window.HunanMap3D.debugInfo().activeZoneId;
          const list = window.HunanSites.sitesByZone(zoneId);
          return {
            rootRows: document.getElementById('appRoot').children.length,
            leftBlocks: document.querySelectorAll('.ov-left-col > *').length,
            rightBlocks: document.querySelectorAll('.ov-right-col > *').length,
            zoneCards: document.querySelectorAll('.ov-zone-band .ov-zone-card').length,
            activeCards: document.querySelectorAll('.ov-zone-band .ov-zone-card.is-active').length,
            activeCardZone: (document.querySelector('.ov-zone-band .ov-zone-card.is-active') || {dataset: {}}).dataset.zoneId,
            rows: table ? table.querySelectorAll('tbody tr').length : -1,
            headers: table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent) : [],
            expectedRows: list.filter(s => s.status !== 'ok').length,
            siteTotal: list.length,
            meta: (document.querySelector('.ov-list-card-meta') || {}).textContent || '',
            labels: document.querySelectorAll('.hunan-labels [data-hunan-zone]').length,
            place: (document.querySelector('.ov-map-place h3') || {}).textContent || '',
            chartInstances: window.Charts.debugInfo().instances
          };
        }""")
        check(drill["rootRows"] == 4, "下钻态仍是四行，骨架不变（实际 %s）" % drill["rootRows"])
        check(drill["leftBlocks"] == 3 and drill["rightBlocks"] == 1, "下钻态左 3 块 / 右 1 块，容器数不变（实际 %s / %s）" % (drill["leftBlocks"], drill["rightBlocks"]))
        check(drill["zoneCards"] == 6 and drill["activeCards"] == 1, "下带仍 6 张卡、恰好 1 张高亮（实际 %s / %s）" % (drill["zoneCards"], drill["activeCards"]))
        check(drill["activeCardZone"] == worst_zone, "高亮的是被点的那张卡（实际 %s）" % drill["activeCardZone"])
        check(drill["chartInstances"] == 3, "下钻态 ECharts 实例仍是 3 个，没有增删（实际 %s）" % drill["chartInstances"])
        check(drill["rows"] == drill["expectedRows"], "下钻清单只列该区非正常站点（实际 %s 行 / 期望 %s，该区共 %s 站）" % (drill["rows"], drill["expectedRows"], drill["siteTotal"]))
        check(drill["headers"] == ["站点", "类型", "介质", "状态"], "下钻态列头换成 站点/类型/介质/状态（实际 %s）" % json.dumps(drill["headers"], ensure_ascii=False))
        check(drill["meta"] == "%s / %s 站点" % (drill["expectedRows"], drill["siteTotal"]), "下钻卡头 meta（实际「%s」）" % drill["meta"])
        check(drill["labels"] == 1, "下钻态只保留当前作业区那一个地图标签（实际 %s 个）" % drill["labels"])
        check("作业区" in drill["place"], "地图内位置标签切到作业区名（实际「%s」）" % drill["place"])
        check(info_zone["renderCalls"] < 200, "下钻态（%s，站点最多）renderCalls < 200（实际 %s）" % (worst_zone, info_zone["renderCalls"]))
        check(info_zone["triangles"] < 260000, "下钻态 triangles < 260000（实际 %s）" % info_zone["triangles"])

        # 这条是回字形「全省基准常驻」的可执行断言
        after = page.evaluate(SNAPSHOT_JS)
        check(after == baseline, "下钻后上带与左栏逐字不变（全省基准常驻，可与该区数据对读）")

        page.screenshot(path=str(SHOT_DIR / "02-zone-drilldown.png"))

        # 再点同一张卡 = 弹回全省
        page.evaluate(
            "(zoneId) => document.querySelector('.ov-zone-band [data-action=\"select-zone\"][data-zone-id=\"' + zoneId + '\"]').click()",
            worst_zone,
        )
        info_back = wait_idle(page)
        check(info_back["activeZoneId"] is None, "再点同一张作业区卡 = 弹回全省（实际 %s）" % info_back["activeZoneId"])
        back_overlaps = overlap_pairs(label_rects(page))
        check(not back_overlaps, "返回全省后 6 个标签仍两两不重叠（实际重叠对：%s）" % ", ".join(back_overlaps))

        # 地图右下角的 ‹ 也能返回（下钻一次再用它退）
        page.evaluate(
            "(zoneId) => document.querySelector('.hunan-labels [data-hunan-zone=\"' + zoneId + '\"]').click()",
            worst_zone,
        )
        wait_idle(page)
        page.evaluate("() => document.querySelector('[data-action=\\\"back-to-overview\\\"]').click()")
        info_back2 = wait_idle(page)
        check(info_back2["activeZoneId"] is None, "地图标签下钻 + 地图右下角 ‹ 返回，两条路径都通（实际 %s）" % info_back2["activeZoneId"])

        # ---------------- E. 字量对比 ----------------
        old_page = browser.new_page(viewport={"width": 1600, "height": 1000})
        old_page.goto(OLD_INDEX, wait_until="load")
        wait_idle(old_page)
        old_cjk = cjk_count(old_page.evaluate("""() => {
          const left = document.querySelector('.ov-left-col');
          const right = document.querySelector('.ov-right-col');
          return (left ? left.textContent : '') + (right ? right.textContent : '');
        }"""))
        old_page.close()
        new_side_cjk = province_left_cjk + province_right_cjk
        check(new_side_cjk < old_cjk, "v2 上带+左栏+右栏中文字符数少于旧版左右两栏之和（v2 %d 字 / 旧版 %d 字）" % (new_side_cjk, old_cjk))

        print("\n渲染预算实测：省域态 renderCalls=%s triangles=%s" % (info0["renderCalls"], info0["triangles"]))
        print("渲染预算实测：下钻态（%s）renderCalls=%s triangles=%s" % (worst_zone, info_zone["renderCalls"], info_zone["triangles"]))
        print("地图容器（设计像素）：%s × %s" % (map_box["w"], map_box["h"]))
        print("屏上字量：v2 侧栏合计 %d 个中文字符，旧版左+右栏 %d 个" % (new_side_cjk, old_cjk))
        print("截图目录：%s" % SHOT_DIR)

        browser.close()

    print("\n===== 汇总：%d passed, %d failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % PASS)


if __name__ == "__main__":
    main()
