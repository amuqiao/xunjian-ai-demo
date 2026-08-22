// 机组状态 —— window.PumpState。
//
// 【本文件是手抄的，不是生成物】上面三个 pump-*.js 由 tools/build_data.py 从 xlsx 生成；
// 这份数据来自两份 .docx 报告的正文与表格，只能人工转录，所以手写并逐条标注出处。
// 修它请对照原文档，不要跑生成脚本。
//
// 上游真源：
//   《湖南公司长岭站P-1输油泵机组状态检测与评估报告.docx》（2025 年 4 月，压缩机组维检修分公司）
//   《输油泵机组运行状态监测报告2026年6月-湖南公司.docx》（MROC/JC-2026-6，数据截至 2026-06-30）
//
// ★ 这份数据把屏上的「状态分级」和「当月故障」从演示假定变成了真实口径：
//   ① 分级不是我们定的，是 ISO 10186-3；阈值 2.3 / 4.5 / 7.1 mm/s 是报告原文的表格
//   ② 当月故障不是编的，是在线监测报告的结论：40 台里只有 2 台判故障
//   ③ 40 台这个分母被第二份独立资料确认（监测报告原文「智能运维项目 40 台设备」），
//      与 pump-ledger.js 的台账台数一致 —— 两份资料互为交叉验证
window.PumpState = (function () {
  "use strict";

  // ISO 10186-3 状态分级。振动速度有效值 mm/s，采集频段 10-1000Hz。
  // 【口径细节，必须照做】机组状态按**全部测点的最大值**定级，不是逐点定级 ——
  // 报告表里每一行的「机组状态」列都写 B，包括 0.50mm/s 那些点，因为该机组最大值
  // 2.62 落在 B 区间。写成逐点定级会得出「25 个点里 24 个是 A」这种错误结论。
  var GRADES = [
    { grade: "A", label: "优", min: 0, max: 2.3, tone: "ok" },
    { grade: "B", label: "良", min: 2.3, max: 4.5, tone: "ok" },
    { grade: "C", label: "中", min: 4.5, max: 7.1, tone: "warn" },
    { grade: "D", label: "劣", min: 7.1, max: Infinity, tone: "danger" }
  ];

  // 25 处标准测点，依据 GB/T 19873《机器状态检测与诊断》，顺序与报告表 2 一致。
  var MEASURE_POINTS = [
    "电机非驱动端水平", "电机非驱动端垂直", "电机非驱动端轴向", "电机驱动端水平",
    "电机驱动端垂直", "电机非驱动端斜45°", "电机驱动端轴向",
    "电机基础上A", "电机基础上B", "电机基础上C", "电机基础上D",
    "电机基础下A", "电机基础下B", "电机基础下C", "电机基础下D",
    "泵驱动端水平", "泵驱动端垂直", "泵驱动端轴向",
    "泵非驱动端水平", "泵非驱动端垂直", "泵非驱动端轴向",
    "泵基础E", "泵基础F", "泵基础G", "泵基础H"
  ];

  // 长岭站 P-1 的 25 点实测值（检测日期 2025-04-08）—— 全部是报告表 4 的原始数字。
  // 这是**唯一有完整 25 点实测**的机组，所以次屏默认展示它。
  var CHANGLING_P1 = {
    station: "长岭站", tag: "Ｐ－1泵", checkedAt: "2025-04-08", grade: "B",
    motor: { vendor: "南阳防爆", model: "YB2-560M2-2W", kw: 70, amp: 86.4, volt: 6000, rpm: 2980 },
    pump: { vendor: "湖南天一奥星泵业", model: "KSY900-225", head: 225, flow: 900, bearing: "滑动轴承" },
    values: {
      "电机非驱动端水平": 1.85, "电机非驱动端垂直": 0.90, "电机非驱动端轴向": 0.59,
      "电机驱动端水平": 2.40, "电机驱动端垂直": 0.50, "电机非驱动端斜45°": 1.89,
      "电机驱动端轴向": 0.65,
      "电机基础上A": 0.56, "电机基础上B": 0.62, "电机基础上C": 0.51, "电机基础上D": 0.51,
      "电机基础下A": 0.22, "电机基础下B": 0.30, "电机基础下C": 0.35, "电机基础下D": 0.34,
      "泵驱动端水平": 1.91, "泵驱动端垂直": 2.62, "泵驱动端轴向": 1.73,
      "泵非驱动端水平": 1.57, "泵非驱动端垂直": 2.16, "泵非驱动端轴向": 1.36,
      "泵基础E": 1.55, "泵基础F": 2.40, "泵基础G": 1.15, "泵基础H": 0.68
    },
    findings: [
      "存在不对中：电机非驱动端水平/斜45° 频谱以 100.3Hz（二倍频）为主，电机-泵驱动端相位差 90°，驱动端水平垂直相位差 150°。建议择机检查机组对中情况。",
      "泵基础振动较大：泵基础 E/G 均超 1.00mm/s，F 达 2.40mm/s。建议检查地脚螺栓及机组进出口管道固定情况。",
      "泵两端多点存在 6 倍频（叶片通过频率）。建议关注输油泵流量变化，比对设计工况点与实际工况点偏离情况。"
    ]
  };

  // 2026 年 6 月在线监测：40 台里当月只有 2 台判故障，其余 5 个站库的故障表为空。
  var MONITOR = {
    reportNo: "MROC/JC-2026-6", dataThrough: "2026-06-30", fleet: 40,
    issuer: "压缩机组维检修分公司",
    faultUnits: [
      { station: "长岭站", tag: "P04泵", ledgerTag: "Ｐ－4泵", part: "泵", state: "故障",
        conclusion: "松动", advice: "检查基础和地脚螺栓" },
      { station: "衡阳站", tag: "P02泵", ledgerTag: "Ｐ－2泵", part: "泵", state: "故障",
        conclusion: "轴承磨损，润滑不良", advice: "检查轴承，注意润滑" }
    ]
  };

  // 衡阳站 2025 年评估结论（从台账被串列覆盖的那一列里抄出来的原文）。
  // ★ 衡阳 P-2 这条链是本屏最有说服力的一段，三份资料拼出来，全是真的：
  //   2025-03-01 大修 → 2025 评估 A 优（但已写明"存在轻微不对中，但不影响运行"）
  //   → 2026-06 在线监测判故障「轴承磨损，润滑不良」。
  var HENGYANG_ASSESS = [
    { tag: "Ｐ－1泵", grade: "A", note: "整体电机和泵的状态正常" },
    { tag: "Ｐ－2泵", grade: "A", note: "电机端存在工频倍频，且联轴器两端相位反向，存在轻微不对中，但不影响运行" },
    { tag: "Ｐ－3泵", grade: "A", note: "整体电机和泵的状态正常" },
    { tag: "Ｐ－4泵", grade: "A", note: "整体电机和泵的状态正常" }
  ];

  function gradeOf(maxValue) {
    if (typeof maxValue !== "number" || !isFinite(maxValue)) {
      throw new Error("[PumpState] gradeOf 需要一个有限数值，实际 " + maxValue);
    }
    var hit = GRADES.filter(function (g) { return maxValue >= g.min && maxValue < g.max; })[0];
    if (!hit) throw new Error("[PumpState] 无法给 " + maxValue + " 定级");
    return hit;
  }

  // 按 ISO 10186-3 的口径：取全部测点最大值定级。
  function gradeByPoints(values) {
    var nums = MEASURE_POINTS.map(function (name) {
      if (typeof values[name] !== "number") {
        throw new Error("[PumpState] 测点缺值：" + name + "（25 点必须齐，缺一个就不能定级）");
      }
      return values[name];
    });
    var max = Math.max.apply(null, nums);
    return { max: max, grade: gradeOf(max) };
  }

  function faultUnitOf(station, ledgerTag) {
    return MONITOR.faultUnits.filter(function (f) {
      return f.station === station && f.ledgerTag === ledgerTag;
    })[0] || null;
  }

  return {
    grades: function () { return GRADES.map(function (g) { return Object.assign({}, g); }); },
    measurePoints: function () { return MEASURE_POINTS.slice(); },
    changlingP1: function () { return CHANGLING_P1; },
    monitor: function () { return MONITOR; },
    hengyangAssess: function () { return HENGYANG_ASSESS.slice(); },
    gradeOf: gradeOf, gradeByPoints: gradeByPoints, faultUnitOf: faultUnitOf
  };
})();
