#!/usr/bin/env bash
# 部署到远程服务器。
# 用法：bash deploy/deploy.sh [ssh-alias] [prod|staging]
# 注意：打包文件必须放在项目内（Windows 原生 scp.exe 读不到 MSYS 的 /tmp）。
set -euo pipefail
HOST="${1:-seoul}"
ENV_NAME="${2:-prod}"

if [ "$ENV_NAME" = "staging" ]; then
  REMOTE_DIR="/opt/ledger-app-staging"
  SERVICE="ledger-app-staging"
  LOCAL_TAR=".deploy/ledger-app-staging.tar.gz"
  REMOTE_TAR="/tmp/ledger-app-staging.tar.gz"
else
  REMOTE_DIR="/opt/ledger-app"
  SERVICE="ledger-app"
  LOCAL_TAR=".deploy/ledger-app.tar.gz"
  REMOTE_TAR="/tmp/ledger-app.tar.gz"
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "==> 构建 + 检查（$ENV_NAME）"
npm run build

echo "==> 打包"
mkdir -p .deploy
tar czf "$LOCAL_TAR" --exclude="server/data" dist server package.json

echo "==> 上传到 $HOST"
scp -q "$LOCAL_TAR" "$HOST:$REMOTE_TAR"

echo "==> 解包并重启 $SERVICE"
ssh "$HOST" "sudo mkdir -p $REMOTE_DIR && sudo tar xzf $REMOTE_TAR -C $REMOTE_DIR && sudo chown -R ubuntu:ubuntu $REMOTE_DIR && sudo systemctl restart $SERVICE && sleep 1 && systemctl is-active $SERVICE"
echo "==> 完成（$ENV_NAME）"
