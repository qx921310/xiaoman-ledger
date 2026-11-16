#!/usr/bin/env node
/**
 * 造演示数据：覆盖多种时间单位、多类型资产、足量账单，便于看统计。
 * 用法：node scripts/seed-demo.mjs [url] [--months 12] [--perMonth 12]
 * 输出：EMAIL / 期望值（账单数、总收入、总支出、各账户余额）
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const BASE = (args[0] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const MONTHS = Number(arg('months', '12'))
const PER_MONTH = Number(arg('perMonth', '12'))
const EMAIL = arg('email', `demo-${Date.now().toString(36)}@xiaoman.test`)
const PASSWORD = 'DemoTest12345'
mkdirSync('.seed', { recursive: true })

const post = (path, body) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
let r = await post('/api/auth/register', { email: EMAIL, password: PASSWORD })
let j = await r.json()
if (j.code !== 0) { r = await post('/api/auth/login', { email: EMAIL, password: PASSWORD }); j = await r.json() }
const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
const api = async (p, init = {}) => (await fetch(`${BASE}${p}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const push = async (records) => api('/api/data/push', { method: 'POST', body: JSON.stringify({ protocolVersion: 2, records }) })

let snap = await pull()
const gen = new Map((snap.generations ?? []).map((g) => [String(g.bookId), g.generation]))
let bookId = [...gen.keys()][0]
if (!bookId) {
  // 新账号还没进过 App，服务端只有分类；先建一个账本
  const created = await api('/api/books/create', { method: 'POST', body: JSON.stringify({ name: '演示账本' }) })
  bookId = created.result?.bookId
  if (!bookId) throw new Error('建账本失败：' + JSON.stringify(created).slice(0, 120))
  snap = await pull()
  for (const g of snap.generations ?? []) gen.set(String(g.bookId), g.generation)
  console.log('created book', bookId)
}
// 新账号的分类由客户端首次加载时种下并推送：先用 CDP 打开一次应用完成初始化
{
  const PORT = 9533
  const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  const proc = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${process.cwd()}/.seed/profile`, 'about:blank'], { stdio: 'ignore' })
  let wsUrl = ''
  for (let i = 0; i < 80 && !wsUrl; i += 1) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const pg = l.find((t) => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl } catch { /* 等 */ }
    if (!wsUrl) await new Promise((r) => setTimeout(r, 250))
  }
  if (wsUrl) {
    const ws = new WebSocket(wsUrl)
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
    let id = 0
    const pending = new Map()
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
    const call = (method, params = {}, sid) => { const n = ++id; ws.send(JSON.stringify({ id: n, method, params, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => pending.set(n, r)) }
    const t = await call('Target.createTarget', { url: 'about:blank' })
    const a = await call('Target.attachToTarget', { targetId: t.result.targetId, flatten: true })
    const sid = a.result.sessionId
    await call('Network.enable', {}, sid)
    const [name, ...rest] = cookie.split('=')
    await call('Network.setCookie', { name, value: rest.join('='), domain: new URL(BASE).host, path: '/' }, sid)
    await call('Page.navigate', { url: BASE }, sid)
    await new Promise((r) => setTimeout(r, 8000))
  }
  proc.kill()
  await new Promise((r) => setTimeout(r, 1000))
}
snap = await pull()
for (const g2 of snap.generations ?? []) gen.set(String(g2.bookId), g2.generation)
const parents = (snap.records ?? []).filter((x) => x.kind === 'parent' && !x.deleted)
const children = (snap.records ?? []).filter((x) => x.kind === 'child' && !x.deleted)
console.log('parents', parents.length, 'sample', JSON.stringify(parents[0]?.payload ?? null).slice(0, 120))
const expenseParents = parents.filter((p) => (p.payload?.kind ?? 'expense') === 'expense')
const incomeParents = parents.filter((p) => p.payload?.kind === 'income')
const versionOf = new Map()
for (const rec of snap.records ?? []) versionOf.set(`${rec.kind}:${rec.id}`, rec.version ?? 0)

const send = async (kind, id, payload) => {
  const key = `${kind}:${id}`
  const baseVersion = versionOf.get(key) ?? 0
  const res = await push([{ kind, id, bookId, generation: gen.get(String(bookId)) ?? 0, operationId: randomUUID(), baseVersion, updatedAt: Date.now(), payload: { ...payload, bookId } }])
  const st = res.result?.results?.[0]?.status
  versionOf.set(key, (baseVersion ?? 0) + 1)
  return st
}

// ---- 账户：覆盖现金/储蓄/信用卡/投资/借出 ----
const assetSpecs = [
  { name: '现金钱包', type: 1, amount: 860.5, currency: 'CNY' },
  { name: '工资储蓄卡', type: 1, amount: 26800, currency: 'CNY' },
  { name: '招商信用卡', type: 2, amount: -3260.4, currency: 'CNY' },
  { name: '基金账户', type: 3, amount: 15800, currency: 'CNY' },
  { name: '美元账户', type: 1, amount: 520, currency: 'USD' },
]
const assetIds = []
for (const spec of assetSpecs) {
  const id = `demo-asset-${randomUUID()}`
  const st = await send('asset', id, {
    assetId: id, assetName: spec.name, simpleName: spec.name.slice(0, 4), assetType: spec.type,
    assetNumber: spec.amount, openingBalance: spec.amount, currency: spec.currency, ownerId: 0
  })
  if (st === 'accepted' || st === 'duplicate') assetIds.push({ id, ...spec })
  console.log('asset', spec.name, st)
}

// ---- 账单：跨 12 个月、按天分布 ----
const now = new Date()
const bills = []
let incomeSum = 0
let expenseSum = 0
for (let m = 0; m < MONTHS; m += 1) {
  const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1)
  for (let i = 0; i < PER_MONTH; i += 1) {
    const day = 1 + ((i * 7 + m * 3) % 27)
    const time = new Date(monthDate.getFullYear(), monthDate.getMonth(), day, 9 + (i % 10), (i * 13) % 60).getTime()
    const isIncome = i % 6 === 0
    const parent = isIncome ? incomeParents[i % incomeParents.length] : expenseParents[i % expenseParents.length]
    const child = children.find((c) => Number(c.payload?.parentId) === Number(parent?.payload?.id))
    const cost = isIncome ? 3000 + ((i * 137) % 5000) : 12 + ((i * 37 + m * 11) % 380)
    const asset = assetIds[(i + m) % assetIds.length]
    const id = `demo-bill-${randomUUID()}`
    const payload = {
      billId: id, syncId: id, time, cost, billType: 2,
      parentCategoryId: parent?.payload?.id ?? null,
      childCategoryId: child?.payload?.id ?? null,
      assetId: asset?.id, remark: isIncome ? `月薪-${m + 1}` : `日常-${i + 1}`,
      accountAmount: cost, accountCurrency: asset?.currency ?? 'CNY'
    }
    const st = await send('bill', id, payload)
    if (st === 'accepted' || st === 'duplicate') {
      bills.push({ id, time, cost, isIncome })
      if (isIncome) incomeSum += cost; else expenseSum += cost
    }
  }
  console.log('month', m + 1, 'bills', bills.length)
}

// ---- 少量转账与退款，覆盖更多路径 ----
const transferSt = await send('transfer', `demo-transfer-${randomUUID()}`, {
  transferId: `demo-transfer-${randomUUID()}`, fromAssetId: assetIds[1].id, toAssetId: assetIds[0].id,
  cost: 800, time: now.getTime(), remark: '取现'
})
console.log('transfer', transferSt)
const firstExpense = bills.find((b) => !b.isIncome)
let refundSt = 'skip'
if (firstExpense) {
  refundSt = await send('refund', `${Date.now()}`, {
    refundId: Date.now(), billId: firstExpense.id, number: 5, baseAmount: 5, currency: 'CNY',
    assetId: firstExpense.assetId ?? assetIds[0].id
  })
  console.log('refund', refundSt)
}

const final = await pull()
const allBills = (final.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted)
const report = {
  email: EMAIL, password: PASSWORD, bookId,
  bills: allBills.length, incomeSum, expenseSum,
  months: MONTHS, perMonth: PER_MONTH,
  assets: assetIds.map((a) => ({ name: a.name, type: a.type, amount: a.amount, currency: a.currency })),
  transfers: (final.records ?? []).filter((x) => x.kind === 'transfer' && !x.deleted).length,
  refunds: (final.records ?? []).filter((x) => x.kind === 'refund' && !x.deleted).length
}
writeFileSync('.seed/demo.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ email: EMAIL, bills: report.bills, incomeSum, expenseSum, assets: report.assets.length, transfers: report.transfers, refunds: report.refunds }, null, 2))
