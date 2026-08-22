# 验收：以 file:// 打开 index.html（模拟真实双击），断言五组。
#
#   A. 加载健康    pageerror / console.error 为空、固定画布真生效
#   B. 骨架        回字形四段、4 个大数、左 3 块右 2 块、6 张部位卡、6 个 3D 热点
#   C. ★ 数据对账  25 个测点一个不漏地挂到 6 个部位（7+12+3+3）、ISO 定级复现报告原文的 B、
#                  逐点值等于报告表 4 的数字、3 个越 A 级界的点就是报告里那 3 个
#   D. 部位下钻    逐个部位点一遍不炸；无测振点的两个走"空态"分支且各自理由不同
#   E. 排版        25 行两列不滚不截、列优先填充（左 1-13 右 14-25）、机封的点不是绿色
#
# ⚠️ C 组是这一屏的全部理由。屏上每个数都要能回到《长岭站 P-1 输油泵机组状态检测与评估
# 报告》的表 4。C 组红了，说明 measure.js 的挂接或 pump-state.js 的转录出了错，
# 必须改数据，**不要改断言**。
#
# 用法：uv run python poc/beng-demo/pump-station-situation-v2/verify/verify_pump_station.py
import os
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "pump-station-situation-v2-verify"))
CONSOLE_ALLOW = ('Scripts "build/three.js"', "SwiftShader", "build/three.js")

# 报告表 4 的 25 个数字，逐个抄进来当独立对照 —— 不从 pump-state.js 读，
# 否则就是拿数据验数据、转录错了也发现不了。
REPORT_VALUES = {
    "电机非驱动端水平": 1.85, "电机非驱动端垂直": 0.90, "电机非驱动端轴向": 0.59,
    "电机驱动端水平": 2.40, "电机驱动端垂直": 0.50, "电机非驱动端斜45°": 1.89,
    "电机驱动端轴向": 0.65,
    "电机基础上A": 0.56, "电机基础上B": 0.62, "电机基础上C": 0.51, "电机基础上D": 0.51,
    "电机基础下A": 0.22, "电机基础下B": 0.30, "电机基础下C": 0.35, "电机基础下D": 0.34,
    "泵驱动端水平": 1.91, "泵驱动端垂直": 2.62, "泵驱动端轴向": 1.73,
    "泵非驱动端水平": 1.57, "泵非驱动端垂直": 2.16, "泵非驱动端轴向": 1.36,
    "泵基础E": 1.55, "泵基础F": 2.40, "泵基础G": 1.15, "泵基础H": 0.68,
}
EXPECT_PART_POINTS = {"motor": 7, "base": 12, "front-bearing": 3, "pump-body": 3,
                      "coupling": 0, "seal": 0}

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
        page.wait_for_timeout(4000)

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
        check(canvas["designW"] == 2471, "设计画布宽 2471，与另外几个 v2 一致（实际 %s）" % canvas["designW"])

        # ---------------- B. 骨架 ----------------
        sk = page.evaluate("""() => ({
          rows: document.querySelectorAll('#appRoot > *').length,
          metrics: document.querySelectorAll('.st-stat-band .card-metric').length,
          left: document.querySelectorAll('.st-left-col > *').length,
          right: document.querySelectorAll('.st-right-col > *').length,
          partCards: document.querySelectorAll('.st-part-card').length,
          pins: document.querySelectorAll('.pump3d-labels [data-part]').length,
          pinsOutside: Array.from(document.querySelectorAll('[data-part]'))
            .filter(e => !e.closest('.pump3d-labels')).length,
          canvas: document.querySelectorAll('.pump3d-canvas').length,
          charts: window.Charts.debugInfo(),
          legacy: document.querySelectorAll('.flow-track, .ag-drawer, .kb-scene, .agent-fab').length
        })""")
        check(sk["rows"] == 4, "回字形四段：顶栏/指标带/中段/部位带（实际 %s）" % sk["rows"])
        check(sk["metrics"] == 4, "指标带 4 个大数（实际 %s）" % sk["metrics"])
        check(sk["left"] == 3 and sk["right"] == 2,
              "左栏 3 块（两图 + 档案）/ 右栏 2 块（测点表 + 结论）（实际 %s / %s）" % (sk["left"], sk["right"]))
        check(sk["partCards"] == 6 and sk["pins"] == 6,
              "6 张部位卡 + 6 个 3D 热点（实际 %s / %s）" % (sk["partCards"], sk["pins"]))
        check(sk["pinsOutside"] == 0,
              "★ [data-part] 一个都没落在 .pump3d-labels 之外 —— 复用它会让 engine 的 buildLabelMap "
              "把非 3D 元素收进 labelEls，3D 标签会同时消失且不报错（部位卡用的是 data-part-id）")
        check(sk["canvas"] == 1, "3D 画布 1 个")
        check(sk["charts"]["slots"] == 2 and sk["charts"]["instances"] == 2,
              "2 个图槽 2 个实例 —— slot 与 draw 严格相等（实际 %s）" % sk["charts"])
        check(sk["legacy"] == 0,
              "已删除：6 步流程轨 / Agent 抽屉 / 知识库 / 常驻 AI 按钮（那些是诊断台那一屏的事）")

        # ---------------- C. ★ 数据对账 ----------------
        d = page.evaluate("""() => {
          const M = window.PumpMeasure, S = window.PumpState;
          const pts = M.points();
          const byPart = {};
          M.parts().forEach(p => { byPart[p.id] = M.pointsByPart(p.id).length; });
          const s = M.summary();
          return {
            values: pts.reduce((a, p) => { a[p.name] = p.value; return a; }, {}),
            byPart: byPart,
            partOrder: M.parts().map(p => p.id),
            contractOrder: window.Pump3DContract.PART_IDS,
            grade: s.grade.grade, max: s.max, worst: s.worstPoint.name,
            overA: s.overGradeA,
            overNames: pts.filter(p => p.value >= 2.3).map(p => p.name),
            measuredParts: s.measuredParts,
            statuses: M.statuses(),
            thresholdFilled: s.thresholdFilled,
            findings: M.findings().length,
            ledger: s.ledger.station + s.ledger.tag + '/' + s.ledger.vendor + '/' + s.ledger.model,
            gradeBands: S.grades().map(g => g.grade + ':' + g.min + '-' + (isFinite(g.max) ? g.max : '∞'))
          };
        }""")
        bad = [k for k, v in REPORT_VALUES.items() if abs(d["values"].get(k, -1) - v) > 1e-9]
        check(not bad, "★ 25 个测点的值逐个等于报告表 4 的数字（不一致的：%s）" % bad)
        check(len(d["values"]) == 25, "测点恰好 25 个（GB/T 19873 标准布置）（实际 %s）" % len(d["values"]))
        check(d["byPart"] == EXPECT_PART_POINTS,
              "★ 25 → 6 的挂接：电机 7 / 底座 12 / 驱动端轴承 3 / 泵本体 3 / 联轴器 0 / 机封 0（实际 %s）"
              % d["byPart"])
        check(d["partOrder"] == d["contractOrder"],
              "部位顺序与 Pump3DContract.PART_IDS 逐项一致（实际 %s）" % d["partOrder"])
        check(d["gradeBands"] == ["A:0-2.3", "B:2.3-4.5", "C:4.5-7.1", "D:7.1-∞"],
              "ISO 10186-3 四档阈值就是报告表 2 的原文（实际 %s）" % d["gradeBands"])
        check(d["grade"] == "B" and abs(d["max"] - 2.62) < 1e-9 and d["worst"] == "泵驱动端垂直",
              "★ 机组定级复现报告原文：最大 2.62mm/s 在泵驱动端垂直 → B 良（实际 %s / %s / %s）"
              % (d["max"], d["grade"], d["worst"]))
        check(d["overA"] == 3
              and sorted(d["overNames"]) == sorted(["电机驱动端水平", "泵驱动端垂直", "泵基础F"]),
              "★ 越 A 级界（2.3）的就是报告里那 3 个点：电机驱动端水平 2.40 / 泵驱动端垂直 2.62 / 泵基础F 2.40（实际 %s）"
              % d["overNames"])
        check(d["measuredParts"] == 4,
              "★ 6 个部位里只有 4 个有测振点 —— 联轴器与机械密封是 0，这不是数据缺失（实际 %s）"
              % d["measuredParts"])
        check(d["statuses"]["coupling"] == "danger",
              "★ 联轴器无测振点却判 danger：报告靠相位差 90° + 100.3Hz 二倍频推断出不对中，"
              "正因为测不到才最该去现场（实际 %s）" % d["statuses"]["coupling"])
        check(d["statuses"]["seal"] == "ok" and d["statuses"]["pump-body"] == "ok"
              and d["statuses"]["motor"] == "warn" and d["statuses"]["base"] == "warn"
              and d["statuses"]["front-bearing"] == "warn",
              "部位状态：泵本体 A→ok / 电机·底座·驱动端轴承 B→warn / 机封 无数据→ok（实际 %s）" % d["statuses"])
        check(d["thresholdFilled"] is False,
              "★ 这台机组在台账里的振动·温度阈值未填报 —— 与大屏「阈值缺项 40/40」同源")
        check(d["findings"] == 3, "报告诊断结论 3 条（实际 %s）" % d["findings"])
        check(d["ledger"] == "长岭站Ｐ－1泵/湖南天一奥星泵业/KSY900-225",
              "台账行对得上：长岭站 Ｐ－1泵 / 湖南天一奥星泵业 KSY900-225（实际 %s）" % d["ledger"])
        page.screenshot(path=str(SHOT_DIR / "01-overview.png"))

        # ---------------- D. 部位下钻 ----------------
        expect_empty = {"seal": (0, "机械密封 没有测振点"), "coupling": (1, "联轴器 没有测振点")}
        for pid in ["pump-body", "seal", "front-bearing", "coupling", "motor", "base"]:
            page.eval_on_selector('.st-part-card[data-part-id="%s"]' % pid, "el => el.click()")
            page.wait_for_timeout(800)
            st = page.evaluate("""(pid) => {
              const M = window.PumpMeasure;
              return {
                rows: document.querySelectorAll('.st-point-row').length,
                expectRows: M.pointsByPart(pid).length,
                empty: !!document.querySelector('.st-point-empty'),
                emptyTitle: document.querySelector('.st-point-empty strong')
                  ? document.querySelector('.st-point-empty strong').textContent.trim() : null,
                findings: document.querySelectorAll('.st-finding-row').length,
                back: !!document.querySelector('.st-zoom-back'),
                place: document.querySelector('.st-map-place h3').textContent,
                charts: window.Charts.debugInfo().instances
              };
            }""", pid)
            if st["rows"] != st["expectRows"] or not st["back"] or st["charts"] != 2:
                check(False, "下钻 %s 后状态异常：%s" % (pid, st))
                break
            if pid in expect_empty:
                want_f, want_title = expect_empty[pid]
                if not st["empty"] or st["emptyTitle"] != want_title or st["findings"] != want_f:
                    check(False, "%s 的空态分支不对：%s" % (pid, st))
                    break
            page.eval_on_selector('[data-action="clear-part"]', "el => el.click()")
            page.wait_for_timeout(500)
        else:
            check(True, "★ 6 个部位逐个下钻 + 返回总览，行数与 pointsByPart 逐个相等、图表实例恒为 2、全程无错")
            check(True, "★ 无测振点的两个走空态：机封写「振动检测不覆盖」且 0 条结论，"
                        "联轴器写「靠相位差推断」且命中 1 条结论 —— 两者理由不同，不是同一句话")
        check(not errors, "下钻遍历后 pageerror 仍为空（实际 %s 条）%s"
              % (len(errors), errors[0][:200] if errors else ""))
        page.eval_on_selector('.st-part-card[data-part-id="motor"]', "el => el.click()")
        page.wait_for_timeout(1000)
        page.screenshot(path=str(SHOT_DIR / "02-motor.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(700)
        check(page.evaluate("() => !document.querySelector('.st-zoom-back')"),
              "Esc 能退回机组总览")

        # ---------------- E. 排版 ----------------
        lay = page.evaluate("""() => {
          const body = document.querySelector('.st-point-body');
          const rows = Array.from(document.querySelectorAll('.st-point-row'));
          const clipped = rows.filter(r => {
            const n = r.querySelector('.st-point-name');
            return n.scrollWidth > n.clientWidth + 1;
          }).length;
          // 按屏幕位置分列，看每列的首尾序号
          const pos = rows.map(r => { const b = r.getBoundingClientRect();
            return { idx: +r.querySelector('.num').textContent, x: Math.round(b.left), y: Math.round(b.top) }; });
          pos.sort((a, b) => (a.x - b.x) || (a.y - b.y));
          const cols = {};
          pos.forEach(p => { cols[p.x] = cols[p.x] || []; cols[p.x].push(p.idx); });
          const colList = Object.keys(cols).sort((a, b) => a - b).map(k => cols[k]);
          const sealDot = document.querySelector('.st-part-card.no-signal .dot');
          const sealBg = sealDot ? getComputedStyle(sealDot).backgroundColor : null;
          return {
            twoCols: !!document.querySelector('.is-two-cols'),
            scrolls: body.scrollHeight > body.clientHeight + 1,
            clipped: clipped,
            colHeads: colList.map(c => [c[0], c[c.length - 1], c.length]),
            noSignal: document.querySelectorAll('.st-part-card.no-signal').length,
            sealDotTransparent: sealBg === 'rgba(0, 0, 0, 0)' || sealBg === 'transparent'
          };
        }""")
        check(lay["twoCols"] and not lay["scrolls"],
              "★ 全机组 25 行排两列、一屏放完不用滚（单列要 1437px，这一格只有约 600px）")
        check(lay["clipped"] == 0, "两列下测点名一个都没被省略号截断（实际截断 %s 个）" % lay["clipped"])
        check(lay["colHeads"] == [[1, 13, 13], [14, 25, 12]],
              "★ 列优先填充：左列 1→13、右列 14→25。默认的行优先会排成左1右2/左3右4，"
              "顺着左列读是 1,3,5,7… 会以为漏了一半（实际 %s）" % lay["colHeads"])
        check(lay["noSignal"] == 1 and lay["sealDotTransparent"],
              "★ 机械密封的状态点是空心灰不是绿点 —— 绿点在说「测过了，正常」，实情是「没测」"
              "（Pump3DContract.STATUSES 只有三档，加不了第四种状态，所以靠 CSS 区分）")

        browser.close()

    print("\n截图目录：%s" % SHOT_DIR)
    print("\n===== 汇总：%s passed, %s failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%s 项断言）" % PASS)


if __name__ == "__main__":
    main()
