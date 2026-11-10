#!/usr/bin/env bash
# 部署到远程服务器。用法：./deploy/deploy.sh [ssh-alias]
# 注意：打包文件必须放在项目内（Windows 原生 scp.exe 读不到 MSYS 的 /tmp）。
set -euo pipefail
HOST="${1:-seoul}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "==> 构建"
npm run build

echo "==> 打包"
mkdir -p .deploy
tar czf .deploy/ledger-app.tar.gz dist server package.json

echo "==> 上传到 $HOST"
scp -q .deploy/ledger-app.tar.gz "$HOST:/tmp/ledger-app.tar.gz"

echo "==> 解包并重启"
ssh "$HOST" 'sudo mkdir -p /opt/ledger-app && sudo tar xzf /tmp/ledger-app.tar.gz -C /opt/ledger-app && sudo chown -R ubuntu:ubuntu /opt/ledger-app && sudo systemctl restart ledger-app && sleep 1 && systemctl is-active ledger-app'
echo "==> 完成"
