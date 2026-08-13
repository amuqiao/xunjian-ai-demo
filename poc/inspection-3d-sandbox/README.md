# 站场 3D 巡检地图（沙盘视图）POC

程序化三维工程沙盘：广西支干线永州分输清管站，12 个巡检区域、256 条真实巡检项、一条 47 点巡检轨迹。纯前端、零构建、零 npm，双击 `index.html` 即可在浏览器里打开并交互。

## 怎么打开

直接双击 `index.html`（或用浏览器 `file://` 方式打开），**不需要**启动本地服务器、不需要 `npm install`、不需要任何构建步骤。页面加载完成后：

- 左栏点击任意区域名 / 3D 地图上点击任意热点标签，都会下钻进入该区域的详情与巡检项列表（两个入口互相联动）。
- 右栏巡检项列表点击某一行可选中；布尔型巡检项可点开关切换，数值型巡检项可点 `+`/`−` 步进（只改读数，不改状态判定，见下方"已知边界"）。
- 底部悬浮操作栏：`轨迹`按钮切换巡检路线光带的显示/隐藏（每次从隐藏切到显示都会播放一段约 2.4 秒的有限时长流动动画）；`切换区域`/`问题上报`打开对应弹层；`+`/`−`缩放 3D 视角。
- 页脚 6 步流程轨可点击跳转到对应的叙事阶段。

## 文件结构

```
index.html                     页面入口，串联全部 <script>/<link> 加载顺序
vendor/                        本地 three.min.js（r160 UMD）、echarts.min.js
scripts/
  map3d/
    contract.js                L1 契约：12 区 id 顺序、DOM 命名空间、断言（全仓库唯一真源）
    model-shared.js            L3 共享程序化贴图/材质工具（沙盘地面、状态材质等）
    model-sandbox.js           L3 程序化三维沙盘模型（12 区设备造型 + 250 点位 InstancedMesh）
    model-track.js             L3 巡检轨迹模型（TubeGeometry 流动光带 + 起点/终点/巡检人 Sprite）
    engine.js                  L3 3D 引擎（WebGL 生命周期/相机轨道/标签投影/按需渲染，从 pump3d/engine.js 抄写改造）
  data/
    items-entry.js / items-process.js / items-room.js   256 条真实巡检项（tools/build-items.py 生成，不要手改）
    station.js                 12 区站场态势数据 + 世界坐标系定义（全仓库坐标真源）
    series.js                  图表聚合数据源 + 63 分钟耗时分配算法（唯一实现）
    track.js                   巡检轨迹折线/waypoint（atMinute 从 series.js 派生，不再各算一遍）
    task.js                    任务卡 / 问题列表 / 问题上报单模板
    flow.js                    流程步骤 + 状态文案唯一真源
    schema.js                  逐条巡检项字段级校验（seq 连续性、inputType、量程等）
    index.js                   window.DemoData 门面，收拢以上六个数据模块
  core/
    screen-scale.js            固定画布等比缩放
    dom.js                     h()/append()/renderStationMap() 等基础 DOM 工具
    charts.js                  ECharts 持久化槽位注册表
    timers.js                  场景级定时器生命周期管理
    chartopts.js                纯函数 ECharts option 构造器
    state.js                   window.AppState：focus/pick/showTrack/overlay/flowVisited
  ui/                          cards.js / selectlist.js / detailcard.js / itemlist.js / actionbar.js / overlay.js
  scenes/
    map.js                     唯一场景：任务卡、左栏区域列表、3D 面板、右栏详情+列表、底部图表行
    areapicker.js               「选择区域」弹层
    issuereport.js               「问题上报」弹层（IMS 事件中心字段）
  boot.js                       引导层：render 管线 + 事件委托 + 状态写入口
styles/
  01-tokens.css ... 11-overlay.css   见各文件头注释的类名契约
tools/
  build-items.py / area-mapping.py   从 xlsx 生成 items-*.js 的离线脚本（不在浏览器运行时执行）
```

## 边界与设计取舍

- **本 POC 只有沙盘一种视觉表达**，没有"沙盘 / 卫星"双模式切换（`Map3DContract` 里没有 `MODES`/`assertModeSwitch`，故意不加）。引擎因此保持"终生单例、单模型、无 dispose"的形态——与 `poc/pump-demo` 已验证过的模式一致。
- **250 个巡检点位是 InstancedMesh**，按状态分 3 组，不是可单独点击的对象；点击选中一条具体巡检项目前只更新右栏 UI 和 `debugInfo().activeItemId`，不驱动额外的 3D 高亮（见 `scripts/map3d/engine.js` 的 `setActiveItem` 注释）。
- **数值型巡检项的 `+`/`−`** 只改 `value`，不重新计算 `status`：数据模型没有给出"读数变化 → 状态判定"的公式，不擅自发明一套阈值逻辑。
- **区域下钻（`area` 预设）只显示当前区 + 相邻区域的标签**，其余 9-10 个区域收敛为纯 3D 点位（热点球体/光环仍渲染，只是不再叠加 DOM 标签）——这是应对"12 个标签在近距离取景下必然拥挤"的根本手段，比单纯依赖去碰撞算法更有效。相邻关系从 `station.js` 的 `grid.col/grid.row` 现场算出 4 方向邻接，不再手写第二份邻接表。

## 与 `poc/inspection-3d-aerial` 的关系

两个刻意互不耦合的独立 POC：本目录做「程序化工程沙盘」视觉表达，`poc/inspection-3d-aerial` 做「俯视/卫星」视觉表达。两者共享同一份真实巡检标准来源（`附件1-3.湖南公司油气站场、阀室通用巡检标准.xlsx`），但巡检项数据由 `tools/build-items.py` **各自独立生成一份副本**（两个目录各有一份 `items-entry.js`/`items-process.js`/`items-room.js`），运行时零共享、零 import，改一个不会影响另一个。`scripts/map3d/contract.js` 顶部注释记录了这次拆分的历史与理由（2026-08-13，原设计过双模式，后来发现双模式会要求一条真正的 dispose 路径，与"终生单例"的既有形态冲突，拆分成本更低）。

## 待清理的旧文件（未提交，本轮任务未删除，需要用户确认后清理）

以下文件是更早期迭代留下的残留，`index.html` 已不再引用它们：

- `scripts/app.js`
- `scripts/data.js`
- `scripts/dom.js`
- `styles/card.css`
- `styles/pump3d.css`

`scripts/pump3d/`（`contract.js`/`engine.js`/`model.js`）**保留**，它是 `scripts/map3d/engine.js` 的抄写源，仍有对照价值，不属于待清理列表。
