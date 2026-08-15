// UI 组件：AI 判断的依据链。
//
// 这是"AI+ 辅助判断"这句需求真正的落点。没有它，AI 卡就只是"一句结论 + 几个纯文本
// 标签"，观众看不出模型凭什么下这个结论；有了它，**AI 说的每一句都能当场翻到底稿**。
//
// 四类依据，点击行为按 kind 分发（分发在 boot.js 的 openEvidence）：
//   series → 打开时序详情子屏并选中该测点
//   vision → 打开视觉详情子屏并定位该帧
//   rule   → 就地展开规则卡（它是一段短文本，跳页的代价大于收益）
//   case   → 跳知识库并打开该文档
//
// locked 的语义是"归档后才解锁"，不是"永远不可点"。显示成锁态的条件是
// evidence.locked && !reuseUnlocked()——归档完成后同一枚芯片会亮起来，这就是二次
// 命中包袱的开关。
(function () {
  "use strict";

  var AppState = window.AppState;
  var DIAGNOSIS = window.DOMAIN_DIAGNOSIS;

  var KIND_META = {
    series: { icon: "📈", label: "时序" },
    vision: { icon: "👁", label: "视觉" },
    rule: { icon: "📋", label: "规则" },
    "case": { icon: "📚", label: "案例" }
  };

  function isLocked(evidence) {
    return evidence.kind === "case" && evidence.locked === true && !AppState.reuseUnlocked();
  }

  function chipDataset(evidence) {
    var data = { action: "open-evidence", evidenceKind: evidence.kind };
    if (evidence.kind === "series") data.pointId = evidence.pointId;
    if (evidence.kind === "vision") data.frameId = evidence.frameId;
    if (evidence.kind === "rule") data.ruleId = evidence.ruleId;
    if (evidence.kind === "case") data.docId = evidence.docId;
    data.evidenceLocked = isLocked(evidence) ? "true" : "false";
    data.focusKey = "evidence:" + evidence.kind;
    return data;
  }

  function renderChip(evidence) {
    var meta = KIND_META[evidence.kind];
    if (!meta) throw new Error("[EvidenceChain] 未知依据类型：" + evidence.kind);
    var locked = isLocked(evidence);
    return h("button", {
      type: "button",
      class: "ev-chip " + evidence.kind + (locked ? " locked" : ""),
      disabled: locked ? "disabled" : null,
      title: locked ? "完成报告归档后解锁" : "查看该依据",
      dataset: chipDataset(evidence)
    }, [
      h("span", { class: "ev-chip-icon", "aria-hidden": "true", text: locked ? "🔒" : meta.icon }),
      h("span", { class: "ev-chip-body" }, [
        h("small", { text: meta.label }),
        h("strong", { text: evidence.label })
      ]),
      h("span", { class: "ev-chip-detail", text: locked ? "未解锁" : evidence.detail })
    ]);
  }

  // 规则卡：默认收起，点 rule 芯片时由 boot.js 给它 toggle 一个 .open。它必须和芯片
  // 同时渲染出来（而不是点的时候才创建），否则 boot.js 找不到节点。
  function renderRuleCards(chain) {
    var ruleIds = chain.filter(function (e) { return e.kind === "rule"; })
      .map(function (e) { return e.ruleId; });
    if (!ruleIds.length) return null;
    return h("div", { class: "ev-rules" }, ruleIds.map(function (ruleId) {
      var rule = DIAGNOSIS.rules.filter(function (r) { return r.id === ruleId; })[0];
      if (!rule) throw new Error("[EvidenceChain] 未知规则：" + ruleId);
      return h("div", { class: "ev-rule-card", dataset: { ruleCard: ruleId } }, [
        h("strong", { text: rule.id + " " + rule.title }),
        h("p", { text: rule.text }),
        h("small", { text: rule.source })
      ]);
    }));
  }

  function render(diagnosisCase) {
    if (!diagnosisCase) throw new Error("EvidenceChain.render 需要一个 AI 判断对象");
    return h("div", { class: "ev-chain-wrap" }, [
      h("div", { class: "ev-chain", role: "group", "aria-label": "AI 判断依据链" },
        diagnosisCase.evidenceChain.map(renderChip)),
      renderRuleCards(diagnosisCase.evidenceChain)
    ]);
  }

  window.EvidenceChain = { render: render, isLocked: isLocked, KIND_META: KIND_META };
})();
