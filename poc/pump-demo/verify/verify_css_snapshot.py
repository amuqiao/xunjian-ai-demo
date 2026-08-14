"""CSS 计算样式基线比对。

用途：CSS 拆分/重排是"肉眼看不出差异但计算样式会变"的改动类型，
      这个脚本把关键选择器的 computedStyle 钉成基线，专治这类静默回归。

用法（在仓库根执行）：
  uv run python poc/pump-demo/verify/verify_css_snapshot.py --write   # 建立/更新基线
  uv run python poc/pump-demo/verify/verify_css_snapshot.py           # 比对基线

遵守仓库 AGENTS.md：使用 Python 版 Playwright，不直接调用系统 Chrome headless。
--write 必须是显式的、逐条 review 过的动作，不要用它糊掉真实回归。
"""

import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PAGE = (HERE.parent / "index.html").as_uri()
BASELINE = HERE / "baseline" / "css.json"

WIDTHS = [1920, 1440, 1280, 900]

# 只采白名单属性：颜色/字号这类会随主题变动的也要采，但不采 width/height 这类
# 依赖视口的像素值（那些由 verify_pump3d.py 的 canvas 贴合断言负责）。
PROPS = [
    "display", "position", "z-index", "overflow", "isolation",
    "grid-template-columns", "grid-template-areas", "grid-template-rows",
    "min-height", "font-size", "font-weight", "color", "background-color",
    "border-color", "padding", "gap", "pointer-events", "cursor",
]

# 每个场景下要采样的选择器。3D 契约相关的放在最前面，它们是禁改区。
SCENES = {
    "overview": [
        ".pump-train", ".pump3d-canvas", ".pump3d-labels", ".pump3d-hint",
        ".part-pin", ".pin-core", ".pin-label",
        ".pump-map-toast", ".pump-source-preview",
        ".app-shell", ".topbar", ".stage", ".flow-rail",
        ".scene-nav", ".scene-button", ".scene-button.active",
        ".dashboard-grid", ".dashboard-kpi", ".panel", ".panel-title",
        ".chart-box", ".badge", ".dot", ".area-stat",
    ],
    "station": [
        ".pump-train", ".pump3d-canvas", ".pump3d-labels", ".part-pin", ".pin-label",
        ".scene-shell", ".scene-head", ".kicker",
        ".station-grid", ".station-map-panel", ".station-side",
        ".station-route-panel", ".station-units-panel", ".station-unit",
        ".primary-action", ".plain-button",
    ],
    "workbench": [
        ".workbench-stack", ".workbench-focus-grid", ".focus-card", ".thumb",
    ],
    "confirm": [
        ".confirm-grid", ".verdict-button", ".evidence-summary",
    ],
    "knowledge": [
        ".knowledge-scene", ".knowledge-layout", ".knowledge-library-panel",
        ".knowledge-studio-panel", ".knowledge-visual-doc", ".knowledge-chunk-preview",
        ".knowledge-action-panel", ".knowledge-upload-entry", ".knowledge-hit-overview",
    ],
    "graph": [
        ".graph-panel", ".graph-stage", ".graph-canvas-card", ".graph-focus-card",
    ],
}

MODAL_STATES = {
    "knowledge-doc-modal": [
        ".kb-doc-overlay", ".kb-doc-reader", ".kb-doc-map",
    ],
    "knowledge-ingest-modal": [
        ".kb-ingest-overlay", ".kb-ingest-dialog", ".kb-rag-stage", ".overlay-mask-locked",
    ],
}


def collect(page):
    """返回 { "<scene>|<width>|<selector>": {prop: value} }，选择器命不中则记 null。"""
    out = {}
    for scene, selectors in SCENES.items():
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.wait_for_timeout(250)
        page.dispatch_event("[data-scene='%s']" % scene, "click")
        page.wait_for_timeout(700)
        for width in WIDTHS:
            page.set_viewport_size({"width": width, "height": 1080})
            page.wait_for_timeout(350)
            got = page.evaluate(
                """([selectors, props]) => {
                     const out = {};
                     for (const sel of selectors) {
                       const el = document.querySelector(sel);
                       if (!el) { out[sel] = null; continue; }
                       const cs = getComputedStyle(el);
                       const row = {};
                       for (const p of props) row[p] = cs.getPropertyValue(p);
                       out[sel] = row;
                     }
                     return out;
                   }""",
                [selectors, PROPS],
            )
            for sel, row in got.items():
                out["%s|%d|%s" % (scene, width, sel)] = row

    page.set_viewport_size({"width": 1920, "height": 1080})
    page.wait_for_timeout(250)
    page.dispatch_event("[data-scene='knowledge']", "click")
    page.wait_for_timeout(700)
    page.click("[data-select='kb-category'][data-select-id='cat-metric']")
    page.wait_for_timeout(350)
    page.click("[data-action='open-doc'][data-select-id='doc-vibration-threshold']")
    page.wait_for_timeout(350)
    for width in WIDTHS:
      page.set_viewport_size({"width": width, "height": 1080})
      page.wait_for_timeout(250)
      got = page.evaluate(
          """([selectors, props]) => {
               const out = {};
               for (const sel of selectors) {
                 const el = document.querySelector(sel);
                 if (!el) { out[sel] = null; continue; }
                 const cs = getComputedStyle(el);
                 const row = {};
                 for (const p of props) row[p] = cs.getPropertyValue(p);
                 out[sel] = row;
               }
               return out;
             }""",
          [MODAL_STATES["knowledge-doc-modal"], PROPS],
      )
      for sel, row in got.items():
          out["knowledge-doc-modal|%d|%s" % (width, sel)] = row

    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    page.click("[data-action='start-ingest']")
    page.wait_for_timeout(350)
    for width in WIDTHS:
      page.set_viewport_size({"width": width, "height": 1080})
      page.wait_for_timeout(250)
      got = page.evaluate(
          """([selectors, props]) => {
               const out = {};
               for (const sel of selectors) {
                 const el = document.querySelector(sel);
                 if (!el) { out[sel] = null; continue; }
                 const cs = getComputedStyle(el);
                 const row = {};
                 for (const p of props) row[p] = cs.getPropertyValue(p);
                 out[sel] = row;
               }
               return out;
             }""",
          [MODAL_STATES["knowledge-ingest-modal"], PROPS],
      )
      for sel, row in got.items():
          out["knowledge-ingest-modal|%d|%s" % (width, sel)] = row
    return out


def main():
    write = "--write" in sys.argv
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        # 用 domcontentloaded：重载机器上等 load 容易把浏览器进程等到被系统杀掉
        page.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        page.set_default_timeout(45000)
        page.wait_for_timeout(2500)
        # 场景导航有锁：knowledge/graph 始终可开，workbench/confirm 需要先解锁
        page.click("[data-scene='workbench']")
        page.wait_for_timeout(400)
        page.click("[data-scene='confirm']")
        page.wait_for_timeout(400)
        snapshot = collect(page)
        browser.close()

    if errors:
        print("FAIL 采样过程中出现 pageerror：")
        for e in errors[:5]:
            print("  " + e)
        sys.exit(1)

    missing = [k for k, v in snapshot.items() if v is None]

    if write:
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        BASELINE.write_text(
            json.dumps(snapshot, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8"
        )
        print("已写入基线：%s" % BASELINE)
        print("采样条目 %d 个，其中选择器未命中 %d 个" % (len(snapshot), len(missing)))
        if missing:
            print("未命中（重构后若这些选择器消失属预期，但要在 review 里确认）：")
            for k in missing[:40]:
                print("  " + k)
        return

    if not BASELINE.exists():
        print("FAIL 基线不存在，请先跑 --write：%s" % BASELINE)
        sys.exit(1)
    base = json.loads(BASELINE.read_text(encoding="utf-8"))

    diffs = []
    for key in sorted(set(base) | set(snapshot)):
        b, s = base.get(key, "<缺失>"), snapshot.get(key, "<缺失>")
        if b == s:
            continue
        if b is None or s is None or isinstance(b, str) or isinstance(s, str):
            diffs.append("%s: %s -> %s" % (key, "null" if b is None else b, "null" if s is None else s))
            continue
        for prop in PROPS:
            if b.get(prop) != s.get(prop):
                diffs.append("%s [%s]: %r -> %r" % (key, prop, b.get(prop), s.get(prop)))

    if diffs:
        print("FAIL 计算样式与基线有 %d 处差异：" % len(diffs))
        for d in diffs[:80]:
            print("  " + d)
        if len(diffs) > 80:
            print("  ...（其余 %d 处省略）" % (len(diffs) - 80))
        sys.exit(1)

    print("PASS 计算样式与基线零差异（%d 条采样，%d 档宽度，%d 个场景）"
          % (len(snapshot), len(WIDTHS), len(SCENES)))


main()
