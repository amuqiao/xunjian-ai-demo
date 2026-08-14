"""overview 场景（泵机组大屏）验证脚本（任务 P1-I）。

【关于 3D 热点点击为什么用 dispatch_event 而不是 page.click(force=True)】
3D 热点标签的位置每帧由投影计算写 transform，标签之间可能互相靠近甚至短暂重叠。
page.click(..., force=True) 跳过"元素能否接收指针事件"的检查、按元素中心坐标点，
一旦那个坐标上压着另一个标签，点击就落到别人身上——实测出现过"点 motor 却选中了
base"。表现是断言时红时绿，很容易被误判成"并发跑测试导致的环境抖动"。
dispatch_event("click") 把事件直接派发到目标元素，不做命中测试，因此与标签是否
重叠、是否正在移动完全无关。这是消除不确定性，不是放宽断言。

用途：verify_pump3d.py 管的是"3D 隔离契约"（单一 WebGL 上下文、宿主盒非零、标签
投影去碰撞……），不关心场景层的联动是否真的接对；verify_ui.js 管的是组件层
（Cards/SelectList/DetailCard）本身的硬校验，不关心场景怎么组装它们。这个脚本补
中间这一层：overview.js 把数据层/图表层/组件层/状态层组装起来之后，"点状态卡换
详情、点 3D 热点卡片跟着跳、切时间范围三张图跟着重算"这些联动是否真的生效，以及
"每个内容块必须是四类卡片或 SelectList 之一，不许再加文字面板"这条机械约束是否
仍然成立。

用法（在仓库根执行）：
  uv run python poc/pump-demo/verify/verify_scenes.py

遵守仓库 AGENTS.md：使用 Python 版 Playwright，不直接调用系统 Chrome headless；
用 domcontentloaded 而不是 load（重载机器上等 load 容易被系统杀掉）。
"""

import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PAGE = (HERE.parent / "index.html").as_uri()
SHOTS = pathlib.Path("/private/tmp/pump-demo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)

# 与 verify_pump3d.py 保持同一份白名单口径（three.js 弃用提示 / swiftshader 性能提示），
# 两个脚本各自独立维护一份小常量，不互相 import——它们是两个独立的验证入口。
# 必须与 scripts/core/state.js 的 STORAGE_KEY 一致；每次升 key 都要把旧的追加进
# OLD_STORAGE_KEYS，用来断言"旧 key 里的坏状态被整体丢弃"这条不变量。
# STORAGE_KEY 不写死：它曾经写死成 v6 而 scripts/core/state.js 已经升到 v7，于是第 8 节
# 那批"畸形持久状态"探针一直在往一个 app 根本不读的 key 里写数据——探针读到的永远是
# 默认状态，断言"看起来通过"但什么都没测到。这是一条为了防绿灯装饰而写、自己却变成
# 绿灯装饰的断言。现在改为进页面后读运行期真值（AppState.STORAGE_KEY），并额外断言
# 运行期 key 不在下面这份历史清单里（升 key 时忘记把旧 key 挪进清单也会被抓到）。
STORAGE_KEY = None  # 运行期从 AppState.STORAGE_KEY 读，见 main() 里的赋值
OLD_STORAGE_KEYS = [
    "pump-demo-v8-state",
    "pump-demo-v7-state",
    "pump-demo-v6-state",
    "pump-demo-v5-state",
    "pump-demo-v4-state",
    "pump-demo-v3-state",
]

WARN_WHITELIST = re.compile(
    r"build/three\.(min\.)?js.*deprecated|GL Driver Message|GPU stall", re.I
)

# 部位 id -> 中文名，来自 Pump3DContract.PART_IDS 的既有顺序（与 verify_pump3d.py 的
# PART_LABELS 同一份真源抄录，测试脚本之间允许各自持有只读副本）。
PART_LABEL = {
    "pump-body": "泵体",
    "seal": "密封",
    "front-bearing": "泵驱动端轴承",
    "coupling": "联轴器",
    "motor": "电机",
    "base": "底座",
}

# overview 6 张状态卡里，测点 id -> 该测点所属部位（只有这 4 个部位在 6 张卡里有
# 覆盖；motor/seal 没有对应卡，见 scripts/scenes/overview.js 的 CARD_DEFS 注释）。
POINT_PART = {
    "P-DE-V": "front-bearing",
    "COUP-PH": "coupling",
    "BASE-V": "base",
    "BRG-T": "front-bearing",
    "PUMP-P": "pump-body",
}

RANGE_EXPECT = {"24h": 24, "7d": 7, "30d": 30, "90d": 45}
RANGE_ORDER = ["24h", "7d", "30d", "90d"]

CARD_IDS = ["UNIT-H", "P-DE-V", "COUP-PH", "BASE-V", "BRG-T", "PUMP-P"]

failures = []
notes = []
checked = 0


def check(label, ok, detail=""):
    global checked
    checked += 1
    (notes if ok else failures).append(
        ("PASS" if ok else "FAIL") + " " + label + ((" — " + str(detail)) if detail else "")
    )
    print(notes[-1] if ok else failures[-1])


def active_part_label(page):
    return page.evaluate(
        """() => {
             const els = [...document.querySelectorAll('[data-active-part-label]')];
             return { count: els.length, texts: els.map(el => el.textContent.trim()) };
           }"""
    )


def active_3d_part(page):
    """读取当前 3D 高亮（.part-pin.active）对应的 data-part，用于跟 data-active-part-label 对账。"""
    return page.evaluate(
        """() => {
             const el = document.querySelector('.pump3d-labels .part-pin.active');
             return el ? el.getAttribute('data-part') : null;
           }"""
    )


def card_values(page):
    """按 DOM 顺序读取 6 张状态卡（.overview-cards .sl-item）的 id 与主数值文本。"""
    return page.evaluate(
        """() => {
             const items = [...document.querySelectorAll('.overview-cards .sl-item')];
             return items.map(el => ({
               id: el.getAttribute('data-select-id'),
               value: (el.querySelector('.sl-item-value') || {}).textContent || '',
               note: (el.querySelector('.sl-item-note') || {}).textContent || '',
               active: el.classList.contains('active'),
               ariaPressed: el.getAttribute('aria-pressed'),
               tabindex: el.getAttribute('tabindex'),
             }));
           }"""
    )


def echarts_option(page, chart_id):
    return page.evaluate(
        """(id) => {
             const node = document.getElementById(id);
             if (!node) return null;
             const inst = window.echarts.getInstanceByDom(node);
             return inst ? inst.getOption() : null;
           }""",
        chart_id,
    )


# 任务 P3-D（阶段三 G2）：图谱场景用 ECharts 的 graph 系列渲染，节点没有独立 DOM
# 元素（画在 canvas 上），点击/悬停必须换算成画布内的像素坐标。
#
# ECharts 的 CPU canvas 渲染器会为同一个容器叠两层 <canvas>（一层主画面 zr_0、
# 一层用于 emphasis/hover 高亮的独立 z 层 zr_undefined，避免每次 hover 都整张
# 重绘）。这两层完全重合、谁在最上面纯粹是渲染实现细节，与"这个像素点对应哪个
# 节点"无关——但 Playwright 的 Locator.hover()/click() 会做"目标元素是否是该坐标
# 处最上层可交互元素"这条 actionability 检查，遇到这种堆叠会直接判定第一层被
# 第二层遮挡、一直重试到超时。这与文件顶部注释里 3D 热点标签"重叠导致误点"是两类
# 不同的问题（那边是"点中了别的标签"，这边是"两层画布互相不遮挡任何真实内容、
# 但 Locator 的保守检查误判成遮挡"），因此不用同一种 dispatch_event 方案，而是
# 直接用 page.mouse.move()/click() 按绝对页面坐标发真实指针事件——这类底层输入
# API 不做"目标元素是否被遮挡"的预检查，浏览器按坐标原生派发，ECharts/ZRender
# 自己的事件监听绑在容器一级，与具体是哪一层 canvas 接住了原生事件无关。
def graph_pixel_for_node(page, node_id):
    return page.evaluate(
        """(id) => {
             const node = document.getElementById('graph-canvas-chart');
             const inst = window.echarts.getInstanceByDom(node);
             const opt = inst.getOption();
             const found = opt.series[0].data.find((d) => d.id === id);
             if (!found) throw new Error('graph node not found: ' + id);
             return inst.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, found.value);
           }""",
        node_id,
    )


def graph_page_point(page, node_id):
    """节点在整页坐标系下的绝对像素位置，供 page.mouse.move()/click() 使用。"""
    return page.evaluate(
        """(id) => {
             const node = document.getElementById('graph-canvas-chart');
             const inst = window.echarts.getInstanceByDom(node);
             const opt = inst.getOption();
             const found = opt.series[0].data.find((d) => d.id === id);
             if (!found) throw new Error('graph node not found: ' + id);
             const local = inst.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, found.value);
             const rect = node.getBoundingClientRect();
             if (node.clientWidth === 0 || node.clientHeight === 0) {
               throw new Error('graph canvas has zero layout size');
             }
             const scaleX = rect.width / node.clientWidth;
             const scaleY = rect.height / node.clientHeight;
             return [rect.left + local[0] * scaleX, rect.top + local[1] * scaleY];
           }""",
        node_id,
    )


def open_range_menu(page):
    page.click(".range-picker summary")


def select_range(page, key):
    open_range_menu(page)
    page.click("[data-select='range'][data-select-id='%s']" % key)
    page.wait_for_timeout(400)


# 任务 P3-E（阶段三 G2）：归档场景需要先走完 workbench -> confirm -> 选结论 ->
# 执行处置/观察闭环 这条真实交互路径才能解锁 archive（canOpenForState 的规则），
# 不能直接改 localStorage 抄近路——那样测不到 boot.js 里 [data-verdict]/
# confirm-treatment/confirm-observation 这几处事件委托本身是否还接对。三条结论
# 路径共用这一个 helper，只是 verdict 参数不同；每次都先点"重置演示"，保证三条
# 路径互不污染彼此的状态。
def goto_archive(page, verdict):
    page.click("[data-action='reset-demo']")
    page.wait_for_timeout(300)
    page.click("[data-scene='workbench']")
    page.wait_for_timeout(300)
    page.click("[data-scene='confirm']")
    page.wait_for_timeout(300)
    page.click("[data-verdict='%s']" % verdict)
    page.wait_for_timeout(300)
    page.click("[data-action='go-treatment']")
    page.wait_for_timeout(300)
    if verdict == "确认不对中":
        page.click("[data-action='confirm-treatment']")
    else:
        page.click("[data-action='confirm-observation']")
    page.wait_for_timeout(500)


def assert_static_agent_dialog(page, dialog_id, question_id, label):
    page.click("[data-action='open-agent-dialog'][data-agent-dialog-id='%s']" % dialog_id)
    page.wait_for_timeout(300)
    dialog_open = page.evaluate(
        """() => {
             const dialog = document.querySelector('.agent-dialog');
             return !!dialog && dialog.closest('.overlay-layer').classList.contains('open');
           }"""
    )
    check("%s：打开 AgentDialog（%s）" % (label, dialog_id), bool(dialog_open), dialog_open)

    dialog_box = page.evaluate(
        """() => {
             const dialog = document.querySelector('.agent-dialog');
             const rect = dialog.getBoundingClientRect();
             const shellRect = document.querySelector('.app-shell').getBoundingClientRect();
             const widthRatio = rect.width / shellRect.width;
             return {
               width: Math.round(rect.width),
               height: Math.round(rect.height),
               shellWidth: Math.round(shellRect.width),
               shellHeight: Math.round(shellRect.height),
               widthRatio: Number(widthRatio.toFixed(3)),
               rightGap: Math.round(shellRect.right - rect.right),
               docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
             };
           }"""
    )
    check(
        "%s：AgentDialog 是右侧半屏 side sheet" % label,
        0.46 <= dialog_box["widthRatio"] <= 0.5
        and dialog_box["height"] >= dialog_box["shellHeight"] * 0.94
        and 0 <= dialog_box["rightGap"] <= 16
        and dialog_box["docScroll"] <= 1,
        dialog_box,
    )

    page.click("[data-agent-question-id='%s']" % question_id)
    page.wait_for_timeout(300)
    hit_probe = page.evaluate(
        """() => {
             const dialog = document.querySelector('.agent-dialog');
             const hits = dialog ? [...dialog.querySelectorAll('.agent-dialog-hit')] : [];
             return {
               count: hits.length,
               labels: hits.map((el) => el.textContent.trim()),
               clickable: hits.some((el) => el.tagName === 'BUTTON' || el.hasAttribute('data-action') || el.hasAttribute('data-select-id')),
             };
           }"""
    )
    check(
        "%s：选择问题后展示不可点击命中标签" % label,
        hit_probe["count"] > 0 and not hit_probe["clickable"],
        hit_probe,
    )

    page.click("button[data-action='close-agent-dialog']")
    page.wait_for_timeout(300)
    dialog_closed = page.evaluate(
        """() => {
             const dialog = document.querySelector('.agent-dialog');
             return !!dialog && !dialog.closest('.overlay-layer').classList.contains('open');
           }"""
    )
    check("%s：关闭 AgentDialog 后 overlay 收起" % label, bool(dialog_closed), dialog_closed)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page_errors = []
        console_msgs = []
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))

        page.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        page.wait_for_timeout(1800)

        global STORAGE_KEY
        STORAGE_KEY = page.evaluate("window.AppState.STORAGE_KEY")
        check(
            "运行期 STORAGE_KEY 不在历史 key 清单里（升 key 后要把旧 key 挪进 OLD_STORAGE_KEYS）",
            STORAGE_KEY not in OLD_STORAGE_KEYS,
            STORAGE_KEY,
        )

        check("页面 title", page.title() == "输油泵智能运维助手 · 演示原型", page.title())
        check("默认场景为 overview", page.get_attribute("[data-scene='overview']", "class").find("active") >= 0)

        # ---------------------------------------------------------------
        # 0. 首屏默认态自洽：详情卡的部位名必须等于 3D 当前高亮部位
        #    （防止 state.js 的 focus.partId 默认值和 pick.overview 默认值
        #    对不上——那正是本任务开工前实际踩到过的一个真实 bug）。
        # ---------------------------------------------------------------
        label0 = active_part_label(page)
        part0 = active_3d_part(page)
        check(
            "首屏详情卡的部位名 === 3D 当前高亮部位",
            label0["count"] == 1 and part0 is not None and label0["texts"][0] == PART_LABEL[part0],
            {"detailLabel": label0, "activePart": part0},
        )

        # ---------------------------------------------------------------
        # 1. 时间范围 4 档逐个点：6 张卡主数值变化 + chart1 xAxis 长度随档位变化
        # ---------------------------------------------------------------
        prev_values = None
        prev_notes = None
        for key in RANGE_ORDER:
            select_range(page, key)

            opt = echarts_option(page, "ov-chart-trend")
            x_len = len(opt["xAxis"][0]["data"]) if opt and opt.get("xAxis") else None
            check(
                "range=%s 时 chart1 xAxis.data.length == %d" % (key, RANGE_EXPECT[key]),
                x_len == RANGE_EXPECT[key],
                x_len,
            )

            cards = card_values(page)
            values = [c["value"] for c in cards]
            notes = [c["note"] for c in cards]
            check("range=%s 时 6 张状态卡都在" % key, len(cards) == 6, len(cards))
            if prev_values is not None:
                # 这里**不能**断言"卡片主数值随 range 变化"。主数值是 series().latest，
                # 按设计就是"此刻"的读数（valueAtHour 在 t=0 取叙事目标值），与所选窗口
                # 无关，切 range 本来就不该变——而且它必须和右栏详情的"当前值"、结论
                # 文案同源，否则同一测点会在相邻位置显示两个数字。
                # 早先这条断言写成"主数值必须变"，直接把实现逼成了"卡片显示区间均值"，
                # 于是卡片 44.26° 和详情 81° 并排出现。断言驱动了错误的产品决策，
                # 所以改为校验真正随区间变化的那部分：note（区间均值 / 峰值）。
                check(
                    "range 从上一档切到 %s：卡片主数值保持不变（latest 与窗口无关）" % key,
                    "|".join(values) == "|".join(prev_values),
                    {"prev": prev_values, "now": values},
                )
                changed_notes = sum(1 for a, b in zip(prev_notes, notes) if a != b)
                # PUMP-P（出口压力）在剧本里是刻意做成"工况稳定"的对照量，均值几乎不动，
                # 所以不要求 6/6 都变，但要求整体签名变了且至少 4/6 真的变了——两条一起
                # 钉住"联动完全没生效"和"只有极小一部分生效"这两类回归。
                check(
                    "range 从上一档切到 %s：卡片 note 整体发生变化" % key,
                    "|".join(notes) != "|".join(prev_notes),
                    {"prev": prev_notes, "now": notes},
                )
                check(
                    "range 从上一档切到 %s：至少 4/6 张卡的 note 变化" % key,
                    changed_notes >= 4,
                    {"changed": changed_notes, "prev": prev_notes, "now": notes},
                )
            prev_values = values
            prev_notes = notes

            # 时间控件选完后 <details> 必须回到收起态，且焦点落在 summary 上（Focus.restore
            # 对 mark.select === "range" 的特判，见 boot.js）。
            is_open = page.evaluate("() => document.querySelector('.range-picker').hasAttribute('open')")
            focus_ok = page.evaluate("() => document.activeElement === document.querySelector('.range-picker summary')")
            check("range=%s 选完后 <details> 收起（无 open 属性）" % key, not is_open, is_open)
            check("range=%s 选完后焦点落在 summary 上" % key, focus_ok, focus_ok)

        # 收尾切回 7d，后续测试都在这个基准区间下进行。
        select_range(page, "7d")

        # ---------------------------------------------------------------
        # 2. 点每张状态卡：右栏 data-active-part-label 与 3D 当前部位一致
        # ---------------------------------------------------------------
        # 先点一张有部位映射的卡，把 focus.partId 落到一个已知部位上，再点 UNIT-H，
        # 验证"选中健康分不改变 focus.partId"这条设计——3D 高亮和详情卡部位名应该
        # 和点 UNIT-H 之前完全一样，不会变成空白或别的部位。
        page.click("[data-select='overview-metric'][data-select-id='BASE-V']")
        page.wait_for_timeout(300)
        before_unit_h = active_3d_part(page)
        page.click("[data-select='overview-metric'][data-select-id='UNIT-H']")
        page.wait_for_timeout(300)
        after_unit_h = active_3d_part(page)
        label_unit_h = active_part_label(page)
        check(
            "点 UNIT-H 后 focus.partId 不变（3D 高亮部位不变）",
            after_unit_h == before_unit_h == "base",
            {"before": before_unit_h, "after": after_unit_h},
        )
        check(
            "点 UNIT-H 后详情卡部位名仍与 3D 一致",
            label_unit_h["count"] == 1 and label_unit_h["texts"][0] == PART_LABEL["base"],
            label_unit_h,
        )

        for point_id, part_id in POINT_PART.items():
            page.click("[data-select='overview-metric'][data-select-id='%s']" % point_id)
            page.wait_for_timeout(300)
            label = active_part_label(page)
            part = active_3d_part(page)
            expect = PART_LABEL[part_id]
            check(
                "点状态卡 %s：详情卡部位名与 3D 当前部位一致（期望 %s）" % (point_id, expect),
                label["count"] == 1 and part == part_id and label["texts"][0] == expect,
                {"label": label, "activePart": part},
            )

        # ---------------------------------------------------------------
        # 3. 点 3D 热点：左侧卡片选中态跳到该部位的主测点
        #    （前后偏差、底座、驱动端轴承、泵体 4 个部位在 6 张卡里有映射；
        #    motor/seal 没有映射——这是本任务修的一个真实 bug 的回归测试：
        #    点这两个热点不应该崩，也不应该把 pick.overview 写成一个不存在的卡。）
        # ---------------------------------------------------------------
        part_to_point = {}
        for point_id, part_id in POINT_PART.items():
            part_to_point.setdefault(part_id, point_id)
        # front-bearing 的主测点是 P-DE-V（catalog.js 里 primary:true 的是它，不是 BRG-T）。
        part_to_point["front-bearing"] = "P-DE-V"

        for part_id, expect_point in part_to_point.items():
            page.locator("[data-part='%s']" % part_id).dispatch_event("click")
            page.wait_for_timeout(300)
            cards = card_values(page)
            active_ids = [c["id"] for c in cards if c["active"]]
            check(
                "点 3D 热点 %s：左侧卡片选中态跳到 %s" % (part_id, expect_point),
                active_ids == [expect_point],
                active_ids,
            )

        before_motor = card_values(page)
        before_active = [c["id"] for c in before_motor if c["active"]]
        page.locator("[data-part='motor']").dispatch_event("click")
        page.wait_for_timeout(300)
        after_motor = card_values(page)
        after_active = [c["id"] for c in after_motor if c["active"]]
        motor_label = active_part_label(page)
        check(
            "点 3D 热点 motor（无对应卡）：不崩溃且左侧卡片选中态不变",
            after_active == before_active and motor_label["count"] == 1 and motor_label["texts"][0] == "电机",
            {"before": before_active, "after": after_active, "label": motor_label},
        )

        before_seal = card_values(page)
        before_active2 = [c["id"] for c in before_seal if c["active"]]
        page.locator("[data-part='seal']").dispatch_event("click")
        page.wait_for_timeout(300)
        after_seal = card_values(page)
        after_active2 = [c["id"] for c in after_seal if c["active"]]
        seal_label = active_part_label(page)
        check(
            "点 3D 热点 seal（无对应卡）：不崩溃且左侧卡片选中态不变",
            after_active2 == before_active2 and seal_label["count"] == 1 and seal_label["texts"][0] == "密封",
            {"before": before_active2, "after": after_active2, "label": seal_label},
        )

        # 回到主线叙事默认部位，后续测试在一致的基准态下进行。
        page.locator("[data-part='coupling']").dispatch_event("click")
        page.wait_for_timeout(300)

        # ---------------------------------------------------------------
        # 4. 卡片分级机械执行：.overview-grid 的每个直接子元素恰好带
        #    card-metric|card-chart|card-evidence|card-detail|sl 之一。
        #    两处显式豁免（都不是漏判）：
        #      - head（场景标题 + 时间范围控件）是导航/控件类 chrome，不属于四类
        #        卡片里的任何一种，也不是 SelectList 承载的"可选列表"，这条机械
        #        约束治的是"内容块"，不是页头控件；
        #      - stage（3D 机组态势宿主）是 scripts/pump3d/README.md 单独定义的一套
        #        DOM 契约（data-pump3d-host/.pump3d-labels/[data-part]……），3D 视口
        #        本身不是"文字卡片"，套用四类卡片分级没有意义，它的正确性由
        #        verify_pump3d.py 那一整套断言负责，不归这条机械约束管。
        #    overview-charts-row 是纯布局包裹层（chart1/chart2 共享底部一整行），
        #    本身不属于任何一类，但要求它的每个直接子节点都属于四类之一。
        # ---------------------------------------------------------------
        grading = page.evaluate(
            """() => {
                 const CLASSES = ['card-metric', 'card-chart', 'card-evidence', 'card-detail', 'sl'];
                 const hasOne = (el) => CLASSES.some(c => el.classList.contains(c));
                 const grid = document.querySelector('.overview-grid');
                 const out = [];
                 [...grid.children].forEach((el) => {
                   if (el.classList.contains('overview-head')) {
                     out.push({ tag: 'head', ok: true, note: 'chrome，豁免' });
                     return;
                   }
                   if (el.classList.contains('overview-stage-panel')) {
                     out.push({ tag: 'stage', ok: true, note: '3D 视口，另有 verify_pump3d.py 的契约断言，豁免' });
                     return;
                   }
                   if (el.classList.contains('overview-charts-row')) {
                     const kids = [...el.children];
                     out.push({
                       tag: 'charts-row',
                       ok: kids.length > 0 && kids.every(hasOne),
                       note: kids.map(k => k.className).join(' | '),
                     });
                     return;
                   }
                   out.push({ tag: el.className, ok: hasOne(el), note: el.className });
                 });
                 return out;
               }"""
        )
        for row in grading:
            check("场景网格子元素分级：%s" % row["tag"], row["ok"], row["note"])

        detail_tags_count = page.evaluate(
            "() => { const el = document.querySelector('.card-detail .detail-tags'); "
            "return el ? el.querySelectorAll('.tag').length : 0; }"
        )
        detail_metrics_count = page.evaluate(
            "() => document.querySelectorAll('.card-detail .detail-metrics .detail-metric').length"
        )
        check("card-detail 的 tags <= 3", detail_tags_count <= 3, detail_tags_count)
        check("card-detail 的 metrics 恰好 2 或 3 个", detail_metrics_count in (2, 3), detail_metrics_count)

        # ---------------------------------------------------------------
        # 5. 键盘可达性：Tab 进入卡片列表、方向键切换、选中态与焦点同步
        # ---------------------------------------------------------------
        page.focus(".range-picker summary")
        page.keyboard.press("Tab")
        landed = page.evaluate(
            """() => {
                 const el = document.activeElement;
                 return el ? { select: el.getAttribute('data-select'), id: el.getAttribute('data-select-id') } : null;
               }"""
        )
        check(
            "Tab 离开时间范围控件后落在状态卡列表上",
            bool(landed) and landed.get("select") == "overview-metric",
            landed,
        )

        before_id = landed["id"] if landed else None
        page.keyboard.press("ArrowRight")
        after_arrow = page.evaluate(
            """() => {
                 const el = document.activeElement;
                 return el ? { id: el.getAttribute('data-select-id'), tabindex: el.getAttribute('tabindex') } : null;
               }"""
        )
        check(
            "方向键把焦点移动到下一张状态卡",
            bool(after_arrow) and after_arrow["id"] != before_id and after_arrow["tabindex"] == "0",
            {"before": before_id, "after": after_arrow},
        )

        page.keyboard.press("Enter")
        page.wait_for_timeout(300)
        selected_after_enter = page.evaluate(
            """(id) => {
                 const el = document.querySelector('[data-select="overview-metric"][data-select-id="' + id + '"]');
                 const focused = document.activeElement === el;
                 return el ? { active: el.classList.contains('active'), ariaPressed: el.getAttribute('aria-pressed'), focused } : null;
               }""",
            after_arrow["id"],
        )
        check(
            "回车选中后该卡处于 active/aria-pressed=true，且焦点回到同一张卡上",
            bool(selected_after_enter)
            and selected_after_enter["active"]
            and selected_after_enter["ariaPressed"] == "true"
            and selected_after_enter["focused"],
            selected_after_enter,
        )

        # ---------------------------------------------------------------
        # 6. 控制台干净
        # ---------------------------------------------------------------
        errs = [t for ty, t in console_msgs if ty == "error"]
        warns = [t for ty, t in console_msgs if ty == "warning" and not WARN_WHITELIST.search(t)]
        check("无 pageerror", not page_errors, page_errors[:5])
        check("无 console error", not errs, errs[:5])
        check("无非白名单 console warning", not warns, warns[:5])

        # ---------------------------------------------------------------
        # 7. 三档宽度截图（presenter 会议室大屏常见宽度）
        # ---------------------------------------------------------------
        select_range(page, "7d")
        page.click("[data-select='overview-metric'][data-select-id='COUP-PH']")
        page.wait_for_timeout(500)
        for width in (1920, 1440, 1280):
            page.set_viewport_size({"width": width, "height": 1080})
            # 3D 是按需渲染：切视口尺寸会触发一次 resize/markDirty，入场巡航也可能
            # 因为首次挂载还没跑完；等 8 秒以上让画面真正静止下来再截图。
            page.wait_for_timeout(8500)
            no_scroll = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("宽度 %d 下整页不出现纵向滚动条" % width, no_scroll, no_scroll)
            page.screenshot(path=str(SHOTS / ("scenes-overview-%d.png" % width)))

        # ---------------------------------------------------------------
        # 7b. 内容不得被裁切/被遮盖（"无纵向滚动条"测不到的那一类）
        #
        # 背景：station 场景曾出现 3D 视口溢出自己的网格行 43px、盖住下方雷达卡，
        # 而"整页无纵向滚动条"断言全绿——因为面板是 overflow:visible，内容溢出既不
        # 产生滚动条、也不报错，只能靠看截图发现。这里把它变成机械断言：
        # 对关键容器断言 scrollHeight 不显著超过 clientHeight（即内容装得下），
        # 以及关键卡片的底沿不超出其所在面板的底沿（即没有互相盖住）。
        # ---------------------------------------------------------------
        for scene, selectors in [
            ("overview", [".overview-grid", ".overview-cards", ".card-detail"]),
            ("station", [".station-grid", ".station-map-panel", ".station-units-panel"]),
            ("workbench", [".workbench-stack", ".workbench-focus-grid"]),
            ("confirm", [".confirm-grid"]),
        ]:
            page.click("[data-scene='%s']" % scene)
            page.wait_for_timeout(2500 if scene != "station" else 9000)
            overflow = page.evaluate(
                """(sels) => sels.map(sel => {
                     const el = document.querySelector(sel);
                     if (!el) return { sel, missing: true };
                     return { sel, sh: el.scrollHeight, ch: el.clientHeight,
                              over: el.scrollHeight - el.clientHeight };
                   })""",
                selectors,
            )
            bad = [o for o in overflow if not o.get("missing") and o["over"] > 4]
            check(
                "%s 场景关键容器内容装得下（无溢出裁切/遮盖）" % scene,
                not bad,
                bad or overflow,
            )

        page.click("[data-scene='workbench']")
        page.wait_for_timeout(400)
        assert_static_agent_dialog(page, "workbench-agent", "why-misalign", "诊断工作台 Agent")

        # 3D 视口不得溢出它所在的面板（盖住下方内容）
        page.click("[data-scene='station']")
        page.wait_for_timeout(9000)
        spill = page.evaluate(
            """() => {
                 const panel = document.querySelector('.station-map-panel');
                 const train = panel.querySelector('.pump-train');
                 const pb = panel.getBoundingClientRect().bottom;
                 const tb = train.getBoundingClientRect().bottom;
                 return { panelBottom: Math.round(pb), trainBottom: Math.round(tb),
                          spill: Math.round(tb - pb) };
               }"""
        )
        check(
            "station 的 3D 视口没有溢出所在面板（否则会盖住下方雷达卡）",
            spill["spill"] <= 0,
            spill,
        )

        # ---------------------------------------------------------------
        # 7c. archive 场景（任务 P3-E）：三条结论路径各走一遍真实解锁流程
        #     （workbench -> confirm -> 选结论 -> 执行处置/观察闭环），验证：
        #       - 报告预览卡片数与该结论路径的段数一致（确认不对中 6 段，
        #         继续观察/排除误报各 3 段），且都是 .card-evidence（Cards.evidence）；
        #       - 二次命中卡只在"确认不对中 + 已归档"时进入 unlocked/展示案例号，
        #         其余两条路径归档前后都保持 locked/未解锁；
        #       - .archive-stack 内容装得下（scrollHeight 不显著超过 clientHeight），
        #         写法与 7b 节一致；
        #       - 三档宽度截图，至少覆盖"确认不对中已归档"和"继续观察已归档"两态。
        # ---------------------------------------------------------------
        ARCHIVE_SECTION_COUNT = {"确认不对中": 6, "继续观察": 3, "排除误报": 3}

        for verdict in ["确认不对中", "继续观察", "排除误报"]:
            goto_archive(page, verdict)

            on_archive_scene = page.get_attribute("[data-scene='archive']", "class").find("active") >= 0
            check("结论[%s]：确认闭环动作后已落在 archive 场景" % verdict, on_archive_scene, on_archive_scene)

            entry_count = page.evaluate("() => document.querySelectorAll('.report-panel .card-evidence').length")
            check(
                "结论[%s]：报告预览渲染 %d 张 Cards.evidence 卡片" % (verdict, ARCHIVE_SECTION_COUNT[verdict]),
                entry_count == ARCHIVE_SECTION_COUNT[verdict],
                entry_count,
            )

            # 归档前：任何结论路径的二次命中卡都必须是 locked/未解锁（archived 还是 false）。
            before_reuse = page.evaluate(
                """() => {
                     const panel = document.querySelector('.reuse-panel');
                     return {
                       unlocked: panel.classList.contains('unlocked'),
                       caseId: (panel.querySelector('.case-id') || {}).textContent || '',
                     };
                   }"""
            )
            check(
                "结论[%s]：归档前二次命中卡是 locked，案例号显示未解锁" % verdict,
                not before_reuse["unlocked"] and before_reuse["caseId"] == "未解锁",
                before_reuse,
            )

            # 点击"确认归档"（页头唯一 primary 按钮），archived 语义一行不动，
            # 按钮本身应从"确认归档"变为禁用态的"已归档"。
            page.click("[data-action='archive-report']")
            page.wait_for_timeout(400)
            button_state = page.evaluate(
                """() => {
                     const btn = document.querySelector("[data-action='archive-report']");
                     return { text: btn.textContent, disabled: btn.disabled };
                   }"""
            )
            check(
                "结论[%s]：归档后按钮变为禁用态的“已归档”" % verdict,
                button_state["text"] == "已归档" and button_state["disabled"] is True,
                button_state,
            )

            after_reuse = page.evaluate(
                """() => {
                     const panel = document.querySelector('.reuse-panel');
                     return {
                       unlocked: panel.classList.contains('unlocked'),
                       caseId: (panel.querySelector('.case-id') || {}).textContent || '',
                     };
                   }"""
            )
            matched_case = page.evaluate("() => window.DemoData.reuse().matchedCase")
            if verdict == "确认不对中":
                check(
                    "结论[%s]：归档后二次命中卡解锁，案例号 = %s" % (verdict, matched_case),
                    after_reuse["unlocked"] and after_reuse["caseId"] == matched_case,
                    after_reuse,
                )
                assert_static_agent_dialog(page, "archive-case-agent", "why-similar", "结论[%s]：维修案例 Agent" % verdict)
            else:
                check(
                    "结论[%s]：归档后二次命中卡仍是 locked，不解锁维修案例复用" % verdict,
                    not after_reuse["unlocked"] and after_reuse["caseId"] == "未解锁",
                    after_reuse,
                )
                if verdict == "继续观察":
                    assert_static_agent_dialog(page, "archive-record-agent", "why-no-case", "结论[%s]：归档记录 Agent" % verdict)

            overflow = page.evaluate(
                """() => {
                     const el = document.querySelector('.archive-stack');
                     if (!el) return { missing: true };
                     return { sh: el.scrollHeight, ch: el.clientHeight, over: el.scrollHeight - el.clientHeight };
                   }"""
            )
            check(
                "结论[%s]：.archive-stack 内容装得下（无溢出裁切/遮盖）" % verdict,
                not overflow.get("missing") and overflow["over"] <= 4,
                overflow,
            )

            # 三档宽度截图：至少覆盖"确认不对中已归档"和"继续观察已归档"两态
            # （排除误报路径与继续观察路径结构相同，只截一档留证据即可，不必三档都拍）。
            widths = (1920, 1440, 1280) if verdict in ("确认不对中", "继续观察") else (1920,)
            for width in widths:
                page.set_viewport_size({"width": width, "height": 1080})
                page.wait_for_timeout(500)
                no_scroll = page.evaluate(
                    "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
                )
                check(
                    "结论[%s]：宽度 %d 下 archive 整页不出现纵向滚动条" % (verdict, width),
                    no_scroll,
                    no_scroll,
                )
                page.screenshot(
                    path=str(SHOTS / ("scenes-archive-%s-%d.png" % (verdict, width)))
                )
            page.set_viewport_size({"width": 1920, "height": 1080})

        # ---------------------------------------------------------------
        # 7d. graph 场景（任务 P3-D，阶段三 G2）：整页是一张 ECharts graph 展示卡，
        #     用固定坐标（layout:"none"）而不是力导向，核心要钉住的是：
        #       - 渲染成功（28 节点 / 26 边 / layout none）；
        #       - 确定性：连续两次全新加载页面，节点像素坐标完全一致（这是选固定
        #         坐标而不是力导向的直接收益，力导向做不到这一点）；
        #       - 默认态完全静止：两次 toDataURL() 截屏字节级相同（没有持续动画）；
        #       - 悬停节点播一轮主线流光，一轮播完（> GRAPH_SPINE_EFFECT_MS）自动
        #         关闭，不常驻；
        #       - 点击节点聚焦子图：非邻居 opacity 压到 0.15，画布内浮出详情小卡；
        #         点关闭按钮收起、恢复全亮；
        #       - 离开场景后，流光的收尾定时器被 SceneTimers.clearScene() 清理。
        # ---------------------------------------------------------------
        GRAPH_CHART_ID = "graph-canvas-chart"

        page.click("[data-action='reset-demo']")
        page.wait_for_timeout(300)
        page.click("[data-scene='graph']")
        page.wait_for_timeout(1200)

        graph_option = echarts_option(page, GRAPH_CHART_ID)
        check(
            "graph 场景渲染成功：series[0] 是 28 节点 / 26 边的 graph 系列",
            bool(graph_option)
            and graph_option["series"][0]["type"] == "graph"
            and len(graph_option["series"][0]["data"]) == 28
            and len(graph_option["series"][0]["links"]) == 26,
            {
                "hasOption": bool(graph_option),
                "nodeCount": len(graph_option["series"][0]["data"]) if graph_option else None,
                "edgeCount": len(graph_option["series"][0]["links"]) if graph_option else None,
            },
        )
        check(
            "graph 场景 series[0].layout === \"none\"（固定坐标，非力导向）",
            graph_option["series"][0]["layout"] == "none",
            graph_option["series"][0]["layout"],
        )
        check(
            "graph 场景默认态 series[1].effect.show === false（静止，未交互）",
            graph_option["series"][1]["effect"]["show"] is False,
            graph_option["series"][1]["effect"]["show"],
        )

        # ---- 确定性：连续两次全新加载页面（不是同一个 page 里来回切场景），
        #      同一批节点的像素坐标必须完全一致。这是"固定坐标不用力导向"这条
        #      架构决定换来的可截图回归收益——力导向的初始位置带随机性，做不到。
        sample_ids = ["P-1", "coupling", "doc-misalign-rule", "agent", "doc-p1-report", "P-2"]

        def fresh_load_pixels():
            probe = browser.new_page(viewport={"width": 1920, "height": 1080})
            probe.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
            probe.wait_for_timeout(1800)
            probe.click("[data-scene='graph']")
            probe.wait_for_timeout(1200)
            pixels = [graph_pixel_for_node(probe, node_id) for node_id in sample_ids]
            probe.close()
            return pixels

        pixels_first = fresh_load_pixels()
        pixels_second = fresh_load_pixels()
        check(
            "连续两次全新加载页面后，知识图谱节点像素坐标完全一致（%s）" % ", ".join(sample_ids),
            json.dumps(pixels_first) == json.dumps(pixels_second),
            {"first": pixels_first, "second": pixels_second},
        )

        # ---- 静止时不渲染：两次 canvas.toDataURL() 截屏之间不做任何交互，字节级
        #      完全相同才能证明 ECharts 没有在后台持续跑动画循环（力导向/流光常驻
        #      两种都会导致像素随时间漂移，toDataURL 必然不同）。
        page.wait_for_timeout(1000)
        idle_snapshot_1 = page.evaluate(
            "() => document.querySelector('#%s canvas').toDataURL()" % GRAPH_CHART_ID
        )
        page.wait_for_timeout(1500)
        idle_snapshot_2 = page.evaluate(
            "() => document.querySelector('#%s canvas').toDataURL()" % GRAPH_CHART_ID
        )
        check(
            "图谱静止 1.5s 期间两次 canvas.toDataURL() 字节级完全一致（默认零动画）",
            idle_snapshot_1 == idle_snapshot_2,
            {"lenA": len(idle_snapshot_1), "lenB": len(idle_snapshot_2)},
        )

        # ---- 更直接的证据：toDataURL 只能证明"画面没变"，不能证明"完全没有渲染
        #      循环在跑"（比如某种恰好收敛到同一张画面的循环）。这里直接 hook
        #      window.requestAnimationFrame 数调用次数——静止时应恰好为 0，
        #      而不只是"画面恰好没变"。同时设一个对照组（悬停一次）确认这套计数
        #      机制本身是灵敏的，不是 hook 失效导致的假阴性。
        page.evaluate(
            """() => {
                 window.__rafCount = 0;
                 const raw = window.requestAnimationFrame.bind(window);
                 window.requestAnimationFrame = function (cb) {
                   window.__rafCount += 1;
                   return raw(cb);
                 };
               }"""
        )
        page.wait_for_timeout(3000)
        idle_raf_count = page.evaluate("() => window.__rafCount")
        check(
            "图谱静止 3s 期间 window.requestAnimationFrame 调用次数为 0（不是常驻渲染循环）",
            idle_raf_count == 0,
            idle_raf_count,
        )
        page.evaluate("() => { window.__rafCount = 0; }")
        pt_p1 = graph_page_point(page, "P-1")
        page.mouse.move(pt_p1[0], pt_p1[1])
        page.wait_for_timeout(300)
        raf_after_hover = page.evaluate("() => window.__rafCount")
        check(
            "对照组：悬停一次节点确实会触发 requestAnimationFrame（计数机制本身灵敏，不是恒为 0 的假阴性）",
            raf_after_hover > 0,
            raf_after_hover,
        )
        # 移开鼠标必须**移到画布内的空白处、而且分步移动**，不能瞬移到画布外的 (4, 4)。
        # 这一条踩过：原来是 page.mouse.move(4, 4)，于是 canvas 一个鼠标事件都收不到
        # （实测 zrender 的 mousemove 计数原地不动），zrender 内部记录的"当前悬停元素"
        # 一直指向 P-1 那个节点；等下面再把鼠标移回同一个节点时，它认为悬停对象没有变化，
        # **不会再发一次 mouseover**，于是 scenes/graph.js 的 playSpineEffectOnce() 根本
        # 不会被调用，流光断言恒红。
        #
        # 这是 Playwright 瞬移与真实鼠标的行为差异造成的**测试假红，应用没有问题**：
        # 真人把鼠标从节点移开会在画布内划出一连串中间点，zrender 收到 mousemove 后
        # 会把悬停对象更新掉，再移回来自然会重新发 mouseover。实测对照——分步移到画布
        # 内空白处再分步移回节点，effect.show 正常变 true；换悬停另一个节点也正常。
        #
        # steps=12 是为了产生中间移动事件；终点取画布右下角内侧 30px 的空白处。
        graph_rect = page.evaluate(
            "(id) => { const r = document.getElementById(id).getBoundingClientRect();"
            "          return [r.left, r.top, r.width, r.height]; }",
            GRAPH_CHART_ID,
        )
        blank_x = graph_rect[0] + graph_rect[2] - 30
        blank_y = graph_rect[1] + graph_rect[3] - 30
        page.mouse.move(blank_x, blank_y, steps=12)
        page.wait_for_timeout(3000)

        # ---- 悬停播一轮主线流光，一轮播完自动关闭（"仅交互时播一次"，不常驻）。
        pt_p1 = graph_page_point(page, "P-1")
        page.mouse.move(pt_p1[0], pt_p1[1], steps=12)
        # 用有界轮询而不是"睡固定时长再读一次"：Charts.flush()（core/charts.js）把
        # setOption 放在 requestAnimationFrame 回调里，option 要等下一帧才生效；而 headless
        # 是 swiftshader 纯 CPU 光栅，帧间隔实测 111~333ms 随负载波动，固定睡 250ms 本身
        # 就是一个会随负载红绿摇摆的写法。轮询窗口 1500ms 完全落在流光一轮（2400ms）之内，
        # 不会撞上下面"播完自动关闭"那一步。
        #
        # 轮询本身是必要的，但它当初没能让这条断言变绿——真正的原因是上面那处"瞬移到
        # 画布外"，见那段注释。排查时曾先后错判过两次（先当成 rAF 竞态、又当成坐标算错），
        # 两个假设都被实测推翻：坐标是对的（convertToPixel 与 getItemLayout 给出同一个
        # 像素点），单次悬停 150ms 内就能点亮流光。最终靠"给实例另挂一个 mouseover
        # 计数器"定位——事件计数停在 1，说明第二次悬停压根没有事件，而不是画了没生效。
        option_during_hover = None
        for _ in range(15):
            option_during_hover = echarts_option(page, GRAPH_CHART_ID)
            if option_during_hover["series"][1]["effect"]["show"] is True:
                break
            page.wait_for_timeout(100)
        check(
            "悬停节点后，主线流光 series[1].effect.show 变为 true（≤1500ms 内轮询到）",
            option_during_hover["series"][1]["effect"]["show"] is True,
            option_during_hover["series"][1]["effect"]["show"],
        )
        # 补一条守着上面那个坑本身的断言：给实例另挂一个 mouseover 计数器，确认"分步移开
        # 再移回"这套操作真的产生了**新的** mouseover 事件。只断言 effect.show 变 true
        # 是不够的——如果哪天有人把移开那步又改回瞬移到画布外，effect.show 会恒为 false，
        # 但失败信息看起来像"流光功能坏了"，而不是"测试的鼠标操作方式不对"。
        # 这个计数器让两者可区分：事件数没涨 = 鼠标操作有问题；涨了但 effect 没亮 = 应用有问题。
        mo_count = page.evaluate(
            """(id) => {
                 const inst = window.echarts.getInstanceByDom(document.getElementById(id));
                 window.__moProbe = 0;
                 inst.on("mouseover", function () { window.__moProbe += 1; });
                 return 0;
               }""",
            GRAPH_CHART_ID,
        )
        page.mouse.move(blank_x, blank_y, steps=12)
        page.wait_for_timeout(400)
        page.mouse.move(pt_p1[0], pt_p1[1], steps=12)
        page.wait_for_timeout(400)
        mo_count = page.evaluate("() => window.__moProbe")
        check(
            "分步移开再移回节点会产生新的 mouseover 事件（瞬移到画布外则不会，"
            "zrender 的悬停对象没被清掉——这是这条断言曾经恒红的真正原因）",
            mo_count > 0,
            mo_count,
        )

        effect_period_ms = option_during_hover["series"][1]["effect"]["period"] * 1000
        page.wait_for_timeout(int(effect_period_ms) + 600)
        option_after_hover = echarts_option(page, GRAPH_CHART_ID)
        check(
            "一轮流光播完（> %dms）后 effect.show 自动变回 false（不常驻）" % effect_period_ms,
            option_after_hover["series"][1]["effect"]["show"] is False,
            option_after_hover["series"][1]["effect"]["show"],
        )

        # ---- 点击节点聚焦子图：非邻居 opacity 压到 0.15，浮出画布内详情小卡。
        neighbor_ids = set(["P-1"])
        for link in graph_option["series"][0]["links"]:
            if link["source"] == "P-1":
                neighbor_ids.add(link["target"])
            if link["target"] == "P-1":
                neighbor_ids.add(link["source"])

        page.mouse.move(4, 4)  # 挪开鼠标，避免刚才的悬停状态干扰下面的判定
        page.wait_for_timeout(150)
        page.mouse.click(pt_p1[0], pt_p1[1])
        page.wait_for_timeout(400)

        option_after_click = echarts_option(page, GRAPH_CHART_ID)
        opacities = {d["id"]: d["itemStyle"]["opacity"] for d in option_after_click["series"][0]["data"]}
        dim_ok = all(
            (opacities[node_id] == 1 if node_id in neighbor_ids else opacities[node_id] == 0.15)
            for node_id in opacities
        )
        check(
            "点击 P-1 聚焦子图：非邻居节点 opacity=0.15，邻居/自身保持 1（邻居数=%d）" % len(neighbor_ids),
            dim_ok,
            opacities,
        )

        focus_card_state = page.evaluate(
            """() => {
                 const el = document.querySelector('.graph-focus-card');
                 const conclusion = el ? el.querySelector('.card-evidence-conclusion') : null;
                 return {
                   exists: !!el,
                   hidden: el ? el.hidden : null,
                   text: conclusion ? conclusion.textContent : '',
                 };
               }"""
        )
        check(
            "点击节点后，画布内浮动详情小卡出现且带结论文字",
            focus_card_state["exists"] and not focus_card_state["hidden"] and bool(focus_card_state["text"]),
            focus_card_state,
        )

        page.click(".graph-focus-card-close")
        page.wait_for_timeout(300)
        option_after_close = echarts_option(page, GRAPH_CHART_ID)
        all_full_opacity = all(d["itemStyle"]["opacity"] == 1 for d in option_after_close["series"][0]["data"])
        card_hidden_after_close = page.evaluate(
            "() => { const el = document.querySelector('.graph-focus-card'); return el ? el.hidden : true; }"
        )
        check(
            "点击浮层的关闭按钮后，节点恢复全亮且浮层收起",
            all_full_opacity and card_hidden_after_close,
            {"allFullOpacity": all_full_opacity, "hidden": card_hidden_after_close},
        )

        # ---- 离开场景后，流光的收尾定时器被 SceneTimers.clearScene() 清理，不会
        #      在别的场景里继续跑（残留定时器继续调 render() 是本项目明确要防的一类
        #      bug，见 scripts/core/timers.js 顶部注释）。
        page.mouse.move(pt_p1[0], pt_p1[1])
        page.wait_for_timeout(200)
        page.click("[data-scene='knowledge']")
        page.wait_for_timeout(300)
        active_after_leave = page.evaluate("() => window.SceneTimers.debugInfo().active")
        check(
            "离开图谱场景后，流光收尾定时器被 clearScene 清理（SceneTimers.debugInfo().active === 0）",
            active_after_leave == 0,
            active_after_leave,
        )

        page.click("[data-scene='graph']")
        page.wait_for_timeout(1200)

        # ---- 三档宽度截图：默认态 / 悬停态 / 点击聚焦子图态。
        for width in (1920, 1440, 1280):
            page.set_viewport_size({"width": width, "height": 1080})
            page.wait_for_timeout(500)
            no_scroll = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("graph 场景宽度 %d 下整页不出现纵向滚动条" % width, no_scroll, no_scroll)
            default_option = echarts_option(page, GRAPH_CHART_ID)
            all_full_at_default = all(d["itemStyle"]["opacity"] == 1 for d in default_option["series"][0]["data"])
            check(
                "graph 场景宽度 %d 下默认态没有残留上一档宽度的聚焦/压暗（opacity 全为 1）" % width,
                all_full_at_default,
                {"dimmed": [d["id"] for d in default_option["series"][0]["data"] if d["itemStyle"]["opacity"] != 1]},
            )
            page.screenshot(path=str(SHOTS / ("scenes-graph-default-%d.png" % width)))

            # 每档宽度都要重新取一次坐标：换了视口宽度，图表容器的绝对位置和内部
            # convertToPixel() 的结果都会跟着变。
            pt_agent = graph_page_point(page, "agent")
            page.mouse.move(pt_agent[0], pt_agent[1])
            page.wait_for_timeout(250)
            page.screenshot(path=str(SHOTS / ("scenes-graph-hover-%d.png" % width)))

            page.mouse.move(4, 4)
            page.wait_for_timeout(150)
            page.mouse.click(pt_agent[0], pt_agent[1])
            page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / ("scenes-graph-focus-%d.png" % width)))
            # 收起聚焦态，回到默认视图，进入下一档宽度前保持一致的基准态。
            page.click(".graph-focus-card-close")
            page.wait_for_timeout(300)
        page.set_viewport_size({"width": 1920, "height": 1080})

        # ---------------------------------------------------------------
        # 8. 持久化状态的健壮性（本项目曾在这里翻过一次车，必须钉住）
        #
        # 背景：所有其它断言都从一份干净的 localStorage 起跑，所以"某个能通过
        # normalizeState 清洗、但会让场景渲染直接抛错的持久值"这一整类 bug 完全测不到。
        # 真实事故：pick.overview 被存成 MOT-DE-H（电机主测点）。它是合法测点，
        # 通过了当时按 DemoData.points() 做的清洗，但大屏只有 6 张卡、不含电机，
        # SelectList 的 activeId 校验因此抛错 → renderOverview 中断 → 顶栏还在、
        # stage 和流程条全空，而且状态已落盘、刷新也救不回来。
        # 修法是把字典改成 DemoData.overviewCards() 并升 STORAGE_KEY；这里把它固化成断言。
        # ---------------------------------------------------------------
        cases = [
            ("卡片外的测点 MOT-DE-H", {"pick": {"overview": "MOT-DE-H"}}),
            ("卡片外的测点 SEAL-L", {"pick": {"overview": "SEAL-L"}}),
            ("完全不存在的 id", {"pick": {"overview": "NOPE-XYZ"}}),
            ("focus.partId 非法", {"focus": {"unitId": "P-9", "partId": "nope"}}),
            ("range 非法", {"range": "999d"}),
            ("整块结构缺失", {"pick": None, "focus": None}),
        ]
        for label, patch in cases:
            probe = browser.new_page(viewport={"width": 1600, "height": 1000})
            probe_errors = []
            probe.on("pageerror", lambda e: probe_errors.append(str(e)))
            payload = dict({"scene": "overview", "diagnosisReady": True}, **patch)
            probe.add_init_script(
                "localStorage.setItem(%s, %s)"
                % (json.dumps(STORAGE_KEY), json.dumps(json.dumps(payload)))
            )
            probe.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
            probe.wait_for_timeout(2500)
            kids = probe.evaluate("document.getElementById('stage').childElementCount")
            flow = probe.evaluate("document.getElementById('flowTrack').childElementCount")
            check(
                "持久化状态[%s]：仍能正常渲染（stage 有内容、流程条有步骤、无 pageerror）" % label,
                kids > 0 and flow > 0 and not probe_errors,
                {"stageKids": kids, "flowSteps": flow, "pageerror": probe_errors[:1]},
            )
            probe.close()

        # 缩小时间范围后，原选中的巡检记录可能已不在范围内（记录条数随范围变化：
        # 7d≈7 / 30d≈24 / 90d=40）。这是"某个 pick 值对它自己的语义集合而言已经失效、
        # 却没有人在集合变化时收紧它"的第二个实例——第一个是 pick.overview 存成
        # MOT-DE-H 导致整页空白。这次是运行期路径（range 变了集合缩小），
        # 上次是持久化路径（校验字典用错），两条都必须钉住。
        probe = browser.new_page(viewport={"width": 1600, "height": 1000})
        probe_errors = []
        probe.on("pageerror", lambda e: probe_errors.append(str(e)))
        payload = {
            "scene": "workbench",
            "range": "90d",
            "diagnosisReady": True,
            # 只存在于 90d 的一条老记录（4 月），7d/30d 都不包含它
            "pick": {"overview": "COUP-PH", "workbench": "REC-0424-13"},
        }
        probe.add_init_script(
            "localStorage.setItem(%s, %s)"
            % (json.dumps(STORAGE_KEY), json.dumps(json.dumps(payload)))
        )
        probe.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        probe.wait_for_timeout(2000)
        check(
            "90d 下选中只存在于 90d 的记录：workbench 能正常渲染",
            probe.evaluate("document.getElementById('stage').childElementCount") > 0
            and not probe_errors,
            {"pageerror": probe_errors[:1]},
        )
        # 切到 overview 把范围缩到 7d，再回 workbench —— 此时那条记录已不在集合内
        probe.click("[data-scene='overview']")
        probe.wait_for_timeout(800)
        probe.click(".range-picker summary")
        probe.wait_for_timeout(300)
        probe.click("[data-select='range'][data-select-id='7d']")
        probe.wait_for_timeout(800)
        probe.click("[data-scene='workbench']")
        probe.wait_for_timeout(1500)
        kids = probe.evaluate("document.getElementById('stage').childElementCount")
        active = probe.evaluate(
            "() => { var el = document.querySelector(\"[data-select='workbench-record'].active\");"
            " return el ? el.getAttribute('data-select-id') : null; }"
        )
        check(
            "缩小时间范围后 pick.workbench 被收紧到范围内最近一条，workbench 不崩",
            kids > 0 and not probe_errors and active is not None and active != "REC-0424-13",
            {"stageKids": kids, "activeRecord": active, "pageerror": probe_errors[:1]},
        )
        probe.close()

        # 旧版本 key 里的坏状态必须被整体丢弃，而不是被继承成一份半新半旧的变形状态
        for old_key in OLD_STORAGE_KEYS:
            probe = browser.new_page(viewport={"width": 1600, "height": 1000})
            probe_errors = []
            probe.on("pageerror", lambda e: probe_errors.append(str(e)))
            probe.add_init_script(
                "localStorage.setItem(%s, %s)"
                % (json.dumps(old_key), json.dumps(json.dumps({"pick": {"overview": "MOT-DE-H"}})))
            )
            probe.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
            probe.wait_for_timeout(2500)
            kids = probe.evaluate("document.getElementById('stage').childElementCount")
            check(
                "旧 STORAGE_KEY[%s] 里的坏状态被整体丢弃" % old_key,
                kids > 0 and not probe_errors,
                {"stageKids": kids, "pageerror": probe_errors[:1]},
            )
            probe.close()

        # ---------------------------------------------------------------
        # 9. knowledge 场景（阶段三 G2 重写）：分类过滤文档列表、文档浮层开关+
        #    下载链接、入库动画状态机推进到底、离场定时器清理、Agent 引用卡片
        #    联动、min(总数, displayCap) 展示上限的纯函数分支。
        #
        #    读 pick.knowledge.ingestStep 时用 window.AppState.STORAGE_KEY（运行期
        #    真值）而不是本脚本顶部的 STORAGE_KEY 常量——那个常量目前还是
        #    "pump-demo-v6-state"，落后于 scripts/core/state.js 实际使用的
        #    "pump-demo-v7-state" 一个版本（阶段三 G1 升级 pick.knowledge 字典校验时
        #    升的 key，这份脚本没有同步改，是本任务之外发现的既有问题，已在任务报告
        #    里点名，这里不顺手改掉，只是绕开它读到真实的值）。
        # ---------------------------------------------------------------
        page.click("[data-action='reset-demo']")
        page.wait_for_timeout(300)
        page.click("[data-scene='knowledge']")
        page.wait_for_timeout(500)

        # 9a. 分类 -> 文档列表过滤：切到 cat-metric，文档列表应恰好是该分类下的文档
        #     （与 DemoData.kbDocuments('cat-metric') 的 id 集合完全一致，不多不少）。
        page.click("[data-select='kb-category'][data-select-id='cat-metric']")
        page.wait_for_timeout(300)
        doc_ids_in_list = page.evaluate(
            "() => [...document.querySelectorAll('.kb-doc-item')].map(el => el.getAttribute('data-select-id'))"
        )
        expected_doc_ids = page.evaluate("() => window.DemoData.kbDocuments('cat-metric').map(d => d.id)")
        check(
            "选中分类 cat-metric 后，文档列表恰好是该分类下的文档",
            doc_ids_in_list == expected_doc_ids,
            {"list": doc_ids_in_list, "expected": expected_doc_ids},
        )

        no_rag_before_upload = page.evaluate("() => document.querySelectorAll('.rag-chunk').length === 0")
        check("knowledge 主页面常态不渲染 RAG chunk 动画节点", no_rag_before_upload, no_rag_before_upload)

        # 9b. 点文档条目：居中文档阅读器打开且内容正确（标题、可视化 chunk、带下载链接），
        #     关闭后浮层收起；仅摘要文档（body 为 null）不应该出现下载链接。
        page.click("[data-action='open-doc'][data-select-id='doc-vibration-threshold']")
        page.wait_for_timeout(300)
        overlay_state = page.evaluate(
            """() => {
                 const panel = document.querySelector('.kb-doc-overlay');
                 const layer = panel ? panel.closest('.overlay-layer') : null;
                 const title = panel ? panel.querySelector('.overlay-title') : null;
                 return {
                   open: layer ? layer.classList.contains('open') : false,
                   title: title ? title.textContent : '',
                   hasDownload: !!document.querySelector('.kb-doc-download'),
                   reader: !!document.querySelector('.kb-doc-reader'),
                   chunks: document.querySelectorAll('.kb-doc-chunk-card').length,
                   focusInside: panel ? panel.contains(document.activeElement) : false,
                 };
               }"""
        )
        expected_title = page.evaluate("() => window.DemoData.kbDocument('doc-vibration-threshold').title")
        check(
            "点文档条目 doc-vibration-threshold：居中阅读器打开、标题正确、带下载链接和可视化 chunk",
            overlay_state["open"]
            and overlay_state["title"] == expected_title
            and overlay_state["hasDownload"]
            and overlay_state["reader"]
            and overlay_state["chunks"] > 0
            and overlay_state["focusInside"],
            overlay_state,
        )
        doc_overlay_box = page.evaluate(
            """() => {
                 const panel = document.querySelector('.kb-doc-overlay');
                 const rect = panel.getBoundingClientRect();
                 const shellRect = document.querySelector('.app-shell').getBoundingClientRect();
                 const widthRatio = rect.width / shellRect.width;
                 const centerDelta = Math.abs((rect.left + rect.width / 2) - (shellRect.left + shellRect.width / 2));
                 return {
                   width: Math.round(rect.width),
                   shellWidth: Math.round(shellRect.width),
                   widthRatio: Number(widthRatio.toFixed(3)),
                   centerDelta: Math.round(centerDelta),
                   hasWideClass: panel.classList.contains('overlay-wide'),
                   hasAgentClass: panel.classList.contains('agent-dialog'),
                 };
               }"""
        )
        check(
            "知识库文档阅读器是居中宽弹窗，未被 Agent side sheet 样式带偏",
            doc_overlay_box["hasWideClass"]
            and not doc_overlay_box["hasAgentClass"]
            and 0.5 <= doc_overlay_box["widthRatio"] <= 0.62
            and doc_overlay_box["centerDelta"] <= 8,
            doc_overlay_box,
        )
        download_href = page.evaluate(
            "() => { const a = document.querySelector('.kb-doc-download'); return a ? a.getAttribute('href') : null; }"
        )
        check(
            "文档下载链接是原生 <a href=\"blob:...\" download>（不经过任何 data-action 委托）",
            bool(download_href) and download_href.startswith("blob:"),
            download_href,
        )

        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        overlay_closed = page.evaluate(
            """() => {
                 const panel = document.querySelector('.kb-doc-overlay');
                 const layer = panel ? panel.closest('.overlay-layer') : null;
                 return !layer || !layer.classList.contains('open');
               }"""
        )
        check("关闭文档阅读器后对应 overlay-layer 不再带 open 类", overlay_closed, overlay_closed)

        page.click("[data-action='open-doc'][data-select-id='doc-temperature-threshold']")
        page.wait_for_timeout(300)
        summary_only_no_download = page.evaluate(
            "() => !document.querySelector('.kb-doc-download') && !!document.querySelector('.kb-doc-disabled-download')"
        )
        check("仅摘要文档（body 为 null）不渲染下载链接，并展示不可下载提示", summary_only_no_download, summary_only_no_download)
        page.click("button[data-action='close-doc']")
        page.wait_for_timeout(300)

        # 9c. 入库动画：点击"上传文档"后打开居中弹窗，ingestStep 立即变 1（此时恰好
        #     1 个 persist 定时器在跑），6.2 秒后自动推进到 kbIngestionSteps().length；
        #     关闭/离场时定时器和弹窗打开态都不应该残留。
        page.click("[data-action='start-ingest']")
        page.wait_for_timeout(200)
        ingest_after_click = page.evaluate(
            """() => {
                 const stored = JSON.parse(localStorage.getItem(window.AppState.STORAGE_KEY)).pick.knowledge;
                 const panel = document.querySelector('.kb-ingest-overlay');
                 const layer = panel ? panel.closest('.overlay-layer') : null;
                 const rect = panel.getBoundingClientRect();
                 const shellRect = document.querySelector('.app-shell').getBoundingClientRect();
                 const widthRatio = rect.width / shellRect.width;
                 const centerDelta = Math.abs((rect.left + rect.width / 2) - (shellRect.left + shellRect.width / 2));
                 return {
                   ingestStep: stored.ingestStep,
                   ingestOpen: stored.ingestOpen,
                   open: layer ? layer.classList.contains('open') : false,
                   widthRatio: Number(widthRatio.toFixed(3)),
                   centerDelta: Math.round(centerDelta),
                   focusInside: panel ? panel.contains(document.activeElement) : false,
                   headerCloseDisabled: !!panel.querySelector(".overlay-head .tool-btn[disabled]"),
                   headerCloseAction: panel.querySelector(".overlay-head .tool-btn") ? panel.querySelector(".overlay-head .tool-btn").getAttribute("data-action") : null,
                   maskCloseAction: panel.closest(".overlay-layer").querySelector(".overlay-mask").getAttribute("data-action"),
                 };
               }"""
        )
        check(
            "点击上传文档：居中入库弹窗打开，ingestStep 立即变为 1",
            ingest_after_click["ingestStep"] == 1
            and ingest_after_click["ingestOpen"]
            and ingest_after_click["open"]
            and 0.48 <= ingest_after_click["widthRatio"] <= 0.58
            and ingest_after_click["centerDelta"] <= 8
            and ingest_after_click["focusInside"]
            and ingest_after_click["headerCloseDisabled"]
            and ingest_after_click["headerCloseAction"] is None
            and ingest_after_click["maskCloseAction"] is None,
            ingest_after_click,
        )
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        ingest_still_open_after_escape = page.evaluate(
            """() => {
                 const stored = JSON.parse(localStorage.getItem(window.AppState.STORAGE_KEY)).pick.knowledge;
                 const panel = document.querySelector('.kb-ingest-overlay');
                 return {
                   ingestStep: stored.ingestStep,
                   ingestOpen: stored.ingestOpen,
                   open: panel.closest('.overlay-layer').classList.contains('open'),
                 };
               }"""
        )
        check(
            "入库动画处理中按 Escape 不关闭上传弹窗",
            ingest_still_open_after_escape["ingestStep"] == 1
            and ingest_still_open_after_escape["ingestOpen"]
            and ingest_still_open_after_escape["open"],
            ingest_still_open_after_escape,
        )

        chunk_boxes = page.evaluate("() => document.querySelectorAll('.rag-chunk').length")
        expected_chunks = page.evaluate("() => window.DemoData.kbIngestPlan('doc-align-card').displayChunks")
        check(
            "入库动画渲染的 chunk 方块数 === kbIngestPlan(docId).displayChunks",
            chunk_boxes == expected_chunks and chunk_boxes > 0,
            {"rendered": chunk_boxes, "expected": expected_chunks},
        )

        timers_mid_anim = page.evaluate("() => window.SceneTimers.debugInfo().active")
        check("入库动画进行中，恰好有 1 个 persist 定时器在跑", timers_mid_anim == 1, timers_mid_anim)

        reload_probe = browser.new_page(viewport={"width": 1600, "height": 1000})
        reload_errors = []
        reload_probe.on("pageerror", lambda e: reload_errors.append(str(e)))
        reload_probe.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        reload_probe.wait_for_timeout(2500)
        reload_state = reload_probe.evaluate(
            """() => {
                 const stored = window.AppState.value.pick.knowledge;
                 const panel = document.querySelector('.kb-ingest-overlay');
                 return {
                   ingestStep: stored.ingestStep,
                   ingestOpen: stored.ingestOpen,
                   open: panel ? panel.closest('.overlay-layer').classList.contains('open') : false,
                   pageerror: [],
                 };
               }"""
        )
        reload_state["pageerror"] = reload_errors[:1]
        check(
            "入库动画处理中刷新页面：瞬时入库态被回收到未开始，避免无定时器卡死",
            reload_state["ingestStep"] == 0
            and not reload_state["ingestOpen"]
            and not reload_state["open"]
            and not reload_state["pageerror"],
            reload_state,
        )
        reload_probe.close()

        page.wait_for_timeout(6400)
        step_len = page.evaluate("() => window.DemoData.kbIngestionSteps().length")
        ingest_after_wait = page.evaluate(
            """() => {
                 const stored = JSON.parse(localStorage.getItem(window.AppState.STORAGE_KEY)).pick.knowledge;
                 return {
                   ingestStep: stored.ingestStep,
                   ingestOpen: stored.ingestOpen,
                   closeVisible: !!document.querySelector(".kb-ingest-overlay button[data-action='close-ingest']"),
                 };
               }"""
        )
        check(
            "6.2 秒后 ingestStep 自动推进到 kbIngestionSteps().length（%d）" % step_len,
            ingest_after_wait["ingestStep"] == step_len
            and ingest_after_wait["ingestOpen"]
            and ingest_after_wait["closeVisible"],
            ingest_after_wait,
        )
        timers_after_finish = page.evaluate("() => window.SceneTimers.debugInfo().active")
        check("入库动画结束后 persist 定时器已自动从注册表摘除", timers_after_finish == 0, timers_after_finish)

        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        ingest_after_close = page.evaluate(
            """() => {
                 const stored = JSON.parse(localStorage.getItem(window.AppState.STORAGE_KEY)).pick.knowledge;
                 const panel = document.querySelector('.kb-ingest-overlay');
                 const layer = panel ? panel.closest('.overlay-layer') : null;
                 return {
                   ingestStep: stored.ingestStep,
                   ingestOpen: stored.ingestOpen,
                   open: layer ? layer.classList.contains('open') : false,
                   ragChunks: document.querySelectorAll('.rag-chunk').length,
                 };
               }"""
        )
        check(
            "关闭完成态上传弹窗后：ingestOpen=false，弹窗关闭，主页面仍无常驻 RAG chunk",
            ingest_after_close["ingestStep"] == step_len
            and not ingest_after_close["ingestOpen"]
            and not ingest_after_close["open"]
            and ingest_after_close["ragChunks"] == 0,
            ingest_after_close,
        )

        # 再跑一轮但在动画进行中就切场景：定时器必须被 clearScene() 清理，不残留到别的场景。
        page.click("[data-action='start-ingest']")
        page.wait_for_timeout(300)
        page.dispatch_event("[data-scene='overview']", "click")
        page.wait_for_timeout(300)
        timers_after_leave = page.evaluate("() => window.SceneTimers.debugInfo().active")
        ingest_open_after_leave = page.evaluate(
            "() => JSON.parse(localStorage.getItem(window.AppState.STORAGE_KEY)).pick.knowledge.ingestOpen"
        )
        check(
            "动画进行中切离 knowledge 场景：定时器清理且 ingestOpen=false",
            timers_after_leave == 0 and not ingest_open_after_leave,
            {"timers": timers_after_leave, "ingestOpen": ingest_open_after_leave},
        )

        # 9d. Agent 静态弹窗：知识库右栏只提供入口；问一个预设问题后展示静态命中标签，
        #     标签不可点击、不带文档跳转属性。
        page.click("[data-scene='knowledge']")
        page.wait_for_timeout(400)
        page.click("[data-action='open-agent-dialog'][data-agent-dialog-id='knowledge-agent']")
        page.wait_for_timeout(300)
        dialog_open = page.evaluate(
            """() => {
                 const dialog = document.querySelector('.agent-dialog');
                 return !!dialog && dialog.closest('.overlay-layer').classList.contains('open');
               }"""
        )
        check("点击知识库 Agent 入口后打开 AgentDialog", bool(dialog_open), dialog_open)

        knowledge_dialog_box = page.evaluate(
            """() => {
                 const dialog = document.querySelector('.agent-dialog');
                 const rect = dialog.getBoundingClientRect();
                 const shellRect = document.querySelector('.app-shell').getBoundingClientRect();
                 const widthRatio = rect.width / shellRect.width;
                 return {
                   width: Math.round(rect.width),
                   height: Math.round(rect.height),
                   shellWidth: Math.round(shellRect.width),
                   shellHeight: Math.round(shellRect.height),
                   widthRatio: Number(widthRatio.toFixed(3)),
                   rightGap: Math.round(shellRect.right - rect.right),
                   docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
                 };
               }"""
        )
        check(
            "知识库 AgentDialog 是右侧半屏 side sheet",
            0.46 <= knowledge_dialog_box["widthRatio"] <= 0.5
            and knowledge_dialog_box["height"] >= knowledge_dialog_box["shellHeight"] * 0.94
            and 0 <= knowledge_dialog_box["rightGap"] <= 16
            and knowledge_dialog_box["docScroll"] <= 1,
            knowledge_dialog_box,
        )

        page.click("[data-agent-question-id='misalign-rule']")
        page.wait_for_timeout(300)
        hit_probe = page.evaluate(
            """() => {
                 const hits = [...document.querySelectorAll('.agent-dialog-hit')];
                 return {
                   count: hits.length,
                   labels: hits.map((el) => el.textContent.trim()),
                   clickable: hits.some((el) => el.tagName === 'BUTTON' || el.hasAttribute('data-action') || el.hasAttribute('data-select-id')),
                   docOverlayOpen: !!document.querySelector('.kb-doc-overlay') && document.querySelector('.kb-doc-overlay').closest('.overlay-layer').classList.contains('open')
                 };
               }"""
        )
        check(
            "选择知识库预设问题后展示不可点击命中标签",
            hit_probe["count"] >= 2 and not hit_probe["clickable"] and not hit_probe["docOverlayOpen"],
            hit_probe,
        )
        page.click("button[data-action='close-agent-dialog']")
        page.wait_for_timeout(300)

        # 9e. min(总数, displayCap) 展示上限：当前数据集里没有任何文档的 chunk 数超过
        #     displayCap=12（单文档最多 6 段），因此"总数超过上限"这条分支在真实用户
        #     操作路径里永远触发不到，只能直接单测 scripts/scenes/knowledge.js 导出
        #     的纯函数本身（window.Scenes.knowledgeIngestCaptionText），用合成的
        #     plan 对象覆盖"超过上限"和"未超过上限"两种分支。
        caption_capped = page.evaluate(
            "() => window.Scenes.knowledgeIngestCaptionText({ totalChunks: 21, displayChunks: 12, displayCap: 12 })"
        )
        caption_uncapped = page.evaluate(
            "() => window.Scenes.knowledgeIngestCaptionText({ totalChunks: 6, displayChunks: 6, displayCap: 12 })"
        )
        check("总数超过展示上限时，文案标注“展示前 N 段”", caption_capped == "共 21 段，展示前 12 段", caption_capped)
        check("总数未超过展示上限时，文案只说“共 N 段”，不提展示上限", caption_uncapped == "共 6 段", caption_uncapped)

        # 9f. 三档宽度截图：分类+文档列表态、入库动画中间态、动画完成态、文档浮层打开态。
        page.click("[data-action='reset-demo']")
        page.wait_for_timeout(300)
        page.click("[data-scene='knowledge']")
        page.wait_for_timeout(500)
        for width in (1920, 1440, 1280):
            page.set_viewport_size({"width": width, "height": 1080})
            page.wait_for_timeout(500)
            no_scroll = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("knowledge 场景宽度 %d 下整页不出现纵向滚动条（分类+文档列表态）" % width, no_scroll, no_scroll)
            page.screenshot(path=str(SHOTS / ("scenes-knowledge-list-%d.png" % width)))

            page.click("[data-action='start-ingest']")
            page.wait_for_timeout(2600)
            no_scroll_mid = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("knowledge 场景宽度 %d 下整页不出现纵向滚动条（上传弹窗动画中间态）" % width, no_scroll_mid, no_scroll_mid)
            page.screenshot(path=str(SHOTS / ("scenes-knowledge-ingest-mid-%d.png" % width)))
            # 6.2 秒时 boot.js 的 persist 定时器会触发第二次整体 render()（全新 DOM），
            # CSS 动画因此从头重播一轮——这是"总共 2 次 render，不是 6 次"这条硬约束
            # 接受的已知代价（见 styles/12-knowledge.css 顶部大注释）。这里多等一轮
            # 完整播放期，截到的才是真正"沉降完成"的终态，不是重播过程中的过渡帧。
            page.wait_for_timeout(10600)
            no_scroll_done = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("knowledge 场景宽度 %d 下整页不出现纵向滚动条（上传弹窗动画完成态）" % width, no_scroll_done, no_scroll_done)
            page.screenshot(path=str(SHOTS / ("scenes-knowledge-ingest-done-%d.png" % width)))
            page.click(".kb-ingest-overlay button[data-action='close-ingest']")
            page.wait_for_timeout(300)

            # doc-align-card 属于 cat-template（作业模板），不在默认展示的第一个分类
            # （cat-standard）下——先切分类，否则这个按钮根本不在当前文档列表里。
            page.click("[data-select='kb-category'][data-select-id='cat-template']")
            page.wait_for_timeout(300)
            page.click("[data-action='open-doc'][data-select-id='doc-align-card']")
            page.wait_for_timeout(400)
            no_scroll_overlay = page.evaluate(
                "() => document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1"
            )
            check("knowledge 场景宽度 %d 下整页不出现纵向滚动条（文档浮层打开态）" % width, no_scroll_overlay, no_scroll_overlay)
            page.screenshot(path=str(SHOTS / ("scenes-knowledge-doc-overlay-%d.png" % width)))
            page.click("button[data-action='close-doc']")
            page.wait_for_timeout(300)

            page.click("[data-action='reset-demo']")
            page.wait_for_timeout(300)
            page.click("[data-scene='knowledge']")
            page.wait_for_timeout(500)
        page.set_viewport_size({"width": 1920, "height": 1080})

        browser.close()

    print("")
    if failures:
        print("FAILED（%d 项失败 / 共 %d 项断言）：" % (len(failures), checked))
        for f in failures:
            print("  " + f)
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言）" % checked)
    print("截图目录：%s" % SHOTS)


main()
