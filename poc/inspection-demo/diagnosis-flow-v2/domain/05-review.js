// 领域契约 05：人工复核。
//
// 【比旧版薄，是刻意的】旧目录 DESIGN.md 设计了四层介入（L0 表决 / L1 结论 chips /
// L2 结构化补充下拉+勾选 / L3 自由文本），实现里只做了 L1 + L3。本版**明确只做 L1 + L3**
// 并把它写进契约，不再留 L0/L2 的空位 —— 这是个演示 demo，「复核人只做轻量结论选择」
// 就是要讲的那件事。
//
// 四个结论与 04-records.js 里各条记录的 suggestion.outcomeId 一一对应：选中的结论
// 与 AI 建议不一致时进入**分歧态**，复核意见变必填，报告多出一段「复核分歧说明」。
// 这是「人工介入产生后果」唯一能演出来的地方，必须保留。
window.DOMAIN_REVIEW = (function () {
  "use strict";

  var reviewers = [
    { id: "RV-1", name: "廖震宇", role: "生产运维技术员" },
    { id: "RV-2", name: "唐爱纯", role: "站场值班长" },
    { id: "RV-3", name: "王泽宇", role: "作业区技术主管" }
  ];

  var outcomes = [
    {
      id: "OUT-CONFIRM", label: "确认异常，转处置",
      hint: "补充人工意见后生成报告",
      tone: "danger",
      // unlocksReuse：归档后解锁「二次命中」（依据链里 locked 的那枚 case 芯片亮起）。
      // 只有「确认异常」这一支解锁 —— 只有真被确认的异常才值得作为案例复用。
      unlocksReuse: true
    },
    {
      id: "OUT-ARCHIVE", label: "按 AI 结论归档",
      hint: "采用建议，直接生成报告",
      tone: "ok",
      unlocksReuse: false
    },
    {
      id: "OUT-RECHECK", label: "纳入下轮复查",
      hint: "已处置，留痕并复查",
      tone: "warn",
      unlocksReuse: false
    },
    {
      id: "OUT-SUPPLEMENT", label: "补录缺项后归档",
      hint: "补齐表单缺项再入库",
      tone: "warn",
      unlocksReuse: false
    },
    {
      // ★ 第五个结论是**管理动作**，前四个都是对数据的处置。
      // 管理者视角（班长管巡检员）缺了它就不完整：发现走过场之后，能做的不是"归档"
      // 也不是"下轮复查"，而是把这一项退回去重巡。
      id: "OUT-REINSPECT", label: "退回重巡该项",
      hint: "行为异常，本轮该项数据不采信",
      tone: "danger",
      // 不解锁复用：退回重巡意味着这一项的结论还没定，没有可复用的案例。
      unlocksReuse: false
    }
  ];

  // 常用语：点一下追加进复核意见文本框，现场不用打字。
  // 四条各自对应一种结论最可能写的那句话，不写通用废话。
  var phrases = [
    "现场已复核，就地表与 SCADA 读数一致。",
    "已联系上游调整工况，安排下一班跟踪。",
    "接线端子已紧固并做防松标记，纳入下轮复查。",
    "SIS 机柜巡检项已补录，标识与柜门状态正常。",
    "该项行为数据异常，已通知巡检人当班内重巡并留痕。",
    "已向班组通报本轮行为核查结果，纳入当月巡检质量考核。"
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
    reviewers: reviewers,
    outcomes: outcomes,
    phrases: phrases,
    defaultReviewerId: defaultReviewerId,
    reviewerById: reviewerById,
    outcomeById: outcomeById
  };
})();
