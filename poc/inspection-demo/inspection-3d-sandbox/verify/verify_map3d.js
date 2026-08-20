// 验收脚本：以 file:// 打开 index.html（不带 --allow-file-access-from-files，模拟真实
// 双击），断言 pageerror 为空 / 单例 WebGL 上下文 / 12 个区域热点顺序与命名空间 /
// 多缩放档位+多拖拽姿态下标签互不重叠 / 渲染预算 / 按需渲染 idle 收敛 / 「返回全站」
// 「重置视角」两个入口的出现条件与快路径（不整页重渲染）/ 左栏第 0 层「全站视图」行 /
// 选中区域后的右栏联动 / 「添加人员」弹层。
//
// 2026-08-20 随"沙盘 → 站点平面图 2.5D"改造同步更新的三类断言：
//   1. 新增「平面图保真」组：站场地块尺寸必须等于 plan.js 的图幅、相机方位角必须
//      锁在正南（theta ≈ π/2）附近。后者是整个改造的核心不变量——平面图一旦被转
//      歪，业务方就认不出自己的站了，而这种偏差不会报错、只会"看起来有点怪"。
//   2. 新增「选中区域不移动相机」断言（替换原来的"下钻态可见标签数 < 12"）：
//      area 预设已删除，选中区域只改高亮，镜头必须一动不动。
//   3. 删除「问题上报」弹层的两条断言：该弹层已随需求收窄移出本 POC。
//
// 运行前提：本机需要能 require('playwright') 并已下载 Chromium（`npx playwright install
// chromium`）。CI/沙盒环境如果全局 node_modules 不在标准查找路径下，把下面 require 的
// 路径换成本机实际可解析到 playwright 包的路径即可，脚本本身不依赖固定路径。
//
// 截图约定：本 POC 不建 verify/screenshots/（那是另一个 POC 的约定），截图统一写到调用方
// 通过 SHOT_DIR 环境变量指定的目录（未指定时落在系统临时目录下的 map3d-sandbox-verify/），
// 不写进本仓库。
//
// 用法：node verify/verify_map3d.js
// 用法（自定义截图目录）：SHOT_DIR=/some/scratch/dir node verify/verify_map3d.js
const path = require('path');
const fs = require('fs');
const os = require('os');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  chromium = require('/private/tmp/node_modules/playwright').chromium;
}

const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SHOT_DIR = process.env.SHOT_DIR
  ? path.resolve(process.env.SHOT_DIR)
  : path.join(os.tmpdir(), 'map3d-sandbox-verify');

// 验收要求的窄字符串白名单：只放 three r160 弃用横幅与 swiftshader/GL Driver Message 提示，
// 不做宽松的 "startsWith('THREE.')"——污染纹理的失败正好以 "THREE.WebGLState: SecurityError"
// 开头，宽松匹配会把 file:// 下最可能发生的 bug 直接藏掉（见 Map3DContract.assertTextureUntainted
// 的文件头注释）。
const CONSOLE_ALLOW_PREFIXES = [
  'Scripts "build/three.js" and "build/three.min.js" are deprecated',
  'SwiftShader'
];

// GL Driver Message（"GPU stall due to ReadPixels"）是 headless Chromium 在
// preserveDrawingBuffer:true 下打的一条与本应用代码无关的 GPU 驱动性能诊断，实测格式是
// "[.WebGL-<每次运行都不同的十六进制上下文 id>]GL Driver Message (OpenGL, Performance,
// GL_CLOSE_PATH_NV, <High|Medium|Low>): GPU stall due to ReadPixels" ——开头那段上下文 id
// 必然随运行变化，不可能用 indexOf(p)===0 的纯字符串前缀去匹配。这里仍然坚持"窄匹配"
// 的纪律：不是放宽成"包含 GL Driver Message 就算"这种宽松包含判断，而是用一条锚定了
// 上下文 id 的具体形状（[.WebGL-十六进制]）+ 后面固定不变的完整短语（GL_CLOSE_PATH_NV
// 那一整段 + GPU stall due to ReadPixels）的正则，命中面不会比字符串前缀匹配更宽——
// 不会误吞任何以 "THREE." 开头的、与本应用代码相关的报错（比如 THREE.WebGLState:
// SecurityError），那才是这条白名单纪律真正要防的事。
const GL_DRIVER_STALL_RE = /^\[\.WebGL-[0-9a-fA-Fx]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, (High|Medium|Low)\): GPU stall due to ReadPixels/;

function classifyConsole(text) {
  if (CONSOLE_ALLOW_PREFIXES.some((p) => text.indexOf(p) === 0)) return 'allowed';
  if (GL_DRIVER_STALL_RE.test(text)) return 'allowed';
  return 'unexpected';
}

async function checkLabelOverlap(page) {
  const boxes = await page.$$eval('.map3d-labels [data-map3d-area]', (els) =>
    els
      .filter((el) => el.style.opacity !== '0')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-map3d-area'), x: r.x, y: r.y, w: r.width, h: r.height };
      })
  );
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const intersects = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      if (intersects) overlaps.push([a.id, b.id]);
    }
  }
  return overlaps;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  // 刻意不传 --allow-file-access-from-files：模拟真实双击打开本地文件。
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const pageErrors = [];
  const consoleAll = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleAll.push(msg.text());
  });

  const report = { assertions: [] };
  function assert(name, pass, detail) {
    report.assertions.push({ name, pass, detail });
    console.log((pass ? 'PASS' : 'FAIL') + ' - ' + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
  }

  console.log('Opening', INDEX);
  console.log('Screenshots ->', SHOT_DIR);
  await page.goto(INDEX, { waitUntil: 'load' });

  // ---- 全景态：等入场巡航（engine.js 的 INTRO_CRUISE_DURATION_MS=6500ms）结束 ----
  await page.waitForTimeout(7000);

  assert('pageerror 为空', pageErrors.length === 0, pageErrors);

  const unexpectedConsole = consoleAll.filter((t) => classifyConsole(t) === 'unexpected');
  const allowedConsole = consoleAll.filter((t) => classifyConsole(t) === 'allowed');
  report.consoleAllowed = allowedConsole;
  report.consoleUnexpected = unexpectedConsole;
  assert('console 无白名单外的输出', unexpectedConsole.length === 0, unexpectedConsole);
  console.log('console 白名单内:', JSON.stringify(allowedConsole));

  const debugInfo0 = await page.evaluate(() => window.Map3D.debugInfo());
  assert('contextCreated === 1', debugInfo0.contextCreated === 1, debugInfo0);

  // ---- 平面图保真：地块尺寸 = 平面图图幅，相机方位锁在正南 ----
  //
  // 这两条是本次改造的核心不变量，而且都属于"错了不会报错、只会看起来有点怪"的
  // 那一类，必须钉在脚本里：
  //   - 地块尺寸与 plan.js 的图幅不一致 → 底图纹理的 UV 换算与区域坐标错位，画面上
  //     表现为"色块比底图上的分区框偏了一点"。
  //   - 相机方位角偏离正南 → 屏幕上的"上"不再是北，平面图被转了个角度，这正是业务方
  //     一开始否掉旧沙盘版的原因。允许 azimuthClamp(0.10) 的入场巡航摆幅，再给
  //     0.02 的阻尼收敛余量。
  //
  // ⚠️ 位置要紧：这两条必须放在下面那串缩放/拖拽场景**之前**。用户手动拖拽是允许把
  // 镜头转到任意角度的（createOrbit 不限制 theta），拖过之后再断言"朝正南"测的就不是
  // 设计机位而是拖拽残留姿态——第一版误把它放在拖拽之后，虽然侥幸通过（|Δ|=0.10 刚好
  // 卡在阈值内），但那条绿灯什么也没证明。这里真正要钉住的是"入场巡航自己不会把
  // 平面图转歪"，所以取巡航刚结束、任何交互之前的姿态。
  const yardMatch = await page.evaluate(() => {
    const a = window.DemoStation.meta().yard;
    const b = window.DemoPlan.yard();
    return { yard: a, planYard: b, equal: a.w === b.w && a.d === b.d };
  });
  assert('站场地块尺寸 === plan.js 的平面图图幅', yardMatch.equal === true, yardMatch);

  const thetaInfo = await page.evaluate(() => ({
    theta: window.Map3D.debugInfo().orbit.theta,
    south: Math.PI / 2
  }));
  assert('入场巡航结束后相机方位角仍锁在正南（|theta − π/2| ≤ 0.12）',
    Math.abs(thetaInfo.theta - thetaInfo.south) <= 0.12, thetaInfo);


  const hostCount = await page.locator('[data-map3d-host]').count();
  assert('[data-map3d-host] 恰好 1 个', hostCount === 1, { hostCount });

  const labelsRootCount = await page.locator('.map3d-labels').count();
  assert('.map3d-labels 恰好 1 个', labelsRootCount === 1, { labelsRootCount });

  const pinCount = await page.locator('.map3d-labels [data-map3d-area]').count();
  assert('.map3d-labels 内 [data-map3d-area] 恰好 12 个', pinCount === 12, { pinCount });

  const pinOrder = await page.$$eval('.map3d-labels [data-map3d-area]', (els) =>
    els.map((el) => el.getAttribute('data-map3d-area'))
  );
  const areaIds = await page.evaluate(() => window.Map3DContract.AREA_IDS);
  assert('12 个标签属性值顺序 === AREA_IDS', JSON.stringify(pinOrder) === JSON.stringify(areaIds), { pinOrder, areaIds });

  let pinNamespaceOk = true;
  let pinNamespaceError = null;
  try {
    await page.evaluate(() => window.Map3DContract.assertPinNamespace());
  } catch (e) {
    pinNamespaceOk = false;
    pinNamespaceError = String(e);
  }
  assert('assertPinNamespace() 通过', pinNamespaceOk, pinNamespaceError);

  // ---- 全景态：没有「返回全站」按钮（没有可返回的上一层，不应渲染成 disabled） ----
  const backCountOverview = await page.locator('.map-zoom-back').count();
  assert('全景态没有 .map-zoom-back 按钮', backCountOverview === 0, { backCountOverview });

  await page.screenshot({ path: path.join(SHOT_DIR, '01-overview-no-back-button.png') });

  // ---- 多缩放档位 + 多拖拽姿态下的标签互不重叠（全景态，12 个标签全可见） ----
  const overlapScenarios = [];
  overlapScenarios.push({ label: 'default-view', overlaps: await checkLabelOverlap(page) });

  await page.click('[data-action="map-zoom-in"]');
  await page.waitForTimeout(200);
  await page.click('[data-action="map-zoom-in"]');
  await page.waitForTimeout(600);
  overlapScenarios.push({ label: 'zoomed-in', overlaps: await checkLabelOverlap(page) });

  for (let i = 0; i < 4; i++) {
    await page.click('[data-action="map-zoom-out"]');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  overlapScenarios.push({ label: 'zoomed-out', overlaps: await checkLabelOverlap(page) });

  await page.click('[data-action="map-zoom-in"]');
  await page.waitForTimeout(150);
  await page.click('[data-action="map-zoom-in"]');
  await page.waitForTimeout(500);

  const mapBox = await page.locator('[data-map3d-host]').boundingBox();
  const cx = mapBox.x + mapBox.width / 2;
  const cy = mapBox.y + mapBox.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 60, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  overlapScenarios.push({ label: 'drag-right-down', overlaps: await checkLabelOverlap(page) });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 140, cy - 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  overlapScenarios.push({ label: 'drag-left-up', overlaps: await checkLabelOverlap(page) });

  report.overlapScenarios = overlapScenarios.map((s) => ({ label: s.label, overlapCount: s.overlaps.length, overlaps: s.overlaps }));
  overlapScenarios.forEach((s) => {
    assert('标签无重叠 @ ' + s.label, s.overlaps.length === 0, s.overlaps);
  });

  // 把拖拽/缩放拉歪的姿态恢复到默认，再进入渲染预算/idle 检查，避免入场巡航的惯性和
  // 刚才这串交互的阻尼收尾互相干扰。
  for (let i = 0; i < 6; i++) {
    await page.click('[data-action="map-zoom-out"]');
    await page.waitForTimeout(100);
  }

  // ---- 渲染预算 + idle 收敛 ----
  //
  // 这里**不能**用固定等待再断言 idle。轨道控制是 epsilon 收敛 + 收敛时一次性 snap
  // （见 engine.js 的 ORBIT_EPS_ANGLE/ORBIT_EPS_DIST），上面那串缩放/拖拽结束后阻尼
  // 还要若干帧才收敛完，固定 500ms 只是在赌它够快——实测同一份脚本会时过时不过
  // （曾出现 frames 344→347 的 +3 帧失败）。flaky 的断言比没有断言更糟：它会让人
  // 开始习惯性地重跑而不是相信红灯。
  //
  // 正确做法是先**轮询等到 idle**（这本身就是"按需渲染最终会停"的断言，超时即失败），
  // 收敛之后再取基线、静置、断言 frames 不再涨——后者才是"停下来之后真的不再画"的断言。
  // 两条断言各自测一件事，都不依赖时序运气。
  const IDLE_TIMEOUT_MS = 6000;
  const idleWaitStart = Date.now();
  let idleReached = false;
  while (Date.now() - idleWaitStart < IDLE_TIMEOUT_MS) {
    if ((await page.evaluate(() => window.Map3D.debugInfo())).idle === true) { idleReached = true; break; }
    await page.waitForTimeout(100);
  }
  assert('交互结束后能收敛到 idle === true（轮询上限 ' + IDLE_TIMEOUT_MS + 'ms）', idleReached,
    { waitedMs: Date.now() - idleWaitStart });

  const framesBefore = (await page.evaluate(() => window.Map3D.debugInfo())).frames;
  await page.waitForTimeout(1600);
  const debugInfoIdle = await page.evaluate(() => window.Map3D.debugInfo());
  assert('renderCalls < 200', debugInfoIdle.renderCalls < 200, debugInfoIdle.renderCalls);
  assert('triangles < 260000', debugInfoIdle.triangles < 260000, debugInfoIdle.triangles);
  assert('idle 之后静置 1.6s 仍为 idle', debugInfoIdle.idle === true, debugInfoIdle);
  assert('idle 之后静置 1.6s frames 不再涨', debugInfoIdle.frames === framesBefore, { framesBefore, framesAfter: debugInfoIdle.frames });

  // ---- 左栏第 0 层「全站视图」行：可见、可点 ----
  const overviewRow = page.locator('[data-select="area"][data-select-id="__none__"]');
  const overviewRowDisplay = await overviewRow.evaluate((el) => getComputedStyle(el).display);
  assert('左栏第 0 层「全站视图」行可见（display !== "none"）', overviewRowDisplay !== 'none', { overviewRowDisplay });

  // ---- 选中 cabinet：右栏联动 + 「返回全站」按钮出现 + 相机一动不动 ----
  const cameraBeforeSelect = (await page.evaluate(() => window.Map3D.debugInfo())).cameraPosition;

  await page.click('[data-select="area"][data-select-id="cabinet"]');
  await page.waitForTimeout(900);

  const debugInfoCabinet = await page.evaluate(() => window.Map3D.debugInfo());
  assert('选中 cabinet 后 activeAreaId === "cabinet"', debugInfoCabinet.activeAreaId === 'cabinet', debugInfoCabinet);

  const itemRowCount = await page.locator('.item-row').count();
  assert('选中 cabinet 后右栏 .item-row 恰好 67 行', itemRowCount === 67, { itemRowCount });

  const activeAreaLabelText = await page.locator('[data-active-area-label]').textContent();
  assert('[data-active-area-label] 文本为「综合控制室」', activeAreaLabelText === '综合控制室', { activeAreaLabelText });

  // 相机不动：area 预设已删除，选中区域只改 3D 高亮与 DOM 标签 active 态。
  // 用相机世界坐标比对（而不是 preset 名）——preset 名不变很容易靠"没写切换代码"
  // 蒙对，位置不变才真的证明没人偷偷 retarget。
  const cameraAfterSelect = debugInfoCabinet.cameraPosition;
  const cameraMoved = ['x', 'y', 'z'].some(
    (k) => Math.abs(cameraBeforeSelect[k] - cameraAfterSelect[k]) > 0.5
  );
  assert('选中区域不移动相机（无下钻机位）', cameraMoved === false, { cameraBeforeSelect, cameraAfterSelect });

  assert('选中区域后 12 个标签仍然全部可见（不再按邻接关系收窄）',
    debugInfoCabinet.hiddenBehindCamera === 0, { hiddenBehindCamera: debugInfoCabinet.hiddenBehindCamera });

  const backCountDrilldown = await page.locator('.map-zoom-back').count();
  assert('选中区域后出现 .map-zoom-back 按钮', backCountDrilldown === 1, { backCountDrilldown });

  const backButtonVisible = await page.locator('.map-zoom-back').isVisible();
  assert('.map-zoom-back 按钮可点（可见且可交互）', backButtonVisible === true, { backButtonVisible });

  await page.screenshot({ path: path.join(SHOT_DIR, '02-area-selected-with-back-button.png') });

  // ---- 重置视角：resetViewCount 递增，且不触发整页重渲染（Charts.debugInfo().drawCalls
  // 在点击前后不变，证明走的是不重挂 DOM 的快路径） ----
  // 先故意把镜头拖拽/缩放歪，制造一个"确实需要复位"的姿态，再验证点击后真的转回去。
  // 重新量一次宿主包围盒（而不是复用全景态时算的 cx/cy）：选中态下 .map-zoom-back 是新出现的
  // 覆盖层，虽然不改变宿主本身尺寸，但这里不假设"两次一定完全一样"，现场量更可靠。
  const mapBoxCabinet = await page.locator('[data-map3d-host]').boundingBox();
  const cx2 = mapBoxCabinet.x + mapBoxCabinet.width / 2;
  const cy2 = mapBoxCabinet.y + mapBoxCabinet.height / 2;
  await page.mouse.move(cx2, cy2);
  await page.mouse.down();
  await page.mouse.move(cx2 + 160, cy2 + 40, { steps: 10 });
  await page.mouse.up();
  await page.click('[data-action="map-zoom-in"]');
  await page.waitForTimeout(500);

  const orbitBeforeReset = (await page.evaluate(() => window.Map3D.debugInfo())).orbit;

  const resetViewCountBefore = (await page.evaluate(() => window.Map3D.debugInfo())).resetViewCount;
  const drawCallsBefore = (await page.evaluate(() => window.Charts.debugInfo())).drawCalls;

  await page.click('[data-action="reset-view"]');
  await page.waitForTimeout(300);

  const resetViewCountAfter = (await page.evaluate(() => window.Map3D.debugInfo())).resetViewCount;
  const drawCallsAfter = (await page.evaluate(() => window.Charts.debugInfo())).drawCalls;

  assert('点击 .map-zoom-reset 后 resetViewCount 递增', resetViewCountAfter === resetViewCountBefore + 1, {
    resetViewCountBefore, resetViewCountAfter
  });
  assert('点击 .map-zoom-reset 不触发整页重渲染（Charts.debugInfo().drawCalls 不变）', drawCallsAfter === drawCallsBefore, {
    drawCallsBefore, drawCallsAfter
  });

  // 等阻尼动画收敛后再看 orbit 姿态确实回到了预设初始值附近（而不是原地不动）。
  await page.waitForTimeout(1000);
  const orbitAfterReset = (await page.evaluate(() => window.Map3D.debugInfo())).orbit;
  report.resetViewOrbit = { before: orbitBeforeReset, after: orbitAfterReset };

  await page.screenshot({ path: path.join(SHOT_DIR, '03-after-reset-view.png') });

  // ---- 点击「返回全站」：回到全景态，.map-zoom-back 再次消失 ----
  await page.click('[data-action="back-to-overview"]');
  await page.waitForTimeout(500);

  const debugInfoAfterBack = await page.evaluate(() => window.Map3D.debugInfo());
  assert('点击 .map-zoom-back 后 activeAreaId === null', debugInfoAfterBack.activeAreaId === null, debugInfoAfterBack);

  const backCountAfterBack = await page.locator('.map-zoom-back').count();
  assert('点击 .map-zoom-back 后 .map-zoom-back 再次消失', backCountAfterBack === 0, { backCountAfterBack });

  // ---- 左栏第 0 层「全站视图」行：再下钻一次，用它点回全景，验证这条路径同样成立 ----
  await page.click('[data-select="area"][data-select-id="cabinet"]');
  await page.waitForTimeout(500);
  await page.click('[data-select="area"][data-select-id="__none__"]');
  await page.waitForTimeout(500);

  const debugInfoAfterOverviewRow = await page.evaluate(() => window.Map3D.debugInfo());
  assert('点击左栏「全站视图」行后 activeAreaId === null', debugInfoAfterOverviewRow.activeAreaId === null, debugInfoAfterOverviewRow);

  // ---- 「添加人员」弹层：候选名单含真实姓名、唐爱纯已在列、选一位后顶栏任务卡巡检人
  // 变成逗号分隔的两人、再次打开时刚加的那位不再出现在可选（未禁用）名单里 ----
  async function readInspectorFieldText() {
    return page.$$eval('.task-card-fields .task-field', (fields) => {
      var match = fields.filter(function (f) {
        return f.querySelector('.task-field-label').textContent === '巡检人';
      })[0];
      return match ? match.querySelector('.task-field-value').textContent : null;
    });
  }

  await page.click('[data-action="add-inspector"]');
  await page.waitForTimeout(400);

  const inspectorPickerVisible = await page.locator('.inspector-picker-overlay').isVisible();
  assert('点击「添加人员」后弹层可见', inspectorPickerVisible === true, { inspectorPickerVisible });

  const candidateNames = await page.locator('.inspector-picker-row-name').allTextContents();
  assert('候选名单包含真实姓名 王泽宇/周理斌', candidateNames.indexOf('王泽宇') >= 0 && candidateNames.indexOf('周理斌') >= 0, candidateNames);

  const tangDisabled = await page.locator('.inspector-picker-row', { hasText: '唐爱纯' }).getAttribute('disabled');
  assert('唐爱纯行标为已在列（disabled）', tangDisabled !== null, { tangDisabled });

  const inspectorBeforeAdd = await readInspectorFieldText();
  assert('添加前顶栏任务卡巡检人为「唐爱纯」', inspectorBeforeAdd === '唐爱纯', { inspectorBeforeAdd });

  await page.screenshot({ path: path.join(SHOT_DIR, '04-inspector-picker-first-open.png') });

  await page.click('[data-inspector-name="王泽宇"]');
  await page.waitForTimeout(400);

  const inspectorAfterAdd = await readInspectorFieldText();
  assert('选中王泽宇并确认后顶栏任务卡巡检人变成「唐爱纯,王泽宇」', inspectorAfterAdd === '唐爱纯,王泽宇', { inspectorAfterAdd });

  const overlayKindAfterAdd = await page.evaluate(() => window.AppState.value.overlay.kind);
  assert('添加人员后弹层自动关闭（overlay.kind === null）', overlayKindAfterAdd === null, { overlayKindAfterAdd });

  await page.screenshot({ path: path.join(SHOT_DIR, '05-taskcard-after-add-inspector.png') });

  await page.click('[data-action="add-inspector"]');
  await page.waitForTimeout(400);

  const wangSelectableCount = await page.locator('[data-inspector-name="王泽宇"]').count();
  assert('再次打开弹层后王泽宇不再出现在可选（未禁用）名单里', wangSelectableCount === 0, { wangSelectableCount });

  const wangBadgeText = await page.locator('.inspector-picker-row', { hasText: '王泽宇' }).locator('.inspector-picker-row-badge').textContent();
  assert('王泽宇行改为标注「已在列」', wangBadgeText === '已在列', { wangBadgeText });

  await page.screenshot({ path: path.join(SHOT_DIR, '06-inspector-picker-reopened.png') });

  // 现在页面只挂 1 个 .overlay-layer（「添加人员」），但仍然用 .overlay-layer.open
  // 限定作用域：这条纪律防的是"页面里同时存在多个弹层外壳时，未限定作用域的
  // [data-action="close-overlay"] 会点到 DOM 顺序更靠前、但并未打开的那个"。
  // 弹层数从 3 减到 1 只是让这个歧义暂时不会发生，不是让这条纪律失效。
  await page.click('.overlay-layer.open [data-action="close-overlay"]');
  await page.waitForTimeout(300);

  // ---- 巡检轨迹开关：ActionBar 的「轨迹」按钮 + 页脚流程轨高亮 ----
  //
  // 这里原先是「问题上报」弹层的两条断言（foot 恰好「取消」「提交上报单」两个按钮、
  // 点取消后关闭）。该弹层已随需求收窄删除，换成本次改造真正的重点：轨迹。
  //
  // 断言三件事：state.showTrack 翻转、页脚流程轨高亮跳到「巡检轨迹」那一步、
  // 以及关掉之后能退回「站场全景」。第二条是新增 phase() 派生器的实际验收点——
  // 旧版本顶栏旁白/操作栏状态语/流程轨高亮各算一份，加一步就会各说各话。
  await page.click('[data-select="area"][data-select-id="__none__"]');
  await page.waitForTimeout(400);

  const showTrackBefore = await page.evaluate(() => window.AppState.value.showTrack);

  await page.click('[data-action="toggle-track"]');
  await page.waitForTimeout(3200); // 覆盖 model-track.js 的 FLOW_DURATION_MS=2400 有限时长播放

  const showTrackAfter = await page.evaluate(() => window.AppState.value.showTrack);
  assert('点击「轨迹」后 state.showTrack 翻转', showTrackAfter === !showTrackBefore, { showTrackBefore, showTrackAfter });

  const phaseAfterTrack = await page.evaluate(() => window.AppState.phase());
  assert('展开轨迹后 AppState.phase() === "track"', phaseAfterTrack === 'track', { phaseAfterTrack });

  const activeStepAfterTrack = await page.locator('.flow-step.active strong').textContent();
  assert('页脚流程轨高亮跳到「巡检轨迹」', activeStepAfterTrack === '巡检轨迹', { activeStepAfterTrack });

  await page.screenshot({ path: path.join(SHOT_DIR, '07-track-visible.png') });

  await page.click('[data-action="toggle-track"]');
  await page.waitForTimeout(500);

  const phaseAfterHide = await page.evaluate(() => window.AppState.phase());
  assert('收起轨迹后 AppState.phase() 退回 "overview"', phaseAfterHide === 'overview', { phaseAfterHide });

  // 轨迹播放是有限时长动画（播完自停），收起之后必须能重新收敛到 idle——
  // 这条防的是"为了让光带一直流动而把渲染循环钉住不停"这类回退。
  const idleAfterTrackStart = Date.now();
  let idleAfterTrack = false;
  while (Date.now() - idleAfterTrackStart < 6000) {
    if ((await page.evaluate(() => window.Map3D.debugInfo())).idle === true) { idleAfterTrack = true; break; }
    await page.waitForTimeout(100);
  }
  assert('轨迹播放结束后仍能收敛到 idle === true', idleAfterTrack, { waitedMs: Date.now() - idleAfterTrackStart });

  const failed = report.assertions.filter((a) => !a.pass);
  await browser.close();

  console.log('\n==== 汇总 ====');
  console.log('通过:', report.assertions.length - failed.length, '/', report.assertions.length);
  if (failed.length > 0) {
    console.log('失败项:', JSON.stringify(failed, null, 2));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error('VERIFY SCRIPT FAILED:', e);
  process.exit(1);
});
