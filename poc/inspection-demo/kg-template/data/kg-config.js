/**
 * kg-config.js —— 演示配置与安全阀
 * ═══════════════════════════════════════════════════════════════════
 * 这是一个**演示用**模板。演示的画面是有物理上限的：
 *   · 展台的立牌绕着圆桌排一圈，超过十几张就开始互相遮挡
 *   · 图谱的力导向是 O(n²)，且每类目超过 15 个代表文档时
 *     初始扇形会绕满一整圈、布局退化成一团
 *   · 树按叶子数纵向铺开，一屏放不下就只能整体缩小，
 *     实测每类目 300 片叶子时缩放到 16%，标签字高只剩 2.4px
 *
 * 所以上限不是"建议"，是**代码级的闸门**：派生层在构建期逐项核对，
 * 超出直接抛错并指名是哪个类目、实际多少、上限多少。
 *
 * 【为什么是报错而不是截断】这是演示模板，数据量本来就该在上限内。
 * 超了说明数据配错了，悄悄砍掉一半继续画的话，你要到路演现场
 * 才发现少讲了东西。报错至少在打开页面的第一秒就告诉你。
 *
 * 【真要放更多数据怎么办】改这里的数字，然后自己确认画面还看得下去。
 * 每条上限下面都写了它是被什么物理约束卡住的。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
  'use strict';

  var KG = global.KG = global.KG || {};

  KG.config = {

    /* ══ 一、展示上限（超出直接报错，不截断） ══════════════════
       这些数字是按 1920×1080 大屏实测定的，调高不会报错，
       但画面会按下面注明的方式开始劣化。 */
    limits: {
      /* 展台：立牌绕圆桌一圈。8 张是设计稿的排布，12 张开始明显互相遮挡 */
      categories: 12,

      /* 树：单个类目的叶子数。40 片时行距已压到下限 34px 且铺满一屏 */
      leavesPerCategory: 40,

      /* 树：层级深度。超过 treeLevels 长度的层会全部钉在最后一级样式上 */
      treeDepth: 6,

      /* 图谱：每个类目进图的代表文档数。
         >4 时初始扇形开始互相压，>15 时绕满一圈、seedLayout 失效 */
      featuredPerCategory: 4,

      /* 图谱：节点与边的总量。60/140 是当前设计参数下仍能看清标签的量级 */
      graphNodes: 60,
      graphLinks: 140,

      /* 图谱：横向实体标签。它们没有层级约束，纯靠斥力散开 */
      entities: 16,

      /* 检索：每个结果分组最多列几条 */
      searchHitsPerGroup: 8
    },

    /* ══ 二、文案与单位 ══════════════════════════════════════
       换业务数据时单位往往要跟着变（巡检是"项"，制度是"条"），
       这些字以前散在 stage.js / tree.js 里，收到这里统一改。 */
    text: {
      docUnit: '份',          // 展台立牌大数字后面的单位
      docUnitLong: '份资料',  // 树左栏统计用
      sampleLabel: '已建模',  // 样本数的说法
      truncatedHint: '演示上限'
    },

    /* ══ 三、业务命名与界面文案 ══════════════════════════════
       这块是模板复用时最常改的配置：巡检数据可以把"文档"改成"巡检项"，
       泵数据可以把"实体标签"改成"故障模式"或"部件标签"。 */
    ui: {
      pageTitleSuffix: '巡检知识图谱',

      views: [
        { key: 'stage', label: '展台',     en: 'STAGE', title: '3D 展台' },
        { key: 'graph', label: '关系图谱', en: 'GRAPH', title: '关系图谱' },
        { key: 'tree',  label: '主题树',   en: 'TREE',  title: '主题树' }
      ],

      search: {
        title: '全局检索',
        scope: '分支 / 资料 / 目录 / 巡检实体',
        placeholder: '搜索巡检分支 / 资料 / 目录 / 实体',
        suggestionsCategory: '试试这些 · 巡检知识分支',
        suggestionsEntity: '试试这些 · 巡检实体',
        noMatch: '没有匹配「{query}」的分支、资料、目录或实体'
      },

      stage: {
        eyebrow: 'Inspection Knowledge Graph',
        liveText: '索引同步中',
        loadingText: '初始化展台',
        focusLabel: 'Scanning',
        cardFooter: 'VECTOR INDEXED'
      },

      graph: {
        degreeLabel: '连接数',
        totalLabel: '资料量',
        jumpToTree: '在主题树中查看'
      },

      tree: {
        eyebrow: 'Inspection Topics',
        title: '巡检主题',
        topicUnit: '个主题',
        hintHtml: '悬停节点 — 高亮从根到它的整条路径<br>点击目录 — 折叠 / 展开该分支<br>点击资料 — 查看详情　滚轮 — 缩放　拖拽 — 平移',
        jumpToGraph: '在关系图谱中查看'
      },

      intro: {
        titleSuffix: '图谱说明',
        rolesTitle: '三个视图的分工',
        typeTitle: '层级定义',
        statsTitle: '数据规模',
        relationTitle: '关系类型',
        guideTitle: '接入指南',
        stats: [
          { key: 'NODES', value: 'nodes' },
          { key: 'EDGES', value: 'edges' },
          { key: 'DOCS', value: 'docTotal' },
          { key: 'SAMPLES', value: 'sampleTotal' }
        ],
        stageQuestion: '有哪些知识库？',
        stageDesc: '按分支陈列 {categories} 座巡检知识库，一眼看清资料规模与更新态势，是总览入口。',
        graphQuestion: '知识之间怎么连？',
        graphDesc: '把分支、代表资料与 {entities} 个巡检实体放进同一张力导向网络，共 {edges} 条关系，回答横向关联。',
        treeQuestion: '具体文档在哪？',
        treeDesc: '沿分支逐层下钻到叶子资料，已建模样本 {samples} 份，回答纵向定位。',
        guideHtml: '换成自己的业务数据通常只需要改 <code>data/kg-data.js</code>；如果单位、视图名、搜索分组或提示文案也要变，再改 <code>data/kg-config.js</code>。三个视图由 <code>data/kg-derive.js</code> 投影出来，视图代码不读原始数据。<br>改完打开浏览器控制台执行 <code>KG.derive.validate()</code> 看体检结果：<code>errors</code> 必须为空，<code>warnings</code> 提示的是能跑但会缺内容的地方。'
      }
    },

    messages: {
      stageNodeToCategory: '展台按巡检知识分支陈列，已定位到「{category}」',
      entityToStage: '「{node}」是横向标签，展台已转到关联最多的「{category}」',
      graphNonFeaturedLeaf: '图谱只展示各类目的代表文档，「{node}」未收录',
      graphBranchMissing: '图谱不展示目录层级，「{node}」没有对应节点',
      graphFocusCategory: '{reason}，已聚焦其所属的「{category}」',
      treeEntity: '树视图没有实体标签这一层，已定位到关联文档最多的「{category}」并高亮相关文档'
    },

    searchGroups: [
      { key: 'category', label: '知识分支', types: ['category'] },
      { key: 'doc',      label: '资料',     types: ['doc', 'item'] },
      { key: 'branch',   label: '目录',       types: ['topic', 'subtopic'] },
      { key: 'entity',   label: '巡检实体', types: ['entity'] }
    ],

    /* ══ 四、展台立牌底部进度条 ══════════════════════════════
       原先分母写死 2200，只对最初那份 demo 数据成立：
       业务方每类目 300 篇时所有进度条都是一小截，5 万篇时全部满格。
       null = 由派生层取"所有类目里最大的 docTotal"当分母，
       于是进度条表达的是"该类目在全部类目中的相对体量"，换任何数据都成立。
       需要固定基准时（比如对标某个目标值）再填具体数字。 */
    progressBase: null,

    /* ══ 五、可用图标 ══════════════════════════════════════
       图标是 canvas 绘制函数，实现留在 views/stage/stage.js 的 ICONS 里
       （绘制代码不该进数据文件）。这里只登记有哪些名字可用，
       数据里写了表外的名字会在构建期直接报错并列出可选值，
       而不是静默画成默认图标——那样你要到路演现场才发现图标全错。 */
    icons: ['doc', 'chart', 'people', 'shield', 'stack', 'chat', 'node', 'cal']
  };

})(typeof window !== 'undefined' ? window : this);
