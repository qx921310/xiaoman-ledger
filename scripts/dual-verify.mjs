#!/usr/bin/env node
/**
 * 精确裁判：用本轮 runId 与两台设备日志里的 expectedIds 做集合核对，
 * 不再依赖「数量不少于预期」这种会被历史数据骗过的判断。
 * 用法：node scripts/dual-verify.mjs --run <runId>
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const RUN = arg('run', '')
const BASE = arg('url', 'https://staging.ledger.yele.win').replace(/\/$/, '')
const EMAIL = arg('email', 'dual2@xiaoman.test')
const PASSWORD = arg('password', 'DualTest12345')
if (!RUN) { console.error('必须给 --run <runId>，与两台设备保持一致'); process.exit(1) }

const logs = {}
for (const d of ['A', 'B']) {
  try { logs[d] = JSON.parse(readFileSync(`.dualdev/${d}.json`, 'utf8')) } catch { console.error(`缺少 .dualdev/${d}.json`); process.exit(1) }
  if (logs[d].run !== RUN) { console.error(`.dualdev/${d}.json 的 runId=${logs[d].run} 与 --run=${RUN} 不一致`); process.exit(1) }
}

let cookie = ''
const call = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
  return res.json()
}
const login = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
if (login.code !== 0) { console.error('登录失败', login); process.exit(1) }
const pulled = await call('/api/data/pull?protocolVersion=2')
const cloudIds = (pulled.result?.records ?? []).map((r) => String(r.id))

const expected = [...new Set([...logs.A.expectedIds, ...logs.B.expectedIds])]
const missing = expected.filter((id) => !cloudIds.includes(id))
const counts = new Map()
for (const id of cloudIds) if (expected.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1)
const duplicated = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id)
// 本轮不应出现超出 expected 的同 run 记录
const runPrefixed = cloudIds.filter((id) => id.includes(RUN))
const unexpected = runPrefixed.filter((id) => !expected.includes(id))

const report = {
  run: RUN,
  expected: expected.length,
  cloudRunPrefixed: runPrefixed.length,
  missing,
  duplicated,
  unexpected,
  verdict: missing.length === 0 && duplicated.length === 0 && unexpected.length === 0 ? 'PASS' : 'FAIL'
}
console.log(JSON.stringify(report, null, 2))
if (report.verdict !== 'PASS') process.exitCode = 2
