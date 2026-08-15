// graph-stage —— 3D / 投影层隔离契约（L1）：零依赖，必须作为 stage3d 分支下第一个
// <script> 加载——早于数据层 scripts/data/kg-data.js、kg-index.js、stage-composition.js，
// 早于 stage3d/layout-solver.js、projection-math.js、model-table.js、model-arcs.js、
// model.js、engine.js，也早于 stage/stage-cards.js、stage/stage.js 和 boot.js。
// 依赖顺序见 DESIGN.md §7。
//
// 【POC：graph-stage（知识图谱三页大屏 · 3D 环形展台）】
// 本文件对应 DESIGN.md §3 冻结表 B（DOM 命名契约）与 §4 冻结表 C（引擎公开 API）里
// 断言部分的落地实现。常量名、断言签名、报错语义只以 DESIGN.md 为准；这里发现需要
// 改动，必须先回去改 DESIGN.md，不许在这个文件里另立一套。
//
// ------------------------------------------------------------------------------
// ① 命名空间避让理由
// ------------------------------------------------------------------------------
// 仓库里同类"3D 宿主 / 热点标签"属性名已经被占用了四组，本 POC 必须全部避开：
//   data-area                        poc/prototype-v3/index.html 的 inline SVG 地图
//   data-map3d-area                  poc/inspection-3d-sandbox（以及 inspection-3d-aerial）
//   data-hunan-zone / data-hunan-site  poc/hunan-inspection-overview（以及 hunan-pump-overview）
//   data-node-id                     poc/kg_stage 草稿版的节点标注
// 同名属性一旦被 querySelectorAll 无差别收进选择结果，后来的元素会静默覆盖/污染先来
// 元素的标签集合，且不会有任何报错——因为 querySelectorAll 本身不区分"谁应该在这
// 里"，JS 每一步单独看都执行成功；症状（标签乱跳、卡片堆叠在 0,0、热点消失）和真正
// 原因（属性名撞车）之间隔着好几层间接调用，是这类项目里最难排查的一类暗坑。完整
// 推演见 poc/hunan-inspection-overview/scripts/map3d/contract.js 顶部与其
// assertPinNamespace 的注释，同一枚炸弹不在这里重复拆解。
// graph-stage 独占 data-stage-* 前缀：上面四组任何一个都不得复用，也不得把本文件
// 与它们合并成"共享契约模块"再互相引用——那会重新引入本该被隔离的耦合。
//
// ------------------------------------------------------------------------------
// ② assertTextureUntainted 为什么必须 fail-fast（不许包 try/catch），
//    以及一次被推翻的错误实现——写在这里防止后来者重蹈覆辙
// ------------------------------------------------------------------------------
// file:// 页面的 origin 是 null。任何外部图片一旦被当作纹理源上传到 GPU（不论是
// TextureLoader 直接加载文件，还是先 drawImage 进 2D canvas 再转 CanvasTexture），
// 都会被浏览器判定为"跨域污染纹理"。three r160 在 WebGLState.texSubImage2D 内部给
// 相关调用包了一层 try/catch，捕获到浏览器原生抛出的 SecurityError 后只
// console.error 一行、然后照常往下跑——结果是这块纹理渲染成纯黑，three 内部的 threw
// 标志位仍是 false，WebGL 的 gl.getError() 也不会报任何错误码，整条渲染管线看起来
// 完全正常。这是本仓库最痛恨的一类静默失效：画面是错的，但没有任何机制会告诉你哪里
// 错了。
//
// 本文件第一版 assertTextureUntainted(renderer) 曾经试图照搬"2D canvas 污染"的
// 心智模型：以为 SecurityError 发生后 WebGL 上下文会像 2D canvas 那样被持久标记为
// "已污染"，于是在渲染一帧之后对 renderer 的原生 WebGL 上下文调用
// gl.readPixels(0,0,1,1,...)，指望污染状态会让这次读回原生抛错。这个假设是错的，
// 已用 Playwright 实测证伪（一次性验证脚本未入库，结论摘录如下）：
//   - 真实污染场景（TextureLoader 加载同目录 file:// 图片、crossOrigin 未设为
//     "anonymous"）下，console 确实原样打出与本节 DESIGN.md 描述逐字吻合的
//     "THREE.WebGLState: SecurityError: Failed to execute 'texSubImage2D' ..."；
//   - 但 SecurityError 是在 texSubImage2D **上传那一刻**同步抛出的（被 three 的
//     try/catch 接住），这次上传整体被中止，从未有任何像素写进 drawing buffer——
//     WebGL 规范里没有"上下文被标记污染、之后读回才失败"这个状态机，那是 2D canvas
//     （HTMLCanvasElement.getContext('2d')）独有的模型；
//   - 于是渲染完那一帧之后再调用 gl.readPixels() 会正常返回（不抛错），
//     renderer.info.memory.textures 却已经变成 1；gl.getError() 也确实是 0，
//     与 DESIGN.md 描述完全一致。也就是说 readPixels 版本的
//     assertTextureUntainted **在任何情况下都不会红**——它测的是一个根本不存在的
//     状态机，是一条看起来存在、实际测不到自己声称在测的东西的空转断言。
//
// 正确的做法是不绕道"污染"这个中间概念，直接测 DESIGN.md §1.1 真正要守的那条
// 不变量本身——graph-stage 的 three.js 层理论上零纹理（圆台桌面/地坪/台沿/领域光弧
// 全部用纯色或顶点色材质，零 TextureLoader、零外部图 drawImage、零 CanvasTexture
// 文字）。three 的 WebGLRenderer 自带一个真实、公开、无需任何取巧手段的计数器：
// renderer.info.memory.textures。同一份实测里，只画圆台几何 + MeshStandardMaterial
// + 两盏灯、渲染两帧之后，这个值稳定为 0；一旦引入前面那张被污染的纹理，
// 无论上传成功与否，这个值立刻变成 1（three 在创建 WebGLTexture 对象时就计数，
// 与上传是否被 SecurityError 中止无关）。断言 === 0 因此同时满足两个条件：
//   1) 它直接对应我们真正想守的东西（"这一层不该存在任何纹理"）；
//   2) 它可证明会红——任何人往场景里加一张纹理（不管污染与否、也不管是否报错），
//      计数立刻非 0，这条断言必倒。
// 不要在这个函数外面包 try/catch：虽然现在的实现只是数值比较、本身不会抛浏览器
// 原生异常，但"发现不变量被打破就直接 throw、不做任何静默降级"这条纪律不变——
// 断言存在的意义是让违规立刻在构建期以一次带栈的 Error 冒出来。
//
// ------------------------------------------------------------------------------
// ③ billboard 架构推论——后来者看到这段再动手加旋转，先读完这三行
// ------------------------------------------------------------------------------
// 卡片不是 three.js 场景里的 Sprite/Mesh，是 DOM 投影层（.stage-projection）里的
// 普通 HTML 元素，活在浏览器合成出来的屏幕平面上。engine 每帧为每个锚点算出的落点
// 只写 `transform: translate3d(px, py, 0)`——没有第三个旋转分量，也不需要有。
// "卡片恒正面朝向观众"是这套架构的免费副产品：DOM 元素压根不存在"侧面"这个概念，
// 谈不上要不要转向相机、更谈不上"跟着圆周旋转"。
// 后来者不许给 [data-stage-slot] / [data-stage-arc] 元素加 rotateY / rotateX 之类
// 的姿态变换去"让卡片贴合展台朝向"——那是把 three 场景里才存在的 billboard 朝向
// 问题，错误地搬进了一个从设计上就不存在该问题的图层，多余且会和引擎每帧覆写的
// translate3d 打架（CSS transition 若再掺一脚 transform，还会拖出可见的尾迹，见
// DESIGN.md §3 CSS 侧不变量第 3 条）。
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // DOM 命名契约（DESIGN.md 冻结表 B）——六个常量，值与挂载位置都已冻结，不得改名。
  // ---------------------------------------------------------------------------
  var HOST_ATTR = "data-stage-host"; // 3D 宿主容器；stage.js 写，engine.mount() 读
  var CANVAS_CLASS = "stage-canvas"; // WebGL canvas；engine 写；CSS 靠它设 pointer-events:none
  var LAYER_CLASS = "stage-projection"; // DOM 投影层容器；stage.js 写，engine.syncProjection() 读
  var SLOT_ATTR = "data-stage-slot"; // 每张卡片，值=slotId；stage-cards.js 写；engine 写 transform，boot 事件委托读
  var ARC_ATTR = "data-stage-arc"; // 每个弧热点标签，值=facetMemberId；stage-cards.js 写；同上
  var ROLE_ATTR = "data-stage-role"; // 卡片，值 ∈ trunk|feature|center；stage-cards.js 写；CSS 分型、verify 读

  // ---------------------------------------------------------------------------
  // 小工具：只服务本文件内的断言，不导出。
  // ---------------------------------------------------------------------------

  // 找出数组内的重复元素（保序、去重后的重复值列表），用于在报错信息里指名道姓。
  function findDuplicates(ids) {
    var seen = {};
    var duplicated = [];
    ids.forEach(function (id) {
      if (seen[id] && duplicated.indexOf(id) < 0) {
        duplicated.push(id);
      }
      seen[id] = true;
    });
    return duplicated;
  }

  function requireIdArray(value, argName) {
    if (!Array.isArray(value)) {
      throw new Error(
        "[StageContract] assertSlotKeys 的 " + argName + " 必须是数组，实际为 " + typeof value
      );
    }
    return value;
  }

  // ---------------------------------------------------------------------------
  // assertDom(host) —— 宿主存在、非零尺寸、恰好一个 canvas、恰好一个投影层。
  //
  // 调用时机：engine.mount(host, ...) 内部、插入 canvas 与投影层之后立刻调用一次。
  // 防的是什么：CSS 网格在某些断点下把 3D 面板算成 0×0 时，resize/RAF 循环里常见的
  // "尺寸为 0 就直接 return"写法会让 3D 静默不渲染——没有任何报错，只是画面空着。
  // 这里在挂载的第一时间就把它炸出来，而不是留给用户"怎么屏幕上没有展台"的疑惑。
  // ---------------------------------------------------------------------------
  function assertDom(host) {
    if (!host || typeof host.querySelectorAll !== "function") {
      throw new Error(
        "[StageContract] assertDom 需要一个真实 DOM 元素作为 host，实际收到 " + typeof host
      );
    }
    if (!host.hasAttribute(HOST_ATTR)) {
      throw new Error(
        "[StageContract] host 缺少 [" + HOST_ATTR + "] 属性，实际 host=" +
        host.outerHTML.slice(0, 200)
      );
    }

    // 宿主盒非零：mount 是 append 之后同步调用的，读取包围盒会强制回流，这里刻意
    // 接受这次同步开销去换一条构建期就能红的断言。合法的 0×0 不存在。
    var rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(
        "[StageContract] 3D 宿主盒尺寸非法（width=" + rect.width + ", height=" + rect.height +
        "），host.className=" + host.className
      );
    }

    var canvases = host.querySelectorAll("canvas");
    if (canvases.length !== 1) {
      throw new Error(
        "[StageContract] 宿主内 canvas 元素应恰好 1 个，实际 " + canvases.length + " 个"
      );
    }
    if (!canvases[0].classList.contains(CANVAS_CLASS)) {
      throw new Error(
        "[StageContract] 宿主内唯一的 canvas 缺少 ." + CANVAS_CLASS + " 类名，实际 class=\"" +
        canvases[0].className + "\""
      );
    }

    var layers = host.querySelectorAll("." + LAYER_CLASS);
    if (layers.length !== 1) {
      throw new Error(
        "[StageContract] 宿主内 ." + LAYER_CLASS + " 投影层应恰好 1 个，实际 " + layers.length + " 个"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // assertPinNamespace() —— [data-stage-slot] / [data-stage-arc] 只允许出现在
  // .stage-projection 内部，落在外面即抛错。
  //
  // 调用时机：必须在每次 render/mount（也就是投影层里已经画出卡片/热点）之后调用，
  // 不能塞进 assertDom：assertDom 在插入 canvas/投影层的当口就跑，那时投影层内部
  // 大概率还没有任何 [data-stage-slot]/[data-stage-arc] 元素，检查形同虚设。
  //
  // 防的是什么：如果未来有人为了"调试方便"往 .stage-projection 外面（比如某个
  // 面板的调试浮层）临时挂一个同名属性，engine 每帧写 transform 时会一并选中它、
  // 把它拖到不属于它的坐标上——这个过程 JS 每一步都合法，不会报任何错，症状只是
  // "某个元素诡异跳动"。这条断言把选择器命中范围钉死在投影层内部。
  // ---------------------------------------------------------------------------
  function assertPinNamespace() {
    var selector = "[" + SLOT_ATTR + "], [" + ARC_ATTR + "]";
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      if (!el.closest("." + LAYER_CLASS)) {
        var html = el.outerHTML || "";
        throw new Error(
          "[StageContract] 发现 [" + SLOT_ATTR + "]/[" + ARC_ATTR + "] 元素落在 ." +
          LAYER_CLASS + " 之外：" + html.slice(0, 200) + "；" +
          SLOT_ATTR + " / " + ARC_ATTR + " 归本项目投影层独占，不得挂在其他容器上" +
          "（哪怕只是临时调试用）"
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // assertSlotKeys(domSlotIds, engineSlotIds) —— 两个集合必须完全一致。
  //
  // domSlotIds：从 document.querySelectorAll("[" + SLOT_ATTR + "]") 取出的 slotId 列表
  //             （boot.js 在 refreshProjection 之后收集）。
  // engineSlotIds：engine 内部持有的锚点 slotId 列表（来自 mount() 的 slots 入参）。
  //
  // 判定为"集合"而非"数组"：DOM 查询顺序（document order）与引擎内部数组顺序是
  // 两套完全独立的排序依据，没有理由要求二者逐位相同——这里只比较成员是否一致，
  // 不比较顺序。
  //
  // 防的是什么：DOM 投影层（stage-cards.js）与引擎（engine.js/layout-solver.js）
  // 各自独立维护"这一帧应该有哪些卡片"——如果两边的数据源在某次改动里漂移（数据层
  // 新增了一个 trunk 根节点但卡片模板没跟着建 DOM、或者反过来卡片建了但引擎没算出
  // 对应锚点），画面表现只是"某张卡片消失"或"某张卡片停在初始位置不动"，控制台
  // 不会报任何错，因为两边各自看都是合法的空/非空集合。这条断言把两处摆到同一把
  // 尺子上量，缺失与多余分别报，不合并成一句"不一致"。
  // ---------------------------------------------------------------------------
  function assertSlotKeys(domSlotIds, engineSlotIds) {
    var domIds = requireIdArray(domSlotIds, "domSlotIds");
    var engineIds = requireIdArray(engineSlotIds, "engineSlotIds");

    var domDuplicated = findDuplicates(domIds);
    if (domDuplicated.length > 0) {
      throw new Error(
        "[StageContract] domSlotIds 出现重复的 " + SLOT_ATTR + " 值：[" +
        domDuplicated.join(", ") + "]（同一个 slotId 被画了不止一张卡片）"
      );
    }
    var engineDuplicated = findDuplicates(engineIds);
    if (engineDuplicated.length > 0) {
      throw new Error(
        "[StageContract] engineSlotIds 出现重复的 slotId：[" +
        engineDuplicated.join(", ") + "]（mount() 的 slots 入参里同一个 id 出现了不止一次）"
      );
    }

    var missingInDom = engineIds.filter(function (id) { return domIds.indexOf(id) < 0; });
    var extraInDom = domIds.filter(function (id) { return engineIds.indexOf(id) < 0; });
    if (missingInDom.length > 0 || extraInDom.length > 0) {
      throw new Error(
        "[StageContract] DOM 投影层的 " + SLOT_ATTR + " 集合与引擎持有的锚点集合不一致：" +
        "DOM 缺少 [" + missingInDom.join(", ") + "]（引擎算出了锚点但投影层没画出对应卡片，" +
        "engine 每帧写 transform 时会找不到目标元素），" +
        "DOM 多出 [" + extraInDom.join(", ") + "]（画了卡片但引擎没有对应锚点，这张卡片会永远" +
        "停在初始位置、不会被引擎每帧更新）；DOM 实际=[" + domIds.join(", ") +
        "]，引擎实际=[" + engineIds.join(", ") + "]"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // assertTextureUntainted(renderer) —— 构建期确认零外部纹理。不要包 try/catch，
  // 详见文件头②的完整推演（含一次被 Playwright 实测推翻的错误实现）。
  //
  // 调用时机：mount() 内部完成首帧 renderer.render(scene, camera) 之后调用。仍然
  // 建议放在首帧渲染之后而非材质创建之后——部分纹理是惰性上传的，只有真正执行过一
  // 次绘制，three 才会把它计入 renderer.info.memory.textures。
  //
  // 实现：直接读 renderer.info.memory.textures 这个 three 自带的公开计数器，
  // 断言其恒为 0。不判断"是否被污染"，只判断"存不存在"——DESIGN.md §1.1 的立场是
  // graph-stage 的 three.js 层压根不该出现任何纹理（圆台桌面/地坪/台沿/领域光弧全部
  // 用纯色或顶点色材质），所以不变量本身就是"计数为零"，不需要绕道污染检测这个更
  // 脆弱、且已被证明测不到问题的中间概念。
  // ---------------------------------------------------------------------------
  function assertTextureUntainted(renderer) {
    if (!renderer || !renderer.info || !renderer.info.memory) {
      throw new Error(
        "[StageContract] assertTextureUntainted 需要一个 THREE.WebGLRenderer 实例，" +
        "实际收到 " + typeof renderer
      );
    }
    var textureCount = renderer.info.memory.textures;
    if (textureCount !== 0) {
      throw new Error(
        "[StageContract] renderer.info.memory.textures=" + textureCount + "，应恒为 0——" +
        "DESIGN.md §1.1 规定 three.js 这一层零 TextureLoader、零外部图 drawImage、零 " +
        "CanvasTexture 文字，圆台桌面/地坪/台沿/领域光弧只应使用纯色或顶点色材质。" +
        "非 0 说明场景里出现了纹理（不论它是否被跨域污染、是否报错），这条不变量本身" +
        "就不该被打破"
      );
    }
  }

  window.StageContract = {
    HOST_ATTR: HOST_ATTR,
    CANVAS_CLASS: CANVAS_CLASS,
    LAYER_CLASS: LAYER_CLASS,
    SLOT_ATTR: SLOT_ATTR,
    ARC_ATTR: ARC_ATTR,
    ROLE_ATTR: ROLE_ATTR,
    assertDom: assertDom,
    assertPinNamespace: assertPinNamespace,
    assertSlotKeys: assertSlotKeys,
    assertTextureUntainted: assertTextureUntainted
  };
})();
