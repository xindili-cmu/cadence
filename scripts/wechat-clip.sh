#!/usr/bin/env bash
#
# wechat-clip.sh — 公众号发布助手（仅 macOS）
#
# 把当天日报正文以「富文本」写进剪贴板，省掉「双击开 html → Cmd+A → Cmd+C」三步。
# 顺带：助推合规自检、开公众号后台、在 Finder 里定位封面图、打印标题+摘要。
#
# 用法：
#   ./scripts/wechat-clip.sh              # 最新一期
#   ./scripts/wechat-clip.sh 2026-07-27   # 指定某天
#   ./scripts/wechat-clip.sh --dry-run    # 只做校验，不碰剪贴板/不开窗口（Linux 也能跑）
#   ./scripts/wechat-clip.sh --force      # 合规自检有命中时仍继续
#
# 不做的事：不点「群发」。发布永远是人工。
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

DRY_RUN=0
FORCE=0
DATE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force)   FORCE=1 ;;
    -*)        echo "未知参数：$arg" >&2; exit 2 ;;
    *)         DATE="$arg" ;;
  esac
done

# ---------- 1. 解析日期 ----------
if [ -z "$DATE" ]; then
  DATE="$(ls briefs 2>/dev/null \
    | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.html$' \
    | sort | tail -1 | sed 's/\.html$//')"
  [ -n "$DATE" ] || { echo "✗ briefs/ 下没有任何 YYYY-MM-DD.html" >&2; exit 1; }
  echo "· 未指定日期，用最新一期：$DATE"
fi

HTML="briefs/$DATE.html"
MD="briefs/$DATE.md"
COVER="briefs/$DATE-cover.png"
META="briefs/$DATE.meta.txt"

# ---------- 2. 文件校验 ----------
[ -f "$HTML" ] || { echo "✗ 找不到 $HTML" >&2; exit 1; }
[ -s "$HTML" ] || { echo "✗ $HTML 是空文件" >&2; exit 1; }
echo "✓ 正文  $HTML  ($(wc -c < "$HTML" | tr -d ' ') bytes)"

if [ -f "$COVER" ]; then
  echo "✓ 封面  $COVER"
else
  echo "⚠ 缺封面 $COVER —— 你得自己在后台挑一张"
  COVER=""
fi

if [ -f "$META" ]; then
  echo "✓ meta  $META"
else
  echo "⚠ 缺 $META —— 标题/摘要要自己写"
fi

# ---------- 3. 助推合规自检 ----------
# 规则见 PUBLISHING.md：正文/页脚/「阅读原文」一律零站外指向，
# 否则触《微信公众平台推荐运营规范》5.4 导流内容，助推会被拒。
CHECK_FILES="$HTML"
[ -f "$MD" ] && CHECK_FILES="$CHECK_FILES $MD"
# shellcheck disable=SC2086
# 注意：brief 的 html 是压缩成单行的，所以只截取命中处前后各 40 字符，
# 别用 grep -n 打整行（会喷出一整个 11KB 的 <section>）。
if HITS="$(grep -ohiE '.{0,40}(http|incadence|阅读原文).{0,40}' $CHECK_FILES 2>/dev/null)"; then
  echo ""
  echo "✗ 助推合规自检有命中（站外链接会让助推被拒）："
  echo "$HITS" | head -20 | sed 's/^/    …/;s/$/…/'
  echo ""
  if [ "$FORCE" -eq 1 ]; then
    echo "⚠ --force：忽略上面的命中，继续。"
  else
    echo "  修 wechat-brief.js 源头后重生成；确认无害可加 --force。"
    exit 1
  fi
else
  echo "✓ 助推合规自检通过（无 http / incadence / 阅读原文）"
fi

# ---------- 4. 富文本写剪贴板（macOS only） ----------
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "· --dry-run：跳过剪贴板与开窗口。"
else
  [ "$(uname)" = "Darwin" ] || {
    echo "✗ 剪贴板这步只在 macOS 上有效（当前 $(uname)）。用 --dry-run 只做校验。" >&2
    exit 1
  }

  # 把 HTML 以 public.html flavor 放上剪贴板 —— 等价于在浏览器里 Cmd+A/Cmd+C，
  # 所以粘进公众号编辑器时内联样式会保留。
  if command -v xxd >/dev/null 2>&1; then
    HEX="$(xxd -p "$HTML" | tr -d '\n')"
  else
    HEX="$(hexdump -ve '1/1 "%.2x"' "$HTML")"
  fi

  SCPT="$(mktemp -t wechatclip)"
  printf 'set the clipboard to «data HTML%s»\n' "$HEX" > "$SCPT"
  osascript "$SCPT"
  rm -f "$SCPT"

  # 读回校验：clipboard info 里必须出现 HTML flavor
  if osascript -e 'clipboard info' | grep -q 'HTML'; then
    echo "✓ 已把正文以富文本写进剪贴板（直接 Cmd+V 粘贴，别再开 html 文件）"
  else
    echo "✗ 剪贴板里没看到 HTML flavor —— 回退到手动：双击开 $HTML → Cmd+A → Cmd+C" >&2
    exit 1
  fi

  # 在 Finder 里定位封面，方便待会儿拖去后台
  [ -n "$COVER" ] && open -R "$COVER"

  # 打开公众号后台（登录后自己点「新的创作 → 图文」；编辑器直链带 session token，写死没用）
  open "https://mp.weixin.qq.com/"
fi

# ---------- 5. 打印标题 / 摘要 ----------
echo ""
echo "──────── $DATE ────────"
if [ -f "$META" ]; then
  cat "$META"
else
  echo "（无 meta.txt）"
fi
echo "───────────────────────"
echo ""
echo "接下来（都由你手动做）："
echo "  1. 后台「新的创作 → 图文」→ 正文框 Cmd+V"
echo "  2. 标题 / 摘要 照上面填；「阅读原文」留空"
[ -n "$COVER" ] && echo "  3. 封面用 Finder 里已选中的 $(basename "$COVER")（2.35:1）"
echo "  4. 自己点「群发」→ 发完在文章「…」里选「助推」"
