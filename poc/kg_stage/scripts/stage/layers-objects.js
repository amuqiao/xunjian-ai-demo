/*
 * layers-objects.js —— 展台 L4~L7：主圆桌 / 十张任务立牌 / 中心主装置 / 顶部小椭圆台
 * 子任务 1-D 独占文件。经典脚本 IIFE，挂到 window.KG.layersObjects.build(root)。
 *
 * root = index.html 里的 .layer-objects（挂载点，由 0-A 冻结，禁止改 DOM 结构本身，
 * 只在其内部 appendChild）。
 *
 * 世界坐标约定（与 1-C 的 stage-scene.css 共享）：
 *   局部 X = 左右（右正），局部 Y = 进深（+Y 靠近相机），局部 Z = 离地高度。
 *
 * Fix-4 之前，下列世界高度/半径数值曾在这里抄成一份独立 JS 常量（580/470/
 * 250/107/120/560），与 layers-ground.js 一直老实用 getComputedStyle 读
 * tokens.css 的做法完全相反——是 --r-table/--r-stand/--r-topdisc/
 * --h-table-bottom/--h-table/--h-stand-foot 这些 token 改了却不生效的根因
 * 之一（另一半根因是本文件曾把算出来的值以内联 vars:{'--z':...} 写到元素上，
 * 内联样式优先级高于 CSS，同样会盖掉 tokens.css 里的 var()/calc()）。
 * Fix-4 统一收敛：JS 侧确实需要数值参与坐标运算（如立牌按角度算 --x/--y、
 * 中心装置三层光块按世界高度分层）时，一律通过下面的 cssNum() 从
 * getComputedStyle 读取，不再另起 JS 常量；不需要参与运算、只是简单转发给
 * CSS 的位置量（如桌面/顶台侧壁分段的半径，16/8 段全部相同），改为让 CSS 的
 * var(--r, var(--r-table)) 之类的默认值兜底，JS 干脆不再传这个变量。
 */
(function () {
  'use strict';

  window.KG = window.KG || {};

  var h = function (tag, props, children) {
    return window.KG.dom.h(tag, props, children);
  };

  /** 读取 :root 上的 CSS 自定义属性数值。与 layers-ground.js 的同名工具函数
   *  用法一致；经典脚本 IIFE 之间没有共享模块机制，这里保留一份同样实现，
   *  但两个文件必须遵守同一条规则：JS 需要几何数值时一律读 CSS，不允许
   *  另起一份硬编码常量。 */
  function cssNum(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return parseFloat(v) || 0;
  }

  var TAU = Math.PI / 180;

  /* ============================================================
   * L4 主圆桌
   * ========================================================== */
  function buildTable(root) {
    root.appendChild(h('div', { class: 'table-top' }));
    root.appendChild(h('div', { class: 'table-rim' }));

    root.appendChild(
      h('div', { class: 'table-runner' }, [
        h('div', { class: 'table-runner-ring' })
      ])
    );

    root.appendChild(h('div', { class: 'table-inner' }));

    // 桌面厚度：16 段侧壁，宽 232px ≈ 2π*--r-table/16 + 1px 重叠。半径统一
    // 等于 --r-table，交给 stage-objects.css 里 .table-wall i 的
    // var(--r, var(--r-table)) 默认值兜底，这里只需要给每段不同的角度 --a；
    // --z 同理交给 CSS 的 .table-wall{--z:calc(...)} 计算，不再内联覆盖。
    var wallSegs = [];
    for (var i = 0; i < 16; i++) {
      wallSegs.push(h('i', { vars: { '--a': (i * 22.5) + 'deg' } }));
    }
    root.appendChild(h('div', { class: 'table-wall' }, wallSegs));
  }

  /* ============================================================
   * L5 十张任务立牌
   *
   * 角度分布：后半弧 200°→340°，中间空出 250°→290° 让位给中心装置，左右各 5 张。
   * 左侧（200°→250°）5 个角度中心：205/215/225/235/245
   * 右侧（290°→340°）5 个角度中心：295/305/315/325/335
   * 坐标：x = R*cos(theta)，y = R*sin(theta)（theta=270° 时 x=0,y=-R，
   * 正对准中心装置正后方，恰好落在预留缺口的中点，两侧对称展开）。
   * 偏航：--yaw = clamp(-22deg, x/26*-1deg, 22deg)，左侧（x<0）为正、右侧为负，
   * 使十张立牌呈现"环抱"中心装置的朝向。
   * ========================================================== */
  function standAngles() {
    var left = [205, 215, 225, 235, 245];
    var right = [295, 305, 315, 325, 335];
    return left.concat(right); // 与 T01..T10 一一对应
  }

  function computeStandPos(theta, rStand) {
    var x = Math.round(rStand * Math.cos(theta * TAU) * 100) / 100;
    var y = Math.round(rStand * Math.sin(theta * TAU) * 100) / 100;
    var yaw = Math.max(-22, Math.min(22, (x / 26) * -1));
    return { x: x, y: y, yaw: Math.round(yaw * 100) / 100 };
  }

  function taskNodesInOrder() {
    var order = window.KG.data.meta.tasks; // ['T01', ..., 'T10']
    var byId = {};
    window.KG.data.nodes.forEach(function (n) {
      if (n.type === 'task') byId[n.id] = n;
    });
    return order.map(function (id) { return byId[id]; });
  }

  function buildStandFace(text, isMirror) {
    return h(
      'div',
      { class: isMirror ? 'stand-mirror' : 'stand-face', 'aria-hidden': isMirror ? 'true' : undefined },
      [h('span', { text: text })]
    );
  }

  function buildStands(root) {
    var tasks = taskNodesInOrder();
    var angles = standAngles();
    var rStand = cssNum('--r-stand');

    tasks.forEach(function (task, idx) {
      var theta = angles[idx];
      var pos = computeStandPos(theta, rStand);
      var label = task.short || task.name;

      // Fix-4：收敛复用 stage-scene.css 的 .o.billboard（追加 'o billboard'
      // 类），--z 交给 stage-objects.css 的 .stand{--z:var(--h-stand-foot)}
      // 决定，这里不再内联覆盖——之前这里写 '--z': H_STAND 会用内联样式盖掉
      // CSS 声明，即使 CSS 侧改成 var() 也不会生效。JS 只负责逐张立牌不同的
      // --x/--y/--yaw。
      var stand = h(
        'div',
        {
          class: 'o billboard stand',
          dataset: { nodeId: task.id },
          role: 'button',
          tabindex: '0',
          'aria-label': task.name,
          vars: { '--x': pos.x, '--y': pos.y, '--yaw': pos.yaw + 'deg' }
        },
        [
          h('div', { class: 'stand-body' }, [
            buildStandFace(label, false),
            h('div', { class: 'stand-edge' }),
            buildStandFace(label, true)
          ])
        ]
      );

      // dataset.footFor 此前没有任何代码读取（联动走的是下面的闭包
      // syncFoot，不依赖 DOM 属性），属于死代码，删除。
      var foot = h('div', {
        class: 'stand-foot',
        vars: { '--x': pos.x, '--y': pos.y }
      });

      var syncFoot = function (active) {
        if (active) foot.classList.add('is-active');
        else foot.classList.remove('is-active');
      };
      stand.addEventListener('mouseenter', function () { syncFoot(true); });
      stand.addEventListener('mouseleave', function () { syncFoot(false); });
      stand.addEventListener('focus', function () { syncFoot(true); });
      stand.addEventListener('blur', function () { syncFoot(false); });

      root.appendChild(stand);
      root.appendChild(foot);
    });
  }

  /* ============================================================
   * L6 中心主装置「十大重点任务」
   * ========================================================== */

  // 三层堆叠光块：从下到上依次变窄变薄，z1 对应 tokens.css 的 --h-slab-1/2/3。
  // Fix-4：此前这里直接写字面量 120/146/172，与 layers-ground.js 一直老实用
  // cssNum() 读 token 的做法相反，token 改了这里完全不知道——收敛为函数，
  // 在 buildCore() 里用 cssNum() 读三个真值后再构造，宽/深（w/d）目前没有
  // 对应的 tokens.css 变量，仍是字面量。
  function buildSlabsConfig() {
    var h1 = cssNum('--h-slab-1');
    var h2 = cssNum('--h-slab-2');
    var h3 = cssNum('--h-slab-3');
    return [
      { z0: 0, z1: h1, w: 300, d: 190 },   // 底部高台
      { z0: h1, z1: h2, w: 260, d: 160 },  // 中间薄板
      { z0: h2, z1: h3, w: 210, d: 126 }   // 顶部薄板
    ];
  }

  function buildSlab(def) {
    var faceH = def.z1 - def.z0;
    var faceZ = (def.z0 + def.z1) / 2;
    var group = document.createDocumentFragment();

    // 顶面
    group.appendChild(
      h('div', {
        class: 'slab-top',
        vars: { '--z': def.z1 },
        style: { width: def.w + 'px', height: def.d + 'px' }
      })
    );

    // 前墙（面向相机，带金色 LED 点）。Fix-4：收敛复用 .o.billboard
    // （追加 'o billboard' 类），--anchor 不设置即走默认 -50%，与旧写法
    // 末尾 translate(-50%,-50%) 等价。
    group.appendChild(
      h('div', {
        class: 'o billboard slab-face',
        vars: { '--y': def.d / 2, '--z': faceZ },
        style: { width: def.w + 'px', height: faceH + 'px' }
      })
    );

    // 左 / 右 / 背三面侧墙，容器统一抬升到该层中线高度。
    // left/top 取 -宽/2、-高/2，让 box 几何中心先落在锚点上，
    // 与 transform-origin（默认 50% 50%）的偏移相互抵消——
    // 避免复用 table-wall 早期版本里发现的"近相机侧大片撕裂"畸变。
    var wallChildren = [
      h('i', {
        vars: { '--a': '90deg', '--r': def.w / 2 },
        style: { width: def.d + 'px', height: faceH + 'px', left: (-def.d / 2) + 'px', top: (-faceH / 2) + 'px' }
      }),
      h('i', {
        vars: { '--a': '270deg', '--r': def.w / 2 },
        style: { width: def.d + 'px', height: faceH + 'px', left: (-def.d / 2) + 'px', top: (-faceH / 2) + 'px' }
      }),
      h('i', {
        vars: { '--a': '180deg', '--r': def.d / 2 },
        style: { width: def.w + 'px', height: faceH + 'px', left: (-def.w / 2) + 'px', top: (-faceH / 2) + 'px' }
      })
    ];
    group.appendChild(h('div', { class: 'slab-walls', vars: { '--z': faceZ } }, wallChildren));

    return group;
  }

  // 两条倾斜轨道环，环上各挂小方块
  function buildOrbit(modifier, dotAngles) {
    var dots = dotAngles.map(function (a) {
      return h('div', { class: 'orbit-dot', vars: { '--a': a + 'deg' } });
    });
    return h('div', { class: 'core-orbit' + (modifier ? ' ' + modifier : '') }, dots);
  }

  // 12 个上升粒子，散布在核心区域附近（left/top 静态散点 + translateZ 上升动画）
  var PARTICLE_SCATTER = [
    [-60, -10], [40, -30], [-20, 30], [70, 10], [-80, 20], [10, -50],
    [50, 40], [-40, -40], [0, 60], [80, -20], [-70, -30], [30, 20]
  ];

  function buildParticles() {
    var items = PARTICLE_SCATTER.map(function (pt, i) {
      return h('i', { vars: { '--px': pt[0], '--py': pt[1], '--i': i } });
    });
    return h('div', { class: 'core-particles' }, items);
  }

  // 14 条青绿细光线，rotateY 扇形展开
  function buildRays() {
    var items = [];
    for (var i = 0; i < 14; i++) {
      items.push(h('i', { vars: { '--i': i } }));
    }
    return h('div', { class: 'core-rays' }, items);
  }

  function buildCore(root) {
    var hub = window.KG.data.nodes.filter(function (n) { return n.id === 'hub-task'; })[0];
    var title = hub ? hub.name : '十大重点任务';
    // 两行排版：与参考图一致（如"十大" / "重点任务"），按数据字符串动态切分，不硬编码文案
    var line1 = title.slice(0, 2);
    var line2 = title.slice(2);

    var children = [];

    buildSlabsConfig().forEach(function (def) { children.push(buildSlab(def)); });

    children.push(buildOrbit('', [0, 200]));
    children.push(buildOrbit('core-orbit--b', [90]));

    // Fix-4：core-sphere / core-column 收敛复用 .o.billboard，--anchor 分别
    // 走默认 -50%（core-sphere，与旧写法 translate(-50%,-50%) 等价）与
    // 显式 -100%（core-column，在 stage-objects.css 里声明，与旧写法
    // translate(-50%,-100%) 等价）。
    children.push(
      h('div', { class: 'o billboard core-sphere' }, [
        h('b', {}, [line1, h('br'), line2])
      ])
    );

    children.push(buildParticles());
    children.push(h('div', { class: 'o billboard core-column' }));
    children.push(buildRays());

    var group = h(
      'div',
      {
        class: 'core-group',
        dataset: { nodeId: 'hub-task' },
        role: 'button',
        tabindex: '0',
        'aria-label': title
      },
      children
    );

    root.appendChild(group);
  }

  /* ============================================================
   * L7 顶部小椭圆台
   *
   * 修复记录（1-D 收尾 fixA，2-C/Fix-4 标定 --x:±150/--y:-160，见 git 历史）。
   *
   * 3-B 重新标定：--persp/--tilt/--persp-origin-y 三个参数改动（tokens.css）
   * 叠加 --h-badge 从 110 大幅调高到 225（顶台整组从"塞在桌面高度"恢复成
   * "独立更高的小椭圆台"，见 tokens.css 对应 token 注释），让徽章在新透视下
   * 的屏幕投影明显变大、往画面上方偏移，与 L2 领域球 D1「决策与管理」/D7
   * 「低碳与新能源」、L5 立牌 T05/T06（十张立牌里离中心装置缺口最近的两张）
   * 的屏幕投影撞在一起——用 Playwright elementFromPoint 逐一验证，命中率
   * 从 21/21 跌到 17/21。
   * 改法：--y 保持 -160（已验证过的"跳出 slab-1 包围盒"安全值不变），只收窄
   * --x 从 ±150 到 ±80——用 Playwright 对 --x 做网格扫描（150→80，步进
   * 10），逐档重新对全部 21 个 [data-node-id] + 3 枚徽章跑一遍
   * elementFromPoint，80 是"两侧徽章的屏幕投影不再与 D1/D7/T05/T06 相交"
   * 的第一个安全值（90 时人才发展与 D7 仍有约 41px 宽的相交区）。
   * ========================================================== */
  function buildTopStage(root) {
    root.appendChild(h('div', { class: 'top-disc' }));
    root.appendChild(h('div', { class: 'top-disc-underglow' }));

    // 8 段侧壁半径统一等于 --r-topdisc，交给 stage-objects.css 里
    // .top-wall i 的 var(--r, var(--r-topdisc)) 默认值兜底，这里只需要
    // 给每段不同的角度 --a。
    var wallSegs = [];
    for (var i = 0; i < 8; i++) {
      wallSegs.push(h('i', { vars: { '--a': (i * 45) + 'deg' } }));
    }
    root.appendChild(h('div', { class: 'top-wall' }, wallSegs));

    var badges = [
      { x: -80, y: -160, text: '技术攻关', action: 'tech-attack' },
      { x: 0, y: -160, text: '平台建设', action: 'platform' },
      { x: 80, y: -160, text: '人才发展', action: 'talent' }
    ];
    badges.forEach(function (b) {
      // Fix-4：badge / badge-strut 收敛复用 .o.billboard，--anchor 分别走
      // 显式 -100%（badge-strut）与默认 -50%（badge），均在 stage-objects.css
      // 里声明，与旧写法各自的 translate(-50%,-100%)/(-50%,-50%) 等价。
      root.appendChild(h('div', { class: 'o billboard badge-strut', vars: { '--x': b.x, '--y': b.y } }));
      root.appendChild(
        h(
          'div',
          {
            class: 'o billboard badge',
            vars: { '--x': b.x, '--y': b.y },
            // 三枚徽章没有对应的图谱数据节点，不编造 dataset.nodeId；
            // 用 data-stage-action 打标记，供 stage.js 识别（目前 stage.js
            // 的 bindBadges() 按 .badge 类选择器绑定 hover/click，未读取
            // 这个属性，可选在其后续迭代里用它区分三枚徽章的具体跳转目标）。
            dataset: { stageAction: b.action },
            role: 'button',
            tabindex: '0',
            'aria-label': b.text
          },
          [h('span', { text: b.text })]
        )
      );
    });
  }

  /* ============================================================
   * 导出
   * ========================================================== */
  window.KG.layersObjects = {
    build: function (root) {
      if (!root) return;
      buildTable(root);
      buildStands(root);
      buildCore(root);
      buildTopStage(root);
    }
  };
})();
