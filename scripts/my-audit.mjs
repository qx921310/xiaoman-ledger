#!/usr/bin/env node
/** 「我的」页逐项审计：依次点开每个入口，记录落地页文本（只读，不写数据）。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.shots-myaudit'
const PORT = 9701
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.ACC_EMAIL ?? 'hello@xiaoman.test'
const PASSWORD = process.env.ACC_PASSWORD ?? 'hello12345'
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
await cdp.send('Network.enable', {}, sid)
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/', secure: true }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
const clickNav = async (label) => { await ev(`(() => { const b=[...document.querySelectorAll('.nav button')].find(x=>x.textContent.trim()===${JSON.stringify(label)}); if(!b) return false; b.click(); return true })()`) }
await clickNav('我的'); await sleep(1200)

const items = await ev(`[...document.querySelectorAll('.my-grid-item, .my-data button, .my-row-btn')].map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean)`)
const rows = []
for (const name of items) {
  // 每次都重新进入，避免子页返回失败污染后续点击
  await cdp.send('Page.navigate', { url: BASE }, sid)
  await sleep(2500)
  await clickNav('我的'); await sleep(1200)
  const opened = await ev(`(() => { const b=[...document.querySelectorAll('.my-grid-item, .my-data button, .my-row-btn')].find(x=>((x.getAttribute('aria-label')||x.textContent||'').trim())===${JSON.stringify(name)}); if(!b) return false; b.click(); return true })()`)
  await sleep(900)
  const body = await text()
  const hasBack = await ev("!!document.querySelector('.subpage-head')")
  if (name.includes('云同步')) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
    if (shot.result?.data) writeFileSync(`${OUT}/sync.png`, Buffer.from(shot.result.data, 'base64'))
  }
  rows.push({ name, opened, len: body.length, hasBack, head: body.slice(body.indexOf('我的') + 2, body.indexOf('我的') + 120) })
}
writeFileSync(`${OUT}/audit.json`, JSON.stringify(rows, null, 2))
for (const r of rows) console.log(`${r.opened ? 'OK ' : 'MISS'} | ${r.name} | 子页:${r.hasBack ? 'Y' : 'N'} | ${r.head}`)
chrome.kill()
