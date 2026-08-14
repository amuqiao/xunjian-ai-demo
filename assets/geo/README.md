# 地理边界源数据

## hunan-430000-full.geojson

- **内容**：湖南省 14 个地级行政区（13 地级市 + 湘西土家族苗族自治州）的行政边界，
  FeatureCollection / MultiPolygon，每个 feature 带 `adcode` 与 `name`。
- **来源**：阿里 DataV.GeoAtlas 公开边界服务
  `https://geo.datav.aliyun.com/areas_v3/bound/430000_full.json`
- **取回时间**：2026-08-13，HTTP 200，175,676 字节，原始顶点 7,528。
- **坐标范围**：经度 108.792~114.260（跨 5.47°），纬度 24.637~30.126（跨 5.49°）。

## 为什么存进仓库而不是构建时联网

大屏页面本身要求 `file://` 双击直开、运行时零网络请求，所以边界数据最终会被
`tools/build-geo.py` 抽稀 + 投影后生成为 `.js` 纯字面量。把**原始 GeoJSON 也存进来**
是为了让这一步离线可复现：换抽稀容差、换投影、修某个市的环，都不需要再次联网，
也不会因为上游服务改版而拿到与当初不同的边界。

sibling 项目 `beng-ai-demo` 那份 `worldmap.js` 的教训正是这个——它是从 Natural Earth
离线生成的，但原始数据与生成脚本都没留，现在想改抽稀精度只能从头再来一遍。
