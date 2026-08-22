// 领域契约 06：报告模板 + 插槽。
//
// 【报告有两种形态，同一份内容】
//   1. 屏上预览：归档浮窗里按 A4 版式逐段渲染（styles/05-report.css），人工复核意见
//      那一段高亮。它读的是 ReportModel.resolve() 的结果 —— 反映现场实际选的结论。
//   2. 可下载的 PDF：tools/build_report.py 加载 tools/report-template.html，那个模板
//      加载同一份 domain + 同一个 ReportModel，用 Chromium 打印成 A4。
// 两种形态必须来自同一份模板与同一个解析器，否则屏上和下载下来的对不上。
// 不内嵌 PDF 的理由见参照物同一位置（headless Chromium 没有 PDF 插件）。
//
// 【本报告比参照物多两段，因为泵课题有两件事必须落到纸上】
//   · 「置信度构成」—— assets/诊断工作台/泵课题Q&A.docx 的 Q1 就是追问「这数字怎么算
//     出来的，别编个数据糊弄我」。报告里必须把四项加权列出来，而不是只印一个 83%。
//   · 「分级处置建议」—— Q15 要的中间方案（降负荷 + 复测 + 72h 窗口）。它是这份报告
//     真正能被拿去执行的部分，比结论本身更有用。
//
// 【插槽】模板里每个 {{x}} 都必须在 slots 里声明；解析后若还残留 {{...}} 直接抛错。
window.DOMAIN_REPORT = (function () {
  "use strict";

  var meta = {
    title: "输油泵机组智能诊断复核报告",
    subtitle: "长郴-衡阳站 · Ｐ－3泵驱动端振动异常",
    codePrefix: "BP-AI",
    pdfPaths: {
      accepted: "assets/reports/pump-diagnosis-report-accepted.pdf",
      divergent: "assets/reports/pump-diagnosis-report-divergent.pdf"
    }
  };

  // generatedAt 用在页眉（报告编号 / 生成时间那一行），不出现在 sections 里 ——
  // 别因为 grep 不到就把它从 slots 删掉。
  var slots = [
    "caseId", "generatedAt", "objectLabel", "unitLabel", "partLabel", "photoLabel",
    "recordNo", "recordItem", "recordStandard", "recordResult",
    "aiLabel", "aiConfidence", "aiText", "altLabel", "altConfidence",
    "reviewerName", "reviewerRole", "outcomeLabel", "reviewNote",
    "divergenceNote", "seriesSummary", "visionSummary", "alignSummary",
    "caseSummary", "weightSummary", "planSummary", "windowBasis", "partsNote"
  ];

  // 【编号必须派生】numbered:true 的段落由 ReportModel.resolve() 按实际出现顺序编号。
  // 写死会跳号 —— 无分歧时「复核分歧说明」整段不出现，硬编码的编号中间就空一个。
  var sections = [
    {
      id: "SEC-VERDICT", page: 1, kind: "callout", tone: "ai",
      title: "AI 诊断结论",
      body: "{{aiText}}"
    },
    {
      id: "SEC-BASE", page: 1, kind: "grid",
      numbered: true, title: "基础信息",
      rows: [
        ["站场 / 机组", "{{objectLabel}} · {{unitLabel}}"],
        ["部位", "{{partLabel}}"],
        ["取证位置", "{{photoLabel}}"],
        ["记录项", "{{recordNo}} · {{recordItem}}"],
        ["判定口径", "{{recordStandard}}"],
        ["现场 / 系统值", "{{recordResult}}"]
      ]
    },
    {
      id: "SEC-EVIDENCE", page: 1, kind: "list",
      numbered: true, title: "多源证据摘要",
      items: [
        "时序：{{seriesSummary}}",
        "视觉：{{visionSummary}}",
        "对中实测：{{alignSummary}}",
        "历史案例：{{caseSummary}}"
      ]
    },
    {
      id: "SEC-CONFIDENCE", page: 1, kind: "list",
      numbered: true, title: "置信度构成",
      items: [
        "主诊断：{{aiLabel}}，置信度 {{aiConfidence}}%",
        "备选诊断：{{altLabel}}，置信度 {{altConfidence}}%",
        "加权明细：{{weightSummary}}",
        "说明：置信度为上述各项的乘积，非单一模型输出；备选诊断保留在报告中，"
          + "不因主诊断置信度较高而删除。"
      ]
    },
    {
      id: "SEC-PLAN", page: 2, kind: "list",
      numbered: true, title: "分级处置建议",
      items: [
        "{{planSummary}}",
        "时间窗依据：{{windowBasis}}",
        "备件与作业卡：{{partsNote}}"
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
      body: "人工结论与 AI 主诊断（{{aiLabel}}）不一致。分歧理由：{{divergenceNote}}\n"
          + "本段连同复核意见一并回流知识库，作为该类误判的反馈样本。"
    },
    {
      id: "SEC-ARCHIVE", page: 2, kind: "tags",
      title: "归档标签",
      tags: [
        "站场：{{objectLabel}}",
        "机组：{{unitLabel}}",
        "部位：{{partLabel}}",
        "复核结论：{{outcomeLabel}}",
        "案例编号：{{caseId}}"
      ]
    },
    {
      id: "SEC-SOURCE", page: 2, kind: "list",
      numbered: true, title: "附件来源",
      items: [
        "站控 SCADA 趋势截图：{{photoLabel}}，含测点标题与量程。",
        "EASY-LASER 激光对中仪屏幕照片两张（调整前 / 调整后，后者带相机水印）。",
        "现场激光对中作业照片两张。",
        "历史案例检索命中的停泵报告原件（见知识库资产清单）。"
      ]
    }
  ];

  return { meta: meta, slots: slots, sections: sections };
})();
