# 构建归档报告的 PDF 与内嵌预览页图。
#
# 单一真源：本脚本不写任何报告文案，它加载 tools/report-template.html —— 那个模板
# 又加载 domain/*.js + scripts/core/report.js，调 ReportModel.resolve() 拿已填好插槽
# 的段落。所以「屏上归档浮窗看到的」和「下载下来的 PDF」来自同一份模板与同一份数据。
#
# 一次构建**两份** PDF，都落在 assets/reports/：
#   pump-diagnosis-report-accepted.pdf   人工结论 = AI 主诊断（8 段，无分歧）
#   pump-diagnosis-report-divergent.pdf  人工结论 != AI 主诊断（9 段，多一段分歧说明）
#
# 为什么要两份：复核结论是现场选的，而 PDF 是预构建的。一份装不下两种结果，
# 而"屏上改判了、下载下来还是采纳版"是当场能被看出来的不一致。场景层按当前是否分歧
# 挂对应那份（见 domain/06-report.js 的 meta.pdfPaths）。
#
# 不导出页图：屏上预览改成 HTML 按 A4 版式渲染（读同一个 ReportModel.resolve()），
# 这样预览随实际选择变化，且验收脚本能断言正文文本 —— 静态页图两样都做不到。
#
# 用法：uv run python poc/inspection-demo/diagnosis-flow-v2/tools/build_report.py
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TEMPLATE = HERE / "report-template.html"
OUT_DIR = ROOT / "assets" / "reports"

# A4 在 96dpi 下是 794×1123 CSS px —— 与模板里 .rp-page 的固定尺寸一致。
PAGE_W, PAGE_H = 794, 1123
# 页图导出倍率。2 倍得到 1588×2246，在浮窗里缩到约 560px 宽仍然清晰。
SCALE = 2


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 两个剧本。outcome 决定是否分歧：REC-1 的 AI 主诊断建议是 OUT-CONFIRM，
    # 所以选它 = 采纳版；选 OUT-RECHECK（先核工况、暂不停机）= 改判版。
    # 改判版刻意采纳备选诊断，而不是随便换一个结论 —— 那才是 assets/诊断工作台/
    # 泵课题Q&A.docx 里专家真正在争的那件事（Q2「你到底是确诊还是猜谜」）。
    variants = [
        {
            "key": "accepted",
            "outcome": "OUT-CONFIRM",
            "note": "已按分级方案降至 70% 负荷，安排 4 小时内现场复测并取油样；"
                    "AI 主诊断认可，但要求工单增加激光对中复测作为前置步骤。",
            "out": "pump-diagnosis-report-accepted.pdf",
        },
        {
            "key": "divergent",
            "outcome": "OUT-RECHECK",
            # 改判版采纳的是**备选诊断**：不停机拆检，先核过泵流量是否长期偏离
            # API 610 优先工作区（Top-1 长岭 P-01 的确诊根因就是这个）。
            "note": "不采纳主诊断：本轮过泵流量长期偏低，先按工况问题核查，暂不停机拆检；"
                    "已要求核对实际过泵流量是否落在 273~468m³/h 的优先工作区内。",
            "out": "pump-diagnosis-report-divergent.pdf",
        },
    ]

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        results = []
        for variant in variants:
            page = browser.new_page(
                viewport={"width": PAGE_W, "height": PAGE_H},
                device_scale_factor=SCALE,
            )
            errors: list[str] = []
            page.on("pageerror", lambda e, acc=errors: acc.append(str(e)))
            url = TEMPLATE.as_uri() + "?" + urlencode({
                "record": "REC-1",
                "reviewer": "RV-1",
                "outcome": variant["outcome"],
                "note": variant["note"],
                # range 必须是 domain/03-series.js 里真实存在的 key（7m/3m/2m），
                # 传一个不存在的会在 rangeByKey 里直接抛错。
                "range": "7m",
                # 与 scripts/ui/reportview.js 的 generatedAt 一致 —— 屏上预览和
                # 下载下来的 PDF 页眉时间不同会当场被看出来。
                "at": "2026-07-22 17:05",
            })
            page.goto(url, wait_until="load")

            # 模板在图片加载完之后才挂 __REPORT_READY__。不等它就打印会得到没图的版本。
            page.wait_for_function("() => !!window.__REPORT_READY__", timeout=20000)
            ready = page.evaluate("() => window.__REPORT_READY__")

            if errors:
                print(f"[{variant['key']}] 模板里有 pageerror，构建中止：", file=sys.stderr)
                for e in errors:
                    print("  " + e, file=sys.stderr)
                return 1

            # 分歧态必须和剧本对上 —— 对不上说明 outcome 传错或模型判定变了，
            # 那两份 PDF 就会是同一种内容，静默产出比报错糟得多。
            expect_divergent = variant["key"] == "divergent"
            if ready["divergent"] is not expect_divergent:
                print(f"[{variant['key']}] 分歧态与剧本不符：期望 {expect_divergent}，"
                      f"实际 {ready['divergent']}", file=sys.stderr)
                return 1

            pdf_path = OUT_DIR / variant["out"]
            page.pdf(
                path=str(pdf_path),
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            results.append((variant, ready, pdf_path))
            page.close()

        browser.close()

    print("报告构建完成（两份）")
    for variant, ready, pdf_path in results:
        print(f"  {variant['key']:10s} outcome={variant['outcome']:15s} "
              f"分歧={'是' if ready['divergent'] else '否'}  "
              f"{ready['pages']} 页  {pdf_path.name}  ({pdf_path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
