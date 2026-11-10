#!/usr/bin/env bash
# 部署到首尔服务器。用法：./deploy/deploy.sh [ssh-alias]
set -euo pipefail
HOST="${1:-seoul}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "==> 构建"
npm run build

echo "==> 打包"
tar czf /tmp/ledger-app.tar.gz dist server package.json

echo "==> 上传到 $HOST"
scp -q /tmp/ledger-app.tar.gz "$HOST:/tmp/ledger-app.tar.gz"

echo "==> 解包并重启"
ssh "$HOST" 'sudo mkdir -p /opt/ledger-app && sudo tar xzf /tmp/ledger-app.tar.gz -C /opt/ledger-app && sudo chown -R ubuntu:ubuntu /opt/ledger-app && sudo systemctl restart ledger-app && sleep 1 && systemctl is-active ledger-app'
echo "==> 完成"
