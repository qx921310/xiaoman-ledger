#!/usr/bin/env node
/**
 * 用 UI 真实录入造干净数据（不经过接口造数，避免「待核对」）。
 * 内容：5 个账户（含信用卡/投资/外币）+ 12 笔支出 + 2 笔收入 + 1 转账 + 1 退款。
 * 用法：node scripts/seed-ui.mjs [url]
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.seed-ui'
const PORT = 9544
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.SEED_EMAIL ?? `ui-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'UiSeed12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (m) => console.log(`-- ${m}`)

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
  static async connect(u) { const s = new WebSocket(u); await new Promise((r, j) => { s.onopen = r; s.onerror = j }); const c = new Cdp(s); s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }; return c }
  send(m, p = {}, sid) { const id = ++this.id; this.s.send(JSON.stringify({ id, method: m, params: p, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => this.w.set(id, r)) }
}
const cdp = await Cdp.connect(await wsUrl())
const { result: t } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { result: a } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
const sid = a.sessionId
const ev = async (x) => (await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)

const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]
await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)

const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const clickSel = (sel) => ev(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`)
const pickSheet = async (label, optionText) => {
  if (!await clickSel(`button[aria-label="${label}"]`)) return false
  await sleep(450)
  const hit = await clickC(optionText)
  await sleep(450)
  return hit
}
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(200); return true
}
const tab = async (n) => { await click(n); await sleep(1100) }

// ---- 账户 ----
log('assets')
const specs = [
  ['现金钱包', '1000', '账户类型', '现金账户'],
  ['工资储蓄卡', '25000', '账户类型', '储蓄卡'],
  ['招商信用卡', '-3000', '账户类型', '信用卡'],
  ['基金账户', '12000', '账户类型', '投资账户'],
]
await tab('资产')
for (const [name, amount] of specs) {
  await clickC('新增账户'); await sleep(500)
  await typeInto('input[aria-label="新账户名称"]', name)
  await typeInto('input[aria-label="新账户余额"]', amount)
  await click('添加'); await sleep(1000)
}
log('assets done')

// ---- 支出 12 笔（分类轮换、金额递增） ----
const cats = ['食品餐饮', '购物消费', '出行交通', '居家生活', '休闲娱乐', '健康医疗']
log('expenses')
for (let i = 0; i < 12; i += 1) {
  await tab('首页')
  await click('添加一条新记账'); await sleep(1300)
  await clickC(cats[i % cats.length]); await sleep(400)
  const amt = String(10 + i * 7)
  for (const ch of amt) { await click(ch); await sleep(110) }
  await ev("document.querySelector('.entry-edit')?.click()")
  await sleep(1800)
}

// ---- 收入 2 笔 ----
log('incomes')
for (const [cat, amt] of [['工资', '8000'], ['奖金', '2000']]) {
  await tab('首页')
  await click('添加一条新记账'); await sleep(1300)
  await click('收入'); await sleep(600)
  await clickC(cat); await sleep(400)
  for (const ch of amt) { await click(ch); await sleep(110) }
  await ev("document.querySelector('.entry-edit')?.click()")
  await sleep(1800)
}

// ---- 转账 ----
log('transfer')
await tab('首页')
await click('添加一条新记账'); await sleep(1300)
await click('转账'); await sleep(700)
await pickSheet('转入账户', '基金账户')
for (const ch of '500') { await click(ch); await sleep(110) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2200)

// ---- 退款 5 元（对第一笔支出） ----
log('refund')
await tab('首页')
await ev(`(() => { const rows=[...document.querySelectorAll('.ledger-row')]; const r=rows[rows.length-1]; if(!r) return false; r.click(); return true })()`)
await sleep(1300)
await click('退款'); await sleep(800)
await typeInto('input[aria-label="退款金额"]', '5')
await clickSel('button[aria-label="完成"]'); await sleep(2000)

// ---- 汇总 ----
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = (await api('/api/data/pull?protocolVersion=2')).result
const count = (k) => (pull.records ?? []).filter((x) => x.kind === k && !x.deleted).length
const summary = { email: EMAIL, password: PASSWORD, bills: count('bill'), assets: count('asset'), transfers: count('transfer'), refunds: count('refund') }
writeFileSync(`${OUT}/account.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
chrome.kill()
