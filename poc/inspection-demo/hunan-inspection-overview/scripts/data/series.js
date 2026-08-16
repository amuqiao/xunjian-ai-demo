// 湖南省油气管网大屏总览 —— 图表数据源（L?：数据层，依赖 map3d/contract.js 与
// scripts/data/topology.js，均须先于本文件加载；本文件产出的是纯数据，不是
// ECharts option —— option 构造在 scripts/core/chartopts.js）。
//
// 【POC：hunan-inspection-overview（巡检站总览，全量油气 217 节点）】
// 本文件覆盖 topology.js 的全部 24 条管道 / 217 个节点（gas + oil 都算），
// 与 poc/hunan-pump-overview/scripts/data/series.js 是姐妹文件但内容不同——
// 那份文件只覆盖 3 条成品油管道 / 44 个节点，且有它自己独有的图表方法
// （pipelineProfile / pumpHealthRank / throughputRows），本文件没有那几个方法，
// 换成本 POC 独有的巡检语义方法（inspectionCoverageTrend / issueByDiscipline /
// zoneCoverageRows）。两份文件的“共有”方法（zoneRankRows / zoneStatusMix /
// siteKindMix / pipelineRows / provinceSummary）实现思路一致，但因为覆盖范围不同
// （217 vs 44），不能共享同一份代码、必须各自独立实现。
//
// 纪律：本文件里所有跨作业区/跨管道的聚合数字都是从 topology.js（拓扑真实资料）
// 和 window.HunanSites（站点级 status，另一 agent 产出）实时派生出来的，不写死
// 任何聚合结果字面量——演示剧本调整某个站点的 status 后，这里的数字必须自动跟着
// 变。只有在“演示设定”一节里，某些业务量值（巡检完成率、7 日趋势系数）确实没有
// 数据支撑，才允许用可解释的确定性公式生成演示数值，并在注释里逐条标明这是演示
// 假定，不是真实资料——这与本项目一贯的“假定必须可辨认”纪律一致。
//
// 依赖契约：
//   window.HunanContract  —— 只读 ZONE_IDS / ZONE_NAMES / DISTRICT_ADCODES / STATUSES
//   window.HunanTopology  —— 只读 meta / zones / pipelines / nodes
//   window.HunanSites     —— 只在需要站点级 status 时才调用 sites()，本文件不管
//                             它内部怎么实现，只要求返回的每个站点对象含 id/status
(function () {
  "use strict";

  var Contract = window.HunanContract;
  var Topology = window.HunanTopology;

  if (!Contract) {
    throw new Error("[HunanSeries] 缺少 window.HunanContract，请先加载 scripts/map3d/contract.js");
  }
  if (!Topology) {
    throw new Error("[HunanSeries] 缺少 window.HunanTopology，请先加载 scripts/data/topology.js");
  }

  var ZONE_IDS = Contract.ZONE_IDS;
  var ZONE_NAMES = Contract.ZONE_NAMES;

  // ---- 数据范围：本 POC 不过滤管道 kind，覆盖 topology.js 全部 24 条管道 / 217 节点 ----
  function scopedPipelines() {
    return Topology.pipelines;
  }

  function scopedNodes() {
    var pids = {};
    scopedPipelines().forEach(function (p) {
      pids[p.id] = true;
    });
    return Topology.nodes.filter(function (n) {
      return pids[n.pipelineId];
    });
  }

  function nodesByZone(zoneId) {
    return scopedNodes().filter(function (n) {
      return n.zoneId === zoneId;
    });
  }

  // ---- 站点级 status：懒接入 HunanSites，找不到就直接抛错（不做兜底/静默降级） ----
  function requireSites() {
    if (!window.HunanSites || typeof window.HunanSites.sites !== "function") {
      throw new Error(
        "[HunanSeries] 需要 window.HunanSites.sites()，但未找到——请先加载 scripts/data/sites.js"
      );
    }
    return window.HunanSites;
  }

  function statusById() {
    var Sites = requireSites();
    var all = Sites.sites();
    if (!Array.isArray(all)) {
      throw new Error("[HunanSeries] window.HunanSites.sites() 未返回数组，实际为 " + typeof all);
    }
    var map = {};
    all.forEach(function (s) {
      map[s.id] = s.status;
    });
    return map;
  }

  function countStatus(nodeList, statusMap) {
    var c = { ok: 0, warn: 0, danger: 0 };
    nodeList.forEach(function (n) {
      var st = statusMap[n.id];
      if (!st) {
        throw new Error(
          "[HunanSeries] 节点 " + n.id + " 在 HunanSites.sites() 里找不到对应 status" +
          "（可能是 id 不一致或数据层尚未覆盖该节点）"
        );
      }
      if (c[st] === undefined) {
        throw new Error("[HunanSeries] 节点 " + n.id + " 的 status=" + st + " 不是合法状态值");
      }
      c[st] += 1;
    });
    return c;
  }

  // ============================================================
  // 一、两块屏「共有」的聚合（本文件按全量 217 节点口径实现）
  // ============================================================

  // 10 作业区排名：{ zoneId, name, stationCount, valveCount, total, issueCount, score }
  //
  // score 健康分公式（可解释，非魔法数字）：
  //   score = 100 - (danger数量 * 100 + warn数量 * 50) / total
  // 即：每个 danger 站点扣 100/total 分（相当于“该区如果只有 1 个站点、且是
  // danger，直接清零”），每个 warn 站点扣一半权重 50/total 分，ok 站点不扣分。
  // total=0（该作业区在本口径下没有任何站点/阀室）时 score 记为 null，表示
  // “不参与评分”而不是伪造一个 0 分或 100 分。
  function zoneRankRows() {
    var statusMap = statusById();
    return ZONE_IDS.map(function (zoneId) {
      var nodes = nodesByZone(zoneId);
      var stationCount = nodes.filter(function (n) { return n.kind === "station"; }).length;
      var valveCount = nodes.filter(function (n) { return n.kind === "valve"; }).length;
      var total = nodes.length;
      var mix = countStatus(nodes, statusMap);
      var issueCount = mix.warn + mix.danger;
      var score = total === 0 ? null : Math.round(100 - (mix.danger * 100 + mix.warn * 50) / total);
      return {
        zoneId: zoneId,
        name: ZONE_NAMES[zoneId],
        stationCount: stationCount,
        valveCount: valveCount,
        total: total,
        issueCount: issueCount,
        score: score
      };
    });
  }

  // 三色状态在作业区维度的分布：[{ zoneId, name, ok, warn, danger }, ...]（10 条）
  function zoneStatusMix() {
    var statusMap = statusById();
    return ZONE_IDS.map(function (zoneId) {
      var nodes = nodesByZone(zoneId);
      var mix = countStatus(nodes, statusMap);
      return { zoneId: zoneId, name: ZONE_NAMES[zoneId], ok: mix.ok, warn: mix.warn, danger: mix.danger };
    });
  }

  // station vs valve 数量分布（不需要 status，直接从 topology.js 派生）
  function siteKindMix() {
    var nodes = scopedNodes();
    var station = nodes.filter(function (n) { return n.kind === "station"; }).length;
    var valve = nodes.filter(function (n) { return n.kind === "valve"; }).length;
    var total = nodes.length;
    return {
      station: station,
      valve: valve,
      total: total,
      stationPct: total === 0 ? 0 : Math.round((station / total) * 1000) / 10,
      valvePct: total === 0 ? 0 : Math.round((valve / total) * 1000) / 10
    };
  }

  // 管道清单：{ id, name, kind, nodeCount, stationCount, valveCount }
  function pipelineRows() {
    return scopedPipelines().map(function (p) {
      var nodes = Topology.nodes.filter(function (n) { return n.pipelineId === p.id; });
      var stationCount = nodes.filter(function (n) { return n.kind === "station"; }).length;
      var valveCount = nodes.filter(function (n) { return n.kind === "valve"; }).length;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        nodeCount: nodes.length,
        stationCount: stationCount,
        valveCount: valveCount
      };
    });
  }

  // 全省汇总：{ zoneTotal, districtTotal, pipelineTotal, stationTotal, valveTotal, issueTotal }
  function provinceSummary() {
    var nodes = scopedNodes();
    var statusMap = statusById();
    var mix = countStatus(nodes, statusMap);
    return {
      zoneTotal: ZONE_IDS.length,
      districtTotal: Contract.DISTRICT_ADCODES.length,
      pipelineTotal: scopedPipelines().length,
      stationTotal: nodes.filter(function (n) { return n.kind === "station"; }).length,
      valveTotal: nodes.filter(function (n) { return n.kind === "valve"; }).length,
      issueTotal: mix.warn + mix.danger
    };
  }

  // ============================================================
  // 二、A（巡检站总览）独有：对应"巡检"业务语义
  // ============================================================

  // 巡检任务完成率趋势（100% 演示设定）。
  //
  // 为什么是演示设定：topology.js 只有站场/阀室的静态拓扑关系，没有巡检工单/
  // 执行记录表，本 POC 数据范围内没有任何字段能派生出"过去 N 天每天完成了多少
  // 巡检任务"。这里用一个确定性公式（不是 Math.random，保证同一份代码每次跑出
  // 同样的演示曲线，方便截图/回归对比）生成有起伏的百分比，只用来在折线图
  // 上演示"完成率随日期范围变化"这个概念，不代表任何真实巡检系统的历史数据。
  function inspectionCoverageTrend(options) {
    options = options || {};
    var pointCount = options.pointCount || 7;
    if (pointCount < 1 || pointCount > 31) {
      throw new Error("[HunanSeries] inspectionCoverageTrend pointCount 应在 1..31 之间，实际 " + pointCount);
    }
    var lastIndex = pointCount - 1;
    var days = [];
    for (var d = lastIndex; d >= 0; d -= 1) days.push("D-" + d);
    return days.map(function (label, i) {
      var wave = Math.round(Math.sin(i * 0.9) * 6);
      var slope = lastIndex === 0 ? 0 : Math.round((i / lastIndex) * 6);
      var rate = 88 + wave + slope;
      if (rate > 100) rate = 100;
      if (rate < 60) rate = 60;
      return { day: label, completionRate: rate };
    });
  }

  // 问题按"专业"分布——topology.js 没有 discipline 字段，无法派生真正的专业口径
  // （比如仪表专业/电气专业/管道专业那种细分）。改用可派生的替代维度：站点所属
  // 管道的 kind（gas 输气 / oil 输油），这是数据集里唯一能撑住"专业对口"语义的
  // 派生维度——业务上气路和油路本就是两个不同班组（输气专业 vs 输油专业）在管，
  // 用 gas/oil 分布近似"专业分布"是本 demo 能诚实给出的最接近选择，不是编造。
  function issueByDiscipline() {
    var pipelineKindById = {};
    Topology.pipelines.forEach(function (p) {
      pipelineKindById[p.id] = p.kind;
    });
    var statusMap = statusById();
    var nodes = scopedNodes();
    var acc = { gas: 0, oil: 0 };
    var totals = { gas: 0, oil: 0 };
    nodes.forEach(function (n) {
      var kind = pipelineKindById[n.pipelineId];
      if (kind !== "gas" && kind !== "oil") {
        throw new Error("[HunanSeries] 节点 " + n.id + " 所属管道 " + n.pipelineId + " 的 kind 非法：" + kind);
      }
      totals[kind] += 1;
      var st = statusMap[n.id];
      if (!st) {
        throw new Error("[HunanSeries] 节点 " + n.id + " 在 HunanSites.sites() 里找不到对应 status");
      }
      if (st !== "ok") acc[kind] += 1;
    });
    return [
      { discipline: "gas", label: "输气专业（gas 管道）", issueCount: acc.gas, total: totals.gas },
      { discipline: "oil", label: "输油专业（oil 管道）", issueCount: acc.oil, total: totals.oil }
    ];
  }

  // 各作业区巡检覆盖率（完成率本身是演示设定，见函数内注释；但公式让它随
  // issueCount 实时变化，满足"剧本调整 status 后数字要跟着变"的纪律）。
  //
  // 业务假设：问题站点越多，说明巡检/维修资源被抽调去处理异常，按计划完成的
  // 巡检任务比例就相应走低。公式：coverage = 96 - issueCount * 1.5，基准 96 和
  // 系数 1.5 都是本 demo 的业务假设，不是测算出来的真实系数；clamp 到 [60, 100]。
  // total=0 的作业区（本口径下没有站点）覆盖率记为 null。
  function zoneCoverageRows() {
    var rank = zoneRankRows();
    return rank.map(function (r) {
      var coverage = r.total === 0 ? null : Math.round(96 - r.issueCount * 1.5);
      if (coverage !== null) {
        if (coverage > 100) coverage = 100;
        if (coverage < 60) coverage = 60;
      }
      return { zoneId: r.zoneId, name: r.name, coverageRate: coverage };
    });
  }

  window.HunanSeries = {
    zoneRankRows: zoneRankRows,
    zoneStatusMix: zoneStatusMix,
    siteKindMix: siteKindMix,
    pipelineRows: pipelineRows,
    provinceSummary: provinceSummary,
    inspectionCoverageTrend: inspectionCoverageTrend,
    issueByDiscipline: issueByDiscipline,
    zoneCoverageRows: zoneCoverageRows
  };
})();
