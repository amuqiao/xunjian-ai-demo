// 领域契约 00：身份、术语、导航、复核人、入口。
//
// 这是 domain-skeleton —— 一份"最小假数据"领域包，唯一职责是让骨架层能在没有任何
// 真实业务数据的情况下跑起来、并让 scripts/schema.js 的每一条校验都有东西可校。
// 这里承载泵课题演示数据，页面层只消费这些配置。
//
// 真实课题包（domain-pump / domain-inspection）必须提供同样的 10 份文件、同样的
// 全局名，字段一个不少。缺字段、id 悬空一律在启动时抛错，不做兜底。
window.DOMAIN_META = {
  contractVersion: 1,
  domainId: "pump-demo",

  title: "输油泵智能诊断流程演示",
  subtitle: "长岭站 P-1 输油泵 · 联轴器/振动复核 · PUMP-20260722-A",
  batchId: "PUMP-20260722-A",
  clockText: "2026-07-22 16:31",
  statusLine: "泵课题表单、告警趋势、视觉证据与知识库依据已接入演示链路。",

  // 骨架层里所有面向用户的名词都从这里取。换课题时只改这里，不改 scripts/。
  terms: {
    object: "泵机组",
    part: "诊断部位",
    record: "巡检记录",
    inspector: "巡检人",
    workOrder: "处置票卡"
  },

  // 顶部只保留 3 个主场景。报告归档不再是独立页面，而是人工复核里的确认浮层。
  scenes: [
    { key: "workbench", label: "诊断工作台", node: "证据质检" },
    { key: "review", label: "人工复核", node: "专家决策" },
    { key: "knowledge", label: "知识库", node: "资料检索" }
  ],

  // 恰好 6 步。不含"任务总览""站点态势"——那两步属于大屏和站点，不在本 POC 内，
  // 放进来会变成一条前两格永远点不亮的进度条。
  flowSteps: [
    { key: "inspection", label: "质检", desc: "记录 / AI 冲突" },
    { key: "trend", label: "告警", desc: "曲线 / 阈值" },
    { key: "vision", label: "视觉", desc: "关键帧 / 标注" },
    { key: "agent", label: "Agent", desc: "问答 / 命中" },
    { key: "review", label: "复核", desc: "专家 / 结论" },
    { key: "archive", label: "归档", desc: "报告 / 复用" }
  ],

  // 复核人身份。它不是结论的附属字段，而是"谁在做这个决定"，因此挂在 meta 上、
  // 由复核页右上角的身份芯片切换，不进 06-review.js 的 fields。
  // role 目前只进报告插槽，不影响处置步骤——角色分工规则要由业务提供，编一套假的
  // 塞进 demo 会变成误导。
  reviewers: [
    { id: "reviewer-a", name: "王建国", role: "设备管理工程师" },
    { id: "reviewer-b", name: "李明", role: "站场班组长" }
  ],
  defaultReviewerId: "reviewer-a",

  // 本 POC 唯一的对外接缝：本轮演示从哪个对象 / 部位 / 记录开始。
  // 它的存在理由是防止对象 id 散落到状态层和四个场景里，不是为组装做准备。
  entry: {
    objectId: "OBJ-A",
    partId: "PART-1",
    recordId: "REC-001"
  }
};
