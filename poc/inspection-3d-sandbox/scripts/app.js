(function () {
  "use strict";

  var activePartId = "coupling";
  var root = document.getElementById("cardRoot");

  function statuses() {
    var result = {};
    window.DemoData.parts().forEach(function (part) {
      result[part.id] = part.status;
    });
    return result;
  }

  function legend(status, label) {
    return window.h("span", {}, [
      window.h("i", { class: "dot " + status }),
      window.h("span", { text: label })
    ]);
  }

  function renderMap(part) {
    return window.h("section", { class: "panel station-map-panel" }, [
      window.h("div", { class: "station-map-head" }, [
        window.h("div", {}, [
          window.h("p", { class: "kicker", text: "设备结构图 / 部位风险" }),
          window.h("h3", { text: "电机 - 联轴器 - 泵体 - 管线" })
        ]),
        window.h("div", { class: "train-legend" }, [
          legend("danger", "异常"),
          legend("warn", "关注"),
          legend("ok", "排除")
        ])
      ]),
      window.renderPumpTrain(part.id, "station")
    ]);
  }

  function mount3d() {
    var host = root.querySelector("[" + window.Pump3DContract.HOST_ATTR + "]");
    window.Pump3D.mount(host, {
      preset: "station",
      activeId: activePartId,
      statuses: statuses()
    });
    window.Pump3DContract.assertPinNamespace();
  }

  function render() {
    window.Pump3D.detach();
    root.replaceChildren(renderMap(window.DemoData.part(activePartId)));
    mount3d();
  }

  root.addEventListener("click", function (event) {
    var pin = event.target.closest("[" + window.Pump3DContract.PIN_ATTR + "]");
    if (!pin || !root.contains(pin)) return;
    activePartId = pin.getAttribute(window.Pump3DContract.PIN_ATTR);
    render();
  });

  window.Pump3DContract.assertData();
  render();
}());
