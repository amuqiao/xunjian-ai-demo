# 验收脚本：以 file:// 打开 index.html（模拟真实双击），断言六组事情。
#
#   A. 加载健康    pageerror / console.error 白名单外为空 / 固定画布真的生效
#   B. 三页骨架    各页栏数、三页都有常驻 Agent 按钮、旧结构类名不存在
#   B2. 两条故事线 五条记录按 audience 分两组、行为核查那条的四行三规则、概况四个数
#   C. 素材对齐    ★ 本 POC 最核心的一组：依据链长度逐条对、六种证据形态全渲染、
#                  bbox 落在 [0,1]、真实图片真的加载了、时序末点等于现场读数
#   D. 主线三步    分歧态 → 归档闸门 → 意见原文进报告 → PDF 按分歧态切换 → 归档 → 知识库
#   E. Agent      三页都能开、问答带引用、归档前后引用行为不同
#   F. 报告一致    屏上预览与预构建 PDF 来自同一模板（页数、分歧段一致）
#   G. 动画不重播  ★ 定时器驱动的更新不得重播 CSS 入场动画，对话流要贴底
#
# ⚠️ C 组是这次重做的全部理由。旧目录 diagnosis-flow 的部位与测点是先写出来再去找图配的：
# 三条记录共用同一帧 FRM-1-CUR，测点「泵体温度 75℃」「控制回路电源状态 88%」没有任何
# 对应的检查项，「油位与外观」这条目视项配了温度曲线 —— 一点就露。本版反过来先认素材
# （四张真实关键帧的 OSD 时间连续：20:01:55 / 20:10:26 / 20:13:39 / 20:18:35）再定表单项，
# 所以这一组断言红了，就说明素材与表单项又脱钩了，必须先修数据而不是改断言。
#
# 用法：uv run python poc/inspection-demo/diagnosis-flow-v2/verify/verify_flow.py
# 自定义截图目录：SHOT_DIR=/some/dir uv run python .../verify_flow.py
import json
import os
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
INDEX = (ROOT / "index.html").as_uri()
SHOT_DIR = Path(os.environ.get("SHOT_DIR") or (Path(tempfile.gettempdir()) / "diagnosis-flow-v2-verify"))

# 窄白名单。不做宽松匹配 —— file:// 下最可能出的问题（图片 404、CSS 解析中断）都会
# 以 console.error 冒出来，放宽就把它们藏掉了。
CONSOLE_ALLOW = ("Scripts \"build/three.js\"", "SwiftShader")

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


def bad_console(text):
    return not text.startswith(CONSOLE_ALLOW)


def click(pg, selector):
    pg.eval_on_selector(selector, "el => el.click()")


def main():
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        errors, console = [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console.append(m.text) if m.type == "error" and bad_console(m.text) else None)

        page.goto(INDEX, wait_until="load")
        page.wait_for_timeout(900)

        # ---------------- A. 加载健康 ----------------
        check(not errors, "pageerror 为空（实际 %d 条）%s" % (len(errors), ("：\n" + "\n".join(errors)) if errors else ""))
        check(not console, "console.error 白名单外为空（实际 %d 条）%s" % (len(console), ("：\n" + "\n".join(console)) if console else ""))

        canvas = page.evaluate("""() => {
          const root = document.documentElement;
          const shell = document.querySelector('.app-shell');
          const cs = getComputedStyle(shell);
          return {
            scale: parseFloat(getComputedStyle(root).getPropertyValue('--screen-scale')),
            hasTransform: cs.transform !== 'none',
            w: Math.round(shell.getBoundingClientRect().width),
            designW: parseInt(getComputedStyle(root).getPropertyValue('--screen-design-width'), 10)
          };
        }""")
        # 旧目录有同名的 screen-scale.js 在算 --screen-scale，但 .app-shell 没有任何
        # transform: scale() —— 变量算了没人用。这两条断言就是钉住"固定画布真的生效"。
        check(canvas["scale"] > 0 and canvas["scale"] < 1, "--screen-scale 已算出且小于 1（实际 %.3f）" % canvas["scale"])
        check(canvas["hasTransform"], "固定画布真的生效：.app-shell 有 transform（旧目录只算变量、没有 transform）")
        check(canvas["designW"] == 2471, "设计画布宽 2471，与另两个 v2 一致（实际 %s）" % canvas["designW"])

        # ---------------- B. 三页骨架 ----------------
        legacy = page.evaluate("""() => ({
          flowRail: document.querySelectorAll('.flow-rail, .flow-track, #flowTrack').length,
          detailScreen: document.querySelectorAll('.detail-screen, .ds-page').length,
          responsiveSheet: Array.from(document.styleSheets).filter(s =>
            (s.href || '').indexOf('11-responsive') >= 0).length,
          fab: document.querySelectorAll('.agent-fab').length,
          wbCols: document.querySelectorAll('.wb-scene > *').length
        })""")
        check(legacy["flowRail"] == 0, "已删除：6 步流程轨（旧目录 index.html 里连挂载点都没有，renderFlow 每次直接 return）")
        check(legacy["detailScreen"] == 0, "已删除：时序/视觉整屏子屏（改成右栏证据台 + 放大浮层）")
        check(legacy["responsiveSheet"] == 0, "已删除：687 行 / 10 个断点的响应式样式表（改用固定画布）")
        check(legacy["fab"] == 1, "常驻 AI 助手按钮在（实际 %s 个）" % legacy["fab"])
        check(legacy["wbCols"] == 3, "工作台三栏：记录 / AI 判断 / 证据台（实际 %s）" % legacy["wbCols"])

        # ---------------- C. 素材对齐（核心） ----------------
        align = page.evaluate("""() => {
          const R = window.DOMAIN_RECORDS, V = window.DOMAIN_VISION, S = window.DOMAIN_STATION, SR = window.DOMAIN_SERIES;
          const chains = {};
          R.records.forEach(r => { chains[r.id] = r.evidence.map(e => e.kind); });
          // bbox 全部落在 [0,1] 且不越界（x+w <= 1）
          const badBox = [];
          V.frames.forEach(f => f.boxes.forEach(b => {
            const k = b.bbox;
            if (k.x < 0 || k.y < 0 || k.w <= 0 || k.h <= 0 || k.x + k.w > 1.0001 || k.y + k.h > 1.0001) {
              badBox.push(f.id + '/' + b.id);
            }
          }));
          // 每一帧的 src 都必须能解析到一个真实文件（naturalWidth > 0 在下面单独验）
          const point = S.pointById('PT-1');
          const last = SR.series('PT-1', '12h').slice(-1)[0];
          return {
            chains: chains,
            frameCount: V.frames.length,
            sharedFrames: (() => {
              // 旧目录三条记录共用 FRM-1-CUR。这里统计"被两条以上记录引用的帧"。
              const used = {};
              R.records.forEach(r => r.evidence.forEach(e => {
                if (e.frameId) used[e.frameId] = (used[e.frameId] || 0) + 1;
              }));
              return Object.keys(used).filter(k => used[k] > 2);
            })(),
            badBox: badBox,
            seriesEnd: last.value,
            fieldReading: point.fieldReading,
            warnAt: point.warnAt,
            dangerAt: point.dangerAt,
            pointCount: S.points.length,
            shotTimes: V.frames.filter(f => f.role !== 'site').map(f => f.shotAt)
          };
        }""")

        expect_chains = {"REC-1": ["series", "vision", "rule", "case"],
                         "REC-2": ["compare", "rule"],
                         "REC-3": ["timeline", "vision", "rule"],
                         "REC-4": ["gaps", "vision", "rule"],
                         # REC-5 是管理者视角那条（行为核查），依据形态与前四条都不同。
                         "REC-5": ["track", "rule", "vision"],
                         "REC-6": ["series", "rule"]}
        check(align["chains"] == expect_chains,
              "依据链逐条按检查项分型，长度 4/2/3/3/3/2 各不相同（旧版是 5 条清一色 4 枚固定芯片）")
        check(align["pointCount"] == 1,
              "测点只保留出口管线压力 1 个（旧版有 3 个，其中 2 个量纲没有对应的检查项）")
        check(not align["sharedFrames"], "没有被 3 条以上记录共用的关键帧（旧版三条共用 FRM-1-CUR）：%s" % align["sharedFrames"])
        check(not align["badBox"], "所有 bbox 落在 [0,1] 且不越界（越界的：%s）" % align["badBox"])
        check(abs(align["seriesEnd"] - align["fieldReading"]) < 1e-9,
              "时序末点 %.2f === 记录里的现场读数 %.2f" % (align["seriesEnd"], align["fieldReading"]))
        check(align["warnAt"] < align["fieldReading"] < align["dangerAt"],
              "现场读数落在高报警 %.1f 与高高报警 %.1f 之间 —— 正是本案例要讲的状态"
              % (align["warnAt"], align["dangerAt"]))
        check(align["shotTimes"] == ["2026-07-22 20:01:55", "2026-07-22 20:10:26",
                                     "2026-07-22 20:13:39", "2026-07-22 20:18:35"],
              "四张关键帧的 OSD 时间连续、与画面上烧进去的字逐字一致：%s" % " → ".join(align["shotTimes"]))

        # 六种证据形态逐个渲染 + 图片真的加载了
        kinds_seen = set()
        img_bad = []
        row_ids = page.evaluate("() => Array.from(document.querySelectorAll('.dx-row')).map(r => r.dataset.selectId)")
        for rid in row_ids:
            page.eval_on_selector('[data-select-id="%s"]' % rid, "el => el.click()")
            page.wait_for_timeout(180)
            n = page.evaluate("() => document.querySelectorAll('[data-action=\"select-evidence\"]').length")
            for i in range(n):
                btns = page.query_selector_all('[data-action="select-evidence"]')
                if i >= len(btns) or btns[i].get_attribute("disabled") is not None:
                    continue
                btns[i].click()
                page.wait_for_timeout(280)
                kinds_seen.add(page.evaluate(
                    "() => { const s = window.DemoDebug.state();"
                    " const r = window.DOMAIN_RECORDS.recordById(s.recordId);"
                    " return r.evidence[s.evidenceIndex].kind; }"))
                img_bad += page.evaluate("""() => Array.from(document.querySelectorAll('.ev img'))
                    .filter(im => !im.complete || im.naturalWidth === 0)
                    .map(im => im.getAttribute('src'))""")
        check(kinds_seen == {"series", "compare", "timeline", "gaps", "vision", "rule", "track"},
              "★ 七种证据形态全部渲染无错 —— track 是管理者视角新增的那种"
              "（行为核查：提交时刻/间隔/停留 三个数各对一条规则）（实际 %s）" % sorted(kinds_seen))
        check(not img_bad, "证据台里的真实关键帧全部加载成功（失败的：%s）" % sorted(set(img_bad)))

        # ---- ★ 两条故事线：巡检人员视角 / 管理者视角 ----
        # 这一屏要同时讲"我填的对不对"（执行者）和"这一轮可不可信"（管理者）。
        # 五条记录按 audience 分成两组，概况带上四个数也按这条线拆开。
        story = page.evaluate("""() => {
          const R = window.DOMAIN_RECORDS;
          const rows = R.rowsOf('OBJ-A');
          const byAud = {};
          R.records.filter(r => r.objectId === 'OBJ-A').forEach(r => {
            byAud[r.audience] = (byAud[r.audience] || 0) + 1;
          });
          const flags = {};
          rows.forEach(r => { flags[r.aiFlag] = (flags[r.aiFlag] || 0) + 1; });
          return { byAud: byAud, flags: flags,
                   stats: Array.from(document.querySelectorAll('.stat')).map(s => s.innerText.replace('\\n', ' ')),
                   audLabels: R.records.filter(r => r.objectId === 'OBJ-A')
                     .map(r => r.id + ':' + R.audienceOf(r).label) };
        }""")
        check(story["byAud"] == {"executor": 2, "supervisor": 3},
              "★ 五条记录分成两条故事线：巡检员复核 2 条 / 班长核查 3 条（实际 %s）" % story["byAud"])
        check(story["flags"].get("behavior") == 1,
              "★ aiFlag 有独立的 behavior 档 —— 行为异常不能塞进 conflict："
              "前者是「这一项有没有真做」、后者是「AI 与人工判得不一样」，管理动作完全不同")
        check(len(story["stats"]) == 4 and any("行为异常" in x for x in story["stats"]),
              "★ 概况带四个数，行为异常单独一个 —— 两条故事线在概况上就分开了（实际 %s）"
              % story["stats"])

        # 行为核查那条记录：三个数各对一条规则，命中 2 条；且必须写明视觉为什么帮不上忙
        page.eval_on_selector('[data-select-id="REC-5"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.eval_on_selector('.wb-chain .chip:nth-of-type(1)', "el => el.click()")
        page.wait_for_timeout(500)
        trk = page.evaluate("""() => {
          const box = document.querySelector('.ev-track');
          const t = box ? box.innerText : '';
          return { rows: document.querySelectorAll('.ev-track-row').length,
                   hits: document.querySelectorAll('.ev-track-row.hit').length,
                   hasWindow: t.indexOf('20:13:39') >= 0 && t.indexOf('20:18:35') >= 0,
                   hasVisionLimit: t.indexOf('不在该机位视野内') >= 0,
                   aud: document.querySelector('.wb-audience strong').textContent };
        }""")
        check(trk["rows"] == 4 and trk["hits"] == 2,
              "★ 行为核查四行（提交时刻/间隔/停留/时段偏移），命中 2 条规则（实际 %s 行 / %s 命中）"
              % (trk["rows"], trk["hits"]))
        check(trk["hasWindow"],
              "★ 核查窗口两端来自真实关键帧的 OSD 时间（20:13:39 / 20:18:35）—— 时间基准不是编的")
        check(trk["hasVisionLimit"],
              "★ 写明该机位看不到电缆沟 —— 这类项只能靠人到位，行为核查是它唯一可核的维度。"
              "不写这一段，读者会问「怎么不看画面」")
        check(trk["aud"] == "班长核查", "行为核查那条标着「班长核查」（实际 %s）" % trk["aud"])
        page.screenshot(path=str(SHOT_DIR / "01b-behavior.png"))

        page.eval_on_selector('[data-select-id="REC-1"]', "el => el.click()")
        page.wait_for_timeout(200)
        page.eval_on_selector('[data-action="select-evidence"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SHOT_DIR / "01-workbench.png"))

        # 放大浮层用独立 chartId —— 同 id 会被后请求方把节点摘走，前者空掉。
        page.eval_on_selector('[data-action="open-zoom"]', "el => el.click()")
        page.wait_for_timeout(600)
        zoom = page.evaluate("() => ({ open: !!document.querySelector('.ov-mask'), charts: window.Charts.debugInfo() })")
        check(zoom["open"] and zoom["charts"]["instances"] == 2,
              "证据放大浮层与证据台各用独立图表实例（实际 %s 个）" % zoom["charts"]["instances"])
        page.eval_on_selector('[data-action="close-zoom"]', "el => el.click()")
        page.wait_for_timeout(300)

        # ---------------- D. 主线三步 ----------------
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="review"]', "el => el.click()")
        page.wait_for_timeout(700)
        rv = page.evaluate("""() => ({
          cols: document.querySelectorAll('.rv-scene > *').length,
          outcomes: document.querySelectorAll('[data-action="select-outcome"]').length,
          draftEmpty: !!document.querySelector('.rv-draft-empty'),
          photoLoaded: (() => { const im = document.querySelector('.rv-photo-frame img'); return !!im && im.complete && im.naturalWidth > 0; })()
        })""")
        check(rv["cols"] == 2, "复核页两栏（实际 %s）" % rv["cols"])
        check(rv["outcomes"] == 5, "★ 五个人工结论选项 —— 第五个「退回重巡该项」是**管理动作**，"
              "前四个都是对数据的处置，管理者视角缺了它就不完整（实际 %s）" % rv["outcomes"])
        check(rv["draftEmpty"], "未选结论时报告草稿区是一句提示，不是空框")
        check(rv["photoLoaded"], "现场佐证照（业务方素材）加载成功")

        # 选一个与 AI 建议不同的结论 → 分歧态 + 归档闸门
        page.eval_on_selector('[data-action="select-outcome"][data-outcome-id="OUT-RECHECK"]', "el => el.click()")
        page.wait_for_timeout(500)
        gate = page.evaluate("""() => ({
          divergence: !!document.querySelector('.rv-divergence'),
          archiveDisabled: document.querySelector('[data-action="open-archive"]').disabled
        })""")
        check(gate["divergence"], "人工结论 != AI 建议时出现分歧提示条")
        check(gate["archiveDisabled"], "分歧态下未填意见时归档按钮 disabled —— 机械约束，不是提示")

        NOTE = "上游工况已调整，压力回落至高报警线以下，本轮不转处置。"
        page.fill("textarea[data-action='set-note']", NOTE)
        page.wait_for_timeout(600)
        after = page.evaluate("""(note) => ({
          archiveDisabled: document.querySelector('[data-action="open-archive"]').disabled,
          pages: document.querySelectorAll('.rv-draft .rp-page').length,
          noteInReport: document.querySelector('.rv-draft').textContent.indexOf(note) >= 0,
          hasDivergenceSection: document.querySelector('.rv-draft').textContent.indexOf('复核分歧说明') >= 0,
          focusKept: document.activeElement === document.querySelector("textarea[data-action='set-note']")
        })""", NOTE)
        check(not after["archiveDisabled"], "填写分歧理由后归档按钮启用")
        check(after["pages"] == 2, "报告草稿 2 页（实际 %s）" % after["pages"])
        check(after["noteInReport"], "★ 复核意见原文逐字出现在报告正文里")
        check(after["hasDivergenceSection"], "分歧态的报告多出「复核分歧说明」一段")
        page.screenshot(path=str(SHOT_DIR / "02-review.png"))

        page.eval_on_selector('[data-action="open-archive"]', "el => el.click()")
        page.wait_for_timeout(800)
        ar = page.evaluate("""() => ({
          layout: !!document.querySelector('.ar-layout'),
          pages: document.querySelectorAll('.ar-preview .rp-page').length,
          pdf: document.querySelector('.ar-side a[href$=".pdf"]').getAttribute('href')
        })""")
        check(ar["layout"] and ar["pages"] == 2, "归档浮窗内嵌 A4 报告预览 2 页（实际 %s）" % ar["pages"])
        check(ar["pdf"].endswith("divergent.pdf"),
              "分歧态挂的是 divergent 那份 PDF（实际 %s）" % ar["pdf"])
        check((ROOT / ar["pdf"]).exists(), "该 PDF 文件真的存在于磁盘（%s）" % ar["pdf"])
        page.screenshot(path=str(SHOT_DIR / "03-archive.png"))

        page.eval_on_selector('[data-action="confirm-archive"]', "el => el.click()")
        page.wait_for_timeout(600)
        check(page.evaluate("() => window.DemoDebug.state().archived"), "确认归档后 archived = true")
        check(page.evaluate("() => !document.querySelector('.ar-layout')"), "归档后浮窗自动关闭")

        page.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        page.wait_for_timeout(700)
        kb = page.evaluate("""() => ({
          blocks: document.querySelectorAll('.kb-scene > *').length,
          agentPane: document.querySelectorAll('.kb-right, .kb-scene .ag-stream').length,
          assets: document.querySelectorAll('.kb-asset').length,
          pending: document.querySelectorAll('.kb-asset.pending').length,
          cats: Array.from(document.querySelectorAll('.kb-cats .stat strong')).map(e => e.textContent)
        })""")
        check(kb["blocks"] == 2, "知识库单栏两块：分类指标 + 资产清单（实际 %s）" % kb["blocks"])
        # Agent 问答不在本页常驻 —— 三页统一只从右下角浮窗按钮进抽屉，避免两个入口
        # 指向同一件事、还在画面上挨着重叠。
        check(kb["agentPane"] == 0, "知识库页不再常驻 Agent 问答面板（实际 %s 个）" % kb["agentPane"])
        check(kb["assets"] == 6 and kb["pending"] == 0,
              "归档后 6 份资产全部已索引（实际 %s 份 / %s 待归档）" % (kb["assets"], kb["pending"]))
        check(all(c.split(" / ")[0] == c.split(" / ")[1] for c in kb["cats"]),
              "四个分类的可检索数都等于总数：%s" % " ".join(kb["cats"]))

        # ---------------- E. Agent ----------------
        # 问答只从右下角浮窗进抽屉（知识库右栏那个常驻面板已撤）。按 question-id 点，
        # 不用 :last-of-type —— 业务方语料加进来之后最后一问已经不是「同类案例」那一问了。
        page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.eval_on_selector('.ag-drawer [data-question-id="Q-KB-3"]', "el => el.click()")
        page.wait_for_timeout(1500)
        check(page.evaluate("() => document.querySelector('.ag-drawer').textContent.indexOf('引用 · 巡检智能复核报告') >= 0"),
              "★ 归档后 Agent 抽屉能引用刚入库的复核报告（归档前它会如实说还没入库）")

        # ---- 语料体检：条数、引用有效性、以及"退役概念一个都不许出现" ----
        # 业务方那份 17 问里有一批本 POC 没有依据的说法（RTK / 电子围栏 / 安全帽识别 /
        # 机器人巡检 / 无人机巡检 / 远程 AR 专家 / 离线缓存 …）。它们已经在 07-kb.js
        # 文件头列明删除理由。这条断言盯着它们别被"顺手补全"回来 —— 一旦回来，路演现场
        # 一追问就露，而这是没法靠肉眼复查发现的。
        corpus = page.evaluate("""() => {
          const KB = window.DOMAIN_KB;
          const ids = KB.assets.map(a => a.id);
          const counts = {}; const bad = []; const dangling = [];
          Object.keys(KB.agentContexts).forEach(k => {
            const qs = KB.agentContexts[k].questions;
            counts[k] = qs.length;
            qs.forEach(q => {
              if (!q.text || !q.answer) bad.push(q.id);
              q.cites.forEach(c => { if (ids.indexOf(c) < 0) dangling.push(q.id + '->' + c); });
            });
          });
          return { counts: counts, bad: bad, dangling: dangling,
                   blob: JSON.stringify(KB) };
        }""")
        check(corpus["counts"] == {"workbench": 7, "review": 5, "knowledge": 6},
              "三页语料条数 7 / 5 / 6（实际 %s）" % corpus["counts"])
        check(not corpus["bad"], "每一问都有题干和答案（实际缺失 %s）" % corpus["bad"])
        check(not corpus["dangling"], "★ 引用全部指向真实资产，无悬空引用（实际 %s）" % corpus["dangling"])
        RETIRED_TERMS = ["RTK", "电子围栏", "无人机", "机器人", "安全帽", "工装", "吸烟",
                         "烟火", "AR", "离线缓存", "IMS", "95%", "人机协同", "振动", "电位"]
        hit = [w for w in RETIRED_TERMS if w in corpus["blob"]]
        check(not hit, "★ 退役概念未回流进语料（命中 %s）" % hit)

        # 业务方给的三条高频问答：历史案例（工作台）、联锁口径（知识库）、检修计划（知识库）
        page.eval_on_selector('.ag-drawer [data-question-id="Q-KB-4"]', "el => el.click()")
        page.wait_for_timeout(1400)
        biz = page.evaluate("""() => {
          const t = document.querySelector('.ag-drawer').textContent;
          const d = document.querySelector('.ag-drawer').getBoundingClientRect();
          return { plan: t.indexOf('7 月 28 日') >= 0 && t.indexOf('引用 · 泵棚区检修作业计划') >= 0,
                   guard: t.indexOf('0.2MPa') >= 0,
                   width: Math.round(d.width / (window.__scale || 1)) };
        }""")
        check(biz["plan"], "★ 检修计划一问答出 7 月 28 日 P-3 泵大修并引用作业计划")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        page.wait_for_timeout(500)
        page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.eval_on_selector('.ag-drawer [data-question-id="Q-WB-4"]', "el => el.click()")
        page.wait_for_timeout(1400)
        hv = page.evaluate("""() => {
          const t = document.querySelector('.ag-drawer').textContent;
          const box = document.querySelector('.ag-drawer').getBoundingClientRect();
          const shell = document.querySelector('.app-shell').getBoundingClientRect();
          return { case_: t.indexOf('操作柱接线松动') >= 0 && t.indexOf('引用 · 案例 · 湘潭站 P6 泵高压柜表计无显示') >= 0,
                   ratio: box.width / shell.width,
                   cols: getComputedStyle(document.querySelector('.ag-drawer')).gridTemplateColumns.split(' ').length };
        }""")
        check(hv["case_"], "★ 配电室历史成因一问答出操作柱接线松动并引用 2026-04-24 案例")
        check(abs(hv["ratio"] - 0.5) < 0.01, "★ AI 助手抽屉占半屏（实际 %.3f）" % hv["ratio"])
        check(hv["cols"] == 2, "抽屉内部左问题栏 + 右对话栏两栏（实际 %s）" % hv["cols"])
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        # 两条阈值线各自标出"做什么"，末点标出距联锁线的余量 —— Q-WB-6 讲分级口径、
        # Q-WB-7 讲 0.5MPa 余量，都要能在图上指到，不能只在答案文字里。
        page.eval_on_selector('[data-select-id="REC-1"]', "el => el.click()")
        page.wait_for_timeout(300)
        # REC-1 的第一枚依据就是 series，点开它证据台里才会挂上那张时序图。
        page.eval_on_selector('[data-action="select-evidence"]', "el => el.click()")
        page.wait_for_timeout(900)
        # ECharts 走 canvas 渲染，标签文字不在 DOM 里，所以从实例的 option 上验：
        # markLine 两条各带 note，markPoint 的 formatter 里带余量。
        marks = page.evaluate("""() => {
          // 图槽是 .ev-chart 里那个 div.chart-box（scripts/core/charts.js 的 slot()）。
          const node = document.querySelector('.ev-chart .chart-box');
          const inst = node && window.echarts.getInstanceByDom(node);
          if (!inst) return null;
          const ser = inst.getOption().series[0];
          return {
            lines: ser.markLine.data.map(d => d.name + '|' + d.note + '|' + d.yAxis),
            pointLabel: ser.markPoint ? String(ser.markPoint.label.formatter) : ''
          };
        }""")
        check(marks and marks["lines"] == ["高报警|提示核对|9", "高高报警|联锁停泵|9.8"],
              "★ 两条阈值线各自标出做什么：提示核对 / 联锁停泵（实际 %s）"
              % (marks["lines"] if marks else "取不到图实例"))
        check(marks and "距联锁线 0.5MPa" in marks["pointLabel"],
              "★ 末点标签印出距联锁线的余量 0.5MPa —— Q-WB-7 那句话在图上指得到（实际 %s）"
              % (marks["pointLabel"] if marks else "取不到图实例"))
        page.screenshot(path=str(SHOT_DIR / "05-agent-halfscreen.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        page.wait_for_timeout(500)

        fab_ok = True
        for scene in ["workbench", "review", "knowledge"]:
            page.eval_on_selector('[data-action="go-scene"][data-scene-key="%s"]' % scene, "el => el.click()")
            page.wait_for_timeout(400)
            page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
            page.wait_for_timeout(400)
            if not page.evaluate("() => !!document.querySelector('.ag-drawer')"):
                fab_ok = False
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
        check(fab_ok, "三页都能从常驻按钮打开 AI 助手抽屉，Esc 可关（刻意的常驻设计）")
        page.screenshot(path=str(SHOT_DIR / "04-knowledge.png"))

        # ---------------- F. 报告一致 ----------------
        # 屏上模型的页数与分歧段，必须与两份预构建 PDF 的剧本对得上。
        model = page.evaluate("""() => {
          const M = window.ReportModel;
          const mk = (oid) => M.resolve(M.contextFromState({
            recordId: 'REC-1', reviewerId: 'RV-1', outcomeId: oid,
            note: 'x', range: '12h', generatedAt: '2026-07-22 20:47'
          }));
          const a = mk('OUT-CONFIRM'), d = mk('OUT-RECHECK');
          return {
            acceptedPages: a.pages.length, acceptedDiv: a.divergent,
            divergentPages: d.pages.length, divergentDiv: d.divergent,
            acceptedTitles: a.pages.flatMap(p => p.sections.map(s => s.title)),
            divergentTitles: d.pages.flatMap(p => p.sections.map(s => s.title))
          };
        }""")
        check(model["acceptedPages"] == 2 and not model["acceptedDiv"], "采纳版：2 页、无分歧")
        check(model["divergentPages"] == 2 and model["divergentDiv"], "改判版：2 页、有分歧")
        # 编号必须派生：无分歧时不能跳号（旧的第一版把「三、」「五、」写死在标题里）
        nums_a = [t.split("、")[0] for t in model["acceptedTitles"] if "、" in t]
        nums_d = [t.split("、")[0] for t in model["divergentTitles"] if "、" in t]
        check(nums_a == ["一", "二", "三", "四"], "无分歧版章节编号连续不跳号：%s" % " ".join(nums_a))
        check(nums_d == ["一", "二", "三", "四", "五"], "有分歧版章节编号连续：%s" % " ".join(nums_d))

        for name in ["inspection-review-report-accepted.pdf", "inspection-review-report-divergent.pdf"]:
            check((ROOT / "assets" / "reports" / name).exists(), "预构建 PDF 存在：%s" % name)

        # ---------------- G. 动画不重播 ----------------
        #
        # 每次 render() 都 innerHTML="" 全量重建，所以写在 .ov-panel / .ag-drawer / 场景
        # 顶层块上的 CSS 入场动画会在每一次 render 时重播。定时器驱动的更新（入库动画每
        # 780ms 推进一步、Agent 问答的三点→答案）因此一路闪。
        # 修法是 boot.js 的「入场动画门」：只在场景 key / 浮层 key / 抽屉开合发生变化时
        # 才加 .is-enter（CSS 里动画挂在这个类上）。这一组把它钉住。
        #
        # 修前实测：入库 5 步 overlayIn 播 6 次、fadeUp 播 12 次；Agent 问一次 fadeUp 播 4 次。
        page.evaluate("""() => {
          window.__anim = { overlayIn: 0, fadeUp: 0 };
          document.addEventListener('animationstart', (e) => {
            if (e.animationName === 'overlayIn') window.__anim.overlayIn++;
            if (e.animationName === 'fadeUp') window.__anim.fadeUp++;
          }, true);
        }""")

        page.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        page.wait_for_timeout(600)
        page.evaluate("() => { window.__anim.overlayIn = 0; window.__anim.fadeUp = 0; }")

        r0 = page.evaluate("() => window.DemoDebug.renderCount()")
        page.eval_on_selector('[data-action="open-ingest"]', "el => el.click()")
        page.wait_for_timeout(4300)
        ing = page.evaluate("""() => ({
          anim: window.__anim,
          renders: window.DemoDebug.renderCount(),
          step: window.DemoDebug.state().ingestStep,
          done: document.querySelectorAll('.ig-step.done').length
        })""")
        check(ing["renders"] - r0 >= 5, "入库动画确实推进了 5 步（整屏 render %d 次）" % (ing["renders"] - r0))
        check(ing["step"] == 5 and ing["done"] == 5, "五步全部走完（step=%s done=%s）" % (ing["step"], ing["done"]))
        check(ing["anim"]["overlayIn"] == 1,
              "★ 入库动画期间 overlayIn 只播 1 次 —— 浮层不重播入场动画（修前 6 次，实际 %s）"
              % ing["anim"]["overlayIn"])
        check(ing["anim"]["fadeUp"] == 0,
              "★ 入库动画期间场景 fadeUp 播 0 次 —— 整屏不重新淡入（修前 12 次，实际 %s）"
              % ing["anim"]["fadeUp"])
        page.eval_on_selector('[data-action="close-ingest"]', "el => el.click()")
        page.wait_for_timeout(300)

        # 抽屉：打开播一次入场动画；之后问答（三点→答案）不该再播任何入场动画。
        page.evaluate("() => { window.__anim.overlayIn = 0; window.__anim.fadeUp = 0; }")
        page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        page.wait_for_timeout(500)
        opened = page.evaluate("() => window.__anim.overlayIn")
        page.eval_on_selector('.ag-drawer [data-action="ask-agent"]', "el => el.click()")
        page.wait_for_timeout(1600)
        ag = page.evaluate("""() => ({
          anim: window.__anim,
          atBottom: (() => { const e = document.querySelector('.ag-drawer .ag-stream');
            return e.scrollHeight - e.scrollTop - e.clientHeight < 4; })()
        })""")
        check(opened == 1, "Agent 抽屉打开时播 1 次入场动画（实际 %s）" % opened)
        check(ag["anim"]["overlayIn"] - opened == 0,
              "★ 抽屉里问答（三点→答案）不重播入场动画（实际 %s）" % (ag["anim"]["overlayIn"] - opened))
        check(ag["anim"]["fadeUp"] == 0,
              "★ Agent 问答期间场景 fadeUp 播 0 次（修前 4 次，实际 %s）" % ag["anim"]["fadeUp"])
        check(ag["atBottom"], "对话流贴底 —— 答案落地就在视野里，不是回到顶部")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # 切场景该播；场景内的选择操作不该播
        page.evaluate("() => { window.__anim.fadeUp = 0; }")
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        page.wait_for_timeout(600)
        on_switch = page.evaluate("() => window.__anim.fadeUp")
        page.eval_on_selector('[data-select-id="REC-3"]', "el => el.click()")
        page.wait_for_timeout(350)
        page.eval_on_selector('[data-action="select-evidence"]', "el => el.click()")
        page.wait_for_timeout(350)
        on_select = page.evaluate("() => window.__anim.fadeUp")
        check(on_switch > 0, "切换场景时才播 fadeUp（实际 %s 个顶层块）" % on_switch)
        check(on_select - on_switch == 0,
              "点记录 / 点依据不重播 fadeUp —— 修前这些操作会让整屏闪一下（实际 %s）"
              % (on_select - on_switch))

        check(not errors, "全流程走完后 pageerror 仍为空（实际 %d 条）%s"
              % (len(errors), ("：\n" + "\n".join(errors)) if errors else ""))

        print("\n渲染次数：%s（整屏重建的次数，动画期间不该暴涨）" % page.evaluate("() => window.DemoDebug.renderCount()"))
        print("图表实例：%s" % json.dumps(page.evaluate("() => window.Charts.debugInfo()")))
        print("截图目录：%s" % SHOT_DIR)
        browser.close()

    print("\n===== 汇总：%d passed, %d failed =====" % (PASS, FAIL))
    if FAIL:
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % PASS)


if __name__ == "__main__":
    main()
