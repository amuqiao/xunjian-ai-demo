# pump-demo assets

本原型使用 `media/` 下的本地副本，保证直接打开 `poc/pump-demo/index.html` 时图片也能加载。

素材来源：

- `assets/设备图/输油泵机组仪表点位.jpg` -> `media/point-map.jpg`
- `assets/设备图/微信图片_20260722170156_161_1152.jpg` -> `media/laser-before.jpg`
- `assets/设备图/微信图片_20260722170157_162_1152.jpg` -> `media/laser-after.jpg`
- `assets/现场图/微信图片_20260721122429_158_1152.jpg` -> `media/field-close.jpg`
- `assets/现场图/微信图片_20260721122430_159_1152.jpg` -> `media/field-work.jpg`

数据不从业务素材运行时读取，而是在 `scripts/data.js` 中以结构化演示数据维护。
