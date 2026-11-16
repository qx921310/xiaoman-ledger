#!/usr/bin/env node
/** 统计（年/自定义）+ 日历（还款提醒入口）验收。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.stats'
const PORT = 9601
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = `stats-${Date.now().toString(36)}@xiaoman.test`
const PASSWORD = 'StatsTest12345'
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
const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
const shot = async (n) => { const x = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid); if (x.result?.data) writeFileSync(`${OUT}/${n}.png`, Buffer.from(x.result.data, 'base64')) }

// 记一笔，保证统计有数
await click('添加一条新记账'); await sleep(1400)
await clickC('食品餐饮'); await sleep(400)
for (const c of '66') { await click(c); await sleep(120) }
await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2400)

// 统计：年统计
await click('统计'); await sleep(1400)
const yearOk = await click('年统计'); await sleep(1400)
const yearText = await text()
await shot('stats-year')
ok('年统计可切换', yearOk && /年|季度|月均|收入|支出/.test(yearText), yearText.slice(0, 90))

// 统计：自定义
const customOpened = await click('自定义'); await sleep(1200)
const customText = await text()
const customInputs = await ev(`[...document.querySelectorAll('input')].map(i=>i.type+':'+(i.getAttribute('aria-label')||i.getAttribute('placeholder')||'')).join('|')`)
await shot('stats-custom')
ok('自定义区间可打开', customOpened, `inputs=${customInputs} body=${customText.slice(0, 70)}`)

// 年/月/周切换
await click('月统计'); await sleep(900)
const monthText = await text()
ok('月统计回归', monthText.includes('支出') && monthText.includes('收入'), monthText.slice(0, 60))

// 日历：⋯ 菜单（本月账单/日历设置）
await click('日历'); await sleep(1400)
const moreOpened = await clickC('⋯'); await sleep(700)
const calMenuText = await text()
// 还款提醒在资产页 ⋯ 菜单
await click('资产'); await sleep(1300)
await clickC('资产设置') || await clickC('⋯'); await sleep(800)
const remind = await clickC('还款提醒'); await sleep(900)
const remindText = await text()
await shot('calendar-remind')
ok('日历「⋯」菜单可打开', moreOpened, `menu=${calMenuText.slice(0, 120)}`)
ok('还款提醒入口可用', remind, `body=${remindText.slice(0, 90)}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, yearText: yearText.slice(0, 300), customInputs }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL', email: EMAIL }))
chrome.kill()
