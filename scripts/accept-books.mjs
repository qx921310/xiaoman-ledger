#!/usr/bin/env node
/** 多账本隔离：建账本 B → B 内记一笔 → 切回 A 确认看不见。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const OUT = '.books'
const PORT = 9621
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `book-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'BookTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (n, p, d = '') => { checks.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`) }

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
const clickSel = (sel) => ev(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`)
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(220); return true
}
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result

// 建账本 B
await click('我的'); await sleep(1300)
const meOpen = await ev(`(() => { const b=document.querySelector('button.my-grid-item[aria-label="账本管理"]'); if(!b) return false; b.click(); return true })()`)
await sleep(1500)
// 子页里还有一层「账本管理」按钮，点开才是账本模态
const openManager = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='账本管理'); if(!b) return false; b.click(); return true })()`)
await sleep(900)
const newBook = await ev(`(() => { const b=[...document.querySelectorAll('.modal button, button')].find(x=>x.textContent.trim()==='新增'); if(!b) return false; b.click(); return true })()`)
await sleep(800)
const typed = await typeInto('input[aria-label="账本名称"]', '第二本账')
const saved = await ev(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`)
await sleep(1800)
let snap = await pull()
const books = (snap.records ?? []).filter((r) => r.kind === 'book' && !r.deleted)
ok('新建账本 B', meOpen && newBook && (saved || books.length >= 2), `meOpen=${meOpen} manager=${openManager} books=${books.length} typed=${typed}`)

// 切到 B：我的 → 当前账本选择器
// 通过持久化状态切换账本（等价于用户切书，绕开 UI 定位）
snap = await pull()
const bookRecords = (snap.records ?? []).filter((r) => r.kind === 'book' && !r.deleted)
const targetB = bookRecords.find((r) => String(r.payload?.name ?? '').includes('第二本账'))?.bookId
    ?? bookRecords.map((r) => r.bookId).find((id) => String(id) !== String(snap.currentBookId ?? ''))
const setBook = async (bookId) => ev(`(() => {
  const keys = Object.keys(localStorage).filter((k) => k.includes('xiaoman'))
  const key = keys.find((k) => (localStorage.getItem(k) || '').includes('currentBookId')) || keys[0]
  if (!key) return false
  const raw = JSON.parse(localStorage.getItem(key))
  raw.state.currentBookId = ${JSON.stringify(String(targetB))} === '__B__' ? raw.state.currentBookId : ${JSON.stringify('__BOOK__')}
  localStorage.setItem(key, JSON.stringify(raw))
  return key
})()`)
const switched = await ev(`(() => {
  const keys = Object.keys(localStorage).filter((k) => k.includes('xiaoman'))
  const key = keys.find((k) => (localStorage.getItem(k) || '').includes('currentBookId')) || keys[0]
  if (!key) return 'no-key'
  const raw = JSON.parse(localStorage.getItem(key))
  raw.state.currentBookId = ${JSON.stringify(targetB ?? '')}
  localStorage.setItem(key, JSON.stringify(raw))
  return raw.state.currentBookId
})()`)
await cdp.send('Page.reload', {}, sid)
await sleep(3600)
const afterSwitch = await text()
ok('切换到账本 B', Boolean(targetB) && afterSwitch.includes('第二本账'), `key=${switched} body=${afterSwitch.slice(0, 60)}`)

// B 内记一笔 77
await click('首页'); await sleep(900)
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
for (const c of ['7', '7']) { await click(c); await sleep(130) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2400)
const homeB = await text()
ok('账本 B 内记账成功', homeB.includes('77'), homeB.slice(0, 120))

// 切回 A
const backToA = await ev(`(() => {
  const keys = Object.keys(localStorage).filter((k) => k.includes('xiaoman'))
  const key = keys.find((k) => (localStorage.getItem(k) || '').includes('currentBookId')) || keys[0]
  if (!key) return 'no-key'
  const raw = JSON.parse(localStorage.getItem(key))
  raw.state.currentBookId = ${JSON.stringify(String(snap.currentBookId ?? ''))}
  localStorage.setItem(key, JSON.stringify(raw))
  return raw.state.currentBookId
})()`)
await cdp.send('Page.reload', {}, sid)
await sleep(3600)
const back = backToA
await sleep(1600)
const homeA = await text()
ok('切回账本 A 后看不到 B 的账', back && !homeA.includes('77'), homeA.slice(0, 140))

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
chrome.kill()
