# 湘潭站 3D 巡检地图

这是一个独立演示页，用于把日常巡检移动端截图中的“巡检区域提交情况、轨迹、问题上报、任务完成状态”转译成桌面大屏上的 3D 巡检态势地图。

## 页面内容

- 顶部：站场、任务、实际巡检时间和巡检质量核心指标。
- 左侧：本轮任务状态、巡检人、计划周期、13 个巡检区域路线。
- 中间：Three.js 轻量 3D 站场地图，包含道路、建筑体块、管线、储罐、巡检轨迹和点位热点。
- 右侧：选中区域的结论、指标、证据，以及 AI 异常提醒队列。
- 底部：计划下发、手机同步、区域提交、AI 复核的演示时间线。

## 文件结构

- `index.html`：独立页面入口。
- `vendor/three.min.js`：本地 Three.js。
- `scripts/screen-scale.js`：按 `2029x763` 设计稿自适应缩放。
- `scripts/data.js`：巡检区域、路线、KPI、异常提醒和任务元数据。
- `scripts/dom.js`：DOM 构建工具和巡检地图热点/详情组件。
- `scripts/app.js`：页面渲染、选中区域切换和 3D 挂载。
- `scripts/pump3d/contract.js`：巡检点位 ID、DOM 命名和运行时断言。
- `scripts/pump3d/model.js`：程序化站场地图模型。
- `scripts/pump3d/engine.js`：WebGL 生命周期、相机交互、热点投影和轨迹巡检员动画。
- `styles/card.css`：页面布局、面板、指标、路线、右侧详情和时间线。
- `styles/pump3d.css`：3D canvas、DOM 热点和地图交互提示。

## 边界

当前页面仍保留 `window.Pump3D` 这个入口名，以减少独立 POC 的加载链变化；语义已经从“泵部位”改为“巡检点位”。同页仍只挂载一个 3D 地图实例。
