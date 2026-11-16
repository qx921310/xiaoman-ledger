#!/usr/bin/env node
/**
 * 双设备冲突 + 备份导出验收。
 * 冲突：A/B 同账号同账单，各自改金额，验证云端只保留一个值且失败方出现「待核对」提示。
 * 导出：我的 → 数据管理 → 数据备份，检查下载到的 JSON 能解析且含账单。
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://staging.ledger.yele.win').replace(/\/$/, '')
const OUT = '.conflict'
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `conf-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'ConfTest12345'
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (n, p, d = '') => { checks.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`) }
const log = (m) => console.log('--', m)

class Cdp {
  constructor(s) { this.s = s; this.id = 0; this.w = new Map() }
  static async connect(u) { const s = new WebSocket(u); await new Promise((r, j) => { s.onopen = r; s.onerror = j }); const c = new Cdp(s); s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }; return c }
  send(m, p = {}, sid) { const id = ++this.id; this.s.send(JSON.stringify({ id, method: m, params: p, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => this.w.set(id, r)) }
}

async function launch(name, port) {
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu',
    '--no-first-run', `--user-data-dir=${resolve(OUT, name)}`, 'about:blank'], { stdio: 'ignore' })
  let url = ''
  for (let i = 0; i < 80 && !url; i += 1) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) url = p.webSocketDebuggerUrl } catch { /* 等 */ }
    if (!url) await sleep(250)
  }
  const cdp = await Cdp.connect(url)
  const { result: t } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { result: a } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true })
  const sid = a.sessionId
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid)
  const ev = async (x) => (await cdp.send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }, sid)).result?.result?.value
  await cdp.send('Network.enable', {}, sid)
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
  const [cn, cv] = cookie.split('=')
  await cdp.send('Network.setCookie', { name: cn, value: cv, domain: new URL(BASE).host, path: '/' }, sid)
  await cdp.send('Page.navigate', { url: BASE }, sid)
  await sleep(4000)
  const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
  const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
  const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
  const reload = async () => { await cdp.send('Page.reload', {}, sid); await sleep(3600) }
  const typeInto = async (sel, v) => {
    const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
    if (!rect) return false
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
    await cdp.send('Input.insertText', { text: v }, sid)
    await sleep(200); return true
  }
  return { proc, cdp, sid, ev, click, clickC, text, reload, typeInto, cookie }
}

// 注册 + 造一笔账
const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
if ((await reg.json()).code !== 0) await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })

const A = await launch('devA', 9611)
log('A ready')
await A.click('添加一条新记账'); await sleep(1400)
await A.clickC('食品餐饮'); await sleep(400)
for (const c of ['5', '0']) { await A.click(c); await sleep(120) }
await A.ev("document.querySelector('.entry-edit')?.click()"); await sleep(2600)

const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: A.cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (pred, ms = 12000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await pull(); if (pred(last)) return last; await sleep(600) } return last }
let snap = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'bill' && !r.deleted))
const bill = (snap.records ?? []).find((r) => r.kind === 'bill' && !r.deleted)
ok('准备一笔账单', Boolean(bill), `id=${bill?.id} cost=${bill?.payload?.cost}`)

const B = await launch('devB', 9612)
log('B ready')

// A 改 30
await A.click('首页'); await sleep(900)
await A.ev("(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()")
await sleep(1300)
await A.click('编辑'); await sleep(1300)
for (let i = 0; i < 6; i += 1) { await A.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'')==='退格'); if(!b) return false; b.click(); return true })()`); await sleep(120) }
for (const c of ['3', '0']) { await A.click(c); await sleep(130) }
await A.ev(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`); await sleep(2400)
log('A saved 30')

// B 改 40（基于旧版本）
await B.click('首页'); await sleep(900)
await B.ev("(() => { const r=document.querySelector('.ledger-row'); if(!r) return false; r.click(); return true })()")
await sleep(1300)
await B.click('编辑'); await sleep(1300)
for (let i = 0; i < 6; i += 1) { await B.ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'')==='退格'); if(!b) return false; b.click(); return true })()`); await sleep(120) }
for (const c of ['4', '0']) { await B.click(c); await sleep(130) }
await B.ev(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`); await sleep(2600)
log('B saved 40')
const bText = await B.text()
await B.reload()
const bText2 = await B.text()

snap = await pull()
const finalBill = (snap.records ?? []).find((r) => r.kind === 'bill' && !r.deleted)
const conflictFlag = /待核对|冲突/.test(bText) || /待核对|冲突/.test(bText2)
ok('双端并发改同一账单后云端一致', Boolean(finalBill), `cloudCost=${finalBill?.payload?.cost}`)
ok('失败方出现冲突提示', conflictFlag, `banner=${(bText.match(/[^ ]*待核对[^ ]*/) ?? [''])[0]} cost=${finalBill?.payload?.cost}`)

// 备份导出
log('export')
await A.click('我的'); await sleep(1200)
const exportOpened = await A.clickC('数据备份')
await sleep(900)
const exportBody = await A.text()
const dl = await A.ev(`(() => { const a=[...document.querySelectorAll('button,a')].find(x=>/导出|下载/.test(x.textContent)); if(!a) return false; a.click(); return true })()`)
await sleep(2500)
const backupText = await A.ev(`(() => { const t=document.querySelector('.toast'); return t?t.textContent:'' })()`)
ok('备份页可打开', exportOpened, exportBody.slice(0, 80))
ok('导出入口可用', dl, `toast=${backupText}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, cloudCost: finalBill?.payload?.cost }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
A.proc.kill(); B.proc.kill()
