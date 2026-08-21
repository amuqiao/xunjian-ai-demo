# 端到端走查：用 Playwright 把整条主线点一遍，断言每一步的界面确实变成了它该有的样子。
#
# 用法：uv run python poc/diagnosis-flow/verify/verify_flow.py
#
# ---- 为什么这一套不可省 ----
# verify_domain.js 保证数据自洽、verify_state.js 保证状态机的真值表正确，但两者都跑在
# Node 里、碰不到 DOM。"渲染时抛错导致整页空白"、"按钮存在但点了没绑上"、"浮层被
# 容器的 overflow 裁掉"这几类问题只有真的把页面跑起来才会暴露，而它们恰好是演示现场
# 最致命的几类——页面白了，讲解就没法继续。
#
# ---- 纪律 ----
# 1. 全程收集 console error 和 page error，任何一条都算失败。渲染层的抛错在浏览器里
#    只表现为"这一块没画出来"，不收集就等于没看见。
# 2. 断言要断在"用户能看到的结果"上，不断在实现细节上。
# 3. 禁止直接调用系统 Chrome headless（仓库 AGENTS.md：本机曾出现 Chrome 崩溃弹窗），
#    一律走 Python 版 Playwright 自带的 chromium。

import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
SHOTS = pathlib.Path("/private/tmp/diagnosis-flow-shots")

passed = 0
failures = []
console_errors = []


def check(label, condition):
    global passed
    if condition:
        passed += 1
        print("PASS " + label)
    else:
        failures.append(label)
        print("FAIL " + label)


def text_of(page, selector):
    node = page.query_selector(selector)
    return node.inner_text() if node else ""


# ---- 防闪烁：两条互补的断言 ----
#
# "页面在闪"这件事没法直接从 DOM 上读出来（截图截到的那一帧可能正好是动画中间），
# 所以拆成两个可断言的机械事实：
#
#   1. 动画期间整屏渲染次数不增加  →  render_count()
#      整屏渲染会把浮层重挂，CSS 入场动画从头重播，这就是闪的来源。
#   2. 整屏渲染时同 key 浮层原地保留  →  mark() / probe_survived()
#      万一某条路径确实要整屏渲染，浮层也不该跟着重建。
#
# 第 2 条必须在**主动触发一次整屏渲染之后**检查才有意义。早先只在动画后检查，
# 而动画根本不触发整屏渲染，那条断言在任何情况下都不会红——空转的断言比没有更糟，
# 它让人以为这里有防护。
def mark(page, selector):
    page.eval_on_selector(selector, "el => { el.dataset.flickerProbe = '1'; }")


def probe_survived(page, selector):
    node = page.query_selector(selector)
    return bool(node) and node.get_attribute("data-flicker-probe") == "1"


def render_count(page):
    return page.evaluate("() => window.Boot.debugInfo().renderCount")


def check_chart_height(page, selector, min_height):
    node = page.query_selector(selector)
    box = node.bounding_box() if node else None
    height = box["height"] if box else 0
    check(
        "%s 的图表宿主高度 %.0fpx ≥ %dpx（被压扁时曲线会糊成贴轴的直线，两边都不报错）"
        % (selector, height, min_height),
        height >= min_height,
    )


# 每次 select_option 都会触发一轮 render()，整个 stage 被重建，之前拿到的
# ElementHandle 全部失效（"Element is not attached to the DOM"）。所以必须按 field id
# 逐个重新定位，不能缓存句柄——这正是"整屏重渲染"这套架构在测试侧的代价。
def fill_required_selects(page):
    field_ids = page.eval_on_selector_all(
        ".rv-select", "els => els.map(el => el.dataset.fieldId)"
    )
    for field_id in field_ids:
        selector = '.rv-select[data-field-id="%s"]' % field_id
        values = page.eval_on_selector_all(
            selector + " option", "els => els.map(el => el.value)"
        )
        real = [v for v in values if v != ""]
        if real:
            page.select_option(selector, real[0])


def run(page):
    # ---------------------------------------------------------------- 1. 首屏
    print("== 1. 首屏 ==")
    check("顶栏标题已填充", text_of(page, "#brandTitle") != "")
    check("导航渲染出 3 项", page.locator(".scene-nav-btn").count() == 3)
    check("顶部不再有独立报告归档页",
          page.locator('.scene-nav-btn[data-scene-key="archive"]').count() == 0)
    check("流程条渲染出 6 步", page.locator(".flow-step").count() == 6)
    check("流程条不含大屏/站点的步骤",
          "任务总览" not in text_of(page, ".flow-track"))
    check("工作台记录表有行", page.locator(".sl-table-row").count() >= 3)
    check("工作台主页面不渲染 AI 判断卡", page.locator(".wb-ai").count() == 0)
    check("工作台主页面不渲染时序入口卡", page.locator(".wb-trend").count() == 0)
    check("工作台主页面不渲染视觉入口卡", page.locator(".wb-vision").count() == 0)
    check("工作台首屏不直接渲染时序图表", page.locator(".wb-trend-chart canvas").count() == 0)
    check("工作台首屏不直接渲染视觉缩略图", page.locator(".wb-frame-box").count() == 0)
    check("Agent 助手改为浮动入口", page.locator(".wb-agent-fab").count() == 1)
    page.screenshot(path=str(SHOTS / "01-workbench.png"))

    page.locator(".sl-table-row").first.click()
    check("点击巡检记录打开 AI 辅助判断列表浮层", page.locator(".wb-ai-list-overlay").count() == 1)
    check("浮层里列出 3 条 AI 辅助判断", page.locator(".wb-ai-list-overlay .wb-ai-service").count() == 3)
    check("每条 AI 判断直接展示百分比置信度",
          page.locator(".wb-ai-list-overlay .wb-ai-confidence").count() == 3)
    check("AI 判断列表不再展示执行度或横向进度条",
          page.locator(".wb-ai-list-overlay .wb-ai-service-meter").count() == 0)
    check("AI 判断条目后面有时序证据入口",
          page.locator('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="series"]').count() == 1)
    check("AI 判断条目后面有视觉证据入口",
          page.locator('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="vision"]').count() == 1)
    check("AI 判断列表浮层不占用工作台布局", page.locator(".wb-layout").count() == 1)
    page.click('[data-action="close-ai-list"]')
    check("AI 判断列表浮层可关闭", page.locator(".wb-ai-list-overlay").count() == 0)

    # ---------------------------------------------------------------- 2. 证据入口下钻
    print("\n== 2. 证据入口下钻 ==")
    page.locator(".sl-table-row").first.click()
    page.click('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="series"]')
    check("点 AI 判断条目后的时序入口进入时序子屏", page.locator(".dt-trend-grid").count() == 1)
    check("子屏里导航仍高亮工作台",
          page.locator('.scene-nav-btn[data-scene-key="workbench"].active').count() == 1)
    # Charts.flush() 把 setOption 排在下一个 rAF 里，所以 canvas 不是点完就立刻存在。
    # 这里等一下再断言——不是放宽标准，是断在"图确实画出来了"而不是"点击的同一帧里
    # 画出来了"。
    page.wait_for_selector(".dt-chart canvas", timeout=3000)
    check("主曲线已绘制", page.locator(".dt-chart canvas").count() >= 1)
    check_chart_height(page, ".dt-chart .chart-box", 300)
    check("采样表有行", page.locator(".dt-table tbody tr").count() >= 2)
    page.screenshot(path=str(SHOTS / "02-trend.png"))
    page.click('[data-action="close-detail"]')

    page.locator(".sl-table-row").first.click()
    page.click('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="vision"]')
    check("点 AI 判断条目后的视觉入口进入视觉子屏", page.locator(".dt-vision-grid").count() == 1)
    check("帧序列渲染出 3 帧", page.locator(".dt-strip-item").count() == 3)
    page.click('[data-action="zoom-frame"]')
    check("点图片打开放大浮层", page.locator(".dt-zoom-overlay").count() == 1)
    page.keyboard.press("Escape")
    check("Esc 关闭放大浮层", page.locator(".dt-zoom-overlay").count() == 0)
    page.screenshot(path=str(SHOTS / "03-vision.png"))
    page.click('[data-action="close-detail"]')

    # ---------------------------------------------------------------- 3. Agent
    print("\n== 3. Agent 对话 ==")
    page.click('[data-action="open-agent"][data-agent-context="workbench"]')
    check("Agent 浮层打开", page.locator(".ag-overlay").count() == 1)
    check("Agent 浮层没有被容器裁掉（宽度 > 0）",
          page.locator(".ag-overlay").bounding_box()["width"] > 400)
    agent_h_empty = page.locator(".ag-overlay").bounding_box()["height"]
    check("Agent 卡片足够高（%.0fpx ≥ 520px）" % agent_h_empty, agent_h_empty >= 520)
    before = render_count(page)
    hit_q = page.locator(".ag-question:not(.miss)").first
    hit_q.click()
    check("点问题后进入检索中动画", page.locator(".ag-thinking").count() == 1)
    page.wait_for_selector(".ag-answer", timeout=4000)
    check("动画结束后出现答案", page.locator(".ag-answer").count() == 1)
    check("命中态渲染出可点的命中卡", page.locator(".ag-hit").count() >= 1)
    check("提问全程零次整屏渲染（每次整屏渲染 = 浮层重挂 = 闪一下）",
          render_count(page) == before)
    # 高度必须在"空态 / 检索中 / 答案"之间保持一致：内容一长浮层就跟着变高，
    # 在演示里表现为卡片上下弹一下。
    check("答案出现后卡片高度不变（%.0f → %.0f）"
          % (agent_h_empty, page.locator(".ag-overlay").bounding_box()["height"]),
          abs(page.locator(".ag-overlay").bounding_box()["height"] - agent_h_empty) < 1)
    page.screenshot(path=str(SHOTS / "04-agent-hit.png"))

    # 自由输入：打的字要留在框里，并且同样不许整屏渲染
    before = render_count(page)
    page.fill(".ag-input", "占位自由提问")
    page.click('[data-action="submit-agent-input"]')
    page.wait_for_selector(".ag-answer", timeout=4000)
    check("自由提问全程零次整屏渲染", render_count(page) == before)
    check("自由提问的原文回显在对话里", "占位自由提问" in text_of(page, ".ag-thread"))
    check("自由提问后输入框里的字没有丢",
          page.eval_on_selector(".ag-input", "el => el.value") == "占位自由提问")

    # 直接考一次 key 增量挂载：主动触发整屏渲染，浮层必须原地保留。
    # 这条要主动触发才有意义——动画路径根本不整屏渲染，只在动画后检查等于空转。
    mark(page, ".ag-overlay")
    page.evaluate("() => window.Boot.render()")
    check("整屏渲染后同 key 浮层原地保留（退回 innerHTML=\"\" 全量重挂时这条会红）",
          probe_survived(page, ".ag-overlay"))

    page.locator(".ag-question.miss").first.click()
    page.wait_for_selector(".ag-miss", timeout=4000)
    check("未命中态渲染出「知识库暂无直接依据」", page.locator(".ag-miss").count() == 1)
    check("未命中态不渲染命中卡", page.locator(".ag-hit").count() == 0)
    page.screenshot(path=str(SHOTS / "05-agent-miss.png"))
    page.keyboard.press("Escape")
    check("Esc 关闭 Agent 浮层", page.locator(".ag-overlay").count() == 0)
    check("Agent 步骤已点亮流程条", page.locator(".flow-step.visited").count() >= 4)

    # ---------------------------------------------------------------- 4. 复核：分歧支线
    print("\n== 4. 人工复核（分歧支线）==")
    page.click('.scene-nav-btn[data-scene-key="review"]')
    check("进入复核页", page.locator(".rv-grid").count() == 1)
    check("身份芯片存在", page.locator(".rv-identity-select").count() == 1)
    check("未表决时 L1 结论区是灰的", page.locator(".rv-outcome-block.pending").count() == 1)
    check("未选结论时处置路径是灰的", page.locator(".rv-path.pending").count() == 1)
    check("未选结论时三条路径平铺预览", page.locator(".rv-path-list li").count() == 3)
    page.screenshot(path=str(SHOTS / "06-review-empty.png"))

    page.click('[data-action="review-vote"][data-vote-id="reject"]')
    check("驳回后 L1 解锁", page.locator(".rv-outcome-block.pending").count() == 0)
    check("驳回不预选任何结论", page.locator(".rv-outcome.active").count() == 0)

    # 选一个与 AI 建议不同的结论 → 必须出现分歧条
    # 必须用箭头函数收参数：page.evaluate 的第二个参数不会绑定到裸表达式里的
    # arguments[0]，写成裸表达式会静默取到 outcomes[0]（很可能就是 AI 建议那条），
    # 于是"分歧"根本不成立而断言看起来像应用坏了——这条弯路值得留个注释。
    suggested = page.evaluate("() => window.AppState.suggestedOutcome().id")
    other = page.evaluate(
        "sug => window.DOMAIN_REVIEW.outcomes.filter(o => o.id !== sug)[0].id",
        suggested,
    )
    check("反查到一条与 AI 建议不同的结论", other != suggested)
    page.click('[data-action="select-outcome"][data-outcome-id="%s"]' % other)
    check("选了与 AI 不同的结论 → 出现分歧条", page.locator(".rv-divergence").count() == 1)
    check("分歧时复核意见标为必填", page.locator(".rv-note-block.required").count() == 1)
    check("分歧且未填理由时执行按钮禁用", page.locator('[data-gate="execute"]').is_disabled())
    check("缺项提示可见", "必须填写复核意见" in text_of(page, '[data-gate="hint"]'))

    # 填必填的结构化字段
    fill_required_selects(page)
    check("填完结构化字段后仍因缺理由而禁用", page.locator('[data-gate="execute"]').is_disabled())

    # 点常用语 chip 追加进文本框（演示现场不用打字的那条通路）
    page.locator(".rv-phrase").first.click()
    note_value = page.eval_on_selector(".rv-note", "el => el.value")
    check("点常用语后文本框有内容", len(note_value) > 0)
    check("填了理由后执行按钮解禁",
          not page.locator('[data-gate="execute"]').is_disabled())
    page.screenshot(path=str(SHOTS / "07-review-divergent.png"))

    # 输入框直接打字（不走 render，靠定点刷新更新闸门）
    page.fill(".rv-note", "")
    check("清空理由后执行按钮重新禁用（定点刷新生效）",
          page.locator('[data-gate="execute"]').is_disabled())
    page.fill(".rv-note", "占位复核依据：现场已确认，先观察一轮。")
    check("重新填入后再次解禁", not page.locator('[data-gate="execute"]').is_disabled())

    page.click('[data-action="execute-review"]')
    check("执行后进入执行屏", page.locator(".rv-exec-grid").count() == 1)
    check("执行屏回显了复核意见原文",
          "占位复核依据" in text_of(page, ".rv-exec-note-body"))
    check("执行复核后弹出报告归档确认浮层", page.locator(".rv-report-overlay").count() == 1)
    page.screenshot(path=str(SHOTS / "08-executed.png"))

    # ---------------------------------------------------------------- 5. 归档确认浮层（分歧支线）
    print("\n== 5. 报告归档确认浮层（分歧支线）==")
    check("没有进入独立归档页", page.locator(".ar-grid").count() == 0)
    divergent_sections = page.locator(".rv-report-overlay .ar-section").count()
    check("报告含分歧段", page.locator(".rv-report-overlay .ar-section.human").count() >= 2)
    check("人工原文逐字出现在报告里",
          "占位复核依据" in text_of(page, ".rv-report-overlay"))
    check("报告标题已解析插槽（不含未替换的花括号）", "{{" not in text_of(page, ".rv-report-summary"))
    check("报告正文不含未替换的插槽", "{{" not in text_of(page, ".rv-report-overlay"))
    page.screenshot(path=str(SHOTS / "09-archive-divergent.png"))

    page.click('[data-action="archive-report"]')
    check("确认归档后直接进入知识库", page.locator(".kb-layout").count() == 1)

    # ---------------------------------------------------------------- 6. 知识库
    print("\n== 6. 知识库 ==")
    check("进入知识库", page.locator(".kb-layout").count() == 1)
    # 归档报告落在归档案例分类里，切到那个分类才看得到
    target = page.evaluate("window.DOMAIN_KB.archiveTarget().categoryId")
    page.click('[data-select="kb-category"][data-select-id="%s"]' % target)
    check("归档报告出现在知识库并带 NEW 标", page.locator(".kb-doc.fresh").count() == 1)
    page.locator(".kb-doc.fresh").click()
    check("能打开归档报告的阅读器", page.locator(".kb-doc-overlay").count() == 1)
    check("归档报告有正文分段", page.locator(".kb-chunk").count() >= 3)
    page.screenshot(path=str(SHOTS / "10-kb-archived.png"))
    page.keyboard.press("Escape")

    page.click('[data-action="start-ingest"]')
    check("入库动画浮层打开", page.locator(".kb-ingest-overlay").count() == 1)
    check("动画未完成时关闭按钮禁用", page.locator(".kb-ingest-overlay .overlay-close").is_disabled())
    # 六步共约 4 秒。整屏渲染次数必须一次都不涨——涨一次就是闪一次。
    before = render_count(page)
    mark(page, ".kb-rag-chunk")

    # 进度条必须**一步步**走完，不能一上来就拉满。这里在动画期间连续采样宽度百分比，
    # 断言中途确实停留过多个不同的中间档位。
    # 早先用的是一次性 CSS 关键帧（0→100% 跑 0.7 秒），第一步就满、后面五步不动，
    # 而当时所有断言都是绿的——没有任何一条在看"进度是怎么走的"。
    widths = []
    for _ in range(40):
        pct = page.eval_on_selector(
            '[data-ingest-part="progressBar"]',
            "el => Math.round(parseFloat(getComputedStyle(el).width) / parseFloat(getComputedStyle(el.parentNode).width) * 100)",
        )
        if not widths or widths[-1] != pct:
            widths.append(pct)
        if pct >= 100:
            break
        page.wait_for_timeout(120)
    mids = sorted(set(w for w in widths if 0 < w < 100))
    check("进度条分多档推进而不是一次拉满（观察到中间档位 %s）" % mids, len(mids) >= 3)
    check("进度条最终走满", widths and widths[-1] >= 100)

    page.wait_for_selector(".kb-query.visible", timeout=8000)
    check("动画跑完出现检索命中", page.locator(".kb-rag-chunk.hit").count() >= 1)
    check("六步推进全程零次整屏渲染（改回 commit() 时这条会红）",
          render_count(page) == before)
    check("六步推进全程 chunk 卡未被重建（重建会让落下动画反复重播）",
          probe_survived(page, ".kb-rag-chunk"))
    check("动画跑完后关闭按钮解禁",
          not page.locator(".kb-ingest-overlay .overlay-close").is_disabled())
    page.screenshot(path=str(SHOTS / "11-ingest.png"))
    page.click('[data-action="close-ingest"]')

    page.click('[data-action="open-agent"][data-agent-context="knowledge"]')
    check("知识库 Agent 在归档后多出一条问题",
          page.locator(".ag-question").count() >= 3)
    page.keyboard.press("Escape")

    # ---------------------------------------------------------------- 7. 回到工作台
    print("\n== 7. 回到工作台（闭环收尾）==")
    page.click('.scene-nav-btn[data-scene-key="workbench"]')
    check("归档后回到工作台仍只有巡检记录列表", page.locator(".wb-ai").count() == 0 and page.locator(".sl-table-row").count() >= 3)
    check("工作台不恢复旧版依据芯片", page.locator(".ev-chip").count() == 0)
    page.screenshot(path=str(SHOTS / "12-workbench-return.png"))

    # ---------------------------------------------------------------- 8. 采纳支线对照
    print("\n== 8. 采纳支线：报告段数必须与分歧支线不同 ==")
    page.click('[data-action="reset-demo"]')
    check("重置后回到工作台", page.locator(".wb-layout").count() == 1)
    check("重置后顶部仍只有 3 个主场景", page.locator(".scene-nav-btn").count() == 3)

    page.click('.scene-nav-btn[data-scene-key="review"]')
    page.click('[data-action="review-vote"][data-vote-id="accept"]')
    check("采纳后自动预选 AI 建议的结论", page.locator(".rv-outcome.active").count() == 1)
    check("采纳后不出现分歧条", page.locator(".rv-divergence").count() == 0)
    fill_required_selects(page)
    check("采纳支线不填意见也可执行", not page.locator('[data-gate="execute"]').is_disabled())
    page.click('[data-action="execute-review"]')
    check("采纳支线执行后也弹出报告归档确认浮层", page.locator(".rv-report-overlay").count() == 1)

    # 复测退回：demo 里唯一的一条回头路
    if page.locator('[data-action="retest-fail"]').count():
        page.click('[data-action="close-report-archive"]')
        page.click('[data-action="retest-fail"]')
        check("复测不通过退回复核页", page.locator(".rv-grid").count() == 1)
        check("退回后出现提示横幅", page.locator(".rv-retest-banner").count() == 1)
        check("退回后结论仍保留", page.locator(".rv-outcome.active").count() == 1)
        page.screenshot(path=str(SHOTS / "13-retest-back.png"))
        page.click('[data-action="execute-review"]')
        page.click('[data-action="close-report-archive"]')
        page.click('[data-action="retest-pass"]')
        check("复测通过后可重新打开报告归档浮层",
              page.locator('[data-action="open-report-archive"]').count() == 1)

    page.click('[data-action="open-report-archive"]')
    accept_sections = page.locator(".rv-report-overlay .ar-section").count()
    check("采纳支线不含分歧段",
          page.locator('.rv-report-overlay .ar-section[data-report-section-id="divergence"]').count() == 0)
    check(
        "两条支线的报告段数不同（采纳 %d 段 vs 驳回 %d 段）——相同则说明人工介入只是装饰"
        % (accept_sections, divergent_sections),
        accept_sections != divergent_sections,
    )
    page.screenshot(path=str(SHOTS / "14-archive-accept.png"))


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 950})

        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))

        page.goto(INDEX.as_uri(), wait_until="domcontentloaded")
        page.wait_for_selector(".wb-layout", timeout=8000)

        try:
            run(page)
        finally:
            browser.close()

    print("")
    check("全程无 console error / page error", len(console_errors) == 0)
    for err in console_errors[:10]:
        print("  ERR " + err)

    print("")
    if failures:
        print("FAILED（%d 项）：" % len(failures))
        for label in failures:
            print("  - " + label)
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % passed)
    print("截图目录：%s" % SHOTS)


if __name__ == "__main__":
    main()
