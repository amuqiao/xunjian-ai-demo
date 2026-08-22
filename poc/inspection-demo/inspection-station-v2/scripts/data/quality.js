// window.StationQuality —— 站点级巡检质量数据（本 POC 唯一新增的数据文件，L2 数据层）。
//
// 【监督者视角，以及为什么这一屏的第二个维度是时间】
// 省域大屏（poc/inspection-demo/hunan-overview-v2）是 141 个站点 × **一个时点** 的横截面，
// 回答「哪个作业区差」。本页是 1 个站点，横截面只剩一行，所以这里的第二个维度必须是
// **时间**：同一套指标按巡检轮次排开，回答「这个站最近怎么样、在变好还是变差」。
// 同一个指标在两屏换的是轴，不是 scope。
//
// 这也解决了单站单轮上「完成率恒为 100%」那个死结：256 条巡检项都已提交（数据模型的
// 真实边界，见 inspection-3d-sandbox/scripts/data/series.js 的注释），所以「提交完成率」
// 在单轮上恒等于 1。监督者真正要问的不是「勾打完了吗」，而是「打完的这些勾里有多少是
// 走过场的」—— 于是有了下面的**合规率**：提交项里扣掉被行为异常判定为无效的那些。
//
// 【与真实数据的硬对齐】本文件是手写的演示数据表（与
// hunan-inspection-overview/scripts/data/quality.js 同一类产物），但**最后一轮就是本页
// 地图与巡检项列表展示的那一轮**（2026-08-04，唐爱纯），它的四个字段全部从真实数据现算
// 并在 assertAnchor() 里逐条断言：
//     planned  === Map3DContract.TOTAL_ITEMS            （256，派生自 12 区真实项数）
//     issues   === DemoStation.stationProgress().issueCount （3，逐项 status 现算）
//     p1       === 256 条巡检项里 status==="danger" 的条数   （2，正好是「P1 2 项待处置」）
//     minutes  === DemoTrack.track().durationMin          （63，真实轨迹时长）
// 前 13 轮是演示数据。改动 items-*.js 里任何一项的 status，或改 track 的时长，启动时
// 这里会直接抛错，不会静默漂移成「趋势图的最右点和屏上这一轮对不上」。
//
// 【三类行为异常的判定对象：项，不是任务】省域那份 quality.js 的口径是
// 「<10min / <10s / 偏移30min」，那是对**一次巡检任务**的判定。站点这一层的最小单位是
// 256 个巡检项，所以判定对象换成项，阈值随之改成：
//     时长异常  单项现场停留 < 10 秒
//     间隔异常  相邻两项提交间隔 < 3 秒（连点）
//     时段异常  提交时刻偏离计划时段 30 分钟以上   ← 这一条口径与省域一致
// 这个改口径不是拍脑袋：真实轨迹是 63 分钟走完 256 项，**平均 14.8 秒/项**，所以「有些项
// 停留不足 10 秒」在这份数据里本来就是可信的；反过来若沿用「任务用时 <10min」，本站一轮
// 63 分钟永远不会触发，那条指标就恒为 0。
//
// 【跨屏不对齐是明确决定】本站属长沙作业区，而省域那份 quality.js 里长沙作业区
// issues=1、需关注站点是「8#阀室」。两屏刻意各自自洽、不做数字对齐（2026-08-23 决定）。
// 所以本文件不引用、也不试图匹配省域那一侧的任何数字。
(function () {
  "use strict";

  var Contract = window.Map3DContract;
  if (!Contract) {
    throw new Error("[StationQuality] 缺少 window.Map3DContract，请先加载 scripts/map3d/contract.js");
  }
  ["DemoStation", "DemoItems", "DemoTrack", "DemoTask"].forEach(function (name) {
    if (!window[name]) {
      throw new Error("[StationQuality] 缺少 window." + name + "，请检查 index.html 的 <script> 加载顺序");
    }
  });

  // 三类行为异常 + AI 提醒。KINDS 的顺序就是屏上的显示顺序（图表与清单都按它排）。
  var KINDS = [
    { key: "duration", label: "时长异常", rule: "单项现场停留 < 10 秒", tone: "warn" },
    { key: "interval", label: "间隔异常", rule: "相邻两项提交间隔 < 3 秒", tone: "warn" },
    { key: "offWindow", label: "时段异常", rule: "提交时刻偏离计划时段 30 分钟以上", tone: "warn" },
    // AI 提醒不是「违规」，是模型主动提出的核实线索 —— 配色与前三类分开（见
    // core/chartopts.js 的 KIND_TONE），因为管理动作不同类：前三类要找人核对流程，
    // 这一类要去现场核实设备。
    { key: "aiAlerts", label: "AI 提醒", rule: "时序 / 轨迹模型触发的核实线索", tone: "cyan" }
  ];
  var BEHAVIOR_KEYS = ["duration", "interval", "offWindow"];

  // ---------------------------------------------------------------------------
  // 近 14 轮巡检质量记录（每日一轮，与任务卡 24 小时的计划窗口一致）。
  //
  // 这份序列刻意讲一个监督者应该发现的故事：用时从 88 分钟一路压到 63 分钟，行为异常
  // 同期从 3 次涨到 12 次 —— 越赶越糙。最右那一轮就是本页展示的这一轮。
  // planned 每轮恒为 256（同一张巡检表，项数不变），不手写字面量，装配时统一填。
  // ---------------------------------------------------------------------------
  var ROUNDS = [
    { date: "2026-07-22", inspector: "唐爱纯", duration: 2, interval: 1, offWindow: 0, aiAlerts: 2, issues: 1, p1: 0, minutes: 88 },
    { date: "2026-07-23", inspector: "王泽宇", duration: 1, interval: 0, offWindow: 0, aiAlerts: 1, issues: 0, p1: 0, minutes: 92 },
    { date: "2026-07-24", inspector: "唐爱纯", duration: 3, interval: 1, offWindow: 0, aiAlerts: 2, issues: 1, p1: 0, minutes: 85 },
    { date: "2026-07-25", inspector: "金彪", duration: 2, interval: 2, offWindow: 1, aiAlerts: 3, issues: 1, p1: 0, minutes: 79 },
    { date: "2026-07-26", inspector: "唐爱纯", duration: 1, interval: 1, offWindow: 0, aiAlerts: 1, issues: 0, p1: 0, minutes: 90 },
    { date: "2026-07-27", inspector: "周理斌", duration: 4, interval: 2, offWindow: 0, aiAlerts: 3, issues: 2, p1: 1, minutes: 74 },
    { date: "2026-07-28", inspector: "唐爱纯", duration: 3, interval: 1, offWindow: 1, aiAlerts: 2, issues: 1, p1: 0, minutes: 78 },
    { date: "2026-07-29", inspector: "王泽宇", duration: 2, interval: 1, offWindow: 0, aiAlerts: 2, issues: 1, p1: 0, minutes: 83 },
    { date: "2026-07-30", inspector: "唐爱纯", duration: 5, interval: 3, offWindow: 1, aiAlerts: 4, issues: 2, p1: 1, minutes: 70 },
    { date: "2026-07-31", inspector: "金彪", duration: 4, interval: 2, offWindow: 1, aiAlerts: 3, issues: 2, p1: 1, minutes: 72 },
    { date: "2026-08-01", inspector: "唐爱纯", duration: 6, interval: 3, offWindow: 1, aiAlerts: 5, issues: 2, p1: 1, minutes: 68 },
    { date: "2026-08-02", inspector: "周理斌", duration: 5, interval: 4, offWindow: 2, aiAlerts: 5, issues: 3, p1: 1, minutes: 66 },
    { date: "2026-08-03", inspector: "王泽宇", duration: 7, interval: 4, offWindow: 2, aiAlerts: 6, issues: 3, p1: 2, minutes: 64 },
    // ↓ 本轮：四个字段在 assertAnchor() 里与真实数据逐条比对，不许手改成别的值。
    { date: "2026-08-04", inspector: "唐爱纯", duration: 6, interval: 4, offWindow: 2, aiAlerts: 6, issues: 3, p1: 2, minutes: 63 }
  ];

  // ---------------------------------------------------------------------------
  // 本轮明细：12 条行为异常 + 6 条 AI 提醒，每条挂一个**真实巡检项**。
  // itemIndex 是该区 DemoItems[areaId] 数组的下标 —— 运行时取出真实的 point/title，
  // 所以清单里「哪个区、哪一项」是真东西，不是编的名字。
  // 逐区条数必须与最后一轮的 duration/interval/offWindow/aiAlerts 汇总相等，
  // 由 assertDetails() 强制。
  // ---------------------------------------------------------------------------
  var DETAILS = [
    { areaId: "filter", itemIndex: 3, kind: "duration", actual: "停留 6 秒" },
    { areaId: "vent", itemIndex: 2, kind: "duration", actual: "停留 5 秒" },
    { areaId: "blowdown", itemIndex: 1, kind: "duration", actual: "停留 4 秒" },
    { areaId: "power", itemIndex: 6, kind: "duration", actual: "停留 8 秒" },
    { areaId: "genset", itemIndex: 0, kind: "duration", actual: "停留 5 秒" },
    { areaId: "launcher", itemIndex: 4, kind: "duration", actual: "停留 9 秒" },

    { areaId: "gate", itemIndex: 11, kind: "interval", actual: "间隔 1 秒" },
    { areaId: "metering", itemIndex: 5, kind: "interval", actual: "间隔 2 秒" },
    { areaId: "cabinet", itemIndex: 18, kind: "interval", actual: "间隔 1 秒" },
    { areaId: "cabinet", itemIndex: 41, kind: "interval", actual: "间隔 2 秒" },

    { areaId: "blowdown", itemIndex: 5, kind: "offWindow", actual: "偏移 34 分钟" },
    { areaId: "genset", itemIndex: 3, kind: "offWindow", actual: "偏移 41 分钟" },

    // AI 提醒的 actual 只放模型名（4 个字）：明细表的「实测」列宽有限，第一版写成
    // 「时序模型：差压持续上行」这种 11 字长句，把「区域」和「巡检项」两列挤成了
    // 「35KV变…」「消防水…」。模型名才是这一列里可比的那部分（时序 vs 轨迹是两条不同
    // 的发现路径），具体描述放 hint，由场景层挂到单元格 title 上，悬停可见。
    { areaId: "gate", itemIndex: 26, kind: "aiAlerts", actual: "时序模型", hint: "差压持续上行，斜率超基线 3 倍" },
    { areaId: "gate", itemIndex: 33, kind: "aiAlerts", actual: "轨迹模型", hint: "罐区停留 12 分钟，为同区均值 1.7 倍" },
    { areaId: "filter", itemIndex: 9, kind: "aiAlerts", actual: "时序模型", hint: "滤芯前后压差超基线，判为堵塞前兆" },
    { areaId: "metering", itemIndex: 12, kind: "aiAlerts", actual: "时序模型", hint: "阀位反馈 3 次瞬时跳变，疑似信号干扰" },
    { areaId: "cabinet", itemIndex: 55, kind: "aiAlerts", actual: "轨迹模型", hint: "机柜间路径缺失一段，疑似未走完" },
    { areaId: "control", itemIndex: 8, kind: "aiAlerts", actual: "时序模型", hint: "泵出口压力波动为近 30 日基线的 1.8 倍" }
  ];

  // ---------------------------------------------------------------------------
  // 断言
  // ---------------------------------------------------------------------------

  function kindByKey(key) {
    var found = KINDS.filter(function (k) { return k.key === key; })[0];
    if (!found) throw new Error("[StationQuality] 未知的 kind：" + key);
    return found;
  }

  function realDangerItemCount() {
    var count = 0;
    Contract.AREA_IDS.forEach(function (areaId) {
      window.DemoItems[areaId].forEach(function (item) {
        if (item.status === "danger") count += 1;
      });
    });
    return count;
  }

  // 最后一轮 = 本页展示的那一轮，四个字段必须等于真实数据现算的值。
  function assertAnchor() {
    var last = ROUNDS[ROUNDS.length - 1];
    var expectedDate = window.DemoTask.task().actualStart.slice(0, 10);
    var checks = [
      ["date", last.date, expectedDate],
      ["planned", last.planned, Contract.TOTAL_ITEMS],
      ["issues", last.issues, window.DemoStation.stationProgress().issueCount],
      ["p1", last.p1, realDangerItemCount()],
      ["minutes", last.minutes, window.DemoTrack.track().durationMin]
    ];
    checks.forEach(function (row) {
      if (row[1] !== row[2]) {
        throw new Error(
          "[StationQuality] 最后一轮的 " + row[0] + " = " + row[1] +
          "，但真实数据现算是 " + row[2] +
          " —— 最右那一轮就是屏上这一轮，两者必须逐条相等"
        );
      }
    });
  }

  function assertRounds() {
    var seen = {};
    ROUNDS.forEach(function (r) {
      if (seen[r.date]) throw new Error("[StationQuality] 轮次日期重复：" + r.date);
      seen[r.date] = true;
      BEHAVIOR_KEYS.concat(["aiAlerts", "issues", "p1", "minutes"]).forEach(function (key) {
        if (typeof r[key] !== "number" || r[key] < 0) {
          throw new Error("[StationQuality] 轮次 " + r.date + " 的 " + key + " 必须是非负数字");
        }
      });
      if (r.p1 > r.issues) {
        throw new Error("[StationQuality] 轮次 " + r.date + " 的 p1(" + r.p1 + ") 不能大于 issues(" + r.issues + ")");
      }
      var invalid = BEHAVIOR_KEYS.reduce(function (sum, key) { return sum + r[key]; }, 0);
      if (invalid > r.planned) {
        throw new Error("[StationQuality] 轮次 " + r.date + " 的行为异常合计 " + invalid + " 超过计划项数 " + r.planned);
      }
    });
  }

  // 明细的逐类条数必须等于最后一轮的对应字段；每条的 areaId / itemIndex 必须落在真实数据里。
  function assertDetails() {
    var last = ROUNDS[ROUNDS.length - 1];
    var byKind = {};
    KINDS.forEach(function (k) { byKind[k.key] = 0; });

    DETAILS.forEach(function (d, i) {
      if (Contract.AREA_IDS.indexOf(d.areaId) < 0) {
        throw new Error("[StationQuality] 明细 #" + i + " 的 areaId 非法：" + d.areaId);
      }
      kindByKey(d.kind);
      var items = window.DemoItems[d.areaId];
      if (!Number.isInteger(d.itemIndex) || d.itemIndex < 0 || d.itemIndex >= items.length) {
        throw new Error(
          "[StationQuality] 明细 #" + i + "（" + d.areaId + "）的 itemIndex " + d.itemIndex +
          " 越界，该区共 " + items.length + " 项"
        );
      }
      if (typeof d.actual !== "string" || d.actual === "") {
        throw new Error("[StationQuality] 明细 #" + i + " 的 actual 必须是非空字符串");
      }
      // hint 是可选的补充描述（目前只有 AI 提醒那几条有）。传了就必须是非空字符串，
      // 不允许传空串占位 —— 空串会渲染成一个空的 title 属性，悬停时弹一个空气泡。
      if (d.hint != null && (typeof d.hint !== "string" || d.hint === "")) {
        throw new Error("[StationQuality] 明细 #" + i + " 的 hint 传了就必须是非空字符串");
      }
      byKind[d.kind] += 1;
    });

    KINDS.forEach(function (k) {
      if (byKind[k.key] !== last[k.key]) {
        throw new Error(
          "[StationQuality] 明细里 " + k.label + " 有 " + byKind[k.key] +
          " 条，但最后一轮的 " + k.key + " 是 " + last[k.key] + " —— 两者必须相等"
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 装配与派生
  // ---------------------------------------------------------------------------

  ROUNDS.forEach(function (r) { r.planned = Contract.TOTAL_ITEMS; });
  assertRounds();
  assertAnchor();
  assertDetails();

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // 合规率：提交项里扣掉被三类行为异常判定为无效的那些。分母是 planned（每轮恒为 256），
  // 因为这份数据集里 submitted 恒等于 planned（数据模型的真实边界，见文件头）。
  function deriveRound(r) {
    var invalid = BEHAVIOR_KEYS.reduce(function (sum, key) { return sum + r[key]; }, 0);
    var valid = r.planned - invalid;
    return {
      date: r.date,
      shortDate: r.date.slice(5),
      inspector: r.inspector,
      planned: r.planned,
      submitted: r.planned,
      invalid: invalid,
      valid: valid,
      complianceRate: round1(valid / r.planned * 100),
      duration: r.duration,
      interval: r.interval,
      offWindow: r.offWindow,
      aiAlerts: r.aiAlerts,
      issues: r.issues,
      p1: r.p1,
      riskLevel: r.p1 > 0 ? "P1" : (r.issues > 0 ? "P2" : "-"),
      minutes: r.minutes,
      secondsPerItem: round1(r.minutes * 60 / r.planned)
    };
  }

  function rounds() {
    return ROUNDS.map(deriveRound);
  }

  function current() {
    return deriveRound(ROUNDS[ROUNDS.length - 1]);
  }

  function previous() {
    if (ROUNDS.length < 2) throw new Error("[StationQuality] 轮次不足 2 条，无法取上一轮");
    return deriveRound(ROUNDS[ROUNDS.length - 2]);
  }

  // 本轮明细，每条补上真实巡检项的 point/title 与区域名。
  function details() {
    return DETAILS.map(function (d) {
      var item = window.DemoItems[d.areaId][d.itemIndex];
      var kind = kindByKey(d.kind);
      return {
        areaId: d.areaId,
        areaName: window.DemoStation.area(d.areaId).name,
        kind: d.kind,
        kindLabel: kind.label,
        rule: kind.rule,
        actual: d.actual,
        hint: d.hint || null,
        itemId: item.id,
        itemPoint: item.point,
        itemTitle: item.title
      };
    });
  }

  function detailsByArea(areaId) {
    if (Contract.AREA_IDS.indexOf(areaId) < 0) {
      throw new Error("[StationQuality] detailsByArea 收到非法 areaId：" + areaId);
    }
    return details().filter(function (d) { return d.areaId === areaId; });
  }

  window.StationQuality = {
    KINDS: KINDS,
    BEHAVIOR_KEYS: BEHAVIOR_KEYS,
    rounds: rounds,
    current: current,
    previous: previous,
    details: details,
    detailsByArea: detailsByArea
  };
})();
