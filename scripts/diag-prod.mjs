#!/usr/bin/env node
/**
 * 生产诊断（只读）：一条命令拉齐「服务状态 + 结构化日志 + 数据库快照」。
 * 用法：
 *   node scripts/diag-prod.mjs                        # 最近 30 分钟
 *   node scripts/diag-prod.mjs --minutes 120          # 最近 2 小时
 *   node scripts/diag-prod.mjs --since "2026-11-15 15:30:00"
 *   node scripts/diag-prod.mjs --path /api/data/push  # 只看某个接口
 *   node scripts/diag-prod.mjs --errors               # 只看错误行
 * 说明：只读，不写生产数据；不输出邮箱、密码、账单内容。
 */
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const flag = (n) => args.includes(`--${n}`)
const MINUTES = Number(arg('minutes', '30'))
const SINCE = arg('since', '')
const PATH_FILTER = arg('path', '')
const ERRORS_ONLY = flag('errors')
const HOST = arg('host', 'seoul')

const ssh = (cmd) => {
  try { return execFileSync('ssh', [HOST, cmd], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) }
  catch (e) { return `[ssh 失败] ${e.message}` }
}

const sinceArg = SINCE ? `--since "${SINCE}"` : `--since "-${MINUTES} min"`

console.log('===== 1. 服务与机器 =====')
console.log(ssh(`systemctl is-active ledger-app; systemctl show ledger-app -p ActiveEnterTimestamp --value; uptime; df -h / | tail -1; free -m | head -2`).trim())

console.log('\n===== 2. 健康检查（含计数与运行时长）=====')
console.log(ssh(`curl -s https://ledger.yele.win/api/health`).trim())

console.log(`\n===== 3. 请求日志（${SINCE || `最近 ${MINUTES} 分钟`}）=====`)
{
  const raw = ssh(`sudo journalctl -u ledger-app ${sinceArg} --no-pager -o cat | grep '"p":"/api/' | tail -400`)
  const lines = raw.split('\n').filter((l) => l.trim().startsWith('{'))
  const parsed = []
  for (const line of lines) { try { parsed.push(JSON.parse(line)) } catch { /* 非 JSON 忽略 */ } }
  const filtered = parsed.filter((x) => (!PATH_FILTER || String(x.p).startsWith(PATH_FILTER)) && (!ERRORS_ONLY || Number(x.s) >= 400))
  const byPath = new Map()
  for (const x of filtered) {
    const key = `${x.m} ${x.p}`
    const cur = byPath.get(key) ?? { n: 0, err: 0, maxMs: 0, codes: new Set() }
    cur.n += 1
    if (Number(x.s) >= 400) cur.err += 1
    cur.maxMs = Math.max(cur.maxMs, Number(x.ms) || 0)
    cur.codes.add(x.s)
    byPath.set(key, cur)
  }
  console.log(`条目 ${filtered.length} 条（原始 ${parsed.length} 条）`)
  for (const [k, v] of [...byPath.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20)) {
    console.log(`  ${k}  ×${v.n}  错误 ${v.err}  最慢 ${v.maxMs}ms  状态 ${[...v.codes].join('/')}`)
  }
  if (ERRORS_ONLY || filtered.some((x) => Number(x.s) >= 400)) {
    console.log('\n  最近错误明细：')
    for (const x of filtered.filter((y) => Number(y.s) >= 400).slice(-15)) {
      console.log(`   ${x.t} ${x.m} ${x.p} → ${x.s} uid=${x.uid ?? 0} ${x.ms}ms reqId=${x.reqId ?? '-'}`)
    }
  }
}

console.log('\n===== 4. 异常栈（未捕获错误）=====')
console.log(ssh(`sudo journalctl -u ledger-app ${sinceArg} --no-pager -o cat | grep '"stack"' | tail -10`).trim() || '（无）')

console.log('\n===== 5. 数据库快照（只读）=====')
console.log(ssh(`sudo node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/opt/ledger-app/server/data/ledger.db', { readOnly: true });
const q = (s) => { try { return db.prepare(s).all() } catch (e) { return [{ err: e.message }] } };
console.log('users', JSON.stringify(q('SELECT COUNT(*) n FROM users')));
console.log('books', JSON.stringify(q('SELECT COUNT(*) n FROM books')));
console.log('records', JSON.stringify(q('SELECT COUNT(*) n FROM records')));
console.log('最近 5 条记录', JSON.stringify(q('SELECT kind, rid, user_id, book_id, revision, datetime(updated_at/1000,\\'unixepoch\\',\\'+9 hours\\') t FROM records ORDER BY updated_at DESC LIMIT 5')));
console.log('最近 5 个账本更新', JSON.stringify(q('SELECT book_id, name, generation, datetime(updated_at/1000,\\'unixepoch\\',\\'+9 hours\\') t FROM books ORDER BY updated_at DESC LIMIT 5')));
console.log('会话数', JSON.stringify(q('SELECT COUNT(*) n FROM sessions')));
"`).trim())

console.log('\n===== 6. 磁盘与备份 =====')
console.log(ssh(`ls -lh /opt/backups | tail -5`).trim())

console.log('\n提示：把「发生时间 + 你做了什么 + 界面截图」给我，我用 --since 和 --path 就能锁定那一次请求。')
