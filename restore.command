#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js 18 或更高版本（例如：brew install node）。"
  read -r -p "按回车键退出..."
  exit 1
fi

set +e
node "$SCRIPT_DIR/scripts/restore.mjs" "$@"
RC=$?
set -e

if [ $# -eq 0 ] && [ -t 0 ]; then
  echo
  read -r -p "按回车键关闭窗口..."
fi
exit $RC
