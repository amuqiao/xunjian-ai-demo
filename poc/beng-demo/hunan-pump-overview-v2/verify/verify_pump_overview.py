# 验收：以 file:// 打开 index.html（模拟真实双击），断言五组。
#
#   A. 加载健康    pageerror / console.error 为空、固定画布真生效
#   B. 骨架        回字形四段、5 个大数、左右各 3 块、6 张作业区卡、4 张图都有实例
#   C. ★ 数据对账  屏上的每个数都能回到 xlsx：40 台 / 118 条 / 27 达大修 / 40 阈值缺项 /
#                  作业区 16-8-8-4-4-0 / 帕累托倒挂 / ISO 定级复现报告原文的 B
#   D. 地图        10 个作业区标签（契约要求省域全集）、5 个标 is-empty、逐区下钻不炸
#   E. 排版        指标带的 note 不被裁（96px 那一版会裁掉半行，所以抬到 124）
#
# ⚠️ C 组是这次重做的全部理由。旧屏 9 个指标里只有 1 个跟泵有关，而且在数 44 个成品油
# 节点（站场 11 + 阀室 33）—— 阀室里没有泵。C 组红了，说明数据层和台账脱钩了，
# 必须重跑 tools/build_data.py 或改实现，**不要改断言**。
#
# 用法：uv run python poc/beng-demo/hunan-pump-overview-v2/verify/verify_pump_overview.py
import os
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "hunan-pump-overview-v2-verify"))
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
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1680, "height": 1050})
        errors, console = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console.append(m.text)
                if m.type == "error" and not any(a in m.text for a in CONSOLE_ALLOW) else None)

        page.goto(INDEX, wait_until="load")
        page.wait_for_timeout(4200)

        # ---------------- A. 加载健康 ----------------
        check(not errors, "pageerror 为空（实际 %d 条）%s"
              % (len(errors), ("：\n" + "\n".join(errors[:3])) if errors else ""))
        check(not console, "console.error 白名单外为空（实际 %d 条）%s"
              % (len(console), ("：\n" + "\n".join(console[:3])) if console else ""))
        canvas = page.evaluate("""() => {
          const root = document.documentElement, shell = document.querySelector('.app-shell');
          return { scale: parseFloat(getComputedStyle(root).getPropertyValue('--screen-scale')),
                   hasTransform: getComputedStyle(shell).transform !== 'none',
                   designW: parseInt(getComputedStyle(root).getPropertyValue('--screen-design-width'), 10) };
        }""")
        check(0 < canvas["scale"] < 1, "--screen-scale 已算出且小于 1（实际 %.3f）" % canvas["scale"])
        check(canvas["hasTransform"], "固定画布生效：.app-shell 有 transform")
        check(canvas["designW"] == 2471, "设计画布宽 2471，与三个巡检 v2 一致（实际 %s）" % canvas["designW"])

        # ---------------- B. 骨架 ----------------
        sk = page.evaluate("""() => ({
          rows: document.querySelectorAll('#appRoot > *').length,
          metrics: document.querySelectorAll('.ov-stat-band .card-metric').length,
          left: document.querySelectorAll('.ov-left-col > *').length,
          right: document.querySelectorAll('.ov-right-col > *').length,
          zoneCards: document.querySelectorAll('.ov-zone-card').length,
          faultRows: document.querySelectorAll('.ov-fault-row').length,
          charts: window.Charts.debugInfo(),
          legacy: document.querySelectorAll('.date-range-picker, .ov-rank-card').length
        })""")
        check(sk["rows"] == 4, "回字形四段：顶栏/指标带/中段/作业区带（实际 %s）" % sk["rows"])
        check(sk["metrics"] == 5, "指标带 5 个大数（实际 %s）" % sk["metrics"])
        check(sk["left"] == 3 and sk["right"] == 3, "左右栏各 3 块（实际 %s / %s）" % (sk["left"], sk["right"]))
        check(sk["zoneCards"] == 6, "作业区带 6 张卡 = 湖南公司真实的 6 个作业区（实际 %s）" % sk["zoneCards"])
        check(sk["faultRows"] == 2, "当月故障机组 2 行（2026-06 在线监测报告）（实际 %s）" % sk["faultRows"])
        check(sk["charts"]["slots"] == 4 and sk["charts"]["instances"] == 4,
              "4 个图槽 4 个实例 —— slot 与 draw 严格相等（实际 %s）" % sk["charts"])
        check(sk["legacy"] == 0, "已删除：日期范围选择器 / 作业区排名表（泵数据是快照，日期控件会骗人）")

        # ---------------- C. ★ 数据对账 ----------------
        d = page.evaluate("""() => {
          const L = window.PumpLedger, F = window.PumpFaults, S = window.PumpState, U = window.PumpUnitModel;
          const asOf = window.HunanSites.asOf();
          const p1 = S.changlingP1();
          return {
            ledger: L.summary(asOf),
            faults: F.summary(),
            zones: ['yueyang','changsha','xianglou','zhuzhou','hengyang','yongchen']
                     .map(z => L.pumpsByZone(z).length),
            pareto: F.paretoByHours().slice(0, 4).map(g => [g.name, g.count, g.hours]),
            byCount: F.groupBy('category').slice(0, 4).map(g => g.name),
            vendors: L.vendorMix().map(v => v.name + ':' + v.count),
            unitParts: U.partTotal(), unitSubs: U.subsystems().length,
            gradeP1: S.gradeByPoints(p1.values),
            points: S.measurePoints().length,
            faultUnits: S.monitor().faultUnits.map(f => f.station + f.ledgerTag + '/' + f.conclusion),
            fleet: S.monitor().fleet
          };
        }""")
        check(d["ledger"]["total"] == 40 and d["ledger"]["main"] == 29 and d["ledger"]["feed"] == 11,
              "台账 40 台 = 主输 29 + 给油 11（实际 %s/%s/%s）"
              % (d["ledger"]["total"], d["ledger"]["main"], d["ledger"]["feed"]))
        check(d["fleet"] == d["ledger"]["total"],
              "★ 两份独立资料互相印证：在线监测报告说 %s 台，台账也是 %s 台"
              % (d["fleet"], d["ledger"]["total"]))
        check(d["zones"] == [16, 8, 8, 4, 4, 0],
              "★ 作业区台数 岳阳16/长沙8/湘娄8/株洲4/衡阳4/永郴0（实际 %s）" % d["zones"])
        check(d["ledger"]["overhaulDue"] == 27 and d["ledger"]["overhaulLogged"] == 4,
              "★ 达 10 年大修节点 27 台、有大修记录仅 4 台（实际 %s / %s）"
              % (d["ledger"]["overhaulDue"], d["ledger"]["overhaulLogged"]))
        check(d["ledger"]["thresholdMissing"] == 40,
              "★ 振动/温度阈值 40 台全部未填 —— 如实显示，不补默认值（实际 %s）" % d["ledger"]["thresholdMissing"])
        check(d["ledger"]["commissionMissing"] == 8,
              "投用日期未填报 8 台（衡阳 4 被评估结论串列 + 154库 4 填「/」）（实际 %s）"
              % d["ledger"]["commissionMissing"])
        check(d["faults"]["total"] == 118 and d["faults"]["monthTotal"] == 24
              and d["faults"]["companyTotal"] == 13,
              "故障统计 118 条 / 24 个月 / 13 家公司（实际 %s/%s/%s）"
              % (d["faults"]["total"], d["faults"]["monthTotal"], d["faults"]["companyTotal"]))
        check(abs(d["faults"]["hours"] - 1967.3) < 0.05 and abs(d["faults"]["medianHours"] - 1.08) < 0.01,
              "停机合计 1967.3h、中位 1.08h（长尾极端，所以 tooltip 给三个数）（实际 %s / %s）"
              % (d["faults"]["hours"], d["faults"]["medianHours"]))
        # ★ 倒挂：按时长排第一是机械故障，按次数排第一是电气故障
        check(d["pareto"][0][0] == "机械故障" and d["byCount"][0] == "电气故障",
              "★ 次数与停机时长倒挂：按时长第一是「%s」，按次数第一是「%s」—— 只画次数会得出反的结论"
              % (d["pareto"][0][0], d["byCount"][0]))
        check(d["pareto"][0][1] == 14 and abs(d["pareto"][0][2] - 998.8) < 0.05,
              "★ 机械故障 14 次（11.9%%）吃掉 998.8h（50.8%%）（实际 %s 次 / %s h）"
              % (d["pareto"][0][1], d["pareto"][0][2]))
        check("湖南天一奥星泵业:4" in d["vendors"] and not any(v.startswith("平江天一") for v in d["vendors"]),
              "厂家已归一：源表「湖南天一」「平江天一」是同一家（长岭 P-1 评估报告原文）—— %s"
              % " ".join(d["vendors"]))
        check(d["unitSubs"] == 6 and d["unitParts"] == 48,
              "IMS 单元模型 6 子系统 48 部件（实际 %s / %s）" % (d["unitSubs"], d["unitParts"]))
        check(d["points"] == 25, "ISO 标准测点 25 处（GB/T 19873）（实际 %s）" % d["points"])
        check(d["gradeP1"]["grade"]["grade"] == "B" and abs(d["gradeP1"]["max"] - 2.62) < 0.001,
              "★ ISO 10186-3 定级复现报告原文：长岭 P-1 最大 2.62mm/s → B 良（实际 %s → %s）"
              % (d["gradeP1"]["max"], d["gradeP1"]["grade"]["grade"]))
        check(d["faultUnits"] == ["长岭站Ｐ－4泵/松动", "衡阳站Ｐ－2泵/轴承磨损，润滑不良"],
              "当月故障两台的结论逐字来自在线监测报告（实际 %s）" % d["faultUnits"])

        # ---------------- D. 地图 ----------------
        mp = page.evaluate("""() => ({
          pins: document.querySelectorAll('.hunan-labels [data-hunan-zone]').length,
          empty: document.querySelectorAll('.hunan-labels [data-hunan-zone].is-empty').length,
          hosts: document.querySelectorAll('[data-hunan-host]').length,
          canvas: document.querySelectorAll('.hunan-map canvas').length
        })""")
        check(mp["pins"] == 10,
              "省域态渲染 10 个作业区标签 —— contract 的 assertLabelKeys 要求全集，少一个直接抛错（实际 %s）"
              % mp["pins"])
        check(mp["empty"] == 5,
              "其中 5 个标「无机组」：湘北/湘中/郴州/湘西（不在湖南公司底表里）+ 永郴（底表有、台账 0 台）（实际 %s）"
              % mp["empty"])
        check(mp["hosts"] == 1 and mp["canvas"] == 1, "3D 宿主与画布各 1 个")
        page.screenshot(path=str(SHOT_DIR / "01-province.png"))

        # 逐区下钻遍历：单测一个区发现不了级联问题（这条断言在巡检 v2 抓到过 3D 崩溃）
        for zone in ["yueyang", "changsha", "xianglou", "zhuzhou", "hengyang", "yongchen"]:
            page.eval_on_selector('.ov-zone-card[data-zone-id="%s"]' % zone, "el => el.click()")
            page.wait_for_timeout(900)
            st = page.evaluate("""() => ({
              pins: document.querySelectorAll('.hunan-labels [data-hunan-zone]').length,
              back: !!document.querySelector('.ov-zoom-back'),
              charts: window.Charts.debugInfo().instances
            })""")
            if st["pins"] != 1 or not st["back"] or st["charts"] != 4:
                check(False, "下钻 %s 后状态异常：%s" % (zone, st))
                break
            page.eval_on_selector('[data-action="back-to-overview"]', "el => el.click()")
            page.wait_for_timeout(600)
        else:
            check(True, "★ 6 个作业区逐个下钻 + 返回全省，标签降为 1 个、图表实例恒为 4、全程无错")
        check(not errors, "下钻遍历后 pageerror 仍为空（实际 %s 条）%s"
              % (len(errors), errors[0][:200] if errors else ""))

        # ---------------- E. 排版 ----------------
        page.eval_on_selector('.ov-zone-card[data-zone-id="yueyang"]', "el => el.click()")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(SHOT_DIR / "02-zone.png"))
        page.eval_on_selector('[data-action="back-to-overview"]', "el => el.click()")
        page.wait_for_timeout(800)
        lay = page.evaluate("""() => {
          const clipped = Array.from(document.querySelectorAll('.ov-stat-band .card-metric')).filter(m => {
            const n = m.querySelector('.card-metric-note');
            return n && n.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom + 0.5;
          }).length;
          const pins = Array.from(document.querySelectorAll('.hunan-labels [data-hunan-zone]'))
            .map(e => e.getBoundingClientRect());
          let overlap = 0;
          for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
            const a = pins[i], b = pins[j];
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlap++;
          }
          return { clipped, overlap };
        }""")
        check(lay["clipped"] == 0,
              "★ 指标带的 note 一条都没被裁 —— 96px 那一版会裁掉半行，所以抬到 124（实际裁 %s 个）"
              % lay["clipped"])
        check(lay["overlap"] == 0, "10 个作业区标签两两不重叠（实际重叠 %s 对）" % lay["overlap"])

        # ---------------- F. 指标带副指标 ----------------
        # 5 张卡右半的占比块。这里不只看"有没有渲染"，重点看三件容易悄悄错的事：
        #   1) 五个副指标块必须左边缘对齐成一列 —— 给 1fr 就会跟着 note 长短各自漂移
        #   2) 条的段宽必须等于现算的百分比，不能是写死的 style
        #   3) 副数字必须是中性色（--ink），带状态色的数字一张卡只许有一个
        aux = page.evaluate("""() => {
          const ink = getComputedStyle(document.documentElement)
            .getPropertyValue('--ink').trim();
          const toRgb = hex => {
            const n = parseInt(hex.slice(1), 16);
            return 'rgb(' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ') + ')';
          };
          const cards = Array.from(document.querySelectorAll('.ov-stat-band .card-metric'));
          return {
            inkRgb: toRgb(ink),
            n: cards.length,
            // 卡内偏移，不是视口绝对坐标：五张卡横向排开，绝对 left 本来就不同，
            // 要对齐的是"副指标块在各自卡里的起点"。
            offsets: cards.map(c => Math.round(
              c.querySelector('.ov-stat-aux').getBoundingClientRect().left
              - c.getBoundingClientRect().left)),
            nums: cards.map(c => c.querySelector('.ov-stat-aux-num').textContent),
            numColors: cards.map(c => getComputedStyle(
              c.querySelector('.ov-stat-aux-num')).color),
            // 段宽 / 轨道宽 与 style 里的百分比是否一致（容差 0.6px）
            segOk: cards.every(c => {
              const track = c.querySelector('.ov-stat-bar').getBoundingClientRect().width;
              return Array.from(c.querySelectorAll('.ov-stat-seg')).every(seg =>
                Math.abs(seg.getBoundingClientRect().width
                         - track * parseFloat(seg.style.width) / 100) < 0.6);
            }),
            // auxNote / auxLabel 单行省略号，一个都不许触发
            ellipsis: cards.reduce((acc, c) => acc + Array.from(
              c.querySelectorAll('.ov-stat-aux-note, .ov-stat-aux-label'))
              .filter(e => e.scrollWidth > e.clientWidth + 1).length, 0),
            stacked: cards.filter(c => c.querySelectorAll('.ov-stat-seg').length === 2)
              .map(c => c.querySelector('.card-metric-label').textContent),
          };
        }""")
        check(aux["n"] == 5 and len(set(aux["offsets"])) == 1,
              "★ 5 张卡的副指标块在卡内偏移完全一致，横排扫读成一列（实际 %s 张，偏移=%s）"
              % (aux["n"], sorted(set(aux["offsets"]))))
        check(aux["nums"] == ["100%", "72.5%", "95.0%", "14.8%", "4.2%"],
              "★ 五个副指标现算无误：覆盖 40/40、主输 29/40、完好 38/40、大修 4/27、湖南 5/118（实际 %s）"
              % aux["nums"])
        check(aux["segOk"], "占比条每一段的实测宽度都等于现算百分比 × 轨道宽")
        check(all(c == aux["inkRgb"] for c in aux["numColors"]),
              "★ 副数字一律中性色 --ink —— 一张卡只允许一个带状态色的数字（实际 %s）"
              % sorted(set(aux["numColors"])))
        check(aux["ellipsis"] == 0,
              "副指标的标签与说明没有一条触发省略号（实际 %s 条）" % aux["ellipsis"])
        check(sorted(aux["stacked"]) == sorted(["主输 / 给油", "当月故障"]),
              "只有「主输/给油」和「当月故障」是双段堆叠条，其余三个是单段完成度（实际 %s）"
              % aux["stacked"])

        browser.close()

    print("\n截图目录：%s" % SHOT_DIR)
    print("\n===== 汇总：%s passed, %s failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%s 项断言）" % PASS)


if __name__ == "__main__":
    main()
