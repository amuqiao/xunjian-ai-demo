// 静态 Agent 问答数据：页面只引用这份确定性数据，不接真实检索、不反查知识库文档。
window.DemoAgentQa = {
  dialogs: [
    {
      id: "workbench-agent",
      title: "诊断工作台 Agent 辅助问答",
      kicker: "诊断依据解释",
      summary: "围绕 P-1 疑似不对中事件，解释模型证据、现场复核重点和闭环边界。",
      entryTitle: "AI 辅助问答",
      entryText: "通过弹窗问答解释为什么判断为疑似不对中、现场优先看什么、归档后如何复用。",
      emptyText: "请选择一个预设问题查看回答。",
      questions: [
        {
          id: "why-misalign",
          label: "为什么判断为疑似不对中？",
          answer: "P-1 联轴器两侧相位差抬升至关注区，同时泵驱动端振动超过关注线，2X 频谱成分突出，并伴随基础振动偏大。以上证据组合支持进入疑似不对中复核，但不能替代专家最终确认。",
          hits: [
            { kind: "rule", text: "不对中诊断专家规则" },
            { kind: "report", text: "长岭站 P-1 运行状态监测报告" },
            { kind: "current", text: "P-1 联轴器相位差与振动趋势" }
          ]
        },
        {
          id: "what-recheck",
          label: "现场复核优先看什么？",
          answer: "优先复核联轴器对中状态、激光对中读数、泵驱动端轴承振动、底座地脚螺栓和管道约束。复核结果应与停机前趋势、频谱和现场照片一起进入专家确认。",
          hits: [
            { kind: "workcard", text: "输油泵对中作业标准模板卡" },
            { kind: "rule", text: "不对中诊断专家规则" },
            { kind: "current", text: "现场复核清单" }
          ]
        },
        {
          id: "can-auto-close",
          label: "能否直接生成维修结论？",
          answer: "不能。当前页面展示的是演示用的组织化证据和建议，Agent 只辅助整理依据。是否确认不对中、继续观察或排除误报，必须由专家结合现场复测和业务边界决定。",
          hits: [
            { kind: "rule", text: "专家复核边界口径" },
            { kind: "report", text: "维修报告六段式模板" }
          ]
        },
        {
          id: "how-reuse",
          label: "归档后如何复用？",
          answer: "如果专家确认并完成处置，P-1 的证据标签、处置步骤、复测结果和报告结构会沉淀为案例。后续 P-2 出现相似标签时，只能复用复核路径和处置清单，不能直接沿用 P-1 的维修结论。",
          hits: [
            { kind: "case", text: "CASE-CL-P1-ALIGN-001" },
            { kind: "workcard", text: "输油泵对中作业标准模板卡" },
            { kind: "report", text: "P-1 不对中诊断与处置报告" }
          ]
        }
      ]
    },
    {
      id: "knowledge-agent",
      title: "知识库 Agent 辅助问答",
      kicker: "知识命中说明",
      summary: "围绕知识库里的制度规范、指标口径、作业模板和归档案例，展示静态问答与命中标签。",
      entryTitle: "Agent 问答模拟",
      entryText: "点击打开弹窗，查看预设问题如何命中知识库里的静态材料标签。",
      emptyText: "请选择一个知识库预设问题查看回答。",
      questions: [
        {
          id: "align-standard",
          label: "对中作业的标准工序是什么？",
          answer: "对中复核分为停机前准备、激光对中仪安装、读数复核与调整、复测验收四个阶段。任一阶段缺失，都不能判定对中作业完成。",
          hits: [
            { kind: "workcard", text: "输油泵对中作业标准模板卡" },
            { kind: "standard", text: "检修安全隔离规程" }
          ]
        },
        {
          id: "misalign-rule",
          label: "如何判断联轴器疑似不对中？",
          answer: "核心依据是相位差持续抬升并接近或超过关注线，同时 2X 倍频成分明显突出。泵驱动端轴承振动和基础振动偏大属于并发证据，可提高关注等级，但不能单独定性。",
          hits: [
            { kind: "rule", text: "不对中诊断专家规则" },
            { kind: "metric", text: "联轴器相位差分级口径" },
            { kind: "metric", text: "主输泵振动阈值解释" }
          ]
        },
        {
          id: "p1-retest",
          label: "P-1 处置后的复测结果是什么？",
          answer: "演示口径下，P-1 完成对中调整后，泵驱动端振动由 5.82 mm/s 回落至 1.80 mm/s，联轴器相位差由 -81.06 度收敛至 -12.4 度，满足复测验收口径。",
          hits: [
            { kind: "case", text: "长岭站 P-1 输油泵不对中诊断与处置报告" },
            { kind: "report", text: "维修报告六段式模板" }
          ]
        },
        {
          id: "rule-boundary",
          label: "命中规则后能否直接维修？",
          answer: "不能。知识命中只说明相关材料和证据标签被组织出来，维修结论仍需专家复核、停机窗口确认和现场复测支撑。",
          hits: [
            { kind: "rule", text: "不对中诊断专家规则" },
            { kind: "standard", text: "专家复核流程边界" }
          ]
        }
      ]
    },
    {
      id: "archive-case-agent",
      title: "历史案例 Agent 辅助问答",
      kicker: "案例复用说明",
      summary: "围绕已归档 P-1 案例，解释 P-2 相似异常可以复用什么、不能复用什么。",
      entryTitle: "二次 Agent 命中预览",
      entryText: "查看 P-2 命中 P-1 归档案例后的复用建议。",
      emptyText: "请选择一个案例复用问题查看回答。",
      questions: [
        {
          id: "why-similar",
          label: "P-2 和 P-1 为什么相似？",
          answer: "两者都出现 2X 频谱突出、相位差异常和基础振动偏大的组合标签，并且对象同为长岭站主输泵机组。相似只代表复核路径可参考，不代表结论可以直接继承。",
          hits: [
            { kind: "case", text: "CASE-CL-P1-ALIGN-001" },
            { kind: "rule", text: "不对中诊断专家规则" }
          ]
        },
        {
          id: "what-reuse",
          label: "哪些经验可以复用？",
          answer: "可以复用对中作业模板卡、复测指标清单、现场照片要求、报告结构和案例标签。P-2 是否停机、是否调整地脚垫片，仍需依据本轮复核确认。",
          hits: [
            { kind: "workcard", text: "输油泵对中作业标准模板卡" },
            { kind: "report", text: "P-1 对中处置复测报告" }
          ]
        }
      ]
    },
    {
      id: "archive-record-agent",
      title: "归档记录 Agent 辅助问答",
      kicker: "非维修闭环说明",
      summary: "解释观察记录或误报反馈为什么不触发 P-2 维修案例命中。",
      entryTitle: "归档记录问答",
      entryText: "查看非维修闭环记录的后续使用边界。",
      emptyText: "请选择一个归档记录问题查看回答。",
      questions: [
        {
          id: "why-no-case",
          label: "为什么不触发维修案例命中？",
          answer: "本轮归档对象是观察记录或误报反馈样本，不是维修处置案例。它可以解释当时为什么未进入维修路径，但不能作为 P-2 的相似维修案例来源。",
          hits: [
            { kind: "report", text: "观察记录样本" },
            { kind: "rule", text: "模型阈值反馈" }
          ]
        },
        {
          id: "how-use",
          label: "后续如何使用这类记录？",
          answer: "观察记录用于复评趋势窗口和异常边界，误报反馈用于模型阈值、样本标签和规则触发边界说明。二者都不生成处置票卡。",
          hits: [
            { kind: "standard", text: "48h 趋势复评窗口" },
            { kind: "report", text: "误报反馈样本记录" }
          ]
        }
      ]
    }
  ]
};
