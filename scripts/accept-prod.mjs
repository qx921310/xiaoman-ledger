#!/usr/bin/env node
/** 生产验收走查：登录 → 依次打开 5 个一级页 + 记账页，记录正文并截图。 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const URL_APP = process.argv[2] ?? 'https://ledger.yele.win/'
const OUT = process.argv[3] ?? '.shots-accept'
const PORT = 9466
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.ACC_EMAIL ?? 'hello@xiaoman.test'
const PASSWORD = process.env.ACC_PASSWORD ?? 'hello12345'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', `--user-data-dir=${process.cwd()}/.chrome-accept`, 'about:blank'], { stdio: 'ignore' })

async function wsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch { /* 等 */ }
    await sleep(300)
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

// 手机视口（真机上是 390×844 左右）
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)

const res = await fetch(`${URL_APP.replace(/\/$/, '')}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const [n, v] = (res.headers.get('set-cookie') ?? '').split(';')[0].split('=')
await cdp.send('Network.enable', {}, sid)
await cdp.send('Network.setCookie', { name: n, value: v, domain: new URL(URL_APP).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: URL_APP }, sid)
await sleep(4000)

const clickText = (text) => ev(`(() => {
  const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim() === ${JSON.stringify(text)})
  if (!el) return false
  el.click(); return true
})()`)
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,900)")
const shot = async (name) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
  if (r.result?.data) writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'))
}

const steps = [
  ['home', null],
  ['add', '添加一条新记账'],
  ['back-home', '‹'],
  ['calendar', '日历'],
  ['assets', '资产'],
  ['stats', '统计'],
  ['me', '我的'],
]
const out = {}
for (const [name, tab] of steps) {
  if (tab) { const ok = await clickText(tab); await sleep(1200); out[`${name}_clicked`] = ok }
  out[name] = await text()
  if (name === 'me') {
    await ev(`(() => { const h=[...document.querySelectorAll('h3')].find(x=>x.textContent.includes('数据管理')); if (h) h.scrollIntoView({ block: 'start' }); return true })()`)
    await sleep(600)
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid)
    if (r.result?.data) writeFileSync(`${OUT}/me-lower.png`, Buffer.from(r.result.data, 'base64'))
  }
  await shot(name)
}
console.log(JSON.stringify(out, null, 2))
chrome.kill()
