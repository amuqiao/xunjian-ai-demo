#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/screenshot.py —— kg_stage 交付前全量回归验证脚本（子任务 3-A 独占文件，
Verify 阶段：修正断言假设 + 补齐 Fix-1~6 新增回归点）

用法：
    python3 tools/screenshot.py                 # 完整跑一遍（含 fps、截图，约 1~2 分钟）
    python3 tools/screenshot.py --skip-fps       # 跳过帧率/后台重绘测试（断言 26/32，必须 headed，较慢）
    python3 tools/screenshot.py --fps-only       # 只跑帧率 + 后台重绘测试（断言 26/32）
    python3 tools/screenshot.py --shots-only     # 只截 5 张关键图，不跑断言
    python3 tools/screenshot.py --headed         # 功能性断言也用有头模式跑（调试用）

退出码：全部 PASS 为 0，任意一条 FAIL 为 1。

当前共 51 项断言：1~6 基础加载（file/http 各一遍）、7~9 3D 完整性、10~11 交互
命中、12~19 动线、20a~24 转场（20a/20b/20c 拆自旧版写错的断言 20，见下）、
25 视口适配、26 帧率、27 树无重叠、28~42 本轮 Verify 新增的 Fix-1~6 回归点、
外加一条 new1（Verify 阶段新发现的独立回归，不在原 6 路修复清单内，只报告
不修，见 new1 的诊断注释）。

设计要点（前序 agent 踩过的坑，这里照做，Verify 阶段又踩了几个新坑一并记录）：
  1. 帧率测量必须 headless=False + 特定启动参数 + bring_to_front()，否则 Chromium
     会把后台/遮挡页面的 rAF 限流到个位数，测出来毫无意义；断言 32（PaintImage
     采样）同理必须 headed。
  2. 每个 fps 变体独立开新页面，给相同预热时间，避免 JIT/GPU 纹理暖机造成的
     "越测越快"假象。
  3. 强 3D（perspective + preserve-3d）场景下 document.elementsFromPoint()（复数）
     不可靠，一律用单数 elementFromPoint()；点击一律用 el.click()（JS 侧派发），
     不用 Playwright 的 page.click()（会因为遮挡判断误报超时）。
  4. hash 变化是异步宏任务，"点击 -> sleep 固定毫秒数 -> 读 hash"的写法在转场耗时
     有弹性时并不可靠，本文件统一用"轮询等待目标 hash 正则命中 且 from= 已被
     SETTLE 阶段抹掉"的方式代替固定 sleep；覆盖式排队场景下还要用
     wait_hash_stable()（见其 docstring 里记录的两个假阳性坑：起始值平台期、
     单轮转场中间态平台期）。
  5. 展台节点点击触发的 stage->graph 转场（KG.transition.run()）存在一个真实
     竞态（见 new1）：若目标视角已经是图谱页当前渲染的视角，NAVIGATE 后的
     currentPageName() 校验会抢在原生 hashchange 之前用微任务链执行，误判为
     用户已手动离开而中止整套转场。因此本文件里"需要验证 stage->graph 转场
     本身机制"的断言（20a~20c/23/40）全部用独立全新页面第一次转场来测，避免
     被这个另一件事的信号污染；不涉及该转场机制的断言（domain/business 下钻、
     图例颜色等）可以放心复用同一个跑过很多交互的共享 page。
  6. add_init_script 里不能同步访问 document.documentElement——Document 对象
     刚创建、`<html>` 还没解析时执行，此刻是 null，直接抛 TypeError 且不会被
     任何地方感知到，表现为"看起来什么都没发生"；需要延后到 DOMContentLoaded
     监听器里再操作（且要抢在 app.js 自己的 DOMContentLoaded 监听器之前注册，
     见断言 29）。
"""

import argparse
import http.server
import json
import math
import os
import re
import subprocess
import sys
import threading
import time
from urllib.parse import unquote

from playwright.sync_api import sync_playwright

# ============================================================
# 〇、路径 / 常量
# ============================================================

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)          # demo/cc/kg_stage
INDEX_HTML = os.path.join(PROJECT_DIR, 'index.html')
FILE_URL = 'file://' + INDEX_HTML
SHOT_DIR = '/private/tmp/kg_stage_shot/final'

HTTP_PORT = 8793
HTTP_BASE = f'http://127.0.0.1:{HTTP_PORT}/index.html'

KG_READY_TIMEOUT = 15000

FPS_LAUNCH_ARGS = [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
]

# 展台上全部可交互节点（10 立牌 + 7 领域球 + 3 业务牌 + 1 中心装置）
EXPECT_NODE_COUNT = 21
EXPECT_BADGE_COUNT = 3

KG_DESIGN_W = 1920
KG_DESIGN_H = 1080

# ============================================================
# 一、结果记录
# ============================================================

RESULTS = []  # [{id, name, passed, detail}]


def record(cid, name, passed, detail=''):
    RESULTS.append({'id': cid, 'name': name, 'passed': bool(passed), 'detail': detail})
    tag = 'PASS' if passed else 'FAIL'
    print(f'[{tag}] {cid}. {name}  {("— " + detail) if detail else ""}')
    return passed


def section(title):
    print('\n' + '=' * 70)
    print(title)
    print('=' * 70)


# ============================================================
# 二、小工具
# ============================================================

def wait_js(page, predicate_js, timeout_ms=4000, interval_ms=30):
    """轮询等待某个 JS 表达式（无参箭头函数字符串）返回真值。"""
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        try:
            if page.evaluate(predicate_js):
                return True
        except Exception:
            pass
        page.wait_for_timeout(interval_ms)
    return False


def wait_kg_ready(page, timeout=KG_READY_TIMEOUT):
    page.wait_for_function('() => window.__KG_READY__ === true', timeout=timeout)


def wait_hash_stable(page, stable_reads=5, interval_ms=100, timeout_ms=4000, extra_ready_js=None):
    """轮询 location.hash，直到连续 stable_reads 次读数完全一致（判定为已经落定），
    或超时。用于替代"首次命中即认为转场结束"的写法——Fix-6 把忙时丢弃点击改成了
    覆盖式排队，连点会依次跑完多轮转场，hash 会先经历中间态（带 from=/t=）再落定，
    首次命中目标正则并不代表最终落定，必须等它"不再变化"才算数。

    有两个容易踩的坑，都已修：
    1. 如果调用方是"先点击触发转场，再立刻调用本函数"，COLLAPSE+FLASH 播完之前
       hash 原地不动（仍是点击前的旧值），若这段静止期恰好 >= stable_reads*
       interval_ms，会被误判成"已经稳定"——实际上转场只是还没开始 NAVIGATE。
       修法：记录起始值 baseline，在尚未观察到任何一次"hash 变成不同于 baseline
       的值"之前，不允许仅凭 baseline 本身重复出现就判定为稳定；一旦观察到过
       至少一次变化，才进入正常的"连续 N 次不变=稳定"判定逻辑。
    2. 覆盖式排队场景下，NAVIGATE 之后 hash 会带着 from=/t= 一直停留到 EXPAND+
       SETTLE 播完（实测约 780ms）才被 replace() 抹掉——这段 780ms 的"中间态
       平台期"本身就比 stable_reads*interval_ms（默认 500ms）更长，纯粹轮询
       hash 字符串完全可能在这段时间内连续 5 次采到同一个带 from=/t= 的中间值，
       被误判为"已经稳定"，实际上只是恰好卡在还没播完的那 780ms 窗口里。
       修法：extra_ready_js 允许调用方额外传一个 JS 表达式（无参箭头函数字符串），
       与"hash 不变"一起作为稳定判定的联合条件——典型用法是要求转场层
       （.tr-ghost/.tr-halo/.tr-ring）已经清空，这在真正落定之后才会为真，
       在中间态平台期恒为假，从根本上排除了"看起来不变但其实还在动画中"的假阳性。
    """
    start = time.time()
    baseline = page.evaluate('() => location.hash')
    seen_change = False
    last = None
    stable_count = 0
    while (time.time() - start) * 1000 < timeout_ms:
        h = page.evaluate('() => location.hash')
        extra_ok = True if extra_ready_js is None else bool(page.evaluate(extra_ready_js))
        if not seen_change and h != baseline:
            seen_change = True
        if h == last and extra_ok and (seen_change or h != baseline):
            stable_count += 1
            if stable_count >= stable_reads:
                return h
        else:
            stable_count = 0
        last = h
        page.wait_for_timeout(interval_ms)
    return last


def goto_and_settle_stage(page):
    """回到 #/stage 并等待生效（用于两次交互之间复位）。"""
    page.evaluate("() => { location.hash = '#/stage'; }")
    wait_js(page, "() => location.hash === '#/stage'")
    page.wait_for_timeout(120)


def click_node_and_wait(page, node_id, hash_pattern, timeout_ms=4000):
    """点击展台 [data-node-id] 节点，轮询等待 hash 命中正则且转场已 SETTLE（from= 已被抹掉）。"""
    page.evaluate(f'() => {{ const el = document.querySelector(\'[data-node-id="{node_id}"]\'); if(el) el.click(); }}')
    ok = wait_js(
        page,
        f"() => {hash_pattern}.test(location.hash) && location.hash.indexOf('from=') === -1",
        timeout_ms=timeout_ms,
    )
    return ok, page.evaluate('() => location.hash')


def parse_transform_matrix(transform_str):
    """把 getComputedStyle(...).transform 解析成 (kind, values[], translate(x,y,z))。"""
    s = (transform_str or '').strip()
    if s == 'none' or not s:
        return 'none', [], (0.0, 0.0, 0.0)
    m3d = re.match(r'^matrix3d\((.*)\)$', s)
    if m3d:
        vals = [float(v) for v in m3d.group(1).split(',')]
        return 'matrix3d', vals, (vals[12], vals[13], vals[14])
    m2d = re.match(r'^matrix\((.*)\)$', s)
    if m2d:
        vals = [float(v) for v in m2d.group(1).split(',')]
        return 'matrix', vals, (vals[4], vals[5], 0.0)
    return 'unknown', [], (0.0, 0.0, 0.0)


def dist3(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def matrices_close(v1, v2, eps=1e-3):
    if len(v1) != len(v2):
        return False
    return all(abs(a - b) <= eps for a, b in zip(v1, v2))


# ============================================================
# 三、本地 HTTP 服务器（复测用）
# ============================================================

class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def start_http_server():
    handler_cls = _QuietHandler
    os.chdir(PROJECT_DIR)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', HTTP_PORT), handler_cls)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    # 等服务器就绪
    import urllib.request
    for _ in range(50):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{HTTP_PORT}/index.html', timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    return httpd


# ============================================================
# 四、断言 1~6：基础加载（file:// 与 http:// 各跑一遍）
# ============================================================

def check_basic_load(browser, url, label, id_prefix):
    """assertions 1~6，label 用于结果里区分 file/http 两种打开方式。"""
    console_errors = []
    page_errors = []
    aborted_external = []

    context = browser.new_context()
    page = context.new_page()

    def on_console(msg):
        if msg.type == 'error':
            text = msg.text or ''
            if 'favicon' in text.lower():
                return  # 豁免 favicon.ico 404，浏览器自动请求，不受应用控制
            console_errors.append(text)

    def on_pageerror(err):
        page_errors.append(str(err))

    page.on('console', on_console)
    page.on('pageerror', on_pageerror)

    origin_is_file = url.startswith('file://')

    def route_handler(route):
        req_url = route.request.url
        if req_url.startswith('data:'):
            route.continue_()
            return
        if origin_is_file:
            allowed = req_url.startswith('file://')
        else:
            allowed = req_url.startswith('http://127.0.0.1:') or req_url.startswith('http://localhost:')
        if allowed:
            route.continue_()
        else:
            aborted_external.append(req_url)
            route.abort()

    page.route('**/*', route_handler)

    ok_ready = True
    try:
        page.goto(url, timeout=20000)
        wait_kg_ready(page)
    except Exception as e:
        ok_ready = False
        page_errors.append(f'加载/就绪超时: {e}')

    # 1. 标题
    try:
        title = page.title()
    except Exception:
        title = ''
    record(f'{id_prefix}1', f'[{label}] page.title() 精确匹配', title == '湖南公司输油泵机组运维知识图谱', f'实测: {title!r}')

    # 2. 无 pageerror / console error（豁免 favicon）
    record(f'{id_prefix}2', f'[{label}] pageerror=0 且 console.error=0（豁免 favicon）',
           len(page_errors) == 0 and len(console_errors) == 0,
           f'pageerror={len(page_errors)} console_error={len(console_errors)}'
           + (f' 详情={page_errors[:3]}{console_errors[:3]}' if (page_errors or console_errors) else ''))

    # 3. __KG_READY__
    record(f'{id_prefix}3', f'[{label}] window.__KG_READY__ === true', ok_ready, '' if ok_ready else '等待超时')

    # 4. 零外部网络请求（performance entries 过滤 + route abort 双重校验）
    try:
        perf_leak = page.evaluate("""
        () => {
          const origin = location.protocol === 'file:' ? 'file://' : location.origin;
          return performance.getEntriesByType('resource')
            .map(e => e.name)
            .filter(n => !n.startsWith(origin) && !n.startsWith('data:'));
        }
        """)
    except Exception as e:
        perf_leak = [f'<evaluate 异常: {e}>']
    no_leak = (len(perf_leak) == 0) and (len(aborted_external) == 0)
    record(f'{id_prefix}4', f'[{label}] 零外部网络请求（performance + route abort 双重校验）',
           no_leak,
           f'performance 残留={perf_leak[:5]} route 拦截到的外部请求={aborted_external[:5]}')

    # 5. validate() === []
    try:
        errs = page.evaluate('() => window.KG.index.validate()')
    except Exception as e:
        errs = [f'<evaluate 异常: {e}>']
    record(f'{id_prefix}5', f'[{label}] KG.index.validate() 返回 []', errs == [], f'实测: {errs if errs else "[]"}')

    # 6. 数据规模
    try:
        stats = page.evaluate('() => window.KG.index.stats')
    except Exception as e:
        stats = {}
    ok_stats = (
        stats.get('nodes', 0) >= 400 and stats.get('tasks') == 10 and
        stats.get('domains') == 7 and stats.get('businesses') == 3 and
        stats.get('docs', 0) >= 60
    )
    record(f'{id_prefix}6', f'[{label}] 数据规模达标（nodes>=400/tasks=10/domains=7/businesses=3/docs>=60）',
           ok_stats, f'实测 stats={stats}')

    context.close()


# ============================================================
# 五、断言 7~9：3D 完整性
# ============================================================

def check_3d_integrity(page):
    # 7. matrix3d
    transform = page.evaluate("() => getComputedStyle(document.querySelector('.stage-world')).transform")
    record('7', '.stage-world 的 transform 是 matrix3d(...)（未被压平成 2D matrix）',
           bool(transform) and transform.startswith('matrix3d('), f'实测: {transform!r}')

    # 8. 祖先链安全属性：.stage-world / .layer-ground / .layer-objects
    ancestor_report = page.evaluate("""
    () => {
      const sels = ['.stage-world', '.layer-ground', '.layer-objects'];
      return sels.map(sel => {
        const el = document.querySelector(sel);
        if (!el) return { sel, missing: true };
        const cs = getComputedStyle(el);
        return {
          sel,
          filter: cs.filter,
          opacity: cs.opacity,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          maskImage: cs.maskImage || cs.webkitMaskImage || 'none',
          backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || 'none'
        };
      });
    }
    """)
    bad = []
    for r in ancestor_report:
        if r.get('missing'):
            bad.append(f"{r['sel']}: 元素不存在")
            continue
        problems = []
        if r['filter'] != 'none':
            problems.append(f"filter={r['filter']}")
        if r['opacity'] != '1':
            problems.append(f"opacity={r['opacity']}")
        if r['overflowX'] != 'visible' or r['overflowY'] != 'visible':
            problems.append(f"overflow={r['overflowX']}/{r['overflowY']}")
        if r['maskImage'] != 'none':
            problems.append(f"maskImage={r['maskImage']}")
        if r['backdropFilter'] != 'none':
            problems.append(f"backdropFilter={r['backdropFilter']}")
        if problems:
            bad.append(f"{r['sel']}: {', '.join(problems)}")
    record('8', '.stage-world/.layer-ground/.layer-objects 均无 filter/opacity<1/overflow!=visible/mask/backdrop-filter',
           len(bad) == 0, '全部安全' if not bad else '; '.join(bad))

    # 9. keyframes 定位回归：旋转分量在变、平移分量不变（或按元素语义特化）
    KEYFRAME_CHECKS = [
        ('.table-runner-ring', None, 'rotate'),
        ('.ring--ticks', None, 'rotate'),
        ('.ring--ticks-major', None, 'rotate'),
        ('.holo-base', None, 'rotate'),
        ('.core-orbit', None, 'rotate'),
        ('.core-column', None, 'static'),   # pulse 只动 opacity/filter，transform 应保持完全恒定
        ('.badge', None, 'static'),          # .badge 自身无动画，::before/::after 才动
        ('.badge', '::before', 'rotate'),    # 实际旋转的虚线圈伪元素
        ('.core-particles i', None, 'rise'), # 必须用 translateZ 上升，X/Y 平移恒定
    ]

    def sample():
        return page.evaluate(
            """
            (sels) => sels.map(([sel, pseudo]) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
              return cs.transform;
            })
            """,
            [[sel, pseudo] for sel, pseudo, _ in KEYFRAME_CHECKS],
        )

    t0 = sample()
    page.wait_for_timeout(4000)
    t1 = sample()

    kf_bad = []
    kf_detail = []
    for (sel, pseudo, expect), raw0, raw1 in zip(KEYFRAME_CHECKS, t0, t1):
        label = sel + (pseudo or '')
        if raw0 is None or raw1 is None:
            kf_bad.append(f'{label}: 元素不存在')
            continue
        kind0, vals0, tr0 = parse_transform_matrix(raw0)
        kind1, vals1, tr1 = parse_transform_matrix(raw1)

        if expect == 'static':
            same = (kind0 == kind1) and matrices_close(vals0, vals1, eps=1e-3)
            kf_detail.append(f'{label}[static]: t0/t1 {"一致" if same else "不一致(异常)"}')
            if not same:
                kf_bad.append(f'{label}: 期望恒定但发生变化 t0={raw0} t1={raw1}')
        elif expect == 'rotate':
            translate_const = dist3(tr0, tr1) < 0.05
            rotation_changed = (not matrices_close(vals0, vals1, eps=1e-3))
            ok = translate_const and rotation_changed
            kf_detail.append(f'{label}[rotate]: 平移恒定={translate_const} 矩阵有变化={rotation_changed}')
            if not ok:
                kf_bad.append(f'{label}: translate_const={translate_const} rotation_changed={rotation_changed} '
                               f't0={raw0} t1={raw1}')
        elif expect == 'rise':
            xy_const = math.hypot(tr0[0] - tr1[0], tr0[1] - tr1[1]) < 0.05
            z_changed = abs(tr0[2] - tr1[2]) > 0.5
            ok = xy_const and z_changed
            kf_detail.append(f'{label}[rise]: XY恒定={xy_const} Z变化={z_changed}(Δz={tr1[2]-tr0[2]:.2f})')
            if not ok:
                kf_bad.append(f'{label}: xy_const={xy_const} z_changed={z_changed} t0={raw0} t1={raw1}')

    record('9', 'keyframes 定位回归校验（旋转元素平移恒定/静态元素矩阵恒定/粒子仅 Z 轴上升）',
           len(kf_bad) == 0, ' | '.join(kf_detail) if not kf_bad else ' | '.join(kf_bad))


# ============================================================
# 六、断言 10~11：交互命中
# ============================================================

def check_hit_testing(page):
    goto_and_settle_stage(page)
    page.wait_for_timeout(200)

    result = page.evaluate("""
    () => {
      const nodes = Array.from(document.querySelectorAll('[data-node-id]'));
      const report = nodes.map(el => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const hit = document.elementFromPoint(cx, cy);
        const resolved = hit ? hit.closest('[data-node-id]') : null;
        return { id: el.dataset.nodeId, ok: resolved === el, hitTag: hit ? hit.tagName + '.' + (hit.className||'') : null };
      });
      return { count: nodes.length, report };
    }
    """)
    total = result['count']
    misses = [r for r in result['report'] if not r['ok']]
    record('10', f'展台 [data-node-id] 全部 {EXPECT_NODE_COUNT} 个节点逐个命中自身（elementFromPoint 单数版）',
           total == EXPECT_NODE_COUNT and len(misses) == 0,
           f'节点总数={total}（期望{EXPECT_NODE_COUNT}） 未命中={[m["id"] for m in misses]}')

    badge_result = page.evaluate("""
    () => {
      const badges = Array.from(document.querySelectorAll('.badge'));
      const report = badges.map(el => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width/2, cy = r.top + r.height/2;
        const hit = document.elementFromPoint(cx, cy);
        const resolved = hit ? hit.closest('.badge') : null;
        return { text: el.textContent, ok: resolved === el };
      });
      return { count: badges.length, report };
    }
    """)
    b_misses = [r for r in badge_result['report'] if not r['ok']]
    record('11', f'三枚顶台徽章（.badge）逐个命中自身',
           badge_result['count'] == EXPECT_BADGE_COUNT and len(b_misses) == 0,
           f'徽章总数={badge_result["count"]}（期望{EXPECT_BADGE_COUNT}） 未命中={[m["text"] for m in b_misses]}')


# ============================================================
# 七、断言 12~19：动线
# ============================================================

def check_navigation_flows(page):
    # 12. #/stage 点 T01 -> hash 匹配 ^#/graph\?.*focus=T01
    goto_and_settle_stage(page)
    ok, h = click_node_and_wait(page, 'T01', r'/^#\/graph\?.*focus=T01/')
    record('12', '#/stage 点击 T01 立牌 -> 转场结束后 hash 匹配 ^#/graph?...focus=T01', ok, f'实测 hash={h}')

    # 13. 图谱页点节点 -> hash 匹配 ^#/docs\?.*node=
    pt = page.evaluate("""
    () => {
      const pos = window.KG.graphPage.nodeScreenPos('T01');
      const rect = document.getElementById('screen').getBoundingClientRect();
      const k = window.KG.scale.get();
      return pos ? {x: rect.left + pos.x * k, y: rect.top + pos.y * k} : null;
    }
    """)
    ok13 = False
    h13 = ''
    if pt:
        page.mouse.click(pt['x'], pt['y'])
        ok13 = wait_js(page, r'() => /^#\/docs\?.*node=/.test(location.hash)', timeout_ms=3000)
        h13 = page.evaluate('() => location.hash')
    record('13', '图谱页点击节点 -> hash 匹配 ^#/docs?...node=', ok13, f'点击坐标={pt} 实测 hash={h13}')

    # 14. 文档卡从 hidden 变可见，标题/正文非空
    card_state = page.evaluate("""
    () => {
      const card = document.getElementById('docCard');
      const title = document.getElementById('docTitle');
      const body = document.getElementById('docBody');
      return { hidden: card.hidden, titleLen: (title.textContent||'').trim().length, bodyLen: (body.textContent||'').trim().length };
    }
    """)
    ok14 = (not card_state['hidden']) and card_state['titleLen'] > 0 and card_state['bodyLen'] > 0
    record('14', '#docCard 从 hidden 变为可见，#docTitle/#docBody 非空', ok14, f'实测={card_state}')

    # 15. 「查看全图」-> hash 匹配 ^#/graph\?.*focus=
    page.evaluate("() => { const a = document.querySelector('.doc-card-viewall'); if (a) a.click(); }")
    ok15 = wait_js(page, r'() => /^#\/graph\?.*focus=/.test(location.hash)', timeout_ms=3000)
    h15 = page.evaluate('() => location.hash')
    record('15', '文档卡「查看全图」-> hash 匹配 ^#/graph?...focus=', ok15, f'实测 hash={h15}')

    # 16. 领域球 D1 -> view=domain；业务牌 B2 -> view=business
    goto_and_settle_stage(page)
    ok_d1, h_d1 = click_node_and_wait(page, 'D1', r'/^#\/graph\?.*view=domain/')
    goto_and_settle_stage(page)
    ok_b2, h_b2 = click_node_and_wait(page, 'B2', r'/^#\/graph\?.*view=business/')
    record('16', '领域球 D1 -> view=domain；业务牌 B2 -> view=business',
           ok_d1 and ok_b2, f'D1: {h_d1} | B2: {h_b2}')

    # 17. Escape 从任意页回 #/stage
    ok17 = wait_js(page, "() => true")  # 占位，真正判定在下方
    page.keyboard.press('Escape')
    ok17 = wait_js(page, "() => location.hash === '#/stage'", timeout_ms=2000)
    h17 = page.evaluate('() => location.hash')
    record('17', 'Escape 从任意页返回 #/stage', ok17, f'实测 hash={h17}')

    # 18. 六边形 3 个入口落点
    goto_and_settle_stage(page)
    page.click('.hex[aria-label="资料搜索"]')
    ok18a = wait_js(page, r'() => /^#\/docs\?.*task=T01/.test(location.hash)', timeout_ms=2000)
    h18a = page.evaluate('() => location.hash')

    goto_and_settle_stage(page)
    page.click('.hex[aria-label="图谱搜索"]')
    ok18b = wait_js(page, r'() => /^#\/graph\?view=task/.test(location.hash)', timeout_ms=2000)
    h18b = page.evaluate('() => location.hash')

    goto_and_settle_stage(page)
    page.click('.hex[aria-label="图谱介绍"]')
    ok18c = wait_js(page, r'() => /^#\/graph\?view=task/.test(location.hash)', timeout_ms=2000)
    h18c = page.evaluate('() => location.hash')

    record('18', '六边形三入口（资料搜索/图谱搜索/图谱介绍）落点正确',
           ok18a and ok18b and ok18c,
           f'资料搜索: {h18a} | 图谱搜索: {h18b} | 图谱介绍: {h18c}')

    # 19. 顶栏 5 个导航按钮可点、active 态正确
    goto_and_settle_stage(page)
    btn_count = page.evaluate("() => document.querySelectorAll('.nav-btn[data-go]').length")
    nav_bad = []
    nav_detail = []
    for i in range(btn_count):
        page.evaluate(f"() => document.querySelectorAll('.nav-btn[data-go]')[{i}].click()")
        page.wait_for_timeout(250)
        state = page.evaluate("""
        () => {
          const btns = Array.from(document.querySelectorAll('.nav-btn[data-go]'));
          const active = btns.filter(b => b.classList.contains('is-active'));
          return { hash: location.hash, activeTexts: active.map(b => b.textContent.trim()) };
        }
        """)
        nav_detail.append(f'第{i}个按钮点击后 hash={state["hash"]} active={state["activeTexts"]}')
        if len(state['activeTexts']) != 1:
            nav_bad.append(f'第{i}个按钮点击后同时高亮 {state["activeTexts"]}（应恰好 1 个）')
    record('19', f'顶栏 {btn_count} 个导航按钮可点、每次恰好 1 个 active',
           btn_count == 5 and len(nav_bad) == 0,
           ('; '.join(nav_bad) if nav_bad else '全部正确') + ' || 详情: ' + ' / '.join(nav_detail))


# ============================================================
# 八、断言 20~24：转场
# ============================================================

def capture_ghost_flight(page, node_id, poll_budget_ms=4000):
    """从 #/stage 点击 [data-node-id=node_id]，同一个连续轮询循环里完成三件事：
    捕获 from 坐标、每 60ms 采样一次 .tr-ghost 的 transform、探测何时进入
    is-settled（飞行结束）。返回 dict：from_xy / stand_center(视口坐标) /
    ghost_samples[(t_ms,tx,ty)] / ghost_final_tr / final_hash。

    合并成一个循环而不是"先等 from 出现再另起一个固定窗口采样 ghost"：
    COLLAPSE/FLASH 的实际耗时在有负载的无头环境里会比 tokens.css 标称的 420ms
    弹性大得多（实测偶发到 ~700ms），固定的"第二阶段窗口"很容易还没等到 ghost
    出现就超时，采样点数归零；用统一的大预算配合"探测到 settled 就立即退出"，
    既不会因为环境抖动而漏采，也不会无意义地等满整个预算。
    """
    stand_rect = page.evaluate(f"""
    () => {{
      const el = document.querySelector('[data-node-id="{node_id}"]');
      const r = el.getBoundingClientRect();
      return {{ cx: r.left + r.width / 2, cy: r.top + r.height / 2 }};
    }}
    """)
    page.evaluate(f'() => document.querySelector(\'[data-node-id="{node_id}"]\').click()')

    from_xy = None
    ghost_samples = []  # [(t_ms, tx, ty)]
    ghost_final_tr = None
    last_sample_t = None
    poll_start = time.time()
    while (time.time() - poll_start) * 1000 < poll_budget_ms:
        now_ms = (time.time() - poll_start) * 1000
        s = page.evaluate("""
        () => {
          const h = location.hash;
          const g = document.querySelector('#trLayer .tr-ghost');
          return {
            hash: h,
            ghostTransform: g ? getComputedStyle(g).transform : null,
            ghostSettled: g ? g.classList.contains('is-settled') : false
          };
        }
        """)
        if from_xy is None:
            m = re.search(r'from=([\-\d.]+),([\-\d.]+)', unquote(s['hash']))
            if m:
                from_xy = (float(m.group(1)), float(m.group(2)))
        if s['ghostTransform'] is not None:
            _, _, tr = parse_transform_matrix(s['ghostTransform'])
            if s['ghostSettled']:
                ghost_final_tr = tr
                break
            if last_sample_t is None or now_ms - last_sample_t >= 60:
                ghost_samples.append((now_ms, tr[0], tr[1]))
                last_sample_t = now_ms
        page.wait_for_timeout(20)

    wait_js(page, f"() => /^#\\/graph\\?.*focus={node_id}/.test(location.hash) && location.hash.indexOf('from=') === -1",
            timeout_ms=4000)
    wait_js(page, "() => document.querySelectorAll('#trLayer .tr-ghost, #trLayer .tr-halo, #trLayer .tr-ring').length === 0",
            timeout_ms=2000)

    return {
        'stand_rect': stand_rect,
        'from_xy': from_xy,
        'ghost_samples': ghost_samples,
        'ghost_final_tr': ghost_final_tr,
        'final_hash': page.evaluate('() => location.hash'),
    }


def check_ghost_mechanics(pw, base_url):
    """20a/20b/20c：转场起止对齐 + 飞行轨迹平滑性。独立开一个全新页面/全新
    KG.graphPage 状态来测（不复用功能性主测试页面），理由见断言 20a/20b/20c
    的注释与本轮 Verify 报告——图谱页一旦对某个视角完成过一次渲染，
    KG.graphPage.nodeScreenPos() 对同视角其它节点会立即同步返回坐标（不需要
    等 rAF），这会让 transition.js 里"NAVIGATE 之后校验 currentPageName()
    是否已经是 graph"这一步在 hashchange 派发的宏任务真正跑到之前，就被这次
    "同步落定"的 Promise 微任务抢先检查到——读到还没被 hashchange 刷新的旧
    页面名，误判成"用户已手动导航离开"而提前中止整套转场（详见本轮 Verify
    报告里的新发现回归项）。这是一个独立于本断言意图（验证 ghost 飞行本身的
    起止对齐与轨迹平滑度）的问题，为了不让两件事互相掩盖，这里固定用"全新
    页面上的第一次转场"这个不会触发该竞态的场景来测。
    """
    section('20a~20c：转场起止对齐 + 飞行轨迹平滑性（独立全新页面）')
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(300)

    # 修正说明（协调者写错的断言，见任务书）：旧版把 CAPTURE 的 from 坐标（展台立牌
    # 屏幕位置，飞行起点）直接与 nodeScreenPos('T01')（图谱节点位置，飞行终点）比较，
    # 875px 的差值正是这段飞行距离本身，不是 bug。拆成三条：
    #   20a 验起点：from 是否等于「被点击立牌」当时的屏幕中心（换算到设计坐标）；
    #   20b 验终点：ghost 飞行落定的中心是否对齐 nodeScreenPos('T01')；
    #   20c 验轨迹：EXPAND 期间 ghost 的 transform 逐帧采样应单调平滑，
    #       是 Fix-6 去掉 #graphChart 进场 scale(1.12) 的回归保护
    #       （那个 scale 会在 EXPAND 播放期间持续污染 getBoundingClientRect，
    #       导致旧版 flyGhostChase 逐帧重读 nodeScreenPos 时读出一串「伪漂移」，
    #       实测最大偏移 90.14px）。
    flight = capture_ghost_flight(page, 'T01')
    from_xy = flight['from_xy']
    stand_rect = flight['stand_rect']
    ghost_samples = flight['ghost_samples']
    ghost_final_tr = flight['ghost_final_tr']
    pos = page.evaluate("() => window.KG.graphPage.nodeScreenPos('T01')")

    # 20a：from 有效——落在 1920x1080 画布内，且与被点击立牌当时的屏幕中心
    # （换算到设计坐标）一致，误差 < 5px。
    design_center = None
    d20a = None
    ok20a = False
    if from_xy and stand_rect:
        design_center = page.evaluate(
            '(pt) => window.KG.scale.toDesign(pt.cx, pt.cy)', stand_rect
        )
        in_canvas = (0 <= from_xy[0] <= KG_DESIGN_W) and (0 <= from_xy[1] <= KG_DESIGN_H)
        d20a = math.hypot(from_xy[0] - design_center['x'], from_xy[1] - design_center['y'])
        ok20a = in_canvas and d20a < 5
    record('20a', 'CAPTURE 的 from 坐标有效：落在 1920x1080 画布内，且与被点立牌当时屏幕中心（换算设计坐标）一致（误差<5px）',
           ok20a, f'from={from_xy} 立牌视口中心={stand_rect} 换算设计坐标={design_center} 差值={d20a}')

    # 20b：ghost 飞行落定终点（is-settled 那一帧的 transform，或采样序列最后一帧兜底）
    # 中心点，与 nodeScreenPos('T01') 差值 < 5px。
    GHOST_HALF = 36
    final_tr = ghost_final_tr or (ghost_samples[-1][1:] if ghost_samples else None)
    d20b = None
    ok20b = False
    ghost_center = None
    if final_tr and pos:
        ghost_center = (final_tr[0] + GHOST_HALF, final_tr[1] + GHOST_HALF)
        d20b = math.hypot(ghost_center[0] - pos['x'], ghost_center[1] - pos['y'])
        ok20b = d20b < 5
    record('20b', "ghost 飞行落定终点中心 与 KG.graphPage.nodeScreenPos('T01') 差值 < 5px",
           ok20b, f'ghost落点中心={ghost_center}（来自transform={final_tr}） nodeScreenPos={pos} 差值={d20b}')

    # 20c：飞行轨迹单调平滑——相邻采样点位移方向不应反转，且飞行途中不应出现
    # 大量"冻结帧"（旧 bug：#graphChart 的 scale(1.12) 进场动效会让 nodeScreenPos
    # 读数在 EXPAND 期间来回抖动/停滞）。
    #
    # 判定前先剔除"起跳前的静止段"：spawnGhost() 按设计会把 ghost 先钉在起点
    # （scale .2）静止若干帧，直到 doubleRaf 后才补上 transform 的 transition
    # 触发真正的 FLIP（见 transition.css 里 .tr-ghost 基础态刻意不写 transition
    # 的注释）——这段静止是预期行为，不是"飞行轨迹"的一部分，不该计入冻结帧。
    # 剔除后，飞行段内允许出现极少量（<=1/3）冻结帧：本机 Python 轮询与浏览器
    # 实际重绘帧并非同步时钟，headless 环境下偶尔"连续两次拿到同一帧的
    # computed style"是采样节奏与合成节奏对不齐的正常抖动，不代表页面本身卡顿
    # （已用逐帧打印核实：冻结帧之间的其它样本都在正常单调推进，不是整段卡死）；
    # 但只要出现一次方向反转（真实回归的确定性信号），一律判失败，没有容忍度。
    ok20c = True
    c20c_detail = []
    if len(ghost_samples) < 2:
        ok20c = False
        c20c_detail.append(f'采样点不足（{len(ghost_samples)} 个），无法判定轨迹')
    else:
        first_val = (ghost_samples[0][1], ghost_samples[0][2])
        flight_start = 0
        while flight_start < len(ghost_samples) - 1 and \
                (ghost_samples[flight_start][1], ghost_samples[flight_start][2]) == first_val:
            flight_start += 1
        flight_samples = ghost_samples[max(flight_start - 1, 0):]  # 保留起跳前最后一帧作基准

        if len(flight_samples) < 2:
            ok20c = False
            c20c_detail.append('剔除起跳前静止段后采样点不足，无法判定轨迹')
        else:
            overall_dx = flight_samples[-1][1] - flight_samples[0][1]
            overall_dy = flight_samples[-1][2] - flight_samples[0][2]
            frozen = 0
            reversed_count = 0
            for i in range(1, len(flight_samples)):
                _, x0, y0 = flight_samples[i - 1]
                _, x1, y1 = flight_samples[i]
                dx, dy = x1 - x0, y1 - y0
                if abs(dx) < 1e-6 and abs(dy) < 1e-6:
                    frozen += 1
                    continue
                dot = dx * overall_dx + dy * overall_dy
                if dot < -1e-6:
                    reversed_count += 1
            moving_gaps = len(flight_samples) - 1
            frozen_ratio = frozen / moving_gaps if moving_gaps else 0
            ok20c = (reversed_count == 0) and (frozen_ratio <= 1 / 3)
            c20c_detail.append(
                f'全部采样点数={len(ghost_samples)} 起跳前静止帧数={flight_start} '
                f'飞行段采样点数={len(flight_samples)} 飞行段冻结帧数={frozen}/{moving_gaps}'
                f'（占比{frozen_ratio:.0%}，headless 采样节奏与合成节奏不对齐的正常抖动容忍<=33%） '
                f'方向反转次数={reversed_count}（容忍度 0） '
                f'首帧={ghost_samples[0][1:]} 末帧={ghost_samples[-1][1:]}'
            )
    record('20c', 'EXPAND 期间 .tr-ghost 的 transform 每 60ms 采样，飞行轨迹单调平滑（零方向反转，冻结帧占比<=1/3）',
           ok20c, ' | '.join(c20c_detail))

    context.close()
    browser.close()


def check_transitions(page):
    # 21. nodeScreenPos 稳定性：mount 后立刻 vs 1200ms 后，差值 < 2px
    page.evaluate("() => { location.hash = '#/graph?view=task&focus=T01'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    pos0 = None
    start = time.time()
    while time.time() - start < 3.0:
        pos0 = page.evaluate("() => window.KG.graphPage.nodeScreenPos('T01')")
        if pos0:
            break
        page.wait_for_timeout(15)
    page.wait_for_timeout(1200)
    pos1 = page.evaluate("() => window.KG.graphPage.nodeScreenPos('T01')")
    if pos0 and pos1:
        d21 = math.hypot(pos0['x'] - pos1['x'], pos0['y'] - pos1['y'])
        ok21 = d21 < 2
    else:
        d21 = None
        ok21 = False
    record('21', 'nodeScreenPos 稳定性：mount 后立刻取 vs 1200ms 后取，差值 < 2px',
           ok21, f'pos0={pos0} pos1(+1200ms)={pos1} 差值={d21}')

    # 22. 直接访问带 from/t 但 stash 为空的 URL -> 不报错，降级为纯聚焦
    page_errors = []
    console_errors = []
    ctx = page.context
    page22 = ctx.new_page()
    page22.on('pageerror', lambda e: page_errors.append(str(e)))
    page22.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' and 'favicon' not in m.text.lower() else None)
    base = page.url.split('#')[0]
    page22.goto(base + '#/graph?view=task&focus=T01&from=800,400&t=123')
    try:
        wait_kg_ready(page22)
        ready = True
    except Exception:
        ready = False
    page22.wait_for_timeout(400)
    title_text = page22.evaluate("() => document.getElementById('graphTitle').textContent")
    ok22 = ready and len(page_errors) == 0 and len(console_errors) == 0 and bool(title_text.strip())
    record('22', '直接访问 #/graph?...&from=800,400&t=123（stash 为空）-> 不报错，降级为纯聚焦',
           ok22, f'ready={ready} pageerror={page_errors} console_error={console_errors} graphTitle={title_text!r}')
    page22.close()

    # 23. 转场中连点 3 次 -> 覆盖式排队最终落定、无残留 ghost/halo/ring
    #
    # 修正说明：旧版用"wait_js 首次命中目标 hash 正则即认为转场结束，再固定等 300ms"，
    # 这是针对"忙时丢弃点击"的旧语义写的。Fix-6 把它改成了覆盖式排队（busy 期间的
    # 新请求只保留最新一次，当前转场结束后自动执行），连点 3 次会依次跑完 2 轮完整
    # 转场（第 2 次点击的 payload 被第 3 次顶替，实际只有 2 轮而非 3 轮），总落定
    # 时间从单轮 ~1.2s 变成两轮 ~2.4s——首次命中目标正则的那一刻只是第一轮落定，
    # 之后 hash 还会再变一轮，不代表最终状态。改用 wait_hash_stable()：轮询 hash
    # 直到连续多次读数不再变化（判定为已经落定），再校验最终 hash 与残留元素。
    #
    # 用全新页面测（而不是复用已经跑过一大堆交互的 page）：本轮 Verify 另外发现了
    # 一个独立的真实回归（见断言 'new1'：同一视角二次转场会被误判为用户手动离开而
    # 中止）——它的触发条件恰好是"图谱页此前已经渲染过目标视角"，如果这里仍用已经
    # 访问过 view=task 的共享 page，连点 3 次里的两轮排队都会撞上那个另一个 bug，
    # 两件事的信号会混在一起、谁都验不清楚。这里专门开一个全新页面，只用来验证
    # "覆盖式排队机制本身"（3 次点击 -> 2 轮转场 -> 都指向同一个从未被访问过的
    # 视角，两轮都不会撞上 new1 的竞态）。
    section('23：转场中连点 3 次的覆盖式排队（独立全新页面）')
    browser23 = page.context.browser
    ctx23 = browser23.new_context(viewport={'width': 1920, 'height': 1080})
    page23 = ctx23.new_page()
    base = page.url.split('#')[0]
    page23.goto(base + '#/stage')
    wait_kg_ready(page23)
    page23.wait_for_timeout(300)
    page23.evaluate("""
    () => {
      const el = document.querySelector('[data-node-id="T04"]');
      el.click(); el.click(); el.click();
    }
    """)
    # 2 轮转场标称总耗时 ~2.4s（每轮 ~1.2s），headless 环境偶发额外延迟，
    # 预算给到 8s + 5 次稳定确认；额外用 extra_ready_js 联合校验转场层已清空
    # （见 wait_hash_stable 坑 2 的说明：单轮转场里 NAVIGATE 之后带 from=/t= 的
    # 中间态平台期本身长达 ~780ms，比默认 5x100ms 的"稳定窗口"更长，纯轮询
    # hash 字符串会把这段中间态误判成"已经稳定"）。
    NOT_MID_FLIGHT_JS = "() => document.querySelectorAll('#trLayer .tr-ghost, #trLayer .tr-halo, #trLayer .tr-ring').length === 0"
    h23 = wait_hash_stable(page23, stable_reads=5, interval_ms=100, timeout_ms=8000,
                            extra_ready_js=NOT_MID_FLIGHT_JS)
    ok23_nav = bool(re.match(r'^#/graph\?.*focus=T04', h23 or '')) and 'from=' not in (h23 or '')
    leftover = page23.evaluate("""
    () => document.querySelectorAll('#trLayer .tr-ghost, #trLayer .tr-halo, #trLayer .tr-ring').length
    """)
    ok23 = ok23_nav and leftover == 0
    record('23', '转场中连点 3 次 -> 覆盖式排队跑完全部轮次后最终落定于 T04、无残留 .tr-ghost/.tr-halo/.tr-ring',
           ok23, f'最终落定 hash={h23} 残留元素数={leftover}')
    ctx23.close()

    # new1（本轮 Verify 新发现的真实回归，不在原 6 路修复清单内，只报告不修）：
    # 从展台进入图谱页、返回展台后，再次点击【同一视角下任意节点】（哪怕是不同节点）
    # 都会导致转场卡死——ghost 不出现，hash 永久残留 from=/t=（不会自愈，直到下次
    # 手动改写 hash 或刷新页面）。复现条件：graph 页此前已经渲染过某个视角 X，此后
    # 任意一次"从展台点击视角同为 X 的节点"都会触发。
    #
    # 根因（已用 Playwright 逐帧/逐 tick 单独验证，参见本轮 Verify 报告）：
    # scripts/transition.js 的 runGraphTransition() 在 NAVIGATE（KG.router.go）
    # 之后立刻 waitForNode(focusId,600) 等目标坐标就位；若图谱页此前已经渲染过
    # 同一个 view（currentPositions 里已经有该 view 全部节点的坐标，不需要专门是
    # 同一个节点），nodeScreenPos(focusId) 在 waitForNode 内部第一次同步检查就
    # 直接命中，Promise 在没有经过任何一次 requestAnimationFrame/setTimeout 的
    # 情况下，靠纯微任务链立刻 resolve；而 location.hash=... 触发的原生
    # hashchange 是一个宏任务，必须等当前宏任务的微任务队列完全清空后才会被处理。
    # 于是紧接着的 `if (currentPageName() !== 'graph')` 校验会在 hashchange 真正
    # 更新 KG.router 内部 currentState 之前就执行，读到的还是 NAVIGATE 之前的
    # 旧页面名（'stage'），被误判成"用户在 EXPAND 期间已经手动导航离开"（bug4 的
    # 校验逻辑），提前 cleanupAll() 并整体判定为 ABORTED——SETTLE 阶段本该用
    # router.replace() 抹掉的 from=/t= 因此永远没有机会执行。反之，若目标视角是
    # 图谱页第一次渲染（或与当前渲染视角不同），nodeScreenPos 必然要等 renderView()
    # 完成整图布局才有值，这段真实异步等待足够让 hashchange 宏任务先被处理，
    # 所以只在"重复同视角"这一种情况下才会触发，属于真实的、可稳定复现的代码缺陷，
    # 不是本脚本断言假设错误。
    goto_and_settle_stage(page)
    page.wait_for_timeout(150)
    page.evaluate('() => document.querySelector(\'[data-node-id="T03"]\').click()')
    new1_settled = wait_js(
        page,
        r"() => /^#\/graph\?.*focus=T03/.test(location.hash) && location.hash.indexOf('from=') === -1",
        timeout_ms=3000,
    )
    new1_hash = page.evaluate('() => location.hash')
    record('new1（新发现回归，非本轮 6 路修复范围）',
           '展台点击已渲染视角下的节点（此处 view=task 已由更早的断言渲染过）应能正常落定（hash 不应永久残留 from=/t=）',
           new1_settled,
           f'实测：3s 内未等到落定，最终 hash={new1_hash}（应形如 #/graph?view=task&focus=T03，'
           f'不应带 from=/t=）—— 根因见上方大段注释：NAVIGATE 后的 currentPageName() 校验'
           f'抢在原生 hashchange 宏任务之前用微任务链读到了旧页面名，被误判为用户已手动导航'
           f'离开而提前中止整套转场')

    # 24. reduced-motion -> 直接跳转无动画，不报错
    ctx2 = page.context.browser.new_context(reduced_motion='reduce')
    page24 = ctx2.new_page()
    errs24 = []
    page24.on('pageerror', lambda e: errs24.append(str(e)))
    page24.goto(base + '#/stage')
    wait_kg_ready(page24)
    page24.wait_for_timeout(200)
    t0 = time.time()
    page24.evaluate('() => document.querySelector(\'[data-node-id="T05"]\').click()')
    ok24_nav = wait_js(page24, r'() => /^#\/graph\?.*focus=T05/.test(location.hash)', timeout_ms=2000)
    dt24 = time.time() - t0
    ok24 = ok24_nav and dt24 < 1.0 and len(errs24) == 0
    record('24', 'prefers-reduced-motion:reduce 下点击直接跳转（无 COLLAPSE/FLASH/EXPAND 动画耗时），不报错',
           ok24, f'耗时={dt24:.3f}s（应远小于完整转场的~1.2s）pageerror={errs24}')
    ctx2.close()


# ============================================================
# 九、断言 25：视口适配
# ============================================================

def check_viewport_adaptation(page):
    sizes = [(1920, 1080), (1600, 900), (2560, 1440)]
    bad = []
    detail = []
    base = page.url.split('#')[0]
    for w, h in sizes:
        ctx = page.context.browser.new_context(viewport={'width': w, 'height': h})
        p = ctx.new_page()
        p.goto(base + '#/stage')
        wait_kg_ready(p)
        p.wait_for_timeout(250)
        r = p.evaluate("""
        () => {
          const el = document.getElementById('screen');
          const rect = el.getBoundingClientRect();
          return {
            ratio: rect.width / rect.height,
            scrollW: document.body.scrollWidth,
            innerW: window.innerWidth
          };
        }
        """)
        ratio_err = abs(r['ratio'] - 16 / 9)
        no_hscroll = r['scrollW'] == r['innerW']
        ok = ratio_err < 0.02 and no_hscroll
        detail.append(f'{w}x{h}: ratio={r["ratio"]:.4f}(误差{ratio_err:.4f}) scrollW={r["scrollW"]} innerW={r["innerW"]}')
        if not ok:
            bad.append(f'{w}x{h} 不达标')
        ctx.close()
    record('25', '三种视口下 #screen 宽高比恒 16:9（误差<0.02）且无横向滚动条',
           len(bad) == 0, ' | '.join(detail))


# ============================================================
# 十、断言 26：帧率（必须 headed）
# ============================================================

def measure_fps(pw, url, warmup_ms, sample_ms):
    browser = pw.chromium.launch(headless=False, args=FPS_LAUNCH_ARGS)
    page = browser.new_page()
    page.bring_to_front()
    page.goto(url)
    if url != 'about:blank':
        wait_kg_ready(page)
    page.wait_for_timeout(warmup_ms)
    result = page.evaluate(
        """
        (durationMs) => new Promise(resolve => {
          const frames = [];
          const start = performance.now();
          function step(t){
            frames.push(t);
            if (performance.now() - start < durationMs) {
              requestAnimationFrame(step);
            } else {
              resolve({ frames, elapsed: performance.now() - start });
            }
          }
          requestAnimationFrame(step);
        })
        """,
        sample_ms,
    )
    browser.close()
    frames = result['frames']
    elapsed = result['elapsed']
    avg_fps = len(frames) / (elapsed / 1000) if elapsed > 0 else 0
    deltas = [frames[i + 1] - frames[i] for i in range(len(frames) - 1)]
    inst_fps = [1000 / d for d in deltas if d > 0]
    min_fps = min(inst_fps) if inst_fps else 0
    return avg_fps, min_fps


def check_fps(pw, base_url):
    section('帧率测量（headed 模式，独立页面，各自预热）')
    baseline_avg, baseline_min = measure_fps(pw, 'about:blank', warmup_ms=500, sample_ms=2000)
    print(f'about:blank 基线: avg={baseline_avg:.1f}fps min={baseline_min:.1f}fps')

    stage_avg, stage_min = measure_fps(pw, base_url + '#/stage', warmup_ms=1500, sample_ms=2000)
    print(f'展台页(#/stage): avg={stage_avg:.1f}fps min={stage_min:.1f}fps')

    # 图谱页/文档页帧率只作报告参考，不参与 26 的 PASS/FAIL 判定（原始验收标准
    # 只锁定"展台空闲态 >= 50fps"，见第 6 节手动巡检清单）；仍用同样独立页面+
    # 预热的手法测，方便交付报告里一次性给出四个场景的对比数据。
    graph_avg, graph_min = measure_fps(pw, base_url + '#/graph?view=task', warmup_ms=1500, sample_ms=2000)
    print(f'图谱页(#/graph?view=task): avg={graph_avg:.1f}fps min={graph_min:.1f}fps')
    docs_avg, docs_min = measure_fps(pw, base_url + '#/docs?task=T01', warmup_ms=1500, sample_ms=2000)
    print(f'文档页(#/docs?task=T01): avg={docs_avg:.1f}fps min={docs_min:.1f}fps')

    ok = stage_avg >= 50
    record('26', '展台页帧率 >= 50fps（about:blank/图谱页/文档页基线仅供报告对比，不参与判定）',
           ok, f'baseline_avg={baseline_avg:.1f}fps stage_avg={stage_avg:.1f}fps stage_min_instant={stage_min:.1f}fps '
               f'graph_avg={graph_avg:.1f}fps docs_avg={docs_avg:.1f}fps')
    return {
        'baseline_avg': baseline_avg, 'stage_avg': stage_avg, 'stage_min': stage_min,
        'graph_avg': graph_avg, 'graph_min': graph_min, 'docs_avg': docs_avg, 'docs_min': docs_min,
    }


def count_paint_images(page, sample_ms=2000):
    """用 CDP Tracing 采样 disabled-by-default-devtools.timeline 分类下的
    PaintImage 事件数——比帧率更直接地反映"这个页面到底在不在持续重绘"，
    用于验证 Fix-5（非激活 .page 叠加 visibility:hidden 后台停跑）。"""
    session = page.context.new_cdp_session(page)
    events = []

    def on_data(params):
        events.extend(params.get('value', []))

    session.on('Tracing.dataCollected', on_data)
    session.send('Tracing.start', {
        'traceConfig': {'includedCategories': ['disabled-by-default-devtools.timeline']}
    })
    page.wait_for_timeout(sample_ms)
    done = {'v': False}
    session.on('Tracing.tracingComplete', lambda params: done.__setitem__('v', True))
    session.send('Tracing.end')
    start = time.time()
    while not done['v'] and time.time() - start < 5:
        page.wait_for_timeout(50)
    session.detach()
    return sum(1 for e in events if e.get('name') == 'PaintImage')


def check_background_paint(pw, base_url):
    """32. 后台动画停跑（Fix-5 回归保护）：切到 graph/docs 页后，用 CDP Tracing
    采样 PaintImage 事件数，应显著低于展台激活时（Fix-5 回执实测 818→28 /
    848→56）。必须 headed，理由与帧率测量一致（后台/遮挡页面会被 Chromium
    限流，headless 下测不出真实差异）。"""
    section('32：后台动画停跑（CDP Tracing PaintImage 采样，headed 模式）')
    browser = pw.chromium.launch(headless=False, args=FPS_LAUNCH_ARGS)
    page = browser.new_page()
    page.bring_to_front()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(1000)
    stage_count = count_paint_images(page, sample_ms=2000)

    page.evaluate("() => { location.hash = '#/graph?view=task'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(1000)
    graph_count = count_paint_images(page, sample_ms=2000)

    page.evaluate("() => { location.hash = '#/docs?task=T01'; }")
    wait_js(page, "() => location.hash.indexOf('task=T01') !== -1")
    page.wait_for_timeout(1000)
    docs_count = count_paint_images(page, sample_ms=2000)

    browser.close()

    ok = graph_count < stage_count and docs_count < stage_count
    record('32', '切到 graph/docs 页后展台停跑：2s 采样窗口内 PaintImage 事件数应显著低于展台激活时',
           ok, f'展台激活={stage_count} 图谱页(展台后台)={graph_count} 文档页(展台后台)={docs_count}')
    return {'stage': stage_count, 'graph': graph_count, 'docs': docs_count}


# ============================================================
# 十一、断言 27：树无重叠
# ============================================================

TREE_RECT_JS = """
() => {
  const dom = document.getElementById('treeChart');
  const chart = echarts.getInstanceByDom(dom);
  if (!chart) return { error: 'no chart' };
  const zr = chart.getZr();
  const list = zr.storage.getDisplayList();
  const nodeEls = list.filter(el => el.type === 'path' && el.shape && el.shape.symbolType);
  const rects = nodeEls.map(el => {
    const r = el.getBoundingRect().clone();
    r.applyTransform(el.transform);
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  return { count: rects.length, rects };
}
"""


def get_stable_tree_rects(page, timeout_ms=4000, stable_reads=4, interval_ms=150, initial_delay_ms=500):
    """ECharts notMerge 切换树时，旧节点带着 animationDurationUpdate(420ms) 的退场动画
    短暂残留在 zrender 显示列表里，采样过早会把"正在淡出的旧节点 + 刚出现的新节点"
    重复计数，产生假阳性的"重叠"（实测：不等退场动画彻底结束，节点数会稳定停留在
    "双倍"好几百毫秒，光靠"连续两次读数相同"不足以分辨"真的已经切换完成"与"还没
    开始移除、暂时也不变"两种情况）。这里先跳过退场动画标称时长，再要求连续多次
    读数一致才采信，双重保险。"""
    page.wait_for_timeout(initial_delay_ms)
    last_rects = None
    stable_count = 0
    start = time.time()
    while (time.time() - start) * 1000 < timeout_ms:
        result = page.evaluate(TREE_RECT_JS)
        rects = result.get('rects', [])
        if last_rects is not None and len(rects) == len(last_rects):
            stable_count += 1
            if stable_count >= stable_reads:
                return rects
        else:
            stable_count = 0
        last_rects = rects
        page.wait_for_timeout(interval_ms)
    return last_rects or []


def check_tree_no_overlap(page):
    tasks = [f'T{str(i).zfill(2)}' for i in range(1, 11)]
    bad = []
    detail = []
    for task_id in tasks:
        page.evaluate(f"() => {{ location.hash = '#/docs?task={task_id}'; }}")
        wait_js(page, f"() => location.hash.indexOf('task={task_id}') !== -1")
        rects = get_stable_tree_rects(page)
        overlaps = 0
        n = len(rects)
        EPS = 0.5  # 允许的浮点误差余量
        for i in range(n):
            a = rects[i]
            for j in range(i + 1, n):
                b = rects[j]
                intersect = not (
                    a['x'] + a['w'] - EPS <= b['x'] or
                    b['x'] + b['w'] - EPS <= a['x'] or
                    a['y'] + a['h'] - EPS <= b['y'] or
                    b['y'] + b['h'] - EPS <= a['y']
                )
                if intersect:
                    overlaps += 1
        detail.append(f'{task_id}: 节点数={n} 重叠对数={overlaps}')
        if overlaps > 0 or n == 0:
            bad.append(f'{task_id}: 节点数={n} 重叠对数={overlaps}')
    record('27', 'T01~T10 十棵树，逐个检查节点 bounding rect 互不相交（基于 zrender 显示列表几何提取）',
           len(bad) == 0, ' | '.join(detail) if not bad else '; '.join(bad))


# ============================================================
# 十二、断言 28~42：本轮 Fix-1~6 新增回归点
#
# 除断言 40（会触发展台 -> 图谱的 KG.transition 转场）之外，本节全部复用
# check_transitions() 用过的共享 page：这些检查都只用"直接改 hash"或"图谱页/
# 文档页自身的 canvas 点击"触达目标状态，不经过 scripts/transition.js 的
# runGraphTransition() 状态机，因此不会撞上 new1 那个"同视角二次转场竞态"
# （该竞态的必要条件是"经由展台节点点击触发 stage->graph 的转场"，直接改
# location.hash 或图谱/文档页内部点击都不经过这条路径，见 new1 的诊断注释）。
# ============================================================

def resolve_css_color(page, css_value):
    """用一个临时元素把任意 CSS 颜色值（var(...)/#hex/关键字）解析成浏览器
    computed 的 rgb(...) 字符串，避免直接比较 hex 字符串与 computed rgb() 的
    格式不一致。"""
    return page.evaluate("""
    (v) => {
      const el = document.createElement('div');
      el.style.color = v;
      document.body.appendChild(el);
      const c = getComputedStyle(el).color;
      el.remove();
      return c;
    }
    """, css_value)


def check_legend_colors(page):
    """42. 图谱页与文档页的图例圆点 computed color 应分别等于四种类型色。
    注意图谱页 view=task 只投影 task/direction/technology 三级（README「三视角」
    一节：view=task 只取三级 contains 边），content 级不进图谱、只在文档页密集树
    出现，图谱图例天然没有"资料条目"一项——这不是 bug，图例四色断言里"图谱页"
    只校验三色，"文档页"才校验四色。"""
    page.evaluate("() => { location.hash = '#/graph?view=task'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(300)
    graph_legend = page.evaluate("""
    () => Array.from(document.querySelectorAll('#graphLegend .legend-item')).map(el => ({
      label: el.querySelector('.legend-label').textContent,
      color: getComputedStyle(el.querySelector('.legend-dot')).color
    }))
    """)
    type_labels_graph = {'task': '运维主题', 'direction': '作业方向', 'technology': '作业能力'}
    type_labels_docs = {'task': '运维主题', 'direction': '作业方向', 'technology': '作业能力', 'content': '资料条目'}
    type_vars = {'task': '--n-task', 'direction': '--n-dir', 'technology': '--n-tech', 'content': '--n-content'}
    bad = []
    detail = []
    for t, label in type_labels_graph.items():
        expect = resolve_css_color(page, f'var({type_vars[t]})')
        item = next((i for i in graph_legend if i['label'] == label), None)
        ok = bool(item) and item['color'] == expect
        detail.append(f'图谱页[{label}]: 实测={item["color"] if item else None} 期望={expect}')
        if not ok:
            bad.append(f'图谱页[{label}] 不匹配')

    page.evaluate("() => { location.hash = '#/docs?task=T01'; }")
    wait_js(page, "() => location.hash.indexOf('task=T01') !== -1")
    page.wait_for_timeout(300)
    tree_legend = page.evaluate("""
    () => Array.from(document.querySelectorAll('#treeLegend .legend-row')).map(el => ({
      label: el.querySelector('span:not(.legend-dot)').textContent,
      color: getComputedStyle(el.querySelector('.legend-dot')).color
    }))
    """)
    for t, label in type_labels_docs.items():
        expect = resolve_css_color(page, f'var({type_vars[t]})')
        item = next((i for i in tree_legend if i['label'] == label), None)
        ok = bool(item) and item['color'] == expect
        detail.append(f'文档页[{label}]: 实测={item["color"] if item else None} 期望={expect}')
        if not ok:
            bad.append(f'文档页[{label}] 不匹配')

    record('42', '图谱页/文档页图例圆点 computed color 分别等于四种类型色（--n-task/--n-dir/--n-tech/--n-content）',
           len(bad) == 0, ' | '.join(detail) if not bad else '; '.join(bad) + ' || ' + ' | '.join(detail))


def check_token_live_effect(pw, base_url):
    """28. Fix-4 核心：运行期改纯 CSS 消费的几何 token 应立即生效（不需要重新
    加载页面）——覆盖 --r-table/--h-table（.table-top 直接引用）与 --h-topbar
    （chrome.css/graph.css/docs.css 三处同时引用，必须三处同时变）。改完立刻
    还原，确认能变回去（不是单向漂移）。"""
    section('28：运行期改纯 CSS token 立即生效（--r-table/--h-table/--h-topbar）')
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(300)

    def set_token(name, value):
        page.evaluate(f"(v) => document.documentElement.style.setProperty('{name}', v)", value)
        page.wait_for_timeout(80)

    def clear_token(name):
        page.evaluate(f"() => document.documentElement.style.removeProperty('{name}')")
        page.wait_for_timeout(80)

    detail = []
    bad = []

    # --r-table：.table-top 的 width/height 直接由 calc(var(--r-table)*2*1px) 决定
    before_w = page.evaluate("() => getComputedStyle(document.querySelector('.table-top')).width")
    set_token('--r-table', '900')
    after_w = page.evaluate("() => getComputedStyle(document.querySelector('.table-top')).width")
    clear_token('--r-table')
    restored_w = page.evaluate("() => getComputedStyle(document.querySelector('.table-top')).width")
    ok_r_table = (after_w == '1800px') and (before_w != after_w) and (restored_w == before_w)
    detail.append(f'--r-table: 默认 width={before_w} 覆盖为900后={after_w}（期望1800px） 还原后={restored_w}')
    if not ok_r_table:
        bad.append('--r-table 未生效或未正确还原')

    # --h-table：影响 .table-top 的世界 Z 高度（--z），进而通过 3D 变换链改变
    # 屏幕投影位置——用 getBoundingClientRect 而不是 computed width，因为这次
    # 变化体现在 transform 而不是 box 尺寸上。
    before_rect = page.evaluate("() => { const r = document.querySelector('.table-top').getBoundingClientRect(); return {top:r.top, left:r.left}; }")
    set_token('--h-table', '500')
    after_rect = page.evaluate("() => { const r = document.querySelector('.table-top').getBoundingClientRect(); return {top:r.top, left:r.left}; }")
    clear_token('--h-table')
    restored_rect = page.evaluate("() => { const r = document.querySelector('.table-top').getBoundingClientRect(); return {top:r.top, left:r.left}; }")
    moved = math.hypot(after_rect['top'] - before_rect['top'], after_rect['left'] - before_rect['left']) > 5
    restored_ok = math.hypot(restored_rect['top'] - before_rect['top'], restored_rect['left'] - before_rect['left']) < 0.5
    detail.append(f'--h-table: 默认屏幕投影={before_rect} 覆盖为500后={after_rect}（应显著位移） 还原后={restored_rect}')
    if not (moved and restored_ok):
        bad.append('--h-table 未影响投影位置或未正确还原')

    # --h-topbar：chrome.css 的 .topbar 高度 + graph.css 的 --graph-top(影响
    # .graph-chart 的 top) + docs.css 的 --docs-top(影响 #page-docs 的
    # padding-top) 三处必须同时变——三个元素常驻 DOM（只是非激活页
    # visibility:hidden），不需要切页就能读到 computed 值。
    def read3():
        return page.evaluate("""
        () => ({
          topbarH: getComputedStyle(document.querySelector('.topbar')).height,
          docsPad: getComputedStyle(document.getElementById('page-docs')).paddingTop,
          graphTop: getComputedStyle(document.querySelector('.graph-chart')).top
        })
        """)
    before3 = read3()
    set_token('--h-topbar', '300')
    after3 = read3()
    clear_token('--h-topbar')
    restored3 = read3()
    changed3 = all(before3[k] != after3[k] for k in before3)
    restored3_ok = all(before3[k] == restored3[k] for k in before3)
    detail.append(f'--h-topbar: 默认={before3} 覆盖为300后={after3}（三处都应变） 还原后={restored3}')
    if not (changed3 and restored3_ok):
        bad.append('--h-topbar 未同时影响三处或未正确还原')

    record('28', '运行期改 --r-table/--h-table/--h-topbar 立即生效（--h-topbar 需 topbar 高度+docs 顶部内边距+graph 顶部偏移三处同时变），改完可还原',
           len(bad) == 0, ' | '.join(detail) if not bad else '; '.join(bad) + ' || ' + ' | '.join(detail))

    context.close()
    browser.close()


def check_token_reload_effect(pw, base_url):
    """29. Fix-4 核心：--r-stand/--h-slab-1/--r-domain 是 JS 侧在 mount 时读一次
    cssNum() 后参与坐标运算、再以内联 --x/--y/--z 写回元素的"构建期 token"——
    改这类 token 不会像纯 CSS 消费的 token 那样运行期立即生效，需要重新
    加载页面（下一次 mount）才会体现在新的坐标上；这里用 context.add_init_script
    在页面任何脚本执行前预埋一个 DOMContentLoaded 监听器，在 app.js 自己的
    DOMContentLoaded 监听器（bootstrap，真正触发 mount）之前抢先把覆盖值写到
    documentElement 的 inline style 上（inline style 优先级高于 tokens.css 的
    :root 声明；两个监听器都挂在同一个 document 对象上，触发顺序=注册顺序，
    我们的监听器由 add_init_script 在页面自身任何 <script> 执行前注册，必然
    先于 app.js 里的注册）。
    踩过的坑：不能直接在 add_init_script 顶层同步写
    `document.documentElement.style.setProperty(...)`——add_init_script 在
    Document 对象刚创建、`<html>` 还没开始解析时就执行，此刻
    `document.documentElement` 是 null，会直接抛 TypeError（且不会被外层
    catch 之外的任何地方感知到，表现为"看起来什么都没发生"，容易误判成
    "这个 token 就是不生效"）。用 DOMContentLoaded 监听器延后到 `<html>`
    解析完成之后再写，规避这个时序坑。"""
    section('29：改动构建期读取一次的几何 token 需要 reload 才生效（--r-stand/--h-slab-1/--r-domain）')
    browser = pw.chromium.launch(headless=True)

    def measure(extract_js, override=None):
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        if override:
            name, value = override
            context.add_init_script(
                "document.addEventListener('DOMContentLoaded', function(){"
                f"document.documentElement.style.setProperty('{name}', '{value}');"
                "});"
            )
        page = context.new_page()
        page.goto(base_url + '#/stage')
        wait_kg_ready(page)
        page.wait_for_timeout(300)
        result = page.evaluate(extract_js)
        context.close()
        return result

    stand_extract = """
    () => {
      const el = document.querySelector('.stand');
      const x = parseFloat(getComputedStyle(el).getPropertyValue('--x')) || 0;
      const y = parseFloat(getComputedStyle(el).getPropertyValue('--y')) || 0;
      return Math.hypot(x, y);
    }
    """
    slab_extract = """
    () => parseFloat(getComputedStyle(document.querySelector('.slab-top')).getPropertyValue('--z')) || 0
    """
    domain_extract = """
    () => {
      const el = document.querySelector('.domain-ball');
      const x = parseFloat(getComputedStyle(el).getPropertyValue('--x')) || 0;
      const y = parseFloat(getComputedStyle(el).getPropertyValue('--y')) || 0;
      return Math.hypot(x, y);
    }
    """

    base_stand = measure(stand_extract)
    override_stand = measure(stand_extract, ('--r-stand', '700'))
    base_slab = measure(slab_extract)
    override_slab = measure(slab_extract, ('--h-slab-1', '400'))
    base_domain = measure(domain_extract)
    override_domain = measure(domain_extract, ('--r-domain', '500'))

    browser.close()

    bad = []
    detail = []

    def check(name, base_v, override_v, expect_v):
        ok = abs(override_v - expect_v) < 1 and abs(base_v - override_v) > 1
        detail.append(f'{name}: 默认={base_v} reload 时覆盖为 {expect_v} 后实测={override_v}')
        if not ok:
            bad.append(name)

    check('--r-stand', base_stand, override_stand, 700)
    check('--h-slab-1', base_slab, override_slab, 400)
    check('--r-domain', base_domain, override_domain, 500)

    record('29', '重新加载页面时用 add_init_script 预设 --r-stand/--h-slab-1/--r-domain -> 下一次 mount 的坐标确实改变',
           len(bad) == 0, ' | '.join(detail) if not bad else '; '.join(bad) + ' || ' + ' | '.join(detail))


def check_star_determinism(pw, base_url):
    """31. KG.particles.mount(count:70, seed:20240810) 应是确定性生成：两次
    独立 reload 后 70 个星点 span 的 left/top 应逐点完全一致；数量是 70
    不是历史遗留的 140（Fix-4：删除了"生成 140 个再用 CSS nth-child(odd)
    隐藏一半"的双重错误凑数写法）。"""
    section('31：星空确定性生成（两次独立 reload 应逐点一致，数量=70）')
    browser = pw.chromium.launch(headless=True)

    def capture():
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        page.goto(base_url + '#/stage')
        wait_kg_ready(page)
        page.wait_for_timeout(300)
        pts = page.evaluate(
            "() => Array.from(document.querySelectorAll('.bg-star span')).map(el => el.style.left + '|' + el.style.top)"
        )
        context.close()
        return pts

    a = capture()
    b = capture()
    browser.close()

    ok = len(a) == 70 and a == b
    record('31', '两次独立 reload 后 70 个星点 span 的 left/top 完全一致（确定性 LCG），数量=70 不是 140',
           ok, f'第一次数量={len(a)} 第二次数量={len(b)} 逐点完全一致={a == b}'
               + ('' if a == b else f' 首个差异下标={next((i for i in range(min(len(a),len(b))) if a[i]!=b[i]), None)}'))


def check_reduced_motion_full_coverage(pw, base_url):
    """41. Fix-5 核心：prefers-reduced-motion:reduce 下，展台/图谱/文档三页
    全部元素 + ::before/::after 伪元素的 computed animation-name 都应是
    'none'；.doc-card.is-grown 的生长过渡也应被禁用（transition-duration
    归零），不是只关了动画忘了关过渡。"""
    section('41：prefers-reduced-motion 全覆盖（三页全部元素+伪元素 animation-name 均为 none）')
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080}, reduced_motion='reduce')
    page = context.new_page()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(300)

    SCAN_JS = """
    () => {
      const bad = [];
      document.querySelectorAll('*').forEach(el => {
        [null, '::before', '::after'].forEach(pseudo => {
          const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
          if (cs.animationName && cs.animationName !== 'none') {
            bad.push((el.className || el.tagName) + (pseudo || '') + ':' + cs.animationName);
          }
        });
      });
      return bad;
    }
    """

    bad_stage = page.evaluate(SCAN_JS)

    page.evaluate("() => { location.hash = '#/graph?view=task'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(300)
    bad_graph = page.evaluate(SCAN_JS)

    page.evaluate("() => { location.hash = '#/docs?task=T01&node=T01-F01'; }")
    wait_js(page, "() => location.hash.indexOf('node=T01-F01') !== -1")
    page.wait_for_timeout(400)
    bad_docs = page.evaluate(SCAN_JS)

    card_transition = page.evaluate(
        "() => getComputedStyle(document.querySelector('.doc-card.is-grown')).transitionDuration"
    )
    ok_card = bool(card_transition) and all(d.strip() == '0s' for d in card_transition.split(','))

    context.close()
    browser.close()

    bad_total = bad_stage + bad_graph + bad_docs
    ok = len(bad_total) == 0 and ok_card
    record('41', '三页全部元素+伪元素 computed animation-name 均为 none；.doc-card.is-grown 的过渡也被禁用',
           ok, f'展台残留动画={bad_stage[:5]}({len(bad_stage)}项) 图谱页残留={bad_graph[:5]}({len(bad_graph)}项) '
               f'文档页残留={bad_docs[:5]}({len(bad_docs)}项) .doc-card.is-grown transitionDuration={card_transition!r}')


def check_domain_balls(page):
    """30. 7 个 .domain-ball 到世界原点距离应相等（= --r-domain），且全部落在
    1920x1080 画布内，且不与 3 块业务悬浮牌（.holo-plate）的屏幕投影重叠。"""
    goto_and_settle_stage(page)
    page.wait_for_timeout(200)
    r_domain = page.evaluate("() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--r-domain'))")
    balls = page.evaluate("""
    () => Array.from(document.querySelectorAll('.domain-ball')).map(el => {
      const x = parseFloat(getComputedStyle(el).getPropertyValue('--x')) || 0;
      const y = parseFloat(getComputedStyle(el).getPropertyValue('--y')) || 0;
      const r = el.getBoundingClientRect();
      return { id: el.dataset.nodeId, x, y, dist: Math.hypot(x, y), rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    })
    """)
    plates = page.evaluate("""
    () => Array.from(document.querySelectorAll('.holo-plate')).map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
    """)

    bad = []
    dists = [b['dist'] for b in balls]
    dist_ok = len(balls) == 7 and all(abs(d - r_domain) < 1.0 for d in dists)
    if not dist_ok:
        bad.append(f'距原点距离不全等于 --r-domain({r_domain})：{[(b["id"], round(b["dist"],2)) for b in balls]}')

    in_canvas = []
    for b in balls:
        rc = b['rect']
        ok = 0 <= rc['x'] and rc['x'] + rc['w'] <= KG_DESIGN_W and 0 <= rc['y'] and rc['y'] + rc['h'] <= KG_DESIGN_H
        in_canvas.append(ok)
        if not ok:
            bad.append(f'{b["id"]} 超出画布：rect={rc}')

    def rects_overlap(a, b):
        return not (a['x'] + a['w'] <= b['x'] or b['x'] + b['w'] <= a['x'] or
                    a['y'] + a['h'] <= b['y'] or b['y'] + b['h'] <= a['y'])

    overlap_pairs = []
    for b in balls:
        for p in plates:
            if rects_overlap(b['rect'], p):
                overlap_pairs.append((b['id'], p))
    if overlap_pairs:
        bad.append(f'与业务悬浮牌重叠：{overlap_pairs}')

    record('30', '7 个 .domain-ball 到世界原点距离相等（=--r-domain）、全部在画布内、不与 .holo-plate 重叠',
           len(bad) == 0,
           f'--r-domain={r_domain} 距离={[(b["id"], round(b["dist"],2)) for b in balls]} '
           f'全部在画布内={all(in_canvas)} 重叠对={overlap_pairs}' if not bad else '; '.join(bad))


def check_badge_keyboard(page):
    """33. 三枚徽章 Tab 聚焦后 Enter / Space 分别跳 view=task / business / domain
    （tech-attack->task, platform->business, talent->domain，见 stage.js::
    BADGE_TARGET_VIEW）。"""
    goto_and_settle_stage(page)
    page.wait_for_timeout(200)
    expect = {'tech-attack': 'task', 'platform': 'business', 'talent': 'domain'}
    keys = {'tech-attack': 'Enter', 'platform': ' ', 'talent': 'Enter'}
    bad = []
    detail = []
    for action, expect_view in expect.items():
        goto_and_settle_stage(page)
        page.wait_for_timeout(150)
        page.evaluate(f"() => document.querySelector('[data-stage-action=\"{action}\"]').focus()")
        focused = page.evaluate("() => document.activeElement.dataset.stageAction")
        key = keys[action]
        if key == ' ':
            page.keyboard.press('Space')
        else:
            page.keyboard.press('Enter')
        ok = wait_js(page, f"() => /^#\\/graph\\?view={expect_view}/.test(location.hash)", timeout_ms=2000)
        h = page.evaluate('() => location.hash')
        detail.append(f'{action}: focused={focused} key={key!r} hash={h}')
        if not ok:
            bad.append(f'{action} 键盘激活未落到 view={expect_view}，实测 hash={h}')
    record('33', '三枚徽章 Tab 聚焦后 Enter/Space 分别跳 view=task/business/domain',
           len(bad) == 0, ' | '.join(detail) if not bad else '; '.join(bad) + ' || ' + ' | '.join(detail))


def check_escape_input_exemption(page):
    """34. #graphSearch 输入框内按 Esc 不跳首页；非输入框处按 Esc 回 #/stage。"""
    page.evaluate("() => { location.hash = '#/graph?view=task'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(200)
    page.evaluate("() => document.getElementById('graphSearch').focus()")
    page.keyboard.type('T01')
    page.keyboard.press('Escape')
    page.wait_for_timeout(200)
    h_in_input = page.evaluate('() => location.hash')
    ok_input = h_in_input.startswith('#/graph')

    page.evaluate("() => document.getElementById('graphSearch').blur()")
    page.wait_for_timeout(100)
    page.keyboard.press('Escape')
    ok_stage = wait_js(page, "() => location.hash === '#/stage'", timeout_ms=2000)
    h_after_blur = page.evaluate('() => location.hash')

    ok = ok_input and ok_stage
    record('34', '#graphSearch 输入框内按 Esc 不跳首页；非输入框处按 Esc 回 #/stage',
           ok, f'输入框内 Esc 后 hash={h_in_input}（应仍在 graph 页） | 失焦后非输入框 Esc 后 hash={h_after_blur}（应是 #/stage）')


def check_domain_business_no_drilldown(page):
    """35. #/graph?view=domain 点 D1（domain 类型，不可下钻）-> hash 不变（图谱内
    聚焦）；点该视角下的一个 technology 类型节点 -> 正常下钻到 docs。"""
    page.evaluate("() => { location.hash = '#/graph?view=domain&focus=D1'; }")
    wait_js(page, "() => location.hash.indexOf('view=domain') !== -1")
    page.wait_for_timeout(400)

    pt_d1 = page.evaluate("""
    () => {
      const pos = window.KG.graphPage.nodeScreenPos('D1');
      const rect = document.getElementById('screen').getBoundingClientRect();
      const k = window.KG.scale.get();
      return pos ? { x: rect.left + pos.x * k, y: rect.top + pos.y * k } : null;
    }
    """)
    hash_before = page.evaluate('() => location.hash')
    page.mouse.click(pt_d1['x'], pt_d1['y'])
    page.wait_for_timeout(600)  # 覆盖 260ms 单击下钻去抖
    hash_after_d1 = page.evaluate('() => location.hash')
    ok_d1 = hash_after_d1 == hash_before or (
        hash_after_d1.startswith('#/graph') and 'view=domain' in hash_after_d1
    )

    tech_id = page.evaluate("""
    () => {
      const n = window.KG.index.nodesFor('domain').find(n => n.type === 'technology');
      return n ? n.id : null;
    }
    """)
    pt_tech = page.evaluate(
        """(id) => {
      const pos = window.KG.graphPage.nodeScreenPos(id);
      const rect = document.getElementById('screen').getBoundingClientRect();
      const k = window.KG.scale.get();
      return pos ? { x: rect.left + pos.x * k, y: rect.top + pos.y * k } : null;
    }""", tech_id)
    page.mouse.click(pt_tech['x'], pt_tech['y'])
    ok_tech = wait_js(page, r"() => /^#\/docs\?.*node=/.test(location.hash)", timeout_ms=3000)
    hash_after_tech = page.evaluate('() => location.hash')

    ok = ok_d1 and ok_tech
    record('35', 'domain 视角下点 domain 类型节点(D1)不下钻(hash 不跳 docs)；点 technology 类型节点正常下钻',
           ok, f'点 D1 前={hash_before} 点 D1 后={hash_after_d1}（不应变成 docs） | '
               f'点 technology 节点({tech_id}) 后={hash_after_tech}（应命中 ^#/docs?...node=）')


def check_drilldown_with_view(page):
    """36. business 视角下钻 -> #/docs?...&view=business；文档卡「查看全图」
    回跳 -> #/graph?view=business&...。"""
    page.evaluate("() => { location.hash = '#/graph?view=business&focus=hub-biz'; }")
    wait_js(page, "() => location.hash.indexOf('view=business') !== -1")
    page.wait_for_timeout(400)

    drill_id = page.evaluate("""
    () => {
      const n = window.KG.index.nodesFor('business').find(n => n.type === 'technology' || n.type === 'content');
      return n ? n.id : null;
    }
    """)
    pt = page.evaluate(
        """(id) => {
      const pos = window.KG.graphPage.nodeScreenPos(id);
      const rect = document.getElementById('screen').getBoundingClientRect();
      const k = window.KG.scale.get();
      return pos ? { x: rect.left + pos.x * k, y: rect.top + pos.y * k } : null;
    }""", drill_id)
    page.mouse.click(pt['x'], pt['y'])
    ok_drill = wait_js(page, r"() => /^#\/docs\?.*view=business/.test(location.hash)", timeout_ms=3000)
    hash_docs = page.evaluate('() => location.hash')

    page.evaluate("() => { const a = document.querySelector('.doc-card-viewall'); if (a) a.click(); }")
    ok_back = wait_js(page, r"() => /^#\/graph\?view=business.*focus=/.test(location.hash)", timeout_ms=3000)
    hash_back = page.evaluate('() => location.hash')

    ok = ok_drill and ok_back
    record('36', 'business 视角下钻 -> #/docs?...&view=business；「查看全图」回跳 -> #/graph?view=business&...',
           ok, f'下钻节点={drill_id} 下钻后 hash={hash_docs} | 查看全图后 hash={hash_back}')


def check_card_grow_origin(page):
    """37. 首次打开玻璃文档卡时 transform-origin 应精确等于"点击位置相对卡片
    未缩放盒子的百分比"，用公式独立复算，而不是划一个经验区间——因为卡片本身
    可能离点击的树节点很远，px/py 超出 [0,100]% 是完全合理的（origin 允许在
    盒子外），历史 bug（-992%）的本质不是"数值超出常见范围"，而是"量测时机
    不对，把缩小 4 倍（scale(.25)）的盒子当成实际盒子测了一遍，导致整体多乘了
    4 倍"——这种量级错误只有跟公式独立复算比对才能确定性揪出来，划经验区间
    既会漏掉"刚好还在区间内的 4 倍误差"，也会误杀"点击位置离卡片确实很远"
    的合法大数值。"""
    page.evaluate("() => { location.hash = '#/docs?task=T02'; }")
    wait_js(page, "() => location.hash.indexOf('task=T02') !== -1")
    page.wait_for_timeout(400)

    leaf = page.evaluate("""
    () => {
      const dom = document.getElementById('treeChart');
      const chart = echarts.getInstanceByDom(dom);
      const zr = chart.getZr();
      const list = zr.storage.getDisplayList();
      const nodeEls = list.filter(el => el.type === 'path' && el.shape && el.shape.symbolType);
      if (!nodeEls.length) return null;
      const el = nodeEls[nodeEls.length - 1];
      const r = el.getBoundingRect().clone();
      r.applyTransform(el.transform);
      const rectChart = dom.getBoundingClientRect();
      const k = window.KG.scale.get();
      return { x: rectChart.left + (r.x + r.width / 2) * k, y: rectChart.top + (r.y + r.height / 2) * k };
    }
    """)
    page.mouse.click(leaf['x'], leaf['y'])
    page.wait_for_timeout(300)

    # 与 docs.js::growCardFrom() 同样的手法独立复算一遍期望值：临时把 transform
    # 盖成 none 量出"未缩放盒子"的真实矩形，再用点击坐标换算百分比，跟应用
    # 已经写好的 transform-origin 比对，容差给到 1 个百分点（浮点误差）。
    expect = page.evaluate(
        """(pt) => {
      const el = document.getElementById('docCard');
      const prev = el.style.transform;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      el.style.transform = prev;
      const px = r.width ? ((pt.x - r.left) / r.width) * 100 : 50;
      const py = r.height ? ((pt.y - r.top) / r.height) * 100 : 50;
      return { px, py };
    }""",
        leaf,
    )
    origin = page.evaluate("() => document.getElementById('docCard').style.transformOrigin")
    nums = re.findall(r'(-?[\d.]+)%', origin or '')
    ok = False
    diffs = None
    if len(nums) == 2:
        actual_px, actual_py = float(nums[0]), float(nums[1])
        diffs = (abs(actual_px - expect['px']), abs(actual_py - expect['py']))
        ok = diffs[0] < 1 and diffs[1] < 1
    record('37', '首次打开玻璃文档卡的 transform-origin 应精确等于公式复算值（点击坐标相对未缩放卡片盒子的百分比，容差<1个百分点）',
           ok, f'点击叶子节点视口坐标={leaf} 实测 transform-origin={origin!r} 公式复算期望={expect} 差值={diffs}')


def check_tree_highlight_refresh(page):
    """38. 同任务换节点：node=T01-F01-K01 -> node=T01-F02-K02，金色高亮的应是
    后者（Fix-1 核心修复：taskChanged=false 但 nodeChanged=true 时也要重绘树）。"""
    def selected_id():
        return page.evaluate("""
        () => {
          const chart = echarts.getInstanceByDom(document.getElementById('treeChart'));
          const opt = chart.getOption();
          function find(node) {
            if (node.itemStyle && node.itemStyle.borderWidth === 3) return node.id;
            if (node.children) {
              for (const c of node.children) { const r = find(c); if (r) return r; }
            }
            return null;
          }
          return find(opt.series[0].data[0]);
        }
        """)

    page.evaluate("() => { location.hash = '#/docs?task=T01&node=T01-F01-K01'; }")
    wait_js(page, "() => location.hash.indexOf('node=T01-F01-K01') !== -1")
    page.wait_for_timeout(400)
    sel1 = selected_id()

    page.evaluate("() => { location.hash = '#/docs?task=T01&node=T01-F02-K02'; }")
    wait_js(page, "() => location.hash.indexOf('node=T01-F02-K02') !== -1")
    page.wait_for_timeout(400)
    sel2 = selected_id()

    ok = sel1 == 'T01-F01-K01' and sel2 == 'T01-F02-K02'
    record('38', '同任务换节点(T01-F01-K01 -> T01-F02-K02) 树的金色高亮应跟随切换到最新节点',
           ok, f'第一次选中={sel1}（期望T01-F01-K01） 第二次选中={sel2}（期望T01-F02-K02）')


def check_esc_not_dragged(page):
    """39. 图谱页单击节点 -> 立刻按 Esc -> 1s 后 hash 仍是 #/stage
    （Fix-2 核心：unmount() 必须清掉单击去抖计时器，否则 260ms 后计时器仍会
    把用户强行拽去 docs 页）。"""
    page.evaluate("() => { location.hash = '#/graph?view=task&focus=T01'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(400)
    pt = page.evaluate("""
    () => {
      const pos = window.KG.graphPage.nodeScreenPos('T01');
      const rect = document.getElementById('screen').getBoundingClientRect();
      const k = window.KG.scale.get();
      return pos ? { x: rect.left + pos.x * k, y: rect.top + pos.y * k } : null;
    }
    """)
    page.mouse.click(pt['x'], pt['y'])
    page.keyboard.press('Escape')  # 在 260ms 单击去抖计时器到期之前就按 Esc
    ok_immediate = wait_js(page, "() => location.hash === '#/stage'", timeout_ms=1500)
    page.wait_for_timeout(1000)  # 等过 260ms 去抖窗口，确认没有被延迟拽走
    h_final = page.evaluate('() => location.hash')
    ok = ok_immediate and h_final == '#/stage'
    record('39', '图谱页单击节点后立刻按 Esc -> 1s 后 hash 仍稳定在 #/stage（不被延迟的下钻计时器拽走）',
           ok, f'立即校验={ok_immediate} 1s 后 hash={h_final}')


def check_transition_not_overridden(pw, base_url):
    """40. 点立牌后（转场已经 NAVIGATE 到 graph、正处于 EXPAND/SETTLE 中途）点
    顶栏「首页」-> hash 应停在 #/stage，不会被转场自己的 SETTLE 阶段拽回 graph。

    时机说明（比任务书字面的"200ms"更精确，理由见下）：COLLAPSE(280ms)+
    FLASH(140ms) 播完之前 hash 原地不动仍是 '#/stage'，这段时间点"首页"按钮
    等于把 location.hash 赋值成与当前完全相同的字符串——浏览器不会为"赋值成
    同一个值"派发 hashchange，等于什么都没发生，压根不构成"手动导航覆盖"的
    测试条件。真正有意义的时机是 NAVIGATE 已经把 hash 切到 '#/graph?...' 之后
    （EXPAND/SETTLE 期间），这时点"首页"才是一次真实的 hashchange，才能验证
    transition.js 在 SETTLE 前置校验里发现"currentPageName() !== 'graph'"后
    会不会正确放弃、不用 router.replace 把用户拽回来。这里先等 hash 命中
    focus=T02（NAVIGATE 已发生）再点首页。

    用独立全新页面（道理同 20a~20c/23）：避免撞上 new1 的同视角二次转场竞态，
    干扰这条断言本身想验证的"手动导航优先"语义。"""
    section('40：转场进行中被手动导航覆盖（独立全新页面）')
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(300)

    page.evaluate('() => document.querySelector(\'[data-node-id="T02"]\').click()')
    navigated = wait_js(page, r"() => /^#\/graph\?.*focus=T02/.test(location.hash)", timeout_ms=3000)
    h_mid = page.evaluate('() => location.hash')
    page.evaluate("() => document.querySelector('.nav-btn[data-go=\"stage\"]').click()")
    ok_immediate = wait_js(page, "() => location.hash === '#/stage'", timeout_ms=1500)
    page.wait_for_timeout(2000)  # 再等满一轮转场标称耗时，确认 SETTLE 没有把用户拽回来
    h_final = page.evaluate('() => location.hash')
    ok = navigated and ok_immediate and h_final == '#/stage'
    record('40', 'NAVIGATE 已发生（hash 带 focus=T02）时点顶栏「首页」-> hash 立即变为 #/stage 且 2s 后仍稳定（转场不覆盖手动导航）',
           ok, f'NAVIGATE 是否已发生={navigated}（此刻 hash={h_mid}） 点首页后立即校验={ok_immediate} 2s 后 hash={h_final}')

    context.close()
    browser.close()


def take_screenshots(page):
    os.makedirs(SHOT_DIR, exist_ok=True)
    shots = []

    # 1. 展台全屏
    goto_and_settle_stage(page)
    page.wait_for_timeout(600)
    p1 = os.path.join(SHOT_DIR, '01-stage.png')
    page.screenshot(path=p1)
    shots.append(p1)

    # 2. 图谱 task 视角
    page.evaluate("() => { location.hash = '#/graph?view=task'; }")
    wait_js(page, "() => location.hash.indexOf('view=task') !== -1")
    page.wait_for_timeout(1200)
    p2 = os.path.join(SHOT_DIR, '02-graph-task.png')
    page.screenshot(path=p2)
    shots.append(p2)

    # 3. 图谱 domain 视角
    page.evaluate("() => { location.hash = '#/graph?view=domain'; }")
    wait_js(page, "() => location.hash.indexOf('view=domain') !== -1")
    page.wait_for_timeout(1200)
    p3 = os.path.join(SHOT_DIR, '03-graph-domain.png')
    page.screenshot(path=p3)
    shots.append(p3)

    # 4. 树形页（文档卡打开态）
    page.evaluate("() => { location.hash = '#/docs?task=T01&node=T01-F01'; }")
    wait_js(page, "() => location.hash.indexOf('node=') !== -1")
    page.wait_for_timeout(700)
    p4 = os.path.join(SHOT_DIR, '04-docs-card.png')
    page.screenshot(path=p4)
    shots.append(p4)

    # 5. 一帧转场中间态
    goto_and_settle_stage(page)
    page.wait_for_timeout(150)
    page.evaluate('() => document.querySelector(\'[data-node-id="T06"]\').click()')
    page.wait_for_timeout(550)  # COLLAPSE(280)+FLASH(140)附近，落在 NAVIGATE/EXPAND 早期
    p5 = os.path.join(SHOT_DIR, '05-transition-mid.png')
    page.screenshot(path=p5)
    shots.append(p5)
    # 截完收尾，避免影响后续（若还有断言）
    wait_js(page, r"() => /^#\/graph\?.*focus=T06/.test(location.hash) && location.hash.indexOf('from=') === -1",
            timeout_ms=4000)

    return shots


# ============================================================
# 十三、主流程
# ============================================================

def run_functional_suite(pw, base_url, headed):
    section('功能性断言 7~25, 27~28（单页面持续交互）')
    browser = pw.chromium.launch(headless=not headed)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(base_url + '#/stage')
    wait_kg_ready(page)
    page.wait_for_timeout(300)

    check_3d_integrity(page)
    check_hit_testing(page)
    check_navigation_flows(page)
    check_ghost_mechanics(pw, base_url)
    check_transitions(page)
    check_token_live_effect(pw, base_url)
    check_token_reload_effect(pw, base_url)
    check_star_determinism(pw, base_url)
    check_reduced_motion_full_coverage(pw, base_url)
    check_domain_balls(page)
    check_badge_keyboard(page)
    check_escape_input_exemption(page)
    check_domain_business_no_drilldown(page)
    check_drilldown_with_view(page)
    check_card_grow_origin(page)
    check_tree_highlight_refresh(page)
    check_esc_not_dragged(page)
    check_transition_not_overridden(pw, base_url)
    check_legend_colors(page)
    check_viewport_adaptation(page)
    check_tree_no_overlap(page)
    shots = take_screenshots(page)

    context.close()
    browser.close()
    return shots


def main():
    parser = argparse.ArgumentParser(description='kg_stage 全量回归验证脚本')
    parser.add_argument('--headed', action='store_true', help='功能性断言也用有头模式跑（调试用，fps 测试始终有头）')
    parser.add_argument('--skip-fps', action='store_true', help='跳过帧率测试')
    parser.add_argument('--fps-only', action='store_true', help='只跑帧率测试')
    parser.add_argument('--shots-only', action='store_true', help='只截图，不跑断言')
    args = parser.parse_args()

    httpd = start_http_server()

    try:
        with sync_playwright() as pw:
            if args.shots_only:
                browser = pw.chromium.launch(headless=not args.headed)
                context = browser.new_context(viewport={'width': 1920, 'height': 1080})
                page = context.new_page()
                page.goto(HTTP_BASE + '#/stage')
                wait_kg_ready(page)
                page.wait_for_timeout(300)
                shots = take_screenshots(page)
                context.close()
                browser.close()
                print('\n截图完成：')
                for s in shots:
                    print(' -', s)
                return 0

            if args.fps_only:
                check_fps(pw, HTTP_BASE)
                check_background_paint(pw, HTTP_BASE)
                return summarize()

            section('基础断言 1~6（file:// 与 http:// 各跑一遍）')
            browser = pw.chromium.launch(headless=not args.headed)
            check_basic_load(browser, FILE_URL, 'file://', 'file-')
            check_basic_load(browser, HTTP_BASE, 'http://', 'http-')
            browser.close()

            shots = run_functional_suite(pw, HTTP_BASE, args.headed)

            if not args.skip_fps:
                check_fps(pw, HTTP_BASE)
                check_background_paint(pw, HTTP_BASE)
            else:
                print('\n[跳过] --skip-fps 已指定，未运行断言 26/32')

            print('\n截图完成：')
            for s in shots:
                print(' -', s)

        return summarize()
    finally:
        httpd.shutdown()


def summarize():
    section('汇总')
    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r['passed'])
    failed = total - passed
    for r in RESULTS:
        if not r['passed']:
            print(f"  FAIL {r['id']}: {r['name']}  —— {r['detail']}")
    print(f'\n共 {total} 项断言，通过 {passed} 项，失败 {failed} 项。')
    return 0 if failed == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
