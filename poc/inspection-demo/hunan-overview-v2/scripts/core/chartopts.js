// 纯函数 ECharts option 构造器：window.ChartOptions（L4 core，早于 scripts/scenes/*，
// 晚于 scripts/data/*）。本文件不碰 DOM、不 new echarts——只把数据层 +
// CSS 主题色拼成 option 对象。ECharts 版本 5.6.0（vendor 复用旧目录原文件）。
//
// 【POC：hunan-overview-v2】构造器 4 个。派生指标（合规率 / 问题处置完成率 / 有效项）
// 一律从 window.HunanDerive 读，本文件不自留副本 —— 原先这里和 scenes/overview.js 各写
// 一份，靠注释「两处必须一致」维持，实测已经断过一次（见 scripts/core/derive.js 文件头）。
//
// 本轮（丰富指标与图表）相对上一版的改动：
//
//   删除 completionGauge()   → 新增 planExecutionBars()
//                              先做过单环，再做过双环，最后换成**三根横向条**。
//                              单环只能承载一个数，300px 的卡里那个圈会被拉成直径 220px、
//                              描边 22px 的细圈；双环的两个百分比只差几个 pt，弧长肉眼分不
//                              出来，读成了一层；而且卡标题「完成率 / 合规率」是抽象名词，
//                              环上没有任何东西回答「**什么的**完成率」。三根条把分母直接
//                              画出来（141 计划 → 134 已巡 → 122 有效），每根自带名字。
//
//   删除 qualityExceptionMix() → 新增 behaviorDonut()
//                              旧图是四根横向柱（时长/间隔/时段/AI 提醒），两个毛病：
//                              **混量纲**（前三类是违规次数，AI 提醒是模型产出条数，管理
//                              动作也不同类：前者找人核流程，后者去现场核设备），以及四个
//                              数全在 2~6 之间、四根柱几乎一样长。环形图正好：6+4+2=12 是
//                              一个整体的三个构成部分，环心写合计（饼图做不到）。
//                              AI 提醒移出去，进上边的指标带。
//
//   删除 ledgerMix()          → 新增 coverageTrend(win)
//                              台账构成（站场/阀室、天然气/成品油）是**静态结构**，与「当前
//                              风险」无关，且 141 这个数在地图副标题里已经有了。换成近 N 日
//                              完成率折线 —— 顺带治好顶栏那个日期选择器：它原先唯一的消费点
//                              是两个文字标签，点了屏上什么都不动。
//                              曾经在这张图上加过一根「行为异常」柱，又砍掉了：它画的是
//                              **每日值**却把基线钉死在**区间总量** 12 上，实测每根柱 12~17
//                              次、合计 103 次，而正上方环心写着「合计 12 次」。数据层只有
//                              区间总量、没有逐日明细，硬拆就是第二层造数。
//
//   新增 lineRiskBars()      —— 需关注站点按**管线**拆（横向条）。填的是右栏那块 13 行清单
//                              下方空掉的 250px。这一格先做过作业区气泡散点，实测发现它的
//                              三个通道（完成率 / 问题数 / 站点数）在屏上别处全有原件，而且
//                              把「先管谁」答反了（详见 lineRiskBars 上方注释），所以换成了
//                              这个从未出现过的维度。
//
// 四个构造器分别回答四个问题：
//   planExecutionBars → 141 项计划里最后有多少是真有效的
//   behaviorDonut     → 走过场的 12 次是哪三类
//   coverageTrend     → 这条线在变好还是变差
//   lineRiskBars      → 问题集中在哪条管线上（跨作业区，别处看不到）
//
// 【全部不带 zoneId，一律全省口径】回字形里左栏和上边的指标带是「全省基准」，下钻时刻意
// 不变 —— 点开岳阳时全省的 95% 和 13 项问题仍然在屏上，可与下带岳阳卡上的 94.4% / 5 项
// 对读。跟随焦点变化的只有地图、右栏的需关注站点清单、和作业区带的高亮。
// coverageTrend 的 win（点数 + 末点日期）是唯一的形参，来源是顶栏的日期区间，不是下钻焦点。
//
// 【字号下限 12px】画布固定 2471px 宽，实际显示时被 --screen-scale 整体缩放：在 1920 宽
// 的屏上 scale = 0.78，11px 的轴标签实际只渲染成 8.6px。所以图内所有文字（轴标签、
// legend、markLine 标签）不低于 12px，正文级的给 13px。
//
// 颜色全部现读 getComputedStyle(document.documentElement)，不写死任何色值——
// 与 01-tokens.css 的三色语义契约保持单一真源。
(function () {
  "use strict";

  var THEME = null;

  function readTheme() {
    var computed = getComputedStyle(document.documentElement);
    function cssVar(name) {
      var value = computed.getPropertyValue(name).trim();
      if (!value) throw new Error("[ChartOptions] 缺少 CSS 变量 " + name + "，请检查 styles/01-tokens.css");
      return value;
    }
    return {
      accent: cssVar("--accent"),
      accent2: cssVar("--accent-2"),
      ok: cssVar("--status-ok"),
      warn: cssVar("--status-warn"),
      danger: cssVar("--status-danger"),
      muted: cssVar("--muted"),
      ink: cssVar("--ink"),
      line: cssVar("--line"),
      lineStrong: cssVar("--line-strong")
    };
  }

  function requireTheme() {
    if (!THEME) THEME = readTheme();
    return THEME;
  }

  function requireQuality(fnName) {
    if (!window.HunanInspectionQuality) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanInspectionQuality，请检查 scripts/data/quality.js 是否已加载");
    }
    return window.HunanInspectionQuality;
  }

  // 派生指标一律从 window.HunanDerive 读，本文件不再自留副本 —— 原先这里和
  // scenes/overview.js 各写了一份，靠注释「两处必须一致」维持，实测已经断过一次
  // （见 scripts/core/derive.js 文件头）。
  function requireDerive() {
    if (!window.HunanDerive) {
      throw new Error("[ChartOptions] 需要 window.HunanDerive，请检查 index.html 里 "
        + "scripts/core/derive.js 是否早于本文件加载");
    }
    return window.HunanDerive;
  }

  // ECharts 的默认 tooltip 是白底黑字，叠在深蓝黑大屏上会亮得像个弹窗故障。
  // 三个构造器共用这一份深色 tooltip 皮肤。
  function darkTooltip(theme, extra) {
    var base = {
      backgroundColor: "rgba(8, 12, 30, 0.94)",
      borderColor: theme.lineStrong,
      borderWidth: 1,
      padding: [7, 10],
      textStyle: { color: theme.ink, fontSize: 12 }
    };
    Object.keys(extra || {}).forEach(function (key) { base[key] = extra[key]; });
    return base;
  }

  // ---------- planExecutionBars()：巡检计划执行（三根横向条） ----------
  //
  // 【为什么从双环换成横向条】上一版是外环完成率 95.0% + 内环合规率 91.5% 的双层环。
  // 两个毛病，都是实测出来的：
  //   1) 两个百分比只差 3.5pt，两层环的弧长肉眼分不出来，读成了一层。
  //   2) 卡标题「完成率 / 合规率」是抽象名词 —— **什么的完成率**？环上没有任何东西
  //      回答这个问题，观众得先猜分母是什么。
  // 三根横向条把分母直接画出来：最长那根就是分母（141 项计划），后两根是它依次
  // 减掉「没巡的」和「走过场的」之后剩下多少。每根条自己带名字，不需要解释。
  //
  // 条从 0 起，不做截断：三根条差 5%~13%，在 400px 宽的条上是 20~52px 的长度差，
  // 肉眼够看。截断轴能把差距放大，但那是在骗人。
  var PLAN_STEPS = [
    { key: "planned", label: "计划巡检", tone: "lineStrong",
      hint: "本区间应巡的站场 / 阀室数" },
    { key: "completed", label: "已巡检", tone: "ok",
      hint: "已提交巡检记录的项" },
    { key: "valid", label: "有效项", tone: "accent2",
      hint: "已巡项里扣掉判为行为异常（走过场）的那些" }
  ];

  function planExecutionBars() {
    var theme = requireTheme();
    var q = requireQuality("planExecutionBars()").province();
    var D = requireDerive();
    var beh = D.behaviorTotal(q);
    var vals = { planned: q.planned, completed: q.completed, valid: D.validItems(q) };
    if (!(vals.valid <= vals.completed && vals.completed <= vals.planned)) {
      throw new Error("[ChartOptions] 计划执行三级必须递减，实际 "
        + vals.planned + " / " + vals.completed + " / " + vals.valid);
    }

    var rows = PLAN_STEPS.map(function (step) {
      var v = vals[step.key];
      return {
        label: step.label,
        value: v,
        color: theme[step.tone],
        hint: step.hint,
        // 【不在条旁印百分比】比例已经由条长编码了，旁边再印一遍是给几何编码打补丁；
        // 更要紧的是上带第 2、3 格的 value 就是 95.0% 和 86.5%，两块相距不到 600px，
        // 印上去就是逐字重印。百分比只留在 tooltip 里。
        pct: step.key === "planned" ? null : D.ratePct(v, q.planned, step.label)
      };
    });

    return {
      grid: { left: 74, right: 92, top: 14, bottom: 40 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[rows.length - 1 - params[0].dataIndex];
          return row.label + "　" + row.value + " 项"
            + (row.pct == null ? "" : "（占计划 " + row.pct.toFixed(1) + "%）")
            + "<br/><span style=\"opacity:.65\">" + row.hint + "</span>";
        }
      }),
      xAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(q.planned * 1.06),
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      // category 轴自下而上排，reverse 一次让 PLAN_STEPS 的书写顺序在屏上自上而下。
      yAxis: {
        type: "category",
        data: rows.map(function (r) { return r.label; }).reverse(),
        axisLabel: { color: theme.ink, fontSize: 14 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: "bar",
        barWidth: 30,
        label: {
          show: true,
          position: "right",
          distance: 10,
          formatter: function (params) {
            var row = rows[rows.length - 1 - params.dataIndex];
            return rows[rows.length - 1 - params.dataIndex].value + " 项";
          },
          color: theme.ink,
          fontSize: 15,
          fontWeight: 700
        },
        data: rows.map(function (r) {
          return { value: r.value, itemStyle: { color: r.color, borderRadius: [0, 4, 4, 0] } };
        }).reverse()
      }],
      // 把「差在哪」直接写在图下面 —— 这是这张图真正要说的话，不该只藏在 tooltip 里。
      graphic: [{
        type: "text",
        left: "center",
        bottom: 6,
        style: {
          // 只留「未巡」和「走过场」两个数 —— 它们是上带没有作为 value 出现过的。
          // 合规率 86.5% 是这张卡的卡头 meta，不在图里再印一遍。
          text: "未巡 " + (q.planned - q.completed) + " 项　·　走过场 " + beh + " 项",
          fill: theme.muted,
          fontSize: 13,
          textAlign: "center"
        }
      }]
    };
  }

  // ---------- behaviorDonut()：行为异常构成（环形图） ----------
  //
  // 旧的 qualityExceptionMix() 是四根横向柱：时长 / 间隔 / 时段 / AI 提醒。两个毛病：
  //   1) **混量纲** —— 前三类是巡检人员的违规「次数」，第四类 AI 提醒是模型产出的
  //      「条数」。放同一根轴上比长度，读不出任何结论；而且两者的管理动作不同类：
  //      前三类要找人核对流程，AI 提醒要去现场核实设备。
  //   2) 四个数全在 2~6 之间，四根柱几乎一样长，369px 高的一整块只承载了 4 个小数。
  //
  // 换成环形图之后：时长 6 + 间隔 4 + 时段 2 = 12，正好是「行为异常」这一个整体的
  // 三个构成部分 —— 这才是饼/环该用的场合。环心写合计（饼图做不到这件事）。
  // AI 提醒移出这张图，去上带单独一格。
  //
  // 三条阈值说明进 tooltip，逐字取自业务方的《巡检质量核心指标》：
  //   「巡检时长异常次数：XX次（低于10分钟算异常）」
  //   「巡检时间间隔异常次数：XX次（每个区域低于10s以及区域之间间隔低于10s算异常）」
  //   「巡检时段异常次数：XX个（巡检时段与工业电视内区域偏差30分钟算异常）」
  // 这三条是**任务级**口径，与 inspection-station-v2 的**项级**口径（<10秒/<3秒）
  // 刻意不同，两边各自自洽，别去对齐。
  var BEHAVIOR_SLICES = [
    { key: "duration", label: "时长异常", hint: "单项巡检用时低于 10 分钟", shade: 0 },
    { key: "interval", label: "间隔异常", hint: "区域内或区域间间隔低于 10 秒", shade: 1 },
    { key: "offWindow", label: "时段异常", hint: "与工业电视内区域偏差 30 分钟以上", shade: 2 }
  ];

  // 同色系三档深浅，不是三个不同色相：它们是同一类问题（行为异常）的三个子类，
  // 用三种色相会读成「三件不相干的事」。梯度照 inspection-station-v2 的
  // behaviorByRound() 用过的那一组，跨屏一致。
  var BEHAVIOR_SHADES = ["#eeb44a", "#d99a2f", "#b87a1c"];

  function behaviorDonut() {
    var theme = requireTheme();
    var q = requireQuality("behaviorDonut()").province();
    var D = requireDerive();
    var total = D.behaviorTotal(q);
    // 【三类清零不是错，是这块屏存在的目的】原先这里直接抛，等于「整改成功 = 演示崩溃」。
    // 改成画一张满环 + 环心 0：它是一个真实且可达的成功状态，该有自己的渲染分支，
    // 而不是致命错误。这不是兜底 —— 兜底是把错误藏起来，这里是把合法域值画出来。
    if (total === 0) {
      return {
        series: [{
          type: "pie",
          radius: ["48%", "68%"],
          center: ["50%", "50%"],
          silent: true,
          label: { show: false },
          data: [{ value: 1, itemStyle: { color: theme.line } }]
        }],
        graphic: [{
          type: "text", left: "center", top: "43%", z: 10,
          style: { text: "0", fill: theme.ok, fontSize: 40, fontWeight: 700, textAlign: "center" }
        }, {
          type: "text", left: "center", top: "57%", z: 10,
          style: { text: "本区间无行为异常", fill: theme.muted, fontSize: 13, textAlign: "center" }
        }]
      };
    }
    if (total < 0) {
      throw new Error("[ChartOptions] behaviorDonut() 的三类行为异常合计为负：" + total);
    }
    var slices = BEHAVIOR_SLICES.map(function (row) {
      return {
        name: row.label,
        value: q[row.key],
        hint: row.hint,
        itemStyle: { color: BEHAVIOR_SHADES[row.shade], borderColor: "rgba(5,6,15,.55)", borderWidth: 2 }
      };
    });

    return {
      tooltip: darkTooltip(theme, {
        trigger: "item",
        formatter: function (p) {
          var row = slices[p.dataIndex];
          return row.name + "　" + row.value + " 次（占 " + p.percent + "%）<br/>"
            + "<span style=\"opacity:.65\">" + row.hint + "</span>";
        }
      }),
      // 不放 legend：外侧标签已经把三个类名逐个标在扇区旁边了，底部再来一行同样的
      // 三个词是重复，而且要占掉约 30px 高 —— 那点高度给环的直径更值。
      series: [{
        type: "pie",
        radius: ["48%", "68%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: false,
        // 段内标签给「次数」而不是百分比：12 次里的 6/4/2，绝对数比 50%/33%/17%
        // 更好用 —— 管理动作是「去核这 6 次」，不是「去核这 50%」。
        label: {
          show: true,
          position: "outside",
          formatter: "{b}\n{c} 次",
          color: theme.ink,
          fontSize: 13,
          lineHeight: 17
        },
        labelLine: { length: 10, length2: 12, lineStyle: { color: theme.line } },
        itemStyle: { borderRadius: 3 },
        data: slices
      }],
      graphic: [{
        type: "text",
        left: "center",
        top: "43%",
        z: 10,
        style: {
          text: String(total),
          fill: theme.warn,
          fontSize: 40,
          fontWeight: 700,
          textAlign: "center"
        }
      }, {
        type: "text",
        left: "center",
        top: "57%",
        z: 10,
        style: { text: "次 行为异常", fill: theme.muted, fontSize: 13, textAlign: "center" }
      }]
    };
  }

  function requireSites(fnName) {
    if (!window.HunanSites) {
      throw new Error("[ChartOptions] " + fnName + " 需要 window.HunanSites，请检查 scripts/data/sites.js 是否已加载");
    }
    return window.HunanSites;
  }

  // ---------- coverageTrend(pointCount)：近 N 日完成率 + 行为异常（双轴 折线 + 柱） ----------
  //
  // 【为什么屏上需要这张图】顶栏右上角的「近7天 / 近30天 / 本月 / 自定义」在第一版
  // v2 里点了几乎不改变任何东西 —— 唯一的消费点是完成度环的 meta 标签和顶栏那行日期
  // 文字，四个大数、三张图、地图全都不动。路演时被点一下就露馅。这张图接上区间之后，
  // 区间切换才有屏上反馈。
  //
  // 【为什么不用 series.js 的 inspectionCoverageTrend()】那个函数的末点落不到当前
  // 完成率上：它算 `current - 4 + sin(i*0.9)*4 + slope`，7 点时末点 = 95-3 = 92。
  // 而这张图正上方的双环写着 95.0% —— 同屏两个数自相矛盾。这里改成**末点钉死在真实
  // 完成率上**再往前回溯（i = lastIndex 时波形与漂移同时归零），并且不去改旧目录那份
  // 共享文件（旧屏还在用它）。
  //
  // 【行为异常那根柱是派生的，不是真数据】末点钉死在真实的 12 次上，其余点按
  // 「完成率越低、走过场越多」的反相关关系回溯。这是演示数据，形态借鉴
  // 智能巡检数智员工_巡检.html 周报里那张「合规率折线 + 行为异常柱」的双轴图，跨屏一致。
  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function coverageTrend(win) {
    var theme = requireTheme();
    var D = requireDerive();
    var q = requireQuality("coverageTrend()").province();
    if (!win || typeof win.count !== "number" || !isFinite(win.count)
        || win.count % 1 !== 0 || win.count < 1 || win.count > 31) {
      // isFinite + %1 两道是必需的：typeof NaN === "number"，而 NaN < 1 和 NaN > 31
      // 同时为 false —— 只写大小比较的话 NaN 会一路穿透，产出一张 xAxis.data.length === 0、
      // yAxis.min === Infinity 的空白图，零报错。
      throw new Error("[ChartOptions] coverageTrend() 的 count 必须是 1..31 的整数，实际 "
        + (win && win.count));
    }
    if (!(win.end instanceof Date) || isNaN(win.end.getTime())) {
      throw new Error("[ChartOptions] coverageTrend() 的 end 必须是合法 Date，实际 " + (win && win.end));
    }
    var pointCount = win.count;
    var current = q.completionRate;
    var lastIndex = pointCount - 1;

    var days = [];
    var rates = [];
    for (var i = 0; i < pointCount; i += 1) {
      var back = lastIndex - i;
      // 【末点落在 win.end 上，不是落在「今天」】原先无条件从 new Date() 往回数，
      // 于是点「湘潭站问题复核（2026-04-24 至 04-30）」时顶栏写着 4/24-4/30、
      // 图上画的却是 08-17…08-23 —— 屏上说假话，而且那一档与「近7天」产出逐字节
      // 相同的图，等于自定义区间仍然什么都不动。
      var d = new Date(win.end.getFullYear(), win.end.getMonth(), win.end.getDate() - back);
      days.push(pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()));

      // i === lastIndex 时 sin(0) = 0、drift = 0，末点正好等于 current。
      // drift 按窗口占比而不是按天算：写成 -back * 0.35 时 30 天档累积 10.5pt，左端掉到
      // 83% —— 等于在屏上宣称「一个月内完成率从 83% 提到 95%」，演示大屏上这是过度宣称。
      var wave = Math.sin(-back * 0.9) * 2.2;
      var drift = lastIndex === 0 ? 0 : -(back / lastIndex) * 3.5;
      var rate = D.round1(current + wave + drift);
      if (rate > 100) rate = 100;
      if (rate < 60) rate = 60;
      rates.push(rate);
    }

    // y 轴不从 0 起：完成率常年在 90~100 之间，从 0 起的话曲线会压成贴着顶边的一条直线。
    // 下界取到 5 的整数倍、步长固定 5，刻度永远是整数（写成 (100-yMin)/2 时 yMin=85
    // 会算出 7.5，轴上出现「92.5%」这种小数刻度）。
    var minRate = Math.min.apply(null, rates);
    var yMin = Math.max(60, Math.floor((minRate - 2) / 5) * 5);

    return {
      grid: { left: 46, right: 22, top: 22, bottom: 26 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: theme.line } },
        formatter: function (params) {
          var idx = params[0].dataIndex;
          return days[idx] + "　完成率 " + rates[idx].toFixed(1) + "%"
            + (idx === lastIndex ? "<br/><span style=\"opacity:.65\">当期实测值</span>" : "");
        }
      }),
      xAxis: {
        type: "category",
        data: days,
        boundaryGap: false,
        axisLabel: {
          color: theme.muted,
          fontSize: 12,
          // 30 天时全标会糊成一片，按点数自动隔标。
          interval: pointCount > 14 ? Math.ceil(pointCount / 7) - 1 : (pointCount > 8 ? 1 : 0)
        },
        axisLine: { lineStyle: { color: theme.line } },
        axisTick: { show: false }
      },
      // 单轴单系列：原先这里还有一根「行为异常」柱，砍掉了 —— 它画的是**每日值**却把
      // 基线钉死在**区间总量** 12 上，实测 7 点时每根柱 12~17 次、合计 103 次，而正上方
      // 那张环形图的环心写着「合计 12 次」。同屏两个数自相矛盾，与本文件砍掉折线末点
      // 标签是同一个理由。数据层只有区间总量、没有逐日明细，硬拆就是第二层造数。
      yAxis: {
        type: "value",
        min: yMin,
        max: 100,
        interval: (100 - yMin) > 20 ? 10 : 5,
        axisLabel: { color: theme.muted, fontSize: 12, formatter: "{value}%" },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: theme.line } }
      },
      series: [{
        name: "完成率",
        type: "line",
        smooth: true,
        symbol: "circle",
        symbolSize: 6,
        showSymbol: pointCount <= 14,
        lineStyle: { width: 2.5, color: theme.accent },
        itemStyle: { color: theme.accent },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(56,198,236,.26)" },
              { offset: 1, color: "rgba(56,198,236,0)" }
            ]
          }
        },
        // 末点只加一个实心点，不加数值标签：那个数在上带第 2 格已经是 value、在左① 的条上
        // 也有，印在这儿就是屏上第三遍。「末点为当期实测」这句话放在卡头 meta 里。
        markPoint: {
          symbol: "circle",
          symbolSize: 9,
          itemStyle: { color: theme.accent, borderColor: theme.ink, borderWidth: 1.5 },
          label: { show: false },
          data: [{ coord: [days[lastIndex], rates[lastIndex]] }]
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: theme.warn, type: "dashed", width: 1.2 },
          label: {
            show: true,
            position: "insideStartTop",
            formatter: "目标 " + D.TARGET_RATE + "%",
            color: theme.warn,
            // 12 而不是 11：见文件头「字号下限 12px」那一条。
            fontSize: 12
          },
          data: [{ yAxis: D.TARGET_RATE }]
        },
        data: rates
      }]
    };
  }

  // ---------- lineRiskBars()：需关注站点 · 按管线（横向条） ----------
  //
  // 【这一格原来是气泡散点，换掉的两个理由，都是实测出来的】
  //
  // 1) **三个通道在屏上别处全有原件**：散点的 x 是完成率（= 下带 6 张卡上的完成率，
  //    6 个值逐字相同）、y 是问题数（= 下带卡的需关注数）、气泡大小是站点数（= 地图上
  //    6 个作业区标签的「N 站」）。它和下带那条带讲的是同一件事，而下带那块还能点下钻。
  //
  // 2) **图把「先管谁」答反了**。y 轴放绝对量、气泡大小放它的分母，等于要观众用眼睛
  //    做除法。实测每百站问题数：株洲 16.7 > 岳阳 13.9 > 永郴 10.0 > 衡阳 7.4 >
  //    湘娄 5.6 > 长沙 3.6。而图上最扎眼的是岳阳（y 最高 5、气泡最大 36 站），
  //    真正最该管的株洲反而是最小最靠左那个点。另外 6 个点只落在 3 个 y 值上
  //    （1/2/5），二维平面被当一维用，长沙与衡阳两个气泡还重叠 4.4px。
  //
  // 【换成管线维度的理由】13 个需关注站点按管线拆开是屏上从未出现过的一句话，
  // 而且它**跨作业区**（忠武线潜湘支线横跨岳阳），按作业区永远看不到：
  //     忠武线潜湘支线    6 / 14 站 = 42.9%   ← 十四个站里六个有问题
  //     西二线樟湘联络线   1 /  5 站 = 20.0%
  //     潜江-韶关输气管道  5 / 37 站 = 13.5%
  //     长郴成品油管道    1 / 34 站 =  2.9%
  //     其余 7 条线       0 / 51 站
  // 零造数，全部从 141 条台账的 lineName + status 现算。
  //
  // 「其余 N 条线 0」那一行必须画出来，不能只画有问题的四条：不画的话观众会以为
  // 全省只有四条管线。这是「没有静默截断」那条纪律 —— 屏上砍掉了什么必须说出来。
  function lineRiskBars() {
    var theme = requireTheme();
    var D = requireDerive();
    var Sites = requireSites("lineRiskBars()");
    var all = Sites.sites();
    if (!all.length) throw new Error("[ChartOptions] lineRiskBars() 拿到空台账");

    var byLine = {};
    var order = [];
    all.forEach(function (site) {
      // 用 lineId（稳定键）分组、lineName 只做 label：按展示串分组时，同名不同线会被
      // 静默合并。台账里两个字段都有，没有理由用不稳定的那个当 key。
      if (!site.lineId || !site.lineName) {
        throw new Error("[ChartOptions] 台账里有站点缺 lineId 或 lineName：" + site.id);
      }
      if (!byLine[site.lineId]) {
        byLine[site.lineId] = { name: site.lineName, total: 0, need: 0 };
        order.push(site.lineId);
      } else if (byLine[site.lineId].name !== site.lineName) {
        throw new Error("[ChartOptions] 同一 lineId " + site.lineId + " 对应两个名字："
          + byLine[site.lineId].name + " / " + site.lineName);
      }
      byLine[site.lineId].total += 1;
      if (site.status !== "ok") byLine[site.lineId].need += 1;
    });

    var hit = [];
    var restTotal = 0;
    var restLines = 0;
    order.forEach(function (id) {
      var row = byLine[id];
      if (row.need > 0) {
        hit.push(row);
      } else {
        restLines += 1;
        restTotal += row.total;
      }
    });
    hit.sort(function (a, b) {
      return (b.need / b.total) - (a.need / a.total) || b.total - a.total;
    });

    var rows = hit.map(function (row) {
      return {
        // 管线名最长的是「兰郑长成品油管道湘潭支线」11 个字，y 轴给 148px 放得下；
        // 「潜江-韶关输气管道」里那个半角连字符也算一格，不做替换。
        label: row.name,
        pct: D.ratePct(row.need, row.total, row.name),
        need: row.need,
        total: row.total
      };
    });
    if (restLines > 0) {
      rows.push({ label: "其余 " + restLines + " 条线", pct: 0, need: 0, total: restTotal });
    }

    // 条色按占比分档，不按管线身份：观众要的是「哪条线最集中」，不是「哪条线叫什么颜色」。
    // 三档阈值 30 / 10 与地图图例的「异常 / 关注 / 正常」同一套语义，不新增图例。
    function toneOf(pct) {
      if (pct >= 30) return theme.danger;
      if (pct >= 10) return theme.warn;
      if (pct > 0) return theme.accent2;
      return theme.lineStrong;
    }

    var maxPct = Math.max.apply(null, rows.map(function (r) { return r.pct; }));

    return {
      grid: { left: 152, right: 88, top: 8, bottom: 8 },
      tooltip: darkTooltip(theme, {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: function (params) {
          var row = rows[rows.length - 1 - params[0].dataIndex];
          if (row.need === 0) {
            return row.label + "　共 " + row.total + " 站，无需关注站点";
          }
          return row.label + "<br/>需关注 " + row.need + " / " + row.total + " 站 = "
            + row.pct.toFixed(1) + "%";
        }
      }),
      xAxis: {
        type: "value",
        min: 0,
        max: Math.ceil(maxPct / 10) * 10 + 6,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      // category 轴自下而上排，reverse 一次让降序在屏上自上而下。
      yAxis: {
        type: "category",
        data: rows.map(function (r) { return r.label; }).reverse(),
        axisLabel: { color: theme.ink, fontSize: 13 },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      series: [{
        type: "bar",
        barWidth: 20,
        label: {
          show: true,
          position: "right",
          distance: 8,
          formatter: function (params) {
            var row = rows[rows.length - 1 - params.dataIndex];
            return row.need + " / " + row.total + " 站";
          },
          color: theme.muted,
          fontSize: 13
        },
        data: rows.map(function (r) {
          return {
            value: r.pct,
            itemStyle: { color: toneOf(r.pct), borderRadius: [0, 3, 3, 0] }
          };
        }).reverse()
      }]
    };
  }

  window.ChartOptions = {
    planExecutionBars: planExecutionBars,
    behaviorDonut: behaviorDonut,
    coverageTrend: coverageTrend,
    lineRiskBars: lineRiskBars
  };
})();
