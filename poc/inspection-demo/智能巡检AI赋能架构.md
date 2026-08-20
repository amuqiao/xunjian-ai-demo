# 智能巡检 AI 赋能架构

**同一件巡检，换一套做法。** 以前靠人走、眼看、手抄、填表汇报；现在数据自己上来，模型先判一遍，Agent 配上规程依据给出结论，人只做确认，结果回写既有系统并沉淀成下次可复用的案例。

AI 在这套逻辑里的定位是**提建议**，人始终是**定终态**的那一环——这是它能在生产上跑、而不是只能演示的前提。

---

## 图 1 · 变的是什么

```mermaid
flowchart LR
  subgraph OLD["以前 · 人工巡检"]
    O1["人走到点位"] --> O2["眼看 · 手抄"] --> O3["填表汇报"] --> O4["纸面归档<br/>数据不可再用"]
  end
  subgraph NEW["现在 · AI 赋能巡检"]
    N1["仪器 / 传感器 / 视觉<br/>数据自动上来"] --> N2["时序模型 + 视觉模型<br/>先判一遍"] --> N3["知识库 + Agent<br/>给出带依据的结论"] --> N4["人工确认 → 系统闭环<br/>案例可复用"]
  end
  OLD ==>|"同一件事，换一套做法"| NEW
  classDef old fill:#f1f2f4,stroke:#9aa3af,color:#374151
  classDef new fill:#e3f2ee,stroke:#3fa08c,color:#14503f
  class O1,O2,O3,O4 old
  class N1,N2,N3,N4 new
```

| | 以前 | 现在 |
|---|---|---|
| 数据怎么来 | 人填表 | 仪器 / 传感器 / 视觉自动采集 |
| 谁先发现问题 | 靠个人经验 | 时序模型 + 视觉模型 |
| 结论有没有依据 | 口头经验 | 知识库引用规程与历史案例 |
| 结果去哪了 | 纸面归档 | 回写 IMS，沉淀进知识库 |

---

## 图 2 · 业务主链路：数据从哪来，谁来判，谁说了算

```mermaid
flowchart LR
  I1["手持仪器<br/>机械 / 仪表 / 电气 / 通讯 / 计量"] --> TS
  I2["在线传感器<br/>压力 · 温度 · 振动 · 流量"] --> TS["时序大模型<br/>趋势 · 异常 · 阈值"]
  I3["视频球机 / 巡检仪<br/>关键帧"] --> VS["视觉大模型<br/>缺陷 · 泄漏 · 表盘读数"]
  I4["GIS · 电子围栏<br/>到位率 · 轨迹"] --> AG
  TS --> AG
  VS --> AG
  KB["知识库<br/>规程 · 标准 · 历史案例"] --> AG
  AG["巡检 Agent<br/>结论 + 证据链 + 置信度"] --> RV["专业人员复核<br/>采纳 / 修正 / 驳回"]
  RV --> WA["WeAct 派单<br/>任务 · 审批 · 通知"]
  WA --> FX["现场整改 · 复测销项"]
  FX --> IM["IMS 资产管理平台<br/>缺陷 · 履历 · 资产状态"]
  IM --> KB
  classDef src fill:#e8effb,stroke:#5b7fc4,color:#1c2e52
  classDef ai fill:#ede7fa,stroke:#8266c8,color:#301f5c
  classDef human fill:#fdf1e0,stroke:#c9903c,color:#5b3d0c
  classDef biz fill:#e3f2ee,stroke:#3fa08c,color:#14503f
  class I1,I2,I3,I4 src
  class TS,VS,AG,KB ai
  class RV human
  class WA,FX,IM biz
```

**三句话讲完这张图**

1. **左边：数据入口不再是人填表。** 五个专业的手持仪器、在线测点、视频关键帧、GIS 与电子围栏，都是自动上来的数据。
2. **中间：三个模型加一个 Agent。** 时序模型看趋势、视觉模型看画面、知识库给规程依据，Agent 把它们合成一条带证据链和置信度的结论。
3. **右边：闭环不另建系统。** 复核结论走 WeAct 派单审批，整改销项后回写 IMS 的缺陷与履历，处置结果回流知识库，下次相似问题直接命中。

---

## 图 3 · 系统接入：AI 平台怎么挂到既有系统上

```mermaid
flowchart LR
  subgraph TERM["终端与巡检设备"]
    T1["手持终端<br/>五专业检测仪器"]
    T2["巡检设备 · 摄像头"]
    T3["电子围栏 · 定位"]
  end
  subgraph SYS["接入既有系统 · 不重建"]
    S1["IMS 资产管理平台<br/>设备主数据 · 资产状态"]
    S2["SCADA / DCS<br/>实时时序"]
    S3["视频平台"]
    S4["GIS 平台"]
    S5["WeAct 协同平台<br/>类钉钉"]
  end
  HUB["智能巡检 AI 平台<br/>时序模型 · 视觉模型 · 知识库 RAG · Agent 编排"]
  subgraph APP["对外应用"]
    P1["监控大屏"]
    P2["诊断复核工作台"]
    P3["巡检任务与工单"]
    P4["知识库与报告"]
  end
  T1 --> HUB
  T2 --> HUB
  T3 --> HUB
  S1 --> HUB
  S2 --> HUB
  S3 --> HUB
  S4 --> HUB
  S5 --> HUB
  HUB --> P1
  HUB --> P2
  HUB --> P3
  HUB --> P4
  classDef term fill:#e8effb,stroke:#5b7fc4,color:#1c2e52
  classDef sys fill:#eef0f3,stroke:#8d95a3,color:#33404f
  classDef hub fill:#ede7fa,stroke:#7c5cd0,color:#301f5c
  classDef app fill:#e3f2ee,stroke:#3fa08c,color:#14503f
  class T1,T2,T3 term
  class S1,S2,S3,S4,S5 sys
  class HUB hub
  class P1,P2,P3,P4 app
```

**落地上的三个硬约束**

- **接入而非替换。** IMS、WeAct、SCADA、视频、GIS 保持原样，AI 侧单向取数，只在两个明确约定的口子回写：缺陷与工单回 IMS，任务与提醒回 WeAct。
- **结论必须可追溯。** 模型输出强制携带测点、关键帧、规程条目的引用；没有引用不允许进入复核队列。
- **人是终态唯一入口。** AI 结论停在「建议」状态，复核人采纳后才生成工单；先跑只读提醒并行验证，达标后再开自动派单。

---

## 待确认的口径

图上这几处直接影响评审问答，需要业务侧核一遍：

- **设备规模与分类**：60181 台套、5 大类，与「机械 / 仪表 / 电气 / 通讯 / 计量」是同一套分类，还是设备分类与专业分工两个不同维度？确认后补到图 3 的 IMS 节点上。
- **IMS / WeAct 集成深度**：现按「IMS 单向取数 + 缺陷回写、WeAct 双向」画，是否与实际接口权限一致。
- **时序数据来源**：直连 SCADA / DCS，还是经 IMS 或中间平台转发。

> 现有的 4 个演示页面（监控大屏 / 站点态势 / 诊断台 / 知识图谱）是这套逻辑的可视化样例，用于评审现场演示，不构成上述架构的一部分。
