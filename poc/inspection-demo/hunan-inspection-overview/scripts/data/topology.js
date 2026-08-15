// 本文件由 tools/build-topology.py 生成，不要手改；改数据请改源 XLS 后重跑。
// 源文件：湖南公司油气管道站场阀室作业区位置关系图20260211_1(1).xls（sheet: Sheet1）
// 条目数：zones=10, pipelines=24, nodes=217（station=66, valve=151）
(function () {
  "use strict";

  var meta = {
    "title": "湖南公司输油气站场阀室-作业区位置关系图",
    "version": "V3-20260119",
    "source": "湖南公司油气管道站场阀室作业区位置关系图20260211_1(1).xls",
    "pipelineCount": 24,
    "stationCount": 66,
    "valveCount": 151
  };

  var zones = [
    {
      "id": "yueyang",
      "name": "岳阳作业区",
      "rgb": [
        255,
        204,
        0
      ],
      "stationCount": 11,
      "valveCount": 25
    },
    {
      "id": "changsha",
      "name": "长沙作业区",
      "rgb": [
        153,
        204,
        255
      ],
      "stationCount": 8,
      "valveCount": 20
    },
    {
      "id": "xianglou",
      "name": "湘娄作业区",
      "rgb": [
        255,
        255,
        204
      ],
      "stationCount": 5,
      "valveCount": 13
    },
    {
      "id": "zhuzhou",
      "name": "株洲作业区",
      "rgb": [
        204,
        204,
        255
      ],
      "stationCount": 6,
      "valveCount": 6
    },
    {
      "id": "hengyang",
      "name": "衡阳作业区",
      "rgb": [
        192,
        192,
        192
      ],
      "stationCount": 6,
      "valveCount": 22
    },
    {
      "id": "yongchen",
      "name": "永郴作业区",
      "rgb": [
        153,
        204,
        0
      ],
      "stationCount": 4,
      "valveCount": 17
    },
    {
      "id": "xiangbei",
      "name": "湘北作业区",
      "rgb": [
        255,
        255,
        0
      ],
      "stationCount": 3,
      "valveCount": 3
    },
    {
      "id": "xiangzhong",
      "name": "湘中作业区",
      "rgb": [
        204,
        255,
        204
      ],
      "stationCount": 7,
      "valveCount": 19
    },
    {
      "id": "chenzhou",
      "name": "郴州作业区",
      "rgb": [
        153,
        153,
        255
      ],
      "stationCount": 6,
      "valveCount": 6
    },
    {
      "id": "xiangxi",
      "name": "湘西作业区",
      "rgb": [
        153,
        153,
        255
      ],
      "stationCount": 10,
      "valveCount": 20
    }
  ];

  var pipelines = [
    {
      "id": "zhongwuxian-qianxiang-branch",
      "name": "忠武线潜湘支线",
      "kind": "gas",
      "nodeIds": [
        "zhongwuxian-qianxiang-branch-01",
        "zhongwuxian-qianxiang-branch-02",
        "zhongwuxian-qianxiang-branch-03",
        "zhongwuxian-qianxiang-branch-04",
        "zhongwuxian-qianxiang-branch-05",
        "zhongwuxian-qianxiang-branch-06",
        "zhongwuxian-qianxiang-branch-07",
        "zhongwuxian-qianxiang-branch-08",
        "zhongwuxian-qianxiang-branch-09",
        "zhongwuxian-qianxiang-branch-10",
        "zhongwuxian-qianxiang-branch-11",
        "zhongwuxian-qianxiang-branch-12",
        "zhongwuxian-qianxiang-branch-13",
        "zhongwuxian-qianxiang-branch-14"
      ],
      "annotatedStationCount": 10
    },
    {
      "id": "qianjiang-shaoguan",
      "name": "潜江-韶关输气管道",
      "kind": "gas",
      "nodeIds": [
        "qianjiang-shaoguan-01",
        "qianjiang-shaoguan-02",
        "qianjiang-shaoguan-03",
        "qianjiang-shaoguan-04",
        "qianjiang-shaoguan-05",
        "qianjiang-shaoguan-06",
        "qianjiang-shaoguan-07",
        "qianjiang-shaoguan-08",
        "qianjiang-shaoguan-09",
        "qianjiang-shaoguan-10",
        "qianjiang-shaoguan-11",
        "qianjiang-shaoguan-12",
        "qianjiang-shaoguan-13",
        "qianjiang-shaoguan-14",
        "qianjiang-shaoguan-15",
        "qianjiang-shaoguan-16",
        "qianjiang-shaoguan-17",
        "qianjiang-shaoguan-18",
        "qianjiang-shaoguan-19",
        "qianjiang-shaoguan-20",
        "qianjiang-shaoguan-21",
        "qianjiang-shaoguan-22",
        "qianjiang-shaoguan-23",
        "qianjiang-shaoguan-24",
        "qianjiang-shaoguan-25",
        "qianjiang-shaoguan-26",
        "qianjiang-shaoguan-27",
        "qianjiang-shaoguan-28",
        "qianjiang-shaoguan-29",
        "qianjiang-shaoguan-30",
        "qianjiang-shaoguan-31",
        "qianjiang-shaoguan-32",
        "qianjiang-shaoguan-33",
        "qianjiang-shaoguan-34",
        "qianjiang-shaoguan-35",
        "qianjiang-shaoguan-36",
        "qianjiang-shaoguan-37",
        "qianjiang-shaoguan-38",
        "qianjiang-shaoguan-39"
      ],
      "annotatedStationCount": 13
    },
    {
      "id": "lanzhengchang",
      "name": "兰郑长管道",
      "kind": "gas",
      "nodeIds": [
        "lanzhengchang-01",
        "lanzhengchang-02",
        "lanzhengchang-03",
        "lanzhengchang-04",
        "lanzhengchang-05",
        "lanzhengchang-06",
        "lanzhengchang-07",
        "lanzhengchang-08",
        "lanzhengchang-09",
        "lanzhengchang-10",
        "lanzhengchang-11"
      ],
      "annotatedStationCount": 5
    },
    {
      "id": "changchen",
      "name": "长郴管道",
      "kind": "oil",
      "nodeIds": [
        "changchen-01",
        "changchen-02",
        "changchen-03",
        "changchen-04",
        "changchen-05",
        "changchen-06",
        "changchen-07",
        "changchen-08",
        "changchen-09",
        "changchen-10",
        "changchen-11",
        "changchen-12",
        "changchen-13",
        "changchen-14",
        "changchen-15",
        "changchen-16",
        "changchen-17",
        "changchen-18",
        "changchen-19",
        "changchen-20",
        "changchen-21",
        "changchen-22",
        "changchen-23",
        "changchen-24",
        "changchen-25",
        "changchen-26",
        "changchen-27",
        "changchen-28",
        "changchen-29",
        "changchen-30",
        "changchen-31",
        "changchen-32",
        "changchen-33"
      ],
      "annotatedStationCount": 11
    },
    {
      "id": "huanan-an",
      "name": "华南安输气管道",
      "kind": "gas",
      "nodeIds": [
        "huanan-an-01",
        "huanan-an-02",
        "huanan-an-03",
        "huanan-an-04",
        "huanan-an-05",
        "huanan-an-06"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "longshan-huayuan",
      "name": "龙山-花垣输气管道",
      "kind": "gas",
      "nodeIds": [
        "longshan-huayuan-01",
        "longshan-huayuan-02",
        "longshan-huayuan-03",
        "longshan-huayuan-04",
        "longshan-huayuan-05",
        "longshan-huayuan-06",
        "longshan-huayuan-07",
        "longshan-huayuan-08"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "xisanxian-changsha-branch",
      "name": "西三线长沙支线",
      "kind": "gas",
      "nodeIds": [
        "xisanxian-changsha-branch-01",
        "xisanxian-changsha-branch-02",
        "xisanxian-changsha-branch-03",
        "xisanxian-changsha-branch-04",
        "xisanxian-changsha-branch-05"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "changsha-branch",
      "name": "长沙支线",
      "kind": "gas",
      "nodeIds": [
        "changsha-branch-01",
        "changsha-branch-02",
        "changsha-branch-03"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "xiangtan-branch",
      "name": "湘潭支线",
      "kind": "gas",
      "nodeIds": [
        "xiangtan-branch-01",
        "xiangtan-branch-02",
        "xiangtan-branch-03",
        "xiangtan-branch-04",
        "xiangtan-branch-05",
        "xiangtan-branch-06"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "huayuan-huaihua",
      "name": "花垣-怀化输气管道",
      "kind": "gas",
      "nodeIds": [
        "huayuan-huaihua-01",
        "huayuan-huaihua-02",
        "huayuan-huaihua-03",
        "huayuan-huaihua-04",
        "huayuan-huaihua-05",
        "huayuan-huaihua-06",
        "huayuan-huaihua-07",
        "huayuan-huaihua-08",
        "huayuan-huaihua-09",
        "huayuan-huaihua-10"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "huayuan-zhangjiajie",
      "name": "花垣-张家界输气管道",
      "kind": "gas",
      "nodeIds": [
        "huayuan-zhangjiajie-01",
        "huayuan-zhangjiajie-02",
        "huayuan-zhangjiajie-03",
        "huayuan-zhangjiajie-04",
        "huayuan-zhangjiajie-05",
        "huayuan-zhangjiajie-06",
        "huayuan-zhangjiajie-07",
        "huayuan-zhangjiajie-08",
        "huayuan-zhangjiajie-09"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "xiangzhu-branch",
      "name": "湘株支线",
      "kind": "oil",
      "nodeIds": [
        "xiangzhu-branch-01",
        "xiangzhu-branch-02",
        "xiangzhu-branch-03",
        "xiangzhu-branch-04",
        "xiangzhu-branch-05"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "xianglou-branch",
      "name": "湘娄支线",
      "kind": "oil",
      "nodeIds": [
        "xianglou-branch-01",
        "xianglou-branch-02",
        "xianglou-branch-03",
        "xianglou-branch-04",
        "xianglou-branch-05",
        "xianglou-branch-06"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "xierxian-zhangxiang-link",
      "name": "西二线樟湘联络线",
      "kind": "gas",
      "nodeIds": [
        "xierxian-zhangxiang-link-01",
        "xierxian-zhangxiang-link-02",
        "xierxian-zhangxiang-link-03",
        "xierxian-zhangxiang-link-04",
        "xierxian-zhangxiang-link-05",
        "xierxian-zhangxiang-link-06"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "mayang-chenxi",
      "name": "麻阳-辰溪输气管道",
      "kind": "gas",
      "nodeIds": [
        "mayang-chenxi-01",
        "mayang-chenxi-02",
        "mayang-chenxi-03"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "guangxi-branch-trunk",
      "name": "广西支干线",
      "kind": "gas",
      "nodeIds": [
        "guangxi-branch-trunk-01",
        "guangxi-branch-trunk-02",
        "guangxi-branch-trunk-03",
        "guangxi-branch-trunk-04",
        "guangxi-branch-trunk-05",
        "guangxi-branch-trunk-06",
        "guangxi-branch-trunk-07",
        "guangxi-branch-trunk-08",
        "guangxi-branch-trunk-09",
        "guangxi-branch-trunk-10",
        "guangxi-branch-trunk-11",
        "guangxi-branch-trunk-12",
        "guangxi-branch-trunk-13",
        "guangxi-branch-trunk-14",
        "guangxi-branch-trunk-15"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "shaoyangshi-shaoyangxian",
      "name": "邵阳市-邵阳县输气管道",
      "kind": "gas",
      "nodeIds": [
        "shaoyangshi-shaoyangxian-01",
        "shaoyangshi-shaoyangxian-02",
        "shaoyangshi-shaoyangxian-03",
        "shaoyangshi-shaoyangxian-04"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "shaoyang-shaodongshi",
      "name": "邵阳-邵东市输气管道",
      "kind": "gas",
      "nodeIds": [
        "shaoyang-shaodongshi-01",
        "shaoyang-shaodongshi-02",
        "shaoyang-shaodongshi-03",
        "shaoyang-shaodongshi-04",
        "shaoyang-shaodongshi-05",
        "shaoyang-shaodongshi-06",
        "shaoyang-shaodongshi-07",
        "shaoyang-shaodongshi-08",
        "shaoyang-shaodongshi-09"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "shaodong-shuangfeng",
      "name": "邵东-双峰输气管道",
      "kind": "gas",
      "nodeIds": [
        "shaodong-shuangfeng-01",
        "shaodong-shuangfeng-02",
        "shaodong-shuangfeng-03",
        "shaodong-shuangfeng-04"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "shaoyang-dongkou-xinning",
      "name": "邵阳-洞口-新宁输气管道",
      "kind": "gas",
      "nodeIds": [
        "shaoyang-dongkou-xinning-01",
        "shaoyang-dongkou-xinning-02",
        "shaoyang-dongkou-xinning-03",
        "shaoyang-dongkou-xinning-04",
        "shaoyang-dongkou-xinning-05",
        "shaoyang-dongkou-xinning-06",
        "shaoyang-dongkou-xinning-07",
        "shaoyang-dongkou-xinning-08",
        "shaoyang-dongkou-xinning-09"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "guiyang-chenzhou-zixing",
      "name": "桂阳-郴州-资兴输气管道",
      "kind": "gas",
      "nodeIds": [
        "guiyang-chenzhou-zixing-01",
        "guiyang-chenzhou-zixing-02",
        "guiyang-chenzhou-zixing-03",
        "guiyang-chenzhou-zixing-04",
        "guiyang-chenzhou-zixing-05",
        "guiyang-chenzhou-zixing-06",
        "guiyang-chenzhou-zixing-07",
        "guiyang-chenzhou-zixing-08"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "guiyang-linwu",
      "name": "桂阳-临武输气管道",
      "kind": "gas",
      "nodeIds": [
        "guiyang-linwu-01",
        "guiyang-linwu-02",
        "guiyang-linwu-03",
        "guiyang-linwu-04"
      ],
      "annotatedStationCount": null
    },
    {
      "id": "dongkou-branch",
      "name": "洞口支线",
      "kind": "gas",
      "nodeIds": [],
      "annotatedStationCount": null
    },
    {
      "id": "yongzhoushi-shaoyangxian",
      "name": "永州市-邵阳县输气管道",
      "kind": "gas",
      "nodeIds": [],
      "annotatedStationCount": null
    }
  ];

  var nodes = [
    {
      "id": "zhongwuxian-qianxiang-branch-01",
      "name": "3＃阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 1,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-02",
      "name": "云溪分输站",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 2,
      "rgb": [
        255,
        204,
        0
      ],
      "note": "3A#阀室"
    },
    {
      "id": "zhongwuxian-qianxiang-branch-03",
      "name": "岳阳分输站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 3,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-04",
      "name": "4＃阀室*",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 4,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-05",
      "name": "岳阳南分输站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 5,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-06",
      "name": "5＃阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 6,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-07",
      "name": "6＃阀室*",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 7,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-08",
      "name": "汨罗分输站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 8,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-09",
      "name": "7＃阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 9,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-10",
      "name": "8＃阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 10,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-11",
      "name": "长沙分输站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 11,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-12",
      "name": "9A＃阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 12,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-13",
      "name": "9＃阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 13,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "zhongwuxian-qianxiang-branch-14",
      "name": "湘潭分输站",
      "kind": "station",
      "zoneId": "xianglou",
      "pipelineId": "zhongwuxian-qianxiang-branch",
      "seq": 14,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-01",
      "name": "7#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 1,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-02",
      "name": "双花分输站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 2,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-03",
      "name": "8#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 3,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-04",
      "name": "9#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 4,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-05",
      "name": "10#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 5,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-06",
      "name": "岳阳分输清管站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 6,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-07",
      "name": "11#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 7,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-08",
      "name": "12#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 8,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-09",
      "name": "13#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 9,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-10",
      "name": "14#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 10,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-11",
      "name": "15#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 11,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-12",
      "name": "16#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 12,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-13",
      "name": "17#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 13,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-14",
      "name": "长沙分输站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 14,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-15",
      "name": "18#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 15,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-16",
      "name": "19#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 16,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-17",
      "name": "株洲分输清管站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 17,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-18",
      "name": "20#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 18,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-19",
      "name": "马洲村分输站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 19,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-20",
      "name": "21#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 20,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-21",
      "name": "22#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 21,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-22",
      "name": "23#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 22,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-23",
      "name": "24#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 23,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-24",
      "name": "红茶亭首站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 24,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-25",
      "name": "25#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 25,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-26",
      "name": "衡东分输站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 26,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-27",
      "name": "衡阳分输清管站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 27,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-28",
      "name": "26#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 28,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-29",
      "name": "27#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 29,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-30",
      "name": "28#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 30,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-31",
      "name": "耒阳分输站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 31,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-32",
      "name": "29#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 32,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-33",
      "name": "30#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 33,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-34",
      "name": "31#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 34,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-35",
      "name": "郴州分输清管站",
      "kind": "station",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 35,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-36",
      "name": "32#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 36,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-37",
      "name": "33#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 37,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-38",
      "name": "邓家塘分输站",
      "kind": "station",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 38,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "qianjiang-shaoguan-39",
      "name": "34#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "qianjiang-shaoguan",
      "seq": 39,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-01",
      "name": "70#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 1,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-02",
      "name": "71#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 2,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-03",
      "name": "71A#清管站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 3,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-04",
      "name": "72#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 4,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-05",
      "name": "岳阳站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 5,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-06",
      "name": "73#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 6,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-07",
      "name": "74#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 7,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-08",
      "name": "75#清管站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 8,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-09",
      "name": "76#阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "lanzhengchang",
      "seq": 9,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-10",
      "name": "77#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "lanzhengchang",
      "seq": 10,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "lanzhengchang-11",
      "name": "长沙站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "lanzhengchang",
      "seq": 11,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changchen-01",
      "name": "长岭站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 1,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-02",
      "name": "云溪阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 2,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-03",
      "name": "七里山站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 3,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-04",
      "name": "五垸阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 4,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-05",
      "name": "黄沙街阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 5,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-06",
      "name": "范家园阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 6,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-07",
      "name": "汨罗站",
      "kind": "station",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 7,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-08",
      "name": "高家坊阀室",
      "kind": "valve",
      "zoneId": "yueyang",
      "pipelineId": "changchen",
      "seq": 8,
      "rgb": [
        255,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-09",
      "name": "长沙站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "changchen",
      "seq": 9,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changchen-10",
      "name": "星城阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "changchen",
      "seq": 10,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changchen-11",
      "name": "东方红阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "changchen",
      "seq": 11,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changchen-12",
      "name": "含浦阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "changchen",
      "seq": 12,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changchen-13",
      "name": "湘潭站",
      "kind": "station",
      "zoneId": "xianglou",
      "pipelineId": "changchen",
      "seq": 13,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "changchen-14",
      "name": "姜畲阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "changchen",
      "seq": 14,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "changchen-15",
      "name": "杨嘉桥阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "changchen",
      "seq": 15,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "changchen-16",
      "name": "继述桥阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "changchen",
      "seq": 16,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "changchen-17",
      "name": "茶恩寺阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "changchen",
      "seq": 17,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "changchen-18",
      "name": "三樟阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 18,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-19",
      "name": "珍珠阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 19,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-20",
      "name": "城关阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 20,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-21",
      "name": "吴集阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 21,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-22",
      "name": "衡阳站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 22,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-23",
      "name": "冠市阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 23,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-24",
      "name": "新市阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 24,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-25",
      "name": "耒阳站",
      "kind": "station",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 25,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-26",
      "name": "水东江阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 26,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-27",
      "name": "泗门洲阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "changchen",
      "seq": 27,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "changchen-28",
      "name": "悦来阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 28,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-29",
      "name": "洋市阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 29,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-30",
      "name": "华塘阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 30,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-31",
      "name": "郴州站",
      "kind": "station",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 31,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-32",
      "name": "沙坪阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 32,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "changchen-33",
      "name": "省界阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "changchen",
      "seq": 33,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 1,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-02",
      "name": "华容分输站",
      "kind": "station",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 2,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-03",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 3,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-04",
      "name": "南县分输站",
      "kind": "station",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 4,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-05",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 5,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "huanan-an-06",
      "name": "安乡分输站",
      "kind": "station",
      "zoneId": "xiangbei",
      "pipelineId": "huanan-an",
      "seq": 6,
      "rgb": [
        255,
        255,
        0
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-01",
      "name": "龙山首站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-02",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-03",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-04",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 4,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-05",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 5,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-06",
      "name": "5#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 6,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-07",
      "name": "6#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 7,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "longshan-huayuan-08",
      "name": "花垣分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "longshan-huayuan",
      "seq": 8,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "xisanxian-changsha-branch-01",
      "name": "石潭村清管站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "xisanxian-changsha-branch",
      "seq": 1,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xisanxian-changsha-branch-02",
      "name": "安沙分输清管站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "xisanxian-changsha-branch",
      "seq": 2,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xisanxian-changsha-branch-03",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xisanxian-changsha-branch",
      "seq": 3,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xisanxian-changsha-branch-04",
      "name": "2#阀室（RTU)",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xisanxian-changsha-branch",
      "seq": 4,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xisanxian-changsha-branch-05",
      "name": "望城末站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "xisanxian-changsha-branch",
      "seq": 5,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changsha-branch-01",
      "name": "长沙支线1#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "changsha-branch",
      "seq": 1,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changsha-branch-02",
      "name": "长沙支线2#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "changsha-branch",
      "seq": 2,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "changsha-branch-03",
      "name": "长沙计量站",
      "kind": "station",
      "zoneId": "changsha",
      "pipelineId": "changsha-branch",
      "seq": 3,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-01",
      "name": "湘潭支线1#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xiangtan-branch",
      "seq": 1,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-02",
      "name": "湘潭支线2#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xiangtan-branch",
      "seq": 2,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-03",
      "name": "湘潭支线3#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xiangtan-branch",
      "seq": 3,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-04",
      "name": "湘潭支线4#阀室",
      "kind": "valve",
      "zoneId": "changsha",
      "pipelineId": "xiangtan-branch",
      "seq": 4,
      "rgb": [
        153,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-05",
      "name": "湘潭支线5#阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xiangtan-branch",
      "seq": 5,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xiangtan-branch-06",
      "name": "湘潭计量站",
      "kind": "station",
      "zoneId": "xianglou",
      "pipelineId": "xiangtan-branch",
      "seq": 6,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-02",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-03",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-04",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 4,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-05",
      "name": "吉首分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 5,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-06",
      "name": "凤凰分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 6,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-07",
      "name": "5#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 7,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-08",
      "name": "麻阳分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 8,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-09",
      "name": "6#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 9,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-huaihua-10",
      "name": "怀化分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-huaihua",
      "seq": 10,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-01",
      "name": "保靖分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-02",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-03",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-04",
      "name": "永顺分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 4,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-05",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 5,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-06",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 6,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-07",
      "name": "5#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 7,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-08",
      "name": "6#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 8,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "huayuan-zhangjiajie-09",
      "name": "张家界分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "huayuan-zhangjiajie",
      "seq": 9,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "xiangzhu-branch-01",
      "name": "九华阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xiangzhu-branch",
      "seq": 1,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xiangzhu-branch-02",
      "name": "荷塘阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xiangzhu-branch",
      "seq": 2,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xiangzhu-branch-03",
      "name": "株洲站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "xiangzhu-branch",
      "seq": 3,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xiangzhu-branch-04",
      "name": "昭山阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xiangzhu-branch",
      "seq": 4,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xiangzhu-branch-05",
      "name": "154国库站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "xiangzhu-branch",
      "seq": 5,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-01",
      "name": "云湖桥阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 1,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-02",
      "name": "东郊阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 2,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-03",
      "name": "虞塘阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 3,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-04",
      "name": "杏子铺阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 4,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-05",
      "name": "蛇形山阀室",
      "kind": "valve",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 5,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xianglou-branch-06",
      "name": "娄底站",
      "kind": "station",
      "zoneId": "xianglou",
      "pipelineId": "xianglou-branch",
      "seq": 6,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-01",
      "name": "湘潭末站",
      "kind": "station",
      "zoneId": "xianglou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 1,
      "rgb": [
        255,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-02",
      "name": "10#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 2,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-03",
      "name": "株洲分输站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 3,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-04",
      "name": "9#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 4,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-05",
      "name": "醴陵分输压气站",
      "kind": "station",
      "zoneId": "zhuzhou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 5,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "xierxian-zhangxiang-link-06",
      "name": "8#阀室",
      "kind": "valve",
      "zoneId": "zhuzhou",
      "pipelineId": "xierxian-zhangxiang-link",
      "seq": 6,
      "rgb": [
        204,
        204,
        255
      ],
      "note": null
    },
    {
      "id": "mayang-chenxi-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "mayang-chenxi",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "mayang-chenxi-02",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangxi",
      "pipelineId": "mayang-chenxi",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "mayang-chenxi-03",
      "name": "辰溪分输站",
      "kind": "station",
      "zoneId": "xiangxi",
      "pipelineId": "mayang-chenxi",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-01",
      "name": "广西支干线1#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 1,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-02",
      "name": "广西支干线2#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 2,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-03",
      "name": "广西支干线3#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 3,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-04",
      "name": "广西支干线4#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 4,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-05",
      "name": "广西支干线5#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 5,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-06",
      "name": "广西支干线6#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 6,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-07",
      "name": "广西支干线7#阀室",
      "kind": "valve",
      "zoneId": "hengyang",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 7,
      "rgb": [
        192,
        192,
        192
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-08",
      "name": "广西支干线8#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 8,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-09",
      "name": "广西支干线9#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 9,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-10",
      "name": "广西支干线10#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 10,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-11",
      "name": "广西支干线11#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 11,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-12",
      "name": "广西支干线12#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 12,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-13",
      "name": "永州分输清管站",
      "kind": "station",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 13,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-14",
      "name": "广西支干线13#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 14,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "guangxi-branch-trunk-15",
      "name": "广西支干线14#阀室",
      "kind": "valve",
      "zoneId": "yongchen",
      "pipelineId": "guangxi-branch-trunk",
      "seq": 15,
      "rgb": [
        153,
        204,
        0
      ],
      "note": null
    },
    {
      "id": "shaoyangshi-shaoyangxian-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyangshi-shaoyangxian",
      "seq": 1,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyangshi-shaoyangxian-02",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyangshi-shaoyangxian",
      "seq": 2,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyangshi-shaoyangxian-03",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyangshi-shaoyangxian",
      "seq": 3,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyangshi-shaoyangxian-04",
      "name": "邵阳西分输站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyangshi-shaoyangxian",
      "seq": 4,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-01",
      "name": "邵阳东分输站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 1,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-02",
      "name": "邵东分输站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 2,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-03",
      "name": "6#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 3,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-04",
      "name": "5#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 4,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-05",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 5,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-06",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 6,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-07",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 7,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-08",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 8,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-shaodongshi-09",
      "name": "永州首站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-shaodongshi",
      "seq": 9,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaodong-shuangfeng-01",
      "name": "古塘村阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaodong-shuangfeng",
      "seq": 1,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaodong-shuangfeng-02",
      "name": "中益村阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaodong-shuangfeng",
      "seq": 2,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaodong-shuangfeng-03",
      "name": "青树坪阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaodong-shuangfeng",
      "seq": 3,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaodong-shuangfeng-04",
      "name": "双峰末站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaodong-shuangfeng",
      "seq": 4,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 1,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-02",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 2,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-03",
      "name": "隆回末站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 3,
      "rgb": [
        204,
        255,
        204
      ],
      "note": "无人值守站"
    },
    {
      "id": "shaoyang-dongkou-xinning-04",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 4,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-05",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 5,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-06",
      "name": "8#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 6,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-07",
      "name": "5#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 7,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-08",
      "name": "9#阀室",
      "kind": "valve",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 8,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "shaoyang-dongkou-xinning-09",
      "name": "洞口末站",
      "kind": "station",
      "zoneId": "xiangzhong",
      "pipelineId": "shaoyang-dongkou-xinning",
      "seq": 9,
      "rgb": [
        204,
        255,
        204
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-01",
      "name": "桂阳分输站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-02",
      "name": "郴州西分输站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-03",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-04",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 4,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-05",
      "name": "郴州东分输站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 5,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-06",
      "name": "3#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 6,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-07",
      "name": "4#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 7,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-chenzhou-zixing-08",
      "name": "资兴分输站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-chenzhou-zixing",
      "seq": 8,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-linwu-01",
      "name": "1#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-linwu",
      "seq": 1,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-linwu-02",
      "name": "2#阀室",
      "kind": "valve",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-linwu",
      "seq": 2,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-linwu-03",
      "name": "荷叶清管站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-linwu",
      "seq": 3,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    },
    {
      "id": "guiyang-linwu-04",
      "name": "临武分输站",
      "kind": "station",
      "zoneId": "chenzhou",
      "pipelineId": "guiyang-linwu",
      "seq": 4,
      "rgb": [
        153,
        153,
        255
      ],
      "note": null
    }
  ];

  if (window.HunanTopology) {
    throw new Error("[HunanTopology] window.HunanTopology 已存在，topology.js 被重复加载？");
  }
  window.HunanTopology = {
    meta: meta,
    zones: zones,
    pipelines: pipelines,
    nodes: nodes
  };
})();
