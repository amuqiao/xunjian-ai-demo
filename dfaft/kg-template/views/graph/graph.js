/**
 * graph.js —— 关系图谱视图（Canvas 力导向网络）
 * ═══════════════════════════════════════════════════════════════════
 * 视觉与物理参数原封不动来自 views/graph/_origin.html：SIM 的每一个系数、
 * seedLayout 的结构化初始布局、伪 3D 三色阶球体、连线的双层辉光与流光点、
 * 标签四方位避让、固定随机种子——**一律不调参**，原稿解释"为什么这么调"
 * 的注释一并保留。
 *
 * 相对原稿的改造只有四类：
 *   1. 数据来源：GRAPH 常量删掉，改吃 KG.derive.graphProjection()。
 *      投影里的 links.source/target 是 id 字符串，力导向要的是对象引用，
 *      在 buildData() 里一次性解析。
 *   2. 作用域：整份实现包在 IIFE 里，除 KG.views.define 外不碰 window。
 *      原稿的 nodes/links/view/hovered/selected/rgbOf/mix/css/cv/g/W/H/DPR
 *      全部收进闭包——另外两个视图定义了同名全局，泄漏会互相覆盖。
 *   3. 定位：canvas/HUD/面板由 fixed 改 absolute，相对 #view-graph；
 *      画布尺寸取容器 clientWidth/clientHeight；鼠标坐标要减画布 rect 偏移。
 *   4. 让位：fitView 的可视区左边扣掉 --rail-w、上边扣掉 --topbar-h，
 *      右边继续扣详情面板。
 * ═══════════════════════════════════════════════════════════════════
 */
(function (global) {
'use strict';

const KG = global.KG;
if (!KG || !KG.views)  throw new Error('[graph] core/views.js 必须先于 views/graph/graph.js 引入');
if (!KG.derive)        throw new Error('[graph] data/kg-derive.js 必须先于 views/graph/graph.js 引入');
if (!KG.dom)           throw new Error('[graph] core/dom.js 必须先于 views/graph/graph.js 引入');
const UI = KG.derive.ui;

/* 原稿在全局写了 rgbOf / mix / css，三个视图各一份会互相覆盖，
   统一用 core/dom.js 里那份（实现逐字相同），本地只留别名 */
const rgbOf = KG.dom.rgbOf, mix = KG.dom.mix, css = KG.dom.css;

/* ══════════════════════════════════════════════════════════════════
   物理参数 —— 张力长在结构里：靠分层的连边距离把簇撑开铺满全屏
   ══════════════════════════════════════════════════════════════════ */
const SIM = {
  velocityDecay : 0.30,
  alphaDecay    : 0.032,
  alphaIdle     : 0.008,    // 常态不降到 0，网络永远微微游动
  alphaDrag     : 0.34,     // 拖拽升温，整网跟随
  charge        : -230,
  chargeMaxDist : 460,
  linkStrength  : 1.6,
  collidePad    : 11,
  collideStr    : 0.72,
  centerStr     : 0.03,
  radialStr     : 0.35,     // 类目锁在离中枢固定半径处，配合互斥自然摊成均匀环
  catRepel      : 3.4,      // 类目之间额外增强的斥力，把环撑开
  entityStr     : 0.35,     // 实体连边减弱，让它悬在簇之间而不是把类目拽成一团
  aspectX       : 0.006,    // 各向异性收拢：纵向收得比横向紧，
  aspectY       : 0.060,    /*   把布局压成横向比例。再大宽高比还能涨，
                                 但类目环的角度均匀度会开始劣化，0.06 是拐点 */
  dist: { hub:265, entity:150, category:66, other:88 }   // 分层距离，簇的铺开程度由它决定
};

/* 伪 3D 着色：全场共用一个光源方向（左上），不做高光反射 */
const LIGHT = { x:-0.56, y:-0.73 };   // 指向光源的单位向量（屏幕坐标，y 向下）
const SHADE = {
  litMix   : 0.42,   // 受光面向白混合
  darkMix  : 0.68,   // 背光面向场景深蓝混合（不只是压暗，带色相位移才通透）
  rimMix   : 0.62,   // 暗侧边缘光亮度
  rimWidth : 1.7,    // 边缘光线宽（屏幕像素）
  haloAlpha: 0.30,   // 外发光晕强度（深底上投影无效，用光晕代替）
  haloScale: 2.7
};
const LIT_WHITE = [255, 251, 244];
const AMBIENT   = [ 12,  20,  52];   // 场景环境色，暗部向它偏移
const RIM_WHITE = [232, 242, 255];

const RANK = { hub:0, category:1, entity:2, doc:3 };
const FONT = { hub:15, category:13.5, entity:12, doc:11.5 };

/* 图谱里实际会出现的四类节点（投影层的契约），图例按这个顺序排 */
const LEGEND_TYPES = ['hub', 'category', 'doc', 'entity'];

const PANEL_W = 320;                                  // 与 graph.css 的 --g-panel-w 保持一致
const PAN = { dur: 620 };                             // focus() 的平移时长
const RIPPLE = { rings: 3, gap: 250, life: 900 };     // focus() 的三圈涟漪

/* ══════════════════════════════════════════════════════════════════
   闭包状态 —— 原稿的全局变量全部收在这里
   ══════════════════════════════════════════════════════════════════ */
let root = null, cv = null, g = null, panel = null, els = null;
let W = 0, H = 0, DPR = 1;
let fitW = 0, fitH = 0;                 // 上次 fitView 时的画布尺寸
let cvLeft = 0, cvTop = 0;              // 画布相对视口的偏移，鼠标坐标要减掉它
let RAIL = 0, TOPBAR = 0;               // shell 常驻竖栏 / 顶栏尺寸

const view = { k:1, tx:0, ty:0 };
const nodes = [], links = [], nodeById = new Map();

let alpha = 1, alphaTarget = SIM.alphaIdle;
let hovered = null, selected = null, dragNode = null, panning = false, px = 0, py = 0;
const hidden = new Set();
let legendEls = [];
let isolateTimer = 0;

let rafId = 0, running = false;
let panAnim = null, ripple = null;

/* ══════════════════════════════════════════════════════════════════
   数据装配
   ══════════════════════════════════════════════════════════════════ */
function buildData(){
  const P = KG.derive.graphProjection();

  // 固定种子的随机数：布局每次打开都一致，演示时不会这次好看下次难看
  let _seed = 20260815;
  const rnd = ()=>{ _seed = (_seed*1664525 + 1013904223) & 0x7fffffff; return _seed/0x7fffffff; };

  P.nodes.forEach(n=>{
    if(!n.color) throw new Error('[graph] 投影节点「'+n.id+'」没有 color，无法着色');
    if(!RANK.hasOwnProperty(n.type)) throw new Error('[graph] 图谱不认识的节点类型：'+n.type+'（'+n.id+'）');
    nodes.push(Object.assign({}, n, {
      x:0, y:0, vx:0, vy:0, fx:null, fy:null,
      deg:0, neighbors:new Set(), rels:[]
    }));
  });
  nodes.forEach(n=>nodeById.set(n.id,n));

  /* 投影层给的 links 两端是 id 字符串，力导向每帧都要读坐标，
     这里一次性解析成节点对象引用（原稿 addLink 做的事）。
     解析不到直接抛：投影保证两端都在图谱里，解析失败说明数据坏了，
     静默跳过只会变成"图上莫名少一条线"，更难查。
     层级边（收录）投影里已经建好，不再像原稿那样按 parent 补一遍。 */
  P.links.forEach(l=>{
    const s = nodeById.get(l.source), t = nodeById.get(l.target);
    if(!s) throw new Error('[graph] 关系的源节点不在图谱投影里：'+l.source);
    if(!t) throw new Error('[graph] 关系的目标节点不在图谱投影里：'+l.target);
    links.push({ source:s, target:t, rel:l.rel, flow:Math.random(), speed:.0018+Math.random()*.0026 });
    s.deg++; t.deg++;
    s.neighbors.add(t); t.neighbors.add(s);
    s.rels.push({node:t,rel:l.rel}); t.rels.push({node:s,rel:l.rel});
  });

  seedLayout(P, rnd);

  nodes.forEach(n=>{
    const base = n.type==='hub'?30 : n.type==='category'?17 : n.type==='entity'?10.5 : 7;
    n.r = base + Math.sqrt(n.deg) * (n.type==='doc'?1.1:1.9);
    n.charge = SIM.charge * (.5 + n.r/24);
    n.rank = RANK[n.type];
  });
  links.forEach(l=>{
    const s=l.source, t=l.target;
    l.bias = s.deg/(s.deg+t.deg);
    const isEnt = (s.type==='entity'||t.type==='entity');
    l.strength = Math.min(0.85, SIM.linkStrength/Math.min(s.deg,t.deg)) * (isEnt?SIM.entityStr:1);
    l.distance = (s.type==='hub'||t.type==='hub') ? SIM.dist.hub
               : (s.type==='entity'||t.type==='entity') ? SIM.dist.entity
               : (s.type==='category'||t.type==='category') ? SIM.dist.category
               : SIM.dist.other;
    l.major = (s.type==='hub'||t.type==='hub'||s.type==='category'||t.type==='category');
  });

  for(let i=0;i<420;i++) step();

  nodes.forEach(n=>{
    const b = rgbOf(n.color);
    n.cBase = b;
    n.cLit  = mix(b, LIT_WHITE, SHADE.litMix);
    n.cDark = mix(b, AMBIENT,   SHADE.darkMix);
    n.cRim  = mix(b, RIM_WHITE, SHADE.rimMix);
  });
}

/* 结构化初始布局：先把层级摆到大致正确的位置，物理只做微调。
   完全随机起步时，力导向经常发现不了层级结构，陷在局部最优里——
   实测同一组参数会忽好忽坏，类目环时常塌成半边空 */
function seedLayout(P, rnd){
  const R = SIM.dist.hub;
  const cats = P.nodes.filter(n=>n.type==='category').map(n=>nodeById.get(n.id));
  const catAngle = new Map();
  cats.forEach((c,i)=>{
    const a = (i/cats.length)*Math.PI*2 - Math.PI/2 + (rnd()-.5)*0.12;
    catAngle.set(c.id, a);
    c.x = Math.cos(a)*R; c.y = Math.sin(a)*R*0.72;   // 纵向预压，贴合横屏
  });
  // 实体标签落在它所连类目的角度均值上，半径取内圈
  P.nodes.filter(n=>n.type==='entity').forEach(e=>{
    const node = nodeById.get(e.id);
    const conn = P.links.filter(l=>l.source===e.id||l.target===e.id)
      .map(l=> l.source===e.id?l.target:l.source).filter(id=>catAngle.has(id));
    let vx=0, vy=0;
    conn.forEach(id=>{ vx+=Math.cos(catAngle.get(id)); vy+=Math.sin(catAngle.get(id)); });
    const a = (conn.length && (vx||vy)) ? Math.atan2(vy,vx) : rnd()*Math.PI*2;
    const rr = R*0.58;
    node.x = Math.cos(a)*rr + (rnd()-.5)*40;
    node.y = Math.sin(a)*rr*0.72 + (rnd()-.5)*30;
  });
  // 文档扇形展开在所属类目的外侧
  const perCat = {};
  P.nodes.filter(n=>n.type==='doc').forEach(d=>{ (perCat[d.parent] ||= []).push(d); });
  Object.entries(perCat).forEach(([cid, list])=>{
    const a0 = catAngle.get(cid) ?? 0;
    list.forEach((d,i)=>{
      const spread = (i - (list.length-1)/2) * 0.42;
      const a = a0 + spread;
      const node = nodeById.get(d.id);
      node.x = Math.cos(a)*(R+95) + (rnd()-.5)*20;
      node.y = Math.sin(a)*(R+95)*0.72 + (rnd()-.5)*20;
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   力导向求解（速度 Verlet，结构同 d3-force）
   ══════════════════════════════════════════════════════════════════ */
function forceLink(a){
  for(const l of links){
    const s=l.source,t=l.target;
    let dx=t.x+t.vx-s.x-s.vx, dy=t.y+t.vy-s.y-s.vy;
    const d=Math.hypot(dx,dy)||1e-6, k=(d-l.distance)/d*a*l.strength;
    dx*=k; dy*=k;
    t.vx-=dx*l.bias;     t.vy-=dy*l.bias;
    s.vx+=dx*(1-l.bias); s.vy+=dy*(1-l.bias);
  }
}
function forceCharge(a){
  const M2=SIM.chargeMaxDist**2;
  for(let i=0;i<nodes.length;i++){
    const p=nodes[i];
    for(let j=i+1;j<nodes.length;j++){
      const q=nodes[j];
      let dx=q.x-p.x, dy=q.y-p.y, d2=dx*dx+dy*dy;
      if(d2<1){ dx=Math.random()-.5; dy=Math.random()-.5; d2=dx*dx+dy*dy||1; }
      if(d2>M2) continue;
      // 类目之间额外加斥力，否则实体标签会把八个类目拽成一堆
      const boost = (p.type==='category'&&q.type==='category') ? SIM.catRepel : 1;
      const wq=q.charge*boost*a/d2, wp=p.charge*boost*a/d2;
      p.vx+=dx*wq; p.vy+=dy*wq;
      q.vx-=dx*wp; q.vy-=dy*wp;
    }
  }
}
function forceCollide(){
  for(let i=0;i<nodes.length;i++){
    const p=nodes[i];
    for(let j=i+1;j<nodes.length;j++){
      const q=nodes[j];
      const rs=p.r+q.r+SIM.collidePad;
      const dx=q.x+q.vx-p.x-p.vx, dy=q.y+q.vy-p.y-p.vy, d2=dx*dx+dy*dy;
      if(d2>=rs*rs||d2===0) continue;
      const d=Math.sqrt(d2)||1e-6, f=(rs-d)/d*SIM.collideStr;
      const mp=p.r*p.r, mq=q.r*q.r, mt=mp+mq;
      q.vx+=dx*f*(mp/mt); q.vy+=dy*f*(mp/mt);
      p.vx-=dx*f*(mq/mt); p.vy-=dy*f*(mq/mt);
    }
  }
}
/* 类目锁定在离中枢的固定半径上。半径固定 + 互相排斥 →
   它们会自己在圆周上摊匀，这是均匀辐射扇形的来源 */
function forceRadial(a){
  const hub=nodes.find(n=>n.type==='hub');
  if(!hub) return;
  for(const n of nodes){
    if(n.type!=='category') continue;
    const dx=n.x-hub.x, dy=n.y-hub.y, r=Math.hypot(dx,dy)||1e-6;
    const k=(SIM.dist.hub-r)*SIM.radialStr*a/r;
    n.vx+=dx*k; n.vy+=dy*k;
  }
}
/* 各向异性收拢：纵向拉得比横向紧，把布局压成横向比例贴合 16:9 */
function forceAspect(a){
  for(const n of nodes){
    n.vx -= n.x*SIM.aspectX*a;
    n.vy -= n.y*SIM.aspectY*a;
  }
}
function forceCenter(){
  let sx=0,sy=0;
  for(const n of nodes){ sx+=n.x; sy+=n.y; }
  sx=sx/nodes.length*SIM.centerStr; sy=sy/nodes.length*SIM.centerStr;
  for(const n of nodes){ n.x-=sx; n.y-=sy; }
}
function step(){
  alpha += (alphaTarget-alpha)*SIM.alphaDecay;
  forceLink(alpha); forceCharge(alpha); forceRadial(alpha); forceAspect(alpha); forceCollide(); forceCenter();
  for(const n of nodes){
    if(n.fx!==null){ n.x=n.fx; n.vx=0; } else { n.vx*=SIM.velocityDecay; n.x+=n.vx; }
    if(n.fy!==null){ n.y=n.fy; n.vy=0; } else { n.vy*=SIM.velocityDecay; n.y+=n.vy; }
  }
}

/* ══════════════════════════════════════════════════════════════════
   画布与视口
   ══════════════════════════════════════════════════════════════════ */
/* shell 的竖栏/顶栏尺寸写在 tokens.css 里，视图读变量而不是硬编码 86/62 */
function readShellInset(){
  const s = getComputedStyle(document.documentElement);
  RAIL   = parseFloat(s.getPropertyValue('--rail-w'));
  TOPBAR = parseFloat(s.getPropertyValue('--topbar-h'));
  if(!isFinite(RAIL) || !isFinite(TOPBAR)){
    throw new Error('[graph] tokens.css 里没读到 --rail-w / --topbar-h，视图无法给 shell 让位');
  }
}

function resize(){
  DPR=Math.min(devicePixelRatio||1,2);
  W=root.clientWidth; H=root.clientHeight;      // 画布不再铺满视口，尺寸取容器
  cv.width=W*DPR; cv.height=H*DPR;
  cv.style.width=W+'px'; cv.style.height=H+'px';
  syncRect();
}
/* 画布左上角在视口里的位置。鼠标事件给的是 clientX/Y，命中检测要用画布内坐标，
   这一步漏掉就是整体偏移（原稿画布铺满视口，偏移恒为 0，所以没有这段） */
function syncRect(){
  const r=cv.getBoundingClientRect();
  cvLeft=r.left; cvTop=r.top;
}

/* 可视区：左边让开常驻竖栏，上边让开顶栏，右边让开详情面板 */
function stageBox(){
  const x0 = RAIL, x1 = W-(W>1000?PANEL_W:0);
  return { x0:x0, y0:TOPBAR, w:x1-x0, h:H-TOPBAR };
}
function fitView(pad=110){
  let a=1e9,b=1e9,c=-1e9,d=-1e9;
  for(const n of nodes){ a=Math.min(a,n.x-n.r); c=Math.max(c,n.x+n.r);
                         b=Math.min(b,n.y-n.r); d=Math.max(d,n.y+n.r); }
  const box=stageBox();
  view.k=Math.min(1.25, Math.min((box.w-pad*2)/(c-a),(box.h-pad*2)/(d-b)));
  view.tx=box.x0+box.w/2-(a+c)/2*view.k;
  view.ty=box.y0+box.h/2-(b+d)/2*view.k;
  fitW=W; fitH=H;
}
const toGraph=(sx,sy)=>({x:(sx-view.tx)/view.k, y:(sy-view.ty)/view.k});
const toScreen=n=>({x:n.x*view.k+view.tx, y:n.y*view.k+view.ty});

const visible=n=>!hidden.has(n.type);
const neighborhood=n=> n ? new Set([n,...n.neighbors]) : null;

/* ══════════════════════════════════════════════════════════════════
   绘制
   ══════════════════════════════════════════════════════════════════ */
function ctrl(l){
  const dx=l.target.x-l.source.x, dy=l.target.y-l.source.y;
  return { x:(l.source.x+l.target.x)/2 - dy*0.075,
           y:(l.source.y+l.target.y)/2 + dx*0.075 };
}
function bez(l,t){
  const c=ctrl(l), u=1-t;
  return { x:u*u*l.source.x+2*u*t*c.x+t*t*l.target.x,
           y:u*u*l.source.y+2*u*t*c.y+t*t*l.target.y };
}

function drawSphere(n, focusAmt, dim){
  const r = n.r * (1 + focusAmt*0.09);
  const a = dim;

  // 外发光晕：纯深色背景上投影无效，光晕才是有效的空间线索
  const hr = r*SHADE.haloScale;
  const hg = g.createRadialGradient(n.x,n.y,r*0.55, n.x,n.y,hr);
  hg.addColorStop(0, css(n.cBase, SHADE.haloAlpha*a*(1+focusAmt*1.1)));
  hg.addColorStop(0.45, css(n.cBase, SHADE.haloAlpha*0.28*a));
  hg.addColorStop(1, css(n.cBase, 0));
  g.globalCompositeOperation='lighter';
  g.beginPath(); g.arc(n.x,n.y,hr,0,7); g.fillStyle=hg; g.fill();
  g.globalCompositeOperation='source-over';

  // 球体：受光点偏向光源，向背光侧过渡到环境色
  const bg = g.createRadialGradient(
    n.x + LIGHT.x*r*0.46, n.y + LIGHT.y*r*0.46, r*0.06,
    n.x, n.y, r*1.02);
  bg.addColorStop(0,    css(n.cLit,  a));
  bg.addColorStop(0.38, css(mix(n.cBase, n.cLit, 0.35), a));
  bg.addColorStop(0.72, css(n.cBase, a));
  bg.addColorStop(1,    css(n.cDark, a));
  g.beginPath(); g.arc(n.x,n.y,r,0,7); g.fillStyle=bg; g.fill();

  /* 暗侧边缘光：背光那一侧的一道细亮弧。
     没有它，暗面会直接融进背景，球就塌成半圆——
     这是伪 3D 成立与否的关键一笔 */
  const rg = g.createLinearGradient(
    n.x + LIGHT.x*r, n.y + LIGHT.y*r,
    n.x - LIGHT.x*r, n.y - LIGHT.y*r);
  rg.addColorStop(0,    css(n.cRim, 0));
  rg.addColorStop(0.42, css(n.cRim, 0));
  rg.addColorStop(1,    css(n.cRim, a*(0.72+focusAmt*0.28)));
  g.beginPath();
  g.arc(n.x, n.y, r - SHADE.rimWidth/(2*view.k), 0, 7);
  g.strokeStyle=rg; g.lineWidth=SHADE.rimWidth/view.k; g.stroke();
}

/* focus() 的三圈涟漪：跨视图跳进来时告诉用户"落点在这儿" */
function drawRipple(now){
  if(!ripple) return;
  const n=ripple.node;
  if(!visible(n)){ ripple=null; return; }
  let alive=false;
  g.globalCompositeOperation='lighter';
  for(let i=0;i<RIPPLE.rings;i++){
    const p=(now-ripple.t0-i*RIPPLE.gap)/RIPPLE.life;
    if(p>1) continue;
    alive=true;
    if(p<0) continue;
    g.beginPath();
    g.arc(n.x, n.y, n.r*(1+p*2.1), 0, 7);
    g.strokeStyle=css(n.cRim, (1-p)*0.5);
    g.lineWidth=2.2*(1-p*0.5)/view.k;
    g.stroke();
  }
  g.globalCompositeOperation='source-over';
  if(!alive) ripple=null;
}

function draw(now){
  g.setTransform(DPR,0,0,DPR,0,0);
  g.clearRect(0,0,W,H);
  g.setTransform(DPR*view.k,0,0,DPR*view.k, DPR*view.tx, DPR*view.ty);

  const focus = neighborhood(hovered||selected);

  /* 连线：细，但发光、带弧度、有光点流动 */
  g.globalCompositeOperation='lighter';
  for(const l of links){
    if(!visible(l.source)||!visible(l.target)) continue;
    const on = !focus || (focus.has(l.source)&&focus.has(l.target));
    const c = ctrl(l);
    const grd=g.createLinearGradient(l.source.x,l.source.y,l.target.x,l.target.y);
    const base = on ? (l.major?.55:.34) : .05;
    grd.addColorStop(0, css(l.source.cBase, base));
    grd.addColorStop(1, css(l.target.cBase, base*0.75));

    g.beginPath();
    g.moveTo(l.source.x,l.source.y);
    g.quadraticCurveTo(c.x,c.y,l.target.x,l.target.y);
    // 外圈辉光（宽而淡）+ 内芯（细而亮），比 shadowBlur 便宜也更可控
    g.strokeStyle=grd; g.lineWidth=(on?3.4:1.6)/view.k;
    g.globalAlpha=0.34; g.stroke();
    g.globalAlpha=1;
    g.lineWidth=((on?1.35:0.8)*(l.major?1.25:1))/view.k;
    g.stroke();

    l.flow += l.speed*(on?2.4:1);
    if(l.flow>1) l.flow-=1;
    const p=bez(l,l.flow);
    g.beginPath();
    g.arc(p.x,p.y,(on?2.3:1.35)/view.k,0,7);
    g.fillStyle=css(l.target.cRim, on?.95:.22);
    g.fill();
  }
  g.globalCompositeOperation='source-over';

  /* 节点：小的先画，大的压在上面 */
  const order=[...nodes].filter(visible).sort((a,b)=>b.rank-a.rank);
  for(const n of order){
    const on = !focus || focus.has(n);
    const isF = (hovered===n||selected===n);
    drawSphere(n, isF?1:0, on?1:0.17);
    n._sr = n.r*(1+(isF?1:0)*0.09)*view.k;
  }
  drawRipple(now);

  g.setTransform(DPR,0,0,DPR,0,0);
  drawLabels(focus);
}

/* ── 标签避让 ──────────────────────────────────────
   参考图的标签在密集区糊成一片，近看是失败的。
   按重要度排序逐个尝试四个方位，全撞车就不画——
   宁可少几个标签，也不要一堆叠在一起的字。 */
function drawLabels(focus){
  const placed=[];
  const hit=(r)=>placed.some(o=>!(r.x2<o.x1-3||r.x1>o.x2+3||r.y2<o.y1-3||r.y1>o.y2+3));

  // 节点本体先占位，避免文字压在球上
  for(const n of nodes){
    if(!visible(n) || n.type==='doc') continue;
    const s=toScreen(n), rr=(n._sr||n.r*view.k);
    placed.push({x1:s.x-rr,y1:s.y-rr,x2:s.x+rr,y2:s.y+rr});
  }

  const cand=[...nodes].filter(n=>{
    if(!visible(n)) return false;
    const isF=(hovered===n||selected===n);
    if(n.type==='hub'||n.type==='category') return true;
    if(isF||(focus&&focus.has(n))) return true;
    if(n.type==='entity') return view.k>0.62;
    return view.k>1.08;
  }).sort((a,b)=> a.rank-b.rank || b.deg-a.deg);

  for(const n of cand){
    const s=toScreen(n);
    if(s.x<-80||s.x>W+80||s.y<-40||s.y>H+40) continue;
    const on = !focus||focus.has(n);
    const isF=(hovered===n||selected===n);
    const fs=FONT[n.type];
    g.font=`${n.type==='doc'?400:600} ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
    const tw=g.measureText(n.label).width, th=fs*1.15;
    const rr=(n._sr||n.r*view.k)+6;

    // 四个候选方位：下 / 上 / 右 / 左
    const opts=[
      {x:s.x,        y:s.y+rr,        al:'center', bl:'top'},
      {x:s.x,        y:s.y-rr-th,     al:'center', bl:'top'},
      {x:s.x+rr+4,   y:s.y-th/2,      al:'left',   bl:'top'},
      {x:s.x-rr-4,   y:s.y-th/2,      al:'right',  bl:'top'}
    ];
    let put=null;
    for(const o of opts){
      const x1 = o.al==='center'? o.x-tw/2 : o.al==='left'? o.x : o.x-tw;
      const r={x1, y1:o.y, x2:x1+tw, y2:o.y+th};
      if(!hit(r)){ put=o; placed.push(r); break; }
    }
    if(!put) continue;

    g.textAlign=put.al; g.textBaseline=put.bl;
    g.lineWidth=3.4; g.strokeStyle='rgba(5,6,15,.92)';
    g.strokeText(n.label, put.x, put.y);
    g.fillStyle = isF ? '#fff'
                : on ? (n.type==='doc'?'rgba(190,206,250,.76)':'rgba(224,234,255,.94)')
                     : 'rgba(150,172,225,.13)';
    g.fillText(n.label, put.x, put.y);
  }
}

/* focus() 的平移：目标随节点漂移逐帧重算——物理没停，
   锁死目标会在收尾几帧看出偏移。缩放不动，只改 tx/ty */
function stepPan(now){
  if(!panAnim) return;
  const p=Math.min(1,(now-panAnim.t0)/PAN.dur);
  const e=1-Math.pow(1-p,3);
  const n=panAnim.node;
  const tx1=panAnim.cx-n.x*view.k, ty1=panAnim.cy-n.y*view.k;
  view.tx=panAnim.tx0+(tx1-panAnim.tx0)*e;
  view.ty=panAnim.ty0+(ty1-panAnim.ty0)*e;
  if(p>=1) panAnim=null;
}

/* ── 帧循环 ────────────────────────────────────────
   pause() 之后必须真的不画：三套渲染循环同时跑会明显掉帧。
   标志位 + cancelAnimationFrame 双保险，loop 入口再判一次，
   保证已经排队的那一帧也不会 step()/draw() */
function loop(ts){
  if(!running) return;
  rafId=requestAnimationFrame(loop);
  stepPan(ts); step(); draw(ts);
}

/* ══════════════════════════════════════════════════════════════════
   命中检测与交互（坐标一律先减去画布 rect 偏移）
   ══════════════════════════════════════════════════════════════════ */
const evX=e=>e.clientX-cvLeft;
const evY=e=>e.clientY-cvTop;

function pick(sx,sy){
  const p=toGraph(sx,sy);
  let best=null,bd=Infinity;
  for(const n of nodes){
    if(!visible(n)) continue;
    const d=Math.hypot(n.x-p.x,n.y-p.y);
    if(d<n.r+7 && d<bd){ bd=d; best=n; }
  }
  return best;
}

function bindCanvas(){
  cv.addEventListener('pointermove',e=>{
    if(dragNode){ const p=toGraph(evX(e),evY(e)); dragNode.fx=p.x; dragNode.fy=p.y; return; }
    if(panning){ view.tx+=evX(e)-px; view.ty+=evY(e)-py; px=evX(e); py=evY(e); return; }
    const h=pick(evX(e),evY(e));
    if(h!==hovered){ hovered=h; cv.classList.toggle('g-on-node',!!h); }
  });
  cv.addEventListener('pointerdown',e=>{
    syncRect();                 // 拖拽/平移的每一步都基于它，按下时刷新一次最稳
    panAnim=null;               // 用户接管视野，focus 的平移立刻让位
    const n=pick(evX(e),evY(e));
    cv.setPointerCapture(e.pointerId);
    if(n){ dragNode=n; n.fx=n.x; n.fy=n.y; alphaTarget=SIM.alphaDrag; }
    else { panning=true; px=evX(e); py=evY(e); cv.classList.add('g-dragging'); }
  });
  cv.addEventListener('pointerup',e=>{
    if(dragNode){
      const moved=Math.hypot(dragNode.x-dragNode.fx, dragNode.y-dragNode.fy);
      dragNode.fx=dragNode.fy=null; alphaTarget=SIM.alphaIdle;
      if(moved<2) selectNode(dragNode);
      dragNode=null;
    } else if(panning){
      panning=false; cv.classList.remove('g-dragging');
      if(Math.hypot(evX(e)-px,evY(e)-py)<3) selectNode(null);
    }
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    panAnim=null;
    const sx=evX(e), sy=evY(e);
    const p=toGraph(sx,sy);
    const k=Math.max(.35,Math.min(3.2,view.k*Math.pow(0.999,e.deltaY)));
    view.tx=sx-p.x*k; view.ty=sy-p.y*k; view.k=k;
  },{passive:false});
}

/* ══════════════════════════════════════════════════════════════════
   详情面板
   ══════════════════════════════════════════════════════════════════ */
function selectNode(n){
  selected=n;
  if(!n){ panel.classList.remove('g-open'); return; }

  els.pType.textContent=KG.derive.types[n.type].label;
  els.pType.style.color=n.color;
  els.pName.textContent=n.label;

  // 投影给的归属路径，替代原稿那句"归属于「X」的文档条目"
  els.pPath.textContent = n.path || '';
  els.pPath.style.display = n.path ? 'block' : 'none';
  els.pDesc.textContent = n.desc || '';
  els.pDesc.style.display = n.desc ? 'block' : 'none';

  els.pDeg.textContent=n.deg;
  els.pDocs.textContent=n.docs||'—';   // 文档量只有中枢与类目有，其余显示破折号

  const groups={};
  n.rels.forEach(r=>{ (groups[r.rel] ||= []).push(r.node); });
  els.pBody.innerHTML=Object.entries(groups).map(([rel,list])=>`
    <div class="g-rel-group"><div class="g-rel-title">${rel} · ${list.length}</div>
    ${list.map(t=>`<div class="g-rel-item" data-id="${t.id}">
      <span class="g-rel-dot" style="background:${t.color};box-shadow:0 0 9px ${t.color}"></span>
      <span>${t.label}</span></div>`).join('')}</div>`).join('');
  els.pBody.querySelectorAll('.g-rel-item').forEach(el=>{
    el.onclick=()=>selectNode(nodeById.get(el.dataset.id));
  });

  panel.classList.add('g-open');
}

/* ══════════════════════════════════════════════════════════════════
   图例
   ══════════════════════════════════════════════════════════════════ */
/* types.category.color 是树视图按深度着色用的层级色，图谱里每个类目自带一个色，
   所以图例的类目色块取全部类目色的均值当代表色 */
function legendColor(key){
  if(key!=='category') return KG.derive.types[key].color;
  const cats=nodes.filter(n=>n.type==='category');
  if(!cats.length) throw new Error('[graph] 图例要给类目取代表色，但图谱里一个类目节点都没有');
  const sum=cats.reduce((acc,n)=>{
    const c=rgbOf(n.color);
    return [acc[0]+c[0], acc[1]+c[1], acc[2]+c[2]];
  },[0,0,0]);
  return 'rgb('+Math.round(sum[0]/cats.length)+','+
                Math.round(sum[1]/cats.length)+','+
                Math.round(sum[2]/cats.length)+')';
}

function buildLegend(box){
  const types=KG.derive.types;
  legendEls=LEGEND_TYPES
    .filter(key=>nodes.some(n=>n.type===key))   // 只留图谱里真出现的类型
    .map(key=>{
      const color=legendColor(key);
      const el=document.createElement('div');
      el.className='g-lg-item';
      el.dataset.type=key;
      el.innerHTML=`<span class="g-lg-dot" style="background:${color};box-shadow:0 0 11px ${color}"></span><span>${types[key].label}</span>`;
      el.onclick=()=>{
        hidden.has(key)?hidden.delete(key):hidden.add(key);
        el.classList.toggle('g-off',hidden.has(key));
        heatUp();
      };
      box.appendChild(el);
      return el;
    });
}
/* 隔离/恢复后升一点温，让网络重新摊开再降回常态 */
function heatUp(){
  alphaTarget=0.22;
  clearTimeout(isolateTimer);
  isolateTimer=setTimeout(()=>{ alphaTarget=SIM.alphaIdle; },900);
}

/* ══════════════════════════════════════════════════════════════════
   契约实现
   ══════════════════════════════════════════════════════════════════ */
const TPL = `
<canvas class="g-cv"></canvas>

<div class="g-hud">
  <div class="g-stats">
    <div class="g-stat"><div class="g-k">节点</div><div class="g-v" data-r="sNodes">0</div></div>
    <div class="g-stat"><div class="g-k">关系</div><div class="g-v" data-r="sLinks">0</div></div>
    <div class="g-stat"><div class="g-k">平均度</div><div class="g-v" data-r="sDeg">0</div></div>
  </div>
  <div class="g-legend">
    <div class="g-lbl">节点类型 · 点击隔离</div>
    <div data-r="legendItems"></div>
  </div>
  <div class="g-hint">
    拖拽节点 — 整网跟随　悬停 — 高亮邻域<br>
    点击 — 展开详情　滚轮 — 缩放
  </div>
</div>

<div class="g-panel" data-r="panel">
  <div class="g-p-head">
    <button class="g-p-close" data-r="pClose">×</button>
    <div class="g-p-type" data-r="pType"></div>
    <div class="g-p-name" data-r="pName"></div>
    <div class="g-p-path" data-r="pPath"></div>
    <div class="g-p-desc" data-r="pDesc"></div>
    <div class="g-p-metrics">
      <div><span class="g-mk">${UI.graph.degreeLabel}</span><span class="g-mv" data-r="pDeg">0</span></div>
      <div><span class="g-mk">${UI.graph.totalLabel}</span><span class="g-mv" data-r="pDocs">—</span></div>
    </div>
  </div>
  <div class="g-p-body" data-r="pBody"></div>
  <div class="g-p-foot">
    <button class="g-jump" data-r="jump">${UI.graph.jumpToTree}<span class="g-arrow">→</span></button>
  </div>
</div>`;

function mount(el){
  root=el;
  root.innerHTML=TPL;

  els={};
  KG.dom.$$('[data-r]',root).forEach(n=>{ els[n.dataset.r]=n; });
  cv=KG.dom.$('.g-cv',root);
  g=cv.getContext('2d');
  panel=els.panel;

  readShellInset();
  buildData();
  buildLegend(els.legendItems);
  bindCanvas();

  els.pClose.onclick=()=>selectNode(null);

  /* 跨视图入口：只发事件，跳去哪个视图由 app.js 决定 */
  els.jump.onclick=()=>{
    if(!selected) throw new Error('[graph] 详情面板没有选中节点却触发了跳转');
    KG.bus.emit('node:open', { id:selected.id, view:'graph', from:locate(selected.id) });
  };

  els.sNodes.textContent=nodes.length;
  els.sLinks.textContent=links.length;
  els.sDeg.textContent=(2*links.length/nodes.length).toFixed(1);

  global.addEventListener('resize',()=>{ resize(); fitView(); });
  resize(); fitView();
}

function activate(opt){
  resize();                                     // 容器尺寸可能在隐藏期间变过
  if(W!==fitW||H!==fitH) fitView();
  if(opt && opt.focusId) focus(opt.focusId);
}

function deactivate(){
  if(dragNode){ dragNode.fx=dragNode.fy=null; dragNode=null; }
  panning=false; hovered=null; panAnim=null; ripple=null;
  alphaTarget=SIM.alphaIdle;
  cv.classList.remove('g-on-node','g-dragging');
}

function focus(id){
  const n=nodeById.get(id);
  if(!n) throw new Error('[graph] focus 收到图谱里不存在的节点：'+id);
  selectNode(n);
  const box=stageBox();
  const now=performance.now();
  panAnim={ node:n, t0:now, tx0:view.tx, ty0:view.ty,
            cx:box.x0+box.w/2, cy:box.y0+box.h/2 };   // 缩放不动，只平移到可视区中心
  ripple={ node:n, t0:now };
}

function locate(id){
  const n=nodeById.get(id);
  if(!n) return null;          // 不在图谱投影里
  if(!visible(n)) return null;  // 被图例隐藏
  const r=cv.getBoundingClientRect();
  const s=toScreen(n);
  const rr=(n._sr||n.r*view.k);
  return {
    x:r.left+s.x-rr, y:r.top+s.y-rr,
    w:rr*2, h:rr*2,
    color:n.color, label:n.label
  };
}

/* rail 的「重置视野」：回到全景态 */
function reset(){
  selectNode(null);
  hovered=null; panAnim=null; ripple=null;
  hidden.clear();
  legendEls.forEach(el=>el.classList.remove('g-off'));
  resize();
  fitView();
  heatUp();
}

function pause(){
  running=false;
  if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
}
function resume(){
  if(running) return;
  running=true;
  rafId=requestAnimationFrame(loop);
}

KG.views.define('graph', {
  el: '#view-graph',
  mount: mount,
  activate: activate,
  deactivate: deactivate,
  focus: focus,
  locate: locate,
  reset: reset,
  pause: pause,
  resume: resume
});

})(typeof window !== 'undefined' ? window : this);
