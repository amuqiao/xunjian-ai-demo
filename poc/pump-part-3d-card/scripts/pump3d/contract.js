(function () {
  "use strict";

  var POINT_IDS = [
    "valve",
    "metering",
    "pump",
    "tank",
    "control",
    "waste",
    "oil",
    "comm",
    "power",
    "transformer",
    "warehouse",
    "plc",
    "ups"
  ];
  var STATUSES = ["done", "ok", "warn", "danger"];
  var HOST_ATTR = "data-inspection3d-host";
  var LABELS_CLASS = "pump3d-labels";
  var PIN_ATTR = "data-inspection-point";

  function arraysEqual(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function assertIdSet(label, obj) {
    var keys = Object.keys(obj);
    var sortedKeys = keys.slice().sort();
    var sortedIds = POINT_IDS.slice().sort();
    if (arraysEqual(sortedKeys, sortedIds)) return;
    var missing = POINT_IDS.filter(function (id) { return keys.indexOf(id) < 0; });
    var extra = keys.filter(function (id) { return POINT_IDS.indexOf(id) < 0; });
    throw new Error(
      "[Inspection3DContract] " + label + " 与 POINT_IDS 不一致：" +
      "缺少 [" + missing.join(", ") + "]，多余 [" + extra.join(", ") + "]；" +
      "实际集合 [" + keys.join(", ") + "]，应为 [" + POINT_IDS.join(", ") + "]"
    );
  }

  function assertData() {
    if (!window.THREE) throw new Error("[Inspection3DContract] window.THREE 未加载");
    if (!window.DemoData) throw new Error("[Inspection3DContract] window.DemoData 未加载");
    if (!window.Pump3DModel) throw new Error("[Inspection3DContract] window.Pump3DModel 未加载");
    if (!window.Pump3D) throw new Error("[Inspection3DContract] window.Pump3D 未加载");

    var areaIndex = {};
    window.DemoData.areas().forEach(function (area) {
      areaIndex[area.id] = true;
      if (STATUSES.indexOf(area.status) < 0) {
        throw new Error("[Inspection3DContract] 区域 " + area.id + " 的 status 非法：" + area.status);
      }
    });
    assertIdSet("scripts/data.js 的 areas", areaIndex);
  }

  function assertDom(host, options) {
    var hosts = document.querySelectorAll("[" + HOST_ATTR + "]");
    if (hosts.length !== 1) {
      throw new Error("[Inspection3DContract] 页面中 [" + HOST_ATTR + "] 应恰好 1 个，实际 " + hosts.length + " 个");
    }
    if (!options || !options.statuses) {
      throw new Error("[Inspection3DContract] Pump3D.mount 缺少 options.statuses");
    }
    assertIdSet("options.statuses", options.statuses);

    var labelsRoot = host.querySelector("." + LABELS_CLASS);
    if (!labelsRoot) throw new Error("[Inspection3DContract] 宿主内缺少 ." + LABELS_CLASS);
    var pins = labelsRoot.querySelectorAll("[" + PIN_ATTR + "]");
    if (pins.length !== POINT_IDS.length) {
      throw new Error("[Inspection3DContract] 巡检点标签数量为 " + pins.length + "，应为 " + POINT_IDS.length);
    }
    var pinIndex = {};
    Array.prototype.forEach.call(pins, function (pin) { pinIndex[pin.getAttribute(PIN_ATTR)] = true; });
    assertIdSet("DOM 巡检点标签", pinIndex);

    if (host.clientWidth === 0 || host.clientHeight === 0) {
      throw new Error("[Inspection3DContract] 3D 宿主盒尺寸为 0");
    }
  }

  window.Pump3DContract = {
    POINT_IDS: POINT_IDS,
    PART_IDS: POINT_IDS,
    STATUSES: STATUSES,
    HOST_ATTR: HOST_ATTR,
    LABELS_CLASS: LABELS_CLASS,
    PIN_ATTR: PIN_ATTR,
    assertIdSet: assertIdSet,
    assertData: assertData,
    assertDom: assertDom,
    assertPinNamespace: function () {}
  };
}());
