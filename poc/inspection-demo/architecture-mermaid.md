# 智能巡检系统分层架构图

本文用于 PPT 汇报架构图取材，只表达分层关系与核心模块，不展开实现细节。

## 分层架构图

```mermaid
flowchart TB
  subgraph Main["五层主架构"]
    direction TB

    subgraph L5["展示与终端层"]
      direction LR
      Screen["监控大屏"]
      PC["PC 管理端"]
      Mobile["移动端"]
      Terminal["巡检终端"]
    end

    subgraph L4["业务应用层"]
      direction LR
      subgraph App["智能巡检系统"]
        direction LR
        Task["巡检任务管理"]
        Process["巡检过程管控"]
        Event["异常事件中心"]
        Review["人工复核"]
        WorkOrder["工单闭环"]
        Report["报告归档"]
        Notice["协同通知"]
      end
    end

    subgraph L3["智能能力层"]
      direction LR
      Agent["巡检 Agent"]
      DataModel["数据大模型"]
      TimeModel["时序模型"]
      VisionModel["视觉模型"]
      KB["知识库 / RAG"]
      KG["知识图谱"]
      Rule["规则引擎"]
    end

    subgraph L2["数据与知识服务层"]
      direction LR
      AssetData["设备资产数据：60181 台套"]
      DeviceType["设备类型：机械 / 仪表 / 电气 / 通讯 / 计量"]
      InspectData["巡检记录"]
      TimeData["时序数据"]
      VideoData["视频 / 图像"]
      GeoData["GIS 地图"]
      FenceData["电子围栏"]
      DocData["规程标准 / 历史案例 / 缺陷知识"]
    end

    subgraph L1["现有系统接入层"]
      direction LR
      MS["MS 资产管理平台"]
      WeAct["WeAct 协同平台"]
      GIS["GIS"]
      Fence["电子围栏系统"]
      Video["视频平台"]
      TimeSeries["时序数据平台"]
    end
  end

  subgraph S["横向支撑层"]
    direction LR
    Auth["统一认证"]
    Permission["权限控制"]
    Gateway["接口网关"]
    Message["消息通知"]
    Audit["日志审计"]
    Monitor["运行监控 / Grafana"]
  end
```

## 汇报口径

- 上层是业务使用入口，下层是数据与系统支撑。
- `智能巡检系统` 是业务主平台，承接任务、异常、复核、工单和归档。
- `智能能力层` 提供 Agent、模型、知识库、知识图谱和规则能力。
- `现有系统接入层` 体现接入 MS、WeAct、GIS、电子围栏、视频和时序平台。
- `横向支撑层` 体现生产落地所需的权限、网关、消息、审计和监控能力。
