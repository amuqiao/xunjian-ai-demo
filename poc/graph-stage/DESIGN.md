# graph-stage 设计说明

一句话主旨：知识图谱三页大屏——3D 环形展台、图谱搜索、文档搜索；**WebGL 只画几何，中文全部交给 DOM**，换课题只换一包数据，换配色只换一份主题文件。

> **本文第 1–5 章是冻结接口。** 所有实现任务都以这里的字段名、属性名、函数签名为准；实现中发现需要改动，必须先回来改本文，不许在自己的文件里另立一套。

## 文档职责

| | |
| --- | --- |
| **本文负责** | 渲染分工的推导、三张冻结接口表（数据契约 / DOM 命名 / 引擎 API）、三层 token 契约、硬约束 |
| **本文不负责** | 怎么跑、演示动线、文件职责清单——那些在 `README.md` |
| **参照物（只读，绝不修改）** | [`../kg_stage/`](../kg_stage/) 草稿版；[`../hunan-inspection-overview/`](../hunan-inspection-overview/) 与 [`../inspection-3d-sandbox/`](../inspection-3d-sandbox/) 质量标杆 |

---

## 1. 三条设计立场

### 1.1 WebGL 画几何，DOM 画中文

| 渲染器 | 负责 | **绝不**负责 |
| --- | --- | --- |
| three.js | 圆台桌面、地坪、台沿、外缘 N 段领域光弧、环境光 | **任何文字**。零 `TextureLoader`、零外部图 `drawImage`、零 CanvasTexture 文字 |
| DOM 投影层 | 全部卡片、标签、数字、统计板 | 任何几何形体 |

**理由**：展台上全是中文标签。烤成贴图会糊且贵，用 DOM 叠层投影则中文由 CSS 排版——锐利、可选中、可无障碍。`hunan-overview` 与 `sandbox` 的标签层本来就是这么做的，本 POC 只是把"标签"升级成"卡片"。

**推论（写进 `stage3d/contract.js` 文件头）**：卡片活在屏幕平面上，`transform` 只写 `translate3d(px,py,0)`。**"恒正面朝向观众"是这套架构的免费副产品**，不存在"卡片跟着圆周旋转"的可能。后来者不许给卡片加 `rotateY`。

### 1.2 固定视角，零 raycast

无 `OrbitControls`、不可拖拽、不可缩放。相机在 `mount()` 时施加一次 `FIXED_VIEW`。

遮挡关系因此是静态的，于是**全部命中交给 DOM**：canvas 设 `pointer-events: none`，7 段领域弧各配一个投影热点标签。所有可交互元素都是真实 DOM 按钮（`role="button"` + `tabindex` + `aria-label` + Enter/Space），一次性解决"固定视角下的命中检测"和"canvas 无障碍"。

连带决定：**展台无常驻 WebGL 动画**。氛围呼吸做在 DOM 层的 CSS 上，不消耗 WebGL 帧——这样 `debugInfo().idle` 会真的收敛到 `true`，`frames` 才可断言。

### 1.3 不用发光

禁 `filter: blur()`（远虚用明度不用模糊——DOM 卡片存在的全部理由就是中文锐利）、禁 `text-shadow`、禁 `box-shadow: 0 0`、禁 `UnrealBloom` / `EffectComposer`。

质感来自**明度层次 + 尺寸对比 + 统一光源方向的软阴影**，不来自辉光。由 `verify_tokens.js` 静态扫描执法。

---

## 2. 冻结表 A：数据契约

### 2.1 `scripts/kg/taxonomy.js` — 分类法唯一声明

**改层数、改类型名、改 id 格式，只改这一个文件。** 草稿版把它写死在两处（`kg-data.js` 的 `LEVEL_TYPE`、`kg-index.js` 的 `RE_HIER`），这是本次必须消除的病灶。

```js
window.KGTaxonomy = {
  levels: [
    { level: 0, type: "root",       label: "图谱根",   seg: null },
    { level: 1, type: "task",       label: "重点任务", seg: { prefix: "T", digits: 2 } },
    { level: 2, type: "direction",  label: "攻关方向", seg: { prefix: "F", digits: 2 } },
    { level: 3, type: "technology", label: "攻关技术", seg: { prefix: "K", digits: 2 } },
    { level: 4, type: "content",    label: "攻关内容", seg: { prefix: "C", digits: 2 } }
  ],
  facets: [
    { key: "domain",   type: "domain",   label: "技术领域",
      seg: { prefix: "D", digits: 1 }, rel: "domainOf", memberField: "domainIds" },
    { key: "business", type: "business", label: "业务",
      seg: { prefix: "B", digits: 1 }, rel: "bizOf",    memberField: "businessIds" }
  ],
  rootId: "root",
  idSep: "-",
  crossRels: ["supports", "relatesTo"]
};
```

| 字段 | 类型 | 语义 | 谁写 | 谁读 |
| --- | --- | --- | --- | --- |
| `levels[]` | 数组，长度 = 深度+1 | 主干层级表，`level` 严格递增且从 0 开始 | 数据 | `kg/contract.js` 派生正则；`kg-index.js`；`graph-model.js` |
| `levels[].seg` | `{prefix,digits}` \| `null` | id 段构成。`null` 仅根层 | 数据 | `contract.buildIdPattern()` |
| `facets[]` | 数组，0–4 个 | 横切维度。原 domain/business 的泛化 | 数据 | `kg-index.facetMembers()`；展台弧；图谱视角 |
| `facets[].rel` / `memberField` | string | 必须成对：`memberField` 是节点上的数组字段，`rel` 是派生出的边关系名 | 数据 | `kg-data` 展开器；`validate()` |

**派生规则**（`kg/contract.js` 实现，不写在数据里）：

```text
levels[1].id  = "T01"                    prefix + digits
levels[2].id  = "T01-F01"                父 id + idSep + prefix + digits
去掉最后一段 = 父 id                       （校验 parentId 必须与之一致）
类型枚举      = levels[].type ∪ facets[].type
层级色        levels[i] → var(--level-{i})
横切色        facets[j] → var(--facet-{j+1})
```

**元断言（`verify_taxonomy.js` 必含）**：把 `levels` 砍到 3 层后，`buildIdPattern()` 产出的正则**必须不再匹配** `T01-F01-K01-C01`。这条证明深度真的是数据。

### 2.2 `scripts/data/stage-composition.js` — 展台编排

**`10` / `3` / `7` 这三个数量在整个代码库里一次都不许出现**，全部由 `KG.index` 数出来。

```js
window.StageComposition = {
  camera:   { fov, position: [x,y,z], target: [x,y,z] },
  table:    { radius, height, rimWidth, segments },
  ellipse:  { a, b, centerY, centerZ, thetaSpanDeg, liftY },
  frontRow: { z, y, gapX },
  center:   { x, y, z },
  arcs:     { innerR, outerR, gapDeg, totalSweepDeg, y },
  slots: [
    { role: "trunk",   source: { kind: "level", level: 1 },        fields: ["name"] },
    { role: "feature", source: { kind: "facet", key: "business" }, fields: ["name","nodeCount","trend"] },
    { role: "center",  source: { kind: "stats" },                  fields: ["nodes","edges","docs"] },
    { role: "arc",     source: { kind: "facet", key: "domain" },
      weight: "memberCount", fields: ["name","memberCount"] }
  ]
};
```

| `role` | 摆在哪 | 卡片内容 | 数量来源 |
| --- | --- | --- | --- |
| `trunk` | 后方椭圆（近大远小） | **只有名称** | `KG.index.trunkRoots().length` |
| `feature` | 前排（最大最清晰） | 名称 + 节点数 + 迷你趋势 | facet `business` 成员数 |
| `center` | 中心悬浮板 | 统计数字 | 恒 1 |
| `arc` | 桌面外缘光弧 | 名称 + 成员数（弧长 ∝ 成员数） | facet `domain` 成员数 |

---

## 3. 冻结表 B：DOM 命名契约

仓库里已经占用了四组同类属性名——`data-area`（prototype-v3）、`data-map3d-area`（sandbox）、`data-hunan-zone|site`（hunan）、`data-node-id`（kg_stage 草稿）。本 POC 独占 `data-stage-*` 前缀，**不得复用上面任何一个**。

| 常量（`stage3d/contract.js` 导出） | 值 | 挂在哪 | 谁写 | 谁读 |
| --- | --- | --- | --- | --- |
| `HOST_ATTR` | `data-stage-host` | 3D 宿主容器 | `stage.js` | `engine.mount()` |
| `CANVAS_CLASS` | `stage-canvas` | WebGL canvas | `engine` | CSS（`pointer-events:none`） |
| `LAYER_CLASS` | `stage-projection` | DOM 投影层容器 | `stage.js` | `engine.syncProjection()` |
| `SLOT_ATTR` | `data-stage-slot` | 每张卡片，值 = slotId | `stage-cards.js` | `engine` 写 transform；`boot` 事件委托 |
| `ARC_ATTR` | `data-stage-arc` | 每个弧热点标签，值 = facetMemberId | `stage-cards.js` | 同上 |
| `ROLE_ATTR` | `data-stage-role` | 卡片，值 ∈ `trunk\|feature\|center` | `stage-cards.js` | CSS 分型；verify |

**断言**（`contract.js` 提供，`boot.js` 调用）：

- `assertDom(host)` — 宿主存在、非零尺寸、恰好一个 canvas、恰好一个投影层
- `assertPinNamespace()` — `[data-stage-slot]` / `[data-stage-arc]` 只允许出现在 `.stage-projection` 内部，落在外面即抛错
- `assertSlotKeys(slotIds)` — 投影层里的 slot 集合与引擎持有的锚点集合完全一致
- `assertTextureUntainted()` — 构建期确认零外部纹理。**不要包 try/catch**

> 为什么 `assertTextureUntainted` 必须 fail-fast：`file://` 下 origin 为 null，外部图做纹理会被标记污染，而 three r160 在 `WebGLState.texSubImage2D` 里把 `SecurityError` 吞成一行 `console.error` 后继续跑——渲染成纯黑且 `getError()` 不报任何错码。这是本仓库最痛恨的一类静默失效。

**CSS 侧不变量（继承 `../hunan-inspection-overview/styles/05-hunan3d.css`）**：

1. `.stage-canvas` 必须 `pointer-events: none`
2. `.stage-projection` 必须 `pointer-events: none`，其内部的卡片/热点各自 `pointer-events: auto`
3. **`[data-stage-slot]` 与 `[data-stage-arc]` 绝不许在 CSS 里设 `transform`，也不许设含 `transform` 的 `transition`** —— 引擎每帧写内联 transform，CSS 再写会拖尾
4. 宿主链路上不得出现 `overflow: hidden` 之外的裁剪，投影层与 canvas 必须同尺寸同原点

---

## 4. 冻结表 C：引擎公开 API

```js
window.StageMap3D = {
  mount(host, { composition, slots, arcs, activeSlotId, activeFacetId }),
  detach(),
  setActiveSlot(slotId | null),
  setActiveFacet(facetId | null),
  refreshProjection(),
  debugInfo()
};
```

`debugInfo()` 返回值——**这是整套投影层唯一的可测量出口，字段名冻结**：

```js
{
  contextCreated,          // WebGL 上下文创建次数，终生必须 === 1
  mountCount,              // mount 调用次数
  renderCalls, triangles,  // 渲染预算
  frames,                  // 累计帧数。切走后必须停止增长
  idle,                    // 是否已收敛（无待绘）
  width, height,           // 宿主内部像素（= 设计坐标尺度）
  slotCount, arcCount,
  hiddenBehindCamera,      // 落到相机背后的锚点数，应恒为 0
  cameraPosition,          // [x,y,z]，验证"固定视角"用
  arcs: { [facetMemberId]: { startDeg, sweepDeg } },
  projected: {             // ← 核心
    [slotId]: { x, y, scale, dim, dist, zIndex }
  },
  memory: { geometries, textures }
}
```

`mount()` 的入参形状：

| 参数 | 形状 | 说明 |
| --- | --- | --- |
| `composition` | `StageComposition` | 原样透传 |
| `slots` | `[{ id, role, anchor:[x,y,z] }]` | 锚点已由 `layout-solver` 算好，引擎不再算几何 |
| `arcs` | `[{ id, weight }]` | 弧长由引擎调 `allocateArcs` 分配 |

**三件相对 hunan 母本的新增行为**（必须写进 `engine.js` 文件头）：

- `--card-scale` 由 `camera.position.distanceTo(anchor)` 反比得出，**clamp 到 `[stage-scale-min, stage-scale-max]`**。clamp 破坏严格透视一致性，这是刻意取舍（可读性 > 物理准确），必须注释说明并被断言守住。
- `--card-dim` 同一距离归一化到 `[0,1]`，驱动 opacity 与文字对比度。**禁止用 `filter: blur()`。**
- `z-index` 按相机距离降序写。DOM 投影层是 2D 平面，`z-index` 在这里是唯一正确的层序工具——与 kg_stage 草稿"禁 z-index"那条不冲突，那条约束的是 CSS `preserve-3d` 场景，本 POC 没有。

---

## 5. 三层 token 契约

```text
styles/01-theme.css      主题层 · 唯一允许出现色值字面量的文件
                         --c-bg-900/800/700   --c-ink-100/300/500
                         --c-line-hair/strong --c-accent:#4EA8FF
                         --c-accent-a12/a24/a40
styles/02-semantic.css   语义层 · 骨架只准用这层；本层只准 var(--c-*)
                         --surface-panel/-card/-card-far
                         --text-title/-body/-dim
                         --border-hair/-strong --focus-ring
                         --accent-fill/-line/-text
                         --level-0..4  --facet-1..4
styles/03-geometry.css   几何 / 时长 / 层级 · 无色值
                         --radius-* --space-* --dur-fast/base/slow --ease-out
                         --z-canvas/-labels/-panel/-overlay
                         --screen-design-width/height
                         --stage-card-w/-h --stage-scale-min/-max --stage-dim-min/-max
styles/04..08            骨架 · 只准 var(--<语义层或几何层>)
```

**执法（`verify_tokens.js`，node 侧，会红）**：

1. `01-theme.css` 之外的任何 `styles/*.css` 出现 `#[0-9a-f]{3,8}` / `rgb(` / `hsl(` / `oklch(` → FAIL
2. `02-semantic.css` 里 `var()` 的实参必须全部匹配 `--c-*`
3. `04..08` 里 `var()` 的实参**不得**匹配 `--c-*`（骨架不许穿透语义层直连主题层）
4. 全仓扫 `filter:*blur(` / `text-shadow` / `box-shadow: 0 0` / `UnrealBloom` / `EffectComposer` → 命中即 FAIL

**层级色为什么是 `--level-N` 而不是 `--task`**：层级名是业务口径（换课题可能叫"设备/部件/测点"），颜色槽位不该跟着变。

---

## 6. 硬约束（每个实现任务都必须遵守）

1. **`../kg_stage/` 只读。** 迁移是"复制到新目录再改"，不是"移动"。
2. **`file://` 铁律。** 禁 `type="module"` / `import` / `export` / `fetch` / `XHR` / 动态 `import()`；全部经典脚本 IIFE 挂 `window.*`；数据一律 `.js` 字面量不许 `.json`；依赖只放本地 `vendor/`；three 侧禁 `TextureLoader`、禁对外部图 `drawImage`。
3. **不写 fallback / silent catch / 默认值吞错。** 参数非法或缺失直接 `throw`。`options.x || 默认值` 只允许用于纯装饰性旋钮（颜色、数量这类没有对错的）；凡关系到坐标换算是否成立的参数一律强校验。
4. **同层文件互不引用。** `<script>` 顺序 = 依赖顺序。
5. **三套坐标系不要混**：

| 坐标系 | 谁在用 | 关键性质 |
| --- | --- | --- |
| 设计坐标 1920×1080 | `#screen` 内一切布局、投影层写的 `translate3d(px,px,0)` | 基准 |
| 视口坐标 | `getBoundingClientRect()` / `clientX/clientY` | **被祖先 `transform:scale()` 缩过** |
| 3D 宿主内部像素 | `host.clientWidth/Height`、`renderer.setSize()`、投影出的 px | **不受祖先 scale 影响 → 本来就是设计坐标尺度，不要再除一次 `--screen-scale`** |

第三行是 `kg_stage/README.md` 第 4.6 节踩过的坑，换到 WebGL 上依然成立。护栏断言：

```text
projected[id].x * screenScale + screenOffsetX  ≈  rect(card).centerX   (±1.5px)
```

这条直接测量"是否多除/漏除了一次 scale"，是这个风险唯一有效的机械护栏。

---

## 7. 依赖分层与加载顺序

```text
L0 vendor   three.min.js(r160) → g6.min.js(5.1.1)
L1 契约     kg/taxonomy.js → kg/contract.js → stage3d/contract.js
L2 数据     data/kg-data.js → data/kg-index.js → data/stage-composition.js
L3 3D       stage3d/layout-solver.js → projection-math.js
            → model-table.js → model-arcs.js → model.js → engine.js
L4 core     core/{screen-scale,dom,timers,text,router}.js
L5 ui       ui/{panel,searchbox,list,statboard,sparkline,doccard}.js
L6 scenes   stage/{stage-cards,stage}.js
            graph/{graph-engine,graph-model,graph}.js
            docs/{tree-layout,tree-view,docs}.js
L7 boot     boot.js
```

`layout-solver.js` / `projection-math.js` / `tree-layout.js` / `graph-model.js` 是**纯函数、零 THREE、零 DOM**，node 侧可直接 `require` 单测。这是它们被单列的唯一理由。

---

## 8. G6 选型结论（规划阶段实测）

选 **v5.1.1**，UMD 单文件 `dist/g6.min.js`（1.38 MB），挂 `window.G6`。

| | v5.1.1 | v4.8.24 |
| --- | --- | --- |
| UMD 形态 | `e((t=globalThis\|\|self).G6={})` ✅ | `t.G6=e()` ✅ |
| 布局 | `d3-force` / `force-atlas2` / `radial` / `concentric` / `compact-box` / `dendrogram` 全在包内 | 同类齐全 |
| 拖拽回弹 | **内置行为 `drag-element-force`** | 需手写 fx/fy pin-release |
| `file://` 敌意 API | worker 仅显式开启才走；2 处 XHR 特性探测 getter | **硬编码外链 `https://preview.babylonjs.com/glslang/glslang.js` + wasm** |
| 维护 | 活跃 | EOL |

**风险隔离**：`window.G6` 只允许被 `scripts/graph/graph-engine.js` **一个文件**引用，其余代码只认适配层 API。翻车时改动面 = 1 个文件。

### 8.1 硬闸门实测结论（G1-T5，`file://` + Playwright，6 次重复）

| 项 | 实测 |
| --- | --- |
| `window.G6` + `new G6.Graph({layout:{type:'d3-force'}})` + `render()` | 通过，130 节点零异常 |
| 非 `file://` 网络请求 | **0**（包内两处 XHR 特性探测 getter 未触发真实请求） |
| `console.error` / `pageerror` / `new Worker` | 全程 0 |
| `preventOverlap` | 8385 对两两组合，最小中心距 **23.98px**，与理论值 `nodeSize(16)+nodeSpacing(8)=24` 吻合，违规 0 对 |
| 收敛耗时 | 默认 `alphaDecay:0.02` → **6060ms（太慢）**；调到 **`alphaDecay:0.05`** → 稳定 **2580–2620ms**，命中 1.5–3s 目标 |

**`drag-element-force` 的布局绑定，实测比预想更严重**：

- `d3-force` 布局下：松手后节点持续位移 >150px 并朝原位收敛（371.8 → 172.1），是真物理回弹
- `force` 布局下：**不是"松手不回弹"，而是拖拽全程完全不跟手**（位移 0.0px）。源码级根因：`drag-element-force` 的 `validate()` 硬编码检查 `["d3-force","d3-force-3d"].includes(layout.id)`，`force` 不在白名单，行为整体不生效
- 但**不是静默失效**：会打 `console.warn("[G6 v5.1.1] DragElementForce only works with d3-force or d3-force-3d layout")`。注意它是 `warn` 不是 `error`，**不会被"零 console.error"那条断言拦住**

**因此 `graph-engine.js` 的硬要求**：

```js
// layout.type 必须硬编码 'd3-force'，且初始化时强校验
if (layout.type !== "d3-force") throw new Error("…");
```

不许依赖 G6 自己那条 `console.warn` 来暴露问题——演示现场没人看控制台。推荐参数：`alphaDecay: 0.05`、`velocityDecay: 0.4`（后者对收敛耗时基本无影响，只影响回弹手感，觉得张力不够可降到 0.3）。`preventOverlap` 的最小间距 = `nodeSize + nodeSpacing`，不是半径和，接口换算按这个公式。

**文档页的树不用 G6**，自绘（SVG 连线 + DOM 节点）：严格树的 tidy layout 是确定性纯函数，约 200 行零依赖，node 侧可直接单测；塞进 canvas 只会把中文变糊、把高亮/键盘可达/文本选中都变难。降级路径：观感不达标时换 G6 `compact-box`，只改 `docs/tree-view.js`。

---

## 9. 验证纪律

沿用 [`../diagnosis-flow/verify/README.md`](../diagnosis-flow/verify/README.md) 的全部纪律：

- **一半篇幅是构造反例。** 只断言"合法数据能通过"是不够的——一个什么都不检查的空校验器同样能让那种断言全绿。
- **`expectReject()` 里 `mutate` 自身抛错记 FAIL**，不记 PASS——那说明反例构造得不对。
- **断言数是棘轮**，只许涨不许跌。
- **写完一条断言要能回答：如果这个功能坏了，它会红吗？** 答不上来等于没写。

浏览器验证一律 **Python 版 Playwright**，禁止直接调系统 Chrome headless（仓库 `AGENTS.md`：本机曾出现 Chrome 崩溃弹窗）。以 `file://` 打开且**不带** `--allow-file-access-from-files`，模拟真实双击。

console error 白名单用**窄字符串前缀匹配**，不要用 `startsWith('THREE.')`——纹理污染的失败正好以 `THREE.WebGLState: SecurityError` 开头，宽松匹配会把 `file://` 下最可能发生的 bug 直接藏掉。
