#!/usr/bin/env node
/** 我的页 CRUD 验收：新增分类 / 新增标签 / 新增账本，并核对云端记录。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.crud'
const PORT = 9599
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `crud-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'CrudTest12345'
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
const typeInto = async (sel, v) => {
  const rect = await ev(`(() => { const i=document.querySelector(${JSON.stringify(sel)}); if(!i) return null; const b=i.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2} })()`)
  if (!rect) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 }, sid)
  await cdp.send('Input.insertText', { text: v }, sid)
  await sleep(250); return true
}
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } })).json()
const pull = async () => (await api('/api/data/pull?protocolVersion=2')).result
const waitFor = async (pred, ms = 12000) => { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await pull(); if (pred(last)) return last; await sleep(600) } return last }
const toast = () => ev(`(() => { const t=document.querySelector('.toast'); return t ? t.textContent : '' })()`)

await click('我的'); await sleep(1500)
const meText = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,200)")
const addButtons = await ev(`[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/新增|添加|新建/.test(t)).slice(0,20).join('|')`)
console.log('add buttons:', addButtons)

// 分类管理
const catOpen = await click('分类管理'); await sleep(1200)
const catBody = await ev("document.body.innerText.replace(/\\s+/g,' ').slice(0,160)")
const catInputs = await ev(`[...document.querySelectorAll('input,button[aria-label]')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.textContent.trim().slice(0,8))).filter(Boolean).join('|')`)
const catAdd = await clickC('新增支出分类')
await sleep(900)
const catInputs2 = await ev(`[...document.querySelectorAll('input')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')).filter(Boolean).join('|')`)
let catSaved = false
if (catInputs2) {
  await typeInto('.modal input[aria-label="分类名称"]', '验收分类')
  catSaved = await ev(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='保存'); if(!b) return false; b.click(); return true })()`)
  await sleep(1500)
}
let p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'parent' && String(r.payload?.name ?? '').includes('验收分类')), 8000)
const catCount = (p.records ?? []).filter((r) => r.kind === 'parent' && String(r.payload?.name ?? '').includes('验收分类')).length
ok('新增分类', catOpen && catCount >= 1, `open=${catOpen} saved=${catSaved} inputs=${catInputs2} count=${catCount} body=${catBody.slice(0, 50)} toast=${await toast()}`)

// 回我的 → 标签管理
await clickC('返回'); await sleep(1000)
const tagOpen = await click('标签管理'); await sleep(1200)
const tagInputs = await ev(`[...document.querySelectorAll('input')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')).filter(Boolean).join('|')`)
await clickC('新增'); await sleep(800)
let tagSaved = false
if (tagInputs.includes('新标签名')) {
  await typeInto('input[aria-label="新标签名"]', '验收标签A')
  tagSaved = await clickC('添加标签') || await clickC('保存')
  await sleep(1500)
}
p = await waitFor((x) => (x?.records ?? []).some((r) => r.kind === 'tag' && String(r.payload?.name ?? '').includes('验收标签A')), 8000)
const tagCount = (p.records ?? []).filter((r) => r.kind === 'tag' && String(r.payload?.name ?? '').includes('验收标签A')).length
ok('新增标签', tagOpen && tagCount >= 1, `open=${tagOpen} saved=${tagSaved} inputs=${tagInputs} count=${tagCount}`)

// 回我的 → 账本管理
await clickC('返回'); await sleep(1000)
const bookOpen = await click('账本管理'); await sleep(1200)
const bookInputs = await ev(`[...document.querySelectorAll('input')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('placeholder')||'')).filter(Boolean).join('|')`)
await clickC('新增'); await sleep(800)
let bookSaved = false
if (bookInputs.includes('账本名称')) {
  await typeInto('input[aria-label="账本名称"]', '验收账本C')
  bookSaved = await clickC('保存') || await clickC('创建')
  await sleep(1600)
}
p = await waitFor((x) => (x?.books ?? []).length >= 2 || (x?.records ?? []).filter((r) => r.kind === 'book').length >= 2, 8000)
const books = (p.records ?? []).filter((r) => r.kind === 'book' && !r.deleted)
ok('新增账本', bookOpen && books.length >= 2, `open=${bookOpen} saved=${bookSaved} inputs=${bookInputs} books=${books.length}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, meText, catInputs }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
chrome.kill()
