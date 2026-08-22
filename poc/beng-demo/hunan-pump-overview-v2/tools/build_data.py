# 把三份真实台账/统计表转成 file:// 能直接 <script> 加载的 .js。
#
# 【为什么要这一步】页面是 file:// 双击打开的，不能 fetch 任何 .json/.xlsx，所以数据必须
# 是 .js。生成物入库（scripts/data/*.js 提交进仓库），本脚本只是可重跑的来源记录 ——
# 生成物顶部会写明源文件、sheet 名与本脚本路径，**不要手改生成物**，改了下次重跑就没了。
#
# 用法（生成时间由参数传入，不在脚本里取 now，保证同样输入永远产出同样字节）：
#   uv run python poc/beng-demo/hunan-pump-overview-v2/tools/build_data.py 2026-08-23
import datetime
import json
import re
import sys
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
DST = HERE.parent / "scripts" / "data"
REPO = HERE.parents[3]

X_LEDGER = "/Users/admin/Code/beng-ai-demo/assets/P2/湖南公司主输泵设备维护保养信息表_-填报.xlsx"
X_FAULT = REPO / "assets/诊断工作台/输油泵机组故障统计表2026(1).xlsx"
X_UNIT = "/Users/admin/Code/beng-ai-demo/assets/P2/IMS系统压缩机（输油泵）单元模型-输油泵已修改.xlsx"

STAMP = sys.argv[1] if len(sys.argv) > 1 else "unknown"

# 站库 → 作业区 + 实测坐标。坐标从旧目录 scripts/data/sites.js 的 surveyed 点位抄来
# （《国家管网湖南成品油管道线路全图》读出的真实位置），154 库那一个是 approx。
# ⚠️ 「长沙输油站」在台账里属兰郑长，而旧目录的 changchen-09「长沙站」属长郴管道 ——
# 两条管线上有同名站，坐标共用一处，这条口径记在 README。
STATIONS = [
    ("长岭站", "yueyang", "岳阳作业区", 113.28, 29.44, "surveyed"),
    ("七里山站", "yueyang", "岳阳作业区", 113.13, 29.38, "surveyed"),
    ("汨罗站", "yueyang", "岳阳作业区", 113.07, 28.81, "surveyed"),
    ("长沙输油站", "changsha", "长沙作业区", 112.90, 28.35, "surveyed"),
    ("湘潭站", "xianglou", "湘娄作业区", 112.94, 27.87, "surveyed"),
    ("衡阳站", "hengyang", "衡阳作业区", 112.61, 26.90, "surveyed"),
    ("154库", "zhuzhou", "株洲作业区", 113.5856, 27.078, "approx"),
]
# 旧目录 sites.js 里的原值，一字不改地带过来 —— model-map.js 要用它算 14 市归属。
ZONE_DISTRICTS = {"yueyang": ["430600"], "changsha": ["430100"], "xianglou": ["430300", "431300"],
                  "zhuzhou": ["430200"], "hengyang": ["430400"], "yongchen": ["431100", "431000"],
                  "xiangbei": ["430700", "430900"], "xiangzhong": ["430500"], "chenzhou": ["431000"],
                  "xiangxi": ["433100", "430800", "431200"]}
ZONE_ADCODE = {"yueyang": ("430600", "岳阳市"), "changsha": ("430100", "长沙市"),
               "xianglou": ("430300", "湘潭市"), "zhuzhou": ("430200", "株洲市"),
               "hengyang": ("430400", "衡阳市")}


def cell(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    return str(v).strip().replace("\n", " ")


def js_head(title, sources):
    lines = ["// " + title, "//",
             "// 【生成物，不要手改】由 tools/build_data.py 生成，重跑即覆盖：",
             "//   uv run python poc/beng-demo/hunan-pump-overview-v2/tools/build_data.py " + STAMP,
             "// 生成时间戳：" + STAMP + "（由命令行传入，不在脚本里取 now —— 同样输入必须产出同样字节）",
             "//", "// 上游真源："]
    for s in sources:
        lines.append("//   " + s)
    return "\n".join(lines) + "\n"


def dump(path, head, body):
    path.write_text(head + body, encoding="utf-8")
    print("  %-28s %6d 行" % (path.name, (head + body).count("\n") + 1))


# ======================================================================
# 1. 台账 40 台 → window.PumpLedger
# ======================================================================
ws = openpyxl.load_workbook(X_LEDGER, data_only=True)["输油泵机组预防性维护保养信息表"]
COL = {"line": 2, "medium": 3, "station": 4, "tag": 5, "role": 6, "grade": 7, "model": 8,
       "vendor": 9, "form": 10, "stages": 11, "flow": 12, "head": 14, "speed": 15, "eff": 16,
       "shaftKw": 18, "vibWarn": 21, "vibStop": 22, "tempWarn": 23, "tempStop": 24,
       "sealWarn": 25, "sealStop": 26, "commissionAt": 42, "overhaulLast": 43, "oilStock": 40}
pumps = []
for row in list(ws.iter_rows(values_only=True))[5:]:
    if not row or row[0] is None:
        continue
    rec = {k: cell(row[i]) if i < len(row) else "" for k, i in COL.items()}
    st = [s for s in STATIONS if s[0] == rec["station"]][0]
    rec["zoneId"], rec["zoneName"] = st[1], st[2]
    # 源表两种写法实为同一家：长岭 P-1 的评估报告写「湖南天一奥星泵业」，台账写「平江天一」
    # （平江是地名）。屏上用归一后的名字，原写法保留在 vendorRaw 里可对账。
    rec["vendorRaw"] = rec["vendor"]
    rec["vendor"] = "湖南天一奥星泵业" if rec["vendor"] in ("湖南天一", "平江天一") else rec["vendor"]
    # 阈值三项（振动/轴温/机封温）在台账里 40 台全空，这里如实置空，**不要填默认值** ——
    # 「阈值缺项 40 台」本身就是屏上一个指标。
    for k in ("vibWarn", "vibStop", "tempWarn", "tempStop", "sealWarn", "sealStop"):
        if rec[k] and not rec[k].replace(".", "").isdigit():
            rec[k] = ""          # 有一台误填成 9999…月光湖，按缺项处理
    # 源表用 "/" 和 "无" 表示"没有"，直接判真会把它们算成已填报（实测会把大修记录
    # 从 4 台虚报成 30 台）。统一归一成空串，原文另存 *Raw 供对账。
    for k in ("overhaulLast", "commissionAt"):
        rec[k + "Raw"] = rec[k]
        if rec[k] in ("/", "无", "-", "—"):
            rec[k] = ""
    # 衡阳站 4 行的「投用日期」列被《P-x 状态检测与评估报告》的结论文字串列覆盖，
    # 它非空但不是日期。只认 YYYY.M / YYYY-M / YYYY年M 这三种写法，其余按未填报处理，
    # 原文留在 commissionAtRaw 里 —— 这处错位本身要在屏上如实显示，不能悄悄吞掉。
    if rec["commissionAt"] and not re.match(r"^\d{4}[.\-/年]\s*\d{1,2}", rec["commissionAt"]):
        rec["commissionAt"] = ""
    if rec["overhaulLast"] and not re.match(r"^\d{4}[.\-/年]\s*\d{1,2}", rec["overhaulLast"]):
        rec["overhaulLast"] = ""
    pumps.append(rec)

dump(DST / "pump-ledger.js",
     js_head("湖南公司输油泵机组台账 —— 40 台在役机组（window.PumpLedger）",
             ["湖南公司主输泵设备维护保养信息表_-填报.xlsx / sheet「输油泵机组预防性维护保养信息表」（第 6 行起）",
              "站库坐标：旧目录 scripts/data/sites.js 的 surveyed 点位（《国家管网湖南成品油管道线路全图》）"]),
     ("""//
// ⚠️ 三条如实记录的口径（演示被追问时可查）：
//   1) 振动 / 轴承温度 / 机械密封温度的报警值与停机值，台账里 **40 台全部未填**
//      （其中一台误填成 9999…，按缺项处理）。这里置空而不是补默认值 ——
//      「阈值缺项 40 台」是屏上的一个指标，不是要藏的缺陷。
//   2) 上次大修日期只有衡阳站 4 台有（2025-03-01）；表头写明「50000 小时或 10 年大修」。
//   3) 衡阳站 4 行的「投用日期」列在源表里被评估报告结论文字串列覆盖（合并单元格错位），
//      所以那 4 台的 commissionAt 是空的，屏上按「未填报」显示。
window.PumpLedger = (function () {
  "use strict";

  var STATIONS = @@STATIONS@@;

  var ZONE_DISTRICTS = @@ZONE_DISTRICTS@@;

  var PUMPS = @@PUMPS@@;

  function stations() { return STATIONS.map(function (s) { return Object.assign({}, s); }); }
  function stationByName(name) {
    var f = STATIONS.filter(function (s) { return s.name === name; })[0];
    if (!f) throw new Error("[PumpLedger] 未知站库：" + name);
    return f;
  }
  function pumps() { return PUMPS.map(function (p) { return Object.assign({}, p); }); }
  function pumpsByStation(name) {
    stationByName(name);
    return PUMPS.filter(function (p) { return p.station === name; });
  }
  function pumpsByZone(zoneId) { return PUMPS.filter(function (p) { return p.zoneId === zoneId; }); }

  // 服役年限按投用日期现算。commissionAt 为空（衡阳站串列那 4 台）返回 null，
  // 调用方必须自己处理 null，不要在这里补 0 —— 补 0 会让它们混进「新机组」那一档。
  function serviceYears(p, asOf) {
    if (!p.commissionAt) return null;
    var m = String(p.commissionAt).match(/^(\\d{4})[.\\-\\/](\\d{1,2})/);
    if (!m) return null;
    var start = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    return Math.round((asOf - start) / 86400000 / 365.25 * 10) / 10;
  }

  function summary(asOf) {
    var due = PUMPS.filter(function (p) {
      var y = serviceYears(p, asOf);
      return y !== null && y >= 10;      // 表头口径：50000 小时或 10 年
    });
    return {
      total: PUMPS.length,
      main: PUMPS.filter(function (p) { return p.role === "主输泵"; }).length,
      feed: PUMPS.filter(function (p) { return p.role === "给油泵"; }).length,
      stationTotal: STATIONS.length,
      zoneTotal: 6,                       // 全省 6 个作业区，永郴 0 台也算一个
      overhaulDue: due.length,
      overhaulLogged: PUMPS.filter(function (p) { return !!p.overhaulLast; }).length,
      thresholdMissing: PUMPS.filter(function (p) { return !p.vibWarn && !p.tempWarn; }).length,
      commissionMissing: PUMPS.filter(function (p) { return !p.commissionAt; }).length
    };
  }

  function vendorMix() {
    var m = {};
    PUMPS.forEach(function (p) { m[p.vendor] = (m[p.vendor] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { name: k, count: m[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  // 3D 层要的 window.HunanSites 投影在 scripts/data/sites.js，不在这里 ——
  // 那是「喂给地图的 7 个点」，和台账是两件事。
  return {
    stations: stations, stationByName: stationByName,
    pumps: pumps, pumpsByStation: pumpsByStation, pumpsByZone: pumpsByZone,
    zoneDistricts: function () { return JSON.parse(JSON.stringify(ZONE_DISTRICTS)); },
    serviceYears: serviceYears, summary: summary, vendorMix: vendorMix
  };
})();
"""
      .replace("@@STATIONS@@", json.dumps(
          [{"name": n, "zoneId": z, "zoneName": zn, "lon": lo, "lat": la,
            "coordSource": cs, "adcode": ZONE_ADCODE[z][0], "districtName": ZONE_ADCODE[z][1]}
           for n, z, zn, lo, la, cs in STATIONS], ensure_ascii=False, indent=4))
      .replace("@@ZONE_DISTRICTS@@", json.dumps(ZONE_DISTRICTS, ensure_ascii=False))
      .replace("@@PUMPS@@", json.dumps(pumps, ensure_ascii=False, indent=4))))

# ======================================================================
# 2. 故障统计 118 条 → window.PumpFaults
# ======================================================================
ws = openpyxl.load_workbook(X_FAULT, data_only=True)["报表最新"]
frows = list(ws.iter_rows(values_only=True))
hdr = [cell(c) for c in frows[0]]
KEY = {"公司名称": "company", "所属线路": "line", "站场名称": "station", "省份": "province",
       "停机机组": "unit", "电机厂家": "motorVendor", "压缩机厂家": "pumpVendor",
       "停机时间": "hours", "故障表现": "symptom", "故障部位": "site", "部件": "part",
       "零件": "piece", "故障原因": "cause", "故障类别": "category",
       "故障处理情况": "handling", "停机日期": "at"}
faults = []
for row in frows[1:]:
    if not row or not row[0]:
        continue
    d = {}
    for k, v in zip(hdr, row):
        if k not in KEY:
            continue
        d[KEY[k]] = round(float(v), 2) if k == "停机时间" and isinstance(v, (int, float)) else cell(v)
    if not d.get("category"):
        d["category"] = "未分类"     # 源表有 1 条空白，如实标出而不是丢弃
    faults.append(d)

dump(DST / "pump-faults.js",
     js_head("输油泵机组故障统计 —— 118 条 / 24 个月 / 13 家公司（window.PumpFaults）",
             ["assets/诊断工作台/输油泵机组故障统计表2026(1).xlsx / sheet「报表最新」"]),
     ("""//
// ★ 这份数据支撑屏上最重要的一句话：**次数排名和停机时长排名是倒挂的**。
//   机械故障只 14 次（11.9%）却吃掉 998.8h 停机（50.8%），均 71.3h/次；
//   外界因素 26 次（22.0%）只占 74.5h，均 2.9h/次。
//   全体中位数 1.08h、均值 16.67h、最大 636h —— 长尾极端，所以帕累托图必须双轴，
//   只画次数会得出完全相反的结论。
//
// ⚠️ 「故障部位」（供电系统/控制系统/机械密封/泵本体…）是**故障归因分类**，
//   与 pump-unit-model.js 的 IMS 设备结构树**不是同一套词表**，两者都有「泵本体」
//   但语义和层级不同。屏上不得画在同一根轴上，聚合函数也刻意不提供跨两者的关联。
window.PumpFaults = (function () {
  "use strict";

  var ROWS = @@ROWS@@;

  function rows() { return ROWS.map(function (r) { return Object.assign({}, r); }); }

  function groupBy(key) {
    var m = {};
    ROWS.forEach(function (r) {
      var k = r[key] || "未分类";
      if (!m[k]) m[k] = { name: k, count: 0, hours: 0 };
      m[k].count += 1;
      m[k].hours += typeof r.hours === "number" ? r.hours : 0;
    });
    return Object.keys(m).map(function (k) {
      var g = m[k];
      return { name: g.name, count: g.count, hours: Math.round(g.hours * 10) / 10,
               avgHours: Math.round(g.hours / g.count * 10) / 10 };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  // 帕累托：按**停机时长**降序，不是按次数 —— 这张图要回答「该盯谁」，
  // 而按次数排会把均 2.9h 的外界因素排到机械故障前面。
  function paretoByHours() {
    return groupBy("category").slice().sort(function (a, b) { return b.hours - a.hours; });
  }

  function summary() {
    var hrs = ROWS.map(function (r) { return typeof r.hours === "number" ? r.hours : 0; });
    var sorted = hrs.slice().sort(function (a, b) { return a - b; });
    var sum = hrs.reduce(function (s, v) { return s + v; }, 0);
    return {
      total: ROWS.length,
      hours: Math.round(sum * 10) / 10,
      avgHours: Math.round(sum / ROWS.length * 100) / 100,
      medianHours: sorted[Math.floor(sorted.length / 2)],
      maxHours: Math.max.apply(null, hrs),
      companyTotal: groupBy("company").length,
      hunanCount: ROWS.filter(function (r) { return r.company === "湖南公司"; }).length,
      monthTotal: (function () {
        var m = {};
        ROWS.forEach(function (r) { if (r.at) m[r.at.slice(0, 7)] = true; });
        return Object.keys(m).length;
      })()
    };
  }

  return { rows: rows, groupBy: groupBy, paretoByHours: paretoByHours, summary: summary };
})();
""".replace("@@ROWS@@", json.dumps(faults, ensure_ascii=False, indent=2))))

# ======================================================================
# 3. IMS 单元模型 → window.PumpUnitModel
# ======================================================================
ws = openpyxl.load_workbook(X_UNIT, data_only=True)["输油泵机组单元模型"]
unit, cur = {}, ""
for row in ws.iter_rows(values_only=True):
    b = cell(row[1] if len(row) > 1 else "")
    c = cell(row[2] if len(row) > 2 else "")
    if b and b != "子层级":
        cur = b
    if c and c != "部件级" and cur:
        unit.setdefault(cur, []).append(c)

dump(DST / "pump-unit-model.js",
     js_head("IMS 输油泵机组单元模型 —— 6 子系统 / 48 部件（window.PumpUnitModel）",
             ["IMS系统压缩机（输油泵）单元模型-输油泵已修改.xlsx / sheet「输油泵机组单元模型」"]),
     ("""//
// ⚠️ 这是**设备结构树**（机组由哪些部件构成），与 pump-faults.js 的「故障部位」
//   （故障归因分类）是两套独立词表。两者都出现「泵本体」，但这里指的是壳体/叶轮/转轴那一堆
//   实体部件，那里指的是故障被归到哪一类。**不要把它们接成同一根轴**，
//   本文件因此刻意不导出任何"按故障部位查部件"的方法。
window.PumpUnitModel = (function () {
  "use strict";

  var TREE = @@TREE@@;

  function subsystems() {
    return Object.keys(TREE).map(function (k) { return { name: k, parts: TREE[k].slice() }; });
  }
  function partTotal() {
    return Object.keys(TREE).reduce(function (s, k) { return s + TREE[k].length; }, 0);
  }
  return { subsystems: subsystems, partTotal: partTotal };
})();
""".replace("@@TREE@@", json.dumps(unit, ensure_ascii=False, indent=4))))

print("完成。台账 %d 台 / 故障 %d 条 / 子系统 %d 个 %d 部件"
      % (len(pumps), len(faults), len(unit), sum(len(v) for v in unit.values())))
