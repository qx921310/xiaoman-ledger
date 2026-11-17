#!/usr/bin/env node
/** 余额不足 / 额度不足 拦截验收。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const OUT = '.bal'
const PORT = 9641
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `bal-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'BalTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
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

const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]
await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)

const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const toast = () => ev(`(() => { const t=document.querySelector('.toast'); return t ? t.textContent : '' })()`)
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(200); return true
}
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const bills = async () => ((await pull()).records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).length

// 账户 100
await click('资产'); await sleep(1100)
await clickC('新增账户'); await sleep(600)
await typeInto('input[aria-label="新账户名称"]', '余额测试')
await typeInto('input[aria-label="新账户余额"]', '100')
await click('添加'); await sleep(1400)

// 支出 150 → 应被拦
await click('首页'); await sleep(900)
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
// 选到刚建的账户（默认是「现金」，余额 0）
await clickC('现金'); await sleep(600)
await clickC('余额测试'); await sleep(500)
for (const c of ['1', '5', '0']) { await click(c); await sleep(130) }
const inlineWarn = await ev(`(() => { const w=document.querySelector('.entry-balance-warn'); return w ? w.textContent.trim() : '' })()`)
await ev("document.querySelector('.entry-edit')?.click()")
await sleep(2400)
const afterBlocked = await bills()
const blocked = inlineWarn

// 第二笔：重新进入记账页再记 80
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
await clickC('现金'); await sleep(600)
await clickC('余额测试'); await sleep(500)
for (const c of ['8', '0']) { await click(c); await sleep(130) }
const amountText = await ev(`(() => { const m=document.querySelector('.entry-amount'); return m ? m.textContent.trim().slice(0,20) : 'no-el' })()`)
await ev("document.querySelector('.entry-edit')?.click()")
await sleep(600)
const okToast = await toast()
await sleep(2400)
const afterOk = await bills()

console.log(JSON.stringify({
  blockedToast: blocked,
  amountText, okToast,
  billsAfter150: afterBlocked,
  billsAfter80: afterOk,
  verdict: blocked.includes('余额不足') && afterBlocked >= 1 && afterOk > afterBlocked ? 'PASS' : 'FAIL',
  email: EMAIL
}, null, 2))
chrome.kill()
