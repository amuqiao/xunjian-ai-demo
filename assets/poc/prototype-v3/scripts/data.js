(function () {
  "use strict";

  window.DEMO_V3_DATA = {
  "shell": {
    "siteName": "长郴-湘潭站",
    "subtitle": "巡检质量智能分析",
    "batch": "XJ-20260721-A",
    "clock": "2026-07-21 04:43:22",
    "sceneOrder": [
      "overview",
      "form",
      "trend",
      "vision",
      "recheck",
      "report"
    ],
    "sceneLabels": {
      "overview": "任务总览",
      "form": "表单质检",
      "trend": "时序预警",
      "vision": "视觉证据",
      "recheck": "复检确认",
      "report": "报告归档"
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
        "desc": "定位第 73 项"
      },
      {
        "key": "trend",
        "label": "时序预警",
        "desc": "72h 趋势抬升"
      },
      {
        "key": "conflict",
        "label": "表单趋势冲突",
        "desc": "正常 vs 近阈值"
      },
      {
        "key": "vision",
        "label": "视觉证据",
        "desc": "关键帧补证"
      },
      {
        "key": "recheck",
        "label": "复检清单",
        "desc": "规则与动作项"
      },
      {
        "key": "confirm",
        "label": "人工确认",
        "desc": "三类结论"
      },
      {
        "key": "report",
        "label": "报告归档",
        "desc": "交接班 / 案例"
      },
      {
        "key": "closed",
        "label": "闭环回看",
        "desc": "总览回写"
      }
    ],
    "agentQA": [
      {
        "q": "为什么需要复检?",
        "a": "差压趋势接近 0.1MPa 阈值,且表单填写正常,形成表单与时序数据冲突,因此建议复检。"
      },
      {
        "q": "复检人员需要补拍什么?",
        "a": "建议补拍差压表、过滤器铭牌、设备周边状态,并核对执行机构指示灯和远传控制状态。"
      },
      {
        "q": "交接班关注什么?",
        "a": "交接班建议关注过滤器差压变化趋势,如继续抬升,应安排进一步检查过滤器状态。"
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
      "note": "本轮聚焦计量区过滤器差压疑点,联动周边区域视频、趋势、知识依据完成巡检闭环。"
    },
    "metrics": [
      {
        "key": "findings",
        "label": "异常/证据",
        "value": "4",
        "tone": "red"
      },
      {
        "key": "recheck",
        "label": "待复检",
        "value": "1",
        "tone": "amber"
      },
      {
        "key": "sources",
        "label": "证据源",
        "value": "4",
        "tone": "cyan"
      },
      {
        "key": "closed",
        "label": "闭环率",
        "value": "0%",
        "tone": "green"
      }
    ],
    "areaOrder": [
      "metering",
      "valve",
      "pump",
      "control",
      "plc",
      "power"
    ],
    "findings": [
      {
        "area": "metering",
        "priority": "high",
        "entryType": "riskFlow",
        "title": "计量区过滤器差压趋势异常",
        "desc": "表单填写正常,但 72h 趋势接近 0.1MPa 阈值。",
        "primary": true
      },
      {
        "area": "pump",
        "priority": "mid",
        "entryType": "areaSummary",
        "title": "泵棚视频帧待复核",
        "desc": "现场关键帧可用于补充设备状态证据。",
        "primary": false
      },
      {
        "area": "plc",
        "priority": "mid",
        "entryType": "areaSummary",
        "title": "PLC 机房灯态抽查",
        "desc": "作为视觉证据,补充设备状态核验。",
        "primary": false
      },
      {
        "area": "power",
        "priority": "mid",
        "entryType": "areaSummary",
        "title": "配电间低压柜状态核对",
        "desc": "低压配电室关键帧可支撑供电侧视觉核验。",
        "primary": false
      }
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
    "trendExplain": [
      {
        "title": "72h 连续抬升",
        "desc": "差压从 0.053MPa 抬升到 0.097MPa,末值距离阈值只剩 0.003MPa。"
      },
      {
        "title": "异常窗口收敛",
        "desc": "最近 4 个采样点被标记为异常窗口,用于联动表单第 73 项。"
      },
      {
        "title": "正常对照可切换",
        "desc": "压力趋势作为正常对照,帮助说明本轮不是全量报错。"
      }
    ],
    "conflictExplain": [
      {
        "title": "冲突不是结论",
        "desc": "表单填写为正常,趋势接近阈值,系统只把二者差异升级为复检疑点。"
      },
      {
        "title": "冲突对象明确",
        "desc": "冲突绑定计量区 / 过滤器 / 差压第 73 项,避免把整条巡检路线都标成异常。"
      },
      {
        "title": "下一步需要现场复核",
        "desc": "需要用关键帧、差压表补拍和人工复检来决定确认异常、误报关闭或继续观察。"
      }
    ],
    "visionExplain": [
      {
        "title": "补充现场语境",
        "desc": "关键帧用于确认设备点位、周边状态和需要补拍的位置。"
      },
      {
        "title": "不替代复检",
        "desc": "视觉框只作为辅助证据,不能绕过差压表现场复核。"
      },
      {
        "title": "可进入报告",
        "desc": "当前帧、对比帧和 PLC 帧都可以沉淀为报告中的证据来源。"
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
      "plc": {
        "evidence": "已选中 PLC 机柜 POWER 灯项。右侧关键帧切换到 PLC 机房,核验灯态识别结果。",
        "tags": [
          "PLC",
          "POWER灯",
          "灯态识别"
        ],
        "trendKey": "plcHealth",
        "image": "plc"
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
    }
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
  "areas": {
    "metering": {
      "title": "计量区过滤器差压疑点",
      "short": "计量区",
      "overviewTitle": "过滤器差压趋势异常",
      "overviewDesc": "本轮唯一高优先级疑点。表单第 73 项填写正常,但差压趋势接近 0.1MPa 阈值。",
      "overviewStatus": "高优先级复检",
      "overviewAction": "进入表单质检",
      "overviewSecondary": "查看区域记录",
      "overviewTarget": "riskFlow",
      "overviewStats": [
        {
          "label": "高风险疑点",
          "value": "1"
        },
        {
          "label": "关联表单",
          "value": "第 73 项"
        },
        {
          "label": "证据源",
          "value": "4"
        }
      ],
      "sub": "表单填写正常,趋势曲线接近 0.1MPa 阈值,建议生成复检清单。",
      "badge": "高优先级复检",
      "badgeTone": "danger",
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
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
      }
    },
    "valve": {
      "title": "阀组区巡检正常对照",
      "short": "阀组区",
      "overviewTitle": "阀组区正常对照",
      "overviewDesc": "本轮路线已覆盖,未发现异常趋势,用于说明系统按风险聚焦。",
      "overviewStatus": "正常对照",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看视觉证据",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "证据入口",
          "value": "0"
        },
        {
          "label": "状态",
          "value": "平稳"
        },
        {
          "label": "流程属性",
          "value": "对照"
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "pump": {
      "title": "泵区现场视频帧复核",
      "short": "泵区",
      "overviewTitle": "泵棚视频帧待复核",
      "overviewDesc": "现场关键帧可作为设备状态辅助证据,本轮不进入高优先级异常闭环。",
      "overviewStatus": "视觉辅助",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看视觉证据",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "证据入口",
          "value": "1"
        },
        {
          "label": "证据类型",
          "value": "关键帧"
        },
        {
          "label": "流程属性",
          "value": "辅助"
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "control": {
      "title": "站控室视频与数据核对",
      "short": "站控室",
      "overviewTitle": "站控室视频质量核对",
      "overviewDesc": "用于管理侧视频质量和参数核对,当前没有高优先级异常。",
      "overviewStatus": "背景材料",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看视觉证据",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "证据入口",
          "value": "0"
        },
        {
          "label": "视频质量",
          "value": "9/10"
        },
        {
          "label": "流程属性",
          "value": "背景"
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "plc": {
      "title": "PLC 机房灯态抽查",
      "short": "PLC机房",
      "overviewTitle": "PLC 机房灯态抽查",
      "overviewDesc": "用于核验柜体、灯态和供电侧状态,作为视觉证据补充而非异常结论。",
      "overviewStatus": "视觉辅助",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看视觉证据",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "证据入口",
          "value": "1"
        },
        {
          "label": "识别对象",
          "value": "POWER灯"
        },
        {
          "label": "流程属性",
          "value": "辅助"
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    },
    "power": {
      "title": "配电间供电侧核验",
      "short": "配电间",
      "overviewTitle": "配电间低压柜状态核对",
      "overviewDesc": "低压配电室关键帧可直接支撑供电侧视觉核验,适合展示配电设备状态。",
      "overviewStatus": "供电侧核验",
      "overviewAction": "查看区域质检",
      "overviewSecondary": "查看视觉证据",
      "overviewTarget": "form",
      "overviewStats": [
        {
          "label": "证据入口",
          "value": "1"
        },
        {
          "label": "视觉帧",
          "value": "低压柜"
        },
        {
          "label": "流程属性",
          "value": "供电"
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
            "purpose": "核对该区域巡检表明细"
          },
          {
            "scene": "trend",
            "purpose": "展示该区域时序或健康度走势"
          },
          {
            "scene": "vision",
            "purpose": "展示该区域视觉帧或联动参考材料"
          }
        ],
        "terminalState": "作为证据或正常对照返回总览"
      }
    }
  }
};
})();
