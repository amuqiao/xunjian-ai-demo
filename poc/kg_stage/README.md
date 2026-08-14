# 国家管网技术图谱 · 静态大屏演示 Demo（kg_stage）

单机静态演示页，三个页面：**展台首页** / **技术图谱看板** / **树形文档驾驶舱**。1920×1080 大屏科技风，纯 CSS 3D 展台 + 本地 ECharts。无构建、无框架、无 CDN、无网络请求。视觉参考图在仓库根的 `.data/国家管网技术图谱 1~4.jpg`。

## 1. 怎么跑

**双击 `index.html` 就能跑**，这是本 demo 的核心约束（详见第 5 节：全部脚本都是经典脚本，禁止 ES module 与 fetch）。

```bash
open demo/cc/kg_stage/index.html
```

也可以起 http 复测（行为应完全一致）：

```bash
python3 -m http.server 8080 --directory demo/cc/kg_stage
# 然后访问 http://localhost:8080/#/stage
```

### 路由协议

| hash | 说明 |
|---|---|
| `#/stage` | 展台首页（默认路由；无 hash 时自动 `replaceState` 到这里） |
| `#/graph?view=task\|domain\|business&focus=<nodeId>&from=<x>,<y>&t=<token>` | 图谱看板。`view` 缺省/非法归一为 `task`；`focus` 聚焦节点 |
| `#/docs?task=<taskId>&node=<nodeId>&doc=<docId>&view=task\|domain\|business` | 树形文档页。`task` 缺省回落 `T01` 并把 hash 规整一遍；可选的 `view` 记住"下钻前所在的图谱视角"，供文档卡「查看全图」原路返回 |

- `from` 是**转场起点的 1920×1080 设计坐标**（不是 CSS 像素），格式非法时静默丢弃。
- `t` 是单调 token（`Date.now()%1e6`），保证连点同一节点也能重新触发转场。
- 转场的视觉载荷（源色 / 源矩形 / 标签 / 类型）**不进 hash**，完全靠 `scripts/transition.js` 内部的 Promise 闭包向下传递（`KG.bus.stash/take/peek` 只是通用工具 API，转场本身不再使用，也不会往里写东西）。F5 刷新后闭包自然不存在 → 有 `from` 无闭包 → 自动降级为「无 ghost 的纯聚焦」，不报错。
- 全局 `Esc`：非输入框场景回 `#/stage`；`#graphSearch`（图谱搜索框）等原生 `<input>` 内的 `Esc` 是"清空/取消编辑"的常规交互习惯，不会被劫持跳页。
- `?debug`（放在 `?` 而不是 hash 里，如 `index.html?debug#/stage`）会在 console 打印 `KG.index.validate()` 与 `KG.index.stats`。

## 2. 演示动线（可直接当演示脚本念）

```
#/stage 展台
   ├─ 点后半圈「任务立牌」T01–T10  → #/graph?view=task&focus=T0x
   ├─ 点前排「业务悬浮牌」B1–B3    → #/graph?view=business&focus=Bx
   ├─ 点外圈「领域球」D1–D7        → #/graph?view=domain&focus=Dx
   ├─ 点中心装置（十大重点任务球）  → #/graph?view=task&focus=hub-task
   └─ 顶台三枚徽章（技术攻关/平台建设/人才发展）→ 分别跳 view=task/business/domain
#/graph 图谱看板
   ├─ 单击 task/direction/technology/content 节点 → #/docs?task=..&node=..&view=<当前视角>（260ms 去抖后下钻）
   ├─ 单击 domain/business/root 节点 → 原地聚焦，不下钻（这三类没有文档树）
   ├─ 双击任意节点  → 原地重新聚焦（不跳页，只 replace hash）
   └─ 左面板「查看详情」→ 下钻当前聚焦节点的文档
#/docs 树形文档
   └─ 玻璃文档卡右上「查看全图」→ #/graph?view=<下钻前的视角>&focus=<当前节点>
```

**逐步讲解**

1. **展台首页**。中央发光圆桌，桌上正中是「十大重点任务」中心装置（玻璃球 + 三层光块 + 双环 + 上升粒子 + 光柱），后半圈 10 张竖排任务立牌，桌前是三大业务的全息投影光锥，最外圈 7 颗技术领域球（正圆分布，半径 `--r-domain`），顶部小椭圆台带三枚徽章（技术攻关 / 平台建设 / 人才发展，鼠标点击或 Tab 聚焦后 Enter/Space 均可激活）。底部信息条默认显示 `图谱总览 414 节点 / 1619 关系 / 70 文档`。
2. **悬停任意立牌 / 领域球 / 业务牌**：物件抬升、底座光斑扩散，底部信息条切换为「类型 + 全称 + 摘要首句」。
3. **点击「管道失效与灾害控制」立牌**：光晕向内收缩、展台整体推近变亮 → 全屏白闪 + 横向光带扫过 → 落到图谱页，一枚带标签的幻影从立牌原位飞向目标节点并放大到 1:1（对齐误差 <0.001px 量级）→ 幻影淡出、目标节点弹出三圈涟漪，左侧面板同步显示该任务名称与摘要。连点同一节点会排队依次播完每一轮，不会丢也不会叠加；转场播放期间手动点顶栏导航离开，转场会检测到并放弃后续阶段，不会把用户拽回去。
4. **图谱页**。左侧玻璃面板可搜索（命中保持高亮、其余压到 12% 透明）、有图例（task/direction/technology 三色，`view=task` 下图谱本身不含 content 层）与「重置视图 / 查看详情」。画布可拖拽平移、滚轮缩放，主干边上有流光点在跑。domain/business/root 类型节点点击只原地聚焦，不会误下钻到无关文档。
5. **单击 task/direction/technology/content 节点** → 光晕收缩 + 白闪 → 树形文档页，右上玻璃文档卡从点击位置「生长」出来，且记住来源视角。
6. **树形文档页**。左栏 10 个重点任务（带搜索过滤），中栏是该任务的四级密集树（重点任务 → 攻关方向 → 攻关技术 → 攻关内容，四色图例）+ 面包屑，右上是玻璃文档卡（标题 / 标签 / 正文 / 支撑文献数）。同任务内切换节点，金色高亮会跟着切换，不会停留在旧节点上。
7. **点文档卡右上「查看全图」** → 回图谱页并按原来的视角（task/domain/business）聚焦该节点，形成闭环。顶栏「七大技术领域」「三大业务」可随时切到另外两个视角。

## 3. 文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 三页完整静态骨架 + CSS/JS 加载顺序。**DOM 结构已冻结**，只改 CSS/JS |
| `vendor/echarts.min.js` | 本地 ECharts 运行时（唯一第三方依赖） |

**styles/**（加载顺序 = 覆盖顺序）

| 文件 | 职责 |
|---|---|
| `tokens.css` | 色板 / 3D 几何 / 时长的**唯一真值源**，改这里的数值会真的生效（见第 4.7 节） |
| `base.css` | reset、`#screen` 等比缩放容器、`.page` 切页淡入淡出（非激活页额外叠加 `visibility:hidden`，见第 4.8 节）、滚动条 |
| `chrome.css` | 屏幕空间外壳：顶栏时钟、切角导航、发光主标题、左侧六边形晶体侧栏 |
| `stage-scene.css` | 3D 场景链路（`perspective` → `rotateX` → `preserve-3d`）与 `.o/.flat/.billboard/.wall` 四个姿态工具类（**已冻结**） |
| `stage-ground.css` | 展台 L0 背景 / L1 地面刻度环 / L2 领域球 / L3 三大业务全息投影 |
| `stage-objects.css` | 展台 L4 主圆桌 / L5 十张立牌 / L6 中心装置 / L7 顶台与徽章 |
| `fx.css` | 全站 `@keyframes` 真值源 + 通用氛围工具类 + `prefers-reduced-motion` 降级名单 |
| `graph.css` | 图谱页布局、世界地图底图、玻璃面板、图例、tooltip、涟漪脉冲 |
| `docs.css` | 文档页三栏骨架、任务列表、密集树容器、浮层玻璃文档卡 |
| `transition.css` | 转场视觉层：`.tr-halo/.tr-ring/.tr-flash/.tr-sweep/.tr-ghost/.tr-pulse` |

**scripts/**（`index.html` 里的 `<script>` 顺序即依赖顺序）

| 文件 | 职责 |
|---|---|
| `core/dom.js` | `KG.dom`：`h()` 构造器（支持 `vars` 写 CSS 自定义属性）、`qs/qsa/setVars/clear` |
| `core/scale.js` | `KG.scale`：写 `--s` 等比缩放、`toDesign()` / `rectToDesign()` 视口→设计坐标换算 |
| `core/bus.js` | `KG.bus`：事件总线 + `stash/take/peek` 内存暂存区（保留的通用 API，转场本身不再使用，见第 1 节路由协议说明） |
| `core/router.js` | `KG.router`：hash 解析/序列化、页面 `mount/update/unmount` 生命周期、全局 `[data-go]` 点击代理、六边形侧栏落点、`Esc` 返回（输入框内豁免） |
| `data/kg-data.js` | 唯一数据真值源，声明式定义展开成 `nodes/edges/docs/meta` |
| `data/kg-index.js` | `KG.index`：纯派生索引 + `validate()` 自检（只读，绝不改 `KG.data`） |
| `assets/worldmap.js` | `KG.assets.worldMapSvg`：Natural Earth 1:110m 离线抽稀成的内联 SVG 字面量 |
| `fx/particles.js` | `KG.particles.mount()`：确定性 LCG 粒子生成器，被 `layers-ground.js::buildStars()` 调用，用于展台星空 |
| `fx/clock.js` | `KG.clock.start()`：顶栏时钟逐秒刷新 |
| `stage/layers-ground.js` | 构建 L0 星空/地图注入 + L1 刻度环 + L2 领域球 + L3 全息投影；几何数值一律 `getComputedStyle` 读 token，不硬编码 |
| `stage/layers-objects.js` | 构建 L4 圆桌 + L5 十张立牌 + L6 中心装置 + L7 顶台徽章；同上，`cssNum()` 读 token 参与坐标运算 |
| `stage/stage.js` | 展台页路由注册、节点/徽章交互绑定（含键盘 Enter/Space）、底部信息条 |
| `graph/graph-layout.js` | 确定性种子布局：BFS 分层 + 旭日角度扇区 + 320 轮同步力导（不用 `Math.random`） |
| `graph/graph-option.js` | 图谱 ECharts option：CSS 变量解析成真实色值、symbolSize、分级边样式、流光边、tooltip |
| `graph/graph.js` | 图谱页实例编排、聚焦/搜索/重置/下钻（按类型判断是否可下钻）、`nodeScreenPos()` 转场坐标查询 |
| `docs/tree-option.js` | 密集树 ECharts option（四色分层、选中放大、标签截断） |
| `docs/docs.js` | 文档页任务列表/过滤、面包屑、树渲染（含同任务换节点的高亮刷新）、玻璃卡生长动画与「查看全图」（带 view 回跳） |
| `transition.js` | `KG.transition`：六阶段镜头感转场状态机，覆盖式排队 |
| `app.js` | 启动入口：`scale` → `clock` → 三页 `register` → `router.init()` → 置位 `__KG_READY__` |

## 4. ★ 关键工程约定（改代码前必读）

### 4.1 经典脚本，不是 ES module
`type="module"` 在 `file://` 下会被 CORS 拒绝，双击直接白屏。所以：**禁止 `import` / `export` / `type="module"` / `fetch` / `XHR` / 动态 `import()`**。每个 JS 文件是 IIFE，产物挂到 `window.KG.*`；数据和世界地图 SVG 一律是 `.js` 里的字面量。

### 4.2 `<script>` 顺序 = 依赖顺序
新增文件必须插到正确位置（依赖它的文件之后不行）。同层文件之间不互相引用：`core/*` 彼此独立，`stage/layers-*.js` 不知道 `stage.js` 的存在，`graph-layout.js` 不知道 `graph-option.js` 的存在。

### 4.3 展台 3D 坐标系
```
.stage-scene   perspective:var(--persp)，perspective-origin:50% var(--persp-origin-y)
 └ .stage-world  transform:rotateX(var(--tilt)) + preserve-3d
    ├ .layer-ground   纯分组容器，无 transform，只有 preserve-3d
    └ .layer-objects  同上
```
在 `.stage-world` 内部：**局部 X = 左右（右为正），局部 Y = 地面进深（+Y 靠近相机 / 前排），局部 Z = 离地高度（屏幕向上）**。所有物件只用 `--x/--y/--z` 定位，姿态由三个工具类给：

| 类 | 追加 transform | 用途 |
|---|---|---|
| `.o` | 仅 `translate3d(x,y,z) translate(-50%,-50%)` | 基类 |
| `.o.flat` | 无 | 躺地面：刻度环、光斑、投影，写正圆 + `border-radius:50%`，投影后自动成椭圆 |
| `.o.billboard` | `rotateX(var(--tilt-neg)) rotateY(var(--yaw,0deg)) translate(-50%, var(--anchor,-50%))` | 立起面向相机：立牌、领域球、悬浮牌、徽章、光锥、中心装置。`--anchor` 默认 `-50%`（锚点=几何中心），需要"以底边为锚点"的宿主（立牌、徽章支柱、光柱）声明 `--anchor:-100%` 复用同一份公式，不必各自手写 |
| `.o.wall`（当前全站零调用方，仅作正确模板保留） | `translate(calc(var(--w,0)*-0.5px),calc(var(--h,0)*-0.5px)) rotate(var(--a,0deg)) translateY(calc(var(--r,0)*-1px)) rotateX(90deg)` | 环形侧壁分段的公式模板；圆桌 16 段 / 顶台 8 段目前仍各自手写同款公式，未收敛到这个类上 |

### 4.4 四条 3D 禁令
1. `.stage-scene` 与 `.stage-world` 之间、以及任何还挂着 3D 子节点的**中间层**，不得出现 `overflow:hidden` / `filter` / `opacity<1` / `mask` / `backdrop-filter` / `will-change:opacity` —— 任意一个都会把后代压平成 2D。这些只允许写在**叶子**上。
2. 不得手工 `scale()` / `offsetX` 做对齐，位置只用 `--x/--y/--z`。
3. 不得用 `z-index` 解决遮挡。遮挡由 `preserve-3d` 深度排序负责；遮挡错了说明 `--y`（或 `--z`）给错了。
4. 每个 3D 分组容器都要 `transform-style:preserve-3d`，链路不能断。

> 踩过的坑：`--h-badge` 一度大于 `--h-stand-foot(120)`，徽章在真实深度排序里跑到立牌前面，把 T04–T07 四张立牌的可点击命中率压到近 0。修法是降低徽章世界高度 + 沿 `--y` 后推到 `-160`，**不是**加 `z-index`。

### 4.5 `@keyframes` 真值源
`styles/fx.css` 是唯一真值源，其他文件只准用 `animation:` 引用名字。唯一约定的例外是 `transition.css` 里 `tr` 前缀的转场专用帧（`trFlash` / `trSweep`）。`fx.css` 同一节还维护着 `prefers-reduced-motion:reduce` 的降级名单：新增任何 `animation:` 消费方，都要顺手把对应选择器（含伪元素）补进这份名单，否则降级模式下会漏关。

**transform 兼容约定**（CSS 规则：keyframes 里出现过的属性，动画期间完全由 keyframes 决定，静态声明被整体替换而不是叠加）：

- `spin` / `orbitSpin` 需要动 `transform`，因此必须把宿主的静态定位 transform 一起重写。做法是「CSS 自定义属性做静态基座 + `var()` 兜底」：`transform: var(--spin-base, <默认 .o.flat 基座>) rotate(…)`。宿主若靠 `inset:0` 撑满父盒、自身不需要 translate，就显式设 `--spin-base: ;`（空值，**不能写 `none`**）。
- `pulse` / `rayPulse` / `coneBreathe` / `scanShift` **只准动 `opacity` / `filter` / `background-position`**，绝不能动 `transform`。若宿主自带静态 `filter:blur()`，用 `--pulse-blur` / `--cone-blur` 把它带进关键帧。
- `rise`（中心装置上升粒子）可以自由用 `transform`，因为宿主用 `left/top` 定位、没有静态 transform 要保留。粒子上升必须用 `translateZ` 而不是 `translateY`，否则方向会跟着地面倾角歪掉。

### 4.6 三套坐标系不要混
| 坐标系 | 谁在用 | 换算 |
|---|---|---|
| 设计坐标 1920×1080 | `#screen` 内一切布局、`#trLayer` 里的转场元素、hash 里的 `from` | 基准 |
| 视口坐标 | `getBoundingClientRect()` / `clientX/clientY` | `KG.scale.toDesign()` / `rectToDesign()`（减 `#screen` 原点再除 `--s`） |
| ECharts 本地坐标 | `chart.convertToPixel()` 的返回值 | **已经与设计坐标同尺度**，不要再除 `--s` |

第三行是关键：`elChart.clientWidth/clientHeight` 不受祖先 `transform:scale()` 影响，所以 ECharts 内部像素本来就是设计坐标尺度。正确写法见 `graph.js::nodeScreenPos()`：只把 `elChart` 左上角的视口坐标 `toDesign()`，再直接加上 `convertToPixel` 的结果；`nodeScreenPos()` 在 `setOption` 返回后立刻同步准确（`applyOptionStable()` 保证），不需要调用方轮询或逐帧追踪。

### 4.7 `tokens.css` 是唯一真值源，改了真的会生效
尺寸 / 颜色 / 时长不要在别处写死数字。`tokens.css` 里的几何 token 分两类，改动生效的时机不同：

- **纯 CSS 消费**（如 `--r-table`、`--h-table`、`--h-topbar`、`--w-hexrail`）：只在样式规则里被 `var()`/`calc()` 引用，运行期改 `document.documentElement.style.setProperty(...)` 立即生效，不需要刷新页面。`--h-topbar`/`--w-hexrail` 是新增的布局 token，被 `chrome.css`（顶栏高度/侧栏宽度）与 `graph.css`/`docs.css`（各自的 `--graph-top`/`--docs-top` 等派生变量）同时引用，改一处三处联动。
- **构建期读取一次**（如 `--r-stand`、`--r-domain`、`--h-slab-1/2/3`）：JS 侧（`layers-ground.js`/`layers-objects.js`）在 `mount()` 时用 `cssNum()` 读一次参与坐标运算，结果以内联 `--x/--y/--z` 写回元素——运行期改 token 不会移动已经建好的 DOM，需要重新加载页面（下一次 `mount()`）才会体现在新坐标上。这是预期行为，不是 bug；JS 侧不允许再抄一份数字常量，必须用 `cssNum()` 读。

无论哪一类，**改 token 都会真的生效**，不存在"改了没用"的死链路——这是可以依赖的约定。

### 4.8 非激活页面停止渲染
`.page` 非激活态叠加 `visibility:hidden`（延迟切换，等 opacity 淡出动画播完才切，避免跳变），激活态立即切回 `visible`。展台切到图谱/文档页后，星空 / 刻度环 / 光块 / 徽章等一切动画停止参与合成与样式重算，不会在后台空跑吃 CPU/GPU。

## 5. 数据

**`scripts/data/kg-data.js` 是唯一需要改的数据文件。** 当前规模：**414 节点 / 1619 边 / 70 篇文档**（T01–T10 全部完整展开，每个任务 3 方向 × 3 技术 × 3 内容）。

### 层级与 id 规范

```
root ─┬─ hub-task   ─ task(10) ─ direction(30) ─ technology(90) ─ content(270)
      ├─ hub-domain ─ domain(7)      （通过 domainOf 边横向连到 task / technology）
      └─ hub-biz    ─ business(3)    （通过 bizOf   边横向连到 task / technology）
```

| 层 | `type` | `level` | id 规范 | 示例 | 数量 |
|---|---|---|---|---|---|
| 根 / 三个视角中心 | `root` | 0 | `root` / `hub-task` / `hub-domain` / `hub-biz` | — | 4 |
| 重点任务 | `task` | 1 | `T\d{2}` | `T03` | 10 |
| 攻关方向 | `direction` | 2 | `T03-F01` | `F`=方向 | 30 |
| 攻关技术 | `technology` | 3 | `T03-F01-K02` | `K`=技术 | 90 |
| 攻关内容 | `content` | 4 | `T03-F01-K02-C01` | `C`=内容 | 270 |
| 技术领域 | `domain` | 1 | `D[1-7]` | `D6`=数字化与智能化 | 7 |
| 三大业务 | `business` | 1 | `B[1-3]` | `B1`=储气库 | 3 |

**去掉 id 最后一段 = 父 id**，`parentId` 必须与之一致（`validate()` 会查）。文档不是节点，而是独立的 `docs` map（key 形如 `DOC-T03-F01-K01`），节点通过 `docId` 关联；`KG.index.docOf(id)` 会沿 parent 链向上找到最近的一篇。

### 边

`{ s, t, rel }`，`rel ∈ contains | supports | relatesTo | domainOf | bizOf`。

- `contains`（413 条）由 `parentId` 自动派生，构成**严格树**（每个非 root 节点恰好一条入向边）。
- `domainOf`（653）/ `bizOf`（473）由节点上的 `domainIds` / `businessIds` 自动派生，**不要手写**。
- `supports`（49）/ `relatesTo`（31）是手写的横向张力边，写在 `CROSS_EDGES` 里。

### 三视角：换边不复制节点

`KG.index.edgesFor(view)` / `nodesFor(view)` 对同一份数据做投影，**不复制任何节点**：

- `view=task` → 以 `hub-task` 为根，取 task/direction/technology **三级**的 `contains` 边 + 两端都在集合内的横向边（`content` 层不进图谱，只在文档页密集树出现——图谱页图例天然只有三色，不是 bug）。
- `view=domain` → 以 `hub-domain` 为根，用 `domainOf` 把 task 与 technology 重挂到 7 个领域下。
- `view=business` → 同理走 `bizOf`。

结果按 view 缓存，同一 view 多次调用返回同一份（数组会复制后返出，可随意 sort/push）。图谱页点击节点下钻文档，只对 `task/direction/technology/content` 四类节点生效（`graph.js::DOCS_DRILLABLE_TYPES`）；`domain/business/root` 没有对应文档树，点击只原地聚焦。

### `KG.index` API

| 成员 | 说明 |
|---|---|
| `byId` | id → node 字典 |
| `nodeOf(idOrNode)` | id 或节点对象归一为节点 |
| `childrenOf(id)` / `parentOf(id)` / `pathOf(id)` | `contains` 树的直接子 / 父 / 从 root 到自身的路径 |
| `descendantsOf(id)` / `depthOf(id)` | 全部后代（DFS 序）/ 树深度 |
| `subtree(id, maxLevel?)` | 生成 ECharts tree 需要的嵌套 `children` 结构 |
| `nodesFor(view)` / `edgesFor(view)` | 三视角投影 |
| `search(q, limit=20)` | 按 name/short/keywords/summary 分档打分，同分按类型层级排序 |
| `docOf(id)` | 沿 parent 链向上找最近的文档 |
| `colorOf(id)` / `labelOf(id)` | 返回类型对应的 CSS 变量名 / 中文类型名 |
| `stats` | `{nodes, edges, docs, tasks, domains, businesses, directions, technologies, contents, maxDepth, byType, byRel}` |
| `validate()` | 返回错误数组，**全绿时必须是 `[]`** |

### 换数据的操作步骤

1. 只改 `scripts/data/kg-data.js`：任务树改 `TASK_TREE`（照抄 T01 的字段写法），领域/业务改 `DOMAIN_RAW` / `BIZ_RAW`，文档改 `DOCS_RAW`，横向边改 `CROSS_EDGES`，并同步 `KG.data.meta.tasks/domains/businesses`。
2. 不能破的不变量：id 格式合法且父子前缀闭合；`parentId` 与 id 推断一致；`taskId` = id 前 3 字符；`weight ∈ [1,6]`；必填 `id/type/level/name/short/summary`；`docId` 指向真实存在的 `docs` key；`domainIds/businessIds` 指向真实的 `D*/B*`；`contains` 单父、无环、全部可从 `root` 到达；每篇文档有 `title` 与 `paragraphs`。
3. 自检：浏览器打开 `index.html?debug#/stage`，console 里 `KG.index.validate()` 必须是 `[]`；或跑 `tools/screenshot.py`（见第 6 节），断言 file-5/http-5 会自动校验。
4. 数据量变化后记得复核展台：立牌固定 10 张、领域球固定 7 颗、业务牌固定 3 块，这三个数量是硬编码在展台布局里的（角度表写死），加任务/领域需要同步改 `layers-ground.js` 的 `DOMAIN_ANGLE_DEG` 与 `layers-objects.js` 的 `standAngles()`。

## 6. 验证

**自检入口**：`index.html?debug#/stage` → console 打印 `validate()` 与 `stats`；`window.__KG_READY__ === true` 表示三页已注册且首个页面已 mount 并过了两帧 rAF。

**自动化回归**：`tools/screenshot.py`，Playwright 驱动，共 51 项断言。

```bash
python3 tools/screenshot.py                 # 完整跑一遍（含帧率、后台重绘采样、截图），约 1~2 分钟
python3 tools/screenshot.py --skip-fps       # 跳过断言 26/32（必须 headed，较慢）
python3 tools/screenshot.py --fps-only       # 只跑断言 26/32
python3 tools/screenshot.py --shots-only     # 只截 5 张关键图，不跑断言
```

断言覆盖范围（按编号分组，详细文案见脚本内 `record()` 调用）：

- **1~6**：`file://` 与 `http://` 两种打开方式下的标题、零 console 错误、`__KG_READY__`、零外部请求、`validate()===[]`、数据规模。
- **7~9**：`.stage-world` 保持 `matrix3d`（未被压平成 2D）、3D 链路无违规属性、`@keyframes` 定位回归（旋转/静止/粒子上升分别校验）。
- **10~11**：展台 21 个 `[data-node-id]` + 3 枚徽章逐一 `elementFromPoint` 命中自身。
- **12~19**：完整动线（立牌→图谱→文档→查看全图→领域球/业务牌→Escape→六边形侧栏→顶栏导航 active 态唯一性）。
- **20a~24**：转场机制——起点/终点对齐、飞行轨迹平滑、`nodeScreenPos` 稳定性、F5 直达降级、覆盖式排队、reduced-motion 降级。
- **25~27**：三种视口比例、帧率（断言 26，必须 headed）、十棵树互不重叠。
- **28~42**：本轮新增的回归点——运行期/构建期两类 token 是否真的生效、领域球正圆、星空确定性、后台停止重绘（断言 32，必须 headed）、徽章键盘可达、Escape 输入框豁免、domain/business 不误下钻、下钻带视角回跳、玻璃卡生长方向公式复算、同任务换节点高亮刷新、Esc 不被延迟计时器拽走、转场不被手动导航覆盖、图例四色。

**已知的独立回归**（断言 `new1`，不在上述编号里，只报告不修）：从展台点击进入图谱页、返回展台后，再次点击**同一视角**下的任意节点（哪怕是不同节点），转场会卡死——ghost 不出现，hash 永久残留 `from=`/`t=`。根因是 `transition.js` 里 NAVIGATE 之后立刻做的 `currentPageName()` 校验，在图谱页该视角已经渲染过、`nodeScreenPos` 无需等待即可同步取值时，会抢在原生 `hashchange`（宏任务）被处理之前用纯微任务链执行完，读到还没被刷新的旧页面名，误判成"用户已手动导航离开"而提前中止整套转场。首次进入某个视角、或视角本身发生切换时不会触发（因为这两种情况下 `nodeScreenPos` 都需要真正等待一次布局计算，天然让 `hashchange` 有机会被处理）。

**手动巡检清单**

- 展台 hover 立牌：整块抬升、底座光斑扩散，无跳动 / 无重排。
- 后排领域球被圆桌**自然遮挡**（不是用 `opacity` 假装）。
- 桌沿流光跑马线接缝无断点；16 段侧壁看不出多边形棱角。
- 中心装置粒子上升严格竖直（歪了 = 误用了 `translateY`）。
- 三枚顶台徽章不遮挡任何立牌，且 10 张立牌鼠标都点得到（曾经的高发故障点）。
- 转场：光晕收缩起点 = 被点节点，幻影飞入终点 = 图谱目标节点，误差应在几像素内（连点同一视角下的节点见上方 `new1`）。
- 在 `#/graph?...&from=…&t=…` 上按 F5：不报错、不重播转场，只做纯聚焦。
- 展台空闲态 ≥ 50fps（不达标先砍中心装置粒子数与背景星点数）；切到图谱/文档页后展台应停止后台重绘。

## 7. 已知限制 / 取舍

- **固定 1920×1080 设计稿 + 整体 `scale()` 适配**。非 16:9 视口会出现留白；浏览器缩放和系统字号放大会连同布局一起被缩放，无法只放大文字，这是该方案的固有限制。
- **图谱与树图是 ECharts canvas，屏幕阅读器读不到**。展台的立牌 / 领域球 / 业务牌 / 徽章是真实 DOM，带 `role="button"` + `tabindex` + `aria-label`，可 Tab + Enter/Space 操作。
- **图谱整图刷新的那一帧强制关掉了 ECharts 入场动画**（`applyOptionStable()` 先 `animation:false` 落定、下一帧再补回 `true`），代价是切视角时没有入场动画（hover / roam 等交互动画不受影响）。
- **图谱页两段式 `Esc`（先取消聚焦、再回首页）没做**，`Esc` 一律直接回 `#/stage`（输入框内豁免）。
- **同视角二次转场的竞态**：见第 6 节 `new1`，从展台重复进入同一个已经渲染过的视角会卡死转场，是本轮验证阶段新发现的独立缺陷，尚未修复。
- **不做真 3D / WebGL / Three.js**。展台是纯 CSS 3D + SVG + 少量 canvas（仅 ECharts），换取零构建、零依赖、双击可跑。
