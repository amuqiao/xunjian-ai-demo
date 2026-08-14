// 图谱投影规格（阶段三 G1）：声明式描述"哪些实体成节点、每类占哪条列带、哪些关系
// 成边、哪几个节点串成主线脊柱"，而不是像旧版 scripts/data/knowledge.js 的 graph
// 字段那样手写九个节点。scripts/data/graph.js 按这份规格从 scripts/data/catalog.js
// （units/parts/points/workOrder）和 scripts/data/kb-dataset.js（规则/作业卡/案例
// 文档）投影出实际节点和边——加一条规则文档或改一个部位，图谱会自动跟着变，不需要
// 同步手改任何节点列表。
//
// 坐标系沿用 scripts/scenes/graph.js 现有的 0-100（SVG viewBox 与百分比定位）。
window.DemoGraphSpec = {
  schemaVersion: 1,

  // 实体类型清单：group 是节点分类键（对应 scripts/scenes/graph.js 里
  // ".graph-node.<group>" 的 CSS 类名，场景层的渲染约定不变），band 是该类型在
  // 0-100 坐标系里占据的列带（含端点）。bands 之间必须两两不重叠，由
  // scripts/data/schema.js 的 assertGraphSpec 校验；不重叠是"左→右叙事"这条视觉
  // 规则的前提——同一列带内的节点在 x 方向也会按 autoPosition() 均分，见
  // scripts/data/graph.js。
  bands: {
    asset: [2, 14],
    part: [16, 28],
    point: [30, 42],
    rule: [44, 54],
    workcard: [56, 66],
    agent: [68, 78],
    ticket: [80, 88],
    case: [90, 98]
  },

  // 同一列带内、且不是 spine 锚点的节点，按索引在这个纵向区间里均分 y 坐标
  // （见 graph.js 的 autoPosition()）。
  verticalSpan: [10, 90],

  // ---------- 实体来源：声明每类节点从哪个数据源取 ----------
  // asset/part/point 直接来自 catalog 的既有列表（数量分别等于
  // pumpUnits/parts/points 的长度，因此本任务里改 catalog.parts 会让图谱节点数
  // 自动增减）；rule/workcard/case 来自 kb-dataset 对应分类下的全部文档（数量等于
  // 该分类下的文档数，同理，往 kb-dataset.js 加一条规则文档，图谱也会自动多一个
  // 节点）；agent 是唯一的合成节点；ticket 直接来自 catalog.workOrder。
  entitySources: {
    asset: { from: "catalog.pumpUnits" },
    part: { from: "catalog.parts" },
    point: { from: "catalog.points" },
    rule: { from: "kb.documents", categoryId: "cat-standard" },
    workcard: { from: "kb.documents", categoryId: "cat-template" },
    case: { from: "kb.documents", categoryId: "cat-case" },
    agent: { from: "synthetic", id: "agent", label: "Agent 复核建议" },
    ticket: { from: "catalog.workOrder" }
  },

  // ---------- 关系成边 ----------
  //
  // edgeRules 是类型级模板（from/to 两端都必须是 bands 里声明过的实体类型，由
  // schema.js 校验），只提供边的语义标签；具体连接"哪个具体节点到哪个具体节点"由
  // 下面几张声明表决定——asset->part、part->point 能直接从 catalog 字段推出
  // （parts 全部挂在主叙事机组下、points[].partId 直接关联），不需要额外声明表；
  // point->rule / rule->workcard / ticket->case / case->asset 这几条关系
  // catalog 和 kb-dataset 都没有直接字段可关联（kb-dataset 是"纯内容，零逻辑"，
  // 不能反过来在文档里塞 pointId 之类的图谱专属字段），因此由本文件显式声明。
  primaryAssetId: "P-1",
  edgeRules: [
    { from: "asset", to: "part", label: "定位部位" },
    { from: "part", to: "point", label: "采集测点" },
    { from: "point", to: "rule", label: "触发阈值" },
    { from: "rule", to: "workcard", label: "关联作业卡" },
    { from: "rule", to: "agent", label: "组织证据" },
    { from: "workcard", to: "agent", label: "提供处置模板" },
    { from: "agent", to: "ticket", label: "生成建议" },
    { from: "ticket", to: "case", label: "处置归档" },
    { from: "case", to: "asset", label: "相似复用" }
  ],

  // point -> rule：哪些测点触发哪份规则文档。只有"不对中诊断专家规则"是真正由
  // 证据触发的诊断规则，安全隔离规程/交接班规范是程序性文档，不挂测点。
  pointRuleTriggers: [
    { pointId: "P-DE-V", docId: "doc-misalign-rule" },
    { pointId: "COUP-PH", docId: "doc-misalign-rule" },
    { pointId: "BASE-V", docId: "doc-misalign-rule" }
  ],

  // rule -> workcard：规则命中后关联哪份作业卡。
  ruleWorkcardLinks: [
    { ruleDocId: "doc-misalign-rule", workcardDocId: "doc-align-card" }
  ],

  // ticket -> case：处置票卡归档进哪个案例文档。
  ticketCaseLinks: [
    { ticketId: "WO-CL-P1-001", caseDocId: "doc-p1-report" }
  ],

  // case -> asset：案例沉淀后被哪个机组二次命中复用（对应旧版 graph.nodes 里的
  // "P-2 二次命中"）。
  caseReuseLinks: [
    { caseDocId: "doc-p1-report", assetId: "P-2" }
  ],

  // ---------- 主线脊柱 ----------
  //
  // 串成流光路径的节点 id，顺序即路径顺序；x/y 覆盖 graph.js autoPosition() 算出的
  // 均分坐标，但仍必须落在该节点类型声明的 bands 范围内（由 schema.js 的
  // assertGraphData 校验，不豁免）——这也是为什么 P-2 的坐标是 (8, 88) 而不是像旧版
  // graph.nodes 那样放在 x=64（agent 和 case 之间）：P-2 的实体类型是 asset，
  // 必须落在 asset 列带 [2,14] 内。旧版把"二次命中"的叙事直接体现为"节点位置越出
  // 自己的类型分组、插到流程中间"，这在手写节点表里是可行的，但会破坏"同类型必须
  // 同列带"这条防漂移不变量（一旦允许 spine 节点跳出所属列带，schema 就没法再排除
  // "换了数据集后节点坐标算错、意外落到别的列带"这类真实 bug）。这里改为让流光路径
  // 在案例节点（x=94）之后画一条长对角线"跳回" P-2 所在的机组列带、且用 y=88（明显
  // 区别于 P-1 的 y=18）与其余机组区分——效果是案例节点沉淀后，光路整体向左下方
  // "回卷"到 P-2，视觉上同样能表达"二次命中回到另一台机组"，只是路径形状从旧版的
  // "从左到右单调推进"变成"推进到底后回卷"，这是为了换取列带不变量而做的显式取舍
  // （见任务报告里的设计说明，不是疏漏）。
  spine: [
    { id: "P-1", x: 12, y: 18 },
    { id: "coupling", x: 22, y: 30 },
    { id: "P-DE-V", x: 36, y: 58 },
    { id: "COUP-PH", x: 36, y: 22 },
    { id: "doc-misalign-rule", x: 49, y: 40 },
    { id: "doc-align-card", x: 61, y: 60 },
    { id: "agent", x: 73, y: 40 },
    { id: "WO-CL-P1-001", x: 84, y: 40 },
    { id: "doc-p1-report", x: 94, y: 55 },
    { id: "P-2", x: 8, y: 88 }
  ]
};
