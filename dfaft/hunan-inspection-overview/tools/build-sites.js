// 生成 scripts/data/sites.js —— 给管网拓扑里的每个节点补上地理坐标、所属地级市、
// 状态与「坐标来源」标记，一次输出到两个 POC。
//
// 用法：node poc/hunan-inspection-overview/tools/build-sites.js
//
// ==== 为什么这个生成器用 Node 而不是 Python ====
// 同目录另外两个生成器（build-topology.py / build-geo.py）用 Python，是因为它们的输入是
// .xls（需要 xlrd 读单元格填充色）和 .geojson。本生成器的输入是**前两者的产物**
// scripts/data/topology.js 与 scripts/data/geo.js，它们是 JS 对象字面量（键不带引号），
// Python 无法 json.loads，只能靠正则剥壳——那种做法一旦上游改个格式就静默解析错。
// Node 能原生 require 这两个文件、拿到与浏览器完全一致的对象，没有任何解析歧义。
//
// ==== 坐标来源分两类，必须显式可辨认 ====
// 业务方给的资料里，成品油管道有一份带真实地理位置的《国家管网湖南成品油管道线路全图》
// （assets/data/附件 7/长郴管道走向全图 (1).jpg），所以那 9 个站场能标 "surveyed"。
// 其余节点（全部气管道站场 + 全部阀室）在资料里只有拓扑顺序、没有坐标，只能按
// 「所属作业区的市域 → 沿管道顺序插值」推导，一律标 "approx"。
//
// 这个字段是纪律不是装饰：假定必须可辨认，不能把插值近似坐标伪装成实测坐标。大屏 UI
// 会据此给 approx 点位加「位置为示意」标记，避免演示时被当成真实测绘成果。
// 同一条纪律在本仓库另一处也在用：poc/inspection-3d-sandbox 的数值型巡检项里，
// 12 条量程有 3 条来自标准原文、9 条标 demo-assumed。

"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var TOOLS_DIR = __dirname;
var POC_ROOT = path.dirname(TOOLS_DIR); // .../poc/hunan-inspection-overview
var POC_PARENT = path.dirname(POC_ROOT); // .../poc
var PROJECT_ROOT = path.dirname(POC_PARENT); // .../xunjian-ai-demo

var GEOJSON_PATH = path.join(PROJECT_ROOT, "assets", "geo", "hunan-430000-full.geojson");

// 输出到两个 POC（沿用 build-topology.py / build-geo.py 的双输出模式）：
// 「沙盘/俯视」那一组的经验是——两个 POC 刻意互不耦合、各持完整副本、运行时零共享，
// 但数据必须只有一个真源，否则两边会各自漂移。解法是构建时同源、运行时零耦合。
var OUT_TARGETS = [
  { dir: path.join(POC_ROOT, "scripts", "data"), scope: "all", label: "hunan-inspection-overview" },
  {
    dir: path.join(POC_PARENT, "hunan-inspection-overview".replace("inspection", "pump"), "scripts", "data"),
    scope: "oil",
    label: "hunan-pump-overview",
  },
];

// ==========================================================================
// 手工输入 ①：作业区 → 地级市 adcode
// ==========================================================================
//
// contract.js 刻意不写死这份映射（它是业务事实，属数据层），只提供 assertZoneDistrictMap
// 校验「14 市不重不漏、每市恰好归一个作业区」。
//
// 逐条依据（作业区名本身带地理指向，源表 assets/.data/...xls 的图例原文）：
//   yueyang    岳阳作业区  → 岳阳市
//   changsha   长沙作业区  → 长沙市
//   xianglou   湘娄作业区  → 湘潭市 + 娄底市（名字即"湘潭+娄底"的合并分区）
//   zhuzhou    株洲作业区  → 株洲市
//   hengyang   衡阳作业区  → 衡阳市
//   yongchen   永郴作业区  → 永州市 + 郴州市（名字即"永州+郴州"）
//   xiangbei   湘北作业区  → 常德市 + 益阳市（湘北即洞庭湖以西北一带）
//   xiangzhong 湘中作业区  → 邵阳市
//   chenzhou   郴州作业区  → 郴州市
//   xiangxi    湘西作业区  → 湘西州 + 张家界市 + 怀化市（源表里湘西作业区的管道是
//                            龙山-花垣/花垣-怀化/花垣-张家界/麻阳-辰溪，正好覆盖这三地）
//
// ⚠️ 注意 431000 郴州市**同时**属于 yongchen 与 chenzhou——这是业务现实，不是笔误：
// 「永郴作业区」管成品油长郴管道在郴州境内的站场（郴州站/华塘阀室/沙坪阀室/省界阀室），
// 「郴州作业区」管气管道（桂阳-郴州-资兴/桂阳-临武）在同一片地理区域的站场。
// 设计阶段我曾要求"每个市恰好归一个作业区"，实测数据后证明与现实矛盾（郴州站的 zoneId
// 是 yongchen 但它物理位置在郴州市），contract.js 的 assertZoneDistrictMap 已相应放宽，
// 只校验"14 市全覆盖"、不再校验排他。地图着色改用「该市境内站点最多的作业区」这个众数
// 口径，见下方 primaryZoneByDistrict()。
var ZONE_DISTRICTS = {
  yueyang: ["430600"],
  changsha: ["430100"],
  xianglou: ["430300", "431300"],
  zhuzhou: ["430200"],
  hengyang: ["430400"],
  yongchen: ["431100", "431000"],
  xiangbei: ["430700", "430900"],
  xiangzhong: ["430500"],
  chenzhou: ["431000"],
  xiangxi: ["433100", "430800", "431200"],
};

// ==========================================================================
// 手工输入 ②：成品油 9 个站场的实测经纬度
// ==========================================================================
//
// 读自 assets/data/附件 7/长郴管道走向全图 (1).jpg（《国家管网湖南成品油管道线路全图》，
// 国家管网华中分公司湖南输油分公司制）。该图带县市界、公路铁路与站场图标，可按地名定位。
// 读图定位到不了米级，但必须落在正确的市域内——脚本用点在多边形内检测机械校验，
// 不通过就直接报错，不静默挪位。
// ⚠️ 键名必须用**源表 XLS 里的确切写法**，不是走向全图上的写法——两者不一致：
// 图上标「长岭首站/汨罗泵站/长沙站场/株洲末站/衡阳泵站/耒阳站场/郴州末站/娄底末站」，
// 源表里是「长岭站/汨罗站/长沙站/株洲站/衡阳站/耒阳站/郴州站/娄底站」。以源表为准
// （拓扑与作业区归属都来自它）。脚本对找不到同名节点的键直接抛错，不静默跳过。
var SURVEYED_LONLAT = {
  长岭站: [113.28, 29.44], // 岳阳云溪/临湘一带，长岭炼化所在；图上标「长岭首站」
  七里山站: [113.13, 29.38], // 岳阳楼区
  汨罗站: [113.07, 28.81], // 汨罗市（岳阳代管）；图上标「汨罗泵站」
  长沙站: [112.9, 28.35], // 望城区，长沙市区西北；图上标「长沙站场」
  湘潭站: [112.94, 27.87], // 湘潭市区；长郴干线与湘娄/湘株两条支线的分输枢纽
  衡阳站: [112.61, 26.9], // 衡阳市区；图上标「衡阳泵站」
  耒阳站: [112.86, 26.42], // 耒阳市（衡阳代管）；图上标「耒阳站场」
  郴州站: [113.03, 25.79], // 郴州市区；图上标「郴州末站」
  株洲站: [113.13, 27.83], // 株洲市区；图上标「株洲末站」，湘株支线终点
  娄底站: [112.0, 27.7], // 娄底市区；图上标「娄底末站」，湘娄支线终点
  // 154国库站（湘株支线）**不在**这份实测表里：走向全图上没有标注它，
  // 只在源表 XLS 里出现，所以它走 approx 推导，不冒充实测。
};

// ==========================================================================
// 手工输入 ③：演示态异常节点
// ==========================================================================
//
// 全省 217 个节点默认 ok。这里挑少量做成 warn/danger 供大屏有内容可讲。
// 挑选原则：优先真实资料里能讲出故事的站点；**至少 1 个落在成品油线上**，
// 这样泵站大屏（只含 44 个成品油节点）也有异常可讲，不至于满屏绿色。
// ⚠️ 这些状态是演示设定，不是真实运行数据。
// ⚠️ 键名同样必须用**源表 XLS 的确切写法**。第一版这里误用了走向全图上的「汨罗泵站」
// 「衡阳泵站」，源表里其实是「汨罗站」「衡阳站」——两条静默没匹配上，后果是泵站大屏
// （只含成品油 44 个节点）变成满屏绿色、一个异常都没有，而且不报任何错。所以下面加了
// 一条硬断言：每个键必须至少命中一个节点，拼错就抛错。
var STATUS_OVERRIDES = {
  汨罗站: "danger", // 成品油长郴管道上的泵站，泵站大屏的主线异常
  衡阳站: "warn", // 同为成品油泵站，做二级关注
  岳阳分输清管站: "danger", // 气管道侧：岳阳作业区节点最多，异常放这里叙事密度高
  株洲分输清管站: "warn",
  永州分输清管站: "warn", // 与 poc/inspection-3d-sandbox 的站内地图同一个站场，可串联叙事
};

// ==========================================================================
// 工具
// ==========================================================================

function loadWindowModule(file, expectedGlobals) {
  var code = fs.readFileSync(file, "utf8");
  var sandbox = { window: {}, document: undefined, console: console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  expectedGlobals.forEach(function (name) {
    if (!sandbox.window[name]) {
      throw new Error("加载 " + file + " 后 window." + name + " 不存在，请确认该文件的导出名");
    }
  });
  return sandbox.window;
}

// 射线法点在多边形内检测。ring 是 [[lon,lat], ...] 闭合环。
function pointInRing(lon, lat, ring) {
  var inside = false;
  var i, j, xi, yi, xj, yj, intersect;
  for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    xi = ring[i][0];
    yi = ring[i][1];
    xj = ring[j][0];
    yj = ring[j][1];
    intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInDistrict(lon, lat, district) {
  var k;
  for (k = 0; k < district.lonLatRings.length; k += 1) {
    if (pointInRing(lon, lat, district.lonLatRings[k])) return true;
  }
  return false;
}

// 环的有符号面积（用于面积质心与"取最大环"）。
function ringArea(ring) {
  var a = 0;
  var i;
  for (i = 0; i < ring.length - 1; i += 1) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function ringCentroid(ring) {
  var cx = 0;
  var cy = 0;
  var a = ringArea(ring);
  var i, f;
  if (a === 0) throw new Error("环面积为 0，无法求质心");
  for (i = 0; i < ring.length - 1; i += 1) {
    f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    cx += (ring[i][0] + ring[i + 1][0]) * f;
    cy += (ring[i][1] + ring[i + 1][1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// 从 geojson 读 14 市：保留 lon/lat 环（供点在多边形内检测）+ 面积加权质心。
function loadDistricts() {
  var gj = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  if (gj.type !== "FeatureCollection") throw new Error("geojson 顶层 type 不是 FeatureCollection");
  if (gj.features.length !== 14) throw new Error("geojson feature 数应为 14，实际 " + gj.features.length);

  var byAdcode = {};
  gj.features.forEach(function (f) {
    var adcode = String(f.properties.adcode);
    var name = f.properties.name;
    var g = f.geometry;
    if (g.type !== "MultiPolygon") throw new Error(adcode + " 几何类型应为 MultiPolygon，实际 " + g.type);
    // ⚠️ 岳阳市有 2 个、怀化市有 3 个**独立 Polygon**（洞庭湖岛屿与飞地），每个 Polygon
    // 各含 1 个环、没有空洞。所以这里把所有 Polygon 的第 0 环平铺收集，**不能**把第 2 个
    // Polygon 当成第 1 个的空洞——那会让飞地变成孔。
    var rings = g.coordinates.map(function (poly) {
      return poly[0];
    });
    var weighted = rings.map(function (r) {
      return { c: ringCentroid(r), w: Math.abs(ringArea(r)) };
    });
    var totalW = weighted.reduce(function (s, x) {
      return s + x.w;
    }, 0);
    var cx = weighted.reduce(function (s, x) {
      return s + x.c[0] * x.w;
    }, 0) / totalW;
    var cy = weighted.reduce(function (s, x) {
      return s + x.c[1] * x.w;
    }, 0) / totalW;
    // 质心必须落在自己的市域内。形状极不规则的市（怀化、湘西州）面积质心可能落到市域外，
    // 那样后续所有以质心为锚的插值都会错。这里直接报错，不静默兜底。
    var centroid = [cx, cy];
    var d = { adcode: adcode, name: name, lonLatRings: rings, centroid: centroid, areaAbs: totalW };
    if (!pointInDistrict(cx, cy, d)) {
      // 退而取最大环自身的质心（仍是真实几何推导，不是随手挪位），再验一次。
      var biggest = weighted.slice().sort(function (a, b) {
        return b.w - a.w;
      })[0];
      if (!pointInDistrict(biggest.c[0], biggest.c[1], d)) {
        throw new Error(adcode + "(" + name + ") 的面积质心与最大环质心都不在市域内，需要人工处理");
      }
      d.centroid = biggest.c;
      d.centroidFallback = "largest-ring";
    }
    byAdcode[adcode] = d;
  });
  return byAdcode;
}

// ==========================================================================
// 坐标推导
// ==========================================================================

// 在市域内沿"质心 → 该市域包围盒内的偏移"散布节点：同一市域内多个节点必须散开，
// 否则光柱叠成一点、DOM 标签去碰撞也救不了。
// 做法：以市域质心为中心、按黄金角螺旋撒点，逐点做点在多边形内检测，不在就缩半径重试。
var GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function spreadInDistrict(district, index, total, minSepDeg) {
  var cx = district.centroid[0];
  var cy = district.centroid[1];
  if (total <= 1) return [cx, cy];
  // 市域尺度：取最大环的经纬跨度的一个比例做螺旋半径上限
  var lons = [];
  var lats = [];
  district.lonLatRings.forEach(function (r) {
    r.forEach(function (p) {
      lons.push(p[0]);
      lats.push(p[1]);
    });
  });
  var spanLon = Math.max.apply(null, lons) - Math.min.apply(null, lons);
  var spanLat = Math.max.apply(null, lats) - Math.min.apply(null, lats);
  var rMax = Math.min(spanLon, spanLat) * 0.32;
  var rBase = rMax * Math.sqrt((index + 0.5) / total);
  var theta = index * GOLDEN_ANGLE;
  var shrink;
  for (shrink = 1; shrink >= 0.12; shrink -= 0.08) {
    var r = rBase * shrink;
    var lon = cx + r * Math.cos(theta);
    var lat = cy + r * Math.sin(theta) * 0.85; // 纬度方向压一点，贴合湖南多数市域偏南北长
    if (pointInDistrict(lon, lat, district)) {
      if (Math.abs(r) >= minSepDeg * 0.5 || index === 0) return [lon, lat];
      return [lon, lat];
    }
  }
  // 缩到最小仍不在多边形内，说明质心附近极窄——直接用质心（一定在内，前面已验证）
  return [cx, cy];
}

function main() {
  var topo = loadWindowModule(path.join(POC_ROOT, "scripts", "data", "topology.js"), ["HunanTopology"]).HunanTopology;
  var districts = loadDistricts();

  console.log("[load] geojson 14 市；topology " + topo.zones.length + " 作业区 / " + topo.pipelines.length + " 管道 / " + topo.nodes.length + " 节点");
  Object.keys(districts).forEach(function (a) {
    if (districts[a].centroidFallback) {
      console.log("  [WARN] " + a + "(" + districts[a].name + ") 面积质心不在市域内，已改用最大环质心");
    }
  });

  // ---- 校验手工映射：14 市全覆盖（允许重叠，与 contract.js 的 assertZoneDistrictMap 一致）----
  //
  // 这里**不校验排他**。作业区与市是多对多：永郴作业区与郴州作业区都涉及郴州市，这是
  // 业务现实。硬套排他会逼我们把其中一方的归属改成编的。未被任何作业区覆盖的市才是
  // 真错误——那样它在地图上是无色孤岛、也不计入任何作业区统计。
  var claimedBy = {};
  Object.keys(ZONE_DISTRICTS).forEach(function (z) {
    ZONE_DISTRICTS[z].forEach(function (a) {
      if (!districts[a]) throw new Error("ZONE_DISTRICTS[" + z + "] 含未知 adcode " + a);
      (claimedBy[a] = claimedBy[a] || []).push(z);
    });
  });
  var uncovered = Object.keys(districts).filter(function (a) { return !claimedBy[a]; });
  if (uncovered.length) {
    throw new Error(
      "以下市未被任何作业区覆盖：" +
        uncovered.map(function (a) { return a + "(" + districts[a].name + ")"; }).join(", ")
    );
  }
  var overlapped = Object.keys(claimedBy).filter(function (a) { return claimedBy[a].length > 1; });
  console.log("[check] 作业区→adcode 映射：14 市全覆盖 OK");
  overlapped.forEach(function (a) {
    console.log(
      "  [note] " + a + "(" + districts[a].name + ") 同时属于 [" + claimedBy[a].join(", ") +
        "]——业务现实（多对多），非错误"
    );
  });

  // ---- 给每个节点定 adcode：同作业区多市时，按该节点在管道中的顺序轮流分配，
  //      让同一作业区的节点铺开到它辖下各市，而不是全挤在第一个市。 ----
  var nodesByZone = {};
  topo.nodes.forEach(function (n) {
    (nodesByZone[n.zoneId] = nodesByZone[n.zoneId] || []).push(n);
  });

  var siteById = {};
  var surveyedUsed = {};

  // ---- 第一遍：实测站场。adcode 由**真实坐标反查**，不参与后面的轮流分配。 ----
  //
  // 方向很关键：实测节点是"先有坐标、再定它在哪个市"，而近似节点是"先定它在哪个市、
  // 再在市内撒点"。如果对实测节点也走轮流分配，就会出现"坐标在郴州市、adcode 却被分到
  // 永州市"这种自相矛盾——而这恰恰是把作业区（业务分组）与市（地理）混为一谈的后果。
  // 实测坐标**只对成品油管道上的节点生效**。理由：那份走向全图（《国家管网湖南成品油
  // 管道线路全图》）画的就只有成品油三条线。而拓扑里存在跨类型的重名节点——`长沙站`
  // 同时出现在「兰郑长管道」(gas) 与「长郴管道」(oil) 上，是长沙同时有输气分输站和成品油
  // 站场这个真实情况。若只按名字匹配，两个节点会拿到**完全相同**的坐标、光柱叠成一根，
  // 而且会把一个气站场标成"实测"——那是两重错误。
  var oilPipelineIdSet = {};
  topo.pipelines.forEach(function (p) {
    if (p.kind === "oil") oilPipelineIdSet[p.id] = true;
  });

  var zoneMismatch = [];
  topo.nodes.forEach(function (n) {
    if (!SURVEYED_LONLAT[n.name]) return;
    if (!oilPipelineIdSet[n.pipelineId]) return;
    var lonlat = SURVEYED_LONLAT[n.name];
    var hit = Object.keys(districts).filter(function (a) {
      return pointInDistrict(lonlat[0], lonlat[1], districts[a]);
    });
    if (hit.length !== 1) {
      throw new Error(
        "实测站场 " + n.name + " @(" + lonlat[0] + "," + lonlat[1] + ") 落在 " + hit.length +
          " 个市域内（期望恰好 1 个）：[" + hit.join(", ") + "]——请核对读图取值"
      );
    }
    var adcode = hit[0];
    // 作业区与市是多对多，所以这里**只记录不报错**：实测坐标所在市不在该节点作业区的
    // 声明市域列表里，是业务现实的一部分（例如永郴作业区的郴州站落在郴州市），不是错误。
    if (ZONE_DISTRICTS[n.zoneId].indexOf(adcode) < 0) {
      zoneMismatch.push(
        n.name + "：zoneId=" + n.zoneId + " 声明市域 [" + ZONE_DISTRICTS[n.zoneId].join(",") +
          "]，实测坐标落在 " + adcode + "(" + districts[adcode].name + ")"
      );
    }
    surveyedUsed[n.name] = true;
    siteById[n.id] = {
      id: n.id, name: n.name, kind: n.kind, zoneId: n.zoneId,
      pipelineId: n.pipelineId, seq: n.seq,
      adcode: adcode, districtName: districts[adcode].name,
      lon: lonlat[0], lat: lonlat[1],
      status: STATUS_OVERRIDES[n.name] || "ok",
      coordSource: "surveyed",
    };
  });
  if (zoneMismatch.length) {
    console.log("[note] 实测坐标所在市与作业区声明市域不一致（业务现实，非错误）：");
    zoneMismatch.forEach(function (m) { console.log("  " + m); });
  }

  // ---- 第二遍：近似节点。**按管道为单位布线**，不是按作业区撒点。 ----
  //
  // 第一版这里是"按作业区轮流分配到各市 + 市内黄金角螺旋撒点"，验证图一看就废：同一条
  // 管道的相邻节点被撒到市内随机方位，按 seq 连线后每个市内部都是一团放射状乱麻，跨市段
  // 还有长距离交叉——完全不像管道。根因是撒点算法压根不知道"这些点属于同一条线"。
  //
  // 现在的算法：管道是**线状实体**，所以按线来布。
  //   1) 取该管道的节点序列（按 seq）；
  //   2) 为每个节点选一个市：优先沿用上一个节点的市（保持连续），需要换市时在该节点
  //      作业区的候选市里选离上一个市质心最近的那个——这样"途经市序列"本身是连贯的；
  //   3) 把途经市的质心去重后连成一条折线，作为这条管道的骨架走向；
  //   4) 节点按 seq 在骨架折线上按弧长均匀取点，再加一点垂直于骨架的小抖动避免完全共线；
  //   5) 逐点做点在多边形内检测，不在其市内就朝该市质心方向拉回，直到落进去。
  // 实测坐标已固定的节点（成品油 10 站场）作为骨架上的锚点参与第 2/3 步，让干线走向
  // 贴合真实站场位置，而不是各走各的。
  var pipelineById = {};
  topo.pipelines.forEach(function (p) { pipelineById[p.id] = p; });

  function dist2(a, b) {
    var dx = a[0] - b[0];
    var dy = a[1] - b[1];
    return dx * dx + dy * dy;
  }

  // 沿折线按归一化弧长 t∈[0,1] 取点
  function pointOnPolyline(pts, t) {
    if (pts.length === 1) return pts[0].slice();
    var segLen = [];
    var total = 0;
    var i;
    for (i = 0; i < pts.length - 1; i += 1) {
      var L = Math.sqrt(dist2(pts[i], pts[i + 1]));
      segLen.push(L);
      total += L;
    }
    if (total === 0) return pts[0].slice();
    var target = t * total;
    var acc = 0;
    for (i = 0; i < segLen.length; i += 1) {
      if (acc + segLen[i] >= target || i === segLen.length - 1) {
        var u = segLen[i] === 0 ? 0 : (target - acc) / segLen[i];
        return [
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u,
        ];
      }
      acc += segLen[i];
    }
    return pts[pts.length - 1].slice();
  }

  // 把点拉回到指定市域内：朝质心方向按比例收缩，最多试 12 次。
  function pullInside(lonlat, district) {
    if (pointInDistrict(lonlat[0], lonlat[1], district)) return lonlat;
    var c = district.centroid;
    var k;
    for (k = 0.8; k >= 0.05; k -= 0.075) {
      var p = [c[0] + (lonlat[0] - c[0]) * k, c[1] + (lonlat[1] - c[1]) * k];
      if (pointInDistrict(p[0], p[1], district)) return p;
    }
    return c.slice(); // 质心一定在内（loadDistricts 已验证）
  }

  Object.keys(pipelineById).forEach(function (pid) {
    var p = pipelineById[pid];
    var seq = p.nodeIds
      .map(function (id) {
        return topo.nodes.filter(function (n) { return n.id === id; })[0];
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.seq - b.seq; });
    if (!seq.length) return;

    // 步骤 2：为每个节点定市。
    //
    // 这里要同时满足两个互相拉扯的要求：
    //   连续性——同一条管道的相邻节点不该在市之间来回跳；
    //   铺开——一条管道跨越多个市时要**真的跨过去**，不能全挤在第一个市。
    // 第一版只做了连续性（"优先沿用上一个市"），结果整条管道锁死在首个市，验证图上
    // 张家界/怀化/益阳/永州 等市完全空白——一个跨三市的作业区看起来只有一个市有设施。
    //
    // 现在的做法：先把节点序列按 zoneId 切成**连续段**（同一作业区的相邻节点归一段），
    // 然后把每一段的节点**依次分配到该作业区的市序列上**（市序列按"离上一段末尾市最近"
    // 排序，保证跨段衔接不跳）。段内按比例切块：M 个市、N 个节点 → 每个市拿 N/M 个连续
    // 节点。这样段内连续、段间衔接、且多市作业区会被真的铺开。
    var chosen = [];
    var runs = [];
    seq.forEach(function (n) {
      var last = runs[runs.length - 1];
      if (last && last.zoneId === n.zoneId) last.nodes.push(n);
      else runs.push({ zoneId: n.zoneId, nodes: [n] });
    });

    var prevAdcode = null;
    runs.forEach(function (run) {
      var cands = ZONE_DISTRICTS[run.zoneId];
      if (!cands || !cands.length) {
        throw new Error("节点作业区 " + run.zoneId + " 没有候选市域（ZONE_DISTRICTS 缺失）");
      }
      // 市序列排序：离上一段末尾市最近的排前面，保证跨段衔接不跳
      var order = cands.slice();
      if (prevAdcode) {
        order.sort(function (a, b) {
          return dist2(districts[a].centroid, districts[prevAdcode].centroid) -
            dist2(districts[b].centroid, districts[prevAdcode].centroid);
        });
      }
      run.nodes.forEach(function (n, i) {
        var fixed = siteById[n.id];
        if (fixed) {
          chosen.push({ node: n, adcode: fixed.adcode, fixedLonLat: [fixed.lon, fixed.lat] });
          prevAdcode = fixed.adcode;
          return;
        }
        // 段内按比例切块落到 order 上的各市
        var slot = Math.min(order.length - 1, Math.floor((i * order.length) / run.nodes.length));
        var pick = order[slot];
        chosen.push({ node: n, adcode: pick, fixedLonLat: null });
        prevAdcode = pick;
      });
    });

    // 步骤 3：骨架折线 = 途经市质心（相邻去重）+ 实测锚点
    var skeleton = [];
    chosen.forEach(function (c) {
      var pt = c.fixedLonLat ? c.fixedLonLat : districts[c.adcode].centroid;
      var last = skeleton[skeleton.length - 1];
      if (!last || dist2(last, pt) > 1e-8) skeleton.push(pt.slice());
    });

    // 步骤 4/5：按弧长均匀取点 + 垂直小抖动 + 拉回市内
    chosen.forEach(function (c, i) {
      if (c.fixedLonLat) return; // 实测节点不动
      var t = chosen.length === 1 ? 0.5 : i / (chosen.length - 1);
      var base = pointOnPolyline(skeleton, t);
      // 垂直抖动：让同一市内的多个节点不完全共线，幅度取市域尺度的一个小比例
      var d = districts[c.adcode];
      var span = Math.min(
        d.lonLatRings[0].reduce(function (m, q) { return Math.max(m, q[0]); }, -1e9) -
          d.lonLatRings[0].reduce(function (m, q) { return Math.min(m, q[0]); }, 1e9),
        d.lonLatRings[0].reduce(function (m, q) { return Math.max(m, q[1]); }, -1e9) -
          d.lonLatRings[0].reduce(function (m, q) { return Math.min(m, q[1]); }, 1e9)
      );
      var amp = span * 0.055;
      var jitter = ((i % 5) - 2) / 2; // -1, -0.5, 0, 0.5, 1 循环，确定性、无随机
      var lonlat = pullInside([base[0] + amp * jitter, base[1] - amp * jitter * 0.6], d);
      siteById[c.node.id] = {
        id: c.node.id, name: c.node.name, kind: c.node.kind, zoneId: c.node.zoneId,
        pipelineId: c.node.pipelineId, seq: c.node.seq,
        adcode: c.adcode, districtName: d.name,
        lon: Math.round(lonlat[0] * 1e4) / 1e4,
        lat: Math.round(lonlat[1] * 1e4) / 1e4,
        status: STATUS_OVERRIDES[c.node.name] || "ok",
        coordSource: "approx",
      };
    });
  });

  // 兜底检查：不允许有节点没拿到坐标（例如某节点的 pipelineId 不在 pipelines 里）
  var missing = topo.nodes.filter(function (n) { return !siteById[n.id]; });
  if (missing.length) {
    throw new Error(
      "以下节点未分配到坐标（很可能其 pipelineId 不在 pipelines 列表里）：" +
        missing.slice(0, 10).map(function (n) { return n.id + "(" + n.name + ")"; }).join(", ")
    );
  }

  // ---- surveyed 站场必须全部命中，且必须落在正确市域内 ----
  Object.keys(SURVEYED_LONLAT).forEach(function (name) {
    if (!surveyedUsed[name]) {
      throw new Error(
        "SURVEYED_LONLAT 里的 " + name + " 在 topology 的 217 个节点里找不到同名节点——" +
          "请核对源表里的确切写法（例如是否叫「长沙站」而不是「长沙站场」）"
      );
    }
  });

  var siteList = topo.nodes.map(function (n) {
    return siteById[n.id];
  });

  // ---- STATUS_OVERRIDES 的每个键必须至少命中一个节点 ----
  //
  // 防的是什么：这张表是按**节点名**匹配的，而源表 XLS 的写法与走向全图的写法不一致
  // （「汨罗站」vs「汨罗泵站」）。写错名字时匹配不上、状态保持 ok、页面照常渲染，
  // 结果是大屏满屏绿色、一个异常都没有——而且不报任何错。第一版就踩了这个：本该有 5 个
  // 异常，实际只生效 3 个，泵站大屏（只含成品油节点）的两个异常全部落空。
  var overrideNames = Object.keys(STATUS_OVERRIDES);
  var unmatched = overrideNames.filter(function (nm) {
    return !siteList.some(function (s) { return s.name === nm; });
  });
  if (unmatched.length) {
    throw new Error(
      "STATUS_OVERRIDES 里以下名称在 217 个节点里找不到，状态设定会静默失效：[" +
        unmatched.join(", ") + "]——请用源表 XLS 里的确切写法"
    );
  }
  var issueCount = siteList.filter(function (s) { return s.status !== "ok"; }).length;
  console.log("[check] STATUS_OVERRIDES " + overrideNames.length + " 条全部命中，实际异常节点 " + issueCount + " 个");
  // 泵站大屏只含成品油节点，必须至少有一个异常，否则那块屏没有内容可讲。
  var oilIssue = siteList.filter(function (s) {
    return s.status !== "ok" && oilPipelineIdSet[s.pipelineId];
  });
  if (oilIssue.length === 0) {
    throw new Error("成品油管道上没有任何异常节点——泵站大屏会满屏绿色，请在 STATUS_OVERRIDES 里给成品油站场加异常");
  }
  console.log("[check] 成品油线上异常节点 " + oilIssue.length + " 个：" + oilIssue.map(function (s) { return s.name + "(" + s.status + ")"; }).join(", "));

  // ---- 自检：每个站点必须落在其 adcode 对应市的多边形内 ----
  var outside = siteList.filter(function (s) {
    return !pointInDistrict(s.lon, s.lat, districts[s.adcode]);
  });
  if (outside.length) {
    console.log("[FAIL] 以下站点不在其 adcode 市域内：");
    outside.slice(0, 20).forEach(function (s) {
      console.log("  " + s.id + " " + s.name + " -> " + s.adcode + "(" + s.districtName + ") @" + s.lon + "," + s.lat + " [" + s.coordSource + "]");
    });
    throw new Error("有 " + outside.length + " 个站点落在错误市域内");
  }
  console.log("[check] 全部 " + siteList.length + " 个站点都落在其 adcode 市域内 OK");

  var surveyedCount = siteList.filter(function (s) {
    return s.coordSource === "surveyed";
  }).length;
  console.log("[check] coordSource: surveyed=" + surveyedCount + "  approx=" + (siteList.length - surveyedCount));

  var oilPipelineIds = {};
  topo.pipelines.forEach(function (p) {
    if (p.kind === "oil") oilPipelineIds[p.id] = true;
  });

  OUT_TARGETS.forEach(function (target) {
    var scoped =
      target.scope === "oil"
        ? siteList.filter(function (s) {
            return oilPipelineIds[s.pipelineId];
          })
        : siteList;
    var js = renderJs(scoped, target, topo);
    fs.mkdirSync(target.dir, { recursive: true });
    var out = path.join(target.dir, "sites.js");
    fs.writeFileSync(out, js, "utf8");
    console.log("[write] " + path.relative(PROJECT_ROOT, out) + "  (" + scoped.length + " 站点, scope=" + target.scope + ")");
  });
}

function renderJs(sites, target, topo) {
  var zoneIds = topo.zones.map(function (z) {
    return z.id;
  });
  var statusRank = { ok: 0, warn: 1, danger: 2 };
  var zoneStatuses = {};
  zoneIds.forEach(function (z) {
    var worst = "ok";
    sites.forEach(function (s) {
      if (s.zoneId === z && statusRank[s.status] > statusRank[worst]) worst = s.status;
    });
    zoneStatuses[z] = worst;
  });

  var lines = [];
  lines.push("// 本文件由 tools/build-sites.js 生成，不要手改。");
  lines.push("// 改坐标/映射/演示状态请改该脚本里的三张手工输入表后重跑：");
  lines.push("//   node poc/hunan-inspection-overview/tools/build-sites.js");
  lines.push("//");
  lines.push("// 数据范围：" + target.label + "（scope=" + target.scope + "，共 " + sites.length + " 个站点）");
  lines.push("// 上游真源：assets/.data/…作业区位置关系图…xls（拓扑与作业区归属，V3-20260119）");
  lines.push("//           assets/geo/hunan-430000-full.geojson（14 市行政边界）");
  lines.push("//           assets/data/附件 7/长郴管道走向全图 (1).jpg（成品油 9 站场实测位置）");
  lines.push("//");
  lines.push("// ⚠️ coordSource 字段区分坐标可信度，不要忽略它：");
  lines.push("//   \"surveyed\" = 从《国家管网湖南成品油管道线路全图》读出的真实位置（9 个成品油站场）");
  lines.push("//   \"approx\"   = 资料里只有拓扑顺序没有坐标，按「所属作业区市域 + 螺旋散布」推导");
  lines.push("// 大屏 UI 应据此给 approx 点位标注「位置为示意」，不要让插值坐标被当成测绘成果。");
  lines.push("//");
  lines.push("// ⚠️ status 是演示设定，不是真实运行数据（见生成脚本的 STATUS_OVERRIDES）。");
  lines.push("(function () {");
  lines.push('  "use strict";');
  lines.push("");
  lines.push("  var SITES = [");
  sites.forEach(function (s) {
    lines.push(
      "    " +
        JSON.stringify({
          id: s.id,
          name: s.name,
          kind: s.kind,
          zoneId: s.zoneId,
          pipelineId: s.pipelineId,
          seq: s.seq,
          adcode: s.adcode,
          districtName: s.districtName,
          lon: s.lon,
          lat: s.lat,
          status: s.status,
          coordSource: s.coordSource,
        }) +
        ","
    );
  });
  lines.push("  ];");
  lines.push("");
  lines.push("  var ZONE_DISTRICTS = " + JSON.stringify(ZONE_DISTRICTS) + ";");
  lines.push("  var ZONE_STATUSES = " + JSON.stringify(zoneStatuses) + ";");
  lines.push("");
  lines.push("  function requireGeo() {");
  lines.push("    if (!window.HunanGeo || typeof window.HunanGeo.lonLatToWorld !== \"function\") {");
  lines.push("      throw new Error(\"[HunanSites] 需要 window.HunanGeo.lonLatToWorld()——请先加载 scripts/data/geo.js\");");
  lines.push("    }");
  lines.push("    return window.HunanGeo;");
  lines.push("  }");
  lines.push("");
  lines.push("  // 世界坐标现算不缓存：投影参数只有 geo.js 一份真源，这里绝不另存一套换算，");
  lines.push("  // 否则改投影时会出现「省界动了、站点没动」这种最难查的错位。");
  lines.push("  function withWorld(site) {");
  lines.push("    var w = requireGeo().lonLatToWorld(site.lon, site.lat);");
  lines.push("    var out = {};");
  lines.push("    Object.keys(site).forEach(function (k) { out[k] = site[k]; });");
  lines.push("    out.x = w[0];");
  lines.push("    out.z = w[1];");
  lines.push("    return out;");
  lines.push("  }");
  lines.push("");
  lines.push("  function sites() {");
  lines.push("    return SITES.map(withWorld);");
  lines.push("  }");
  lines.push("");
  lines.push("  function site(id) {");
  lines.push("    var i;");
  lines.push("    for (i = 0; i < SITES.length; i += 1) {");
  lines.push("      if (SITES[i].id === id) return withWorld(SITES[i]);");
  lines.push("    }");
  lines.push("    throw new Error(\"[HunanSites] 未知站点 id：\" + id);");
  lines.push("  }");
  lines.push("");
  lines.push("  function sitesByZone(zoneId) {");
  lines.push("    if (!ZONE_DISTRICTS[zoneId]) throw new Error(\"[HunanSites] 未知 zoneId：\" + zoneId);");
  lines.push("    return SITES.filter(function (s) { return s.zoneId === zoneId; }).map(withWorld);");
  lines.push("  }");
  lines.push("");
  lines.push("  function sitesByDistrict(adcode) {");
  lines.push("    return SITES.filter(function (s) { return s.adcode === adcode; }).map(withWorld);");
  lines.push("  }");
  lines.push("");
  lines.push("  function zoneStatuses() {");
  lines.push("    var out = {};");
  lines.push("    Object.keys(ZONE_STATUSES).forEach(function (k) { out[k] = ZONE_STATUSES[k]; });");
  lines.push("    return out;");
  lines.push("  }");
  lines.push("");
  lines.push("  function zoneProgress(zoneId) {");
  lines.push("    var list = SITES.filter(function (s) { return s.zoneId === zoneId; });");
  lines.push("    var bad = list.filter(function (s) { return s.status !== \"ok\"; }).length;");
  lines.push("    return { total: list.length, issueCount: bad, okCount: list.length - bad };");
  lines.push("  }");
  lines.push("");
  lines.push("  function provinceSummary() {");
  lines.push("    var station = SITES.filter(function (s) { return s.kind === \"station\"; }).length;");
  lines.push("    var valve = SITES.filter(function (s) { return s.kind === \"valve\"; }).length;");
  lines.push("    var issue = SITES.filter(function (s) { return s.status !== \"ok\"; }).length;");
  lines.push("    var approx = SITES.filter(function (s) { return s.coordSource === \"approx\"; }).length;");
  lines.push("    return {");
  lines.push("      siteTotal: SITES.length, stationTotal: station, valveTotal: valve,");
  lines.push("      issueTotal: issue, approxCoordCount: approx,");
  lines.push("      zoneTotal: Object.keys(ZONE_DISTRICTS).length,");
  lines.push("      districtTotal: (function () {");
  lines.push("        var m = {};");
  lines.push("        Object.keys(ZONE_DISTRICTS).forEach(function (z) {");
  lines.push("          ZONE_DISTRICTS[z].forEach(function (a) { m[a] = true; });");
  lines.push("        });");
  lines.push("        return Object.keys(m).length;");
  lines.push("      })()");
  lines.push("    };");
  lines.push("  }");
  lines.push("");
  lines.push("  window.HunanSites = {");
  lines.push("    meta: function () {");
  lines.push("      return { scope: " + JSON.stringify(target.scope) + ", label: " + JSON.stringify(target.label) + ", siteTotal: SITES.length };");
  lines.push("    },");
  lines.push("    zoneDistricts: function () {");
  lines.push("      var out = {};");
  lines.push("      Object.keys(ZONE_DISTRICTS).forEach(function (z) { out[z] = ZONE_DISTRICTS[z].slice(); });");
  lines.push("      return out;");
  lines.push("    },");
  lines.push("    sites: sites,");
  lines.push("    site: site,");
  lines.push("    sitesByZone: sitesByZone,");
  lines.push("    sitesByDistrict: sitesByDistrict,");
  lines.push("    zoneStatuses: zoneStatuses,");
  lines.push("    zoneProgress: zoneProgress,");
  lines.push("    provinceSummary: provinceSummary");
  lines.push("  };");
  lines.push("}());");
  lines.push("");
  return lines.join("\n");
}

main();
