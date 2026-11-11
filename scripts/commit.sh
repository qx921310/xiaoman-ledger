#!/usr/bin/env bash
# 受约束的提交入口：必须显式列出要提交的文件，禁止“一 add 一大片”。
# 用法：bash scripts/commit.sh "提交说明" <file> [file...]
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "用法：bash scripts/commit.sh \"提交说明\" <文件> [文件...]" >&2
  echo "拒绝执行：本脚本不接受无文件列表的提交（防止把他人在改的文件卷进来）。" >&2
  exit 2
fi

MSG="$1"; shift
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# 校验每个路径都存在（或被 git 跟踪），并打印清单让人看见
printf '== 将要提交的文件 ==\n'
for f in "$@"; do
  if [ ! -e "$f" ] && ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    echo "  不存在：$f" >&2
    exit 3
  fi
  printf '  %s\n' "$f"
done

# 提示工作区里还有哪些改动**没有**被包含（避免漏提交，也提醒别误伤）
others=$(git status --porcelain | awk '{print $2}' | grep -vxF -f <(printf '%s\n' "$@") || true)
if [ -n "$others" ]; then
  printf '\n== 未包含的改动（确认是否故意留下）==\n%s\n' "$others"
fi

git add -- "$@"
git -c user.name="qx921310" -c user.email="qx921310@users.noreply.github.com" commit -q -m "$MSG"
git log --oneline -1
