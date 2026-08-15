# scripts/data —— 数据集架构说明（阶段三 G1）

本目录把演示数据分成三层：**内容（数据集）**、**规格（声明）**、**派生器（计算）**。
知识库和知识图谱是这轮改造的重点，其余数据（catalog/series/records）沿用既有分层，
不受影响。

## 硬约束：数据集必须是 `.js`，不能是 `.json`

整个原型跑在 `file://` 协议下打开 `index.html`，浏览器会拦截 `fetch()`/`XMLHttpRequest`
对本地文件的请求（CORS 对 `file://` 的限制），所以**不能**用 `fetch("xxx.json")` 加载数据。
所有数据集都写成"把一个字面量对象挂到 `window` 上"的 `.js` 文件，通过 `<script>` 标签加载
——这是本项目最基本的约束，也是"换数据集"这个动作的具体含义：

> 换数据集 = 换一个 `.js` 文件的内容，不是新增/替换一个 `.json` 文件。

如果未来要接真实数据源，正确的做法是让后端把数据渲染成同样结构的 `.js`
（`window.DemoKbDataset = {...}`），而不是切换成 `.json` + `fetch`。

## 分层与加载顺序

```
seed.js         —— 确定性 PRNG（hashKey / makeRandom），被 series/records/kb 复用
schema.js       —— 校验器，只定义函数，不在加载时读取其它数据文件
catalog.js      —— 机组/部位/测点/巡检等结构化数据
knowledge.js    —— 旧版知识库/图谱裸数据（保留，见下文"旧出口"）
kb-dataset.js   —— 新知识库数据集：纯内容，零逻辑（阶段三 G1 新增，本 README 的重点）
graph-spec.js   —— 图谱投影规格：声明式描述实体/列带/边/主线脊柱（阶段三 G1 新增）
series.js       —— 时序生成器
records.js      —— 巡检记录生成器
kb.js           —— 知识库派生器：从 kb-dataset 确定性切分 chunk、算相似度、检索命中
graph.js        —— 图谱投影器：按 graph-spec 从 catalog + kb-dataset 投影出节点/边
index.js        —— 唯一出口 window.DemoData
```

`index.html` 里的 `<script>` 顺序就是照这份清单排的，任何调整都必须同步改
`index.html`（不在本任务改动范围内，若需要调整加载顺序请单独提出）。

## kb-dataset.js —— 知识库数据集（换数据只改这个文件）

```js
window.DemoKbDataset = {
  schemaVersion: 1,
  categories: [{ id, title, desc }, ...],
  documents: [{ id, categoryId, title, type, summary, source, updatedAt, body }, ...],
  qaPresets: [{ id, question, answer, citations: [{ docId, hintChunks }] }, ...],
  ingestion: [step1, step2, step3, step4, step5]
};
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 必须等于 `1`（`scripts/data/schema.js` 里的 `SCHEMA_VERSION`）|
| `categories[].id` | 是，唯一 | 命名约定 `cat-xxx` |
| `categories[].title` / `.desc` | 是 | 展示文案 |
| `documents[].id` | 是，唯一 | 命名约定 `doc-xxx` |
| `documents[].categoryId` | 是 | 必须指向 `categories` 里某个 `id` |
| `documents[].type` | 是 | **与该文档所属 `category.title` 保持一致**（这是本任务收敛的两套分类词表：旧版 `documents` 用"作业卡/专家规则/归档案例/指标口径"、`categories` 用"制度规范/指标口径/作业模板/归档案例"，两套并存互相打架；新数据集统一成一套，`type` 直接照抄所属分类的 `title`）|
| `documents[].summary` | 是 | 列表态展示的一两句摘要，`body` 为 `null` 的文档只靠这个字段展示 |
| `documents[].source` / `.updatedAt` | 是 | 来源与更新时间文案 |
| `documents[].body` | 是（值可以是 `null`）| `null` = 只有摘要，不能被打开正文/下载/被 `qaPresets` 引用；字符串数组 = 每个元素是一个自然段，`scripts/data/kb.js` 的 `chunksOf()` 从这里确定性切分 chunk |
| `qaPresets[].id` | 是，唯一 | 命名约定 `qa-xxx` |
| `qaPresets[].question` / `.answer` | 是 | 预设问答的问题和参考答案文案 |
| `qaPresets[].citations[].docId` | 是 | 必须指向一份**带 `body`** 的文档 |
| `qaPresets[].citations[].hintChunks` | 是，非空数组 | **叙事旋钮**：这几个 chunk 下标会被 `similarity()` 抬到 0.88-0.96，且必须落在 `chunksOf(docId)` 的实际范围内——换了正文、chunk 数量变了，这里的下标也要跟着复核，`schema.js` 会在启动时校验越界 |
| `ingestion` | 是，长度必须为 5 | 入库动画的 5 段术语，第 5 段要能体现"命中检索"，不只是"进入 Agent 可引用知识" |

### 换成真实业务数据要改哪一行

1. **只改 `documents` 数组的内容**：换掉 `title/summary/source/updatedAt/body`，`id`
   保留或换成新的都可以，只要仍然唯一、`categoryId` 仍然指向存在的分类。
2. 如果新增/删除文档改变了某个分类下"带 `body`"的文档，检查 `qaPresets[].citations`
   是否还指向合法的 `docId`；`schema.js` 会在启动时直接抛错指出具体哪一条不合规。
3. **不需要改 `scripts/data/kb.js`**：chunk 切分、相似度、检索命中全部从 `body`
   现算，换正文之后这些全部自动跟着变（这是本任务的核心验证点，见
   原 pump-demo 的 `verify_data.js` 里"换正文 -> chunk 跟着变"那组断言）。
4. **不需要改 `scripts/data/graph.js`**：`rule`/`workcard`/`case` 三类图谱节点是按
   `categoryId` 从 `kb-dataset.documents` 里现取的，加一份规则文档，图谱自动多一个
   节点（同理 `graph-spec.js` 里的 `pointRuleTriggers` / `ruleWorkcardLinks` /
   `ticketCaseLinks` / `caseReuseLinks` 这几张"具体节点级"关联表，如果新增的文档需要
   参与这些具体关系，才需要手动加一行——纯粹的"多一份归档案例"不需要碰这些表）。

## kb.js —— 知识库派生器（不需要跟着换数据集改）

- `chunksOf(docId)`：把 `body` 按自然段切分，单段超过 170 字符（`MAX_CHUNK_CHARS`）时
  再按句号累加切分，返回 `[{ index, text, chars }]`。纯函数、无缓存，每次现算。
- `similarity(queryId, docId, chunkIndex)`：`hashKey(queryId+"|"+docId+"|"+index)`
  映射到 `[0.62, 0.94]`；若该下标在对应 `qaPreset.citations[].hintChunks` 里，改用
  `hashKey(...+"|hint")` 映射到 `[0.88, 0.96]`。同一组参数永远算出同一个数。
- `retrieve(qaPresetId)`：候选池限定在该问答 `citations` 覆盖的文档内，按
  `similarity()` 降序取前 3 条。
- `ingestPlan(docId)`：`{ docId, totalChunks, displayChunks, displayCap }`，
  `displayChunks = min(totalChunks, displayCap)`，`displayCap` 当前是 `12`——动画只
  按 `displayChunks` 渲染方块，**不要假设 `totalChunks` 恰好等于 12**，换了长文档可能
  切出几十段。

## graph-spec.js / graph.js —— 图谱投影规格与投影器

`graph-spec.js` 声明（不手写节点列表）：

- `bands`：8 类实体（`asset`/`part`/`point`/`rule`/`workcard`/`case`/`agent`/`ticket`）
  各自占据 0-100 坐标系里的一段列带，两两不重叠（`schema.js` 校验）。
- `entitySources`：每类节点从哪个数据源取（`catalog.pumpUnits`/`catalog.parts`/
  `catalog.points`/`kb.documents(categoryId)`/`catalog.workOrder`/合成节点）。
- `edgeRules`：类型级的边语义模板（`from`/`to`/`label`）。
- `pointRuleTriggers` / `ruleWorkcardLinks` / `ticketCaseLinks` / `caseReuseLinks`：
  具体节点级的关联表，只在 catalog/kb-dataset 本身没有直接字段可以推出关系时才需要
  （比如"哪个测点触发哪份规则文档"）。
- `spine`：主线流光路径的节点 id 顺序 + 显式坐标覆盖（仍必须落在所属类型的列带内）。

`graph.js` 按这份规格从 `catalog` + `kb-dataset` 现算出 `{ nodes, edges, spine }`，
**不手写任何具体节点**：加一个部位、加一份规则文档，图谱节点和边都会自动增加
（见 `verify_data.js` 里"投影不漂移"那组断言：临时给 `catalog.parts` 加一项，
`graphData().nodes.length` 会跟着 +1）。

## schema.js —— 校验器

```js
window.DemoDataSchema.assertAll(); // 无参数，无返回值，不合规直接 throw Error
```

`assertAll()` 依次校验：

1. `DemoKbDataset`（`assertKbDataset`）：categories/documents/qaPresets 的必填字段、
   id 唯一性、`categoryId` 引用完整性、`citations` 引用完整性（含"必须有 body"）、
   `hintChunks` 越界检查、`schemaVersion`。
2. `DemoGraphSpec`（`assertGraphSpec`）：`bands` 合法且两两不重叠、`edgeRules`
   引用的实体类型必须已声明、`spine` 结构合法、`schemaVersion`。
3. `DemoGraph.build()` 的投影结果（`assertGraphData`）：节点 id 唯一、节点 x 落在
   所属列带内、边两端节点存在、`spine` 引用的节点存在。

`schema.js` 只定义函数，不在加载时读取任何其它数据文件的全局——`assertAll()` 内部才
读 `window.DemoKbDataset`/`window.DemoGraphSpec`/`window.DemoDataCatalog`/
`window.DemoKb`/`window.DemoGraph`，因此调用时机只要求"这几个全局都已经加载完"，
不要求 `schema.js` 本身在它们之前或之后加载。**这个函数应由 `boot.js` 在所有数据层
文件加载完之后、首次 `render()` 之前调用一次**（与 `Pump3DContract.assertData()`
同一时机，两者互相独立、谁先谁后都可以）。

## index.js —— 新增出口

```js
DemoData.kbCategories()                 // -> categories[]
DemoData.kbDocuments(categoryId?)       // -> documents[]，不传 categoryId 返回全部
DemoData.kbDocument(docId)              // -> 单份文档，未知 id 抛错
DemoData.kbChunks(docId)                // -> chunksOf(docId)，文档没有 body 时抛错
DemoData.kbRetrieve(qaPresetId)         // -> { corpusChunks, hits }；hits 恒等于该问答声明的 citations 集合，不凑数
DemoData.kbIngestPlan(docId)            // -> { totalChunks, displayChunks, displayCap }
DemoData.kbIngestionSteps()             // -> 5 段入库术语
DemoData.qaPresets()                    // -> qaPresets[]
DemoData.qaPreset(qaPresetId)           // -> 单条预设问答，未知 id 抛错
DemoData.graphData()                    // -> { nodes, edges, spine }
```

`DemoData.knowledgeBase()` / `DemoData.graph()` 这两个旧出口**原样保留**，继续转发
`scripts/data/knowledge.js` 的裸数据，行为完全不变——`scripts/scenes/knowledge.js`、
`scripts/scenes/graph.js`、`scripts/scenes/confirm.js`、`scripts/core/state.js` 仍在
按它们原有的返回形状读取，这几个文件不在本任务改动范围内。新旧两条出口并存，互不
影响；是否/何时把那几个场景文件迁移到消费新出口，由后续任务决定。
