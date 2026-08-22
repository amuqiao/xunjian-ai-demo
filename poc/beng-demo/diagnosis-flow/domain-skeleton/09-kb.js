// 领域契约 09：知识库。
//
// 这一页负责文档索引、上传入库动画、Agent 问答。文档 id 沿用既有契约，便于其他
// 场景继续跳转；文档标题、正文和问答内容已切换为输油泵 15 类典型故障知识。
window.DOMAIN_KB = (function () {
  "use strict";

  var DATA = {
    categories: [
      { id: "cat-std", title: "故障规则", desc: "输油泵故障现象、组合特征和专家复核边界。" },
      { id: "cat-metric", title: "指标口径", desc: "温度、压力、振动、流量和润滑油状态解释。" },
      { id: "cat-card", title: "复核票卡", desc: "机械密封、联轴器、冲洗冷却、润滑和紧固复核票卡。" },
      { id: "cat-case", title: "归档案例", desc: "叶轮损伤、运行状态监测报告和相似故障复用样本。" }
    ],

    documents: [
      {
        id: "DOC-STD",
        categoryId: "cat-std",
        title: "输油泵典型故障诊断规则",
        type: "故障规则",
        summary: "覆盖机组异常振动、汽蚀、专家复核边界和运行状态报告引用口径。",
        source: "输油泵机组运行状态监测报告2026年5月/6月-湖南公司；演示构造",
        updatedAt: "2026-08-22",
        body: [
          "输油泵机组异常振动。原因：泵运行工况偏离额定工况（尤其是小流量工况），产生较大的流体脉动激振力，激励管道及泵体振动；或泵机组对中不良、转子动平衡不合格等机械因素引发振动。",
          "复核要求：异常振动应同步核对流量工况、管道支撑、泵机组对中、转子动平衡和历史趋势，避免只凭单点振动值下结论。",
          "输油泵汽蚀（泵内异响、振动加剧、扬程下降）。原因：泵入口压力低于介质在该温度下的饱和蒸汽压，或入口管路阻力过大、过滤器堵塞导致有效汽蚀余量不足。",
          "运行状态报告口径：输油泵故障诊断报告可沉淀故障现象、原因研判、现场复核项和处置建议，但不能替代当次现场复测和专家确认。",
          "专家复核边界：Agent 只组织告警、视觉和知识库依据；是否采纳、修正、驳回或生成处置票卡，需要人工复核确认停机窗口、安全措施和现场作业条件。"
        ]
      },
      {
        id: "DOC-CARD",
        categoryId: "cat-card",
        title: "联轴器与基础紧固复核票卡",
        type: "复核票卡",
        summary: "用于复核联轴器对中、热膨胀补偿和泵体与底座连接螺栓状态。",
        source: "输油泵联轴器与基础紧固复核作业卡；演示构造",
        updatedAt: "2026-08-22",
        body: [
          "联轴器对中不良或选型不当。原因：泵与电机安装对中精度不足，运行时产生附加振动和轴向窜动；或联轴器选型无法有效补偿热膨胀等因素引起的对中偏差。",
          "输油泵泵体与底座连接螺栓松动或断裂。原因：长期振动导致螺纹连接自松；基础灌浆不实或地脚螺栓预紧力不均匀；运行温度变化引起热胀冷缩交替作用。",
          "复核记录：现场应记录冷态对中值、热态工况、轴向窜动、联轴器型号、螺栓力矩、灌浆层状态和底座接触面状态。"
        ]
      },
      {
        id: "DOC-METRIC",
        categoryId: "cat-metric",
        title: "输油泵运行指标摘要",
        type: "指标口径",
        summary: "摘要说明温度、压力、振动、流量和润滑油状态用于故障复核；本演示保留为摘要文档，不参与 chunk 切分。",
        source: "输油泵机组运行状态监测报告2026年5月/6月-湖南公司",
        updatedAt: "2026-08-22",
        body: null
      },
      {
        id: "DOC-CASE",
        categoryId: "cat-case",
        title: "输油泵故障诊断与运行状态监测归档报告",
        type: "归档案例",
        summary: "演示归档报告样本，覆盖 15 类输油泵典型故障问答和复用边界。",
        source: "国家管网集团湖南公司输油泵机组运行状态监测报告；本演示归档案例",
        updatedAt: "2026-08-22",
        body: [
          "输油泵机械密封密封不严、泄漏。原因：泵壳密封安装面与轴线的垂直度严重超差，导致动环组件承受异常应力，引发驱动槽磨损与弹簧卡滞；或介质含杂质、泥砂堆积在密封动环内部，使动环失去补偿能力；或冲洗冷却管路存在气阻，导致密封腔温度升高、动静环热变形。",
          "输油泵出口压力频繁波动。原因：上游来料不稳定或储罐液位波动；泵入口滤网部分堵塞导致供液不均；调节阀动作迟缓或PID参数设置不当。",
          "报告结论：运行状态监测报告应汇总故障现象、原因链路、现场复核项、专家结论和复测结果，作为后续相似工单的证据组织参考。",
          "复用边界：归档报告可用于相似故障的复核路径、工单步骤和报告结构参考，但不能直接替代当次现场复测和专家确认结论。"
        ]
      },
      {
        id: "DOC-SEAL-CARD",
        categoryId: "cat-card",
        title: "机械密封、冲洗冷却与填料函复核票卡",
        type: "复核票卡",
        summary: "用于机械密封泄漏、冲洗冷却堵塞和非机械密封填料函渗漏复核。",
        source: "机械密封冲洗冷却复核卡；输油泵轴封复核作业卡",
        updatedAt: "2026-08-22",
        body: [
          "输油泵机械密封密封不严、泄漏。原因：泵壳密封安装面与轴线的垂直度严重超差，导致动环组件承受异常应力，引发驱动槽磨损与弹簧卡滞；或介质含杂质、泥砂堆积在密封动环内部，使动环失去补偿能力；或冲洗冷却管路存在气阻，导致密封腔温度升高、动静环热变形。",
          "冲洗冷却管路或节流孔板堵塞。原因：油品中的杂质在冲洗管路或节流孔板处沉积，导致冷却润滑油流量减少，密封腔温度升高。",
          "输油泵轴封处填料函渗漏增大。原因：填料压盖螺栓松动或压紧力不均匀；填料老化磨损失去弹性；轴套磨损导致径向间隙增大。"
        ]
      },
      {
        id: "DOC-BEARING-CARD",
        categoryId: "cat-card",
        title: "轴承与润滑油系统复核票卡",
        type: "复核票卡",
        summary: "用于轴承损坏、润滑油温过高和润滑油压过低复核。",
        source: "泵机组润滑油系统复核作业卡；输油泵机组运行状态监测指标说明",
        updatedAt: "2026-08-22",
        body: [
          "输油泵轴承损坏。原因：轴承长期承受轴向力不平衡（如叶轮设计或安装问题导致）、润滑不良（润滑油变质或泄漏）、轴颈材质或加工工艺缺陷。",
          "输油泵润滑油系统油温过高。原因：润滑油冷却器冷却水流量不足或冷却水温度偏高；润滑油油位过低导致循环量减少；轴承摩擦发热加剧。",
          "输油泵润滑油系统油压过低。原因：润滑油过滤器堵塞；油泵磨损内泄增大；润滑油管路接头松动造成泄漏；油品粘度下降（如混入轻组分）。"
        ]
      },
      {
        id: "DOC-BEARING-SPALL-CASE",
        categoryId: "cat-case",
        title: "叶轮磨损、腐蚀或破损案例",
        type: "归档案例",
        summary: "归纳叶轮冲刷磨损、介质腐蚀、叶片断裂以及由磨损引起的出力不足链路。",
        source: "输油泵机组运行状态监测报告抽取 + 演示构造",
        updatedAt: "2026-08-22",
        body: [
          "叶轮磨损、腐蚀或破损。原因：输送介质中含有硬质颗粒杂质，对叶轮表面造成冲刷磨损；或介质腐蚀性导致叶轮材质损伤；严重时叶片破损断裂。",
          "叶轮与轴承关联排查：轴向力不平衡、叶轮设计或安装问题可能加重轴承承载异常，需结合轴承温度、振动和拆检结果确认。",
          "叶轮入口被杂物部分堵塞、叶轮与泵壳间隙因磨损增大导致内泄漏时，输油泵可能出现流量低于设计值或出力不足。"
        ]
      },
      {
        id: "DOC-BEARING-IMS-CARD",
        categoryId: "cat-card",
        title: "电机过载与流量不足复核票卡",
        type: "复核票卡",
        summary: "用于复核运行电流持续偏高、出口压力异常、泵内摩擦和出力不足。",
        source: "输油泵电机与出力复核作业卡；演示构造",
        updatedAt: "2026-08-22",
        body: [
          "输油泵电机过载（运行电流持续偏高）。原因：介质密度或粘度超出设计值；或泵内叶轮与泵壳间隙过小产生摩擦；或出口压力异常升高导致轴功率增大。",
          "输油泵流量低于设计值（出力不足）。原因：叶轮入口被杂物部分堵塞；叶轮与泵壳间隙因磨损增大，内泄漏量增加；泵转速因变频器或原动机故障未达到额定值；出口管线阀门未全开或管径偏小。",
          "复核动作：现场应核对电流、出口压力、介质密度粘度、叶轮间隙、变频器转速、出口阀位和管线阻力，确认是否需要停机检查。"
        ]
      },
      {
        id: "DOC-CAVITATION-RULE",
        categoryId: "cat-std",
        title: "管道振动、汽蚀与出口压力波动复核说明",
        type: "故障规则",
        summary: "用于泵进出口管道振动、汽蚀、出口压力波动和工况扰动复核。",
        source: "SY/T 6695-2024 成品油管道运行规范；输油泵运行维护规程",
        updatedAt: "2026-08-22",
        body: [
          "泵进出口管道振动。原因：泵产生的流体脉动压力通过管道传递，当脉动频率与管道固有频率接近时引发共振；或管道弯头、变径等阻流元件导致流体冲击振动。",
          "输油泵汽蚀（泵内异响、振动加剧、扬程下降）。原因：泵入口压力低于介质在该温度下的饱和蒸汽压，或入口管路阻力过大、过滤器堵塞导致有效汽蚀余量不足。",
          "输油泵出口压力频繁波动。原因：上游来料不稳定或储罐液位波动；泵入口滤网部分堵塞导致供液不均；调节阀动作迟缓或PID参数设置不当。"
        ]
      }
    ],

    qaPresets: [
      {
        id: "QA-1",
        question: "填料函渗漏为什么增大？",
        answer: "原因：填料压盖螺栓松动或压紧力不均匀；填料老化磨损失去弹性；轴套磨损导致径向间隙增大。",
        citations: [{ docId: "DOC-SEAL-CARD", hintChunks: [2] }]
      },
      {
        id: "QA-2",
        question: "润滑油温为什么过高？",
        answer: "原因：润滑油冷却器冷却水流量不足或冷却水温度偏高；润滑油油位过低导致循环量减少；轴承摩擦发热加剧。",
        citations: [{ docId: "DOC-BEARING-CARD", hintChunks: [1] }]
      },
      {
        id: "QA-3",
        question: "润滑油压为什么过低？",
        answer: "原因：润滑油过滤器堵塞；油泵磨损内泄增大；润滑油管路接头松动造成泄漏；油品粘度下降（如混入轻组分）。",
        citations: [{ docId: "DOC-BEARING-CARD", hintChunks: [2] }]
      },
      {
        id: "QA-4",
        question: "连接螺栓为什么会松断？",
        answer: "原因：长期振动导致螺纹连接自松；基础灌浆不实或地脚螺栓预紧力不均匀；运行温度变化引起热胀冷缩交替作用。",
        citations: [{ docId: "DOC-CARD", hintChunks: [1] }]
      },
      {
        id: "QA-5",
        question: "流量为什么低于设计值？",
        answer: "原因：叶轮入口被杂物部分堵塞；叶轮与泵壳间隙因磨损增大，内泄漏量增加；泵转速因变频器或原动机故障未达到额定值；出口管线阀门未全开或管径偏小。",
        citations: [
          { docId: "DOC-BEARING-IMS-CARD", hintChunks: [1] },
          { docId: "DOC-BEARING-SPALL-CASE", hintChunks: [2] }
        ]
      }
    ],

    ingestion: [
      { key: "upload", label: "上传", desc: "输油泵运行状态监测报告进入待解析队列", ms: 700 },
      { key: "parse", label: "解析", desc: "抽取 15 类故障现象、原因和复核条目", ms: 700 },
      { key: "chunk", label: "切分", desc: "按故障问题和票卡段落生成 chunk", ms: 700 },
      { key: "embed", label: "向量化", desc: "生成输油泵故障知识检索向量", ms: 700 },
      { key: "index", label: "入库", desc: "写入输油泵智能运维知识索引", ms: 700 },
      { key: "search", label: "可检索", desc: "Agent 可引用故障规则、票卡和归档报告", ms: 700 }
    ],

    ingestDemoDocId: "DOC-SEAL-CARD",
    archiveTarget: { categoryId: "cat-case" }
  };

  function document(docId) {
    var i;
    for (i = 0; i < DATA.documents.length; i += 1) {
      if (DATA.documents[i].id === docId) return DATA.documents[i];
    }
    throw new Error("[DOMAIN_KB] 未知文档：" + docId);
  }

  function chunksOf(docId) {
    var doc = document(docId);
    if (!doc.body) return [];
    return doc.body.map(function (text, index) {
      return { index: index, text: text };
    });
  }

  function qaPreset(presetId) {
    var i;
    for (i = 0; i < DATA.qaPresets.length; i += 1) {
      if (DATA.qaPresets[i].id === presetId) return DATA.qaPresets[i];
    }
    throw new Error("[DOMAIN_KB] 未知问答预设：" + presetId);
  }

  function retrieve(presetId) {
    var preset = qaPreset(presetId);
    var hits = [];
    preset.citations.forEach(function (citation) {
      var chunks = chunksOf(citation.docId);
      citation.hintChunks.forEach(function (chunkIndex) {
        hits.push({
          docId: citation.docId,
          chunkIndex: chunkIndex,
          text: chunks[chunkIndex].text,
          score: 0.8 + 0.02 * chunkIndex
        });
      });
    });
    return { presetId: presetId, hits: hits };
  }

  return {
    categories: function () { return DATA.categories; },
    documents: function (categoryId) {
      if (categoryId === undefined) return DATA.documents;
      return DATA.documents.filter(function (doc) { return doc.categoryId === categoryId; });
    },
    document: document,
    chunksOf: chunksOf,
    qaPresets: function () { return DATA.qaPresets; },
    qaPreset: qaPreset,
    retrieve: retrieve,
    ingestion: function () { return DATA.ingestion; },
    ingestDemoDocId: function () { return DATA.ingestDemoDocId; },
    archiveTarget: function () { return DATA.archiveTarget; },
    raw: DATA
  };
})();
