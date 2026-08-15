/**
 * stage-2d5.js —— 2.5D 知识图谱展台。
 *
 * ---- 为什么不是 WebGL ----
 * 视角永远不动 ⇒ 每个"立体"形状都只是一个固定的投影 ⇒ 直接画那个投影就行。
 * 前五版用 three.js 手搓圆柱，每改一次形要等重建 + 截图 + 猜数字，做了五轮还是平的。
 * 换成分层 DOM/CSS 之后：中文永远锐利、元素天然可点可 Tab、改形就是改一个数值。
 *
 * ---- 构图：四层堆叠，用"高度"表达从属 ----
 *   L4 顶层   视角徽章（有几个视角就有几枚）      薄椭圆台
 *   L3 主层   N 张立牌 + 中心装置                大椭圆台 + 向下光锥裙
 *   L2 业务层 M 个业务锥台                      中椭圆环
 *   L1 领域层 K 个领域节点                      最外椭圆环
 * 前几版把三个维度平铺在同一张桌面上，信息层级没有用空间表达出来，所以怎么调都是乱的。
 *
 * ---- 模板性 ----
 * N / M / K 全部由数据决定，环上位置现算。加一条减一条不用改任何数字。
 * URL 加 ?n=6 当场验证。
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- 示例数据
  //
  // 换课题只换这一块。id → 跳转目标的映射沿用 kg_stage 已确立的语义。

  var DATA = {
    title: "国家管网技术图谱",
    stats: { nodes: 414, edges: 1619, docs: 70 },
    center: { id: "hub-task", label: "十大\n重点任务", view: "task" },
    // 视角：顶层徽章由它生成，有几个视角就有几枚
    views: [
      { key: "task", badge: "技术攻关" },
      { key: "business", badge: "平台建设" },
      { key: "domain", badge: "人才发展" }
    ],
    trunks: [
      { id: "T01", name: "管道失效与灾害控制" }, { id: "T02", name: "关键设备自主可控" },
      { id: "T03", name: "新型管材与高效建设" }, { id: "T04", name: "管网可靠性与仿真优化" },
      { id: "T05", name: "流动保障与融合输送" }, { id: "T06", name: "地下空间高效利用" },
      { id: "T07", name: "氢能·二氧化碳管道输送" }, { id: "T08", name: "低碳发展与环境保护" },
      { id: "T09", name: "智能管网与能源互联" }, { id: "T10", name: "发展战略与决策支持" },
      { id: "T11", name: "管网数字孪生" }, { id: "T12", name: "应急抢修与恢复" }
    ],
    business: [
      { id: "B1", name: "储气库", n: 128 },
      { id: "B2", name: "管道", n: 196 },
      { id: "B3", name: "LNG接收站", n: 90 }
    ],
    domains: [
      { id: "D1", name: "决策与管理" }, { id: "D2", name: "设计与施工" },
      { id: "D3", name: "材料与装备" }, { id: "D4", name: "输送与储存" },
      { id: "D5", name: "安全与维护" }, { id: "D6", name: "数字化与智能化" },
      { id: "D7", name: "低碳与新能源" }
    ]
  };

  function trunkCount() {
    var m = /[?&]n=(\d+)/.exec(window.location.search);
    var n = m ? parseInt(m[1], 10) : 10;
    return Math.max(2, Math.min(DATA.trunks.length, n));
  }

  // ---------------------------------------------------------------- 构图参数
  //
  // 全部是相对舞台宽高的比例，改这里就改形。y 越小越靠上（越"远"）。

  var L = {
    badge: { cy: 0.145, rx: 0.135, ry: 0.030 },   // 顶层徽章台
    main:  { cy: 0.455, rx: 0.285, ry: 0.076 },   // 主台
    biz:   { cy: 0.700, rx: 0.235, ry: 0.060 },   // 业务环
    domain:{ cy: 0.815, rx: 0.410, ry: 0.104 },   // 领域环
    // 立牌沿主台弧线排布：跨度 ±105°，中间留 ±30° 给中心装置
    trunkArc: { spanDeg: 105, gapDeg: 30, lift: 0.085 },
    // 近大远小：按屏幕 y 归一化
    scaleNear: 1.0, scaleFar: 0.84
  };

  var stage, layer, hintBox;

  // ---------------------------------------------------------------- 工具

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // 椭圆上的点。θ=0 在正后方（屏幕最上），顺时针为正。
  function onEllipse(cfg, deg) {
    var t = deg * Math.PI / 180;
    return { x: 0.5 + cfg.rx * Math.sin(t), y: cfg.cy - cfg.ry * Math.cos(t) };
  }

  // 在 [-span, span] 内均匀排 n 个角度，中间挖掉 ±gap。
  // 这是「留好位置」的机械实现：n 变了位置自动重排，不用改数字。
  function arcAngles(n, span, gap) {
    var out = [];
    var half = Math.ceil(n / 2);
    var right = n - half;
    function fill(count, from, to, arr) {
      for (var i = 0; i < count; i += 1) {
        var t = count === 1 ? 0.5 : i / (count - 1);
        arr.push(from + (to - from) * t);
      }
    }
    fill(half, -span, -gap, out);
    fill(right, gap, span, out);
    return out;
  }

  function depthScale(y) {
    var top = L.badge.cy, bottom = L.domain.cy;
    var t = Math.max(0, Math.min(1, (y - top) / (bottom - top)));
    return L.scaleFar + (L.scaleNear - L.scaleFar) * t;
  }

  // ---------------------------------------------------------------- 底盘

  function addDisc(cfg, cls) {
    var d = el("div", "disc " + cls);
    d.style.left = "50%";
    d.style.top = (cfg.cy * 100) + "%";
    d.style.width = (cfg.rx * 200) + "%";
    d.style.height = (cfg.ry * 200) + "%";
    layer.appendChild(d);
    return d;
  }

  // 主台向下张开的光锥裙：连接主层与业务层，是"上下两层是一个整体"的视觉纽带
  function addCone() {
    var c = el("div", "cone");
    c.style.left = "50%";
    c.style.top = (L.main.cy * 100) + "%";
    c.style.width = (L.main.rx * 200) + "%";
    c.style.height = ((L.biz.cy - L.main.cy) * 100) + "%";
    layer.appendChild(c);
  }

  // ---------------------------------------------------------------- 各层

  var HINT = {
    trunk:  ["重点任务", "点击进入该任务的技术图谱，可继续下钻到攻关方向 / 技术 / 内容。"],
    biz:    ["业务场景", "点击查看该业务横向覆盖的任务与技术。"],
    domain: ["技术领域", "点击切换到技术领域视角。"],
    center: ["图谱总览", "点击进入十大重点任务全景图谱。"],
    badge:  ["视角入口", "点击切换到对应视角。"]
  };

  function bindHint(node, kind, name, extra) {
    node.addEventListener("mouseenter", function () {
      hintBox.querySelector(".sh-type").textContent = HINT[kind][0];
      hintBox.querySelector(".sh-text").textContent =
        name + (extra ? "（" + extra + "）" : "") + "　—　" + HINT[kind][1];
    });
  }

  function place(node, p, scale) {
    node.style.left = (p.x * 100) + "%";
    node.style.top = (p.y * 100) + "%";
    node.style.setProperty("--s", (scale || 1).toFixed(3));
    node.style.zIndex = String(100 + Math.round(p.y * 1000));
  }

  function buildBadges() {
    var n = DATA.views.length;
    DATA.views.forEach(function (v, i) {
      var deg = n === 1 ? 0 : -68 + (136 / (n - 1)) * i;
      var p = onEllipse(L.badge, deg);
      var b = el("button", "badge");
      b.appendChild(el("span", "badge-ring"));
      b.appendChild(el("span", "badge-text", v.badge));
      b.dataset.go = "graph"; b.dataset.view = v.key;
      place(b, p, 1);
      bindHint(b, "badge", v.badge);
      layer.appendChild(b);
    });
  }

  function buildTrunks() {
    var list = DATA.trunks.slice(0, trunkCount());
    var angles = arcAngles(list.length, L.trunkArc.spanDeg, L.trunkArc.gapDeg);
    list.forEach(function (t, i) {
      var p = onEllipse(L.main, angles[i]);
      p.y -= L.trunkArc.lift;                 // 立牌立在台面上，锚点上抬
      var card = el("button", "trunk");
      card.appendChild(el("span", "trunk-name", t.name));
      card.appendChild(el("span", "trunk-foot"));
      card.dataset.go = "graph"; card.dataset.view = "task"; card.dataset.focus = t.id;
      place(card, p, depthScale(p.y));
      bindHint(card, "trunk", t.name);
      layer.appendChild(card);
    });
  }

  function buildCenter() {
    var c = el("button", "core");
    c.appendChild(el("span", "core-orb"));
    c.appendChild(el("span", "core-ring core-ring--a"));
    c.appendChild(el("span", "core-ring core-ring--b"));
    var label = el("span", "core-label");
    DATA.center.label.split("\n").forEach(function (line) {
      label.appendChild(el("i", null, line));
    });
    c.appendChild(label);
    c.appendChild(el("span", "core-base"));
    c.dataset.go = "graph"; c.dataset.view = DATA.center.view; c.dataset.focus = DATA.center.id;
    place(c, { x: 0.5, y: L.main.cy - 0.055 }, 1);
    c.style.zIndex = "400";
    bindHint(c, "center", DATA.title);
    layer.appendChild(c);

    var s = el("div", "core-stats");
    [[DATA.stats.nodes, "节点"], [DATA.stats.edges, "关系"], [DATA.stats.docs, "文档"]]
      .forEach(function (p) {
        var b = el("div", "cs");
        b.appendChild(el("strong", null, String(p[0])));
        b.appendChild(el("span", null, p[1]));
        s.appendChild(b);
      });
    s.style.left = "50%";
    s.style.top = ((L.main.cy - 0.20) * 100) + "%";
    layer.appendChild(s);
  }

  function buildBusiness() {
    var n = DATA.business.length;
    DATA.business.forEach(function (b, i) {
      var deg = n === 1 ? 180 : 140 + (80 / (n - 1)) * i;   // 前弧，面向观众
      var p = onEllipse(L.biz, deg);
      var node = el("button", "biz");
      node.appendChild(el("span", "biz-name", b.name));
      node.appendChild(el("span", "biz-cone"));
      node.appendChild(el("span", "biz-ring"));
      node.dataset.go = "graph"; node.dataset.view = "business"; node.dataset.focus = b.id;
      place(node, p, 1);
      bindHint(node, "biz", b.name, b.n + " 节点");
      layer.appendChild(node);
    });
    var cap = el("div", "tier-cap", "三大业务");
    cap.style.left = "50%";
    cap.style.top = ((L.biz.cy + L.biz.ry + 0.045) * 100) + "%";
    layer.appendChild(cap);
  }

  function buildDomains() {
    var n = DATA.domains.length;
    DATA.domains.forEach(function (d, i) {
      // 领域沿外环下半圈铺开，避开被主台遮挡的正后方
      var deg = 118 + (124 / (n - 1)) * i;
      var side = i < n / 2 ? -1 : 1;
      var p = onEllipse(L.domain, side < 0 ? -deg : deg);
      var node = el("button", "dom");
      node.appendChild(el("span", "dom-dot"));
      node.appendChild(el("span", "dom-name", d.name));
      node.dataset.go = "graph"; node.dataset.view = "domain"; node.dataset.focus = d.id;
      place(node, p, 1);
      bindHint(node, "domain", d.name);
      layer.appendChild(node);
    });
    var cap = el("div", "tier-cap", "七大技术领域");
    cap.style.left = "50%";
    cap.style.top = ((L.domain.cy + L.domain.ry + 0.030) * 100) + "%";
    layer.appendChild(cap);
  }

  // ---------------------------------------------------------------- 时钟

  var WEEK = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  function tickClock() {
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : String(n); }
    document.getElementById("clockTime").textContent =
      p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    document.getElementById("clockDate").textContent = p(d.getMonth() + 1) + "月" + p(d.getDate()) + "日";
    document.getElementById("clockWeek").textContent = WEEK[d.getDay()];
  }

  // ---------------------------------------------------------------- 启动

  function start() {
    tickClock();
    window.setInterval(tickClock, 1000);

    stage = document.getElementById("stage");
    layer = document.getElementById("stageLayer");
    hintBox = document.getElementById("stageHint");

    // 底盘从下往上加，保证遮挡顺序正确
    addDisc(L.domain, "disc--domain");
    addDisc(L.biz, "disc--biz");
    addCone();
    addDisc(L.main, "disc--main");
    addDisc(L.badge, "disc--badge");

    buildDomains();
    buildBusiness();
    buildTrunks();
    buildCenter();
    buildBadges();

    window.__STAGE__ = {
      ready: true,
      n: trunkCount(),
      counts: {
        trunk: layer.querySelectorAll(".trunk").length,
        biz: layer.querySelectorAll(".biz").length,
        domain: layer.querySelectorAll(".dom").length,
        badge: layer.querySelectorAll(".badge").length
      },
      rects: (function () {
        var out = {};
        layer.querySelectorAll("[data-focus],[data-view]").forEach(function (n, i) {
          var r = n.getBoundingClientRect();
          out[n.dataset.focus || (n.dataset.view + "-" + i)] = {
            left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height
          };
        });
        return out;
      })(),
      stageBox: stage.getBoundingClientRect().toJSON()
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
