#!/usr/bin/env node
/** 排查：真实点击导航/主按钮是否生效；顺带看点击位置命中的元素与遮罩。 */
import { spawn } from 'node:child_process'

const URL_APP = process.argv[2] ?? 'https://ledger.yele.win/'
const PORT = 9455
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', `--user-data-dir=${process.cwd()}/.chrome-probe`, 'about:blank'], { stdio: 'ignore' })

async function wsUrl() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const p = list.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl
    } catch { /* 等 */ }
    await sleep(300)
  }
  throw new Error('chrome 未就绪')
}
class Cdp {
  constructor(s) { this.s = s; this.id = 0; this.w = new Map() }
  static async connect(url) {
    const s = new WebSocket(url)
    await new Promise((res, rej) => { s.onopen = res; s.onerror = rej })
    const c = new Cdp(s)
    s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }
    return c
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.s.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((r) => this.w.set(id, r))
  }
}
const cdp = await Cdp.connect(await wsUrl())
const { result: t } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { result: a } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
const sid = a.sessionId
const ev = async (expr) => (await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value

const res = await fetch(`${URL_APP.replace(/\/$/, '')}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'hello@xiaoman.test', password: 'hello12345' }) })
const [n, v] = (res.headers.get('set-cookie') ?? '').split(';')[0].split('=')
await cdp.send('Network.enable', {}, sid)
await cdp.send('Network.setCookie', { name: n, value: v, domain: new URL(URL_APP).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: URL_APP }, sid)
await sleep(4000)

const report = {}
report.before = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,60)")
// 导航按钮的可点区域与命中元素
report.navRect = await ev(`(() => { const b = [...document.querySelectorAll('.nav button')].find(x => x.textContent.trim() === '日历'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`)
report.hit = await ev(`(() => { const r = ${JSON.stringify(report.navRect)}; if (!r) return null; const el = document.elementFromPoint(r.x, r.y); return el ? el.tagName + '.' + (el.className || '') + ' :: ' + (el.textContent || '').slice(0,20) : null })()`)

const click = async (x, y) => {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sid)
}
if (report.navRect) await click(report.navRect.x, report.navRect.y)
await sleep(1200)
report.afterMouseClick = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,80)")

// 再用 DOM click 对照
report.jsClick = await ev(`(() => { const b = [...document.querySelectorAll('.nav button')].find(x => x.textContent.trim() === '统计'); if (!b) return 'no-button'; b.click(); return 'clicked' })()`)
await sleep(1200)
report.afterJsClick = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,80)")
report.overlay = await ev(`(() => { const m = document.querySelector('.sheet-mask, .menu-mask'); if (!m) return null; const s = getComputedStyle(m); return { cls: m.className, display: s.display, pe: s.pointerEvents, z: s.zIndex } })()`)

console.log(JSON.stringify(report, null, 2))
chrome.kill()
