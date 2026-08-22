# 端到端走查：验证巡检诊断 demo 的新主线。
#
# 用法：uv run python poc/inspection-demo/diagnosis-flow/verify/verify_flow.py

import pathlib
import shutil
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
PDF_REPORT = ROOT / "assets" / "reports" / "inspection-diagnosis-report.pdf"
SHOTS = pathlib.Path("/private/tmp/inspection-diagnosis-flow-shots")

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


def render_count(page):
    return page.evaluate("() => window.Boot.debugInfo().renderCount")


def mark(page, selector):
    page.eval_on_selector(selector, "el => { el.dataset.flickerProbe = '1'; }")


def probe_survived(page, selector):
    node = page.query_selector(selector)
    return bool(node) and node.get_attribute("data-flicker-probe") == "1"


def boxes_overlap(a, b):
    return not (
        a["x"] + a["width"] <= b["x"] or
        b["x"] + b["width"] <= a["x"] or
        a["y"] + a["height"] <= b["y"] or
        b["y"] + b["height"] <= a["y"]
    )


def open_ai_list(page, row_text=None):
    if row_text:
        page.locator(".sl-table-row").filter(has_text=row_text).click()
    else:
        page.click(".sl-table-row.active .sl-table-td")
    page.wait_for_selector(".wb-ai-list-overlay", timeout=3000)
    page.wait_for_timeout(220)


def clean_load(page):
    page.goto(INDEX.as_uri(), wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector(".wb-layout", timeout=8000)


def run(page):
    print("== 1. 首屏与工作台 ==")
    check("项目内 PDF 报告文件存在", PDF_REPORT.is_file())
    check("顶栏标题已填充", text_of(page, "#brandTitle") != "")
    check("顶部导航渲染出 3 项", page.locator(".scene-nav-btn").count() == 3)
    check("底部流程条已移除", page.locator(".flow-rail").count() == 0)
    check("工作台记录表有巡检数据",
          page.locator(".sl-table-row").count() >= 1 and "P-3 泵" in text_of(page, ".wb-records"))
    check("工作台只保留 AI 浮动图标入口", page.locator(".wb-agent-fab").count() == 1)
    page.click(".wb-agent-fab")
    page.wait_for_selector(".ag-overlay", timeout=3000)
    check("工作台 AI 浮动图标打开 workbench Agent",
          page.evaluate("() => window.AppState.value.agent.contextId") == "workbench")
    page.keyboard.press("Escape")
    page.screenshot(path=str(SHOTS / "01-workbench.png"))

    print("\n== 2. 时序 / 视觉 / 知识库下钻 ==")
    open_ai_list(page)
    check("点击记录打开 AI 判断浮窗", page.locator(".wb-ai-list-overlay").count() == 1)
    check("AI 判断浮窗列出三类服务", page.locator(".wb-ai-service").count() == 3)
    check("时序和视觉服务卡整体可点击", page.locator(".wb-ai-service.clickable").count() == 2)
    check("时序证据入口存在", page.locator('[data-action="open-evidence"][data-evidence-kind="series"]').count() >= 1)
    check("视觉证据入口存在", page.locator('[data-action="open-evidence"][data-evidence-kind="vision"]').count() >= 1)
    page.screenshot(path=str(SHOTS / "02-ai-list.png"))

    page.click('.wb-ai-service.clickable[data-evidence-kind="series"]')
    page.wait_for_selector(".dt-trend-grid", timeout=3000)
    page.wait_for_selector(".dt-chart canvas", timeout=3000)
    check("点击时序服务卡进入时序详情", page.locator(".dt-trend-grid").count() == 1)
    check("时序详情仍高亮工作台导航", page.locator('.scene-nav-btn[data-scene-key="workbench"].active').count() == 1)
    check("时序详情绘制出主曲线", page.locator(".dt-chart canvas").count() >= 1)
    page.screenshot(path=str(SHOTS / "03-trend.png"))
    page.click('[data-action="close-detail"]')

    open_ai_list(page)
    page.click('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="vision"]')
    page.wait_for_selector(".dt-vision-grid", timeout=3000)
    check("点击视觉按钮进入视觉详情", page.locator(".dt-vision-grid").count() == 1)
    check("视觉详情展示帧序列", page.locator(".dt-strip-item").count() >= 1)
    page.click('[data-action="zoom-frame"]')
    check("视觉图片可打开放大浮层", page.locator(".dt-zoom-overlay").count() == 1)
    page.keyboard.press("Escape")
    check("Esc 可关闭视觉放大浮层", page.locator(".dt-zoom-overlay").count() == 0)
    page.screenshot(path=str(SHOTS / "04-vision.png"))
    page.click('[data-action="close-detail"]')

    open_ai_list(page, "P6 泵高压柜")
    page.click('.wb-ai-service.clickable[data-evidence-kind="series"]')
    page.wait_for_selector(".dt-trend-grid", timeout=3000)
    check("切换到 P6 记录后时序详情绑定控制回路测点",
          page.evaluate("() => window.AppState.value.pick.trend.pointId") == "PT-3")
    page.click('[data-action="close-detail"]')

    open_ai_list(page, "P6 泵高压柜")
    page.click('.wb-ai-service.clickable[data-evidence-kind="vision"]')
    page.wait_for_selector(".dt-vision-grid", timeout=3000)
    check("切换到 P6 记录后视觉详情绑定高压柜关键帧",
          page.evaluate("() => window.AppState.value.pick.vision.frameId") == "FRM-2-CUR")
    page.click('[data-action="close-detail"]')

    open_ai_list(page, "P6 泵高压柜")
    page.click('.wb-ai-list-overlay [data-action="open-evidence"][data-evidence-kind="case"]')
    page.wait_for_selector(".kb-doc-overlay", timeout=3000)
    page.wait_for_timeout(220)
    check("未锁定案例依据可跳转知识库文档", page.locator(".kb-doc-overlay").count() == 1)
    check("普通知识资产展示自身正文", page.locator(".kb-doc-overlay .kb-doc-chunk").count() >= 1)
    check("普通知识资产不会误用报告 PDF", page.locator(".kb-doc-overlay .kb-pdf-paper").count() == 0)
    page.screenshot(path=str(SHOTS / "05-kb-doc-from-workbench.png"))
    page.keyboard.press("Escape")

    print("\n== 3. 人工复核与报告浮窗 ==")
    page.click('.scene-nav-btn[data-scene-key="workbench"]')
    open_ai_list(page)
    page.click('.wb-ai-list-overlay [data-action="go-review"]')
    page.wait_for_selector(".rv-review-page", timeout=3000)
    check("进入轻量复核确认台", page.locator(".rv-review-page").count() == 1)
    check("复核页不再渲染旧多步骤网格", page.locator(".rv-grid").count() == 0)
    check("复核页不再常驻处置路径大卡", page.locator(".rv-path").count() == 0)
    check("左侧只保留 AI 摘要", page.locator(".rv-ai-summary .rv-summary-card").count() == 1)
    check("右侧是三类人工业务结论按钮", page.locator(".rv-decision-vote").count() == 3)
    check("复核页也有右下角 AI 浮动图标", page.locator(".rv-agent-fab").count() == 1)
    page.click(".rv-agent-fab")
    page.wait_for_selector(".ag-overlay", timeout=3000)
    check("复核页 AI 浮动图标打开 review Agent",
          page.evaluate("() => window.AppState.value.agent.contextId") == "review")
    page.keyboard.press("Escape")
    check("未选择前提示选择人工复核结论", "请选择人工复核结论" in text_of(page, '[data-gate="hint"]'))
    page.screenshot(path=str(SHOTS / "06-review-empty.png"))

    page.click('[data-action="review-vote"][data-vote-id="reject"]')
    check("驳回后自动选定排除误报结论",
          page.evaluate("() => window.AppState.value.review.outcomeId") == "reject")
    check("驳回后出现分歧提示", page.locator(".rv-divergence").count() == 1)
    check("默认复核意见已自动填充", "误报" in page.eval_on_selector(".rv-note", "el => el.value"))
    check("默认意见满足闸门后可生成报告", not page.locator('[data-gate="execute"]').is_disabled())
    page.fill(".rv-note", "")
    check("清空分歧理由后按钮禁用", page.locator('[data-gate="execute"]').is_disabled())
    page.fill(".rv-note", "现场复核后判断本项为误报，纳入模型样本回流。")
    check("重新填写理由后按钮恢复可用", not page.locator('[data-gate="execute"]').is_disabled())

    page.click('[data-action="execute-review"]')
    page.wait_for_selector(".rv-report-overlay", timeout=3000)
    page.wait_for_timeout(220)
    check("生成报告后仍停留复核主页面", page.locator(".rv-review-page").count() == 1)
    check("报告以浮窗打开", page.locator(".rv-report-overlay").count() == 1)
    check("报告浮窗展示四张摘要卡", page.locator(".rv-report-digest-card").count() == 4)
    check("报告浮窗提供查看完整 PDF 入口",
          "inspection-diagnosis-report.pdf" in page.locator(".rv-report-overlay a").first.get_attribute("href"))
    check("报告浮窗文案无未解析插槽", "{{" not in text_of(page, ".rv-report-overlay"))
    page.screenshot(path=str(SHOTS / "07-report-overlay.png"))

    page.click('[data-action="archive-report"]')
    check("归档后报告浮窗关闭", page.locator(".rv-report-overlay").count() == 0)
    check("归档状态写入 AppState", page.evaluate("() => window.AppState.value.archived === true"))

    page.click('[data-action="reset-demo"]')
    page.wait_for_selector(".wb-layout", timeout=3000)
    page.click('.scene-nav-btn[data-scene-key="review"]')
    page.click('[data-action="review-vote"][data-vote-id="accept"]')
    page.click('[data-action="execute-review"]')
    page.wait_for_selector(".rv-report-overlay", timeout=3000)
    page.wait_for_timeout(220)
    check("处置型结论报告先提示复测确认", page.locator(".rv-report-retest").count() == 1)
    check("处置型结论未复测不能归档", page.evaluate("() => window.AppState.canArchiveReport() === false"))
    check("处置型结论未复测时不显示归档按钮",
          page.locator('.rv-report-overlay [data-action="archive-report"]').count() == 0)
    page.keyboard.press("Escape")
    check("Esc 可关闭报告浮窗", page.locator(".rv-report-overlay").count() == 0)
    page.click('[data-action="execute-review"]')
    page.wait_for_selector(".rv-report-overlay", timeout=3000)
    page.click('[data-action="retest-pass"]')
    page.wait_for_timeout(220)
    check("复测通过后报告浮窗切换到归档动作",
          page.locator('.rv-report-overlay [data-action="archive-report"]').count() == 1)
    page.click('[data-action="archive-report"]')
    check("处置型结论复测通过后可归档", page.evaluate("() => window.AppState.value.archived === true"))

    print("\n== 4. 知识库资产页与入库浮窗 ==")
    page.click('.scene-nav-btn[data-scene-key="knowledge"]')
    page.wait_for_selector(".kb-asset-panel", timeout=3000)
    check("知识库主页面收敛为资产面板", page.locator(".kb-asset-panel").count() == 1)
    check("知识库不再平铺旧分类索引", page.locator(".kb-index").count() == 0)
    check("归档报告作为 NEW 资产出现", page.locator(".kb-asset.fresh .kb-doc-new").count() == 1)
    check("知识库保留 AI 浮动入口", page.locator(".kb-agent-fab").count() == 1)
    page.click(".kb-agent-fab")
    page.wait_for_selector(".ag-overlay", timeout=3000)
    check("知识库 AI 浮动图标打开 knowledge Agent",
          page.evaluate("() => window.AppState.value.agent.contextId") == "knowledge")
    page.keyboard.press("Escape")
    check("知识库大屏布局包含右侧资产复用面板", page.locator(".kb-index-panel").count() == 1)
    check("知识库大屏布局不再挤到一边", page.locator(".kb-layout").bounding_box()["width"] >= 1200)
    page.screenshot(path=str(SHOTS / "08-knowledge-main.png"))
    first_question_id = page.locator(".kb-query-chip").first.get_attribute("data-agent-question-id")
    page.locator(".kb-query-chip").first.click()
    page.wait_for_selector(".ag-overlay", timeout=3000)
    check("右侧常用问题可直接选中 Agent 问题",
          page.evaluate("(qid) => window.AppState.value.agent.questionId === qid", first_question_id))
    page.wait_for_selector(".ag-answer-card", timeout=3000)
    check("右侧常用问题可直接得到 Agent 回答", page.locator(".ag-answer-card").count() == 1)
    page.keyboard.press("Escape")
    page.locator(".kb-asset.fresh [data-action='open-doc']").click()
    page.wait_for_selector(".kb-doc-overlay", timeout=3000)
    page.wait_for_timeout(220)
    check("归档报告可打开 PDF 预览浮窗", page.locator(".kb-doc-overlay .kb-pdf-paper").count() == 1)
    check("PDF 阅读器提供下载按钮", page.locator('.kb-doc-overlay a[download$=".pdf"]').count() == 1)
    page.screenshot(path=str(SHOTS / "08-kb-asset-pdf.png"))
    page.keyboard.press("Escape")

    page.click('[data-action="start-ingest"]')
    page.wait_for_selector(".kb-ingest-overlay", timeout=3000)
    page.wait_for_timeout(220)
    check("入库动画浮窗打开", page.locator(".kb-ingest-overlay").count() == 1)
    check("入库浮窗右上角关闭按钮可点击", not page.locator(".kb-ingest-overlay .overlay-close").is_disabled())
    page.click(".kb-ingest-overlay .overlay-close")
    check("入库动画未完成时也可关闭", page.locator(".kb-ingest-overlay").count() == 0)

    page.click('[data-action="start-ingest"]')
    page.wait_for_selector(".kb-ingest-overlay", timeout=3000)
    page.wait_for_timeout(220)
    before = render_count(page)
    mark(page, ".kb-rag-chunk")
    page.wait_for_selector(".kb-query.visible", timeout=8000)
    check("入库动画最终出现检索命中", page.locator(".kb-rag-chunk.hit").count() >= 1)
    check("入库动画推进期间不整屏重渲染", render_count(page) == before)
    check("入库 chunk 卡未被重建", probe_survived(page, ".kb-rag-chunk"))
    page.screenshot(path=str(SHOTS / "09-ingest.png"))
    page.keyboard.press("Escape")


def run_mobile(browser):
    print("\n== 5. 小屏布局 ==")
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))
    clean_load(page)
    page.click('.scene-nav-btn[data-scene-key="review"]')
    check("小屏复核页改单列", page.locator(".rv-review-page").bounding_box()["width"] <= 390)
    check("小屏没有底部流程条遮挡", page.locator(".flow-rail").count() == 0)
    check("小屏复核 AI 按钮不遮挡生成报告按钮",
          not boxes_overlap(
              page.locator(".rv-agent-fab").bounding_box(),
              page.locator('[data-gate="execute"]').bounding_box()
          ))
    page.screenshot(path=str(SHOTS / "10-review-mobile.png"), full_page=True)
    page.click('.scene-nav-btn[data-scene-key="knowledge"]')
    page.wait_for_selector(".kb-layout", timeout=3000)
    check("小屏知识库无横向溢出",
          page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"))
    check("小屏知识库右侧面板折叠为单列", page.locator(".kb-index-panel").bounding_box()["width"] <= 390)
    check("小屏知识库上传按钮仍可见", page.locator(".kb-upload-action").is_visible())
    check("小屏知识库常用问题仍可点击", page.locator(".kb-query-chip").first.is_visible())
    page.screenshot(path=str(SHOTS / "11-knowledge-mobile.png"), full_page=True)
    page.close()


def main():
    if SHOTS.exists():
        shutil.rmtree(SHOTS)
    SHOTS.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 950})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))

        clean_load(page)
        try:
            run(page)
            run_mobile(browser)
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
