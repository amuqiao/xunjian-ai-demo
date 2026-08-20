// 验收脚本：以 file:// 打开 index.html（不带 --allow-file-access-from-files，模拟真实
// 双击），断言 pageerror 为空 / 单例 WebGL 上下文 / [data-hunan-host] 恰好 1 个 /
// .hunan-labels 内作业区标签数与顺序 === ZONE_IDS / assertPinNamespace 通过 /
// 作业区标签两两不重叠 / 首页无管道显示开关 / 渲染预算 renderCalls<200 且
// triangles<260000 / 点击作业区后 activeZoneId 跟随且右栏联动 / 点击「返回全省」后回到 null。
//
// 运行前提：本机需要能 require('playwright') 并已下载 Chromium。
// 用法：node verify/verify_overview.js
// 用法（自定义截图目录）：SHOT_DIR=/some/scratch/dir node verify/verify_overview.js
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
  : path.join(os.tmpdir(), 'hunan-inspection-overview-verify');

// 窄字符串白名单：只放 three r160 弃用横幅与 swiftshader/GL Driver Message 提示，不做
// 宽松的 startsWith('THREE.')——污染纹理的失败正好以 "THREE.WebGLState: SecurityError"
// 开头，宽松匹配会把 file:// 下最可能发生的 bug 直接藏掉。
const CONSOLE_ALLOW_PREFIXES = [
  'Scripts "build/three.js" and "build/three.min.js" are deprecated',
  'SwiftShader'
];
const GL_DRIVER_STALL_RE = /^\[\.WebGL-[0-9a-fA-Fx]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, (High|Medium|Low)\): GPU stall due to ReadPixels/;

function classifyConsole(text) {
  if (CONSOLE_ALLOW_PREFIXES.some((p) => text.indexOf(p) === 0)) return 'allowed';
  if (GL_DRIVER_STALL_RE.test(text)) return 'allowed';
  return 'unexpected';
}

let passCount = 0;
let failCount = 0;
function assert(condition, message) {
  if (condition) {
    passCount += 1;
    console.log('[PASS] ' + message);
  } else {
    failCount += 1;
    console.log('[FAIL] ' + message);
  }
}

// 轮询等到 debugInfo().idle===true 再断言 frames 稳定，不做固定等待——固定等待在
// 本项目已经出现过 "frames 344->347" 的 flaky 失败。轮询到 idle 之后再等一小段时间
// 复核 frames 不再变化，才认为场景真正收敛。
async function waitIdle(page, timeoutMs) {
  const start = Date.now();
  let info = null;
  while (Date.now() - start < timeoutMs) {
    info = await page.evaluate(() => window.HunanMap3D.debugInfo());
    if (info.idle) break;
    await page.waitForTimeout(120);
  }
  if (!info || !info.idle) throw new Error('等待 idle 超时（' + timeoutMs + 'ms）：' + JSON.stringify(info));
  const framesAfterIdle = info.frames;
  await page.waitForTimeout(400);
  const info2 = await page.evaluate(() => window.HunanMap3D.debugInfo());
  if (!info2.idle || info2.frames !== framesAfterIdle) {
    throw new Error('idle 之后 frames 仍在变化（' + framesAfterIdle + ' -> ' + info2.frames + '），场景未真正收敛');
  }
  return info2;
}

function rectsOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const pageErrors = [];
  const unexpectedConsole = [];
  page.on('pageerror', (err) => pageErrors.push(err.message + '\n' + err.stack));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (classifyConsole(text) === 'unexpected') unexpectedConsole.push(text);
  });

  await page.goto(INDEX, { waitUntil: 'load' });
  await waitIdle(page, 15000);

  assert(pageErrors.length === 0, 'pageerror 为空（实际 ' + pageErrors.length + ' 条）' + (pageErrors.length ? '：\n' + pageErrors.join('\n---\n') : ''));
  assert(unexpectedConsole.length === 0, 'console.error 白名单外为空（实际 ' + unexpectedConsole.length + ' 条）' + (unexpectedConsole.length ? '：\n' + unexpectedConsole.join('\n---\n') : ''));

  const info0 = await page.evaluate(() => window.HunanMap3D.debugInfo());
  assert(info0.contextCreated === 1, 'HunanMap3D.debugInfo().contextCreated === 1（实际 ' + info0.contextCreated + '）');

  const hostCount = await page.evaluate(() => document.querySelectorAll('[data-hunan-host]').length);
  assert(hostCount === 1, '[data-hunan-host] 恰好 1 个（实际 ' + hostCount + '）');
  const flowNavCount = await page.evaluate(() => document.querySelectorAll('.inspection-flow-nav').length);
  assert(flowNavCount === 0, '首页不渲染外部流程导航浮层（实际 ' + flowNavCount + ' 个）');
  const removedCardsCheck = await page.evaluate(() => {
    var text = document.body.textContent;
    return {
      qualityCardCount: document.querySelectorAll('.ov-quality-card').length,
      hasQualityException: text.indexOf('质量异常构成') >= 0,
      hasSiteKindChart: text.indexOf('站点台账 · 站场/阀室构成') >= 0,
      siteKindSlotCount: document.querySelectorAll('[data-chart-slot="chart-site-kind-mix"], #chart-site-kind-mix').length,
      qualityExceptionSlotCount: document.querySelectorAll('[data-chart-slot="chart-quality-exception"], #chart-quality-exception').length
    };
  });
  assert(removedCardsCheck.qualityCardCount === 1, '首页只保留左侧 1 个巡检质量指标卡（实际 ' + removedCardsCheck.qualityCardCount + ' 个）');
  assert(!removedCardsCheck.hasQualityException, '首页不渲染「质量异常构成」图表标题');
  assert(!removedCardsCheck.hasSiteKindChart, '首页不渲染「站点台账 · 站场/阀室构成」图表标题');
  assert(removedCardsCheck.siteKindSlotCount === 0, '首页不创建 chart-site-kind-mix 图表槽位（实际 ' + removedCardsCheck.siteKindSlotCount + ' 个）');
  assert(removedCardsCheck.qualityExceptionSlotCount === 0, '首页不创建 chart-quality-exception 图表槽位（实际 ' + removedCardsCheck.qualityExceptionSlotCount + ' 个）');

  const zoneOrderCheck = await page.evaluate(() => {
    var ids = Array.prototype.map.call(
      document.querySelectorAll('.hunan-labels [data-hunan-zone]'),
      function (el) { return el.getAttribute('data-hunan-zone'); }
    );
    return { ids: ids, expected: window.HunanContract.ZONE_IDS };
  });
  assert(
    zoneOrderCheck.ids.length === zoneOrderCheck.expected.length,
    '.hunan-labels 内 [data-hunan-zone] 恰好 ' + zoneOrderCheck.expected.length + ' 个（实际 ' + zoneOrderCheck.ids.length + '）'
  );
  assert(
    JSON.stringify(zoneOrderCheck.ids) === JSON.stringify(zoneOrderCheck.expected),
    '.hunan-labels 内标签顺序 === ZONE_IDS（实际 [' + zoneOrderCheck.ids.join(',') + ']，期望 [' + zoneOrderCheck.expected.join(',') + ']）'
  );

  const pinNamespaceOk = await page.evaluate(() => {
    try { window.HunanContract.assertPinNamespace(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  assert(pinNamespaceOk.ok, 'assertPinNamespace() 通过' + (pinNamespaceOk.ok ? '' : '：' + pinNamespaceOk.error));

  const rects = await page.evaluate(() => {
    return Array.prototype.map.call(document.querySelectorAll('.hunan-labels [data-hunan-zone]'), function (el) {
      var r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-hunan-zone'), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
  });
  let overlapPairs = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i], rects[j])) overlapPairs.push(rects[i].id + ' × ' + rects[j].id);
    }
  }
  assert(overlapPairs.length === 0, zoneOrderCheck.expected.length + ' 个作业区标签两两不重叠（实际重叠对：' + overlapPairs.join(', ') + ')');

  const pipelineToggleCount = await page.evaluate(() => document.querySelectorAll('[data-action="toggle-pipelines"]').length);
  assert(pipelineToggleCount === 0, '首页 3D 地图不渲染管道显示开关（实际 ' + pipelineToggleCount + ' 个）');
  assert(info0.pipelineVisible === false, '首页 3D 管道组不可见（实际 ' + info0.pipelineVisible + '）');
  assert(info0.pipelineChildren === 0, '首页 3D 管道组为空（实际 ' + info0.pipelineChildren + ' 个子对象）');
  assert(info0.zonePins === 0, '省域态不渲染 3D 作业区热点，只保留名称和数量标签（实际 ' + info0.zonePins + ' 个）');
  assert(info0.sitePins === 0, '省域态不渲染 3D 站点热点（实际 ' + info0.sitePins + ' 个）');

  assert(info0.renderCalls < 200, '省域态 renderCalls < 200（实际 ' + info0.renderCalls + '）');
  assert(info0.triangles < 260000, '省域态 triangles < 260000（实际 ' + info0.triangles + '）');

  await page.screenshot({ path: path.join(SHOT_DIR, '01-province.png') });

  // 找到站点数最多的作业区（最坏路径），点它下钻，断言渲染预算/联动/截图。
  const worstZone = await page.evaluate(() => {
    var pins = Array.prototype.slice.call(document.querySelectorAll('.hunan-labels [data-hunan-zone]'));
    var best = null;
    var bestCount = -1;
    pins.forEach(function (el) {
      var countText = el.querySelector('.zone-pin-count').textContent;
      var count = parseInt(countText, 10);
      if (count > bestCount) { bestCount = count; best = el.getAttribute('data-hunan-zone'); }
    });
    return best;
  });

  await page.evaluate((zoneId) => {
    document.querySelector('.hunan-labels [data-hunan-zone="' + zoneId + '"]').click();
  }, worstZone);
  const infoZone = await waitIdle(page, 15000);

  assert(infoZone.activeZoneId === worstZone, '点击作业区 ' + worstZone + ' 后 activeZoneId 跟随（实际 ' + infoZone.activeZoneId + '）');
  assert(infoZone.zonePins === 0, '下钻态不渲染 3D 作业区热点（实际 ' + infoZone.zonePins + ' 个）');
  assert(infoZone.sitePins === 0, '下钻态不渲染 3D 站点热点，只保留清单与区域态势（实际 ' + infoZone.sitePins + ' 个）');
  assert(infoZone.renderCalls < 200, '下钻态（' + worstZone + '，最坏路径）renderCalls < 200（实际 ' + infoZone.renderCalls + '）');
  assert(infoZone.triangles < 260000, '下钻态 triangles < 260000（实际 ' + infoZone.triangles + '）');

  const rightPanelChanged = await page.evaluate(() => document.querySelector('.ov-site-list-card') != null);
  assert(rightPanelChanged, '下钻后右栏出现站点清单（.ov-site-list-card）');

  await page.screenshot({ path: path.join(SHOT_DIR, '02-zone-drilldown.png') });

  await page.evaluate(() => {
    document.querySelector('[data-action="back-to-overview"]').click();
  });
  const infoBack = await waitIdle(page, 15000);
  assert(infoBack.activeZoneId === null, '点击「返回全省」后 activeZoneId 回到 null（实际 ' + infoBack.activeZoneId + '）');

  console.log('\n渲染预算实测：省域态 renderCalls=' + info0.renderCalls + ' triangles=' + info0.triangles);
  console.log('渲染预算实测：下钻态（' + worstZone + '，站点数最多的作业区）renderCalls=' + infoZone.renderCalls + ' triangles=' + infoZone.triangles);
  console.log('截图目录：' + SHOT_DIR);

  await browser.close();

  console.log('\n===== 汇总：' + passCount + ' passed, ' + failCount + ' failed =====');
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('验收脚本执行异常：', err);
  process.exit(1);
});
