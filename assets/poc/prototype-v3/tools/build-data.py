#!/usr/bin/env python3
"""Build prototype-v3 runtime data from per-area JSON/CSV packages."""

from __future__ import annotations

import csv
import json
from copy import deepcopy
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
AREAS_DIR = DATA_DIR / "areas"
OUT_FILE = ROOT / "scripts" / "data.js"

FORM_COLUMNS = ["item", "areaKey", "no", "area", "device", "check", "result", "hot"]
TREND_COLUMNS = ["label", "value"]
FRAME_RUNTIME_KEYS = ["src", "title", "scene", "label", "showBbox"]
REQUIRED_FRAME_KEYS = ["current", "compare", "plc"]
AREA_RUNTIME_KEYS = [
    "title", "short", "overviewTitle", "overviewDesc", "overviewStatus",
    "overviewAction", "overviewSecondary", "overviewTarget", "overviewStats",
    "sub", "badge", "badgeTone", "trendKey", "evidence", "tags", "assets",
    "quality", "formExplain", "auxiliaryOnly",
]
QUALITY_KEYS = ["title", "text", "facts"]
LIFECYCLE_KEYS = ["role", "primaryFlow", "stages", "terminalState"]


def read_json(path: Path) -> Any:
    if not path.is_file():
      raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8") as handle:
      return json.load(handle)


def require_keys(obj: dict[str, Any], keys: list[str], label: str) -> None:
    missing = [key for key in keys if key not in obj]
    if missing:
      raise KeyError(f"{label} missing keys: {', '.join(missing)}")


def parse_bool(value: str, label: str) -> bool:
    if value == "true":
      return True
    if value == "false":
      return False
    raise ValueError(f"{label} must be true or false: {value}")


def parse_number(value: str, label: str) -> int | float:
    try:
      number = float(value)
    except ValueError as exc:
      raise ValueError(f"{label} must be numeric: {value}") from exc
    if number.is_integer():
      return int(number)
    return number


def read_csv_rows(path: Path, columns: list[str]) -> list[dict[str, str]]:
    if not path.is_file():
      raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8", newline="") as handle:
      reader = csv.DictReader(handle)
      if reader.fieldnames != columns:
        raise ValueError(f"{path} columns must be {columns}, got {reader.fieldnames}")
      return list(reader)


def read_form_rows(area_key: str, area_dir: Path) -> list[dict[str, Any]]:
    raw_rows = read_csv_rows(area_dir / "form-items.csv", FORM_COLUMNS)
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(raw_rows, start=2):
      if row["areaKey"] != area_key:
        raise ValueError(f"{area_dir}/form-items.csv:{index} areaKey mismatch: {row['areaKey']}")
      rows.append({
        "item": row["item"],
        "areaKey": row["areaKey"],
        "no": int(row["no"]),
        "area": row["area"],
        "device": row["device"],
        "check": row["check"],
        "result": row["result"],
        "hot": parse_bool(row["hot"], f"{area_key} form row {row['item']} hot"),
      })
    if not rows:
      raise ValueError(f"{area_key} has no form rows")
    return rows


def read_trends(area_key: str, area_dir: Path) -> dict[str, dict[str, Any]]:
    trend_defs = read_json(area_dir / "trends.json")
    if not isinstance(trend_defs, dict) or not trend_defs:
      raise ValueError(f"{area_key} trends.json must be a non-empty object")

    result: dict[str, dict[str, Any]] = {}
    for trend_key, trend in trend_defs.items():
      require_keys(
        trend,
        ["title", "unit", "threshold", "safeSide", "min", "max", "quality", "window", "summary", "file"],
        f"{area_key} trend {trend_key}",
      )
      raw_points = read_csv_rows(area_dir / trend["file"], TREND_COLUMNS)
      points = [[row["label"], parse_number(row["value"], f"{area_key} trend {trend_key} value")] for row in raw_points]
      if len(points) < 2:
        raise ValueError(f"{area_key} trend {trend_key} must have at least 2 points")
      runtime_trend = {key: value for key, value in trend.items() if key != "file"}
      runtime_trend["points"] = points
      result[trend_key] = runtime_trend
    return result


def read_frames(area_key: str, area_dir: Path) -> dict[str, dict[str, Any]]:
    frames = read_json(area_dir / "frames.json")
    if not isinstance(frames, dict):
      raise ValueError(f"{area_key} frames.json must be an object")
    for frame_key in REQUIRED_FRAME_KEYS:
      if frame_key not in frames:
        raise KeyError(f"{area_key} frames.json missing frame key: {frame_key}")

    result: dict[str, dict[str, Any]] = {}
    for frame_key, frame in frames.items():
      require_keys(frame, FRAME_RUNTIME_KEYS, f"{area_key} frame {frame_key}")
      frame_file = area_dir / frame["src"]
      if not frame_file.is_file():
        raise FileNotFoundError(frame_file)
      result[frame_key] = {
        "src": f"data/areas/{area_key}/{frame['src']}",
        "title": frame["title"],
        "scene": frame["scene"],
        "label": frame["label"],
        "showBbox": frame["showBbox"],
      }
    return result


def validate_area(area_key: str, area: dict[str, Any]) -> None:
    require_keys(area, AREA_RUNTIME_KEYS, f"{area_key} area")
    require_keys(area["quality"], QUALITY_KEYS, f"{area_key} area.quality")
    for field in ["overviewStats", "tags", "assets", "formExplain"]:
      if not isinstance(area[field], list) or not area[field]:
        raise ValueError(f"{area_key} area.{field} must be a non-empty list")
    if not isinstance(area["quality"]["facts"], list) or not area["quality"]["facts"]:
      raise ValueError(f"{area_key} area.quality.facts must be a non-empty list")


def read_questions(area_key: str, area_dir: Path) -> list[dict[str, str]]:
    questions = read_json(area_dir / "questions.json")
    if not isinstance(questions, list) or not questions:
      raise ValueError(f"{area_key}/questions.json must be a non-empty list")
    for index, question in enumerate(questions):
      require_keys(question, ["q", "a"], f"{area_key} questions[{index}]")
    return questions


def read_lifecycle(area_key: str, area_dir: Path) -> dict[str, Any]:
    lifecycle = read_json(area_dir / "lifecycle.json")
    require_keys(lifecycle, LIFECYCLE_KEYS, f"{area_key}/lifecycle.json")
    if not isinstance(lifecycle["stages"], list) or not lifecycle["stages"]:
      raise ValueError(f"{area_key} lifecycle.stages must be a non-empty list")
    for index, stage in enumerate(lifecycle["stages"]):
      require_keys(stage, ["scene", "purpose"], f"{area_key} lifecycle.stages[{index}]")
    return lifecycle


def build_data() -> dict[str, Any]:
    demo = read_json(DATA_DIR / "demo.json")
    area_index = read_json(DATA_DIR / "area-index.json")
    require_keys(area_index, ["schemaVersion", "order", "primaryFlow"], "area-index")
    if area_index["schemaVersion"] != 1:
      raise ValueError(f"unsupported area-index schemaVersion: {area_index['schemaVersion']}")

    result = deepcopy(demo)
    result["shell"]["primaryFlow"] = area_index["primaryFlow"]
    result["overview"]["areaOrder"] = area_index["order"]
    result["overview"]["findings"] = []
    result["areas"] = {}

    inspection_rows: list[dict[str, Any]] = []
    item_details: dict[str, Any] = {}
    trend_series: dict[str, Any] = {}
    frame_sources: dict[str, Any] = {}

    for area_key in area_index["order"]:
      area_dir = AREAS_DIR / area_key
      area_package = read_json(area_dir / "area.json")
      require_keys(area_package, ["key", "area", "finding"], f"{area_key}/area.json")
      if area_package["key"] != area_key:
        raise ValueError(f"{area_key}/area.json key mismatch: {area_package['key']}")

      area = area_package["area"]
      validate_area(area_key, area)
      area["questions"] = read_questions(area_key, area_dir)
      area["lifecycle"] = read_lifecycle(area_key, area_dir)
      result["areas"][area_key] = area
      if area_package["finding"] is not None:
        result["overview"]["findings"].append(area_package["finding"])

      area_rows = read_form_rows(area_key, area_dir)
      inspection_rows.extend(area_rows)

      details = read_json(area_dir / "item-details.json")
      if not isinstance(details, dict):
        raise ValueError(f"{area_key}/item-details.json must be an object")
      row_items = {row["item"] for row in area_rows}
      for item_key, detail in details.items():
        if item_key not in row_items:
          raise KeyError(f"{area_key} item detail has no matching form row: {item_key}")
        if item_key in item_details:
          raise KeyError(f"duplicate item detail: {item_key}")
        require_keys(detail, ["evidence", "tags", "trendKey", "image"], f"{area_key} item detail {item_key}")
        item_details[item_key] = detail

      for trend_key, trend in read_trends(area_key, area_dir).items():
        if trend_key in trend_series:
          raise KeyError(f"duplicate trend key: {trend_key}")
        trend_series[trend_key] = trend

      frame_sources[area_key] = read_frames(area_key, area_dir)

      if area["trendKey"] not in trend_series:
        raise KeyError(f"{area_key} area trendKey missing trend: {area['trendKey']}")
      for item_key, detail in details.items():
        if detail["trendKey"] not in trend_series:
          raise KeyError(f"{area_key} item {item_key} trendKey missing trend: {detail['trendKey']}")
        if detail["image"] not in frame_sources[area_key]:
          raise KeyError(f"{area_key} item {item_key} image missing frame: {detail['image']}")

    primary_flow = result["shell"]["primaryFlow"]
    require_keys(primary_flow, ["areaKey", "itemKey", "trendKey", "frameKey"], "area-index primaryFlow")
    primary_area = primary_flow["areaKey"]
    if primary_area not in result["areas"]:
      raise KeyError(f"primaryFlow areaKey missing area: {primary_area}")
    primary_item = primary_flow["itemKey"]
    if primary_item not in item_details:
      raise KeyError(f"primaryFlow itemKey missing itemDetails: {primary_item}")
    if not any(row["areaKey"] == primary_area and row["item"] == primary_item for row in inspection_rows):
      raise KeyError(f"primaryFlow itemKey missing form row in area {primary_area}: {primary_item}")
    if primary_flow["trendKey"] not in trend_series:
      raise KeyError(f"primaryFlow trendKey missing trend: {primary_flow['trendKey']}")
    if primary_flow["frameKey"] not in frame_sources[primary_area]:
      raise KeyError(f"primaryFlow frameKey missing frame: {primary_flow['frameKey']}")

    result["analysis"]["inspectionRows"] = inspection_rows
    result["analysis"]["itemDetails"] = item_details
    result["analysis"]["trendSeries"] = trend_series
    result["analysis"]["frameSources"] = frame_sources
    return result


def write_runtime_data(data: dict[str, Any]) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    OUT_FILE.write_text(
        "(function () {\n"
        "  \"use strict\";\n\n"
        f"  window.DEMO_V3_DATA = {payload};\n"
        "})();\n",
        encoding="utf-8",
    )


def main() -> None:
    write_runtime_data(build_data())
    print(f"generated {OUT_FILE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
