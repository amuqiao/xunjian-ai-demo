// window.DemoStation —— 站场 12 区态势数据层。
//
// 本文件定死整个 POC 的三维世界坐标系，scripts/map3d/model-plan.js、engine.js、
// scripts/data/track.js 全部复用这里给出的 geom 数字，不能各自另起一套坐标。
//
// ==========================================================================
// 2026-08-20 改造：程序化沙盘 → 业务方提供的站点平面图
// ==========================================================================
// 旧版本这里是一套自己编的 4 列 × 3 行网格布局（grid: {col,row}），12 个区域按
// 天然气清管站的工艺流向摆成方阵。业务方看完的结论是"这不是我们的站"——布局是
// 推演出来的，跟现场任何一个站都对不上号，于是他们直接给了一张自己的平面布置图
// （assets/.data/站点地图/站点平面图.jpg，长沙输油站）。
//
// 所以现在：
//   - 区域名、区域位置、区域尺寸**全部来自那张平面图**，量法与溯源见
//     scripts/data/plan.js 的文件头（像素级颜色掩膜 + 连通域分析，不是目测）。
//   - grid: {col,row} 字段整个删掉。它当初只服务两件事：model 层按列对齐、以及
//     engine.js 用 4 邻接关系在下钻时挑"只显示当前区+相邻区的标签"。前者被真实
//     平面坐标取代（真实布置本来就不是网格，硬套一个 col/row 只会得到一份跟画面
//     无关的假坐标），后者随"下钻相机"一起删除（见 engine.js 的改造说明）。
//   - 新增 palette 字段（tank/process/safety），对应平面图自身的色相分组：
//     储罐类=橙、工艺电气类=黄、消防控制类=蓝。取值表在 plan.js 的 PALETTE。
//   - 新增 tanks 字段：平面图上画出来的每一个罐（含罐号 FRT02xx）。这是本次
//     "认得出"的关键细节——业务方数罐个数、看罐号，比看任何渲染质量都直接。
//
// ==========================================================================
// 区域 id 与巡检项数据的关系（务必读完，否则会误判下面的内容对不对）
// ==========================================================================
// Map3DContract.AREA_IDS 的 12 个 id（gate/filter/metering/...）是**内部键**，
// 不是展示名称，本次改造刻意没有改它们：改 id 会连带改 items-*.js 三个文件的
// 顶层键、256 条巡检项的 id 前缀（gate-8 这类）、series.js/task.js/schema.js 的
// 引用，收益却只是"内部变量名读起来更顺"——用户在界面上一个字都看不到这些 id。
//
// 但必须如实记录一条**已知的内容错配**：256 条巡检项本身仍然是从
// 附件1-3.xlsx 的「天然气站场」sheet 裁出来的（tools/area-mapping.py），而这张
// 平面图是**成品油站**。所以点开某个区域看右栏明细时，条目内容对不上区域名
// （例如"储油罐区"下面挂的是气液联动阀 ESDV 的条目）。区域名/项数/状态/汇总
// 结论这一层已经按平面图重写，看得见的第一层是对的；逐条明细这一层没有重做。
// 要彻底对齐，需要换用同一个 xlsx 里的「成品油站场」sheet（447 行，区域是
// 罐区/输油主泵区/给油泵区/混油处理装置区/消防泵房/站控室/综合机柜间/UPS室/
// 高压配电间/变压器室/发电机房/污水处理区…，与本平面图能逐个对上），重写
// tools/area-mapping.py 的映射并重新生成 items-*.js。那是一件独立的数据工作，
// 不在本次"把地图换成平面图"的范围内。
//
// 每区项数（AREA_ITEM_COUNTS）保持不动，按"区域体量 ↔ 项数量级"就近安置：
//   gate 49 → 储油罐区（全站最大）        cabinet 67 → 综合控制室（全站最多）
//   power 18 → 35KV变电所（语义本来就对）  metering 19 → 阀组区
//   regulate 19 → 工艺设备区              control 19 → 泵棚区
//   filter 17 → 混油处理区                launcher 14 → 混油罐区
//   ups 12 → 消防泵房                     blowdown 8 → 中间罐区
//   vent 7 → 消防水罐区                   genset 7 → ESD 区
//
// ==========================================================================
// 区域状态与「完成数」的派生规则（不允许手写第二份数字）
// ==========================================================================
// 每次调用 areas()/area()/statuses()/progress()/stationProgress() 都会现场从
// window.DemoItems.<areaId> 派生，不缓存、不另抄一份静态状态表：
//
//   1. status：该区任一巡检项 status==="danger" → 区域 "danger"；否则任一
//      "warn" → 区域 "warn"；否则 "ok"。这条表达的是"这个区有没有问题"。
//
//   2. itemDone：口径是"巡检人提交完成数"，恒等于该区总项数
//      window.Map3DContract.AREA_ITEM_COUNTS[areaId]，因为 256 条巡检项数据
//      模型里每条都带最终 status（ok/warn/danger 三态），没有"待巡检"这种
//      中间态——凡是在 window.DemoItems 里出现的项，都视为已提交。AI 复检
//      发现异常不会让"已提交数"变少，这与真实 App 的口径一致。progress(id)
//      因此 ratio 恒为 1，这不是写死的偷懒实现，而是当前数据模型本身没有
//      "未完成"这个状态可以表达。
//
//   3. issueCount：该区 status !== "ok" 的项数，是与 itemDone 正交的独立
//      维度，表达"提交之后 AI 复检揪出多少问题"。
//
// 按当前 items-*.js 的剧本落点，派生结果应为：
//   gate（储油罐区）  → status="danger"，issueCount=2
//   filter（混油处理区）→ status="danger"，issueCount=1
//   其余 10 区 → status="ok"，issueCount=0；全站 issueCount=3，itemDone=256
(function () {
  "use strict";

  function requirePlan() {
    if (!window.DemoPlan) {
      throw new Error("window.DemoPlan 未加载：station.js 必须晚于 scripts/data/plan.js 加载");
    }
    return window.DemoPlan;
  }

  // ---- 12 区静态定义（顺序 = Map3DContract.AREA_IDS，含顺序全等）----
  // 只放"跟 DemoItems 无关"的静态字段：id/name/short/icon/geom/kind/palette/
  // tanks/planLabel/devices/summary/evidence。status/itemTotal/itemDone/
  // issueCount 全部在下面的 buildArea() 里现场算。
  //
  // geom 的 x/z/w/d 全部来自平面图像素包围盒（注释里给出 px 范围，可回溯原图）；
  // h 是三维挤出高度，不是平面图上的量（平面图没有高度信息），取值原则：
  // 储罐 > 建筑 > 棚 > 敞开式工艺场地，且最高的罐区 h=26 相对 1258 的地块跨度
  // 仍然很扁——这是近俯视 2.5D 该有的比例，不做垂直夸张（旧沙盘版乘 2.5 的
  // VERTICAL_EXAGGERATION 已删除：沙盘要靠夸张才读得出体量，平面图不需要，
  // 它的可读性来自轮廓与配色，一夸张反而互相遮挡、压掉平面图的方位关系）。
  var AREA_DEFS = [
    {
      id: "gate",
      name: "储油罐区",
      short: "罐区",
      icon: "罐",
      // px 152-516 × 135-335
      geom: { x: -295, z: -121, w: 364, d: 200, h: 26 },
      kind: "tank",
      palette: "tank",
      planLabel: "储油罐区",
      // 平面图上画了 6 个罐，罐号自西向东、自北向南依次是
      // FRT0203/0202/0201（北排）、FRT0206/0205/0204（南排）。
      tanks: [
        { x: -404, z: -175, r: 36, label: "FRT0203" },
        { x: -292, z: -175, r: 36, label: "FRT0202" },
        { x: -181, z: -175, r: 36, label: "FRT0201" },
        { x: -404, z: -65, r: 36, label: "FRT0206" },
        { x: -292, z: -65, r: 36, label: "FRT0205" },
        { x: -181, z: -65, r: 36, label: "FRT0204" }
      ],
      devices: [
        { kind: "立式储油罐", count: 6, note: "FRT0201~FRT0206，罐组围堰内" },
        { kind: "罐区围堰", count: 1, note: "含堰内排水与雨淋阀" },
        { kind: "罐顶呼吸阀/量油孔", count: 6, note: null },
        { kind: "液位计/温度计", count: 6, note: null },
        { kind: "泡沫灭火管线", count: 1, note: "环绕罐组" }
      ],
      // 长度纪律：本字段作为 DetailCard 的 conclusion 传入，DetailCard 硬限
      // 80 字（CONCLUSION_MAX，超出直接抛错）。改这行请数一下字数。
      summary:
        "储油罐区 49 项已提交，AI 复检发现 1 项异常、1 项待关注，" +
        "其余 47 项正常，6 座罐液位与呼吸阀状态在控。",
      evidence: [
        "6 座立式储油罐 FRT0201~0206",
        "AI 复检 2 项需处理",
        "其余 47 项正常"
      ]
    },
    {
      id: "filter",
      name: "混油处理区",
      short: "混油处理",
      icon: "混",
      // px 297-400 × 397-502
      geom: { x: -281, z: 94, w: 103, d: 105, h: 14 },
      kind: "process",
      palette: "process",
      planLabel: "混油处理区",
      tanks: [],
      devices: [
        { kind: "混油处理装置撬", count: 1, note: "含进出口切断阀" },
        { kind: "混油泵", count: 2, note: null },
        { kind: "取样点", count: 2, note: null },
        { kind: "压力表/差压表", count: 2, note: null }
      ],
      summary:
        "混油处理区 17 项已全部提交，AI 复检发现 1 项异常：装置差压超标准" +
        "上限，其余 16 项正常。",
      evidence: [
        "装置差压超标准上限",
        "混油泵 2 台运行正常",
        "其余 16 项正常"
      ]
    },
    {
      id: "metering",
      name: "阀组区",
      short: "阀组",
      icon: "阀",
      // px 599-750 × 298-343
      geom: { x: 46, z: -36, w: 151, d: 45, h: 9 },
      kind: "process",
      palette: "process",
      planLabel: "阀组区",
      tanks: [],
      devices: [
        { kind: "进出站切断阀组", count: 4, note: "电动执行机构" },
        { kind: "调节阀", count: 2, note: null },
        { kind: "汇管", count: 2, note: null },
        { kind: "压力变送器", count: 3, note: null }
      ],
      summary: "阀组区 19 项已全部提交且全部正常，切断阀组与调节阀动作正常。",
      evidence: ["19 项全部正常", "切断阀组 4 台动作正常", "汇管无渗漏"]
    },
    {
      id: "regulate",
      name: "工艺设备区",
      short: "工艺",
      icon: "艺",
      // px 644-733 × 201-269
      geom: { x: 60, z: -121, w: 89, d: 68, h: 12 },
      kind: "process",
      palette: "process",
      planLabel: "工艺设备区",
      tanks: [],
      devices: [
        { kind: "过滤器", count: 2, note: "带差压表" },
        { kind: "流量计管路", count: 2, note: "并联布置" },
        { kind: "安全阀", count: 2, note: "前后隔离阀+铅封" },
        { kind: "工艺管道支架", count: 4, note: null }
      ],
      summary: "工艺设备区 19 项已全部提交且全部正常，过滤器与流量计管路运行平稳。",
      evidence: ["19 项全部正常", "过滤器差压在范围内", "安全阀铅封完好"]
    },
    {
      id: "vent",
      name: "消防水罐区",
      short: "消防水罐",
      icon: "水",
      // px 710-780 × 393-499
      geom: { x: 116, z: 90, w: 70, d: 106, h: 18 },
      kind: "tank",
      palette: "safety",
      planLabel: "消防水罐区",
      tanks: [
        { x: 117, z: 63, r: 20, label: null },
        { x: 117, z: 127, r: 20, label: null }
      ],
      devices: [
        { kind: "消防水罐", count: 2, note: null },
        { kind: "液位计", count: 2, note: null },
        { kind: "补水管线/浮球阀", count: 1, note: null },
        { kind: "罐区照明", count: 2, note: null }
      ],
      summary: "消防水罐区 7 项已全部提交且全部正常，2 座水罐液位在设计范围内。",
      evidence: ["7 项全部正常", "2 座消防水罐液位正常", "补水管线无渗漏"]
    },
    {
      id: "blowdown",
      name: "中间罐区",
      short: "中间罐",
      icon: "中",
      // px 405-468 × 398-502
      geom: { x: -193, z: 94, w: 63, d: 104, h: 16 },
      kind: "tank",
      palette: "tank",
      planLabel: "中间罐区",
      // 平面图上是 4 个小罐竖排，未标注罐号，因此 label 全为 null——
      // 不给它们编一个看起来很像的罐号（那是编数据，不是读数据）。
      tanks: [
        { x: -193, z: 52, r: 12, label: null },
        { x: -193, z: 76, r: 12, label: null },
        { x: -193, z: 106, r: 12, label: null },
        { x: -193, z: 132, r: 12, label: null }
      ],
      devices: [
        { kind: "中间罐", count: 4, note: "混油倒罐中转" },
        { kind: "倒罐泵", count: 1, note: null },
        { kind: "液位计", count: 4, note: null }
      ],
      summary: "中间罐区 8 项已全部提交且全部正常，4 座中间罐与倒罐泵状态良好。",
      evidence: ["8 项全部正常", "4 座中间罐无渗漏", "倒罐泵运行正常"]
    },
    {
      id: "cabinet",
      name: "综合控制室",
      short: "控制室",
      icon: "控",
      // px 786-845 × 393-499
      geom: { x: 187, z: 90, w: 59, d: 106, h: 24 },
      kind: "room",
      palette: "safety",
      planLabel: "综合控制室",
      tanks: [],
      devices: [
        {
          kind: "室内机柜阵列",
          count: 10,
          note:
            "光通信柜/工业电视柜/高频开关电源柜/恒电位仪柜/PLC·ESD(SIS)柜/" +
            "网络柜/消防报警柜/流量计算机柜/UPS 配出柜/综合布线柜"
        },
        { kind: "操作台+站控机双屏", count: 1, note: null },
        { kind: "ESD 紧急停车按钮", count: 1, note: null },
        { kind: "火灾报警控制器", count: 1, note: null },
        { kind: "工业电视监视墙", count: 1, note: null }
      ],
      summary:
        "综合控制室 67 项已全部提交且全部正常，10 列机柜、站控机与火灾报警" +
        "系统均正常，是全站巡检项最多的区域。",
      evidence: [
        "67 项全部正常（全站最多）",
        "PLC·ESD(SIS) 柜运行正常",
        "站控机双屏与监视墙正常"
      ]
    },
    {
      id: "power",
      name: "35KV变电所",
      short: "变电所",
      icon: "电",
      // px 1004-1063 × 201-304
      geom: { x: 405, z: -104, w: 59, d: 103, h: 22 },
      kind: "room",
      palette: "process",
      planLabel: "35KV变电所",
      tanks: [],
      devices: [
        { kind: "35kV 开关柜列", count: 3, note: null },
        { kind: "低压配电柜", count: 2, note: null },
        { kind: "变压器", count: 2, note: "油浸式带储油柜/压力释放器" },
        { kind: "电缆沟盖板", count: 1, note: null }
      ],
      summary: "35KV变电所 18 项已全部提交且全部正常，开关柜与变压器运行正常。",
      evidence: [
        "18 项全部正常",
        "油浸式变压器油位/油温正常",
        "35kV 开关柜 3 列运行正常"
      ]
    },
    {
      id: "control",
      name: "泵棚区",
      short: "泵棚",
      icon: "泵",
      // px 786-844 × 201-342
      geom: { x: 186, z: -85, w: 58, d: 141, h: 18 },
      kind: "process",
      palette: "process",
      planLabel: "泵棚区",
      tanks: [],
      devices: [
        { kind: "输油主泵机组", count: 4, note: "含电机/联轴器护罩" },
        { kind: "给油泵", count: 2, note: null },
        { kind: "泵进出口阀", count: 8, note: null },
        { kind: "机械密封冲洗管线", count: 4, note: null },
        { kind: "可燃气体探测器", count: 2, note: null }
      ],
      summary: "泵棚区 19 项已全部提交且全部正常，主泵机组振动与密封状态良好。",
      evidence: ["19 项全部正常", "输油主泵 4 台运行平稳", "机械密封无异常泄漏"]
    },
    {
      id: "genset",
      name: "ESD区",
      short: "ESD",
      icon: "E",
      // px 660-734 × 129-173
      geom: { x: 68, z: -205, w: 74, d: 44, h: 10 },
      kind: "process",
      palette: "process",
      planLabel: "ESD区",
      tanks: [],
      devices: [
        { kind: "ESD 紧急切断阀", count: 2, note: "气液联动执行机构" },
        { kind: "动力气源瓶组", count: 1, note: null },
        { kind: "就地控制盘", count: 1, note: null }
      ],
      summary: "ESD区 7 项已全部提交且全部正常，紧急切断阀与气源压力在控。",
      evidence: ["7 项全部正常", "ESD 切断阀 2 台就位", "动力气源压力正常"]
    },
    {
      id: "ups",
      name: "消防泵房",
      short: "消防泵",
      icon: "消",
      // px 628-703 × 394-499
      geom: { x: 37, z: 91, w: 75, d: 105, h: 20 },
      kind: "room",
      palette: "safety",
      planLabel: "消防泵房",
      tanks: [],
      devices: [
        { kind: "消防主泵", count: 2, note: "柴油机+电动各一" },
        { kind: "稳压泵", count: 1, note: null },
        { kind: "泡沫比例混合装置", count: 1, note: null },
        { kind: "泵房配电箱", count: 1, note: null },
        { kind: "压力表/流量计", count: 2, note: null }
      ],
      summary: "消防泵房 12 项已全部提交且全部正常，消防主泵与稳压泵处于备用状态。",
      evidence: ["12 项全部正常", "消防主泵 2 台备用就绪", "泡沫比例混合装置完好"]
    },
    {
      id: "launcher",
      name: "混油罐区",
      short: "混油罐",
      icon: "油",
      // px 472-559 × 398-502
      geom: { x: -114, z: 94, w: 87, d: 104, h: 22 },
      kind: "tank",
      palette: "tank",
      planLabel: "混油罐区",
      tanks: [
        { x: -111, z: 64, r: 26, label: "FRT0207" },
        { x: -110, z: 124, r: 26, label: "FRT0208" }
      ],
      devices: [
        { kind: "混油罐", count: 2, note: "FRT0207 / FRT0208" },
        { kind: "罐顶呼吸阀", count: 2, note: null },
        { kind: "液位计/温度计", count: 2, note: null },
        { kind: "切水管线", count: 1, note: null }
      ],
      summary: "混油罐区 14 项已全部提交且全部正常，FRT0207/0208 液位与呼吸阀正常。",
      evidence: ["14 项全部正常", "混油罐 FRT0207/0208 状态良好", "呼吸阀无卡阻"]
    }
  ];

  var AREA_DEF_BY_ID = {};
  AREA_DEFS.forEach(function (def) {
    AREA_DEF_BY_ID[def.id] = def;
  });

  function contract() {
    if (!window.Map3DContract) {
      throw new Error("window.Map3DContract 未加载：station.js 必须晚于 map3d/contract.js 加载");
    }
    return window.Map3DContract;
  }

  // 现场从 window.DemoItems.<areaId> 读取，不缓存——改剧本只改 items-*.js，
  // 这里自动跟着变。
  function areaItems(id) {
    var items = window.DemoItems && window.DemoItems[id];
    if (!Array.isArray(items)) {
      throw new Error(
        "window.DemoItems." + id + " 不是数组，请确认 items-entry.js/items-process.js/" +
        "items-room.js 已在 station.js 之前加载"
      );
    }
    var expected = contract().AREA_ITEM_COUNTS[id];
    if (items.length !== expected) {
      throw new Error("区域 " + id + " 的巡检项数为 " + items.length + "，应为 " + expected);
    }
    return items;
  }

  function deriveStatus(items) {
    var hasDanger = items.some(function (item) { return item.status === "danger"; });
    if (hasDanger) return "danger";
    var hasWarn = items.some(function (item) { return item.status === "warn"; });
    if (hasWarn) return "warn";
    return "ok";
  }

  function deriveIssueCount(items) {
    return items.filter(function (item) { return item.status !== "ok"; }).length;
  }

  // 把静态定义 + 派生字段拼成一份完整的区域对象（每次现场拼，不缓存）。
  function buildArea(def) {
    var items = areaItems(def.id);
    var itemTotal = contract().AREA_ITEM_COUNTS[def.id];
    return {
      id: def.id,
      name: def.name,
      short: def.short,
      icon: def.icon,
      geom: {
        x: def.geom.x, z: def.geom.z,
        w: def.geom.w, d: def.geom.d, h: def.geom.h
      },
      kind: def.kind,
      palette: def.palette,
      planLabel: def.planLabel,
      tanks: def.tanks.map(function (t) {
        return { x: t.x, z: t.z, r: t.r, label: t.label };
      }),
      itemTotal: itemTotal,
      // itemDone 恒等于 itemTotal：口径是"提交完成数"，不是"合格数"，
      // 详见文件头「区域状态与完成数的派生规则」第 2 条。
      itemDone: itemTotal,
      status: deriveStatus(items),
      issueCount: deriveIssueCount(items),
      devices: def.devices.map(function (device) {
        return { kind: device.kind, count: device.count, note: device.note };
      }),
      summary: def.summary,
      evidence: def.evidence.slice()
    };
  }

  function meta() {
    var c = contract();
    var yard = requirePlan().yard();
    return {
      id: "changsha-shuyou-zhan",
      fullName: "国家管网集团湖南公司长郴管道长沙输油站",
      shortName: "长沙输油站",
      // 站场地块尺寸不在这里另写一份，直接取平面图的图幅——平面图是这套坐标系
      // 的来源，地块范围必须与它严格一致，否则地面纹理的 UV 换算会和区域坐标错位。
      yard: yard,
      areaTotal: c.AREA_IDS.length,
      itemTotal: c.TOTAL_ITEMS
    };
  }

  function areas() {
    return contract().AREA_IDS.map(function (id) {
      return buildArea(AREA_DEF_BY_ID[id]);
    });
  }

  function area(id) {
    var def = AREA_DEF_BY_ID[id];
    if (!def) throw new Error("未知区域：" + id);
    return buildArea(def);
  }

  function statuses() {
    var result = {};
    // 顺序必须 = Map3DContract.AREA_IDS，供 Map3DContract.assertIdSet 校验，
    // 也供 map3d/engine.js 的 setStatuses 直接消费。
    contract().AREA_IDS.forEach(function (id) {
      result[id] = area(id).status;
    });
    return result;
  }

  function progress(id) {
    var a = area(id);
    return {
      done: a.itemDone,
      total: a.itemTotal,
      // ratio 恒为 1：见文件头「区域状态与完成数的派生规则」第 2 条。
      ratio: a.itemDone / a.itemTotal
    };
  }

  function stationProgress() {
    var list = areas();
    var itemDone = 0;
    var itemTotal = 0;
    var issueCount = 0;
    list.forEach(function (a) {
      itemDone += a.itemDone;
      itemTotal += a.itemTotal;
      issueCount += a.issueCount;
    });
    return {
      itemDone: itemDone,
      itemTotal: itemTotal,
      areaDone: list.length,
      areaTotal: list.length,
      issueCount: issueCount
    };
  }

  window.DemoStation = {
    meta: meta,
    areas: areas,
    area: area,
    statuses: statuses,
    progress: progress,
    stationProgress: stationProgress
  };
})();
