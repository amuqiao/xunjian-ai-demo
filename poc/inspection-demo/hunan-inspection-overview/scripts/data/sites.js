// 本文件由 tools/build-sites.js 生成，不要手改。
// 改坐标/映射/演示状态请改该脚本里的三张手工输入表后重跑：
//   node poc/hunan-inspection-overview/tools/build-sites.js
//
// 数据范围：hunan-inspection-overview（scope=all，共 217 个站点）
// 上游真源：assets/.data/…作业区位置关系图…xls（拓扑与作业区归属，V3-20260119）
//           assets/geo/hunan-430000-full.geojson（14 市行政边界）
//           assets/data/附件 7/长郴管道走向全图 (1).jpg（成品油 9 站场实测位置）
//
// ⚠️ coordSource 字段区分坐标可信度，不要忽略它：
//   "surveyed" = 从《国家管网湖南成品油管道线路全图》读出的真实位置（9 个成品油站场）
//   "approx"   = 资料里只有拓扑顺序没有坐标，按「所属作业区市域 + 螺旋散布」推导
// 大屏 UI 应据此给 approx 点位标注「位置为示意」，不要让插值坐标被当成测绘成果。
//
// ⚠️ status 是演示设定，不是真实运行数据（见生成脚本的 STATUS_OVERRIDES）。
(function () {
  "use strict";

  var SITES = [
    {"id":"zhongwuxian-qianxiang-branch-01","name":"3＃阀室","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":1,"adcode":"430600","districtName":"岳阳市","lon":113.1815,"lat":29.1104,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-02","name":"云溪分输站","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":2,"adcode":"430600","districtName":"岳阳市","lon":113.2061,"lat":28.9658,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-03","name":"岳阳分输站","kind":"station","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":3,"adcode":"430600","districtName":"岳阳市","lon":113.2306,"lat":28.8211,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-04","name":"4＃阀室*","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":4,"adcode":"430600","districtName":"岳阳市","lon":113.2552,"lat":28.6765,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-05","name":"岳阳南分输站","kind":"station","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":5,"adcode":"430600","districtName":"岳阳市","lon":113.2758,"lat":28.6381,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-06","name":"5＃阀室","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":6,"adcode":"430600","districtName":"岳阳市","lon":113.1082,"lat":28.5049,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-07","name":"6＃阀室*","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":7,"adcode":"430600","districtName":"岳阳市","lon":113.1582,"lat":28.5009,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-08","name":"汨罗分输站","kind":"station","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":8,"adcode":"430600","districtName":"岳阳市","lon":113.2061,"lat":28.6408,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-09","name":"7＃阀室","kind":"valve","zoneId":"yueyang","pipelineId":"zhongwuxian-qianxiang-branch","seq":9,"adcode":"430600","districtName":"岳阳市","lon":113.1685,"lat":28.5169,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-10","name":"8＃阀室","kind":"valve","zoneId":"changsha","pipelineId":"zhongwuxian-qianxiang-branch","seq":10,"adcode":"430100","districtName":"长沙市","lon":113.0158,"lat":28.0281,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-11","name":"长沙分输站","kind":"station","zoneId":"changsha","pipelineId":"zhongwuxian-qianxiang-branch","seq":11,"adcode":"430100","districtName":"长沙市","lon":112.9002,"lat":28.0448,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-12","name":"9A＃阀室","kind":"valve","zoneId":"changsha","pipelineId":"zhongwuxian-qianxiang-branch","seq":12,"adcode":"430100","districtName":"长沙市","lon":112.9043,"lat":28.0165,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-13","name":"9＃阀室","kind":"valve","zoneId":"changsha","pipelineId":"zhongwuxian-qianxiang-branch","seq":13,"adcode":"430100","districtName":"长沙市","lon":112.8944,"lat":27.9858,"status":"ok","coordSource":"approx"},
    {"id":"zhongwuxian-qianxiang-branch-14","name":"湘潭分输站","kind":"station","zoneId":"xianglou","pipelineId":"zhongwuxian-qianxiang-branch","seq":14,"adcode":"430300","districtName":"湘潭市","lon":112.6289,"lat":27.716,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-01","name":"7#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":1,"adcode":"430600","districtName":"岳阳市","lon":113.1815,"lat":29.1104,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-02","name":"双花分输站","kind":"station","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":2,"adcode":"430600","districtName":"岳阳市","lon":113.2032,"lat":28.9419,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-03","name":"8#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":3,"adcode":"430600","districtName":"岳阳市","lon":113.2249,"lat":28.7735,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-04","name":"9#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":4,"adcode":"430600","districtName":"岳阳市","lon":113.2492,"lat":28.6967,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-05","name":"10#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":5,"adcode":"430600","districtName":"岳阳市","lon":113.2653,"lat":28.656,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-06","name":"岳阳分输清管站","kind":"station","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":6,"adcode":"430600","districtName":"岳阳市","lon":113.127,"lat":28.5214,"status":"danger","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-07","name":"11#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":7,"adcode":"430600","districtName":"岳阳市","lon":113.1745,"lat":28.5143,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-08","name":"12#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":8,"adcode":"430600","districtName":"岳阳市","lon":113.2436,"lat":28.7109,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-09","name":"13#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":9,"adcode":"430600","districtName":"岳阳市","lon":113.2733,"lat":28.6542,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-10","name":"14#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"qianjiang-shaoguan","seq":10,"adcode":"430600","districtName":"岳阳市","lon":113.2938,"lat":28.6972,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-11","name":"15#阀室","kind":"valve","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":11,"adcode":"430100","districtName":"长沙市","lon":113.2098,"lat":28.0291,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-12","name":"16#阀室","kind":"valve","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":12,"adcode":"430100","districtName":"长沙市","lon":113.2175,"lat":28.029,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-13","name":"17#阀室","kind":"valve","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":13,"adcode":"430100","districtName":"长沙市","lon":113.2149,"lat":28.0517,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-14","name":"长沙分输站","kind":"station","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":14,"adcode":"430100","districtName":"长沙市","lon":113.2812,"lat":27.8694,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-15","name":"18#阀室","kind":"valve","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":15,"adcode":"430100","districtName":"长沙市","lon":113.2058,"lat":28.0806,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-16","name":"19#阀室","kind":"valve","zoneId":"changsha","pipelineId":"qianjiang-shaoguan","seq":16,"adcode":"430100","districtName":"长沙市","lon":113.1773,"lat":28.0814,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-17","name":"株洲分输清管站","kind":"station","zoneId":"zhuzhou","pipelineId":"qianjiang-shaoguan","seq":17,"adcode":"430200","districtName":"株洲市","lon":113.2533,"lat":27.0465,"status":"warn","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-18","name":"20#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"qianjiang-shaoguan","seq":18,"adcode":"430200","districtName":"株洲市","lon":113.2678,"lat":27.0278,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-19","name":"马洲村分输站","kind":"station","zoneId":"zhuzhou","pipelineId":"qianjiang-shaoguan","seq":19,"adcode":"430200","districtName":"株洲市","lon":113.2478,"lat":27.006,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-20","name":"21#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"qianjiang-shaoguan","seq":20,"adcode":"430200","districtName":"株洲市","lon":113.2437,"lat":26.9943,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-21","name":"22#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"qianjiang-shaoguan","seq":21,"adcode":"430200","districtName":"株洲市","lon":113.2698,"lat":27.0447,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-22","name":"23#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":22,"adcode":"430400","districtName":"衡阳市","lon":112.5698,"lat":26.7651,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-23","name":"24#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":23,"adcode":"430400","districtName":"衡阳市","lon":112.68,"lat":26.616,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-24","name":"红茶亭首站","kind":"station","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":24,"adcode":"430400","districtName":"衡阳市","lon":112.7902,"lat":26.4669,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-25","name":"25#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":25,"adcode":"430400","districtName":"衡阳市","lon":112.9003,"lat":26.3177,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-26","name":"衡东分输站","kind":"station","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":26,"adcode":"430400","districtName":"衡阳市","lon":112.8228,"lat":26.2812,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-27","name":"衡阳分输清管站","kind":"station","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":27,"adcode":"430400","districtName":"衡阳市","lon":112.8623,"lat":26.2638,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-28","name":"26#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":28,"adcode":"430400","districtName":"衡阳市","lon":112.9157,"lat":26.2051,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-29","name":"27#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":29,"adcode":"430400","districtName":"衡阳市","lon":112.9526,"lat":26.1687,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-30","name":"28#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":30,"adcode":"430400","districtName":"衡阳市","lon":112.892,"lat":26.2,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-31","name":"耒阳分输站","kind":"station","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":31,"adcode":"430400","districtName":"衡阳市","lon":112.7403,"lat":26.1788,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-32","name":"29#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"qianjiang-shaoguan","seq":32,"adcode":"430400","districtName":"衡阳市","lon":112.6699,"lat":26.1614,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-33","name":"30#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":33,"adcode":"431000","districtName":"郴州市","lon":112.6101,"lat":25.7957,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-34","name":"31#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":34,"adcode":"431000","districtName":"郴州市","lon":112.5177,"lat":25.7594,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-35","name":"郴州分输清管站","kind":"station","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":35,"adcode":"431000","districtName":"郴州市","lon":112.4254,"lat":25.723,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-36","name":"32#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":36,"adcode":"431000","districtName":"郴州市","lon":112.442,"lat":25.8346,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-37","name":"33#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":37,"adcode":"431100","districtName":"永州市","lon":111.985,"lat":25.8036,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-38","name":"邓家塘分输站","kind":"station","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":38,"adcode":"431100","districtName":"永州市","lon":111.8806,"lat":25.7745,"status":"ok","coordSource":"approx"},
    {"id":"qianjiang-shaoguan-39","name":"34#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"qianjiang-shaoguan","seq":39,"adcode":"431100","districtName":"永州市","lon":111.7761,"lat":25.7454,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-01","name":"70#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":1,"adcode":"430600","districtName":"岳阳市","lon":113.1815,"lat":29.1104,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-02","name":"71#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":2,"adcode":"430600","districtName":"岳阳市","lon":113.2106,"lat":29.0029,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-03","name":"71A#清管站","kind":"station","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":3,"adcode":"430600","districtName":"岳阳市","lon":113.2396,"lat":28.8954,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-04","name":"72#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":4,"adcode":"430600","districtName":"岳阳市","lon":113.2687,"lat":28.7879,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-05","name":"岳阳站","kind":"station","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":5,"adcode":"430600","districtName":"岳阳市","lon":113.2978,"lat":28.6804,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-06","name":"73#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":6,"adcode":"430600","districtName":"岳阳市","lon":113.1307,"lat":28.6906,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-07","name":"74#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":7,"adcode":"430600","districtName":"岳阳市","lon":113.1597,"lat":28.5831,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-08","name":"75#清管站","kind":"station","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":8,"adcode":"430600","districtName":"岳阳市","lon":113.2084,"lat":28.6373,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-09","name":"76#阀室","kind":"valve","zoneId":"yueyang","pipelineId":"lanzhengchang","seq":9,"adcode":"430600","districtName":"岳阳市","lon":113.2358,"lat":28.6636,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-10","name":"77#阀室","kind":"valve","zoneId":"changsha","pipelineId":"lanzhengchang","seq":10,"adcode":"430100","districtName":"长沙市","lon":113.2132,"lat":28.2809,"status":"ok","coordSource":"approx"},
    {"id":"lanzhengchang-11","name":"长沙站","kind":"station","zoneId":"changsha","pipelineId":"lanzhengchang","seq":11,"adcode":"430100","districtName":"长沙市","lon":113.1136,"lat":28.2506,"status":"ok","coordSource":"approx"},
    {"id":"changchen-01","name":"长岭站","kind":"station","zoneId":"yueyang","pipelineId":"changchen","seq":1,"adcode":"430600","districtName":"岳阳市","lon":113.28,"lat":29.44,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-02","name":"云溪阀室","kind":"valve","zoneId":"yueyang","pipelineId":"changchen","seq":2,"adcode":"430600","districtName":"岳阳市","lon":113.2249,"lat":29.1643,"status":"ok","coordSource":"approx"},
    {"id":"changchen-03","name":"七里山站","kind":"station","zoneId":"yueyang","pipelineId":"changchen","seq":3,"adcode":"430600","districtName":"岳阳市","lon":113.13,"lat":29.38,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-04","name":"五垸阀室","kind":"valve","zoneId":"yueyang","pipelineId":"changchen","seq":4,"adcode":"430600","districtName":"岳阳市","lon":113.2374,"lat":29.1903,"status":"ok","coordSource":"approx"},
    {"id":"changchen-05","name":"黄沙街阀室","kind":"valve","zoneId":"yueyang","pipelineId":"changchen","seq":5,"adcode":"430600","districtName":"岳阳市","lon":113.2563,"lat":28.9067,"status":"ok","coordSource":"approx"},
    {"id":"changchen-06","name":"范家园阀室","kind":"valve","zoneId":"yueyang","pipelineId":"changchen","seq":6,"adcode":"430600","districtName":"岳阳市","lon":113.0635,"lat":28.9531,"status":"ok","coordSource":"approx"},
    {"id":"changchen-07","name":"汨罗站","kind":"station","zoneId":"yueyang","pipelineId":"changchen","seq":7,"adcode":"430600","districtName":"岳阳市","lon":113.07,"lat":28.81,"status":"danger","coordSource":"surveyed"},
    {"id":"changchen-08","name":"高家坊阀室","kind":"valve","zoneId":"yueyang","pipelineId":"changchen","seq":8,"adcode":"430600","districtName":"岳阳市","lon":113.0785,"lat":28.7037,"status":"ok","coordSource":"approx"},
    {"id":"changchen-09","name":"长沙站","kind":"station","zoneId":"changsha","pipelineId":"changchen","seq":9,"adcode":"430100","districtName":"长沙市","lon":112.9,"lat":28.35,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-10","name":"星城阀室","kind":"valve","zoneId":"changsha","pipelineId":"changchen","seq":10,"adcode":"430100","districtName":"长沙市","lon":113.1273,"lat":28.2339,"status":"ok","coordSource":"approx"},
    {"id":"changchen-11","name":"东方红阀室","kind":"valve","zoneId":"changsha","pipelineId":"changchen","seq":11,"adcode":"430100","districtName":"长沙市","lon":113.0004,"lat":28.0673,"status":"ok","coordSource":"approx"},
    {"id":"changchen-12","name":"含浦阀室","kind":"valve","zoneId":"changsha","pipelineId":"changchen","seq":12,"adcode":"430100","districtName":"长沙市","lon":112.9674,"lat":28.0056,"status":"ok","coordSource":"approx"},
    {"id":"changchen-13","name":"湘潭站","kind":"station","zoneId":"xianglou","pipelineId":"changchen","seq":13,"adcode":"430300","districtName":"湘潭市","lon":112.94,"lat":27.87,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-14","name":"姜畲阀室","kind":"valve","zoneId":"xianglou","pipelineId":"changchen","seq":14,"adcode":"430300","districtName":"湘潭市","lon":112.2905,"lat":27.7186,"status":"ok","coordSource":"approx"},
    {"id":"changchen-15","name":"杨嘉桥阀室","kind":"valve","zoneId":"xianglou","pipelineId":"changchen","seq":15,"adcode":"430300","districtName":"湘潭市","lon":112.1306,"lat":27.7126,"status":"ok","coordSource":"approx"},
    {"id":"changchen-16","name":"继述桥阀室","kind":"valve","zoneId":"xianglou","pipelineId":"changchen","seq":16,"adcode":"431300","districtName":"娄底市","lon":111.6142,"lat":27.7693,"status":"ok","coordSource":"approx"},
    {"id":"changchen-17","name":"茶恩寺阀室","kind":"valve","zoneId":"xianglou","pipelineId":"changchen","seq":17,"adcode":"431300","districtName":"娄底市","lon":111.7666,"lat":27.5793,"status":"ok","coordSource":"approx"},
    {"id":"changchen-18","name":"三樟阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":18,"adcode":"430400","districtName":"衡阳市","lon":112.1657,"lat":27.1978,"status":"ok","coordSource":"approx"},
    {"id":"changchen-19","name":"珍珠阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":19,"adcode":"430400","districtName":"衡阳市","lon":112.2599,"lat":27.1195,"status":"ok","coordSource":"approx"},
    {"id":"changchen-20","name":"城关阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":20,"adcode":"430400","districtName":"衡阳市","lon":112.5112,"lat":26.8869,"status":"ok","coordSource":"approx"},
    {"id":"changchen-21","name":"吴集阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":21,"adcode":"430400","districtName":"衡阳市","lon":112.5309,"lat":26.9304,"status":"ok","coordSource":"approx"},
    {"id":"changchen-22","name":"衡阳站","kind":"station","zoneId":"hengyang","pipelineId":"changchen","seq":22,"adcode":"430400","districtName":"衡阳市","lon":112.61,"lat":26.9,"status":"warn","coordSource":"surveyed"},
    {"id":"changchen-23","name":"冠市阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":23,"adcode":"430400","districtName":"衡阳市","lon":112.8563,"lat":26.4249,"status":"ok","coordSource":"approx"},
    {"id":"changchen-24","name":"新市阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":24,"adcode":"430400","districtName":"衡阳市","lon":112.7131,"lat":26.6414,"status":"ok","coordSource":"approx"},
    {"id":"changchen-25","name":"耒阳站","kind":"station","zoneId":"hengyang","pipelineId":"changchen","seq":25,"adcode":"430400","districtName":"衡阳市","lon":112.86,"lat":26.42,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-26","name":"水东江阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":26,"adcode":"430400","districtName":"衡阳市","lon":112.7239,"lat":26.4537,"status":"ok","coordSource":"approx"},
    {"id":"changchen-27","name":"泗门洲阀室","kind":"valve","zoneId":"hengyang","pipelineId":"changchen","seq":27,"adcode":"430400","districtName":"衡阳市","lon":112.9105,"lat":26.1712,"status":"ok","coordSource":"approx"},
    {"id":"changchen-28","name":"悦来阀室","kind":"valve","zoneId":"yongchen","pipelineId":"changchen","seq":28,"adcode":"431000","districtName":"郴州市","lon":113.0972,"lat":25.8887,"status":"ok","coordSource":"approx"},
    {"id":"changchen-29","name":"洋市阀室","kind":"valve","zoneId":"yongchen","pipelineId":"changchen","seq":29,"adcode":"431000","districtName":"郴州市","lon":112.9869,"lat":25.7564,"status":"ok","coordSource":"approx"},
    {"id":"changchen-30","name":"华塘阀室","kind":"valve","zoneId":"yongchen","pipelineId":"changchen","seq":30,"adcode":"431000","districtName":"郴州市","lon":112.7408,"lat":25.7197,"status":"ok","coordSource":"approx"},
    {"id":"changchen-31","name":"郴州站","kind":"station","zoneId":"yongchen","pipelineId":"changchen","seq":31,"adcode":"431000","districtName":"郴州市","lon":113.03,"lat":25.79,"status":"ok","coordSource":"surveyed"},
    {"id":"changchen-32","name":"沙坪阀室","kind":"valve","zoneId":"yongchen","pipelineId":"changchen","seq":32,"adcode":"431100","districtName":"永州市","lon":111.9929,"lat":25.7997,"status":"ok","coordSource":"approx"},
    {"id":"changchen-33","name":"省界阀室","kind":"valve","zoneId":"yongchen","pipelineId":"changchen","seq":33,"adcode":"431100","districtName":"永州市","lon":111.7347,"lat":25.7702,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-01","name":"1#阀室","kind":"valve","zoneId":"xiangbei","pipelineId":"huanan-an","seq":1,"adcode":"430700","districtName":"常德市","lon":111.4306,"lat":29.354,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-02","name":"华容分输站","kind":"station","zoneId":"xiangbei","pipelineId":"huanan-an","seq":2,"adcode":"430700","districtName":"常德市","lon":111.5642,"lat":29.1805,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-03","name":"2#阀室","kind":"valve","zoneId":"xiangbei","pipelineId":"huanan-an","seq":3,"adcode":"430700","districtName":"常德市","lon":111.6978,"lat":29.0071,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-04","name":"南县分输站","kind":"station","zoneId":"xiangbei","pipelineId":"huanan-an","seq":4,"adcode":"430900","districtName":"益阳市","lon":111.9113,"lat":28.6646,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-05","name":"3#阀室","kind":"valve","zoneId":"xiangbei","pipelineId":"huanan-an","seq":5,"adcode":"430900","districtName":"益阳市","lon":111.9557,"lat":28.6659,"status":"ok","coordSource":"approx"},
    {"id":"huanan-an-06","name":"安乡分输站","kind":"station","zoneId":"xiangbei","pipelineId":"huanan-an","seq":6,"adcode":"430900","districtName":"益阳市","lon":111.8715,"lat":28.6231,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-01","name":"龙山首站","kind":"station","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":1,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.6649,"lat":28.7319,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-02","name":"1#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":2,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":110.017,"lat":28.9898,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-03","name":"2#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":3,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":110.1938,"lat":29.0949,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-04","name":"3#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":4,"adcode":"430800","districtName":"张家界市","lon":110.5076,"lat":29.1733,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-05","name":"4#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":5,"adcode":"430800","districtName":"张家界市","lon":110.4596,"lat":28.924,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-06","name":"5#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":6,"adcode":"430800","districtName":"张家界市","lon":110.3813,"lat":28.8934,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-07","name":"6#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":7,"adcode":"431200","districtName":"怀化市","lon":110.1169,"lat":27.9944,"status":"ok","coordSource":"approx"},
    {"id":"longshan-huayuan-08","name":"花垣分输站","kind":"station","zoneId":"xiangxi","pipelineId":"longshan-huayuan","seq":8,"adcode":"431200","districtName":"怀化市","lon":110.0802,"lat":27.5453,"status":"ok","coordSource":"approx"},
    {"id":"xisanxian-changsha-branch-01","name":"石潭村清管站","kind":"station","zoneId":"changsha","pipelineId":"xisanxian-changsha-branch","seq":1,"adcode":"430100","districtName":"长沙市","lon":113.1136,"lat":28.2506,"status":"ok","coordSource":"approx"},
    {"id":"xisanxian-changsha-branch-02","name":"安沙分输清管站","kind":"station","zoneId":"changsha","pipelineId":"xisanxian-changsha-branch","seq":2,"adcode":"430100","districtName":"长沙市","lon":113.1359,"lat":28.2372,"status":"ok","coordSource":"approx"},
    {"id":"xisanxian-changsha-branch-03","name":"1#阀室","kind":"valve","zoneId":"changsha","pipelineId":"xisanxian-changsha-branch","seq":3,"adcode":"430100","districtName":"长沙市","lon":113.1583,"lat":28.2238,"status":"ok","coordSource":"approx"},
    {"id":"xisanxian-changsha-branch-04","name":"2#阀室（RTU)","kind":"valve","zoneId":"changsha","pipelineId":"xisanxian-changsha-branch","seq":4,"adcode":"430100","districtName":"长沙市","lon":113.1807,"lat":28.2104,"status":"ok","coordSource":"approx"},
    {"id":"xisanxian-changsha-branch-05","name":"望城末站","kind":"station","zoneId":"changsha","pipelineId":"xisanxian-changsha-branch","seq":5,"adcode":"430100","districtName":"长沙市","lon":113.203,"lat":28.1969,"status":"ok","coordSource":"approx"},
    {"id":"changsha-branch-01","name":"长沙支线1#阀室","kind":"valve","zoneId":"changsha","pipelineId":"changsha-branch","seq":1,"adcode":"430100","districtName":"长沙市","lon":113.1136,"lat":28.2506,"status":"ok","coordSource":"approx"},
    {"id":"changsha-branch-02","name":"长沙支线2#阀室","kind":"valve","zoneId":"changsha","pipelineId":"changsha-branch","seq":2,"adcode":"430100","districtName":"长沙市","lon":113.1359,"lat":28.2372,"status":"ok","coordSource":"approx"},
    {"id":"changsha-branch-03","name":"长沙计量站","kind":"station","zoneId":"changsha","pipelineId":"changsha-branch","seq":3,"adcode":"430100","districtName":"长沙市","lon":113.1583,"lat":28.2238,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-01","name":"湘潭支线1#阀室","kind":"valve","zoneId":"changsha","pipelineId":"xiangtan-branch","seq":1,"adcode":"430100","districtName":"长沙市","lon":113.1136,"lat":28.2506,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-02","name":"湘潭支线2#阀室","kind":"valve","zoneId":"changsha","pipelineId":"xiangtan-branch","seq":2,"adcode":"430100","districtName":"长沙市","lon":112.8789,"lat":28.0055,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-03","name":"湘潭支线3#阀室","kind":"valve","zoneId":"changsha","pipelineId":"xiangtan-branch","seq":3,"adcode":"430100","districtName":"长沙市","lon":112.9013,"lat":27.992,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-04","name":"湘潭支线4#阀室","kind":"valve","zoneId":"changsha","pipelineId":"xiangtan-branch","seq":4,"adcode":"430100","districtName":"长沙市","lon":112.6838,"lat":27.9324,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-05","name":"湘潭支线5#阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xiangtan-branch","seq":5,"adcode":"430300","districtName":"湘潭市","lon":112.1258,"lat":27.7127,"status":"ok","coordSource":"approx"},
    {"id":"xiangtan-branch-06","name":"湘潭计量站","kind":"station","zoneId":"xianglou","pipelineId":"xiangtan-branch","seq":6,"adcode":"431300","districtName":"娄底市","lon":111.5619,"lat":27.7697,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-01","name":"1#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":1,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.6649,"lat":28.7319,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-02","name":"2#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":2,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.9462,"lat":28.9281,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-03","name":"3#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":3,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":110.2275,"lat":29.1243,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-04","name":"4#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":4,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":110.2368,"lat":29.1004,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-05","name":"吉首分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":5,"adcode":"430800","districtName":"张家界市","lon":110.5216,"lat":29.1126,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-06","name":"凤凰分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":6,"adcode":"430800","districtName":"张家界市","lon":110.3805,"lat":28.9607,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-07","name":"5#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":7,"adcode":"430800","districtName":"张家界市","lon":110.3925,"lat":28.889,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-08","name":"麻阳分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":8,"adcode":"431200","districtName":"怀化市","lon":110.2366,"lat":28.1843,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-09","name":"6#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":9,"adcode":"431200","districtName":"怀化市","lon":110.2223,"lat":27.8265,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-huaihua-10","name":"怀化分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-huaihua","seq":10,"adcode":"431200","districtName":"怀化市","lon":110.2079,"lat":27.4686,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-01","name":"保靖分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":1,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.6649,"lat":28.7319,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-02","name":"1#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":2,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.9772,"lat":28.9551,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-03","name":"2#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":3,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":110.1779,"lat":29.081,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-04","name":"永顺分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":4,"adcode":"430800","districtName":"张家界市","lon":110.5453,"lat":29.3274,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-05","name":"3#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":5,"adcode":"430800","districtName":"张家界市","lon":110.4825,"lat":28.9528,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-06","name":"4#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":6,"adcode":"430800","districtName":"张家界市","lon":110.3771,"lat":28.9114,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-07","name":"5#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":7,"adcode":"431200","districtName":"怀化市","lon":110.1923,"lat":28.3025,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-08","name":"6#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":8,"adcode":"431200","districtName":"怀化市","lon":110.1682,"lat":27.9047,"status":"ok","coordSource":"approx"},
    {"id":"huayuan-zhangjiajie-09","name":"张家界分输站","kind":"station","zoneId":"xiangxi","pipelineId":"huayuan-zhangjiajie","seq":9,"adcode":"431200","districtName":"怀化市","lon":110.144,"lat":27.507,"status":"ok","coordSource":"approx"},
    {"id":"xiangzhu-branch-01","name":"九华阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xiangzhu-branch","seq":1,"adcode":"430300","districtName":"湘潭市","lon":112.5682,"lat":27.7524,"status":"ok","coordSource":"approx"},
    {"id":"xiangzhu-branch-02","name":"荷塘阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xiangzhu-branch","seq":2,"adcode":"431300","districtName":"娄底市","lon":111.634,"lat":27.7554,"status":"ok","coordSource":"approx"},
    {"id":"xiangzhu-branch-03","name":"株洲站","kind":"station","zoneId":"zhuzhou","pipelineId":"xiangzhu-branch","seq":3,"adcode":"430200","districtName":"株洲市","lon":113.13,"lat":27.83,"status":"ok","coordSource":"surveyed"},
    {"id":"xiangzhu-branch-04","name":"昭山阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xiangzhu-branch","seq":4,"adcode":"430300","districtName":"湘潭市","lon":112.684,"lat":27.6791,"status":"ok","coordSource":"approx"},
    {"id":"xiangzhu-branch-05","name":"154国库站","kind":"station","zoneId":"zhuzhou","pipelineId":"xiangzhu-branch","seq":5,"adcode":"430200","districtName":"株洲市","lon":113.5856,"lat":27.078,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-01","name":"云湖桥阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":1,"adcode":"430300","districtName":"湘潭市","lon":112.5682,"lat":27.7524,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-02","name":"东郊阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":2,"adcode":"430300","districtName":"湘潭市","lon":112.3138,"lat":27.7424,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-03","name":"虞塘阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":3,"adcode":"430300","districtName":"湘潭市","lon":112.1692,"lat":27.7315,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-04","name":"杏子铺阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":4,"adcode":"431300","districtName":"娄底市","lon":111.8131,"lat":27.7174,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-05","name":"蛇形山阀室","kind":"valve","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":5,"adcode":"431300","districtName":"娄底市","lon":111.7832,"lat":27.6916,"status":"ok","coordSource":"approx"},
    {"id":"xianglou-branch-06","name":"娄底站","kind":"station","zoneId":"xianglou","pipelineId":"xianglou-branch","seq":6,"adcode":"431300","districtName":"娄底市","lon":112,"lat":27.7,"status":"ok","coordSource":"surveyed"},
    {"id":"xierxian-zhangxiang-link-01","name":"湘潭末站","kind":"station","zoneId":"xianglou","pipelineId":"xierxian-zhangxiang-link","seq":1,"adcode":"430300","districtName":"湘潭市","lon":112.5682,"lat":27.7524,"status":"ok","coordSource":"approx"},
    {"id":"xierxian-zhangxiang-link-02","name":"10#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"xierxian-zhangxiang-link","seq":2,"adcode":"430200","districtName":"株洲市","lon":113.0271,"lat":27.4464,"status":"ok","coordSource":"approx"},
    {"id":"xierxian-zhangxiang-link-03","name":"株洲分输站","kind":"station","zoneId":"zhuzhou","pipelineId":"xierxian-zhangxiang-link","seq":3,"adcode":"430200","districtName":"株洲市","lon":113.0841,"lat":27.4096,"status":"ok","coordSource":"approx"},
    {"id":"xierxian-zhangxiang-link-04","name":"9#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"xierxian-zhangxiang-link","seq":4,"adcode":"430200","districtName":"株洲市","lon":113.1886,"lat":27.3418,"status":"ok","coordSource":"approx"},
    {"id":"xierxian-zhangxiang-link-05","name":"醴陵分输压气站","kind":"station","zoneId":"zhuzhou","pipelineId":"xierxian-zhangxiang-link","seq":5,"adcode":"430200","districtName":"株洲市","lon":113.4028,"lat":27.2005,"status":"ok","coordSource":"approx"},
    {"id":"xierxian-zhangxiang-link-06","name":"8#阀室","kind":"valve","zoneId":"zhuzhou","pipelineId":"xierxian-zhangxiang-link","seq":6,"adcode":"430200","districtName":"株洲市","lon":113.4602,"lat":27.1533,"status":"ok","coordSource":"approx"},
    {"id":"mayang-chenxi-01","name":"1#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"mayang-chenxi","seq":1,"adcode":"433100","districtName":"湘西土家族苗族自治州","lon":109.6649,"lat":28.7319,"status":"ok","coordSource":"approx"},
    {"id":"mayang-chenxi-02","name":"2#阀室","kind":"valve","zoneId":"xiangxi","pipelineId":"mayang-chenxi","seq":2,"adcode":"430800","districtName":"张家界市","lon":110.407,"lat":28.9982,"status":"ok","coordSource":"approx"},
    {"id":"mayang-chenxi-03","name":"辰溪分输站","kind":"station","zoneId":"xiangxi","pipelineId":"mayang-chenxi","seq":3,"adcode":"431200","districtName":"怀化市","lon":110.0802,"lat":27.5453,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-01","name":"广西支干线1#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":1,"adcode":"430400","districtName":"衡阳市","lon":112.5047,"lat":26.8358,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-02","name":"广西支干线2#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":2,"adcode":"430400","districtName":"衡阳市","lon":112.6324,"lat":26.6561,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-03","name":"广西支干线3#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":3,"adcode":"430400","districtName":"衡阳市","lon":112.7601,"lat":26.4764,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-04","name":"广西支干线4#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":4,"adcode":"430400","districtName":"衡阳市","lon":112.8878,"lat":26.2967,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-05","name":"广西支干线5#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":5,"adcode":"430400","districtName":"衡阳市","lon":112.9284,"lat":26.2517,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-06","name":"广西支干线6#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":6,"adcode":"430400","districtName":"衡阳市","lon":112.8804,"lat":26.1981,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-07","name":"广西支干线7#阀室","kind":"valve","zoneId":"hengyang","pipelineId":"guangxi-branch-trunk","seq":7,"adcode":"430400","districtName":"衡阳市","lon":112.907,"lat":26.1924,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-08","name":"广西支干线8#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":8,"adcode":"431000","districtName":"郴州市","lon":113.0026,"lat":25.8072,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-09","name":"广西支干线9#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":9,"adcode":"431000","districtName":"郴州市","lon":112.875,"lat":25.7698,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-10","name":"广西支干线10#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":10,"adcode":"431000","districtName":"郴州市","lon":112.7474,"lat":25.7324,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-11","name":"广西支干线11#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":11,"adcode":"431000","districtName":"郴州市","lon":112.51,"lat":25.8467,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-12","name":"广西支干线12#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":12,"adcode":"431100","districtName":"永州市","lon":112.2366,"lat":25.8109,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-13","name":"永州分输清管站","kind":"station","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":13,"adcode":"431100","districtName":"永州市","lon":112.0969,"lat":25.7808,"status":"warn","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-14","name":"广西支干线13#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":14,"adcode":"431100","districtName":"永州市","lon":111.9572,"lat":25.7507,"status":"ok","coordSource":"approx"},
    {"id":"guangxi-branch-trunk-15","name":"广西支干线14#阀室","kind":"valve","zoneId":"yongchen","pipelineId":"guangxi-branch-trunk","seq":15,"adcode":"431100","districtName":"永州市","lon":111.8175,"lat":25.7205,"status":"ok","coordSource":"approx"},
    {"id":"shaoyangshi-shaoyangxian-01","name":"1#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyangshi-shaoyangxian","seq":1,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaoyangshi-shaoyangxian-02","name":"2#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyangshi-shaoyangxian","seq":2,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaoyangshi-shaoyangxian-03","name":"3#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyangshi-shaoyangxian","seq":3,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaoyangshi-shaoyangxian-04","name":"邵阳西分输站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyangshi-shaoyangxian","seq":4,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-01","name":"邵阳东分输站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":1,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-02","name":"邵东分输站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":2,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-03","name":"6#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":3,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-04","name":"5#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":4,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-05","name":"4#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":5,"adcode":"430500","districtName":"邵阳市","lon":110.9731,"lat":26.8541,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-06","name":"3#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":6,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-07","name":"2#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":7,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-08","name":"1#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":8,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-shaodongshi-09","name":"永州首站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyang-shaodongshi","seq":9,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"shaodong-shuangfeng-01","name":"古塘村阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaodong-shuangfeng","seq":1,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaodong-shuangfeng-02","name":"中益村阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaodong-shuangfeng","seq":2,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaodong-shuangfeng-03","name":"青树坪阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaodong-shuangfeng","seq":3,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaodong-shuangfeng-04","name":"双峰末站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaodong-shuangfeng","seq":4,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-01","name":"1#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":1,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-02","name":"2#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":2,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-03","name":"隆回末站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":3,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-04","name":"3#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":4,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-05","name":"4#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":5,"adcode":"430500","districtName":"邵阳市","lon":110.9731,"lat":26.8541,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-06","name":"8#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":6,"adcode":"430500","districtName":"邵阳市","lon":110.7863,"lat":26.9662,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-07","name":"5#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":7,"adcode":"430500","districtName":"邵阳市","lon":110.833,"lat":26.9382,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-08","name":"9#阀室","kind":"valve","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":8,"adcode":"430500","districtName":"邵阳市","lon":110.8797,"lat":26.9101,"status":"ok","coordSource":"approx"},
    {"id":"shaoyang-dongkou-xinning-09","name":"洞口末站","kind":"station","zoneId":"xiangzhong","pipelineId":"shaoyang-dongkou-xinning","seq":9,"adcode":"430500","districtName":"邵阳市","lon":110.9264,"lat":26.8821,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-01","name":"桂阳分输站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":1,"adcode":"431000","districtName":"郴州市","lon":113.0346,"lat":25.8755,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-02","name":"郴州西分输站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":2,"adcode":"431000","districtName":"郴州市","lon":113.0881,"lat":25.8434,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-03","name":"1#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":3,"adcode":"431000","districtName":"郴州市","lon":113.1417,"lat":25.8112,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-04","name":"2#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":4,"adcode":"431000","districtName":"郴州市","lon":113.1952,"lat":25.7791,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-05","name":"郴州东分输站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":5,"adcode":"431000","districtName":"郴州市","lon":113.2488,"lat":25.747,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-06","name":"3#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":6,"adcode":"431000","districtName":"郴州市","lon":113.0346,"lat":25.8755,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-07","name":"4#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":7,"adcode":"431000","districtName":"郴州市","lon":113.0881,"lat":25.8434,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-chenzhou-zixing-08","name":"资兴分输站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-chenzhou-zixing","seq":8,"adcode":"431000","districtName":"郴州市","lon":113.1417,"lat":25.8112,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-linwu-01","name":"1#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-linwu","seq":1,"adcode":"431000","districtName":"郴州市","lon":113.0346,"lat":25.8755,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-linwu-02","name":"2#阀室","kind":"valve","zoneId":"chenzhou","pipelineId":"guiyang-linwu","seq":2,"adcode":"431000","districtName":"郴州市","lon":113.0881,"lat":25.8434,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-linwu-03","name":"荷叶清管站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-linwu","seq":3,"adcode":"431000","districtName":"郴州市","lon":113.1417,"lat":25.8112,"status":"ok","coordSource":"approx"},
    {"id":"guiyang-linwu-04","name":"临武分输站","kind":"station","zoneId":"chenzhou","pipelineId":"guiyang-linwu","seq":4,"adcode":"431000","districtName":"郴州市","lon":113.1952,"lat":25.7791,"status":"ok","coordSource":"approx"},
  ];

  var ZONE_DISTRICTS = {"yueyang":["430600"],"changsha":["430100"],"xianglou":["430300","431300"],"zhuzhou":["430200"],"hengyang":["430400"],"yongchen":["431100","431000"],"xiangbei":["430700","430900"],"xiangzhong":["430500"],"chenzhou":["431000"],"xiangxi":["433100","430800","431200"]};
  var ZONE_STATUSES = {"yueyang":"danger","changsha":"ok","xianglou":"ok","zhuzhou":"warn","hengyang":"warn","yongchen":"warn","xiangbei":"ok","xiangzhong":"ok","chenzhou":"ok","xiangxi":"ok"};

  function requireGeo() {
    if (!window.HunanGeo || typeof window.HunanGeo.lonLatToWorld !== "function") {
      throw new Error("[HunanSites] 需要 window.HunanGeo.lonLatToWorld()——请先加载 scripts/data/geo.js");
    }
    return window.HunanGeo;
  }

  // 世界坐标现算不缓存：投影参数只有 geo.js 一份真源，这里绝不另存一套换算，
  // 否则改投影时会出现「省界动了、站点没动」这种最难查的错位。
  function withWorld(site) {
    var w = requireGeo().lonLatToWorld(site.lon, site.lat);
    var out = {};
    Object.keys(site).forEach(function (k) { out[k] = site[k]; });
    out.x = w[0];
    out.z = w[1];
    return out;
  }

  function sites() {
    return SITES.map(withWorld);
  }

  function site(id) {
    var i;
    for (i = 0; i < SITES.length; i += 1) {
      if (SITES[i].id === id) return withWorld(SITES[i]);
    }
    throw new Error("[HunanSites] 未知站点 id：" + id);
  }

  function sitesByZone(zoneId) {
    if (!ZONE_DISTRICTS[zoneId]) throw new Error("[HunanSites] 未知 zoneId：" + zoneId);
    return SITES.filter(function (s) { return s.zoneId === zoneId; }).map(withWorld);
  }

  function sitesByDistrict(adcode) {
    return SITES.filter(function (s) { return s.adcode === adcode; }).map(withWorld);
  }

  function zoneStatuses() {
    var out = {};
    Object.keys(ZONE_STATUSES).forEach(function (k) { out[k] = ZONE_STATUSES[k]; });
    return out;
  }

  function zoneProgress(zoneId) {
    var list = SITES.filter(function (s) { return s.zoneId === zoneId; });
    var bad = list.filter(function (s) { return s.status !== "ok"; }).length;
    return { total: list.length, issueCount: bad, okCount: list.length - bad };
  }

  function provinceSummary() {
    var station = SITES.filter(function (s) { return s.kind === "station"; }).length;
    var valve = SITES.filter(function (s) { return s.kind === "valve"; }).length;
    var issue = SITES.filter(function (s) { return s.status !== "ok"; }).length;
    var approx = SITES.filter(function (s) { return s.coordSource === "approx"; }).length;
    return {
      siteTotal: SITES.length, stationTotal: station, valveTotal: valve,
      issueTotal: issue, approxCoordCount: approx,
      zoneTotal: Object.keys(ZONE_DISTRICTS).length,
      districtTotal: (function () {
        var m = {};
        Object.keys(ZONE_DISTRICTS).forEach(function (z) {
          ZONE_DISTRICTS[z].forEach(function (a) { m[a] = true; });
        });
        return Object.keys(m).length;
      })()
    };
  }

  window.HunanSites = {
    meta: function () {
      return { scope: "all", label: "hunan-inspection-overview", siteTotal: SITES.length };
    },
    zoneDistricts: function () {
      var out = {};
      Object.keys(ZONE_DISTRICTS).forEach(function (z) { out[z] = ZONE_DISTRICTS[z].slice(); });
      return out;
    },
    sites: sites,
    site: site,
    sitesByZone: sitesByZone,
    sitesByDistrict: sitesByDistrict,
    zoneStatuses: zoneStatuses,
    zoneProgress: zoneProgress,
    provinceSummary: provinceSummary
  };
}());
