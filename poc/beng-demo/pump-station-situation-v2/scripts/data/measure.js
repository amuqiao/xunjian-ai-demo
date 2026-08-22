// window.PumpMeasure —— 25 个标准测点挂到 3D 的 6 个部位上。
//
// 【本文件是这一屏的全部】次屏只回答一个问题：**这台机组现在什么状态、哪个测点最差**。
// 数据来自 ../hunan-pump-overview-v2/scripts/data/pump-state.js（那份是手抄两份 .docx
// 报告的原文），本文件不重复存一份数值，只做「测点 → 部位」的挂接和分级派生。
//
// 【为什么第二维是测点，不是时间】大屏是 40 台机组的横截面（一个时点）。次屏本来该配时间，
// 但真实资料只有两个时点（2025-04-08 现场检测、2026-06-30 在线监测月报），两点连不成趋势，
// 编一条 14 轮的时间序列就是假的。所以次屏的第二维取**空间**：25 个测点在机组上的分布。
//
// 【25 → 6 的挂接】3D 层（../pump-station-situation/scripts/pump3d/）的部位 id 空间是
// 固定的 6 个：pump-body / seal / front-bearing / coupling / motor / base。挂接如下，
// 合计正好 25：
//   motor          7  电机非驱动端 水平/垂直/轴向/斜45° + 电机驱动端 水平/垂直/轴向
//   base          12  电机基础上 A~D + 电机基础下 A~D + 泵基础 E~H
//   front-bearing  3  泵驱动端 水平/垂直/轴向（驱动端轴承处）
//   pump-body      3  泵非驱动端 水平/垂直/轴向
//   coupling       0  ★ 报告的 25 个测点里没有联轴器测振点
//   seal           0  ★ 振动检测不覆盖机械密封
//
// ★ coupling 和 seal 是 0 测点这件事不是数据缺失，是这一屏最该讲的一句话：
//   报告判出「存在不对中」，靠的是电机-泵驱动端相位差 90° + 100.3Hz 二倍频**推断**，
//   而不是在联轴器上测到了什么。恰恰因为没有直接测点，它才最需要人去现场看。
//   机械密封同理 —— 它的状态本该靠温度和泄漏检测，而台账里机封温度阈值 40 台全空
//   （见大屏左栏「台账数据质量」）。
window.PumpMeasure = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[PumpMeasure] 需要先加载 " + name);
    return window[name];
  }

  // 部位顺序与 Pump3DContract.PART_IDS 完全一致（含顺序），contract 会断言这件事。
  var PARTS = [
    { id: "pump-body", name: "泵本体", short: "泵本体", note: "泵非驱动端三向" },
    { id: "seal", name: "机械密封", short: "机封", note: "振动检测不覆盖" },
    { id: "front-bearing", name: "驱动端轴承", short: "驱动端轴承", note: "泵驱动端三向" },
    { id: "coupling", name: "联轴器", short: "联轴器", note: "无测振点，靠相位差推断" },
    { id: "motor", name: "电机", short: "电机", note: "两端七向" },
    { id: "base", name: "底座与基础", short: "底座", note: "电机基础八点 + 泵基础四点" }
  ];

  var POINT_PART = {
    "电机非驱动端水平": "motor", "电机非驱动端垂直": "motor", "电机非驱动端轴向": "motor",
    "电机驱动端水平": "motor", "电机驱动端垂直": "motor", "电机非驱动端斜45°": "motor",
    "电机驱动端轴向": "motor",
    "电机基础上A": "base", "电机基础上B": "base", "电机基础上C": "base", "电机基础上D": "base",
    "电机基础下A": "base", "电机基础下B": "base", "电机基础下C": "base", "电机基础下D": "base",
    "泵驱动端水平": "front-bearing", "泵驱动端垂直": "front-bearing", "泵驱动端轴向": "front-bearing",
    "泵非驱动端水平": "pump-body", "泵非驱动端垂直": "pump-body", "泵非驱动端轴向": "pump-body",
    "泵基础E": "base", "泵基础F": "base", "泵基础G": "base", "泵基础H": "base"
  };

  // 报告结论三条，逐条标出它指向哪些部位。原文见 pump-state.js 的 findings。
  // partIds 是「这条结论说的是哪儿」，不是「这些部位有测点」——
  // 结论 1 指向 coupling，而 coupling 恰恰是 0 测点，这正是它的意义所在。
  var FINDING_PARTS = [
    ["coupling", "motor", "front-bearing"],
    ["base"],
    ["front-bearing", "pump-body"]
  ];

  function assertMapping() {
    var State = need("PumpState");
    var names = State.measurePoints();
    var missing = names.filter(function (n) { return !POINT_PART[n]; });
    if (missing.length) {
      throw new Error("[PumpMeasure] 这些测点没有挂到部位上：" + missing.join(" / "));
    }
    var extra = Object.keys(POINT_PART).filter(function (n) { return names.indexOf(n) < 0; });
    if (extra.length) {
      throw new Error("[PumpMeasure] 挂接表里有报告中不存在的测点：" + extra.join(" / "));
    }
    var C = window.Pump3DContract;
    if (!C) throw new Error("[PumpMeasure] 需要先加载 Pump3DContract（本文件要按它的 PART_IDS 做顺序断言）");
    var ids = PARTS.map(function (p) { return p.id; }).join(",");
    if (ids !== C.PART_IDS.join(",")) {
      throw new Error("[PumpMeasure] PARTS 顺序必须与 Pump3DContract.PART_IDS 一致：本文件 ["
        + ids + "]，契约 [" + C.PART_IDS.join(",") + "]");
    }
    // 【这两条是从 Pump3DContract.assertData() 搬过来的】那个函数读
    // window.DemoData.parts()（旧目录 scripts/data/catalog.js 的数据层），本 POC 刻意
    // 不加载那一层 —— 它带着 6 步流程、知识库、Agent 语料一整套诊断台的数据。
    // 所以 boot.js 不调 assertData()，改由本文件把它真正检查的两件事做掉：
    //   ① 部位 id 集合与顺序等于 PART_IDS（上面那段，且比原版更严 —— 原版只查集合不查顺序）
    //   ② 每个部位算出来的 status 必须是合法值
    PARTS.forEach(function (part) {
      var st = partState(part.id).status;
      if (C.STATUSES.indexOf(st) < 0) {
        throw new Error("[PumpMeasure] 部位 " + part.id + " 派生出非法 status：" + st);
      }
    });
  }

  // 25 个测点，带值和逐点分级。逐点分级只用来给清单上色，**机组定级不看它**
  // （ISO 10186-3 的口径是按全部测点的最大值定级，见 pump-state.js）。
  function points() {
    var State = need("PumpState");
    var unit = State.changlingP1();
    return State.measurePoints().map(function (name, i) {
      var v = unit.values[name];
      if (typeof v !== "number") throw new Error("[PumpMeasure] 测点缺值：" + name);
      return {
        index: i + 1,
        name: name,
        value: v,
        partId: POINT_PART[name],
        grade: State.gradeOf(v)
      };
    });
  }

  function pointsByPart(partId) {
    return points().filter(function (p) { return p.partId === partId; });
  }

  function findings() {
    var State = need("PumpState");
    return State.changlingP1().findings.map(function (text, i) {
      return { index: i + 1, text: text, partIds: FINDING_PARTS[i] };
    });
  }

  // 部位状态。三条规则，顺序即优先级：
  //   ① 有测点 → 严格按 ISO 10186-3 的「部位内最大值」定级，A→ok / B→warn / C,D→danger。
  //      B 是「良」不是「优」，报告给 B 级机组开了三条整改建议，所以 B 不能算 ok。
  //   ② 无测点、但被报告结论指名 → danger。coupling 就是这一档：报告判出不对中，
  //      而它没有直接测点，靠相位差推断 —— 正因为测不到，它才最需要人去现场确认。
  //   ③ 无测点、也没有结论指名 → ok，但 hasData 为 false，屏上必须写明「无测振点」，
  //      不许让它看起来像"测过了，正常"。
  function partState(partId) {
    var list = pointsByPart(partId);
    var hitFindings = findings().filter(function (f) { return f.partIds.indexOf(partId) >= 0; });
    if (list.length === 0) {
      return {
        hasData: false,
        status: hitFindings.length ? "danger" : "ok",
        max: null, grade: null, pointCount: 0, findingCount: hitFindings.length,
        reason: hitFindings.length
          ? "无测振点，报告靠相位差与频谱推断出问题"
          : "振动检测不覆盖该部位"
      };
    }
    var State = need("PumpState");
    var max = Math.max.apply(null, list.map(function (p) { return p.value; }));
    var grade = State.gradeOf(max);
    var status = grade.grade === "A" ? "ok" : (grade.grade === "B" ? "warn" : "danger");
    return {
      hasData: true, status: status, max: max, grade: grade,
      pointCount: list.length, findingCount: hitFindings.length,
      reason: "部位内最大值 " + max.toFixed(2) + " mm/s → " + grade.grade + " " + grade.label
    };
  }

  function parts() {
    return PARTS.map(function (p) {
      var st = partState(p.id);
      return {
        id: p.id, name: p.name, short: p.short, note: p.note,
        hasData: st.hasData, status: st.status, max: st.max, grade: st.grade,
        pointCount: st.pointCount, findingCount: st.findingCount, reason: st.reason
      };
    });
  }

  function statuses() {
    var out = {};
    parts().forEach(function (p) { out[p.id] = p.status; });
    return out;
  }

  function partById(id) {
    var f = parts().filter(function (p) { return p.id === id; })[0];
    if (!f) throw new Error("[PumpMeasure] 未知部位：" + id);
    return f;
  }

  // 机组级摘要。unitGrade 走 pump-state.js 的 gradeByPoints() —— 那是 ISO 的原口径
  // （全部测点最大值定级），本文件不另算一遍。
  function summary() {
    var State = need("PumpState");
    var Ledger = need("PumpLedger");
    var unit = State.changlingP1();
    var g = State.gradeByPoints(unit.values);
    var all = points();
    var worst = all.slice().sort(function (a, b) { return b.value - a.value; })[0];
    var ledgerRow = Ledger.pumpsByStation("长岭站").filter(function (p) { return p.tag === "Ｐ－1泵"; })[0];
    if (!ledgerRow) throw new Error("[PumpMeasure] 台账里找不到长岭站 Ｐ－1泵");
    return {
      station: unit.station, tag: unit.tag, checkedAt: unit.checkedAt,
      grade: g.grade, max: g.max, worstPoint: worst,
      pointTotal: all.length,
      measuredParts: parts().filter(function (p) { return p.hasData; }).length,
      partTotal: PARTS.length,
      overGradeA: all.filter(function (p) { return p.value >= 2.3; }).length,
      motor: unit.motor, pump: unit.pump,
      ledger: ledgerRow,
      findingTotal: findings().length,
      // 台账里这台机组的阈值填报情况 —— 与大屏「阈值缺项 40/40」同源。
      thresholdFilled: !!(ledgerRow.vibWarn || ledgerRow.tempWarn || ledgerRow.sealWarn)
    };
  }

  assertMapping();

  return {
    parts: parts, partById: partById, statuses: statuses,
    points: points, pointsByPart: pointsByPart,
    findings: findings, summary: summary
  };
})();
