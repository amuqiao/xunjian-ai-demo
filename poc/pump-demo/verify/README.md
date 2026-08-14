# pump-demo 验证套件

这个目录放**入库的**验证脚本。它们不是单元测试，而是针对这份前端原型最容易静默回归的几类问题设的护栏：

| 脚本 | 防的是什么 | 形态 |
| --- | --- | --- |
| `node --check`（无脚本，见下面命令） | 语法错误 / 括号漏配 —— 单文件拆成分层结构后最常见的低级红灯 | 每个 `.js` 逐个过一遍 |
| `verify_data.js` | 数据层契约：`window.DemoData` 的键集合、部位 id 与 `Pump3DContract.PART_IDS` 的一致性、时序生成器的自洽性、知识库检索命中集合、视觉关键帧的归一化 bbox、**专家结论字典与归档报告段落**（含大量构造反例，验校验器真的抛错） | Node，无浏览器 |
| `verify_chartopts.js` | 图表 option 构造器契约（`ChartOptions.trend/spark/mix/unitBars` 的纯函数行为、硬校验都真的抛错） | Node，无浏览器（由任务 P1-F 创建） |
| `verify_ui.js` | UI 组件层契约（`Cards.metric/chart/evidence`、`SelectList`、`DetailCard` 的硬校验与产物结构，含 `activePartLabel` 契约钩子） | Node，无浏览器（由任务 P1-G 创建） |
| `verify_timers.js` | 定时器所有权契约（`SceneTimers` 的按场景登记/清理、`persist` 语义、渲染级 `clearAll()` 与场景级 `clearScene()` 的区别） | Node，无浏览器（由阶段三 G1 创建） |
| `verify_pump3d.py` | 3D 隔离契约：单一 WebGL 上下文、宿主盒非零、`data-part` 命名空间、标签投影与去碰撞、几何验收、性能护栏、resize 贴合、7 场景不泄漏上下文、`data-active-part-label` 契约 | Python Playwright |
| `verify_scenes.py` | overview 场景的联动是否真的接对：时间范围切换驱动卡片/图表重算、状态卡与 3D 热点的双向联动、卡片分级机械约束、键盘可达性（由任务 P1-I 创建） | Python Playwright |
| `verify_css_snapshot.py` | CSS 拆分 / 布局重排造成的**肉眼看不出但计算样式已变**的回归 | Python Playwright + `baseline/css.json` 基线 |

浏览器验证一律走 Python 版 Playwright。**禁止直接调用系统 Chrome headless**（仓库 `AGENTS.md`：本机曾出现 Chrome 进程崩溃和 macOS「Google Chrome 意外退出」弹窗）。

## 每阶段的验收闸门

任一改动合并前，下面几条必须全绿，并把输出贴进 PR / 汇报：

```sh
cd /Users/admin/Code/beng-ai-demo
find poc/pump-demo/scripts -name '*.js' -print0 | xargs -0 -n1 node --check
node poc/pump-demo/verify/verify_data.js
node poc/pump-demo/verify/verify_chartopts.js
node poc/pump-demo/verify/verify_ui.js
node poc/pump-demo/verify/verify_timers.js
uv run python poc/pump-demo/verify/verify_pump3d.py
uv run python poc/pump-demo/verify/verify_scenes.py
uv run python poc/pump-demo/verify/verify_css_snapshot.py
```

预期输出（括号里的断言数是**棘轮**：只允许涨，不允许跌。跌了说明有人删了断言或让某套脚本悄悄跑不到，必须在提交说明里解释清楚。数字过期本身也是缺陷——它让"全绿"失去可核对性，下面这批曾经长期停留在 32/39/46/54，而实际已经是 198/57/124/19/56/147）：

- `node --check`：无任何输出即通过。
- `verify_data.js`：`ALL CHECKS PASSED（198 项断言）`。
- `verify_chartopts.js`：`ALL CHECKS PASSED（57 项断言）`。
- `verify_ui.js`：`ALL CHECKS PASSED（124 项断言）`。
- `verify_timers.js`：`ALL CHECKS PASSED（19 项断言）`。
- `verify_pump3d.py`：先打一批 `PASS ...` / `INFO ...`，末行
  `ALL CHECKS PASSED（56 项断言，另有 8 条 INFO）`。**这一套是保护 3D 资产的主力护栏，
  必须全绿。**
- `verify_scenes.py`：`ALL CHECKS PASSED（147 项断言）` + 截图目录。
- `verify_css_snapshot.py`：`PASS 计算样式与基线零差异（204 条采样，4 档宽度，6 个场景）`。
  **这句话里的 204 不等于 204 条有效防护**，见「已知盲区 5」。

### 人工闸门（不能省）

每阶段结束必须**实际打开** `/private/tmp/pump-demo-shots/` 下这 6 张图看一眼：

```
07-overview-1920.png  07-station-1920.png
07-overview-1440.png  07-station-1440.png
07-overview-1280.png  07-station-1280.png
```

`verify_pump3d.py` 每次运行都会重新生成它们。要看的是断言测不出来的东西：布光是否迎面、金属/铸铁材质是否还成立、6 个标签的落点是否压在部位上而不是飘在空中、阴影是否还贴地。3D 观感是本项目最重要的资产，而没有任何断言能替代看一眼。

同一目录还有过程截图：`01-overview-1920` / `02-station-1920` / `03-part-*`（逐部位选中态）/ `04-resize-*` / `05-overview-final` / `06-scene-*`（7 个场景各一张）。

## 已知红灯

**当前六套验证全部无红灯**（`node --check` / data 198 / chartopts 57 / ui 124 /
timers 19 / pump3d 56 / scenes 147）。这一节保留下来是因为它记的两条历史值得读：
**这套验证自己出过的错，比它抓到的应用 bug 更多。**

### 曾经挂着一条早已修好的"预期红灯"

文档长期写着"station 的 `data-active-part-label` 契约是预期红灯"，而那条在阶段二的
station 场景精简之后就已经修好，与它并存的 6 条 `[过渡]` 断言也早已删除。
**留一条早已修好的红灯比没有它更糟：它会训练读者对红色输出脱敏，
下次真红灯出现时也会被当成"就那条老的"。**

### 两条"断言自己写错"的红灯

**1）overview 的 `[data-active-part-label]` 契约**把期望值写死成 `"coupling"`，
注释还写着"默认选中部位是 coupling"。那句话对刚加载的页面成立，但断言执行到那里时，
脚本自己已经逐个点过 6 个部位热点、还跑了一轮含拖拽的相机扫描。应用一直是对的
（全新加载零交互 → 标签"联轴器"；点完 6 个热点 → 标签"底座"）。现在期望值从运行期
`window.AppState.value.focus.partId` 取，对测试流程顺序免疫。

**2）图谱悬停流光断言恒红，原因是 `page.mouse.move(4, 4)` 瞬移到画布外。**
canvas 一个鼠标事件都收不到（实测 zrender 的 mousemove 计数原地不动），zrender 内部
记录的"当前悬停元素"一直指向那个节点；再把鼠标移回同一节点时它认为悬停对象没变，
**不再发 mouseover**，于是 `playSpineEffectOnce()` 压根不会被调用。
真人操作不会这样——鼠标移开会在画布内划出一连串中间点。现在改成"分步移到画布内
空白处、再分步移回"，并加了一条 mouseover 计数断言守住这个坑本身（事件数没涨 =
鼠标操作方式有问题；涨了但 effect 没亮 = 应用有问题，两者可区分）。

这一条的排查过程值得记，因为**我错判了两次**：先当成 rAF 竞态（`Charts.flush()` 确实
把 `setOption` 放在 rAF 回调里，而 headless 软件光栅帧间隔 111~333ms 随负载波动，
原来固定睡 250ms 确实是个会摇摆的写法——但改成 1500ms 有界轮询后依然红，假设被推翻）；
又当成 `graph_page_point()` 坐标算错（`convertToPixel` 与 `getItemLayout` 实测给出
**同一个**像素点 [304.04, 163.42]，假设同样被推翻）。
最终定位靠的是**给实例另挂一个 mouseover 计数器**——事件计数停在 1，说明第二次悬停
压根没有事件，而不是"画了但没生效"。

方法上的教训：区分"没触发"和"触发了但没效果"，比反复调整等待时长有用得多。
`Charts.debugInfo().drawCalls` 在这里也是关键读数——它停在 12 没涨，直接排除了
"draw 了但 flush 没生效"这一整类猜测。

## `verify_css_snapshot.py --write` 的使用纪律

`--write` 会用当前页面的计算样式**整体覆盖** `baseline/css.json`。它只能在以下条件同时满足时使用：

1. 这次改动确实是有意的布局重排 / 主题调整；
2. 你已经先跑过一次不带 `--write` 的比对，把打出来的每一处 diff **逐条 review 过**并能解释；
3. 覆盖基线这件事本身写进了提交说明。

绝不用 `--write` 糊掉真实回归。`baseline/css.json` 最初的 204 条采样是在 CSS 拆分**之前**捕获的，正是用来接住拆分过程中的静默漂移的；任务 P1-I（overview 大屏重写）逐条 review 过全部差异后又更新过一次（详见该任务的交付说明），采样条目数不变（204 条，其中 overview 的 `.pump-map-toast`/`.pump-source-preview`/`.dashboard-grid`/`.dashboard-kpi`/`.area-stat` 5 个选择器因页面结构调整不再命中，记为 `null`，属预期）。

## 已知的环境噪声

- **帧率**：headless 下是 swiftshader 纯 CPU 软件光栅，稳态约 3–9 fps（随机器负载波动，实测 load≈2 时约 12fps、load≈20 时约 3fps）。脚本因此只断言「帧在推进」，把 fps 当 INFO 打印，不设阈值 —— 在共享机器上定 fps 阈值不是有效信号。真正的性能护栏是 `renderCalls < 200` 和 `triangles < 260000`。
- **three r160 UMD 的 deprecated warning**：已在脚本的 `WARN_WHITELIST` 里白名单，同时白名单了 swiftshader 的 `GL Driver Message` / `GPU stall`。
- **`wait_until`**：两个 Playwright 脚本统一用 `domcontentloaded`，不用默认的 `load`。重载机器上等 `load` 会把浏览器进程等到被系统杀掉，而脚本后面本来就有显式的预热等待。
- **模型 build 必须在独立页面里做**：`verify_pump3d.py` 的几何验收会再 `Pump3DModel.build()` 一整套模型（66 个 mesh + 材质 + CanvasTexture）。早先直接在被测页面里跑，污染了被测环境并导致后续切场景时渲染进程崩溃 —— 所以那段用 `browser.new_page()` 另开一页。

## 临时产物

截图输出到 `/private/tmp/pump-demo-shots`，**不进仓库**（`AGENTS.md`：临时截图脚本和输出放 `/private/tmp`）。脚本本身入库是有意决定 —— 契约需要一份长期可执行的表达。

## 已知盲区（这套验证测不到的东西）

写在这里是因为其中几条都已经导致过**真实的用户可见故障**，而当时全套验证是绿的。
**不要因为脚本全绿就认为真机没问题。**

### 1. 真实 GPU 的合成路径

Playwright 截图会强制一次合成，而 headless 用的是 swiftshader，合成路径与真实 GPU 不同。

已发生的故障：按需渲染改造后，`preserveDrawingBuffer` 仍是 WebGL 默认的 `false`，
一帧呈现给合成器之后绘制缓冲内容变成未定义。持续 60fps 时无所谓（下一帧覆盖），
但静止时一帧都不画之后，合成器一旦需要重新合成那一层（切标签页回来、窗口缩放、
显示器唤醒、GPU 进程恢复、滚动触发图层重栅格），canvas 就变空白且没有任何东西
触发重绘。**自动截图全绿，真机上是一块空白。**

现在的对策是 `preserveDrawingBuffer: true` 加三个唤醒钩子（见 `scripts/pump3d/engine.js`
的 GL_ATTRS 注释）。但这类问题**本质上只能靠真机人工确认**——每阶段结束时在真实
浏览器里打开一次、切走再切回、缩放一次窗口，是不能省的一步。

### 2. 持久化状态（已部分补齐）

所有断言原本都从一份干净的 localStorage 起跑，于是"某个能通过 `normalizeState`
清洗、但会让场景渲染直接抛错的持久值"这一整类 bug 完全测不到。

已发生的故障：`pick.overview` 被存成 `MOT-DE-H`（电机主测点）。它是合法测点、
通过了当时按 `DemoData.points()` 做的清洗，但大屏只有 6 张卡且不含电机，
`SelectList` 的 `activeId` 校验因此抛错 → `renderOverview` 中断 → 顶栏还在、
stage 和流程条全空。**而且状态已落盘，刷新也救不回来。**

`verify_scenes.py` 第 8 节现在覆盖了 6 种畸形持久状态 + 3 个历史 STORAGE_KEY。
但这只是抽样，不是穷举：**新增任何 `state.pick.*` / `state.focus.*` 字段时，都要
同步往那份 cases 列表里加一条**，并确认它的校验字典是"该字段语义对应的集合"，
而不是某个更宽的集合（那个更宽的字典正是上面这次事故的根因）。

### 3. CSS 基线采的是"第一个匹配元素"

`verify_css_snapshot.py` 用 `document.querySelector(sel)` 取首个匹配项。DOM 顺序
一变，被采样的就换成了另一个元素，diff 里会出现"看似样式改了、实际是采样对象换了"
的噪声（overview 重写时 `.badge` / `.chart-box` / `.dot` 三处就是这种情况）。
review 基线 diff 时要先判断是不是这一类，再决定是否接受。

### 4. 动画的观感和时序

阶段三引入了两处**以动画为主体**的界面：知识库的 RAG 入库流水线（5 步 + chunk
方块逐个亮起）和知识图谱的节点流光。断言能覆盖的只有状态机——步骤类名按顺序出现、
定时器在切场景时被清掉、动画结束后落到正确的终态。

**测不到的是它好不好看**：节奏是否太快/太慢、五步之间的停顿是否均匀、高亮的推进
是否跟得上文字、缓动是否生硬。headless 抓不到可靠的中间帧（软件光栅下帧间隔本身
就在 3–9fps 抖动，截到的"中间态"不代表真机看到的中间态），时序也对不上。
**这一类只能在真机上由人看一遍**，和第 1 条的性质相同：不是"暂时没写断言"，
是这件事不属于断言能表达的范畴。

### 5. CSS 采样的覆盖面严重倾斜，而 null 项仍然计入总数

那句 `零差异（204 条采样）` 里的 204 **不是 204 条有效防护**。实测（阶段三整合前）：

| 场景 | 采样 | 失效(null) | 有效 |
| --- | --- | --- | --- |
| overview | 96 | 20 | 76 |
| station | 64 | 8 | 56 |
| workbench | 16 | 0 | 16 |
| confirm | 12 | 0 | 12 |
| knowledge | 8 | 0 | 8 |
| graph | 8 | 0 | 8 |
| **archive** | **0** | — | **0** |
| **detail** | **0** | — | **0** |

两个问题：

1. **选择器随场景改版而失效，但 key 留在基线里、记成 `null`，继续计入 204。**
   目前有 28 条（14%）指向早已不存在的 DOM：`.dashboard-grid` / `.dashboard-kpi` /
   `.area-stat` / `.pump-map-toast` / `.pump-source-preview` / `.scene-head` /
   `.station-unit`。`null == null` 永远成立，所以这些 key 什么都不验，
   只是把总数撑得很好看。**分母在缩水而绿灯不变色**，这是本套验证里最隐蔽的一处
   自欺——比一条明确的红灯危险得多。
2. **覆盖面压在两个老场景上。** overview + station 占 132 条有效采样，阶段二三
   新建的五个场景合计只有 44 条，`archive` 和 `detail` 一条都没有。也就是说
   "CSS 零差异"这个绿灯对这份 demo 里一半的界面几乎没有发言权。

改版一个场景时的纪律：**先把该场景失效的 key 从基线里删掉（不是留成 `null`），
再按新 DOM 补一批真正命中的选择器**，让 `null` 数量长期保持在 0。
`--write` 会把不命中的选择器写成 `null` 而不报错，所以它不会替你发现这件事——
用下面这段量一次：

```sh
python3 -c "
import json, collections
d = json.load(open('poc/pump-demo/verify/baseline/css.json'))
nul = [k for k, v in d.items() if v is None]
print('总数 %d / null %d (%.0f%%)' % (len(d), len(nul), 100.0 * len(nul) / len(d)))
for sel in sorted(set(k.split('|')[2] for k in nul)): print('  失效:', sel)
"
```

## 业务数据 vs UI 文案：这条线划在哪

这份 demo 的目标是"业务只换数据、不改代码"，所以需要一条明确的界线，否则会滑向
"把每个界面文字都做成配置"那种过度设计。当前的划法：

**属于业务数据（放 `scripts/data/`，schema 校验，业务可改）**
- 测点、阈值、时序场景（`points` / `scenario`）
- 巡检记录字段与表格列声明（`records` / `recordColumns`）
- 视觉关键帧与归一化 bbox（`parts[].vision.frames`）
- 专家结论、处置步骤、判定证据测点（`verdicts` / `evidencePoints`）
- 归档报告段落（`report.sections` / `verdicts[].reportSections`）
- 状态口径文案（`statusText`：三色徽标 + AI 质检口径）
- 知识库内容与图谱结构（`kb-dataset.js` / `graph-spec.js`）

**属于 UI 文案（留在场景层，不做配置）**
- 按钮文字（"确认归档"/"已归档"）、面板标题（"报告预览"）、区块小标题
- 空态和边界提示（"请选择专家结论"）

判据是：**这句话会不会因为换一个业务场景而必须改**。"确认不对中"会（是这个案例的结论），
"确认归档"不会（是通用交互文案）。

一条相关的教训：业务口径的**判据**绝不能是中文串比较。三条结论的文本曾经以字面量散在
8 个文件共 14 处，靠 `=== "确认不对中"` 驱动"是否解锁 P-2 复用"。漏改一处不报错——
比较恒为 false，页面静默走成非维修分支，归档后永远不解锁，看起来像功能没做。现在判据
是 `verdicts[].isMaintenance`，schema 还强制"恰好 1 条 isMaintenance"（0 条会让归档
永远不解锁、2 条会让判断产生歧义，两者在运行时都不报错）。

同类的脆弱写法还有两处，一并记下：按位置对齐的并行数组（报告段落的 status 曾经是
`["warn","warn","warn","ok","ok","warn"]`，业务增删一段就整体错位），以及手数出来的
数量字面量（`"（6 步）"`，改了 steps 就不符）。两者都不会报错。

## 断言"空转"过的几次（每次都是全绿状态下发现的）

这几处的共同点：断言存在、颜色是绿的、但它当时**测不到它声称在测的东西**。
记在这里是因为发现它们靠的都是偶然（改别的东西时路过），而不是靠这套验证自己。
**写完一条断言后要能回答：如果这个功能坏了，它会红吗？** 答不上来就等于没写。

1. **探针写进了 app 根本不读的 key。** `verify_scenes.py` 第 8 节那批"畸形持久状态"
   探针把 `STORAGE_KEY` 写死成 `pump-demo-v6-state`，而 `scripts/core/state.js`
   已经升到 v7——探针写完、页面重载、读到的却永远是默认状态，6 条断言全部空转通过。
   现在改成运行期从 `window.AppState.STORAGE_KEY` 读，并加了一条断言保证运行期 key
   不在历史 key 清单里，防止再次静默落后。
2. **检索结果与动画高亮各自解释一遍数据。** `DemoKb.retrieve()` 早先是
   `hits.slice(0, 3)`，而多数预设问答只声明 1–2 个命中段，于是前 3 名必然掺进非命中段:
   动画高亮的 chunk 和答案实际引用的 chunk 对不上。当时 66 条数据断言全绿，
   因为没有任何一条断言"检索结果恒等于声明的 citations 集合"。补了 25 条之后才成立。
3. **溢出检查只在初始态量一次。** 高度断言在页面刚渲染完时比较
   `scrollHeight`/`clientHeight`，而 RAG 动画展开后高度才变化——展开态的溢出测不到。
   现在按「4 个状态 × 3 档宽度」各量一次。
4. **一整个场景从未被采样。** `archive` 和 `detail` 不在 `verify_css_snapshot.py`
   的 `SCENES` 字典里，见上面盲区 5。缺的不是断言的质量，是有人以为它在名单里。

还有一次不是空转而是**断言本身错了、并且反过来带坏了产品决策**：早先有一条
"切换时间范围后卡片数值必须变化"，为了满足它，实现把大屏卡片显示成区间 `mean`
（44.26°），而右侧详情卡显示 `latest`（81°）——同一个测点两个数字，演示时必然被问住。
断言绿了，产品坏了。现在卡片回到 `latest`，那条断言改成检查 `note`（区间说明）随范围变化。
**断言写歪了会把实现拖着一起歪**，这比断言漏写更贵。
