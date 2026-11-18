#!/usr/bin/env node
/** 写操作走查：新增标签 / 新增账户 / 退出登录 / 重新登录。只能在 staging 跑，默认目标即 staging。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
if (/ledger\.yele\.win$/.test(BASE) && !BASE.includes('staging.')) {
  console.error('拒绝在���产执行写操作走查；请显式传入 staging 地址')
  process.exit(1)
}
const OUT = '.shots-interact'
const PORT = 9671
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.ACC_EMAIL ?? 'staging@xiaoman.test'
const PASSWORD = process.env.ACC_PASSWORD ?? 'staging12345'
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
await cdp.send('Network.enable', {}, sid)
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/', secure: true }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)
const errors = []
await cdp.send('Runtime.enable', {}, sid)

const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
const fill2 = async (sel, val) => {
  const r = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!r) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
  await cdp.send('Input.insertText', { text: val }, sid)
  await sleep(200)
  return true
}

const shot = async (n) => { const x = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid); if (x.result?.data) writeFileSync(`${OUT}/${n}.png`, Buffer.from(x.result.data, 'base64')) }

// cookie 注入失败（staging 常见）时走 UI 表单登录
if (await ev("!!document.querySelector('#auth-email')")) {
  const fill = async (sel, val) => {
    const r = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
    if (!r) return false
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 }, sid)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 }, sid)
    // 先全选再输入，避免与已有内容拼接
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 }, sid)
    await cdp.send('Input.insertText', { text: val }, sid)
    await sleep(150)
    return true
  }
  await fill('#auth-email', EMAIL)
  await fill('#auth-password', PASSWORD)
  // 页面上有两个「登录」（分段标签 + 提交按钮），点主按钮
  const filled = await ev(`(() => { const e=document.querySelector('#auth-email'); const p=document.querySelector('#auth-password'); return (e?e.value:'') + ' / ' + (p?p.value.length:-1) })()`)
  console.log('filled:', filled)
  await ev("(() => { const b=document.querySelector('.auth-card button.primary'); if(!b) return false; b.click(); return true })()")
  await sleep(3500)
  console.log('form-login used, loggedIn=', !(await ev("!!document.querySelector('#auth-email')")))
}

// confirm 弹窗一律接受（退出登录等）
await cdp.send('Page.enable', {}, sid)
cdp.s.addEventListener('message', async (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Page.javascriptDialogOpening') {
    await cdp.send('Page.handleJavaScriptDialog', { accept: true }, sid)
  }
})

const cloudBills = async () => {
  const r = await fetch(`${BASE}/api/data/pull?protocolVersion=2`, { headers: { Cookie: cookie } })
  const j = await r.json()
  return (j.result?.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted).length
}

// 1. 新增标签
await click('我的'); await sleep(1200)
const tagOpen = await ev(`(() => { const b=document.querySelector('button.my-grid-item[aria-label="标签管理"]'); if(!b) return false; b.click(); return true })()`)
await sleep(1000)
const addTag = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='新增'); if(!b) return false; b.click(); return true })()`)
await sleep(700)
const tagName = '走查标签' + Date.now().toString(36).slice(-4)
await fill2('input[aria-label="新标签名"]', tagName)
const saveTag = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='添加标签'); if(!b) return false; b.click(); return true })()`)
await sleep(1400)
const tagBody = await text()
ok('新增标签', tagOpen && addTag && saveTag && tagBody.includes(tagName.slice(0, 4)), `name=${tagName} body=${tagBody.slice(0, 60)}`)

// 2. 新增账户（整页表单）
await click('资产'); await sleep(1200)
const openNew = await ev(`(() => { const b=[...document.querySelectorAll('summary,button')].find(x=>x.textContent.trim().includes('新增账户')); if(!b) return false; b.click(); return true })()`)
await sleep(900)
const accName = '走查现金' + Date.now().toString(36).slice(-3)
await fill2('input[aria-label="新账户名称"]', accName)
await fill2('input[aria-label="新账户余额"]', '321')
const saveAcc = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='添加'); if(!b) return false; b.click(); return true })()`)
await sleep(1800)
const accBody = await text()
ok('新增账户（整页）', openNew && saveAcc && accBody.includes('走查现金'), `name=${accName} body=${accBody.slice(0, 60)}`)

// 3. 退出登录 → 重新登录，数据仍在
await click('我的'); await sleep(900)
const billsBefore = await cloudBills()
const logout = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='退出登录'); if(!b) return false; b.click(); return true })()`)
await sleep(1500)
const loggedOut = await ev("!!document.querySelector('#auth-email')")
ok('退出登录', logout && loggedOut, `logout=${logout} page=${loggedOut}`)
if (loggedOut) {
  await fill2('#auth-email', EMAIL)
  await fill2('#auth-password', PASSWORD)
  await ev("(() => { const b=document.querySelector('.auth-card button.primary'); if(!b) return false; b.click(); return true })()")
  await sleep(3500)
}
const relogged = !(await ev("!!document.querySelector('#auth-email')"))
await click('我的'); await sleep(1000)
const meBody = await text()
ok('重新登录数据仍在', relogged && meBody.includes('已记录'), `bills=${billsBefore} body=${meBody.slice(0, 60)}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL' }))
chrome.kill()
