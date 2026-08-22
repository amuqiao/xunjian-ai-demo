// 领域契约 05：人工复核。
//
// 【只做 L1 结论 chips + L3 自由文本】与参照物同一决定，理由见那份文件同一位置。
//
// 四个结论与 04-records.js 各条记录的 suggestion.outcomeId 一一对应：选中的结论与
// AI 建议不一致时进入**分歧态**，复核意见变必填，报告多出一段「复核分歧说明」。
//
// 【常用语换成泵课题的】assets/诊断工作台/泵课题Q&A.docx 里专家最后说「将我与你的对话
// 记录并总结，更新到巡检报告内」—— 那几句质询的落点就是这个文本框。所以常用语里刻意
// 放了两条"质询后的结论"，点一下就能把 Q&A 里那种反问变成一句可归档的复核意见。
window.DOMAIN_REVIEW = (function () {
  "use strict";

  // 三位复核人，取自真实报告里出现过的岗位设置（值班员 / 值班站长 / 作业区专业岗）。
  // 《长岭站P-01输油泵驱动端振动报警故障停泵报告》里就是这三级人在处置。
  var reviewers = [
    { id: "RV-1", name: "杨农", role: "站场值班站长" },
    { id: "RV-2", name: "李琪", role: "站场值班员" },
    { id: "RV-3", name: "张林", role: "作业区机械专业岗" }
  ];

  var outcomes = [
    {
      id: "OUT-CONFIRM", label: "确认异常，转分级处置",
      hint: "按分级方案执行，补充人工意见后生成报告",
      tone: "danger",
      // 归档后解锁「二次命中」：依据链里 locked 的那枚芯片亮起。
      // 只有「确认异常」这一支解锁 —— 只有真被确认的异常才值得作为案例复用。
      unlocksReuse: true
    },
    { id: "OUT-ARCHIVE", label: "按 AI 结论归档",
      hint: "采用建议，直接生成报告", tone: "ok", unlocksReuse: false },
    { id: "OUT-RECHECK", label: "先核工况，暂不停机",
      hint: "采纳备选诊断，核对过泵流量后再判", tone: "warn", unlocksReuse: false },
    { id: "OUT-SUPPLEMENT", label: "补录台账后归档",
      hint: "补齐阈值缺项再入库", tone: "warn", unlocksReuse: false }
  ];

  // 常用语：点一下追加进复核意见文本框，现场不用打字。
  // 五条各自对应一种复核走向，不写通用废话。第 3、4 条是 Q&A 那 17 轮质询的落点。
  var phrases = [
    "已按分级方案降至 70% 负荷，安排 4 小时内现场复测并取油样。",
    "对中实测已合格，本项闭环归档。",
    "AI 主诊断认可，但要求工单增加激光对中复测作为前置步骤。",
    "不采纳主诊断：本轮过泵流量长期偏低，先按工况问题核查，暂不停机拆检。",
    "站控振动阈值缺项已提报，纳入下一轮台账质量复查。"
  ];

  var defaultReviewerId = "RV-1";

  function reviewerById(id) {
    var found = reviewers.filter(function (r) { return r.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_REVIEW] 未知复核人：" + id);
    return found;
  }

  function outcomeById(id) {
    var found = outcomes.filter(function (o) { return o.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_REVIEW] 未知结论：" + id);
    return found;
  }

  return {
    reviewers: reviewers, outcomes: outcomes, phrases: phrases,
    defaultReviewerId: defaultReviewerId,
    reviewerById: reviewerById, outcomeById: outcomeById
  };
})();
