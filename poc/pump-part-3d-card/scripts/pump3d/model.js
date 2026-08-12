(function () {
  "use strict";

  var COORDS = {
    valve: [-18, -7],
    metering: [-10, -8],
    pump: [-2, -5],
    tank: [10, -7],
    control: [15, 0],
    waste: [8, 5],
    oil: [2, 8],
    comm: [-4, 8],
    power: [-10, 5],
    transformer: [-15, 2],
    warehouse: [-18, 8],
    plc: [-8, 0],
    ups: [-2, 2]
  };

  function makeMat(THREE, color, roughness, metalness, opacity) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: roughness == null ? 0.7 : roughness,
      metalness: metalness == null ? 0.15 : metalness,
      transparent: opacity != null && opacity < 1,
      opacity: opacity == null ? 1 : opacity
    });
  }

  function createMaterials(THREE) {
    return {
      ground: makeMat(THREE, 0x24352e, 0.9, 0.02),
      grass: makeMat(THREE, 0x33523b, 0.95, 0.02),
      asphalt: makeMat(THREE, 0x333f45, 0.8, 0.04),
      building: makeMat(THREE, 0x8da0a6, 0.58, 0.18),
      roof: makeMat(THREE, 0x47626b, 0.52, 0.16),
      pumpHouse: makeMat(THREE, 0x2f756f, 0.45, 0.22),
      pipe: makeMat(THREE, 0x9eaeb3, 0.35, 0.55),
      tank: makeMat(THREE, 0xb7c3bd, 0.48, 0.42),
      rail: makeMat(THREE, 0x637278, 0.65, 0.15),
      route: new THREE.LineBasicMaterial({ color: 0x31d690, linewidth: 2 }),
      routeGlow: new THREE.LineBasicMaterial({ color: 0x7fffd1, linewidth: 4, transparent: true, opacity: 0.35 })
    };
  }

  function addBox(THREE, group, mat, x, y, z, w, h, d) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addRoad(THREE, group, mat, x, z, w, d) {
    var road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
    road.position.set(x, 0.05, z);
    road.receiveShadow = true;
    group.add(road);
    return road;
  }

  function addTank(THREE, group, mat, x, z, radius, height) {
    var tank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 48), mat);
    tank.position.set(x, height / 2, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    var lid = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.16, 48), mat.clone());
    lid.position.set(x, height + 0.1, z);
    lid.castShadow = true;
    group.add(lid);
  }

  function addPipe(THREE, group, mat, x, z, length, rotate) {
    var pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, length, 20), mat);
    pipe.rotation.z = Math.PI / 2;
    if (rotate) pipe.rotation.y = Math.PI / 2;
    pipe.position.set(x, 0.75, z);
    pipe.castShadow = true;
    pipe.receiveShadow = true;
    group.add(pipe);
  }

  function build(THREE, materials) {
    var group = new THREE.Group();
    var pointMeshes = {};
    var anchors = {};
    var areas = window.DemoData.areas();

    var ground = new THREE.Mesh(new THREE.BoxGeometry(44, 0.12, 24), materials.ground);
    ground.position.set(0, -0.06, 0);
    ground.receiveShadow = true;
    group.add(ground);

    var greenBelt = new THREE.Mesh(new THREE.BoxGeometry(44, 0.04, 5.5), materials.grass);
    greenBelt.position.set(0, 0.02, 10.3);
    group.add(greenBelt);

    addRoad(THREE, group, materials.asphalt, 0, -10, 40, 1.5);
    addRoad(THREE, group, materials.asphalt, -19, 0, 1.4, 18);
    addRoad(THREE, group, materials.asphalt, 12, -3, 1.2, 14);
    addRoad(THREE, group, materials.asphalt, -6, 3.5, 25, 1.1);

    addBox(THREE, group, materials.building, -18, 0, -7, 4.5, 1.2, 3.6);
    addBox(THREE, group, materials.roof, -18, 1.2, -7, 4.9, 0.28, 4.0);
    addBox(THREE, group, materials.building, -10, 0, -8, 5.0, 1.4, 3.4);
    addBox(THREE, group, materials.roof, -10, 1.4, -8, 5.4, 0.28, 3.8);
    addBox(THREE, group, materials.pumpHouse, -2, 0, -5, 6.0, 1.8, 4.3);
    addBox(THREE, group, materials.roof, -2, 1.8, -5, 6.4, 0.3, 4.7);
    addBox(THREE, group, materials.building, 15, 0, 0, 5.2, 1.7, 4.4);
    addBox(THREE, group, materials.roof, 15, 1.7, 0, 5.6, 0.28, 4.8);
    addBox(THREE, group, materials.building, -10, 0, 5, 4.5, 1.8, 3.6);
    addBox(THREE, group, materials.building, -8, 0, 0, 4.0, 1.5, 3.2);
    addBox(THREE, group, materials.building, -2, 0, 2, 3.8, 1.5, 3.2);
    addBox(THREE, group, materials.building, -18, 0, 8, 4.8, 1.4, 3.4);
    addBox(THREE, group, materials.building, 8, 0, 5, 4.8, 1.4, 3.4);
    addBox(THREE, group, materials.building, 2, 0, 8, 4.5, 1.4, 3.4);
    addBox(THREE, group, materials.building, -4, 0, 8, 4.5, 1.4, 3.4);
    addBox(THREE, group, materials.building, -15, 0, 2, 4.5, 1.7, 3.4);

    addTank(THREE, group, materials.tank, 8.4, -7.2, 1.8, 2.5);
    addTank(THREE, group, materials.tank, 12.2, -7.2, 1.8, 2.5);
    addPipe(THREE, group, materials.pipe, -6, -5, 11, false);
    addPipe(THREE, group, materials.pipe, 5.5, -6.6, 9, false);
    addPipe(THREE, group, materials.pipe, 10.5, -3, 8, true);

    var routePoints = window.DemoData.route().map(function (id) {
      var pos = COORDS[id];
      if (!pos) throw new Error("缺少巡检点坐标：" + id);
      return new THREE.Vector3(pos[0], 0.18, pos[1]);
    });
    var routeGeometry = new THREE.BufferGeometry().setFromPoints(routePoints);
    group.add(new THREE.Line(routeGeometry, materials.routeGlow));
    group.add(new THREE.Line(routeGeometry, materials.route));

    areas.forEach(function (area) {
      var pos = COORDS[area.id];
      var markerGroup = new THREE.Group();
      markerGroup.position.set(pos[0], 0.2, pos[1]);
      var pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.18, 24), materials.rail.clone());
      pedestal.position.y = 0.09;
      pedestal.castShadow = true;
      markerGroup.add(pedestal);
      group.add(markerGroup);
      pointMeshes[area.id] = [pedestal];
      anchors[area.id] = new THREE.Vector3(pos[0], 2.2, pos[1]);
    });

    window.Pump3DContract.assertIdSet("anchors", anchors);
    window.Pump3DContract.assertIdSet("pointMeshes", pointMeshes);

    return {
      group: group,
      pointMeshes: pointMeshes,
      partMeshes: pointMeshes,
      anchors: anchors,
      routePoints: routePoints
    };
  }

  window.Pump3DModel = {
    createMaterials: createMaterials,
    build: build
  };
}());
