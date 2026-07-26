# prototype-v3 数据包

这个目录是 v3 demo 的独立数据源。页面运行时仍读取 `../scripts/data.js`，但 `data.js` 应由这里的 JSON/CSV 数据包生成，不再手工维护。

## 工作方式

```text
data/demo.json
data/area-index.json
data/lifecycle-matrix.json
data/areas/<area>/*
        ↓
tools/build-data.py
        ↓
scripts/data.js
        ↓
index.html
```

`assets/data/` 只作为原始素材库。v3 展示需要的图片已经复制到各区域自己的 `frames/` 目录；原始路径只允许作为 `frames.json` 里的 `sourcePath` 元数据存在，不参与页面展示。

## 区域目录

每个区域单独维护一个数据包：

```text
areas/<area>/
  area.json          # 区域身份、总览文案、角色、质检结论
  form-items.csv     # 该区域表单巡检项
  item-details.json  # 可交互表单项的证据说明
  trends.json        # 时序元数据
  trends/*.csv       # 时序点位
  frames.json        # 图像帧元数据
  frames/*           # v3 内部图片副本
  lifecycle.json     # 演示生命周期说明
  questions.json     # 该区域问答/讲解点
```

当前区域 key 由 `area-index.json` 控制：

```text
metering, valve, pump, control, plc, power
```

`area-index.json` 还维护 `primaryFlow`，用于声明主线异常的区域、表单项、趋势和默认图片帧。页面不应再硬编码 `metering`、`dp` 或 `filterDp`。

## 生命周期矩阵

`lifecycle-matrix.json` 是 6 个展示区域的跨区域演示矩阵，负责说明每个区域在 demo 中扮演什么角色，以及它从哪个表单项、趋势、关键帧和问答焦点进入演示闭环。

```text
单区域事实: areas/<area>/*
跨区域顺序: area-index.json
跨区域演示闭环: lifecycle-matrix.json
```

矩阵中的每个区域必须绑定：

- `areaKey`：必须与 `area-index.json` 顺序一致。
- `role`：必须与对应区域 `lifecycle.json` 的 `role` 一致。
- `entryScene`：必须存在于对应区域 `lifecycle.json` 的 `stages` 中。
- `formItemKey`：必须存在于该区域 `form-items.csv`，并且在 `item-details.json` 有证据说明。
- `trendKey`：必须存在于该区域 `trends.json`。
- `frameKey`：必须存在于该区域 `frames.json`。
- `terminalState`：必须与对应区域 `lifecycle.json` 的 `terminalState` 一致。
- `dataSlots`：用于列出后续维护该区域演示数据时最常改的文件，所有路径都必须真实存在。

构建脚本会把矩阵附加到 `scripts/data.js` 的 `analysis.lifecycleMatrix`，后续页面如果需要展示“6 区域演示生命周期矩阵”，可以直接使用这个运行时字段。

## 修改流程

1. 修改对应区域目录下的 JSON、CSV 或图片。
2. 如果区域的演示角色、主表单项、主趋势、主图像帧或闭环终态变化，同步修改 `lifecycle-matrix.json`。
3. 运行构建：

```bash
uv run python assets/poc/prototype-v3/tools/build-data.py
```

4. 验证生成产物：

```bash
node --check assets/poc/prototype-v3/scripts/data.js
```

## 维护边界

- 不要在 `scripts/data.js` 里手工改业务数据。
- 不要让 `scripts/data.js` 引用 `../../data/...` 原始素材路径。
- 如果图片来自原始素材库，先复制到对应区域的 `frames/` 目录，再在 `frames.json` 写 `sourcePath`。
- `frames.json` 必须保留 `current`、`compare`、`plc` 三个 frame key，因为当前页面按钮依赖这三个入口。
- `questions.json` 会进入当前区域的 AI 辅助问答。
- `lifecycle.json` 会进入辅助区域的底部生命周期流程条。
- `lifecycle-matrix.json` 负责跨区域演示闭环，不替代每个区域自己的 `lifecycle.json`。
