# 3D 泵机组视图 · 契约文档

> **读者**：熟悉前端、但第一次接触本项目的人（或 AI agent）。你大概是被派来改
> `overview` / `station` 的布局、样式或渲染管线的。
>
> **这份文档存在的唯一理由**：这个 3D 视图靠一批**隐式约定**活着，而它的多数失效模式
> **不报错、不白屏、控制台干干净净**，只是「3D 不显示」或「标签错位 / 标签全丢」。
> 动手之前先读第 4、5、8 章，收工之前先跑第 11 章的验证。

---

## 1. 这是什么 · 由哪些文件组成 · 为什么是这个加载顺序

`scripts/pump3d/` 是一个**用 three.js r160 程序化建模的离心泵机组 3D 视图**：无 glTF 资产、
无构建工具、无框架，ES5 风格 IIFE + 全局挂载，`file://` 直接打开即可运行。它被
`overview`（大屏概览）和 `station`（部位态势）两个场景共用，承载 6 个可点击的部位热点。

| 文件 | 职责 | 暴露的全局 | 依赖 |
| --- | --- | --- | --- |
| `contract.js`（132 行） | 部位 id 单一真源、DOM 命名常量、4 个断言函数 | `window.Pump3DContract` | **零依赖** |
| `model.js`（约 754 行） | 程序化建模：材质、CanvasTexture、几何、`partMeshes`、`anchors` | `window.Pump3DModel` | `THREE`、`Pump3DContract` |
| `engine.js`（约 1079 行） | 单例 WebGL 生命周期、手写轨道控制器、布光、热点、标签投影去碰撞、按需渲染（第 14 章） | `window.Pump3D` | `THREE`、`Pump3DModel`、`Pump3DContract` |

配套但不在本目录：

- `scripts/core/dom.js:55-85` —— `renderPumpTrain()`，构建 3D 宿主 + 6 个热点标签的 DOM
- `scripts/boot.js:88-109` —— `render()` 管线；`:163-180` —— `mountPump3d()`
- `styles/05-pump3d.css`（189 行）—— **3D 契约样式全部集中在这一个文件里**，文件头 1-9 行就写着
  5 条不变量。相关的外部依赖分散在 `styles/02-shell.css`、`styles/06-overview.css`、
  `styles/07-station.css`
- `verify/verify_pump3d.py` —— 全量 Playwright 断言（历史基线 44 项，脚本仍在扩充）；`verify/verify_css_snapshot.py` —— 计算样式基线

### 加载顺序（`index.html:51-77`，与 `boot.js:8-17` 的分层清单一一对应）

```
L0 vendor : vendor/echarts.min.js, vendor/three.min.js
L1 契约   : scripts/pump3d/contract.js      ← 零依赖，必须最先
L2 数据   : scripts/data/catalog.js, knowledge.js, index.js
L3 3D     : scripts/pump3d/model.js, scripts/pump3d/engine.js
L4 core   : scripts/core/dom.js, state.js, charts.js
L6 场景   : scripts/scenes/*.js
L7 引导   : scripts/boot.js
```

**为什么 contract 必须最先**：它是唯一零依赖的文件，而 L2 的 `catalog.js`、L3 的 `model.js`
（`model.js:724`、`:743-744` 在 `build()` 里直接调 `Pump3DContract.assertIdSet`）、L4 的
`dom.js`（`:57` 读 `window.Pump3DContract`）都要消费它。把它排到 vendor 之后、其它一切之前，
是让「id 真源」与「DOM 命名真源」在任何人用到它之前就已经就位。

**违反顺序的后果**：不会得到一个语义不明的 `undefined` 报错 —— `boot.js:27-38` 的
`assertGlobal` 会指名道姓地抛 `缺少全局依赖 XXX，请检查 index.html 的 <script> 加载顺序`。
这是设计好的：**顺序错误必须在启动第一秒就有名有姓地炸出来**。

同层内部不得互相引用（`scenes/*.js` 之间尤其不能，每个场景文件必须能被单独抽走），只能引用
严格更早层暴露的全局。

---

## 2. 世界坐标约定（不得变更）

来源：`engine.js:4-5`、`model.js:4-7`。

| 约定 | 值 |
| --- | --- |
| 单位 | **1 unit = 100 mm** |
| 轴系方向 | 沿 **+X**；**泵在 −X 端，电机在 +X 端** |
| 上方向 | **+Y**，`y = 0` 为基础底面 |
| 轴中心线 | **y = 4.6**（所有旋转件的 `position.y` 都是 4.6） |
| 观察者方向 | **+Z 指向观察者** |
| 整机 X 跨度 | 约 **−12.5 … +11.5**（不含地面 / 网格等场景装饰件，`model.js:7`） |

实测包围盒（Playwright 探针，2026-08-04）：`x ∈ [−12.80, 11.75]`、`y ∈ [0, 9.2]`、
`z ∈ [−4.5, 4.5]`。验收断言据此设成 `整机 X 跨度在 −13..12`、`整机不穿地（y.min ≥ −0.05）`、
`出口管顶 y ≤ 9.9`（`verify_pump3d.py:345-365`）。

### ⚠️ 反直觉的一点：**布光的 z 必须为负**

`engine.js:9-12` 有这段推导，务必转述给下一个人：

> 两个 preset 的相机机位**都落在 −Z 侧**（`station` 实算：
> `x = r·sinφ·cosθ ≈ 0.3`、`y ≈ 20.5`、`z ≈ −22.8`），
> **所以打光的 z 必须为负才是迎面光。**

现状：主光 `key.position = [12, 20, −14]`、暖补光 `rimAmber = [−14, 7, −9]`（都在 −Z，迎面），
青光 `rimCyan = [−6, 10, 16]` 退到 +Z 当背面轮廓光（`engine.js:13-17`）。

**为什么这条特别容易踩错**：文档第 2 章明写「+Z 指向观察者」，任何人凭这条直觉布光都会把主光
放到 +Z —— 而那恰好是**给整机背面打光**。历史上就是这么错过一次，症状是：整机偏暗发蓝、
安全黄护罩被青补光染成青白、泵端全黑。**这类失效不报错，只是「渲染出来很丑」**，而
「很丑」是断言测不出来的，只能靠人看截图。

同源的坑还有一个（`model.js:20`）：护罩材质 `guard.metalness` 必须**低**（现为 0.12）。
早期取 0.45 时，半透明表面大面积反射青蓝环境贴图，环境反射盖过本体色，安全黄读成青白色。

---

## 3. 部位 id 的单一真源

**`Pump3DContract.PART_IDS`（`contract.js:10`）是全仓库唯一真源**：

```js
["pump-body", "seal", "front-bearing", "coupling", "motor", "base"]
```

以下四处必须与它**完全一致，含顺序**：

| 位置 | 是什么 | 谁来抓不一致 |
| --- | --- | --- |
| `scripts/data/catalog.js:123,149,175,202,230,256` 的 `parts` | 数据层部位列表 | `assertData()`（`contract.js:47-50`） |
| `scripts/pump3d/model.js:724` 的 `partMeshes` 键 | 每个部位的 mesh 列表 | `build()` 内 `assertIdSet`（`model.js:744`） |
| `scripts/pump3d/model.js:734-741` 的 `anchors` 键 | 每个部位的 3D 标签锚点 | `build()` 内 `assertIdSet`（`model.js:743`） |
| `scripts/pump3d/engine.js` 的热点创建顺序 | `createHotspots`（`:349`）/ `setStatuses`（`:498`）/ `syncLabels`（`:517`）都遍历 `PART_IDS` | 遍历时缺键即抛（`:351`、`:500`、`:519`） |

外加 DOM 一处：`.pump3d-labels` 内 `[data-part]` 的 id 集合，由 `assertDom` 校验
（`contract.js:90-99`）。

### 断言怎么抓不一致

`assertIdSet(label, obj)`（`contract.js:28-38`）**同时比键集合与顺序**（`Object.keys` 顺序
即插入顺序），任一不符就抛，并打印差集：

```
[Pump3DContract] anchors 与 PART_IDS 不一致：缺少 [base]，多余 [foundation]；
实际顺序 [pump-body, seal, front-bearing, coupling, motor, foundation]，
应为 [pump-body, seal, front-bearing, coupling, motor, base]
```

差集 + 实际顺序 + 期望顺序三件套一起打，就是为了让你一眼看出到底是**少了、多了，还是顺序错了**。

> **顺序为什么也要管**：`createHotspots`（`engine.js:409`）按 `PART_IDS` 顺序创建热点、
> `setStatuses` 按同一顺序写状态，顺序变了排查问题时的心智映射就会错位；更重要的是
> 「顺序也是契约」这条纪律，能顺手挡住「以为只是换个位置」的无心改动。（历史上这里曾经
> 还按 `index * HOTSPOT.phaseStep` 给脉冲环分配相位、错开呼吸节奏——按需渲染改造后脉冲环
> 已经改成按状态取固定值，不再逐帧动画，`phaseStep` 也随之删除，见第 14 章。）

`part.status` 还必须 ∈ `STATUSES = ["ok","warn","danger"]`（`contract.js:11`、`:52-56`），
`engine.js:497-505` 再校一遍。

---

## 4. DOM 契约（含最容易踩的命名空间纪律）

DOM 由 `scripts/core/dom.js:55-85` 的 `renderPumpTrain(activeId, preset)` 构建，
**它消费契约常量，不重新硬编码属性名字符串**（`dom.js:66,68,77`）。产出结构：

```html
<!-- 宿主：class 必须同时含 pump-train 和 pump-train-3d -->
<div class="pump-train pump-train-3d"
     data-pump3d-host="1"          <!-- Contract.HOST_ATTR，全页恰好 1 个 -->
     data-pump3d-preset="dashboard|station"  <!-- boot.js 据此决定 preset -->
     role="group"                  <!-- 不能用 role="img"：会把 6 个按钮变 presentational -->
     aria-label="输油泵机组三维部位视图，含 6 个部位热点">
  <canvas class="pump3d-canvas" aria-hidden="true"></canvas>  <!-- 由 engine 插入，见第 6 章 -->
  <div class="pump3d-labels">      <!-- Contract.LABELS_CLASS -->
    <button type="button" class="part-pin <status> [active]"
            data-part="pump-body"  <!-- Contract.PIN_ATTR，6 个，顺序同 PART_IDS -->
            aria-label="泵体 · 异常" aria-pressed="true|false" title="...">
      <span class="pin-core" aria-hidden="true"></span>
      <span class="pin-label" aria-hidden="true">泵体</span>
    </button>
    ... ×6
  </div>
  <div class="pump3d-hint" aria-hidden="true">拖拽旋转 · 滚轮缩放</div>
</div>
```

契约常量（`contract.js:13-16`）：`HOST_ATTR = "data-pump3d-host"`、
`LABELS_CLASS = "pump3d-labels"`、`PIN_ATTR = "data-part"`、
`ACTIVE_LABEL_ATTR = "data-active-part-label"`（**当前无任何消费者，见第 13 章**）。

### 🚨 `data-part` 归 3D 热点独占 —— 全项目最难排查的暗坑

**规则**：`data-part` 这个属性名**只允许**出现在 `.pump3d-labels` 内部的 6 个热点按钮上。
其它任何地方（**尤其是 overview 的状态卡 / 部位列表 / 表格行**）都不得使用。

**违反后会发生什么**（`contract.js:60-63` 有原文）：

1. `engine.js:578-600` 的 `buildLabelMap` 用 `labelsRoot.querySelectorAll("[data-part]")` 建映射；
   若别处也带 `data-part`，而那个元素**恰好落在宿主内**，同名后者覆盖前者；
2. `syncLabels`（`engine.js:512-575`）于是每帧给那个非 3D 元素写
   `transform: translate3d(...)`；
3. **真正的 3D 标签同时消失，而且一个错都不报** —— 它们再也拿不到 transform，全部堆在
   宿主左上角 `left:0; top:0` 处并互相重叠；被误改的那个状态卡则会诡异地在页面上跳动。

这条纪律由 `assertPinNamespace()`（`contract.js:67-77`）在**每次 render 之后**强制：
任何 `[data-part]` 元素只要 `!el.closest(".pump3d-labels")` 就抛错，错误信息会打出违规元素的
`className`，并直接告诉你该改用什么。

**其它选择器该用什么**：

- 选择类：优先使用 `data-select` + `data-select-id`；少量全局命令仍按用途使用
  `data-scene`、`data-unit`、`data-verdict`、`data-agent-question-id`、`data-flow-step`。
  唯一的硬约束是**别叫 `data-part`**。
- 命令按钮类：统一 `data-action`，在 `boot.js:329-331` 委托到 `handleAction`
  （`boot.js:334-462`）。

热点按钮本身的点击也是**事件委托**：`boot.js:285-294` 用 `Pump3DContract.PIN_ATTR` 拼选择器
（不硬编码字符串），点击后写 `state.selectedPart` 并触发一次完整 `render()`。

---

## 5. `render()` 管线的顺序契约

`boot.js:88-109`。这几步的相对顺序是硬契约，逐条给出违反后果：

```js
function render() {
  var focusMark = Focus.remember();   // ⓞ 必须在拆 DOM 之前（拆完只能读到 <body>）
  ... 顶栏文本 / renderNav() ...
  window.Pump3D.detach();             // ② 必须在 ③ 之前
  stage.innerHTML = "";               // ③
  window.SelectList.resetRenderPass();
  window.Charts.beginPass();          // 划清"一轮 render"的边界（不是 rAF 边界）
  window.SceneTimers.clearAll();      // 渲染级定时器（persist 的由 clearScene 负责）
  stage.appendChild(renderScene());
  stage.appendChild(renderAgentDialog());
  renderGlobalFlowRail();
  bindStage();                        // ④ 事件委托重绑（DOM 是全新节点）
  mountChartSlots();                  // 接上 [data-chart-slot] 占位容器
  renderSceneCharts();                // 各场景自己的 renderXxxCharts()
  mountPump3d();                      // ⑤ 必须在 append 之后
  window.Pump3DContract.assertPinNamespace();  // ⑥ 必须在 render 之后
  Focus.restore(focusMark);           // ⑦ 必须在 bindStage() 之后
}
```

| 约束 | 违反后的具体后果 |
| --- | --- |
| **② `detach()` 必须在 ③ `stage.innerHTML=""` 之前**（`boot.js:94-96`） | canvas 被 `innerHTML=""` 连根拔走时，`pointerup` 不会派发到它，`dragging` 会**永久卡在 true**（`engine.js:234-237` 的注释）—— 自动巡航和 preset 复位一起失效，画面从此只能靠拖拽动。`detach()` 里的 `resizeObserver.disconnect()` 也会漏做，`hoverId` 会永久指向已销毁的节点，新 mount 后同名热点的 glow 一直带着 `hoverGlowBoost`（`engine.js:832-835`）。 |
| **⑤ `mountPump3d()` 必须在 `stage.appendChild(...)` 之后**（`boot.js:103-105`） | 宿主还没进 DOM 树时 `clientWidth/clientHeight` 恒为 0，`assertDom` 的宿主盒非零断言会误报；`buildLabelMap` 实测的标签盒尺寸也会全是 0，去碰撞阈值退化成 `0 + gap`，6 个标签直接叠在一起。`boot.js:168-170` 专门加了 `stage.contains(host)` 的守卫来挡住这种挪动：`mountPump3d 必须在 3D 宿主 append 到 stage 之后调用`。 |
| **⑥ `assertPinNamespace()` 必须在 render 之后**（`boot.js:106-108`、`contract.js:65-66`） | 放进 `assertData()`（跑在**首次 render 之前**）时 DOM 里还没有任何 `[data-part]`，`querySelectorAll` 返回空集，**无论渲染对不对都会通过**，检查形同虚设 —— 第 4 章那个暗坑就再也没人守了。 |
| ~~① `AppCharts.dispose()` 在 `innerHTML=""` 之前~~ | **这一步已不存在。** 旧的 `window.AppCharts` 每次 render 都 dispose 再 init 一遍 ECharts 实例，所以必须"先解绑再拆 DOM"。现在所有场景都走 `window.Charts` 的持久化槽位：`Charts.slot(id)` 返回的节点跨渲染存活，`innerHTML=""` 只是把它从父节点摘下来，实例本身不受影响（与本 3D canvas 的 `detach()/mount()` 是同一个模式）。整套旧 API 已在阶段三整合时删除。 |
| ⓞ⑦ `Focus.remember()` / `Focus.restore()` 必须分别在拆 DOM 之前、`bindStage()` 之后 | 前者放晚了只能读到 `<body>`（DOM 已被 `innerHTML=""` 清空）；后者放早了会把焦点还给一个尚未绑上点击/键盘监听的节点，键盘操作静默失效。 |
| ④ `bindStage()` 必须在每次 append 之后 | `render()` 每次都产出**全新节点**，事件不会自己跟过来（`engine.js:577` 对标签也做了同样的说明：`buildLabelMap` 必须每次 mount 都重建映射并重绑 hover）。 |

另外 `mountPump3d()` 自身的两条约束（`boot.js:163-170`）：宿主数量 > 1 直接抛
（`Pump3D 只支持一个`）；数量 = 0 则安静 return（workbench / confirm 等场景本来就没有 3D）。

---

## 6. WebGL 上下文单例设计（以及为什么没有 `dispose()`）

- **canvas 是模块级单例**：`engine.js:59` 的 `var engine = null` + `ensureEngine()`
  （`:775-788`）。`createEngine()` 只跑一次，canvas 与 WebGL context 终生只有一个。
- **切场景是「搬家」不是「重建」**：`mount()` 用
  `host.insertBefore(instance.canvas, host.firstChild)`（`engine.js:798`）把同一个 canvas
  插进新宿主的最前面；`detach()`（`:827-838`）只是把它从旧宿主摘下来。
- **为什么**：浏览器的 WebGL context 上限约 **16 个**，超出会开始丢弃最老的 context 并打印
  `Too many active WebGL contexts`。这个 demo 会被反复切场景（验收脚本压测 25 轮 = 50 次
  mount），每次重建就必然撞上限。验收断言 `contextCreated == 1` 与
  `25 轮切场景后 contextCreated 仍为 1` 就是钉这条。
- **context 自己创建再交给 three**（`engine.js:72-86`）：
  `canvas.getContext("webgl2", GL_ATTRS) || canvas.getContext("webgl", GL_ATTRS)`，
  再 `new THREE.WebGLRenderer({ canvas, context: gl })`。
  - 不能「先在同一 canvas 上探测、再让 three 自己建」：按 WebGL 规范同一 canvas 第二次
    `getContext(同 contextId)` 直接返回已有 context 并**静默忽略全部属性参数**，
    three 请求的 `antialias/alpha/powerPreference` 会被丢弃。
  - 不能「在临时 canvas 上探测完再 `loseContext()`」：那等于多创建一个完整 context，在
    软件光栅器（headless swiftshader）下这一步会直接把页面挂死。
- **计数写在 `WebGLRenderer` 构造之后紧跟一行**（`engine.js:658-662`）：若写在函数末尾，
  `createEngine` 中途抛错（PMREM / `Model.build` / `createHotspots` 任何一处）时 context
  已经创建、`engine` 仍是 `null`，泄漏的那个不会被计入。
- **快速失败闩锁**（`engine.js:773-788`）：`engineFailed` 让首次初始化失败后不再重试。
  这**不是兜底**，恰恰相反 —— 没有它的话下一次 `render()` 会静默再造一个 canvas + context
  重试，既掩盖原始报错，又会在开发期反复切场景时耗尽 context 配额。
- **WebGL 不可用时抛中文错误，不做 2D 回退**（`engine.js:82-84`）。

### 为什么不提供 `dispose()`

`window.Pump3D` 只暴露 `mount` / `detach` / `debugInfo`（`engine.js:857-861`），**没有
`dispose()`，这是刻意的**：

1. 这个 canvas / context / scene / 材质 / 贴图**全程只有一份，生命周期等于页面生命周期**。
   `detach()` 已经覆盖了「离开 3D 场景」的全部需要（摘 canvas、断 ResizeObserver、清
   `hoverId` 与 `labelEls`）。
2. 提供 `dispose()` 就等于提供了一条「销毁后再重建」的路径，而重建正是第 6 章开头要禁止的事
   —— 每重建一次多一个 context。
3. RAF 循环也是**终生不停**的（`engine.js:625-644`）：它不靠 detach 停下，而是靠帧内守卫空转
   （见第 7 章「静默失效」）。没有 dispose，就没有「循环停了但没人知道」的中间态。

---

## 7. 启动 / 挂载断言清单

分布在 **3 个入口 + 模型层 2 处**，共 **13 条**（任务书里说的「10 条」是粗略计数，实际以下表为准）。
全部**直接抛错、不降级**。

### 7.1 `assertData()` —— `boot.js:56`，首次 `render()` **之前**

| # | 断言 | 代码 | 失败信息 |
| --- | --- | --- | --- |
| A1 | `window.THREE` 已加载 | `contract.js:43` | `[Pump3DContract] window.THREE 未加载，请检查 vendor/three.min.js` |
| A2 | `window.Pump3DModel` 已加载 | `:44` | `... window.Pump3DModel 未加载，请检查 scripts/pump3d/model.js` |
| A3 | `window.Pump3D` 已加载 | `:45` | `... window.Pump3D 未加载，请检查 scripts/pump3d/engine.js` |
| A4 | `DemoData.parts()` 的 id 集合**含顺序**等于 `PART_IDS` | `:47-50` | 见第 3 章 `assertIdSet` 样例 |
| A5 | 每个 `part.status ∈ {ok,warn,danger}` | `:52-56` | `[Pump3DContract] 部位 seal 的 status 非法：ng` |

注：`assertData` **不检查** `window.DemoData` 是否存在 —— 那一层已由 `boot.js:27-38` 的
`assertGlobal` 先行保证，不重复（`contract.js:40-41`）。

### 7.2 `assertPinNamespace()` —— `boot.js:108`，**每次** `render()` **之后**

| # | 断言 | 代码 | 失败信息 |
| --- | --- | --- | --- |
| A6 | 全页每个 `[data-part]` 都在 `.pump3d-labels` 之内 | `contract.js:67-77` | `[Pump3DContract] 发现 [data-part] 元素落在 .pump3d-labels 之外（part-row active）：3D 热点标签独占 data-part，其余场景选择器请改用 data-select/data-select-id` |

### 7.3 `assertDom(host, options)` —— `engine.js:804`，`mount()` 内、**插入 canvas 之后**

| # | 断言 | 代码 | 失败信息 |
| --- | --- | --- | --- |
| A7 | 全页 `[data-pump3d-host]` 恰好 1 个 | `contract.js:81-84` | `... 页面中 [data-pump3d-host] 元素应恰好 1 个，实际 2 个` |
| A8 | 宿主内有 `.pump3d-labels` 容器 | `:86-89` | `... 宿主内缺少 .pump3d-labels 容器` |
| A9 | 容器内 `[data-part]` 数量 = 6 | `:90-96` | `... .pump3d-labels 内的 [data-part] 数量为 5，应为 6` |
| A10 | 容器内 `[data-part]` 的 id 集合**含顺序**一致 | `:97-99` | 见 `assertIdSet` 样例 |
| A11 | `options.statuses` 存在，且键集**含顺序**一致 | `:101-104` | `... Pump3D.mount 缺少 options.statuses` |
| **A12** | **宿主盒非零**（`clientWidth`/`clientHeight` 都不为 0） | `:110-115` | `... 3D 宿主盒尺寸为 0（clientWidth=1512, clientHeight=0），host.className=pump-train pump-train-3d` |

### 7.4 模型层 —— `model.js` `build()` 内

| # | 断言 | 代码 |
| --- | --- | --- |
| M1 | `anchors` 键集含顺序等于 `PART_IDS` | `model.js:743` |
| M2 | `partMeshes` 键集含顺序等于 `PART_IDS` | `model.js:744` |

另有非契约的即时校验：`engine.js:351`（`缺少热点锚点: X`）、`:455`（`未知的高亮部位: X`）、
`:500`（`缺少部位状态: X`）、`:519`（`缺少热点标签元素: X`）、`:715`
（`模型缺少名为 pump3d-grid 的网格对象`）、`:242`/`:619`/`:647`（`未知的 3D 视角预设：X`）。

### ⭐ A12 宿主盒非零 —— 为什么这条断言最值钱

**没有它的世界是这样的**：

- `resize()` 在尺寸为 0 时**静默 return**（`engine.js:602-606`）；
- RAF 帧循环在 `clientWidth === 0 || clientHeight === 0` 时**静默跳过整帧**
  （`engine.js:629-632`）。

于是**CSS 网格给 3D 面板算出 0 高度时，3D 什么都不显示，而控制台一片干净** —— 这是本项目
最典型的「悄悄失效」，也是接手者最容易浪费一小时的地方。

A12 把这种情况钉在**第一次挂载**就炸掉。它敢这么硬，是因为**合法的 0×0 不存在**
（`contract.js:106-109`）：`mount` 是 `append` 之后同步调用的，读 `clientWidth` 会强制回流；
stage 是整体替换、没有 `display:none` 场景。

**仍然会静默的残余情况**（A12 覆盖不到，请自行警惕）：**挂载成功之后**才被改成 0 高度
（改窗口尺寸命中某个媒体查询、父容器 grid 行塌缩、把宿主藏进折叠面板）。这时只有
`resize()` / RAF 的静默 return 生效，画面就那么静止在最后一帧或干脆空白。**症状是「3D 没了但
不报错」时，第一件事是量 `[data-pump3d-host]` 的 `clientHeight`。**

---

## 8. CSS 硬依赖（改样式前必读）

> **样式已拆分成 `styles/01-tokens.css` … `styles/15-responsive.css`（由 `index.html:7-21` 按序引入）**，
> **3D 契约样式全部集中在 `styles/05-pump3d.css`**（含它自己的 `@media` 覆盖，不散到
> `15-responsive.css`）。根目录的 `styles.css` 已不再被 `index.html` 引用，属拆分遗留，
> **不要再改它**（下方行号一律指新文件）。规则内容随重构会移动 —— 认 class 名，别死记行号。

| # | 硬依赖 | 位置 | 违反后的现象 |
| --- | --- | --- | --- |
| C1 | **`.pump-train` 必须有非零高度** | `05-pump3d.css:11-23`（`min-height: 430px`）；`:153-155` station 覆盖为 480px；`:157-160` **dashboard 下被覆盖成 `height:100%; min-height:0`**；`:162-165`（≤1180px）恢复 480px；`:177-180`（≤760px）360px | dashboard 场景的高度**完全来自 grid 行**，链条是 `.app-shell`（`height:100dvh`、`rows: auto minmax(0,1fr) 62px`，`02-shell.css:3`）→ `.stage`（`min-height:0`，`02-shell.css:124`）→ `.pump-dashboard`（`height:100%`、`rows: 74px minmax(0,1fr) 210px`，`06-overview.css:64`）→ `.pump-map-panel`（`rows: auto minmax(0,1fr)`，`06-overview.css:84`）→ `.pump-map-wrap`（`min-height:0`，`06-overview.css:92`）→ `.pump-train`。**这条链上任何一环把 `minmax(0,1fr)` 挤成 0，3D 就消失** —— 首次挂载时由 A12 炸出来，挂载后才塌缩则完全静默。实测 1920×1080 下宿主为 1512×374（dashboard）、1177×480（station）。 |
| C2 | **`.pump-train` 禁止 `isolation: isolate`** | `05-pump3d.css:20-22`（注释即禁令；文件头 `:5` 也列为不变量） | dashboard 场景里 `.pump-map-toast` / `.pump-source-preview` 是 `.pump-train` 的**兄弟节点**且 `z-index: 4`（`06-overview.css:105`、`:125`）。一旦在 `.pump-train` 上建立新层叠上下文，内部 `.part-pin`（`z-index:5`）会被**永久困在这一层之下**，标签转到左下 / 右下角时既看不见也点不到。 |
| C3 | **`.pump3d-labels` 的 `z-index` 必须大于那两个信息浮层** | `05-pump3d.css:44-51`（现值 `z-index: 5`，`4 < 5` 见文件头 `:6`） | `.pump3d-labels` 自身 `position:absolute` + `z-index` 已构成层叠上下文，**内部 `.part-pin` 的 z-index 出不了这一层**（`:47-48`）。把它降到 ≤4，6 个标签整体被两块浮层压住 —— 视觉上「标签少了两个」、交互上点不动。（浮层已额外加 `pointer-events:none` 双保险。） |
| C4 | **`.pump3d-labels` 与 `.pump3d-canvas` 都要 `position:absolute; inset:0`** | `05-pump3d.css:35-42`、`:44-51` | canvas 由 `renderer.setSize(w,h,false)` 只设**绘制缓冲**、不设 CSS 尺寸（`engine.js:613` 第三参 `false`），显示尺寸完全靠这两条 CSS。丢掉 `inset:0`/`width:100%`/`height:100%` → canvas 塌成默认 300×150 或按缓冲像素撑破容器。标签容器的 `inset:0` 则是 `syncLabels` 的坐标系原点：投影出来的屏幕坐标是相对宿主左上角的，容器一偏移，所有标签整体错位。 |
| C5 | **`.pump-train` 的 `overflow: hidden`** | `05-pump3d.css:14` | 与 `syncLabels` 的越界钳制（`engine.js:564-570`）配套。去掉后滚轮拉近时标签会跑到面板外面，压在旁边的 KPI / 图表上。 |
| C6 | **`.part-pin` 的实测盒尺寸被去碰撞算法读取** | `05-pump3d.css:67-84`（`min-width:68px`）、`:95-102`（`.pin-core` 18px + 3px 边框）、`:132-136`（`.active .pin-core` 24px）、`:140-151`（`.pin-label` `min-height:24px`）；≤760px 时 `min-width:58px`（`:182-184`） | `buildLabelMap`（`engine.js:584-599`）用 `offsetWidth/offsetHeight` **现测**这 6 个按钮并取最大值，作为去碰撞与越界钳制的阈值。实测 1920 宽下为 **68 × 49**（激活态因 `.pin-core` 变大而更高，故取 max）。**改 CSS 会自动改变阈值行为**，这是设计意图（避免两份真源，文件头 `:8-9` 也写了），但也意味着：把标签做得更大 → 阈值变大 → 6 个标签在窄机位下更容易被推到互相「让位」甚至挤到边界钳制上；把 `min-width` 改小 → 阈值变小 → 允许更近，重叠风险上升。**改完必须重跑标签无重叠断言。** |
| C7 | `.part-pin` 有 `position:absolute; left:0; top:0` + `will-change: transform` | `05-pump3d.css:67-78` | 每帧的定位靠 `transform: translate3d(x,y,0) translate(-50%,-50%)`（`engine.js:573`）。改成 `position: relative` 或给它加别的 `transform`，标签定位立刻全废。 |
| C8 | `.part-pin:focus-visible` 的重焦点环 | `05-pump3d.css:86-93`（3px outline + 6px 光晕，`z-index:6`） | 标签每帧都在动，焦点环不够重就追不住（`:86` 注释）。这是键盘可达性的一部分，别按「太抢眼」删掉。 |
| C9 | `.pump-train-3d` 的 `touch-action: none` + `cursor: grab` | `05-pump3d.css:25-33`；`:167-170` 在 ≤1180px 改回 `cursor:default; touch-action:auto` | 桌面端需要 `touch-action:none` 才能让手写轨道控制器吃到 pointer 事件而不被浏览器手势抢走；移动端反过来 —— 交互被 `orbit.setMobileDisabled(mobileQuery.matches)` 关掉（`engine.js:755-757`，断点 `max-width:1180px`，**必须与 CSS 断点保持一致**），此时页面滚动优先。`.pump3d-hint`（`:53-65`）在同一断点隐藏（`:172-174`）。 |
| C10 | `@media (prefers-reduced-motion: reduce)` 下 `.part-pin.danger .pin-core` 关动画 | `05-pump3d.css:126-130` | 与 JS 侧的 reduced-motion 分支（`engine.js:428-429`、`:268-277`、`:285`）配套。只改一边会出现「CSS 静止但 3D 还在脉冲」或反之。 |

---

## 9. 相机 preset 语义

`engine.js:22-26`：

| 字段 | `dashboard` | `station` | 含义 / 违反后果 |
| --- | --- | --- | --- |
| `radius` | 29 | 28 | 初始机位到 target 的距离 |
| `min` / `max` | 20 / **46** | 20 / **34** | 滚轮缩放钳制。`station` 的 `max` 从 48 收到 34 是有原因的（`:24` 注释）：**48 会让机组投影宽度缩到约 250px，6 个约 68px 宽的标签物理上放不下（实测 100% 重叠）** —— 拉太远时去碰撞算法在构造上无解。 |
| `theta` | −1.5533 | −1.5359 | 方位角。`−π/2 = −1.5708`，即分别偏离**纯侧视**仅 **1.0° / 2.0°** |
| `phi` | 1.0 | 0.95 | 极角（自 +Y 起算），对应仰角 **32.7° / 35.6°** |
| `target` | `[−0.5, 4.2, 0]` | `[−0.5, 4.2, 0]` | 视点中心，落在轴中心线略下方 |
| `fov` | 32 | 34 | station 略广 |
| `azimuthClamp` | **0.9** | **null** | dashboard 的入场巡航被钳在 `thetaBase ± 0.9` 内来回摆（ping-pong 折返）；station **不钳制**，theta 在巡航/拖拽下可累加（由 2π 折回兜住数值）。两个 preset 的巡航都只持续约 6.5 秒（`INTRO_CRUISE_DURATION_MS`），结束后自动停住——**不是**无限自动巡航，见第 14 章 |
| `grid` | **false** | **true** | `pump3d-grid` GridHelper 可见性（`model.js:234-237`、`engine.js:622`、`:714-718`） |

三条相关的实现细节，改 preset 时务必一并读：

- **首帧就用目标 preset 初始化 orbit**（`engine.js:723-726`）：不能写死 `dashboard`，否则
  持久化的 `state.scene` 是 station 时，首次 mount 会先落到 dashboard 机位再滑向 station，
  多出一段不该有的入场动画。
- **同场景重挂载不重放预设动画**（`engine.js:811-818`）：只有 `instance.preset !== options.preset`
  才 `applyPresetToEngine`。**这是核心交互路径的保命条**：点击任意 `[data-part]` 标签也会触发
  一次完整 `render()`（= detach + mount），若无条件重放，用户「转到某个部位再点它」时镜头会被
  打回预设机位。
- **跨 preset 切换走最短路径**（`engine.js:250-263`）：把 `next.theta` 与 `thetaBase` 平移到与
  当前 `theta` 同圈内最近的等价角，否则 station 自由旋转很久后切回 dashboard 会看到镜头「甩尾」。

### 相机构图是怎么定出来的

构图不是拍脑袋，而是**先用纯数学投影脚本迭代、再用锁定宿主尺寸的截图人工确认**：

- 纯数学侧：把整机包围盒 8 个顶点按与 `engine.js:324-330` 完全相同的公式投影到
  1175×478 的宿主上，直接算出**上 / 下 / 左 / 右四个方向的边距占比**，不需要浏览器和 GPU，
  因此可以快速扫参数（脚本形态见会话临时目录的 `camera_math.py` / `camera_margin.py`）。
- 截图侧：`camera_check3.py` 用 `page.emulate_media(reduced_motion="reduce")` **关掉自动巡航**，
  再把宿主尺寸强制锁成实测的 1175×478，保证截图反映的是 preset 的**静态基准构图**，
  而不是「截图那一刻恰好叠加了多少自动旋转」。
- 收敛结果：`theta` 落在 −1.5533 / −1.5359，即**偏离纯侧视只有 1°–2°**，`phi` ≈ 1.0（仰角约 33°）。
  换句话说最终构图**几乎是纯侧视 + 轻微俯视**。原因是这台机组是**沿 X 一字排开的长条形**
  （X 跨 24.5 单位、Z 仅 9 单位）：方位角一旦明显偏离侧视，长轴就被透视压缩，泵—联轴器—电机
  三段互相遮挡，而这三段恰好是 6 个热点要指认的对象；同时投影宽度变窄，标签也更容易挤在一起。
  留 1°–2° 而不是精确 −π/2，是为了让近侧的 Z 面留一丝厚度，避免读成一张纸片。
- ⚠️ 上述迭代脚本是**会话临时产物**，不在仓库内。要复刻迭代，照第 11 章的做法在
  `/private/tmp` 下重建即可，不要为此往仓库里加脚本。

---

## 10. 标签投影与去碰撞算法

`engine.js:653-712`（`syncLabels`）。每次被调用时做四件事（**不是每帧都调用**——按需渲染
落地后，`syncLabels` 只在 `startLoop` 真正决定渲染这一帧时才执行，静止时不会跑，见第 14 章）：

1. **投影**：`scratchVector.copy(anchor).project(camera)` 把 3D 锚点变成 NDC，再换算成宿主内
   像素坐标 `x = (ndc.x*0.5+0.5)*width`、`y = (−ndc.y*0.5+0.5)*height`。
   `ndc.z > 1`（锚点跑到相机背后）时把标签透明化 —— 但 `radiusMin` 远大于模型半展，
   **这条分支目前恒为 false，纯属边界防护**。
2. **不做遮挡剔除**：6 个锚点都布在机组轮廓之外 / 之上，raycast 遮挡剔除的实现成本换不到
   实际观感收益（同一段注释）。所以「标签压在机体上」是预期行为，不是 bug。
3. **去碰撞**：阈值用 `mount()` 时**实测**的标签盒尺寸，而不是硬编码像素 ——
   `minDy = labelBoxHeight + 8`、`minDx = labelBoxWidth + 8`，`gap` 是唯一常量
   （`HOTSPOT.labelCollision.gap = 8`）。为什么不抄 CSS 里的数字：**那样 CSS 改了这里忘改，
   去碰撞和越界钳制会静默失准**。历史上验收脚本也犯过同款错（阈值 `|dy|<24 && |dx|<80`
   小于标签盒本身 46×68 → 真实重叠被判成无重叠，断言形同虚设）。
4. **竖向收尾 + 越界钳制 + 写 transform**：见下面「两级策略」；最后写
   `translate3d(x,y,0) translate(-50%,-50%)`。钳制不只是为了好看：
   **不可见的按钮仍留在 tab 序列里，会把键盘焦点丢到画面外**。

### 去碰撞本体：单调单趟扫描 + `Math.max`（`sweepLabels`，`engine.js:581-598`）

```js
points.sort(function (a, b) { return a.y - b.y; });
for (i = 1; i < points.length; i++) {
  for (k = 0; k < i; k++) {
    if (labelsCollide(points[i], points[k], minDy, minDx)) {
      points[i].y = Math.max(points[i].y, points[k].y + push);   // push === minDy
    }
  }
}
```

### 🩸 血泪教训：**这里绝对不能写成 `while (changed)` 收敛循环**

曾经写成过 `while (changed) { ... y = y_k + push; changed = true; }`，后果是
**整个页面同步卡死**：

- 推距 `push` 恰好等于阈值 `minDy`；
- 而 `(y_k + minDy) - y_k` 在浮点下可能算出 **`53.99999999999999 < 54`**；
- 于是**同一个赋值被反复判为「仍在碰撞」**，`changed` 永远为 `true`；
- 这段代码跑在 RAF 帧内、是同步循环 → 主线程再也回不来，
  **`domcontentloaded` 永不触发**，Playwright 直接超时，页面连白屏都没有（就是一直转圈）。

`Math.max` 版本为什么天然安全：`y` **只增不减**，且只会**远离所有更小的 y**，扫描到第 i 个时
前 i−1 个的 y 已固定，不存在需要反复收敛的情况。n=6 → 15 次比较，成本可忽略。

**改这段代码的唯一红线：不要引入任何「重复扫描直到不再变化」的结构。**

### 单趟扫描的盲区：连锁碰撞 → 固定重跑两遍（不是收敛循环）

`sweepLabels` 只保证「点 i 与它推挤过的点 k(k<i) 不再碰撞」，不保证「点 i 因为被推挤，
反过来撞上了排在 k、i 之间、比 i 早处理的另一个点」——这是「连锁碰撞」盲区。修法是
`syncLabels` 里把整趟扫描**固定重跑一遍**（`engine.js:695-699`）：

```js
points.sort(function (a, b) { return a.y - b.y; });
sweepLabels(points, minDy, minDx, push);
points.sort(function (a, b) { return a.y - b.y; });
sweepLabels(points, minDy, minDx, push);
points.sort(function (a, b) { return a.y - b.y; });
```

**这不是收敛循环**：次数写死为 2，不取决于任何「是否还在碰撞」的运行时判断，因此不会重现
上面那段「🩸血泪教训」描述的死循环。每遍之间、以及最后一遍之后都要重新按 y 排序——
`sweepLabels` 不保证扫完一遍后数组仍是 y 升序（一个没被推挤过的点可能原地留在两个都被
推高很多的点之间），而下面 `fitLabelsVertically` 是按相邻 y 差值算间距的，输入必须严格
有序，否则算出负的「间距」会让富余量估算失真。

### 竖向收尾：两级策略替代「直接 clamp」（`fitLabelsVertically`，`engine.js:607-651`）

去碰撞只管彼此不重叠，收尾还要把落点收进宿主矩形，否则滚轮拉近后标签会越界到
`.pump-train` 的 `overflow: hidden` 之外。但**直接 clamp 有个隐蔽的坑**：竖直空间不够摆下
6 个标签时（典型触发场景：**dashboard 把 radius 拉到 46**，机组投影收窄、6 个标签在竖直
方向被挤得很密），直接 clamp 只会把越界的一端拉回边界，而不管这样做会不会把它推得离
邻居更近——`sweepLabels` 刚拉开的间距被 clamp 原样撤销，于是「去碰撞算法本身没错，但
收尾这一步把它推翻了」，`coupling`×`base` 等标签对会重新相交。

修法是两级策略：

1. **整体平移**：先看看把整组标签当刚体平移能不能放进 `[top, bottom]`——不改变任何两两
   间距，天然不会制造新碰撞。够放就直接平移，`return`。
2. **按富余量等比例收缩**：平移仍放不下时，只按每段间距各自的「富余量」（该段实际间距
   超出最小间距 `minDy` 的部分）等比例收缩，`factor = min(1, deficit / totalSlack)`。
   **绝不把已经贴到最小间距的相邻对再往回压**（`slack = 0` 的那些段收缩量恒为 0）。

`points` 必须已按 y 升序排列（`syncLabels` 在调用前已排好）。

---

## 11. 改动前必读清单

### 验证命令（都在仓库根执行）

该目录是从 `pump-demo` 抽取出的运行时组件副本，不随带源 demo 的 `verify/` 目录。
组件级验证走 `beng-demo` 根链路的 Playwright 脚本；需要回看 3D 细项验收时，以源
`pump-demo` 的验证脚本为参考。

> 环境约束（仓库 `AGENTS.md`）：只用 **Python 版 Playwright**，不要直接调系统 Chrome headless
> （本机曾出现 Chrome 崩溃弹窗）；不要用 `qlmanage` 缩略图当验证；临时脚本与输出放
> `/private/tmp`，不要污染仓库。软件渲染必须带
> `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader`，缺 flag 时新版
> Chromium 的软件光栅 WebGL 直接失败。

### 按改动类型对照表

- [ ] **改了 `PART_IDS` / `catalog.js` 的 parts / `anchors` / `partMeshes`**
  → 五处真源同步（第 3 章表）→ `verify_pump3d.py` 全量。
- [ ] **改了 `styles/05-pump3d.css`（或任何影响 3D 宿主高度的 `styles/*.css`）**
  → `verify_css_snapshot.py`（先比对，别急着 `--write`）→ `verify_pump3d.py`
  （canvas 贴合、标签无重叠、宿主非零都在里面）→ **三档宽度人工看截图**。
- [ ] **改了 `.part-pin` / `.pin-core` / `.pin-label` 的尺寸**
  → 同上，外加**必看**「标签无重叠（实测盒 AABB 相交）」这一条 —— 阈值是从 CSS 实测来的，
  改 CSS 等于改算法输入（C6）。
- [ ] **改了 `boot.js` 的 `render()`**
  → 逐条对照第 5 章表；`verify_pump3d.py` 的 25 轮切场景压测（`contextCreated == 1`、
  `mountCount ≥ 50`、无 pageerror）是这类改动的主要护栏。
- [ ] **改了 `engine.js` 的 `syncLabels` / `buildLabelMap`**
  → 读第 10 章红线；`verify_pump3d.py`；**若脚本超时而不是断言失败，第一反应是「是不是写出了
  收敛循环」**。
- [ ] **改了相机 `PRESETS` / 布光 `LIGHTING`**
  → 断言几乎测不出好坏（它们只管「有帧在推进、标签不重叠、draw call 不爆」）→
  **必须人工看三档宽度截图**。
- [ ] **改了 `model.js` 的几何**
  → `verify_pump3d.py` 里的 rev2 几何断言（不穿地 / X 跨度 / 蜗壳与电机等粗 / 出口管顶 ≤9.9）
  → 人工看截图确认没有露缝、埋件、穿模。
- [ ] **新增任何 `data-*` 选择器**
  → **确认没有叫 `data-part`**（第 4 章）→ 任意一次 `render()` 后 `assertPinNamespace` 会替你抓。
- [ ] **动了 `index.html` 的 `<script>` 顺序**
  → 打开页面看控制台第一行是否有 `缺少全局依赖 ...`。

### 三档宽度截图人工确认为什么不能省

**3D 观感是断言测不出来的。** 断言能证明「有东西在渲染、标签没重叠、性能没爆」，但证明不了
「整机没有背光发蓝」「护罩不是青白色」「泵端没全黑」「机组没被裁到出画」「构图不别扭」。
第 2 章那两次事故（主光在 +Z、护罩 metalness 过高）在断言下**全绿**。

推荐档位与验收脚本一致：**1920 / 1280 / 900**（`verify_pump3d.py:445`，同时覆盖
`max-width:1180px` 断点两侧），并且**两个场景都要看**（dashboard 宿主扁而宽 ≈1512×374，
station 更方 ≈1177×480，构图差异明显）。`verify_css_snapshot.py` 另采 1920/1440/1280/900 四档
计算样式。

---

## 12. 已知的环境噪声（别误判成 bug）

| 现象 | 真相 |
| --- | --- |
| **帧率只有个位数** | headless 用的是 **swiftshader 纯 CPU 软件光栅**，帧率完全取决于当时机器负载。验收脚本实测：load≈2 时约 12fps、load≈20 时约 3fps，且**新旧引擎 A/B 结果一致**（`verify_pump3d.py:242-245`）。所以脚本**不设 fps 硬阈值**，只记录 INFO；真正的性能护栏是 draw call 与三角面数。真实 GPU 下不是这个量级。 |
| **控制台一定有 three 的 deprecated warning** | r160 UMD 构建加载时必然打印：`Scripts "build/three.js" and "build/three.min.js" are deprecated with r150+, and will be removed with r160...`。与被测代码无关，已白名单（`verify_pump3d.py:51-56`）。 |
| **控制台一定有 `GL Driver Message ... GPU stall due to ReadPixels`** | swiftshader 的性能提示，同样白名单，真实 GPU 下不出现。 |
| **「关掉阴影，draw call 没变化」** | **`renderer.info.render.calls` 不统计阴影 pass。** three r160 的 `render()` 里调用顺序是 `shadowMap.render(...)` → **然后**才 `info.autoReset && info.reset()`（已在 `vendor/three.min.js` 里核对过这段最小化代码），阴影 pass 的 draw call 在计数被清零之前就发生了。**别拿这个实验去反推阴影开销。** 实测（隔离页，同一套模型 + 投影主光）：`shadowMap.enabled` 开 / 只生成一次 / 完全关闭，`info.render.calls` **恒为 135**，一模一样。 |
| **实测 draw call 比「可见对象数」多出近一倍** | 罪魁不是阴影，而是 **three 的 transmission pass**：轴承座油位视镜用了 `transmission: 0.6`（`model.js:25`、`:486-492`），three 会为透射材质**再整场景渲染一遍**到 transmissionRenderTarget，而那次渲染发生在 `info.reset()` **之后**、因此**会被计数**。实测同一隔离页把该材质 `transmission` 置 0，`info.render.calls` 从 **135 → 73**。真实页面（含 6×4 个热点对象）实测 **overview 169 / station 171，triangles 34350**，验收阈值 `renderCalls < 200`、`triangles < 260000`（`verify_pump3d.py:377-379`）。 |
| **阴影贴图只生成一次** | `renderer.shadowMap.autoUpdate = false` + `renderer.shadowMap.needsUpdate = true`（`engine.js:666-672`）。模型静止、投影光源终生不动，而平行光阴影用光源自己的正交相机渲染、与观察相机无关，所以只需生成一次。**这两行必须配对**：只设 `autoUpdate = false` 而漏掉 `needsUpdate = true` → **阴影从头到尾都不生成**（画面变「悬浮无根」，不报错）。 |
| **护罩和端环没有影子** | 故意的（`model.js:568-570`、`:581-582`）：护罩用 `transparent + alphaMap` 做穿孔网，而 depth-only 的阴影 pass **不采样** transparent/alphaMap，会把穿孔网渲染成实心圆筒的影子。 |
| **`alphaMap` 只有绿色通道生效** | three r160 的 `alphamap_fragment.glsl` 实际取 `.g` 通道（`model.js:38`、`:94`）。现有遮罩都是灰度图（r=g=b）所以无感；**若改成彩色遮罩，只有 g 通道有效**。 |
| **`Lathe` / `Torus` 几何要额外旋转** | `LatheGeometry` 旋转轴是本地 Y → `rotation.z = π/2` 转到世界 X；`TorusGeometry` 环平面是 XY → `rotation.y = π/2` 转到世界 X（`model.js:299`、`:313`）。`TorusGeometry` 的 `arc` 只能从 `u=0` 起扫、**没有 `thetaStart`**，出口弯头因此靠 `rotation.z = −π/2` 把有效弧段搬到 `u' ∈ [−π/2, 0]`（`model.js:403-407`）。 |

---

## 13. 写作时发现的文档 / 代码不一致（**仅记录，未改动任何代码**）

1. **`engine.js:68`** —— `requireModel()` 的报错文案还写着旧路径
   `请检查 scripts/pump3d-model.js`，实际是 `scripts/pump3d/model.js`（`contract.js:44` 已是新路径）。
2. **`engine.js:669`** —— 注释称「稳态每帧 draw call 从 ~166 降到 ~83」。按第 12 章的实测，
   `info.render.calls` **不受阴影设置影响**（隔离页恒 135；真实页在优化已生效的情况下就是 169–171），
   这个 166→83 的说法无法用 `info.render.calls` 复现，疑为把「transmission pass 造成的翻倍」
   误记成「阴影 pass 翻倍」。优化本身（少渲一遍阴影贴图）是真实有效的，只是**不体现在这个计数上**。
3. **`verify_pump3d.py:377`** —— 同一处误解：「阴影 pass 会把 draw call 大致翻倍（实测 ~83 可见 +
   ~83 阴影 = 166），故阈值取 200」。阈值 200 本身仍然合适（实测 169–171），但依据写错了。
4. **`engine.js:523-524`** —— 注释写「`radiusMin(18)` 远大于模型最大半展（约 12.6）」，
   而 `PRESETS` 里两个 preset 的 `min` 都是 **20**（`:23-25`），实测最大半展约 **12.8**。
   结论仍成立，数字对不上。
5. ~~**`engine.js:24` 的 `max` 收紧理由 vs `dashboard.max = 46`**~~ ——**已确认并修复**（原「待确认」
   已有明确答案）：dashboard 把 radius 拉到 46 附近、且叠加拖拽姿态时，确实会重叠
   （实测 `coupling`×`base` 等标签对相交）。根因不是 `dashboard.max` 本身该收紧，而是
   `syncLabels` 的竖向收尾算法当时是直接 `clamp`，会把 `sweepLabels` 刚拉开的间距原样撤销
   （见第 10 章「竖向收尾：两级策略替代『直接 clamp』」）。已改成两级策略（整体平移优先，
   放不下再按富余量等比例收缩），`dashboard.max` 维持 46 不变，`verify_pump3d.py` 新增的
   `sweep_camera_no_overlap` 缩放区间 + 拖拽姿态扫描（20 个机位 × 2 个 preset）覆盖了这个
   场景，现已全绿。
6. **`contract.js:16` 的 `ACTIVE_LABEL_ATTR = "data-active-part-label"`** —— 定义并 export，
   但**全仓库零消费者**（grep 只命中 contract.js 自身两行）。是预留还是遗留**待确认**；
   若无人使用，它属于契约里的死常量。
7. **`contract.js:73` 建议的 `data-select` / `data-select-id`** —— 当前已经用于列表型选择；
   其余全局命令按用途使用 `data-scene` / `data-unit` / `data-verdict` /
   `data-agent-question-id` / `data-flow-step` + 命令用 `data-action`。
8. **`engine.js:579,584`** —— `buildLabelMap` 里硬编码了 `".pump3d-labels"` 与 `"[data-part]"`
   字符串，而没有用 `Pump3DContract.LABELS_CLASS` / `PIN_ATTR`。`dom.js` 与 `boot.js` 都严格
   走契约常量（`dom.js:66,68,77`、`boot.js:287,289`），engine 这两处是唯一破例，削弱了
   「DOM 命名收敛到契约」的单一真源。
9. **`contract.js:2-6`** —— 注释说「以下四处必须与 PART_IDS 完全一致」，但列了 3 个 bullet
   （其中一条覆盖 `partMeshes` 与 `anchors` 两处），且未提第五处 —— `.pump3d-labels` 内
   `[data-part]` 的 id 集合（由同文件 `assertDom` 校验）。
10. **`boot.js:8-15` 的分层清单跳过了 L5**（L4 core 之后直接 L6 场景）。看起来是历史上删掉了一层
    而没有重排编号，无功能影响。
11. **`engine.js:40-41`** —— 注释解释「`active` 未被任何状态渲染逻辑读取…这里不留死常量」，
    但 `HOTSPOT.colors` 里确实已经没有 `active` 键。注释在解释一个**已不存在**的常量的缺席，
    对新读者略费解（保留无害）。

---

## 14. 按需渲染（避免持续吃 CPU/GPU）

这个 3D 视图的产品定位是「一张能点部位的立体态势图」，不是游戏画面。会议室大屏演示原型
不该为了一张基本静止的示意图持续烧 CPU/GPU——那会让演示现场笔记本风扇狂转、耗电，还会
和其他窗口抢资源。这一章记录的改造，把 RAF 循环从「只要 overview/station 在前台就永远
60fps 无条件渲染」改成了「只在真的有变化时才渲染，静止时一帧都不画」。

### 改造前的三个永久脏源

在这次改造之前，即使画面完全没有交互，下面三件事也会让 RAF 循环永远停不下来：

1. **自动巡航**：空闲 4 秒后相机开始无限期缓慢旋转（旧版 `AUTO_ORBIT_IDLE_MS` / `AUTO_ORBIT_SPEED`）。
2. **热点脉冲环**：danger/warn 部位的呼吸光环每帧改 `scale` 和 `opacity`（旧版 `updateHotspots`
   里按 `now` 做 `lerp` 插值）。
3. **选中态脉动**：选中部位材质的 `emissiveIntensity` 每帧按 `Math.sin(now / pulseSpeed)` 振荡
   （旧版 `updateSelectionPulse`）。

实测（同一台机器，A/B 对比，改造前 vs 改造后）：静止 3 秒的帧数增量从 **53** 降到 **0**；
拖拽停手后再静止 3 秒，帧数增量从 **50** 降到 **0**。

### 脏标记驱动渲染

`engine.js` 里的 `markDirty(engine)` 把 `engine.dirty` 置真，并在 RAF 循环当前处于停止状态
（`!engine.frameScheduled`）时重新排一帧。循环真正静止时**不会自己继续排队**——这是与「只是
跳过渲染但仍然每帧执行 JS」这类折中方案的关键区别：真正静止时连 `requestAnimationFrame`
都不会被调用，是彻底的零 CPU，不是「空转但成本很低」。

**脏源清单**（任一发生都会调用 `markDirty`）：

| 脏源 | 触发点 |
| --- | --- |
| 挂载 / resize | `mount()` 末尾的 `resize(instance)`；`ResizeObserver` 回调 |
| 选中部位变化 | `setActive()` |
| 部位状态变化 | `setStatuses()` |
| 悬停变化 | `buildLabelMap()` 里的 `pointerenter`/`pointerleave` |
| 拖拽中 | `onPointerDown` / `onPointerMove`（通过 `createOrbit` 的 `notifyDirty` 回调） |
| 滚轮缩放 | `onWheel`（同上） |
| 阻尼未收敛 / 入场巡航进行中 | `orbit.update(now)` 每次被调用时的返回值 `moving`（不需要单独
  调 `markDirty`——循环只要 `dirty` 为真就会持续自我排队，见 `startLoop`） |
| reduced-motion 媒体查询变化 | `reducedMotionQuery` 的 `change` 监听器 |
| 标签页从隐藏切回可见 | `document` 的 `visibilitychange` 监听器 |
| 3D 面板重新进入可视区 | `IntersectionObserver` 回调（见下文） |

### 收敛判定：逐项比较 + 一次性 snap

`createOrbit` 的 `update(now)`（`engine.js:311-392`）在每次被调用时，把 `theta`/`phi`/
`radius`/`targetX`/`targetY`/`targetZ`/`camera.fov` 逐项与各自的 `*Target` 比较，全部落在
各自的 epsilon（`ORBIT_EPS_ANGLE` / `ORBIT_EPS_DIST` / `ORBIT_EPS_FOV`）内、且不在拖拽、
入场巡航已结束，才判定为「收敛」。**收敛时把当前值一次性 snap 到 target**，再返回
`!settled`（`moving`）交给调用方：

```js
var settled = !dragging && !introCruiseActive &&
  Math.abs(thetaTarget - theta) < ORBIT_EPS_ANGLE &&
  ... // phi/radius/targetX/targetY/targetZ/fov 同理
if (settled) {
  theta = thetaTarget; // ... 其余同理，一次性 snap
}
return !settled;
```

**为什么必须 snap**：指数阻尼 `cur += (tgt-cur)*dampingFactor` 在数学上永远不会精确等于
`tgt`，只会无限逼近。如果不做「落在 epsilon 内就直接等于 target」这一步，`theta` 会永远
比 `thetaTarget` 差一个极小的量，`settled` 判断就永远是 `false`，循环因此永远认为「还在
变化」而持续重绘——epsilon 判定本身不 snap 的话形同虚设。

### 有限的入场巡航（替代无限自动巡航）

`mount()` 首次挂载引擎，以及切换 preset（切场景）时，会触发一段约 6.5 秒
（`INTRO_CRUISE_DURATION_MS`）的缓慢旋转（沿用原自动巡航的角速度
`INTRO_CRUISE_SPEED = 0.00016` 弧度/毫秒），展示机组的立体感，结束后自动停住——之后只有
用户拖拽 / 滚轮缩放 / 点部位才会再让相机动起来。这与旧版「idle 4 秒后自动巡航、永远转下去」
的本质区别：旧版无论如何都会在某个时刻开始转且永不停止；新版是"进入"这个动作本身触发的
一次性展示，转完就彻底停。

**触发时机（`engine.js:266-309` 的 `applyPreset`，以及 `createOrbit` 创建时）**：

- 引擎首次创建（对应页面首次挂载 3D）：`createOrbit` 内部直接调用 `startIntroCruise()`。
- 切换 preset（如 overview → station）：`applyPreset(name, animated)` 在 `animated &&
  !reducedMotion` 分支里调用 `startIntroCruise()`。
- **同 preset 内的重挂载不会重新触发**：`mount()` 里 `if (instance.preset !== options.preset)`
  的既有判断（第 9 章已有记录，保命条）天然把这个新增的巡航触发也保护住了——点击
  `[data-part]` 标签会触发一次完整 `render()`（= `detach()` + `mount()`），但 preset 没变，
  `applyPresetToEngine` 根本不会被调用，`startIntroCruise()` 也就不会被调用。**如果没有这层
  保护，每点一次部位就转 6.5 秒，等于变相回到永久渲染**——这是本章改造最容易被破坏的一条
  不变量，改动 `mount()` / `applyPreset()` 时务必保留这个判断顺序。
- `reducedMotion` 为真时 `startIntroCruise()` 直接 `return`（不触发任何自主镜头运动），
  运行时切换到 reduced-motion 也会立刻取消正在进行的巡航（`setReducedMotion`）。

### 3D 脉冲环 / 选中态高亮改静态

- **脉冲环**（`applyHotspotStatic`，`engine.js:497-504`）：不再逐帧动画，改成按状态取一个
  固定的 `scale`/`opacity`（`HOTSPOT.pulse.{ok,warn,danger}`），danger 比 warn 更显眼、
  warn 比 ok 更显眼。在 `setStatuses()` 里状态变化时算一次即可。`styles/05-pump3d.css` 的
  `.part-pin.danger .pin-core` 的 `@keyframes pinDangerPulse` 是 CSS 合成器驱动的动画，
  几乎零成本，且已经在表达同一个"危险在呼吸"的信号——两边分工明确：CSS 管 2D 标签的呼吸，
  3D 场景只管一个清晰的静态强调，不重复造一个永久脏源。
  **唯一仍然逐帧执行的部分**是 `updateHotspotBillboards`（`engine.js:509-513`）：脉冲环是
  billboard（贴着相机朝向），相机一动它就要跟着转——但这个函数只在 `startLoop` 真正决定
  渲染这一帧时才被调用，静止时不会执行，不是永久脏源。
- **选中态高亮**（`cacheAndApplySelection`，`engine.js:519-540`）：`emissiveIntensity` 改成
  选中时一次性设定的固定值（`HOTSPOT.selection.intensity`），不再逐帧按 `sin()` 振荡。
  取消选中时 `restoreSelection` 精确还原选中前缓存的原始 `emissive`/`emissiveIntensity`，
  这条机制本身未改动。

### 帧率上限与像素比

- **30fps 上限**（`FRAME_INTERVAL_MS = 1000/30`）：机械示意图不需要 60fps，交互中（拖拽/
  巡航）的渲染也节流到 30fps，用时间戳跳帧实现（`startLoop` 里 `now - engine.lastRenderTime
  < FRAME_INTERVAL_MS` 时只重新排队、不渲染）。
- **`MAX_PIXEL_RATIO` 从 2 降到 1.5**：视网膜屏 2x 超采样意味着 4 倍像素填充量，对这个用途
  不值。`resize()` 里"只在 DPR 真的变化时才写"的既有判断（第 6 章已有记录）保留不变——
  `setPixelRatio` 内部会连带 `setSize` 重新分配整个绘制缓冲，无条件重设会浪费。

### `IntersectionObserver`：面板滚出视口就停

RAF 循环原有的静默守卫（`!host.isConnected`、`document.hidden`、宿主尺寸为 0）覆盖的是
「场景不含 3D」「标签页隐藏」「布局塌缩」三种情况，但没有覆盖「host 仍
`isConnected`、标签页也可见，但 3D 面板被滚出了可视区」——这种情况下继续渲染同样没有
意义。`mount()` / `detach()` 里新增的 `intersectionObserver.observe(host)` /
`.disconnect()` 补上了这一条：滚出视口时 `engine.visible = false`，RAF 循环遇到
`!engine.visible` 直接 `return`（不重新排队）；重新滚入视口时的回调里 `markDirty()` 唤醒一次。

### `debugInfo()` 新增的可观测字段

```js
{
  ...,               // 原有字段（contextCreated / mountCount / renderCalls / triangles /
                      //           frames / preset / aspect / width / height）不变
  idle: !engine.dirty,                          // 当前是否处于静止不渲染状态
  introCruiseActive: engine.orbit.isIntroCruiseActive()  // 有限入场巡航是否仍在进行
}
```

`frames` 保持原有语义（`renderer.render()` 实际执行的次数）不变——按需渲染改造后，静止时
`frames` 应该完全不再增长，这正是 `verify_pump3d.py` 新增断言的核心验收点。

### ⚠️ 改动这一章时的唯一约束：不要引入新的永久脏源

任何在 RAF 帧内、不经过 `markDirty()` 就能让 `engine.dirty` 保持为真、或者绕开
`startLoop` 的静止判定直接调用 `requestAnimationFrame` 的代码，都是在重新制造一个永久
脏源——哪怕它看起来"只是读了一下 `now`"。判断一段新逻辑是否安全的标准很简单：**它是否
在有限时间内会让 `orbit.update()` 的 `settled` 判断变为 `true`，或者是否只在离散事件发生
时才调用一次 `markDirty()`**。逐帧插值 / 逐帧振荡 / "idle N 毫秒后开始做点什么但没有结束
条件"，这三种模式都会重新引入本章开头列的那类问题。
