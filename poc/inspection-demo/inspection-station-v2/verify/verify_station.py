# 验收脚本：以 file:// 打开 index.html（不带任何 --allow-file-access-from-files，模拟
# 真实双击），断言五组事情：
#
#   A. 加载健康      pageerror 为空 / console.error 白名单外为空 / WebGL 上下文单例
#   B. 回字形骨架    四行五区都在、各区块数正确、旧结构类名全部不存在、已删文案检索不到
#   C. 3D 契约       [data-map3d-host] 恰好 1 个 / 12 个热点数与顺序 === AREA_IDS /
#                    assertPinNamespace / **热点两两不重叠** / **逐区高亮不抛错** / 渲染预算
#   D. 质量数据自洽  最后一轮的 planned/issues/p1/minutes 逐条等于真实数据现算值 /
#                    合规率派生正确 / 明细逐类条数等于最后一轮 / 明细表行数与列头
#   E. 焦点跟随      下钻时只有三处变（平面图高亮 / 右栏 / 区域带高亮），上带与左栏
#                    **逐字不变**；两个下钻入口 + 两条返回路径都通
#
# ⚠️ C 组里两条是这套布局与这次修复的成立条件，不是普通断言：
#
#   1)「12 个区域热点两两不重叠」—— 回字形上下各加一条内容带，中段高度下降，而 2.5D 用
#      固定角度的透视相机，容器变矮就是整张平面图等比缩小、热点投影间距同步缩小。
#      styles/05-map3d.css 是禁改区，engine.js 的 sweepLabels 不是收敛循环（写成
#      while(changed) 会因浮点误差死锁整页），一趟推不开就是推不开。这一项红了，退路是
#      ① 压薄 .st-area-band（132 → 100）② 还不够就退回三栏。**不要改 3D 机位。**
#
#   2)「逐区高亮不抛错」—— 这是 2026-08-23 修的那个既有 bug 的回归测试。修之前，四个
#      tank 区的罐号铭牌用 MeshBasicMaterial（无 emissive 通道）却落在 areaMeshes 里，
#      cacheAndApplySelection 在 `material.emissive.clone()` 抛 TypeError；而
#      setActiveAreaHighlight 在那之前就已经把 engine.activeAreaId 写成了目标区域，
#      于是 selectionCache 永远没建立，之后每次切区都在 restoreSelection 里再抛一次，
#      级联成 12 个区全部无法选中。这一项必须逐个区都跑一遍，只测一个区测不出级联。
#
# 用法：uv run python poc/inspection-demo/inspection-station-v2/verify/verify_station.py
# 自定义截图目录：SHOT_DIR=/some/dir uv run python .../verify_station.py
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
INDEX = (HERE.parent / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "inspection-station-v2-verify"))

# 窄字符串白名单：只放 three r160 的弃用横幅与 swiftshader / GL Driver 提示。
# 不做宽松的 startswith("THREE.")——纹理污染的失败恰好以 "THREE.WebGLState: SecurityError"
# 开头，宽松匹配会把 file:// 下最可能发生的那个 bug 直接藏掉。
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


# 轮询等到 debugInfo().idle 为真 —— 不做固定等待（固定等待在本项目的姐妹脚本里出现过
# "frames 344->347" 这类 flaky 失败）。
#
# 这里**只**轮询 idle，不在等待函数里顺手复核「frames 不再涨」。原因：
# debugInfo().idle 就是 !engine.dirty 一个标志，而区域选中态的热点脉冲
# （engine.js 的 updateHotspotPulse）会周期性地重新置脏 —— 选中一个区域之后，
# idle 会在真/假之间正常地来回跳，frames 每隔一会儿 +1 是**按需渲染的正确行为**，
# 不是「没收敛」。把 frames 稳定塞进每次等待，等于把一个正常状态断言成失败
# （实测就是在这里红的：70 → 71）。
#
# 「停下来之后真的不再画」这条仍然要验，但它属于一次独立断言：把视角复位、
# 清掉选中态（脉冲随之停），再取基线静置比对。见 main() 末尾的 idle 收敛那一节。
def wait_idle(page, timeout_ms=30000):
    return page.wait_for_function(
        "() => { const i = window.Map3D.debugInfo(); return i.idle ? i : null; }",
        timeout=timeout_ms,
    ).json_value()


def rects_overlap(a, b):
    return not (
        a["right"] <= b["left"]
        or b["right"] <= a["left"]
        or a["bottom"] <= b["top"]
        or b["bottom"] <= a["top"]
    )


def pin_rects(page):
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('.map3d-labels [data-map3d-area]')).map(el => {
             const r = el.getBoundingClientRect();
             return {id: el.getAttribute('data-map3d-area'), left: r.left, right: r.right, top: r.top, bottom: r.bottom};
           })"""
    )


def overlap_pairs(rects):
    return [
        rects[i]["id"] + " × " + rects[j]["id"]
        for i in range(len(rects))
        for j in range(i + 1, len(rects))
        if rects_overlap(rects[i], rects[j])
    ]


# 上带 + 左栏的完整文本快照。下钻前后必须逐字相同 —— 这是回字形「全站基准常驻」这条
# 设计的可执行断言，不是靠人眼看。
SNAPSHOT_JS = """() => {
  const band = document.querySelector('.st-stat-band');
  const left = document.querySelector('.st-left-col');
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
          const scene = document.querySelector('.station-scene');
          const body = document.body.textContent;
          return {
            rootRows: root ? root.children.length : -1,
            rootOrder: root ? Array.from(root.children).map(el =>
              Array.from(el.classList).filter(c => c.startsWith('st-') || c === 'topbar' || c === 'stage')[0]
              || el.tagName.toLowerCase()) : [],
            sceneCols: scene ? scene.children.length : -1,
            statMetrics: document.querySelectorAll('.st-stat-band .card-metric').length,
            leftBlocks: document.querySelectorAll('.st-left-col > *').length,
            rightBlocks: document.querySelectorAll('.st-right-col > *').length,
            areaCards: document.querySelectorAll('.st-area-band .st-area-card').length,
            mapPlace: document.querySelectorAll('.station-map .st-map-place').length,
            legendInMap: document.querySelectorAll('.station-map .map-legend').length,
            legendItems: document.querySelectorAll('.station-map .map-legend .map-legend-item').length,
            legacy: {
              mapHead: document.querySelectorAll('.station-map-head').length,
              submitBanner: document.querySelectorAll('.map-submit-banner').length,
              taskCard: document.querySelectorAll('.task-card').length,
              flowRail: document.querySelectorAll('.flow-rail').length,
              actionBar: document.querySelectorAll('.action-bar, .map-actionbar').length,
              detailCard: document.querySelectorAll('.card-detail').length,
              evidence: document.querySelectorAll('.card-evidence').length,
              selectList: document.querySelectorAll('.sl, .sl-item').length,
              areaListPanel: document.querySelectorAll('.area-list-panel').length
            },
            slots: {
              compliance: document.querySelectorAll('#chart-compliance-trend').length,
              behavior: document.querySelectorAll('#chart-behavior-by-round').length,
              minutes: document.querySelectorAll('#chart-minutes-trend').length,
              legacyProgress: document.querySelectorAll('#chart-area-progress, #chart-duration-by-area, #chart-item-type-mix').length
            },
            statNotes: Array.from(document.querySelectorAll('.st-stat-band .card-metric-note')).map(e => e.textContent),
            chartInstances: window.Charts.debugInfo().instances,
            pinOutsideLabels: document.querySelectorAll('[data-map3d-area]').length
                              - document.querySelectorAll('.map3d-labels [data-map3d-area]').length,
            deletedCopy: [
              '站点平面图 / 区域态势',
              '巡检区域提交情况',
              '巡检区域 / 提交情况',
              '12 区完成率',
              '巡检耗时曲线',
              '巡检项型分布',
              'AI 只组织证据',
              '点击地图热点或左侧列表',
              '使用作业区级示意坐标',
              'AI 监控视角',
              '人工复核量',
              'AI 前置筛查'
            ].filter(s => body.indexOf(s) >= 0)
          };
        }""")

        check(layout["rootRows"] == 4, "回字形四行都在 #appRoot 下（顶栏/AI 指标带/中段/区域带，实际 %s 个）" % layout["rootRows"])
        check(
            layout["rootOrder"] == ["topbar", "st-stat-band", "stage", "st-area-band"],
            "四行顺序与 grid-template-rows 一致（实际 %s）" % json.dumps(layout["rootOrder"], ensure_ascii=False),
        )
        check(layout["sceneCols"] == 3, "中段三列（左栏/平面图/右栏，实际 %s）" % layout["sceneCols"])
        check(layout["statMetrics"] == 4, "上带 4 个监督指标（实际 %s）" % layout["statMetrics"])
        check(len(layout["statNotes"]) == 4, "上带 4 个指标**每个都带 note**（趋势对比，实际 %s 条）" % len(layout["statNotes"]))
        check(layout["leftBlocks"] == 3, "左栏 3 块趋势图（实际 %s）" % layout["leftBlocks"])
        check(layout["rightBlocks"] == 1, "右栏整格 1 块（实际 %s）" % layout["rightBlocks"])
        check(layout["areaCards"] == 12, "下带 12 张区域卡（实际 %s）" % layout["areaCards"])
        check(layout["mapPlace"] == 1, "位置标签浮在平面图内（实际 %s 个）" % layout["mapPlace"])
        check(layout["legendInMap"] == 1, "图例浮在平面图内（实际 %s 个）" % layout["legendInMap"])
        check(layout["legendItems"] == 4, "图例砍到 4 项：三色状态 + 巡检轨迹（实际 %s 项）" % layout["legendItems"])
        check(
            layout["pinOutsideLabels"] == 0,
            "[data-map3d-area] 全部落在 .map3d-labels 内 —— 区域卡用的是 data-action=select-area（越界 %s 个）" % layout["pinOutsideLabels"],
        )
        for key, label in [
            ("mapHead", "地图头 .station-map-head"),
            ("submitBanner", "提交情况横幅 .map-submit-banner"),
            ("taskCard", "顶栏任务卡 .task-card"),
            ("flowRail", "底部流程轨 .flow-rail"),
            ("actionBar", "地图悬浮状态栏"),
            ("detailCard", "区域详情卡 .card-detail"),
            ("evidence", "证据卡 .card-evidence"),
            ("selectList", "SelectList 一族"),
            ("areaListPanel", "左栏 12 区竖列表 .area-list-panel"),
        ]:
            check(layout["legacy"][key] == 0, "已删除：%s（实际 %s 个）" % (label, layout["legacy"][key]))
        check(not layout["deletedCopy"], "已删文案在页面文本里检索不到（实际残留：%s）" % ", ".join(layout["deletedCopy"]))
        check(
            layout["slots"] == {"compliance": 1, "behavior": 1, "minutes": 1, "legacyProgress": 0},
            "三个趋势图槽位各 1 个、三个旧槽位都不存在（实际 %s）" % json.dumps(layout["slots"], ensure_ascii=False),
        )
        check(layout["chartInstances"] == 3, "ECharts 实例恰好 3 个（实际 %s）" % layout["chartInstances"])

        # ---------------- C. 3D 契约 ----------------
        host_count = page.evaluate("() => document.querySelectorAll('[data-map3d-host]').length")
        check(host_count == 1, "[data-map3d-host] 恰好 1 个（实际 %s）" % host_count)

        pin_order = page.evaluate("""() => ({
          ids: Array.from(document.querySelectorAll('.map3d-labels [data-map3d-area]'))
                    .map(el => el.getAttribute('data-map3d-area')),
          expected: window.Map3DContract.AREA_IDS
        })""")
        check(
            pin_order["ids"] == pin_order["expected"],
            ".map3d-labels 内热点数与顺序 === AREA_IDS（实际 %d 个）" % len(pin_order["ids"]),
        )

        pin_ns = page.evaluate("""() => {
          try { window.Map3DContract.assertPinNamespace(); return {ok: true, error: ''}; }
          catch (e) { return {ok: false, error: e.message}; }
        }""")
        check(pin_ns["ok"], "assertPinNamespace() 通过%s" % ("" if pin_ns["ok"] else "：" + pin_ns["error"]))

        overview_overlaps = overlap_pairs(pin_rects(page))
        check(
            not overview_overlaps,
            "【回字形成立条件】全景态 12 个区域热点两两不重叠（实际重叠对：%s）" % ", ".join(overview_overlaps),
        )

        # 逐区高亮回归测试（见文件头第 2 条）：必须 12 个区都跑，只测一个测不出级联。
        highlight = page.evaluate("""() => {
          const bad = [];
          window.Map3DContract.AREA_IDS.forEach(id => {
            try { window.Map3D.setActiveArea(id); }
            catch (e) { bad.push(id + ': ' + e.message); }
          });
          try { window.Map3D.setActiveArea(null); } catch (e) { bad.push('null: ' + e.message); }
          return bad;
        }""")
        check(
            not highlight,
            "【回归】逐区 setActiveArea 全部不抛错（罐号铭牌 MeshBasicMaterial 无 emissive 那个 bug，实际失败：%s）" % ", ".join(highlight),
        )

        map_box = page.evaluate("""() => {
          const el = document.querySelector('.station-map');
          const r = el.getBoundingClientRect();
          const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--screen-scale'));
          return {w: Math.round(r.width / scale), h: Math.round(r.height / scale)};
        }""")
        check(map_box["h"] > 880, "平面图容器设计高度仍大于 880（实际 %s）" % map_box["h"])

        check(info0["renderCalls"] < 260, "全景态 renderCalls < 260（实际 %s）" % info0["renderCalls"])
        check(info0["triangles"] < 260000, "全景态 triangles < 260000（实际 %s）" % info0["triangles"])

        # ---------------- D. 质量数据自洽 ----------------
        q = page.evaluate("""() => {
          const Q = window.StationQuality;
          const rounds = Q.rounds();
          const c = Q.current();
          const details = Q.details();
          const byKind = {};
          Q.KINDS.forEach(k => { byKind[k.key] = details.filter(d => d.kind === k.key).length; });
          let danger = 0;
          window.Map3DContract.AREA_IDS.forEach(id => window.DemoItems[id].forEach(it => {
            if (it.status === 'danger') danger += 1;
          }));
          const table = document.querySelector('.st-right-col .st-table');
          return {
            roundCount: rounds.length,
            current: c,
            byKind: byKind,
            real: {
              planned: window.Map3DContract.TOTAL_ITEMS,
              issues: window.DemoStation.stationProgress().issueCount,
              p1: danger,
              minutes: window.DemoTrack.track().durationMin,
              date: window.DemoTask.task().actualStart.slice(0, 10)
            },
            detailCount: details.length,
            areasWithoutDetails: window.Map3DContract.AREA_IDS.filter(id => Q.detailsByArea(id).length === 0).length,
            rows: table ? table.querySelectorAll('tbody tr').length : -1,
            headers: table ? Array.from(table.querySelectorAll('thead th')).map(th => th.textContent) : [],
            clickableRows: table ? table.querySelectorAll('tbody tr[data-select-id], tbody tr[tabindex]').length : -1,
            firstItemCellHasTitle: table ? !!table.querySelector('tbody tr td:nth-child(3)').getAttribute('title') : false
          };
        }""")

        c = q["current"]
        real = q["real"]
        check(q["roundCount"] >= 2, "轮次序列至少 2 轮才能算「较上轮」（实际 %s 轮）" % q["roundCount"])
        # 这四条是「最右那一轮就是屏上这一轮」的锚点。data/quality.js 在加载时也断言过一遍，
        # 这里再验一次是因为那份断言只在 Node/浏览器加载期跑，回归时希望验收脚本自己也说得清。
        for key, label in [("planned", "计划巡检项"), ("issues", "发现问题数"), ("p1", "当前 P1"), ("minutes", "本轮用时")]:
            check(c[key] == real[key], "本轮 %s = %s，等于真实数据现算值 %s" % (label, c[key], real[key]))
        check(c["date"] == real["date"], "本轮日期 %s = 任务卡的实际开始日期 %s" % (c["date"], real["date"]))
        check(
            c["valid"] + c["invalid"] == c["planned"],
            "有效项 + 无效项 = 计划项（%s + %s = %s）" % (c["valid"], c["invalid"], c["planned"]),
        )
        check(
            c["invalid"] == c["duration"] + c["interval"] + c["offWindow"],
            "行为异常合计 = 时长 + 间隔 + 时段（%s = %s + %s + %s）" % (c["invalid"], c["duration"], c["interval"], c["offWindow"]),
        )
        check(
            abs(c["complianceRate"] - round(c["valid"] / c["planned"] * 100, 1)) < 0.05,
            "合规率 %s%% = 有效项 / 计划项" % c["complianceRate"],
        )
        check(c["p1"] <= c["issues"], "P1 项数不超过发现问题数（%s <= %s）" % (c["p1"], c["issues"]))
        mismatch = [k for k in q["byKind"] if q["byKind"][k] != c[k]]
        check(not mismatch, "明细的逐类条数等于本轮各字段（不一致的类：%s）" % ", ".join(mismatch))
        check(q["detailCount"] == c["invalid"] + c["aiAlerts"], "明细总条数 = 行为异常 + AI 提醒（%s = %s + %s）" % (q["detailCount"], c["invalid"], c["aiAlerts"]))
        check(q["rows"] == q["detailCount"], "明细表行数 === 明细条数（实际 %s / %s）" % (q["rows"], q["detailCount"]))
        check(q["headers"] == ["区域", "判定", "巡检项", "实测"], "明细表列头 = 区域/判定/巡检项/实测（实际 %s）" % json.dumps(q["headers"], ensure_ascii=False))
        check(q["clickableRows"] == 0, "明细表是只读表：行不可选中、不可聚焦（实际可交互行 %s 个）" % q["clickableRows"])
        check(q["firstItemCellHasTitle"], "巡检项列每格带 title，长文本被截断时悬停可见全文")
        check(q["areasWithoutDetails"] > 0, "存在本轮零标记的区域 —— 「该区本轮无标记」是可达状态而非空占位（实际 %s 个区）" % q["areasWithoutDetails"])

        baseline = page.evaluate(SNAPSHOT_JS)
        page.screenshot(path=str(SHOT_DIR / "01-station-overview.png"))

        # ---------------- E. 焦点跟随（点下带区域卡下钻，挑巡检项最多的区） ----------------
        worst_area = page.evaluate("""() => {
          let best = null, bestCount = -1;
          window.DemoStation.areas().forEach(a => { if (a.itemTotal > bestCount) { bestCount = a.itemTotal; best = a.id; } });
          return best;
        }""")
        page.evaluate(
            "(areaId) => document.querySelector('.st-area-band [data-action=\"select-area\"][data-area-id=\"' + areaId + '\"]').click()",
            worst_area,
        )
        info_area = wait_idle(page)
        check(info_area["activeAreaId"] == worst_area, "点下带区域卡（%s）后 activeAreaId 跟随（实际 %s）" % (worst_area, info_area["activeAreaId"]))

        drill = page.evaluate("""() => {
          const areaId = window.Map3D.debugInfo().activeAreaId;
          return {
            rootRows: document.getElementById('appRoot').children.length,
            leftBlocks: document.querySelectorAll('.st-left-col > *').length,
            rightBlocks: document.querySelectorAll('.st-right-col > *').length,
            areaCards: document.querySelectorAll('.st-area-band .st-area-card').length,
            activeCards: document.querySelectorAll('.st-area-band .st-area-card.is-active').length,
            activeCardArea: (document.querySelector('.st-area-band .st-area-card.is-active') || {dataset: {}}).dataset.areaId,
            itemRows: document.querySelectorAll('.st-right-col .item-row').length,
            expectedItems: window.DemoData.items(areaId).length,
            alertTable: document.querySelectorAll('.st-right-col .st-table').length,
            place: (document.querySelector('.st-map-place h3') || {}).textContent || '',
            pins: document.querySelectorAll('.map3d-labels [data-map3d-area]').length,
            chartInstances: window.Charts.debugInfo().instances
          };
        }""")
        check(drill["rootRows"] == 4, "下钻态仍是四行，骨架不变（实际 %s）" % drill["rootRows"])
        check(drill["leftBlocks"] == 3 and drill["rightBlocks"] == 1, "下钻态左 3 块 / 右 1 块，容器数不变（实际 %s / %s）" % (drill["leftBlocks"], drill["rightBlocks"]))
        check(drill["areaCards"] == 12 and drill["activeCards"] == 1, "下带仍 12 张卡、恰好 1 张高亮（实际 %s / %s）" % (drill["areaCards"], drill["activeCards"]))
        check(drill["activeCardArea"] == worst_area, "高亮的是被点的那张卡（实际 %s）" % drill["activeCardArea"])
        check(drill["chartInstances"] == 3, "下钻态 ECharts 实例仍是 3 个，没有增删（实际 %s）" % drill["chartInstances"])
        check(drill["alertTable"] == 0, "下钻态右栏不再是明细表（实际 %s 个）" % drill["alertTable"])
        check(drill["itemRows"] == drill["expectedItems"], "下钻态右栏换成该区巡检项，行数 === 该区项数（实际 %s / %s）" % (drill["itemRows"], drill["expectedItems"]))
        check(drill["pins"] == 12, "下钻态 12 个热点全部保留（contract.assertLabelKeys 要求全集，实际 %s）" % drill["pins"])
        check(drill["place"] != "", "平面图内位置标签切到区域名（实际「%s」）" % drill["place"])
        check(info_area["renderCalls"] < 260, "下钻态（%s，项数最多）renderCalls < 260（实际 %s）" % (worst_area, info_area["renderCalls"]))

        # 回字形「全站基准常驻」的可执行断言
        after = page.evaluate(SNAPSHOT_JS)
        check(after == baseline, "下钻后上带与左栏逐字不变（全站基准常驻，可与该区数据对读）")

        drill_overlaps = overlap_pairs(pin_rects(page))
        check(not drill_overlaps, "下钻态 12 个热点仍两两不重叠（实际重叠对：%s）" % ", ".join(drill_overlaps))

        page.screenshot(path=str(SHOT_DIR / "02-station-drilldown.png"))

        # 再点同一张卡 = 弹回全站
        page.evaluate(
            "(areaId) => document.querySelector('.st-area-band [data-action=\"select-area\"][data-area-id=\"' + areaId + '\"]').click()",
            worst_area,
        )
        info_back = wait_idle(page)
        check(info_back["activeAreaId"] is None, "再点同一张区域卡 = 弹回全站（实际 %s）" % info_back["activeAreaId"])

        # 平面图热点下钻 + 地图右下角 ‹ 返回
        page.evaluate(
            "(areaId) => document.querySelector('.map3d-labels [data-map3d-area=\"' + areaId + '\"]').click()",
            worst_area,
        )
        wait_idle(page)
        page.evaluate("() => document.querySelector('[data-action=\\\"back-to-overview\\\"]').click()")
        info_back2 = wait_idle(page)
        check(info_back2["activeAreaId"] is None, "平面图热点下钻 + 地图右下角 ‹ 返回，两条路径都通（实际 %s）" % info_back2["activeAreaId"])

        # ---------------- F. 按需渲染真的会停 ----------------
        # 复位视角 + 清掉选中态（选中态的热点脉冲会周期性置脏，见 wait_idle 的注释），
        # 收敛后取基线、静置 900ms，断言 frames 不再涨。这是「按需渲染纪律」的断言：
        # engine.js 的 markDirty/startLoop 只在有变化时画，没人动就应该一帧都不画。
        page.evaluate("() => { window.Map3D.setActiveArea(null); window.Map3D.resetView(); }")
        wait_idle(page)
        page.wait_for_timeout(200)
        frames_before = page.evaluate("() => window.Map3D.debugInfo().frames")
        page.wait_for_timeout(900)
        after_info = page.evaluate("() => window.Map3D.debugInfo()")
        check(
            after_info["idle"] is True and after_info["frames"] == frames_before,
            "静置 900ms 后不再出帧（frames %s -> %s，idle=%s）—— 按需渲染纪律" % (
                frames_before, after_info["frames"], after_info["idle"]),
        )

        print("\n渲染预算实测：全景态 renderCalls=%s triangles=%s" % (info0["renderCalls"], info0["triangles"]))
        print("渲染预算实测：下钻态（%s）renderCalls=%s triangles=%s" % (worst_area, info_area["renderCalls"], info_area["triangles"]))
        print("平面图容器（设计像素）：%s × %s" % (map_box["w"], map_box["h"]))
        rounds_line = page.evaluate("() => window.StationQuality.rounds().map(r => r.shortDate + ':' + r.complianceRate).join(' ')")
        minutes_line = page.evaluate("() => window.StationQuality.rounds().map(r => r.minutes).join(' ')")
        print("本轮（%s，%s）：合规率 %s%%（%s/%s 有效）· 行为异常 %s 次 · 发现问题 %s 项（P1 %s）· 用时 %s 分钟 = %s 秒/项" % (
            c["date"], c["inspector"], c["complianceRate"], c["valid"], c["planned"],
            c["invalid"], c["issues"], c["p1"], c["minutes"], c["secondsPerItem"]))
        print("近 %s 轮合规率：%s" % (q["roundCount"], rounds_line))
        print("近 %s 轮用时：  %s" % (q["roundCount"], minutes_line))
        print("截图目录：%s" % SHOT_DIR)

        browser.close()

    print("\n===== 汇总：%d passed, %d failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % PASS)


if __name__ == "__main__":
    main()
