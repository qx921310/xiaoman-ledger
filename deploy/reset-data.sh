#!/usr/bin/env bash
# 清空线上业务数据（保留数据库文件本身），执行前自动备份。
# 用法: bash deploy/reset-data.sh seoul
set -euo pipefail
HOST="${1:-seoul}"
TS=$(date +%Y%m%d-%H%M%S)

ssh "$HOST" "set -e
  DB=/opt/ledger-app/server/data/ledger.db
  echo '== 备份 =='
  sudo cp \"\$DB\" \"\$DB.bak-$TS\"
  sudo ls -lh \"\$DB.bak-$TS\"

  echo '== 停止服务 =='
  sudo systemctl stop ledger-app

  echo '== 清空业务数据 =='
  for t in records bills assets books book_members book_member_numbers book_bill_numbers bill_periods invites sessions users kv; do
    sudo sqlite3 \"\$DB\" \"DELETE FROM \$t;\" 2>/dev/null && echo \"  cleared \$t\" || echo \"  skip \$t\"
  done

  echo '== 重启 =='
  sudo systemctl start ledger-app
  sleep 1
  systemctl is-active ledger-app
"
echo "备份文件: ledger.db.bak-$TS"
