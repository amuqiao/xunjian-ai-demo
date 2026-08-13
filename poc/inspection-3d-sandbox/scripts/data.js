(function () {
  "use strict";

  var parts = [
    {
      id: "pump-body",
      label: "泵体",
      short: "泵体",
      status: "ok",
      badge: "工况稳定",
      summary: "出口压力和工况波动稳定，当前不作为主要异常源。",
      evidence: ["出口压力 6.42 MPa", "压力波动 1.8%", "未见工况突变证据"]
    },
    {
      id: "seal",
      label: "密封",
      short: "密封",
      status: "ok",
      badge: "排除项",
      summary: "机械密封未见泄漏和温升异常，作为排除项记录。",
      evidence: ["泄漏观察正常", "未见异常温升", "不指向密封故障"]
    },
    {
      id: "front-bearing",
      label: "泵驱动端轴承",
      short: "轴承",
      status: "danger",
      badge: "时序预警",
      summary: "泵驱动端垂直振动进入关注区，是本次事件的直接触发测点。",
      evidence: ["5 日内由 2.62 升至 5.82 mm/s", "超过 80% 演示预警线", "1X/2X 成分同步抬升"]
    },
    {
      id: "coupling",
      label: "联轴器",
      short: "联轴器",
      status: "danger",
      badge: "核心异常",
      summary: "联轴器两侧相位差异常，结合 2X 频谱和基础振动，是疑似不对中的核心入口。",
      evidence: ["相位差 -81.06° / r=0.97", "2X 成分突出", "与基础振动偏大并发"]
    },
    {
      id: "motor",
      label: "电机",
      short: "电机",
      status: "warn",
      badge: "同步抬升",
      summary: "电机侧振动随泵驱动端同步抬升，暂不作为首要故障源。",
      evidence: ["驱动端水平 4.18 mm/s", "低于主异常测点", "与泵侧存在同步关系"]
    },
    {
      id: "base",
      label: "底座",
      short: "底座",
      status: "danger",
      badge: "基础振动",
      summary: "基础振动偏大，与不对中证据共同出现，需要检查地脚和底座刚性。",
      evidence: ["F 点基础振动偏大", "与联轴器相位异常并发", "可能放大轴系振动"]
    }
  ];

  window.DemoData = {
    parts: function () {
      return parts.slice();
    },
    part: function (id) {
      var match = parts.filter(function (item) { return item.id === id; })[0];
      if (!match) throw new Error("未知部位：" + id);
      return match;
    }
  };
}());
