// graph-stage / docs/tree-layout.js 验证脚本。纯 Node，无浏览器：
// tree-layout.js 是往 window 上挂东西的经典脚本，这里手工搭一个假
// window 之后 require 即可（与 ../../diagnosis-flow/verify/verify_domain.js
// 同一套手法）。
//
// 用法：
//   node poc/graph-stage/verify/verify_tree_layout.js
//
// ---- 这个脚本接近一半篇幅是"构造反例" ----
// 只断言"合法数据能通过"是不够的：一个什么都不检查的空校验器同样能让那种
// 断言全绿。所以每一类非法输入都配一个反例，断言 solve() 真的抛错。这条
// 纪律来自 diagnosis-flow verify/README.md 记录的教训：写完一条断言要能
// 回答——如果这个功能坏了，它会红吗？答不上来等于没写。
"use strict";

var path = require("path");

var MODULE_PATH = path.join(__dirname, "..", "scripts", "docs", "tree-layout.js");

function loadModule() {
  global.window = {};
  delete require.cache[require.resolve(MODULE_PATH)];
  require(MODULE_PATH);
  return global.window.TreeLayout;
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

// 反例：把合法输入改坏，断言 TreeLayout.solve() 真的抛错。
// mutate 自己抛错不算通过——那说明反例构造得不对（比如改了一个不存在的字段）。
function expectReject(label, buildData, mutate) {
  var data = buildData();
  try {
    mutate(data);
  } catch (err) {
    check("反例 " + label + "（构造失败：" + err.message + "）", false);
    return;
  }
  var threw = false;
  try {
    TreeLayout.solve(data.nodes, data.config);
  } catch (err) {
    threw = true;
  }
  check("反例 " + label + " → solve() 抛错", threw);
}

// ---------------------------------------------------------------- 测试夹具

var DEFAULT_CONFIG = { nodeW: 120, nodeH: 48, gapX: 24, gapY: 64 };

function makeConfig() {
  return { nodeW: 120, nodeH: 48, gapX: 24, gapY: 64 };
}

// 40 节点、1-3-9-27 的四层严格树：1 任务 → 3 方向 → 9 技术 → 27 内容。
function makeBigTreeNodes() {
  var nodes = [{ id: "T01", parentId: null, depth: 0 }];
  for (var f = 1; f <= 3; f += 1) {
    var fid = "F0" + f;
    nodes.push({ id: fid, parentId: "T01", depth: 1 });
    for (var k = 1; k <= 3; k += 1) {
      var kid = fid + "-K0" + k;
      nodes.push({ id: kid, parentId: fid, depth: 2 });
      for (var c = 1; c <= 3; c += 1) {
        var cid = kid + "-C0" + c;
        nodes.push({ id: cid, parentId: kid, depth: 3 });
      }
    }
  }
  return nodes;
}

function makeSingleNodeTree() {
  return [{ id: "solo", parentId: null, depth: 0 }];
}

// 单链树：1 → 1 → 1 → 1，四层每层恰好一个节点。
function makeChainNodes() {
  return [
    { id: "n0", parentId: null, depth: 0 },
    { id: "n1", parentId: "n0", depth: 1 },
    { id: "n2", parentId: "n1", depth: 2 },
    { id: "n3", parentId: "n2", depth: 3 }
  ];
}

// 反例用的小树：根 + 两个方向 + 一个技术节点，够构造重复 id / 悬空 / 环等场景。
function baseSmallData() {
  return {
    nodes: [
      { id: "root", parentId: null, depth: 0 },
      { id: "a", parentId: "root", depth: 1 },
      { id: "b", parentId: "root", depth: 1 },
      { id: "a1", parentId: "a", depth: 2 }
    ],
    config: makeConfig()
  };
}

function layerXs(result, nodes, depth) {
  return nodes
    .filter(function (n) { return n.depth === depth; })
    .map(function (n) { return result[n.id].x; })
    .sort(function (x, y) { return x - y; });
}

function noOverlap(xs, gapX) {
  for (var i = 1; i < xs.length; i += 1) {
    if (xs[i] - xs[i - 1] < gapX - 1e-9) {
      return false;
    }
  }
  return true;
}

function midpointOk(parentId, childIds, result) {
  var xs = childIds.map(function (id) { return result[id].x; });
  var mid = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
  return Math.abs(result[parentId].x - mid) <= 0.5;
}

// ---------------------------------------------------------------- 正向

var TreeLayout = loadModule();

console.log("== graph-stage docs/tree-layout 布局求解器 ==");

check("TreeLayout 已挂载 window 且 solve 是函数", !!TreeLayout && typeof TreeLayout.solve === "function");

var bigNodes = makeBigTreeNodes();
var bigThrew = false;
var bigResult = null;
try {
  bigResult = TreeLayout.solve(bigNodes, DEFAULT_CONFIG);
} catch (err) {
  bigThrew = true;
}
check("40 节点树（1-3-9-27）solve() 不抛错", !bigThrew && !!bigResult);
check("40 节点树输出 key 数量恰好为 40", Object.keys(bigResult).length === 40);

var allFinite = Object.keys(bigResult).every(function (id) {
  var p = bigResult[id];
  return isFinite(p.x) && isFinite(p.y);
});
check("40 节点树所有坐标 x/y 均为有限数字", allFinite);

var depthMatches = bigNodes.every(function (n) { return bigResult[n.id].depth === n.depth; });
check("40 节点树输出 depth 与输入 depth 逐一一致，且根节点 depth === 0",
  depthMatches && bigResult.T01.depth === 0);

check("depth=1（3 个方向节点）相邻 x 间距 ≥ gapX",
  noOverlap(layerXs(bigResult, bigNodes, 1), DEFAULT_CONFIG.gapX));
check("depth=2（9 个技术节点）相邻 x 间距 ≥ gapX",
  noOverlap(layerXs(bigResult, bigNodes, 2), DEFAULT_CONFIG.gapX));
check("depth=3（27 个内容节点）相邻 x 间距 ≥ gapX",
  noOverlap(layerXs(bigResult, bigNodes, 3), DEFAULT_CONFIG.gapX));

check("根节点 x = 3 个 depth1 子节点区间中点（±0.5）",
  midpointOk("T01", ["F01", "F02", "F03"], bigResult));
check("depth1 节点 F02 的 x = 其 3 个 depth2 子节点区间中点（±0.5）",
  midpointOk("F02", ["F02-K01", "F02-K02", "F02-K03"], bigResult));
check("depth2 节点 F02-K02 的 x = 其 3 个 depth3 子节点区间中点（±0.5）",
  midpointOk("F02-K02", ["F02-K02-C01", "F02-K02-C02", "F02-K02-C03"], bigResult));

var y0 = bigResult.T01.y;
var y1 = bigResult.F01.y;
var y2 = bigResult["F01-K01"].y;
var y3 = bigResult["F01-K01-C01"].y;
check("y 坐标严格随 depth 递增（depth0 < depth1 < depth2 < depth3）", y0 < y1 && y1 < y2 && y2 < y3);

var bigResultAgain = TreeLayout.solve(makeBigTreeNodes(), makeConfig());
check("40 节点树：同一输入调用两次输出深度相等（确定性）",
  JSON.stringify(bigResult) === JSON.stringify(bigResultAgain));

var soloNodes = makeSingleNodeTree();
var soloThrew = false;
var soloResult = null;
try {
  soloResult = TreeLayout.solve(soloNodes, DEFAULT_CONFIG);
} catch (err) {
  soloThrew = true;
}
check("单节点树 solve() 不抛错且输出 key 数量为 1",
  !soloThrew && Object.keys(soloResult || {}).length === 1);

var soloResultAgain = TreeLayout.solve(makeSingleNodeTree(), makeConfig());
check("单节点树：同一输入调用两次输出深度相等（确定性）",
  JSON.stringify(soloResult) === JSON.stringify(soloResultAgain));

var chainNodes = makeChainNodes();
var chainThrew = false;
var chainResult = null;
try {
  chainResult = TreeLayout.solve(chainNodes, DEFAULT_CONFIG);
} catch (err) {
  chainThrew = true;
}
check("单链树（1→1→1→1）solve() 不抛错且输出 key 数量为 4",
  !chainThrew && Object.keys(chainResult || {}).length === 4);

var chainXs = chainNodes.map(function (n) { return chainResult[n.id].x; });
check("单链树：无分支，全部节点 x 坐标相等", chainXs.every(function (x) { return x === chainXs[0]; }));

var chainYs = chainNodes.map(function (n) { return chainResult[n.id].y; });
check("单链树：y 坐标严格随 depth 递增",
  chainYs[0] < chainYs[1] && chainYs[1] < chainYs[2] && chainYs[2] < chainYs[3]);

var chainResultAgain = TreeLayout.solve(makeChainNodes(), makeConfig());
check("单链树：同一输入调用两次输出深度相等（确定性）",
  JSON.stringify(chainResult) === JSON.stringify(chainResultAgain));

var wideConfig = { nodeW: 120, nodeH: 48, gapX: 48, gapY: 64 };
var wideResult = TreeLayout.solve(makeBigTreeNodes(), wideConfig);
var leafPairDefault = bigResult["F01-K01-C02"].x - bigResult["F01-K01-C01"].x;
var leafPairWide = wideResult["F01-K01-C02"].x - wideResult["F01-K01-C01"].x;
check("更换 config.gapX 后相邻叶子间距按 nodeW+gapX 精确变化（证明 config 被真正消费）",
  leafPairDefault === DEFAULT_CONFIG.nodeW + DEFAULT_CONFIG.gapX &&
    leafPairWide === wideConfig.nodeW + wideConfig.gapX &&
    leafPairWide > leafPairDefault);

// ---------------------------------------------------------------- 反例

console.log("");
console.log("== 构造反例：验校验器真的会抛错 ==");

expectReject("nodes 为空数组", baseSmallData, function (data) {
  data.nodes = [];
});

expectReject("nodes 不是数组（传对象）", baseSmallData, function (data) {
  data.nodes = { foo: "bar" };
});

expectReject("节点 id 重复（两个非根节点同名）", baseSmallData, function (data) {
  data.nodes[2].id = data.nodes[1].id;
});

expectReject("节点 id 重复（根节点与子节点同名）", baseSmallData, function (data) {
  data.nodes[3].id = data.nodes[0].id;
});

expectReject("parentId 悬空（引用不存在的父节点）", baseSmallData, function (data) {
  data.nodes[1].parentId = "does-not-exist";
});

expectReject("parentId 悬空（深层节点引用不存在的父节点）", baseSmallData, function (data) {
  data.nodes[3].parentId = "phantom-parent";
});

expectReject("零个根节点（没有 parentId 为 null 的节点）", baseSmallData, function (data) {
  data.nodes[0].parentId = data.nodes[1].id;
});

expectReject("多个根节点（两个节点 parentId 均为 null）", baseSmallData, function (data) {
  data.nodes[1].parentId = null;
});

expectReject("环：节点自己引用自己为父（自环）", baseSmallData, function (data) {
  data.nodes[3].parentId = data.nodes[3].id;
});

expectReject("环：两节点互相引用形成孤立环（与根不连通）", baseSmallData, function (data) {
  data.nodes.push({ id: "x", parentId: "y", depth: 2 });
  data.nodes.push({ id: "y", parentId: "x", depth: 2 });
});

expectReject("环：三节点环（与根不连通）", baseSmallData, function (data) {
  data.nodes.push({ id: "p", parentId: "r", depth: 2 });
  data.nodes.push({ id: "q", parentId: "p", depth: 2 });
  data.nodes.push({ id: "r", parentId: "q", depth: 2 });
});

expectReject("config 缺少字段（缺 gapY）", baseSmallData, function (data) {
  delete data.config.gapY;
});

expectReject("config 字段非法（gapX <= 0）", baseSmallData, function (data) {
  data.config.gapX = 0;
});

expectReject("config 字段类型错误（nodeW 为字符串）", baseSmallData, function (data) {
  data.config.nodeW = "120";
});

// ---------------------------------------------------------------- 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言）");
