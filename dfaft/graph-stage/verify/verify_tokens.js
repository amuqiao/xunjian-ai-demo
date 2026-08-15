// 三层 token 契约执法脚本。纯 Node，不起浏览器：静态扫描 styles/*.css 与全仓源码
// 文本，不 require、不用 window，因为要检查的是"字面文本里出现了什么"，不是
// "运行时算出了什么"。
//
// 用法：node poc/graph-stage/verify/verify_tokens.js
//
// 对应 DESIGN.md 第 5 章「三层 token 契约」的四条执法规则：
//   1. 01-theme.css 之外的 styles/*.css 不许出现色值字面量
//      （#hex / rgb() / hsl() / oklch()）
//   2. 02-semantic.css 里 var() 的实参必须全部匹配 --c-*
//   3. 04..08（骨架层，编号 ≥4 的样式文件）里 var() 的实参不得匹配 --c-*
//   4. 全仓扫 filter:*blur() / text-shadow / box-shadow: 0 0（零偏移发光）
//      / UnrealBloom / EffectComposer，命中即 FAIL
//
// ---- 这个脚本的一半篇幅是"构造反例" ----
// 只断言"当前三份文件是干净的"不够——一个永远返回 true 的空扫描器也能让那种
// 断言全绿。所以每条规则都配一段用内存字符串现造的反例，正面证明检测器真的会
// 在坏数据上翻脸；rule 4 的 box-shadow 反例还额外配了一条"不误伤"的对照，因为
// DESIGN.md 明确允许"统一光源方向的软阴影"，规则不能把这类合法阴影也扫成 FAIL。
//
// 规则 3 目前没有编号 ≥4 的真实文件可查（04..08 尚未落地），脚本对真实文件扫描
// 这一段记 SKIP（不计入 PASS/FAIL 汇总，也不影响退出码），只保留合成反例继续
// 验证检测逻辑本身没写错。等后续任务把 04..08 加进 styles/ 目录，下面这段动态
// 发现文件名的逻辑会自动把它们纳入扫描，不需要回来改这个脚本。
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var STYLES_DIR = path.join(ROOT, "styles");

var passCount = 0;
var skipCount = 0;
var failures = [];

function check(label, condition) {
  if (condition) {
    passCount += 1;
    console.log("PASS " + label);
  } else {
    failures.push(label);
    console.log("FAIL " + label);
  }
}

function skip(label) {
  skipCount += 1;
  console.log("SKIP " + label);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// 本仓库的注释里习惯用中文大段解释"这条规则在禁什么"（本文件自己的头部注释
// 就是这么写的），这意味着源码文本里合法地出现 "rgb()" "filter: blur()"
// "UnrealBloom" 这些词——但只是在讨论它们，不是在使用它们。静态扫描不剥掉
// 注释就会把"讨论禁令"误判成"违反禁令"，在真实代码库里制造大片假阳性
// （亲测：写完初版规则 1/2/4 就在自己刚写的三份 token 文件与并行任务产出的
// scripts/stage3d/projection-math.js 上假阳性了一次）。所以一切"扫文本找
// 违禁模式"的检查都必须先剥注释，只在真代码上判定。
function stripComments(content, ext) {
  var out = content.replace(/\/\*[\s\S]*?\*\//g, "");
  if (ext === ".js") {
    out = out.replace(/^[ \t]*\/\/.*$/gm, "");
  }
  if (ext === ".html") {
    out = out.replace(/<!--[\s\S]*?-->/g, "");
  }
  return out;
}

// ---------------------------------------------------------------- 通用工具

// 递归收集目录下指定扩展名的文件，跳过 excludeDirs 命中的目录名（任意深度）。
function walk(dir, exts, excludeDirs) {
  var out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (name) {
    var full = path.join(dir, name);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (excludeDirs.indexOf(name) >= 0) return;
      out = out.concat(walk(full, exts, excludeDirs));
      return;
    }
    if (exts.indexOf(path.extname(name)) >= 0) out.push(full);
  });
  return out;
}

function styleFiles() {
  if (!fs.existsSync(STYLES_DIR)) return [];
  return fs.readdirSync(STYLES_DIR)
    .filter(function (name) { return /\.css$/.test(name); })
    .sort();
}

// "NN-name.css" 里的编号，用来区分 01(主题)/02(语义)/03(几何)/04+(骨架)。
function prefixNumber(filename) {
  var m = /^(\d+)-/.exec(filename);
  if (!m) throw new Error("样式文件名不符合 NN-name.css 约定：" + filename);
  return parseInt(m[1], 10);
}

// 提取一段 CSS 文本里所有 var(...) 调用的第一个实参（忽略 fallback 值）。
function extractVarArgs(content) {
  var out = [];
  var re = /var\(\s*(--[a-zA-Z0-9-]+)/g;
  var m = re.exec(content);
  while (m) {
    out.push(m[1]);
    m = re.exec(content);
  }
  return out;
}

var CSS_C_VAR_RE = /^--c-/;

// ================================================================ 规则 1
// 01-theme.css 之外的 styles/*.css 不许出现色值字面量。

console.log("== 规则 1：色值字面量只准出现在 01-theme.css ==");

var COLOR_PATTERNS = [
  { name: "hex 色值（#abc / #aabbcc / #aabbccdd）", re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: "rgb()", re: /rgb\(/i },
  { name: "hsl()", re: /hsl\(/i },
  { name: "oklch()", re: /oklch\(/i }
];

var THEME_FILE = "01-theme.css";
var allStyleFiles = styleFiles();

check("styles/" + THEME_FILE + " 存在", allStyleFiles.indexOf(THEME_FILE) >= 0);

var nonThemeFiles = allStyleFiles.filter(function (name) { return name !== THEME_FILE; });
check("styles/ 下除 " + THEME_FILE + " 外还存在其它样式文件（否则规则 1 无对象可查，"
  + "断言会假装通过）", nonThemeFiles.length > 0);

nonThemeFiles.forEach(function (name) {
  var content = stripComments(readFile(path.join(STYLES_DIR, name)), ".css");
  COLOR_PATTERNS.forEach(function (pattern) {
    check(name + " 不含" + pattern.name, !pattern.re.test(content));
  });
});

// ---- 反例：证明上面四个正则真的会命中，而不是恒为 false ----
var COLOR_FIXTURES = [
  { name: "hex 色值（#abc / #aabbcc / #aabbccdd）", sample: "color: #fff;" },
  { name: "rgb()", sample: "color: rgb(78, 168, 255);" },
  { name: "hsl()", sample: "color: hsl(210, 100%, 65%);" },
  { name: "oklch()", sample: "color: oklch(0.7 0.1 250);" }
];
COLOR_FIXTURES.forEach(function (fixture) {
  var pattern = COLOR_PATTERNS.filter(function (p) { return p.name === fixture.name; })[0];
  check("反例：\"" + fixture.sample + "\" 会被 " + fixture.name + " 规则逮到", pattern.re.test(fixture.sample));
});

// ================================================================ 规则 2
// 02-semantic.css 里 var() 的实参必须全部匹配 --c-*。

console.log("");
console.log("== 规则 2：02-semantic.css 只准 var(--c-*) ==");

var SEMANTIC_FILE = "02-semantic.css";
var semanticPath = path.join(STYLES_DIR, SEMANTIC_FILE);
check("styles/" + SEMANTIC_FILE + " 存在", fs.existsSync(semanticPath));

var semanticContent = stripComments(readFile(semanticPath), ".css");
var semanticVarArgs = extractVarArgs(semanticContent);

check(SEMANTIC_FILE + " 至少包含 15 处 var() 引用（覆盖 surface/text/border/"
  + "accent/level/facet 全部语义槽位，防止用一份近乎空的文件混过检查，实际 "
  + semanticVarArgs.length + " 处）", semanticVarArgs.length >= 15);

check(SEMANTIC_FILE + " 里所有 var() 实参都以 --c- 开头",
  semanticVarArgs.length > 0 && semanticVarArgs.every(function (arg) { return CSS_C_VAR_RE.test(arg); }));

// ---- 反例：语义层若误写成引用非 --c-* 变量（比如漏写 c- 前缀），规则 2 要能抓到 ----
var poisonedSemantic = ":root { --text-title: var(--ink-100); }";
check("反例：\"" + poisonedSemantic + "\" 里的 var(--ink-100) 不是 --c-* 开头，"
  + "规则 2 能识别出违规", extractVarArgs(poisonedSemantic).some(function (arg) { return !CSS_C_VAR_RE.test(arg); }));

// ================================================================ 规则 3
// 04..08（骨架层，编号 ≥4）里 var() 的实参不得匹配 --c-*。

console.log("");
console.log("== 规则 3：04..08 骨架层不许 var(--c-*) 穿透语义层 ==");

var skeletonFiles = allStyleFiles.filter(function (name) { return prefixNumber(name) >= 4; });

if (skeletonFiles.length === 0) {
  skip("styles/ 下暂无编号 ≥04 的骨架样式文件，规则 3 的真实文件扫描本轮跳过——"
    + "后续任务新增 04+ 样式文件后，会被下面同一段 skeletonFiles 逻辑自动纳入"
    + "检查，不需要回来改本脚本");
} else {
  skeletonFiles.forEach(function (name) {
    var args = extractVarArgs(stripComments(readFile(path.join(STYLES_DIR, name)), ".css"));
    check(name + " 里所有 var() 实参都不是 --c-*（骨架不许穿透语义层直连主题层）",
      args.every(function (arg) { return !CSS_C_VAR_RE.test(arg); }));
  });
}

// ---- 反例：骨架层若直连主题层变量 / 老实只用语义层变量，两种情况规则 3 都要判对 ----
var poisonedSkeleton = ".card { color: var(--c-accent); }";
check("反例：骨架样式若直连 var(--c-accent) 这类主题层变量，规则 3 能抓到",
  extractVarArgs(poisonedSkeleton).some(function (arg) { return CSS_C_VAR_RE.test(arg); }));

var cleanSkeleton = ".card { color: var(--accent-text); background: var(--surface-card); }";
check("反例对照：骨架样式老实只引用语义层变量（如 var(--accent-text)）时，"
  + "规则 3 不会误伤", extractVarArgs(cleanSkeleton).every(function (arg) { return !CSS_C_VAR_RE.test(arg); }));

// ================================================================ 规则 4
// 全仓扫描禁用的"发光"类效果。

console.log("");
console.log("== 规则 4：禁发光（filter blur / text-shadow / 零偏移 box-shadow / "
  + "UnrealBloom / EffectComposer） ==");

var FILTER_BLUR_RE = /filter\s*:[^;]*blur\(/i;
var TEXT_SHADOW_RE = /text-shadow\s*:/i;
var BOX_SHADOW_ZERO_RE = /box-shadow\s*:\s*0\s+0\b/i;
var UNREAL_BLOOM_RE = /UnrealBloom/;
var EFFECT_COMPOSER_RE = /EffectComposer/;

var GLOW_PATTERNS = [
  { name: "filter:*blur()", re: FILTER_BLUR_RE },
  { name: "text-shadow", re: TEXT_SHADOW_RE },
  { name: "box-shadow: 0 0（零偏移发光）", re: BOX_SHADOW_ZERO_RE },
  { name: "UnrealBloom", re: UNREAL_BLOOM_RE },
  { name: "EffectComposer", re: EFFECT_COMPOSER_RE }
];

// 扫描整个 POC 目录的源码文件；排除 verify/（否则会命中本脚本里作为字符串出现的
// "UnrealBloom" / "EffectComposer" 等检测目标本身，制造假阳性）与 vendor/ 等
// 第三方目录。只看 .css/.js/.html，不看 .md —— DESIGN.md 本身就在正文里讨论
// 这些被禁模式，若把文档也扫进去会把"讨论禁令"误判成"违反禁令"。
var SCAN_EXTS = [".css", ".js", ".html"];
var SCAN_EXCLUDE_DIRS = ["verify", "vendor", "node_modules", ".git"];
var scanFiles = walk(ROOT, SCAN_EXTS, SCAN_EXCLUDE_DIRS);

var violations = [];
scanFiles.forEach(function (file) {
  var content = stripComments(readFile(file), path.extname(file));
  GLOW_PATTERNS.forEach(function (pattern) {
    if (pattern.re.test(content)) {
      violations.push(path.relative(ROOT, file) + " 命中 " + pattern.name);
    }
  });
});

check("全仓（排除 verify/、vendor/，扫描 .css/.js/.html，共 " + scanFiles.length
  + " 个文件）未出现禁用的发光效果模式" + (violations.length ? "；命中：" + violations.join("; ") : ""),
  scanFiles.length > 0 && violations.length === 0);

// ---- 反例：三组合成样本，证明检测器真的会翻脸，且 box-shadow 规则不误伤合法软阴影 ----
check("反例：\"filter: brightness(0.8) blur(6px);\" 会被 filter:*blur() 规则逮到"
  + "（DESIGN.md 1.3：远虚要用明度不用模糊）",
  FILTER_BLUR_RE.test("filter: brightness(0.8) blur(6px);"));

check("反例：零偏移的 \"box-shadow: 0 0 24px rgba(0,0,0,.4);\"（发光写法）会被规则逮到，"
  + "同时有真实位移的 \"box-shadow: 6px 10px 18px rgba(0,0,0,.4);\"（合法软阴影）不会被误伤",
  BOX_SHADOW_ZERO_RE.test("box-shadow: 0 0 24px rgba(0,0,0,.4);")
  && !BOX_SHADOW_ZERO_RE.test("box-shadow: 6px 10px 18px rgba(0,0,0,.4);"));

check("反例：\"new THREE.UnrealBloomPass()\" 与 \"new THREE.EffectComposer(renderer)\" "
  + "都会被对应规则逮到",
  UNREAL_BLOOM_RE.test("var pass = new THREE.UnrealBloomPass();")
  && EFFECT_COMPOSER_RE.test("var composer = new THREE.EffectComposer(renderer);"));

// ---------------------------------------------------------------- 汇总

console.log("");
if (failures.length) {
  console.log("FAILED（" + failures.length + " 项，另有 " + skipCount + " 项 SKIP）：");
  failures.forEach(function (label) { console.log("  - " + label); });
  process.exit(1);
}
console.log("ALL CHECKS PASSED（" + passCount + " 项断言，另有 " + skipCount + " 项 SKIP）");
