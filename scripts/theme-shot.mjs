#!/usr/bin/env node
/** 指定主题下截一张页面图，用于核对换肤后排版/对比度。用法：node scripts/theme-shot.mjs <url> <theme> [tab] */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const THEME = process.argv[3] ?? 'night'
const TAB = process.argv[4] ?? '首页'
const OUT = '.shots-theme'
const PORT = 9731
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const chrome = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${resolve(OUT, 'profile')}`, 'about:blank'], { stdio: 'ignore' })
async function ws() { for (let i = 0; i < 80; i++) { try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch { /* wait */ } await sleep(250) } throw new Error('chrome 未就绪') }
class Cdp {
  constructor(s) { this.s = s; this.id = 0; this.w = new Map() }
  static async connect(u) { const s = new WebSocket(u); await new Promise((r, j) => { s.onopen = r; s.onerror = j }); const c = new Cdp(s); s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }; return c }
  send(m, p = {}, sid) { const id = ++this.id; this.s.send(JSON.stringify({ id, method: m, params: p, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => this.w.set(id, r)) }
}
const cdp = await Cdp.connect(await ws())
const { result: t } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { result: a } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
const sid = a.sessionId
const ev = async (x) => (await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ACC_EMAIL ?? 'staging@xiaoman.test', password: process.env.ACC_PASSWORD ?? 'staging12345' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
const [cn, cv] = cookie.split('=')
await cdp.send('Network.enable', {}, sid)
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/', secure: true }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(3000)
await ev(`localStorage.setItem('xiaoman-theme', ${JSON.stringify(THEME)})`)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)
await ev(`(() => { const b=[...document.querySelectorAll('.nav button')].find(x=>x.textContent.trim()===${JSON.stringify(TAB)}); if(b) b.click() })()`)
await sleep(1500)
console.log('theme=', await ev("(document.documentElement.dataset.theme||'')+' bg='+getComputedStyle(document.documentElement).getPropertyValue('--bg')"))
const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
if (shot.result?.data) writeFileSync(`${OUT}/${THEME}-${TAB}.png`, Buffer.from(shot.result.data, 'base64'))
console.log('saved', `${OUT}/${THEME}-${TAB}.png`)
chrome.kill()
