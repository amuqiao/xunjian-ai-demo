(function () {
  "use strict";

  window.DEMO_V3_DATA = {
  "shell": {
    "siteName": "长郴-湘潭站",
    "subtitle": "巡检质量智能分析",
    "batch": "XJ-20260721-A",
    "period": "2026-07-17~2026-07-21",
    "clock": "2026-07-21 04:43:22",
    "sceneOrder": [
      "overview",
      "station",
      "form",
      "recheck",
      "report",
      "knowledge",
      "graph"
    ],
    "sceneLabels": {
      "overview": "质量大屏",
      "station": "站场态势",
      "form": "表单质检",
      "recheck": "复检确认",
      "report": "报告归档",
      "knowledge": "知识库",
      "graph": "知识图谱"
    },
    "flowSteps": [
      {
        "key": "task",
        "label": "任务总览",
        "desc": "批次 / 路线 / 区域"
      },
      {
        "key": "form",
        "label": "表单质检",
        "desc": "表单 / 时序 / 视觉 / Agent"
      },
      {
        "key": "recheck",
        "label": "人工确认",
        "desc": "复检建议 / 三类结论"
      },
      {
        "key": "report",
        "label": "报告归档",
        "desc": "交接班 / 案例"
      }
    ],
    "primaryFlow": {
      "areaKey": "metering",
      "itemKey": "dp",
      "trendKey": "filterDp",
      "frameKey": "current"
    }
  },
  "overview": {
    "task": {
      "title": "计量区例行巡检",
      "inspector": "廖震宇",
      "planStart": "2026-07-21 03:30:05",
      "actualStart": "2026-07-21 04:00:27",
      "actualEnd": "2026-07-21 04:43:22",
      "routeCount": "13 个区域 / 展示 6 个重点区域",
      "note": "本轮从计量区表单质检进入,在同一工作台并联查看时序模型、视觉模型、规则依据和 Agent 建议。"
    },
    "metrics": [
      {
        "key": "batch",
        "label": "任务批次",
        "value": "XJ-A",
        "tone": "cyan"
      },
      {
        "key": "areas",
        "label": "重点区域",
        "value": "6",
        "tone": "amber"
      },
      {
        "key": "forms",
        "label": "表单记录",
        "value": "315",
        "tone": "green"
      },
      {
        "key": "entry",
        "label": "主入口",
        "value": "计量区",
        "tone": "red"
      }
    ],
    "areaOrder": [
      "metering",
      "valve",
      "pump",
      "control",
      "plc",
      "power"
    ]
  },
  "analysis": {
    "formExplain": [
      {
        "title": "先看填写事实",
        "desc": "过滤器差压在巡检表中被填写为“正常”,这是 AI 不能直接覆盖的原始记录。"
      },
      {
        "title": "再看系统质检",
        "desc": "同一设备的趋势数据接近阈值,系统只标记冲突,不自动下异常结论。"
      },
      {
        "title": "保留人工边界",
        "desc": "复检结论仍由人员确认,页面只负责把疑点、证据和清单串起来。"
      }
    ],
    "inspectionRows": [
      {
        "item": "pressure",
        "areaKey": "metering",
        "no": 63,
        "area": "计量区",
        "device": "污油罐",
        "check": "压力",
        "result": "0.06",
        "hot": false
      },
      {
        "item": "dp",
        "areaKey": "metering",
        "no": 73,
        "area": "计量区",
        "device": "过滤器",
        "check": "差压",
        "result": "正常",
        "hot": true
      },
      {
        "item": "panel",
        "areaKey": "metering",
        "no": 76,
        "area": "计量区",
        "device": "电动执行机构",
        "check": "显示面板",
        "result": "正常",
        "hot": false
      },
      {
        "item": "indicator",
        "areaKey": "metering",
        "no": 77,
        "area": "计量区",
        "device": "电动执行机构",
        "check": "指示灯",
        "result": "正常",
        "hot": false
      },
      {
        "item": "level",
        "areaKey": "metering",
        "no": 97,
        "area": "计量区",
        "device": "污油罐",
        "check": "液位",
        "result": "329mm",
        "hot": false
      },
      {
        "item": "valve-main",
        "areaKey": "valve",
        "no": 12,
        "area": "阀组区",
        "device": "进站阀组",
        "check": "阀位状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "valve-leak",
        "areaKey": "valve",
        "no": 18,
        "area": "阀组区",
        "device": "汇管区",
        "check": "跑冒滴漏",
        "result": "未见异常",
        "hot": false
      },
      {
        "item": "valve-pressure",
        "areaKey": "valve",
        "no": 24,
        "area": "阀组区",
        "device": "压力表",
        "check": "示值状态",
        "result": "平稳",
        "hot": false
      },
      {
        "item": "valve-ground",
        "areaKey": "valve",
        "no": 38,
        "area": "阀组区",
        "device": "防静电设施",
        "check": "接地状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "valve-route",
        "areaKey": "valve",
        "no": 51,
        "area": "阀组区",
        "device": "区域环境",
        "check": "巡检路线",
        "result": "已覆盖",
        "hot": false
      },
      {
        "item": "pump-body",
        "areaKey": "pump",
        "no": 108,
        "area": "泵区",
        "device": "P-4 输油泵",
        "check": "本体状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "pump-seal",
        "areaKey": "pump",
        "no": 114,
        "area": "泵区",
        "device": "P-4 输油泵",
        "check": "密封泄漏",
        "result": "未见异常",
        "hot": false
      },
      {
        "item": "pump-vibration",
        "areaKey": "pump",
        "no": 121,
        "area": "泵区",
        "device": "机泵基础",
        "check": "振动/异响",
        "result": "平稳",
        "hot": false
      },
      {
        "item": "pump-video",
        "areaKey": "pump",
        "no": 132,
        "area": "泵区",
        "device": "泵棚画面",
        "check": "视频帧可用",
        "result": "可用",
        "hot": false
      },
      {
        "item": "pump-env",
        "areaKey": "pump",
        "no": 138,
        "area": "泵区",
        "device": "区域环境",
        "check": "通道/照明",
        "result": "正常",
        "hot": false
      },
      {
        "item": "control-scada",
        "areaKey": "control",
        "no": 181,
        "area": "站控室",
        "device": "站控机",
        "check": "画面状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "control-comm",
        "areaKey": "control",
        "no": 183,
        "area": "站控室",
        "device": "PLC 通讯",
        "check": "通讯状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "control-tv",
        "areaKey": "control",
        "no": 186,
        "area": "站控室",
        "device": "工业电视",
        "check": "图像质量",
        "result": "9/10",
        "hot": false
      },
      {
        "item": "control-record",
        "areaKey": "control",
        "no": 188,
        "area": "站控室",
        "device": "工业电视",
        "check": "录像回放",
        "result": "可回放",
        "hot": false
      },
      {
        "item": "control-time",
        "areaKey": "control",
        "no": 196,
        "area": "站控室",
        "device": "系统时钟",
        "check": "时间同步",
        "result": "正常",
        "hot": false
      },
      {
        "item": "plc",
        "areaKey": "plc",
        "no": 288,
        "area": "PLC机房",
        "device": "PLC机柜",
        "check": "POWER灯",
        "result": "正常",
        "hot": false
      },
      {
        "item": "plc-run",
        "areaKey": "plc",
        "no": 292,
        "area": "PLC机房",
        "device": "PLC 模块",
        "check": "RUN灯",
        "result": "正常",
        "hot": false
      },
      {
        "item": "plc-comm",
        "areaKey": "plc",
        "no": 296,
        "area": "PLC机房",
        "device": "通讯模块",
        "check": "通讯状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "plc-cabinet",
        "areaKey": "plc",
        "no": 302,
        "area": "PLC机房",
        "device": "机柜",
        "check": "柜门/标识",
        "result": "正常",
        "hot": false
      },
      {
        "item": "plc-env",
        "areaKey": "plc",
        "no": 312,
        "area": "PLC机房",
        "device": "机房环境",
        "check": "温湿度",
        "result": "平稳",
        "hot": false
      },
      {
        "item": "power-low-voltage",
        "areaKey": "power",
        "no": 250,
        "area": "配电间",
        "device": "低压配电装置",
        "check": "运行情况检查",
        "result": "正常",
        "hot": false
      },
      {
        "item": "power-dc-a",
        "areaKey": "power",
        "no": 252,
        "area": "配电间",
        "device": "直流屏柜",
        "check": "运行状态",
        "result": "正常",
        "hot": false
      },
      {
        "item": "power-mains",
        "areaKey": "power",
        "no": 259,
        "area": "配电间",
        "device": "外电电源",
        "check": "电压/频率/功率因数",
        "result": "平稳",
        "hot": false
      },
      {
        "item": "power-switch",
        "areaKey": "power",
        "no": 260,
        "area": "配电间",
        "device": "10kV 开关柜",
        "check": "运行情况检查",
        "result": "正常",
        "hot": false
      },
      {
        "item": "power-video",
        "areaKey": "power",
        "no": 264,
        "area": "配电间",
        "device": "低压柜画面",
        "check": "关键帧可用",
        "result": "可用",
        "hot": false
      }
    ],
    "itemDetails": {
      "dp": {
        "evidence": "已选中表单第 73 项:过滤器差压。趋势异常窗口同步高亮,形成“表单正常但趋势接近阈值”的主冲突。",
        "tags": [
          "第73项",
          "差压",
          "趋势异常",
          "主证据"
        ],
        "trendKey": "filterDp",
        "image": "current"
      },
      "pressure": {
        "evidence": "已选中污油罐压力项。当前作为正常对照数据,帮助说明系统不是全量报错。",
        "tags": [
          "压力",
          "正常对照",
          "0.06",
          "辅助项"
        ],
        "trendKey": "pressureStable",
        "image": "current"
      },
      "panel": {
        "evidence": "已选中电动执行机构显示面板。可切换现场帧展示视觉辅助证据,但不替代人工确认。",
        "tags": [
          "执行机构",
          "显示面板",
          "视觉辅助"
        ],
        "trendKey": "filterDp",
        "image": "current"
      },
      "indicator": {
        "evidence": "已选中电动执行机构指示灯。建议补拍指示灯、阀位和远传状态,作为复检辅助证据。",
        "tags": [
          "指示灯",
          "补拍建议",
          "视觉证据"
        ],
        "trendKey": "filterDp",
        "image": "current"
      },
      "level": {
        "evidence": "已选中污油罐液位项。液位示值作为辅助数据,不进入本轮高优先级复检主线。",
        "tags": [
          "液位",
          "329mm",
          "辅助数据"
        ],
        "trendKey": "levelStable",
        "image": "current"
      },
      "valve-main": {
        "evidence": "已选中阀组区第 12 项:进站阀组阀位状态。当前表单、阀组趋势和路线参考帧一致,作为正常对照,不进入复检主线。",
        "tags": [
          "第12项",
          "阀位状态",
          "正常对照",
          "阀组趋势"
        ],
        "trendKey": "valveStable",
        "image": "current"
      },
      "pump-video": {
        "evidence": "已选中泵区第 132 项:泵棚画面视频帧可用。趋势平稳,关键帧用于补充现场状态,作为视觉辅助证据。",
        "tags": [
          "第132项",
          "视频帧",
          "视觉辅助",
          "正常对照"
        ],
        "trendKey": "pumpStable",
        "image": "current"
      },
      "control-tv": {
        "evidence": "已选中站控室第 186 项:工业电视图像质量 9/10。该项作为管理侧视频质量材料,不进入主线复检规则。",
        "tags": [
          "第186项",
          "工业电视",
          "图像质量",
          "管理侧材料"
        ],
        "trendKey": "videoQuality",
        "image": "current"
      },
      "plc": {
        "evidence": "已选中 PLC 机柜 POWER 灯项。右侧关键帧切换到 PLC 机房,核验灯态识别结果。",
        "tags": [
          "PLC",
          "POWER灯",
          "灯态识别"
        ],
        "trendKey": "plcHealth",
        "image": "plc"
      },
      "power-low-voltage": {
        "evidence": "已选中配电间第 250 项:低压配电装置运行情况检查。三相电压趋势平稳,低压柜关键帧用于供电侧联动核验。",
        "tags": [
          "第250项",
          "低压配电",
          "供电侧",
          "三相电压"
        ],
        "trendKey": "powerStable",
        "image": "current"
      }
    },
    "trendSeries": {
      "filterDp": {
        "title": "过滤器差压趋势 · 72h",
        "unit": "MPa",
        "threshold": 0.1,
        "safeSide": "below",
        "min": 0.04,
        "max": 0.105,
        "quality": "12/12",
        "window": {
          "startIndex": 8,
          "endIndex": 11,
          "label": "异常窗口"
        },
        "summary": "差压连续抬升,末值距离 0.1MPa 阈值仅 0.003MPa。",
        "points": [
          [
            "07-18 04:00",
            0.053
          ],
          [
            "07-18 10:00",
            0.055
          ],
          [
            "07-18 16:00",
            0.058
          ],
          [
            "07-18 22:00",
            0.061
          ],
          [
            "07-19 04:00",
            0.066
          ],
          [
            "07-19 10:00",
            0.071
          ],
          [
            "07-19 16:00",
            0.077
          ],
          [
            "07-19 22:00",
            0.083
          ],
          [
            "07-20 04:00",
            0.089
          ],
          [
            "07-20 10:00",
            0.094
          ],
          [
            "07-20 16:00",
            0.096
          ],
          [
            "07-21 04:00",
            0.097
          ]
        ]
      },
      "pressureStable": {
        "title": "污油罐压力趋势 · 72h",
        "unit": "MPa",
        "threshold": 0.08,
        "safeSide": "below",
        "min": 0.04,
        "max": 0.09,
        "quality": "12/12",
        "window": null,
        "summary": "压力围绕 0.06MPa 小幅波动,作为正常对照。",
        "points": [
          [
            "07-18 04:00",
            0.058
          ],
          [
            "07-18 10:00",
            0.061
          ],
          [
            "07-18 16:00",
            0.06
          ],
          [
            "07-18 22:00",
            0.059
          ],
          [
            "07-19 04:00",
            0.062
          ],
          [
            "07-19 10:00",
            0.061
          ],
          [
            "07-19 16:00",
            0.06
          ],
          [
            "07-19 22:00",
            0.058
          ],
          [
            "07-20 04:00",
            0.059
          ],
          [
            "07-20 10:00",
            0.061
          ],
          [
            "07-20 16:00",
            0.06
          ],
          [
            "07-21 04:00",
            0.06
          ]
        ]
      },
      "levelStable": {
        "title": "污油罐液位趋势 · 72h",
        "unit": "mm",
        "threshold": 500,
        "safeSide": "below",
        "min": 260,
        "max": 520,
        "quality": "12/12",
        "window": null,
        "summary": "液位在 320mm 附近波动,不进入本轮高优先级复检主线。",
        "points": [
          [
            "07-18 04:00",
            322
          ],
          [
            "07-18 10:00",
            326
          ],
          [
            "07-18 16:00",
            330
          ],
          [
            "07-18 22:00",
            327
          ],
          [
            "07-19 04:00",
            331
          ],
          [
            "07-19 10:00",
            329
          ],
          [
            "07-19 16:00",
            334
          ],
          [
            "07-19 22:00",
            332
          ],
          [
            "07-20 04:00",
            328
          ],
          [
            "07-20 10:00",
            333
          ],
          [
            "07-20 16:00",
            330
          ],
          [
            "07-21 04:00",
            329
          ]
        ]
      },
      "valveStable": {
        "title": "阀组区状态 · 平稳",
        "unit": "%",
        "threshold": 75,
        "safeSide": "above",
        "min": 55,
        "max": 95,
        "quality": "10/10",
        "window": null,
        "summary": "阀组区状态平稳,作为全站路线覆盖和正常对照。",
        "points": [
          [
            "07-18 04:00",
            88
          ],
          [
            "07-18 12:00",
            87
          ],
          [
            "07-18 20:00",
            89
          ],
          [
            "07-19 04:00",
            88
          ],
          [
            "07-19 12:00",
            90
          ],
          [
            "07-19 20:00",
            89
          ],
          [
            "07-20 04:00",
            88
          ],
          [
            "07-20 12:00",
            87
          ],
          [
            "07-20 20:00",
            89
          ],
          [
            "07-21 04:00",
            88
          ]
        ]
      },
      "pumpStable": {
        "title": "泵区运行状态 · 平稳",
        "unit": "%",
        "threshold": 88,
        "safeSide": "above",
        "min": 60,
        "max": 95,
        "quality": "10/10",
        "window": null,
        "summary": "泵区运行健康度保持平稳,用于视觉证据的正常对照。",
        "points": [
          [
            "07-18 04:00",
            89
          ],
          [
            "07-18 12:00",
            90
          ],
          [
            "07-18 20:00",
            89
          ],
          [
            "07-19 04:00",
            90
          ],
          [
            "07-19 12:00",
            91
          ],
          [
            "07-19 20:00",
            90
          ],
          [
            "07-20 04:00",
            89
          ],
          [
            "07-20 12:00",
            90
          ],
          [
            "07-20 20:00",
            91
          ],
          [
            "07-21 04:00",
            90
          ]
        ]
      },
      "videoQuality": {
        "title": "站控室监控质量",
        "unit": "%",
        "threshold": 85,
        "safeSide": "above",
        "min": 60,
        "max": 100,
        "quality": "9/10",
        "window": null,
        "summary": "监控质量用于管理材料展示,不参与差压异常判定。",
        "points": [
          [
            "07-18 04:00",
            90
          ],
          [
            "07-18 12:00",
            88
          ],
          [
            "07-18 20:00",
            89
          ],
          [
            "07-19 04:00",
            91
          ],
          [
            "07-19 12:00",
            87
          ],
          [
            "07-19 20:00",
            89
          ],
          [
            "07-20 04:00",
            90
          ],
          [
            "07-20 12:00",
            88
          ],
          [
            "07-20 20:00",
            91
          ],
          [
            "07-21 04:00",
            90
          ]
        ]
      },
      "plcHealth": {
        "title": "PLC 通讯健康度 · 抽查",
        "unit": "%",
        "threshold": 80,
        "safeSide": "above",
        "min": 60,
        "max": 100,
        "quality": "10/10",
        "window": null,
        "summary": "PLC 通讯健康度稳定,配合关键帧完成灯态抽查。",
        "points": [
          [
            "07-18 04:00",
            96
          ],
          [
            "07-18 12:00",
            95
          ],
          [
            "07-18 20:00",
            96
          ],
          [
            "07-19 04:00",
            97
          ],
          [
            "07-19 12:00",
            96
          ],
          [
            "07-19 20:00",
            95
          ],
          [
            "07-20 04:00",
            96
          ],
          [
            "07-20 12:00",
            96
          ],
          [
            "07-20 20:00",
            97
          ],
          [
            "07-21 04:00",
            96
          ]
        ]
      },
      "powerStable": {
        "title": "配电间三相电压健康度",
        "unit": "%",
        "threshold": 85,
        "safeSide": "above",
        "min": 70,
        "max": 100,
        "quality": "10/10",
        "window": null,
        "summary": "三相电压健康度稳定,与低压配电室关键帧共同支撑供电侧核验。",
        "points": [
          [
            "07-18 04:00",
            94
          ],
          [
            "07-18 12:00",
            95
          ],
          [
            "07-18 20:00",
            94
          ],
          [
            "07-19 04:00",
            95
          ],
          [
            "07-19 12:00",
            96
          ],
          [
            "07-19 20:00",
            95
          ],
          [
            "07-20 04:00",
            94
          ],
          [
            "07-20 12:00",
            95
          ],
          [
            "07-20 20:00",
            96
          ],
          [
            "07-21 04:00",
            95
          ]
        ]
      }
    },
    "frameSources": {
      "metering": {
        "current": {
          "src": "data/areas/metering/frames/current.png",
          "title": "计量区复检补拍位 · 联动参考",
          "scene": "相邻泵棚参考帧",
          "label": "",
          "showBbox": false
        },
        "compare": {
          "src": "data/areas/metering/frames/compare.png",
          "title": "计量区复检补拍位 · 同路线参考",
          "scene": "相邻泵棚参考帧",
          "label": "",
          "showBbox": false
        },
        "plc": {
          "src": "data/areas/metering/frames/plc.png",
          "title": "现场关键帧 · PLC 联动核验",
          "scene": "PLC 机房",
          "label": "灯态识别 0.91",
          "showBbox": true
        }
      },
      "valve": {
        "current": {
          "src": "data/areas/valve/frames/current.png",
          "title": "阀组区路线参考帧 · 阀位核对",
          "scene": "路线相邻点位",
          "label": "",
          "showBbox": false
        },
        "compare": {
          "src": "data/areas/valve/frames/compare.png",
          "title": "阀组区路线参考帧 · 同路线对照",
          "scene": "路线相邻点位",
          "label": "",
          "showBbox": false
        },
        "plc": {
          "src": "data/areas/valve/frames/plc.png",
          "title": "阀组区联动帧 · PLC 状态",
          "scene": "PLC 机房",
          "label": "联动核验 0.91",
          "showBbox": true
        }
      },
      "pump": {
        "current": {
          "src": "data/areas/pump/frames/current.png",
          "title": "泵区关键帧 · 设备状态",
          "scene": "P-4 泵棚",
          "label": "设备区域 0.89",
          "showBbox": true
        },
        "compare": {
          "src": "data/areas/pump/frames/compare.png",
          "title": "泵区关键帧 · 同点位对比",
          "scene": "P-4 泵棚",
          "label": "同点位对比 0.90",
          "showBbox": true
        },
        "plc": {
          "src": "data/areas/pump/frames/plc.png",
          "title": "泵区联动帧 · PLC 状态",
          "scene": "PLC 机房",
          "label": "联动核验 0.91",
          "showBbox": true
        }
      },
      "control": {
        "current": {
          "src": "data/areas/control/frames/current.jpg",
          "title": "站控室材料 · 视频抽查",
          "scene": "视频抽查统计",
          "label": "",
          "showBbox": false
        },
        "compare": {
          "src": "data/areas/control/frames/compare.jpg",
          "title": "站控室材料 · 抽查复核",
          "scene": "视频抽查统计",
          "label": "",
          "showBbox": false
        },
        "plc": {
          "src": "data/areas/control/frames/plc.png",
          "title": "站控室联动帧 · PLC 状态",
          "scene": "PLC 机房",
          "label": "联动核验 0.91",
          "showBbox": true
        }
      },
      "plc": {
        "current": {
          "src": "data/areas/plc/frames/current.png",
          "title": "PLC 关键帧 · 灯态抽查",
          "scene": "PLC 机房",
          "label": "灯态识别 0.91",
          "showBbox": true
        },
        "compare": {
          "src": "data/areas/plc/frames/compare.png",
          "title": "PLC 关键帧 · 供电侧对比",
          "scene": "低压配电室",
          "label": "供电侧核验 0.87",
          "showBbox": true
        },
        "plc": {
          "src": "data/areas/plc/frames/plc.png",
          "title": "PLC 关键帧 · 柜体细节",
          "scene": "PLC 机房",
          "label": "柜体区域 0.91",
          "showBbox": true
        }
      },
      "power": {
        "current": {
          "src": "data/areas/power/frames/current.png",
          "title": "配电间关键帧 · 低压柜状态",
          "scene": "低压配电室",
          "label": "低压柜核验 0.87",
          "showBbox": true
        },
        "compare": {
          "src": "data/areas/power/frames/compare.png",
          "title": "配电间联动帧 · PLC 供电侧",
          "scene": "PLC 机房",
          "label": "供电联动 0.91",
          "showBbox": true
        },
        "plc": {
          "src": "data/areas/power/frames/plc.png",
          "title": "配电间关键帧 · 柜体细节",
          "scene": "低压配电室",
          "label": "柜体细节 0.89",
          "showBbox": true
        }
      }
    },
    "lifecycleMatrix": [
      {
        "areaKey": "metering",
        "role": "primary-risk-flow",
        "entryScene": "form",
        "formItemKey": "dp",
        "formEvidence": "表单第 73 项填写正常,触发与差压趋势的冲突核对。",
        "trendKey": "filterDp",
        "trendEvidence": "72h 差压趋势末值 0.097MPa,接近 0.1MPa 阈值。",
        "frameKey": "current",
        "visualEvidence": "现场关键帧用于定位过滤器、差压表补拍位和 PLC 联动参考。",
        "questionFocus": "为什么表单正常仍需要复检;复检人员补拍什么;交接班关注什么。",
        "terminalState": "复检确认后进入报告归档",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/filter-dp.csv",
          "frames/current.png",
          "questions.json",
          "case-knowledge.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 5,
        "lifecycleStageCount": 4,
        "primaryFlow": true,
        "auxiliaryOnly": false
      },
      {
        "areaKey": "valve",
        "role": "normal-contrast",
        "entryScene": "form",
        "formItemKey": "valve-main",
        "formEvidence": "阀组区表单项完整且结果正常,用于说明系统不会对低风险区域产生无效告警。",
        "trendKey": "valveStable",
        "trendEvidence": "阀组区状态趋势保持平稳,作为计量区主疑点的正常对照。",
        "frameKey": "current",
        "visualEvidence": "阀位路线参考帧用于补充正常对照的现场语境。",
        "questionFocus": "正常区域为什么仍展示;如何证明系统按风险聚焦;后续如何补阀位帧。",
        "terminalState": "作为证据或正常对照返回总览",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/valve-stable.csv",
          "frames/current.png",
          "questions.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 1,
        "lifecycleStageCount": 2,
        "primaryFlow": false,
        "auxiliaryOnly": true
      },
      {
        "areaKey": "pump",
        "role": "visual-evidence",
        "entryScene": "form",
        "formItemKey": "pump-video",
        "formEvidence": "泵棚画面项确认视频帧可用,用于把视觉素材纳入辅助证据链。",
        "trendKey": "pumpStable",
        "trendEvidence": "泵区运行趋势平稳,用于说明泵区不是本轮复检触发源。",
        "frameKey": "current",
        "visualEvidence": "泵区关键帧用于观察设备状态、现场环境和后续补拍位置。",
        "questionFocus": "泵区图像帧如何服务报告;为什么趋势正常仍保留视觉证据;是否需要补拍。",
        "terminalState": "作为证据或正常对照返回总览",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/pump-stable.csv",
          "frames/current.png",
          "questions.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 1,
        "lifecycleStageCount": 2,
        "primaryFlow": false,
        "auxiliaryOnly": true
      },
      {
        "areaKey": "control",
        "role": "management-background",
        "entryScene": "form",
        "formItemKey": "control-tv",
        "formEvidence": "工业电视图像质量评分可用,作为管理侧材料和视频质量背景。",
        "trendKey": "videoQuality",
        "trendEvidence": "站控室监控质量维持 9/10 水平,不进入主线复检规则。",
        "frameKey": "current",
        "visualEvidence": "站控室抽查帧用于解释视频质量和管理侧材料来源。",
        "questionFocus": "站控室为什么不进主线规则;视频质量如何作为背景材料;报告里如何使用。",
        "terminalState": "作为证据或正常对照返回总览",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/video-quality.csv",
          "frames/current.jpg",
          "questions.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 1,
        "lifecycleStageCount": 2,
        "primaryFlow": false,
        "auxiliaryOnly": true
      },
      {
        "areaKey": "plc",
        "role": "visual-evidence",
        "entryScene": "form",
        "formItemKey": "plc",
        "formEvidence": "PLC 机柜 POWER 灯表单项正常,可联动通讯健康度和灯态关键帧。",
        "trendKey": "plcHealth",
        "trendEvidence": "PLC 通讯健康度稳定,用于证明控制侧未触发异常。",
        "frameKey": "plc",
        "visualEvidence": "PLC 柜体细节帧用于核验灯态、柜体区域和状态标签。",
        "questionFocus": "PLC 灯态如何辅助判断;通讯趋势和现场帧如何互证;供电侧如何关联。",
        "terminalState": "作为证据或正常对照返回总览",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/plc-health.csv",
          "frames/plc.png",
          "questions.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 1,
        "lifecycleStageCount": 2,
        "primaryFlow": false,
        "auxiliaryOnly": true
      },
      {
        "areaKey": "power",
        "role": "power-side-evidence",
        "entryScene": "form",
        "formItemKey": "power-low-voltage",
        "formEvidence": "低压配电装置运行情况正常,用于把供电侧状态纳入联动核验。",
        "trendKey": "powerStable",
        "trendEvidence": "三相电压趋势平稳,作为供电侧正常对照。",
        "frameKey": "current",
        "visualEvidence": "低压柜关键帧用于核对柜体状态、表计区域和配电间环境。",
        "questionFocus": "供电侧为何纳入;低压柜画面如何服务视觉证据;三相电压如何作为正常对照。",
        "terminalState": "作为证据或正常对照返回总览",
        "dataSlots": [
          "form-items.csv",
          "item-details.json",
          "trends/power-stable.csv",
          "frames/current.png",
          "questions.json",
          "lifecycle.json"
        ],
        "formItemCount": 5,
        "detailItemCount": 1,
        "lifecycleStageCount": 2,
        "primaryFlow": false,
        "auxiliaryOnly": true
      }
    ]
  },
  "recheck": {
    "summary": [
      {
        "label": "触发原因",
        "value": "差压趋势接近 0.1MPa,且表单结果仍填写“正常”。"
      },
      {
        "label": "关联对象",
        "value": "计量区 / 过滤器 / 差压。"
      },
      {
        "label": "来源说明",
        "value": "巡检记录第 73 项 + 差压趋势候选文件。"
      }
    ],
    "knowledge": [
      {
        "type": "阈值",
        "title": "过滤分离器差压标准",
        "desc": "过滤分离器差压应小于 0.1MPa,当前 72h 末值 0.097MPa,余量仅 0.003MPa。",
        "source": "巡检记录第 73 项 / 工作指引"
      },
      {
        "type": "复检步骤",
        "title": "差压复核步骤",
        "desc": "核对现场差压表、设备铭牌与历史趋势,确认是否接近 0.1MPa。",
        "source": "油气站场巡检及交接班工作指引"
      },
      {
        "type": "复检步骤",
        "title": "执行机构核对",
        "desc": "确认指示灯、阀位、远传控制状态与巡检表单填写一致。",
        "source": "巡检记录第 76-78 项"
      },
      {
        "type": "交接班",
        "title": "交接班关注项",
        "desc": "建议下一班持续关注过滤器差压变化,如继续抬升安排进一步检查。",
        "source": "交接班工作指引"
      }
    ],
    "checklist": [
      {
        "text": "复核过滤器差压趋势和阈值。",
        "auto": true
      },
      {
        "text": "补拍差压表、铭牌和周边状态。",
        "auto": true
      },
      {
        "text": "核对执行机构状态与表单一致。",
        "auto": false
      },
      {
        "text": "纳入交接班关注项。",
        "auto": false
      }
    ],
    "decisions": [
      {
        "key": "confirmed",
        "label": "确认异常"
      },
      {
        "key": "false-positive",
        "label": "误报关闭"
      },
      {
        "key": "observe",
        "label": "继续观察"
      }
    ],
    "decisionStatus": {
      "confirmed": "确认异常",
      "false-positive": "误报关闭",
      "observe": "继续观察"
    }
  },
  "report": {
    "drafts": {
      "pending": {
        "main": "报告尚未生成。请先完成巡检分析、复检清单和人工结论选择。",
        "bullets": [
          "报告内容将随复检结论更新。"
        ],
        "handover": "待确认"
      },
      "confirmed": {
        "main": "长郴-湘潭站本轮计量区例行巡检已完成。人工复检结论为“确认异常”,建议将过滤器差压趋势纳入交接班持续关注。",
        "bullets": [
          "到位质检:实际开始时间晚于计划开始时间。",
          "表单质检:过滤器差压项填写正常,但与趋势数据存在冲突。",
          "复检结论:确认异常,建议核对现场差压表并持续观察趋势。",
          "交接班关注:下一班持续关注过滤器差压变化。"
        ],
        "handover": "已纳入"
      },
      "false-positive": {
        "main": "长郴-湘潭站本轮计量区例行巡检已完成。人工复检结论为“误报关闭”,本次报告仅记录关闭原因和证据来源,不纳入交接班风险关注。",
        "bullets": [
          "到位质检:实际开始时间晚于计划开始时间。",
          "表单质检:过滤器差压项曾触发趋势疑点。",
          "复检结论:误报关闭,需记录关闭依据,避免形成正式异常结论。",
          "交接班关注:无需纳入风险关注,仅保留案例归档记录。"
        ],
        "handover": "无需纳入"
      },
      "observe": {
        "main": "长郴-湘潭站本轮计量区例行巡检已完成。人工复检结论为“继续观察”,本次不下异常结论,建议下一班复核趋势变化。",
        "bullets": [
          "到位质检:实际开始时间晚于计划开始时间。",
          "表单质检:过滤器差压项与趋势判断存在待核实差异。",
          "复检结论:继续观察,暂不关闭,也不升级为正式异常。",
          "交接班关注:建议下一班复核差压曲线和现场差压表。"
        ],
        "handover": "观察中"
      }
    },
    "closedRate": {
      "confirmed": "67%",
      "false-positive": "50%",
      "observe": "50%",
      "archived": "100%"
    },
    "caseTags": [
      "计量区",
      "过滤器",
      "差压趋势",
      "表单冲突",
      "复检闭环"
    ],
    "version": "任务批次 XJ-20260721-A / 巡检质检规则库 / 交接班归档模板"
  },
  "dashboard": {
    "qualityMetrics": [
      {
        "key": "risk",
        "label": "当前风险",
        "value": "P1",
        "delta": "1项",
        "tone": "red",
        "sourceType": "演示推演",
        "desc": "当前最高优先级风险用于进入人工复核"
      },
      {
        "key": "completion",
        "label": "巡检完成率",
        "value": "96.8%",
        "delta": "+2.1%",
        "tone": "blue",
        "sourceType": "客户数据 + 待确认",
        "desc": "按本批次已完成任务 / 应巡任务推演"
      },
      {
        "key": "issues",
        "label": "发现问题数",
        "value": "18",
        "delta": "P1 3",
        "tone": "red",
        "sourceType": "演示推演",
        "desc": "基于表单、轨迹、时序、视觉综合造数"
      },
      {
        "key": "duration",
        "label": "时长异常",
        "value": "5",
        "delta": "<10min",
        "tone": "amber",
        "sourceType": "演示推演 / 待确认",
        "desc": "秒级开始结束时间由 demo 补齐"
      },
      {
        "key": "interval",
        "label": "间隔异常",
        "value": "7",
        "delta": "<10s",
        "tone": "amber",
        "sourceType": "演示推演 / 待确认",
        "desc": "区域边界和采样时间由 demo 补齐"
      },
      {
        "key": "offWindow",
        "label": "时段异常",
        "value": "2",
        "delta": "偏移30min",
        "tone": "purple",
        "sourceType": "演示推演",
        "desc": "工业电视识别结果为演示数据"
      },
      {
        "key": "aiAlerts",
        "label": "AI 提醒",
        "value": "4",
        "delta": "时序/轨迹",
        "tone": "blue",
        "sourceType": "演示推演",
        "desc": "模型告警用于辅助人工复核"
      }
    ],
    "taskQualityList": [
      {
        "id": "XJ-20260721-A-073",
        "time": "04:43",
        "worker": "廖震宇",
        "areaKey": "metering",
        "area": "计量区",
        "issue": "过滤器差压表单正常但趋势逼近阈值",
        "priority": "P1",
        "status": "待人工复核",
        "sourceType": "演示推演"
      },
      {
        "id": "XJ-20260721-A-041",
        "time": "04:18",
        "worker": "周文涛",
        "areaKey": "valve",
        "area": "阀组区",
        "issue": "两点位间隔过短,需核对是否快检",
        "priority": "P2",
        "status": "待抽查",
        "sourceType": "演示推演 / 待确认"
      },
      {
        "id": "XJ-20260721-A-088",
        "time": "03:56",
        "worker": "唐璐",
        "areaKey": "plc",
        "area": "PLC机房",
        "issue": "视频核验未识别到人员进入画面",
        "priority": "P2",
        "status": "待视频复核",
        "sourceType": "演示推演"
      },
      {
        "id": "XJ-20260721-A-112",
        "time": "03:44",
        "worker": "陈力",
        "areaKey": "power",
        "area": "配电间",
        "issue": "任务开始时间晚于计划窗口",
        "priority": "P3",
        "status": "已记录",
        "sourceType": "客户数据 + 待确认"
      }
    ],
    "workerQualityRanking": [
      {
        "name": "廖震宇",
        "team": "湘潭站 A 班",
        "score": 92,
        "tasks": 14,
        "risk": "1 个 P1 待复核",
        "sourceType": "客户数据 + 演示推演"
      },
      {
        "name": "周文涛",
        "team": "湘潭站 A 班",
        "score": 87,
        "tasks": 11,
        "risk": "2 个间隔异常",
        "sourceType": "演示推演 / 待确认"
      },
      {
        "name": "唐璐",
        "team": "湘潭站 B 班",
        "score": 84,
        "tasks": 9,
        "risk": "1 个视频核验疑点",
        "sourceType": "演示推演"
      },
      {
        "name": "陈力",
        "team": "湘潭站 B 班",
        "score": 79,
        "tasks": 8,
        "risk": "计划窗口偏移",
        "sourceType": "客户数据 + 待确认"
      }
    ],
    "routeAnomalies": [
      {
        "key": "metering-dp",
        "areaKey": "metering",
        "label": "差压趋势疑点",
        "x": 386,
        "y": 222,
        "priority": "P1",
        "sourceType": "演示推演",
        "action": "进入表单质检"
      },
      {
        "key": "valve-fast",
        "areaKey": "valve",
        "label": "区域间隔过短",
        "x": 165,
        "y": 352,
        "priority": "P2",
        "sourceType": "演示推演 / 待确认",
        "action": "查看轨迹详情"
      },
      {
        "key": "plc-video",
        "areaKey": "plc",
        "label": "视频核验疑点",
        "x": 782,
        "y": 318,
        "priority": "P2",
        "sourceType": "演示推演",
        "action": "查看视觉详情"
      }
    ],
    "aiAlerts": [
      {
        "id": "metering-filter-dp",
        "title": "过滤器差压接近阈值",
        "areaKey": "metering",
        "model": "时序模型",
        "priority": "P1",
        "summary": "差压趋势升至 0.097MPa,建议结合表单第73项人工复核。",
        "sourceType": "演示推演",
        "action": "查看时序证据"
      },
      {
        "id": "battery-voltage-drop",
        "title": "电池电压下降",
        "areaKey": "power",
        "model": "时序模型",
        "priority": "P1",
        "summary": "近 72h 电压斜率持续下探,建议人工复核供电状态。",
        "sourceType": "演示推演 / 待确认",
        "action": "查看时序证据"
      },
      {
        "id": "oil-tank-level-rise",
        "title": "污油罐液位增加",
        "areaKey": "pump",
        "model": "时序模型",
        "priority": "P2",
        "summary": "液位低速上行但未越限,建议下一班交接持续观察。",
        "sourceType": "演示推演",
        "action": "查看趋势证据"
      },
      {
        "id": "valve-route-interval",
        "title": "阀组区轨迹间隔过短",
        "areaKey": "valve",
        "model": "轨迹分析",
        "priority": "P2",
        "summary": "相邻点位间隔低于 10 秒,建议抽查是否快检。",
        "sourceType": "演示推演 / 待确认",
        "action": "查看轨迹明细"
      }
    ],
    "metricInsights": [
      {
        "key": "risk",
        "status": "当前风险",
        "title": "计量区高优先级疑点",
        "desc": "最高风险来自计量区,需人工复核。",
        "stats": [
          {
            "label": "级别",
            "value": "P1"
          },
          {
            "label": "区域",
            "value": "计量区"
          },
          {
            "label": "主线项",
            "value": "第73项"
          }
        ],
        "tags": [
          "当前风险",
          "计量区",
          "复核入口"
        ],
        "targetArea": "metering",
        "targetScene": "form",
        "taskIds": [
          "XJ-20260721-A-073"
        ],
        "alertIds": [
          "metering-filter-dp"
        ],
        "action": "查看风险详情"
      },
      {
        "key": "completion",
        "status": "巡检完成率",
        "title": "巡检完成率 96.8%",
        "desc": "长郴-湘潭站在统计周期内完成率保持高位,问题数同步纳入质量态势趋势。",
        "stats": [
          {
            "label": "机构",
            "value": "湘潭站"
          },
          {
            "label": "周期",
            "value": "5天"
          },
          {
            "label": "完成率",
            "value": "96.8%"
          }
        ],
        "tags": [
          "基础信息",
          "完成率",
          "趋势看板"
        ],
        "targetArea": "metering",
        "targetScene": "station",
        "taskIds": [],
        "alertIds": [],
        "action": "查看站场态势"
      },
      {
        "key": "issues",
        "status": "发现问题数",
        "title": "发现问题数 18",
        "desc": "当前问题由表单质检、规则异常、时序和视觉辅助证据共同汇总。",
        "stats": [
          {
            "label": "问题数",
            "value": "18"
          },
          {
            "label": "P1",
            "value": "3"
          },
          {
            "label": "最新",
            "value": "04:43"
          }
        ],
        "tags": [
          "问题总量",
          "告警流水",
          "人工复核"
        ],
        "targetArea": "metering",
        "targetScene": "form",
        "taskIds": [
          "XJ-20260721-A-073",
          "XJ-20260721-A-041"
        ],
        "alertIds": [],
        "action": "查看关联详情"
      },
      {
        "key": "duration",
        "status": "时长异常",
        "title": "巡检时长异常 5 次",
        "desc": "按低于 10 分钟的规则口径识别异常,用于发现过快完成或疑似漏检。",
        "stats": [
          {
            "label": "异常数",
            "value": "5"
          },
          {
            "label": "阈值",
            "value": "<10min"
          },
          {
            "label": "口径",
            "value": "待确认"
          }
        ],
        "tags": [
          "规则质检",
          "<10min",
          "待确认"
        ],
        "targetArea": "metering",
        "targetScene": "station",
        "taskIds": [],
        "alertIds": [],
        "action": "查看规则详情"
      },
      {
        "key": "interval",
        "status": "间隔异常",
        "title": "巡检间隔异常 7 次",
        "desc": "按区域内和区域间低于 10 秒的规则口径识别快检风险。",
        "stats": [
          {
            "label": "异常数",
            "value": "7"
          },
          {
            "label": "阈值",
            "value": "<10s"
          },
          {
            "label": "关联",
            "value": "轨迹"
          }
        ],
        "tags": [
          "规则质检",
          "<10s",
          "轨迹分析"
        ],
        "targetArea": "valve",
        "targetScene": "station",
        "taskIds": [
          "XJ-20260721-A-041"
        ],
        "alertIds": [
          "valve-route-interval"
        ],
        "action": "查看轨迹明细"
      },
      {
        "key": "offWindow",
        "status": "时段异常",
        "title": "巡检时段异常 2 次",
        "desc": "按工业电视时段偏差 30 分钟和无人员画面识别异常。",
        "stats": [
          {
            "label": "异常数",
            "value": "2"
          },
          {
            "label": "偏差",
            "value": "30min"
          },
          {
            "label": "来源",
            "value": "工业电视"
          }
        ],
        "tags": [
          "规则质检",
          "偏移30min",
          "工业电视"
        ],
        "targetArea": "plc",
        "targetScene": "form",
        "taskIds": [
          "XJ-20260721-A-088"
        ],
        "alertIds": [],
        "action": "查看视频复核"
      },
      {
        "key": "aiAlerts",
        "status": "AI 提醒",
        "title": "AI 智能分析提醒 4 条",
        "desc": "AI 提醒只辅助人工巡检,当前重点包含计量区差压、电池电压和污油罐液位。",
        "stats": [
          {
            "label": "提醒数",
            "value": "4"
          },
          {
            "label": "最高",
            "value": "P1"
          },
          {
            "label": "模型",
            "value": "时序/轨迹"
          }
        ],
        "tags": [
          "AI辅助",
          "时序模型",
          "人工确认"
        ],
        "targetArea": "power",
        "targetScene": "form",
        "taskIds": [],
        "alertIds": [
          "metering-filter-dp",
          "battery-voltage-drop",
          "oil-tank-level-rise",
          "valve-route-interval"
        ],
        "action": "查看 AI 关联项"
      }
    ],
    "businessCharts": {
      "taskTrend": {
        "labels": [
          "07-17",
          "07-18",
          "07-19",
          "07-20",
          "07-21"
        ],
        "planned": [
          48,
          50,
          49,
          51,
          52
        ],
        "completed": [
          46,
          48,
          47,
          50,
          51
        ],
        "issues": [
          11,
          14,
          12,
          16,
          18
        ],
        "sourceType": "客户数据 + 演示推演 / 待确认"
      },
      "resultDistribution": [
        {
          "name": "正常项",
          "value": 846,
          "sourceType": "客户数据 + 演示推演"
        },
        {
          "name": "待复核",
          "value": 18,
          "sourceType": "演示推演"
        },
        {
          "name": "已归档",
          "value": 7,
          "sourceType": "演示推演"
        }
      ],
      "anomalyTypes": [
        {
          "name": "时长异常",
          "value": 5,
          "sourceType": "演示推演 / 待确认"
        },
        {
          "name": "间隔异常",
          "value": 7,
          "sourceType": "演示推演 / 待确认"
        },
        {
          "name": "时段异常",
          "value": 2,
          "sourceType": "演示推演"
        }
      ],
      "aiModelTrend": {
        "labels": [
          "00:00",
          "01:00",
          "02:00",
          "03:00",
          "04:00"
        ],
        "timeSeries": [
          1,
          1,
          2,
          3,
          5
        ],
        "vision": [
          0,
          1,
          1,
          2,
          3
        ],
        "sourceType": "演示推演"
      }
    },
    "timeRanges": [
      {
        "key": "batch",
        "label": "本批次",
        "period": "2026-07-17 ~ 2026-07-21",
        "hint": "任务批次 XJ-20260721-A",
        "defaultFocus": "risk",
        "qualityMetrics": [
          {
            "key": "risk",
            "value": "P1",
            "delta": "1项"
          },
          {
            "key": "completion",
            "value": "96.8%",
            "delta": "+2.1%"
          },
          {
            "key": "issues",
            "value": "18",
            "delta": "P1 3"
          },
          {
            "key": "duration",
            "value": "5",
            "delta": "<10min"
          },
          {
            "key": "interval",
            "value": "7",
            "delta": "<10s"
          },
          {
            "key": "offWindow",
            "value": "2",
            "delta": "偏移30min"
          },
          {
            "key": "aiAlerts",
            "value": "4",
            "delta": "时序/轨迹"
          }
        ],
        "businessCharts": {
          "taskTrend": {
            "labels": [
              "07-17",
              "07-18",
              "07-19",
              "07-20",
              "07-21"
            ],
            "planned": [
              48,
              50,
              49,
              51,
              52
            ],
            "completed": [
              46,
              48,
              47,
              50,
              51
            ],
            "issues": [
              11,
              14,
              12,
              16,
              18
            ],
            "sourceType": "客户数据 + 演示推演 / 待确认"
          },
          "resultDistribution": [
            {
              "name": "正常项",
              "value": 846,
              "sourceType": "客户数据 + 演示推演"
            },
            {
              "name": "待复核",
              "value": 18,
              "sourceType": "演示推演"
            },
            {
              "name": "已归档",
              "value": 7,
              "sourceType": "演示推演"
            }
          ],
          "anomalyTypes": [
            {
              "name": "时长异常",
              "value": 5,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "间隔异常",
              "value": 7,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "时段异常",
              "value": 2,
              "sourceType": "演示推演"
            }
          ]
        },
        "taskIds": [
          "XJ-20260721-A-073",
          "XJ-20260721-A-041",
          "XJ-20260721-A-088"
        ],
        "alertIds": [
          "metering-filter-dp",
          "battery-voltage-drop",
          "oil-tank-level-rise",
          "valve-route-interval"
        ]
      },
      {
        "key": "24h",
        "label": "近24小时",
        "period": "2026-07-21 00:00 ~ 04:43",
        "hint": "今日巡检窗口",
        "defaultFocus": "risk",
        "qualityMetrics": [
          {
            "key": "risk",
            "value": "P1",
            "delta": "1项"
          },
          {
            "key": "completion",
            "value": "98.1%",
            "delta": "+0.8%"
          },
          {
            "key": "issues",
            "value": "6",
            "delta": "P1 1"
          },
          {
            "key": "duration",
            "value": "1",
            "delta": "<10min"
          },
          {
            "key": "interval",
            "value": "2",
            "delta": "<10s"
          },
          {
            "key": "offWindow",
            "value": "1",
            "delta": "偏移30min"
          },
          {
            "key": "aiAlerts",
            "value": "2",
            "delta": "时序/轨迹"
          }
        ],
        "businessCharts": {
          "taskTrend": {
            "labels": [
              "00:00",
              "01:00",
              "02:00",
              "03:00",
              "04:00"
            ],
            "planned": [
              8,
              10,
              11,
              12,
              12
            ],
            "completed": [
              8,
              10,
              11,
              11,
              12
            ],
            "issues": [
              1,
              1,
              2,
              4,
              6
            ],
            "sourceType": "演示推演 / 待确认"
          },
          "resultDistribution": [
            {
              "name": "正常项",
              "value": 146,
              "sourceType": "客户数据 + 演示推演 / 待确认"
            },
            {
              "name": "待复核",
              "value": 6,
              "sourceType": "演示推演"
            },
            {
              "name": "已归档",
              "value": 2,
              "sourceType": "演示推演"
            }
          ],
          "anomalyTypes": [
            {
              "name": "时长异常",
              "value": 1,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "间隔异常",
              "value": 2,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "时段异常",
              "value": 1,
              "sourceType": "演示推演"
            }
          ]
        },
        "taskIds": [
          "XJ-20260721-A-073",
          "XJ-20260721-A-041"
        ],
        "alertIds": [
          "metering-filter-dp",
          "valve-route-interval"
        ]
      },
      {
        "key": "1h",
        "label": "近1小时",
        "period": "2026-07-21 03:43 ~ 04:43",
        "hint": "最新巡检态势",
        "defaultFocus": "risk",
        "qualityMetrics": [
          {
            "key": "risk",
            "value": "P1",
            "delta": "1项"
          },
          {
            "key": "completion",
            "value": "100.0%",
            "delta": "已完成"
          },
          {
            "key": "issues",
            "value": "3",
            "delta": "P1 1"
          },
          {
            "key": "duration",
            "value": "0",
            "delta": "<10min"
          },
          {
            "key": "interval",
            "value": "1",
            "delta": "<10s"
          },
          {
            "key": "offWindow",
            "value": "0",
            "delta": "偏移30min"
          },
          {
            "key": "aiAlerts",
            "value": "1",
            "delta": "时序"
          }
        ],
        "businessCharts": {
          "taskTrend": {
            "labels": [
              "03:45",
              "04:00",
              "04:15",
              "04:30",
              "04:43"
            ],
            "planned": [
              2,
              3,
              4,
              5,
              5
            ],
            "completed": [
              2,
              3,
              4,
              5,
              5
            ],
            "issues": [
              0,
              1,
              1,
              2,
              3
            ],
            "sourceType": "演示推演"
          },
          "resultDistribution": [
            {
              "name": "正常项",
              "value": 32,
              "sourceType": "客户数据 + 演示推演 / 待确认"
            },
            {
              "name": "待复核",
              "value": 3,
              "sourceType": "演示推演"
            },
            {
              "name": "已归档",
              "value": 1,
              "sourceType": "演示推演"
            }
          ],
          "anomalyTypes": [
            {
              "name": "时长异常",
              "value": 0,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "间隔异常",
              "value": 1,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "时段异常",
              "value": 0,
              "sourceType": "演示推演"
            }
          ]
        },
        "taskIds": [
          "XJ-20260721-A-073"
        ],
        "alertIds": [
          "metering-filter-dp"
        ]
      },
      {
        "key": "7d",
        "label": "近7天",
        "period": "2026-07-15 ~ 2026-07-21",
        "hint": "周维度质量波动",
        "defaultFocus": "issues",
        "qualityMetrics": [
          {
            "key": "risk",
            "value": "P1",
            "delta": "2项"
          },
          {
            "key": "completion",
            "value": "95.9%",
            "delta": "+1.4%"
          },
          {
            "key": "issues",
            "value": "31",
            "delta": "P1 5"
          },
          {
            "key": "duration",
            "value": "8",
            "delta": "<10min"
          },
          {
            "key": "interval",
            "value": "12",
            "delta": "<10s"
          },
          {
            "key": "offWindow",
            "value": "4",
            "delta": "偏移30min"
          },
          {
            "key": "aiAlerts",
            "value": "4",
            "delta": "时序/视觉"
          }
        ],
        "businessCharts": {
          "taskTrend": {
            "labels": [
              "07-15",
              "07-16",
              "07-17",
              "07-18",
              "07-19",
              "07-20",
              "07-21"
            ],
            "planned": [
              44,
              46,
              48,
              50,
              49,
              51,
              52
            ],
            "completed": [
              41,
              43,
              46,
              48,
              47,
              50,
              51
            ],
            "issues": [
              9,
              13,
              11,
              14,
              12,
              16,
              18
            ],
            "sourceType": "客户数据 + 演示推演 / 待确认"
          },
          "resultDistribution": [
            {
              "name": "正常项",
              "value": 1480,
              "sourceType": "客户数据 + 演示推演 / 待确认"
            },
            {
              "name": "待复核",
              "value": 31,
              "sourceType": "演示推演"
            },
            {
              "name": "已归档",
              "value": 13,
              "sourceType": "演示推演"
            }
          ],
          "anomalyTypes": [
            {
              "name": "时长异常",
              "value": 8,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "间隔异常",
              "value": 12,
              "sourceType": "演示推演 / 待确认"
            },
            {
              "name": "时段异常",
              "value": 4,
              "sourceType": "演示推演"
            }
          ]
        },
        "taskIds": [
          "XJ-20260721-A-073",
          "XJ-20260721-A-041",
          "XJ-20260721-A-088"
        ],
        "alertIds": [
          "metering-filter-dp",
          "battery-voltage-drop",
          "oil-tank-level-rise",
          "valve-route-interval"
        ]
      }
    ]
  },
  "knowledge": {
    "documents": [
      {
        "id": "DOC-001",
        "title": "油气站场巡检及交接班工作指引",
        "type": "制度",
        "tags": [
          "巡检制度",
          "交接班",
          "复检步骤"
        ],
        "status": "已入库",
        "updated": "2026-07-18",
        "size": "2.4MB",
        "summary": "覆盖站场巡检、复检步骤、交接班关注项和异常闭环要求。",
        "preview": "过滤分离器差压接近阈值时，应核对现场差压表、趋势曲线与交接班关注项。",
        "sourceType": "演示推演"
      },
      {
        "id": "DOC-002",
        "title": "长郴-湘潭站巡检质量核心指标",
        "type": "指标口径",
        "tags": [
          "完成率",
          "快检",
          "漏检",
          "时段异常"
        ],
        "status": "待口径确认",
        "updated": "2026-07-20",
        "size": "186KB",
        "summary": "定义巡检完成率、发现问题数、时长异常、间隔异常、时段异常和 AI 提醒口径。",
        "preview": "巡检时间间隔异常按区域内低于 10 秒、区域之间低于 10 秒进行演示判定。",
        "sourceType": "客户材料 + 待确认"
      },
      {
        "id": "DOC-003",
        "title": "计量区过滤器差压复检报告",
        "type": "归档案例",
        "tags": [
          "计量区",
          "差压趋势",
          "表单冲突"
        ],
        "status": "演示归档",
        "updated": "2026-07-21",
        "size": "428KB",
        "summary": "沉淀计量区差压趋势接近阈值时的复检清单、报告结构和交接班建议。",
        "preview": "本次复检结论用于后续相似差压趋势疑点的 Agent 问答引用。",
        "sourceType": "演示推演"
      }
    ],
    "cases": [
      {
        "id": "CASE-XJ-20260721-001",
        "title": "计量区过滤器差压趋势复检案例",
        "areaKey": "metering",
        "status": "归档后可复用",
        "summary": "表单填写正常,时序趋势接近阈值,人工复检后沉淀为同类案例。",
        "sourceType": "演示推演"
      },
      {
        "id": "CASE-XJ-20260721-002",
        "title": "阀组区快检抽查案例",
        "areaKey": "valve",
        "status": "待归档",
        "summary": "区域间隔低于阈值,需结合轨迹和视频核验是否快检。",
        "sourceType": "演示推演 / 待确认"
      }
    ],
    "graph": {
      "nodes": [
        {
          "id": "rule-duration",
          "label": "时长规则",
          "type": "制度条款",
          "x": 130,
          "y": 90
        },
        {
          "id": "task-073",
          "label": "第73项巡检",
          "type": "巡检项",
          "x": 330,
          "y": 150
        },
        {
          "id": "trend-dp",
          "label": "差压趋势",
          "type": "时序指标",
          "x": 530,
          "y": 90
        },
        {
          "id": "frame-plc",
          "label": "现场关键帧",
          "type": "视觉证据",
          "x": 550,
          "y": 260
        },
        {
          "id": "agent-advice",
          "label": "复检建议",
          "type": "Agent 问答",
          "x": 330,
          "y": 330
        },
        {
          "id": "report-case",
          "label": "归档案例",
          "type": "复检报告",
          "x": 130,
          "y": 260
        }
      ],
      "links": [
        {
          "from": "rule-duration",
          "to": "task-073",
          "label": "约束"
        },
        {
          "from": "task-073",
          "to": "trend-dp",
          "label": "触发"
        },
        {
          "from": "trend-dp",
          "to": "agent-advice",
          "label": "证据"
        },
        {
          "from": "frame-plc",
          "to": "agent-advice",
          "label": "补证"
        },
        {
          "from": "agent-advice",
          "to": "report-case",
          "label": "人工确认"
        },
        {
          "from": "report-case",
          "to": "rule-duration",
          "label": "沉淀"
        }
      ]
    },
    "qaExamples": [
      {
        "q": "为什么不能直接让 AI 下异常结论?",
        "a": "AI 负责把表单、轨迹、时序和视觉证据汇总成复检建议,最终确认仍由人工完成。"
      },
      {
        "q": "归档案例对下一次检查有什么帮助?",
        "a": "下一次遇到相似差压趋势疑点时,Agent 可以引用历史复检清单、报告结构和交接班关注项。"
      },
      {
        "q": "哪些指标目前还需要客户补充?",
        "a": "秒级轨迹时间、区域边界、真实视频识别结果、时序库字段和问题判定规则仍需后续对齐。"
      }
    ],
    "rag": {
      "profiles": [
        {
          "docId": "DOC-001",
          "pipeline": [
            {
              "key": "upload",
              "label": "上传",
              "value": "制度",
              "desc": "巡检制度进入待解析队列"
            },
            {
              "key": "parse",
              "label": "解析",
              "value": "12页",
              "desc": "抽取巡检、复检、交接班条款"
            },
            {
              "key": "chunk",
              "label": "切片",
              "value": "86段",
              "desc": "按设备、指标和处置步骤拆分"
            },
            {
              "key": "embed",
              "label": "向量化",
              "value": "1024维",
              "desc": "生成制度条款检索向量"
            },
            {
              "key": "index",
              "label": "入库",
              "value": "已完成",
              "desc": "写入演示向量索引"
            },
            {
              "key": "search",
              "label": "可检索",
              "value": "TopK",
              "desc": "Agent 可引用制度来源"
            }
          ],
          "chunks": [
            {
              "id": "doc001-threshold",
              "title": "过滤分离器差压标准",
              "text": "过滤分离器差压应小于 0.1MPa，接近阈值时需要复核现场仪表和趋势。",
              "tokens": 182,
              "tags": [
                "计量区",
                "差压",
                "阈值"
              ]
            },
            {
              "id": "doc001-recheck-step",
              "title": "差压复核步骤",
              "text": "复检需核对现场差压表、设备铭牌、趋势曲线和巡检表填写结果。",
              "tokens": 164,
              "tags": [
                "复检",
                "人工确认",
                "交接班"
              ]
            },
            {
              "id": "doc001-handover",
              "title": "交接班关注项",
              "text": "交接班应说明本班异常、处置建议和下一班持续观察指标。",
              "tokens": 146,
              "tags": [
                "交接班",
                "闭环",
                "观察"
              ]
            }
          ],
          "retrieval": {
            "query": "过滤器差压接近 0.1MPa 是否需要复检?",
            "topK": [
              {
                "chunkId": "doc001-threshold",
                "score": 0.91,
                "source": "油气站场巡检及交接班工作指引"
              },
              {
                "chunkId": "doc001-recheck-step",
                "score": 0.87,
                "source": "油气站场巡检及交接班工作指引"
              },
              {
                "chunkId": "doc001-handover",
                "score": 0.78,
                "source": "油气站场巡检及交接班工作指引"
              }
            ]
          },
          "agentAnswer": {
            "text": "建议人工复核现场差压表，并将差压趋势纳入交接班持续观察。AI 只提供证据汇总和复检建议，最终结论由人工确认。",
            "citations": [
              "doc001-threshold",
              "doc001-recheck-step",
              "doc001-handover"
            ]
          },
          "feedback": [
            {
              "label": "历史案例",
              "before": 7,
              "after": 8
            },
            {
              "label": "知识节点",
              "before": 42,
              "after": 45
            },
            {
              "label": "可检索片段",
              "before": 184,
              "after": 270
            }
          ]
        },
        {
          "docId": "DOC-002",
          "pipeline": [
            {
              "key": "upload",
              "label": "上传",
              "value": "指标",
              "desc": "指标口径进入待解析队列"
            },
            {
              "key": "parse",
              "label": "解析",
              "value": "8项",
              "desc": "识别完成率、时长、间隔和时段规则"
            },
            {
              "key": "chunk",
              "label": "切片",
              "value": "45段",
              "desc": "按质量指标和判定条件拆分"
            },
            {
              "key": "embed",
              "label": "向量化",
              "value": "1024维",
              "desc": "生成指标口径检索向量"
            },
            {
              "key": "index",
              "label": "入库",
              "value": "待确认",
              "desc": "保留客户口径确认标记"
            },
            {
              "key": "search",
              "label": "可检索",
              "value": "TopK",
              "desc": "Agent 可解释指标来源"
            }
          ],
          "chunks": [
            {
              "id": "doc002-completion",
              "title": "巡检完成率口径",
              "text": "巡检完成率用于衡量计划任务与实际完成任务的覆盖情况。",
              "tokens": 132,
              "tags": [
                "完成率",
                "任务",
                "覆盖"
              ]
            },
            {
              "id": "doc002-fast-check",
              "title": "快检疑点口径",
              "text": "区域内检查间隔低于 10 秒或区域之间间隔低于 10 秒，进入快检疑点。",
              "tokens": 174,
              "tags": [
                "间隔异常",
                "快检",
                "轨迹"
              ]
            },
            {
              "id": "doc002-off-window",
              "title": "时段异常口径",
              "text": "工业电视时段、巡检到位时间和任务计划窗口偏差过大时，需要人工复核。",
              "tokens": 158,
              "tags": [
                "时段异常",
                "视频",
                "人工复核"
              ]
            }
          ],
          "retrieval": {
            "query": "如何解释巡检快检和时段异常指标?",
            "topK": [
              {
                "chunkId": "doc002-fast-check",
                "score": 0.9,
                "source": "长郴-湘潭站巡检质量核心指标"
              },
              {
                "chunkId": "doc002-off-window",
                "score": 0.86,
                "source": "长郴-湘潭站巡检质量核心指标"
              },
              {
                "chunkId": "doc002-completion",
                "score": 0.8,
                "source": "长郴-湘潭站巡检质量核心指标"
              }
            ]
          },
          "agentAnswer": {
            "text": "快检和时段异常用于辅助判断人工巡检质量：系统先提示疑点，再由管理人员结合轨迹、视频和表单明细确认。",
            "citations": [
              "doc002-fast-check",
              "doc002-off-window",
              "doc002-completion"
            ]
          },
          "feedback": [
            {
              "label": "指标节点",
              "before": 18,
              "after": 21
            },
            {
              "label": "规则片段",
              "before": 64,
              "after": 83
            },
            {
              "label": "待确认口径",
              "before": 5,
              "after": 4
            }
          ]
        },
        {
          "docId": "DOC-003",
          "pipeline": [
            {
              "key": "upload",
              "label": "归档",
              "value": "案例",
              "desc": "复检报告沉淀为案例文档"
            },
            {
              "key": "parse",
              "label": "解析",
              "value": "结论",
              "desc": "抽取异常、证据、处置和结论"
            },
            {
              "key": "chunk",
              "label": "切片",
              "value": "32段",
              "desc": "按证据链和复检动作拆分"
            },
            {
              "key": "embed",
              "label": "向量化",
              "value": "1024维",
              "desc": "生成相似案例检索向量"
            },
            {
              "key": "index",
              "label": "入库",
              "value": "可复用",
              "desc": "写入案例库和问答上下文"
            },
            {
              "key": "search",
              "label": "可检索",
              "value": "相似案例",
              "desc": "供下一次表单 Agent 引用"
            }
          ],
          "chunks": [
            {
              "id": "doc003-conflict",
              "title": "表单与趋势冲突",
              "text": "巡检表记录正常，但差压趋势连续升高并接近阈值，需进入人工复检。",
              "tokens": 148,
              "tags": [
                "表单冲突",
                "趋势",
                "复检"
              ]
            },
            {
              "id": "doc003-evidence",
              "title": "证据组合",
              "text": "案例引用巡检表、趋势曲线、关键帧和人工确认结论作为完整证据链。",
              "tokens": 166,
              "tags": [
                "证据链",
                "视觉",
                "人工确认"
              ]
            },
            {
              "id": "doc003-next-pass",
              "title": "二次巡检引用方式",
              "text": "下一次相似差压异常时，Agent 可引用本案例补充复检建议和交接班要点。",
              "tokens": 152,
              "tags": [
                "二次巡检",
                "知识复用",
                "Agent"
              ]
            }
          ],
          "retrieval": {
            "query": "相似差压案例对本次复检有什么帮助?",
            "topK": [
              {
                "chunkId": "doc003-conflict",
                "score": 0.93,
                "source": "计量区过滤器差压复检报告"
              },
              {
                "chunkId": "doc003-evidence",
                "score": 0.89,
                "source": "计量区过滤器差压复检报告"
              },
              {
                "chunkId": "doc003-next-pass",
                "score": 0.85,
                "source": "计量区过滤器差压复检报告"
              }
            ]
          },
          "agentAnswer": {
            "text": "该归档案例可作为相似异常的上下文：说明为什么表单正常仍要复核，并提示应补充趋势、视觉帧和人工确认结论。",
            "citations": [
              "doc003-conflict",
              "doc003-evidence",
              "doc003-next-pass"
            ]
          },
          "feedback": [
            {
              "label": "案例节点",
              "before": 7,
              "after": 8
            },
            {
              "label": "证据片段",
              "before": 28,
              "after": 35
            },
            {
              "label": "问答模板",
              "before": 11,
              "after": 14
            }
          ]
        },
        {
          "docId": "DOC-UPLOAD-001",
          "pipeline": [
            {
              "key": "upload",
              "label": "上传",
              "value": "1份",
              "desc": "补充说明进入演示上传队列"
            },
            {
              "key": "parse",
              "label": "解析",
              "value": "4页",
              "desc": "抽取时段异常和视频复核条款"
            },
            {
              "key": "chunk",
              "label": "切片",
              "value": "19段",
              "desc": "按时间偏差、摄像机和区域拆分"
            },
            {
              "key": "embed",
              "label": "向量化",
              "value": "1024维",
              "desc": "生成上传文档检索向量"
            },
            {
              "key": "index",
              "label": "入库",
              "value": "刚完成",
              "desc": "写入临时演示索引"
            },
            {
              "key": "search",
              "label": "可检索",
              "value": "TopK",
              "desc": "上传后立即可被 Agent 引用"
            }
          ],
          "chunks": [
            {
              "id": "upload-tv-window",
              "title": "工业电视时段偏差",
              "text": "工业电视画面与巡检到位时间偏差超过 30 分钟时，应进入人工复核。",
              "tokens": 126,
              "tags": [
                "工业电视",
                "时段异常",
                "人工复核"
              ]
            },
            {
              "id": "upload-power-room",
              "title": "配电间补充说明",
              "text": "配电间巡检需结合门禁、摄像机和表单到位时间判断是否存在漏检。",
              "tokens": 142,
              "tags": [
                "配电间",
                "漏检",
                "门禁"
              ]
            },
            {
              "id": "upload-ai-remind",
              "title": "AI 提醒边界",
              "text": "AI 提醒只给出疑点和证据来源，最终处置仍需人工确认和归档。",
              "tokens": 118,
              "tags": [
                "AI 提醒",
                "人工确认",
                "归档"
              ]
            }
          ],
          "retrieval": {
            "query": "上传的补充说明如何影响时段异常复核?",
            "topK": [
              {
                "chunkId": "upload-tv-window",
                "score": 0.94,
                "source": "巡检标准补充说明"
              },
              {
                "chunkId": "upload-power-room",
                "score": 0.88,
                "source": "巡检标准补充说明"
              },
              {
                "chunkId": "upload-ai-remind",
                "score": 0.84,
                "source": "巡检标准补充说明"
              }
            ]
          },
          "agentAnswer": {
            "text": "上传文档补充了时段异常的判定边界：系统会把视频时间、到位时间和表单结果并列给出，人工再确认是否漏检或快检。",
            "citations": [
              "upload-tv-window",
              "upload-power-room",
              "upload-ai-remind"
            ]
          },
          "feedback": [
            {
              "label": "上传文档",
              "before": 3,
              "after": 4
            },
            {
              "label": "新增片段",
              "before": 184,
              "after": 203
            },
            {
              "label": "可引用规则",
              "before": 42,
              "after": 45
            }
          ]
        }
      ]
    }
  },
  "areas": {
    "metering": {
      "title": "计量区过滤器差压疑点",
      "short": "计量区",
      "overviewTitle": "计量区表单质检入口",
      "overviewDesc": "本轮主线从计量区巡检表进入,先核对第 73 项表单记录,再进入模型证据页。",
      "overviewStatus": "待质检",
      "overviewAction": "进入表单质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "60-105"
        },
        {
          "label": "重点项",
          "value": "第 73 项"
        },
        {
          "label": "后续页面",
          "value": "时序/视觉"
        }
      ],
      "sub": "表单填写正常,趋势曲线接近 0.1MPa 阈值,建议生成复检清单。",
      "badge": "高优先级复检",
      "badgeTone": "warn",
      "trendKey": "filterDp",
      "evidence": "巡检记录第 73 项显示“计量区 / 过滤器 / 差压”结果正常;趋势数据提示接近阈值,形成表单与时序冲突。",
      "tags": [
        "表单冲突",
        "时序趋势",
        "0.1MPa",
        "需复检"
      ],
      "assets": [
        "表单 60-105",
        "差压 GL-11",
        "污油罐压力/液位",
        "泵棚/PLC 联动帧"
      ],
      "quality": {
        "title": "第73项填写正常,但差压趋势已逼近阈值",
        "text": "AI 不直接改写表单结果,只把“正常填写”和“趋势近阈值”的差异升级为复检疑点。",
        "facts": [
          "表单结果: 正常",
          "规则阈值: <0.1MPa",
          "趋势末值: 0.097MPa",
          "动作: 生成复检清单"
        ]
      },
      "formExplain": [
        {
          "title": "先看填写事实",
          "desc": "过滤器差压在巡检表中被填写为“正常”,这是 AI 不能直接覆盖的原始记录。"
        },
        {
          "title": "再看系统质检",
          "desc": "同一设备的趋势数据接近阈值,系统只标记冲突,不自动下异常结论。"
        },
        {
          "title": "保留人工边界",
          "desc": "复检结论仍由人员确认,页面只负责把疑点、证据和清单串起来。"
        }
      ],
      "auxiliaryOnly": false,
      "questions": [
        {
          "q": "计量区为什么出现在本轮 demo?",
          "a": "本轮唯一高优先级疑点。表单第 73 项填写正常,但差压趋势接近 0.1MPa 阈值。"
        },
        {
          "q": "计量区主要看哪些数据?",
          "a": "表单 60-105、差压 GL-11、污油罐压力/液位、泵棚/PLC 联动帧"
        },
        {
          "q": "计量区本轮结论是什么?",
          "a": "AI 不直接改写表单结果,只把“正常填写”和“趋势近阈值”的差异升级为复检疑点。"
        }
      ],
      "lifecycle": {
        "role": "primary-risk-flow",
        "primaryFlow": true,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对表单,并联查看时序、视觉、规则和 Agent 建议"
          },
          {
            "scene": "recheck",
            "purpose": "生成复检清单并保留人工确认边界"
          },
          {
            "scene": "report",
            "purpose": "将复检结论沉淀为报告和案例"
          }
        ],
        "terminalState": "复检确认后进入报告归档"
      },
      "caseKnowledge": {
        "schemaVersion": 1,
        "areaKey": "metering",
        "caseId": "CASE-XJ-20260721-001",
        "title": "计量区过滤器差压趋势复检案例",
        "firstPass": {
          "label": "当前检查",
          "summary": "人工完成现场巡检并填写表单,AI 围绕计量区过滤器差压疑点提供异常处置辅助。",
          "sources": [
            {
              "text": "当前巡检表第 73 项",
              "type": "current"
            },
            {
              "text": "72h 差压趋势",
              "type": "current"
            },
            {
              "text": "现场关键帧",
              "type": "current"
            },
            {
              "text": "差压阈值规则",
              "type": "standard"
            },
            {
              "text": "复检步骤",
              "type": "standard"
            }
          ],
          "questions": [
            {
              "q": "为什么第 73 项需要复检?",
              "a": "第 73 项“过滤器差压”在表单中填写为正常,但 72h 差压趋势末值达到 0.097MPa,接近 0.1MPa 阈值。AI 只能把它升级为复检疑点,最终结论仍需人工现场确认。"
            },
            {
              "q": "现场复检优先看什么?",
              "a": "优先核对过滤器差压表读数、过滤器铭牌、过滤器前后状态和设备周边环境,同时补拍差压表和周边状态,用于和趋势数据交叉验证。"
            },
            {
              "q": "当前能否直接改成异常?",
              "a": "不能。AI 发现的是“表单正常”和“趋势近阈值”的冲突,不是现场异常结论。是否确认异常、误报关闭或继续观察,必须由人工复检后选择。"
            },
            {
              "q": "交接班要怎么提醒?",
              "a": "建议写入“关注计量区过滤器差压变化,如趋势继续抬升,下一班应复核现场差压表和过滤器状态”。"
            }
          ]
        },
        "archivedCase": {
          "label": "已归档案例",
          "summary": "人工复检结论和报告摘要沉淀为案例,可在下一次同类检查中作为知识来源。",
          "sources": [
            {
              "text": "复检结论",
              "type": "archive"
            },
            {
              "text": "归档报告",
              "type": "archive"
            },
            {
              "text": "交接班关注项",
              "type": "archive"
            },
            {
              "text": "案例标签",
              "type": "archive"
            },
            {
              "text": "处置建议",
              "type": "archive"
            }
          ],
          "facts": [
            "案例编号: CASE-XJ-20260721-001",
            "对象: 计量区 / 过滤器 / 差压",
            "触发: 表单正常但趋势接近阈值",
            "复检: 需要现场差压表、铭牌和周边状态",
            "边界: 后续只能引用案例辅助判断,不能直接沿用结论"
          ]
        },
        "secondPass": {
          "label": "命中历史案例",
          "summary": "Agent 仍围绕当前差压疑点回答,但可额外引用已归档案例,让复检建议更有上下文。",
          "sources": [
            {
              "text": "当前巡检表第 73 项",
              "type": "current"
            },
            {
              "text": "当前 72h 差压趋势",
              "type": "current"
            },
            {
              "text": "当前现场关键帧",
              "type": "current"
            },
            {
              "text": "差压阈值规则",
              "type": "standard"
            },
            {
              "text": "历史案例 CASE-XJ-20260721-001",
              "type": "case"
            }
          ],
          "questions": [
            {
              "q": "这次和历史案例是否相似?",
              "a": "相似点是对象同为计量区过滤器差压,且都出现“表单正常但趋势接近阈值”的模式。不同点仍需结合本次趋势末值、现场帧和人工复检结果确认。"
            },
            {
              "q": "本次复检重点是否变化?",
              "a": "基础复检重点不变:差压表、铭牌、过滤器周边状态。因为命中历史案例,建议额外对比上次复检照片、报告摘要和交接班建议,确认是否存在重复趋势。"
            },
            {
              "q": "如果趋势继续抬升,建议怎么处理?",
              "a": "建议从“继续观察”升级为“现场重点复核”,并将差压变化纳入交接班重点。是否确认异常仍由人工根据现场差压表和设备状态决定。"
            },
            {
              "q": "能否沿用上次报告?",
              "a": "不能沿用结论,只能复用报告结构、证据项和复检清单。本次报告必须基于当前表单、趋势、视觉帧和人工复检结论重新生成。"
            }
          ]
        }
      }
    },
    "valve": {
      "title": "阀组区巡检正常对照",
      "short": "阀组区",
      "overviewTitle": "阀组区表单记录",
      "overviewDesc": "本轮路线已覆盖阀组区表单,可从区域质检查看表单、趋势和现场帧。",
      "overviewStatus": "区域覆盖",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "1-59"
        },
        {
          "label": "入口",
          "value": "区域质检"
        },
        {
          "label": "数据包",
          "value": "已就绪"
        }
      ],
      "sub": "说明不是所有区域都报异常,主线风险集中在计量区。",
      "badge": "正常对照",
      "badgeTone": "ok",
      "trendKey": "valveStable",
      "evidence": "正常对照用于说明系统按风险聚焦,不对低风险区域产生无效告警。",
      "tags": [
        "正常对照",
        "路线覆盖",
        "低风险"
      ],
      "assets": [
        "表单 1-59",
        "阀组状态趋势",
        "路线视觉帧",
        "相邻点位对照"
      ],
      "quality": {
        "title": "阀组区表单完整,当前作为正常对照",
        "text": "阀组区表单条目多、路线覆盖强,适合作为低风险区域样本,证明系统按风险聚焦。",
        "facts": [
          "表单覆盖: 59 项",
          "趋势状态: 平稳",
          "视觉证据: 路线帧",
          "动作: 保持正常对照"
        ]
      },
      "formExplain": [
        {
          "title": "覆盖面足够",
          "desc": "阀组区表单条目数量最多,适合展示普通区域如何被完整质检。"
        },
        {
          "title": "不制造无效告警",
          "desc": "趋势平稳时页面只展示覆盖和对照,不强行进入异常闭环。"
        },
        {
          "title": "后续可补阀位帧",
          "desc": "数据结构已保留视觉证据入口,后续补图像帧不需要改页面结构。"
        }
      ],
      "auxiliaryOnly": true,
      "questions": [
        {
          "q": "阀组区为什么出现在本轮 demo?",
          "a": "本轮路线已覆盖,未发现异常趋势,用于说明系统按风险聚焦。"
        },
        {
          "q": "阀组区主要看哪些数据?",
          "a": "表单 1-59、阀组状态趋势、路线视觉帧、相邻点位对照"
        },
        {
          "q": "阀组区本轮结论是什么?",
          "a": "阀组区表单条目多、路线覆盖强,适合作为低风险区域样本,证明系统按风险聚焦。"
        }
      ],
      "lifecycle": {
        "role": "normal-contrast",
        "primaryFlow": false,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对该区域表单,并联查看趋势和现场帧"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "pump": {
      "title": "泵区现场视频帧复核",
      "short": "泵区",
      "overviewTitle": "泵区表单记录",
      "overviewDesc": "本轮路线已覆盖泵区表单,可从区域质检继续查看趋势和现场帧。",
      "overviewStatus": "区域覆盖",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "106-138"
        },
        {
          "label": "入口",
          "value": "区域质检"
        },
        {
          "label": "数据包",
          "value": "已就绪"
        }
      ],
      "sub": "切换关键帧,核对设备状态与巡检记录一致性。",
      "badge": "视觉证据",
      "badgeTone": "info",
      "trendKey": "pumpStable",
      "evidence": "泵区关键帧用于核对现场视频抽查结果,可在报告页作为辅助证据,不改变主线复检判断。",
      "tags": [
        "视频帧",
        "辅助证据",
        "泵棚",
        "正常对照"
      ],
      "assets": [
        "表单 106-138",
        "泵健康度趋势",
        "P-4 泵棚关键帧",
        "PLC 联动帧"
      ],
      "quality": {
        "title": "泵区表单与视频帧一致,作为视觉辅助",
        "text": "该区域展示设备外观、泵棚环境和运行健康度的正常对照,不进入主线复检。",
        "facts": [
          "表单覆盖: 泵棚设备",
          "趋势状态: 平稳",
          "视觉证据: 2 帧",
          "动作: 保留为报告辅证"
        ]
      },
      "formExplain": [
        {
          "title": "表单覆盖泵棚设备",
          "desc": "先确认泵区关键巡检项均有记录,避免只看图像忽略表单事实。"
        },
        {
          "title": "趋势用于正常对照",
          "desc": "运行健康度保持平稳,说明 AI 不是对全站区域平均报错。"
        },
        {
          "title": "视觉只做补证",
          "desc": "P-4 泵棚关键帧用于补充设备状态和现场语境。"
        }
      ],
      "auxiliaryOnly": true,
      "questions": [
        {
          "q": "泵区为什么出现在本轮 demo?",
          "a": "现场关键帧可作为设备状态辅助证据,本轮不进入高优先级异常闭环。"
        },
        {
          "q": "泵区主要看哪些数据?",
          "a": "表单 106-138、泵健康度趋势、P-4 泵棚关键帧、PLC 联动帧"
        },
        {
          "q": "泵区本轮结论是什么?",
          "a": "该区域展示设备外观、泵棚环境和运行健康度的正常对照,不进入主线复检。"
        }
      ],
      "lifecycle": {
        "role": "visual-evidence",
        "primaryFlow": false,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对该区域表单,并联查看趋势和现场帧"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "control": {
      "title": "站控室视频与数据核对",
      "short": "站控室",
      "overviewTitle": "站控室表单记录",
      "overviewDesc": "本轮路线已覆盖站控室表单,可从区域质检继续查看趋势和现场帧。",
      "overviewStatus": "区域覆盖",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "179-200"
        },
        {
          "label": "入口",
          "value": "区域质检"
        },
        {
          "label": "数据包",
          "value": "已就绪"
        }
      ],
      "sub": "站控室用于核对视频质量、回放质量和关键参数。",
      "badge": "站控核对",
      "badgeTone": "info",
      "trendKey": "videoQuality",
      "evidence": "统计截图可作为报告背景或管理侧材料,不进入主线规则。",
      "tags": [
        "工业电视",
        "抽查统计",
        "背景材料"
      ],
      "assets": [
        "表单 179-200",
        "视频质量趋势",
        "视频抽查统计图",
        "PLC 联动帧"
      ],
      "quality": {
        "title": "站控室用于管理侧视频质量核对",
        "text": "站控室不是设备异常主线,重点展示工业电视、回放质量和系统状态是否可支撑报告背景。",
        "facts": [
          "表单对象: 工业电视/站控机",
          "视频质量: 9/10",
          "材料类型: 统计截图",
          "动作: 作为管理侧背景"
        ]
      },
      "formExplain": [
        {
          "title": "先看管理侧表单",
          "desc": "站控室条目关注工业电视、监控画面、站控机和通信状态。"
        },
        {
          "title": "视频质量作为材料",
          "desc": "抽查统计图用于说明素材质量,不直接触发设备异常。"
        },
        {
          "title": "结论边界清楚",
          "desc": "当前只进入报告背景和证据说明,不推进复检闭环。"
        }
      ],
      "auxiliaryOnly": true,
      "questions": [
        {
          "q": "站控室为什么出现在本轮 demo?",
          "a": "用于管理侧视频质量和参数核对,当前没有高优先级异常。"
        },
        {
          "q": "站控室主要看哪些数据?",
          "a": "表单 179-200、视频质量趋势、视频抽查统计图、PLC 联动帧"
        },
        {
          "q": "站控室本轮结论是什么?",
          "a": "站控室不是设备异常主线,重点展示工业电视、回放质量和系统状态是否可支撑报告背景。"
        }
      ],
      "lifecycle": {
        "role": "management-background",
        "primaryFlow": false,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对该区域表单,并联查看趋势和现场帧"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "plc": {
      "title": "PLC 机房灯态抽查",
      "short": "PLC机房",
      "overviewTitle": "PLC 机房表单记录",
      "overviewDesc": "本轮路线已覆盖 PLC 机房表单,可从区域质检继续查看趋势和现场帧。",
      "overviewStatus": "区域覆盖",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "285-315"
        },
        {
          "label": "入口",
          "value": "区域质检"
        },
        {
          "label": "数据包",
          "value": "已就绪"
        }
      ],
      "sub": "切换到 PLC 机房关键帧,识别指示灯、柜体区域和状态标签。",
      "badge": "灯态识别",
      "badgeTone": "info",
      "trendKey": "plcHealth",
      "evidence": "PLC 机房关键帧适合补充视觉证据:识别灯态、柜体区域和状态标签。",
      "tags": [
        "PLC",
        "指示灯",
        "视觉证据",
        "备用证据"
      ],
      "assets": [
        "表单 285-315",
        "通讯健康度趋势",
        "PLC 机房关键帧",
        "低压柜联动帧"
      ],
      "quality": {
        "title": "PLC 机房灯态和通讯健康度一致",
        "text": "灯态识别结果与通讯健康度趋势互相印证,当前作为设备状态抽查材料。",
        "facts": [
          "表单对象: PLC机柜",
          "趋势状态: 95%+",
          "视觉证据: 灯态识别",
          "动作: 归入备用证据"
        ]
      },
      "formExplain": [
        {
          "title": "锁定柜体巡检项",
          "desc": "表单页优先展示 PLC 机柜、模块、指示灯等可被视觉核验的条目。"
        },
        {
          "title": "联动通讯趋势",
          "desc": "通讯健康度趋势稳定,支撑“抽查正常”的质检判断。"
        },
        {
          "title": "保留供电侧关联",
          "desc": "可切换低压配电室帧,说明 PLC 状态与供电侧材料能关联查看。"
        }
      ],
      "auxiliaryOnly": true,
      "questions": [
        {
          "q": "PLC机房为什么出现在本轮 demo?",
          "a": "用于核验柜体、灯态和供电侧状态,作为视觉证据补充而非异常结论。"
        },
        {
          "q": "PLC机房主要看哪些数据?",
          "a": "表单 285-315、通讯健康度趋势、PLC 机房关键帧、低压柜联动帧"
        },
        {
          "q": "PLC机房本轮结论是什么?",
          "a": "灯态识别结果与通讯健康度趋势互相印证,当前作为设备状态抽查材料。"
        }
      ],
      "lifecycle": {
        "role": "visual-evidence",
        "primaryFlow": false,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对该区域表单,并联查看趋势和现场帧"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "power": {
      "title": "配电间供电侧核验",
      "short": "配电间",
      "overviewTitle": "配电间表单记录",
      "overviewDesc": "本轮路线已覆盖配电间表单,可从区域质检继续查看趋势和现场帧。",
      "overviewStatus": "区域覆盖",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "表单范围",
          "value": "250/259"
        },
        {
          "label": "入口",
          "value": "区域质检"
        },
        {
          "label": "数据包",
          "value": "已就绪"
        }
      ],
      "sub": "配电间展示供电侧表单、三相电压趋势和低压配电室关键帧的闭环。",
      "badge": "供电侧核验",
      "badgeTone": "ok",
      "trendKey": "powerStable",
      "evidence": "配电间使用低压配电室关键帧核对柜体状态,并用三相电压趋势作为正常对照。",
      "tags": [
        "低压配电室",
        "三相电压",
        "供电侧",
        "视觉证据"
      ],
      "assets": [
        "表单 250/259/260",
        "频率/电压模拟趋势",
        "低压配电室关键帧",
        "直流屏补充项"
      ],
      "quality": {
        "title": "配电间表单、趋势、低压柜画面一致",
        "text": "该区域承担供电侧演示角色,后续补充更多电参量和柜体帧时可直接填充数据对象。",
        "facts": [
          "表单对象: 低压配电装置",
          "趋势状态: 频率/电压平稳",
          "视觉证据: 低压配电室",
          "动作: 保留供电侧核验"
        ]
      },
      "formExplain": [
        {
          "title": "供电侧素材匹配",
          "desc": "现有关键帧直接来自低压配电室,能清晰支撑柜体、开关和仪表状态核验。"
        },
        {
          "title": "趋势构造有业务方向",
          "desc": "后续可填充三相电压、柜温、开关状态等时序数据。"
        },
        {
          "title": "视觉证据可持续扩展",
          "desc": "当前先绑定低压柜关键帧,后续补图像帧只需要增加 frameSources。"
        }
      ],
      "auxiliaryOnly": true,
      "questions": [
        {
          "q": "配电间为什么出现在本轮 demo?",
          "a": "低压配电室关键帧可直接支撑供电侧视觉核验,适合展示配电设备状态。"
        },
        {
          "q": "配电间主要看哪些数据?",
          "a": "表单 250/259/260、频率/电压模拟趋势、低压配电室关键帧、直流屏补充项"
        },
        {
          "q": "配电间本轮结论是什么?",
          "a": "该区域承担供电侧演示角色,后续补充更多电参量和柜体帧时可直接填充数据对象。"
        }
      ],
      "lifecycle": {
        "role": "power-side-evidence",
        "primaryFlow": false,
        "stages": [
          {
            "scene": "overview",
            "purpose": "展示区域状态、角色和入口"
          },
          {
            "scene": "form",
            "purpose": "核对该区域表单,并联查看趋势和现场帧"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    }
  }
};
})();
