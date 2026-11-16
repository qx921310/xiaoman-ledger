#!/usr/bin/env node
/** 生产验收（第二段）：标签 / 账本 / 统计 / 日历 / 资产详情。只建最小数据。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = process.argv[3] ?? '.e2e-b'
const PORT = 9511
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.E2E_EMAIL ?? `fullb-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'AcceptTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (n, p, d = '') => { checks.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`) }
const log = (m) => console.log(`-- ${m}`)

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

const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (pred, ms = 12000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await pull(); if (pred(last)) return last; await sleep(600) } return last }
await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: `${BASE}/` }, sid)
await sleep(3000)

const text = () => ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,700)")
const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(250); return true
}
const shot = async (n) => { const x = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid); if (x.result?.data) writeFileSync(`${OUT}/${n}.png`, Buffer.from(x.result.data, 'base64')) }

// 建账户 + 记一笔，供后面对照
log('seed')
await click('资产'); await sleep(900)
await clickC('新增账户'); await sleep(400)
await typeInto('input[aria-label="新账户名称"]', '验收现金')
await typeInto('input[aria-label="新账户余额"]', '100')
await click('添加'); await sleep(1200)
await click('首页'); await sleep(800)
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
for (const k of ['1', '2', '.', '3', '4']) { await click(k); await sleep(110) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2200)
let p = await waitFor((x) => (x?.records ?? []).some((y) => y.kind === 'bill' && !y.deleted))
ok('数据准备', (p.records ?? []).some((y) => y.kind === 'bill' && !y.deleted))

// 标签
log('tag')
await click('我的'); await sleep(1000)
await click('标签管理'); await sleep(1500)
const hasInput = await ev(`!!document.querySelector('input[aria-label="新标签名"]')`)
const openedTag = hasInput ? true : await click('新增')
await sleep(1000)
const tagPage = await text()
const typed = await typeInto('input[aria-label="新标签名"]', '验收标签')
const saved = await click('保存'); await sleep(1200)
p = await waitFor((x) => (x?.records ?? []).some((y) => y.kind === 'tag' && !y.deleted))
ok('新建标签', openedTag && typed && saved && (p.records ?? []).some((y) => y.kind === 'tag' && !y.deleted), `page=${tagPage.slice(0, 40)}`)
await shot('tag')
await click('‹ 返回我的'); await sleep(700)

// 账本
log('book')
await click('账本管理'); await sleep(900)
await click('新增'); await sleep(700)
await typeInto('input[aria-label="账本名称"]', '验收账本B')
await click('保存'); await sleep(1500)
p = await waitFor((x) => (x?.records ?? []).filter((y) => y.kind === 'book' && !y.deleted).length >= 2)
ok('新建账本', (p.records ?? []).filter((y) => y.kind === 'book' && !y.deleted).length >= 2)
await shot('book')
await click('‹ 返回我的'); await sleep(700)

// 统计
log('stats')
await click('统计'); await sleep(1500)
const st = await text()
ok('统计含 12.34', st.includes('12.34'), st.slice(0, 60))
await shot('stats')

// 日历
log('cal')
await click('日历'); await sleep(1500)
const ct = await text()
ok('日历含 12.34', ct.includes('12.34'), ct.slice(0, 60))
await shot('cal')

// 资产详情
log('account')
await click('资产'); await sleep(1200)
await click('现金'); await sleep(1200)
const at = await text()
ok('账户详情', at.includes('账户余额'), at.slice(0, 80))
await shot('account')

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, pass, total: checks.length }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL' }))
chrome.kill()
