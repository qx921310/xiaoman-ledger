#!/usr/bin/env node
/** 单设备验证：编辑弹层能否真的改金额并保存到云端。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const OUT = '.edit'
const PORT = 9631
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `edit-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'EditTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (k, d) => console.log(k, JSON.stringify(d).slice(0, 200))

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
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const costOf = async () => ((await pull()).records ?? []).filter((r) => r.kind === 'bill' && !r.deleted)[0]?.payload?.cost

// 造一笔 50
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
for (const c of ['5', '0']) { await click(c); await sleep(120) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2500)
log('created cost', { cost: await costOf() })

// 打开详情 → 编辑
await ev("(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()")
await sleep(1400)
const opened = await click('编辑')
await sleep(1400)
const modalAmount = await ev(`(() => { const m=document.querySelector('.modal .entry-amount, .modal .amount, .modal input'); return m ? (m.textContent || m.value || '').trim().slice(0,20) : '' })()`)
const modalButtons = await ev(`[...document.querySelectorAll('.modal button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,12).join('|')`)
log('edit modal', { opened, modalAmount, modalButtons })

// 编辑弹层的金额输入框是「账单原始金额」
const rect = await ev(`(() => { const i=document.querySelector('input[aria-label="账单原始金额"]'); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
if (rect) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
  await cdp.send('Input.insertText', { text: '30' }, sid)
  await sleep(300)
}
const typedValue = await ev(`(() => { const i=document.querySelector('input[aria-label="账单原始金额"]'); return i ? i.value : 'no-input' })()`)
log('typed value', { typedValue })
const amountAfterType = await ev(`(() => { const m=document.querySelector('.modal .entry-amount, .modal .amount'); return m ? m.textContent.trim().slice(0,20) : 'no-amount-el' })()`)
log('amount after typing', { amountAfterType })
const saved = await ev(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`)
await sleep(3500)
const finalCost = await costOf()
log('after save', { saved, finalCost })
console.log('EMAIL', EMAIL)
chrome.kill()
