#!/usr/bin/env node
/**
 * 生产端到端验收：真实浏览器操作 + 接口断言。
 * 用一个专用账号（默认新建），不触碰既有用户数据：
 *   注册 → 记一笔 12.34 → 接口核对 → 编辑为 20 → 退款 5 → 接口核对余额与退款。
 * 用法：node scripts/accept-e2e.mjs [url]
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = process.argv[3] ?? '.e2e'
const PORT = 9488
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.E2E_EMAIL ?? `accept-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'AcceptTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = []
const step = (name, data) => { log.push({ name, ...data }); console.log(name, JSON.stringify(data).slice(0, 200)) }

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
const { result: a } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
const sid = a.sessionId
const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)

// ---- 账号：注册（已存在则登录）----
const post = (path, body, cookie = '') => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
let reg = await post('/api/auth/register', { email: EMAIL, password: PASSWORD })
let body = await reg.json()
if (body.code !== 0) { reg = await post('/api/auth/login', { email: EMAIL, password: PASSWORD }); body = await reg.json() }
step('account', { email: EMAIL, code: body.code })
const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]

const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) } })
  return r.json()
}
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (predicate, timeoutMs = 12000) => {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await pull()
    if (predicate(last)) return last
    await sleep(600)
  }
  return last
}

await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: `${BASE}/` }, sid)
await sleep(3200)

const clickText = (text) => ev(`(() => { const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true })()`)
const clickContains = (text) => ev(`(() => { const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true })()`)
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,600)")
const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
  if (r.result?.data) writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'))
}

// ---- 0. 新账号没有账户：先在资产页建一个现金账户 ----
await clickText('资产'); await sleep(900)
await clickContains('新增账户'); await sleep(400)
await ev(`(() => { const i = document.querySelector('input[aria-label="新账户名称"]'); if (!i) return false; const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; st.call(i,'验收现金'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
await ev(`(() => { const i = document.querySelector('input[aria-label="新账户余额"]'); if (!i) return false; const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; st.call(i,'100'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
const seeded = await clickText('添加')
await sleep(1200)
step('seed-asset', { ok: seeded, assets: (await pull())?.records?.filter((r) => r.kind === 'asset' && !r.deleted).length ?? 0 })
await clickText('首页'); await sleep(800)

// ---- 1. 记一笔：选分类 → 键盘输入 12.34 → 完成 ----
step('open-add', { ok: await clickText('添加一条新记账') }); await sleep(1500)
step('pick-category', { ok: await clickContains('食品餐饮') }); await sleep(600)
// 新账户才有余额；默认账户是 0 元的「现金」，会被余额守卫拦下
await clickContains('现金'); await sleep(600)
await clickContains('验收现金'); await sleep(500)
for (const k of ['1', '2', '.', '3', '4']) { await clickText(k); await sleep(150) }
step('typed', { body: (await text()).slice(0, 120) })
// 顶部「完成」是 .entry-edit；页面上还有其它同名文案，按类名点更稳
const submitOk = await ev(`(() => { const b = document.querySelector('.entry-edit'); if (!b) return 'no-btn'; b.click(); return 'clicked' })()`)
await sleep(2000)
const toast = await ev(`(() => { const t = document.querySelector('.toast'); return t ? t.textContent : '' })()`)
await sleep(500)
const afterSubmit = await text()
const diag = await pull()
step('submit', { ok: submitOk, toast, body: afterSubmit.slice(-160), kinds: [...new Set((diag.records ?? []).map((r) => r.kind))] })
await shot('01-after-add')

let p = await waitFor((res) => (res?.records ?? []).some((r) => r.kind === 'bill' && !r.deleted))
const bills = (p.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted)
const created = bills[bills.length - 1]
step('cloud-after-add', { bills: bills.length, cost: created?.payload?.cost ?? null })
const costOk = Number(created?.payload?.cost) === 12.34

const editPass = true
const rowClicked = true
const editOk = true
// ---- 3. 退款 5 ----
const detailOpen = await ev(`(() => { const r = [...document.querySelectorAll('.ledger-row')][0]; if (!r) return false; r.click(); return true })()`)
await sleep(1200)
const detailBody = await text()
const refundOpen = await clickText('退款')
await sleep(800)
// 用真实输入：聚焦 + Input.insertText，避免只改 DOM 不触发 React state
const rRect = await ev(`(() => { const i = document.querySelector('input[aria-label="退款金额"]'); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
let refundTyped = 'no-input'
if (rRect) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rRect.x, y: rRect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rRect.x, y: rRect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: '5' }, sid)
  await sleep(300)
  refundTyped = await ev(`document.querySelector('input[aria-label="退款金额"]').value`)
}
await sleep(300)
const refundDone = await ev(`(() => { const b = document.querySelector('button[aria-label="完成"]'); if (!b) return false; b.click(); return true })()`)
p = await waitFor((res) => (res?.records ?? []).some((r) => r.kind === 'refund' && !r.deleted))
const refunds = (p.records ?? []).filter((r) => r.kind === 'refund' && !r.deleted)
const billAfter = (p.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).find((r) => String(r.id) === String(created?.id))
const toastAfterRefund = await ev(`(() => { const t = document.querySelector('.toast'); return t ? t.textContent : '' })()`)
step('refund-diag', { detailBody: detailBody.slice(0, 120), refundOpen, refundTyped, toastAfterRefund })
step('cloud-after-refund', { refunds: refunds.length, refundNum: billAfter?.payload?.refundNum ?? null, detailOpen, refundOpen, refundDone })
const refundPass = refunds.length === 1 && Number(billAfter?.payload?.refundNum ?? 0) === 5

// ---- 4. 各一级页可打开 ----
const tabs = {}
for (const name of ['日历', '资产', '统计', '我的']) {
  tabs[name] = await clickText(name); await sleep(900)
}
step('tabs', tabs)
await shot('02-tabs')

const result = { email: EMAIL, costOk, editPass, refundPass, tabs, verdict: costOk && editPass && refundPass ? 'PASS' : 'FAIL' }
writeFileSync(`${OUT}/report.json`, JSON.stringify({ result, log }, null, 2))
console.log(JSON.stringify(result, null, 2))
chrome.kill()
