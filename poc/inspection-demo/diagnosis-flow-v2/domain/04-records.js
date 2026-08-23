// 领域契约 04：巡检记录 + 依据链 + 两种非时序证据（事件时间线 / 缺项清单）。
//
// 【本版最核心的一处改动：依据链是变长且分型的】
// 旧目录 domain-skeleton/05-diagnosis.js 给每条记录都配了**固定的 4 枚芯片**
// （series + vision + rule + case），不管检查项是什么性质。后果是：
//   - 「油位与外观」这条目视项，series 接到了「泵体温度」曲线
//   - 「大修前重点巡检」这条计划提醒，series 接到了「出口压力」曲线
//   - 「表计及测显装置无显示」这条开关量故障，series 接到了「控制回路电源状态 %」
// 三条都是硬配的，演示时一点就露。
//
// 本版按检查项的性质决定证据形态，依据链长度 2~5 不等：
//   数值 + 有标准     → series（时序曲线，只有 R1 有）
//   同点位前后变化     → compare（真实的同机位两帧，只有 R2 有）
//   开关量故障 + 处置  → timeline（事件时间线，只有 R3 有）
//   目视 / 门禁 / 分区 → vision（关键帧 + bbox）
//   记录缺项          → gaps（缺项清单，只有 R4 有）
//   行为异常待复核     → track + pose + route + vision + rule 五枚联合，只有 R5/R7 有
//   判定口径          → rule（就地展开规则卡）
//   历史同类          → case（跳知识库；locked 的那枚是"二次命中"包袱）
//
// 【本版记录数：7 条】REC-1~REC-4 是"数据判断"，REC-5 与 REC-7 是"行为判断"（互为镜像，
// 见 tracks 段落顶部注释），REC-6 是跨对象对照记录（不上屏）。
//
// 【aiFlag 是五态，不是四态】conflict / behavior / gap / ok 之外新增 cleared —— 具体论证见
// aiFlagText 定义处的注释；这里只强调一句：REC-5 与 REC-7 都命中了 R-BEHAVIOR 的规则，
// 但 REC-5 命中两条、REC-7 只命中一条 —— 这条"一条 vs 两条"的界线*不是*凭 6 秒与 8 秒的
// 秒数直觉划的，而是 R-BEHAVIOR 本身第 4 行白纸黑字写着的口径："命中任一条即判行为异常；
// 命中两条以上建议退回重巡而非归档"。命中一条时，若机位恰好能看到作业过程，才轮到
// R-BEHAVIOR-CLEAR 这张新规则卡出场，用姿态 + 表盘 + 轨迹三路视觉证据联合复核、决定能否排除。
window.DOMAIN_RECORDS = (function () {
  "use strict";

  var STATION = window.DOMAIN_STATION;
  var VISION = window.DOMAIN_VISION;
  if (!STATION || !VISION) throw new Error("[DOMAIN_RECORDS] 需要先加载 01-station.js 与 02-vision.js");

  // 表格列。aiFlag 那一列是 status-dot，控制行状态色；aiFlagText 是文字徽标。
  // width 是相对权重（不是像素），工作台把它换算成 <col> 的百分比。这组数是实测调的：
  // 第一版给 no 只有 88，在 620px 的栏宽下「第 106 项」被截成「第 10...」；
  // 而 item / result 那两列本来就有 title 兜住全文，富余让给前两列。
  var columns = [
    { key: "aiFlag", label: "", type: "status-dot", width: 24 },
    { key: "no", label: "表单项", type: "text", width: 112 },
    { key: "partLabel", label: "部位", type: "text", width: 130 },
    { key: "item", label: "检查项", type: "text", width: 200 },
    { key: "result", label: "人工结果", type: "text", width: 180 },
    { key: "aiFlagText", label: "AI 质检", type: "badge-icon", width: 106 }
  ];

  // 【五态，不是四态】behavior 是上一轮新增的一档，cleared 是本轮新增的第五档。
  // 不能把行为异常塞进 conflict：conflict 是「AI 与人工对同一件事判得不一样」
  // （第 106 项：你填正常，SCADA 说越限），behavior 是「这一项到底有没有真做」
  // （第 261 项：6 秒完成一项目视）。两者的管理动作完全不同 ——
  // 前者复核数据，后者退回重巡。合成一个数，屏上「重点复核 3」就把两件事混在一起了。
  //
  // 【cleared 不能复用 ok，理由与上面那条是同一条逻辑】ok（已闭环）是"人工结论对、
  // AI 同意"——从头到尾没有命中任何规则，班长根本不需要知道这一项曾被怀疑过。
  // cleared（已排除）是"命中了行为核查的规则、但姿态 + 表盘 + 轨迹三路证据联合把它推翻
  // 了"——这一项*曾经*进入过嫌疑名单，只是被查清白了。两者传达给班长的管理动作完全不同：
  // ok 是"这条不用管"，cleared 是"班长你不用管这条，我（AI）已经用三路证据查过了、
  // 结论站得住"。把 cleared 合并进 ok，会把"从未被怀疑"和"被怀疑后经复核排除"这两件
  // 事实混为一谈，班长就看不出行为核查这条线本身在正常工作——它不仅会拦对的，也会放对的。
  //
  // 【cleared 刻意不配概况带 stat】ok 本来就没有 stat 卡（workbench.js 的 stat-row 只固定
  // 渲染 total / conflict / behavior / gap 四张），cleared 照此对齐、不新增第五张卡。
  // 这保证 verify_flow.py 的两条既有断言都不受影响：
  //   len(story["stats"]) == 4  —— stat 卡数量不变
  //   story["flags"]["behavior"] == 1  —— behavior 这一档的计数不因新增 cleared 而漂移
  var aiFlagText = {
    conflict: "重点复核",
    behavior: "行为异常",
    gap: "记录缺项",
    ok: "已闭环",
    cleared: "疑点排除"
  };

  // R3 的事件时间线。开关量故障的正确证据形态是"什么时候发现、怎么排查、怎么处置"，
  // 不是一条百分比曲线。四个节点的时刻与低压配电室那一帧的 OSD 时间（20:13:39）咬合。
  var timelines = {
    "TL-1DP": {
      id: "TL-1DP",
      label: "1DP 柜表计无显示 · 处置过程",
      steps: [
        { at: "20:13:39", tone: "danger", label: "巡检发现", detail: "1DP 柜面数显表无读数，指示灯组仅电源灯亮" },
        { at: "20:21:10", tone: "warn", label: "现场排查", detail: "断开二次回路核查，确认操作柱接线端子松动" },
        { at: "20:34:52", tone: "warn", label: "紧固处置", detail: "重新压接并做防松标记，恢复二次回路" },
        { at: "20:41:07", tone: "ok", label: "复测确认", detail: "表计读数恢复，综保无控制回路断线报警" }
      ]
    }
  };

  // R4 的缺项清单。「记录缺项」这个 aiFlag 的证据不该是一张图，而是"表单上少填了哪几项"。
  // 这是本版新增的证据形态 —— 旧目录的 gap 记录也只能配一张图 + 一句话。
  var gapLists = {
    "GAP-PLC": {
      id: "GAP-PLC",
      label: "PLC 机房 · 表单缺项",
      total: 6,
      rows: [
        { label: "PLC 机柜 7# 柜门与标识", filled: true, note: "已填：柜门关闭，标识清晰" },
        { label: "PLC 机柜 7# 温湿度记录", filled: true, note: "已填：22℃ / 48%" },
        { label: "SIS 机柜（一）柜门与标识", filled: false, note: "未填 —— 画面显示该柜在位且柜门关闭" },
        { label: "SIS 机柜（一）指示灯状态", filled: false, note: "未填" },
        { label: "机房门禁与进出登记", filled: true, note: "已填：门禁正常，登记完整" },
        { label: "设备分区标识核对", filled: true, note: "已填：中石化 / 国家管网标识在位" }
      ]
    }
  };

  // 判定口径卡（rule 芯片就地展开的内容）。
  var rules = {
    "R-INTERLOCK": {
      id: "R-INTERLOCK",
      label: "出口压力联锁值口径",
      lines: [
        "高报警 9.0MPa：提示巡检核对就地表、趋势与上下游工况。",
        "高高报警 9.8MPa：触发安全联锁停泵。",
        "本条为安全联锁相关仪表，就地表与 SCADA 读数须双向核对。"
      ]
    },
    "R-LEAK": {
      id: "R-LEAK",
      label: "泵机组渗漏检查要求",
      lines: [
        "泵体、机封、联轴器护罩与基座应无渗漏、无异响、无异常振动。",
        "同点位前后帧比对用于识别新增油迹与部件位移。"
      ]
    },
    "R-PANEL": {
      id: "R-PANEL",
      label: "配电柜表计复查要求",
      lines: [
        "柜面表计、测显装置应显示正常，综保无控制回路断线报警。",
        "已处置问题需在下一轮巡检复查并留痕。"
      ]
    },
    "R-BEHAVIOR": {
      id: "R-BEHAVIOR",
      label: "巡检行为核查口径",
      lines: [
        "单项现场停留 < 10 秒 —— 目视类检查项的最短合理作业时长。",
        "相邻两项提交间隔 < 3 秒 —— 低于此值视为连续点选，未实际到点。",
        "提交时刻偏离计划时段 30 分钟以上 —— 时段异常，需说明原因。",
        "命中两条以上，建议退回重巡而非归档。",
        // 【这一行是本轮补的，不补 REC-7 就当场证伪这张卡】原文是「命中任一条即判行为
        // 异常；命中两条以上建议退回重巡而非归档」。REC-7 只命中一条却判「不构成行为异常」
        // —— 观众看完 REC-5 的这张卡再看 REC-7，问的不是「凭什么差 2 秒」（那句「两条以上」
        // 确实回答了退回 vs 归档），而是更难答的「你自己说命中任一条就是行为异常，怎么这条
        // 又不是了」。把例外写进说规则的这张卡，三个洞一起补上：REC-5 侧就交代了界线、
        // 「行为异常 1」为什么不含 REC-7 有了依据、cleared 这个态在规则文本里有了出处。
        // REC-5 的芯片 detail 写的是「停留 / 间隔 / 时段三条」—— 指三条**规则**不是三行
        // **文字**，加这一行不会让它失真。
        "只命中一条且机位可见作业过程的，转视觉复核口径判定；复核通过判疑点排除，不计入行为异常。",
        "行为核查只判「是否真去了」，不改变该项本身的技术判定结论。"
      ]
    },
    "R-CABINET": {
      id: "R-CABINET",
      label: "机柜巡检项完整性要求",
      lines: [
        "机房内在位机柜逐柜记录柜门、标识、指示灯与温湿度。",
        "视觉识别到在位但表单未记录的机柜，判为记录缺项。"
      ]
    },
    // 【为什么新开一张卡，而不是往 R-BEHAVIOR 里加一行】
    // REC-5 的芯片 detail 写死了「停留 / 间隔 / 时段三条」——这句话描述的是 R-BEHAVIOR
    // 本身，如果把复核口径塞进同一张卡，等于让 REC-5 的证据链也间接引用了复核逻辑，
    // 而 REC-5 命中两条、根本不适用复核（见本卡第 5 行）。新开一张独立卡，把 REC-7
    // 引入的"复核"语义完全隔离在 R-BEHAVIOR-CLEAR 里，REC-5 的影响半径压到零、
    // 一个字都不用改。
    "R-BEHAVIOR-CLEAR": {
      id: "R-BEHAVIOR-CLEAR",
      label: "行为异常的视觉复核口径",
      lines: [
        "命中一条规则且机位可见作业过程时，以视觉证据为准复核该项。",
        "姿态需给出完整动作序列（到位 / 作业 / 录入），缺任一段不予采信。",
        "表盘须判定盘面可读，且读数与人工填报及同点位变送器一致；不一致按重点复核处理，不按行为异常处理。",
        "轨迹需证明人在该巡检点 ROI 内停留，且停留时长与提交时刻吻合。",
        "命中两条以上规则时不适用本条 —— 仍按退回重巡处理（见巡检行为核查口径）。"
      ]
    }
  };

  // ---- 巡检行为核查（track 形态）----
  //
  // 【为什么需要这一类】原先四条记录覆盖的是「填错了」（第 106 项）、「漏填了」（第 318 项）、
  // 「已处置待复查」（第 250 项）—— 全是对**数据**的判断。缺的是对**行为**的判断：
  // 这一轮是不是真去了。三者性质完全不同：填错是判断问题、漏填是责任心问题，
  // 而走过场是行为真实性问题 —— 它一旦成立，整轮数据都不可信。
  //
  // 管理者视角（班长/主管管巡检员）的核心正是第三种，所以补一条。
  //
  // 【时间基准是真的】四张关键帧的 OSD 时间是画面上烧进去的：
  //   20:01:55 泵棚 → 20:10:26 泵棚（同机位）→ 20:13:39 低压配电室 → 20:18:35 PLC 机房
  // 低压配电室这一段的窗口就是 20:13:39 到 20:18:35，共 4 分 56 秒。本项的提交时刻
  // 20:14:04 落在这个窗口里，与前一项相隔 2 秒 —— 两个数都能和画面时间对上。
  //
  // 【三条判定规则是真业务口径】取自 poc/inspection-demo/inspection-station-v2 的
  // scripts/data/quality.js：单项现场停留 < 10 秒 / 相邻两项提交间隔 < 3 秒 /
  // 提交时刻偏离计划时段 30 分钟以上。那份数据是站点级的逐项明细，本文件不搬它的
  // 区名项名（那是长沙输油站 12 区 256 项，本 POC 是湘潭站 3 部位 141 项），只用规则。
  //
  // 【TRK-112 是 TRK-261 的镜像，不是它的补丁】同一条 R-BEHAVIOR 命中了停留规则，
  // 但落在两个不同机位窗口：TRK-261 在低压配电室段（该段均值 7.8 秒/项，是"整段都在
  // 走过场"的证据，6 秒完全合群、判不出异常），TRK-112 在 P-4 泵棚段（均值 42.6 秒/项，
  // 8 秒是这一段里的孤例）。更关键的是机位能不能看：低压配电室机位看不到电缆沟，
  // 视觉帮不上忙，只能靠行为核查独立下结论；P-4 泵棚机位能看到巡检员本人、手持终端与
  // 表盘，姿态 + 表盘 + 轨迹三路证据联合起来足以复核、推翻"走过场"的初判。
  // 两条 track 因此都需要 verdictTone 这个只读字段：裁决色不能靠「命中条数 >= 2」现算。
  // 旧算法是 hits >= 2 ? "danger" : "warn"，TRK-112 只命中一条会拿到 **warn（橙点）**，
  // 而这条记录的结论是「不构成行为异常」—— 橙点配判正常，颜色和结论对不上。
  // 所以 TRK-112 显式写 verdictTone: "ok"（绿），TRK-261 写 "danger"（红）。
  var tracks = {
    "TRK-261": {
      id: "TRK-261",
      label: "本项行为核查",
      note: "提交时刻与关键帧 OSD 时间对齐后现算",
      // 该部位这一段的取证窗口，两端都来自真实关键帧的 OSD 时间。
      window: { from: "20:13:39", to: "20:18:35", label: "低压配电室段" },
      // 【裁决色必须读，不能算】renderTrack 原先把裁决点算成 hits >= 2 ? "danger" : "warn"，
      // 这条命中两条本来算出来就是 danger，加这个字段是为了和 TRK-112 统一口径 ——
      // 详见 TRK-112 处的说明：那一条只命中一条却仍要显示为需要关注的裁决色，
      // 靠"命中条数"现算会得到错误结果，两条 track 因此都改成直接声明结果。
      verdictTone: "danger",
      rows: [
        { label: "本项提交时刻", value: "20:14:04", tone: "muted",
          note: "落在低压配电室段窗口内（20:13:39-20:18:35）" },
        { label: "与前一项间隔", value: "2 秒", tone: "danger",
          rule: "相邻两项提交间隔 < 3 秒", hit: true,
          note: "前一项「第 260 项 应急照明」提交于 20:14:02" },
        { label: "本项现场停留", value: "6 秒", tone: "danger",
          rule: "单项现场停留 < 10 秒", hit: true,
          note: "本项表单在终端上打开到提交的时长" },
        { label: "时段偏移", value: "0 分钟", tone: "ok",
          rule: "提交时刻偏离计划时段 30 分钟以上", hit: false,
          note: "本项在计划时段内提交，这一条不构成异常" }
      ],
      // 同段其余项的节奏，用来说明"不是只有这一项快"。
      segment: { itemCount: 6, spanSeconds: 47,
                 note: "低压配电室段 6 项连续提交、中间无间断，47 秒走完，均值 7.8 秒/项" },
      conclusion: "两条规则命中（间隔 2 秒、停留 6 秒）。目视类检查项在 6 秒内完成"
                + "并提交，与该项的实际作业量不相称，判为行为异常，建议退回重巡。",
      // ★ 这一句是这条记录真正的价值：说清视觉为什么帮不上忙。
      // 字段由 visionLimit 改名为 visionNote：往一个叫 visionLimit（视觉局限）的字段里
      // 写"视觉可以证实本项"（TRK-112 的情形）是反义词，读代码的人会以为该字段专门
      // 用来讲"视觉做不到什么"。更隐蔽的是，若渲染层按老字段名读取但 TRK-112 没配
      // visionLimit，h("p", { text: undefined }) 只会静默产出一个空 <p>，不会报错 ——
      // 这种"缺字段不响"的坑正是本项目一贯要避免的（见文件顶部的硬约束）。改成中性的
      // visionNote 后，两条 track 用同一个字段名承载"视觉这一路到底能不能帮上忙"的
      // 结论，不论结论是"能"还是"不能"，字段名本身都不预设立场。
      visionNote: "低压配电室机位（20:13:39）能看到 1DP/120DP 柜面，但电缆沟与穿墙孔洞"
                + "在地面下方、不在该机位视野内 —— 视觉既不能证实也不能否证本项。"
                + "这类项只能靠人真的到位，所以行为核查是它唯一可核的维度。"
    },
    "TRK-112": {
      id: "TRK-112",
      label: "本项行为核查",
      note: "提交时刻与关键帧 OSD 时间对齐后现算",
      // 与 TRK-261.window.label（"低压配电室段"）刻意不同：R-BEHAVIOR-CLEAR 是否适用
      // 取决于"命中一条 vs 两条"，而这条界线的对照基准正是 TRK-261 所在的低压配电室段
      // （均值 7.8 秒/项）。若把本条也标成同一 window.label，8 秒 > 7.8 秒会显得
      // "本段均值都超过 8 秒还判正常"，倒过来推翻 TRK-261 自己的论证；两条 track 必须
      // 落在不同 window，assertMirror() 末尾专门钉死这一条。
      window: { from: "20:01:55", to: "20:10:26", label: "P-4 泵棚段" },
      verdictTone: "ok",
      rows: [
        { label: "本项提交时刻", value: "20:07:12", tone: "muted",
          note: "落在 P-4 泵棚段窗口内（20:01:55-20:10:26）" },
        { label: "与前一项间隔", value: "51 秒", tone: "ok",
          rule: "相邻两项提交间隔 < 3 秒", hit: false,
          note: "前一项「第 111 项 过滤器外观」提交于 20:06:21" },
        { label: "本项现场停留", value: "8 秒", tone: "warn",
          rule: "单项现场停留 < 10 秒", hit: true,
          note: "本项表单在终端上打开到提交的时长；与画面内 ROI 停留 8 秒两路独立取值一致" },
        { label: "时段偏移", value: "0 分钟", tone: "ok",
          rule: "提交时刻偏离计划时段 30 分钟以上", hit: false,
          note: "本项在计划时段内提交" }
      ],
      segment: { itemCount: 12, spanSeconds: 511,
                 note: "本段 12 项中数显读数类 3 项（8~14 秒）、开阀测温听音类 9 项（35~90 秒）；本项 8 秒落在数显读数类区间内，与同类项相称" },
      conclusion: "仅命中一条规则（停留 8 秒）。姿态、表盘与轨迹三路证据一致支持人工填报"
                + " —— 不构成行为异常，建议归档。",
      visionNote: "本机位（20:07:05）能看到巡检员正面、手持终端与表盘 —— 视觉可以证实本项。"
                + "这与第 261 项相反：那一项的电缆沟在地面下方、不在机位视野内，视觉既不能"
                + "证实也不能否证，所以只能靠行为核查。"
    }
  };

  // ---- 动作与姿态（pose 形态）/ 定位与轨迹（route 形态）----
  // 这两类是本轮新增的证据形态，只服务于 R-BEHAVIOR-CLEAR 的复核场景（目前只有 REC-7
  // 用到）。之所以不合并成一个"视觉复核"大对象，是因为姿态关心的是"动作序列完不完整"
  // （phases 是时间切片），轨迹关心的是"人在不在 ROI 里、停了多久"（rows 是定位读数）——
  // 两者字段形状不同，硬凑一个通用形状反而会让某一侧的字段变成摆设。
  var poses = {
    "POSE-112": {
      id: "POSE-112",
      label: "动作与姿态",
      frameId: "FRM-POSE-2004",
      model: "姿态关键点 + 动作分类",
      confidence: 88,
      personBoxes: ["BX-POSE-A", "BX-POSE-B"],
      phases: [
        { at: "20:07:04", label: "到位", seconds: 2, detail: "进入表盘可视范围，正面朝向进口过滤器" },
        { at: "20:07:06", label: "读表", seconds: 4, detail: "头部朝向表盘，手持终端抬起" },
        { at: "20:07:10", label: "录入", seconds: 2, detail: "视线转向终端屏幕，完成数值录入" }
      ],
      conclusion: "8 秒分为到位 2 秒 / 读表 4 秒 / 录入 2 秒，动作序列完整，与「看一眼数显并录入」的作业量相称。持终端者与本项提交终端一致，录入动作与 20:07:12 的提交时刻对齐 —— 身份归属是这条对齐推出来的，姿态模型本身不做人员识别。"
    }
  };

  var routes = {
    "ROUTE-112": {
      id: "ROUTE-112",
      label: "定位与轨迹",
      frameId: "FRM-ROUTE-2003",
      model: "多目标检测 + ROI 跟踪",
      confidence: 84,
      roi: "ROI-FILTER",
      rows: [
        { label: "进入 ROI", value: "20:07:04" },
        { label: "离开 ROI", value: "20:07:12" },
        { label: "ROI 内停留", value: "8 秒" },
        { label: "本帧位置是否在本巡检点 ROI 内", value: "是" }
      ],
      conclusion: "轨迹在本巡检点 ROI 内连续停留 8 秒，与终端提交时刻吻合 —— 两路独立取值指向同一个 8 秒。轨迹取自该机位画面内的多目标跟踪，不依赖任何随身定位设备。"
    }
  };

  // 七条记录。R5 与 R7 是互为镜像的行为核查记录（R5 命中两条判退回、R7 命中一条判归档，
  // 界线依据见文件头注释）。R6 属 OBJ-B（相似站场），只用于验证筛选不跨对象串台，屏上不出现。
  var records = [
    {
      id: "REC-1", audience: "executor", objectId: "OBJ-A", partId: "PART-PUMP",
      no: "第 106 项", date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      item: "出口管线压力",
      standard: "高报警 9.0MPa，高高报警 9.8MPa。",
      result: "现场读数 9.3MPa",
      aiFlag: "conflict",
      suggestion: {
        outcomeId: "OUT-CONFIRM",
        label: "建议结论：确认异常，转处置",
        confidence: 82,
        text: "就地表读数与 SCADA 趋势一致，均已越过高报警 9.0MPa、未到高高报警 9.8MPa。建议人工到现场核对上下游工况后确认。"
      },
      evidence: [
        { kind: "series", label: "出口压力趋势", detail: "末点 9.3MPa，已越高报警线", pointId: "PT-1" },
        { kind: "vision", label: "就地压力表", detail: "20:01:55 帧，表盘可读", frameId: "FRM-PUMP-2001", boxId: "BX-GAUGE" },
        { kind: "rule", label: "联锁值口径", detail: "高报 9.0 / 高高报 9.8", ruleId: "R-INTERLOCK" },
        { kind: "case", label: "PT6903B 联锁台账", detail: "归档后可引用", docId: "DOC-INTERLOCK", locked: true }
      ]
    },
    {
      id: "REC-2", audience: "executor", objectId: "OBJ-A", partId: "PART-PUMP",
      no: "第 107 项", date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      item: "泵机组运行状态与渗漏",
      standard: "泵体、机封、联轴器护罩与基座应无渗漏、无异响、无异常振动。",
      result: "运行正常，无渗漏",
      aiFlag: "ok",
      suggestion: {
        outcomeId: "OUT-ARCHIVE",
        label: "建议结论：按 AI 结论归档",
        confidence: 93,
        text: "同机位 20:01:55 与 20:10:26 两帧比对，泵体、护罩、基座与管线均无变化，地面无新增油迹。与人工结果一致。"
      },
      evidence: [
        { kind: "compare", label: "同点位前后帧", detail: "20:01:55 → 20:10:26，间隔 8 分 31 秒",
          frameId: "FRM-PUMP-2001", compareFrameId: "FRM-PUMP-2010" },
        { kind: "rule", label: "渗漏检查要求", detail: "泵体 / 机封 / 基座", ruleId: "R-LEAK" }
      ]
    },
    {
      id: "REC-3", audience: "supervisor", objectId: "OBJ-A", partId: "PART-POWER",
      no: "第 250 项", date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      item: "柜面表计及指示灯",
      standard: "柜面表计、测显装置应显示正常，综保无控制回路断线报警。",
      result: "1DP 柜表计无显示，已修复",
      aiFlag: "conflict",
      suggestion: {
        outcomeId: "OUT-RECHECK",
        label: "建议结论：纳入下轮复查",
        confidence: 76,
        text: "视觉识别到 1DP 柜面数显表无读数，与同型号 120DP 柜对照差异明显。现场已完成紧固处置并复测通过，建议纳入下一轮复查留痕。"
      },
      evidence: [
        { kind: "timeline", label: "处置过程", detail: "发现 → 排查 → 紧固 → 复测", timelineId: "TL-1DP" },
        { kind: "vision", label: "1DP 柜面", detail: "20:13:39 帧，与 120DP 柜对照", frameId: "FRM-POWER-2013", boxId: "BX-1DP" },
        { kind: "rule", label: "复查要求", detail: "已处置问题需下轮留痕", ruleId: "R-PANEL" }
      ]
    },
    {
      id: "REC-4", audience: "supervisor", objectId: "OBJ-A", partId: "PART-PLC",
      no: "第 318 项", date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      item: "机柜门禁与设备分区",
      standard: "机房内在位机柜逐柜记录柜门、标识、指示灯与温湿度。",
      result: "柜门关闭，分区标识清晰",
      aiFlag: "gap",
      suggestion: {
        outcomeId: "OUT-SUPPLEMENT",
        label: "建议结论：补充记录后归档",
        confidence: 71,
        text: "视觉识别到 SIS 机柜（一）在位且柜门关闭，但本轮表单 6 项里有 2 项未记录该柜。建议补录后归档。"
      },
      evidence: [
        { kind: "gaps", label: "表单缺项", detail: "6 项中 2 项未记录", gapId: "GAP-PLC" },
        { kind: "vision", label: "机柜与分区标识", detail: "20:18:35 帧，SIS 机柜在位", frameId: "FRM-PLC-2018", boxId: "BX-SIS" },
        { kind: "rule", label: "完整性要求", detail: "在位机柜须逐柜记录", ruleId: "R-CABINET" }
      ]
    },
    {
      // ★ 管理者视角的核心记录。前四条都是对数据的判断，这一条是对行为的判断。
      id: "REC-5", objectId: "OBJ-A", partId: "PART-POWER",
      no: "第 261 项", item: "电缆沟与穿墙孔洞封堵",
      result: "封堵完好",
      standard: "电缆沟盖板齐全、穿墙孔洞封堵密实，无破损与缺失。",
      date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      aiFlag: "behavior",
      audience: "supervisor",
      suggestion: {
        outcomeId: "OUT-REINSPECT",
        label: "建议结论：退回重巡该项",
        confidence: 78,
        text: "本项人工填报「封堵完好」，但行为数据命中两条规则：与前一项提交间隔 2 秒、"
            + "现场停留 6 秒。低压配电室段共 6 项在 47 秒内全部提交完毕（均值 7.8 秒/项）。"
            + "目视类检查项在 6 秒内完成并提交，与实际作业量不相称。\n"
            + "该机位画面看不到电缆沟（在地面下方、不在视野内），视觉无法证实或否证，"
            + "因此这一项只能靠人到位 —— 建议退回重巡，而不是就此归档。",
        alternative: null
      },
      evidence: [
        { kind: "track", label: "本项行为核查", detail: "间隔 2 秒 / 停留 6 秒，命中 2 条规则",
          trackId: "TRK-261" },
        { kind: "rule", label: "行为核查口径", detail: "停留 / 间隔 / 时段三条", ruleId: "R-BEHAVIOR" },
        // 这一枚刻意放进来：不是为了证明什么，而是为了展示"这张帧覆盖不到本项"。
        { kind: "vision", label: "该机位视野", detail: "看得到柜面，看不到电缆沟",
          frameId: "FRM-POWER-2013", boxId: "BX-1DP" }
      ]
    },
    {
      // ★ REC-5 的镜像：同一条行为核查规则（停留），这次只命中一条，且机位能看到作业
      // 过程，姿态 + 表盘 + 轨迹三路证据联合把"走过场"的初判推翻，判为已排除、可归档。
      id: "REC-7", objectId: "OBJ-A", partId: "PART-PUMP",
      no: "第 112 项", date: "2026-07-22", shift: "夜班", inspector: "廖震宇",
      item: "过滤器前后压差",
      standard: "过滤器前后压差应不大于 0.05MPa，超限应切换备用过滤器并清洗滤芯。",
      result: "压差 0.04MPa，正常",
      aiFlag: "cleared", audience: "supervisor",
      suggestion: {
        outcomeId: "OUT-ARCHIVE",
        label: "建议结论：按 AI 结论归档",
        confidence: 86,
        text: "本项停留 8 秒，命中「单项现场停留 < 10 秒」一条规则。姿态模型给出完整动作序列"
            + "（到位 2 秒 / 读表 4 秒 / 录入 2 秒），表盘框出且盘面可读、就地读数与同点位变送器 PDT-P4-07 互校一致，"
            + "轨迹确认其在本巡检点 ROI 内停留 8 秒。按判定口径「命中两条以上建议退回重巡而非归档」，"
            + "本项只命中一条且多源证据一致 —— 不构成行为异常，建议归档。"
      },
      evidence: [
        { kind: "track", label: "本项行为核查", detail: "停留 8 秒，命中 1 条规则",
          trackId: "TRK-112" },
        { kind: "pose", label: "动作与姿态", detail: "到位 2 秒 / 读表 4 秒 / 录入 2 秒",
          frameId: "FRM-POSE-2004", poseId: "POSE-112" },
        { kind: "vision", label: "表盘读数", detail: "盘面可读，与同点位变送器互校一致",
          frameId: "FRM-GAUGE-2005", boxId: "BX-DIAL" },
        { kind: "route", label: "定位与轨迹", detail: "ROI 内停留 8 秒，路径经过本点",
          frameId: "FRM-ROUTE-2003", routeId: "ROUTE-112" },
        { kind: "rule", label: "视觉复核口径", detail: "命中一条可归档，两条以上退回",
          ruleId: "R-BEHAVIOR-CLEAR" }
      ]
    },
    {
      id: "REC-6", audience: "executor", objectId: "OBJ-B", partId: "PART-PUMP",
      no: "第 106 项", date: "2026-07-18", shift: "白班", inspector: "相似站场巡检员",
      item: "出口管线压力",
      standard: "高报警 9.0MPa，高高报警 9.8MPa。",
      result: "现场读数接近高报",
      aiFlag: "conflict",
      suggestion: {
        outcomeId: "OUT-CONFIRM",
        label: "建议结论：确认异常，转处置",
        confidence: 79,
        text: "相似站场对照记录，用于验证记录筛选不会跨对象串台。"
      },
      evidence: [
        { kind: "series", label: "出口压力趋势", detail: "对照站场趋势", pointId: "PT-1" },
        { kind: "rule", label: "联锁值口径", detail: "高报 9.0 / 高高报 9.8", ruleId: "R-INTERLOCK" }
      ]
    }
  ];

  // 派生：把 partId 展开成部位标签，表格列直接读 partLabel。
  function rowsOf(objectId) {
    return records
      .filter(function (r) { return r.objectId === objectId; })
      .map(function (r) {
        var part = STATION.partById(r.partId);
        return {
          id: r.id, no: r.no, partLabel: part.label, item: r.item, result: r.result,
          aiFlag: r.aiFlag, aiFlagText: aiFlagText[r.aiFlag]
        };
      });
  }

  function recordById(id) {
    var found = records.filter(function (r) { return r.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_RECORDS] 未知记录：" + id);
    return found;
  }

  function ruleById(id) {
    if (!rules[id]) throw new Error("[DOMAIN_RECORDS] 未知规则：" + id);
    return rules[id];
  }

  function timelineById(id) {
    if (!timelines[id]) throw new Error("[DOMAIN_RECORDS] 未知时间线：" + id);
    return timelines[id];
  }

  // 两条故事线的读者标签。记录不上表（表已经 6 列），只在 AI 判断卡里显示一枚小标签，
  // 讲解时按它分组讲：executor 那几条是巡检员自己要复核的，supervisor 那几条是班长要看的。
  var audiences = {
    executor: { id: "executor", label: "巡检员复核", note: "我填的对不对" },
    supervisor: { id: "supervisor", label: "班长核查", note: "这一轮可不可信" }
  };

  function audienceOf(record) {
    var a = audiences[record.audience];
    if (!a) throw new Error("[DOMAIN_RECORDS] 记录 " + record.id + " 缺 audience 或取值非法：" + record.audience);
    return a;
  }

  function trackById(id) {
    if (!tracks[id]) throw new Error("[DOMAIN_RECORDS] 未知行为核查：" + id);
    return tracks[id];
  }

  function poseById(id) {
    if (!poses[id]) throw new Error("[DOMAIN_RECORDS] 未知姿态复核：" + id);
    return poses[id];
  }

  function routeById(id) {
    if (!routes[id]) throw new Error("[DOMAIN_RECORDS] 未知轨迹复核：" + id);
    return routes[id];
  }

  function gapListById(id) {
    if (!gapLists[id]) throw new Error("[DOMAIN_RECORDS] 未知缺项清单：" + id);
    return gapLists[id];
  }

  // ---- 加载期断言：钉住 REC-5 / REC-7 互为镜像这件事本身 ----
  //
  // 这条记录存在的全部意义就是"同一条停留规则，命中一条与命中两条走向不同结论"。
  // 没有别的地方会检查这件事——渲染层只管把数据画出来，不管数据讲的故事是否自洽。
  // 因此在模块加载时就把这条不变量钉死：任何一次"整理数据"如果不小心把两条记录的
  // 依据、结论或时间窗改到互相矛盾，加载阶段就直接抛错，而不是留到演示时才被发现。
  function assertMirror() {
    var rec5 = recordById("REC-5");
    var rec7 = recordById("REC-7");

    function stayRow(record) {
      var ev = record.evidence.filter(function (e) { return e.kind === "track"; })[0];
      if (!ev) throw new Error("[DOMAIN_RECORDS] assertMirror：" + record.id + " 缺 track 依据");
      var track = trackById(ev.trackId);
      var row = track.rows.filter(function (r) {
        return r.rule === "单项现场停留 < 10 秒" && r.hit === true;
      })[0];
      if (!row) {
        throw new Error("[DOMAIN_RECORDS] assertMirror：" + record.id + " 的 track " + track.id
          + " 没有命中「单项现场停留 < 10 秒」的行");
      }
      return row;
    }

    stayRow(rec5);
    stayRow(rec7);

    if (rec5.suggestion.outcomeId === rec7.suggestion.outcomeId) {
      throw new Error("[DOMAIN_RECORDS] assertMirror：REC-5 与 REC-7 都命中停留规则，"
        + "但 outcomeId 必须不同（退回 vs 归档），实际都是 " + rec5.suggestion.outcomeId);
    }
    if (rec5.suggestion.outcomeId !== "OUT-REINSPECT" || rec7.suggestion.outcomeId !== "OUT-ARCHIVE") {
      throw new Error("[DOMAIN_RECORDS] assertMirror：outcomeId 不符预期，应为"
        + " REC-5=OUT-REINSPECT / REC-7=OUT-ARCHIVE，实际为 REC-5="
        + rec5.suggestion.outcomeId + " / REC-7=" + rec7.suggestion.outcomeId);
    }

    if (tracks["TRK-261"].window.label === tracks["TRK-112"].window.label) {
      throw new Error("[DOMAIN_RECORDS] assertMirror：TRK-261 与 TRK-112 的 window.label"
        + " 不能相同 —— 低压配电室段均值 7.8 秒/项是 REC-5 判走过场的证据，"
        + "TRK-112 的 8 秒若落进同一段会反过来推翻这条证据。");
    }

    return true;
  }

  assertMirror();

  return {
    columns: columns,
    aiFlagText: aiFlagText,
    records: records,
    rules: rules,
    timelines: timelines,
    gapLists: gapLists,
    tracks: tracks, trackById: trackById,
    poses: poses, poseById: poseById,
    routes: routes, routeById: routeById,
    audiences: audiences, audienceOf: audienceOf,
    rowsOf: rowsOf,
    recordById: recordById,
    ruleById: ruleById,
    timelineById: timelineById,
    gapListById: gapListById,
    assertMirror: assertMirror
  };
})();
