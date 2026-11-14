// 移动端截图：用本机 Chromium 以 390×844 打开页面，登录后可截任意步骤。
// 用法：node scripts/shot-mobile.mjs <url> <outDir> [step...]
// 仅用于开发核对，不参与打包。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const URL_ARG = process.argv[2] ?? 'https://staging.ledger.yele.win/'
const OUT = process.argv[3] ?? join(process.cwd(), '.shots')
const EMAIL = process.env.SHOT_EMAIL ?? 'staging@xiaoman.test'
const PASSWORD = process.env.SHOT_PASSWORD ?? 'staging12345'
const CHROME = process.env.CHROME_PATH
  ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PROFILE = join(tmpdir(), `shot-mobile-${Date.now()}`)
const PORT = 9333

mkdirSync(OUT, { recursive: true })
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  'about:blank'
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page.webSocketDebuggerUrl
    } catch { /* 还没起来 */ }
    await sleep(250)
  }
  throw new Error('Chromium 页面目标未就绪')
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [] }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    const cdp = new Cdp(ws)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && cdp.pending.has(msg.id)) {
        const { resolve, reject } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result)
      } else if (msg.method) {
        cdp.events.push(msg)
      }
    }
    return cdp
  }
  send(method, params = {}) {
    this.id += 1
    const id = this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`${method} 超时`)) } }, 30000)
    })
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? '页面脚本异常')
    return r.result?.value
  }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(OUT, file), Buffer.from(r.data, 'base64'))
    console.log('截图', file)
  }
}

const wsUrl = await endpoint()
const cdp = await Cdp.connect(wsUrl)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true
})
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

await cdp.send('Page.navigate', { url: URL_ARG })
await sleep(2500)

// 先用接口登录，把 httpOnly 会话 cookie 注入浏览器（比模拟填表稳定）
const origin = new URL(URL_ARG).origin
const loginRes = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
})
if (loginRes.ok) {
  const raw = loginRes.headers.get('set-cookie') ?? ''
  const pair = raw.split(';')[0]
  const idx = pair.indexOf('=')
  if (idx > 0) {
    await cdp.send('Network.enable')
    await cdp.send('Network.setCookie', {
      name: pair.slice(0, idx),
      value: pair.slice(idx + 1),
      domain: new URL(URL_ARG).hostname,
      path: '/',
      httpOnly: true,
      secure: origin.startsWith('https'),
      sameSite: 'Lax'
    })
  }
}
const bustUrl = URL_ARG + (URL_ARG.includes('?') ? '&' : '?') + 'v=' + Date.now()
await cdp.send('Page.navigate', { url: bustUrl })
await sleep(3000)
await cdp.shot('01-home.png')

const steps = process.argv.slice(4)
const clickByText = async (text, file) => {
  const ok = await cdp.evaluate(`(() => {
    const target = ${JSON.stringify(text)}
    const nodes = [...document.querySelectorAll('button, a, span, div')]
      .filter((el) => el.textContent.trim() === target)
    const el = nodes.sort((a, b) => a.children.length - b.children.length)[0]
    if (!el) return false
    el.click()
    return true
  })()`)
  await sleep(1200)
  await cdp.shot(file)
  const snippet = await cdp.evaluate("document.body.innerText.replace(/\\s+/g,' ').slice(0,240)")
  console.log(ok ? `点击「${text}」` : `未找到「${text}」`, '｜正文:', snippet)
}
for (const [i, step] of steps.entries()) {
  await clickByText(step, `${String(i + 2).padStart(2, '0')}-step.png`)
}

cdp.ws.close()
chrome.kill()
await sleep(300)
try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* 忽略 */ }
