// 领域契约 07：知识库资产 + Agent 语料。
//
// 【职责收窄为三件事】文档索引、入库动画、Agent 问答。**不画任何关系图或节点连线**
// —— 文档之间的关系可视化由独立的知识图谱 POC（kg-template）承担，本页不放图谱入口。
//
// 【归档进来的那一篇】assets[0] 是本轮复核报告的占位：archived 为 false 时它显示
// 「等待人工复核确认」且不可检索，归档后变成可检索资产、Agent 能命中它。这是把归档
// 和知识库真正缝上的那一针，也是「二次命中」包袱的落点。
window.DOMAIN_KB = (function () {
  "use strict";

  // 四类资产。count 不手写 —— 由 assets 现算（见 categories()），避免「分类说 3 篇、
  // 列表里 2 篇」这种只能靠肉眼发现的错配。
  var categoryDefs = [
    { id: "CAT-CASE", label: "归档案例", note: "复核后自动进入" },
    { id: "CAT-SPEC", label: "操作规程", note: "PDF / 作业指导书" },
    { id: "CAT-FLOW", label: "管理流程", note: "巡检闭环与作业计划" },
    { id: "CAT-LEDGER", label: "设备台账", note: "仪表与联锁口径" }
  ];

  var assets = [
    {
      id: "DOC-CASE", categoryId: "CAT-CASE",
      title: "巡检智能复核报告 · 长郴-湘潭站 P-4 泵棚",
      // pending：等归档。归档动作把它翻成 indexed。
      state: "pending",
      source: "本轮人工复核归档生成",
      tags: ["报告归档", "专家确认", "可追溯"],
      chunks: [
        "AI 复核结论：就地表与 SCADA 趋势一致，均已越过高报警 9.0MPa。",
        "人工复核意见：由复核页文本框原文写入。",
        "归档标签：巡检对象 / 部位 / 复核结论 / 案例编号。"
      ]
    },
    {
      // 业务方给的第 1 条高频问答落成一篇**历史**案例。它和本轮 REC-3（1DP 柜表计
      // 无显示）是同一种失效：表计不显示 → 查二次回路 → 根因在接线松动。有了它，
      // REC-3 的「纳入下轮复查」才不是凭空的谨慎，而是有前例的处置路径。
      id: "DOC-CASE-HV", categoryId: "CAT-CASE",
      title: "案例 · 湘潭站 P6 泵高压柜表计无显示（2026-04-24）",
      state: "indexed",
      source: "业务方提供 / 生产运维巡检问题提醒",
      tags: ["配电室", "二次回路", "已闭环"],
      chunks: [
        "现象：巡检发现 P6 泵高压柜开关柜上表计及测显装置无显示。",
        "同步报警：微机综保系统「控制回路断线」报警动作。",
        "排查：断开核查发现高压柜内二次回路控制电源空开跳闸。",
        "根因与处置：操作柱接线松动，重新压接紧固后表计恢复，已闭环。",
        "复用要点：表计无显示先查二次回路控制电源与操作柱接线，再判表计本体。"
      ]
    },
    {
      id: "DOC-INTERLOCK", categoryId: "CAT-LEDGER",
      title: "PT6903B 出口压力仪表联锁台账",
      state: "indexed",
      source: "设备台账 / 安全联锁值清单",
      tags: ["联锁值", "仪表台账", "引用依据"],
      chunks: [
        "PT6903B 出口管线压力：高报警 9.0MPa，高高报警 9.8MPa。",
        "高高报警触发安全联锁停泵；高报警仅提示核对，不联锁。",
        "就地表与 SCADA 读数须双向核对，差值超 0.2MPa 需报仪表专业。"
      ]
    },
    {
      id: "DOC-SPEC", categoryId: "CAT-SPEC",
      title: "压力表、差压表操作及维护规程",
      state: "indexed",
      source: "HN-SC-YK-GC-017-2025 操作规程及作业指导书",
      tags: ["操作规程", "现场复核", "可检索"],
      chunks: [
        "就地压力表读数应在量程的 1/3 至 2/3 区间，超出应校验。",
        "表盘模糊、指针卡滞、取压管渗漏为不合格，需报修更换。",
        "巡检记录须同时填写就地读数与站控显示值。"
      ]
    },
    {
      // 业务方给的第 3 条高频问答落成一篇作业计划。它把「监督者视角」补齐了 ——
      // 前面几篇回答「这一轮怎么判」，这一篇回答「下一轮该盯什么」。
      id: "DOC-PLAN", categoryId: "CAT-FLOW",
      title: "泵棚区检修作业计划与巡检加强项（7 月）",
      state: "indexed",
      source: "业务方提供 / 站场检修作业提醒",
      tags: ["检修作业", "巡检加强", "定向复查"],
      chunks: [
        "7 月 28 日 P-3 泵开展大修作业，作业前后各排一轮定向复查。",
        "检修窗口内巡检加强 6 项：泄漏检查、管线压力、温度、运行情况、油位、外观检查。",
        "同棚相邻机组的压力异常须在大修前处置完，不与检修工况混记。"
      ]
    },
    {
      id: "DOC-FLOW", categoryId: "CAT-FLOW",
      title: "巡检管理流程说明",
      state: "indexed",
      source: "巡检管理流程说明.docx / 业务场景重塑工作任务分解表",
      tags: ["巡检流程", "问题闭环", "AI 边界"],
      chunks: [
        "AI 只组织证据、给出建议，结论由专家确认后才能归档复用。",
        "记录缺项由视觉识别与表单比对产生，需补录后归档。",
        "已处置问题必须纳入下一轮复查并留痕。"
      ]
    }
  ];

  // 入库动画的 5 步。定时器驱动，纯预设，不做真实解析或向量化。
  var ingestSteps = [
    { key: "upload", label: "上传", detail: "读取本地文件并校验格式" },
    { key: "parse", label: "解析", detail: "抽取正文、表格与标题层级" },
    { key: "chunk", label: "切分", detail: "按标题与语义边界切成检索块" },
    { key: "embed", label: "向量化", detail: "生成检索向量并建立索引" },
    { key: "ready", label: "可检索", detail: "Agent 可在问答中引用该文档" }
  ];

  // Agent 语料。三页共用同一个组件，只换 contextId 取不同的预设问题
  // —— 组件本身不读领域数据（见 scripts/ui/agent.js）。
  var agentContexts = {
    workbench: {
      label: "诊断工作台",
      questions: [
        {
          id: "Q-WB-1", text: "这条异常 AI 是凭什么判的？",
          answer: "三条依据：①站控 SCADA 出口压力趋势末点 9.3MPa，已越过高报警 9.0MPa；②20:01:55 关键帧里就地压力表表盘可读，与 SCADA 一致；③设备台账声明高报仅提示、高高报 9.8MPa 才联锁。所以建议「确认异常，转处置」而不是直接停泵。",
          cites: ["DOC-INTERLOCK", "DOC-SPEC"]
        },
        {
          id: "Q-WB-2", text: "为什么第 107 项判成已闭环？",
          answer: "它的证据不是曲线，是同机位前后两帧：20:01:55 与 20:10:26 相隔 8 分 31 秒，泵体、护罩、基座与管线均无变化，地面无新增油迹。与人工填的「运行正常，无渗漏」一致，所以判已闭环。",
          cites: ["DOC-FLOW"]
        },
        {
          id: "Q-WB-3", text: "记录缺项是怎么发现的？",
          answer: "20:18:35 的 PLC 机房关键帧里识别到 SIS 机柜（一）在位且柜门关闭，但本轮表单 6 项巡检项中有 2 项未记录该柜。视觉识别与表单比对不一致，判为记录缺项。",
          cites: ["DOC-FLOW"]
        },
        {
          id: "Q-WB-4", text: "配电室表计无显示，上一次是什么原因？",
          answer: "站内有一条已闭环的同类案例。2026-04-24 湘潭站巡检发现 P6 泵高压柜开关柜上表计及测显装置无显示，微机综保同时报「控制回路断线」动作；断开核查后确认是高压柜内二次回路控制电源空开跳闸，根因为操作柱接线松动，重新压接紧固后恢复。\n本轮第 3 条「1DP 柜表计无显示」走的是同一条路径：二次回路控制电源空开 → 操作柱接线 → 表计本体，不要一上手就判表计损坏。",
          cites: ["DOC-CASE-HV"]
        }
      ]
    },
    review: {
      label: "人工复核",
      questions: [
        {
          id: "Q-RV-1", text: "我可以不采纳 AI 建议吗？",
          answer: "可以。选择与 AI 建议不同的结论会进入分歧态：复核意见变为必填，报告里会多出一段「复核分歧说明」，并作为反馈样本回流知识库。AI 只组织证据，结论由你确认。",
          cites: ["DOC-FLOW"]
        },
        {
          id: "Q-RV-2", text: "复核意见会进报告吗？",
          answer: "会，逐字进。你在文本框里写的内容会出现在报告第 2 页「三、人工复核意见」段落的正文里，与结论、复核人身份一起归档。",
          cites: []
        },
        {
          id: "Q-RV-3", text: "这条有同类案例可以沿用吗？",
          answer: "有。2026-04-24 P6 泵高压柜表计无显示那一条已闭环，根因是操作柱接线松动导致二次回路控制电源空开跳闸。它的复用价值在处置路径，不在结论本身 —— 你的复核意见若沿用「先查二次回路、再判表计本体」，归档后两篇就互为对照案例，下一轮同类异常能一次命中。",
          cites: ["DOC-CASE-HV"]
        }
      ]
    },
    knowledge: {
      label: "知识库",
      questions: [
        {
          id: "Q-KB-1", text: "压力表读数不合格怎么判？",
          answer: "按操作规程：读数应落在量程的 1/3 至 2/3 区间，超出需校验；表盘模糊、指针卡滞、取压管渗漏均为不合格，需报修更换。巡检记录须同时填写就地读数与站控显示值。",
          cites: ["DOC-SPEC"]
        },
        {
          id: "Q-KB-2", text: "9.3MPa 要不要停泵？",
          answer: "不需要。台账口径：PT6903B 出口管线压力高报警 9.0MPa 仅提示核对、不联锁；高高报警 9.8MPa 才触发安全联锁停泵。当前 9.3MPa 落在两者之间，应核对上下游工况后由人工确认。\n台账同时要求就地表与 SCADA 双向核对、差值超 0.2MPa 报仪表专业 —— 本轮两者一致，仪表本体不需要报修。",
          cites: ["DOC-INTERLOCK"]
        },
        {
          id: "Q-KB-3", text: "有没有本站的同类案例？",
          answer: "有 —— 本轮归档的复核报告已可检索，它记录了同一部位、同一表单项的一次完整「AI 建议 → 人工确认 → 归档」过程，可作为下次同类异常的对照案例。",
          cites: ["DOC-CASE"]
        },
        {
          id: "Q-KB-4", text: "泵棚区近期有检修作业要盯吗？",
          answer: "有。7 月 28 日同棚 P-3 泵开展大修作业，检修窗口内巡检要加强 6 项：泄漏检查、管线压力、温度、运行情况、油位、外观检查。建议作业前后各排一轮定向复查。\n本轮 P-4 泵棚的出口压力异常应在大修前处置完 —— 否则大修一开工，压力波动就分不清是本身的异常还是检修工况。",
          cites: ["DOC-PLAN"]
        }
      ]
    }
  };

  function categories(archived) {
    return categoryDefs.map(function (c) {
      var list = assets.filter(function (a) { return a.categoryId === c.id; });
      return {
        id: c.id, label: c.label, note: c.note,
        total: list.length,
        // 可检索数：归档前那篇报告不算，归档后算进来。
        indexed: list.filter(function (a) {
          return a.state === "indexed" || (a.id === "DOC-CASE" && archived);
        }).length
      };
    });
  }

  function assetById(id) {
    var found = assets.filter(function (a) { return a.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_KB] 未知资产：" + id);
    return found;
  }

  function contextOf(key) {
    if (!agentContexts[key]) throw new Error("[DOMAIN_KB] 未知 Agent 语境：" + key);
    return agentContexts[key];
  }

  return {
    categoryDefs: categoryDefs,
    assets: assets,
    ingestSteps: ingestSteps,
    agentContexts: agentContexts,
    categories: categories,
    assetById: assetById,
    contextOf: contextOf
  };
})();
