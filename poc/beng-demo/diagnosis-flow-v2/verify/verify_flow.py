# 验收：以 file:// 打开 index.html（模拟真实双击），断言七组。
#
#   A. 加载健康   pageerror / console.error 为空、固定画布真生效、无「巡检」残留文案
#   B. 三页骨架   各页栏数、三页都有常驻 Agent 按钮、旧结构类名不存在
#   C. ★ 素材对齐 依据链七枚逐个渲染、bbox 落在 [0,1]、真实图片真的加载了、
#                 时序末点等于现场读数、置信度等于加权四项相乘
#   D. 故事线     assets/诊断工作台/泵课题Q&A.docx 那条主线的关键数字逐个在屏上可见
#   E. 主线三步   分歧闸门 → 意见原文进报告 → PDF 按分歧态切换 → 归档 → 知识库
#   F. Agent      三页 7/5/6 问、抽屉占半屏、引用无悬空、归档前后引用行为不同
#   G. 报告一致   屏上预览与预构建 PDF 来自同一模板（页数、分歧段、章节编号连续）
#
# ⚠️ C 与 D 两组是这个 POC 的全部理由。屏上每个关键数字都要能回到素材：
#    SCADA 截图（16:30-16:37，末点 11.9）、Easy-Laser 两张（0.31 → -0.02mm）、
#    四份真实停泵报告（Top-4 的确诊各不相同）。它们红了，说明数据与素材脱钩，
#    必须先修数据，**不要改断言**。
import os
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "beng-diagnosis-flow-v2-verify"))
CONSOLE_ALLOW = ('Scripts "build/three.js"', "SwiftShader")

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
                if m.type == "error" and not m.text.startswith(CONSOLE_ALLOW) else None)

        page.goto(INDEX, wait_until="load")
        page.wait_for_timeout(1600)

        # ---------------- A. 加载健康 ----------------
        check(not errors, "pageerror 为空（实际 %d 条）%s"
              % (len(errors), ("：\n" + "\n".join(errors[:3])) if errors else ""))
        check(not console, "console.error 白名单外为空（实际 %d 条）%s"
              % (len(console), ("：\n" + "\n".join(console[:3])) if console else ""))
        canvas = page.evaluate("""() => {
          const root = document.documentElement, shell = document.querySelector('.app-shell');
          return { scale: parseFloat(getComputedStyle(root).getPropertyValue('--screen-scale')),
                   hasTransform: getComputedStyle(shell).transform !== 'none',
                   designW: parseInt(getComputedStyle(root).getPropertyValue('--screen-design-width'), 10),
                   title: document.title };
        }""")
        check(0 < canvas["scale"] < 1, "--screen-scale 已算出且小于 1（实际 %.3f）" % canvas["scale"])
        check(canvas["hasTransform"], "固定画布生效：.app-shell 有 transform")
        check(canvas["designW"] == 2471, "设计画布宽 2471，与其它 v2 一致（实际 %s）" % canvas["designW"])
        # 这是泵课题，标题和屏上文案里不该出现「巡检」——那是从参照物复制时最容易漏的地方。
        leftover = page.evaluate("""() => {
          const t = document.body.innerText;
          const hits = [];
          ['巡检记录', '巡检诊断台', '巡检项', '巡检人'].forEach(w => {
            if (t.indexOf(w) >= 0) hits.push(w);
          });
          return { title: document.title, hits: hits };
        }""")
        check("巡检" not in leftover["title"],
              "★ 页面标题是泵课题的（实际「%s」）" % leftover["title"])
        check(not leftover["hits"],
              "★ 屏上没有从参照物带过来的「巡检」文案（命中 %s）" % leftover["hits"])

        # ---------------- B. 三页骨架 ----------------
        sk = page.evaluate("""() => ({
          rows: document.querySelectorAll('#appRoot > *').length,
          wbCols: document.querySelectorAll('.wb-scene > *').length,
          records: document.querySelectorAll('.dx-row').length,
          chain: document.querySelectorAll('[data-action="select-evidence"]').length,
          stages: document.querySelectorAll('.wb-stage-label').length,
          alt: document.querySelectorAll('.wb-alt').length,
          fab: document.querySelectorAll('.agent-fab').length,
          steps: document.querySelectorAll('[data-action="go-scene"]').length,
          legacy: document.querySelectorAll('.flow-rail, .flow-track, .detail-screen').length
        })""")
        check(sk["rows"] == 3, "三段：顶栏 / 舞台 / 常驻 AI 按钮（实际 %s）" % sk["rows"])
        check(sk["wbCols"] == 3, "工作台三栏：记录 / AI 判断 / 证据台（实际 %s）" % sk["wbCols"])
        check(sk["records"] == 3, "本轮 3 条诊断记录（实际 %s）" % sk["records"])
        check(sk["chain"] == 7, "★ REC-1 依据链 7 枚（实际 %s）" % sk["chain"])
        # ★ 故事线四步在屏上分段可见 —— assets/诊断工作台/泵课题Q&A.docx 的
        # 「时序引擎 → 视觉引擎 → RAG 引擎 → 应用层」，讲解时逐段往下指。
        check(sk["stages"] == 4,
              "★ 依据链按故事线四步分段：时序引擎 / 视觉与实测 / 检索与判定 / 应用层（实际 %s 段）"
              % sk["stages"])
        check(sk["alt"] == 1,
              "★ AI 判断卡里有备选诊断（Q&A 的 Q2「你到底是确诊还是猜谜」—— 只给一个置信度就是回避）")
        check(sk["fab"] == 1, "常驻 AI 助手按钮在（刻意的常驻设计）")
        check(sk["steps"] == 3, "主线三步导航（实际 %s）" % sk["steps"])
        check(sk["legacy"] == 0, "已删除：6 步流程轨 / 整屏子屏（旧目录那套）")

        # ---------------- C. ★ 素材对齐 ----------------
        d = page.evaluate("""() => {
          const ST = window.DOMAIN_STATION, V = window.DOMAIN_VISION,
                SR = window.DOMAIN_SERIES, R = window.DOMAIN_RECORDS;
          const point = ST.pointById('VIB-DE');
          const st = SR.stats('VIB-DE');
          const badBox = [];
          V.frames.forEach(f => f.boxes.forEach(b => {
            const k = b.bbox;
            if (k.x < 0 || k.y < 0 || k.w <= 0 || k.h <= 0 ||
                k.x + k.w > 1.0001 || k.y + k.h > 1.0001) badBox.push(f.id + '/' + b.id);
            if (!b.tone || !b.note) badBox.push(f.id + '/' + b.id + '(缺 tone/note)');
          }));
          const hit = R.caseHitById('CASE-TOP4');
          const product = hit.weighting.reduce((a, w) => a * w.value, 1);
          return {
            chainKinds: R.recordById('REC-1').evidence.map(e => e.kind),
            badBox: badBox,
            frameCount: V.frames.length,
            seriesEnd: st.last, fieldReading: point.fieldReading,
            peak: st.max, rise: st.risePercent, total: st.total,
            startAt: st.startAt, endAt: st.endAt,
            confShown: R.recordById('REC-1').suggestion.confidence,
            confProduct: Math.round(product * 100),
            altConf: R.recordById('REC-1').suggestion.alternative.confidence,
            align: R.alignmentById('ALIGN-0722').rows.map(r => r.label + ' ' + r.before + '→' + r.after),
            caseVerdicts: hit.rows.map(r => r.verdict)
          };
        }""")
        check(d["chainKinds"] == ["series", "vision", "alignment", "vision", "case", "rule", "plan"],
              "依据链形态：时序 / SCADA 截图 / 对中实测 / 渗漏排除 / 历史案例 / 口径 / 处置（实际 %s）"
              % d["chainKinds"])
        check(not d["badBox"], "所有 bbox 落在 [0,1] 且带 tone/note（有问题的：%s）" % d["badBox"])
        check(d["frameCount"] == 6, "六帧素材（SCADA + 仪器两张 + 现场两张 + 库内样本）（实际 %s）" % d["frameCount"])
        check(abs(d["seriesEnd"] - d["fieldReading"]) < 1e-9,
              "★ 时序末点 %.1f === 现场读数 %.1f（两处不等就是数据错了）" % (d["seriesEnd"], d["fieldReading"]))
        check(d["startAt"].endswith("16:30:00") and d["endAt"].endswith("16:37:00"),
              "★ 曲线区间就是 SCADA 截图上的 16:30-16:37（实际 %s → %s）" % (d["startAt"], d["endAt"]))
        check(11.5 < d["peak"] < 12.5,
              "★ 峰值复现截图上那个 12.1 尖峰（实际 %.2f）" % d["peak"])
        check(d["confShown"] == d["confProduct"],
              "★ 置信度 %s%% 等于加权四项相乘 %s%% —— Q&A 的 Q1 追问「这数字怎么算出来的」，"
              "屏上摊开的四项必须真的乘得出卡上那个数" % (d["confShown"], d["confProduct"]))
        check(d["altConf"] == 61, "备选诊断置信度 61%%（实际 %s）" % d["altConf"])
        check(any("0.31" in x and "-0.02" in x for x in d["align"]),
              "★ 对中实测 H 向 0.31 → -0.02mm 来自 Easy-Laser 两张屏幕照（实际 %s）" % d["align"])
        check(len(set(d["caseVerdicts"])) == 4,
              "★ Top-4 的确诊**各不相同**（低流量/轴承磨损/探头故障/工艺水击）—— "
              "这就是「振动高 ≠ 轴承坏」的活证据（实际 %s）" % d["caseVerdicts"])

        # 七枚依据逐个点开：形态、图片、识别框
        kinds_seen, img_bad, box_undef = set(), [], 0
        for i in range(7):
            page.eval_on_selector('[data-action="select-evidence"][data-evidence-index="%d"]' % i, "el => el.click()")
            page.wait_for_timeout(320)
            r = page.evaluate("""() => {
              const bd = document.querySelector('.ev-body');
              const im = Array.from(document.querySelectorAll('.ev img'));
              const bx = Array.from(document.querySelectorAll('.ev-box'));
              return { cls: bd ? bd.className.replace('ev-body ', '') : '',
                       imgBad: im.filter(x => !x.complete || x.naturalWidth === 0).map(x => x.getAttribute('src')),
                       undef: bx.filter(b => b.className.indexOf('undefined') >= 0).length };
            }""")
            kinds_seen.add(r["cls"])
            img_bad += r["imgBad"]
            box_undef += r["undef"]
        check(kinds_seen == {"ev-series", "ev-vision", "ev-align", "ev-cases", "ev-rule", "ev-plan"},
              "★ 六种证据形态全部渲染无错（实际 %s）" % sorted(kinds_seen))
        check(not img_bad, "真实素材图全部加载成功（失败的：%s）" % sorted(set(img_bad)))
        check(box_undef == 0, "识别框都有 tone（class 里没有 undefined）（实际 %s 个）" % box_undef)
        page.screenshot(path=str(SHOT_DIR / "01-workbench.png"))

        # ---------------- D. 故事线关键数字在屏上可见 ----------------
        page.eval_on_selector('[data-action="select-evidence"][data-evidence-index="4"]', "el => el.click()")
        page.wait_for_timeout(400)
        story = page.evaluate("""() => {
          const t = document.body.innerText;
          const want = {
            '主诊断 83%': t.indexOf('83%') >= 0,
            '备选 61%': t.indexOf('61%') >= 0,
            'Top-4 检索': t.indexOf('历史案例检索') >= 0,
            '确诊标签减分 0.85': t.indexOf('0.85') >= 0,
            '对中 0.31': t.indexOf('0.31') >= 0,
            'ISO D 档': t.indexOf('D 档') >= 0
          };
          return want;
        }""")
        for k, v in story.items():
            check(v, "★ 故事线关键数字在屏上：%s" % k)
        page.screenshot(path=str(SHOT_DIR / "02-cases.png"))

        # 分级处置那一枚：备件与作业卡必须只是说明，不能有"已推送"或可点按钮
        page.eval_on_selector('[data-action="select-evidence"][data-evidence-index="6"]', "el => el.click()")
        page.wait_for_timeout(400)
        plan = page.evaluate("""() => {
          const box = document.querySelector('.ev-plan');
          const t = box ? box.innerText : '';
          return { steps: document.querySelectorAll('.ev-plan-step').length,
                   basis: t.indexOf('72 小时') >= 0,
                   notPushed: t.indexOf('本演示没有接入') >= 0 || t.indexOf('本演示未接入') >= 0,
                   fakePush: t.indexOf('已推送') >= 0 || t.indexOf('已发送') >= 0,
                   buttons: box ? box.querySelectorAll('button, a').length : -1 };
        }""")
        check(plan["steps"] == 4, "分级处置四个时间档（立即/4h/24h/72h）（实际 %s）" % plan["steps"])
        check(plan["basis"], "72 小时窗口的依据写在卡里，不是只说「保守值」")
        check(plan["notPushed"] and not plan["fakePush"],
              "★ 备件与移动端作业卡**只有文字说明**，没有「已推送」这类假状态")
        check(plan["buttons"] == 0,
              "★ 处置卡里没有可点按钮 —— 不做假动作（实际 %s 个）" % plan["buttons"])
        page.screenshot(path=str(SHOT_DIR / "03-plan.png"))

        # ---------------- E. 主线三步 ----------------
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="review"]', "el => el.click()")
        page.wait_for_timeout(700)
        rv = page.evaluate("""() => ({
          outcomes: document.querySelectorAll('[data-action="select-outcome"]').length,
          phrases: document.querySelectorAll('.rv-phrases .chip').length,
          archiveDisabled: document.querySelector('[data-action="open-archive"]').disabled
        })""")
        check(rv["outcomes"] == 4, "四个结论可选（实际 %s）" % rv["outcomes"])
        check(rv["phrases"] == 5, "五条常用语（实际 %s）" % rv["phrases"])
        check(rv["archiveDisabled"], "未选结论时归档按钮 disabled —— 机械约束，不是提示")

        # 改判：选与 AI 建议不同的结论 → 分歧态
        page.eval_on_selector('[data-action="select-outcome"][data-outcome-id="OUT-RECHECK"]', "el => el.click()")
        page.wait_for_timeout(600)
        div = page.evaluate("""() => ({
          divergent: window.AppState.divergent(),
          canArchive: window.AppState.canArchive(),
          hasHint: document.body.innerText.indexOf('分歧') >= 0
        })""")
        check(div["divergent"] and not div["canArchive"],
              "★ 改判进入分歧态且未填意见时不能归档（复核意见变必填）")
        check(div["hasHint"], "屏上出现分歧提示")
        page.eval_on_selector('.rv-phrases .chip:nth-of-type(4)', "el => el.click()")
        page.wait_for_timeout(500)
        after = page.evaluate("""() => ({
          canArchive: window.AppState.canArchive(),
          pages: document.querySelectorAll('.rp-page').length,
          noteEcho: document.body.innerText.indexOf('不采纳主诊断') >= 0
        })""")
        check(after["canArchive"], "填写分歧理由后归档按钮启用")
        check(after["pages"] == 2, "报告草稿 2 页（实际 %s）" % after["pages"])
        check(after["noteEcho"], "★ 复核意见原文逐字出现在报告正文里")
        page.screenshot(path=str(SHOT_DIR / "04-review.png"))

        page.eval_on_selector('[data-action="open-archive"]', "el => el.click()")
        page.wait_for_timeout(900)
        ar = page.evaluate("""() => {
          const a = document.querySelector('.ov-mask a[href$=".pdf"]');
          const t = document.body.innerText;
          return { open: !!document.querySelector('.ov-mask'),
                   pages: document.querySelectorAll('.ov-mask .rp-page').length,
                   pdf: a ? a.getAttribute('href') : null,
                   divergenceSec: t.indexOf('复核分歧说明') >= 0,
                   planSec: t.indexOf('分级处置建议') >= 0,
                   confSec: t.indexOf('置信度构成') >= 0 };
        }""")
        check(ar["open"] and ar["pages"] == 2, "归档浮窗内嵌 A4 预览 2 页（实际 %s）" % ar["pages"])
        check(ar["pdf"] and ar["pdf"].endswith("divergent.pdf"),
              "★ 分歧态挂的是 divergent 那份 PDF（实际 %s）" % ar["pdf"])
        check((ROOT / ar["pdf"]).exists(), "★ 该 PDF 真的存在于磁盘（%s）" % ar["pdf"])
        check(ar["divergenceSec"], "报告里有「复核分歧说明」段")
        check(ar["planSec"] and ar["confSec"],
              "★ 报告里有「置信度构成」与「分级处置建议」两段 —— Q&A 里被追问过的东西必须落到纸上")

        # 处置去向：故事线第四步「IMS 工单 + 备件 + 作业卡」的落点。
        # 三条硬约束一起验 —— 少任何一条，这块就变成了一个假动作。
        dis = page.evaluate("""() => {
          const d = document.querySelector('.ar-dispatch');
          const t = d ? d.innerText : '';
          return { rows: document.querySelectorAll('.ar-dispatch-row').length,
                   clickable: d ? d.querySelectorAll('button,a,input').length : -1,
                   fake: ['已推送', '已生成', '已发送', '已开单'].filter(w => t.indexOf(w) >= 0),
                   notice: t.indexOf('未接入') >= 0 };
        }""")
        check(dis["rows"] == 4,
              "★ 归档浮窗有「处置去向」四行（IMS 工单 / 备件清单 / 移动端作业卡 / 下轮复查）（实际 %s）"
              % dis["rows"])
        check(dis["clickable"] == 0 and not dis["fake"] and dis["notice"],
              "★ 处置去向全是文字说明：0 个可点元素、无「已推送」这类完成态、明写未接入"
              "（可点 %s / 假态 %s）" % (dis["clickable"], dis["fake"]))
        page.screenshot(path=str(SHOT_DIR / "05-archive.png"))

        page.eval_on_selector('[data-action="confirm-archive"]', "el => el.click()")
        page.wait_for_timeout(600)
        check(page.evaluate("() => window.AppState.value.archived"), "确认归档后 archived = true")

        page.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        page.wait_for_timeout(700)
        kb = page.evaluate("""() => ({
          assets: document.querySelectorAll('.kb-asset').length,
          pending: document.querySelectorAll('.kb-asset.pending').length,
          cats: Array.from(document.querySelectorAll('.kb-cats .stat strong')).map(e => e.textContent)
        })""")
        check(kb["assets"] == 7 and kb["pending"] == 0,
              "归档后 7 份资产全部已索引（实际 %s 份 / %s 待归档）" % (kb["assets"], kb["pending"]))
        check(all(c.split(" / ")[0] == c.split(" / ")[1] for c in kb["cats"]),
              "四个分类的可检索数都等于总数：%s" % " ".join(kb["cats"]))
        page.screenshot(path=str(SHOT_DIR / "06-knowledge.png"))

        # ---------------- F. Agent ----------------
        counts = {}
        for scene, want in [("workbench", 7), ("review", 5), ("knowledge", 6)]:
            page.eval_on_selector('[data-action="go-scene"][data-scene-key="%s"]' % scene, "el => el.click()")
            page.wait_for_timeout(500)
            page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
            page.wait_for_timeout(400)
            r = page.evaluate("""() => ({
              qs: document.querySelectorAll('.ag-drawer [data-action="ask-agent"]').length,
              ratio: document.querySelector('.ag-drawer').getBoundingClientRect().width /
                     document.querySelector('.app-shell').getBoundingClientRect().width
            })""")
            counts[scene] = r["qs"]
            check(r["qs"] == want, "%s 页 Agent %s 问（实际 %s）" % (scene, want, r["qs"]))
            check(abs(r["ratio"] - 0.5) < 0.01, "%s 页 AI 抽屉占半屏（实际 %.3f）" % (scene, r["ratio"]))
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
        check(sum(counts.values()) == 18,
              "★ Q&A 那 17 轮质询改写后共 18 问、分散在三页（实际 %s）" % sum(counts.values()))

        cites = page.evaluate("""() => {
          const KB = window.DOMAIN_KB;
          const ids = KB.assets.map(a => a.id);
          const bad = [];
          Object.keys(KB.agentContexts).forEach(k => {
            KB.agentContexts[k].questions.forEach(q => {
              q.cites.forEach(c => { if (ids.indexOf(c) < 0) bad.push(q.id + '->' + c); });
            });
          });
          return bad;
        }""")
        check(not cites, "★ Agent 语料的引用全部指向真实资产（悬空的：%s）" % cites)

        # 归档后那一问能引用刚入库的报告
        page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.eval_on_selector('.ag-drawer [data-question-id="Q-KB-3"]', "el => el.click()")
        page.wait_for_timeout(1500)
        check(page.evaluate("""() => document.querySelector('.ag-drawer').innerText
                .indexOf('引用 · 输油泵机组智能诊断复核报告') >= 0"""),
              "★ 归档后 Agent 能引用刚入库的复核报告")
        page.screenshot(path=str(SHOT_DIR / "07-agent.png"))
        page.keyboard.press("Escape")

        # ---------------- G. 报告一致 ----------------
        check(not errors, "全流程走完后 pageerror 仍为空（实际 %s 条）%s"
              % (len(errors), errors[0][:200] if errors else ""))
        for name in ["pump-diagnosis-report-accepted.pdf", "pump-diagnosis-report-divergent.pdf"]:
            f = ROOT / "assets" / "reports" / name
            check(f.exists() and f.stat().st_size > 100_000,
                  "预构建 PDF 存在且非空：%s（%.0f KB）"
                  % (name, f.stat().st_size / 1024 if f.exists() else 0))

        browser.close()

    # 章节编号连续性：用模板 DOM 复核（PDF 里读不到文本）
    from urllib.parse import urlencode
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 900, "height": 1200})
        tpl = (ROOT / "tools" / "report-template.html").as_uri()
        for key, oc, want in [("accepted", "OUT-CONFIRM", 6), ("divergent", "OUT-RECHECK", 7)]:
            pg.goto(tpl + "?" + urlencode({"record": "REC-1", "reviewer": "RV-1", "outcome": oc,
                                           "note": "验收探针", "range": "7m", "at": "2026-07-22 17:05"}),
                    wait_until="load")
            pg.wait_for_function("() => !!window.__REPORT_READY__", timeout=20000)
            nums = pg.evaluate("""() => Array.from(document.querySelectorAll('.rp-sec h2'))
                .map(h => h.textContent.trim()).filter(t => /^[一二三四五六七八九十]+、/.test(t))
                .map(t => t.split('、')[0])""")
            cn = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
            check(nums == cn[:want],
                  "★ %s 版章节编号连续不跳号：%s" % (key, " ".join(nums)))
        b.close()

    print("\n截图目录：%s" % SHOT_DIR)
    print("\n===== 汇总：%s passed, %s failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%s 项断言）" % PASS)


if __name__ == "__main__":
    main()
