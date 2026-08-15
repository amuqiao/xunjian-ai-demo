/**
 * taxonomy.js —— 分类法唯一声明（graph-stage 冻结表 A · 2.1 节）
 *
 * 这是整个 graph-stage 里**唯一**允许写死层数、类型名、id 段格式的文件。
 * 改课题（换成"设备/部件/测点"这种层级口径、换领域数、换 id 前缀）只改这一个文件，
 * 其余所有代码（kg/contract.js、kg-index.js、graph-model.js、展台编排……）一律从这里
 * 派生，不许在自己的文件里另立一套。
 *
 * 草稿版 kg_stage 把"层数=4"这件事写死在两处：
 *   - kg-data.js  的 LEVEL_TYPE = { 1: 'task', 2: 'direction', 3: 'technology', 4: 'content' }
 *   - kg-index.js 的 RE_HIER   = /^T\d{2}(-F\d{2}(-K\d{2}(-C\d{2})?)?)?$/
 * 这两处一旦要改层数就必须同步改两个文件、还容易漏改一处——是本次要消除的病灶。
 * 本文件之后，"层数是多少"这件事只由 levels[] 数组的长度决定，kg/contract.js 的
 * buildIdPattern() 在运行时逐层拼出正则，不再有任何写死的层级正则。
 *
 * 约定（不可破坏）：
 *   1. 经典脚本 IIFE，零 import / export / fetch / XHR / 动态 import()。
 *   2. 只导出 window.KGTaxonomy，零其余全局变量。
 *   3. 本文件零依赖：不读任何其他 window.* 全局，可以最早加载（L1 契约层第一个文件）。
 *   4. levels[].level 必须严格从 0 开始连续递增，且与数组下标一一对应；
 *      levels[0] 是虚拟根层，seg 恒为 null；levels[1..] 各自的 seg.prefix 互不相同。
 *   5. facets[] 是横切维度（原 domain/business 的泛化），facets[].rel 与
 *      facets[].memberField 必须成对出现——rel 是从 memberField 派生出的边关系名，
 *      memberField 是节点上记录横切归属的数组字段名。
 *   6. 所有 id 段前缀（levels[].seg.prefix ∪ facets[].seg.prefix）共享同一个命名
 *      空间，不许重复——否则 kg/contract.js 的 typeOf(id) 会在多种类型间产生歧义。
 *
 * 具体结构、字段语义与派生规则见 ../../DESIGN.md 第 2.1 节（冻结接口，不许另立一套）。
 */
(function () {
  'use strict';

  window.KGTaxonomy = {
    // 主干层级表：root → task → direction → technology → content。
    // level 必须与数组下标相等；level 0（根层）没有 id 段，seg 恒为 null。
    levels: [
      { level: 0, type: 'root', label: '图谱根', seg: null },
      { level: 1, type: 'task', label: '重点任务', seg: { prefix: 'T', digits: 2 } },
      { level: 2, type: 'direction', label: '攻关方向', seg: { prefix: 'F', digits: 2 } },
      { level: 3, type: 'technology', label: '攻关技术', seg: { prefix: 'K', digits: 2 } },
      { level: 4, type: 'content', label: '攻关内容', seg: { prefix: 'C', digits: 2 } }
    ],

    // 横切维度：与主干层级正交，节点通过 memberField 声明归属，rel 是派生边关系名。
    // 国家管网口径下是「技术领域」与「业务」两个维度；换课题时这里可以是 0～4 个。
    facets: [
      {
        key: 'domain',
        type: 'domain',
        label: '技术领域',
        seg: { prefix: 'D', digits: 1 },
        rel: 'domainOf',
        memberField: 'domainIds'
      },
      {
        key: 'business',
        type: 'business',
        label: '业务',
        seg: { prefix: 'B', digits: 1 },
        rel: 'bizOf',
        memberField: 'businessIds'
      }
    ],

    // 根节点 id，唯一的"无 seg"节点。
    rootId: 'root',

    // 主干层级 id 段之间的分隔符：T01 + idSep + F01 = "T01-F01"。
    idSep: '-',

    // 横切维度与主干层级之外的自由关联边关系名（不参与 contains 树、不构成 facet
    // 成员膨胀，纯粹的"这两个节点在业务上有关联"标注）。
    crossRels: ['supports', 'relatesTo']
  };

})();
