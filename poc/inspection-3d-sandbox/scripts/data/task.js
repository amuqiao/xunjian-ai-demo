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
// issueDraft(areaId, itemId) 是派生函数：标题、区域编码等字段从 window.DemoStation
// 和 window.DemoItems 现场取值拼出来，不硬编码成某一条固定的问题。字段名照抄
// IMS 事件中心真实字段（*号为必填）：
//   eventTitle(*事件标题) / eventCode(事件编码,自动生成) /
//   eventSource(*事件来源，取值"日常巡检") / urgency(*紧要程度) /
//   eventLevel(*事件等级) / eventLocation(*事件位置，真实默认值就是"站场") /
//   targetType(*作业对象类型) / hierarchy(所在层级,自动) / areaCode(区域编码,自动) /
//   stationDepot(所属站库,自动) / enterprise(所属企业,自动) /
//   secondaryUnit(二级单位,自动) / managementUnit(管理单位,自动)
// 流程 4 步：事件填报 → 事件研判 → 事件处置 → 事件完成。
//
// ⚠️ urgency/eventLevel/targetType/hierarchy/enterprise/secondaryUnit/managementUnit
// 这几个"自动"字段的具体取值，原始需求只要求字段名照抄 IMS，没有给出这些
// 枚举的真实取值表，下面用到的中文取值（如"紧急"/"一般"/"设备设施"）是本文件
// 为了让派生函数能跑起来而选的演示占位值，不是从真实系统核实过的枚举——
// 如果要接入真实 IMS 事件中心，这几处取值需要换成真实枚举。eventLocation
// 固定为"站场"、eventSource 固定为"日常巡检"是原始需求明确给出的真实默认值，
// 不属于占位。
(function () {
  "use strict";

  // ---- 主任务卡：永州分输清管站常规巡检表 ----
  var TASK = {
    id: "task-yongzhou-20260804",
    formName: "永州分输清管站常规巡检表",
    overdueBadge: "未超期",
    planStart: "2026-08-04 09:00:22",
    planEnd: "2026-08-05 09:00:22",
    actualStart: "2026-08-04 09:02:25",
    actualEnd: "2026-08-04 10:05:18",
    station: "广西支干线永州站",
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
  var OTHER_TASKS = [
    {
      id: "task-chenzhou-20260804",
      formName: "郴州输油站常规巡检表",
      station: "长郴郴州站",
      inspector: "王泽宇,周理斌",
      actualStart: "08:59:56",
      actualEnd: "10:26:37",
      areaSummary: "共8个，已完成8个",
      issueBadge: 2
    }
  ];

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
  function issueDraft(areaId, itemId) {
    if (!window.DemoStation) {
      throw new Error("window.DemoStation 未加载：issueDraft 依赖它取区域信息");
    }
    var area = window.DemoStation.area(areaId); // 查不到会自己抛错
    var item = findItem(areaId, itemId);
    var station = window.DemoStation.meta();

    var urgency = URGENCY_BY_STATUS[item.status];
    if (!urgency) {
      throw new Error("巡检项 " + itemId + " 的 status=" + item.status + " 没有对应的紧要程度取值");
    }
    var eventLevel = EVENT_LEVEL_BY_STATUS[item.status];
    if (!eventLevel) {
      throw new Error("巡检项 " + itemId + " 的 status=" + item.status + " 没有对应的事件等级取值");
    }
    var targetType = TARGET_TYPE_BY_DISCIPLINE[item.discipline];
    if (!targetType) {
      throw new Error("巡检项 " + itemId + " 的 discipline=" + item.discipline + " 没有对应的作业对象类型取值");
    }

    return {
      eventTitle: area.name + "·" + item.point + "异常：" + item.title,
      eventCode: "AUTO-" + itemId, // 真实系统自动生成，演示用 itemId 派生保证稳定可复现
      eventSource: "日常巡检",
      urgency: urgency,
      eventLevel: eventLevel,
      eventLocation: "站场",
      targetType: targetType,
      hierarchy: station.shortName + "/" + area.name,
      areaCode: areaId.toUpperCase(),
      stationDepot: station.shortName,
      // 企业/二级单位/管理单位：解析自 station.fullName（"新气管道广西支干线
      // 永州分输清管站"），不是凭空编的公司名。
      enterprise: "湖南公司",
      secondaryUnit: "广西支干线",
      managementUnit: station.shortName,
      flowSteps: ["事件填报", "事件研判", "事件处置", "事件完成"],
      currentStep: "事件填报"
    };
  }

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
    issueDraft: issueDraft,
    otherTasks: otherTasks
  };
})();
