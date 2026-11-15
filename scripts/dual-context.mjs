#!/usr/bin/env node
/**
 * 双标签（同浏览器、共享 IndexedDB）补传与冲突现场验证。
 * 流程：tab1 断网改名 → 入队；tab2 在线改名 → 服务端更新；tab1 恢复网络 → 补传应进入冲突而不是静默覆盖。
 * 用法：node scripts/dual-context.mjs [url]
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const URL_APP = process.argv[2] ?? 'https://staging.ledger.yele.win/'
const OUT = process.argv[3] ?? '.shots-dual'
const PORT = 9333
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${process.cwd()}/.chrome-dual`,
  'about:blank'
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pageTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* 还没起来 */ }
    await sleep(300)
  }
  throw new Error('Chrome 未就绪')
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map() }
  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const c = new Cdp(ws)
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && c.waiting.has(msg.id)) { c.waiting.get(msg.id)(msg); c.waiting.delete(msg.id) }
    }
    return c
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((res) => this.waiting.set(id, res))
  }
}

const cdp = await Cdp.connect(await pageTarget())

async function newTab() {
  const { result } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { result: att } = await cdp.send('Target.attachToTarget', { targetId: result.targetId, flatten: true })
  return att.sessionId
}
const evalIn = async (sid, expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid)
  return r.result?.result?.value
}
const goto = async (sid, url) => { await cdp.send('Page.navigate', { url }, sid); await sleep(2500) }
const offline = async (sid, on) => cdp.send('Network.emulateNetworkConditions', {
  offline: on, latency: 0, downloadThroughput: on ? 0 : -1, uploadThroughput: on ? 0 : -1
}, sid)
const clickText = async (sid, text) => evalIn(sid, `(() => {
  const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim() === ${JSON.stringify(text)})
  if (!el) return false
  el.click(); return true
})()`)
const setInput = async (sid, label, value) => evalIn(sid, `(() => {
  const el = document.querySelector('input[aria-label=${JSON.stringify(label)}]')
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)

const waitFor = async (sid, selector, timeoutMs = 4000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = await evalIn(sid, `!!document.querySelector(${JSON.stringify(selector)})`)
    if (found) return true
    await sleep(150)
  }
  return false
}
const clickFirst = async (sid, text) => evalIn(sid, `(() => {
  const el = [...document.querySelectorAll('button,a,summary')].find((x) => x.textContent.trim() === ${JSON.stringify(text)})
  if (!el) return false
  el.click(); return true
})()`)
const bodyText = async (sid) => evalIn(sid, 'document.body.innerText.replace(/\\s+/g," ").slice(0,600)')

const login = async (sid) => {
  const base = URL_APP.replace(/\/$/, '')
  const email = process.env.DUAL_EMAIL ?? 'dual@xiaoman.test'
  const password = process.env.DUAL_PASSWORD ?? 'DualTest12345'
  const post = (path) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  let res = await post('/api/auth/login')
  const body = await res.clone().json().catch(() => ({ code: 1 }))
  if (body.code !== 0) res = await post('/api/auth/register')
  const cookie = res.headers.get('set-cookie') ?? ''
  const [name, value] = cookie.split(';')[0].split('=')
  await cdp.send('Network.enable', {}, sid)
  await cdp.send('Network.setCookie', { name, value, domain: new URL(URL_APP).host, path: '/' }, sid)
}

const tab1 = await newTab()
const tab2 = await newTab()
await login(tab1); await login(tab2)
await goto(tab1, URL_APP); await goto(tab2, URL_APP)
await sleep(1500)

const steps = []
const record = (name, data) => { steps.push({ name, ...data }); console.log(name, JSON.stringify(data).slice(0, 220)) }

// 两个标签都进入账本管理
for (const sid of [tab1, tab2]) {
  await clickText(sid, '我的'); await sleep(600)
  await clickText(sid, '账本管理'); await sleep(900)
}
const buttonsOf = (sid) => evalIn(sid, `JSON.stringify([...document.querySelectorAll('button,a,summary')].map((x) => (x.textContent || '').trim()).filter(Boolean).slice(0, 40))`)
record('tabs-ready', {
  t1Buttons: JSON.parse((await buttonsOf(tab1)) || '[]'),
  t2Buttons: JSON.parse((await buttonsOf(tab2)) || '[]')
})

// tab1 断网，改名 → 应该进入离线队列
await offline(tab1, true)
const opened1 = await clickFirst(tab1, '编辑')
const hasInput1 = await waitFor(tab1, 'input[aria-label="账本名称"]')
const typed1 = hasInput1 ? await setInput(tab1, '账本名称', `离线改名-${Date.now()}`) : false
const saved1 = typed1 ? await clickFirst(tab1, '保存') : false
await sleep(1200)
record('tab1-offline-saved', { opened: opened1, hasInput: hasInput1, typed: typed1, saved: saved1, text: await bodyText(tab1) })

// tab2 在线，改另一个名字 → 服务端更新成功
const opened2 = await clickFirst(tab2, '编辑')
const hasInput2 = await waitFor(tab2, 'input[aria-label="账本名称"]')
const onlineName = `在线改名-${Date.now()}`
const typed2 = hasInput2 ? await setInput(tab2, '账本名称', onlineName) : false
const saved2 = typed2 ? await clickFirst(tab2, '保存') : false
await sleep(1800)
record('tab2-online-saved', { opened: opened2, hasInput: hasInput2, typed: typed2, saved: saved2, name: onlineName, text: (await bodyText(tab2)).slice(0, 200) })

// tab1 恢复网络 → 触发补传，应该出现冲突提示而不是静默覆盖
await offline(tab1, false)
await evalIn(tab1, 'window.dispatchEvent(new Event("online"))')
await sleep(4000)
record('tab1-recovered', { text: await bodyText(tab1) })

const final = await fetch(`${URL_APP.replace(/\/$/, '')}/api/books/update`, { method: 'POST' })
record('server-name-check-skipped', { note: '见 tab2 侧文本与 tab1 冲突提示', finalStatus: final.status })
console.log(JSON.stringify(steps, null, 2))
chrome.kill()
