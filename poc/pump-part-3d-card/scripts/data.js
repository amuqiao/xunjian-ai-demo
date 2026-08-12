(function () {
  "use strict";

  var areas = [
    {
      id: "valve",
      label: "阀组区",
      short: "阀组",
      status: "done",
      order: 1,
      time: "04:02",
      progress: "49/49",
      summary: "进、出站阀组区域已完成提交，阀位、隔离阀、内外漏检查均为正常。",
      metrics: ["阀位一致", "无跑冒滴漏", "标识完好"],
      evidence: ["前后隔离阀全部打开并铅封", "压力表读数 3.0 / 4.5 MPa", "轨迹在区域内停留 06:42"]
    },
    {
      id: "metering",
      label: "计量区",
      short: "计量",
      status: "warn",
      order: 2,
      time: "04:09",
      progress: "42/42",
      summary: "污油罐液位缓慢增加，AI 建议列入下一班重点复核。",
      metrics: ["压力 0.06MPa", "液位趋势 +1.8%", "无外漏"],
      evidence: ["液位计与变送器示值一致", "过滤器差压小于 0.1MPa", "AI 趋势提醒已生成"]
    },
    {
      id: "pump",
      label: "泵区",
      short: "泵区",
      status: "danger",
      order: 3,
      time: "04:17",
      progress: "28/28",
      summary: "P-4 泵棚发现振动关注项，需结合视频关键帧和下一轮复测确认。",
      metrics: ["振动 4.8mm/s", "油位 2/3", "温度正常"],
      evidence: ["主输油泵运行无异响但振动高于关注线", "机械密封泄漏未成线", "工业电视画面存在短时遮挡"]
    },
    {
      id: "tank",
      label: "罐区",
      short: "罐区",
      status: "done",
      order: 4,
      time: "04:23",
      progress: "40/40",
      summary: "罐区防火堤、呼吸阀、液位远传与消防设施检查完成。",
      metrics: ["液位远传正常", "防火堤完好", "消防水源充足"],
      evidence: ["罐顶护栏和踏步无损坏", "排水沟无积水", "泡沫发生器密封玻璃完好"]
    },
    {
      id: "control",
      label: "站控室",
      short: "站控",
      status: "done",
      order: 5,
      time: "04:29",
      progress: "22/22",
      summary: "站控机、工业电视、报警信息与现场流程一致。",
      metrics: ["系统时间一致", "PLC 通讯正常", "报警 0 条"],
      evidence: ["SCADA 与现场压力参数相符", "监控存储质量满足 1080P", "系统时间误差小于 30s"]
    },
    {
      id: "waste",
      label: "危废间",
      short: "危废",
      status: "done",
      order: 6,
      time: "04:32",
      progress: "6/6",
      summary: "危废间照明、灭火器和物品定置检查通过。",
      metrics: ["照明完好", "灭火器合格", "定置合规"],
      evidence: ["危废桶标识完整", "地面无渗漏", "消防通道未占用"]
    },
    {
      id: "oil",
      label: "润滑油间",
      short: "油间",
      status: "done",
      order: 7,
      time: "04:34",
      progress: "8/8",
      summary: "润滑油间库存和静电接地检查完成。",
      metrics: ["油品未变质", "接地完好", "台账一致"],
      evidence: ["油桶封识完整", "区域无明火源", "出入库记录一致"]
    },
    {
      id: "comm",
      label: "通讯机房",
      short: "通讯",
      status: "done",
      order: 8,
      time: "04:36",
      progress: "10/10",
      summary: "通讯机房网络、温湿度和机柜状态正常。",
      metrics: ["链路正常", "温湿度正常", "门禁正常"],
      evidence: ["核心交换机无告警", "机柜风扇运行正常", "线缆标识清晰"]
    },
    {
      id: "power",
      label: "配电间",
      short: "配电",
      status: "warn",
      order: 9,
      time: "04:38",
      progress: "18/18",
      summary: "低压配电室电池电压呈下降趋势，需要形成趋势提醒。",
      metrics: ["A/B/C 220V", "电池趋势下降", "无过热"],
      evidence: ["UPS 正负组电池电压相似但趋势下行", "电气柜无异常声响", "热成像未见热点"]
    },
    {
      id: "transformer",
      label: "变压器室",
      short: "变压",
      status: "done",
      order: 10,
      time: "04:40",
      progress: "12/12",
      summary: "变压器室温度、声音、通风和围栏状态正常。",
      metrics: ["温升正常", "无异响", "通风正常"],
      evidence: ["警示标识完好", "基础无沉降", "室内无异物堆放"]
    },
    {
      id: "warehouse",
      label: "应急仓库",
      short: "仓库",
      status: "done",
      order: 11,
      time: "04:41",
      progress: "9/9",
      summary: "应急物资账物一致，消防和防汛物资可用。",
      metrics: ["账物一致", "物资在位", "通道畅通"],
      evidence: ["应急工具未缺失", "防汛沙袋数量满足要求", "货架固定可靠"]
    },
    {
      id: "plc",
      label: "PLC 机房",
      short: "PLC",
      status: "danger",
      order: 12,
      time: "04:42",
      progress: "11/11",
      summary: "PLC 机房视频识别到无人巡检时段偏差，需要复核轨迹和工业电视记录。",
      metrics: ["视频偏差 34min", "通道绿灯正常", "无人片段 1 段"],
      evidence: ["巡检时段与工业电视人员出现时间偏差超过 30 分钟", "第三方通讯未出现绿底异常", "已生成复核工单"]
    },
    {
      id: "ups",
      label: "UPS 室",
      short: "UPS",
      status: "done",
      order: 13,
      time: "04:43",
      progress: "7/7",
      summary: "UPS 室输出电压、电池组和环境状态检查完成。",
      metrics: ["输出正常", "电池组可用", "环境正常"],
      evidence: ["ABC 相电压约 220V", "电池柜无鼓包渗液", "空调运行正常"]
    }
  ];

  var kpis = [
    { label: "巡检完成率", value: "100%", trend: "13/13 区域已提交", tone: "ok" },
    { label: "发现问题", value: "3", trend: "2 个 AI 趋势提醒，1 个视频复核", tone: "danger" },
    { label: "时长异常", value: "1", trend: "低于 10 分钟触发", tone: "warn" },
    { label: "间隔异常", value: "2", trend: "区域停留 / 区域间隔低于阈值", tone: "warn" }
  ];

  var timeline = [
    { label: "计划下发", time: "03:30", state: "done" },
    { label: "手机同步", time: "04:00", state: "done" },
    { label: "区域提交", time: "04:02-04:43", state: "done" },
    { label: "AI 复核", time: "待确认", state: "danger" }
  ];

  var alerts = [
    { title: "泵区振动关注", desc: "P-4 泵棚振动 4.8mm/s，建议下一轮复测。", status: "danger" },
    { title: "PLC 视频时段偏差", desc: "工业电视人员出现时间与巡检时段偏差 34 分钟。", status: "danger" },
    { title: "电池电压趋势下降", desc: "配电间 / UPS 相关趋势进入关注队列。", status: "warn" },
    { title: "污油罐液位缓慢增加", desc: "计量区液位趋势 +1.8%，未触发硬报警。", status: "warn" }
  ];

  var route = areas.map(function (area) { return area.id; });

  function byId(id) {
    var match = areas.filter(function (area) { return area.id === id; })[0];
    if (!match) throw new Error("未知巡检区域：" + id);
    return match;
  }

  window.DemoData = {
    station: {
      name: "长郴湘潭站",
      task: "输油湘潭站日常巡检",
      inspector: "廖震宇",
      planned: "2026-07-21 03:30 - 2026-07-22 03:30",
      actual: "2026-07-21 04:00:27 - 04:43:22",
      status: "已完成",
      sync: "手机数据已经同步"
    },
    areas: function () {
      return areas.slice();
    },
    area: byId,
    route: function () {
      return route.slice();
    },
    statuses: function () {
      var result = {};
      areas.forEach(function (area) { result[area.id] = area.status; });
      return result;
    },
    kpis: function () {
      return kpis.slice();
    },
    timeline: function () {
      return timeline.slice();
    },
    alerts: function () {
      return alerts.slice();
    }
  };
}());
