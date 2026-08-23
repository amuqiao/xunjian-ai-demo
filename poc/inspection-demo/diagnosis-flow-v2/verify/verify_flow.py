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
                         # REC-7 是 REC-5 的镜像：同一条「停留 < 10 秒」规则命中，
                         # 但机位看得见人，姿态+表盘+轨迹三路证据把它推翻 → 归档而非退回。
                         # 5 枚是全场最长的一条链，也是唯一同时挂了 pose 与 route 的。
                         "REC-7": ["track", "pose", "vision", "route", "rule"],
                         "REC-6": ["series", "rule"]}
        check(align["chains"] == expect_chains,
              "依据链逐条按检查项分型，长度 4/2/3/3/3/5/2 各不相同（旧版是 5 条清一色 4 枚固定芯片）")
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
        check(kinds_seen == {"series", "compare", "timeline", "gaps", "vision", "rule",
                             "track", "pose", "route"},
              "★ 九种证据形态全部渲染无错 —— track / pose / route 三种都是管理者视角的"
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
        check(story["byAud"] == {"executor": 2, "supervisor": 4},
              "★ 六条记录分成两条故事线：巡检员复核 2 条 / 班长核查 4 条（实际 %s）" % story["byAud"])
        check(story["flags"].get("behavior") == 1,
              "★ aiFlag 有独立的 behavior 档 —— 行为异常不能塞进 conflict："
              "前者是「这一项有没有真做」、后者是「AI 与人工判得不一样」，管理动作完全不同")
        # 精确钉住四个数：观众真会做这个算术。REC-7 是 cleared，刻意不进任何 stat ——
        # 「行为异常」那格必须保持 1，否则它旁边的卡片说「不构成行为异常」就自相矛盾了。
        check(story["flags"] == {"conflict": 2, "ok": 1, "gap": 1, "behavior": 1, "cleared": 1},
              "★ OBJ-A 六条的 aiFlag 五态分布 2/1/1/1/1 —— cleared 是第五态：ok 是「从没命中过"
              "规则」，cleared 是「命中了但被三路视觉证据推翻」，管理动作不同（实际 %s）"
              % story["flags"])
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

        # ---- ★ REC-7：视觉洗清一个被时间规则误判的巡检员（REC-5 的镜像） ----
        #
        # 这一条存在的全部意义是「同一条停留规则，两个方向的结论」。判然不同的依据**不是秒数**
        # （6 秒 vs 8 秒只差 2 秒，谁都能问「凭什么」），而是 R-BEHAVIOR 已有的那句
        # 「命中两条以上建议退回重巡而非归档」：REC-5 命中两条 → 退回，REC-7 命中一条 → 归档。
        # 下面第一条断言就是钉这个不变式的，别处没有任何东西钉它。
        page.eval_on_selector('[data-select-id="REC-7"]', "el => el.click()")
        page.wait_for_timeout(400)
        mirror = page.evaluate("""() => {
          const R = window.DOMAIN_RECORDS;
          const stay = "单项现场停留 < 10 秒";
          const of = id => {
            const rec = R.recordById(id);
            const tid = rec.evidence.filter(e => e.kind === 'track')[0].trackId;
            const tk = R.trackById(tid);
            return { outcome: rec.suggestion.outcomeId,
                     flag: rec.aiFlag,
                     hits: tk.rows.filter(r => r.hit).length,
                     stayHit: tk.rows.some(r => r.rule === stay && r.hit === true),
                     window: tk.window.label,
                     tone: tk.verdictTone };
          };
          return { five: of('REC-5'), seven: of('REC-7') };
        }""")
        m5, m7 = mirror["five"], mirror["seven"]
        check(m5["stayHit"] and m7["stayHit"] and m5["outcome"] != m7["outcome"],
              "★ 镜像不变式：REC-5 与 REC-7 都命中「单项现场停留 < 10 秒」，但结论相反"
              "（%s vs %s）—— 这是整条记录存在的意义" % (m5["outcome"], m7["outcome"]))
        check(m5["hits"] == 2 and m7["hits"] == 1,
              "★ 判然不同的依据是**命中条数**不是秒数：REC-5 命中 2 条 → 退回重巡，"
              "REC-7 命中 1 条 → 可归档（实际 %s / %s）" % (m5["hits"], m7["hits"]))
        check(m5["window"] != m7["window"],
              "★ REC-7 不在低压配电室段：那段「均值 7.8 秒/项」正是 REC-5 判走过场的证据，"
              "8 > 7.8，把 8 秒的项塞进同一段会反过来推翻 REC-5（实际 %s / %s）"
              % (m5["window"], m7["window"]))
        check(m7["tone"] == "ok" and m5["tone"] == "danger",
              "★ 裁决色是**读** verdictTone 而不是按命中条数算 —— 旧算法 hits>=2?danger:warn 会给"
              "只命中一条的 REC-7 一个橙点配「判正常」的结论（实际 %s / %s）" % (m7["tone"], m5["tone"]))
        check(m7["flag"] == "cleared", "REC-7 的 aiFlag 是 cleared（实际 %s）" % m7["flag"])

        rec7 = page.evaluate("""() => {
          const chips = Array.from(document.querySelectorAll('.wb-chain button'));
          const out = { chipCount: chips.length,
                        marks: chips.map(b => (b.querySelector('.chip-kind') || {}).textContent),
                        aud: document.querySelector('.wb-audience strong').textContent,
                        badge: (Array.from(document.querySelectorAll('.dx-row'))
                                 .filter(r => r.dataset.selectId === 'REC-7')[0] || {})
                                 .querySelector ? Array.from(document.querySelectorAll('.dx-row'))
                                 .filter(r => r.dataset.selectId === 'REC-7')
                                 .map(r => (r.querySelector('.dx-flag') || {}).textContent)[0] : null };
          return out;
        }""")
        check(rec7["chipCount"] == 5,
              "REC-7 的依据链 5 枚，是全场最长的一条（实际 %s）" % rec7["chipCount"])
        check("姿" in (rec7["marks"] or []) and "迹" in (rec7["marks"] or []),
              "★ 姿 / 迹 两个新单字标出现在链上 —— 它们必须和既有的 时/行/比/程/缺/视/规/案 区分得开"
              "（实际 %s）" % rec7["marks"])
        check(rec7["aud"] == "班长核查",
              "REC-7 标着「班长核查」—— 做的动作是班长采纳 AI 对自己队员的洗清（实际 %s）" % rec7["aud"])
        check(rec7["badge"] == "疑点排除",
              "★ 表上的徽标是「疑点排除」而不是「已闭环」—— 第五态存在的全部意义就是让这一行在表上"
              "看得出来和 REC-2 不同，否则讲解时无处可指（实际 %s）" % rec7["badge"])

        # 逐枚点开三种新形态，确认它们真的画出了东西
        def click_chip(i):
            page.eval_on_selector_all(".wb-chain button", "(els, i) => els[i].click()", i)
            page.wait_for_timeout(350)

        click_chip(1)   # pose
        pose = page.evaluate("""() => {
          const box = document.querySelector('.ev-pose-phases');
          return { phases: box ? box.children.length : 0,
                   text: document.querySelector('.ev') ? document.querySelector('.ev').innerText : '' };
        }""")
        check(pose["phases"] == 3 and "8 秒" in pose["text"],
              "★ 姿态证据把 8 秒拆成三段（到位/读表/录入）—— 单张静态图证明不了时长，"
              "动作序列才能（实际 %s 段，含「8 秒」=%s）"
              % (pose["phases"], "8 秒" in pose["text"]))

        click_chip(3)   # route
        route = page.evaluate(r"""() => {
          const svg = document.querySelector('.ev-fig .ev-fig-paths');
          if (!svg) return null;
          const poly = svg.querySelectorAll('polyline');
          const pts = Array.from(poly).map(p => p.getAttribute('points').trim().split(/\s+/).length);
          return { polygons: svg.querySelectorAll('polygon').length,
                   polylines: poly.length, ptCounts: pts,
                   marks: svg.querySelectorAll('circle').length };
        }""")
        check(route is not None and route["polygons"] == 1 and route["polylines"] == 2
              and route["marks"] == 2 and all(n >= 2 for n in route["ptCounts"]),
              "★ 轨迹证据画的是 SVG：1 个透视梯形 ROI + 2 条折线 + 2 个定位点。矩形框画不出这些，"
              "所以 route 才必须是一种新形态（实际 %s）" % route)
        page.screenshot(path=str(SHOT_DIR / "01c-rec7-route.png"))

        # ---- 三条布局不变式（都是审查阶段实测出来的真 bug，其中两条是既有的） ----
        layout7 = page.evaluate("""() => {
          const out = { figs: [], provs: 0, wrapOverflow: null };
          // ① 每张帧的元素盒高必须等于内容高（无 letterbox）。原先 .ev-fig img 是
          //    height:100% + max-width:100% + object-fit:contain 三条打架，1920x1080 那张
          //    元素盒 1047x1071、实际画面只有 1047x589，上下各 241px 空白，而 .ev-box 与
          //    .ev-fig-paths 都按元素盒百分比定位 —— 所有识别框竖直偏 241px 且被拉伸 1.82 倍。
          //    这一条 CSS 注释里声称有断言在钉，之前其实没有，现在补上。
          const rec = window.DOMAIN_RECORDS;
          return out;
        }""")
        figbox = []
        for rid in ["REC-1", "REC-2", "REC-3", "REC-4", "REC-5", "REC-7"]:
            page.eval_on_selector('[data-select-id="%s"]' % rid, "el => el.click()")
            page.wait_for_timeout(250)
            n = page.evaluate("() => document.querySelectorAll('.wb-chain button').length")
            for i in range(n):
                page.eval_on_selector_all(".wb-chain button", "(els, i) => els[i].click()", i)
                page.wait_for_timeout(200)
                d = page.evaluate("""() => {
                  const fig = document.querySelector('.ev-fig');
                  const img = fig && fig.querySelector('img');
                  if (!img || !img.naturalWidth) return null;
                  const r = img.getBoundingClientRect();
                  const s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
                  return { boxH: r.height, contentH: img.naturalHeight * s,
                           label: (document.querySelector('.ev-head .card-title') || {}).textContent };
                }""")
                if d:
                    figbox.append((d["label"], round(d["boxH"] - d["contentH"], 1)))
        bad_fig = [x for x in figbox if abs(x[1]) > 2]
        check(not bad_fig and len(figbox) >= 8,
              "★ 每张帧的元素盒高 == 内容高（无 letterbox）—— 这条 CSS 注释里声称有断言在钉，"
              "之前其实没有。原先 1920x1080 那张元素盒比画面高 241px，.ev-box 与 SVG 叠加层"
              "都按元素盒定位，于是所有识别框竖直偏 241px 且被拉伸 1.82 倍（实测 %d 帧，超差的：%s）"
              % (len(figbox), bad_fig))

        # ② 三张能力示意帧必须把「非本轮实拍」写在屏上：白昼室外照配 20:07 夜班是肉眼级矛盾，
        #    同部位唯一的真帧（20:01:55）是室内全黑无人。靠讲解人记得说不算保障。
        prov = page.evaluate(r"""() => {
          const V = window.DOMAIN_VISION;
          const withProv = V.frames.filter(f => f.provenance);
          return { n: withProv.length,
                   ids: withProv.map(f => f.id).sort(),
                   labelsClean: withProv.every(f => !/\d\d:\d\d:\d\d/.test(f.label)),
                   shotAtKept: withProv.every(f => !!f.shotAt) };
        }""")
        check(prov["n"] == 3 and prov["labelsClean"],
              "★ 三张能力示意帧带 provenance 且 label 里不含秒级时刻 —— 带了就是把「白昼室外照"
              "配夜班时刻」这个矛盾钉死（实际 %s 帧 %s，label 干净=%s）"
              % (prov["n"], prov["ids"], prov["labelsClean"]))
        check(prov["shotAtKept"],
              "shotAt 必须保留 —— report.js 的 visionSummary 直接拼 camera + shotAt，"
              "删了会静默印出 undefined")

        # ③ 复核页左栏：renderMiniEvidence() 无 series 时返回 null 被 append 静默丢弃，
        #    而 .rv-left 写死三条轨道 —— 只挂 2 个子节点时现场佐证被挤进 176px 那行，
        #    第 3 条 minmax(0,1fr) 整块空白。实测六条里五条都这样，空白占列高 53~57%。
        page.eval_on_selector('[data-select-id="REC-7"]', "el => el.click()")
        page.wait_for_timeout(250)
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="review"]', "el => el.click()")
        page.wait_for_timeout(500)
        rv = page.evaluate("""() => {
          const L = document.querySelector('.rv-left');
          const kids = Array.from(L.children);
          const used = kids.reduce((a, k) => a + k.getBoundingClientRect().height, 0)
                     + (kids.length - 1) * 12;
          return { cls: L.className, n: kids.length,
                   blank: Math.round(L.getBoundingClientRect().height - used) };
        }""")
        check("no-mini" in rv["cls"] and rv["n"] == 2 and rv["blank"] < 80,
              "★ REC-7 无 series 证据时复核页左栏挂 .no-mini 走两行轨道，不留大块空白 —— "
              "改前六条里五条的左栏有 632~680px（占 53~57%%）纯空白（实际 %s / %s 子节点 / 空白 %spx）"
              % (rv["cls"], rv["n"], rv["blank"]))
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        page.wait_for_timeout(400)

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
        check(corpus["counts"] == {"workbench": 8, "review": 5, "knowledge": 6},
              "三页语料条数 8 / 5 / 6（实际 %s）" % corpus["counts"])
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

        # ★ REC-7 的报告必须能说出它存在的理由。这条关的是一个**静默**缺陷：
        # report.js 原先按 kind === "vision" || kind === "compare" 挑视觉证据，
        # REC-7 的视觉证据是 pose / route 两个新 kind，不改的话报告会印出
        # 「视觉：本条不涉及视觉证据」—— 而这条记录的全部意义就是视觉洗清了它。
        # 不抛错、不报警，只是悄悄印错。同理 behaviorSummary：七条里有两条是行为驱动的，
        # 而报告模板原先完全表达不了行为。
        rep7 = page.evaluate("""() => {
          const M = window.ReportModel;
          const v = M.resolve(M.contextFromState({
            recordId: 'REC-7', reviewerId: 'RV-2', outcomeId: 'OUT-ARCHIVE',
            note: 'x', range: '12h', generatedAt: '2026-07-22 20:47'
          }));
          // resolve() 返回 { meta, divergent, pages }，没有 values —— 直接读渲染出来的
          // 「多源证据摘要」那一段的 items，那才是真会印到报告上的字。
          const secs = v.pages.reduce(function (acc, p) { return acc.concat(p.sections); }, []);
          const ev = secs.filter(function (x) { return x.id === 'SEC-EVIDENCE'; })[0];
          return { items: ev ? ev.items : null };
        }""")
        items = rep7["items"] or []
        vision_line = [x for x in items if x.startswith("视觉：")]
        behavior_line = [x for x in items if x.startswith("行为：")]
        check(vision_line and "不涉及视觉证据" not in vision_line[0],
              "★ REC-7 的报告能说出视觉证据 —— pose / route 必须进 report.js 的视觉过滤器，"
              "否则这条「视觉洗清」的记录会在报告里印出「本条不涉及视觉证据」，而且是**静默**印错、"
              "不抛错不报警（实际：%s）" % (vision_line[0] if vision_line else "没有视觉那一行"))
        check(behavior_line and "8 秒" in behavior_line[0],
              "★ 报告新增「行为：」一条并点出 8 秒 —— 七条记录里两条是行为驱动的，"
              "原模板只有「时序：」「视觉：」两条，完全表达不了行为（实际：%s）"
              % (behavior_line[0] if behavior_line else "没有行为那一行"))

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

        # H. 演示稳定性：上一屏的定时器不能在当前屏落地重渲染；重置必须防误触。
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="knowledge"]', "el => el.click()")
        page.wait_for_timeout(500)
        page.eval_on_selector('[data-action="open-ingest"]', "el => el.click()")
        page.wait_for_timeout(220)
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        page.wait_for_timeout(200)
        r_ingest = page.evaluate("() => window.DemoDebug.renderCount()")
        page.wait_for_timeout(1800)
        stale_ingest = page.evaluate("""r => ({
          renders: window.DemoDebug.renderCount() - r,
          scene: window.DemoDebug.state().scene,
          ingestOpen: window.DemoDebug.state().ingestOpen
        })""", r_ingest)
        check(stale_ingest["scene"] == "workbench" and stale_ingest["renders"] == 0 and not stale_ingest["ingestOpen"],
              "★ 离开知识库后入库 timer 不再后台推进 / 重渲染当前屏（实际 scene=%s renders+%s ingestOpen=%s）"
              % (stale_ingest["scene"], stale_ingest["renders"], stale_ingest["ingestOpen"]))

        page.eval_on_selector('[data-action="open-agent"]', "el => el.click()")
        page.wait_for_timeout(300)
        page.eval_on_selector('.ag-drawer [data-action="ask-agent"]', "el => el.click()")
        page.wait_for_timeout(120)
        page.eval_on_selector('[data-action="go-scene"][data-scene-key="review"]', "el => el.click()")
        page.wait_for_timeout(200)
        r_agent = page.evaluate("() => window.DemoDebug.renderCount()")
        page.wait_for_timeout(1200)
        stale_agent = page.evaluate("""r => ({
          renders: window.DemoDebug.renderCount() - r,
          scene: window.DemoDebug.state().scene,
          pending: window.DemoDebug.state().agentPending
        })""", r_agent)
        check(stale_agent["scene"] == "review" and stale_agent["renders"] == 0 and stale_agent["pending"] == "",
              "★ Agent 提问后切场景，旧 timer 不会在新场景落地重渲染（实际 scene=%s renders+%s pending=%s）"
              % (stale_agent["scene"], stale_agent["renders"], stale_agent["pending"]))

        page.eval_on_selector('[data-action="go-scene"][data-scene-key="workbench"]', "el => el.click()")
        page.wait_for_timeout(400)
        page.eval_on_selector('[data-select-id="REC-3"]', "el => el.click()")
        page.wait_for_timeout(250)
        page.eval_on_selector('[data-action="reset-demo"]', "el => el.click()")
        page.wait_for_timeout(250)
        armed = page.evaluate("""() => ({
          recordId: window.DemoDebug.state().recordId,
          label: document.querySelector('[data-action="reset-demo"]').textContent
        })""")
        check(armed["recordId"] == "REC-3" and "再次点击" in armed["label"],
              "★ 重置演示第一次点击只进入确认态，不清空工作台选择（recordId=%s label=%s）"
              % (armed["recordId"], armed["label"]))
        page.wait_for_timeout(2400)
        disarmed = page.evaluate("""() => ({
          recordId: window.DemoDebug.state().recordId,
          label: document.querySelector('[data-action="reset-demo"]').textContent
        })""")
        check(disarmed["recordId"] == "REC-3" and disarmed["label"] == "重置演示",
              "★ 重置确认超时后自动解除，状态仍不变（recordId=%s label=%s）"
              % (disarmed["recordId"], disarmed["label"]))
        page.eval_on_selector('[data-action="reset-demo"]', "el => el.click()")
        page.wait_for_timeout(120)
        page.eval_on_selector('[data-action="reset-demo"]', "el => el.click()")
        page.wait_for_timeout(300)
        reset_done = page.evaluate("() => window.DemoDebug.state().recordId")
        check(reset_done == "REC-1", "连续两次确认后才真正重置到入口记录（实际 %s）" % reset_done)

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
