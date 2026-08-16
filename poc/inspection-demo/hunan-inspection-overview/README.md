# 湖南省油气管网大屏总览 · 巡检站总览（hunan-inspection-overview）

这是一个纯前端、零构建的 3D 大屏 demo：湖南省全域油气管道站场/阀室巡检态势，
覆盖 **全量 217 个节点**（站场 66 + 阀室 151，24 条管道，天然气 + 成品油都算）。
姐妹 POC `poc/hunan-pump-overview` 只看成品油 44 个节点，两者刻意互不耦合、
各持完整副本，运行时零共享。

## 怎么打开

双击 `index.html`（或用浏览器直接打开 `file://.../hunan-inspection-overview/index.html`），
不需要启动任何本地服务器、不需要构建。全程零 `fetch`，纯 `<script>` 标签按顺序加载。

推荐用支持 WebGL2 的现代浏览器（Chrome/Edge/Safari 最新版）。窗口大小变化时页面
会按固定设计画布（2471×1289）整体等比缩放，不会重新排版。

## 怎么玩

- 省域视图：中间 3D 地图显示 14 个市的挤出块（全省统一深蓝 + 青色顶面描边 +
  侧面上下渐变，配色见下方「地图配色」一节）+
  10 个作业区标签热点。
- 点击左栏"作业区排名"表格的某一行，或点击地图上的作业区标签，下钻进入该作业区：
  相机推进、右栏切换成该作业区的站点清单 + 站点详情卡。
- 底部条"‹ 返回全省"按钮或面包屑"湖南省"文字可以回到省域视图。
- 底部条"管道显示/隐藏"只在省域态生效（原因见下方"渲染预算"一节）。
- 右下角 `+`/`−`/`⟲` 分别是缩放和重置视角。

## 文件结构

```
index.html                     唯一入口，串联全部 <script>/<link>（L0 vendor 到 L7 引导）
scripts/
  map3d/contract.js            L1 契约：14 市/10 作业区 id 空间、DOM 命名、断言（只读，未改）
  map3d/model-map.js           3D model 之一：14 市 ExtrudeGeometry 挤出块 + 统一配色 + 顶面描边
  map3d/model-sites.js         3D model 之二：站点光柱（3 个 InstancedMesh，按状态分组）
  map3d/model-pipelines.js     3D model 之三：管道 Tube；同时是三份 model 的装配入口
                                （window.HunanMapModel，engine.js 唯一认识的两函数契约）
  map3d/engine.js              L3 3D 引擎（只读，未改，已通过探针验收）
  data/geo.js                  14 市行政边界（世界坐标，只读，未改）
  data/topology.js             24 条管道 / 217 节点拓扑（只读，未改）
  data/sites.js                217 个站点的坐标/状态/作业区归属（只读，未改）
  data/series.js               图表数据源，聚合自 topology.js + sites.js（只读，未改）
  core/chartopts.js            纯函数：把 HunanSeries 的数据转 ECharts option
  core/{dom,charts,timers,screen-scale}.js   L4 基础设施（只读，未改）
  ui/{cards,selectlist,detailcard,overlay}.js  L5 UI 组件（只读，未改）
  scenes/overview.js           L6 唯一场景：顶栏/底栏/左栏 4 卡/3D 地图/右栏 3 图+下钻区
  boot.js                      L7 引导：存在性断言 + render 管线 + 事件委托 + 状态写入口
styles/01~04                   基础 token/外壳/卡片/图表样式（只读，未改）
styles/05-hunan3d.css          3D 宿主契约样式（本轮新增）
styles/06-overview-scene.css   三列场景骨架（本轮新增）
verify/verify_overview.js      Playwright 验收脚本（node verify/verify_overview.js）
```

## 地图配色

3D 地图的色值取自甲方给的参考大屏工程导出
`assets/.data/历届参赛作品/NB-Map2026814124352.json`（那是另一套 3D 地图组件的配置
存档，不是可直接替换的地图数据——它的几何是 SVG path + 2D 屏幕坐标，与本项目
`data/geo.js` 的世界坐标不同源，只取色值）：

| 部位 | 色值 | 参考工程字段 |
|---|---|---|
| 挤出块顶面 | `#0d50b5` | `mapColor` |
| 挤出块侧面（底 → 顶） | `#1d2d3d` → `#006793` | `mapSideColor` / `mapSideEndColor` |
| 顶面描边 | `#6becf5` | `outerLine.lineColor` |

三处都写在 `scripts/map3d/model-map.js` 顶部的常量里（`MAP_COLOR` /
`SIDE_COLOR_BOTTOM` / `SIDE_COLOR_TOP` / `OUTLINE_COLOR`）。

**两条要如实记录的取舍：**

1. **14 市不再按作业区分色。** 改配色前，每个市染的是源表图例色
   （`topology.js` 的 `zones[].rgb`，黄/淡蓝/银灰等粉彩色）；现在全省统一深蓝，
   作业区归属只剩两处表达：地图上的作业区标签，以及点击后的青色选中高亮。
   静态画面上确实看不出作业区边界了，这是刻意的取舍不是遗漏。
2. **描边只有 1px，参考工程是 3px。** WebGL 把 `LineBasicMaterial.linewidth`
   钳死在 1，画粗线要用 Line2/LineMaterial，而本项目的 three r160 UMD 构建里没有
   Line2。改用 TubeGeometry 描边能做粗，但 14 市抽稀后仍有 4549 个顶点，铺成管子
   会额外吃掉数万三角形，触碰 `triangles < 260000` 的护栏。

另外，本 POC 的 `model-map.js` 因这次改配色已与姐妹 POC `poc/hunan-pump-overview`
的同名文件**分叉**（后者仍是作业区图例色），两份文件不再互为副本，同步改动时不能
再直接对拷。面板/卡片/图表的 CSS 与 `01-tokens.css` 的变量取值本轮**未改动**，
跨 POC 的 token 契约保持完好。

## 数据来源

- 拓扑与作业区归属：《湖南公司油气管道站场阀室作业区位置关系图20260211_1(1).xls》
  （版本 V3-20260119）。
- 14 市行政边界：阿里 DataV.GeoAtlas 公开边界服务（`assets/geo/hunan-430000-full.geojson`）。
- 9 个成品油站场的实测坐标：《国家管网湖南成品油管道线路全图》（长郴管道走向全图）；
  其余 208 个天然气站场/阀室坐标是按"所属作业区市域 + 螺旋散布"插值出的示意坐标
  （站点数据的 `coordSource` 字段区分 `surveyed`/`approx`，不要把插值坐标当测绘成果）。

## 三条必须如实记录的口径（演示被问到时可查）

1. **郴州与湘西作业区在源表图例里同色**：两者的 RGB 都是 `[153,153,255]`
   （`scripts/data/topology.js` 的 `zones[].rgb` 字段可直接核对），源表图例本身无法
   靠颜色区分这两个作业区，实际归属是靠管道名（比如"桂阳-郴州-资兴输气管道"）人工
   消歧出来的。
2. **图例的长沙/永郴色块在表体从未使用**：源表图例列出的颜色并不是每一种都在数据
   表体真的出现过，长沙、永郴两个作业区在表体节点行上的实际映射是按节点语义
   （站名/管道上下文）确定的，不是单纯"图例给了什么颜色就照抄"。
3. **四条「XX座站场」批注与逐列实际计数不符**（已用 `scripts/data/topology.js` 核实）：

   | 管道 | 批注站场数 | 逐列实际站场数 |
   |---|---|---|
   | 忠武线潜湘支线 | 10 | 5 |
   | 潜江-韶关输气管道 | 13 | 11 |
   | 兰郑长管道 | 5 | 4 |
   | 长郴管道 | 11 | 8 |

   其中**长郴管道**那条已查明具体原因：批注的 11 座 = 长郴管道干线本身 8 座
   （长岭站/七里山站/汨罗站/长沙站/湘潭站/衡阳站/耒阳站/郴州站）+ 湘株支线 2 座
   （株洲站/154国库站）+ 湘娄支线 1 座（娄底站），三条线合计正好 11 座，而
   `changchen` 这一条管道自己的节点列表里只有 8 座——批注统计的是"这一片管网"而
   不是"这一条管道"。演示时被问到"为什么你这里是 8 座"，这是可查的答案。

## 渲染预算实测（Playwright + 真实 WebGL，见 `verify/verify_overview.js`）

- 省域态：`renderCalls ≈ 62`（管道打开后 ≈ 84），`triangles ≈ 35060`。
- 下钻到站点最多的作业区（岳阳作业区，36 个站点，最坏路径）：
  `renderCalls ≈ 192`，`triangles ≈ 56692`——低于 `<200` 护栏但余量不大
  （只有 8 次余量），这是 `engine.js` 热点池"每个可见热点固定开销 × 站点数"的
  既定成本，模型层已经把自己的几何体压到 12 次 draw call（9 个按作业区合并的市域
  网格 + 3 个按状态分组的站点光柱 InstancedMesh）。正因为这个余量不大，**管道
  Tube 网格只在省域态显示，下钻到作业区后强制隐藏**——两者叠加会到 214，直接
  击穿 `<200` 护栏，`scripts/boot.js` 的 `mountMap3D()` 里有这条决策的完整推导。

## 已知简化 / 遗留问题

- 钻取只做两级（省域 → 作业区），不做站点级相机推进——站点详情完全由右栏承载。
- 作业区选中态只有"提亮"（emissive 高亮），没有"其余压暗"或"物理抬高"：
  `engine.js` 的选中态机制只支持修改材质 emissive，没有改几何体位置的钩子，
  这是被冻结引擎的能力边界，不是本轮遗漏。
- 站点光柱用 InstancedMesh 按状态分组（3 个而不是 217 个 Mesh），因此不支持
  "点亮某一个具体站点"的 3D 高亮——这与本 demo 只做两级钻取的设计一致（从不
  调用 `HunanMap3D.setActiveSite`），站点选中态完全交给右栏 `SelectList` 承载。
