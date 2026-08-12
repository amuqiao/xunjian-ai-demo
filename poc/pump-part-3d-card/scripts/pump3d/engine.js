(function () {
  "use strict";

  var COLORS = {
    done: "#31d690",
    ok: "#31d690",
    warn: "#e8b84a",
    danger: "#ff5f57",
    active: "#68d8ff"
  };

  var CAMERA = {
    radius: 32,
    minRadius: 22,
    maxRadius: 48,
    theta: -0.9,
    phi: 0.78,
    target: { x: -1, y: 0.4, z: -0.6 }
  };

  var engine = null;

  function requireThree() {
    if (!window.THREE) throw new Error("THREE 未加载，请检查 vendor/three.min.js");
    return window.THREE;
  }

  function requireModel() {
    if (!window.Pump3DModel) throw new Error("Pump3DModel 未加载，请检查 scripts/pump3d/model.js");
    return window.Pump3DModel;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createRenderer(THREE, canvas) {
    var gl = canvas.getContext("webgl2", { antialias: true, alpha: true }) ||
      canvas.getContext("webgl", { antialias: true, alpha: true });
    if (!gl) throw new Error("WebGL 不可用，无法渲染 3D 巡检地图");
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return renderer;
  }

  function updateCamera(instance) {
    var orbit = instance.orbit;
    var sinPhi = Math.sin(orbit.phi);
    instance.camera.position.set(
      orbit.target.x + orbit.radius * sinPhi * Math.cos(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * sinPhi * Math.sin(orbit.theta)
    );
    instance.camera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z);
  }

  function createLights(THREE, scene) {
    scene.add(new THREE.HemisphereLight(0xa7dce6, 0x12201a, 1.25));
    var sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-14, 24, -12);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);
    var rim = new THREE.DirectionalLight(0x65d8ff, 0.75);
    rim.position.set(18, 12, 18);
    scene.add(rim);
  }

  function makeHotspot(THREE, status) {
    var group = new THREE.Group();
    var color = COLORS[status] || COLORS.done;
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 24, 16),
      new THREE.MeshBasicMaterial({ color: color })
    );
    core.position.y = 0;
    group.add(core);

    var ring = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.82, 36),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: status === "danger" ? 0.65 : 0.36,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    group.add(ring);

    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1.9, 10),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 })
    );
    pole.position.y = -0.95;
    group.add(pole);
    return { group: group, core: core, ring: ring, pole: pole };
  }

  function createHotspots(instance, statuses) {
    var THREE = instance.THREE;
    var hotspots = {};
    var hotspotRoot = new THREE.Group();
    window.Pump3DContract.POINT_IDS.forEach(function (id) {
      var anchor = instance.model.anchors[id];
      var hotspot = makeHotspot(THREE, statuses[id]);
      hotspot.group.position.copy(anchor);
      hotspotRoot.add(hotspot.group);
      hotspots[id] = hotspot;
    });
    instance.scene.add(hotspotRoot);
    instance.hotspotRoot = hotspotRoot;
    instance.hotspots = hotspots;
  }

  function createAgent(THREE, instance) {
    var agent = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x7fffd1 })
    );
    var halo = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.78, 36),
      new THREE.MeshBasicMaterial({ color: 0x7fffd1, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    agent.add(body);
    agent.add(halo);
    instance.scene.add(agent);
    instance.agent = agent;
  }

  function setStatus(instance, id, status) {
    var THREE = instance.THREE;
    var hotspot = instance.hotspots[id];
    if (!hotspot) throw new Error("缺少巡检点热点：" + id);
    var color = new THREE.Color(COLORS[status] || COLORS.done);
    hotspot.core.material.color.copy(color);
    hotspot.ring.material.color.copy(color);
    hotspot.pole.material.color.copy(color);
    hotspot.ring.material.opacity = status === "danger" ? 0.68 : status === "warn" ? 0.48 : 0.32;
  }

  function setStatuses(instance, statuses) {
    window.Pump3DContract.POINT_IDS.forEach(function (id) {
      var status = statuses[id];
      if (!status) throw new Error("缺少巡检点状态：" + id);
      if (window.Pump3DContract.STATUSES.indexOf(status) < 0) {
        throw new Error("未知巡检点状态：" + status);
      }
      setStatus(instance, id, status);
    });
  }

  function setActive(instance, id) {
    var THREE = instance.THREE;
    instance.activeId = id;
    window.Pump3DContract.POINT_IDS.forEach(function (pointId) {
      var hotspot = instance.hotspots[pointId];
      var isActive = pointId === id;
      hotspot.core.scale.setScalar(isActive ? 1.45 : 1);
      hotspot.ring.scale.setScalar(isActive ? 1.5 : 1);
      if (isActive) {
        hotspot.core.material.color.copy(new THREE.Color(COLORS.active));
      }
    });
  }

  function buildLabelMap(instance, host) {
    var labels = {};
    host.querySelectorAll("[" + window.Pump3DContract.PIN_ATTR + "]").forEach(function (el) {
      labels[el.getAttribute(window.Pump3DContract.PIN_ATTR)] = el;
    });
    instance.labels = labels;
  }

  function syncLabels(instance) {
    if (!instance.host) return;
    var width = instance.host.clientWidth;
    var height = instance.host.clientHeight;
    var scratch = instance.scratch;
    window.Pump3DContract.POINT_IDS.forEach(function (id) {
      var el = instance.labels[id];
      var anchor = instance.model.anchors[id];
      if (!el || !anchor) return;
      scratch.copy(anchor).project(instance.camera);
      if (scratch.z > 1) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        return;
      }
      var x = (scratch.x * 0.5 + 0.5) * width;
      var y = (-scratch.y * 0.5 + 0.5) * height;
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.transform = "translate3d(" + Math.round(x - el.offsetWidth / 2) + "px," + Math.round(y - el.offsetHeight - 8) + "px,0)";
    });
  }

  function syncAgent(instance, now) {
    if (!instance.agent || !instance.model.routePoints.length) return;
    var points = instance.model.routePoints;
    var segmentFloat = ((now * 0.00008) % 1) * (points.length - 1);
    var index = Math.floor(segmentFloat);
    var t = segmentFloat - index;
    var a = points[index];
    var b = points[Math.min(index + 1, points.length - 1)];
    instance.agent.position.lerpVectors(a, b, t);
    instance.agent.position.y = 2.3;
    instance.agent.children[1].lookAt(instance.camera.position);
    instance.agent.children[1].scale.setScalar(1 + Math.sin(now * 0.004) * 0.12);
  }

  function resize(instance) {
    if (!instance.host) return;
    var width = instance.host.clientWidth;
    var height = instance.host.clientHeight;
    if (!width || !height) return;
    instance.renderer.setSize(width, height, false);
    instance.camera.aspect = width / height;
    instance.camera.updateProjectionMatrix();
  }

  function renderFrame(instance, now) {
    if (!instance.host) return;
    updateCamera(instance);
    Object.keys(instance.hotspots).forEach(function (id) {
      var hotspot = instance.hotspots[id];
      hotspot.ring.lookAt(instance.camera.position);
      var pulse = id === instance.activeId ? 1.18 : 1 + Math.sin(now * 0.003 + id.length) * 0.05;
      hotspot.ring.scale.setScalar(pulse);
    });
    syncAgent(instance, now);
    syncLabels(instance);
    instance.renderer.render(instance.scene, instance.camera);
  }

  function startLoop(instance) {
    if (instance.frameId) return;
    function tick(now) {
      instance.frameId = window.requestAnimationFrame(tick);
      renderFrame(instance, now);
    }
    instance.frameId = window.requestAnimationFrame(tick);
  }

  function stopLoop(instance) {
    if (!instance.frameId) return;
    window.cancelAnimationFrame(instance.frameId);
    instance.frameId = null;
  }

  function attachControls(instance) {
    var canvas = instance.canvas;
    var dragging = false;
    var pointerId = null;
    var lastX = 0;
    var lastY = 0;

    canvas.addEventListener("pointerdown", function (event) {
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (instance.host) instance.host.classList.add("dragging");
    });

    canvas.addEventListener("pointermove", function (event) {
      if (!dragging || event.pointerId !== pointerId) return;
      var dx = event.clientX - lastX;
      var dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      instance.orbit.theta -= dx * 0.006;
      instance.orbit.phi = clamp(instance.orbit.phi - dy * 0.005, 0.32, 1.25);
    });

    function endDrag(event) {
      if (event && event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      if (instance.host) instance.host.classList.remove("dragging");
    }

    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);
    canvas.addEventListener("wheel", function (event) {
      event.preventDefault();
      instance.orbit.radius = clamp(instance.orbit.radius * (1 + event.deltaY * 0.0012), CAMERA.minRadius, CAMERA.maxRadius);
    }, { passive: false });
  }

  function createEngine(statuses) {
    if (!window.ResizeObserver) {
      throw new Error("当前浏览器不支持 ResizeObserver，无法安全渲染 3D 巡检地图");
    }
    var THREE = requireThree();
    var Model = requireModel();
    var canvas = document.createElement("canvas");
    canvas.className = "pump3d-canvas";
    canvas.setAttribute("aria-hidden", "true");
    var renderer = createRenderer(THREE, canvas);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    var materials = Model.createMaterials(THREE);
    var model = Model.build(THREE, materials);
    scene.add(model.group);
    createLights(THREE, scene);

    var instance = {
      THREE: THREE,
      canvas: canvas,
      renderer: renderer,
      scene: scene,
      camera: camera,
      model: model,
      host: null,
      labels: {},
      hotspots: {},
      activeId: null,
      scratch: new THREE.Vector3(),
      orbit: {
        radius: CAMERA.radius,
        theta: CAMERA.theta,
        phi: CAMERA.phi,
        target: new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z)
      },
      frameId: null,
      resizeObserver: new ResizeObserver(function () { resize(instance); })
    };

    createHotspots(instance, statuses || {});
    createAgent(THREE, instance);
    attachControls(instance);
    updateCamera(instance);
    return instance;
  }

  function mount(host, options) {
    if (!host) throw new Error("Pump3D.mount 需要有效的宿主元素");
    if (!options || !options.statuses) throw new Error("Pump3D.mount 缺少 statuses");
    window.Pump3DContract.assertDom(host, options);
    if (!engine) engine = createEngine(options.statuses);
    if (engine.canvas.parentNode) engine.canvas.parentNode.removeChild(engine.canvas);
    host.insertBefore(engine.canvas, host.firstChild);
    engine.host = host;
    buildLabelMap(engine, host);
    setStatuses(engine, options.statuses);
    setActive(engine, options.activeId || null);
    engine.resizeObserver.disconnect();
    engine.resizeObserver.observe(host);
    resize(engine);
    startLoop(engine);
  }

  function update(options) {
    if (!engine || !engine.host) throw new Error("Pump3D.update 需要先完成 mount");
    if (!options || !options.statuses) throw new Error("Pump3D.update 缺少 statuses");
    window.Pump3DContract.assertDom(engine.host, options);
    setStatuses(engine, options.statuses);
    setActive(engine, options.activeId || null);
  }

  function detach() {
    if (!engine) return;
    engine.resizeObserver.disconnect();
    if (engine.canvas.parentNode) engine.canvas.parentNode.removeChild(engine.canvas);
    engine.host = null;
    engine.labels = {};
    stopLoop(engine);
  }

  function debugInfo() {
    if (!engine) throw new Error("Pump3D 尚未初始化");
    return {
      width: engine.host ? engine.host.clientWidth : 0,
      height: engine.host ? engine.host.clientHeight : 0,
      activeId: engine.activeId,
      renderCalls: engine.renderer.info.render.calls,
      triangles: engine.renderer.info.render.triangles
    };
  }

  window.Pump3D = {
    mount: mount,
    update: update,
    detach: detach,
    debugInfo: debugInfo
  };
}());
