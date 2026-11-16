#!/usr/bin/env node
/**
 * 边操作边录制：CDP 连续截帧 → ffmpeg 合成 mp4 + 拼一张联系表（contact sheet）。
 * 用法：node scripts/record.mjs <url> <outDir> [--fps 4] [--w 390] [--h 844]
 * 产物：<outDir>/rec.mp4、<outDir>/sheet.png、<outDir>/frames/*.jpg
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const URL_APP = args[0] ?? 'https://ledger.yele.win/'
const OUT = args[1] ?? '.rec'
const FPS = Number(arg('fps', '4'))
const W = Number(arg('w', '390'))
const H = Number(arg('h', '844'))
const EMAIL = arg('email', 'hello@xiaoman.test')
const PASSWORD = arg('password', 'hello12345')
const PORT = Number(arg('port', '9477'))
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const FRAMES = `${OUT}/frames`
mkdirSync(FRAMES, { recursive: true })
rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--hide-scrollbars', `--user-data-dir=${resolve(OUT, 'profile')}`, 'about:blank'], { stdio: 'ignore' })

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

await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true }, sid)
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, sid)

let frame = 0
let recording = false
const loop = async () => {
  while (recording) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }, sid)
    if (r.result?.data) {
      frame += 1
      writeFileSync(`${FRAMES}/${String(frame).padStart(4, '0')}.jpg`, Buffer.from(r.result.data, 'base64'))
    }
    await sleep(Math.max(60, Math.round(1000 / FPS)))
  }
}

// 登录
const res = await fetch(`${URL_APP.replace(/\/$/, '')}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const [n, v] = (res.headers.get('set-cookie') ?? '').split(';')[0].split('=')
await cdp.send('Network.enable', {}, sid)
await cdp.send('Network.setCookie', { name: n, value: v, domain: new URL(URL_APP).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: URL_APP }, sid)
await sleep(2500)

recording = true
const rec = loop()

const clickText = (text) => ev(`(() => { const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true })()`)

// 录制脚本：首页 → 记账页 → 返回 → 日历 → 资产 → 统计 → 我的
await sleep(1200)
await clickText('添加一条新记账'); await sleep(1800)
await clickText('‹'); await sleep(1200)
await clickText('日历'); await sleep(1800)
await clickText('资产'); await sleep(1500)
await clickText('统计'); await sleep(1800)
await clickText('我的'); await sleep(1500)

recording = false
await rec
chrome.kill()

// 合成
const mp4 = `${OUT}/rec.mp4`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FRAMES}/%04d.jpg`,
  '-vf', 'scale=390:-2', '-pix_fmt', 'yuv420p', mp4], { stdio: 'inherit' })
// 联系表：每 4 帧取 1，最多 16 格
const sheet = `${OUT}/sheet.png`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${FRAMES}/%04d.jpg`,
  '-vf', `select='not(mod(n\\,${Math.max(1, Math.floor(frame / 16))}))',scale=195:-2,tile=4x4`,
  '-frames:v', '1', sheet], { stdio: 'inherit' })

console.log(JSON.stringify({ frames: frame, mp4, sheet, size: existsSync(mp4) ? 'ok' : 'missing' }, null, 2))
