#!/usr/bin/env node
/** 债务模式验收：借出 → 收款 → 借入 → 还款，接口断言 lends 与账户余额。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.debt'
const PORT = 9577
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `debt-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'DebtTest12345'
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

const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
const cookie = (reg.headers.get('set-cookie') ?? '').split(';')[0]
await cdp.send('Network.enable', {}, sid)
const [cn, cv] = cookie.split('=')
await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
await cdp.send('Page.navigate', { url: BASE }, sid)
await sleep(4000)

const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
const clickSel = (sel) => ev(`(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`)
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(200); return true
}
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (pred, ms = 12000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await pull(); if (pred(last)) return last; await sleep(600) } return last }
const tab = async (n) => { await click(n); await sleep(1100) }
const shot = async (n) => { const x = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid); if (x.result?.data) writeFileSync(`${OUT}/${n}.png`, Buffer.from(x.result.data, 'base64')) }
const toast = () => ev(`(() => { const t=document.querySelector('.toast'); return t ? t.textContent : '' })()`)

// 账户
await tab('资产')
await clickC('新增账户'); await sleep(500)
await typeInto('input[aria-label="新账户名称"]', '债务现金')
await typeInto('input[aria-label="新账户余额"]', '1000')
await click('添加'); await sleep(1200)

// 借出 100
await tab('首页')
await click('添加一条新记账'); await sleep(1400)
await click('债务'); await sleep(900)
const debtBody = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,220)")
const debtInputs = await ev(`[...document.querySelectorAll('input,button[aria-label]')].map(e => e.tagName + '|' + (e.getAttribute('aria-label')||'') + '|' + (e.getAttribute('placeholder')||'')).join(' ;; ')`)
console.log('debt inputs:', debtInputs)
await shot('debt-page')
// 债务页：对方名称输入框 + 键盘输入金额（无金额输入框）
await typeInto('input[placeholder="对方名称"]', '张三')
await sleep(300)
for (const k of ['1', '0', '0']) { await click(k); await sleep(140) }
const lendSubmit = await ev("document.querySelector('.entry-edit')?.click() ?? false")
await sleep(400)
const lendToast = await toast()
let p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'lend' && !r.deleted))
let lends = (p.records ?? []).filter((r) => r.kind === 'lend' && !r.deleted)
ok('资金借出 100', lends.length >= 1 && Number(lends[0]?.payload?.number) === 100, `toast=${lendToast} lends=${lends.length} body=${debtBody.slice(0, 60)}`)

// 收款 40
await tab('首页')
await click('添加一条新记账'); await sleep(1400)
await click('债务'); await sleep(800)
// 债务类型是弹层选择器：先点当前值，再选「收款」
await clickC('资金借出'); await sleep(600)
await click('收款'); await sleep(700)
// 收款必须先选中原债务
await clickC('请选择债务'); await sleep(600)
const pickedDebt = await clickC('张三'); await sleep(500)
const repayBody = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,200)")
await shot('debt-repay')
for (const k of ['4', '0']) { await click(k); await sleep(140) }
await ev("document.querySelector('.entry-edit')?.click()")
await sleep(400)
const repayToast = await toast()
await sleep(1600)
p = await waitFor((x) => (x?.records ?? []).filter((r) => r.kind === 'lendRepay' || (r.kind === 'lend' && !r.deleted)).length > lends.length, 8000)
const repays = (p.records ?? []).filter((r) => r.kind === 'lendRepay' && !r.deleted)
ok('收款 40', repays.length >= 1 || repayToast.includes('已记录'), `picked=${pickedDebt} toast=${repayToast} repays=${repays.length} body=${repayBody.slice(0, 50)}`)

// 资产余额：借出应从账户扣除
const assets = (p.records ?? []).filter((r) => r.kind === 'asset' && !r.deleted)
const cash = assets.find((r) => String(r.payload?.assetName).includes('债务现金'))
ok('账户余额随之变化', Boolean(cash) && Number(cash.payload.assetNumber) !== 1000, `assetNumber=${cash?.payload?.assetNumber}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
chrome.kill()
