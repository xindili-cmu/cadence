# vendor/fonts-ttf

TTF copies of the brand web fonts (IBM Plex Sans, IBM Plex Mono, Spectral),
converted from the woff2 originals in `../fonts/`. satori can't read woff2, so
it reads these TTFs instead. Current reader: `scripts/linkedin-daily-card.js`
(the other satori scripts load fonts from elsewhere).
Latin subset only — same files, different container.

## 命名约定（有断言守着）

`<family>-<subset>-<weight>-<style>.ttf`。文件名里的 weight/style 必须等于字体
内部的 `OS/2.usWeightClass` 与 `head.macStyle` —— pipeline-gates 的 Y 段会解析
每个 ttf 来核对。

守的是一种**静默**故障：把 500 那份复制一下改名成 `-400-`，文件能读、satori
不报错、CI 全绿，海报上所有字悄悄粗一档。肉眼几乎看不出，而这是排版类产物
最难回滚的那种错（发出去才发现）。

`cadence-bupin.ttf` 不遵循这个约定（4 字「步频」子集，非 latin 分支），断言里
按文件名形状自动跳过。2026-08-25 EN/zh 名称拆分后已不再被加载。

## 怎么加一个字重

woff2 原件放 `../fonts/`，然后转成 ttf。转换保持字形不变，只换容器：

```bash
pip install fonttools brotli          # brotli 是解 woff2 必需的
python3 - <<'PY'
from fontTools.ttLib import TTFont
src = 'vendor/fonts/<name>.woff2'
f = TTFont(src); f.flavor = None
f.save('vendor/fonts-ttf/<name>.ttf')
PY
npm test                               # Y 段会核对新文件的 weight/style
```

校验口径：转出来的 ttf 与同族既有文件应当字形数、cmap 覆盖数一致（IBM Plex
Sans latin 是 270 字形 / 232 码位），体积也在同一量级。对不上说明拿错了子集。

## Source Serif 4（2026-09-17 补入，给 daily-poster）

design_handoff_daily_poster 的衬线是 **Source Serif 4**，不是 Spectral（后者是
现役卡片的衬线，两者并存，别互相替换）。已补 400-normal / 600-normal /
400-italic 三档，斜体用在海报的 context 行。来源 `@fontsource/source-serif-4@5.3.0`
的 latin 子集，`npm pack` 取 tarball，不装进 node_modules（见 CLAUDE.md 第 3 条）。

实测这三个是**静态实例**：无 `fvar` 表，`usWeightClass` 分别 400/600/400，
331–336 字形 / 231 码位，`—`（em dash）、`·`、弯引号都在。对 satori 是好事——
它对可变字体支持有限，静态档直接能用。

⚠️ 但交付文档写的是 optical size 8–60。静态实例把 opsz 烤死在一个值上，76px 的
大标题拿到的未必是设计稿预览时那一版字形。渲染器动工时先出一张 76px 对比图核一下，
别默认等同。

## 转换时踩过的坑（2026-09-17）

`pip install brotli` 和 `python3` 可能不是同一个解释器（Cindy 机器上 pip 指向
miniconda 3.13、`python3` 指向 python.org 3.12），结果是 fontTools 在，brotli 不在，
报 `No module named brotli`——而且**不生成任何文件**，`npm test` 照样绿（Y 段只
核对已存在的 ttf）。用 `python3 -m pip install` 强制同一解释器。
