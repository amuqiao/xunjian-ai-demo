// IMS 输油泵机组单元模型 —— 6 子系统 / 48 部件（window.PumpUnitModel）
//
// 【生成物，不要手改】由 tools/build_data.py 生成，重跑即覆盖：
//   uv run python poc/beng-demo/hunan-pump-overview-v2/tools/build_data.py 2026-08-23
// 生成时间戳：2026-08-23（由命令行传入，不在脚本里取 now —— 同样输入必须产出同样字节）
//
// 上游真源：
//   IMS系统压缩机（输油泵）单元模型-输油泵已修改.xlsx / sheet「输油泵机组单元模型」
//
// ⚠️ 这是**设备结构树**（机组由哪些部件构成），与 pump-faults.js 的「故障部位」
//   （故障归因分类）是两套独立词表。两者都出现「泵本体」，但这里指的是壳体/叶轮/转轴那一堆
//   实体部件，那里指的是故障被归到哪一类。**不要把它们接成同一根轴**，
//   本文件因此刻意不导出任何"按故障部位查部件"的方法。
window.PumpUnitModel = (function () {
  "use strict";

  var TREE = {
    "动力机": [
        "电机",
        "励磁机",
        "风机",
        "测温元件",
        "测振元件",
        "测速装置"
    ],
    "传动系统": [
        "变速箱/变速驱动器",
        "轴承",
        "密封件",
        "耦合驱动器",
        "耦合驱动器组件"
    ],
    "泵本体": [
        "支撑架",
        "壳体",
        "叶轮",
        "转轴",
        "径向轴承",
        "推力轴承",
        "密封件",
        "阀门",
        "气缸衬套",
        "活塞",
        "隔膜泵"
    ],
    "监控系统": [
        "驱动装置",
        "控制单元",
        "内置电源",
        "监视器",
        "传感器",
        "阀门",
        "配线",
        "管路",
        "密封件",
        "监测诊断模块"
    ],
    "润滑系统": [
        "油缸",
        "泵",
        "电机",
        "旋液分离器",
        "冷却装置",
        "阀门",
        "管路",
        "润滑油",
        "油杯",
        "密封件"
    ],
    "其他": [
        "冷却/加热系统",
        "旋液分离器",
        "脉动阻尼器",
        "法兰接头",
        "电伴热",
        "其他"
    ]
};

  function subsystems() {
    return Object.keys(TREE).map(function (k) { return { name: k, parts: TREE[k].slice() }; });
  }
  function partTotal() {
    return Object.keys(TREE).reduce(function (s, k) { return s + TREE[k].length; }, 0);
  }
  return { subsystems: subsystems, partTotal: partTotal };
})();
