#!/usr/bin/env node
/**
 * 双设备并发写入的云端裁判：核对总量、金额、重复、丢失与幂等结果。
 * 用法：node scripts/dual-verify.mjs [--tag-prefix sim] [--expect-each 6]
 */
const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const PREFIX = arg('tag-prefix', 'sim')
const EXPECT_EACH = Number(arg('expect-each', '6'))
const BASE = arg('url', 'https://staging.ledger.yele.win').replace(/\/$/, '')
const EMAIL = arg('email', 'dual2@xiaoman.test')
const PASSWORD = arg('password', 'DualTest12345')

let cookie = ''
const call = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
  return res.json()
}

const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
if (login.code !== 0) { console.error('登录失败', login); process.exit(1) }
const pulled = await call('/api/data/pull?protocolVersion=2')
const records = pulled.result?.records ?? []
const mine = records.filter((r) => String(r.kind) === 'bill' && (String(r.id).startsWith(`${PREFIX}A-`) || String(r.id).startsWith(`${PREFIX}B-`)))
const byDevice = { A: [], B: [] }
for (const r of mine) {
  const dev = String(r.id).startsWith(`${PREFIX}A-`) ? 'A' : 'B'
  byDevice[dev].push(r)
}
const sum = (list) => list.reduce((n, r) => n + Number(r.payload?.cost ?? 0), 0)
const ids = mine.map((r) => String(r.id))
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i)
const idem = mine.filter((r) => String(r.id).includes('-idem-'))

const report = {
  total: mine.length,
  deviceA: { count: byDevice.A.length, sum: sum(byDevice.A) },
  deviceB: { count: byDevice.B.length, sum: sum(byDevice.B) },
  idempotentRecords: idem.length,
  duplicateIds: dupIds.length,
  missingA: Math.max(0, EXPECT_EACH + 1 - byDevice.A.length),
  missingB: Math.max(0, EXPECT_EACH + 1 - byDevice.B.length),
  verdict: 'unknown'
}
const okCounts = byDevice.A.length >= EXPECT_EACH + 1 && byDevice.B.length >= EXPECT_EACH + 1
const okIdem = idem.length === 2
const okDup = dupIds.length === 0
report.verdict = okCounts && okIdem && okDup ? 'PASS' : 'FAIL'
console.log(JSON.stringify(report, null, 2))
console.log('期望：每台设备 ' + (EXPECT_EACH + 1) + ' 条（含 1 条幂等记录），合计 ' + (EXPECT_EACH * 2 + 2) + ' 条；重复 ID 必须为 0')
