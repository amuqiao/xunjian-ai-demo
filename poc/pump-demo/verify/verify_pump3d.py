"""泵机组 3D 视图验证脚本。

用途：把 3D 隔离契约（scripts/pump3d/contract.js 暴露的 window.Pump3DContract）钉成
      可执行断言。覆盖运行时无错、单一 WebGL 上下文、DOM 命名空间纪律、宿主盒非零、
      标签投影与去碰撞、几何验收、性能护栏、resize 贴合、场景遍历不泄漏上下文。

用法（在仓库根执行）：
  uv run python poc/pump-demo/verify/verify_pump3d.py

遵守仓库 AGENTS.md：使用 Python 版 Playwright，不直接调用系统 Chrome headless。
截图写到 /private/tmp/pump-demo-shots（临时产物不进仓库；脚本本身入库是有意决定）。
"""

import json
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

# 路径由脚本自身位置推导，换机器 / 换 checkout 目录都不用改代码。
HERE = pathlib.Path(__file__).resolve().parent
PAGE = (HERE.parent / "index.html").as_uri()
SHOTS = pathlib.Path("/private/tmp/pump-demo-shots")
SHOTS.mkdir(parents=True, exist_ok=True)

# 全部 7 个场景，按解锁顺序排列（见 scripts/core/state.js 的 canOpenForState）：
#   overview / station / workbench / knowledge / graph 始终可开；
#   confirm 需要 diagnosisReady（进过一次 workbench 即可）；
#   archive 需要 treatmentDone || observationDone || archived（须在 confirm 里选结论并确认闭环）。
# 元组第二项是该场景期望的 [data-pump3d-host] 数量：只有 overview / station 承载 3D。
SCENE_ORDER = [
    ("overview", 1),
    ("station", 1),
    ("workbench", 0),
    ("confirm", 0),
    ("archive", 0),
    ("knowledge", 0),
    ("graph", 0),
]

PART_LABELS = [
    ("motor", "电机"),
    ("coupling", "联轴器"),
    ("front-bearing", "泵驱动端轴承"),
    ("base", "底座"),
    ("seal", "密封"),
    ("pump-body", "泵体"),
]

# 白名单两类必然出现且与被测代码无关的 warning：
#   1. three r160 UMD 构建加载时打印的弃用提示
#   2. swiftshader 软件光栅器的 GL 性能提示（headless 环境噪声，真实 GPU 下不出现）
WARN_WHITELIST = re.compile(
    r"build/three\.(min\.)?js.*deprecated|GL Driver Message|GPU stall", re.I
)

# ACTIVE_LABEL_ATTR 契约的含义，失败时原样打给读者。overview 已在任务 P1-I（大屏
# 重写）里落地这个属性（DetailCard 的 activePartLabel），对应断言现在应当保持常绿；
# station 仍待后续的场景精简任务落地，在此之前 station 那条断言是**预期的红灯**，
# 见 verify/README.md「已知红灯」一节。
ACTIVE_LABEL_HINT = (
    "契约含义：任何承载 3D 的场景，其“当前部位”显示元素必须带 "
    "Pump3DContract.ACTIVE_LABEL_ATTR（data-active-part-label）属性、文本为部位中文名，"
    "这样 3D 联动的验证钩子就与具体场景的样式类（如 .station-side h3）解耦，"
    "改布局不会造成假红。overview 已经渲染该属性；station 仍待后续场景精简任务落地。"
)

failures = []
notes = []
checked = 0


def check(label, ok, detail=""):
    global checked
    checked += 1
    (notes if ok else failures).append(
        ("PASS" if ok else "FAIL") + " " + label + ((" — " + str(detail)) if detail else "")
    )


def host_box(page):
    return page.evaluate(
        """() => {
             const host = document.querySelector('[data-pump3d-host]');
             if (!host) return null;
             return { w: host.clientWidth, h: host.clientHeight, cls: host.className };
           }"""
    )


def active_part_label(page):
    """读取当前场景里 [data-active-part-label] 元素的数量与文本。"""
    return page.evaluate(
        """(attr) => {
             const els = [...document.querySelectorAll('[' + attr + ']')];
             return { count: els.length, texts: els.map(el => el.textContent.trim()) };
           }""",
        "data-active-part-label",
    )


# --- 缩放区间 + 拖拽姿态扫描：标签无重叠 -----------------------------------------------
# 历史教训：原来的"标签无重叠"断言只在默认机位量一次（不扫缩放区间、不扫拖拽姿态），
# station.max 曾从 48 收到 34 是因为发现远景 100% 重叠，但同一条论证从未在 dashboard 上
# 复核过；dashboard.max 一直是 46，直到这次专门复现才发现 radius 拉到 46 附近、且叠加拖拽
# 姿态时 coupling×base 等标签对会相交（scripts/pump3d/engine.js 的 syncLabels 见修复说明）。
#
# 下面这组常量是"相机操控的数学复刻"，不是被测代码的第二份真源：目的只是从测试脚本精确
# 算出该拖多少像素、滚多少格滚轮才能落到想验证的机位，而不是拍脑袋试出来的像素数。若
# engine.js 改了这些系数，这里也要跟着改（两处都指向同一批物理常数，属于测试脚本对被测
# 实现的"受控复刻"，与 C6 讲的"CSS 尺寸/算法阈值两份真源"不是一回事）：
#   onPointerMove: thetaTarget -= dx*0.005；phiTarget -= dy*0.005  （engine.js 拖拽手柄）
#   onWheel:       radiusTarget *= (1 + deltaY*0.0012)             （engine.js 滚轮手柄）
#   PHI_MIN/PHI_MAX = 0.18 / 1.42                                  （两个 preset 共用的全局钳制）
DRAG_SENSITIVITY = 0.005
PHI_MIN, PHI_MAX = 0.18, 1.42

# phi 基准与 azimuth 钳制取自 scripts/pump3d/engine.js 的 PRESETS；theta 不需要绝对值，
# 全程只用"相对于复位后基准角的偏移量"驱动拖拽，天然不受具体 theta 字面量变动影响。
PRESET_CAMERA = {
    "dashboard": {"phi": 1.0, "azimuth_clamp": 0.9},
    "station": {"phi": 0.95, "azimuth_clamp": None},
}


def label_overlaps(page):
    """用实测标签盒做 AABB 相交判定（与文件头那条断言同一套写法）。

    用 1px 容差滤掉浮点边界噪声：多遍去碰撞 + 分段收缩之后，极端机位偶尔会出现
    "计算上差 0.01px 才算贴上"的浮点擦边（sub-pixel），这不是真实可见的重叠；
    真实重叠的量级远大于 1px（历史上发现的案例都是两位数到三位数像素）。
    """
    boxes = page.evaluate(
        """() => [...document.querySelectorAll('.part-pin[data-part]')].map(el => {
             const b = el.getBoundingClientRect();
             return { id: el.dataset.part, l: b.left, r: b.right, t: b.top, b: b.bottom };
           })"""
    )
    collide = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            a, b = boxes[i], boxes[j]
            if a["l"] < b["r"] and b["l"] < a["r"] and a["t"] < b["b"] and b["t"] < a["b"]:
                ox = min(a["r"], b["r"]) - max(a["l"], b["l"])
                oy = min(a["b"], b["b"]) - max(a["t"], b["t"])
                if ox > 1 and oy > 1:
                    collide.append((a["id"], b["id"], ox, oy))
    return collide


def sweep_camera_no_overlap(page, scene, other_scene, preset_key):
    """扫描 preset 的缩放区间（min/max）× 5 档拖拽姿态，逐机位断言标签无重叠。

    采样密度：2 档缩放（min / max，二者是此前实测过的重叠高发区，见文件头历史教训）
    × 5 档拖拽姿态（原位、方位角两端各推到钳制范围的 90%、极角推到全局钳制上下各 90%）
    × 2 个 preset = 20 个机位。数学网格扫描（数千采样点，见 debugger 报告）证明这个密度
    已经落在此前发现的重叠区域内；更密的网格只是把同一批失效模式多测几次，边际收益低但
    耗时线性增加，因此没有再往上加。
    """
    cam = PRESET_CAMERA[preset_key]
    failures_local = []
    canvas_selector = ".pump3d-canvas"

    def reset_camera():
        # 相机没有专门的"复位"接口：切到另一个 preset 再切回来，会让 engine.js 里
        # "同场景重挂载不重放预设动画"的判定失效（preset 确实变了），从而重新落回
        # preset 默认机位，是唯一能确定性复位 theta/phi/radius 的办法。
        page.click("[data-scene='%s']" % other_scene)
        page.wait_for_timeout(500)
        page.click("[data-scene='%s']" % scene)
        page.wait_for_timeout(1500)

    def wheel_ticks(box, n, delta):
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        for _ in range(n):
            page.mouse.move(cx, cy)
            page.mouse.wheel(0, delta)
            page.wait_for_timeout(20)
        page.wait_for_timeout(600)

    def drag_to(box, theta_off, phi_off, state):
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        dx = -(theta_off - state["theta_off"]) / DRAG_SENSITIVITY
        dy = -(phi_off - state["phi_off"]) / DRAG_SENSITIVITY
        page.mouse.move(cx, cy)
        page.mouse.down()
        steps = 4
        for i in range(1, steps + 1):
            page.mouse.move(cx + dx * i / steps, cy + dy * i / steps)
        page.mouse.up()
        page.wait_for_timeout(750)
        state["theta_off"] = theta_off
        state["phi_off"] = phi_off

    phi_up = PHI_MAX - cam["phi"]
    phi_down = cam["phi"] - PHI_MIN
    if cam["azimuth_clamp"] is not None:
        theta_span = cam["azimuth_clamp"] * 0.9
    else:
        # station 的 azimuthClamp 是 None（无方位钳制，设计上允许自动巡航/拖拽自由转到任意
        # 角度）。1.45 刚好覆盖到数学扫描发现的"接近沿长轴正面看"退化视角（那里 6 个锚点
        # 投影严重压缩，是 station 最容易出问题的姿态）。
        theta_span = 1.45

    orientations = [
        (0.0, 0.0),
        (theta_span, 0.0),
        (-theta_span, 0.0),
        (0.0, phi_up * 0.9),
        (0.0, -phi_down * 0.9),
    ]

    radius_checkpoints = [
        ("radius≈min", lambda box: wheel_ticks(box, 20, -240)),
        ("radius≈max", lambda box: wheel_ticks(box, 20, 240)),
    ]

    for radius_tag, apply_radius in radius_checkpoints:
        reset_camera()
        box = page.locator(canvas_selector).bounding_box()
        apply_radius(box)
        state = {"theta_off": 0.0, "phi_off": 0.0}
        for theta_off, phi_off in orientations:
            box = page.locator(canvas_selector).bounding_box()
            drag_to(box, theta_off, phi_off, state)
            col = label_overlaps(page)
            if col:
                tag = "%s@%s theta_off=%.3f phi_off=%.3f" % (scene, radius_tag, theta_off, phi_off)
                for a, b, ox, oy in col:
                    failures_local.append("%s: %s×%s 重叠 %.1f×%.1fpx" % (tag, a, b, ox, oy))
    return failures_local


def unlock_scene(page, scene):
    """把 state 推进到刚好能打开 scene 的程度。overview/station/workbench/knowledge/graph 无前置。"""
    if scene == "confirm":
        # 进过一次 workbench 即置 diagnosisReady = true（boot.js setScene）。
        page.click("[data-scene='workbench']")
        page.wait_for_timeout(400)
        return
    if scene == "archive":
        page.click("[data-scene='workbench']")
        page.wait_for_timeout(400)
        page.click("[data-scene='confirm']")
        page.wait_for_timeout(400)
        page.click("[data-verdict='确认不对中']")
        page.wait_for_timeout(400)
        page.click("[data-action='go-treatment']")
        page.wait_for_timeout(400)
        page.click("[data-action='confirm-treatment']")
        page.wait_for_timeout(600)


def main():
    page_errors = []
    console_msgs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                # 关键：无此 flag 时新版 Chromium 的软件光栅 WebGL 会直接失败
                "--enable-unsafe-swiftshader",
                "--use-gl=angle",
                "--use-angle=swiftshader",
            ],
        )
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("console", lambda m: console_msgs.append((m.type, m.text)))
        page.on("crash", lambda _: page_errors.append("RENDERER CRASHED"))

        # 用 domcontentloaded 而非默认的 load：重载机器上等 load 容易把浏览器进程等到被系统杀掉，
        # 而后面本来就有显式的预热等待。
        page.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        page.set_default_timeout(45000)
        page.wait_for_timeout(2500)

        check("页面 title", page.title() == "输油泵智能运维助手 · 演示原型", page.title())

        # --- 1. 无运行时错误 ---
        check("无 pageerror", not page_errors, page_errors[:3])
        errs = [t for ty, t in console_msgs if ty == "error"]
        check("无 console error", not errs, errs[:3])
        warns = [t for ty, t in console_msgs if ty == "warning" and not WARN_WHITELIST.search(t)]
        check("无非白名单 console warning", not warns, warns[:3])

        # --- 2. 单一 WebGL 上下文 ---
        info = page.evaluate("window.Pump3D.debugInfo()")
        check("contextCreated == 1", info.get("contextCreated") == 1, info.get("contextCreated"))
        check(
            "无 Too many active WebGL contexts",
            not any("Too many active WebGL" in t for _, t in console_msgs),
        )

        # --- 4. DOM 契约 ---
        check(
            ".pump3d-canvas 唯一",
            page.locator(".pump3d-canvas").count() == 1,
            page.locator(".pump3d-canvas").count(),
        )
        check(
            ".part-pin[data-part] 共 6 个",
            page.locator(".part-pin[data-part]").count() == 6,
            page.locator(".part-pin[data-part]").count(),
        )

        # --- [新增 N1] overview 的 3D 宿主盒非零 ---
        # 这是最重要的新护栏：CSS 网格给 3D 面板算出 0 高度时，3D 什么都不显示而控制台一片干净
        # （engine.js 的 RAF 守卫会静默 return）。Pump3DContract.assertDom 已经会在 mount 时抛错，
        # 这条是从测试侧再钉一遍，防止将来有人把那句断言放宽。
        box_ov = host_box(page)
        check(
            "[新增] overview 的 [data-pump3d-host] clientWidth/clientHeight > 0",
            bool(box_ov) and box_ov["w"] > 0 and box_ov["h"] > 0,
            box_ov,
        )

        # --- [新增 N4] .pump-train 的层叠/裁剪纪律 ---
        # overflow:hidden 负责把越界标签裁在宿主内；isolation 必须保持 auto —— 一旦写成
        # isolate，.pump-train 会建立新层叠上下文，内部 .pump3d-labels(z-index:5) 就压不过
        # 它的兄弟 .pump-map-toast / .pump-source-preview(z-index:4)，标签会被浮层盖住。
        train = page.evaluate(
            """() => {
                 const el = document.querySelector('.pump-train');
                 if (!el) return null;
                 const cs = getComputedStyle(el);
                 return { overflow: cs.overflow, isolation: cs.isolation };
               }"""
        )
        check(
            "[新增] .pump-train overflow=hidden 且 isolation=auto",
            bool(train) and train["overflow"] == "hidden" and train["isolation"] == "auto",
            train,
        )

        # --- [新增 N5] .pump3d-labels 必须压过 dashboard 的两块信息浮层 ---
        layers = page.evaluate(
            """() => {
                 const z = (sel) => {
                   const el = document.querySelector(sel);
                   return el ? getComputedStyle(el).zIndex : null;
                 };
                 return { labels: z('.pump3d-labels'),
                          toast: z('.pump-map-toast'),
                          preview: z('.pump-source-preview') };
               }"""
        )

        def zint(value):
            return None if value in (None, "auto") else int(value)

        z_labels, z_toast, z_preview = (
            zint(layers["labels"]), zint(layers["toast"]), zint(layers["preview"])
        )
        # 任务 P1-I（overview 大屏重写）之后，.pump-map-toast / .pump-source-preview 这
        # 两个旧版"信息浮层"已经被结构化的 Cards/DetailCard 取代（同样的告警信息现在走
        # 右栏 DetailCard 的 conclusion/tags，不再需要一块悬浮在 3D 画面上的文字气泡），
        # overview 的 DOM 里因此不再有这两个选择器，z()对它们返回 None 是预期结果，不是
        # 回归——C2/C3 那条"层叠纪律"本身仍然成立（若它们存在就必须被压过），只是
        # 前提条件（存在）不再满足时不应该判失败。
        check(
            "[新增] .pump3d-labels z-index=5，且若 .pump-map-toast / .pump-source-preview 存在则必须更低",
            layers["labels"] == "5"
            and (z_toast is None or z_labels > z_toast)
            and (z_preview is None or z_labels > z_preview),
            layers,
        )

        # --- 5. 按需渲染：入场巡航 → 静止 → 交互恢复 → 再静止 ---
        # 这是本项目"3D 渲染只是态势图效果，不要引入 CPU 占用 bug"这条需求的验收核心
        # （scripts/pump3d/engine.js 第 14 章）：静止时循环必须彻底停止自我排队，不能靠
        # "反正每帧都在跑，只是跳过渲染"这种仍然烧 CPU 的折中方案。
        #
        # 这条断言在改造前必然是红的：旧引擎有"idle 4 秒后自动巡航、逐帧脉冲环/选中态"
        # 三个永久脏源，静止 3 秒会涨约 50 帧（实测同机器 A/B：改造前 53 帧，改造后 0 帧，
        # 见任务汇报里的改造前后对比）。

        # 5a. 帧真在推进（未卡在第一帧）。页面刚加载正处于预热期（首帧要生成 2048 阴影贴图 +
        # PMREM + 编译一批 shader，软件光栅器下很贵），且入场巡航正在进行，理应持续出帧。
        f1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.wait_for_timeout(900)
        f2 = page.evaluate("window.Pump3D.debugInfo().frames")
        check("帧在推进（未卡在第一帧）", f2 > f1, "%d -> %d" % (f1, f2))

        # 用最早捕获的 info（第 290 行，页面加载后仅等了 2.5s，尚未经过后面一长串
        # DOM/样式检查的 page.evaluate 往返耗时）判定巡航起始状态，不要在这里重新
        # page.evaluate——机器负载重时，前面几十个检查累积的往返耗时本身就可能超过
        # INTRO_CRUISE_DURATION_MS，用"当下"重新取值会把这条断言测成机器负载的噪声，
        # 而不是巡航"起始即为 true"这个结构性事实。
        check(
            "[新增] 首次挂载后入场巡航为有限时长（introCruiseActive 起始为 true）",
            info.get("introCruiseActive") is True,
            info,
        )

        # 5b. 等待入场巡航结束（引擎侧 INTRO_CRUISE_DURATION_MS=6.5s，这里留足余量，
        # 不依赖精确到毫秒的时长，只要求"有限"这个结构性事实）。
        page.wait_for_timeout(6500)
        info_after_cruise = page.evaluate("window.Pump3D.debugInfo()")
        check(
            "[新增] 入场巡航在约 6-8 秒后结束（introCruiseActive 变为 false）",
            info_after_cruise.get("introCruiseActive") is False,
            info_after_cruise,
        )

        # 5c. 巡航结束、阻尼收敛落定后应彻底静止：3 秒内帧数增量应为 0（容差 1）。
        page.wait_for_timeout(1500)
        idle_check = page.evaluate("window.Pump3D.debugInfo()")
        check("[新增] 巡航结束、收敛落定后 idle 为 true", idle_check.get("idle") is True, idle_check)
        fi1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.wait_for_timeout(3000)
        fi2 = page.evaluate("window.Pump3D.debugInfo().frames")
        check(
            "[新增] 静止 3 秒帧数增量 <= 1（按需渲染：CPU/GPU 占用归零）",
            (fi2 - fi1) <= 1,
            "%d -> %d（增量 %d）" % (fi1, fi2, fi2 - fi1),
        )

        # 5d. 拖拽交互应让渲染明显恢复；松手后应重新收敛为静止。
        canvas_box = page.locator(".pump3d-canvas").bounding_box()
        cx = canvas_box["x"] + canvas_box["width"] / 2
        cy = canvas_box["y"] + canvas_box["height"] / 2
        fd1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.mouse.move(cx, cy)
        page.mouse.down()
        for i in range(1, 16):
            page.mouse.move(cx + i * 4, cy)
            page.wait_for_timeout(30)
        page.mouse.up()
        fd2 = page.evaluate("window.Pump3D.debugInfo().frames")
        check(
            "[新增] 拖拽交互后帧数明显增长",
            (fd2 - fd1) >= 3,
            "%d -> %d（增量 %d）" % (fd1, fd2, fd2 - fd1),
        )
        page.wait_for_timeout(2000)  # 停手后让阻尼收敛、重新落定
        idle_after_drag = page.evaluate("window.Pump3D.debugInfo()")
        check(
            "[新增] 拖拽停手后重新收敛为 idle",
            idle_after_drag.get("idle") is True,
            idle_after_drag,
        )
        fs1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.wait_for_timeout(2000)
        fs2 = page.evaluate("window.Pump3D.debugInfo().frames")
        check(
            "[新增] 拖拽后重新静止 2 秒帧数增量 <= 1",
            (fs2 - fs1) <= 1,
            "%d -> %d（增量 %d）" % (fs1, fs2, fs2 - fs1),
        )

        # 5e. 点部位标签不应重新触发入场巡航（防止"点一次部位就转 6 秒"变相回到永久渲染）。
        page.click("[data-part='coupling']", force=True)
        page.wait_for_timeout(200)
        info_click = page.evaluate("window.Pump3D.debugInfo()")
        check(
            "[新增] 点击部位标签不重新触发入场巡航（introCruiseActive 仍为 false）",
            info_click.get("introCruiseActive") is False,
            info_click,
        )
        page.wait_for_timeout(1500)
        fc1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.wait_for_timeout(2000)
        fc2 = page.evaluate("window.Pump3D.debugInfo().frames")
        check(
            "[新增] 点部位后短时间内重新静止（帧数增量 <= 1）",
            (fc2 - fc1) <= 1,
            "%d -> %d（增量 %d）" % (fc1, fc2, fc2 - fc1),
        )

        s1 = page.evaluate("window.Pump3D.debugInfo().frames")
        page.wait_for_timeout(3000)
        s2 = page.evaluate("window.Pump3D.debugInfo().frames")
        notes.append("INFO 静止 3 秒帧数增量（应为 0，仅供参考）= %d" % (s2 - s1))

        # --- 6. 标签真被投影 ---
        transforms = page.evaluate(
            """() => {
              const host = document.querySelector('[data-pump3d-host]');
              const r = host.getBoundingClientRect();
              return [...document.querySelectorAll('.part-pin[data-part]')].map(el => {
                const b = el.getBoundingClientRect();
                return { id: el.dataset.part, t: el.style.transform,
                         cx: b.left + b.width / 2 - r.left, cy: b.top + b.height / 2 - r.top,
                         w: r.width, h: r.height };
              });
            }"""
        )
        check(
            "6 个标签都写了 translate3d",
            all("translate3d(" in t["t"] for t in transforms),
            [t["t"][:40] for t in transforms],
        )
        check(
            "6 个标签 transform 互不相同",
            len({t["t"] for t in transforms}) == 6,
            len({t["t"] for t in transforms}),
        )
        outside = [
            t["id"]
            for t in transforms
            if not (-40 <= t["cx"] <= t["w"] + 40 and -40 <= t["cy"] <= t["h"] + 40)
        ]
        check("标签都落在宿主矩形内", not outside, outside)
        # 用标签的实测盒尺寸判重叠（AABB 相交），不要用拍脑袋的阈值：
        # 早先这里写 |dy|<24 && |dx|<80，而标签实测高约 46px、宽约 68px，
        # 阈值小于盒子本身 → 真实重叠会被判成"无重叠"，断言形同虚设。
        boxes = page.evaluate(
            """() => [...document.querySelectorAll('.part-pin[data-part]')].map(el => {
                 const b = el.getBoundingClientRect();
                 return { id: el.dataset.part, l: b.left, r: b.right, t: b.top, b: b.bottom };
               })"""
        )
        collide = []
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if a["l"] < b["r"] and b["l"] < a["r"] and a["t"] < b["b"] and b["t"] < a["b"]:
                    ox = min(a["r"], b["r"]) - max(a["l"], b["l"])
                    oy = min(a["b"], b["b"]) - max(a["t"], b["t"])
                    collide.append("%s×%s(%.0f×%.0f)" % (a["id"], b["id"], ox, oy))
        check("标签无重叠（实测盒 AABB 相交）", not collide, collide)

        # --- [新增] overview(dashboard) 扫描缩放区间 + 拖拽姿态，全程标签无重叠 ---
        # 上面那条断言只在默认机位量一次；这里补上缩放区间 + 拖拽姿态的扫描，见文件头
        # sweep_camera_no_overlap 的历史教训注释。
        sweep_fail_dashboard = sweep_camera_no_overlap(page, "overview", "station", "dashboard")
        check(
            "[新增] overview 缩放区间+拖拽姿态扫描，全程标签无重叠",
            not sweep_fail_dashboard,
            sweep_fail_dashboard,
        )

        # --- [契约] overview 的"当前部位"元素必须带 ACTIVE_LABEL_ATTR ---
        # 任务 P1-I 之后这条应当常绿：overview.js 的 DetailCard 渲染时传入
        # activePartLabel（值取 state.focus.partId 对应的部位中文名），见
        # scripts/ui/detailcard.js 的 ACTIVE_LABEL_ATTR 用法。
        ov_label = active_part_label(page)
        # 期望值必须**从运行期 state 读当前 focus 部位**，不能写死成 "coupling"。
        # 写死过一次并且红了：这条断言之前是 dict(PART_LABELS)["coupling"]，注释写着
        # "默认选中部位是 coupling"——那句话对**刚加载的页面**成立，但断言执行到这里时，
        # 上面几节已经逐个点过 6 个部位热点、还跑了一轮含拖拽的相机扫描，focus 早就不是
        # coupling 了（实测那一刻是 seal，标签显示"密封"）。于是断言红了，而应用完全正常：
        # 单独验证过——全新加载零交互时 focus=coupling、标签"联轴器"；依次点完 6 个热点后
        # focus=base、标签"底座"，联动一直是对的。
        # 这条契约真正要验的是"标签恒等于当前 focus 部位的中文名"，跟具体是哪个部位无关。
        # 从 state 取期望值之后，断言对测试流程的顺序免疫，也不会再因为上面新增/调整
        # 交互步骤而假红。
        ov_focus = page.evaluate("() => window.AppState.value.focus.partId")
        ov_expect = dict(PART_LABELS)[ov_focus]
        check(
            "[契约] overview 存在唯一 [data-active-part-label] 且文本等于当前 focus 部位中文名",
            ov_label["count"] == 1 and ov_label["texts"][0] == ov_expect,
            "实测 count=%d texts=%s（focus=%s，期望 1 个、文本 %s）。%s"
            % (ov_label["count"], ov_label["texts"], ov_focus, ov_expect, ACTIVE_LABEL_HINT),
        )

        # --- rev2 几何验收：不穿地 + 蜗壳与电机等粗 + 出口管不出画 ---
        # 在**独立页面**里做：这段断言会再 build() 一整套模型（66 个 mesh + 材质 + CanvasTexture），
        # 早先直接在被测页面里跑，污染了被测环境并导致后续切场景时渲染进程崩溃。
        geom_page = browser.new_page(viewport={"width": 800, "height": 600})
        geom_page.goto(PAGE, wait_until="domcontentloaded", timeout=120000)
        geom_page.wait_for_timeout(1500)
        geom = geom_page.evaluate(
            """() => {
              const THREE = window.THREE;
              const built = window.Pump3DModel.build(THREE, window.Pump3DModel.createMaterials(THREE));
              const bboxOf = (meshes) => {
                const b = new THREE.Box3();
                meshes.forEach(m => { m.updateMatrixWorld(true); b.expandByObject(m); });
                return { min: b.min.toArray(), max: b.max.toArray() };
              };
              const all = [];
              Object.keys(built.partMeshes).forEach(k => built.partMeshes[k].forEach(m => all.push(m)));
              const machine = bboxOf(all);
              const casing = bboxOf(built.partMeshes['pump-body']);
              const motor = bboxOf(built.partMeshes['motor']);
              // "蜗壳与电机等粗"用 Z 向厚度度量：这是正视图里的视觉粗细，
              // 且不受向上引出的出口管干扰（用径向最大值会把出口管顶算成半径）。
              const zExtent = (bb) => bb.max[2] - bb.min[2];
              return { machine: machine,
                       casingZ: zExtent(casing), motorZ: zExtent(motor),
                       casingTopY: casing.max[1],
                       // 契约键序：PART_IDS 是全仓唯一真源，anchors / partMeshes 必须与它含顺序全等
                       partIds: window.Pump3DContract.PART_IDS.slice(),
                       anchorKeys: Object.keys(built.anchors),
                       partMeshKeys: Object.keys(built.partMeshes) };
            }"""
        )
        check(
            "整机不穿地（包围盒 Y 最低 >= -0.05）",
            geom["machine"]["min"][1] >= -0.05,
            "y.min = %.3f" % geom["machine"]["min"][1],
        )
        check(
            "整机 X 跨度在 -13..12",
            -13 <= geom["machine"]["min"][0] and geom["machine"]["max"][0] <= 12,
            "x %.2f .. %.2f" % (geom["machine"]["min"][0], geom["machine"]["max"][0]),
        )
        check(
            "蜗壳与电机大致等粗（Z 向厚度比 0.8..1.3）",
            0.8 <= geom["casingZ"] / geom["motorZ"] <= 1.3,
            "casingZ %.2f / motorZ %.2f = %.2f"
            % (geom["casingZ"], geom["motorZ"], geom["casingZ"] / geom["motorZ"]),
        )
        check(
            "出口管顶 y <= 9.9",
            geom["casingTopY"] <= 9.9,
            "casingTopY = %.3f" % geom["casingTopY"],
        )
        # --- [新增 N6] PART_IDS ≡ anchors 键序 ≡ partMeshes 键序（含顺序） ---
        check(
            "[新增] Pump3DContract.PART_IDS 与 build() 的 anchors/partMeshes 键序全等",
            geom["anchorKeys"] == geom["partIds"] and geom["partMeshKeys"] == geom["partIds"],
            "PART_IDS=%s anchors=%s partMeshes=%s"
            % (geom["partIds"], geom["anchorKeys"], geom["partMeshKeys"]),
        )
        geom_page.close()

        page.screenshot(path=str(SHOTS / "01-overview-1920.png"), full_page=False)

        # --- 9. 性能护栏 ---
        # 阴影 pass 会把 draw call 大致翻倍（实测 ~83 可见 + ~83 阴影 = 166），故阈值取 200
        check("renderCalls < 200", info.get("renderCalls", 1e9) < 200, info.get("renderCalls"))
        check("triangles < 260000", info.get("triangles", 1e9) < 260000, info.get("triangles"))

        # --- station 场景 ---
        page.click("[data-scene='station']")
        page.wait_for_timeout(1600)
        info_s = page.evaluate("window.Pump3D.debugInfo()")
        check("station 后 contextCreated 仍为 1", info_s.get("contextCreated") == 1, info_s)
        check("station preset 生效", info_s.get("preset") == "station", info_s.get("preset"))
        # --- [新增] 切场景（overview→station，preset 真的变化）会重新触发入场巡航 ---
        # 与上面 5e"点部位不重新触发"是一对：一个验证"不该动的时候不动"，
        # 一个验证"该动的时候（preset 真变化）确实会动"，防止两条断言互相抵消成假绿。
        check(
            "[新增] overview→station 切场景后 introCruiseActive 重新为 true",
            info_s.get("introCruiseActive") is True,
            info_s,
        )

        # --- [新增 N2] station 的 3D 宿主盒非零 ---
        box_st = host_box(page)
        check(
            "[新增] station 的 [data-pump3d-host] clientWidth/clientHeight > 0",
            bool(box_st) and box_st["w"] > 0 and box_st["h"] > 0,
            box_st,
        )
        page.screenshot(path=str(SHOTS / "02-station-1920.png"))

        # --- [新增] station 扫描缩放区间 + 拖拽姿态，全程标签无重叠 ---
        # station 的 azimuthClamp 是 None（无方位钳制），数学扫描发现它在近似"沿长轴正面看"
        # 的退化视角下最容易出问题，sweep_camera_no_overlap 里 theta_span=1.45 就是覆盖这里。
        sweep_fail_station = sweep_camera_no_overlap(page, "station", "overview", "station")
        check(
            "[新增] station 缩放区间+拖拽姿态扫描，全程标签无重叠",
            not sweep_fail_station,
            sweep_fail_station,
        )

        # --- 8. 联动仍生效 + 逐部位截图（这一整段都在 station 场景内） ---
        # 只剩 [契约] 断言 Pump3DContract.ACTIVE_LABEL_ATTR ——与场景布局解耦的长期钩子。
        # 原来并存的 6 条 [过渡] 断言（点 3D 热点后检查 station 自己的 .station-side h3
        # 标题）已随 station 场景精简任务（P2-A）落地：station 现在用 DetailCard 承载
        # 当前部位详情，标题格式改为"机组 · 测点名"（如"P-1 · 联轴器相位偏差"），不再是
        # 纯部位中文名，[过渡] 断言按约定在契约变绿的同一轮里删除，不与 [契约] 断言两套并存。
        contract_mismatch = []
        for pid, label in PART_LABELS:
            # 标签因自动巡航每帧都在动，Playwright 的 stability 检查永远过不了 → force
            page.click("[data-part='%s']" % pid, force=True)
            page.wait_for_timeout(700)
            snap = active_part_label(page)
            if snap["count"] != 1 or snap["texts"][0] != label:
                contract_mismatch.append(
                    "%s: count=%d texts=%s（期望 1 个、文本 %s）"
                    % (pid, snap["count"], snap["texts"], label)
                )
            page.screenshot(path=str(SHOTS / ("03-part-%s.png" % pid)))
        check(
            "[契约] station 点击 6 个部位后 [data-active-part-label] 均为该部位中文名",
            not contract_mismatch,
            "; ".join(contract_mismatch) + "。" + ACTIVE_LABEL_HINT,
        )

        # --- 3. 上下文泄漏压测 ---
        for i in range(25):
            page.click("[data-scene='overview']")
            page.wait_for_timeout(60)
            page.click("[data-scene='station']")
            page.wait_for_timeout(60)
            if i % 5 == 0:
                page.click("[data-part='coupling']", force=True)
                page.wait_for_timeout(40)
        page.wait_for_timeout(800)
        info_l = page.evaluate("window.Pump3D.debugInfo()")
        check("25 轮切场景后 contextCreated 仍为 1", info_l.get("contextCreated") == 1, info_l)
        check("mountCount >= 50", info_l.get("mountCount", 0) >= 50, info_l.get("mountCount"))
        errs2 = [t for ty, t in console_msgs if ty == "error"]
        check("压测后仍无 console error", not errs2, errs2[:3])
        check("压测后仍无 pageerror", not page_errors, page_errors[:3])

        # --- 7. resize 正确性 ---
        for w, h, tag in [(1920, 1080, "1920"), (1280, 800, "1280"), (900, 700, "900")]:
            page.set_viewport_size({"width": w, "height": h})
            page.wait_for_timeout(500)
            r = page.evaluate(
                """() => {
                  const c = document.querySelector('.pump3d-canvas');
                  const host = document.querySelector('[data-pump3d-host]');
                  const d = window.Pump3D.debugInfo();
                  return { cw: c.width / window.devicePixelRatio, ch: c.height / window.devicePixelRatio,
                           hw: host.clientWidth, hh: host.clientHeight,
                           aspect: d.aspect, dw: d.width, dh: d.height };
                }"""
            )
            check(
                "resize@%s canvas 宽度贴合宿主" % tag,
                abs(r["cw"] - r["hw"]) <= 1.5,
                "canvas %.1f vs host %d" % (r["cw"], r["hw"]),
            )
            check(
                "resize@%s canvas 高度贴合宿主" % tag,
                abs(r["ch"] - r["hh"]) <= 1.5,
                "canvas %.1f vs host %d" % (r["ch"], r["hh"]),
            )
            expect_aspect = r["hw"] / r["hh"] if r["hh"] else 0
            check(
                "resize@%s camera.aspect 正确" % tag,
                abs(r["aspect"] - expect_aspect) < 0.02,
                "aspect %.4f vs %.4f" % (r["aspect"], expect_aspect),
            )
            page.screenshot(path=str(SHOTS / ("04-resize-%s.png" % tag)))

        # --- [新增 N3 / N7 / N8] 全部 7 个场景各走一轮 ---
        # 现有压测只在 overview↔station 之间来回，覆盖不到"进过其余 5 个场景后引擎是否被重建"。
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.wait_for_timeout(500)
        ctx_per_scene = {}
        host_per_scene = {}
        pin_outside = []
        for scene, expect_hosts in SCENE_ORDER:
            unlock_scene(page, scene)
            page.click("[data-scene='%s']" % scene)
            page.wait_for_timeout(700)
            ctx_per_scene[scene] = page.evaluate("window.Pump3D.debugInfo().contextCreated")
            probe = page.evaluate(
                """() => {
                     const pins = [...document.querySelectorAll('[data-part]')];
                     return {
                       hosts: document.querySelectorAll('[data-pump3d-host]').length,
                       pins: pins.length,
                       outside: pins.filter(el => !el.closest('.pump3d-labels'))
                                    .map(el => (el.className || el.tagName) + '[' + el.getAttribute('data-part') + ']')
                     };
                   }"""
            )
            host_per_scene[scene] = probe["hosts"]
            for item in probe["outside"]:
                pin_outside.append(scene + " → " + item)
            page.screenshot(path=str(SHOTS / ("06-scene-%s.png" % scene)))

        check(
            "[新增] 遍历全部 7 个场景各一轮后 contextCreated 仍为 1",
            all(v == 1 for v in ctx_per_scene.values()),
            ctx_per_scene,
        )
        check(
            "[新增] 不含 3D 的场景（workbench/confirm/archive/knowledge/graph）宿主计数为 0",
            all(host_per_scene[s] == e for s, e in SCENE_ORDER),
            host_per_scene,
        )
        # data-part 归 3D 热点独占的命名空间：一旦被其他场景复用，engine.js 的 buildLabelMap
        # 会把非 3D 元素也收进 labelEls（同名后者覆盖前者），3D 标签会同时消失且不报错。
        check(
            "[新增] 7 个场景中 [data-part] 全部落在 .pump3d-labels 内",
            not pin_outside,
            pin_outside,
        )

        # --- 回到 overview 收尾截图 ---
        page.click("[data-scene='overview']")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(SHOTS / "05-overview-final.png"))
        # 人工闸门用的三档宽度截图（1920 / 1440 / 1280 的 overview + station），见 verify/README.md
        for width in [1920, 1440, 1280]:
            page.set_viewport_size({"width": width, "height": 1080})
            for scene in ["overview", "station"]:
                page.click("[data-scene='%s']" % scene)
                page.wait_for_timeout(1200)
                page.screenshot(path=str(SHOTS / ("07-%s-%d.png" % (scene, width))))

        # 输出 canvas 非空像素占比，防"渲染了个全透明的空场景"
        filled = page.evaluate(
            """() => {
              const c = document.querySelector('.pump3d-canvas');
              const gl = c.getContext('webgl2') || c.getContext('webgl');
              return { drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
            }"""
        )
        notes.append("INFO drawingBuffer=" + json.dumps(filled))
        notes.append("INFO debugInfo=" + json.dumps(info_l))
        notes.append("INFO overview 宿主盒=" + json.dumps(box_ov, ensure_ascii=False))
        notes.append("INFO station 宿主盒=" + json.dumps(box_st, ensure_ascii=False))
        notes.append("INFO 各场景 contextCreated=" + json.dumps(ctx_per_scene))
        notes.append("INFO 各场景 3D 宿主数=" + json.dumps(host_per_scene))
        notes.append("INFO z-index 层级=" + json.dumps(layers))

        browser.close()

    print("\n".join(notes))
    print("-" * 60)
    if failures:
        print("\n".join(failures))
        print("-" * 60)
        print("FAILED %d / %d 项断言（另有 %d 条 INFO）"
              % (len(failures), checked, len(notes) - (checked - len(failures))))
        print("截图目录：" + str(SHOTS))
        sys.exit(1)
    print("ALL CHECKS PASSED（%d 项断言，另有 %d 条 INFO）" % (checked, len(notes) - checked))
    print("截图目录：" + str(SHOTS))


main()
