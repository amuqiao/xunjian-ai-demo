// 本文件由 tools/build-sites.js 生成，不要手改。
// 改坐标/映射/演示状态请改该脚本里的三张手工输入表后重跑：
//   node poc/hunan-inspection-overview/tools/build-sites.js
//
// 数据范围：hunan-pump-overview（scope=oil，共 44 个站点）
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
  ];

  var ZONE_DISTRICTS = {"yueyang":["430600"],"changsha":["430100"],"xianglou":["430300","431300"],"zhuzhou":["430200"],"hengyang":["430400"],"yongchen":["431100","431000"],"xiangbei":["430700","430900"],"xiangzhong":["430500"],"chenzhou":["431000"],"xiangxi":["433100","430800","431200"]};
  var ZONE_STATUSES = {"yueyang":"danger","changsha":"ok","xianglou":"ok","zhuzhou":"ok","hengyang":"warn","yongchen":"ok","xiangbei":"ok","xiangzhong":"ok","chenzhou":"ok","xiangxi":"ok"};

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
      return { scope: "oil", label: "hunan-pump-overview", siteTotal: SITES.length };
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
