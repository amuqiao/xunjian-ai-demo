#!/usr/bin/env python3
"""把湖南省 14 个地级行政区的 GeoJSON 边界抽稀 + 投影后生成为前端可直接用的 .js 纯字面量。

用法（纯标准库，不需要额外依赖，也不需要 uv 装包）：
    cd /Users/admin/Code/xunjian-ai-demo
    uv run python poc/hunan-inspection-overview/tools/build-geo.py
    # 可选：换抽稀容差（默认 0.005 度）
    uv run python poc/hunan-inspection-overview/tools/build-geo.py --tolerance 0.01

数据源：assets/geo/hunan-430000-full.geojson（来源与取回信息见同目录 README.md）。

投影约定（喂给 Three.js 的 THREE.Shape + ExtrudeGeometry，Y 轴向上、地图铺在 XZ 平面）：
  以湖南省经纬度包围盒中心为世界坐标原点，X 向东为正、Z 向南为正（纬度越大 Z 越小）。
  采用等距圆柱投影，并按包围盒中心纬度 lat0 做 cos 校正抵消"经度 1° 的实际距离随纬度
  收缩"的问题：

      x = (lon - lon0) * cos(lat0) * k
      z = -(lat - lat0) * k

  lon0/lat0 取全省（简化前）经纬度包围盒的中心，k 取使 X 跨度落在约 600 世界单位
  （与 poc/inspection-3d-sandbox 的 680x460 站场沙盘同量级）。

  跑完本脚本后，实际取值与四角世界坐标见下方 ASCII 草图（数值由脚本打印，此处手工
  誊抄自最近一次运行；lon0/lat0/k/cosLat0 的权威取值以生成的 geo.js 里的
  meta.projection 为准）：

      lat=30.126 ┌───────────────────────────────┐ lat=30.126
      lon=108.792│ (minX=-300.00, maxZ=339.18)    │ lon=114.260
                 │                                 │
                 │        lon0=111.526162          │
                 │        lat0=27.381269           │
                 │        k=123.575933             │
                 │        cosLat0=0.887966         │
                 │                                 │
      lat=24.637 │ (minX=-300.00, maxZ=-339.18)   │ lat=24.637
      lon=108.792└───────────────────────────────┘ lon=114.260
                  minX=-300.00        maxX=300.00

  （X 跨度按定义精确为 600；Z 跨度约 678.4——湖南实际南北 physical 跨度比东西宽，
  这是真实地理形状，不是 bug。四角连线只是示意 bbox 位置，湖南省本身不是矩形。）

  同一套 lon0/lat0/k/cosLat0 也导出为 geo.js 里的 window.HunanGeo.lonLatToWorld
  函数与 meta.projection 字段——站点经纬度必须调用它换算，不要另起一套投影参数，
  否则站点会飘在省界外面。

抽稀：Douglas-Peucker，逐环独立抽稀，容差默认 0.005 度。环首尾点保持相同（闭合）；
若某个环抽稀后点数少于 4（退化成线，THREE.Shape 会出问题），保留该环的原始点，
并在日志里报告，不做静默丢弃。岳阳市（2 个多边形）、怀化市（3 个多边形）的
全部多边形都会保留（那是湖区岛屿/飞地，只取第一个环省形会缺角）。

质心：多边形面积质心（不是包围盒中心，也不是顶点平均）。原始数据里每个 Polygon
只有 1 个环（无空洞），多个 Polygon 之间是互不重叠的独立地块（岛屿/飞地），
质心按各地块面积加权平均；若某个 Polygon 出现空洞（第 2 个环起），会从质心权重
与面积中排除该环并从面积里扣除（generic 处理，当前湖南数据没有触发这个分支）。

硬约束：GeoJSON 结构、投影结果、抽稀结果只要有一项不符合预期，直接抛异常并打印
实际读到的内容；不写 fallback / silent catch / 默认值吞错。只用标准库
（json / math / pathlib / argparse），不引入 shapely/pyproj。
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
POC_ROOT = TOOLS_DIR.parent  # .../poc/hunan-inspection-overview
POC_PARENT = POC_ROOT.parent  # .../poc
PROJECT_ROOT = POC_PARENT.parent  # .../xunjian-ai-demo

GEOJSON_PATH = PROJECT_ROOT / "assets" / "geo" / "hunan-430000-full.geojson"

# 输出到**两个** POC。两个页面各自持有完整的一份省界数据，运行时零共享；但省界本身
# 只有一份真源（同一份 GeoJSON + 同一套抽稀/投影参数），所以构建时同源、一次跑完
# 写两份字节级相同的副本。改容差或换数据源时跑一条命令同步两边。
DATA_OUT_DIRS = [
    POC_ROOT / "scripts" / "data",
    POC_PARENT / "hunan-pump-overview" / "scripts" / "data",
]

EXPECTED_ADCODES = [
    "430100", "430200", "430300", "430400", "430500", "430600", "430700",
    "430800", "430900", "431000", "431100", "431200", "431300", "433100",
]

DEFAULT_TOLERANCE_DEG = 0.005
TARGET_X_SPAN = 600.0
RING_COORD_DECIMALS = 2
PROJECTION_META_DECIMALS = 6
CENTROID_EPS = 1e-9


# ==========================================================================
# 1. 读 GeoJSON
# ==========================================================================

def load_geojson() -> dict:
    if not GEOJSON_PATH.is_file():
        raise FileNotFoundError(f"geojson not found: {GEOJSON_PATH}")
    with GEOJSON_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("type") != "FeatureCollection":
        raise ValueError(f"expected FeatureCollection, actual type={data.get('type')!r}")
    features = data.get("features")
    if not isinstance(features, list) or len(features) != 14:
        raise ValueError(
            f"expected 14 features, actual count={len(features) if isinstance(features, list) else 'N/A'}"
        )
    return data


def extract_polygons(feature: dict) -> list[list[list[list[float]]]]:
    """返回该 feature 的 MultiPolygon coordinates：list[Polygon]，Polygon = list[Ring]。"""
    geom = feature.get("geometry")
    if geom is None or geom.get("type") != "MultiPolygon":
        raise ValueError(
            f"expected geometry.type == MultiPolygon, actual={geom.get('type') if geom else geom!r}"
        )
    coords = geom.get("coordinates")
    if not isinstance(coords, list) or not coords:
        raise ValueError(f"MultiPolygon coordinates empty or malformed: {coords!r}")
    return coords


# ==========================================================================
# 2. Douglas-Peucker 抽稀（逐环，保持闭合）
# ==========================================================================

def _perp_distance(point: list[float], start: list[float], end: list[float]) -> float:
    x0, y0 = point[0], point[1]
    x1, y1 = start[0], start[1]
    x2, y2 = end[0], end[1]
    dx, dy = x2 - x1, y2 - y1
    if dx == 0.0 and dy == 0.0:
        return math.hypot(x0 - x1, y0 - y1)
    return abs(dx * (y0 - y1) - (x0 - x1) * dy) / math.hypot(dx, dy)


def _rdp(points: list[list[float]], epsilon: float) -> list[list[float]]:
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    max_dist = -1.0
    max_idx = -1
    for i in range(1, len(points) - 1):
        d = _perp_distance(points[i], start, end)
        if d > max_dist:
            max_dist = d
            max_idx = i
    if max_dist > epsilon:
        left = _rdp(points[: max_idx + 1], epsilon)
        right = _rdp(points[max_idx:], epsilon)
        return left[:-1] + right
    return [start, end]


def simplify_ring(ring: list[list[float]], tolerance: float, ring_label: str) -> tuple[list[list[float]], bool]:
    """抽稀一个环。返回 (抽稀后的点, 是否回退为原环)。

    要求输入环已闭合（首尾点相同）；RDP 恒保留首尾点，闭合性自动保持。
    """
    if len(ring) < 4:
        raise ValueError(f"{ring_label}: input ring has only {len(ring)} points, expected >= 4 (closed polygon)")
    if ring[0] != ring[-1]:
        raise ValueError(f"{ring_label}: input ring not closed, first={ring[0]!r} last={ring[-1]!r}")

    simplified = _rdp(ring, tolerance)

    if len(simplified) < 4:
        print(
            f"  [WARN] {ring_label}: 抽稀后仅 {len(simplified)} 点（<4），"
            f"回退为原环（{len(ring)} 点），不做静默丢弃。"
        )
        return ring, True
    if simplified[0] != simplified[-1]:
        raise AssertionError(f"{ring_label}: simplified ring lost closure unexpectedly")
    return simplified, False


# ==========================================================================
# 3. 投影
# ==========================================================================

class Projection:
    def __init__(self, lon0: float, lat0: float, k: float) -> None:
        self.lon0 = lon0
        self.lat0 = lat0
        self.cos_lat0 = math.cos(math.radians(lat0))
        self.k = k

    def project(self, lon: float, lat: float) -> tuple[float, float]:
        x = (lon - self.lon0) * self.cos_lat0 * self.k
        z = -(lat - self.lat0) * self.k
        return x, z


def compute_projection(geojson: dict) -> Projection:
    """lon0/lat0 取全省（简化前）经纬度包围盒中心；k 使 X 跨度 = TARGET_X_SPAN。"""
    min_lon = min_lat = math.inf
    max_lon = max_lat = -math.inf
    for feature in geojson["features"]:
        for polygon in extract_polygons(feature):
            for ring in polygon:
                for lon, lat in ring:
                    min_lon = min(min_lon, lon)
                    max_lon = max(max_lon, lon)
                    min_lat = min(min_lat, lat)
                    max_lat = max(max_lat, lat)

    lon0 = (min_lon + max_lon) / 2.0
    lat0 = (min_lat + max_lat) / 2.0
    cos_lat0 = math.cos(math.radians(lat0))
    d_lon = max_lon - min_lon
    k = TARGET_X_SPAN / (d_lon * cos_lat0)

    print(
        f"[projection] lon range=[{min_lon:.6f}, {max_lon:.6f}] (span {d_lon:.6f})  "
        f"lat range=[{min_lat:.6f}, {max_lat:.6f}] (span {max_lat - min_lat:.6f})"
    )
    print(f"[projection] lon0={lon0:.6f} lat0={lat0:.6f} cosLat0={cos_lat0:.6f} k={k:.6f}")
    return Projection(lon0, lat0, k)


# ==========================================================================
# 4. 几何：四舍五入、面积、质心、bbox
# ==========================================================================

def r2(value: float) -> float:
    rounded = round(value, RING_COORD_DECIMALS)
    return 0.0 if rounded == 0.0 else rounded


def rN(value: float, decimals: int) -> float:
    rounded = round(value, decimals)
    return 0.0 if rounded == 0.0 else rounded


def ring_signed_area_and_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    """ring 已闭合（首尾相同）。返回 (signed_area, centroid_x, centroid_z)。"""
    signed_area_acc = 0.0
    cx_acc = 0.0
    cz_acc = 0.0
    n = len(ring) - 1  # 最后一个点与第一个点重复，只走 n 条边
    for i in range(n):
        x0, z0 = ring[i]
        x1, z1 = ring[i + 1]
        cross = x0 * z1 - x1 * z0
        signed_area_acc += cross
        cx_acc += (x0 + x1) * cross
        cz_acc += (z0 + z1) * cross
    signed_area = signed_area_acc / 2.0
    if signed_area == 0.0:
        raise ZeroDivisionError("ring has zero signed area, cannot compute centroid (degenerate polygon)")
    cx = cx_acc / (6.0 * signed_area)
    cz = cz_acc / (6.0 * signed_area)
    return signed_area, cx, cz


def ring_bbox(ring: list[list[float]]) -> dict[str, float]:
    xs = [p[0] for p in ring]
    zs = [p[1] for p in ring]
    return {"minX": min(xs), "maxX": max(xs), "minZ": min(zs), "maxZ": max(zs)}


def merge_bbox(a: dict[str, float], b: dict[str, float]) -> dict[str, float]:
    return {
        "minX": min(a["minX"], b["minX"]),
        "maxX": max(a["maxX"], b["maxX"]),
        "minZ": min(a["minZ"], b["minZ"]),
        "maxZ": max(a["maxZ"], b["maxZ"]),
    }


# ==========================================================================
# 5. 处理单个 feature -> district dict
# ==========================================================================

def build_district(feature: dict, projection: Projection, tolerance: float) -> tuple[dict, int, int]:
    props = feature.get("properties")
    if not isinstance(props, dict) or "adcode" not in props or "name" not in props:
        raise ValueError(f"feature.properties missing adcode/name: {props!r}")
    adcode = str(props["adcode"])
    name = str(props["name"])

    polygons = extract_polygons(feature)

    original_count = 0
    kept_count = 0
    projected_rings: list[list[list[float]]] = []
    exterior_area_weighted_cx = 0.0
    exterior_area_weighted_cz = 0.0
    exterior_weight_sum = 0.0
    total_area = 0.0
    district_bbox: dict[str, float] | None = None
    fallback_ring_count = 0

    for poly_idx, polygon in enumerate(polygons):
        if len(polygon) > 1:
            print(
                f"  [WARN] {adcode} {name}: polygon #{poly_idx} 有 {len(polygon)} 个环"
                "（第 2 个起视为空洞），当前湖南数据不应触发此分支，请复核源数据。"
            )
        for ring_idx, raw_ring in enumerate(polygon):
            ring_label = f"{adcode} {name} poly#{poly_idx} ring#{ring_idx}"
            original_count += len(raw_ring)

            simplified, fell_back = simplify_ring(raw_ring, tolerance, ring_label)
            if fell_back:
                fallback_ring_count += 1
            kept_count += len(simplified)

            projected = [list(projection.project(lon, lat)) for lon, lat in simplified]
            projected_rounded = [[r2(x), r2(z)] for x, z in projected]
            if projected_rounded[0] != projected_rounded[-1]:
                raise AssertionError(f"{ring_label}: projected+rounded ring lost closure")

            projected_rings.append(projected_rounded)

            signed_area, cx, cz = ring_signed_area_and_centroid(projected_rounded)
            abs_area = abs(signed_area)
            total_area += abs_area

            is_hole = ring_idx > 0
            if not is_hole:
                exterior_area_weighted_cx += abs_area * cx
                exterior_area_weighted_cz += abs_area * cz
                exterior_weight_sum += abs_area
            else:
                total_area -= 2 * abs_area  # 抵消上面已加的一次，改为扣除

            bbox = ring_bbox(projected_rounded)
            district_bbox = bbox if district_bbox is None else merge_bbox(district_bbox, bbox)

    if exterior_weight_sum <= 0.0:
        raise ZeroDivisionError(f"{adcode} {name}: exterior_weight_sum <= 0, cannot compute centroid")
    centroid_x = exterior_area_weighted_cx / exterior_weight_sum
    centroid_z = exterior_area_weighted_cz / exterior_weight_sum
    centroid = [r2(centroid_x), r2(centroid_z)]

    assert district_bbox is not None
    district = {
        "adcode": adcode,
        "name": name,
        "rings": projected_rings,
        "centroid": centroid,
        "bbox": {k: r2(v) for k, v in district_bbox.items()},
        "areaWorld": r2(total_area),
    }

    print(
        f"[build] {adcode} {name:<12} polys={len(polygons)} rings={len(projected_rings)} "
        f"points {original_count} -> {kept_count} "
        f"({kept_count / original_count * 100:.1f}%)"
        + (f"  [{fallback_ring_count} ring(s) fell back to original]" if fallback_ring_count else "")
    )

    return district, original_count, kept_count


# ==========================================================================
# 6. 自检
# ==========================================================================

def self_check(districts: list[dict], projection: Projection, world_bbox: dict[str, float]) -> None:
    adcodes = [d["adcode"] for d in districts]
    if adcodes != EXPECTED_ADCODES:
        raise AssertionError(f"adcode set/order mismatch.\n  expected={EXPECTED_ADCODES}\n  actual  ={adcodes}")

    for d in districts:
        for ring in d["rings"]:
            if len(ring) < 4:
                raise AssertionError(f"{d['adcode']} {d['name']}: ring has {len(ring)} points (<4)")
            if ring[0] != ring[-1]:
                raise AssertionError(f"{d['adcode']} {d['name']}: ring not closed")
            for x, z in ring:
                if not (world_bbox["minX"] <= x <= world_bbox["maxX"]):
                    raise AssertionError(f"{d['adcode']} {d['name']}: x={x} out of world bbox X range")
                if not (world_bbox["minZ"] <= z <= world_bbox["maxZ"]):
                    raise AssertionError(f"{d['adcode']} {d['name']}: z={z} out of world bbox Z range")

        cx, cz = d["centroid"]
        bbox = d["bbox"]
        if not (bbox["minX"] <= cx <= bbox["maxX"] and bbox["minZ"] <= cz <= bbox["maxZ"]):
            raise AssertionError(
                f"{d['adcode']} {d['name']}: centroid {d['centroid']} not inside bbox {bbox}"
            )

    origin_x, origin_z = projection.project(projection.lon0, projection.lat0)
    if abs(origin_x) > CENTROID_EPS or abs(origin_z) > CENTROID_EPS:
        raise AssertionError(f"lonLatToWorld(lon0, lat0) should be ~(0,0), got ({origin_x}, {origin_z})")

    print(
        f"[self-check] OK  14 districts, adcode order verified, all rings closed & >=4pts, "
        f"all coords within worldBBox, all centroids inside their own bbox, "
        f"projection origin check passed."
    )


# ==========================================================================
# 7. 生成 .js
# ==========================================================================

def format_district(d: dict) -> str:
    """手工格式化单个 district，避免 json.dumps(indent=2) 对坐标数组逐层换行导致体积暴涨。

    每个环压缩成一行（ring 本身可能有几百个点，但只是一行紧凑 JSON 数组），
    其余标量字段保持人类可读的多行缩进。
    """
    rings_lines = ",\n".join(
        "      " + json.dumps(ring, separators=(",", ":")) for ring in d["rings"]
    )
    return (
        "    {\n"
        f'      "adcode": {json.dumps(d["adcode"])},\n'
        f'      "name": {json.dumps(d["name"], ensure_ascii=False)},\n'
        '      "rings": [\n'
        f"{rings_lines}\n"
        "      ],\n"
        f'      "centroid": {json.dumps(d["centroid"], separators=(",", ":"))},\n'
        f'      "bbox": {json.dumps(d["bbox"], separators=(",", ":"))},\n'
        f'      "areaWorld": {json.dumps(d["areaWorld"])}\n'
        "    }"
    )


def render_js(meta: dict, districts: list[dict], projection: Projection) -> str:
    lines: list[str] = []
    lines.append("// 本文件由 tools/build-geo.py 生成，不要手改；改容差/数据源请改脚本后重跑。")
    lines.append("// 源数据：assets/geo/hunan-430000-full.geojson（来源见同目录 README.md）")
    lines.append(
        "// 投影：等距圆柱 + 按包围盒中心纬度 cos 校正，Y 轴向上、地图铺在 XZ 平面，"
        "x=(lon-lon0)*cosLat0*k，z=-(lat-lat0)*k。参数与推导见 build-geo.py 文件头注释。"
    )
    lines.append(
        f"// 抽稀：Douglas-Peucker，容差 {meta['simplifyTolerance']} 度，逐环独立抽稀并保持闭合。"
    )
    lines.append("(function () {")
    lines.append('  "use strict";')
    lines.append("")

    meta_lines = json.dumps(meta, ensure_ascii=False, indent=2).splitlines()
    meta_indented = "\n".join(
        (meta_lines[0] if i == 0 else "  " + line) for i, line in enumerate(meta_lines)
    )
    lines.append(f"  var META = {meta_indented};")
    lines.append("")

    districts_body = ",\n".join(format_district(d) for d in districts)
    lines.append("  var DISTRICTS = [")
    lines.append(districts_body)
    lines.append("  ];")
    lines.append("")

    lon0 = rN(projection.lon0, PROJECTION_META_DECIMALS)
    lat0 = rN(projection.lat0, PROJECTION_META_DECIMALS)
    k = rN(projection.k, PROJECTION_META_DECIMALS)
    cos_lat0 = rN(projection.cos_lat0, PROJECTION_META_DECIMALS)

    lines.append("  function lonLatToWorld(lon, lat) {")
    lines.append(f"    var lon0 = {lon0};")
    lines.append(f"    var lat0 = {lat0};")
    lines.append(f"    var cosLat0 = {cos_lat0};")
    lines.append(f"    var k = {k};")
    lines.append("    var x = (lon - lon0) * cosLat0 * k;")
    lines.append("    var z = -(lat - lat0) * k;")
    lines.append("    return [x, z];")
    lines.append("  }")
    lines.append("")

    lines.append("  window.HunanGeo = {")
    lines.append("    meta: META,")
    lines.append("    districts: DISTRICTS,")
    lines.append("    lonLatToWorld: lonLatToWorld")
    lines.append("  };")
    lines.append("})();")
    lines.append("")
    return "\n".join(lines)


def write_output_file(payload: str) -> list[Path]:
    written = []
    for out_dir in DATA_OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "geo.js"
        out_path.write_text(payload, encoding="utf-8")
        written.append(out_path)
    return written


def run_node_check(path: Path) -> None:
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"node --check failed for {path}:\n{result.stdout}\n{result.stderr}")
    print(f"[node --check] OK  {path.relative_to(PROJECT_ROOT)}")


# ==========================================================================
# main
# ==========================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tolerance",
        type=float,
        default=DEFAULT_TOLERANCE_DEG,
        help=f"Douglas-Peucker 抽稀容差（度），默认 {DEFAULT_TOLERANCE_DEG}",
    )
    return parser.parse_args()


def main() -> None:
    sys.setrecursionlimit(10000)
    args = parse_args()

    geojson = load_geojson()
    print(f"[load] {GEOJSON_PATH.name} -> {len(geojson['features'])} features")

    projection = compute_projection(geojson)

    districts: list[dict] = []
    total_original = 0
    total_kept = 0
    for feature in geojson["features"]:
        district, original_count, kept_count = build_district(feature, projection, args.tolerance)
        districts.append(district)
        total_original += original_count
        total_kept += kept_count

    districts.sort(key=lambda d: d["adcode"])

    world_bbox = districts[0]["bbox"]
    for d in districts[1:]:
        world_bbox = merge_bbox(world_bbox, d["bbox"])
    world_bbox = {k: r2(v) for k, v in world_bbox.items()}

    print(
        f"\n[totals] originalVertices={total_original} keptVertices={total_kept} "
        f"({total_kept / total_original * 100:.1f}%)"
    )
    print(f"[totals] worldBBox={world_bbox}")

    self_check(districts, projection, world_bbox)

    meta = {
        "source": "assets/geo/hunan-430000-full.geojson (阿里 DataV.GeoAtlas 公开边界服务)",
        "adcodeCount": len(districts),
        "simplifyTolerance": args.tolerance,
        "originalVertices": total_original,
        "keptVertices": total_kept,
        "projection": {
            "lon0": rN(projection.lon0, PROJECTION_META_DECIMALS),
            "lat0": rN(projection.lat0, PROJECTION_META_DECIMALS),
            "k": rN(projection.k, PROJECTION_META_DECIMALS),
            "cosLat0": rN(projection.cos_lat0, PROJECTION_META_DECIMALS),
        },
        "worldBBox": world_bbox,
    }

    payload = render_js(meta, districts, projection)
    written_paths = write_output_file(payload)
    for out_path in written_paths:
        print(f"[write] {out_path.relative_to(PROJECT_ROOT)}")

    for out_path in written_paths:
        run_node_check(out_path)

    sizes = {p: p.stat().st_size for p in written_paths}
    contents = {p: p.read_bytes() for p in written_paths}
    first_content = next(iter(contents.values()))
    for p, content in contents.items():
        if content != first_content:
            raise AssertionError(f"{p} content differs from other output copies, outputs must be byte-identical")

    print("\n" + "=" * 78)
    print(f"DONE. 14 districts written to {len(DATA_OUT_DIRS)} POC(s), byte-identical, sizes:")
    for p, size in sizes.items():
        print(f"  - {p.relative_to(PROJECT_ROOT)}  ({size} bytes)")
    print("=" * 78)


if __name__ == "__main__":
    main()
