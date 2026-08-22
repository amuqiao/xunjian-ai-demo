// window.HunanSites —— 喂给 3D 层的站点投影。
//
// 【为什么要这一层】3D 引擎（engine.js / model-*.js，一字未改）只认一个契约：
// data.sites[] 里每个点有 id / name / zoneId / lon / lat / status。它不关心这些点是
// 阀室还是泵站。旧目录喂的是成品油 44 个节点（站场 11 + 阀室 33）——**阀室里没有泵**，
// 屏上 3/4 的点跟泵课题无关。本文件把它换成 **7 个站库**，也就是台账里真正装了机组的那些。
//
// 【为什么是投影而不是改 model-sites.js】把"第一维从站点换成机组"这件事只在数据层做一次，
// 3D 层就完全不用动（engine.js 与旧目录、与巡检那两个 POC 逐字节相同，是禁改区）。
//
// 【地图上的标签层级】引擎里 showZones = (level === "province")：省域态显示作业区标签，
// 下钻后才显示站点标签。所以省域看到的是 6 个作业区（含永郴 0 台），点进去才看到站库。
// 站点光柱（InstancedMesh）始终只有这 7 根 —— 这就是"只上 7 个站库"的落点。
//
// status 是**派生**的，不是手写的：见下面 stationStatus() 的三条规则。改规则改那个函数，
// 不要在数据里手工写死状态，否则台账一变、屏上颜色就骗人了。
window.HunanSites = (function () {
  "use strict";

  function need(name) {
    if (!window[name]) throw new Error("[HunanSites] 需要先加载 " + name);
    return window[name];
  }

  var ASOF = new Date(2026, 7, 23);   // 屏上的"今天"。固定值，不取 now —— 演示要可重现。

  function requireGeo() {
    if (!window.HunanGeo || typeof window.HunanGeo.lonLatToWorld !== "function") {
      throw new Error("[HunanSites] 需要 window.HunanGeo.lonLatToWorld()，请先加载 scripts/data/geo.js");
    }
    return window.HunanGeo;
  }

  // 三条规则，从台账与监测报告现算：
  //   danger —— 该站库有 2026-06 在线监测判故障的机组（长岭 P-4 松动 / 衡阳 P-2 轴承磨损）
  //   warn   —— 该站库所有机组都已达 10 年大修节点却没有大修记录，或投用日期在台账里未填报
  //   ok     —— 其余
  function stationStatus(name) {
    var Ledger = need("PumpLedger");
    var State = need("PumpState");
    var list = Ledger.pumpsByStation(name);
    var hasFault = list.some(function (p) { return !!State.faultUnitOf(name, p.tag); });
    if (hasFault) return "danger";
    var commissionMissing = list.some(function (p) { return !p.commissionAt; });
    var allDueNoLog = list.every(function (p) {
      var y = Ledger.serviceYears(p, ASOF);
      return y !== null && y >= 10 && !p.overhaulLast;
    });
    return (commissionMissing || allDueNoLog) ? "warn" : "ok";
  }

  function buildSites() {
    var Ledger = need("PumpLedger");
    return Ledger.stations().map(function (st, i) {
      return {
        // id 用 pump-01..07：它只是 3D 层的键，不要拿去当业务编号。
        id: "pump-" + (i < 9 ? "0" : "") + (i + 1),
        name: st.name,
        kind: "station",           // 7 个全是站场；本 POC 不再有 valve
        zoneId: st.zoneId,
        adcode: st.adcode,
        districtName: st.districtName,
        lon: st.lon, lat: st.lat,
        coordSource: st.coordSource,
        status: stationStatus(st.name),
        pumpTotal: Ledger.pumpsByStation(st.name).length
      };
    });
  }

  var SITES = null;
  function all() {
    if (!SITES) SITES = buildSites();
    return SITES;
  }

  // 世界坐标现算不缓存：投影参数只有 geo.js 一份真源，这里绝不另存一套换算，
  // 否则改投影时会出现「省界动了、站点没动」这种最难查的错位。
  function withWorld(site) {
    var w = requireGeo().lonLatToWorld(site.lon, site.lat);
    var out = {};
    Object.keys(site).forEach(function (k) { out[k] = site[k]; });
    out.x = w[0];
    out.y = w[1];
    return out;
  }

  function sites() { return all().map(withWorld); }

  function site(id) {
    var f = all().filter(function (s) { return s.id === id; })[0];
    if (!f) throw new Error("[HunanSites] 未知站点 id：" + id);
    return withWorld(f);
  }

  function sitesByZone(zoneId) {
    var zd = need("PumpLedger").zoneDistricts();
    if (!zd[zoneId]) throw new Error("[HunanSites] 未知 zoneId：" + zoneId);
    return all().filter(function (s) { return s.zoneId === zoneId; }).map(withWorld);
  }

  function sitesByDistrict(adcode) {
    return all().filter(function (s) { return s.adcode === adcode; }).map(withWorld);
  }

  // 作业区状态 = 该区各站库状态里最重的那个。永郴 0 台 → ok（不是数据缺失，
  // 是这个区本来就没有输油泵机组）。
  function zoneStatuses() {
    var order = { ok: 0, warn: 1, danger: 2 };
    var out = {};
    Object.keys(need("PumpLedger").zoneDistricts()).forEach(function (zoneId) {
      var list = all().filter(function (s) { return s.zoneId === zoneId; });
      out[zoneId] = list.reduce(function (acc, s) {
        return order[s.status] > order[acc] ? s.status : acc;
      }, "ok");
    });
    return out;
  }

  function zoneProgress(zoneId) {
    var list = all().filter(function (s) { return s.zoneId === zoneId; });
    var bad = list.filter(function (s) { return s.status !== "ok"; }).length;
    return { total: list.length, issueCount: bad, okCount: list.length - bad };
  }

  return {
    meta: function () {
      return { scope: "pump", label: "hunan-pump-overview-v2", siteTotal: all().length };
    },
    zoneDistricts: function () { return need("PumpLedger").zoneDistricts(); },
    sites: sites,
    site: site,
    sitesByZone: sitesByZone,
    sitesByDistrict: sitesByDistrict,
    zoneStatuses: zoneStatuses,
    zoneProgress: zoneProgress,
    asOf: function () { return new Date(ASOF.getTime()); }
  };
})();
