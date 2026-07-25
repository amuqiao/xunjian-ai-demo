# 巡检质量智能分析助手 demo 技术实施定版方案

本文是巡检质量智能分析助手 demo 的当前技术实施定版方案，用于开发落地、报价拆分、工程验收和后续扩展评估。

本文不再做技术选型比较。通用选型方法保留在 [通用 AI 赋能演示 demo 技术实现选型方案.md](<../common/通用 AI 赋能演示 demo 技术实现选型方案.md>)；本项目从这里开始只维护固定主线、可枚举支线和明确不做项。

## 0. 定版结论

本项目固定采用 `B 档：可交互模拟 PoC`。

```text
React + Vite + TypeScript
  + Ant Design 5
  + Apache ECharts
  + Axios
  + TanStack Query
  + React Router
  + Zustand
  + FastAPI
  + Pydantic
  + PostgreSQL
  + 本地 JSON seed
  + Jinja2 报告模板
  + 本地 assets
  + Docker Compose
```

首版目标：

```text
用固定样例数据和真实规则计算，
跑通巡检任务、表单疑点、时序预警、视觉加演、知识库依据、
复检清单、人工确认、报告归档这一条可交互演示闭环。
```

技术原则：

1. PostgreSQL 是运行期真相源；JSON 只做种子数据和演示样例维护。
2. FastAPI 是唯一后端；不再保留 Node / NestJS 分支。
3. React + Vite 是唯一前端；不再保留 Vue / Next.js 分支。
4. Ant Design 5 是唯一 UI 组件主线；不混用其他 UI 框架。
5. Apache ECharts 是唯一图表主线；不再保留 Recharts / AntV 分支。
6. 规则计算在后端完成；前端只展示结果和轻量格式化。
7. 报告由后端生成快照；前端负责展示和演示交互。
8. API 合同以 FastAPI OpenAPI 为准。
9. JSON seed 是冻结场景包；PostgreSQL 是运行时真相源。
10. `TanStack Query` 和 `Zustand` 分别管理服务端状态和演示状态，不互相复制数据。
11. 后端优先复用现有 `fastapi-lite` 骨架的 PostgreSQL、Alembic、SQLAlchemy async、UnitOfWork、repository 和 Docker Compose 能力，不为首版 demo 另起一套数据库 profile。
12. 所有页面、接口和模块都必须服务于“发现疑点、解释依据、推动复检、形成报告”的主线，不做脱离巡检闭环的单独大屏、开放聊天或孤立模型展示。

## 1. 文档职责

本文负责回答：

| 范畴 | 本文定版内容 |
| --- | --- |
| 技术栈 | 前端、UI、图表、状态、后端、数据、报告、部署的固定选择。 |
| 架构 | 前后端职责、数据真相源、规则计算、证据追溯和报告生成边界。 |
| 模块 | 页面模块、API 模块、规则模块、seed 模块、报告模块、演示脚本模块。 |
| 支线 | 哪些增强可以做，但不改变首版主线。 |
| 不做项 | 哪些能力不进入两周 PoC，避免变成 MVP 或系统集成项目。 |
| 验收 | 技术侧最小完成标准。 |

本文不维护：

| 范畴 | 应查看 |
| --- | --- |
| 对外演示口径、业务方确认项、会议话术 | [巡检质量智能分析助手-demo-AI赋能演示定稿方案.md](巡检质量智能分析助手-demo-AI赋能演示定稿方案.md) |
| 通用 AI demo 技术选型方法 | [通用 AI 赋能演示 demo 技术实现选型方案.md](<../common/通用 AI 赋能演示 demo 技术实现选型方案.md>) |
| 历史业务蓝图 | [archive/巡检质量智能分析助手-demo-业务架构与实施蓝图.md](../archive/巡检质量智能分析助手-demo-业务架构与实施蓝图.md) |
| 历史立项沟通稿 | [archive/巡检质量智能分析助手-demo-立项沟通方案.md](../archive/巡检质量智能分析助手-demo-立项沟通方案.md) |

## 2. 业务主线到技术模块

`v1` 已经确定首版业务骨架：

```text
巡检任务
  -> 巡检表单
  -> AI 发现疑点
  -> 知识库给出依据
  -> Agent 辅助复检
  -> 人工确认
  -> Agent 生成报告
  -> 归档复用
```

技术实现按这条主线拆成 8 个模块：

| 业务节点 | 技术模块 | 主要职责 |
| --- | --- | --- |
| 巡检任务 | 任务与演示脚本模块 | 加载固定任务、控制演示步骤、展示计划/实际时间。 |
| 巡检表单 | 表单与检查项模块 | 展示区域、检查项、标准、填写结果、照片和标红状态。 |
| AI 发现疑点 | 规则计算模块 | 计算到位疑点、表单疑点、时序疑点和视觉联动疑点。 |
| 知识库给出依据 | 知识库模块 | 根据疑点命中标准、阈值、复检步骤和历史案例。 |
| Agent 辅助复检 | 复检清单模块 | 生成复检点位、复检原因、补拍建议和依据说明。 |
| 人工确认 | 演示状态模块 | 记录 demo 内人工确认状态，不写回真实系统。 |
| Agent 生成报告 | 报告模块 | 生成巡检摘要、异常摘要、交接班关注项和案例摘要。 |
| 归档复用 | 报告快照与案例模块 | 固化报告快照、案例标签、数据版本和规则版本。 |

## 3. 固定技术栈

| 层 | 固定技术 | 用法 |
| --- | --- | --- |
| 前端框架 | `React + Vite + TypeScript` | 构建单页 Web demo，面向桌面投屏和可点击演示。 |
| 路由 | `React Router` | 管理 4 个演示页面和详情页参数。 |
| UI 组件 | `Ant Design 5` | 表格、表单、步骤条、抽屉、标签、状态、按钮和布局。 |
| 图表 | `Apache ECharts` | 展示差压/压力趋势、阈值线、异常窗口和状态分布。 |
| HTTP 客户端 | `Axios` | 封装统一 API client、错误处理和基础请求配置。 |
| 服务端状态 | `TanStack Query` | 管理 API 查询、刷新、缓存失效和加载状态。 |
| 本地 UI 状态 | `Zustand` | 管理当前演示任务、演示步骤、选中疑点、复检确认状态。 |
| 后端框架 | `FastAPI` | 提供 API、OpenAPI 合同、规则计算入口和报告生成入口。 |
| 数据模型 | `Pydantic` | 定义请求、响应、seed 导入和报告快照模型。 |
| 数据库 | `PostgreSQL` | 作为运行期真相源，保存任务、表单、规则、疑点、报告快照，并复用 `fastapi-lite` 的 Alembic / SQLAlchemy async / UnitOfWork / repository 机制。 |
| 种子数据 | 本地 `JSON` | 保存可维护样例数据，导入 PostgreSQL 后运行。 |
| 报告模板 | `Jinja2` | 生成 HTML / Markdown 报告片段和报告快照。 |
| 文件资源 | 本地 `assets` 目录 | 保存演示图片、识别框数据、附件和报告资源。 |
| API 合同 | FastAPI OpenAPI | 作为前后端接口单一真相源。 |
| 部署 | `Docker Compose` | 演示交付和验收主线；本地启动仅用于开发调试。 |

## 4. 可枚举支线

可枚举支线是增强项，不改变首版主架构。

| 领域 | 主线 | 可枚举支线 |
| --- | --- | --- |
| 数据导入 | JSON seed 导入 PostgreSQL | 增加 CSV 导入脚本，用于导入时序曲线或表单样例。 |
| 报告输出 | 页面展示 HTML / Markdown 报告 | 后续导出 PDF / Excel。 |
| AI 文案 | Jinja2 模板生成 | 接 1 个已批准的大模型 API 做摘要润色。 |
| 视觉能力 | 预置识别结果 | 接已有视觉推理接口作为 C 档增强。 |
| 时序能力 | 阈值、窗口、斜率等轻量规则 | 后续增加传统异常检测算法。 |
| 部署 | Docker Compose 单机 | 迁移到业务方内网 VM。 |
| API 类型 | 手写 TypeScript DTO + OpenAPI 对照 | 接口超过 10-15 个后引入 `openapi-typescript`。 |

不可把支线写成首版默认承诺。支线进入开发前必须单独确认数据、接口、部署和验收边界。

## 5. 不做项

首版不做这些能力：

| 不做项 | 原因 |
| --- | --- |
| 不接真实 `PI / IMS / 视频 / WeAct` | 会把两周 PoC 扩成系统集成项目。 |
| 不训练 YOLO、OCR 或多模态视觉模型 | 需要样本、标注、评测和算力。 |
| 不训练 LSTM / Transformer 等深度时序模型 | 需要长期历史数据、故障标签和评测集。 |
| 不本地部署大模型或多模态模型 | 需要 GPU、运维和合规投入。 |
| 不做开放式 Agent | 验收不可控，容易偏离巡检、复检、报告主线。 |
| 不做登录、权限、用户管理 | 首版是演示 PoC，不进入生产访问控制。 |
| 不做真实派单、审批、销项和绩效写回 | 涉及权限、审计、安全生产和责任边界。 |
| 不做微服务、消息队列、Kubernetes | 运维复杂度超过两周 demo 需要。 |
| 不做 WebSocket / SSE 实时推送 | 固定脚本 PoC 用查询刷新和缓存失效即可。 |
| 不做 Redis / Celery / Kafka | 首版没有异步任务和分布式可靠性需求。 |
| 不做 GraphQL / tRPC | FastAPI OpenAPI 已是唯一 API 合同源。 |

## 6. 架构分层

```text
Frontend
  React Router
  Ant Design 页面
  Apache ECharts 图表
  TanStack Query server state
  Zustand demo state

Backend API
  FastAPI routers
  Pydantic DTO
  OpenAPI contract
  fastapi-lite app factory / lifespan / exception envelope

Application Services
  demo script service
  finding service
  knowledge service
  recheck service
  report service

Domain Logic
  arrival rules
  form quality rules
  time-series rules
  vision linkage rules
  report assembly rules

Persistence
  PostgreSQL
  Alembic migrations
  SQLAlchemy async repositories
  seed import
  report snapshots
  evidence records

Assets
  inspection photos
  visual annotation JSON
  generated report assets
```

前端只负责交互、展示和演示步骤控制；后端负责查询、规则计算、报告生成和证据追溯。业务关键派生结果不在前端重复计算。

## 7. 前端实施方案

### 7.1 页面

首版固定 4 个页面：

| 路由 | 页面 | 主要内容 |
| --- | --- | --- |
| `/` | 巡检任务与到位看板 | 任务、计划/实际时间、人员、到位疑点、演示步骤入口。 |
| `/inspection/:taskId` | 巡检表单 + AI 提醒 | 表单项、时序异常、视觉识别加演、表单标红。 |
| `/recheck/:taskId` | 异常/疑点复检台 | 复检原因、知识库依据、补拍建议、人工确认。 |
| `/reports/:taskId` | 报告归档与案例复用 | 巡检摘要、交接班关注项、案例摘要、报告快照。 |

### 7.2 UI 组件

Ant Design 作为唯一组件主线：

| 场景 | 组件 |
| --- | --- |
| 页面框架 | `Layout`、`Menu`、`Breadcrumb`。 |
| 数据表格 | `Table`、`Descriptions`。 |
| 表单和确认 | `Form`、`Radio`、`Checkbox`、`Input`、`Modal`。 |
| 状态表达 | `Tag`、`Badge`、`Alert`、`Steps`、`Timeline`。 |
| 详情展开 | `Drawer`、`Collapse`、`Tabs`。 |
| 操作按钮 | `Button`、`Dropdown`、`Tooltip`。 |

只允许少量项目级 CSS 变量和布局样式，不再引入第二套 UI 框架。

### 7.3 图表

Apache ECharts 作为唯一图表主线：

| 图表 | 用途 |
| --- | --- |
| 折线图 | 展示过滤器差压、压力或液位趋势。 |
| 阈值线 | 展示标准上限、预警线和异常窗口。 |
| 标注区域 | 标出趋势偏移或异常时间段。 |
| 小型统计图 | 展示疑点数量、复检状态和报告概览。 |

图表数据来自后端 API，不在前端临时拼接业务结论。

### 7.4 请求和状态边界

| 状态类型 | 工具 | 内容 |
| --- | --- | --- |
| 服务端状态 | `TanStack Query` | 任务、表单、疑点、知识命中、复检清单、报告快照。 |
| 演示 UI 状态 | `Zustand` | 当前任务 ID、当前演示步骤、选中疑点 ID、视觉加演开关、报告预览面板状态。 |
| 可回放脚本状态 | `React Router search params` | 可分享或可回放的 `scenario`、`step`、`taskId`。 |
| 表单临时输入 | React local state / Ant Design Form | 人工确认备注、报告预览切换。 |

Axios 是唯一 HTTP client，所有请求通过统一 API client 进入 FastAPI。TanStack Query 是服务端状态唯一入口。Zustand 不存后端真相数据，只存演示过程状态。

状态边界：

1. 禁止把 TanStack Query 返回的任务、疑点、报告数据复制进 Zustand。
2. 人工确认、生成报告快照、重置演示场景都以后端写入结果为准。
3. 写操作成功后通过 TanStack Query invalidation 重新读取服务端状态。
4. 首版不做乐观更新，避免演示状态和 PostgreSQL 结果漂移。
5. 演示脚本状态不写进业务表，只用于控制页面路径和高亮。

## 8. 后端实施方案

### 8.1 API 模块

FastAPI 按业务模块拆路由：

| 路由前缀 | 职责 |
| --- | --- |
| `/api/demo` | 演示脚本、当前任务、步骤配置。 |
| `/api/tasks` | 巡检任务、到位疑点、任务状态。 |
| `/api/inspection` | 巡检表单、检查项、图片和视觉结果。 |
| `/api/findings` | AI 疑点、规则命中、证据链。 |
| `/api/knowledge` | 标准、阈值、复检步骤、历史案例。 |
| `/api/recheck` | 复检清单、人工确认、补拍建议。 |
| `/api/reports` | 报告生成、报告快照、案例摘要。 |
| `/api/assets` | 本地演示资源的受控访问。 |

### 8.2 服务模块

| 服务 | 职责 |
| --- | --- |
| `SeedService` | 将 JSON seed 导入 PostgreSQL，校验样例完整性。 |
| `DemoScriptService` | 提供固定演示步骤和默认任务。 |
| `RuleEngine` | 执行到位、表单、时序、视觉联动规则。 |
| `FindingService` | 聚合疑点、等级、原因和证据。 |
| `KnowledgeService` | 查询标准、阈值、复检步骤和历史案例。 |
| `RecheckService` | 生成复检清单并保存人工确认状态。 |
| `ReportService` | 使用 Jinja2 生成报告快照。 |
| `EvidenceService` | 统一管理来源记录、规则、图片和字段路径。 |

### 8.3 API 合同

FastAPI OpenAPI 是接口合同源。

首版执行方式：

1. 后端用 Pydantic 定义请求和响应模型。
2. FastAPI 生成 OpenAPI，保存一份合同快照。
3. 前端 TypeScript DTO 以 OpenAPI 字段为准。
4. 技术验收时检查关键 API 返回结构和 OpenAPI 快照。
5. 当接口数量超过 10-15 个或多人并行开发时，再引入 `openapi-typescript` 生成类型。

不引入 GraphQL、tRPC 或额外 BFF。FastAPI 本身就是本 demo 的 API 接缝。

## 9. 数据与持久化

### 9.1 真相源

```text
JSON seed
  -> seed import
  -> PostgreSQL
  -> FastAPI
  -> React UI / Report
```

PostgreSQL 是运行期真相源。页面、报告、Agent 输出都从 FastAPI 读取 PostgreSQL 结果，不直接读取 JSON。

### 9.2 PostgreSQL 数据对象

| 对象 | 关键字段 |
| --- | --- |
| `InspectionTask` | 任务 ID、站场、区域、计划时间、实际时间、人员、状态。 |
| `InspectionItem` | 表单项 ID、设备、检查内容、标准、填写结果、说明、照片。 |
| `TimeSeriesPoint` | 设备、参数名、时间、数值、单位、来源。 |
| `VisionResult` | 图片、设备、检查项、识别值、标签、置信度、采集时间。 |
| `Rule` | 规则类型、触发条件、等级、展示文案、版本。 |
| `Evidence` | 证据类型、来源对象、字段路径、图片路径、命中规则、展示文案。 |
| `Finding` | 疑点类型、等级、原因、关联任务、关联证据。 |
| `KnowledgeEntry` | 类型、标题、适用设备、阈值、复检步骤、来源。 |
| `RecheckAction` | 复检点位、原因、补拍建议、人工确认状态。 |
| `ReportSnapshot` | 报告类型、生成时间、摘要、数据版本、规则版本。 |

### 9.3 Seed 数据

JSON seed 至少包含：

```text
inspection_tasks.json
inspection_items.json
time_series_points.json
vision_results.json
rules.json
knowledge_entries.json
demo_script.json
```

seed 目录按场景组织：

```text
data/seeds/scenario-a/*.json
data/seeds/scenario-b/*.json
```

导入规则：

1. seed 缺少必须字段时直接报错。
2. seed 中引用不存在的任务、设备、图片或规则时直接报错。
3. 不自动补默认任务、默认规则或默认报告。
4. 每次导入记录 `scenario_id`、`data_version` 和 `seed_import_time`。
5. reset 演示环境时从 seed 重新导入 PostgreSQL。

## 10. 规则计算

规则计算在后端完成，输出 `Finding` 和 `Evidence`。

| 规则组 | 输入 | 输出 |
| --- | --- | --- |
| 到位规则 | 计划时间、实际时间、巡检时长 | 迟到、时长异常、到位疑点。 |
| 表单规则 | 检查项、填写结果、说明、照片 | 漏填、异常未说明、数据异常但填正常。 |
| 时序规则 | 时序点、阈值、窗口、斜率 | 趋势异常、接近阈值、异常窗口。 |
| 视觉联动规则 | 视觉识别结果、表单填写值 | 识别结果与表单矛盾、触发复检。 |
| 知识命中规则 | 疑点类型、设备、检查项 | 标准条款、阈值依据、复检步骤。 |

规则必须可追溯：

```text
Finding
  -> Rule
  -> Evidence
  -> Source Record / Image / Time Window / Knowledge Entry
```

缺失数据显式报错或显式提示，不做静默兜底。

## 11. 报告生成

报告由后端生成快照，前端展示。

| 报告 | 内容 |
| --- | --- |
| 巡检摘要 | 本次任务、到位情况、表单疑点、AI 提示。 |
| 复检清单 | 复检点位、复检原因、依据、补拍证据。 |
| 交接班关注项 | 未闭环疑点、重点关注设备、建议动作。 |
| 案例摘要 | 疑点、复检结论、知识依据、后续复用标签。 |

Jinja2 模板输入来自 PostgreSQL，不直接拼前端状态。报告快照保存：

- 报告类型。
- 生成时间。
- 数据版本。
- 规则版本。
- 知识库版本。
- 模板版本。
- 关联任务。
- 关联疑点。
- 关联证据。
- 如果使用模型润色，记录 `prompt_version` 和 `model_run_id`。

报告不能只在前端现查现拼。报告生成后必须保存 `ReportSnapshot`，同一个报告快照再次打开时应展示当时的结论、证据和版本。

首版不强制 PDF / Excel。页面报告是主线，PDF / Excel 是可枚举支线。

## 12. 演示脚本

演示脚本是首版稳定性的关键模块。

`demo_script.json` 固定：

| 字段 | 说明 |
| --- | --- |
| `default_task_id` | 默认打开的巡检任务。 |
| `steps` | 演示步骤列表。 |
| `highlight_finding_ids` | 默认强调的疑点。 |
| `visual_addon_enabled` | 是否展示视觉加演。 |
| `report_template_id` | 默认报告模板。 |

前端使用 Zustand 记录当前演示步骤，后端提供脚本配置。脚本控制演示路径，但不伪造后端结论；后端结论仍来自规则计算和 PostgreSQL。

## 13. 部署

### 13.1 本地开发

```text
frontend dev server
backend dev server
PostgreSQL
local assets
```

本地开发必须固定：

- 启动命令。
- 后端端口。
- 前端代理配置。
- PostgreSQL 连接地址。
- seed 导入命令。
- assets 路径。

### 13.2 演示交付

Docker Compose 是演示交付主线：

```text
docker compose
  frontend
  backend
  postgres
  readonly seeds volume
  readonly assets volume
  postgres data volume
  writable reports/runtime volume
```

不引入 MinIO、Redis、队列、Kubernetes。PostgreSQL、本地 JSON seed 和本地 assets 足够支撑两周 PoC。

## 14. 目录结构建议

```text
apps/
  web/
    src/
      app/
        router/
        query/
      pages/
      components/
      api/
      stores/
      charts/
      types/
  api/
    app/
      main.py
      routers/
      schemas/
      services/
      rules/
      reports/
      persistence/
      seed/
contracts/
  openapi.json
data/
  seeds/
    scenario-a/
  runtime/
    reports/
assets/
  images/
templates/
  reports/
ops/
  docker-compose.yml
docs/
  demo/
```

如果仓库后续已有既定前后端目录，应优先沿用；但模块职责保持不变。

## 15. 验收标准

技术验收必须跑通固定演示脚本。

| 验收项 | 标准 |
| --- | --- |
| 数据导入 | JSON seed 可导入 PostgreSQL；缺失必需字段时失败并提示。 |
| 任务看板 | 前端能展示默认巡检任务、计划/实际时间和到位疑点。 |
| 表单页面 | 前端能展示检查项、填写结果、图片和标红状态。 |
| 时序图表 | Apache ECharts 能展示趋势、阈值线和异常窗口。 |
| 视觉加演 | 能展示预置图片、识别结果、置信度和表单联动。 |
| 规则计算 | 后端能生成到位、表单、时序、视觉联动疑点。 |
| 知识命中 | 疑点能命中标准、阈值或复检步骤。 |
| 复检清单 | 后端能生成复检点位、原因、依据和补拍建议。 |
| 人工确认 | 前端能提交 demo 内确认状态，刷新后仍可读取。 |
| 报告生成 | 后端能生成报告快照，前端能展示报告。 |
| 证据追溯 | 每条关键结论能回到来源记录、规则或图片。 |
| 启动运行 | Docker Compose 可在目标演示环境完整跑通；本地启动只作为开发调试验证。 |

只看页面截图不算完成；只读 JSON 不经后端规则计算也不算完成。

## 16. 实施前必须冻结

| 冻结项 | 内容 |
| --- | --- |
| 演示主线 | 默认任务、默认区域、默认时序项、默认视觉项。 |
| seed 数据 | 巡检任务、表单、时序、视觉结果、规则、知识条目。 |
| 规则口径 | 迟到、漏填、异常未说明、阈值异常、视觉联动。 |
| 报告模板 | 巡检摘要、复检清单、交接班关注项、案例摘要。 |
| 演示脚本 | 页面路径、点击顺序、默认疑点、报告生成动作。 |
| 部署环境 | 目标演示机器、端口、Compose 卷路径和 assets 路径。 |

冻结后新增接口、新增页面、新增规则、新增报告模板、新增模型调用或新增真实系统接入，都按变更处理。

## 17. 当前定版组合

```text
项目类型：可交互模拟 PoC
前端：React + Vite + TypeScript
UI：Ant Design 5
图表：Apache ECharts
HTTP：Axios
请求状态：TanStack Query
演示状态：Zustand
路由：React Router
后端：FastAPI
模型：Pydantic
数据库：PostgreSQL
种子数据：本地 JSON
报告：Jinja2 HTML / Markdown 快照
资源：本地 assets
合同：FastAPI OpenAPI
部署：Docker Compose 演示交付；本地启动仅用于开发调试
```

这个组合的边界是：

```text
看得见：页面、表单、图片、曲线、报告、归档状态
跑得动：规则、时序判断、复检清单、报告生成
讲得清：每条结论有来源、有规则、有证据
控得住：不被真实接口、模型训练、本地部署拖垮
接得上：后续按适配器进入半真实集成或试点 MVP
```
