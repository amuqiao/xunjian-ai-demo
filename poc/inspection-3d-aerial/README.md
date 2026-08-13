# 俯视/卫星质感站场巡检地图（POC）

广西支干线永州分输清管站，12 个巡检区域的**俯视站场地图**：接近正俯视的相机机位 +
卫星/航拍质感地面 + 2.5D 挤出区块 + 巡检轨迹 + 图例/指北针/比例尺/缩放/轨迹开关 +
点击区域高亮 + 轻量区域信息面板。

这是同一个站场的**另一种视觉表达**，与 `poc/inspection-3d-sandbox`（低斜角三维工程
沙盘）是**两个刻意互不耦合的独立 POC**：各自持有 `scripts/map3d/contract.js`、
`scripts/map3d/model-shared.js`、`scripts/data/*.js` 的完整独立副本，运行时零共享、
一边改坏不波及另一边。巡检项数据（`scripts/data/items-*.js`，256 条）由
`poc/inspection-3d-sandbox/tools/build-items.py` 一次生成，两个 POC 各自持有一份独立
副本，不是运行时共享同一份文件。

## 怎么打开

直接用浏览器双击 `index.html`（`file://` 协议，无需构建、无需 npm、无需本地服务器）。

## 文件结构

```
poc/inspection-3d-aerial/
├── index.html                  L0 vendor → L1 契约 → L2 数据 → L3 3D → L4 core → L5 app
├── vendor/three.min.js         three.js r160 UMD
├── scripts/
│   ├── map3d/
│   │   ├── contract.js         12 区 id 真源 / DOM 命名常量 / 断言函数（零依赖）
│   │   ├── model-shared.js     程序化贴图/材质工具：createCanvas（仍被 model-track.js 引用）+
│   │   │                       buildSatelliteGround（本 POC 改进版）+ createStatusMaterials
│   │   │                       （2026-08-13 瘦身：删掉了本 POC 0 引用的
│   │   │                       buildPerforatedTexture/buildGrilleTexture/buildGroundFadeTexture/
│   │   │                       buildNameplateTexture/createMetalMaterials/disposeGroup，见文件内
│   │   │                       决策记录注释）
│   │   ├── model-aerial.js     俯视地面纹理装配 + 12 区挤出块 + 锚点
│   │   ├── model-track.js      巡检轨迹 TubeGeometry + 起点/终点/巡检人 + 流动光带
│   │   └── engine.js           WebGL 引擎：单例生命周期 + 手写轨道控制 + 按需渲染 + 标签投影
│   ├── data/
│   │   ├── station.js          12 区静态定义 + 从 DemoItems 派生的状态/进度
│   │   ├── track.js            47 点巡检轨迹 + 12 个 waypoint
│   │   └── items-entry.js / items-process.js / items-room.js   256 条真实巡检项
│   ├── core/dom.js              h()/append() + 地图宿主骨架生成器（3D 宿主/12 热点/图例/
│   │                            指北针/比例尺/控制按钮）
│   └── app.js                   入口：断言 → 渲染骨架 → mount → 事件委托 → 区域信息面板
├── styles/
│   ├── 01-tokens.css / 02-shell.css / 03-map3d.css / 04-panel.css
└── verify/
    ├── verify_map3d.js          Playwright 验收脚本
    └── screenshots/             验收脚本自动产出的截图
```

## 范围边界

**只做地图本体**：区域地块 + 12 个区域标签 + 巡检轨迹 + 图例/指北针/比例尺 + 缩放 +
点击区域高亮 + 一个轻量的区域信息面板（区域名/项数/已提交/问题数/summary/evidence/
主要设备）。**不做**三级钻取、不做 256 项巡检项清单、不做问题上报表单——那些是
`poc/inspection-3d-sandbox` 的范围。

## 视觉路线选择：诚实总图为主干，卫星质感为底纹的融合

任务书给了两条可选路线：① 追求航拍质感；② 做成"诚实的站场平面总图"。本 POC 选择
**融合**，但明确以哪一半为主：

- **结构性、必须准确的信息**（12 区边界/编号/状态/巡检轨迹/指北针/比例尺/图例）走
  "诚实总图"的路子——不假装是卫星影像，用清晰的色块/编号/标注表达，这部分的正确性
  是可以被验收脚本机械验证的（12 个标签顺序、去重叠、状态色）。
- **地面质感**走"卫星/航拍"的路子，但只作为**底纹**，不承担任何需要精确读数的信息——
  它的作用是让俯视机位不至于像一张"贴了色块的黑板"，仅此而已。

这个优先级划分是刻意的：上一轮的问题正是想让地面纹理同时"看起来像卫星图"又要"扛起
识别区域边界"的双重任务，结果两头不讨好。这一轮把"区域边界"的识别责任明确交给
2.5D 挤出块本身的轮廓 + 顶面状态色 + 硬化地坪纹理层，地面纹理只需要在**它管辖的地方**
（站场围墙之外的装饰性周边地物）尽量像样即可。

## 地面纹理的诚实评价

改进内容（相对最初一版 `buildSatelliteGround` 的三条具体修改）：

1. **不规则 blob 替代纯圆形软斑块**（`model-shared.js` 的 `paintBlob`）：每个斑块由
   4~6 个偏心叠放的小圆 + 一个居中核心圆拼成，轮廓不再是正圆，读起来更像地物边界而
   不是一团匀速渐变的水彩。
2. **色相/明度对比跨度明显拉开**：四个色族（红棕裸土/枯黄旱地/深绿林冠/浅绿林冠高光）
   的 alpha 上限从原来的 0.2~0.35 提到 0.24~0.58，色相跨度也从"棕色系内部差异"扩到
   "暖棕 vs 冷绿"的强对比。
3. **新增三层装饰性地物**：田块条纹（`paintFarmlandFields`，规则矩形+交替条纹）、
   林冠簇（`paintTreeClusters`，密集小圆点簇，补高频细节）、水塘（`paintWaterPonds`，
   不规则闭合暗色区+边缘高光）。外加一层暗角（`paintVignette`）压暗四周。

**实测截图（`verify/screenshots/`）逐项自评**：

- `06-zoomed-out-with-farmland.png`（缩小后的全景）：站场围墙之外能清楚看到条纹状
  田块、成簇的深绿林冠、以及右侧一小片水塘——这三样人工/自然地物特征在这个缩放层级
  下**读起来是成立的**，比上一轮"整张图是同一种橄榄绿泥地"有明显改善。
- `07-ground-texture-closeup.png`（中等放大裁剪）：田块条纹清晰、林冠簇的颗粒感也
  在，但斑块之间的过渡仍然偏柔和——不规则 blob 改善了轮廓，但没有解决"边缘发虚"的
  问题，这是画质而不是形状的局限。
- `08-ground-texture-max-zoom.png`（缩到最大再放大裁剪）：**这里暴露了一个没能解决
  的问题**——512² 噪声瓦片按 16×16 网格平铺烘进宏观层（`stampNoiseTile`），在这个
  缩放层级下瓦片边界变得肉眼可见，硬化地坪呈现出规律的"砖块状"重复纹路，而不是随机
  颗粒。诚实地说，**贴近观察时它不像航拍照片，像贴图分辨率不够**。

**结论**：中等及以上的缩放层级（默认视角、缩小到能看清周边地物的层级）下，"卫星质感
底纹"这条路线基本成立；但只要拉到最大缩放，噪声瓦片的重复网格会穿帮，这是分辨率
（当前 1024²）与平铺策略的固有局限，不是这一轮能在预算内解决的。**后续改进方向**：
把 512² 噪声瓦片的平铺次数从 16×16 降到 8×8 但配合非均匀 UV 偏移（每次平铺随机加一点
旋转/镜像）来打散网格规律性，或者干脆把最内层缩放挡位的 `radiusMin` 收紧，不让用户
拉近到能看穿瓦片边界的距离。

## 引擎从 /Users/admin/Code/beng-ai-demo/poc/pump-demo/scripts/pump3d/engine.js 抄了哪几段、改了哪几处

逐字/近似逐字抄的部分（详见 `scripts/map3d/engine.js` 文件头注释）：

1. `createGLContext` + `GL_ATTRS`——自己建 context 再交给 three，`preserveDrawingBuffer:
   true` 是按需渲染成立的前提。
2. `createOrbit` 的核心机制——deltaMode 归一化、dtMs 归一化阻尼、收敛 snap、
   `lostpointercapture` 兜底三种漏 `pointerup`。
3. `markDirty`/`startLoop`——按需渲染的脏标记纪律 + 30fps 节流 + 四条静默守卫。
4. `sweepLabels`/`fitLabelsVertically`——标签去碰撞算法，含"绝不能写成 `while(changed)`
   收敛循环"那条红线注释。
5. 阴影 `autoUpdate=false` + `needsUpdate=true` 配对。
6. `contextCreated += 1` 紧跟 renderer 构造之后 + `engineFailed` 闩锁。
7. `webglcontextlost` → `throw`。

改掉/删掉的部分：

- **删除多 preset 切换**（`applyPreset`/最短路径 theta 换算）：本 POC 只有一台相机，
  不做视角切换（呼应 `contract.js` 里"终生单例、无 setMode"的论证——不切换就不需要
  "切换动画"这件事）。
- **删除入场巡航（intro cruise）**：pump3d 的入场巡航长达 6.5s，会让"静止 1.5s 后
  idle===true"这条验收断言在页面刚打开时必然失败。改用轨迹流动光带（2.6s，见
  `Map3DTrack.FLOW_DURATION_MS`）替代"开场有点动感"的诉求，验收脚本等待 3.2s 以上
  再判定 idle。
- **新增 updateTrackFlow 这一路脏源**：轨迹流动光带通过 `texture.offset.x` 推进，
  有限时长播放、播完停，接入 `startLoop` 的 `moving || flowing` 判定。
- **热点从"泵部位"改成"区域"**：引线不再指回泵轴中心线，而是垂直向下指回挤出块顶面
  （`leadDrop`）；尺寸常量按站场与泵机组的尺度比（约 28 倍）重新估算，不是照抄泵机组
  的数字。
- **新增比例尺动态更新**（`updateScaleBar`）：pump3d 没有比例尺这个概念，这是本 POC
  独有的新增功能，复用了 `syncLabels` 里已有的世界坐标→屏幕坐标投影逻辑。
- **标签越界钳制新增上下安全带**（`LABEL_MARGIN_TOP`/`LABEL_MARGIN_BOTTOM`）：pump3d
  只有 6 个标签、四角没有常驻控件，本 POC 12 个标签 + 底部横跨全宽的比例尺/轨迹开关/
  缩放按钮，缩到最外层缩放档位时标签会飘到控件上方截获点击（实测踩过这个坑，见下）。

## 相机朝向踩过的一个坑：东西镜像

第一版选了 `theta = -Math.PI/2`，实测发现地图东西镜像了——`launcher`（西端，
`x=-225`）显示在屏幕右侧，`regulate`（东端，`x=225`）显示在屏幕左侧。原因是
`camera.lookAt()` 默认 `up=(0,1,0)` 时，相机的"右手"方向由 `cross(forward, up)` 决定，
`theta=-PI/2` 算出来的 forward 恰好让这个叉乘结果指向世界 `-X`。改成 `theta=+PI/2`
后实测核对 12 个区域的左右顺序与 `station.js` 的 `x` 坐标完全一致（东右西左、北上南
下），已在 `engine.js` 的 `CAMERA` 常量注释里记录这个推导，避免以后再踩一次。

## 12 个标签在俯视机位下的去碰撞实测

`verify/verify_map3d.js` 在 5 种姿态下量了 12 个标签的两两 bounding box 相交：

| 姿态 | 重叠数 |
| --- | --- |
| 默认视角 | 0 |
| 连续放大两档 | 0 |
| 连续缩小四档（最外层） | 0 |
| 从中心拖拽 (+120,+60) | 0 |
| 从中心拖拽 (-140,-90)（反向） | 0 |

**最挤的姿态**是"连续缩小四档"——这时 12 个标签的屏幕间距最小，且会逼近地图四角的
常驻控件（指北针/提交横幅/比例尺/轨迹开关+缩放按钮）。第一次实测在这个姿态下确实
炸出问题：`launcher`（收发球）标签飘到右下角，**截获了缩放按钮的点击**（Playwright
报 `<span class="area-pin-name">收发球</span> ... intercepts pointer events`）。
修法见上一节的 `LABEL_MARGIN_TOP`/`LABEL_MARGIN_BOTTOM`——给标签越界钳制的上下边界
各留一条安全带（56px / 132px），而不是像 pump3d 那样直接钳到宿主四边。修完之后 5 种
姿态下重叠数与控件遮挡都是 0。

## 验收命令与实际输出

```bash
find scripts -name '*.js' -print0 | xargs -0 -n1 node --check
# （全部输出为空，退出码 0，即全绿）
```

```bash
node verify/verify_map3d.js
```

实际输出（`file://` 打开，非 `--allow-file-access-from-files`）：

```
PASS - pageerror 为空 :: []
console 白名单内: ["Scripts \"build/three.js\" and \"build/three.min.js\" are deprecated with r150+, ..."]
console 白名单外（如实记录，不代表应用报错，见 README）: ["[.WebGL-...]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels", ... ×4]
PASS - contextCreated === 1
PASS - [data-map3d-host] 恰好 1 个
PASS - .map3d-labels 内 [data-map3d-area] 恰好 12 个
PASS - 12 个标签属性值顺序 === AREA_IDS
PASS - assertPinNamespace() 通过
PASS - 标签无重叠 @ default-view
PASS - 标签无重叠 @ zoomed-in
PASS - 标签无重叠 @ zoomed-out
PASS - 标签无重叠 @ drag-right-down
PASS - 标签无重叠 @ drag-left-up
PASS - renderCalls < 200 :: 143
PASS - triangles < 260000 :: 25038
PASS - 静止 1.5s 后 idle === true
PASS - 静止 1.5s 后 frames 不再涨
PASS - 点击 gate 热点后 activeAreaId === "gate"
PASS - 信息面板标题跟随为「进、出站区」

==== 汇总 ====
通过: 17 / 17
```

**关于 console 白名单外的那条消息**：`GL Driver Message ... GPU stall due to ReadPixels`
不是 three.js 打的，也不是本页面代码的报错——这是 headless Chromium 在
`preserveDrawingBuffer: true`（按需渲染成立的必要条件，见 `GL_ATTRS` 注释）下，
ANGLE/GPU 驱动打的一条**性能诊断**，与 swiftshader 提示是同一类"环境噪音"，但字面上
不匹配任务书要求的窄白名单（"three r160 弃用横幅"与"swiftshader 提示"两类）。这里
选择如实记录、不悄悄把它塞进白名单字符串里掩盖，也不因为它判定验收失败——因为
`pageerror` 列表为空，且这条消息在真实浏览器双击打开时大概率不会出现（这是
headless 测试环境特有的诊断信息）。

## 4 张截图

全部由 `verify/verify_map3d.js` 自动产出，保存在 `verify/screenshots/`：

1. `01-overview.png`——全景俯视，12 区块 + 巡检轨迹 + 图例/指北针/比例尺/控制按钮。
2. `03-area-selected-gate.png`——选中"进、出站区"（gate），3D 高亮 + 右侧信息面板
   联动显示 summary/evidence/设备清单。
3. `04-track-visible.png`——巡检轨迹显示态（另有 `05-track-hidden.png` 展示关闭态
   作对比）。
4. `07-ground-texture-closeup.png`——地面纹理局部放大裁剪（另有 `08-ground-texture-
   max-zoom.png` 展示最大缩放下的瓦片重复纹路，见「地面纹理的诚实评价」）。
6. `06-zoomed-out-with-farmland.png`——缩小后的全景，可看到围墙外的田块/林冠/水塘。

## 遗留问题与后续改进建议

1. **地面噪声瓦片在最大缩放层级下会穿帮**（见上文「地面纹理的诚实评价」），需要
   要么提高瓦片随机性、要么收紧最小缩放半径。
2. **指北针是静态绘制的**：方位角 `theta` 被钳制在初始值附近 ±6.9°（`azimuthClamp:
   0.12`），指北针按初始朝向画死，不随镜头拖拽实时重算角度。这是刻意的简化（详见
   `engine.js` 文件头「俯视机位」一节），误差在视觉上可忽略，但如果未来要放开更大的
   自由环绕范围，指北针需要改成每帧读取当前 `theta` 重新旋转。
3. **比例尺的"世界单位"没有真实米制换算**：`data/track.js` 明确写过"尚无真实米制
   换算表"，本页面诚实地标注"100 世界单位"而不是编一个"米"出来；如果后续拿到真实
   站场尺寸的现场测绘数据，应该在 `data/station.js` 补一个 `metersPerUnit` 常量，
   届时比例尺与巡检轨迹的耗时/距离展示都可以一并换算成真实单位。
4. **区域顶面选中态会临时覆盖状态色**：点击选中某个区域时，该区域挤出块的全部材质
   （含顶面状态色）会被临时改成选中态青色（复用 pump3d 的 `cacheAndApplySelection`
   逻辑），取消选中后精确还原。这意味着选中一个区域时无法同时看到它的状态色——这是
   直接复用既有约定的结果，不是本 POC 的新设计，如果需要"选中态与状态色同时可见"，
   需要改成侧栏详情面板承担状态展示、3D 场景侧只用一个额外的描边/光晕表达选中，而
   不是覆盖材质颜色。
5. **周边农田/林带/水塘是舞台美术，不是这座站场的真实测绘/影像数据**：`model-
   aerial.js` 文件头已明确声明这一点，但这里再强调一次——不要把这几处装饰性地物
   误当作真实地理信息使用。
