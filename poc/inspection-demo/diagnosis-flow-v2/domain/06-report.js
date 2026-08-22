// 领域契约 06：报告模板 + 插槽。
//
// 【报告有两种形态，同一份内容】
//   1. 屏上预览：归档浮窗里按 A4 版式逐段渲染（styles/05-report.css），人工复核意见
//      那一段高亮。它读的是 ReportModel.resolve() 的结果 —— 反映现场实际选的结论。
//   2. 可下载的 PDF：tools/build_report.py 加载 tools/report-template.html，那个模板
//      加载同一份 domain + 同一个 ReportModel，用 Chromium 打印成 A4。
// 两种形态必须来自同一份模板与同一个解析器，否则屏上和下载下来的对不上。
//
// 【为什么屏上预览是 HTML 渲染，不是内嵌 PDF、也不是静态页图】
//   不内嵌 PDF：实测 headless Chromium 没有 PDF 插件，<embed type="application/pdf">
//     只显示 "Couldn't load plugin."，验收脚本永远验不到预览真的画出来了。
//   不用静态页图：页图是构建时固定的，而复核结论是现场选的 —— 改判之后报告会多一段
//     「复核分歧说明」，页图却不会变，"屏上所见 != 下载所得"当场能被看出来。
//   HTML 渲染同时解决两件事：随实际选择变化，且验收能断言正文文本。
//
// 【插槽】模板里每个 {{x}} 都必须在 slots 里声明；解析后若还残留 {{...}} 直接抛错。
// 防的是插槽名拼错 —— 它不会报异常，只会把 {{reviewNote}} 原文印在报告正文里，
// 而演示时没人会盯着报告逐字读。
window.DOMAIN_REPORT = (function () {
  "use strict";

  var meta = {
    title: "巡检智能复核报告",
    subtitle: "长郴-湘潭站 · 输油站日常巡检",
    codePrefix: "XJ-AI",
    // 【两份 PDF，按分歧态取】tools/build_report.py 各构建一份，场景层按当前是否分歧
    // 选对应那份挂到「下载完整 PDF」上。
    //
    // 为什么要两份：选「确认异常」（= AI 建议）时报告 6 段无分歧；改判成其它结论时
    // 多出一段「复核分歧说明」，共 7 段。一份 PDF 装不下两种结果，而"屏上改判了、
    // 下载下来还是采纳版"是当场能被看出来的不一致。
    pdfPaths: {
      accepted: "assets/reports/inspection-review-report-accepted.pdf",
      divergent: "assets/reports/inspection-review-report-divergent.pdf"
    }
  };

  // generatedAt 不出现在 sections 里 —— 它用在报告的**页眉**（报告编号 / 生成时间那一行），
  // 页眉不是 sections 的一部分，由渲染层与 tools/build-report.mjs 各自读 meta + 这个插槽
  // 拼出来。别因为「grep 不到它在 sections 里」就把它从 slots 删掉。
  var slots = [
    "caseId", "generatedAt", "objectLabel", "partLabel", "cameraLabel",
    "recordNo", "recordItem", "recordStandard", "recordResult",
    "aiLabel", "aiConfidence", "aiText",
    "reviewerName", "reviewerRole", "outcomeLabel", "reviewNote",
    "divergenceNote", "seriesSummary", "visionSummary"
  ];

  // 【编号必须派生，不能写死在 title 里】numbered:true 的段落由 ReportModel.resolve()
  // 按实际出现顺序编号（一、二、三…）。写死会跳号：无分歧时「复核分歧说明」整段不出现，
  // 硬编码的「三、人工复核意见 → 五、附件来源」中间就空了一个四 —— 第一版就是这样，
  // 打出来的 PDF 上肉眼可见。不带 numbered 的段落（AI 复核结论、归档标签）不参与编号。
  // sections 的顺序就是报告的段落顺序，page 字段决定 PDF 分页。
  // showIf:"divergent" 的那一段只在人工结论 != AI 建议时出现 —— 两次演示（采纳 vs 改判）
  // 因此跑出两份不同的报告，这是「介入产生后果」最直观的一处。
  var sections = [
    {
      id: "SEC-VERDICT", page: 1, kind: "callout", tone: "ai",
      title: "AI 复核结论",
      body: "{{aiText}}"
    },
    {
      id: "SEC-BASE", page: 1, kind: "grid",
      numbered: true, title: "基础信息",
      rows: [
        ["巡检站场", "{{objectLabel}}"],
        ["巡检部位", "{{partLabel}}"],
        ["监控机位", "{{cameraLabel}}"],
        ["表单项", "{{recordNo}} · {{recordItem}}"],
        ["判定标准", "{{recordStandard}}"],
        ["人工结果", "{{recordResult}}"]
      ]
    },
    {
      id: "SEC-EVIDENCE", page: 1, kind: "list",
      numbered: true, title: "多源证据摘要",
      items: [
        "时序：{{seriesSummary}}",
        "视觉：{{visionSummary}}",
        "AI 建议：{{aiLabel}}（置信度 {{aiConfidence}}%）"
      ]
    },
    {
      id: "SEC-REVIEW", page: 2, kind: "callout", tone: "human",
      numbered: true, title: "人工复核意见",
      // {{reviewNote}} 就是复核页文本框里打的字，在这里逐字出现。
      body: "复核结论：{{outcomeLabel}}。复核人：{{reviewerName}}（{{reviewerRole}}）。\n复核说明：{{reviewNote}}"
    },
    {
      id: "SEC-DIVERGENCE", page: 2, kind: "callout", tone: "divergent",
      showIf: "divergent",
      numbered: true, title: "复核分歧说明",
      body: "人工结论与 AI 建议（{{aiLabel}}）不一致。分歧理由：{{divergenceNote}}"
    },
    {
      id: "SEC-ARCHIVE", page: 2, kind: "tags",
      title: "归档标签",
      tags: [
        "巡检对象：{{objectLabel}}",
        "部位：{{partLabel}}",
        "复核结论：{{outcomeLabel}}",
        "案例编号：{{caseId}}"
      ]
    },
    {
      id: "SEC-SOURCE", page: 2, kind: "list",
      numbered: true, title: "附件来源",
      items: [
        "站内定点摄像头关键帧：{{cameraLabel}}，含 AI 识别框与置信度。",
        "站控 SCADA 时序：{{seriesSummary}}",
        "现场人工巡检照片：巡检人手持终端就地核对佐证。"
      ]
    }
  ];

  return { meta: meta, slots: slots, sections: sections };
})();
