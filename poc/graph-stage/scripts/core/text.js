// core/text.js —— 中文友好的文本处理工具，挂到 window.TextUtils（不用 window.Text：
// 那会遮蔽浏览器内置的 Text 节点接口，document.createTextNode() 产出的实例仍然是
// 原生 window.Text 的实例，覆盖掉这个名字对别处的 `instanceof Text` 判断是一处
// 隐蔽的破坏）。
//
// 提供三类纯函数，全部零 DOM、零副作用，供 ui/* 与场景层直接调用：
//   truncateByWidth() —— 按"显示宽度"而不是字符数截断，中文字符按 2、其余按 1
//                        计宽，避免"中文标签比等长英文标签长一倍"却被同一个字符数
//                        上限裁得一样短/一样长的问题。
//   formatThousands()  —— 数字千分位分隔，供统计板（center 卡片的 nodes/edges/
//                        docs 计数）与卡片上的 nodeCount 展示用。
//   splitHits()         —— 把命中的搜索词从文本里切出来，返回
//                        [{text, hit}] 分片数组，只做切分不做渲染；渲染层
//                        （searchbox/list 等 ui 组件）拿这个数组去决定哪些分片套
//                        高亮样式，本文件不碰任何 DOM。
(function () {
  "use strict";

  // 全角/宽字符范围：CJK 统一表意文字、韩文音节、日文假名、全角标点等——覆盖本
  // POC 实际会出现的中文标签场景，不追求覆盖 Unicode 全部宽字符区段（如 emoji），
  // 这与仓库里全是中文业务文案的实际输入范围一致。
  var WIDE_CHAR_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿＀-｠￠-￦]/;

  function assertString(value, argName, where) {
    if (typeof value !== "string") {
      throw new Error(where + " 的 " + argName + " 必须是字符串，实际为 " + String(value));
    }
  }

  function assertPositiveFiniteNumber(value, argName, where) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0) {
      throw new Error(where + " 的 " + argName + " 必须是大于 0 的有限数字，实际为 " + String(value));
    }
  }

  // 单字符显示宽度：宽字符计 2，其余（含数字、英文字母、半角标点）计 1。
  function charWidth(ch) {
    return WIDE_CHAR_RE.test(ch) ? 2 : 1;
  }

  // 整段文本的显示宽度：逐字符累加 charWidth。
  function displayWidth(text) {
    assertString(text, "text", "TextUtils.displayWidth");
    var total = 0;
    for (var i = 0; i < text.length; i += 1) {
      total += charWidth(text.charAt(i));
    }
    return total;
  }

  // truncateByWidth(text, maxWidth, ellipsis?)：把 text 截到显示宽度不超过
  // maxWidth（含省略号本身的宽度），不足以放下省略号时直接 throw——这说明调用方
  // 传的 maxWidth 本身就不合理（比省略号还窄），不是可以静默兜底成空字符串的场景。
  //
  // ellipsis 缺省为 "…"：这是纯装饰性旋钮（换成三个点 "..." 或别的符号不影响
  // 对错），允许用默认值兜底；一旦调用方显式传了非字符串值，仍然直接 throw，
  // 不做隐式转换。
  function truncateByWidth(text, maxWidth, ellipsis) {
    assertString(text, "text", "TextUtils.truncateByWidth");
    assertPositiveFiniteNumber(maxWidth, "maxWidth", "TextUtils.truncateByWidth");
    if (ellipsis === undefined) {
      ellipsis = "…";
    } else {
      assertString(ellipsis, "ellipsis", "TextUtils.truncateByWidth");
    }

    if (displayWidth(text) <= maxWidth) {
      return text;
    }

    var ellipsisWidth = displayWidth(ellipsis);
    var budget = maxWidth - ellipsisWidth;
    if (budget < 0) {
      throw new Error(
        "[TextUtils.truncateByWidth] maxWidth(" + maxWidth + ") 小于省略号 " +
        JSON.stringify(ellipsis) + " 自身的显示宽度(" + ellipsisWidth + ")，无法截断"
      );
    }

    var width = 0;
    var cutIndex = 0;
    for (var i = 0; i < text.length; i += 1) {
      var w = charWidth(text.charAt(i));
      if (width + w > budget) break;
      width += w;
      cutIndex = i + 1;
    }
    return text.slice(0, cutIndex) + ellipsis;
  }

  // formatThousands(12345.6) -> "12,345.6"；负数保留符号："-12,345.6"。
  // 只做字符串层面的分组，不做四舍五入 / 精度处理——数字本身的精度是调用方数据
  // 层的责任，这里不悄悄改变数值。
  function formatThousands(num) {
    if (typeof num !== "number" || !isFinite(num)) {
      throw new Error("[TextUtils.formatThousands] num 必须是有限数字，实际为 " + String(num));
    }
    var negative = num < 0;
    var parts = String(Math.abs(num)).split(".");
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var decPart = parts[1] ? "." + parts[1] : "";
    return (negative ? "-" : "") + intPart + decPart;
  }

  // splitHits(text, query) -> [{text, hit}]：按 query 在 text 里的每一处（大小写
  // 不敏感）命中切分成若干分片，hit=true 的分片是命中的那一段原文（保留原始大小
  // 写，不是查询词本身的大小写），hit=false 是命中之间/之外的普通文本。不命中时
  // 返回单个 [{text, hit:false}]。
  //
  // query 必须是非空字符串——空字符串在 String.indexOf 语义下会在每个位置都"命
  // 中"，那不是调用方想要的"没有过滤词就别切"的语义，交给调用方在搜索框空值时
  // 直接不调用本函数，而不是本文件用空匹配假装出一个合法结果。
  function splitHits(text, query) {
    assertString(text, "text", "TextUtils.splitHits");
    assertString(query, "query", "TextUtils.splitHits");
    if (query === "") {
      throw new Error("[TextUtils.splitHits] query 不能是空字符串");
    }

    var lowerText = text.toLowerCase();
    var lowerQuery = query.toLowerCase();
    var result = [];
    var cursor = 0;

    while (cursor < text.length) {
      var idx = lowerText.indexOf(lowerQuery, cursor);
      if (idx < 0) {
        result.push({ text: text.slice(cursor), hit: false });
        break;
      }
      if (idx > cursor) {
        result.push({ text: text.slice(cursor, idx), hit: false });
      }
      result.push({ text: text.slice(idx, idx + query.length), hit: true });
      cursor = idx + query.length;
    }

    return result.length ? result : [{ text: text, hit: false }];
  }

  window.TextUtils = {
    displayWidth: displayWidth,
    truncateByWidth: truncateByWidth,
    formatThousands: formatThousands,
    splitHits: splitHits
  };
})();
