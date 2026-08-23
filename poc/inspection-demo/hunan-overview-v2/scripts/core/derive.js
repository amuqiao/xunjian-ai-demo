// 派生指标的唯一真源：window.HunanDerive（L4 core，必须早于 core/chartopts.js 与
// scenes/overview.js 加载）。
//
// 【为什么单独一个文件】这些算式原先在 chartopts.js（画图用）和 overview.js（写字用）
// 各写了一份，注释里靠一句「两处必须一致」维持。实测的后果：把合规率从图下注挪到卡头
// meta 之后，chartopts.js 里那个带完整注释、还有 verify 断言保护的 complianceRate()
// **失去了最后一个调用者**，而屏上显示的那个数是 overview.js 里另写的一行内联表达式。
// 正确实现被验证盯着、屏上的数没人盯 —— 这是「两处必须一致」最容易断的形态。
//
// 放在这里而不是塞进 ChartOptions 的导出里：chartopts.js 文件头自称「纯 option 构造器，
// 不碰 DOM」，让场景层反过来调它取数字会破坏那条分层声明。
//
// 【不做静默兜底】分母为 0、分子越界、非有限数一律抛。但「分母合法地等于 0」不是错
// （全省问题清零是这块屏存在的目的），那种情况由调用方渲染一个域分支，不是在这里
// 返回一个假数 —— 所以本文件只提供 canRate() 让调用方先问，不提供默认值。
(function () {
  "use strict";

  var BEHAVIOR_KEYS = ["duration", "interval", "offWindow"];

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // 三类行为异常之和。口径与 inspection-station-v2 的 BEHAVIOR_KEYS 一致：
  // AI 提醒不计入 —— 它是模型主动提出的核实线索，不是巡检人员的违规。
  function behaviorTotal(q) {
    var total = 0;
    BEHAVIOR_KEYS.forEach(function (key) {
      if (typeof q[key] !== "number" || !isFinite(q[key])) {
        throw new Error("[HunanDerive] 质量数据缺少字段 " + key + " 或取值非法：" + q[key]);
      }
      total += q[key];
    });
    return total;
  }

  function canRate(num, den) {
    return typeof num === "number" && typeof den === "number"
      && isFinite(num) && isFinite(den) && den > 0 && num >= 0 && num <= den;
  }

  function ratePct(num, den, label) {
    if (typeof num !== "number" || typeof den !== "number" || !isFinite(num) || !isFinite(den)) {
      throw new Error("[HunanDerive] " + label + " 需要两个有限数，收到 " + num + " / " + den);
    }
    if (den <= 0) throw new Error("[HunanDerive] " + label + " 的分母必须为正，收到 " + den);
    if (num < 0 || num > den) throw new Error("[HunanDerive] " + label + " 的分子越界：" + num + " / " + den);
    return round1(num / den * 100);
  }

  // 有效项 = 已巡 − 行为异常。**不是** 计划 − 行为异常：走过场的那些项本来就在已巡的
  // 项里面。写成 (planned − beh)/planned 会算出 129/141 = 91.5%，等于把没巡的 7 项也
  // 当成了有效；正确的是 (134 − 12)/141 = 86.5%。
  // inspection-station-v2 那一屏两种写法算出来一样（submitted === planned，256 项全提交），
  // 所以那边看不出差别；省域这边 completed(134) < planned(141)，差别就露出来了。
  function validItems(q) {
    var v = q.completed - behaviorTotal(q);
    if (v < 0) {
      throw new Error("[HunanDerive] 有效项为负：已巡 " + q.completed + " 项里判出 "
        + behaviorTotal(q) + " 项行为异常，两个数不是同一批口径");
    }
    return v;
  }

  // 合规率：完成率只回答「勾打完了吗」，合规率回答「打完的勾有多少可信」。
  function complianceRate(q) {
    return ratePct(validItems(q), q.planned, "合规率");
  }

  // 问题处置完成率：业务方原词（《巡检情况反馈情况说明》原话「统计巡检率、异常上报率、
  // 问题处置完成率等指标，量化评价效果」）。逐区算出 100/100/100/100/80/50，与
  // 智能巡检数智员工_巡检.html 周报里已发布的闭环率逐字吻合。
  //
  // ⚠️ 口径边界：算式隐含假设「不是未闭环 P1 的问题就都闭环了」。数据层没有逐问题的
  // 闭环字段，严格说这是「非未闭环-P1 占比」。
  //
  // issues === 0 是合法状态（全省问题清零），此时没有比率可算 —— 调用方先用
  // canDisposalRate() 问，为 false 时渲染域分支，别在这里造一个 100% 出来。
  function canDisposalRate(q) {
    return canRate(q.issues - q.currentRisk, q.issues);
  }

  function disposalRate(q) {
    return ratePct(q.issues - q.currentRisk, q.issues, "问题处置完成率");
  }

  // 达标线 95%：取自 智能巡检数智员工_巡检.html 的 TEAM_BAR_OPTION 副标「目标线 95% ·
  // 全省口径」，不是这边新定的。也是完成率变色的那个阈值，两处必须同源。
  var TARGET_RATE = 95;

  window.HunanDerive = {
    BEHAVIOR_KEYS: BEHAVIOR_KEYS,
    TARGET_RATE: TARGET_RATE,
    round1: round1,
    behaviorTotal: behaviorTotal,
    canRate: canRate,
    ratePct: ratePct,
    validItems: validItems,
    complianceRate: complianceRate,
    canDisposalRate: canDisposalRate,
    disposalRate: disposalRate
  };
})();
