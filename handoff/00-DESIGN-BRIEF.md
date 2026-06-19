# 设计交接 Brief — 公众号「开号篇」改版

## 目标
重做 Cadence 步频 公众号**开号篇**文章的版式(秀米风格,越清晰越好看越好),并尽量沉淀成可复用的**日报模板**。文案已定稿,只改视觉/排版。

## 产出形式(建议:HTML 为主 + 图片为辅)
推荐交付**可直接粘进微信公众号编辑器的 HTML**,封面 / 插画 / 复杂分隔元素另出图片。
理由:这是文献速读号,正文价值高——HTML 正文可被读者复制引用、被微信「搜一搜」收录、改文案不必重导图、日报与开号共用一套模板好维护;纯图片视觉自由但正文不可选、不被收录、每次改字都要重导、且会被微信压缩。
> 若设计更习惯 Figma:先在 Figma 定义视觉系统(封面 / 卡片 / 色板 / 字阶),再落地成 HTML 模板;只把封面和插画导成图片。

## 必须保留(不要改文案)
- 文字、结构、5 篇内容、延伸阅读、免责声明 = `01-content/wechat-launch-issue01.md`,逐字照搬。
- 结构顺序:刊头 → 开篇引言(含「知识的断代,最终由患者的疗效买单」金句) → 50+/AI/8 数据条 → 谁该关注 → 更新节奏 → 本期 5 篇 → 行动号召 → 延伸阅读 → 免责声明。

## 硬约束(决定能否粘进公众号 —— 最重要)
1. 容器只能用 `<section>`,**不能用 `<div>`**(微信会剥掉 div 的背景)。
2. **纯内联样式**(微信只保留 inline style);外部 CSS / class / `<style>` 全部失效。
3. 渐变必须带 `background-color` 实色回退(`background-color:X;background-image:linear-gradient(...)`),否则被剥后白底白字。
4. 未认证号**正文超链接会被剥**:原文链接只能当纯文本放文末。
5. 移动端宽度(约 375–420px)单列布局;正文字号 ≥15px。
6. 多列布局(如数据条)用 `inline-block + 父级 font-size:0` 的写法,别用 flex/grid(微信支持不稳)。

## 品牌规范(取自 `03-brand-tokens/`,以 token 为准)
- **主色**:Scrubs Blue `#3D74B8`(`--blue-600`);深 `#2C5A96`/`#224674`;浅底 `#E2EDF8`/`#F2F7FC`。
- **中性色是暖调**:纸底 `#FAFAF6`(warm cream),正文 ink `#1E1C17`/`#45413A`,meta `#7A7568`,细线 `#E4DFD1`。
- **八大专科固定色**(soft 底 + ink 字,见 `colors.css` `--cat-*` 与 `05-…/guidelines-r2/cards/colors-categories.html`):
  骨科 slate indigo `#3C4C6E` · 神经 deep violet `#463E7C` · 运动 burnt sienna `#9B4A2C` · 儿童 ochre `#876418` · 老年 pine `#2F5D52` · 心肺 garnet `#8C3B43` · 手法理疗 moss `#545F2E` · 行业执业 graphite `#434952` · 康复科技 teal `#2A6F77`(横切叠加,非第 9 专科)。
- **字体**:标题 Spectral(中文回退 Noto Serif SC / Songti SC)· 正文 IBM Plex Sans(回退 Noto Sans SC / PingFang SC)· 数据/角标 IBM Plex Mono。字阶见 `typography.css`。
  > 注:微信不能嵌入自定义字体,正文会落到系统中文字体;Spectral 衬线感主要靠**封面图片**实现。
- Logo / QR:`04-logo-assets/`(wordmark / mark / lockup / mono + 公众号二维码)。

## 当前版本待改进点(`02-current-design/wechat-launch-issue01.html`)
- 用了**冷灰底 `#eef2f7`**,与品牌**暖纸底 `#FAFAF6`**不一致 → 建议统一到暖调。
- 5 张卡片的彩条/标签颜色是**临时配色**,没对上官方**八大专科色板** → 按 `--cat-*` 重新映射。
- 标题字重/层级可更接近 design system 的 display/headline 角色。
- `daily-template-reference.html` 是现行日报版式,改版时请与它保持同一视觉语言。

## 资产清单(本文件夹)
- `01-content/` 定稿文案(copy lock)
- `02-current-design/` 现版 HTML + 日报模板参照
- `03-brand-tokens/` colors / typography / spacing / effects
- `04-logo-assets/` logo 各版本 + favicon + 公众号二维码
- `05-design-system-spec/` Fulcrum SKILL.md + manifest + 最新一轮 guidelines 可视卡片(色板/字阶/间距)

## 期望交付物
1. 改进后的开号篇 HTML(满足上面 6 条硬约束,可直接粘贴)。
2. 封面图(微信首图 2.35:1 + 朋友圈分享 1:1,如需)。
3. (可选)可复用的日报版式说明 / 组件规范。

## 待你确认(信息不足,未自行决定)
- **SIGNAL 分档阈值不一致**:token 注释写 ≥85 / 65–84 / <65;而现行小红书文案写 强信号 80+ / 值得读 70–79 / 参考 <70。徽标渲染前需统一一个口径。
