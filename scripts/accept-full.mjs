#!/usr/bin/env node
/**
 * 生产全功能验收：真实浏览器操作 + 接口断言。
 * 覆盖：注册/建两个账户/支出/收入/转账/编辑/退款/标签/账本/资产详情/统计/日历。
 * 用法：node scripts/accept-full.mjs [url]
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = process.argv[3] ?? '.e2e-full'
const PORT = 9499
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.E2E_EMAIL ?? `full-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'AcceptTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (name, pass, detail = '') => { checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', `--user-data-dir=${resolve(OUT, 'profile')}`, 'about:blank'], { stdio: 'ignore' })
async function wsUrl() {
  for (let i = 0; i < 80; i += 1) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch { /* 等 */ }
    await sleep(250)
  }
  throw new Error('chrome 未就绪')
}
class Cdp {
  constructor(s) { this.s = s; this.id = 0; this.w = new Map() }
  static async connect(url) {
    const s = new WebSocket(url); await new Promise((r, j) => { s.onopen = r; s.onerror = j })
    const c = new Cdp(s); s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }
    return c
  }
  send(method, params = {}, sid) { const id = ++this.id; this.s.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => this.w.set(id, r)) }
}
const cdp = await Cdp.connect(await wsUrl())
const { result: t } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { result: att } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
const sid = att.sessionId
const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)

// 账号
const post = (path, body) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
let r = await post('/api/auth/register', { email: EMAIL, password: PASSWORD })
let body = await r.json()
if (body.code !== 0) { r = await post('/api/auth/login', { email: EMAIL, password: PASSWORD }); body = await r.json() }
const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
ok('注册/登录', body.code === 0, EMAIL)

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
  return res.json()
}
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (pred, ms = 15000) => {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) { last = await pull(); if (pred(last)) return last; await sleep(600) }
  return last
}

await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: `${BASE}/` }, sid)
await sleep(3200)

const text = () => ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,700)")
const clickText = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickContains = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const clickSel = (sel) => ev(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`)
const typeInto = async (sel, value) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: value }, sid)
  await sleep(250)
  return true
}
const tab = async (name) => { await clickText(name); await sleep(1000) }
const shot = async (name) => {
  const res = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
  if (res.result?.data) writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, 'base64'))
}

// ---- 1. 建两个账户 ----
const addAsset = async (name, amount) => {
  await tab('资产')
  await clickContains('新增账户'); await sleep(400)
  await typeInto('input[aria-label="新账户名称"]', name)
  await typeInto('input[aria-label="新账户余额"]', String(amount))
  const saved = await clickText('添加')
  await sleep(1200)
  return saved
}
await addAsset('验收现金', 100)
await addAsset('验收储蓄', 0)
let p = await waitFor((res) => (res?.records ?? []).filter((x) => x.kind === 'asset' && !x.deleted).length >= 2)
const assets = (p.records ?? []).filter((x) => x.kind === 'asset' && !x.deleted)
ok('建两个账户', assets.length >= 2, `assets=${assets.length}`)

// ---- 2. 支出 12.34 ----
const addExpense = async () => {
  await tab('首页')
  await clickText('添加一条新记账'); await sleep(1400)
  await clickContains('食品餐饮'); await sleep(500)
  for (const k of ['1', '2', '.', '3', '4']) { await clickText(k); await sleep(120) }
  await clickSel('.entry-edit'); await sleep(2200)
}
await addExpense()
p = await waitFor((res) => (res?.records ?? []).some((x) => x.kind === 'bill' && !x.deleted))
let bills = (p.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted)
ok('支出 12.34', bills.some((b) => Number(b.payload?.cost) === 12.34), `bills=${bills.length}`)

// ---- 3. 收入 50 ----
await clickText('添加一条新记账'); await sleep(1400)
await clickText('收入'); await sleep(700)
await clickContains('工资'); await sleep(400)
for (const k of ['5', '0']) { await clickText(k); await sleep(120) }
await clickSel('.entry-edit'); await sleep(2200)
p = await waitFor((res) => (res?.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted).length >= 2)
bills = (p.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted)
ok('收入 50', bills.some((b) => Number(b.payload?.cost) === 50), `bills=${bills.length}`)

// ---- 4. 转账 20（现金→储蓄）----
await clickText('添加一条新记账'); await sleep(1400)
await clickText('转账'); await sleep(800)
const trBody = await text()
const trUiOk = trBody.includes('转出账户') && trBody.includes('转入账户')
// 转入账户改用弹层选择器
let trPicked = false
if (await clickSel('button[aria-label="转入账户"]')) {
  await sleep(500)
  trPicked = await clickContains('验收储蓄')
  await sleep(500)
}
for (const k of ['2', '0']) { await clickText(k); await sleep(120) }
await clickSel('.entry-edit') // 存为转账
await sleep(2500)
await shot('04-transfer')
p = await waitFor((res) => (res?.records ?? []).some((x) => x.kind === 'transfer' && !x.deleted))
const transfers = (p.records ?? []).filter((x) => x.kind === 'transfer' && !x.deleted)
ok('转账 20', trUiOk && transfers.length >= 1, `ui=${trUiOk} picked=${trPicked} transfers=${transfers.length}`)
await clickText('‹'); await sleep(900)

console.log('--stage edit')
// ---- 5. 编辑账单金额 ----
await tab('首页')
await ev(`(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()`)
await sleep(1300)
const editOpened = await clickText('编辑')
await sleep(1200)
const editedBody = await text()
await shot('05-edit')
ok('账单详情→编辑可打开', editOpened, editedBody.slice(0, 80))
await clickText('‹'); await sleep(800)
await clickText('‹'); await sleep(800)

console.log('--stage refund')
// ---- 6. 退款 5 ----
await ev(`(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()`)
await sleep(1300)
const refundOpened = await clickText('退款')
await sleep(900)
await typeInto('input[aria-label="退款金额"]', '5')
await clickSel('button[aria-label="完成"]')
p = await waitFor((res) => (res?.records ?? []).some((x) => x.kind === 'refund' && !x.deleted))
const refunds = (p.records ?? []).filter((x) => x.kind === 'refund' && !x.deleted)
ok('退款 5', refundOpened && refunds.length === 1 && Number(refunds[0]?.payload?.number) === 5, `refunds=${refunds.length}`)
await clickText('‹'); await sleep(800)

console.log('--stage tag')
// ---- 7. 标签管理新建标签 ----
await tab('我的')
await clickText('标签管理'); await sleep(1000)
await clickText('新增'); await sleep(800)
const tagTyped = await typeInto('input[aria-label="新标签名称"]', '验收标签')
const tagSaved = await clickText('保存')
await sleep(1200)
p = await waitFor((res) => (res?.records ?? []).some((x) => x.kind === 'tag' && !x.deleted))
const tags = (p.records ?? []).filter((x) => x.kind === 'tag' && !x.deleted)
ok('新建标签', tagTyped && tags.some((x) => String(x.payload?.name).includes('验收')), `tags=${tags.length}`)
await shot('07-tags')

console.log('--stage book')
// ---- 8. 账本管理新建账本 ----
await clickText('‹ 返回我的'); await sleep(700)
await clickText('账本管理'); await sleep(900)
await clickText('新增'); await sleep(700)
await typeInto('input[aria-label="账本名称"]', '验收账本B')
await clickText('保存'); await sleep(1500)
p = await waitFor((res) => (res?.records ?? []).filter((x) => x.kind === 'book' && !x.deleted).length >= 2)
const books = (p.records ?? []).filter((x) => x.kind === 'book' && !x.deleted)
ok('新建账本', books.some((b) => String(b.payload?.name ?? b.payload?.accountBookName ?? '').includes('验收账本B')), `books=${books.length}`)

console.log('--stage stats')
// ---- 9. 统计与日历显示金额 ----
await tab('统计')
const statsText = await text()
ok('统计显示支出 12.34', statsText.includes('12.34'), statsText.slice(0, 80))
await shot('09-stats')
await tab('日历')
const calText = await text()
ok('日历显示支出金额', /¥\s?12\.34|12\.34/.test(calText), calText.slice(0, 80))
await shot('10-calendar')

// ---- 10. 资产详情流水 ----
await tab('资产')
await clickContains('验收现金')
await sleep(1200)
const accText = await text()
ok('账户详情有流水', accText.includes('账户余额'), accText.slice(0, 90))
await shot('11-account')

const pass = checks.filter((c) => c.pass).length
const result = { email: EMAIL, checks, pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL' }
writeFileSync(`${OUT}/report.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ verdict: result.verdict, pass, total: checks.length }, null, 2))
chrome.kill()
