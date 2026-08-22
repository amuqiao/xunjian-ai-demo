// 领域契约 04：诊断记录 + 依据链 + 三种非时序证据（历史案例检索 / 对中前后对比 / 处置方案）。
//
// 【故事线来自 assets/诊断工作台/泵课题Q&A.docx，但数字全部换成真的】
// 那份文档的骨架是好的：AI 给一个主诊断 + 一个备选诊断，专家逐轮质询（置信度怎么算的 /
// 检索到的案例为什么没往备选推 / 72h 怎么定的 / 停机损失谁算 / 给个中间方案），
// 最后把对话结论更新进报告。但它的数据是编的（CASE-2023-0417、XX站、YY厂、2 号泵）。
//
// 本文件保留骨架、换掉数字，四份真实资料对应四枚证据：
//   ① SCADA 截图（media/scada-vibration-trend.jpg）→ 时序曲线 + 原始凭据
//   ② Easy-Laser 调整前/调整后 → 对中前后对比（★ 排除"不对中"的关键一步）
//   ③ 四份真实停泵报告 → 历史案例检索（Top-4，其中两条确诊是别的原因）
//   ④ 长岭 P-1 报告里的 API 610 优先工作区口径 → 判定规则
//
// ★ 相对 Q&A 原文的一处**实质改进**：原文让视觉引擎"确认联轴器无明显偏移"来排除不对中，
//   然后专家反问"0.1-0.3mm 你测得出来吗"，AI 承认漏检可能 —— 那是靠"承认不确定"收场。
//   而真素材给了更硬的东西：对中**实测**从 H 向 0.31mm 调到 -0.02mm（已合格），
//   而 SCADA 上振动**没有跟着降**。这是排除，不是"可能漏检"。
window.DOMAIN_RECORDS = (function () {
  "use strict";

  // 【为什么表上要有「AI 诊断」这一列】assets/诊断工作台/泵课题Q&A.docx 的故事线，
  // 第三步的输出是一个**故障诊断名**（原文：「高度疑似轴承内圈剥落，置信度 87%」），
  // 而不是一个处置动作。第一版这张表只有「检查项 + 现场值 + AI 质检」三列，
  // 讲到"生成诊断报告"那一步时，屏上指不到"疑似什么坏了" —— 案例在表上是隐形的。
  // 加这一列之后，表的第一行就直接写着「疑似轴承磨损/润滑不良 83%」。
  // 六列。去掉了「记录」序号列 —— 只有 3 行，序号是纯占位；行的身份由「部位 + 检查项」
  // 表达，报告里那个「第 N 条」仍在（record.no 字段没删，只是不上表）。
  var columns = [
    { key: "aiFlag", label: "", type: "status-dot", width: 24 },
    { key: "partLabel", label: "部位", type: "text", width: 96 },
    { key: "item", label: "检查项", type: "text", width: 148 },
    { key: "result", label: "现场/系统值", type: "text", width: 160 },
    { key: "diagnosisText", label: "AI 诊断", type: "text", width: 214 },
    { key: "aiFlagText", label: "AI 质检", type: "badge-icon", width: 96 }
  ];

  var aiFlagText = {
    danger: "重点复核",
    warn: "待确认",
    ok: "已闭环"
  };

  // 【四个引擎】assets/诊断工作台/泵课题Q&A.docx 的故事线就是这四步：
  //   时序引擎检测异常 → 视觉引擎排除误报 → RAG 引擎检索并生成诊断 → 应用层落到工单。
  // 依据链第一版是平铺七枚，讲故事线时指不出分工。加这一层分组之后，屏上依据链按
  // 四段带小标题排列，讲解时可以逐段往下走。
  //
  // stage 字段挂在每枚证据上（见下面 records[].evidence），这里只定义分组的名字与顺序。
  var stages = [
    { id: "ST-SERIES", label: "① 时序引擎", note: "从连续量里发现异常" },
    { id: "ST-VISION", label: "② 视觉与实测", note: "排除误报，缩小范围" },
    { id: "ST-RAG", label: "③ 检索与判定", note: "找同类案例，给出诊断与置信度" },
    { id: "ST-APP", label: "④ 应用层", note: "落到可执行的处置动作" }
  ];

  function stageById(id) {
    var f = stages.filter(function (x) { return x.id === id; })[0];
    if (!f) throw new Error("[DOMAIN_RECORDS] 未知推理阶段：" + id);
    return f;
  }

  // ---- 历史案例检索结果（Top-4）。四条全部是真报告，不是编的 ----
  //
  // ★ Q&A 里最精彩的一轮是「第 3 个案例相似度 0.79，最终确诊是联轴器不对中 ——
  //   这不就是你的备选诊断吗」。真实资料给了更好的版本：Top-4 里有**两条**确诊是
  //   完全不同的原因（探头故障 / 工艺水击），它们恰好证明"振动高 ≠ 轴承坏"。
  //   所以专家那句追问不是设计出来的，是数据里本来就有。
  var caseHits = {
    "CASE-TOP4": {
      id: "CASE-TOP4",
      label: "历史案例检索 · Top-4",
      note: "检索库：湖南公司及同类分公司输油泵故障停机报告",
      columns: ["排名", "案例", "相似度", "最终确诊"],
      rows: [
        { rank: 1, code: "长岭站 P-01（2025-03-26）", score: 0.88,
          verdict: "低流量长期偏离 API 610 优先工作区", tone: "warn",
          detail: "额定 900m³/h，优先区 630~1080，实际过泵 575m³/h。振动从 2.67 升到 3.5 徘徊，"
                + "最终 6.45 联锁停泵。报告结论：长时间偏离优先工作区导致运行状态下降。" },
        { rank: 2, code: "衡阳站 P-2（2025 评估 → 2026-06 监测）", score: 0.81,
          verdict: "轴承磨损，润滑不良", tone: "danger",
          detail: "2025-03 大修后评估为 A 优等级，但备注「电机端存在工频倍频，联轴器两端相位反向，"
                + "存在轻微不对中，但不影响运行」；2026-06 在线监测判故障「轴承磨损，润滑不良」。" },
        { rank: 3, code: "汨罗站 P-02（2025-06-12）", score: 0.76,
          verdict: "振动探头故障", tone: "ok",
          detail: "非驱动端振动从 0.282 突变到 14.2mm/s、持续 2 秒后联锁；换 CTC LP802-1R1-3C "
                + "新探头后试运平均 0.7mm/s 正常。排查结论：探头故障，机械无异常。" },
        { rank: 4, code: "长岭站 B-02 给油泵（2025-04-29）", score: 0.72,
          verdict: "工艺操作水击", tone: "ok",
          detail: "切泵操作未按规程节压至预停泵压的 80%，停泵后站外压力高于站内，"
                + "叠加七里山站上载水击，非驱动端振动瞬间冲到联锁值。机泵本体无故障。" }
      ],
      // 置信度是怎么加权出来的 —— Q&A 的 Q1 专门追问这件事，屏上必须能摊开给人看。
      // 这四项相乘 ≈ 0.83，就是 AI 判断卡上那个数，不是随手写的。
      weighting: [
        { label: "时序特征匹配", value: 0.86,
          note: "持续 7 分钟高位 + 峰群，与 Top-1/Top-2 的振动形态接近" },
        { label: "对中已排除", value: 1.08,
          note: "实测 0.31 → -0.02mm 合格而振动未降，Top-2 那条的「不对中」分支被压低" },
        { label: "同型号同站加权", value: 1.05,
          note: "Top-2 是同站同型号（200DY390-HY）机组" },
        { label: "确诊标签分布", value: 0.85,
          note: "Top-4 里只有 2 条确诊为机械类，另 2 条是探头/工艺，这一项是减分" }
      ]
    }
  };

  // ---- 对中前后对比（同点位两个离散读数，不是曲线）----
  var alignments = {
    "ALIGN-0722": {
      id: "ALIGN-0722",
      label: "激光对中 · 调整前后",
      instrument: "EASY-LASER 对中仪",
      note: "机械专业岗现场实测，两张仪器屏幕照片见证据台",
      rows: [
        { label: "V 向偏差", before: "0.07 mm", after: "0.02 mm", ok: true },
        { label: "H 向偏差", before: "0.31 mm", after: "-0.02 mm", ok: true },
        { label: "机脚 MF1", before: "0.47", after: "0.06", ok: true },
        { label: "机脚 MF2", before: "0.75", after: "0.20", ok: true }
      ],
      // ★ 这条结论是整屏最硬的一句话。
      conclusion: "对中已调至合格（H 向 0.31 → -0.02mm），而同时段 SCADA 振动未回落 —— "
                + "「联轴器不对中」这条备选被实测排除，不是靠「视觉没看出偏移」排除的。",
      // Q&A 的 Q3 追问视觉精度。真素材里对中是**仪器实测**而不是视觉识别，
      // 所以那个追问在这里的答案更硬：0.31mm 视觉确实测不出，但激光对中仪测得出。
      visionLimit: "视觉引擎对联轴器径向偏移的最小可检测阈值 0.5mm，0.1~0.3mm 区间会漏检；"
                 + "本次 H 向 0.31mm 正落在该区间内 —— 所以这一项必须靠激光对中仪，不能靠视觉。"
    }
  };

  // ---- 处置方案（Q&A 的 Q15「给我个中间方案」+ Q16「备件推了什么」）----
  //
  // ⚠️ 「推送备件信息 / 移动端作业卡」在本 POC 里**只是文字说明**，不做任何假推送、
  //    不显示"已发送"这类状态。演示时说清楚这是集成点、当前未接，比做一个假动作诚实。
  var plans = {
    "PLAN-STAGED": {
      id: "PLAN-STAGED",
      label: "分级处置建议",
      note: "AI 给建议，是否执行由值班长与分控中心决定",
      steps: [
        { at: "立即", tone: "danger", label: "降负荷运行",
          detail: "将 P-3 泵降至额定 70% 负荷，预计振动冲击能量下降约 30%，延缓劣化速率。"
                + "同时联系分控中心评估是否切备用泵。" },
        { at: "4 小时内", tone: "warn", label: "现场复测 + 取油样",
          detail: "派员用测振仪 + 听诊棒复测驱动端，同时采集润滑油样送检 —— "
                + "若油样中发现金属颗粒，可与轴承磨损交叉验证。" },
        { at: "24 小时内", tone: "warn", label: "核对运行工况",
          detail: "比对当前过泵流量与额定 390m³/h 的偏离程度（Top-1 案例的根因就是长期低流量），"
                + "必要时调整配泵方案。" },
        { at: "72 小时内", tone: "ok", label: "停机拆检确认",
          detail: "按上述结果决定是否停机拆检驱动端轴承。停机前需分控中心批准。" }
      ],
      // Q&A 的 Q13 追问 72h 怎么定的 —— 依据要摊开，不能只说"保守值"。
      windowBasis: [
        "Top-1（长岭 P-01）从首次振动高报到联锁停泵历时约 1 小时 55 分，但那是低流量工况下的急性劣化；",
        "Top-2（衡阳 P-2）从评估 A 级到判定轴承磨损历时约 14 个月，属慢性劣化；",
        "本次形态更接近 Top-2（工况未变、振动持续高位），取两者之间的保守值 72 小时。"
      ],
      // Q&A 的 Q14 追问停机损失。这里如实说"不在 AI 的权限内"，不编一个金额。
      costNote: "停机的产能与经济影响需结合分控中心的输量计划评估，本系统不做经济性判断。",
      // Q&A 的 Q16 备件。真型号来自台账（湖南公司主输泵设备维护保养信息表）。
      partsNote: "台账中本机组轴承型号与库存需人工核对后再开工单；备件信息与移动端作业卡"
               + "属于与 IMS / 供应链平台的集成点，**本演示未接入，此处仅作说明**。"
    }
  };

  // ---- 判定规则口径卡 ----
  var rules = {
    "R-ISO": {
      id: "R-ISO",
      label: "ISO 10186-3 状态分级",
      lines: [
        "振动速度有效值，采集频段 10-1000Hz；A < 2.3 优，B 2.3~4.5 良，C 4.5~7.1 中，D ≥ 7.1 劣。",
        "机组状态按**全部测点的最大值**定级，不是逐点定级。",
        "本机组本轮全程落在 D 档（8.2~12.1mm/s），属「劣」，不是「略高」。"
      ]
    },
    "R-API610": {
      id: "R-API610",
      label: "API 610 优先工作区",
      lines: [
        "机泵优先工作区为最佳效率点流量的 70%~120%（一般以额定流量计）。",
        "长期偏离该区间运行会导致运行状态下降、产生高振动 —— Top-1 案例的确诊根因即此。",
        "本机组额定流量 390m³/h，优先区 273~468m³/h，需核对本轮实际过泵流量。"
      ]
    },
    "R-THRESHOLD": {
      id: "R-THRESHOLD",
      label: "站控阈值与台账缺项",
      lines: [
        "站控振动报警值/联锁值是**逐泵设定**的，与 ISO 分级不是一套口径。",
        "本机组（衡阳站 P-3）的振动、轴温、机封温阈值在台账里**未填报** —— 全省 40 台皆然。",
        "《长岭站 P-01 报告》里该泵阈值为报警 3.5 / 联锁 5.5mm/s，报告自评「设置较为苛刻」。"
      ]
    },
    "R-VISION": {
      id: "R-VISION",
      label: "视觉识别能力边界",
      lines: [
        "联轴器径向偏移的最小可检测阈值 0.5mm；0.1~0.3mm 区间会漏检。",
        "本次 H 向偏差 0.31mm 正落在漏检区间 —— 该项必须靠激光对中仪实测，不能靠视觉。",
        "视觉可靠的是：泵体渗漏、地面油迹、部件位移、柜门与标识状态。"
      ]
    }
  };

  // ---- 四条记录。REC-4 属 OBJ-B，只用于验证筛选不跨对象串台，屏上不出现 ----
  var records = [
    {
      id: "REC-1", objectId: "OBJ-A", partId: "PART-DE",
      no: "第 1 条", item: "驱动端轴承振动",
      result: "SCADA 末点 11.9mm/s",
      aiFlag: "danger",
      suggestion: {
        outcomeId: "OUT-CONFIRM",
        // 【诊断名与处置动作分成两层】Q&A 故事线第三步的输出是「疑似 X，置信度 Y%」，
        // 那是**诊断**；「建议 72h 内停机检查」是**处置**。第一版只有 label（处置动作），
        // 讲故事线时屏上指不到诊断名。
        //
        // ⚠️ 诊断名写「轴承磨损 / 润滑不良」而不是原文的「轴承内圈剥落」：
        // 后者是那份 Q&A 编的（连案例编号 CASE-2023-0417 都是编的）。真实依据是
        // Top-2 衡阳 P-2 的 2026-06 在线监测报告原文「轴承磨损，润滑不良」——
        // 同站同型号、形态最接近的那一条。宁可用真实措辞，也不用更耸动的编造措辞。
        diagnosis: "轴承磨损 / 润滑不良",
        diagnosisPrefix: "疑似",
        label: "建议结论：确认异常，转分级处置",
        // ★ 置信度不是拍的，是 caseHits.weighting 四项相乘：0.86×1.08×1.05×0.85 ≈ 0.83。
        // Q&A 的 Q1 专门追问"这数字怎么算出来的，别编个数据糊弄我"，
        // 所以它必须能在屏上被摊开、每一项都有 note。
        confidence: 83,
        text: "驱动端振动全程落在 ISO D 档（8.2~12.1mm/s），持续 7 分钟未回落，峰群达 12.1。"
            + "激光对中已实测调至合格（H 向 0.31 → -0.02mm）而振动未降，可排除联轴器不对中。"
            + "历史检索 Top-4 中同站同型号的衡阳 P-2 确诊为轴承磨损、润滑不良，形态最接近。"
            + "建议按分级方案处置：先降负荷 + 现场复测取油样，72 小时内决定是否停机拆检。",
        // 备选诊断。Q&A 的 Q2「你到底是确诊还是猜谜」问的就是它 ——
        // 屏上必须同时显示主备两个，而不是只给一个数糊过去。
        alternative: {
          diagnosis: "低流量长期偏离优先工作区",
          diagnosisPrefix: "备选",
          label: "备选：低流量长期偏离优先工作区",
          confidence: 61,
          text: "Top-1（长岭 P-01）的确诊根因。需核对本轮实际过泵流量是否落在 273~468m³/h "
              + "的优先工作区内；若长期偏低，则振动高位是工况问题而非轴承本体问题。"
              + "这一项现场可核，不需要停机。"
        }
      },
      evidence: [
        { kind: "series", stage: "ST-SERIES", label: "驱动端振动趋势",
          detail: "16:30-16:37，末点 11.9，全程 D 档", pointId: "VIB-DE" },
        { kind: "vision", stage: "ST-SERIES", label: "SCADA 原始截图",
          detail: "标题与量程可核对", frameId: "FRM-SCADA", boxId: "BX-PEAK" },
        { kind: "alignment", stage: "ST-VISION", label: "对中前后实测",
          detail: "0.31 → -0.02mm，已合格", alignmentId: "ALIGN-0722" },
        // 渗漏排除。Q&A 故事线第二步「视觉引擎确认泵体无渗漏」的落点，但如实标明
        // 这一项是现场目视、不是视觉模型 —— 本轮没有泵体近景照片可供模型识别。
        { kind: "vision", stage: "ST-VISION", label: "渗漏排除依据",
          detail: "库内典型形态对照 · 现场目视确认", frameId: "FRM-SEAL-REF", boxId: "BX-REF-DRIP" },
        { kind: "case", stage: "ST-RAG", label: "历史案例 Top-4",
          detail: "2 条机械类 / 2 条非机械类", caseHitId: "CASE-TOP4" },
        { kind: "rule", stage: "ST-RAG", label: "ISO 分级口径",
          detail: "D 档 ≥ 7.1", ruleId: "R-ISO" },
        { kind: "plan", stage: "ST-APP", label: "分级处置建议",
          detail: "立即 / 4h / 24h / 72h", planId: "PLAN-STAGED" }
      ]
    },
    {
      id: "REC-2", objectId: "OBJ-A", partId: "PART-COUPLING",
      no: "第 2 条", item: "联轴器对中偏差",
      result: "调整后 H 向 -0.02mm",
      aiFlag: "ok",
      suggestion: {
        outcomeId: "OUT-ARCHIVE",
        diagnosis: "对中已合格",
        diagnosisPrefix: "实测",
        label: "建议结论：按 AI 结论归档",
        confidence: 94,
        text: "激光对中仪实测：调整前 H 向 0.31mm、V 向 0.07mm；调整后 H 向 -0.02mm、V 向 0.02mm，"
            + "机脚垫片量 MF1 0.47→0.06、MF2 0.75→0.20，均已进入合格范围。"
            + "两张仪器屏幕照片可核对，「调整后」那张带相机水印 2026.07.22 16:31。"
            + "本项已闭环，可直接归档。",
        alternative: null
      },
      evidence: [
        { kind: "alignment", label: "对中前后实测", detail: "四项全部合格",
          alignmentId: "ALIGN-0722" },
        { kind: "vision", label: "调整前读数", detail: "H 向 0.31mm，落在视觉漏检区",
          frameId: "FRM-ALIGN-BEFORE", boxId: "BX-BEFORE-H" },
        { kind: "vision", label: "调整后读数", detail: "H 向 -0.02mm，带相机水印",
          frameId: "FRM-ALIGN-AFTER", boxId: "BX-AFTER-H" },
        { kind: "rule", label: "视觉能力边界", detail: "0.5mm 以下会漏检", ruleId: "R-VISION" }
      ]
    },
    {
      id: "REC-3", objectId: "OBJ-A", partId: "PART-BASE",
      no: "第 3 条", item: "站控振动阈值填报",
      result: "台账未填报",
      aiFlag: "warn",
      suggestion: {
        outcomeId: "OUT-SUPPLEMENT",
        diagnosis: "台账阈值缺项",
        diagnosisPrefix: "判定",
        label: "建议结论：补录台账后归档",
        confidence: 100,
        text: "本机组的振动报警值、联锁值、轴承温度与机械密封温度阈值在《湖南公司主输泵设备"
            + "维护保养信息表》中均为空 —— 全省 40 台皆然。缺这四个数的直接后果是："
            + "本轮只能用 ISO 行业分级判「劣」，无法判断是否已越过本机组的站控联锁值。"
            + "建议补录后归档，并纳入下一轮台账质量复查。",
        alternative: null
      },
      evidence: [
        { kind: "rule", label: "站控阈值与台账缺项", detail: "40 台全部未填",
          ruleId: "R-THRESHOLD" },
        { kind: "rule", label: "ISO 分级口径", detail: "缺站控值时的兜底口径", ruleId: "R-ISO" }
      ]
    },
    {
      id: "REC-4", objectId: "OBJ-B", partId: "PART-DE",
      no: "第 1 条", item: "驱动端轴承振动",
      result: "SCADA 末点 3.1mm/s",
      aiFlag: "ok",
      suggestion: {
        outcomeId: "OUT-ARCHIVE", label: "建议结论：按 AI 结论归档",
        diagnosis: "无异常", diagnosisPrefix: "判定",
        confidence: 90, text: "耒阳站 P-2 泵驱动端振动处于 ISO B 档，无异常。", alternative: null
      },
      evidence: [
        { kind: "rule", label: "ISO 分级口径", detail: "B 档 2.3~4.5", ruleId: "R-ISO" }
      ]
    }
  ];

  function rowsOf(objectId) {
    var Station = need("DOMAIN_STATION");
    return records.filter(function (r) { return r.objectId === objectId; }).map(function (r) {
      var part = Station.partById(r.partId);
      var sg = r.suggestion;
      return {
        id: r.id, no: r.no, partLabel: part.label, item: r.item, result: r.result,
        // 表上那一列：「疑似 轴承磨损 / 润滑不良 83%」。前缀区分"疑似/实测/判定"——
        // 同一列里既有推断也有实测结论，不标出来会让人以为都是 AI 猜的。
        diagnosisText: sg.diagnosisPrefix + " " + sg.diagnosis + " " + sg.confidence + "%",
        aiFlag: r.aiFlag, aiFlagText: aiFlagText[r.aiFlag]
      };
    });
  }

  function need(name) {
    if (!window[name]) throw new Error("[DOMAIN_RECORDS] 需要先加载 " + name);
    return window[name];
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

  function caseHitById(id) {
    if (!caseHits[id]) throw new Error("[DOMAIN_RECORDS] 未知案例检索：" + id);
    return caseHits[id];
  }

  function alignmentById(id) {
    if (!alignments[id]) throw new Error("[DOMAIN_RECORDS] 未知对中记录：" + id);
    return alignments[id];
  }

  function planById(id) {
    if (!plans[id]) throw new Error("[DOMAIN_RECORDS] 未知处置方案：" + id);
    return plans[id];
  }

  // ★ 把「置信度 = 四项加权相乘」钉死。Q&A 的 Q1 追问「这数字怎么算出来的，别编个数据
  // 糊弄我」—— 屏上会把四项摊开，那么摊开的四项相乘就必须等于卡上那个数。
  // 以后谁改了任一项，加载即炸，而不是让屏上出现「四项相乘 0.72，卡上写 83%」。
  function assertConfidence() {
    var w = caseHits["CASE-TOP4"].weighting;
    var product = w.reduce(function (acc, x) { return acc * x.value; }, 1);
    var shown = recordById("REC-1").suggestion.confidence;
    var expect = Math.round(product * 100);
    if (expect !== shown) {
      throw new Error("[DOMAIN_RECORDS] REC-1 置信度 " + shown + "% 与加权四项相乘 "
        + expect + "% 不一致（" + w.map(function (x) { return x.value; }).join(" × ") + "）");
    }
  }

  assertConfidence();

  return {
    columns: columns, aiFlagText: aiFlagText, records: records,
    stages: stages, stageById: stageById,
    rules: rules, caseHits: caseHits, alignments: alignments, plans: plans,
    rowsOf: rowsOf, recordById: recordById, ruleById: ruleById,
    caseHitById: caseHitById, alignmentById: alignmentById, planById: planById
  };
})();
