# hunan-overview-v2 · 湖南省油气管网大屏（巡检站总览）重排版

`hunan-inspection-overview` 的**布局与文案重排版**，不是重构。数据层、3D 层、契约层、
`core` 的四个通用文件、`ui/cards.js` 与 `vendor` 全部用相对路径引用旧目录的原文件，
一行未改，也不复制副本 —— 两边读的是同一份字节，不会各自漂移。旧目录保持可独立运行。

本目录自己新写的只有 4 个 JS + 4 片 CSS：

```
index.html                      加载顺序（旧目录原文件 + 本目录新文件）
styles/01-tokens.css            变量名单与旧目录逐条一致；背景 6 层 → 2 层；新增三档圆角/阴影
styles/02-shell.css             顶栏两列 62px；无底栏；日期选择器从旧目录搬来
styles/03-cards.css             card-metric / card-chart / ov-table 三族，共约 260 行
styles/06-overview-scene.css    两列网格 660 + 1fr；左栏四块行高；地图头字号覆盖
scripts/core/chartopts.js       3 个 ECharts 构造器
scripts/scenes/overview.js      顶栏 / 左栏四块 / 地图面板
scripts/boot.js                 状态机 + render 管线 + 事件委托
verify/verify_overview.py       41 项断言
```

## 改了什么

**一屏容器数 8 → 2**。旧版是顶栏 + 左栏(4 块) + 地图 + 右栏(2 块) + 底栏。现在是
顶栏 + 左栏(4 块) + 地图，顶层内容容器只有左栏和地图。

**「巡检质量保障」卡拆成三张图 + 一行大数**。那张卡原本有 9 个数字块（focus 3 +
grid 6），每块还带一行小字，背后只有 `quality.js` 的 8 个字段。拆分规则是**每个数只
出现一次**：

| 屏上位置 | 回答的问题 | 用到的字段 |
| --- | --- | --- |
| 一行大数（`Cards.metric` ×3） | 规模 / 问题量 / 最紧急 | 站点总数、`issues`、`currentRisk` |
| 巡检完成度（环形） | 计划做完了吗 | `completionRate`、`completed`、`planned` |
| 质量异常构成（横向柱） | 异常都是哪几类（总体） | `duration`、`interval`、`offWindow`、`aiAlerts` |
| 作业区需关注站点（堆叠柱） | 哪个作业区最该管（分区） | `HunanSeries.zoneStatusMix()` |

`riskLevel` 与 `p1Issues` 屏上不出现（前者是后三个字段的派生等级，后者与 `currentRisk`
只差一个时态）。数据层保留这两个字段不动。

**删掉的三块**：右下角 DetailCard（省域态是「点击左侧…下钻」的操作说明 + 两个 tag，
作业区态是「类型/介质/类别 + 一句示意坐标免责声明」）、「动态趋势 · 近N日巡检完成率」
折线图（完成率已在环心）、「作业区巡检覆盖率」横向柱（被需关注站点堆叠柱取代）。
另外删掉底栏与面包屑（位置由地图头的 `<h3>` 表达，返回全省沿用地图右下角的 `‹` 按钮）。

**下钻态只列「需关注站点」**。第一版列全部站点，岳阳是 36 行，其中「类型」列全是
「阀室」、「所在市」列全是「岳阳市」—— 两整列 72 格写同一个词。改成只列 `danger` +
`warn`，实测各作业区 1 到 5 行；总数在卡头 meta 里（「5 / 36 站点」）。表是**只读**的：
点选站点在这屏没有可见后果（`engine.js` 首页不显示站点柱体，推第三级相机是旧设计
明确排除的），所以不接 `SelectList`，也没有 `state.siteId`。

**从 `dfaft/智能巡检数智员工-演示.html` 借的**：三档圆角/阴影、卡片骨架（`sub` 用
`margin-left:auto` 推到标题行右端，省掉一行）、`.stat` 两级排版且**状态色只染数字**
（旧版是整卡描边 + 背景 + 发光，三卡同时 warn 时整个左栏在发橙光）、`.num`
等宽数字、动效只留 `fadeUp` + `pulse` 且带 `prefers-reduced-motion`。**不借白底** ——
深色保留，只把背景从 6 层叠加（扫描线 + 四角暗角 + 顶光 + 两团发光 + 底色）降到 2 层，
删掉的暗角与扫描线正是把贴边卡片压灰、让整屏发脏的来源。

**字号整体上调约 25%**。固定画布是 2471×1289，在 1920 宽的屏上缩放系数 0.777，投影仪
上更低 —— 旧版 13px 的卡片标题在 1080p 上只有 10px。

## 跑验收

```sh
cd /Users/admin/Code/xunjian-ai-demo
find poc/inspection-demo/hunan-overview-v2 -name '*.js' -print0 | xargs -0 -n1 node --check
uv run python poc/inspection-demo/hunan-overview-v2/verify/verify_overview.py
```

预期 `ALL CHECKS PASSED（41 项断言）`，截图落到 `$TMPDIR/hunan-overview-v2-verify/`
（可用 `SHOT_DIR=` 覆盖）。四组断言：加载健康（pageerror / console.error / WebGL 单例）、
v2 布局与减法（容器数、块数、旧结构类名不存在、已删文案检索不到、图表槽位与状态严格
对应）、3D 契约（`[data-hunan-host]` 唯一、标签数与顺序 === `ZONE_IDS`、标签两两不重叠、
渲染预算）、下钻联动。另外量化对比两版左栏的中文字符数。

验收脚本用 Python Playwright（本仓库 `.venv` 里有，与
`poc/inspection-demo/diagnosis-flow/verify/verify_flow.py` 同一条路），不是旧目录那份
Node 版 —— Node 的 playwright 在开发机上只能从 npx 缓存目录解析，不可移植。

## 同批在旧目录做的死代码清理

`scripts/core/chartopts.js` 删掉 `zoneStatusMix` / `siteKindMix` /
`qualityExceptionMix` 三个从未被调用的构造器，以及它们专用的 `statusColor()` 与
`STATUS_KEYS` / `THEME_KEYS`（255 → 145 行）。`scripts/data/series.js` 删掉随之失去
调用者的 `siteKindMix` / `mediumMix` / `categoryMix` 与内部辅助 `allSites()` /
`groupCount()`（146 → 115 行）。旧目录页面已冒烟确认无 pageerror、`contextCreated === 1`、
2 个 ECharts 实例不变。

⚠️ `HunanSeries.zoneStatusMix()` 仍在使用 —— 本目录跨目录引用它。删它之前要先看这一侧。
