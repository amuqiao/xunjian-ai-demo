// UI 组件：置信度条。
//
// 它存在的理由不是好看，而是给下一页做叙事铺垫：置信度不足时 AI 自己就写着"建议
// 人工确认"，于是"为什么需要人工复核"这句话有了出处，而不是流程规定如此。
//
// band 由数据声明（05-diagnosis.js 的 confidenceBand），不由这里按数值现算——
// 分界值属于业务口径，写在渲染层意味着改口径要改代码。
(function () {
  "use strict";

  var BAND_TEXT = {
    high: { label: "高置信", status: "ok" },
    "needs-review": { label: "需人工确认", status: "warn" },
    insufficient: { label: "证据不足", status: "danger" }
  };

  function render(diagnosisCase) {
    if (!diagnosisCase) throw new Error("ConfidenceBar.render 需要一个 AI 判断对象");
    var band = BAND_TEXT[diagnosisCase.confidenceBand];
    if (!band) throw new Error("ConfidenceBar 未知 confidenceBand：" + diagnosisCase.confidenceBand);

    return h("div", { class: "confidence " + band.status }, [
      h("span", { class: "confidence-label", text: "置信度" }),
      h("div", {
        class: "confidence-track",
        role: "meter",
        "aria-valuenow": String(diagnosisCase.confidence),
        "aria-valuemin": "0",
        "aria-valuemax": "100",
        // 进度条不能只靠长度表达：读屏器和色盲用户拿到的是这句 aria-label。
        "aria-label": "置信度 " + diagnosisCase.confidence + "%，" + band.label
      }, [
        h("i", { style: "width:" + diagnosisCase.confidence + "%" })
      ]),
      h("strong", { class: "confidence-value", text: diagnosisCase.confidence + "%" }),
      h("span", { class: "confidence-band", text: band.label })
    ]);
  }

  window.ConfidenceBar = { render: render, BAND_TEXT: BAND_TEXT };
})();
