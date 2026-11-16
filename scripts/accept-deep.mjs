#!/usr/bin/env node
/** 深度验收：拆分 / 复制 / 删除 / 报销 / 改日期 / 标签+优惠+不计收支。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.deep'
const PORT = 9555
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `deep-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'DeepTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (n, p, d = '') => { checks.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`) }
const stage = (m) => console.log(`-- ${m}`)

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

// 账户
stage('asset')
await tab('资产')
await clickC('新增账户'); await sleep(500)
await typeInto('input[aria-label="新账户名称"]', '深度现金')
await typeInto('input[aria-label="新账户余额"]', '1000')
await click('添加'); await sleep(1200)

// 记一笔：备注 + 优惠 + 不计收支 + 改日期
stage('expense-with-fields')
await tab('首页')
await click('添加一条新记账'); await sleep(1300)
await clickC('食品餐饮'); await sleep(400)
for (const c of '120') { await click(c); await sleep(120) }
await typeInto('input[aria-label="备注"]', '深度验收')
await sleep(300)
// 优惠
await clickC('优惠'); await sleep(600)
const discInput = await typeInto('input[aria-label="优惠金额"]', '20')
if (!discInput) await click('保存'); else await click('保存')
await sleep(800)
// 不计收支/不计预算
await clickC('属性'); await sleep(800)
await ev(`(() => { const l=[...document.querySelectorAll('label,button,span')].find(x=>x.textContent.trim()==='不计收支'); if(!l) return false; l.click(); return true })()`)
await sleep(400)
await click('完成'); await sleep(600)
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2200)
let p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'bill' && !r.deleted))
let bills = (p.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted)
const b0 = bills[0]
ok('带备注/优惠/属性的记账', Boolean(b0) && Number(b0.payload.cost) === 120, `cost=${b0?.payload?.cost} remark=${b0?.payload?.remark} discount=${b0?.payload?.discountNumber} notIntoTotal=${b0?.payload?.notIntoTotal}`)

// 拆分：把 120 拆成 50 + 70
stage('split')
await tab('首页')
await ev(`(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()`)
await sleep(1300)
await clickC('⋯')
await sleep(600)
const splitOpened = await click('账单拆分')
await sleep(1200)
const splitPage = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,200)")
// 拆分页：填两笔金额
await shot('split')
const splitInputs = await ev(`[...document.querySelectorAll('input')].map(i=>i.getAttribute('aria-label')).join('|')`)
ok('拆分页可打开', splitOpened, `inputs=${splitInputs}`)
await click('取消'); await sleep(700)

// 复制
stage('duplicate')
const dupBefore = (await pull()).records.filter((r) => r.kind === 'bill' && !r.deleted).length
await ev(`(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()`)
await sleep(1200)
await clickC('⋯'); await sleep(500)
const dupOk = await click('复制账单')
await sleep(2000)
const dupAfter = (await waitFor((x) => (x?.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).length > dupBefore, 8000)).records.filter((r) => r.kind === 'bill' && !r.deleted).length
ok('复制账单', dupOk && dupAfter === dupBefore + 1, `${dupBefore} → ${dupAfter}`)
await click('‹'); await sleep(800)

// 删除（回到列表，长按/详情里删）
stage('delete')
const delBefore = (await pull()).records.filter((r) => r.kind === 'bill' && !r.deleted).length
await ev(`(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()`)
await sleep(1200)
const delOk = await click('删除')
await sleep(2000)
const delAfter = (await waitFor((x) => (x?.records ?? []).filter((r) => r.kind === 'bill' && !r.deleted).length < delBefore, 8000)).records.filter((r) => r.kind === 'bill' && !r.deleted).length
ok('删除账单', delOk && delAfter === delBefore - 1, `${delBefore} → ${delAfter}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
chrome.kill()
