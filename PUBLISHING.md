# 发布 Runbook — Cadence 步频

两个渠道都是**日更**。XHS 半自动（浏览器代填到待发布），公众号纯手动（微信安全限制挡住浏览器自动化）。
两边的最后一步「发布 / 群发」都由 Cindy 本人点击——不可逆动作不交给自动化。

---

## 小红书（XHS）— 半自动

每天产物在 `xhs/YYYY-MM-DD/`：`cover.png` + `01.png … 0N.png`（每篇一张）+ 尾页 `0(N+1).png`（标签档位说明+关注引导）+ `caption.txt`（首行=标题，其余=正文）。

平台：creator.xiaohongshu.com（桌面端支持图文发布）。首次需 Cindy 短信登录一次，cookie 保留后免登。

**代填流程（Claude 用 Chrome 扩展驱动）：**

1. 打开 `creator.xiaohongshu.com/publish/publish` → 切到「上传图文」tab
2. 找到 file input，一次性上传全部图（8 篇时共 10 张）：`cover.png` 在前，编号图依序，最后一张编号图是尾页
3. 标题 = `caption.txt` 首行，填入标题框
4. **正文 = 整段注入，不要逐字 type**：
   - 已知问题：逐字 `type` 中文会偶发字符损坏（实测「荟萃」被打成「荇萃」）。
   - 正确做法：聚焦正文 contenteditable → 全选删除 → `document.execCommand('insertText', false, body)`。
     execCommand 会触发框架能识别的 input 事件，React 状态同步且字符不丢。
5. **注入后必做错字校验**：读回 `contenteditable.innerText`，对 caption 正文逐字（或抽查易错字）比对，确认 0 差异再继续。
6. 停在「发布」按钮前，截图交 Cindy 确认 → Cindy 点发布。

话题标签 `#xxx` 以纯文本保留即可（自动化触发话题选择器易乱；纯文本话题一样可被搜索到）。

## 公众号 — 纯手动（个人订阅号，无认证 → 无草稿/发布 API）

每天 `wechat-brief.js` 产出 `briefs/YYYY-MM-DD.html`（纯内联样式，外链已转文末参考文献）。

**每日 checklist：**

1. 双击打开 `briefs/当天.html`（浏览器渲染出排版）
2. `Cmd+A` → `Cmd+C` 全选复制
3. mp.weixin.qq.com 新建图文 → 正文框粘贴（内联样式保留）
4. 填标题、摘要、封面图
5. 自己点「群发」（微信要求人工 + 扫码确认）

> 个人订阅号每天 1 次群发限额，正好匹配日更。

---

## 节奏

XHS + 公众号均日更。开号篇 `briefs/wechat-launch-issue01.md` 已为日更口径。
月度另有「深度专题」与「月度榜单」（聚合脚本待建）。
