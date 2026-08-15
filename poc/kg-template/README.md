# 知识图谱模板（kg-template）

单页三视图的知识图谱大屏。**双击 `index.html` 就能跑**——无构建、无框架、无 CDN、无网络请求。

接入自己的业务数据时，**只需要改 `data/kg-data.js` 一个文件**，三个视图会自动跟着变。

---

## 1. 三个视图在回答三个不同的问题

它们不是三张图，是同一份数据的三种问法。

| 视图 | 路由 | 回答的问题 | 独有的东西 |
|---|---|---|---|
| **3D 展台** | `#/stage` | 有哪些知识库、各有多少、哪个最近在更新 | 入口与总览 |
| **关系图谱** | `#/graph` | 这些知识之间是怎么连起来的 | **实体标签层**——树里没有的横向关联 |
| **主题树** | `#/tree` | 某份文档在哪、它是怎么归进来的 | 层级下钻与路径溯源 |

### 动线

```
展台点类目立牌 ──→ 主题树（这个知识库里有什么）
展台点中心核心 ──→ 关系图谱（全局关联长什么样）
图谱详情面板「在主题树中查看」 ──→ 主题树
树的文档卡「在关系图谱中查看」 ──→ 关系图谱
顶栏三个按钮 ──→ 任意切换，且带着当前焦点一起走
左侧 rail 全局检索 ──→ 按结果类型自动落到最合适的视图
```

动线策略集中在 `app.js` 的 `ROUTE` 对象里。想改跳转规则，改那一处就够，不用去三个视图里翻代码。

### 跨视图焦点会降级，而不是丢失

同一个节点不一定在三个视图里都有对应物。`KG.derive.resolveView(id, view)` 负责给出最接近的落点，外加一句给用户的解释（由 shell 弹提示条显示）：

- 实体标签「金融行业」切到主题树 → 树里没有实体这一层 → 落到关联文档最多的类目，并高亮相关文档
- 非代表文档「错误码对照表」切到关系图谱 → 图谱只收代表文档 → 聚焦其所属类目并说明原因
- 中间目录「接口与集成」切到关系图谱 → 同上

---

## 2. 接入自己的业务数据

改 `data/kg-data.js` 里的 `KG.source`，其余一律不用动。

### 2.1 最小骨架

```js
KG.source = {
  meta:  { title, hub:{ id,name,en,sub,desc }, metrics:[…] },
  types: { hub, category, topic, subtopic, doc, item, entity },  // 层级配色，一般不用改
  treeLevels: ['category','topic','subtopic','doc','item'],       // 深度→类型，超出时循环取值
  relTypes:   { contains, tagged, cites, derives, refers },       // 关系语义
  categories: [ … ],   // 知识库类目 + 完整层级树
  entities:   [ … ],   // 实体标签（图谱独有的横向维度）
  relations:  [ … ]    // 横向关系
};
```

### 2.2 一个类目长这样

```js
{
  id: 'c_doc', name: '产品文档', en: 'PRODUCT DOCS', code: 'KB-DOC',
  color: '#4C7DFF', icon: 'doc', note: '今日更新',
  docTotal: 1248,                                   // 业务库存量，可缺省
  desc: '…',
  featured: ['d_api_auth', 'd_deploy_pre'],         // 进关系图谱的代表文档
  children: [                                        // 想套几层就套几层
    { name: '接口与集成', children: [
      { name: 'REST 接口规范', children: [
        { id: 'd_api_auth', name: '资源与鉴权约定' },  // 需要被引用的才写 id
        { name: '错误码对照表' }                       // 其余 id 自动生成
      ]}
    ]}
  ]
}
```

**id 规则**：只有需要被 `featured` 或 `relations` 引用的节点才手写 `id`；其余由派生层按 `<父id>__<序号>` 自动生成，稳定且可复现（刷新后仍然有效）。

**icon 可选值**：`doc` `chart` `people` `shield` `stack` `chat` `node` `cal`。要加新图标，在 `views/stage/stage.js` 的 `ICONS` 里补一个 canvas 绘制函数。

### 2.3 关于"文档量"的两个口径

这是最容易踩的坑，模板里已经拆开：

| 字段 | 含义 | 谁在用 |
|---|---|---|
| `docTotal` | 业务侧知识库的**真实库存量** | 展台立牌上的大数字、图谱节点的文档量 |
| 样本数（派生） | `children` 里实际建模的**叶子数** | 主题树左栏的计数 |

两者语义不同，不是同一个数字的两个版本。**缺省 `docTotal` 时，派生层令它等于样本数**——如果你接入的是完整业务数据（树里就是全部文档），什么都不用配，两者天然合一。

### 2.4 关系怎么写

```js
relations: [
  ['c_reg', 'e_mask', 'tagged'],           // 类目涉及某个实体标签
  ['d_case_bank', 'e_fin', 'cites'],       // 文档引用某个实体标签
  ['d_rag', 'd_vec_sel', 'derives']        // 文档之间的衍生/参考
]
```

树的父子关系（`contains`）由 `children` 自动派生，**不要手写在 relations 里**。

### 2.5 改完之后

打开 `index.html?debug`，控制台会打印数据体检结果与规模统计。体检不通过时页面会直接抛错停下——这是故意的：模板宁可开不起来，也不要"打开了但少了半棵树"。

体检覆盖：id 重复、悬空关系、未注册的类型、`featured` 指向不存在或非叶子的节点、类目缺 color/icon、`docTotal` 小于样本数、孤立的实体标签。

---

## 3. 目录结构

```
kg-template/
├── index.html              装配入口，脚本顺序即依赖顺序
├── app.js                  启动 + 动线策略（跳转规则改这里）
├── data/
│   ├── kg-data.js          ★ 唯一数据真值源，接业务数据只改这个
│   └── kg-derive.js        派生投影层：展平、投影、检索、降级、体检
├── core/
│   ├── dom.js              极小 DOM 工具 + 共用的伪 3D 配色函数
│   ├── bus.js              事件总线 + 跨视图上下文栈
│   ├── views.js            ★ 视图生命周期契约（写新视图前先读它）
│   ├── router.js           hash 路由
│   └── transition.js/css   跨视图幻影飞行转场
├── shell/                  顶栏 + 六边形 rail + 全局检索 + 说明浮层
├── views/
│   ├── stage/              3D 展台（three.js）
│   ├── graph/              关系图谱（Canvas 力导向）
│   └── tree/               主题树（DOM + SVG）
├── styles/tokens.css       全局设计变量
└── vendor/three.min.js     three.js r128（本地，无 CDN）
```

每个视图目录下的 `_origin.html` 是改造前的原始设计稿，**只读参考，不参与运行**。

---

## 4. 加第四个视图

1. 读 `core/views.js` 顶部的契约，实现 `mount/activate/deactivate/focus/locate/reset/pause/resume` 八个方法
2. 在 `index.html` 里加一个 `<section class="view" id="view-xxx">` 和对应的 script/css
3. 在 `app.js` 的 `ROUTE` 里加一条动线规则
4. 在 `data/kg-derive.js` 里加一个投影函数（如果新视图需要不同形状的数据）

**不要**让新视图直接读 `KG.source`，也**不要**让它直接调用别的视图——只走 `KG.derive.*` 拿数据、走 `KG.bus` 发事件。这两条是模板能换数据的前提。

---

## 5. 已知约束

- three.js 锁定 **r128**。r152+ 默认开启色彩管理、r155+ 改了灯光强度换算，直接升版会让展台整体发灰、辉光过曝。要升版就得重新调一遍展台的配色与灯光。
- 三个视图同时活在内存里，靠 `pause()/resume()` 保证只有当前视图在画帧。写新视图时务必让 `pause()` 真的停住渲染循环。
- 力导向的电荷力是 O(n²)。当前 45 个图谱节点毫无压力；如果你的 `featured` 加到几百个，需要换 Barnes-Hut 四叉树。
