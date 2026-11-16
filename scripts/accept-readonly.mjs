#!/usr/bin/env node
/**
 * 只读账本验收（staging）：
 *   node scripts/accept-readonly.mjs <url> init   → 注册并打开 App，让客户端建好账本，输出 email/bookId
 *   （外部把 book_members.role 改成 silent）
 *   node scripts/accept-readonly.mjs <url> test    → 登录后尝试记账，断言界面拦截 + 云端无新增
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const PHASE = process.argv[3] ?? 'init'
const OUT = '.readonly'
const PORT = 9566
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const STATE = `${OUT}/state.json`
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (PHASE === 'init') rmSync(resolve(OUT, 'profile'), { recursive: true, force: true })

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const EMAIL = state.email ?? `ro-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'ReadOnly12345'

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

// 登录（新账号先注册）
let res = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
let body = await res.json()
if (body.code !== 0) { res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }); body = await res.json() }
const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4500)

const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const billsCount = async () => ((await pull()).records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).length

if (PHASE === 'init') {
  // 先建一个账户，记账才能成功（也顺便验证正常写入）
  await click('资产'); await sleep(1000)
  await clickC('新增账户'); await sleep(500)
  const rect = await ev(`(() => { const i=document.querySelector('input[aria-label="新账户名称"]'); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (rect) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
    await cdp.send('Input.insertText', { text: '只读测试现金' }, sid)
  }
  await click('添加'); await sleep(1200)
  await click('首页'); await sleep(900)
  await click('添加一条新记账'); await sleep(1400)
  await clickC('食品餐饮'); await sleep(400)
  for (const c of '10') { await click(c); await sleep(120) }
  await ev("document.querySelector('.entry-edit')?.click()")
  await sleep(2500)
  const snap = await pull()
  const bookId = (snap.generations ?? [])[0]?.bookId ?? ''
  const count = (snap.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).length
  writeFileSync(STATE, JSON.stringify({ email: EMAIL, password: PASSWORD, bookId, count }, null, 2))
  console.log(JSON.stringify({ phase: 'init', email: EMAIL, bookId, bills: count }))
} else {
  const before = await billsCount()
  await click('首页'); await sleep(900)
  const addVisible = await click('添加一条新记账')
  await sleep(500)
  const openToast = await ev(`(() => { const t=document.querySelector('.toast'); return t ? t.textContent : '' })()`)
  await sleep(900)
  const entryBody = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,160)")
  const hasEntry = await ev("!!document.querySelector('.entry-edit')")
  const entrySnapshot = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,120)")
  let blockedText = ''
  if (addVisible) {
    await clickC('食品餐饮'); await sleep(400)
    for (const c of '22') { await click(c); await sleep(120) }
    await ev("document.querySelector('.entry-edit')?.click()")
    await sleep(400)
    blockedText = await ev(`(() => { const t=document.querySelector('.toast'); return t ? t.textContent : '' })()`)
    await sleep(1600)
  }
  const after = await billsCount()
  // 直接打接口：命令层/服务端应拒绝
  const pushRes = await (await fetch(`${BASE}/api/data/push`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ protocolVersion: 2, records: [{ kind: 'bill', id: `ro-${Date.now()}`, bookId: state.bookId, generation: 0, operationId: `ro-op-${Date.now()}`, baseVersion: 0, updatedAt: Date.now(), payload: { billId: `ro-${Date.now()}`, cost: 1, billType: 2, bookId: state.bookId } }] })
  })).json()
  const final = await billsCount()
  const pass = after === before && final === before && (pushRes.result?.denied ?? 0) >= 1
  console.log(JSON.stringify({
    phase: 'test', email: EMAIL, bookId: state.bookId,
    billsBefore: before, billsAfterUi: after, billsAfterApi: final,
    uiBlockedText: blockedText || openToast || '(无提示)',
    apiPush: { denied: pushRes.result?.denied, accepted: pushRes.result?.accepted, status: pushRes.result?.results?.[0]?.status },
    hasEntry, openToast, entrySnapshot: entrySnapshot.slice(0, 80),
    entryBody: entryBody.slice(0, 80),
    verdict: pass ? 'PASS' : 'FAIL'
  }, null, 2))
}
chrome.kill()
