(function () {
  "use strict";

  // 坐标约定（契约 4，不得变更）：
  // 1 unit = 100 mm；轴系沿 +X，泵在 -X 端、电机在 +X 端；
  // +Y 向上，y = 0 为基础底面，轴中心线 y = 4.6；+Z 指向观察者。
  // 整机 X 跨度约 -12.5 ... +11.5（不含地面/网格等场景装饰件）。

  // 材质参数集中在这里，后续视觉打磨只改这个常量块。
  var MATERIALS = {
    // rev2 修订 3：材质对比度打磨，形成"管—壳—漆"灰阶层次。
    casing: { color: "#9aa7ae", roughness: 0.52, metalness: 0.72 },
    paintedSteel: { color: "#5c6b74", roughness: 0.6, metalness: 0.45 },
    bareSteel: { color: "#b6c2c8", roughness: 0.38, metalness: 0.88 },
    stainless: { color: "#c4d0d6", roughness: 0.25, metalness: 0.95 },
    shaft: { color: "#cdd6da", roughness: 0.18, metalness: 1.0 },
    rubber: { color: "#2a3138", roughness: 0.85, metalness: 0.0 },
    // 喷漆钢网：metalness 必须低。早期取 0.45 时，半透明表面大面积反射青蓝环境贴图和青补光，
    // 环境反射盖过本体色，安全黄读成了青白色。
    guard: { color: "#d9b44b", roughness: 0.52, metalness: 0.12, opacity: 0.8 },
    concrete: { color: "#55636e", roughness: 0.92, metalness: 0.04 },
    motorPaint: { color: "#2e5f6b", roughness: 0.5, metalness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.25 },
    ground: { color: "#0d1620", roughness: 0.9, metalness: 0.0 },
    accentFlangeRing: { color: "#2f6d8a", roughness: 0.5, metalness: 0.3 },
    // 不要在这里加回 transmission：见 buildBearing 里 sightGlassMat 处的实测说明。
    sightGlass: { color: "#e0a83c", roughness: 0.12, metalness: 0.0, opacity: 0.78, emissiveIntensity: 0.35 },
    nameplateBg: "#c7d3d8",
    nameplateInk: "#0d1620",
  };

  function createCanvas(width, height) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // 护罩穿孔网：底色不透明（金属实体），圆孔区域透明（陷阱：three r160 的 alphamap_fragment.glsl 实际取 .g 通道，
  // 灰度图 r=g=b 时不影响效果，若改成彩色遮罩需注意只有 g 通道生效）。
  function buildPerforatedTexture(THREE) {
    var size = 256;
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    var spacing = 22;
    var holeRadius = 6;
    var x;
    var y;
    for (y = spacing / 2; y < size; y += spacing) {
      for (x = spacing / 2; x < size; x += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 2);
    return texture;
  }

  // 风罩格栅：底色透明（通风口），同心圆环+放射辐条不透明（金属框）。
  function buildGrilleTexture(THREE) {
    var size = 256;
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#ffffff";
    var cx = size / 2;
    var cy = size / 2;
    var ring;
    ctx.lineWidth = 6;
    for (ring = 26; ring < size / 2; ring += 24) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 5;
    var i;
    for (i = 0; i < 12; i += 1) {
      var angle = (i * 2 * Math.PI) / 12;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * (size / 2 - 4), cy + Math.sin(angle) * (size / 2 - 4));
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }

  // 地面径向渐变 alphaMap：中心 alpha=1，边缘 alpha=0，配合 transparent:true 让地面自然淡出
  // （陷阱：three r160 的 alphamap_fragment.glsl 实际取 .g 通道，用灰度图即可，r=g=b 时不影响效果）。
  function buildGroundFadeTexture(THREE) {
    var size = 256;
    var canvas = createCanvas(size, size);
    var ctx = canvas.getContext("2d");
    var cx = size / 2;
    var cy = size / 2;
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  function buildNameplateTexture(THREE) {
    var canvas = createCanvas(256, 144);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = MATERIALS.nameplateBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = MATERIALS.nameplateInk;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.fillStyle = MATERIALS.nameplateInk;
    ctx.textAlign = "center";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("P-1", canvas.width / 2, 50);
    ctx.font = "20px sans-serif";
    ctx.fillText("250kW", canvas.width / 2, 86);
    ctx.fillText("2980 r/min", canvas.width / 2, 116);
    return new THREE.CanvasTexture(canvas);
  }

  function createMaterials(THREE) {
    var casing = new THREE.MeshStandardMaterial({
      color: MATERIALS.casing.color,
      roughness: MATERIALS.casing.roughness,
      metalness: MATERIALS.casing.metalness,
    });
    var paintedSteel = new THREE.MeshStandardMaterial({
      color: MATERIALS.paintedSteel.color,
      roughness: MATERIALS.paintedSteel.roughness,
      metalness: MATERIALS.paintedSteel.metalness,
    });
    var bareSteel = new THREE.MeshStandardMaterial({
      color: MATERIALS.bareSteel.color,
      roughness: MATERIALS.bareSteel.roughness,
      metalness: MATERIALS.bareSteel.metalness,
    });
    var stainless = new THREE.MeshStandardMaterial({
      color: MATERIALS.stainless.color,
      roughness: MATERIALS.stainless.roughness,
      metalness: MATERIALS.stainless.metalness,
    });
    var shaft = new THREE.MeshStandardMaterial({
      color: MATERIALS.shaft.color,
      roughness: MATERIALS.shaft.roughness,
      metalness: MATERIALS.shaft.metalness,
    });
    var rubber = new THREE.MeshStandardMaterial({
      color: MATERIALS.rubber.color,
      roughness: MATERIALS.rubber.roughness,
      metalness: MATERIALS.rubber.metalness,
    });
    var guard = new THREE.MeshPhysicalMaterial({
      color: MATERIALS.guard.color,
      roughness: MATERIALS.guard.roughness,
      metalness: MATERIALS.guard.metalness,
      transparent: true,
      opacity: MATERIALS.guard.opacity,
      side: THREE.DoubleSide,
      alphaMap: buildPerforatedTexture(THREE),
    });
    var concrete = new THREE.MeshStandardMaterial({
      color: MATERIALS.concrete.color,
      roughness: MATERIALS.concrete.roughness,
      metalness: MATERIALS.concrete.metalness,
    });
    var motorPaint = new THREE.MeshPhysicalMaterial({
      color: MATERIALS.motorPaint.color,
      roughness: MATERIALS.motorPaint.roughness,
      metalness: MATERIALS.motorPaint.metalness,
      clearcoat: MATERIALS.motorPaint.clearcoat,
      clearcoatRoughness: MATERIALS.motorPaint.clearcoatRoughness,
    });
    // rev2 修订 4：径向渐变 alphaMap，让地面向外自然淡出，消除硬边圆盘。
    var ground = new THREE.MeshStandardMaterial({
      color: MATERIALS.ground.color,
      roughness: MATERIALS.ground.roughness,
      metalness: MATERIALS.ground.metalness,
      transparent: true,
      alphaMap: buildGroundFadeTexture(THREE),
    });
    return {
      casing: casing,
      paintedSteel: paintedSteel,
      bareSteel: bareSteel,
      stainless: stainless,
      shaft: shaft,
      rubber: rubber,
      guard: guard,
      concrete: concrete,
      motorPaint: motorPaint,
      ground: ground,
    };
  }

  function addPart(group, list, mesh, castShadow, receiveShadow) {
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    if (list) list.push(mesh);
    return mesh;
  }

  function finalizeInstanced(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ---- 地面 / 阴影承接 / 网格（不归属任何 partMeshes）----
  function buildGround(THREE, materials, group) {
    var ground = new THREE.Mesh(new THREE.CircleGeometry(38, 64), materials.ground.clone());
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    ground.castShadow = false;
    group.add(ground);

    var shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 14),
      new THREE.ShadowMaterial({ opacity: 0.45 })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = 0.01;
    shadowCatcher.receiveShadow = true;
    shadowCatcher.castShadow = false;
    group.add(shadowCatcher);

    var grid = new THREE.GridHelper(64, 32, 0x1c3a49, 0x14262f);
    grid.name = "pump3d-grid";
    grid.position.y = 0;
    group.add(grid);
  }

  // ---- 底座 ----
  function buildBase(THREE, materials, group, partMeshes) {
    var list = partMeshes.base;

    var foundation = new THREE.Mesh(new THREE.BoxGeometry(23.5, 0.6, 9.0), materials.concrete.clone());
    foundation.position.set(0, 0.3, 0);
    addPart(group, list, foundation, true, true);

    var topPlate = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 8), materials.paintedSteel.clone());
    topPlate.position.set(0, 1.05, 0);
    addPart(group, list, topPlate, true, true);

    var beamZ = [3.4, -3.4];
    var i;
    for (i = 0; i < beamZ.length; i += 1) {
      var beam = new THREE.Mesh(new THREE.BoxGeometry(22, 1.0, 0.6), materials.paintedSteel.clone());
      beam.position.set(0, 0.55, beamZ[i]);
      addPart(group, list, beam, true, true);
    }

    var crossX = [-8, 0, 8];
    for (i = 0; i < crossX.length; i += 1) {
      var cross = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 8), materials.paintedSteel.clone());
      cross.position.set(crossX[i], 0.55, 0);
      addPart(group, list, cross, true, true);
    }

    var boltGeom = new THREE.CylinderGeometry(0.22, 0.22, 1.0, 12);
    var boltMesh = new THREE.InstancedMesh(boltGeom, materials.bareSteel.clone(), 6);
    var nutGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 6);
    var nutMesh = new THREE.InstancedMesh(nutGeom, materials.bareSteel.clone(), 6);
    var anchorX = [-9.5, 0, 9.5];
    var anchorZ = [3.4, -3.4];
    var m = new THREE.Matrix4();
    var index = 0;
    var xi;
    var zi;
    for (xi = 0; xi < anchorX.length; xi += 1) {
      for (zi = 0; zi < anchorZ.length; zi += 1) {
        m.identity();
        m.setPosition(anchorX[xi], 1.2, anchorZ[zi]);
        boltMesh.setMatrixAt(index, m);
        m.identity();
        m.setPosition(anchorX[xi], 1.84, anchorZ[zi]);
        nutMesh.setMatrixAt(index, m);
        index += 1;
      }
    }
    finalizeInstanced(boltMesh);
    finalizeInstanced(nutMesh);
    addPart(group, list, boltMesh, true, true);
    addPart(group, list, nutMesh, true, true);
  }

  // ---- 泵体（蜗壳 + 进出口管路）----
  // rev2 修订 1/2：蜗壳一组五项尺寸整体缩小并新增支脚；管径同步缩小、出口管顶收进 y<=9.9。
  function buildCasing(THREE, materials, group, partMeshes) {
    var list = partMeshes["pump-body"];

    // 蜗壳主体：LatheGeometry 旋转轴是本地 Y，rotation.z = PI/2 转到世界 X（陷阱 2）。
    // profile 半径 2.7 -> 1.75(最小) -> 3.0，轴向 0 -> 3.2（rev2 修订 1）。
    var profile = [
      new THREE.Vector2(2.7, 0),
      new THREE.Vector2(2.25, 0.82),
      new THREE.Vector2(1.75, 1.6),
      new THREE.Vector2(2.25, 2.38),
      new THREE.Vector2(3.0, 3.2),
    ];
    var volute = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), materials.casing.clone());
    volute.rotation.z = Math.PI / 2;
    volute.position.set(-7.0, 4.6, 0);
    addPart(group, list, volute, true, true);

    // 蜗壳涡形环：TorusGeometry 环平面是 XY，rotation.y = PI/2 转到世界 X（陷阱 2）。
    // 外缘 (1.95+0.95)*1.12 = 3.25，最低点 y = 4.6-3.25 = 1.35（rev2 修订 1）。
    var scroll = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.95, 24, 64), materials.casing.clone());
    scroll.scale.set(1, 1.12, 1);
    scroll.rotation.y = Math.PI / 2;
    scroll.position.set(-7.0, 4.6, 0);
    addPart(group, list, scroll, true, true);

    var outletThroat = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 2.0, 24), materials.casing.clone());
    outletThroat.position.set(-7.0, 6.9, 0);
    addPart(group, list, outletThroat, true, true);

    var rearCover = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.95, 0.4, 48), materials.casing.clone());
    rearCover.rotation.z = Math.PI / 2;
    rearCover.position.set(-8.5, 4.6, 0);
    addPart(group, list, rearCover, true, true);

    var voluteBoltGeom = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 6);
    var voluteBolts = new THREE.InstancedMesh(voluteBoltGeom, materials.bareSteel.clone(), 12);
    var m = new THREE.Matrix4();
    var j;
    for (j = 0; j < 12; j += 1) {
      var angle = (j * 2 * Math.PI) / 12;
      m.makeRotationZ(Math.PI / 2);
      m.setPosition(-8.35, 4.6 + 2.6 * Math.cos(angle), 2.6 * Math.sin(angle));
      voluteBolts.setMatrixAt(j, m);
    }
    finalizeInstanced(voluteBolts);
    addPart(group, list, voluteBolts, true, true);

    // 蜗壳支脚（rev2 新增）：把蜗壳落到底座顶板（y ~ 1.3）上，避免泵体悬空。
    var mountFoot = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 2.6), materials.casing.clone());
    mountFoot.position.set(-7.0, 1.85, 0);
    addPart(group, list, mountFoot, true, true);

    // 填料函颈：涡形环 +X 侧止于 x=-6.05，机械密封压盖 -X 侧起于 x=-5.175，中间 0.87 单位是空的，
    // 侧视会露出一条透光缝。填料函是泵壳在轴伸出端的铸造延伸段，材质与泵壳一致，归属 pump-body。
    // 覆盖 x ∈ [-6.1, -5.15]：-X 端搭接进涡形环 0.05，+X 端搭接进密封压盖 0.025，两端都留出安全重叠，
    // 不使用恰好贴合的坐标（避免浮点误差和后续微调导致再次露出缝隙）。
    var stuffingBox = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.95, 32), materials.casing.clone());
    stuffingBox.rotation.z = Math.PI / 2;
    stuffingBox.position.set(-5.625, 4.6, 0);
    addPart(group, list, stuffingBox, true, true);

    // 进口管 + 法兰（rev2 修订 2：管径/法兰同步缩小）
    var inletPipe = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.0, 32), materials.bareSteel.clone());
    inletPipe.rotation.z = Math.PI / 2;
    inletPipe.position.set(-11.0, 4.6, 0);
    addPart(group, list, inletPipe, true, true);

    // 近壳法兰原定 x=-9.5，但蜗壳（LatheGeometry）壳体在该处半径约 2.36，大于法兰外径 2.15，
    // 整圈法兰和螺栓会被埋在壳体内腔（内腔又被 x=-8.5 的 rearCover 实心端盖堵死，永不可见）。
    // 蜗壳轴向范围是 x ∈ [-10.20, -7.00]，改到 x=-10.4（壳体外侧）使其成为真正可见的进口法兰接口。
    var flangeXs = [-12.5, -10.4];
    var fi;
    for (fi = 0; fi < flangeXs.length; fi += 1) {
      var flange = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.15, 0.38, 32), materials.bareSteel.clone());
      flange.rotation.z = Math.PI / 2;
      flange.position.set(flangeXs[fi], 4.6, 0);
      addPart(group, list, flange, true, true);
    }

    // 法兰螺栓圈半径随法兰外径同比例缩小（2.4 * 2.15/2.7 ≈ 1.9，rev2 未逐项给出，按同比例推导）。
    var flangeBoltGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.6, 8);
    var flangeBolts = new THREE.InstancedMesh(flangeBoltGeom, materials.bareSteel.clone(), 16);
    var bi = 0;
    for (fi = 0; fi < flangeXs.length; fi += 1) {
      for (j = 0; j < 8; j += 1) {
        angle = (j * 2 * Math.PI) / 8;
        m.makeRotationZ(Math.PI / 2);
        m.setPosition(flangeXs[fi], 4.6 + 1.9 * Math.cos(angle), 1.9 * Math.sin(angle));
        flangeBolts.setMatrixAt(bi, m);
        bi += 1;
      }
    }
    finalizeInstanced(flangeBolts);
    addPart(group, list, flangeBolts, true, true);

    var accentMat = new THREE.MeshStandardMaterial({
      color: MATERIALS.accentFlangeRing.color,
      roughness: MATERIALS.accentFlangeRing.roughness,
      metalness: MATERIALS.accentFlangeRing.metalness,
    });
    // 漆环半径随进口法兰外径同比例收紧（2.75 * 2.15/2.7 ≈ 2.2，rev2 未逐项给出，按同比例推导）。
    var paintRing = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 8, 24), accentMat);
    paintRing.rotation.y = Math.PI / 2;
    paintRing.position.set(-11.0, 4.6, 0);
    addPart(group, list, paintRing, true, true);

    // 出口管 + 弯头（rev2 修订 2：整根管顶不超过 y = 9.9）
    // 陷阱：TorusGeometry(radius,tube,radialSegments,tubularSegments,arc) 的 arc 只能从 u=0 起扫，
    // 没有 thetaStart 参数；u=0..arc 默认让弯头往"轴心正上方继续爬升 radius+tube"，
    // 若直接接在竖直立管顶端会把管顶顶到 riser_top + 1.45+1.25 ≈ 11.9，远超 9.9。
    // 这里改用 rotation.z = -PI/2 把有效弧段搬到 u'=[-PI/2,0]：u'=0 对应立管接口（该整圈端面
    // 世界 Y 恰好等于立管顶，不再爬升），u'=-PI/2 对应转向水平管的另一端面（世界 Y = 立管顶 - radius）。
    var outletRiser = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.8, 32), materials.bareSteel.clone());
    outletRiser.position.set(-7.0, 8.3, 0);
    addPart(group, list, outletRiser, true, true);

    var elbowMainR = 1.45;
    var elbowTubeR = 1.25;
    var riserTopY = 8.3 + 0.9; // = 9.2，立管顶
    var elbow = new THREE.Mesh(
      new THREE.TorusGeometry(elbowMainR, elbowTubeR, 16, 24, Math.PI / 2),
      materials.bareSteel.clone()
    );
    elbow.rotation.z = -Math.PI / 2;
    elbow.position.set(-7.0 - elbowMainR, riserTopY, 0);
    addPart(group, list, elbow, true, true);

    var outletHorizontalY = riserTopY - elbowMainR; // 弯头另一端面世界 Y
    var outletHorizontal = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.8, 32), materials.bareSteel.clone());
    outletHorizontal.rotation.z = Math.PI / 2;
    outletHorizontal.position.set(-7.0 - elbowMainR - 0.9, outletHorizontalY, 0);
    addPart(group, list, outletHorizontal, true, true);

    var outletFlangeRing = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.3, 32), materials.bareSteel.clone());
    outletFlangeRing.rotation.z = Math.PI / 2;
    outletFlangeRing.position.set(-7.0 - elbowMainR - 1.8, outletHorizontalY, 0);
    addPart(group, list, outletFlangeRing, true, true);
  }

  // ---- 机械密封 ----
  function buildSeal(THREE, materials, group, partMeshes) {
    var list = partMeshes.seal;

    var gland = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.55, 32), materials.stainless.clone());
    gland.rotation.z = Math.PI / 2;
    gland.position.set(-4.9, 4.6, 0);
    addPart(group, list, gland, true, true);

    var chamber = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.9, 32), materials.stainless.clone());
    chamber.rotation.z = Math.PI / 2;
    chamber.position.set(-4.35, 4.6, 0);
    addPart(group, list, chamber, true, true);

    var studGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.0, 10);
    var k;
    for (k = 0; k < 4; k += 1) {
      var angle = (k * 2 * Math.PI) / 4;
      var stud = new THREE.Mesh(studGeom, materials.stainless.clone());
      stud.rotation.z = Math.PI / 2;
      stud.position.set(-4.9, 4.6 + 1.25 * Math.cos(angle), 1.25 * Math.sin(angle));
      addPart(group, list, stud, true, true);
    }

    var flushCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.9, 6.15, 0.5),
      new THREE.Vector3(-5.6, 7.2, 0.9),
      new THREE.Vector3(-7.0, 7.6, 0.3),
    ]);
    var flushTube = new THREE.Mesh(new THREE.TubeGeometry(flushCurve, 24, 0.13, 8, false), materials.stainless.clone());
    addPart(group, list, flushTube, true, true);
  }

  // ---- 驱动端轴承座 ----
  function buildBearing(THREE, materials, group, partMeshes) {
    var list = partMeshes["front-bearing"];

    var housing = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 2.4, 32), materials.casing.clone());
    housing.rotation.z = Math.PI / 2;
    housing.position.set(-3.3, 4.6, 0);
    addPart(group, list, housing, true, true);

    var endCap = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.35, 32), materials.casing.clone());
    endCap.rotation.z = Math.PI / 2;
    endCap.position.set(-2.0, 4.6, 0);
    addPart(group, list, endCap, true, true);

    var pedestal = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 3.0), materials.casing.clone());
    pedestal.position.set(-3.3, 2.9, 0);
    addPart(group, list, pedestal, true, true);

    // 油位视镜刻意不用 transmission：three 会为透射材质把整个场景**再渲染一遍**到额外的
    // render target，实测这一颗半径 0.42 的小球让每帧 draw call 从 102 涨到 169、
    // 三角面从 19048 涨到 34350（transmission: 0.6 vs 0 的隔离对比）。
    // 为一个视镜付 40% 的 draw call 不值；用半透明 + 自发光同样能读成"背光的琥珀色油窗"。
    var sightGlassMat = new THREE.MeshPhysicalMaterial({
      color: MATERIALS.sightGlass.color,
      roughness: MATERIALS.sightGlass.roughness,
      metalness: MATERIALS.sightGlass.metalness,
      transparent: true,
      opacity: MATERIALS.sightGlass.opacity,
      emissive: MATERIALS.sightGlass.color,
      emissiveIntensity: MATERIALS.sightGlass.emissiveIntensity,
    });
    var sightGlass = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), sightGlassMat);
    sightGlass.position.set(-3.3, 5.9, 1.4);
    addPart(group, list, sightGlass, true, true);

    var nippleGeom = new THREE.CylinderGeometry(0.1, 0.15, 0.35, 8);
    var nipplePositions = [
      [-3.6, 3.3, 0.9],
      [-3.0, 3.3, -0.9],
    ];
    var ni;
    for (ni = 0; ni < nipplePositions.length; ni += 1) {
      var nipple = new THREE.Mesh(nippleGeom, materials.stainless.clone());
      nipple.position.set(nipplePositions[ni][0], nipplePositions[ni][1], nipplePositions[ni][2]);
      addPart(group, list, nipple, true, true);
    }
  }

  // ---- 联轴器 + 护罩 ----
  function buildCoupling(THREE, materials, group, partMeshes) {
    var list = partMeshes.coupling;

    var shaftMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 6.0, 24), materials.shaft.clone());
    shaftMesh.rotation.z = Math.PI / 2;
    shaftMesh.position.set(-0.2, 4.6, 0);
    addPart(group, list, shaftMesh, true, true);

    var hubXs = [1.3, -1.3];
    var hi;
    for (hi = 0; hi < hubXs.length; hi += 1) {
      var hub = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 1.0, 32), materials.bareSteel.clone());
      hub.rotation.z = Math.PI / 2;
      hub.position.set(hubXs[hi], 4.6, 0);
      addPart(group, list, hub, true, true);
    }

    var spacer = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.6, 32), materials.bareSteel.clone());
    spacer.rotation.z = Math.PI / 2;
    spacer.position.set(0, 4.6, 0);
    addPart(group, list, spacer, true, true);

    var flexXs = [0.75, -0.75];
    var flexi;
    for (flexi = 0; flexi < flexXs.length; flexi += 1) {
      var flex = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.24, 12, 32), materials.rubber.clone());
      flex.rotation.y = Math.PI / 2;
      flex.position.set(flexXs[flexi], 4.6, 0);
      addPart(group, list, flex, true, true);
    }

    var hubBoltGeom = new THREE.CylinderGeometry(0.13, 0.13, 1.2, 8);
    var hubBolts = new THREE.InstancedMesh(hubBoltGeom, materials.bareSteel.clone(), 12);
    var m = new THREE.Matrix4();
    var idx = 0;
    for (hi = 0; hi < hubXs.length; hi += 1) {
      var j;
      for (j = 0; j < 6; j += 1) {
        var angle = (j * 2 * Math.PI) / 6;
        m.makeRotationZ(Math.PI / 2);
        m.setPosition(hubXs[hi], 4.6 + 1.05 * Math.cos(angle), 1.05 * Math.sin(angle));
        hubBolts.setMatrixAt(idx, m);
        idx += 1;
      }
    }
    finalizeInstanced(hubBolts);
    addPart(group, list, hubBolts, true, true);

    // 护罩：半开 CylinderGeometry，openEnded=true，rotation.z = PI/2 转到世界 X。
    var guardThetaStart = -Math.PI * 0.15;
    var guardThetaLength = Math.PI * 1.3;
    var guardCyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.35, 3.6, 32, 1, true, guardThetaStart, guardThetaLength),
      materials.guard.clone()
    );
    guardCyl.rotation.z = Math.PI / 2;
    guardCyl.position.set(0, 4.6, 0);
    // castShadow=false：护罩用 transparent+alphaMap 做穿孔网，但 depth-only 的阴影 pass 不采样
    // transparent/alphaMap，会把穿孔网渲染成实心圆筒的影子。护罩本体很薄，直接关闭投影更接近真实观感。
    addPart(group, list, guardCyl, false, true);

    var ringXs = [1.8, -1.8];
    var ri;
    for (ri = 0; ri < ringXs.length; ri += 1) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.35, 32, 1, guardThetaStart, guardThetaLength),
        materials.guard.clone()
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.set(ringXs[ri], 4.6, 0);
      // 端环与护罩同材质、同样的穿孔阴影问题，一并关闭投影（见 guardCyl 注释）。
      addPart(group, list, ring, false, true);
    }

    var legXs = [1.0, -1.0];
    var li;
    for (li = 0; li < legXs.length; li += 1) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.0, 0.5), materials.paintedSteel.clone());
      leg.position.set(legXs[li], 2.8, 0);
      addPart(group, list, leg, true, true);
    }
  }

  // ---- 电机 ----
  function buildMotor(THREE, materials, group, partMeshes) {
    var list = partMeshes.motor;

    var body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 6.6, 48), materials.motorPaint.clone());
    body.rotation.z = Math.PI / 2;
    body.position.set(6.6, 4.6, 0);
    addPart(group, list, body, true, true);

    // 散热筋 x26：第 i 个先绕 X 轴旋转 i*2*PI/26，再平移到半径 3.28（陷阱：先旋转后平移的矩阵组合顺序）。
    var finGeom = new THREE.BoxGeometry(6.4, 0.55, 0.16);
    var finCount = 26;
    var fins = new THREE.InstancedMesh(finGeom, materials.motorPaint.clone(), finCount);
    var rotM = new THREE.Matrix4();
    var transM = new THREE.Matrix4();
    transM.makeTranslation(0, 3.28, 0);
    var im = new THREE.Matrix4();
    var fi;
    for (fi = 0; fi < finCount; fi += 1) {
      rotM.makeRotationX((fi * 2 * Math.PI) / finCount);
      im.copy(rotM).multiply(transM);
      fins.setMatrixAt(fi, im);
    }
    fins.position.set(6.6, 4.6, 0);
    finalizeInstanced(fins);
    addPart(group, list, fins, true, true);

    var capProfile = [
      new THREE.Vector2(0.9, 0),
      new THREE.Vector2(2.6, 0),
      new THREE.Vector2(2.6, 0.15),
      new THREE.Vector2(3.2, 0.15),
      new THREE.Vector2(3.2, 0.55),
      new THREE.Vector2(2.1, 0.55),
      new THREE.Vector2(1.6, 0.85),
      new THREE.Vector2(1.6, 1.0),
    ];
    var capGeom = new THREE.LatheGeometry(capProfile, 32);
    var capNear = new THREE.Mesh(capGeom, materials.motorPaint.clone());
    capNear.rotation.z = Math.PI / 2;
    capNear.position.set(3.1, 4.6, 0);
    addPart(group, list, capNear, true, true);

    var capFar = new THREE.Mesh(capGeom, materials.motorPaint.clone());
    capFar.rotation.z = -Math.PI / 2;
    capFar.position.set(10.1, 4.6, 0);
    addPart(group, list, capFar, true, true);

    var fanCover = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.4, 1.4, 32), materials.paintedSteel.clone());
    fanCover.rotation.z = Math.PI / 2;
    fanCover.position.set(10.9, 4.6, 0);
    addPart(group, list, fanCover, true, true);

    var grilleMat = new THREE.MeshStandardMaterial({
      color: MATERIALS.paintedSteel.color,
      roughness: MATERIALS.paintedSteel.roughness,
      metalness: MATERIALS.paintedSteel.metalness,
      transparent: true,
      alphaMap: buildGrilleTexture(THREE),
      side: THREE.DoubleSide,
    });
    var grille = new THREE.Mesh(new THREE.CircleGeometry(2.35, 32), grilleMat);
    grille.rotation.y = Math.PI / 2;
    grille.position.set(11.6, 4.6, 0);
    addPart(group, list, grille, true, true);

    var terminalBox = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.9), materials.motorPaint.clone());
    terminalBox.position.set(5.6, 8.2, 0);
    addPart(group, list, terminalBox, true, true);

    var terminalLid = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 2.0), materials.motorPaint.clone());
    terminalLid.position.set(5.6, 9.05, 0);
    addPart(group, list, terminalLid, true, true);

    var cableCurves = [
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(5.2, 7.5, 0.5),
        new THREE.Vector3(5.0, 4.5, 0.9),
        new THREE.Vector3(5.0, 1.35, 0.5),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(6.0, 7.5, -0.5),
        new THREE.Vector3(6.2, 4.5, -0.9),
        new THREE.Vector3(6.2, 1.35, -0.5),
      ]),
    ];
    var ci;
    for (ci = 0; ci < cableCurves.length; ci += 1) {
      var cableTube = new THREE.Mesh(
        new THREE.TubeGeometry(cableCurves[ci], 12, 0.12, 8, false),
        materials.motorPaint.clone()
      );
      addPart(group, list, cableTube, true, true);
    }

    var liftingEye = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.12, 10, 20), materials.bareSteel.clone());
    liftingEye.position.set(6.6, 8.0, 0);
    addPart(group, list, liftingEye, true, true);

    var footXs = [4.2, 9.0];
    var foi;
    for (foi = 0; foi < footXs.length; foi += 1) {
      var foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.9, 0.9), materials.paintedSteel.clone());
      foot.position.set(footXs[foi], 2.25, 0);
      addPart(group, list, foot, true, true);

      var shim = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.15, 1.0), materials.paintedSteel.clone());
      shim.position.set(footXs[foi], 1.225, 0);
      addPart(group, list, shim, true, true);
    }

    var nameplateTex = buildNameplateTexture(THREE);
    var nameplateMat = new THREE.MeshStandardMaterial({
      map: nameplateTex,
      emissiveMap: nameplateTex,
      emissive: 0x8899a0,
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.15,
    });
    var nameplate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), nameplateMat);
    // 散热筋径向厚度占 z ∈ [3.005, 3.555]，铭牌原在 z=3.25 会被相邻两根筋条各切掉 0.17 单位。
    // 移到 z=3.6，越过筋条外沿（3.555），避开全部 26 根散热筋实例。
    nameplate.position.set(6.6, 4.6, 3.6);
    addPart(group, list, nameplate, false, false);
  }

  function build(THREE, materials) {
    var group = new THREE.Group();
    var partMeshes = {};
    window.Pump3DContract.PART_IDS.forEach(function (id) { partMeshes[id] = []; });

    buildGround(THREE, materials, group);
    buildBase(THREE, materials, group, partMeshes);
    buildCasing(THREE, materials, group, partMeshes);
    buildSeal(THREE, materials, group, partMeshes);
    buildBearing(THREE, materials, group, partMeshes);
    buildCoupling(THREE, materials, group, partMeshes);
    buildMotor(THREE, materials, group, partMeshes);

    var anchors = {
      "pump-body": new THREE.Vector3(-7.0, 9.2, 0.6),
      seal: new THREE.Vector3(-4.7, 6.4, 1.6),
      "front-bearing": new THREE.Vector3(-3.3, 6.7, -1.9),
      coupling: new THREE.Vector3(0.0, 7.4, 0.0),
      motor: new THREE.Vector3(6.6, 8.9, 0.0),
      base: new THREE.Vector3(2.0, 1.6, 4.6),
    };

    window.Pump3DContract.assertIdSet("anchors", anchors);
    window.Pump3DContract.assertIdSet("partMeshes", partMeshes);

    return { group: group, partMeshes: partMeshes, anchors: anchors };
  }

  window.Pump3DModel = {
    createMaterials: createMaterials,
    build: build,
  };
})();
