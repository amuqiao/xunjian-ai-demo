# prototype-v2 场景开发共享契约

本文件是各场景 JS/CSS 开发的唯一契约来源。动手前请通读本文件,并可参考 `scripts/data.js`(数据结构)、`scripts/shell-ui.js`、`scripts/router.js`、`scripts/state.js`(API 注释)。

## 1. 项目背景

"巡检质量智能分析助手"参赛演示 demo 的新版原型 v2。纯静态单页(HTML/CSS/原生 JS),**通过 file:// 双击打开(不起 server)**。工业深色大屏,**分层钻取式导航**:指挥大屏总览 →(下钻)分析工作台 → 复检工作台 → 报告归档 →(退回)大屏看闭环。主线故事:计量区过滤器差压 72h 趋势逼近 0.1MPa 阈值,但巡检表单填写"正常",AI 发现冲突 → 复检 → 人工确认 → 报告归档。

## 2. 硬约束(违反即错误)

- **file:// 运行**:禁止 ES module `import/export`、禁止 `fetch` 本地文件。一律 IIFE + 全局对象。
- **只创建/编辑你负责的文件**。禁止改 `index.html`、`styles/base.css`、`styles/shell.css`、`scripts/{data.js,state.js,shell-ui.js,router.js,main.js}`。
- **不擅自加兜底**:不要 try/catch 吞错、不要默认值兜底、不要降级逻辑。数据缺失就让它报错(便于定位)。
- 注释用中文。数据一律从 `window.DEMO_DATA` 取,不得内联硬编码业务数据。

## 3. 场景容器与注册(自渲染模式)

`index.html` 里有 4 个空容器:`<section class="scene" data-scene="overview|analysis|recheck|report">`。
你的场景 JS 在 IIFE 顶层:
1. 取容器 `var root = document.querySelector('.scene[data-scene="analysis"]');`
2. 用 `DemoUtil.el(...)` 把静态 DOM 渲染进 root(一次性)。
3. `Router.register('analysis', { onEnter: function(ctx){...}, onLeave: function(ctx){...} });` —— onEnter 里做动态刷新(读 State、渲染趋势等)。

## 4. 共享 API

### window.DemoState —— 贯穿状态
- `get(k)` / `set(k,v)` / `patch({..})` / `subscribe(k,fn)`→unsub / `subscribe('*',fn)` / `reset()` / `snapshot()`
- 字段:`currentArea`('metering' 等,见 areas)、`selectedItem`('dp' 等)、`currentTrend`('filterDp' 等)、`frameKey`('current'|'compare'|'plc')、`decision`(''|'confirmed'|'false-positive'|'observe')、`archived`(bool)、`stepProgress`(0..4)、`maxScene`(0..3)。
- 跨场景联动一律走 State + subscribe,不要直接跨场景抓 DOM。

### window.Router —— 路由与转场
- `register(name, {onEnter, onLeave})`;name ∈ overview|analysis|recheck|report
- `go(name, {area?, direction?})`;direction ∈ 'drill'|'back'|'jump',不传自动推断(索引变大=drill 下钻,变小=back 退回)
- `current()` / `onChange(fn)` / `start()`
- `ctx = { from, direction, area, opts }`

### window.DemoUtil
- `el(tag, attrs, children)`:attrs 支持 `class`/`html`/`text`/`dataset`/`onClick` 等事件/普通属性;children 为字符串|节点|数组。
- `formatTrendValue(value, unit)`
- `renderTrend(container, seriesKey, {interactive?, onWindowClick?})` → `{latest,max,margin,marginText,quality,summary,title,unit,hasWindow}`。在 container 内渲染趋势 SVG(class `.trend-chart`)。**趋势 SVG 的内部样式已在 base.css 内置**,你只需给 container 定尺寸(建议 container 有明确高度)。`interactive:true` 时异常窗口可点击/回车,触发 `onWindowClick`。

### window.DemoUI
- `openDrawer(answerHint?)` / `closeDrawer()` / `setDrawerAnswer(text)`:全局 Agent 抽屉(固定问答已由外壳渲染,你只管打开)。
- `openImage(src, title)` / `closeImage()`:图片放大弹窗。

## 5. DEMO_DATA 关键字段(只读,勿改结构)

- `site` / `task` / `overviewMetrics[]` / `findings[]`(疑点卡,含 area/priority/title/desc/primary)
- `areas{metering,pump,plc,control,valve,ups}`:每项 title/sub/badge/badgeTone/trendKey/evidence/tags[]/flow/auxiliaryOnly
- `siteMap`:viewBox/route/riskDot/shapes[](area,points,label,lx,ly) —— overview 站场 SVG
- `inspectionRows[]`:item/no/area/device/check/result/hot —— 巡检项表格
- `trendSeries{...}`:title/unit/threshold/safeSide/min/max/quality/window/summary/points[]
- `itemDetails{...}`:evidence/tags/flow/trendKey/image
- `frameSources{area}{current|compare|plc}`:src/title/scene/label/showBbox
- `knowledge[]`:type/title/desc/source —— 复检知识依据
- `recheckChecklist[]`:text/auto;`recheckSummary`:trigger/relation/source
- `decisions[]`:key/label;`decisionStatus{}`
- `reportDrafts{pending,confirmed,false-positive,observe}`:main/bullets[]/handover
- `closedRate{}` / `caseTags[]` / `reportVersion` / `agentQA[]`
- `sceneOrder[]` / `railSteps[]` / `stepOrder[]` / `stepLabels{}`

## 6. 样式约束

- 场景 CSS 前缀命名空间:overview→`.ov-` / analysis→`.an-` / recheck→`.rc-` / report→`.rp-`。
- 可复用 base 类:`.panel .card .panel-title .tag(.hot) .action(.primary/.attention) .badge(.warn/.ok/.danger/.info) .num(.cyan/.amber/.green/.red)`。
- 大屏可读性:主信息 ≥18px(`var(--fs-strong)`),关键数字/结论 ≥26px(`var(--fs-key)`)。
- **状态不能只靠红绿**:必须同时有图标+文字(用 `.badge`)。
- token:`--cyan #58e4d2 --green #7fe391 --amber #f6b84b --red #ff6574 --text --muted --line-soft --panel`;`--dur-ui .2s --ease`。
- 每个场景应铺满 `.scene` 容器(`position:absolute; inset:0`),内部自行布局;避免整屏堆砌,突出该场景唯一视觉重心。

## 7. 场景职责边界(接口)

- **overview**:主 CTA / 点疑点卡 / 点计量区 → `Router.go('analysis', {area:'metering'})`。点其它区域 → `Router.go('analysis', {area:<key>})`。
- **analysis**:主 CTA "生成复检清单" → `Router.go('recheck')`;"查看依据" → `DemoUI.openDrawer()`;返回 → `Router.go('overview')`。
- **recheck**:选结论写 `DemoState.set('decision', key)`;"人工确认"(弹确认框,确认后)→ `Router.go('report')`。
- **report**:按 `DemoState.get('decision')` 渲染;"归档" → `DemoState.set('archived', true)`;"回到大屏" → `Router.go('overview', {direction:'back'})`。
- 闭环:report 归档后 overview 需响应(红点转绿、进度轴/闭环点亮)。overview 通过 `DemoState.subscribe('archived',...)` 与 `subscribe('decision',...)` 实现,不直接被 report 调用。
