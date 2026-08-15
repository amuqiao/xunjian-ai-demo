#!/usr/bin/env python3
"""把业务方给的湖南管网拓扑 xls 转成前端可直接用的 .js 数据文件，一次输出到两个 POC。

用法（必须用 uv，系统 python3 3.9 没有 xlrd）：
    cd /Users/admin/Code/xunjian-ai-demo
    uv run --with xlrd python poc/hunan-inspection-overview/tools/build-topology.py

源文件是一张「空间化表格」：列＝管道（列内自上而下是沿线节点顺序），作业区归属靠单元
格填充色编码，图例本身也在同一张表里。本脚本要做的事：
    1. 从表里的图例区域自动读出「填充色 -> 作业区名」，不手写这张表；
    2. 按显式分类规则把 站场/阀室 两类节点从 管道名/图例/省界/批注/未投产标记 等噪声
       里挑出来；
    3. 按「合并单元格宽度」还原每个节点所属的管道（管道名表头的合并跨列 = 该管道占用
       的列范围），组装 zones / pipelines / nodes 三张表；
    4. 跑一遍自检（含与源表「XX座站场」批注的交叉核对），生成两份字节级相同的 .js，
       各跑一遍 node --check。

硬约束：任何和预期结构不符的情况（图例找不到、颜色没命中图例、自检不过……）都直接抛
异常并打印实际读到的内容，不做静默兜底/默认值吞错。

已知的源文件缺陷（不是本脚本的 bug，是业务方 xls 本身的数据质量问题，见运行报告里的
详细说明），本脚本用「显式、可审计」的方式处理，绝不静默：
    a) 图例里"郴州作业区"与"湘西作业区"两行填充色完全相同 (153,153,255)，颜色本身无法
       区分——用节点所在管道名消歧（见 XIANGXI_PIPELINES / CHENZHOU_PIPELINES）。
    b) 图例里"长沙作业区" (51,204,204) 与"永郴作业区" (51,153,102) 这两个色块在全表节点
       实际填充色里一次都没出现过；实际节点用的是另外两种图例里根本查不到的颜色
       (153,204,255) 与 (153,204,0)。经与节点文字语义核对（"长沙站/长沙分输站/长沙
       计量站…"均为 (153,204,255)；"郴州分输清管站/永州分输清管站/郴州站…"均为
       (153,204,0)），判定这是图例色块滞后于表体实际配色的历史遗留问题，见
       ORPHAN_RGB_TO_ZONE_NAME。
"""

from __future__ import annotations

import json
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import xlrd

TOOLS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TOOLS_DIR.parents[2]  # .../xunjian-ai-demo
POC_ROOT = TOOLS_DIR.parent  # .../poc/hunan-inspection-overview
POC_PARENT = POC_ROOT.parent  # .../poc

XLSX_RELATIVE = "assets/.data/湖南公司油气管道站场阀室作业区位置关系图20260211_1(1).xls"
XLS_PATH = PROJECT_ROOT / XLSX_RELATIVE
SOURCE_SHEET_NAME = "Sheet1"

# 输出到两个 POC：改源 xls 后跑一条命令同步两边，运行时两边零耦合（各自持有独立副本）。
DATA_OUT_DIRS = [
    POC_ROOT / "scripts" / "data",
    POC_PARENT / "hunan-pump-overview" / "scripts" / "data",
]
OUTPUT_FILENAME = "topology.js"


# ==============================================================================
# 1. 读表：文本 + 填充色 + 合并单元格
# ==============================================================================

def load_sheet():
    if not XLS_PATH.is_file():
        raise FileNotFoundError(f"source xls not found: {XLS_PATH}")
    book = xlrd.open_workbook(str(XLS_PATH), formatting_info=True)
    if SOURCE_SHEET_NAME not in book.sheet_names():
        raise KeyError(f"sheet {SOURCE_SHEET_NAME!r} not found, actual sheets: {book.sheet_names()}")
    sheet = book.sheet_by_name(SOURCE_SHEET_NAME)
    return book, sheet


def build_text_and_occupied(sheet):
    """text: (row,col)->去空白后的原始字符串（仅非空单元格）。
    occupied: text 的键集合 并上 所有合并单元格覆盖到的每一格——用于判断"这一片区域是否
    还有内容"，因为 xlrd 对合并单元格只在左上角那一格存值，其余格在 sheet.cell_value 里
    是空字符串，若不还原会把"合并单元格挡住的那一段"误判成数据缺口。
    """
    text: dict[tuple[int, int], str] = {}
    for r in range(sheet.nrows):
        for c in range(sheet.ncols):
            v = sheet.cell_value(r, c)
            if isinstance(v, str) and v.strip():
                text[(r, c)] = v.strip()

    merge_span: dict[tuple[int, int], tuple[int, int, int]] = {}
    occupied = set(text.keys())
    for (r1, r2, c1, c2) in sheet.merged_cells:
        merge_span[(r1, c1)] = (r1, c1, c2 - 1)
        for rr in range(r1, r2):
            for cc in range(c1, c2):
                occupied.add((rr, cc))
    return text, occupied, merge_span


def get_rgb(book, sheet, r: int, c: int):
    xf = book.xf_list[sheet.cell_xf_index(r, c)]
    idx = xf.background.pattern_colour_index
    return book.colour_map.get(idx)


# ==============================================================================
# 2. 逐格分类：站场 / 阀室 / 管道名 / 图例 / 省界 / 批注 / 未投产 / 标题
# ==============================================================================

PIPELINE_NAME_SUFFIXES = ("管道", "支线", "联络线", "干线")
PROVINCE_BORDER_EXACT = {"湘鄂省界", "湘渝省界", "湘赣省界", "湘桂省界", "湘粤省界"}
STATION_COUNT_RE = re.compile(r"^\d+座站场$")


def classify_cell(row: int, text: str) -> str:
    """返回分类标签，不做任何"猜测式"兜底——每一类都有明确、可复核的判据。"""
    if row == 0:
        return "title"
    if "作业区" in text:
        return "legend_zone"
    if STATION_COUNT_RE.fullmatch(text):
        return "annotation_station_count"
    if "氮气封存" in text:
        return "annotation_note"
    if text == "未投产管段":
        return "not_commissioned"
    if text in PROVINCE_BORDER_EXACT:
        return "province_border"
    if text.endswith(PIPELINE_NAME_SUFFIXES):
        return "pipeline_name"
    # 走到这里的都是实体节点：含"阀室"的是阀室，其余（XX分输站/清管站/首站/末站/计量站/
    # 压气站/国库站/…站，含"省界阀室"——它含"阀室"，在上面的 province_border 精确匹配
    # 之后才轮到这条规则，不会被误伤）判定为站场。
    if "阀室" in text:
        return "valve"
    return "station"


# ==============================================================================
# 3. 还原每个节点所属的管道：管道名表头的合并跨列 = 该管道的列范围
# ==============================================================================

def compute_header_end_row(header: dict, occupied: set, nrows: int) -> int:
    """从表头行往下找这一列范围内"连续有内容"的最后一行。

    容忍最多 1 行空隙（例：湘潭支线 1-5#阀室 之后隔了 1 个空行才出现"湘潭计量站"，
    仍算同一个管道区块），超过 1 行空隙则认为区块真正结束——这个阈值是看实际数据校出
    来的，不是随便定的：西三线长沙支线的区块结束后，潜江-韶关输气管道的支线站（红茶亭
    首站等）与它有 6 行的空隙，必须能与"只隔 1 行"的情形区分开。
    """
    r = header["row"] + 1
    last = header["row"]
    gap = 0
    while r < nrows:
        if any((r, c) in occupied for c in range(header["col_start"], header["col_end"] + 1)):
            last = r
            gap = 0
        else:
            gap += 1
            if gap > 1:
                break
        r += 1
    return last


def dedupe_headers(headers: list[dict]) -> list[dict]:
    """去掉"全名 + 紧跟着的简称复述"这种重复表头。

    唯一实例：忠武线潜湘支线（第 1 行）下面紧接着又写了一遍"潜湘支线"（第 2 行），
    两者同列、名字互为子串——保留全名，丢弃简称复述（简称复述本身不拥有独立节点）。
    """
    drop: set[int] = set()
    for i, h1 in enumerate(headers):
        for j, h2 in enumerate(headers):
            if i == j or i in drop or j in drop:
                continue
            if (
                h1["col_start"] == h2["col_start"]
                and h1["col_end"] == h2["col_end"]
                and abs(h1["row"] - h2["row"]) <= 2
                and h1["name"] != h2["name"]
                and (h1["name"] in h2["name"] or h2["name"] in h1["name"])
            ):
                shorter_idx = i if len(h1["name"]) < len(h2["name"]) else j
                drop.add(shorter_idx)
                print(f"[表头去重] {headers[shorter_idx]['name']!r} 是 {headers[i if shorter_idx==j else j]['name']!r} 的重复简称，丢弃")
    return [h for k, h in enumerate(headers) if k not in drop]


def assign_pipelines(nodes: list[dict], headers: list[dict]) -> None:
    """把每个节点挂到管道上，就地写入 n['pipeline']。

    第一轮：节点列落在某个表头声明的列范围内、且行号落在该表头的有效行窗口内——取
    "起始行最晚"（最贴近、最内层）的那个表头，这样嵌套在大管道列范围里的小支线表头
    （如潜江-韶关输气管道 col7-9 里嵌着的 西三线长沙支线 col9-10）会优先命中更具体的
    那个。

    第二轮（兜底，仅用于第一轮找不到归属的节点）：源表里有一批"T 形支线站"是画在主线
    相邻列上对齐出来的（如 双花分输站/马洲村分输站/岳阳站/七里山站/昭山阀室），本身
    所在列没有任何表头声明覆盖它，只能向左右各looked 1 列找。若左右两侧都能命中且不
    是同一个表头，判定为无法自动消歧，直接抛错交给人工复核（本文件目前只有 1 处真的
    出现平局：昭山阀室，用"哪个候选管道的区块正好在这一行收尾"打破平局，见下方注释）。
    """
    for n in nodes:
        r, c = n["row"], n["col"]
        candidates = [
            h for h in headers
            if h["col_start"] <= c <= h["col_end"] and h["row"] < r <= h["end_row"]
        ]
        if candidates:
            best = max(candidates, key=lambda h: h["row"])
            n["pipeline"] = best["name"]

    unassigned = [n for n in nodes if "pipeline" not in n]
    for n in unassigned:
        r, c = n["row"], n["col"]
        candidates = [
            h for h in headers
            if h["col_start"] - 1 <= c <= h["col_end"] + 1 and h["row"] < r <= h["end_row"]
        ]
        if len(candidates) == 1:
            n["pipeline"] = candidates[0]["name"]
            print(f"[邻列兜底] {n['text']!r} r={r} c={c} -> 挂到 {candidates[0]['name']!r}（本列自身无表头覆盖，取左右邻列唯一命中的管道）")
        elif len(candidates) > 1:
            exact_end = [h for h in candidates if h["end_row"] == r]
            if len(exact_end) == 1:
                n["pipeline"] = exact_end[0]["name"]
                print(
                    f"[邻列兜底·平局打破] {n['text']!r} r={r} c={c} -> 挂到 {exact_end[0]['name']!r}"
                    f"（候选 {[h['name'] for h in candidates]} 平局，取区块正好在本行收尾的那个，建议人工复核）"
                )
            else:
                raise ValueError(f"节点 {n} 邻列兜底仍有多个候选、且无法用收尾行打破平局：{candidates}")
        else:
            raise ValueError(f"节点 {n} 找不到任何可归属的管道（自身列、左右邻列都没有覆盖它的表头）")


# ==============================================================================
# 4. zoneId：图例自描述 + 两个已知缺陷的显式修正
# ==============================================================================

LEGEND_TEXT_COL = 16
LEGEND_SWATCH_COL = 15
LEGEND_ROW_RANGE = range(30, 40)

# 缺陷 a）图例里同色的两个作业区，靠节点所属管道消歧。
XIANGXI_PIPELINES = {"龙山-花垣输气管道", "花垣-怀化输气管道", "花垣-张家界输气管道", "麻阳-辰溪输气管道"}
CHENZHOU_PIPELINES = {"桂阳-郴州-资兴输气管道", "桂阳-临武输气管道"}

# 缺陷 b）图例色块滞后于表体实际配色，表体节点用的是图例里查不到的"孤儿色"。
ORPHAN_RGB_TO_ZONE_NAME = {
    (153, 204, 255): "长沙作业区",
    (153, 204, 0): "永郴作业区",
}

# 作业区中文名 -> 英文 slug，需与并行编写的 scripts/map3d/contract.js 的 ZONE_IDS 对齐。
# 命名说明：湘娄作业区（湘潭+娄底）与永郴作业区（永州+郴州）是业务上的合并分区，
# 不是"湘潭作业区"/"永州作业区"。slug 相应取 xianglou/yongchen，与 contract.js 的
# 分区名，不是拼写错误——见运行报告）。本文件遵从 contract.js 的 id 顺序与 slug，但
# zones[].name 如实使用 xls 图例的原文，不替业务方"纠正"命名。
ZONE_NAME_TO_SLUG = {
    "岳阳作业区": "yueyang",
    "长沙作业区": "changsha",
    "湘娄作业区": "xianglou",
    "株洲作业区": "zhuzhou",
    "衡阳作业区": "hengyang",
    "永郴作业区": "yongchen",
    "湘北作业区": "xiangbei",
    "湘中作业区": "xiangzhong",
    "郴州作业区": "chenzhou",
    "湘西作业区": "xiangxi",
}
ZONE_SLUG_ORDER = [
    "yueyang", "changsha", "xianglou", "zhuzhou", "hengyang",
    "yongchen", "xiangbei", "xiangzhong", "chenzhou", "xiangxi",
]


def parse_legend(book, sheet, text: dict) -> dict:
    """图例区域：col16 是作业区中文名，col15 是它的填充色swatch。返回 rgb -> [中文名,...]
    （用 list 是因为缺陷 a 会让同一个 rgb 对应 2 个名字，必须让这个"重复"在数据里显式
    可见，不能用普通 dict 悄悄覆盖掉）。
    """
    legend_rgb_to_names: dict = defaultdict(list)
    names_seen = []
    for r in LEGEND_ROW_RANGE:
        name = text.get((r, LEGEND_TEXT_COL))
        if not name:
            raise ValueError(f"图例第 {r} 行缺少作业区名称（col{LEGEND_TEXT_COL}）")
        rgb = get_rgb(book, sheet, r, LEGEND_SWATCH_COL)
        if rgb is None:
            raise ValueError(f"图例条目 {name!r} 在 col{LEGEND_SWATCH_COL} 读不到填充色")
        legend_rgb_to_names[rgb].append(name)
        names_seen.append(name)

    if len(names_seen) != 10:
        raise AssertionError(f"图例应有 10 个作业区，实际读到 {len(names_seen)} 个：{names_seen}")
    for name in names_seen:
        if name not in ZONE_NAME_TO_SLUG:
            raise ValueError(f"图例作业区名称 {name!r} 没有对应的英文 slug，请检查 ZONE_NAME_TO_SLUG")
    return dict(legend_rgb_to_names)


def resolve_zone_name(book, sheet, node: dict, legend_rgb_to_names: dict) -> tuple[str, tuple[int, int, int]]:
    rgb = get_rgb(book, sheet, node["row"], node["col"])
    if rgb is None:
        raise ValueError(f"节点 {node['text']!r} (r={node['row']},c={node['col']}) 没有填充色，无法判定作业区")

    names = legend_rgb_to_names.get(rgb)
    if names:
        if len(names) == 1:
            return names[0], rgb
        pipeline = node["pipeline"]
        if pipeline in XIANGXI_PIPELINES:
            return "湘西作业区", rgb
        if pipeline in CHENZHOU_PIPELINES:
            return "郴州作业区", rgb
        raise ValueError(
            f"节点 {node['text']!r} 的填充色 {rgb} 在图例里同时对应 {names}，且它所属管道 "
            f"{pipeline!r} 不在已知的消歧名单（XIANGXI_PIPELINES / CHENZHOU_PIPELINES）里，"
            "无法自动判定，请人工复核"
        )

    if rgb in ORPHAN_RGB_TO_ZONE_NAME:
        return ORPHAN_RGB_TO_ZONE_NAME[rgb], rgb

    raise ValueError(
        f"节点 {node['text']!r} (r={node['row']},c={node['col']}) 的填充色 rgb={rgb} 既不在图例"
        f"里、也不在已知孤儿色表 ORPHAN_RGB_TO_ZONE_NAME 里——这是最可能出问题的地方，"
        "需要人工确认这个颜色到底属于哪个作业区后再补进映射表，不能瞎猜。"
    )


# ==============================================================================
# 5. 管道元信息（id / 输气 or 输油）——这是本脚本里唯一手写的业务事实表，
#    因为 id 是我们自己起的英文 slug（源文件里没有），gas/oil 划分依据见文件头注释与
#    运行报告（核对了《国家管网湖南成品油管道线路全图》）。
# ==============================================================================

PIPELINE_META = {
    "潜江-韶关输气管道": ("qianjiang-shaoguan", "gas"),
    "华南安输气管道": ("huanan-an", "gas"),
    "龙山-花垣输气管道": ("longshan-huayuan", "gas"),
    "花垣-怀化输气管道": ("huayuan-huaihua", "gas"),
    "花垣-张家界输气管道": ("huayuan-zhangjiajie", "gas"),
    "麻阳-辰溪输气管道": ("mayang-chenxi", "gas"),
    "邵阳市-邵阳县输气管道": ("shaoyangshi-shaoyangxian", "gas"),
    "邵阳-邵东市输气管道": ("shaoyang-shaodongshi", "gas"),
    "邵东-双峰输气管道": ("shaodong-shuangfeng", "gas"),
    "邵阳-洞口-新宁输气管道": ("shaoyang-dongkou-xinning", "gas"),
    "洞口支线": ("dongkou-branch", "gas"),
    "桂阳-郴州-资兴输气管道": ("guiyang-chenzhou-zixing", "gas"),
    "桂阳-临武输气管道": ("guiyang-linwu", "gas"),
    "永州市-邵阳县输气管道": ("yongzhoushi-shaoyangxian", "gas"),
    "忠武线潜湘支线": ("zhongwuxian-qianxiang-branch", "gas"),
    "兰郑长管道": ("lanzhengchang", "gas"),
    "长郴管道": ("changchen", "oil"),
    "西三线长沙支线": ("xisanxian-changsha-branch", "gas"),
    "长沙支线": ("changsha-branch", "gas"),
    "湘潭支线": ("xiangtan-branch", "gas"),
    "湘株支线": ("xiangzhu-branch", "oil"),
    "湘娄支线": ("xianglou-branch", "oil"),
    "西二线樟湘联络线": ("xierxian-zhangxiang-link", "gas"),
    "广西支干线": ("guangxi-branch-trunk", "gas"),
}


# ==============================================================================
# 6. 主流程
# ==============================================================================

def main() -> None:
    book, sheet = load_sheet()
    text, occupied, merge_span = build_text_and_occupied(sheet)
    print(f"[load] {XLS_PATH.name} / sheet={SOURCE_SHEET_NAME!r}  nrows={sheet.nrows} ncols={sheet.ncols}  非空文本单元格={len(text)}")

    headers_raw: list[dict] = []
    nodes_raw: list[dict] = []
    excluded: list[tuple[int, int, str, str]] = []
    for (r, c), t in sorted(text.items()):
        kind = classify_cell(r, t)
        if kind == "pipeline_name":
            span = merge_span.get((r, c), (r, c, c))
            headers_raw.append({"row": r, "col_start": span[1], "col_end": span[2], "name": t})
        elif kind in ("valve", "station"):
            nodes_raw.append({"row": r, "col": c, "text": t, "kind": kind})
        else:
            excluded.append((r, c, t, kind))

    headers = dedupe_headers(headers_raw)
    for h in headers:
        h["end_row"] = compute_header_end_row(h, occupied, sheet.nrows)

    for name in [h["name"] for h in headers]:
        if name not in PIPELINE_META:
            raise ValueError(f"表头 {name!r} 没有登记在 PIPELINE_META 里，请补上 id 与 gas/oil")

    assign_pipelines(nodes_raw, headers)

    legend_rgb_to_names = parse_legend(book, sheet, text)
    print("\n[图例] rgb -> 作业区名：")
    for rgb, names in legend_rgb_to_names.items():
        flag = "  ⚠️ 同色多义，靠管道消歧" if len(names) > 1 else ""
        print(f"  {rgb}  {names}{flag}")
    print("[图例] 孤儿色（图例里没有、但表体节点在用）：")
    for rgb, name in ORPHAN_RGB_TO_ZONE_NAME.items():
        print(f"  {rgb}  -> {name}")

    for n in nodes_raw:
        n["zone_name"], n["rgb"] = resolve_zone_name(book, sheet, n, legend_rgb_to_names)

    # ---- 组装 zones ----
    zone_kind_counter: Counter = Counter((n["zone_name"], n["kind"]) for n in nodes_raw)
    zone_rgb_seen: dict[str, set] = defaultdict(set)
    for n in nodes_raw:
        zone_rgb_seen[n["zone_name"]].add(n["rgb"])

    zones = []
    slug_to_name = {v: k for k, v in ZONE_NAME_TO_SLUG.items()}
    for slug in ZONE_SLUG_ORDER:
        zh_name = slug_to_name[slug]
        rgbs = sorted(zone_rgb_seen.get(zh_name, set()))
        if len(rgbs) != 1:
            raise ValueError(f"作业区 {zh_name!r} 的节点里出现了 {len(rgbs)} 种不同填充色：{rgbs}，理论上应恰好 1 种")
        zones.append({
            "id": slug,
            "name": zh_name,
            "rgb": list(rgbs[0]),
            "stationCount": zone_kind_counter.get((zh_name, "station"), 0),
            "valveCount": zone_kind_counter.get((zh_name, "valve"), 0),
        })

    # ---- 组装 pipelines + nodes（id / seq） ----
    STATION_COUNT_ANNOTATIONS = [(1, 9, 13), (1, 12, 10), (1, 15, 5), (1, 19, 11)]
    top_headers = [h for h in headers if h["row"] <= 2]
    annotation_for_pipeline: dict[str, int] = {}
    print("\n[交叉核对] 源表「XX座站场」批注 vs 实际 station 计数：")
    for (r, c, claimed) in STATION_COUNT_ANNOTATIONS:
        qualifying = [h for h in top_headers if h["col_end"] <= c]
        if not qualifying:
            raise ValueError(f"「{claimed}座站场」批注 (r={r},c={c}) 找不到任何可关联的管道表头")
        target = max(qualifying, key=lambda h: h["col_end"])
        annotation_for_pipeline[target["name"]] = claimed

    nodes = []
    pipelines = []
    seq_counter: dict[str, int] = defaultdict(int)
    id_seen: set[str] = set()
    for h in headers:
        pname = h["name"]
        pid, pkind = PIPELINE_META[pname]
        members = [n for n in nodes_raw if n["pipeline"] == pname]
        members.sort(key=lambda n: (n["row"], n["col"]))
        node_ids = []
        for n in members:
            seq_counter[pname] += 1
            seq = seq_counter[pname]
            node_id = f"{pid}-{seq:02d}"
            if node_id in id_seen:
                raise ValueError(f"节点 id 冲突：{node_id}")
            id_seen.add(node_id)
            node_ids.append(node_id)

            raw_lines = n["text"].split("\n")
            name = raw_lines[0].strip()
            note = None
            if len(raw_lines) > 1:
                note = raw_lines[1].strip().strip("（）()")

            nodes.append({
                "id": node_id,
                "name": name,
                "kind": n["kind"],
                "zoneId": ZONE_NAME_TO_SLUG[n["zone_name"]],
                "pipelineId": pid,
                "seq": seq,
                "rgb": list(n["rgb"]),
                "note": note,
            })

        actual_station_count = sum(1 for n in members if n["kind"] == "station")
        annotated = annotation_for_pipeline.get(pname)
        if annotated is not None:
            diff = actual_station_count - annotated
            flag = "" if diff == 0 else f"  ⚠️ 差 {diff:+d}（不静默对齐，仅记录，见运行报告）"
            print(f"  {pname:16} 批注={annotated:2}座站场  实际 station 数={actual_station_count:2}{flag}")

        pipelines.append({
            "id": pid,
            "name": pname,
            "kind": pkind,
            "nodeIds": node_ids,
            "annotatedStationCount": annotated,
        })

    # ---- 自检 ----
    self_check(zones, pipelines, nodes, headers)

    # ---- 生成 .js ----
    meta = {
        "title": "湖南公司输油气站场阀室-作业区位置关系图",
        "version": "V3-20260119",
        "source": XLS_PATH.name,
        "pipelineCount": len(pipelines),
        "stationCount": sum(1 for n in nodes if n["kind"] == "station"),
        "valveCount": sum(1 for n in nodes if n["kind"] == "valve"),
    }
    payload = render_js(meta, zones, pipelines, nodes)

    written = []
    for out_dir in DATA_OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / OUTPUT_FILENAME
        out_path.write_text(payload, encoding="utf-8")
        written.append(out_path)
        print(f"[write] {out_path.relative_to(PROJECT_ROOT)}")

    for p in written:
        run_node_check(p)

    print_excluded_log(excluded)
    print_zero_node_pipeline_warning(pipelines)

    print("\n" + "=" * 78)
    print(
        f"DONE. {len(zones)} zones / {len(pipelines)} pipelines / {len(nodes)} nodes "
        f"written to {len(DATA_OUT_DIRS)} POC(s):"
    )
    for out_dir in DATA_OUT_DIRS:
        print("  -", out_dir.relative_to(PROJECT_ROOT))
    print("=" * 78)


# ==============================================================================
# 7. 自检
# ==============================================================================

def self_check(zones: list[dict], pipelines: list[dict], nodes: list[dict], headers: list[dict]) -> None:
    if len(zones) != 10:
        raise AssertionError(f"作业区数应为 10，实际 {len(zones)}")

    total_nodes = len(nodes)
    zone_sum = sum(z["stationCount"] + z["valveCount"] for z in zones)
    if zone_sum != total_nodes:
        raise AssertionError(f"各作业区 station+valve 之和={zone_sum}，节点总数={total_nodes}，不相等")

    for n in nodes:
        if not n["zoneId"]:
            raise AssertionError(f"节点 {n['id']} 的 zoneId 为空")

    ids = [n["id"] for n in nodes]
    if len(set(ids)) != len(ids):
        dupes = [i for i, cnt in Counter(ids).items() if cnt > 1]
        raise AssertionError(f"节点 id 不唯一：{dupes}")

    by_pipeline: dict[str, list[int]] = defaultdict(list)
    for n in nodes:
        by_pipeline[n["pipelineId"]].append(n["seq"])
    for pid, seqs in by_pipeline.items():
        seqs.sort()
        if seqs != list(range(1, len(seqs) + 1)):
            raise AssertionError(f"管道 {pid} 的 seq 应为 1..{len(seqs)} 连续，实际 {seqs}")

    print(f"\n[自检] 通过：10 作业区 / {len(pipelines)} 管道 / {total_nodes} 节点，zoneId 全非空，id 全局唯一，seq 逐管道连续。")


# ==============================================================================
# 8. 渲染 .js（ES5 IIFE，无时间戳，字节级可重复）
# ==============================================================================

def render_js(meta: dict, zones: list[dict], pipelines: list[dict], nodes: list[dict]) -> str:
    lines = []
    lines.append("// 本文件由 tools/build-topology.py 生成，不要手改；改数据请改源 XLS 后重跑。")
    lines.append(f"// 源文件：{meta['source']}（sheet: {SOURCE_SHEET_NAME}）")
    lines.append(
        f"// 条目数：zones={len(zones)}, pipelines={len(pipelines)}, "
        f"nodes={len(nodes)}（station={meta['stationCount']}, valve={meta['valveCount']}）"
    )
    lines.append("(function () {")
    lines.append('  "use strict";')
    lines.append("")
    lines.append("  var meta = " + _indent(json.dumps(meta, ensure_ascii=False, indent=2)) + ";")
    lines.append("")
    lines.append("  var zones = " + _indent(json.dumps(zones, ensure_ascii=False, indent=2)) + ";")
    lines.append("")
    lines.append("  var pipelines = " + _indent(json.dumps(pipelines, ensure_ascii=False, indent=2)) + ";")
    lines.append("")
    lines.append("  var nodes = " + _indent(json.dumps(nodes, ensure_ascii=False, indent=2)) + ";")
    lines.append("")
    lines.append("  if (window.HunanTopology) {")
    lines.append('    throw new Error("[HunanTopology] window.HunanTopology 已存在，topology.js 被重复加载？");')
    lines.append("  }")
    lines.append("  window.HunanTopology = {")
    lines.append("    meta: meta,")
    lines.append("    zones: zones,")
    lines.append("    pipelines: pipelines,")
    lines.append("    nodes: nodes")
    lines.append("  };")
    lines.append("})();")
    lines.append("")
    return "\n".join(lines)


def _indent(payload: str) -> str:
    lines = payload.splitlines()
    return "\n".join((("  " + line) if line else line) for line in lines).lstrip()


def run_node_check(path: Path) -> None:
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"node --check failed for {path}:\n{result.stdout}\n{result.stderr}")
    print(f"[node --check] OK  {path.relative_to(PROJECT_ROOT)}")


# ==============================================================================
# 9. 日志
# ==============================================================================

EXCLUDE_REASON_CN = {
    "title": "图纸标题",
    "legend_zone": "图例条目（作业区名）",
    "annotation_station_count": "顶部「XX座站场」统计批注，非节点本身",
    "annotation_note": "氮气封存相关批注文字，非节点本身",
    "not_commissioned": "未投产管段标记，非实体节点",
    "province_border": "省界标记（非阀室/站场实体）",
}


def print_excluded_log(excluded: list[tuple[int, int, str, str]]) -> None:
    print("\n" + "=" * 78)
    print(f"被排除的单元格清单（共 {len(excluded)} 条，人工复核用）")
    print("=" * 78)
    for (r, c, t, kind) in excluded:
        reason = EXCLUDE_REASON_CN.get(kind, kind)
        print(f"  r={r:2} c={c:2}  text={t!r:40}  reason={reason}")


def print_zero_node_pipeline_warning(pipelines: list[dict]) -> None:
    empties = [p["name"] for p in pipelines if not p["nodeIds"]]
    if empties:
        print("\n[提示] 以下管道表头在源表里没有任何节点挂在下面（可能是尚未细化的占位表头，非本脚本 bug）：")
        for name in empties:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
