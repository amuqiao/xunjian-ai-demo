// 投影换算纯函数（L3，加载顺序见 ../../DESIGN.md 第 7 章，紧跟 layout-solver.js 之后）
// —— 零 THREE、零 DOM、零 Math.random。node 可直接 require，用法同
// ../../../diagnosis-flow/verify/verify_domain.js 搭假 window 的做法。
//
// 本文件管"锚点算出来之后，怎么变成 DOM 投影层能用的数字"，对应 DESIGN.md 4 章
// engine.js 三件新增行为里的两件（--card-scale / --card-dim 的换算公式）：
//   ndcToScreen(ndc, w, h)  —— NDC [-1,1]² 转宿主内部像素坐标（含 Y 轴翻转）
//   depthToScale(dist, cfg) —— 相机距离反比换算缩放，clamp 到 [cfg.min, cfg.max]
//   depthToDim(dist, cfg)   —— 相机距离归一化到 [0,1]，驱动 opacity/对比度
//   sortByDepth(list)       —— 按 dist 降序排列，供引擎写 z-index 时使用
//
// clamp 会破坏严格透视一致性，这是 DESIGN.md 4 章明确写下的刻意取舍（可读性 >
// 物理准确）——depthToScale 因此必须真的 clamp 到边界值，而不是简单裁剪成
// Infinity/0，这条由 verify_stage_geometry.js 的边界断言守住。
(function () {
  "use strict";

  var TAG = "[StageProjectionMath]";

  function assertFiniteNumber(value, label) {
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error(TAG + " " + label + " 必须是有限数，实际为 " + value);
    }
  }

  function assertPlainObject(value, label) {
    if (!value || typeof value !== "object") {
      throw new Error(TAG + " " + label + " 必须是对象，实际为 " + typeof value);
    }
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  // ---- ndcToScreen ----

  // ndc: { x, y } ∈ 理论上 [-1,1]²（本函数不对越界值报错——落到相机背后/画面外的点
  // 由调用方按 debugInfo().hiddenBehindCamera 那套口径去处理，这里只是纯粹的坐标换算）。
  // w/h 是 3D 宿主内部像素（DESIGN.md 第 6 章"三套坐标系"里的第三套，不是视口坐标，
  // 不需要再除一次 --screen-scale）。
  function ndcToScreen(ndc, w, h) {
    assertPlainObject(ndc, "ndc");
    assertFiniteNumber(ndc.x, "ndc.x");
    assertFiniteNumber(ndc.y, "ndc.y");
    assertFiniteNumber(w, "w");
    assertFiniteNumber(h, "h");
    if (w <= 0) {
      throw new Error(TAG + " w 必须 > 0，实际为 " + w);
    }
    if (h <= 0) {
      throw new Error(TAG + " h 必须 > 0，实际为 " + h);
    }
    return {
      x: (ndc.x * 0.5 + 0.5) * w,
      // Y 轴翻转：NDC 的 +Y 朝上，屏幕像素坐标的 +Y 朝下。
      y: (1 - (ndc.y * 0.5 + 0.5)) * h
    };
  }

  // ---- depthToScale ----

  // cfg: { k, min, max }。scale = k / dist（反比），clamp 到 [min, max]。
  // k 是"这套镜头下，单位距离应该对应多大缩放"的标定常数，属于纯装饰性旋钮的范畴
  // （数值大小不影响换算是否成立，只影响观感），min/max 则直接决定 clamp 结果、
  // 关系到坐标换算是否成立，因此二者都必须强校验、不能有缺省。
  function assertScaleCfgShape(cfg) {
    assertPlainObject(cfg, "cfg");
    ["k", "min", "max"].forEach(function (key) {
      assertFiniteNumber(cfg[key], "cfg." + key);
    });
    if (cfg.k <= 0) {
      throw new Error(TAG + " cfg.k 必须 > 0，实际为 " + cfg.k);
    }
    if (cfg.min <= 0) {
      throw new Error(TAG + " cfg.min 必须 > 0，实际为 " + cfg.min);
    }
    if (cfg.max <= cfg.min) {
      throw new Error(TAG + " cfg.max 必须 > cfg.min，实际 max=" + cfg.max + " min=" + cfg.min);
    }
  }

  function depthToScale(dist, cfg) {
    assertFiniteNumber(dist, "dist");
    if (dist <= 0) {
      throw new Error(TAG + " dist 必须 > 0，实际为 " + dist);
    }
    assertScaleCfgShape(cfg);
    return clamp(cfg.k / dist, cfg.min, cfg.max);
  }

  // ---- depthToDim ----

  // cfg: { near, far }，near < far。dist===near → dim=1（最清晰），dist===far → dim=0
  // （最暗淡），区间外 clamp 到 [0,1]。禁止用 filter: blur() 做远虚，这条由
  // ../../styles/ 静态扫描（verify_tokens.js）执法，不归本文件管，但本函数的存在
  // 就是那条约束的数值来源。
  function assertDimCfgShape(cfg) {
    assertPlainObject(cfg, "cfg");
    ["near", "far"].forEach(function (key) {
      assertFiniteNumber(cfg[key], "cfg." + key);
    });
    if (cfg.near < 0) {
      throw new Error(TAG + " cfg.near 不能为负数，实际为 " + cfg.near);
    }
    if (cfg.far <= cfg.near) {
      throw new Error(TAG + " cfg.far 必须 > cfg.near，实际 far=" + cfg.far + " near=" + cfg.near);
    }
  }

  function depthToDim(dist, cfg) {
    assertFiniteNumber(dist, "dist");
    if (dist < 0) {
      throw new Error(TAG + " dist 不能为负数，实际为 " + dist);
    }
    assertDimCfgShape(cfg);
    var raw = (cfg.far - dist) / (cfg.far - cfg.near);
    return clamp(raw, 0, 1);
  }

  // ---- sortByDepth ----

  // list: [{ dist, ... }]。返回按 dist 降序排列的新数组（不修改入参），远的排前面、
  // 近的排后面——引擎据此从远到近依次写递增的 z-index，近处的卡片自然盖在远处之上。
  function sortByDepth(list) {
    if (!Array.isArray(list)) {
      throw new Error(TAG + " list 必须是数组，实际为 " + typeof list);
    }
    list.forEach(function (item, i) {
      assertPlainObject(item, "list[" + i + "]");
      assertFiniteNumber(item.dist, "list[" + i + "].dist");
    });
    return list.slice().sort(function (a, b) { return b.dist - a.dist; });
  }

  window.StageProjectionMath = {
    ndcToScreen: ndcToScreen,
    depthToScale: depthToScale,
    depthToDim: depthToDim,
    sortByDepth: sortByDepth
  };
})();
