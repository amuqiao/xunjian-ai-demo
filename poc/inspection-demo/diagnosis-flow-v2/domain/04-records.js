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
// 本版按检查项的性质决定证据形态，依据链长度 2~4 不等：
//   数值 + 有标准     → series（时序曲线，只有 R1 有）
//   同点位前后变化     → compare（真实的同机位两帧，只有 R2 有）
//   开关量故障 + 处置  → timeline（事件时间线，只有 R3 有）
//   目视 / 门禁 / 分区 → vision（关键帧 + bbox）
//   记录缺项          → gaps（缺项清单，只有 R4 有）
//   判定口径          → rule（就地展开规则卡）
//   历史同类          → case（跳知识库；locked 的那枚是"二次命中"包袱）
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

  var aiFlagText = {
    conflict: "重点复核",
    gap: "记录缺项",
    ok: "已闭环"
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
    "R-CABINET": {
      id: "R-CABINET",
      label: "机柜巡检项完整性要求",
      lines: [
        "机房内在位机柜逐柜记录柜门、标识、指示灯与温湿度。",
        "视觉识别到在位但表单未记录的机柜，判为记录缺项。"
      ]
    }
  };

  // 五条记录。R5 属 OBJ-B（相似站场），只用于验证筛选不跨对象串台，屏上不出现。
  var records = [
    {
      id: "REC-1", objectId: "OBJ-A", partId: "PART-PUMP",
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
      id: "REC-2", objectId: "OBJ-A", partId: "PART-PUMP",
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
      id: "REC-3", objectId: "OBJ-A", partId: "PART-POWER",
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
      id: "REC-4", objectId: "OBJ-A", partId: "PART-PLC",
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
      id: "REC-5", objectId: "OBJ-B", partId: "PART-PUMP",
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

  function gapListById(id) {
    if (!gapLists[id]) throw new Error("[DOMAIN_RECORDS] 未知缺项清单：" + id);
    return gapLists[id];
  }

  return {
    columns: columns,
    aiFlagText: aiFlagText,
    records: records,
    rules: rules,
    timelines: timelines,
    gapLists: gapLists,
    rowsOf: rowsOf,
    recordById: recordById,
    ruleById: ruleById,
    timelineById: timelineById,
    gapListById: gapListById
  };
})();
