// 湖南省油气管网大屏总览 —— 图表数据源（L?：数据层，依赖 map3d/contract.js 与
// scripts/data/topology.js，均须先于本文件加载；本文件产出的是纯数据，不是
// ECharts option —— option 构造在 scripts/core/chartopts.js）。
//
// 【POC：hunan-pump-overview（泵站总览，成品油 44 节点）】
// topology.js 是与姐妹 POC hunan-inspection-overview 逐字节相同的全量拓扑文件
// （24 条管道 / 217 节点，gas + oil 都有），但本 POC 的业务语义是"泵站/成品油
// 输送"，所以本文件在读取时只挑出 kind === "oil" 的管道（changchen 长郴管道 /
// xiangzhu-branch 湘株支线 / xianglou-branch 湘娄支线，共 3 条、44 个节点），
// 下面所有"共有"聚合方法都是在这个 44 节点子集上算的，不是全省 217 节点——这也是
// 为什么本文件不能直接复用 hunan-inspection-overview/scripts/data/series.js 的
// 代码（范围不同），两份文件的方法名相同、实现思路一致，但各自独立维护。
// 本文件独有的图表方法（pipelineProfile / pumpHealthRank / throughputRows）对应
// "成品油输送"语义；姐妹 POC 换成 inspectionCoverageTrend / issueByDiscipline /
// zoneCoverageRows 对应"巡检"语义，本文件没有那几个方法。
//
// 纪律：本文件里所有跨作业区/跨管道的聚合数字都是从 topology.js（拓扑真实资料）
// 和 window.HunanSites（站点级 status，另一 agent 产出）实时派生出来的，不写死
// 任何聚合结果字面量——演示剧本调整某个站点的 status 后，这里的数字必须自动跟着
// 变。只有在"演示设定"一节里，某些业务量值（沿线压力、日输量系数）确实没有数据
// 支撑，才允许用可解释的确定性公式生成演示数值，并在注释里逐条标明这是演示假定、
// 哪部分数字是真实资料——这与本项目一贯的"假定必须可辨认"纪律一致。
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

  // ---- 数据范围：本 POC 只看 kind === "oil" 的管道（3 条 / 44 节点） ----
  function scopedPipelines() {
    return Topology.pipelines.filter(function (p) { return p.kind === "oil"; });
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

  function findNode(id) {
    var found = null;
    Topology.nodes.some(function (n) {
      if (n.id === id) {
        found = n;
        return true;
      }
      return false;
    });
    if (!found) {
      throw new Error(
        "[HunanSeries] pipelineProfile/throughputRows 引用的节点 id=\"" + id + "\" 在 topology.js 里" +
        "不存在，数据可能已变更，请同步核对沿线站场顺序"
      );
    }
    return found;
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
  // 一、两块屏「共有」的聚合（本文件按成品油 44 节点口径实现）
  // ============================================================

  // 10 作业区排名：{ zoneId, name, stationCount, valveCount, total, issueCount, score }
  // 注意：湘北/湘中/郴州/湘西 4 个作业区在成品油网络里没有任何节点（44 节点全部
  // 落在岳阳/长沙/湘娄/株洲/衡阳/永郴 6 个作业区），total=0，score 记为 null，
  // 不参与评分——不是这 4 个区"表现差"，是它们本来就不在成品油管网范围内。
  //
  // score 健康分公式（可解释，非魔法数字，与姐妹 POC 一致）：
  //   score = 100 - (danger数量 * 100 + warn数量 * 50) / total
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

  // 管道清单：{ id, name, kind, nodeCount, stationCount, valveCount }（3 条成品油管道）
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
  // zoneTotal/districtTotal 是行政/组织意义上的总数（10 作业区、14 市），不随本
  // POC 的数据口径收窄而变化；pipelineTotal/stationTotal/valveTotal/issueTotal
  // 则按成品油 44 节点口径计算。
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
  // 二、B（泵站总览）独有：对应"成品油输送"业务语义
  // ============================================================

  // 沿线剖面：横轴=里程(km)，纵轴=压力(MPa)。这是输油管道特有的表达（气管道没有
  // 这种"沿线压力剖面"的展示传统，所以放在 B 而不是 A）。
  //
  // 真实里程依据（来自业务方《国家管网湖南成品油管道线路全图》）：
  //   长岭—郴州（长郴管道，主线）总长 592km；湘潭—娄底（湘娄支线）116km；
  //   湘潭—株洲（湘株支线）24km。
  // 主线两端点（长岭=0km、郴州=592km）为真实资料；中间 6 个站场
  // （七里山/汨罗/长沙/株洲/衡阳/耒阳）的里程是业务方给定沿线展示顺序下的演示
  // 插值位置——业务方要求按"长沙站场→株洲末站→衡阳泵站"的顺序把株洲摆进主线
  // 展示序列，而株洲在真实地理上是从湘潭分支出去的湘株支线终点，这里是配合演示
  // 叙事的简化，不代表株洲真的在长郴管道主干线上。压力数值全部为演示假定：
  // 汨罗、衡阳是业务方标注的"泵站"，压力在这两处回升（模拟增压），其余站场之间
  // 压力递减（模拟沿线摩阻损失），末站郴州压力最低。
  // 站场名称一律用 findNode(id).name 从 topology.js 现读，不在此处重复硬编码，
  // 避免与拓扑数据漂移。
  function pipelineProfile() {
    var mainLineSpec = [
      { id: "changchen-01", km: 0, pressure: 6.4, pumpStation: false },
      { id: "changchen-03", km: 22, pressure: 5.6, pumpStation: false },
      { id: "changchen-07", km: 58, pressure: 6.0, pumpStation: true },
      { id: "changchen-09", km: 168, pressure: 5.2, pumpStation: false },
      { id: "xiangzhu-branch-03", km: 196, pressure: 4.8, pumpStation: false },
      { id: "changchen-22", km: 372, pressure: 5.7, pumpStation: true },
      { id: "changchen-25", km: 438, pressure: 4.9, pumpStation: false },
      { id: "changchen-31", km: 592, pressure: 4.0, pumpStation: false }
    ];
    var mainLine = mainLineSpec.map(function (spec) {
      var node = findNode(spec.id);
      return {
        id: spec.id,
        name: node.name,
        zoneId: node.zoneId,
        km: spec.km,
        pressure: spec.pressure,
        pumpStation: spec.pumpStation
      };
    });
    // 娄底站在湘娄支线上，与主线不连续。116 是湘潭—娄底的真实资料，但这里的
    // 基准点（196，即上面株洲的演示插值里程）本身不是湘潭的真实里程，所以两者
    // 相加得到的 312 仍然整体属于演示性质，只是分支长度这一项是真实资料。
    var branchNode = findNode("xianglou-branch-06");
    var branch = {
      id: "xianglou-branch-06",
      name: branchNode.name + "（湘娄支线末站）",
      zoneId: branchNode.zoneId,
      km: 196 + 116,
      pressure: 3.8
    };
    return { unit: "km", pressureUnit: "MPa", mainLine: mainLine, branch: branch };
  }

  // 泵站健康度排名：对成品油网络里全部 11 个站场（kind === "station"）按健康分
  // 排序，分数从站点当前 status 映射而来。
  //
  // 映射表（可解释，非算法拟合出来的）：ok=100（无异常，满分）、warn=60（存在待
  // 处理关注项，扣 40 分）、danger=20（存在紧急异常，扣 80 分）。分档比例是本
  // demo 的业务假设，用于把三档状态量化成一个可排序的单一健康分，不是从真实 KPI
  // 公式反推出来的。
  function pumpHealthRank() {
    var statusMap = statusById();
    var scoreMap = { ok: 100, warn: 60, danger: 20 };
    var nodes = scopedNodes().filter(function (n) { return n.kind === "station"; });
    var rows = nodes.map(function (n) {
      var st = statusMap[n.id];
      if (!st) {
        throw new Error("[HunanSeries] 节点 " + n.id + " 在 HunanSites.sites() 里找不到对应 status");
      }
      if (scoreMap[st] === undefined) {
        throw new Error("[HunanSeries] 节点 " + n.id + " 的 status=" + st + " 不是合法状态值");
      }
      return { id: n.id, name: n.name, zoneId: n.zoneId, status: st, score: scoreMap[st] };
    });
    rows.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    return rows;
  }

  // 各段（管道）输量：完全演示设定，见下方逐项说明。
  //
  // mileageKm 是真实资料（业务方《国家管网湖南成品油管道线路全图》给出的三段
  // 里程：长郴管道 592km / 湘株支线 24km / 湘娄支线 116km）。
  // dailyThroughput（万吨/日）用演示公式从里程换算：
  //   dailyThroughput = round(mileageKm * 0.02, 1 位小数)
  // 系数 0.02（"单位里程输量强度"）是本 demo 假设的常数，不是真实调度数据，只是
  // 让数字随管道长度呈单调变化、便于图表演示，不代表任何真实吞吐量指标。
  // utilizationPct（管容利用率）改用该管道当前的问题占比反向换算，让它随剧本
  // 调整站点 status 实时变化：
  //   utilizationPct = 100 - issuePct(该管道) * 2，clamp 下限 40
  // 系数 2 与下限 40 同样是演示假设。
  function throughputRows() {
    var statusMap = statusById();
    var pipelines = scopedPipelines();
    var mileageById = {
      changchen: 592,
      "xiangzhu-branch": 24,
      "xianglou-branch": 116
    };
    return pipelines.map(function (p) {
      var mileage = mileageById[p.id];
      if (typeof mileage !== "number") {
        throw new Error("[HunanSeries] throughputRows 缺少管道 " + p.id + " 的真实里程，需要补充 mileageById");
      }
      var nodes = Topology.nodes.filter(function (n) { return n.pipelineId === p.id; });
      var mix = countStatus(nodes, statusMap);
      var issuePct = nodes.length === 0 ? 0 : ((mix.warn + mix.danger) / nodes.length) * 100;
      var dailyThroughput = Math.round(mileage * 0.02 * 10) / 10;
      var utilizationPct = Math.round(100 - issuePct * 2);
      if (utilizationPct < 40) utilizationPct = 40;
      if (utilizationPct > 100) utilizationPct = 100;
      return {
        id: p.id,
        name: p.name,
        mileageKm: mileage,
        dailyThroughput: dailyThroughput,
        utilizationPct: utilizationPct
      };
    });
  }

  window.HunanSeries = {
    zoneRankRows: zoneRankRows,
    zoneStatusMix: zoneStatusMix,
    siteKindMix: siteKindMix,
    pipelineRows: pipelineRows,
    provinceSummary: provinceSummary,
    pipelineProfile: pipelineProfile,
    pumpHealthRank: pumpHealthRank,
    throughputRows: throughputRows
  };
})();
