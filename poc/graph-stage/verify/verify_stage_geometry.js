// 展台几何验证脚本（G1-T3）。纯 Node，无浏览器：layout-solver.js / projection-math.js
// 都是往 window 上挂东西的经典脚本，这里手工搭一个假 window 后直接 require，用法同
// ../../diagnosis-flow/verify/verify_domain.js。
//
// 用法：
//   node poc/graph-stage/verify/verify_stage_geometry.js
//
// ---- 这个脚本的一半篇幅是"构造反例" ----
// 只断言"合法数据能通过"是不够的：一个什么都不检查的空校验器同样能让那种断言全绿。
// 所以每一条规则都配一个把参数改坏的反例，断言校验函数**真的抛错**。这条纪律来自
// ../../diagnosis-flow/verify/README.md，同一套纪律搬到这里：expectReject() 里
// mutate 自身抛错记 FAIL，不记 PASS——那说明反例构造得不对。
"use strict";

var path = require("path");

var ROOT = path.join(__dirname, "..");

function loadStage3d() {
  var files = [
    path.join(ROOT, "scripts", "stage3d", "layout-solver.js"),
    path.join(ROOT, "scripts", "stage3d", "projection-math.js")
  ];
  global.window = {};
  files.forEach(function (file) {
    delete require.cache[require.resolve(file)];
    require(file);
  });
  return global.window;
}

var passCount = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passCount += 1;
    console.log("PASS " + label);
  } else {
    failures.push(label);
    console.log("FAIL " + label);
  }
}

// 反例：用非法参数调用目标函数，断言它真的抛错。这里"构造反例参数"与"调用被测
// 函数"是同一步（不像 verify_domain.js 那样先 mutate 一份数据再单独调用校验器），
// 但纪律相同：反例必须构造得站得住脚——每一条都对应 layout-solver.js /
// projection-math.js 里明确写着的某一条 throw 分支，不是乱传垃圾指望蒙对。
function expectReject(label, call) {
  var threw = false;
  try {
    call();
  } catch (err) {
    threw = true;
  }
  check("反例 " + label + " → 抛错", threw);
}

function approxEqual(a, b, eps) {
  return Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);
}

// ---------------------------------------------------------------- 加载

var win = loadStage3d();
var Solver = win.StageLayoutSolver;
var Proj = win.StageProjectionMath;

if (!Solver || typeof Solver.solveEllipseAnchors !== "function") {
  throw new Error("StageLayoutSolver 未正确加载，无法继续验证");
}
if (!Proj || typeof Proj.ndcToScreen !== "function") {
  throw new Error("StageProjectionMath 未正确加载，无法继续验证");
}

// ---------------------------------------------------------------- 正向：allocateArcs

console.log("");
console.log("== allocateArcs：弧长与权重严格成正比 ==");

var weights = [12, 30, 8, 20, 5, 25];
var totalSweepDeg = 300;
var gapDeg = 4;
var arcs = Solver.allocateArcs(weights, totalSweepDeg, gapDeg);

check("allocateArcs 返回长度 === weights.length", arcs.length === weights.length);

var sumSweep = arcs.reduce(function (acc, a) { return acc + a.sweepDeg; }, 0);
var sumGap = gapDeg * weights.length;
check(
  "Σsweep + Σgap === totalSweepDeg（±1e-9）",
  approxEqual(sumSweep + sumGap, totalSweepDeg)
);

var ratios = arcs.map(function (a, i) { return a.sweepDeg / weights[i]; });
check(
  "每段 sweep 与权重严格成正比（比值全相等，±1e-9）",
  ratios.every(function (r) { return approxEqual(r, ratios[0], 1e-9); })
);

check(
  "startDeg 严格递增且首项为 0",
  arcs[0].startDeg === 0 &&
  arcs.every(function (a, i) { return i === 0 || a.startDeg > arcs[i - 1].startDeg; })
);

var singleArc = Solver.allocateArcs([1], 100, 10);
check(
  "n=1 时 sweepDeg === totalSweepDeg - gapDeg",
  approxEqual(singleArc[0].sweepDeg, 90)
);

var zeroGapArcs = Solver.allocateArcs([1, 1, 1], 90, 0);
var zeroGapSum = zeroGapArcs.reduce(function (acc, a) { return acc + a.sweepDeg; }, 0);
check("gapDeg=0 时 Σsweep === totalSweepDeg", approxEqual(zeroGapSum, 90));

var withZeroWeight = Solver.allocateArcs([10, 0, 10], 100, 2);
check("weights 中的 0 值对应 sweepDeg === 0", withZeroWeight[1].sweepDeg === 0);

check(
  "allocateArcs 确定性：同输入两次调用结果相同",
  JSON.stringify(Solver.allocateArcs(weights, totalSweepDeg, gapDeg)) === JSON.stringify(arcs)
);

// ---------------------------------------------------------------- 正向：solveEllipseAnchors

console.log("");
console.log("== solveEllipseAnchors：近大远小的几何前提 ==");

var ellipse = { a: 6, b: 3, centerY: 2, centerZ: -6, thetaSpanDeg: 130, liftY: 0.5 };
var ellipseAnchors = Solver.solveEllipseAnchors(10, ellipse);

check("solveEllipseAnchors 返回长度 === n", ellipseAnchors.length === 10);

var singleEllipse = Solver.solveEllipseAnchors(1, ellipse);
check("n=1 时 theta === 0", singleEllipse[0].theta === 0);

var sortedByAbsTheta = ellipseAnchors.slice().sort(function (a, b) {
  return Math.abs(a.theta) - Math.abs(b.theta);
});
var zNonIncreasing = sortedByAbsTheta.every(function (item, i) {
  return i === 0 || item.anchor[2] <= sortedByAbsTheta[i - 1].anchor[2] + 1e-9;
});
check("按 |theta| 升序排列后 z 单调不增（近大远小的几何前提）", zNonIncreasing);

check(
  "每个 anchor 都是长度 3 的有限数数组",
  ellipseAnchors.every(function (item) {
    return Array.isArray(item.anchor) && item.anchor.length === 3 &&
      item.anchor.every(function (v) { return typeof v === "number" && isFinite(v); });
  })
);

check(
  "thetaSpanDeg 两端对称：|首项 theta| === |末项 theta|（±1e-9）",
  approxEqual(
    Math.abs(ellipseAnchors[0].theta),
    Math.abs(ellipseAnchors[ellipseAnchors.length - 1].theta)
  )
);

check(
  "solveEllipseAnchors 确定性：同输入两次调用结果相同",
  JSON.stringify(Solver.solveEllipseAnchors(10, ellipse)) === JSON.stringify(ellipseAnchors)
);

// ---------------------------------------------------------------- 正向：solveFrontRow

console.log("");
console.log("== solveFrontRow：前排等距 ==");

var frontRow = { z: 8, y: 0.2, gapX: 3.5 };
var frontAnchors = Solver.solveFrontRow(3, frontRow);

check("solveFrontRow 返回长度 === n", frontAnchors.length === 3);

var gaps = [];
for (var fi = 1; fi < frontAnchors.length; fi += 1) {
  gaps.push(frontAnchors[fi].anchor[0] - frontAnchors[fi - 1].anchor[0]);
}
check(
  "相邻卡片 x 间距恰好 === gapX（±1e-9）",
  gaps.every(function (g) { return approxEqual(g, frontRow.gapX); })
);

var sumX = frontAnchors.reduce(function (acc, item) { return acc + item.anchor[0]; }, 0);
check("前排整体关于 x=0 居中（Σx ≈ 0，±1e-9）", approxEqual(sumX, 0));

check(
  "所有前排卡片 y/z 恒等于 frontRow.y / frontRow.z",
  frontAnchors.every(function (item) {
    return item.anchor[1] === frontRow.y && item.anchor[2] === frontRow.z;
  })
);

var singleFront = Solver.solveFrontRow(1, frontRow);
check("n=1 时 x === 0", singleFront[0].anchor[0] === 0);

check(
  "solveFrontRow 确定性：同输入两次调用结果相同",
  JSON.stringify(Solver.solveFrontRow(3, frontRow)) === JSON.stringify(frontAnchors)
);

// ---------------------------------------------------------------- 正向：projection-math

console.log("");
console.log("== ndcToScreen / depthToScale / depthToDim ==");

var W = 1920;
var H = 1080;

var center = Proj.ndcToScreen({ x: 0, y: 0 }, W, H);
check("ndcToScreen(0,0) 落在屏幕正中心", approxEqual(center.x, W / 2) && approxEqual(center.y, H / 2));

var bottomLeft = Proj.ndcToScreen({ x: -1, y: -1 }, W, H);
check(
  "ndcToScreen(-1,-1) 落在屏幕左下角（Y 轴翻转）",
  approxEqual(bottomLeft.x, 0) && approxEqual(bottomLeft.y, H)
);

var topRight = Proj.ndcToScreen({ x: 1, y: 1 }, W, H);
check(
  "ndcToScreen(1,1) 落在屏幕右上角（Y 轴翻转）",
  approxEqual(topRight.x, W) && approxEqual(topRight.y, 0)
);

var scaleCfg = { k: 10, min: 0.3, max: 1.5 };
check(
  "depthToScale 在未 clamp 区间内随距离增大而单调变小",
  Proj.depthToScale(4, scaleCfg) > Proj.depthToScale(8, scaleCfg) &&
  Proj.depthToScale(8, scaleCfg) > Proj.depthToScale(20, scaleCfg)
);
check(
  "depthToScale 在 clamp 边界外分别返回恰好 cfg.min / cfg.max",
  Proj.depthToScale(1000, scaleCfg) === scaleCfg.min &&
  Proj.depthToScale(0.001, scaleCfg) === scaleCfg.max
);

var dimCfg = { near: 5, far: 20 };
check(
  "depthToDim 边界值：near→1，far→0",
  Proj.depthToDim(dimCfg.near, dimCfg) === 1 && Proj.depthToDim(dimCfg.far, dimCfg) === 0
);
check(
  "depthToDim 越过 [near,far] 区间后 clamp 到恰好 0/1",
  Proj.depthToDim(0, dimCfg) === 1 && Proj.depthToDim(1000, dimCfg) === 0
);

// ---------------------------------------------------------------- 正向：sortByDepth

console.log("");
console.log("== sortByDepth：z-index 排序依据 ==");

var depthList = [
  { id: "a", dist: 12 },
  { id: "b", dist: 3 },
  { id: "c", dist: 20 },
  { id: "d", dist: 8 }
];
var sorted = Proj.sortByDepth(depthList);
check(
  "sortByDepth 按 dist 降序排列",
  sorted.map(function (i) { return i.id; }).join(",") === "c,a,d,b"
);
check(
  "sortByDepth 不修改原数组，且确定性：两次调用结果相同",
  depthList.map(function (i) { return i.id; }).join(",") === "a,b,c,d" &&
  JSON.stringify(Proj.sortByDepth(depthList)) === JSON.stringify(sorted)
);

// ---------------------------------------------------------------- 正向：自实现 4×4 矩阵复算

console.log("");
console.log("== 自实现 lookAt · perspective 矩阵复算（不引 THREE）==");

// 这里刻意不调用 projection-math.js 里的任何函数——独立地重新推导一遍
// lookAt/perspective/透视除法，用来交叉验证"锚点确实落在安全可视区内"，而不是
// 用被测模块的公式去验证被测模块自己。矩阵是列主序（与 three.js 内部约定一致）。

function vec3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function vec3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function vec3Normalize(a) {
  var len = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  if (len === 0) throw new Error("零向量无法归一化");
  return [a[0] / len, a[1] / len, a[2] / len];
}
function vec3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// 右手系 lookAt：相机在 eye，朝 target 看，up 给出世界"上"方向。
function lookAt(eye, target, up) {
  var zAxis = vec3Normalize(vec3Sub(eye, target));
  var xAxis = vec3Normalize(vec3Cross(up, zAxis));
  var yAxis = vec3Cross(zAxis, xAxis);
  return [
    xAxis[0], yAxis[0], zAxis[0], 0,
    xAxis[1], yAxis[1], zAxis[1], 0,
    xAxis[2], yAxis[2], zAxis[2], 0,
    -vec3Dot(xAxis, eye), -vec3Dot(yAxis, eye), -vec3Dot(zAxis, eye), 1
  ];
}

// 标准透视投影矩阵，fovYDeg 为垂直视场角。
function perspective(fovYDeg, aspect, near, far) {
  var fovY = (fovYDeg * Math.PI) / 180;
  var f = 1 / Math.tan(fovY / 2);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ];
}

function mat4Multiply(a, b) {
  var result = new Array(16).fill(0);
  for (var col = 0; col < 4; col += 1) {
    for (var row = 0; row < 4; row += 1) {
      var sum = 0;
      for (var k = 0; k < 4; k += 1) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      result[col * 4 + row] = sum;
    }
  }
  return result;
}

function mat4TransformPoint(m, p) {
  var x = p[0], y = p[1], z = p[2], w = 1;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w
  ];
}

var camera = { fov: 45, position: [0, 6, 14], target: [0, 1, -3] };
var WORLD_UP = [0, 1, 0]; // 约定的世界"上"方向，不属于 StageComposition 冻结字段
var aspect = 16 / 9;
var near = 0.1;
var far = 100;

var viewMatrix = lookAt(camera.position, camera.target, WORLD_UP);
var projMatrix = perspective(camera.fov, aspect, near, far);
var viewProj = mat4Multiply(projMatrix, viewMatrix);

var matrixTestAnchors = Solver.solveEllipseAnchors(10, ellipse);
var safeBoxOk = matrixTestAnchors.every(function (item) {
  var clip = mat4TransformPoint(viewProj, item.anchor);
  if (clip[3] <= 0) return false; // 落到相机背后
  var ndcX = clip[0] / clip[3];
  var ndcY = clip[1] / clip[3];
  return Math.abs(ndcX) <= 0.92 && Math.abs(ndcY) <= 0.92;
});
check("10 个椭圆锚点投影后 NDC 全部落在 [-0.92, 0.92]² 安全框内", safeBoxOk);

// ---------------------------------------------------------------- 反例：allocateArcs

console.log("");
console.log("== 构造反例：allocateArcs ==");

expectReject("weights 全为 0", function () {
  Solver.allocateArcs([0, 0, 0], 100, 2);
});
expectReject("weights 出现负数", function () {
  Solver.allocateArcs([10, -5, 20], 100, 2);
});
expectReject("weights 为空数组（n=0）", function () {
  Solver.allocateArcs([], 100, 2);
});
expectReject("gapDeg × n > totalSweepDeg", function () {
  Solver.allocateArcs([1, 1, 1, 1], 10, 5);
});
expectReject("totalSweepDeg <= 0", function () {
  Solver.allocateArcs([1, 2, 3], 0, 1);
});
expectReject("gapDeg 为负数", function () {
  Solver.allocateArcs([1, 2, 3], 100, -1);
});

// ---------------------------------------------------------------- 反例：solveEllipseAnchors

console.log("");
console.log("== 构造反例：solveEllipseAnchors ==");

expectReject("n=0", function () {
  Solver.solveEllipseAnchors(0, ellipse);
});
expectReject("n 为非整数", function () {
  Solver.solveEllipseAnchors(2.5, ellipse);
});
expectReject("ellipse 缺字段（a）", function () {
  var broken = { b: 3, centerY: 2, centerZ: -6, thetaSpanDeg: 130, liftY: 0 };
  Solver.solveEllipseAnchors(10, broken);
});
expectReject("ellipse.a <= 0", function () {
  Solver.solveEllipseAnchors(10, Object.assign({}, ellipse, { a: 0 }));
});
expectReject("ellipse.thetaSpanDeg <= 0", function () {
  Solver.solveEllipseAnchors(10, Object.assign({}, ellipse, { thetaSpanDeg: 0 }));
});
expectReject("ellipse.thetaSpanDeg > 360", function () {
  Solver.solveEllipseAnchors(10, Object.assign({}, ellipse, { thetaSpanDeg: 400 }));
});

// ---------------------------------------------------------------- 反例：solveFrontRow

console.log("");
console.log("== 构造反例：solveFrontRow ==");

expectReject("n=0", function () {
  Solver.solveFrontRow(0, frontRow);
});
expectReject("frontRow 缺字段（gapX）", function () {
  Solver.solveFrontRow(3, { z: 8, y: 0.2 });
});
expectReject("frontRow.gapX <= 0", function () {
  Solver.solveFrontRow(3, Object.assign({}, frontRow, { gapX: 0 }));
});
expectReject("n 为负数", function () {
  Solver.solveFrontRow(-2, frontRow);
});

// ---------------------------------------------------------------- 反例：projection-math

console.log("");
console.log("== 构造反例：projection-math ==");

expectReject("ndcToScreen 的 w <= 0", function () {
  Proj.ndcToScreen({ x: 0, y: 0 }, 0, H);
});
expectReject("ndcToScreen 的 ndc 缺 x 字段", function () {
  Proj.ndcToScreen({ y: 0 }, W, H);
});
expectReject("depthToScale 的 dist <= 0", function () {
  Proj.depthToScale(0, scaleCfg);
});
expectReject("depthToScale 的 cfg.max <= cfg.min", function () {
  Proj.depthToScale(5, { k: 10, min: 1, max: 1 });
});
expectReject("depthToDim 的 cfg.far <= cfg.near", function () {
  Proj.depthToDim(5, { near: 10, far: 10 });
});
expectReject("sortByDepth 的元素 dist 非数字", function () {
  Proj.sortByDepth([{ id: "x", dist: "far" }]);
});

// ---------------------------------------------------------------- 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
