# diagnosis-flow 验证套件

这里放**入库的**验证脚本。它们不是单元测试，而是针对这份前端原型最容易静默回归的
几类问题设的护栏——这个项目踩过的坑，绝大多数都不抛异常：数据存了一个"合法但不在
该字段字典里"的值导致整页空白、报告段落用按位置对齐的并行数组导致增删一段就整体
错位、检索结果取前 N 名导致动画高亮的段落和答案引用的段落对不上。

| 脚本 | 防的是什么 | 形态 |
| --- | --- | --- |
| `node --check`（无脚本，见下） | 语法错误 / 括号漏配 | 每个 `.js` 逐个过 |
| `verify_domain.js` | 10 份领域契约：字段缺失、id 悬空、bbox 越界、插槽闭合、检索恒等于 citations、时序生成器的确定性 | Node，无浏览器 |
| `verify_state.js` | 状态机：派生量真值表（`canExecute` / `isDivergent` / `canOpen` / `reuseUnlocked`）、**脏持久状态的清洗**、运行期入口的抛错 | Node，无浏览器 |
| `verify_flow.py` | 端到端主线走查：四页 + 两子屏 + 三浮层真的能渲染出来、能点、能联动；两条支线产出不同的报告；**动画期间的整屏渲染次数** | Python Playwright |

## 运行

```sh
cd /Users/admin/Code/xunjian-ai-demo
find poc/diagnosis-flow -name '*.js' -not -path '*/vendor/*' -print0 | xargs -0 -n1 node --check
node poc/diagnosis-flow/verify/verify_domain.js                 # 默认校验 domain-skeleton
node poc/diagnosis-flow/verify/verify_domain.js domain-pump     # 换一包校验
node poc/diagnosis-flow/verify/verify_state.js
uv run python poc/diagnosis-flow/verify/verify_flow.py
```

预期输出：

- `node --check`：无任何输出即通过。
- `verify_domain.js`：`ALL CHECKS PASSED（130 项断言）`＝正向 60 + 反例 70。
- `verify_state.js`：`ALL CHECKS PASSED（78 项断言）`。
- `verify_flow.py`：`ALL CHECKS PASSED（86 项断言）` + 截图落到
  `/private/tmp/diagnosis-flow-shots/`。

**断言数是棘轮：只允许涨，不允许跌。** 跌了说明有人删了断言或让某段脚本悄悄跑不到，
必须在提交说明里解释。数字过期本身也是缺陷——它让"全绿"失去可核对性。

浏览器验证一律走 Python 版 Playwright，**禁止直接调用系统 Chrome headless**
（仓库 `AGENTS.md`：本机曾出现 Chrome 进程崩溃弹窗）。

## 为什么 verify_domain 有一半篇幅是"构造反例"

只断言"合法数据能通过"是不够的：**一个什么都不检查的空校验器同样能让那种断言全绿。**
所以每条规则都配一个把数据改坏的反例，断言校验器真的抛错。

这条纪律来自 pump-demo 的 `verify/README.md`：那套验证自己空转过四次（探针写进了
app 根本不读的 localStorage key、检索结果与动画高亮各自解释一遍数据、溢出检查只在
初始态量一次、一整个场景从未被采样），每次都是在全绿状态下偶然发现的。

**写完一条断言后要能回答：如果这个功能坏了，它会红吗？** 答不上来就等于没写。

反例本身也要防写歪：`expectReject()` 里如果 `mutate` 自己抛错，记为 FAIL 而不是
PASS——那说明反例构造得不对（改了一个不存在的字段路径），而不是校验器生效了。

## 已经抓到过的问题

三条都是**全绿状态下**发现的，记在这里是因为它们各自代表一类。

### 1. 契约出口混用了函数和快照值

`DOMAIN_KB.ingestDemoDocId` 导出的是加载时的字符串快照，`archiveTarget` 导出的是对象
引用。于是改底层数据时一个不生效、一个生效，而契约读者无从分辨。

是"ingestDemoDocId 指向无正文文档"这条反例**没能变红**才暴露出来的——
**反例没红本身就是信号**。现已统一成访问器函数，并加了一条正向断言守住它。

### 2. markArea 用了非法端点，把 y 轴撑爆

`ChartOptions.trend` 的 markArea 原来写成 `[{yAxis: threshold}, {yAxis: "max"}]`。
`"max"` 不是 markArea 端点的合法取值（那是 markLine/markPoint 的 `type` 才认的写法）。
ECharts 没有报错，而是把轴上界撑到一个极大值——曲线被压成贴着 x 轴的一条直线，
看起来像"这个测点整段没有变化"。

同一份数据在 `spark()`（没有 markArea）里显示正常。**两张图对不上才暴露出来**，
没有任何断言在测这件事。现在轴范围显式算出来，端点一律用具体数值。

### 3. CSS 行模板与子元素数量不匹配，图表被压到 50px

`.wb-card` 统一写 `grid-template-rows: auto 1fr auto`（3 行），而时序卡有 4 个子元素
（标题 / 判读语 / 图表 / 按钮）。图表落进第 3 行的 `auto`、按钮落进隐式行，图表宿主
被压到 50px 高。**CSS 不为行数不匹配报错，ECharts 也不为宿主太矮报错**，两边都
"正常工作"。

现在每张卡显式声明与自己子元素数量相同的行模板，并且 `verify_flow.py` 加了一条
**高度护栏**（`check_chart_height`）——这类问题只有量一下才知道。

### 4. 每次状态变化都整屏重建，动画期间连续闪烁

用户报的：知识库点"文档入库演示"页面一直闪，Agent 点预设问题也闪。

根因是架构层面的：`commit()` 会 `stage.innerHTML = ""` 整屏重建，并把 `#overlayRoot`
一起清空重挂。而入库动画每 700ms 推进一步就 `commit()` 一次、Agent 从"检索中"切到
"答案"也 `commit()` 一次——浮层每次都被销毁重建，`.overlay-mask` 的淡入动画和 chunk
的落下动画跟着从头重播。**不抛错、不进日志、截图也抓不到**（截到的那一帧可能正好
是动画中间）。

修法不是加防抖，是让动画期间不重建 DOM，三件事：

1. 浮层按 `key` 增量挂载（`Overlay` 的 `key` → `data-overlay-key`），同 key 原地保留；
2. 动画帧走 `tick()`（只落盘 + 定点刷新），不走 `commit()`；
3. 入库动画的结构一次画完，六步推进只由 `refreshIngest()` 改类名和文本，
   一个节点都不创建。

顺带修掉的：自由输入框里打的字会在对话区刷新后丢失——现在存进 `state.agent.freeText`
再回显。

### 这次修复暴露的方法问题：我第一版断言是空转的

第一版写的是"动画跑完后浮层节点上的标记还在"。它在**任何情况下都不会红**：
动画路径根本不触发整屏渲染，浮层自然不会被重建。这正是本文件开头那条纪律要防的
情况——**断言存在、颜色是绿的、但它测不到它声称在测的东西**。

现在改成两条互补的、各自都验证过会红的断言：

| 断言 | 把什么改回旧写法时会红 | 实测 |
| --- | --- | --- |
| 提问 / 自由提问全程零次整屏渲染 | `askAgent()` 的 `tick()` → `commit()` | 红（4 条 FAIL） |
| 六步推进全程零次整屏渲染 | `scheduleIngest()` 的 `tick()` → `commit()` | 红（动画卡住超时） |
| 整屏渲染后同 key 浮层原地保留 | `renderOverlays()` → `innerHTML = ""` 全量重挂 | 红（1 条 FAIL） |

第二条的红法是"超时"而不是"计数不符"——因为改回 `commit()` 之后浮层被 key 机制
保住了、但内部类名不再更新，动画直接卡住。红得不是同一个理由，如实记在这里。

"页面在闪"没法直接从 DOM 上读出来，所以断言的是它的机械成因：**整屏渲染的次数**。
`window.Boot.debugInfo().renderCount` 就是为此存在的。

## 这套验证测不到的东西

写在这里是因为它们不属于断言能表达的范畴，不是"暂时没写"：

- **动画的观感和节奏**：入库动画六步的停顿是否均匀、打字机是否跟得上阅读、归档飞入
  的缓动是否生硬。只能在真机上由人看一遍。
- **布局的呼吸感**：断言能测溢出和高度，测不到"挤"。
- **业务口径是否正确**：契约只保证结构自洽，不保证阈值、结论说法、报告文案符合现场。
  那部分要业务确认，见 `../DESIGN.md` 第 12 章。

## 人工闸门（不能省）

每阶段结束**实际打开** `/private/tmp/diagnosis-flow-shots/` 下这几张看一眼：

```
01-workbench.png        依据链四枚芯片是否齐、曲线是否真的在上升
07-review-divergent.png 分歧条是否够醒目（投影上偏暗就等于没有）
09-archive-divergent.png 人工原文那两段是否一眼能认出来
11-ingest.png           入库动画的命中段是否真的高亮
```

打磨单页时用 `dev/index.html` 里的 preset 入口，不用从工作台一路点过来。
