# diagnosis-flow 设计说明

一句话主旨：这是一套**只做"诊断工作台 → 知识库"这一段流程**的演示骨架，页面代码不含任何业务名词，两个课题（泵业 / 巡检）各挂一包领域数据即可跑出各自的 demo。

## 文档职责

| | |
| --- | --- |
| **本文负责** | 这一段流程拆几个页面、每页长什么样、人工介入怎么做、10 份领域契约的字段定义、状态机与 action 清单、复用来源、验证方式 |
| **本文不负责** | 3D 大屏、站点态势、知识图谱三块（各自独立 POC）；它们与本 POC 的组装方式届时另行设计 |
| **适用读者** | 实现这个 POC 的人；以及后续为第二个课题填数据的人 |
| **维护规则** | 页面交互变了改第 4 章；数据字段变了改第 8 章并同步 `verify/` 用例；两者不一致时以 `verify/` 跑得过的为准 |

---

## 1. 先理解这件事

### 1.1 三层分离

整个 POC 只有三种东西，边界必须始终清楚：

```text
骨架层  scripts/{core,ui,scenes,boot}     不含任何业务名词，两课题共用一份
领域层  domain-<课题>/*.js                10 份契约，业务口径全在这里
状态层  运行时 state（localStorage）        本轮演示走到哪一步
```

判断一段代码该放哪，只问一个问题：**换一个课题，这段东西要不要改？**要改的进领域层，不改的进骨架层。中文业务串出现在 `scripts/` 下就是设计事故——pump-demo 早期把结论文案、报告段落写在场景文件里，后来花了两轮才收回数据层。

### 1.2 这一段流程为什么必须在一个目录里

因为它的价值就是那套**共享状态机**，有三个机关横跨多页，拆开就做不出来：

| 机关 | 横跨 | 演示效果 |
| --- | --- | --- |
| 人工意见原文回显 | 复核 → 归档 | 复核页打的字，翻页在报告正文里逐字出现 |
| 分歧态 | 复核 → 归档 → 知识库 | 人工结论 ≠ AI 建议时理由必填，报告多一段，回流成反馈样本 |
| 二次命中 | 归档 → 知识库 → 工作台 | 归档后回到工作台切第二条记录，AI 依据链多出"历史案例命中" |

而大屏 → 站点 → 工作台这些边界上只交接一两个 id，所以那几块拆成独立 POC 是对的，不该并回来。

### 1.3 一条闭环主线

这个 POC 自带完整故事弧，收尾落回起点，**不依赖大屏也是一场完整演示**：

```text
诊断工作台 ──→ 人工复核 ──→ 知识库
  巡检记录列表     AI 匹配票卡       文档 +1
  ├─ AI 判断浮窗   ├─ 人工确认面板    ├─ 入库动画
  ├─ 时序子屏      ├─ 分歧必填理由    └─ Agent 可命中
  ├─ 视觉子屏      └─ 报告弹窗归档 ──→
  └─ Agent 浮窗
      ↑                                                       │
      └───── 切到第二条相似记录，AI 依据链多出"历史案例命中" ←────┘
```

---

## 2. 范围边界

**在范围内**：诊断工作台、时序详情、视觉详情、Agent 对话、人工复核、报告归档弹窗、知识库。

**不在范围内**，且**不为它们预留钩子**：

- 3D 任何形式（不引入 `three.js`，不建 `pump3d/` 同类目录）
- 总览大屏、站点/部位态势两个场景
- 知识图谱。它是独立的"知识文档地图"演示件，与知识库无关联；知识库页里**不放**图谱入口按钮
- 真实检索、真实模型、真实上传。所有"智能"都是预设数据 + 定时器动画

**唯一的对外接缝**是 `DOMAIN_META.entry`（见 8.1）：声明本轮演示从哪个对象、哪个部位、哪条记录开始。它的存在理由是防止 `"P-1"` 这类字面量散落在状态层和四个场景里，而不是为组装做准备——就算永远不组装也需要它。

**技术约束**：原型跑在 `file://` 双击打开，因此禁用 ES module 和 `fetch`。所有数据必须是 `.js`（`window.XXX = {...}` + `<script>` 串联），不能是 `.json`。

---

## 3. 页面与路由

3 个主页面 + 2 个子屏。子屏不占导航项；报告归档不占顶部导航。

```text
导航      诊断工作台        人工复核       知识库
scene     "workbench"      "review"      "knowledge"
子屏      detail = "trend" | "vision"
          （整屏接管 stage，导航仍高亮"诊断工作台"）
```

**为什么时序/视觉是子屏不是页面**：它们是证据下钻，看完就返回工作台。做成页面会让讲解者在导航上来回跳，叙事断掉。

**为什么人工复核必须独立成页**：它是角色交接点。前面所有页面的主语是"AI 在组织证据"，从这页开始主语变成"人在做决定"。合并进工作台会把这个转折抹掉，而这正是整个 demo 的核心命题。

**底部流程条 6 步**（不是 pump-demo 的 8 步——那前两步属于大屏和站点，在这里永远点不亮，会像坏掉的进度条）：

```text
质检 → 时序 → 视觉 → Agent → 复核 → 归档
```

**进入条件**（比 pump-demo 的五标志位联判简单得多）：

| 场景 | 可进入条件 |
| --- | --- |
| workbench / review / knowledge | 恒可进入 |
| 报告归档弹窗 | `review.executed === true`，由人工复核页内打开 |

---

## 4. 逐页设计

### 4.1 ③ 诊断工作台

要回答的问题：**这条异常，证据齐不齐？**

```text
┌──────────────────────────────────────────────────────────────────┐
│ 诊断工作台 · {objectLabel}                    [时间范围 7d/30d/90d] │
├──────────────────────┬───────────────────────────────────────────┤
│ 【报表区】             │ 摘要条：日期·班次·巡检人·部位·检查项         │
│ 记录表格（可点选）      ├─────────────────────┬─────────────────────┤
│                      │ 【时序证据】          │ 【视觉证据】          │
│ 列由 columns 契约声明  │ 折线 + 阈值线        │ 现场帧 + bbox 标注框  │
│ 时间 部位 检查项       │ + 越线阴影           │                     │
│ 人工结果 AI标记        │ [展开时序详情] →子屏  │ [展开视觉详情] →子屏  │
│                      ├─────────────────────┴─────────────────────┤
│ AI标记三态：           │ 【AI 辅助判断卡】 ← 本页核心                 │
│  ● conflict 人机冲突   │  结论 + 置信度条 + 依据链（4 枚可点芯片）     │
│  ● gap      记录缺项   │  ┌────────┬────────┬────────┬────────┐   │
│  ● ok       人机一致   │  │📈时序   │👁视觉   │📋规则   │📚案例  │   │
│                      │  └────────┴────────┴────────┴────────┘   │
│                      │  [进入人工复核] →                          │
│                      ├───────────────────────────────────────────┤
│                      │ 【Agent 入口卡】 [打开 Agent 对话]           │
└──────────────────────┴───────────────────────────────────────────┘
```

相对 pump-demo 现有实现的三处实质升级：

1. **AI 判断卡要有依据链**。现在是一句话 + 3 个纯文本标签，看不出 AI 凭什么。改成 4 枚可点芯片，点击按 `kind` 分发：`series` → 开时序子屏并定位该测点；`vision` → 开视觉子屏并定位该帧；`rule` → 就地展开规则卡；`case` → 跳知识库并打开该文档。这是"AI+ 辅助判断"这句需求真正的落点。
2. **置信度显式**。0–100 的条 + 文字口径（`high` 高置信 / `needs-review` 需人工确认 / `insufficient` 证据不足）。置信度低时 AI 卡自己写"建议人工介入"，为下一页做叙事铺垫。
3. **二次命中的落点在这里**。依据链里 `kind:"case"` 且 `locked:true` 的那枚，归档前灰显、归档后亮起。演示时讲完一轮回到本页切另一条记录，AI 就"变聪明了"。

**报表行与证据联动**：点不同记录，右侧时序/视觉/AI 判断整体跟着换。pump-demo 已实现，保留。

### 4.2 ③a 时序详情子屏（下钻，非主流程节点）

主曲线（阈值线 + 越线阴影）+ 同部位关联测点副图 + 参数面板（阈值/安全侧/采样口径/数据质量）+ 采样表（最多 10 行，区间内均匀抽取，含末点）+ 判读结论 + [返回工作台]。

pump-demo `scripts/scenes/detailscreen.js` 现成，改动仅限：入口从依据链芯片也能进（需接受 `pointId` 参数定位）。

### 4.3 ③b 视觉详情子屏（下钻，非主流程节点）

多帧切换（`role` = current / compare / link）+ bbox 叠框 + 点击放大浮层 + 识别项列表（含置信度）+ 侧栏参照帧 + [返回工作台]。

同上，现成。bbox 是相对**图片实际渲染盒**的 0–1 归一化比例，不是相对外层容器——`<figure>` 必须紧贴图片盒（`height:100%/width:auto` + `inline-block`），否则换宽高比不同的图会整体偏移。

### 4.4 ④ 人工复核（本 POC 的设计重点）

要回答的问题：**AI 说的对不对？人怎么接管？**

选项还是输入框——**都要，分四层**。只给选项就是按部就班；只给输入框，现场没人愿意打字，会尬住。

右上角是**可切换的身份芯片**（数据来自 `DOMAIN_META.reviewers`），不是普通表单项——
它回答的是"谁在做这个决定"，会进报告的 `{{reviewerName}}` / `{{reviewerRole}}` 插槽。

```text
┌───────────────────────────────────────────────────────────────────┐
│ 人工复核 · {objectLabel}                     复核人：[复核人 A ▾]   │
├─────────────────────┬─────────────────────────────────────────────┤
│ 左：AI 匹配票卡      │ 右：人工确认面板                               │
│                     │                                               │
│ 匹配票卡 + 置信度    │ ① AI 意见（只读）                              │
│ 票卡编号 / 对象 / 动作│ ② 人工复核结论：[采纳][修正][驳回]              │
│ [时序证据][视觉证据] │ ③ 复核意见（点击结论后自动填充，可修改）        │
│ [问 Agent]          │ [生成报告] → 弹窗确认是否归档到知识库            │
└───────────────────────────────────────────────────────────────────┘
```

四层各自的职责：

| 层 | 形态 | 讲什么 | 状态影响 |
| --- | --- | --- | --- |
| **L0 表决** | 三态按钮 | "AI 不是判决者" | `accept` → L1 自动预选 AI 建议；`revise`/`reject` → L1 强制重选 |
| **L1 票卡** | 自动匹配 | "确认动作要匹配集团既有票卡" | 驱动报告模板和归档产物 |
| **L2 结构化** | 领域字段，仅用于报告生成 | "人的判断能被系统消费" | 字段值注入报告模板插槽，不常驻主页面 |
| **L3 自由文本** | textarea + 常用语 chips | "系统不限制专家表达" | 原文进报告"专家复核"段、进知识库归档记录 |

**让介入产生后果的三个机关**（这是"不按部就班"的全部内容）：

1. **分歧态**。`outcomeId !== suggestion.outcomeId` 时页面出现橙色分歧条，L3 变为必填（不填则执行按钮 disabled）。这条理由会进报告的"复核分歧说明"段（该段 `showIf:"divergent"`，无分歧时整段不出现），并作为模型反馈样本回流知识库。**两次演示（采纳 vs 驳回）因此跑出两份不同的报告**。
2. **文本回显**。L3 打的字在下一页报告草稿里逐字出现（插槽 `{{reviewNote}}`）。现场打一句"现场已复核，建议下周检修窗口处理"，翻页就看到它出现在报告正文里。
3. **报告弹窗**。点"生成报告"只打开当前页浮层，确认后写入知识库并停留在复核页；不跳独立归档页，不做完成态页面。

### 4.5 报告归档弹窗

要回答的问题：**这次处置怎么沉淀下来？**

```text
┌───────────────────────────────┬──────────────────────┐
│ 【报告草稿】（模板插槽渲染）      │ 【归档去向】           │
│  一、异常发现  …               │  目标分类：归档案例     │
│  二、证据链    …               │  案例编号：{{caseId}}  │
│  三、AI 建议   …               │  可复用范围：…         │
│  四、专家复核  ← L3 原文高亮     │                      │
│  五、复核分歧  ← 有分歧才出现     │  [确认归档]           │
│  六、处置与复测 …               │  归档动画：            │
│                               │  报告卡 →飞入→ 知识库   │
│  ↑ 每段带三色状态点             ├──────────────────────┤
│                               │ 【二次命中解锁卡】      │
│                               │  归档前灰 / 归档后亮起  │
└───────────────────────────────┴──────────────────────┘
```

两个关键点：

- **报告是模板 + 插槽，不是静态文本**。pump-demo 现在是三套完全静态的 `reportSections`，是这一版要改掉的最大一处——静态文本没有任何位置能装下人工输入。
- **归档是人工复核的附带动作**。报告在复核页弹窗预览，确认后知识库分类计数 +1、文档列表顶部出现这篇新文档；页面不自动跳走，避免演示流程被打断。

### 4.6 ⑥ 知识库

要回答的问题：**资料怎么进来、怎么被检索到？**

职责收窄为三件事：文档索引、上传入库动画、Agent 问答。**不画任何关系图或节点连线**——文档之间的关系可视化由独立的知识文档地图承担。

```text
┌────────────────────────────────────────────────────────────┐
│ 知识库                                        [上传文档] →  │
├────────────────────────────────────────────────────────────┤
│ 顶部指标：分类数 / 文档数 / 可视化正文数 / 入库状态           │
├──────────────┬──────────────────────┬──────────────────────┤
│ 分类列表      │ 文档卡片流            │ 演示操作台            │
│ ○ 制度规范    │（含刚归档进来的报告）  │ ├ 文档入库演示 [上传] │
│ ○ 指标口径    │ 点击 → 文档阅读器浮层  │ ├ Agent 问答  [打开] │
│ ○ 作业模板    │ 左：元信息            │ └ 命中材料概览        │
│ ○ 归档案例 +1 │ 中：Chunk 卡          │                      │
│              │ 右：可命中问答         │                      │
└──────────────┴──────────────────────┴──────────────────────┘
```

**入库动画**（浮层，定时器驱动，5–6 步）：`上传 → 解析 → 切分（chunk 卡逐个落下）→ 向量化（相似度条跑分）→ 入库 → 可检索（查询气泡命中高亮 2 段）`。pump-demo 有完整动画实现，prototype-v3 的 `data/knowledge/rag.json` 有完整 pipeline 数据，两边合并即可，不需新设计。

---

## 5. 通用组件契约

### 5.1 AgentPanel（一套组件，三处使用）

用在工作台、人工复核、知识库。只换 `contextId` 换语料，组件本身不读领域数据。

```text
┌────────────────────────────────────────────────────┐
│ Agent 助手 · {contextLabel}                    [×] │
├──────────────────┬─────────────────────────────────┤
│ 预设问题（点击提问）│ 对话流                          │
│ ▸ 这条异常怎么判的?│  [我] 这条异常怎么判的？          │
│ ▸ 依据哪些标准?   │  [Agent] ⏳ 检索中…（打字机动画）  │
│ ▸ 历史有没有类似? │  [Agent] 答案正文…               │
│ ▸ 现在该怎么处理? │  ┌ 命中依据 ─────────────────┐  │
│                  │  │ ✔ 制度 DOC-001 §3.2  →跳转 │ │
│ ────────────     │  │ ✔ 案例 CASE-0721     →跳转 │ │
│ [输入框（可打字）] │  └────────────────────────────┘ │
│  ← 非预设问题     │                                 │
│                  │  ✖ 未命中态（hit:false）：       │
│                  │  "知识库暂无直接依据，以下为模型   │
│                  │   基于时序特征的推断，建议人工确认" │
└──────────────────┴─────────────────────────────────┘
```

四点设计意图：

1. **命中 / 未命中两态都要做**。全命中反而假。留 1–2 个预设问题是未命中，Agent 明说"这是推断"——既真实，又顺势把"所以需要人工复核"讲出来。
2. **打字机 + 检索中动画**，定时器驱动 2–3 步，别太慢。这是"像真 Agent"的全部成本所在。
3. **命中卡可点击跳转**：知识库上下文 → 打开文档阅读器并定位到 `chunkIndex`；工作台上下文 → 跳对应证据。
4. **输入框保留但收敛**：可打字，任何非预设输入统一回 `fallbackAnswer`（"这个问题需要接入实时数据，本演示环境暂不支持，可以试试左侧预设问题"）。诚实且防翻车。

### 5.2 ReviewForm（新写）

承载 4.4 的 L0–L3 四层，是本 POC 唯一一个真正新写的复杂组件。对外只暴露 `render(options)`，读 `06-review.js` 契约 + `state.review`，产出 DOM，不直接改状态（所有变更走 action 分发）。

### 5.3 其余组件：直接搬 pump-demo

| 组件 | 来源 | 说明 |
| --- | --- | --- |
| `Cards.metric` / `Cards.evidence` | `ui/cards.js` 121 行 | `metric` 的 `sparkId` 只产出空占位容器，场景层自己塞 `Charts.slot(id)` |
| `SelectList` | `ui/selectlist.js` 287 行 | `variant: "row" \| "table"`，列定义来自数据层 |
| `Overlay` | `ui/overlay.js` 125 行 | `{open,title,kicker,body,actions,onCloseAction,wide,closeDisabled,panelClass}` |
| `DetailCard` | `ui/detailcard.js` 147 行 | |
| `Charts` / `ChartOptions` | `core/charts.js` 177 + `core/chartopts.js` 499 | `slot/draw/flush` + `trend/spark` |
| `SceneTimers` | `core/timers.js` 135 行 | 按场景注册，切场景自动清理 |

新增两个小件：**ConfidenceBar**（置信度条 + 口径文字）、**EvidenceChain**（4 枚可点依据芯片，按 `kind` 分发）。

---

## 6. 状态模型

两层结构沿用 pump-demo（`focus` 跨场景共享 / `pick` 按场景隔离），复核独立成第三块：

```js
state = {
  scene: "workbench" | "review" | "archive" | "knowledge",
  detail: "" | "trend" | "vision",
  range: "7d",

  focus: { objectId, partId },              // 跨场景主体

  pick: {                                    // 按场景隔离，结构性地不可能互相踩踏
    workbench: recordId,
    trend:  { pointId },
    vision: { frameId, zoomOpen },
    knowledge: { categoryId, docId, chunkIndex, ingestStep, ingestOpen }
  },

  agent: { open, contextId, questionId, phase: "idle"|"thinking"|"answered" },

  review: {
    reviewerId: "reviewer-a",                // 谁在做这个决定，进报告插槽
    vote: "" | "accept" | "revise" | "reject",
    outcomeId: "",                           // 存 id，不存中文 label
    fields: {},                              // { crew: "...", window: "...", flags: [...] }
    note: "",
    executed: false,
    retestPassed: null                       // null | true | false
  },

  archived: false,
  flowVisited: ["inspection"]
}
```

**派生量，不落盘**（落盘就会和源字段不同步）：

```text
divergent   = outcomeId !== "" && outcomeId !== diagnosis.suggestion.outcomeId
canExecute  = outcomeId !== "" && 必填 fields 齐全 && (!divergent || note.trim() !== "")
canArchive  = review.executed === true
retestFailed= review.retestPassed === false
```

**持久化**：`STORAGE_KEY = "diagnosis-flow-v4-state"`。结构一变就换 key、旧状态整体丢弃，**不做半新半旧的字段级兼容**——演示机上留一份半坏状态是最容易在现场翻车的东西（pump-demo 的 key 已经排到 `pump-demo-v10-state`，其中 `pick.overview` 存错值导致整页空白、且刷新也救不回来那次就是教训）。

**两条清洗路径必须分开写**：
- `normalizeState()` 处理从 localStorage 读出的候选状态 → 值不在字典里就**退回默认**，不抛错（磁盘数据可能来自旧版本或被手改）。
- 运行期的 `selectXxx()` 入口函数 → 值不在字典里直接**抛错**（那意味着代码有 bug 或契约被破坏，不能悄悄盖住）。

---

## 7. action 清单

所有交互走 `boot.js` 的 `data-action` 分发，场景文件只渲染、不新造事件通路。

| 分组 | action |
| --- | --- |
| 全局 | `reset-demo`、`set-range` |
| 导航 | `go-workbench`、`go-review`、`go-knowledge` |
| 工作台 | `select-record`（SelectList `name="workbench-record"`）、`open-evidence`（依据链，按 `kind` 分发） |
| 子屏 | `open-trend-detail`、`open-vision-detail`、`close-detail`、`select-point`、`select-frame`、`zoom-frame`、`close-zoom` |
| Agent | `open-agent`（带 `contextId`）、`select-agent-question`、`submit-agent-input`、`close-agent` |
| 复核 | `select-reviewer`、`review-vote`、`select-outcome`、`set-field`、`toggle-flag`、`append-phrase`、`input-note`、`execute-review`、`retest-pass`、`retest-fail`、`open-report-archive`、`close-report-archive` |
| 归档 | `go-archive`（兼容动作，打开复核页报告归档浮层）、`archive-report` |
| 知识库 | `select-kb-category`、`open-doc`、`close-doc`、`start-ingest`、`close-ingest` |

---

## 8. 领域包：10 份契约

放在 `domain-<课题>/`，加载顺序即编号顺序。字段缺失、id 悬空、引用越界一律在启动时抛错，**不做兜底、不吞错**。

### 8.1 `00-meta.js` — 身份、术语、入口

```js
window.DOMAIN_META = {
  domainId: "pump",                    // "pump" | "inspection"
  title, subtitle, batchId, clockText, statusLine,

  // 骨架里所有面向用户的名词都从这里取，不在场景文件里写死
  terms: {
    object: "机组",        // 巡检课题 → "区域"
    part:   "部位",        //          → "点位"
    record: "巡检记录",     //          → "表单项"
    inspector: "巡检人",
    workOrder: "处置票卡"
  },

  scenes:    [{ key, label, node }],   // 恰好 3 项，key 固定为 workbench/review/knowledge
  flowSteps: [{ key, label, desc }],   // 恰好 6 步，key 固定为 inspection/trend/vision/agent/review/archive

  // 复核人身份。它不是结论的附属字段，而是"谁在做这个决定"，因此挂在 meta 上、
  // 由复核页右上角的身份芯片切换，不进 06-review.js 的 fields。
  reviewers: [{ id, name, role }],
  defaultReviewerId: "reviewer-a",

  // 唯一的对外接缝：本轮演示的起点
  entry: { objectId, partId, recordId }
};
```

`role` 目前只进报告插槽（`{{reviewerRole}}`），**不影响处置步骤**。角色分工规则要由
业务提供，编一套假的塞进 demo 会变成误导；等业务给出规则再加，加的时候只动数据。

### 8.2 `01-taxonomy.js` — 对象树

```js
window.DOMAIN_TAXONOMY = {
  objects: [{ id, label, short, note }],
  parts:   [{ id, objectId, label, short, badge, component, summary, checkItem }],
  points:  [{ id, partId, label, unit, primary, threshold, safeSide }]
};
```

- `parts[].objectId` 为 `null` 表示**所有对象共用这套部位表**（泵课题 P-1…P-4 物理布局相同）。这是显式语义，不是兜底。
- 每个 part 必须恰好有一个 `primary: true` 的 point，它是该部位状态色的唯一派生依据。
- `safeSide`: `"above"` 表示越大越安全（如健康度），`"below"` 表示越小越安全（如差压）。

### 8.3 `02-records.js` — 报表

```js
window.DOMAIN_RECORDS = {
  columns: [{ key, label, type: "status-dot"|"text"|"badge-icon", width }],
  records: [{ id, objectId, partId, date, shift, inspector, item, result,
              aiFlag: "conflict"|"gap"|"ok", note }],
  aiFlagText: {
    conflict: { status: "danger", badge, lead },
    gap:      { status: "warn",   badge, lead },
    ok:       { status: "ok",     badge, lead }
  }
};
```

`columns` 声明了哪些 key，`records` 就必须提供哪些 key，缺一个直接抛错。三张 `aiFlagText` 字典必须覆盖 `records` 里出现的所有 `aiFlag` 取值。

### 8.4 `03-series.js` — 时序

```js
window.DOMAIN_SERIES = {
  ranges: [{ key: "7d", label, points, hoursPerPoint }],
  seed:   { /* 生成器种子，保证同一 (objectId,pointId,range) 每次结果一致 */ },
  // series(objectId, pointId, rangeKey) →
  //   { label, unit, dates[], values[], latest, status, alert, threshold, safeSide }
  series: function (objectId, pointId, rangeKey) { … }
};
```

**同源要求**：工作台的时序卡、时序子屏、复核页的证据 mini 图必须调同一个 `series()`。pump-demo 早期工作台读写死的 `part.trend`、子屏读 `DATA.series()`，切时间范围时一个动一个不动，数字对不上——这是真实穿帮，不要重犯。

### 8.5 `04-vision.js` — 视觉

```js
window.DOMAIN_VISION = {
  media:  { key: "media/xxx.jpg" },
  frames: [{ id, partId, label, src, bbox: { x, y, w, h },
             boxLabel, findings: [], confidence,
             role: "current"|"compare"|"link" }]
};
```

- `bbox` 是相对**图片本身**的 0–1 归一化比例，四个分量都必须在 `[0,1]` 内，且 `x+w ≤ 1`、`y+h ≤ 1`。
- `src` 必须能在 `media` 映射表里查到。
- `findings` 长度 1–4。

### 8.6 `05-diagnosis.js` — AI 判断（新增，pump-demo 无对应）

```js
window.DOMAIN_DIAGNOSIS = {
  cases: [{
    id, objectId, partId, recordId,
    suggestion: { outcomeId, label, text },
    confidence: 82,
    confidenceBand: "high" | "needs-review" | "insufficient",
    evidenceChain: [
      { kind: "series", label, detail, pointId },
      { kind: "vision", label, detail, frameId },
      { kind: "rule",   label, detail, ruleId  },
      { kind: "case",   label, detail, docId, locked: true }   // 归档后才亮
    ],
    summary
  }],
  rules: [{ id, title, text, source }]
};
```

`suggestion.outcomeId` 必须存在于 `06-review.js` 的 `outcomes` 里——分歧态的整个判断建立在这条引用上。

### 8.7 `06-review.js` — 人工复核（核心契约）

```js
window.DOMAIN_REVIEW = {
  votes: [{ id: "accept", label: "采纳" },
          { id: "revise", label: "修正" },
          { id: "reject", label: "驳回" }],

  outcomes: [{
    id, label, hint, impact,
    track: "treatment" | "closure",        // 路径标签，不是布尔量
    fields: ["crew", "window", "riskLevel"],
    steps: [ … ],
    executeText, executedText,
    retest: { enable: true, passLabel, failLabel },
    unlocksReuse: true,
    archive: { categoryId, titleTpl, caseIdTpl, statusText }
  }],

  fields: {
    crew:      { label: "处置班组", type: "select",   options: [...], required: true },
    window:    { label: "复测窗口", type: "select",   options: [...] },
    riskLevel: { label: "风险等级", type: "select",   options: [...] },
    flags:     { label: "",         type: "checkbox", options: [{ id, label, default }] }
  },

  phrases: ["现场已复核确认", "需申请备件", "建议下轮重点关注", … ],

  divergence: { requireNote: true, noteHint, badgeText, reportSectionId: "divergence" },
  notePlaceholder: "…"
};
```

**为什么用 `track` 而不是 `isMaintenance` 布尔量**：pump-demo 的 schema 强制 `verdicts` 里**恰好有 1 条** `isMaintenance: true`，换课题或增加"转专项检修""移交厂家"这类第 4、5 条结论时会直接抛错。`track` 是路径标签，新增结论只改数据，骨架不动。

**结论 id 与 label 分离**：`state.review.outcomeId` 存 id。pump-demo 存的是中文 label，导致数据层到处要 `verdictByLabel()` 反查、schema 还得额外强制 label 不许重复。

### 8.8 `07-report.js` — 报告模板

```js
window.DOMAIN_REPORT = {
  titleTpl: "{{objectLabel}} {{caseTitle}} 复核报告",
  sections: [
    { id: "finding",    title: "一、异常发现", status: "warn", text: "{{objectLabel}} 于 {{date}} …" },
    { id: "evidence",   title: "二、证据链",   status: "warn", text: "…" },
    { id: "ai",         title: "三、AI 建议",  status: "warn", text: "{{aiConclusion}}（置信度 {{confidence}}%）" },
    { id: "review",     title: "四、专家复核", status: "ok",   text: "复核人 {{reviewerName}}（{{reviewerRole}}）结论：{{outcomeLabel}}。{{reviewNote}}" },
    { id: "divergence", title: "五、复核分歧", status: "warn", text: "{{divergenceReason}}", showIf: "divergent" },
    { id: "retestFail", title: "复测未通过记录", status: "danger", text: "…",  showIf: "retestFailed" },
    { id: "treatment",  title: "六、处置与复测", status: "ok",  text: "…",     showIf: "treatment" }
  ],
  slots: ["objectLabel","partLabel","date","inspector","aiConclusion","confidence",
          "reviewerName","reviewerRole","outcomeLabel","reviewNote","divergenceReason",
          "crew","window","riskLevel","retestResult","caseId"]
};
```

- `showIf` 取值：`"divergent"` / `"retestFailed"` / `"treatment"` / `"closure"`。段落因此**随人的行为变化**，两次演示跑出两份不同的报告。
- `slots` 是给校验器用的：模板里出现的每个 `{{x}}` 都必须在 `slots` 里声明，且骨架必须能提供该值。这防的正是"改了模板文案、插槽名打错、页面静默显示 `{{reviewNote}}` 原文"。

### 8.9 `08-agentqa.js` — Agent 语料

```js
window.DOMAIN_AGENTQA = {
  contexts: [{
    id: "workbench" | "review" | "knowledge",
    entryTitle, entryText, kicker, summary, emptyText, fallbackAnswer,
    questions: [{
      id, label, question,
      thinkingText: "正在检索知识库…",
      answer,
      hit: true,                              // false → 渲染未命中态
      hits: [{ kind, text, docId, chunkIndex }],
      unlockedBy: "archived"                  // 可选：归档后才出现（二次命中）
    }]
  }]
};
```

`hits[].kind` 取值：`current` / `standard` / `metric` / `workcard` / `rule` / `case` / `report`。`hits[].docId` 必须能在 `09-kb.js` 的 `documents` 里查到，`chunkIndex` 不得越界。

### 8.10 `09-kb.js` — 知识库

数据形状：

```js
categories: [{ id, title, desc }]
documents:  [{ id, categoryId, title, type, summary, source, updatedAt, body: [] | null }]
qaPresets:  [{ id, question, answer, citations: [{ docId, hintChunks: [] }] }]
ingestion:  [{ key, label, desc, ms }]      // 5–6 步
ingestDemoDocId: "DOC-…"
archiveTarget:   { categoryId: "cat-case" } // 归档报告落到哪个分类
```

**出口一律是函数**（`categories()` / `documents(categoryId?)` / `document(id)` /
`chunksOf(id)` / `qaPresets()` / `qaPreset(id)` / `retrieve(presetId)` / `ingestion()` /
`ingestDemoDocId()` / `archiveTarget()`）。混用"函数 + 直接导出的值"会让一半出口是活的、
一半是加载时的快照——改数据时只有一半生效，且不报错。这条是实现时真的踩到并由反例
断言抓出来的，见 `verify/README.md`。

`retrieve()` 的返回**必须恒等于该预设声明的 citations 集合**，不能是"取前 N 名"。
pump-demo 早先是 `hits.slice(0, 3)`，而多数预设只声明 1–2 段，于是入库动画高亮的
chunk 和答案实际引用的 chunk 对不上——当时全套数据断言是绿的，因为没人断言过这件事。

- `body: null` 表示"仅摘要"文档，不可下载、不参与 chunk 切分。空数组是非法的——没有正文请显式写 `null`。
- `citations[].docId` 引用的文档必须有 `body`；`hintChunks` 的下标不得越界。
- `archiveTarget.categoryId` 就是归档动画的落点，也是那个 "+1" 计数的目标分类。

---

## 9. 复用来源对照

搬运为主，新写的只有三处（复核页、ReviewForm、AI 判断卡的依据链）。

| 目标 | 来源 | 行数 | 改动 |
| --- | --- | --- | --- |
| `core/dom.js` `charts.js` `chartopts.js` `timers.js` | pump-demo 同名 | 90 / 177 / 499 / 135 | 直接搬 |
| `core/state.js` | pump-demo | 413 | **改**：加 `review` 块，`pick` 泛化，去掉 `pick.knowledge.view` 双模 |
| `ui/cards.js` `selectlist.js` `overlay.js` `detailcard.js` | pump-demo 同名 | 121 / 287 / 125 / 147 | 直接搬 |
| `ui/agentpanel.js` | pump-demo `ui/agentdialog.js` | 131 | **改**：加对话流、打字机、未命中态、输入框 |
| `ui/reviewform.js` `evidencechain.js` `confidencebar.js` | — | — | **新写** |
| `scenes/workbench.js` | pump-demo 同名 | 268 | **改**：加 AI 判断卡 + 依据链 |
| `scenes/detailscreen.js` | pump-demo 同名 | 584 | 搬，仅加"接受 pointId/frameId 定位参数" |
| `scenes/review.js` | pump-demo `confirm.js` 参考结构 | 341 | **新写**（三段式布局可参考，介入区全新） |
| `scenes/archive.js` | pump-demo 同名 | 113 | **改**：静态段落 → 模板插槽渲染 |
| `scenes/knowledge.js` | pump-demo 同名 | 488 | 搬，去掉图谱切换按钮 |
| `domain-pump/*` | pump-demo `scripts/data/*`（不含 `graph*.js` 和 `schema.js`） | 2504 | 按 10 份契约重排字段 |
| `domain-inspection/*` | prototype-v3 `data/`（6 区域包 + `knowledge/rag.json`） | — | 用 `tools/build-domain.py` 生成 `.js` |
| `verify/*` | pump-demo `verify/` | — | 搬整套 + 补 review/report 用例 |

**不搬**：`pump3d/`（2000 行）、`scenes/overview.js`、`scenes/station.js`、`scenes/graph.js`、`data/graph*.js`、`schema.js` 里的 graph 校验段。

---

## 10. 目录结构

```text
poc/diagnosis-flow/
├─ DESIGN.md                  本文
├─ index.html                 4 页导航壳（唯一入口）
├─ dev/index.html             单页打磨入口目录（13 个 preset 链接）
├─ styles/
│   ├─ 01-tokens.css  02-shell.css  03-cards.css  04-charts.css
│   ├─ 05-workbench.css  06-detail.css  07-review.css
│   ├─ 08-archive.css  09-knowledge.css
│   └─ 10-overlay.css  11-responsive.css
├─ scripts/
│   ├─ core/       dom / state / report / charts / chartopts / timers / screen-scale
│   ├─ ui/         cards / selectlist / overlay
│   │              confidencebar / evidencechain / reviewform / agentpanel
│   ├─ scenes/     workbench / detailscreen / review / archive / knowledge
│   ├─ schema.js   10 份契约的启动校验
│   ├─ devpresets.js  URL hash preset（正常演示下是空操作）
│   └─ boot.js     渲染管线 + action 分发
├─ domain-skeleton/       00-meta … 09-kb（10 份，最小假数据）
├─ domain-pump/           同上（待建）
├─ domain-inspection/     同上（待建）
├─ media/        占位 SVG（domain-skeleton 用）
├─ vendor/       echarts.min.js（不含 three.js）
├─ tools/        build-domain.py（v3 数据包 → domain-inspection/*.js，待建）
└─ verify/       verify_domain.js / verify_state.js / verify_flow.py / README.md
```

**一页一 CSS 文件 + preset 单页入口 + 一页一 verify 用例**——这三件事让"单页独立打磨"的收益不必靠拆目录换取。

`core/report.js` 是实现时新增的一层：报告模板的插槽解析有**两个**消费者（归档页要渲染它，知识库页要把归档结果当成一篇新文档插进列表），而同层场景文件之间不得互相引用，所以共用逻辑必须上提。

**dev 入口没有做成四份独立 HTML**：那需要把 index.html 的四十多个 `<script>` 复制四份，加一个组件就要改五处，迟早漂移。改成同一个 index.html + URL hash（`#preset=review-divergent`），preset 里的结论和字段取值全部从契约现算（"第一条与 AI 建议不同的结论"、"该字段的第一个选项"），换成 domain-pump 之后这些入口依然可用。preset 状态不落盘。

**目录命名**：不叫 `prototype-v4`，那个名字留给最终组装的那一版。

---

## 11. 验证策略

宣布任何一步完成前必须有证据，只凭 diff 判断成功不算数。

| 脚本 | 验什么 | 当前 |
| --- | --- | --- |
| `node --check` | 每个 `.js` 语法 | 无输出即通过 |
| `verify/verify_domain.js` | 10 份契约的 schema，**每包都要跑**：字段缺失、id 悬空、bbox 越界、`hintChunks` 越界、`suggestion.outcomeId` 是否存在于 `outcomes`、插槽闭合、检索恒等于 citations、时序生成器的确定性。**一半篇幅是构造反例**，断言校验器真的抛错 | 130 项＝正向 60 + 反例 70 |
| `verify/verify_state.js` | 状态机：派生量真值表（`canExecute` / `isDivergent` / `canOpen` / `reuseUnlocked`）、**脏持久状态的清洗**、运行期入口的抛错 | 78 项 |
| `verify/verify_flow.py` | 端到端主线走查：四页 + 两子屏 + 三浮层能渲染、能点、能联动；**两条支线产出段数不同的报告**；图表宿主高度护栏；全程无 console error | 79 项 |

报告插槽的闭合校验并入了 `verify_domain.js`（不单开 `verify_slots.js`——它只有一条规则，单独一个文件会让人以为它是另一套东西）。

后续随功能补：`verify_css_snapshot.py`（CSS 基线，防"改一页炸另一页"）。

细节与已抓到的三个问题见 `verify/README.md`。

---

## 12. 待业务确认

以下都是**数据**不是结构，可以先用占位值把骨架跑通，后续替换不改代码：

- 两个课题各自的 `outcomes` 条目（结论说法、处置步骤、归档分类）
- `fields` 的选项值（班组名称、复测窗口口径、风险等级分档）
- 报告七段的正式文案与状态色
- 哪 1–2 个 Agent 预设问题设为"未命中"
- 置信度三档（`high` / `needs-review` / `insufficient`）的分界值

---

## 13. 建议的实施顺序

```text
✅ 1. 契约先行  domain-skeleton/（最小假数据）+ schema.js + verify_domain.js
✅ 2. 骨架壳    core/state.js 的 review 块、boot.js 路由、导航 + 6 步流程条
✅ 3. ④ 人工复核  ← 最新、风险最高，先做
✅ 4. ③ 工作台   ← AI 判断卡 + 依据链
✅ 5. ⑤ 报告归档 ← 模板插槽
✅ 6. ⑥ 知识库   ← 文档索引 + 入库动画
✅ 7. 两个子屏 + AgentPanel
✅ 8. 验证补齐（verify_state / verify_flow）+ dev preset 入口
⬜ 9. 数据包    domain-pump（从 pump-demo 迁）→ domain-inspection（从 v3 迁）
```

先做第 3 步而不是按页面顺序，是因为人工复核页是**唯一没有现成实现可搬**的一页，它站不住则整个 POC 的核心命题站不住。

第 1–8 步已完成，骨架跑在 `domain-skeleton` 上全绿。第 9 步是纯数据迁移：按第 8 章的 10 份契约重排 pump-demo 的数据层、用 `tools/build-domain.py` 把 prototype-v3 的 `data/` 生成成 `.js`，两包各自跑一遍 `verify_domain.js domain-<名>` 即可接入，骨架代码不动。
