// 展台几何纯函数（L3，见 ../../DESIGN.md 第 7 章加载顺序）—— 零 THREE、零 DOM、
// 零 Math.random。node 可直接 require（配合 verify/verify_stage_geometry.js 的假
// window，用法同 ../../../diagnosis-flow/verify/verify_domain.js）。
//
// 本文件只算三件事，全部是"给几个数、吐一批锚点/角度区间"的确定性函数：
//   solveEllipseAnchors(n, ellipse)  —— 后排椭圆锚点（近大远小由距离自然产生，本文件
//                                       不处理缩放，缩放交给 projection-math.js）
//   solveFrontRow(n, frontRow)       —— 前排等距锚点
//   allocateArcs(weights, totalSweepDeg, gapDeg) —— 外缘 N 段领域光弧的角度分配，
//                                       弧长与权重严格成正比
//
// 参数形状对齐 DESIGN.md 2.2 节 StageComposition 的 ellipse / frontRow / arcs 字段。
// 引擎（engine.js）只负责把这里算出的锚点/角度区间摆上 three.js 物体，不再自己算
// 任何几何——这是 DESIGN.md 4 章"引擎不再算几何"那句话的落地。
//
// 纪律（同输入必须同输出，是纯函数验收项之一）：
//   - 全文件零 Math.random，也不读时间、不读全局可变状态。
//   - 不写 fallback：参数缺字段 / 非法取值一律 throw，不用 `|| 默认值` 吞错。
(function () {
  "use strict";

  var TAG = "[StageLayoutSolver]";

  // ---- 校验小工具 ----

  function assertFiniteNumber(value, label) {
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(TAG + " " + label + " 必须是有限数，实际为 " + value);
    }
  }

  function assertPositiveInteger(value, label) {
    if (typeof value !== "number" || !isFinite(value) || !Number.isInteger(value) || value <= 0) {
      throw new Error(TAG + " " + label + " 必须是正整数，实际为 " + value);
    }
  }

  function assertPlainObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error(TAG + " " + label + " 必须是对象，实际为 " + typeof value);
    }
  }

  // ---- solveEllipseAnchors ----

  // ellipse 形状对齐 StageComposition.ellipse：{ a, b, centerY, centerZ, thetaSpanDeg, liftY }。
  // 六个字段全部必填，缺一个就 throw——这些字段每一个都参与坐标换算，不属于"没有对错的
  // 装饰性旋钮"，不允许用 `ellipse.x || 默认值` 悄悄补一个。
  function assertEllipseShape(ellipse) {
    assertPlainObject(ellipse, "ellipse");
    ["a", "b", "centerY", "centerZ", "thetaSpanDeg", "liftY"].forEach(function (key) {
      assertFiniteNumber(ellipse[key], "ellipse." + key);
    });
    if (ellipse.a <= 0) {
      throw new Error(TAG + " ellipse.a 必须 > 0，实际为 " + ellipse.a);
    }
    if (ellipse.b <= 0) {
      throw new Error(TAG + " ellipse.b 必须 > 0，实际为 " + ellipse.b);
    }
    if (ellipse.thetaSpanDeg <= 0 || ellipse.thetaSpanDeg > 360) {
      throw new Error(
        TAG + " ellipse.thetaSpanDeg 必须落在 (0, 360] 内，实际为 " + ellipse.thetaSpanDeg
      );
    }
  }

  // n 张卡沿椭圆分布在展台后方。thetaSpanDeg 是角度总跨度，以 0 为中轴对称展开
  // （n===1 时退化为 theta=0，卡片摆在正后方中轴上）。
  //
  // "近大远小由距离自然产生"：本函数只给出三维锚点，不在这里计算任何缩放——缩放是
  // projection-math.js 的 depthToScale() 按相机距离反比算出来的，两件事不要混在一起，
  // 否则以后想换镜头/换机位时要同时改两个文件。
  //
  // 返回的 anchor 是 [x, y, z] 三元组：
  //   x = a * sin(theta)                 —— 左右展开
  //   y = centerY + liftY                —— 固定抬升，与 theta 无关
  //   z = centerZ + b * cos(theta)        —— 前后进深；因为 |theta| 的定义域被
  //       thetaSpanDeg 限制在 (0,360] 的一半 ≤ 180°，cos(theta) 在这个范围内相对
  //       |theta| 严格单调，z 因此对 |theta| 单调——这条单调性是 verify 脚本的断言点。
  function solveEllipseAnchors(n, ellipse) {
    assertPositiveInteger(n, "n");
    assertEllipseShape(ellipse);

    var halfSpanDeg = ellipse.thetaSpanDeg / 2;
    var anchors = [];
    var i;
    var thetaDeg;
    var theta;

    for (i = 0; i < n; i += 1) {
      thetaDeg = n === 1 ? 0 : -halfSpanDeg + (2 * halfSpanDeg) * (i / (n - 1));
      theta = (thetaDeg * Math.PI) / 180;
      anchors.push({
        theta: theta,
        anchor: [
          ellipse.a * Math.sin(theta),
          ellipse.centerY + ellipse.liftY,
          ellipse.centerZ + ellipse.b * Math.cos(theta)
        ]
      });
    }
    return anchors;
  }

  // ---- solveFrontRow ----

  // frontRow 形状对齐 StageComposition.frontRow：{ z, y, gapX }。
  function assertFrontRowShape(frontRow) {
    assertPlainObject(frontRow, "frontRow");
    ["z", "y", "gapX"].forEach(function (key) {
      assertFiniteNumber(frontRow[key], "frontRow." + key);
    });
    if (frontRow.gapX <= 0) {
      throw new Error(TAG + " frontRow.gapX 必须 > 0，实际为 " + frontRow.gapX);
    }
  }

  // n 张卡在前排等距摆开，整体关于 x=0 居中对称，y/z 恒定。
  function solveFrontRow(n, frontRow) {
    assertPositiveInteger(n, "n");
    assertFrontRowShape(frontRow);

    var mid = (n - 1) / 2;
    var anchors = [];
    var i;
    for (i = 0; i < n; i += 1) {
      anchors.push({
        anchor: [(i - mid) * frontRow.gapX, frontRow.y, frontRow.z]
      });
    }
    return anchors;
  }

  // ---- allocateArcs ----

  // n 段弧 + n 个等宽间隙首尾相接铺满 totalSweepDeg（外缘光弧绕桌沿一整圈，每段弧后面
  // 都跟一个间隙，包括最后一段弧之后也留一个间隙用于与下一圈/起始点错开）。
  // 因此 Σsweep + n*gapDeg === totalSweepDeg，这也是 "gapDeg × n > totalSweepDeg 必须
  // 拒绝" 这条反例的由来——n 个间隙已经放不下时，压根没有余量分给弧段。
  //
  // 弧长与权重严格成正比：sweepDeg_i = (weight_i / Σweight) * (totalSweepDeg - n*gapDeg)。
  function allocateArcs(weights, totalSweepDeg, gapDeg) {
    if (!Array.isArray(weights) || weights.length === 0) {
      throw new Error(TAG + " weights 必须是非空数组，实际为 " + JSON.stringify(weights));
    }
    weights.forEach(function (w, i) {
      assertFiniteNumber(w, "weights[" + i + "]");
      if (w < 0) {
        throw new Error(TAG + " weights[" + i + "] 不能为负数，实际为 " + w);
      }
    });
    var sum = weights.reduce(function (a, b) { return a + b; }, 0);
    if (sum <= 0) {
      throw new Error(TAG + " weights 之和必须 > 0（不能全为 0），实际之和为 " + sum);
    }

    assertFiniteNumber(totalSweepDeg, "totalSweepDeg");
    if (totalSweepDeg <= 0) {
      throw new Error(TAG + " totalSweepDeg 必须 > 0，实际为 " + totalSweepDeg);
    }
    assertFiniteNumber(gapDeg, "gapDeg");
    if (gapDeg < 0) {
      throw new Error(TAG + " gapDeg 不能为负数，实际为 " + gapDeg);
    }

    var n = weights.length;
    var totalGap = gapDeg * n;
    if (totalGap > totalSweepDeg) {
      throw new Error(
        TAG + " gapDeg(" + gapDeg + ") × n(" + n + ") = " + totalGap +
        " 超过 totalSweepDeg(" + totalSweepDeg + ")，弧段没有余量可分配"
      );
    }

    var availableSweep = totalSweepDeg - totalGap;
    var cursor = 0;
    return weights.map(function (w) {
      var sweepDeg = (w / sum) * availableSweep;
      var arc = { startDeg: cursor, sweepDeg: sweepDeg };
      cursor += sweepDeg + gapDeg;
      return arc;
    });
  }

  window.StageLayoutSolver = {
    solveEllipseAnchors: solveEllipseAnchors,
    solveFrontRow: solveFrontRow,
    allocateArcs: allocateArcs
  };
})();
