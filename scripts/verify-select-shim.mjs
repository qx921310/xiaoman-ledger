#!/usr/bin/env node
/**
 * 验证全局下拉兜底（SelectShim）真的能把选择写回并派发 change。
 * 做法：在真实页面里注入一个原生 <select> + change 监听，用真实鼠标事件点开它，
 * 在弹层里选一项，再读监听结果。
 */
import { spawn } from 'node:child_process'

const URL_APP = process.argv[2] ?? 'https://staging.ledger.yele.win/'
const PORT = 9444
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${process.cwd()}/.chrome-shim`, 'about:blank'
], { stdio: 'ignore' })

async function ws() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* 等待 */ }
    await sleep(300)
  }
  throw new Error('chrome 未就绪')
}

class Cdp {
  constructor(sock) { this.sock = sock; this.id = 0; this.wait = new Map() }
  static async connect(url) {
    const sock = new WebSocket(url)
    await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej })
    const c = new Cdp(sock)
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && c.wait.has(m.id)) { c.wait.get(m.id)(m); c.wait.delete(m.id) }
    }
    return c
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.sock.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((r) => this.wait.set(id, r))
  }
}

const target = await ws()
const cdp = await Cdp.connect(target)
const { result: created } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { result: att } = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })
const sid = att.sessionId
const evaluate = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid)
  return r.result?.result?.value
}

// 登录
const res = await fetch(`${URL_APP.replace(/\/$/, '')}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'staging@xiaoman.test', password: 'staging12345' })
})
const cookie = res.headers.get('set-cookie') ?? ''
const [name, value] = cookie.split(';')[0].split('=')
await cdp.send('Network.enable', {}, sid)
await cdp.send('Network.setCookie', { name, value, domain: new URL(URL_APP).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: URL_APP }, sid)
await sleep(3500)

// 注入一个原生 select 与 change 监听
await evaluate(`
  (() => {
    window.__shimPicked = null
    const host = document.createElement('div')
    host.id = 'shim-probe'
    host.style.cssText = 'position:fixed;left:20px;top:120px;z-index:9999;background:#fff;padding:8px;border:1px solid #ccc'
    const sel = document.createElement('select')
    sel.setAttribute('aria-label', '探针选择')
    sel.style.cssText = 'width:200px;height:40px'
    for (const [v, t] of [['a','选项甲'],['b','选项乙'],['c','选项丙']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o)
    }
    sel.addEventListener('change', () => { window.__shimPicked = sel.value })
    host.appendChild(sel)
    document.body.appendChild(host)
    return true
  })()
`)
const box = await evaluate(`(() => { const r = document.getElementById('shim-probe').getBoundingClientRect(); return { x: r.x + 60, y: r.y + 20 } })()`)
const click = async (x, y) => {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sid)
}
await click(box.x, box.y)
await sleep(600)
const sheetVisible = await evaluate(`!!document.querySelector('.sheet-mask .ss-item')`)
const pickedLabel = await evaluate(`(() => {
  const items = [...document.querySelectorAll('.sheet-mask .ss-item')]
  const target = items.find((n) => n.textContent.includes('选项乙'))
  if (!target) return null
  target.click()
  return target.textContent.trim()
})()`)
await sleep(400)
const valueAfter = await evaluate(`document.querySelector('#shim-probe select').value`)
const handlerFired = await evaluate('window.__shimPicked')

console.log(JSON.stringify({
  sheetOpened: sheetVisible,
  clickedItem: pickedLabel,
  selectValue: valueAfter,
  changeEventReceived: handlerFired,
  verdict: sheetVisible && valueAfter === 'b' && handlerFired === 'b' ? 'PASS' : 'FAIL'
}, null, 2))

chrome.kill()
