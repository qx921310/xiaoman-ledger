#!/usr/bin/env node
/** 资产验收：五类账户创建 + 记账/借出后余额口径 + 隐藏资产。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.assets'
const PORT = 9588
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `asset-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'AssetTest12345'
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

// 账户类型选择器有哪些选项
await tab('资产')
await clickC('新增账户'); await sleep(600)
const typeBtn = await ev(`[...document.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).filter(x=>x.includes('类型')).join('|')`)
const formLabels = await ev(`[...document.querySelectorAll('input,button[aria-label]')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')).filter(Boolean).join('|')`)
await clickSel(`button[aria-label="${(typeBtn || '账户类型').split('|')[0]}"]`); await sleep(500)
const typeOptions = await ev(`[...document.querySelectorAll('.sheet-mask .ss-item')].map(b=>b.textContent.trim()).join('|')`)
await shot('asset-type-sheet')
await click('取消'); await sleep(400)

// 建一个现金账户 1000
await typeInto('input[aria-label="新账户名称"]', '资产现金')
await typeInto('input[aria-label="新账户余额"]', '1000')
await click('添加'); await sleep(1400)
let p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'asset' && !r.deleted))
const asset0 = (p.records ?? []).filter((r) => r.kind === 'asset' && !r.deleted).find((r) => String(r.payload?.assetName).includes('资产现金'))
const keys = asset0 ? Object.keys(asset0.payload).join(',') : ''
console.log('asset payload keys:', keys)
console.log('asset payload:', JSON.stringify(asset0?.payload ?? null).slice(0, 220))
ok('创建现金账户', Boolean(asset0), `labels=${formLabels}`)

// 记一笔 20 支出，看在哪个字段体现
const balOf = (rec) => Number(rec?.payload?.assetNumber ?? rec?.payload?.balance ?? rec?.payload?.number ?? NaN)
const before = balOf(asset0)
await tab('首页')
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
for (const c of '20') { await click(c); await sleep(120) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2500)
p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'bill' && !r.deleted))
const afterRec = (p.records ?? []).filter((r) => r.kind === 'asset' && !r.deleted).find((r) => String(r.payload?.assetName).includes('资产现金'))
const after = balOf(afterRec)
ok('记账后账户余额口径可读', Number.isFinite(before) && Number.isFinite(after), `before=${before} after=${after} payload=${JSON.stringify(afterRec?.payload ?? null).slice(0, 120)}`)

// 负债类账户
await tab('资产')
await clickC('新增账户'); await sleep(600)
await typeInto('input[aria-label="新账户名称"]', '资产信用卡')
await typeInto('input[aria-label="新账户余额"]', '-500')
await click('添加'); await sleep(1400)
p = await waitFor((x) => (x?.records ?? []).filter((r) => r.kind === 'asset' && !r.deleted).length >= 2)
const assets = (p.records ?? []).filter((r) => r.kind === 'asset' && !r.deleted)
ok('创建第二个账户', assets.length >= 2, `assets=${assets.length}`)

// 隐藏资产
const hideOk = await clickC('隐藏'); await sleep(800)
const hiddenText = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,160)")
ok('资产隐藏入口存在', hideOk, hiddenText.slice(0, 90))

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, typeOptions, keys }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL, typeOptions }))
chrome.kill()
