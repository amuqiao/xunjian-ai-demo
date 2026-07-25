# prototype-v3 数据包

这个目录是 v3 demo 的独立数据源。页面运行时仍读取 `../scripts/data.js`，但 `data.js` 应由这里的 JSON/CSV 数据包生成，不再手工维护。

## 工作方式

```text
data/demo.json
data/area-index.json
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

## 修改流程

1. 修改对应区域目录下的 JSON、CSV 或图片。
2. 运行构建：

```bash
uv run python assets/poc/prototype-v3/tools/build-data.py
```

3. 验证生成产物：

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
