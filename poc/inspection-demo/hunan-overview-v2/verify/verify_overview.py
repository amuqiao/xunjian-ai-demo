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
              plan: document.querySelectorAll('#chart-plan').length,
              behavior: document.querySelectorAll('#chart-behavior').length,
              trend: document.querySelectorAll('#chart-trend').length,
              line: document.querySelectorAll('#chart-line').length,
              retired: document.querySelectorAll('#chart-completion, #chart-exception, #chart-ledger, #chart-zone-status, #chart-matrix').length
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
        check(layout["statMetrics"] == 5, "上带 5 个大数，每个都带 note（实际 %s）" % layout["statMetrics"])
        check(layout["leftBlocks"] == 3, "左栏 3 块图（实际 %s）" % layout["leftBlocks"])
        check(layout["rightBlocks"] == 2, "右栏两块：上散点（全省基准）+ 下需关注清单（跟随焦点）（实际 %s）" % layout["rightBlocks"])
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
            layout["slots"] == {"plan": 1, "behavior": 1, "trend": 1, "line": 1, "retired": 0},
            "★ 四个图表槽位各 1 个（计划执行 / 行为异常 / 完成率趋势 / 按管线），"
            "五个退役 id 一个都不剩（实际 %s）" % json.dumps(layout["slots"], ensure_ascii=False),
        )
        check(layout["chartInstances"] == 4, "ECharts 实例恰好 4 个（实际 %s）" % layout["chartInstances"])

        # ---------------- B2. 四张新图的内容正确性 ----------------
        # 不只看"画出来了"，重点盯三件容易悄悄错的事：
        #   1) 三根条必须严格递减，且百分比是现算的（曾经把 12 项走过场从 planned 里扣，
        #      算出 129/141 = 91.5%，比正确的 122/141 = 86.5% 高了 5pt）
        #   2) 环形图三段之和必须等于上带「行为异常」那张卡的数
        #   3) 日期区间必须真的驱动趋势图的点数（改造前它只改两个文字标签）
        charts = page.evaluate("""() => {
          const opt = id => {
            const el = document.getElementById(id);
            const inst = el && window.echarts && window.echarts.getInstanceByDom(el);
            return inst ? inst.getOption() : null;
          };
          const plan = opt('chart-plan');
          const donut = opt('chart-behavior');
          const trend = opt('chart-trend');
          const line = opt('chart-line');
          const txt = sel => (document.querySelector(sel) || {}).textContent || '';
          return {
            // 条形图的 y 轴是 reverse 过的，data 也 reverse 过，两次抵消后
            // series.data 的顺序是「有效 / 已巡 / 计划」自下而上。
            planBars: plan ? plan.series[0].data.map(d => d.value) : null,
            planCats: plan ? plan.yAxis[0].data : null,
            planFoot: plan ? plan.graphic[0].elements[0].style.text : '',
            planLabelHasPct: plan ? /%/.test(JSON.stringify(plan.series[0].label)) : null,
            planMeta: txt('.ov-left-col .card-chart-meta'),
            donutVals: donut ? donut.series[0].data.map(d => d.value) : null,
            donutNames: donut ? donut.series[0].data.map(d => d.name) : null,
            donutCenter: donut ? donut.graphic[0].elements[0].style.text : '',
            trendPoints: trend ? trend.xAxis[0].data.length : null,
            trendSeries: trend ? trend.series.map(x => x.name) : null,
            // 按名字找而不是按位置索引：series[1] 只因为柱系列曾经声明在前，
            // 那根柱已经删了，而按位置写的断言会在下一次调整声明顺序时静默读错系列。
            trendTarget: trend ? trend.series.filter(x => x.markLine)[0].markLine.data[0].yAxis : null,
            trendLast: trend ? trend.series.filter(x => x.name === "完成率")[0].data.slice(-1)[0] : null,
            trendFirstDay: trend ? trend.xAxis[0].data[0] : null,
            trendLastDay: trend ? trend.xAxis[0].data.slice(-1)[0] : null,
            lineCats: line ? line.yAxis[0].data : null,
            linePcts: line ? line.series[0].data.map(d => d.value) : null,
            // 上带五张卡的 note 是否被裁（note 底边越过卡底边即为裁）
            // 纵向溢出 + 横向省略号都要查：06-overview-scene.css 给 note 加了
            // white-space:nowrap + text-overflow:ellipsis 之后，失效模式从「越过卡底边」
            // 变成了「行尾出省略号」，只量纵向的话这条断言已经丧失检测能力。
            clippedNotes: Array.from(document.querySelectorAll('.ov-stat-band .card-metric')).filter(m => {
              const n = m.querySelector('.card-metric-note');
              if (!n) return true;
              const overflowY = n.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom + 0.5;
              const overflowX = n.scrollWidth > n.clientWidth + 1;
              return overflowY || overflowX;
            }).length,
            bandLabels: Array.from(document.querySelectorAll('.ov-stat-band .card-metric-label')).map(e => e.textContent),
            bandValues: Array.from(document.querySelectorAll('.ov-stat-band .card-metric-value')).map(e => e.textContent.trim()),
          };
        }""")

        check(charts["planBars"] == [122, 134, 141],
              "★ 巡检计划执行三根条严格递减 141 → 134 → 122（实际 %s，自下而上）" % charts["planBars"])
        check(charts["planCats"] == ["有效项", "已巡检", "计划巡检"],
              "三根条各自带名字，不需要解释「什么的完成率」（实际 %s）" % json.dumps(charts["planCats"], ensure_ascii=False))
        check("未巡 7 项" in charts["planFoot"] and "走过场 12 项" in charts["planFoot"]
              and "%" not in charts["planFoot"],
              "计划执行图底部只留「未巡 7 · 走过场 12」两个上带没有的数，不含任何百分比"
              "（实际图底：%s）" % charts["planFoot"])
        check(charts["planMeta"] == "合规率 86.5%",
              "★ 合规率 = (已巡 134 − 走过场 12) / 计划 141 = 86.5%% —— 分子从 completed 扣"
              "而不是从 planned 扣（后者算出 129/141 = 91.5%%，把 7 项没巡的也当成了有效）。"
              "它降级成左① 的卡头 meta，因为它就是那张图的结论（实际 meta：%s）"
              % charts["planMeta"])
        check(charts["donutVals"] == [6, 4, 2] and charts["donutNames"] == ["时长异常", "间隔异常", "时段异常"],
              "行为异常环形图三段 = 时长 6 / 间隔 4 / 时段 2（实际 %s %s）"
              % (charts["donutVals"], json.dumps(charts["donutNames"], ensure_ascii=False)))
        check(charts["donutCenter"] == "12" and sum(charts["donutVals"]) == 12,
              "★ 环心合计 12 = 三段之和，且与上带「行为异常」那张卡同源（实际环心 %s / 三段和 %s）"
              % (charts["donutCenter"], sum(charts["donutVals"])))
        check(charts["trendTarget"] == 95,
              "趋势图带 95%% 目标线（取自助手页周报口径，实际 %s）" % charts["trendTarget"])
        check(charts["trendSeries"] == ["完成率"],
              "★ 趋势图只有一个系列 —— 那根「行为异常」柱砍掉了：它画每日值却把基线钉死在"
              "区间总量 12 上，实测每根柱 12~17 次、合计 103 次，而正上方环心写着「合计 12 次」"
              "（实际系列 %s）" % json.dumps(charts["trendSeries"], ensure_ascii=False))
        check(charts["lineCats"] is not None and len(charts["lineCats"]) == 5,
              "按管线图 5 行：4 条有需关注站点的线 + 1 行「其余 N 条线 0」（实际 %s 行）"
              % (len(charts["lineCats"]) if charts["lineCats"] else None))
        check(charts["lineCats"][0].startswith("其余"),
              "★ 「其余 7 条线 0」那一行必须画出来 —— 只画有问题的四条，观众会以为全省只有"
              "四条管线。这是「不许静默截断」那条纪律（y 轴自下而上，第 0 项在最底行，实际 %s）"
              % charts["lineCats"][0])
        check(max(charts["linePcts"]) > 40,
              "★ 管线维度是屏上从未有过的横切面：忠武线潜湘支线 6/14 = 42.9%%，"
              "而且它跨作业区（横跨岳阳），按作业区永远看不到（实际最高 %.1f%%）"
              % max(charts["linePcts"]))

        # ---------------- B4. 不许逐字重印 ----------------
        # 上一版实测：141 在屏上出现 5 次、95.0% 出现 3 次、86.5% 出现 2 次、走过场 12
        # 出现 3 次。上带第 2、3 格的 value 和 note 与左① 整张图是同一批数字，两块相距
        # 不到 600px。这一节钉住三处已经删掉的重印，别再长回来。
        check(charts["planLabelHasPct"] is False,
              "★ 三根条的标签只印「N 项」不印百分比 —— 比例已由条长编码，"
              "而 95.0%% / 86.5%% 是上带第 2、3 格的 value（实际标签含 %%：%s）"
              % charts["planLabelHasPct"])
        check("合规率" not in charts["planFoot"],
              "★ 计划执行图底部只留「未巡 · 走过场」两个上带没有的数，合规率归卡头 meta"
              "（实际图底：%s）" % charts["planFoot"])
        dup = page.evaluate("""() => {
          const side = ['.ov-stat-band', '.ov-left-col', '.ov-right-col']
            .map(s => (document.querySelector(s) || {}).textContent || '').join(' ');
          const count = t => side.split(t).length - 1;
          return { rate950: count('95.0%'), rate865: count('86.5%'), n141: count('141') };
        }""")
        check(dup["rate950"] == 1,
              "★ 「95.0%%」在上带+左右栏的 DOM 文本里只出现 1 次（上带第 2 格的 value）"
              "—— 条标签与折线末点标签都已删（实际 %s 次）" % dup["rate950"])
        check(dup["rate865"] == 1,
              "★ 「86.5%%」只出现 1 次（左① 的卡头 meta）—— 已从上带第 3 格与图底撤下"
              "（实际 %s 次）" % dup["rate865"])

        check(charts["clippedNotes"] == 0,
              "★ 上带 5 张卡的 note 一条都没被裁 —— 96px 那一版会裁掉半行，所以抬到 124（实际裁 %s 条）"
              % charts["clippedNotes"])
        check(charts["bandLabels"] == ["当前风险", "计划完成率", "问题处置完成率", "发现问题", "AI 提醒"],
              "★ 上带砍掉两个静态结构数（站点总数 141 与地图副标题重复、作业区 6 与下带那条带重复），"
              "五格是五个不同的问题：要不要动手 / 该做的做完了吗 / 发现的处置掉了吗 / 发现了多少 / AI 贡献了多少。合规率降级成左① 的卡头 meta —— 它与完成率同分母、只差那 12 项，两格花在同一条链上（实际 %s）"
              % json.dumps(charts["bandLabels"], ensure_ascii=False))

        # ---------------- B3. 日期区间必须真的驱动趋势图 ----------------
        # 改造前这个选择器唯一的消费点是完成度环的 meta 标签和顶栏那行日期文字 ——
        # 点「近30天」屏上四个大数、三张图、地图一个都不动。这条断言就是钉住这件事。
        base_points = charts["trendPoints"]
        page.eval_on_selector('[data-action="set-date-range"][data-date-range="30d"]', "el => el.click()")
        page.wait_for_timeout(900)
        after = page.evaluate("""() => {
          const el = document.getElementById('chart-trend');
          const inst = el && window.echarts.getInstanceByDom(el);
          return inst ? inst.getOption().xAxis[0].data.length : null;
        }""")
        check(base_points == 7, "近7天 → 趋势图 7 个点（实际 %s）" % base_points)
        check(after == 30,
              "★ 切到近30天后趋势图真的重画成 30 个点 —— 日期选择器不再是只改两个文字标签的摆设"
              "（实际 %s 点）" % after)
        page.eval_on_selector('[data-action="set-date-range"][data-date-range="7d"]', "el => el.click()")
        page.wait_for_timeout(900)

        # ---------------- B5. 自定义区间必须画对日期 ----------------
        # 上一版只把「点数」传给 coverageTrend，日期永远从今天往回数。于是点「湘潭站问题
        # 复核（2026-04-24 至 04-30）」时，顶栏和卡头 meta 都写着 4/24-4/30，图上画的却是
        # 08-17…08-23 —— 屏上说假话；而且那一档与「近7天」产出逐字节相同的图，等于自定义
        # 区间仍然什么都不动，而「点了屏上什么都不动」正是这一轮改造的立项理由。
        def trend_axis():
            return page.evaluate("""() => {
              const el = document.getElementById('chart-trend');
              const o = window.echarts.getInstanceByDom(el).getOption();
              return { n: o.xAxis[0].data.length,
                       first: o.xAxis[0].data[0],
                       last: o.xAxis[0].data.slice(-1)[0],
                       meta: document.querySelectorAll('.ov-left-col .card-chart-meta')[2].textContent };
            }""")

        CUSTOM_CASES = [
            ("xiangtan-review", 7, "04-24", "04-30"),
            ("risk-recheck", 8, "07-28", "08-04"),
            ("monthly-inspection", 17, "08-01", "08-17"),
        ]
        for rid, want_n, want_first, want_last in CUSTOM_CASES:
            page.eval_on_selector('[data-action="toggle-custom-date-menu"]', "el => el.click()")
            page.wait_for_timeout(400)
            page.eval_on_selector('[data-action="set-custom-date-range"][data-custom-range="%s"]' % rid,
                                  "el => el.click()")
            page.wait_for_timeout(900)
            ax = trend_axis()
            check(ax["n"] == want_n and ax["first"] == want_first and ax["last"] == want_last,
                  "★ 自定义区间 %s 的趋势图画的是它自己的日期 %s…%s（%s 点），"
                  "不是从今天往回数（实际 %s…%s / %s 点）"
                  % (rid, want_first, want_last, want_n, ax["first"], ax["last"], ax["n"]))
            check("历史区间" in ax["meta"],
                  "★ 历史区间的卡头不许写「末点为当期实测」—— 那个末点画的是当前完成率"
                  "95.0%%，说成当期实测是换个方式说假话（实际 meta：%s）" % ax["meta"])
        page.eval_on_selector('[data-action="set-date-range"][data-date-range="7d"]', "el => el.click()")
        page.wait_for_timeout(900)

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
        check(province_alerts["headers"] == ["作业区", "站点", "管线", "状态"], "省域态列头 = 作业区/站点/管线/状态（实际 %s）" % json.dumps(province_alerts["headers"], ensure_ascii=False))
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
        check(drill["leftBlocks"] == 3 and drill["rightBlocks"] == 2, "下钻态左 3 块 / 右 2 块，容器数不变（实际 %s / %s）" % (drill["leftBlocks"], drill["rightBlocks"]))
        check(drill["zoneCards"] == 6 and drill["activeCards"] == 1, "下带仍 6 张卡、恰好 1 张高亮（实际 %s / %s）" % (drill["zoneCards"], drill["activeCards"]))
        check(drill["activeCardZone"] == worst_zone, "高亮的是被点的那张卡（实际 %s）" % drill["activeCardZone"])
        check(drill["chartInstances"] == 4, "下钻态 ECharts 实例仍是 4 个，没有增删（实际 %s）" % drill["chartInstances"])
        check(drill["rows"] == drill["expectedRows"], "下钻清单只列该区非正常站点（实际 %s 行 / 期望 %s，该区共 %s 站）" % (drill["rows"], drill["expectedRows"], drill["siteTotal"]))
        check(drill["headers"] == ["站点", "类型", "管线", "状态"], "下钻态列头换成 站点/类型/管线/状态（实际 %s）" % json.dumps(drill["headers"], ensure_ascii=False))
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
        # 【这条断言换了量法，不是放宽了标准】
        #
        # v2 初版量的是「上带+左栏+右栏的全部 textContent」，与旧版比大小。那时候能过，
        # 是因为两边的表格行数差不多。这一轮把右栏清单的「介质」列换成「管线」列之后
        # 这个量法失效了：介质 13 行全是「天然气」3 个字 = 39 字，管线名平均 7 字 = 91 字，
        # 一列就多 52 字 —— 而这 52 字换的是真信息（我核过台账，除了管线，每一个可选列
        # 都是 12/13 行同一个值：阀室 11/13、一级管道 12/13、天然气 12/13，管线是唯一
        # 有分布的那一列）。拿总字数比大小，会把「换上有信息量的列」判成退步。
        #
        # 改成只量 **chrome**（指标标签 / note / 卡头标题 / meta），不量表格数据行 ——
        # 数据行的字数由 danger+warn 的站点数决定，不是排版纪律能管的东西。
        # 预算 150 字：实测 chrome 为 121 字（上带 5 格 67 + 左栏 3 卡头 32 + 右栏 2 卡头 22）。
        # 留 29 字余量，涨过就说明文案又开始堆了。
        chrome = page.evaluate("""() => {
          const cjk = t => (t.match(/[\u4e00-\u9fff]/g) || []).length;
          let n = 0;
          document.querySelectorAll('.ov-stat-band .card-metric-label, '
            + '.ov-stat-band .card-metric-note, '
            + '.ov-left-col .card-chart-title, .ov-left-col .card-chart-meta, '
            + '.ov-right-col .card-chart-title, .ov-right-col .card-chart-meta, '
            + '.ov-right-col .ov-list-card-title, .ov-right-col .ov-list-card-meta'
          ).forEach(el => { n += cjk(el.textContent); });
          return n;
        }""")
        check(chrome <= 150,
              "★ 侧栏 chrome（指标标签 / note / 卡头）字量不超过 150 字预算 —— 表格数据行"
              "不计（行数由需关注站点数决定，不是排版纪律能管的）。实际 %d 字" % chrome)

        print("\n渲染预算实测：省域态 renderCalls=%s triangles=%s" % (info0["renderCalls"], info0["triangles"]))
        print("渲染预算实测：下钻态（%s）renderCalls=%s triangles=%s" % (worst_zone, info_zone["renderCalls"], info_zone["triangles"]))
        print("地图容器（设计像素）：%s × %s" % (map_box["w"], map_box["h"]))
        print("屏上字量：v2 侧栏合计 %d 个中文字符，旧版左+右栏 %d 个" % (new_side_cjk, old_cjk))
        print("截图目录：%s" % SHOT_DIR)

        # ---------------- Z. 合法零值不许白屏（放在最后：这一节会替换全局并点下钻） ----------------
        # 先重载一遍再做：本节把 HunanInspectionQuality / HunanSites 的四个方法换成替身
        # 并触发一次重绘，做完之后页面处于下钻态。放在中间会污染后续断言。
        page.reload()
        page.wait_for_selector(".ov-stat-band .card-metric", timeout=20000)
        page.wait_for_timeout(2200)

        # 「全省问题清零 / 行为异常清零」正是这块屏存在的目的，把它做成致命错误等于
        # 「整改成功 = 演示崩溃」。实测过：改之前 monkeypatch issues=0 后触发重绘，
        # boot.js 已执行 root.innerHTML = ""，抛错发生在其后的 renderStatBand()，整屏只剩顶栏。
        zero = page.evaluate("""() => {
          const Q = window.HunanInspectionQuality;
          const S = window.HunanSites;
          // 四个替身的原件全部在 try 之前声明 —— 声明在 try 里的话 finally 引用不到
          const realProvince = Q.province;
          const realByZone = Q.byZone;
          const realSites = S.sites;
          const realByZoneSites = S.sitesByZone;
          const snapshot = realSites();
          const errs = [];
          const onErr = e => errs.push(String(e.message || e));
          const zeroed = base => {
            const o = {};
            Object.keys(base).forEach(k => { o[k] = base[k]; });
            o.issues = 0; o.currentRisk = 0; o.p1Issues = 0;
            o.duration = 0; o.interval = 0; o.offWindow = 0;
            return o;
          };
          const clean = list => list.map(x => {
            const c = {}; Object.keys(x).forEach(k => { c[k] = x[k]; }); c.status = 'ok'; return c;
          });
          let bandCards = null, rootKids = null, texts = [];
          window.addEventListener('error', onErr);
          try {
            Q.province = () => zeroed(realProvince());
            Q.byZone = z => zeroed(realByZone(z));
            // 站点 status 也要清零，否则 assertIssueIdentity() 会正确地报「13 != 0」
            S.sites = () => clean(snapshot);
            S.sitesByZone = z => (z == null ? clean(snapshot) : clean(realByZoneSites(z)));
            document.querySelector('.ov-zone-card').click();
            bandCards = document.querySelectorAll('.ov-stat-band .card-metric').length;
            rootKids = document.getElementById('appRoot').children.length;
            texts = Array.from(document.querySelectorAll('.ov-stat-band .card-metric-note'))
                      .map(e => e.textContent);
          } finally {
            Q.province = realProvince;
            Q.byZone = realByZone;
            S.sites = realSites;
            S.sitesByZone = realByZoneSites;
            window.removeEventListener('error', onErr);
          }
          return { errs: errs, bandCards: bandCards, rootKids: rootKids, texts: texts };
        }""")
        check(zero["rootKids"] == 4 and zero["bandCards"] == 5,
              "★ 问题与行为异常全部清零时屏仍完整（四行 / 上带 5 张卡）—— 「整改成功」是一个"
              "真实可达的成功状态，不该让屏崩掉（实际 #appRoot 子节点 %s / 上带 %s 张）"
              % (zero["rootKids"], zero["bandCards"]))
        check(not zero["errs"],
              "★ 清零时零 window.onerror —— 原先 issues 当分母直接抛「分母必须为正」，"
              "而 boot.js 已经执行过 root.innerHTML = \"\"（实际报错：%s）" % zero["errs"])
        check(any("未发现问题" in t for t in zero["texts"]),
              "清零时上带渲染域分支文案而不是 0%%/NaN%%（实际 note：%s）"
              % json.dumps(zero["texts"], ensure_ascii=False))

        browser.close()

    print("\n===== 汇总：%d passed, %d failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % PASS)


if __name__ == "__main__":
    main()
