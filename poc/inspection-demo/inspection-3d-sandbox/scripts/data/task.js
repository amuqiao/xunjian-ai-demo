// window.DemoTask —— 巡检任务卡数据层。
//
// 本文件的「任务卡字段」全部照抄真实 App 截图，一个字都不编：巡检表名称、
// 超期徽标、计划/实际时间、巡检站场、巡检人、巡检区域完成度、三个 tab、
// 五个状态筛选、以及作为"其他任务"陈列的郴州输油站任务卡。
//
// ⚠️ 已知的一处口径缺口（如实记录，不是漏做）：原始需求里写的是"另外 App
// 里还有两条真实任务卡可作为其他任务陈列"，但给出的具体字段（表名/站场/
// 巡检人/时间/完成度/问题角标）只够拼出郴州输油站这一条。按"不擅自编造
// 事实"的约束，otherTasks() 只返回这一条真实数据，不臆造第二条未经核实的
// 任务卡凑数——如果确实需要第二条，需要先补充它的真实字段。
//
// 这里原先有一整段 issueDraft(areaId, itemId) 的字段规格说明（IMS 事件中心的
// 13 个字段、4 步流程条、以及"哪几个枚举取值是演示占位、哪几个是真实默认值"
// 的取证边界）。函数与说明一起在 2026-08-20 删除，删除理由见文件下方 issues()
// 后面那段决策记录。
//
// inspectorCandidates()/addInspector(name)（2026-08 新增，支撑 ActionBar「添加人员」
// 按钮）：候选姓名池**只从本文件已有的真实姓名字段现场收集去重**（TASK.inspector 与
// 全部 OTHER_TASKS[].inspector，两者都是真实 App 截图里逐字抄的逗号分隔多人格式），
// 不新编任何姓名、也不另维护一份姓名列表。当前得到 4 个真实姓名：
// 唐爱纯（主任务）、王泽宇、周理斌（郴州 08:00 那班）、金彪（郴州 04:00 那班）。
// 这个设计的收益是：补一条真实任务卡进 OTHER_TASKS，候选池自动变大——事实上
// 「金彪」就是这样补进来的（此前只编码了郴州 08:00 那一条，候选池只有 3 人）。
(function () {
  "use strict";

  // ---- 主任务卡：长沙输油站常规巡检表 ----
  // 2026-08-20：站名随地图一起从"广西支干线永州分输清管站"（天然气清管站）换成
  // 业务方平面图上的长沙输油站。日期/时刻/巡检人保持原样——那几个字段是从真实
  // App 截图逐字取证来的，换站名不构成换掉它们的理由。
  var TASK = {
    id: "task-changsha-20260804",
    formName: "长沙输油站常规巡检表",
    overdueBadge: "未超期",
    planStart: "2026-08-04 09:00:22",
    planEnd: "2026-08-05 09:00:22",
    actualStart: "2026-08-04 09:02:25",
    actualEnd: "2026-08-04 10:05:18",
    station: "长沙输油站",
    inspector: "唐爱纯",
    areaSummary: "共12个，已完成12个",
    areaDone: 12,
    areaTotal: 12,
    status: "已完成"
  };

  // ---- 三个 tab，当前态不做区分（App 里默认落在"巡检统计"）----
  var TABS = [
    { id: "stat", label: "巡检统计" },
    { id: "list", label: "巡检列表" },
    { id: "issue", label: "问题列表" }
  ];

  // ---- 五个状态筛选，当前态"已完成" ----
  var FILTERS = [
    { id: "all", label: "全部", active: false },
    { id: "pending", label: "待执行", active: false },
    { id: "running", label: "执行中", active: false },
    { id: "done", label: "已完成", active: true },
    { id: "cancelled", label: "已取消", active: false }
  ];

  // ---- 其他任务卡（只陈列，不可交互）----
  //
  // 两条都逐字抄自真实 App 截图
  // assets/data/日常巡检录屏截图/Screenshot_2026-08-05_at_12-22-48.png（巡检列表页）。
  // 第二条（金彪）在截图里被视频控件与屏幕边缘裁掉了一部分，所以 actualEnd / areaSummary /
  // issueBadge 三个字段**没有取证到**，这里显式写 null 而不是照第一条的样子编一个——
  // null 表达"截图里看不到"，编一个数字表达"我们知道它是多少"，两者不能混。
  var OTHER_TASKS = [
    {
      id: "task-chenzhou-20260804-am",
      formName: "郴州输油站常规巡检表",
      station: "长郴郴州站",
      inspector: "王泽宇,周理斌",
      planStart: "2026-08-04 08:00:36",
      planEnd: "2026-08-05 08:00:36",
      actualStart: "08:59:56",
      actualEnd: "10:26:37",
      areaSummary: "共8个，已完成8个",
      issueBadge: 2
    },
    {
      id: "task-chenzhou-20260804-early",
      formName: "郴州输油站常规巡检表",
      station: "长郴郴州站",
      inspector: "金彪",
      planStart: "2026-08-04 04:00:10",
      planEnd: "2026-08-05 04:00:10",
      actualStart: "04:39:04",
      actualEnd: null,
      areaSummary: null,
      issueBadge: null
    }
  ];

  // ---- 「添加人员」候选巡检人池：不新编姓名，只从本文件已有的两处真实姓名字段
  // （主任务卡 TASK.inspector + 其他任务卡 OTHER_TASKS[].inspector）里现场收集、去重。
  // 两处字段都是逗号分隔的多人格式（真实 App 的多人巡检就是这样显示），这里统一
  // split(",") 再摊平。不做大小写/空白归一化——真实姓名本来就不需要。
  function inspectorPool() {
    var seen = {};
    var pool = [];
    function collect(field) {
      field.split(",").forEach(function (name) {
        if (!seen[name]) {
          seen[name] = true;
          pool.push(name);
        }
      });
    }
    collect(TASK.inspector);
    OTHER_TASKS.forEach(function (t) { collect(t.inspector); });
    return pool;
  }

  // 「添加人员」弹层的候选名单：巡检人池里每个姓名标注是否已经在当前任务的
  // inspector 字段里（alreadyAssigned=true 时弹层要渲染成禁用行，不可重复添加）。
  function inspectorCandidates() {
    var assigned = TASK.inspector.split(",");
    return inspectorPool().map(function (name) {
      return { name: name, alreadyAssigned: assigned.indexOf(name) >= 0 };
    });
  }

  // 把候选姓名追加进当前任务的巡检人字段，逗号分隔（与真实 App 的多人巡检显示格式
  // 一致，不加空格、不用「、」）。只改内存里的 TASK 对象，不写 localStorage——与
  // boot.js 的巡检项读数改动同一条纪律：刷新页面即还原初始演示数据。
  // 校验：姓名必须在候选池里、不能是已经在列的姓名，否则直接抛错（不是一个"刚发生
  // 的真实交互"该有的静默失败）。
  function addInspector(name) {
    if (typeof name !== "string" || name === "") {
      throw new Error("addInspector 需要非空字符串姓名，实际为 " + name);
    }
    var pool = inspectorPool();
    if (pool.indexOf(name) < 0) {
      throw new Error("巡检人 " + name + " 不在真实候选名单（" + pool.join(",") + "）里，无法添加");
    }
    var assigned = TASK.inspector.split(",");
    if (assigned.indexOf(name) >= 0) {
      throw new Error("巡检人 " + name + " 已经在当前任务巡检人列表（" + TASK.inspector + "）里，不能重复添加");
    }
    assigned.push(name);
    TASK.inspector = assigned.join(",");
  }

  // urgency/eventLevel 演示取值表：按巡检项 status 映射，danger 比 warn 更紧急。
  // 这不是真实 IMS 枚举，见文件头注释。
  var URGENCY_BY_STATUS = { danger: "紧急", warn: "一般" };
  var EVENT_LEVEL_BY_STATUS = { danger: "较大", warn: "一般" };

  // targetType 演示取值表：按巡检项 discipline 映射，未知专业直接抛错（不做
  // 兜底默认值），因为 256 条真实数据的 discipline 取值范围是已知的、有限的。
  var TARGET_TYPE_BY_DISCIPLINE = {
    "机械专业": "设备设施",
    "电气专业": "电气设备",
    "仪表专业": "仪表设备",
    "工艺专业": "工艺管道"
  };

  function findItem(areaId, itemId) {
    var items = window.DemoItems && window.DemoItems[areaId];
    if (!Array.isArray(items)) {
      throw new Error("window.DemoItems." + areaId + " 不是数组，无法生成问题上报单");
    }
    var matches = items.filter(function (item) { return item.id === itemId; });
    if (matches.length === 0) {
      throw new Error("未知巡检项：" + itemId + "（区域 " + areaId + "）");
    }
    return matches[0];
  }

  function meta() {
    return {
      pageTitle: "巡检任务",
      taskCount: 1 + OTHER_TASKS.length,
      activeTab: "stat",
      activeFilter: "done"
    };
  }

  function task() {
    return JSON.parse(JSON.stringify(TASK));
  }

  function tabs() {
    return TABS.map(function (tab) { return { id: tab.id, label: tab.label }; });
  }

  function filters() {
    return FILTERS.map(function (f) { return { id: f.id, label: f.label, active: f.active }; });
  }

  // 问题列表：从 window.DemoStation + window.DemoItems 现场派生，不写死条数。
  // 当前剧本落点应为 3 条（gate-8/gate-40/filter-4），与 station.js 的
  // issueCount 汇总口径一致。
  function issues() {
    if (!window.DemoStation) {
      throw new Error("window.DemoStation 未加载：task.js 的 issues() 依赖它派生问题列表");
    }
    var result = [];
    window.DemoStation.areas().forEach(function (a) {
      var items = window.DemoItems[a.id];
      items.forEach(function (item) {
        if (item.status === "ok") return;
        result.push({
          areaId: a.id,
          areaName: a.name,
          itemId: item.id,
          point: item.point,
          title: item.title,
          status: item.status
        });
      });
    });
    return result;
  }

  // 问题上报单模板：字段名照抄 IMS 事件中心真实字段，取值从 DemoStation/DemoItems
  // 现场拼出来，不硬编码成某一条。
  // 这里原先有 issueDraft(areaId, itemId)：按 IMS 事件中心的字段规格，从某条异常
  // 巡检项现场派生一张「问题上报单」（事件编号/紧急程度/事件等级/层级路径/企业与
  // 二级单位/4 步流程条……）。2026-08-20 随 scripts/scenes/issuereport.js 一起删除
  // ——本次改造把演示收窄到"平面图 + 巡检员 + 轨迹"，问题上报不在范围内。
  //
  // 上方的 issues() 保留：它只是"全站非正常巡检项的清单"这个聚合，与上报单无关，
  // 顶栏/右栏的异常计数仍然可能用到。要恢复上报单，需要连同 issuereport.js、
  // ActionBar 的 open-issue-report 按钮、boot.js 的 deriveIssueTarget/openIssueReport
  // 以及 flow.js 的 "report" 步骤一起加回来——它们是一整套，不是单点功能。

  function otherTasks() {
    return OTHER_TASKS.map(function (t) {
      return {
        id: t.id,
        formName: t.formName,
        station: t.station,
        inspector: t.inspector,
        actualStart: t.actualStart,
        actualEnd: t.actualEnd,
        areaSummary: t.areaSummary,
        issueBadge: t.issueBadge
      };
    });
  }

  window.DemoTask = {
    meta: meta,
    task: task,
    tabs: tabs,
    filters: filters,
    issues: issues,
    otherTasks: otherTasks,
    inspectorCandidates: inspectorCandidates,
    addInspector: addInspector
  };
})();
