# diagnosis-flow-v2 · 巡检诊断台

`diagnosis-flow` 的重做。主线收敛成三步：**诊断工作台 → 人工复核 → 知识库**。

与 `hunan-overview-v2` / `inspection-station-v2` 那两个 v2 目录**不同**：那两个只重排表现层，
数据层和 3D 层是相对路径引用旧目录原文件。**本目录连数据层一起重写**——因为旧的领域契约
和业务方给的真实素材对不上（见下一节）。只有 ECharts 和四张站内定点摄像头关键帧引用旧目录。

```
index.html                    加载顺序
domain/                       7 份领域契约（约 950 行）——★ 重写，不是复用
  01-station.js               站场 / 三个部位（= 三个真实机位）/ 一个测点
  02-vision.js                五帧，每帧对应一个具体机位与时刻 + bbox
  03-series.js                时序生成器，末点钉死在现场读数
  04-records.js               四条记录 + 变长分型的依据链 + 事件时间线 + 缺项清单
  05-review.js                结论 / 复核人 / 常用语
  06-report.js                报告模板 + 插槽
  07-kb.js                    知识库资产 + Agent 语料
styles/                       5 片（tokens / shell / cards / scenes / report）
scripts/core/                 dom · screen-scale · charts · chartopts · report · state
scripts/ui/                   overlay · evidence · reportview · agent
scripts/scenes/               workbench · review · knowledge
scripts/boot.js               render 管线 + 事件委托 + 定时器
tools/report-template.html    A4 排版模板（被 build_report.py 打印）
tools/build_report.py         构建两份 PDF
verify/verify_flow.py         57 项断言
media/site-photos/            业务方补充的 4 张现场人工巡检照
assets/reports/               预构建的两份 PDF
```

## 一、素材对齐——这是重做的全部理由

业务方给的四张站内定点摄像头关键帧，**OSD 时间戳是连续的、机位依次推进**：

```
20:01:55  长郴-湘潭站-P-4泵棚-B-R
20:10:26  长郴-湘潭站-P-4泵棚-B-R   （同机位，晚 8 分 31 秒）
20:13:39  低压配电室
20:18:35  PLC 机房（IPC 鱼眼）
```

横跨 16 分 40 秒——**这本身就是一条真实的巡检动线**。所以本版反过来：先认素材，再定部位与
表单项（用户明确授权表单项可改）。

旧目录是先写部位再找图配，结果：

| 旧目录的问题 | 证据 |
| --- | --- |
| 三条记录共用同一帧 | `05-diagnosis.js` 里 REC-001/003/005 的 vision 都指向 `FRM-1-CUR` |
| 帧的 label 与画面不符 | 写着「P-3 泵状态」，而画面上标的是 **P-7** |
| 两个测点没有对应的检查项 | 「泵体温度 75℃」「控制回路电源状态 **88%**」——没有任何检查项叫这个名字 |
| 目视项配了温度曲线 | 「油位与外观」的 series 接到 PT-2 泵体温度 |
| 计划提醒配了压力曲线 | 「大修前重点巡检」的 series 接到 PT-1 |

**本版的四条记录**：

| 记录 | 部位（真实机位） | 检查项 | AI 质检 | 依据链（长度分型） | 真图 |
| --- | --- | --- | --- | --- | --- |
| REC-1 | P-4 泵棚 | 出口管线压力 9.3MPa | 重点复核 | **4 枚** series · vision · rule · case | `pump-current` |
| REC-2 | P-4 泵棚 | 泵机组运行与渗漏 | 已闭环 | **2 枚** compare · rule | `pump-current` + `pump-compare` |
| REC-3 | 低压配电室 | 柜面表计及指示灯 | 重点复核 | **3 枚** timeline · vision · rule | `power-current` |
| REC-4 | PLC 机房 | 机柜门禁与设备分区 | 记录缺项 | **3 枚** gaps · vision · rule | `plc-current` |

**依据链是变长且分型的**，这是核心改动。旧版给每条记录都配固定 4 枚芯片
（series+vision+rule+case），不管检查项是什么性质——这就是"太假"的根源。本版按性质分：

| 检查项性质 | 证据形态 | 占空间 |
| --- | --- | --- |
| 数值 + 有标准 | **series** 时序曲线（高报警 9.0 / 高高报警 9.8 两条线 + 越线阴影） | 大 |
| 同点位前后变化 | **compare** 真实的同机位两帧并排 | 中 |
| 开关量故障 + 处置 | **timeline** 事件时间线（发现→排查→紧固→复测） | 小 |
| 记录缺项 | **gaps** 表单缺项清单 | 小 |
| 目视 / 门禁 / 分区 | **vision** 关键帧 + bbox + 识别项 | 中 |
| 判定口径 | **rule** 规则卡 | 小 |

**只有 1 条记录需要曲线**——这就解决了「右栏放不下所以做成整屏子屏」那个问题：右栏放不下的
真正原因是给每条都硬塞了一张图。

时序只剩 `PT-1` 一个测点，**末点钉死在 9.3MPa = 记录里的现场读数**（越过高报 9.0、未到高高报
9.8），`assertAnchor` 级的断言在验收脚本里（`时序末点 === 现场读数`）。

## 二、屏数：3 页 + 2 整屏子屏 → 3 页 + 统一浮层

时序/视觉从整屏子屏降级成右栏的**证据台**，需要细看时点「放大」进浮层（与归档浮窗同一套
外观）。不再整屏接管 `stage`、不再需要「返回工作台」。

`scripts/ui/evidence.js` 是同一个组件同时供证据台和放大浮层使用——各写一份必然分叉
（旧目录的时序详情子屏和工作台时序卡就是各写一份，切时间范围时一个动一个不动）。

## 三、清掉的死结构

| 死的东西 | 证据 |
| --- | --- |
| 6 步流程轨 | `index.html` 里没有 `#flowTrack`，`renderFlow()` 每次第一行 `if (!flowTrack) return;` |
| `META.flowSteps` + `flowVisited` + `markFlowStep()` | 21 处引用，全部为了喂那条不渲染的轨 |
| 固定画布缩放 | `screen-scale.js` 算 `--screen-scale`，但 `.app-shell` 没有任何 `transform: scale()`——变量全库只有 `01-tokens.css` 定义过一次 |
| 导航 locked 态 | `canOpen()` 恒 `return true`，`title`「完成人工复核的执行动作后解锁」永远不出现 |
| `11-responsive.css` 687 行 / 10 断点 | 只有这个 POC 有；本版改用真固定画布后整份删除 |
| `open-ai-list` action | boot.js 有分支，场景层没有任何元素触发它 |
| 工作台的 AI 判断浮层 | 首屏是关着的，要先点一行才弹；关掉后没有按钮能再打开 |

**AI 判断搬上主屏**：旧版首屏只有一张 4 行表 + 「共 4 条」，一屏 90% 是空白，而结论、置信度、
依据链全在浮层里。本版是第二栏的常驻内容。

导航从"假锁 + 不渲染的 6 步轨"换成**主线三步 + 可派生的完成态**：
① 看过证据 ② 选了结论 ③ 已归档，都是派生的，不存字段。

## 四、归档报告：屏上所见 = 下载所得

浮窗左侧是 **HTML 按 A4 版式渲染**的报告预览，右侧是归档去向 + 「在新标签打开 / 下载 PDF」。

三条决定，都基于实测：

- **不内嵌 PDF**：实测 headless Chromium 没有 PDF 插件，`<embed type="application/pdf">` 只显示
  `Couldn't load plugin.`。真实 Chrome 能显示，但那意味着验收脚本永远验不到预览真的画出来了。
- **不用静态页图**：页图是构建时固定的，而复核结论是现场选的——改判后报告会多一段
  「复核分歧说明」，页图却不会变，"屏上所见 ≠ 下载所得"当场能被看出来。
- **PDF 构建两份**：`accepted`（6 段无分歧）与 `divergent`（7 段含分歧说明）。场景层按当前是否
  分歧挂对应那份。`build_report.py` 会断言"分歧态与剧本相符"，对不上直接中止——否则会静默
  产出两份一样的内容。

A4 版式在 `styles/05-report.css`，**PDF 模板和屏上预览 link 同一份**，版式不会各自漂移。
报告第 2 页配了业务方给的现场巡检照。

**报告内容与记录咬合**：旧目录 `assets/reports/` 那份占位 PDF 写着「本轮未发现已填报异常」
「结果均为正常」，而工作台第 106 项是「9.3MPa 已越过高报警」——内容对不上，讲完就露。
本版的报告从 `ReportModel.resolve()` 出，插槽全部来自当前记录与复核结论。

复核意见**逐字进报告正文**（`{{reviewNote}}` → 第 2 页「三、人工复核意见」绿框），这是
"人工介入产生后果"唯一能演出来的地方，验收有专门断言。

章节编号是**派生**的：第一版把「三、」「五、」写死在标题里，无分歧时中间跳号，打出来的
PDF 上肉眼可见。

## 五、常驻 AI 助手

三页都有右下角悬浮按钮（按需求，这是刻意的常驻设计，不是三处重复入口）。**入口只有这一个**：
第一版在知识库页右栏又放了一个常驻问答面板（1000px），结果两个入口指向同一件事、画面上还
挨着重叠。现在右栏撤掉、整幅宽度让给资产清单，「归档前如实说报告还没入库」那段状态感知逻辑
搬进 `scripts/ui/agent.js`，三页抽屉共用一份判断。

**抽屉占半屏**（固定画布 2471px 取一半 = 1236px）。660px 那一版太窄：预设问题挤成一列窄条、
答案气泡压成 20 多行长条，投出来读不完一屏。宽了之后不能再上下堆四段——问题列表移到左栏
（372px）占满高度，右栏整条给对话流 + 输入框，否则 4~5 个问题一排开，对话流剩下的高度反而
比窄抽屉还少。对话贴着输入框往上长（`align-content: end`），「我」的气泡靠右。

自由输入框做成 `disabled` + 明确提示「本演示只回答上方预设问题」。本 POC 没有真实模型，
做成能打字但回一句套话不如直接说清。

Agent 引用有状态感知：「有没有同类案例」那一问在归档前会**如实说报告还没入库**，归档后才
引用它——而不是照样给一个引用（那会变成"AI 引用了一篇还不存在的文档"）。

### 业务方给的三条高频问答落在哪

| 业务方原话 | 落成资产 | 落成问题 |
| --- | --- | --- |
| 4/24 P6 泵高压柜表计无显示，根因操作柱接线松动 | `DOC-CASE-HV`（归档案例，已索引） | 工作台 `Q-WB-4`、复核页 `Q-RV-3` |
| PT6903B 高报 9.0 / 高高报 9.8 | `DOC-INTERLOCK`（已有，补了 0.2MPa 双向核对口径） | 知识库 `Q-KB-2` |
| 7/28 P-3 泵大修，加强 6 项检查 | `DOC-PLAN`（管理流程，已索引） | 知识库 `Q-KB-4` |

三条都改写成**监督者会问的一句话**，答案里带上口径与下一步动作，而不是照抄提醒原文。

历史案例那一篇是刻意加的：它和本轮 REC-3（1DP 柜表计无显示）是同一种失效，`TL-1DP` 那条
处置时间线走的正是「查二次回路 → 紧固操作柱接线 → 复测」——有了前例，REC-3 的「纳入下轮
复查」才不是凭空的谨慎。

`P-3` / `P-4` 的差异不是笔误：四张关键帧的真实机位是 `长郴-湘潭站-P-4泵棚-B-R`，本轮异常
在 P-4；业务方提醒里 7/28 大修的是**同棚相邻**的 P-3 泵。两者并存，正好是「本轮处置要在
大修前收口」这句话的由来。

## 已接入演示外壳（主线）

`poc/inspection-demo/index.html` 的第 3 屏现在指向本目录（旧目录 `diagnosis-flow` 未删、仍可单独打开，
但已不在主线上）。左下角 1~4 号切换点由 `flow-nav/` 提供，单独双击本目录的 `index.html`
也会出现。

组件清单**只在 `flow-nav/flow-nav.js` 的 `steps` 里维护一份**：外壳读
`window.InspectionFlowSteps`，路径判断（当前是哪一屏、链接要不要加 `../`）由每个 step 的
`dirs` 派生。原先这份清单抄了三处，切 v2 时正是这三处不同步咬了一口 —— 外壳级验收
`uv run python poc/inspection-demo/verify/verify_shell.py` 盯着它别再散开。

## 六、跑

```sh
cd /Users/admin/Code/xunjian-ai-demo

# 语法
find poc/inspection-demo/diagnosis-flow-v2 -name '*.js' -print0 | xargs -0 -n1 node --check

# 构建两份报告 PDF（改了 domain/06-report.js 或 styles/05-report.css 之后要重跑）
uv run python poc/inspection-demo/diagnosis-flow-v2/tools/build_report.py

# 端到端验收
uv run python poc/inspection-demo/diagnosis-flow-v2/verify/verify_flow.py
```

预期 `ALL CHECKS PASSED（57 项断言）`，截图落到 `$TMPDIR/diagnosis-flow-v2-verify/`。六组：

| 组 | 防的是什么 |
| --- | --- |
| A 加载健康 | pageerror / console.error / **固定画布真的生效**（`.app-shell` 有 transform） |
| B 三页骨架 | 各页栏数、常驻 Agent 按钮、旧死结构类名不存在 |
| C **素材对齐** | 依据链长度逐条对、六种形态全渲染、bbox 在 [0,1]、真实图片加载成功、时序末点 = 现场读数、四帧 OSD 时间连续 |
| D 主线三步 | 分歧闸门 → 意见原文进报告 → PDF 按分歧态切换 → 归档 → 知识库计数 |
| E Agent | 三页都能开、Esc 可关、引用有状态感知 |
| F 报告一致 | 两版页数与分歧段、**章节编号连续不跳号** |
| G **动画不重播** | 定时器驱动的更新不得重播 CSS 入场动画；对话流贴底 |

### 「动画会闪」是怎么修的

每次 `render()` 都 `innerHTML=""` 全量重建，所以写在 `.ov-panel` / `.ag-drawer` / 场景顶层块上的
CSS 入场动画会**在每一次 render 时重播**。定时器驱动的更新因此一路闪。实测：

| | 修前 | 修后 |
| --- | --- | --- |
| 入库动画 5 步 | `overlayIn` 6 次 / `fadeUp` 12 次 | **1 次 / 0 次** |
| Agent 问答一次 | `fadeUp` 4 次 | **0 次** |
| 点记录 / 点依据 | 整屏重新淡入 | **不再淡入** |

修法不是关掉动画，而是**只在真的进场时才播**：`boot.js` 记住上一轮挂了什么（场景 key、
浮层 key、抽屉开合），只有变了才给对应元素加 `.is-enter`，CSS 里动画挂在这个类上。
`Overlay.render()` 因此强制要求传 `key` —— 它就是浮层身份，没有它无法判断"是同一个浮层在
更新还是换了一个"。

顺带修了两处同源问题：全量重建会把滚动容器打回顶部（带 `data-scroll-key` 的记下再写回，
对话流用 `data-scroll-anchor="bottom"` 直接贴底），以及 ECharts 每次 `setOption` 重播曲线
动画（`charts.js` 里首次绘制才带动画，之后的更新 `animation: false`）。

⚠️ **C 组红了就是数据问题，不要改断言。** 它钉住的是"表单项与真实素材对得上"这件事，
而那正是这次重做的全部理由。

验收脚本用 Python Playwright（仓库 `.venv` 里有），与 `diagnosis-flow/verify/verify_flow.py`
同一条路。
