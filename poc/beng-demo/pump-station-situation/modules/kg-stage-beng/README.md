# 湖南公司输油泵机组运维知识图谱 · 静态展台模板

这是 `beng-demo/pump-station-situation` 内嵌使用的 BENG 知识图谱本地副本。页面仍然是纯静态大屏：无构建、无框架、无 CDN、无网络请求，双击 `index.html` 即可运行。

本模板已按 `.data/11_1.xlsx` 的资料目录完成数据替换。Excel 不是运行时数据源，只作为离线抽取来源；页面实际读取的是 `scripts/data/kg-data.js` 中展开后的静态 `KG.data`。

## 运行方式

```bash
open poc/beng-demo/pump-station-situation/modules/kg-stage-beng/index.html
```

集成态由泵站态势页通过本地 iframe 加载：

```bash
open poc/beng-demo/pump-station-situation/index.html
```

13/14 寸笔记本演示时，泵站态势页会以 `index.html?stable=1#/stage` 加载本模块，减少展台动效抖动；单独调试视觉时也可以直接打开这个 hash。

## 当前主题

页面标题：`湖南公司输油泵机组运维知识图谱`

内容范围围绕湖南公司长郴管道站场的输油泵、给油泵、主输泵等泵机组运维知识，覆盖：

| 结构 | 数量 | 展示语义 |
|---|---:|---|
| 运维主题 | 10 | 安装验收、启停切换、盘车润滑、机械密封、周期维护、大修评估、能量隔离、完整性、故障诊断等 |
| 知识分类 | 7 | 标准制度、安装验收、操作规程、维检修作业、安全隔离、完整性与泄漏、故障库 |
| 应用场景 | 3 | 长郴管道、泵机组设备、站场运维班组 |
| 资料条目 | 270 | 每个运维主题下 3 个作业方向、3 个作业能力、3 个资料条目；部分为演示核查表和复盘卡 |

当前数据规模由 `KG.index.stats` 计算，以页面自检为准。`stats.docs` 表示节点说明卡数量，不等同于 Excel 原始资料数量。

## 数据来源

`.data/11_1.xlsx` 是横向资料目录，不是普通逐行记录表。已提取的真实标题共 39 条：

| Excel 分组 | 数量 |
|---|---:|
| 国家标准 | 13 |
| 行业标准 | 2 |
| 集团公司企业标准 | 2 |
| 集团公司制度文件 | 5 |
| 湖南公司指引文件 | 4 |
| 湖南公司作业指导书 | 1 |
| 湖南公司操作维护规程 | 3 |
| 一票一卡 / 维检修作业卡 | 5 |
| 一票一卡 / 操作票 | 4 |
| 故障库 | 0 |

因为 Excel 中“故障库”列为空，`scripts/data/kg-data.js` 额外构造了 8 条演示故障案例，用于补齐故障诊断、原因定位、应急恢复与复盘类展示。

正式上线前需要业务人员补充原文条款、适用范围、审批责任、版本有效性和真实案例闭环记录。当前模板中的“执行核查表（演示）”“风险复盘卡（演示）”属于为展台结构补齐的假数据。

## 路由

| hash | 说明 |
|---|---|
| `#/stage` | 展台首页 |
| `#/graph?view=task` | 十项运维主题图谱 |
| `#/graph?view=domain` | 七类知识分类图谱 |
| `#/graph?view=business` | 三类应用场景图谱 |
| `#/docs?task=<taskId>&node=<nodeId>` | 树形资料页 |

左侧三个六边形入口分别是：资料搜索、图谱搜索、图谱介绍。

## 文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 三页静态骨架、顶栏文案、入口文案、CSS/JS 加载顺序 |
| `scripts/data/kg-data.js` | 唯一数据真值源；由 Excel 标题和演示假数据展开为 `nodes/edges/docs/meta` |
| `scripts/data/kg-index.js` | 派生索引、自检、搜索、树查询 |
| `scripts/stage/*` | 首页 3D 展台物件、领域球、应用场景牌、运维主题立牌 |
| `scripts/graph/*` | ECharts 图谱布局、视角切换、搜索、聚焦、下钻 |
| `scripts/docs/*` | 运维主题列表、树形资料、文档卡、回跳全图 |

## 关键约束

1. 不在浏览器运行时读取 Excel、JSON 或网络接口。
2. 不使用 `type="module"`、`import`、`fetch`、XHR 或动态导入，保证 `file://` 可直接运行。
3. 新数据必须先写入 `scripts/data/kg-data.js`，再由 `KG.index.validate()` 自检。
4. 展台固定展示 10 个运维主题、7 个知识分类、3 个应用场景；如果改变数量，需要同步检查 stage 布局。
5. 模板数据中正文、故障现象、处置建议属于演示假数据，不能当真实制度条款使用。

## 验证

最小语法检查：

```bash
node --check demo/cc/kg_stage_beng/scripts/data/kg-data.js
node --check demo/cc/kg_stage_beng/scripts/data/kg-index.js
```

页面级验证优先使用 Playwright。默认会生成截图并执行交互断言；如只想跳过帧率采样，可使用：

```bash
uv run python demo/cc/kg_stage_beng/tools/screenshot.py --skip-fps
```

也可以在浏览器地址后加 `?debug`，例如：

```text
index.html?debug#/stage
```

控制台会打印 `KG.index.validate()` 与 `KG.index.stats`。
