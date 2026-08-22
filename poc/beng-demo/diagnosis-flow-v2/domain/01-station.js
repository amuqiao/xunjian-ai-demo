// 领域契约 01：站场 / 机组 / 部位 / 测点。
//
// 【故事线锚在衡阳站 P-3 泵，因为它有真素材】assets/诊断工作台/图片 里那 5 张业务方图片
// 恰好构成一条完整的证据链，而且时间戳互相咬合：
//   · 长郴管道.衡阳站.P_3泵驱动端振动.jpg —— 真 SCADA 截图，2026-07-22 16:30→16:37，
//     振动 9.2→11.9 mm/s，画面顶部烧着 9.5 报警 / 9.8 停机两个阈值
//   · Easy-Laser 激光对中仪「调整前」—— H 向偏差 0.31mm
//   · Easy-Laser 激光对中仪「调整后」—— 相机水印 2026.07.22 16:31，H 向 -0.02mm
//   · 两张现场激光对中作业照片
//
// ★ 这条链给出的结论比编造的更有力：**对中已经从 0.31mm 调到 -0.02mm（合格），
//   而 SCADA 上振动并没有跟着降**。所以"联轴器不对中"这条备选被真数据压下去，
//   轴承的嫌疑才上升 —— 这正是 assets/诊断工作台/泵课题Q&A.docx 那 17 轮质询的核心争议，
//   只不过那份文档里是编的（CASE-2023-0417 / XX站 / YY厂），这里是真的。
//
// 【阈值用 ISO 10186-3，不用截图上那两个数】截图顶部那行 9.5 / 9.8 属于画面里**另一个
// 表格**（同列下方还有 90 / 95），不是这条曲线的阈值；曲线本身图上没有画阈值线，
// 而且图例文字写的是"温度"——SCADA 组态图例没跟着标题改，这种事很常见。
// 所以本文件的阈值取 ISO 10186-3（与 pump-station-situation-v2 同一套口径，三屏一致）：
//   A < 2.3 优 / B 2.3~4.5 良 / C 4.5~7.1 中 / D ≥ 7.1 劣
// 截图上的振动值在 8.2~12.1 之间，**全程落在 D 档**，这是"劣"而不是"略高"。
//
// 顺带记一条同类口径差异：《长岭站P-01输油泵驱动端振动报警故障停泵报告》里长岭 P-1
// （KSY900-225）的站控阈值是报警 3.5 / 联锁 5.5 mm/s，那份报告还专门写了「设置较为苛刻，
// 拟邀请机泵厂家和压检中心进一步评估」。**站控阈值是逐泵设的，与 ISO 分级不是一套东西**，
// 不要把它们抹平。
window.DOMAIN_STATION = (function () {
  "use strict";

  var objects = [
    {
      id: "OBJ-A",
      name: "长郴-衡阳站",
      line: "长郴成品油管道",
      zone: "衡阳作业区",
      unit: "Ｐ－3泵",
      // 台账口径（湖南公司主输泵设备维护保养信息表）：衡阳站 4 台主输泵，
      // P-2~P-4 同型号 200DY390-HY，西安航天，BB3，A 级设备。
      model: "200DY390-HY",
      vendor: "西安航天",
      role: "主输泵",
      grade: "A",
      // 衡阳站那 4 台在源表里投用日期列被《P-x 状态检测与评估报告》的结论文字串列覆盖，
      // 所以台账没有可用的投用日期。这里如实写"未填报"，不要编一个。
      commissionAt: "台账未填报",
      overhaulAt: "2025-03-01",
      shift: "2026-07-22 白班"
    },
    // OBJ-B 只用于验证记录筛选不跨对象串台，屏上不出现（与参照物同一手法）。
    { id: "OBJ-B", name: "长郴-耒阳站", line: "长郴成品油管道", zone: "衡阳作业区",
      unit: "Ｐ－2泵", model: "200DY390-HY", vendor: "西安航天", role: "主输泵",
      grade: "A", commissionAt: "台账未填报", overhaulAt: "—", shift: "2026-07-22 白班" }
  ];

  // 三个部位 = 三处真实取证位置。photoLabel 是照片里能被观众直接看到的东西
  // （仪器品牌、屏幕上的中文标题、相机水印），必须与图片逐字一致。
  var parts = [
    {
      id: "PART-DE",
      objectId: "OBJ-A",
      label: "泵驱动端",
      area: "泵棚区",
      photoLabel: "长郴管道.衡阳站.P_3泵驱动端振动",
      note: "SCADA 振动趋势的取值位置，也是本轮异常的发生位置"
    },
    {
      id: "PART-COUPLING",
      objectId: "OBJ-A",
      label: "联轴器",
      area: "泵棚区",
      photoLabel: "EASY-LASER · 调整前 / 调整后",
      note: "激光对中仪的测量位置。视觉对径向偏移的最小可检测阈值是 0.5mm"
    },
    {
      id: "PART-BASE",
      objectId: "OBJ-A",
      label: "机组底座",
      area: "泵棚区",
      photoLabel: "现场激光对中作业",
      note: "机脚调整位置，MF1 / MF2 就是这里的垫片量"
    }
  ];

  // 【测点只有一个数值型】驱动端振动。另外两条记录（对中偏差、润滑油样）不是连续时序：
  //   对中偏差是"调整前/调整后"两个离散读数 —— 证据形态是同点位前后对比，不是曲线；
  //   润滑油样是送检待回 —— 证据形态是待办事项，硬配一条曲线才是假。
  var points = [
    {
      id: "VIB-DE",
      partId: "PART-DE",
      label: "P-3 泵驱动端轴承振动",
      tag: "CCGD.HYZ.VT7003A",
      unit: "mm/s",
      // ISO 10186-3 的 C / D 两条界。不是站控报警值 —— 站控阈值逐泵设定，
      // 本机组的那两个数台账里没填（衡阳站 4 台的阈值列全空，见大屏「阈值缺项 40/40」），
      // 所以这里只能用行业分级口径，并在屏上如实标注是"ISO 分级界"而非"站控报警值"。
      warnAt: 4.5,
      dangerAt: 7.1,
      warnNote: "ISO C 档界",
      dangerNote: "ISO D 档界（劣）",
      standardText: "ISO 10186-3：C 档 4.5~7.1，D 档 ≥7.1（劣）。本机组站控阈值台账未填报。",
      // 现场读数 = SCADA 曲线末点。两处必须相等，由 03-series.js 把末点钉死来保证。
      fieldReading: 11.9,
      // 基线：曲线起点附近的平稳值，用于算"上升幅度"。
      baseline: 9.2,
      sampleNote: "站控 SCADA 采样，约 3 秒一点，画面为 16:30-16:37 共 7 分钟"
    }
  ];

  function objectById(id) {
    var found = objects.filter(function (o) { return o.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知诊断对象：" + id);
    return found;
  }

  function partById(id) {
    var found = parts.filter(function (p) { return p.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知部位：" + id);
    return found;
  }

  // 必填字段在取用时校验，缺一个直接炸。图上那两条阈值线的说明文字读的就是
  // warnNote / dangerNote —— 少写一个不会报错，只会在屏上印出
  // 「高报警 9.5mm/s · undefined」，路演时才被看见。宁可加载就失败。
  var POINT_FIELDS = ["unit", "label", "tag", "warnAt", "dangerAt", "warnNote",
                      "dangerNote", "fieldReading", "baseline"];

  function pointById(id) {
    var found = points.filter(function (p) { return p.id === id; })[0];
    if (!found) throw new Error("[DOMAIN_STATION] 未知测点：" + id);
    POINT_FIELDS.forEach(function (key) {
      if (found[key] === undefined || found[key] === "") {
        throw new Error("[DOMAIN_STATION] 测点 " + id + " 缺字段 " + key);
      }
    });
    return found;
  }

  function partsOf(objectId) {
    return parts.filter(function (p) { return p.objectId === objectId; });
  }

  return {
    objects: objects, parts: parts, points: points,
    objectById: objectById, partById: partById, pointById: pointById, partsOf: partsOf
  };
})();
