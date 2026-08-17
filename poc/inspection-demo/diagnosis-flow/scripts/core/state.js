// 应用状态：state 对象、normalize / load / save / reset，以及一组跨场景共享的只读
// 派生逻辑。
//
// ---- 两层结构 ----
//   state.focus  跨场景共享的"当前主体"（当前对象 / 部位）
//   state.pick   按场景命名空间隔离的"当前页面选中项"
//   state.review 复核决策，独立成第三块
//
// pick 按场景隔离不是为了好看：如果摊平成一个字段，"工作台选中的记录"和"知识库选中的
// 文档"就会共用同一个键，来回切场景互相冲掉对方的选中态。隔离之后这种冲突在结构上
// 不可能发生。
//
// ---- state 引用终生不变 ----
// state 对象只在这里创建一次，其它文件通过 window.AppState.value 拿到同一个引用并直接
// 读写属性；reset() 也只做属性级的清空重建（不整体替换引用），这样已经在模块顶层缓存
// 了 `var state = window.AppState.value` 的调用方永远不会拿到一份过期对象。
//
// ---- 两条清洗路径必须分开 ----
//   normalizeState()  处理从 localStorage 读出的候选状态 → 值不在字典里就退回默认，
//                     不抛错（磁盘数据可能来自旧版本、被手改过、或半次没写完）
//   运行期 select*()  处理刚发生的用户操作 → 值不在字典里直接抛错（那意味着代码有 bug
//                     或契约被破坏，悄悄退回默认值会把问题盖住）
// 两者都要做字典校验，但"校验不过怎么办"这一步必须分开写，不能糊成一个函数。
(function () {
  "use strict";

  var META = window.DOMAIN_META;
  var TAXONOMY = window.DOMAIN_TAXONOMY;
  var RECORDS = window.DOMAIN_RECORDS;
  var VISION = window.DOMAIN_VISION;
  var DIAGNOSIS = window.DOMAIN_DIAGNOSIS;
  var REVIEW = window.DOMAIN_REVIEW;
  var SERIES = window.DOMAIN_SERIES;
  var KB = window.DOMAIN_KB;
  if (!META || !TAXONOMY || !RECORDS || !VISION || !DIAGNOSIS || !REVIEW || !SERIES || !KB) {
    throw new Error("[AppState] 领域包未加载完整，请检查 index.html 里的 <script> 顺序");
  }

  // 结构一变就换 key、旧状态整体丢弃，不做半新半旧的字段级兼容——演示机上留一份
  // 半坏状态是最容易在现场翻车的东西。
  var STORAGE_KEY = "diagnosis-flow-v1-state";

  var SCENE_ORDER = META.scenes.map(function (scene) { return scene.key; });
  var DETAILS = ["", "trend", "vision"];
  var VOTES = REVIEW.votes.map(function (vote) { return vote.id; });

  // ---------------------------------------------------------------- 字典查找

  function findById(list, id) {
    var i;
    for (i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function mustFind(list, id, what) {
    var found = findById(list, id);
    if (!found) throw new Error("[AppState] 未知" + what + "：" + id);
    return found;
  }

  function objectById(id) { return mustFind(TAXONOMY.objects, id, "对象"); }
  function partById(id) { return mustFind(TAXONOMY.parts, id, "部位"); }
  function pointById(id) { return mustFind(TAXONOMY.points, id, "测点"); }
  function recordById(id) { return mustFind(RECORDS.records, id, "记录"); }
  function frameById(id) { return mustFind(VISION.frames, id, "关键帧"); }
  function outcomeById(id) { return mustFind(REVIEW.outcomes, id, "结论"); }
  function reviewerById(id) { return mustFind(META.reviewers, id, "复核人"); }

  // objectId 为 null 的部位表示"所有对象共用"。这是契约里的显式声明，不是兜底。
  function partsOf(objectId) {
    return TAXONOMY.parts.filter(function (part) {
      return part.objectId === null || part.objectId === objectId;
    });
  }

  function pointsOf(partId) {
    var list = TAXONOMY.points.filter(function (point) { return point.partId === partId; });
    // 主测点永远排第一：详情屏的"主图"和工作台的时序卡都取 [0]。
    list.sort(function (a, b) { return (a.primary ? 0 : 1) - (b.primary ? 0 : 1); });
    return list;
  }

  function primaryPoint(partId) {
    var list = pointsOf(partId);
    if (!list.length || !list[0].primary) {
      throw new Error("[AppState] 部位缺少 primary 测点：" + partId);
    }
    return list[0];
  }

  function framesOf(partId) {
    var order = { current: 0, compare: 1, link: 2 };
    return VISION.frames.filter(function (frame) { return frame.partId === partId; })
      .slice()
      .sort(function (a, b) { return order[a.role] - order[b.role]; });
  }

  function currentFrameOf(partId) {
    var list = framesOf(partId);
    if (!list.length || list[0].role !== "current") {
      throw new Error("[AppState] 部位缺少 role:current 的关键帧：" + partId);
    }
    return list[0];
  }

  function recordsOf(objectId) {
    return RECORDS.records.filter(function (record) { return record.objectId === objectId; });
  }

  function caseOfRecord(recordId) {
    var found = null;
    DIAGNOSIS.cases.forEach(function (item) {
      if (item.recordId === recordId) found = item;
    });
    return found;
  }

  // ---------------------------------------------------------------- 默认状态

  function defaultFields(outcomeId) {
    if (!outcomeId) return {};
    var outcome = outcomeById(outcomeId);
    var out = {};
    outcome.fields.forEach(function (fieldId) {
      var field = REVIEW.fields[fieldId];
      if (field.type === "checkbox") {
        out[fieldId] = field.options.filter(function (o) { return o.default; })
          .map(function (o) { return o.id; });
      } else {
        out[fieldId] = "";
      }
    });
    return out;
  }

  function defaultState() {
    return {
      scene: "workbench",
      detail: "",
      range: SERIES.ranges()[0].key,

      focus: {
        objectId: META.entry.objectId,
        partId: META.entry.partId
      },

      pick: {
        workbench: META.entry.recordId,
        trend: { pointId: null },
        vision: { frameId: null, zoomOpen: false },
        knowledge: { categoryId: null, docId: null, chunkIndex: null, ingestStep: 0, ingestOpen: false }
      },

      // freeText 是自由输入框里那句话。存进 state 而不是只留在 DOM 里，是因为对话区
      // 会被定点刷新重建，不存的话用户打的字会凭空消失。
      agent: { open: false, contextId: "", questionId: "", skillId: "", freeText: "", phase: "idle" },

      review: {
        reviewerId: META.defaultReviewerId,
        vote: "",
        outcomeId: "",
        fields: {},
        note: "",
        executed: false,
        retestPassed: null
      },

      archived: false,
      flowVisited: ["inspection"]
    };
  }

  // ---------------------------------------------------------------- 持久化

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      window.localStorage.removeItem(STORAGE_KEY);
      console.warn("Reset invalid diagnosis-flow state", err);
      return null;
    }
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------------------------------------------------------------- 清洗

  function has(list, id) {
    return list.some(function (item) { return item.id === id; });
  }

  function cleanFocus(raw) {
    var source = (raw && typeof raw === "object") ? raw : {};
    var objectId = has(TAXONOMY.objects, source.objectId) ? source.objectId : META.entry.objectId;
    // 部位字典必须是"该对象可见的部位"，不是全部部位——用更宽的字典正是 pump-demo
    // 那次"整页空白且刷新救不回来"的根因。
    var visible = partsOf(objectId);
    var partId = has(visible, source.partId) ? source.partId : META.entry.partId;
    return { objectId: objectId, partId: partId };
  }

  function cleanPick(raw, focus) {
    var source = (raw && typeof raw === "object") ? raw : {};

    var recordDict = recordsOf(focus.objectId);
    var workbench = has(recordDict, source.workbench) ? source.workbench : null;
    if (workbench === null) {
      workbench = recordDict.length ? recordDict[0].id : META.entry.recordId;
    }

    var trendSource = (source.trend && typeof source.trend === "object") ? source.trend : {};
    var partPoints = pointsOf(focus.partId);
    var pointId = has(partPoints, trendSource.pointId) ? trendSource.pointId : null;

    var visionSource = (source.vision && typeof source.vision === "object") ? source.vision : {};
    var partFrames = framesOf(focus.partId);
    var frameId = has(partFrames, visionSource.frameId) ? visionSource.frameId : null;

    var k = (source.knowledge && typeof source.knowledge === "object") ? source.knowledge : {};
    var categoryId = has(KB.categories(), k.categoryId) ? k.categoryId : null;
    var docId = has(KB.documents(), k.docId) ? k.docId : null;
    // chunkIndex 只有在 docId 合法时才有意义，且必须落在该文档的切分结果范围内。
    // 换了数据集之后正文变短、chunk 变少，旧的 chunkIndex 会越界。
    var chunkIndex = null;
    if (docId !== null && typeof k.chunkIndex === "number") {
      var count = KB.chunksOf(docId).length;
      if (k.chunkIndex >= 0 && k.chunkIndex < count && Math.floor(k.chunkIndex) === k.chunkIndex) {
        chunkIndex = k.chunkIndex;
      }
    }
    // 入库动画的"进行中"依赖一串定时器。刷新后定时器不会恢复，所以未完成状态不能
    // 持久化——只保留"未开始"和"已完成"两个端点。
    var steps = KB.ingestion().length;
    var ingestStep = 0;
    if (typeof k.ingestStep === "number" && k.ingestStep >= 0 && k.ingestStep <= steps
        && Math.floor(k.ingestStep) === k.ingestStep) {
      ingestStep = k.ingestStep;
    }
    if (ingestStep > 0 && ingestStep < steps) ingestStep = 0;

    return {
      workbench: workbench,
      trend: { pointId: pointId },
      vision: { frameId: frameId, zoomOpen: visionSource.zoomOpen === true },
      knowledge: {
        categoryId: categoryId,
        docId: docId,
        chunkIndex: chunkIndex,
        ingestStep: ingestStep,
        ingestOpen: k.ingestOpen === true && ingestStep === steps
      }
    };
  }

  function cleanAgent(raw) {
    var source = (raw && typeof raw === "object") ? raw : {};
    var contexts = window.DOMAIN_AGENTQA.contexts;
    var open = source.open === true;
    var contextId = has(contexts, source.contextId) ? source.contextId : "";
    var questionId = "";
    if (contextId) {
      var context = findById(contexts, contextId);
      if (has(context.questions, source.questionId)) questionId = source.questionId;
    }
    var skillId = "";
    if (contextId && questionId) {
      var question = findById(findById(contexts, contextId).questions, questionId);
      if (question && Array.isArray(question.skillOptions) && has(question.skillOptions, source.skillId)) {
        skillId = source.skillId;
      }
    }
    var freeText = typeof source.freeText === "string" ? source.freeText : "";
    if (!contextId) open = false;
    if (!open) { contextId = ""; questionId = ""; skillId = ""; freeText = ""; }
    // thinking 是一个由定时器推进的中间态，刷新后定时器不在了，落盘会卡在"检索中…"
    // 永不结束。只保留两个稳定端点。
    var phase = (questionId || freeText) ? "answered" : "idle";
    return { open: open, contextId: contextId, questionId: questionId, skillId: skillId, freeText: freeText, phase: phase };
  }

  function cleanReview(raw) {
    var source = (raw && typeof raw === "object") ? raw : {};
    var reviewerId = has(META.reviewers, source.reviewerId) ? source.reviewerId : META.defaultReviewerId;
    var vote = VOTES.indexOf(source.vote) >= 0 ? source.vote : "";
    var outcomeId = has(REVIEW.outcomes, source.outcomeId) ? source.outcomeId : "";

    var fields = defaultFields(outcomeId);
    if (outcomeId && source.fields && typeof source.fields === "object") {
      Object.keys(fields).forEach(function (fieldId) {
        var field = REVIEW.fields[fieldId];
        var value = source.fields[fieldId];
        if (field.type === "checkbox") {
          if (Array.isArray(value)) {
            fields[fieldId] = value.filter(function (id) { return has(field.options, id); });
          }
        } else if (typeof value === "string" && (value === "" || has(field.options, value))) {
          fields[fieldId] = value;
        }
      });
    }

    var note = typeof source.note === "string" ? source.note : "";
    var executed = source.executed === true && outcomeId !== "";
    var retestPassed = source.retestPassed;
    if (retestPassed !== true && retestPassed !== false) retestPassed = null;
    // 复测状态只有在"该结论确实有复测环节且已执行"时才有意义。
    if (!executed || !outcomeId || !outcomeById(outcomeId).retest.enable) retestPassed = null;

    return {
      reviewerId: reviewerId,
      vote: vote,
      outcomeId: outcomeId,
      fields: fields,
      note: note,
      executed: executed,
      retestPassed: retestPassed
    };
  }

  function normalizeState(candidate) {
    var clean = defaultState();
    Object.keys(clean).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) clean[key] = candidate[key];
    });

    if (SCENE_ORDER.indexOf(clean.scene) < 0) clean.scene = "workbench";
    if (DETAILS.indexOf(clean.detail) < 0) clean.detail = "";
    clean.range = SERIES.ranges().some(function (r) { return r.key === clean.range; })
      ? clean.range : SERIES.ranges()[0].key;

    clean.focus = cleanFocus(clean.focus);
    clean.pick = cleanPick(clean.pick, clean.focus);
    clean.agent = cleanAgent(clean.agent);
    clean.review = cleanReview(clean.review);
    clean.archived = clean.archived === true && clean.review.executed;

    // 子屏只属于工作台。持久化状态里 scene=knowledge 且 detail=trend 是一种"合法字段
    // 组合但语义矛盾"的脏状态，会让知识库页被时序子屏整屏盖住。
    if (clean.scene !== "workbench") clean.detail = "";

    clean.flowVisited = Array.isArray(clean.flowVisited)
      ? clean.flowVisited.filter(function (key) {
        return META.flowSteps.some(function (step) { return step.key === key; });
      })
      : ["inspection"];
    if (clean.flowVisited.indexOf("inspection") < 0) clean.flowVisited.unshift("inspection");
    markFlowForState(clean);

    if (!canOpenForState(clean.scene, clean)) clean.scene = "workbench";
    return clean;
  }

  // ---------------------------------------------------------------- 流程条

  function markFlowForState(target) {
    function mark(key) {
      if (target.flowVisited.indexOf(key) < 0) target.flowVisited.push(key);
    }
    if (target.detail === "trend") mark("trend");
    if (target.detail === "vision") mark("vision");
    if (target.agent.open) mark("agent");
    if (target.scene === "review" || target.review.outcomeId) mark("review");
    if (target.review.executed || target.archived) mark("archive");
  }

  function markFlowStep(stepKey) {
    if (!META.flowSteps.some(function (step) { return step.key === stepKey; })) {
      throw new Error("[AppState] 未知流程步骤：" + stepKey);
    }
    if (state.flowVisited.indexOf(stepKey) < 0) state.flowVisited.push(stepKey);
  }

  // ---------------------------------------------------------------- 派生量
  //
  // 下面这些一律现算、不落盘。落盘的派生量迟早会和源字段不同步，而且不同步时不报错。

  function currentObject() { return objectById(state.focus.objectId); }
  function currentPart() { return partById(state.focus.partId); }
  function currentRecord() { return recordById(state.pick.workbench); }

  // 当前记录对应的 AI 判断。契约保证 entry 记录一定有，其它记录可能没有——没有时
  // 返回 null 是合法状态（那条记录就是没有模型判读），场景层据此渲染空态。
  function currentCase() { return caseOfRecord(state.pick.workbench); }

  function currentReviewer() { return reviewerById(state.review.reviewerId); }

  function currentOutcome() {
    return state.review.outcomeId ? outcomeById(state.review.outcomeId) : null;
  }

  function suggestedOutcome() {
    var item = currentCase();
    return item ? outcomeById(item.suggestion.outcomeId) : null;
  }

  // 分歧 = 已选结论且与 AI 建议不同。没有 AI 判断时不存在分歧（无从比较）。
  function isDivergent() {
    var suggestion = suggestedOutcome();
    if (!suggestion || !state.review.outcomeId) return false;
    return state.review.outcomeId !== suggestion.id;
  }

  // 当前结论下还没填的必填项。返回字段 id 数组，空数组表示齐了。
  function missingFields() {
    var outcome = currentOutcome();
    if (!outcome) return [];
    return outcome.fields.filter(function (fieldId) {
      var field = REVIEW.fields[fieldId];
      if (!field.required) return false;
      var value = state.review.fields[fieldId];
      if (field.type === "checkbox") return !Array.isArray(value) || !value.length;
      return typeof value !== "string" || value === "";
    });
  }

  // 分歧时理由必填——这是"系统允许人推翻 AI，但要求人为推翻负责"的机械落点。
  function noteRequired() {
    return REVIEW.divergence.requireNote && isDivergent();
  }

  function canExecute() {
    if (!state.review.outcomeId) return false;
    if (missingFields().length) return false;
    if (noteRequired() && state.review.note.trim() === "") return false;
    return true;
  }

  function retestFailed() { return state.review.retestPassed === false; }

  function canOpenForState(sceneKey, target) {
    if (sceneKey === "archive") return target.review.executed === true;
    return SCENE_ORDER.indexOf(sceneKey) >= 0;
  }

  function canOpen(sceneKey) { return canOpenForState(sceneKey, state); }

  // 归档解锁复用 = 已归档 且 当前结论声明 unlocksReuse。二次命中包袱的唯一判据。
  function reuseUnlocked() {
    var outcome = currentOutcome();
    return state.archived && !!outcome && outcome.unlocksReuse;
  }

  function seriesOf(pointId) {
    return SERIES.series(state.focus.objectId, pointId, state.range);
  }

  function rangeLabel() {
    var match = SERIES.ranges().filter(function (r) { return r.key === state.range; })[0];
    if (!match) throw new Error("[AppState] 未知时间范围：" + state.range);
    return match.label;
  }

  // ---------------------------------------------------------------- 重置

  function resetState() {
    window.localStorage.removeItem(STORAGE_KEY);
    var fresh = defaultState();
    Object.keys(state).forEach(function (key) { delete state[key]; });
    Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
  }

  var state = normalizeState(loadState() || defaultState());

  // ---------------------------------------------------------------- 通用小件
  //
  // pageShell / panelTitle 因为要读 terms 和 state，放在这里而不是 core/dom.js
  // ——dom.js 严格早于本文件加载，不能反过来引用 state。

  function pageShell(kicker, title, action, body) {
    if (!action) throw new Error("pageShell 需要 action 元素：" + title);
    return h("section", { class: "scene-shell" }, [
      h("div", { class: "scene-head" }, [
        h("div", {}, [
          h("p", { class: "kicker", text: kicker }),
          h("h2", { text: title })
        ]),
        action
      ]),
      body
    ]);
  }

  function panelTitle(title, meta) {
    return h("div", { class: "panel-title" }, [
      h("span", { text: title }),
      h("small", { text: meta })
    ]);
  }

  window.AppState = {
    value: state,
    STORAGE_KEY: STORAGE_KEY,
    sceneOrder: SCENE_ORDER,
    save: saveState,
    reset: resetState,
    normalizeForTest: normalizeState,
    defaultStateForTest: defaultState,
    defaultFields: defaultFields,
    markFlowStep: markFlowStep,

    objectById: objectById,
    partById: partById,
    pointById: pointById,
    recordById: recordById,
    frameById: frameById,
    outcomeById: outcomeById,
    reviewerById: reviewerById,

    partsOf: partsOf,
    pointsOf: pointsOf,
    primaryPoint: primaryPoint,
    framesOf: framesOf,
    currentFrameOf: currentFrameOf,
    recordsOf: recordsOf,
    caseOfRecord: caseOfRecord,

    currentObject: currentObject,
    currentPart: currentPart,
    currentRecord: currentRecord,
    currentCase: currentCase,
    currentReviewer: currentReviewer,
    currentOutcome: currentOutcome,
    suggestedOutcome: suggestedOutcome,

    isDivergent: isDivergent,
    missingFields: missingFields,
    noteRequired: noteRequired,
    canExecute: canExecute,
    retestFailed: retestFailed,
    canOpen: canOpen,
    reuseUnlocked: reuseUnlocked,

    seriesOf: seriesOf,
    rangeLabel: rangeLabel,

    pageShell: pageShell,
    panelTitle: panelTitle
  };
})();
