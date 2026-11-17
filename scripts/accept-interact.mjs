#!/usr/bin/env node
/** 生产只读交互走查：打开/取消弹层、点日历日期、进账户详情、进我的子页。不写入任何数据。 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const BASE = (process.argv[2] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const OUT = '.shots-interact'
const PORT = 9671
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const EMAIL = process.env.ACC_EMAIL ?? 'hello@xiaoman.test'
const PASSWORD = process.env.ACC_PASSWORD ?? 'hello12345'
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
const shot = async (n) => { const x = await cdp.send('Page.captureScreenshot', { format: 'png' }, sid); if (x.result?.data) writeFileSync(`${OUT}/${n}.png`, Buffer.from(x.result.data, 'base64')) }

// 1. 记账页：打开 → 点账户 chip → 弹层出现 → 取消 → 返回首页
await click('添加一条新记账'); await sleep(1400)
const entryOpen = (await text()).includes('完成')
await clickC('现金'); await sleep(700)
const sheetOpen = await ev("!!document.querySelector('.sheet-mask')")
await click('取消'); await sleep(400)
const sheetClosed = !(await ev("!!document.querySelector('.sheet-mask')"))
await click('‹'); await sleep(900)
ok('记账页开关弹层', entryOpen && sheetOpen && sheetClosed, `entry=${entryOpen} sheet=${sheetOpen} closed=${sheetClosed}`)
await shot('entry')

// 2. 日历：点 3 号，选中态跟着变
await click('日历'); await sleep(1200)
const cellText = await ev(`(() => { const b=[...document.querySelectorAll('.cal-cell')].find(x=>x.textContent.trim().startsWith('3')); if(!b) return 'no-cell'; b.click(); return b.className })()`)
await sleep(500)
const calBody = await text()
ok('日历点选日期', cellText !== 'no-cell' && calBody.includes('11月3日'), `class=${cellText} body=${calBody.slice(0, 60)}`)
await shot('calendar')

// 3. 资产：进账户详情
await click('资产'); await sleep(1000)
const accOpen = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')&&x.getAttribute('aria-label').includes('查看')&&x.getAttribute('aria-label').includes('流水')); if(!b) return false; b.click(); return true })()`)
await sleep(900)
const accBody = await text()
ok('账户详情打开', accBody.includes('账户余额'), accBody.slice(0, 80))
await shot('account')
await clickC('返回'); await sleep(800)

// 4. 我的：账本管理 → 返回
await click('我的'); await sleep(1000)
const subOpen = await ev(`(() => { const b=document.querySelector('button.my-grid-item[aria-label="账本管理"]'); if(!b) return false; b.click(); return true })()`)
await sleep(900)
const subBody = await text()
ok('我的子页打开', subBody.includes('账本') && subBody.includes('返回我的'), subBody.slice(0, 80))
await shot('me-sub')
await clickC('返回我的'); await sleep(700)


// 5. 日历跨月：点下一月，标题变 12 月
await click('日历'); await sleep(1000)
const nextMonth = await ev(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='下个月'); if(!b) return false; b.click(); return true })()`)
await sleep(700)
const decBody = await text()
ok('日历切换月份', nextMonth && decBody.includes('12 月'), decBody.slice(0, 60))

// 6. 统计：年统计
await click('统计'); await sleep(1000)
const yearOk = await click('年统计'); await sleep(900)
const yearBody = await text()
ok('统计年统计可用', yearOk && yearBody.includes('年'), yearBody.slice(0, 60))

// 7. 我的：数据子页
await click('我的'); await sleep(900)
const dataOpen = await ev(`(() => { const b=[...document.querySelectorAll('.my-data button')][0]; if(!b) return false; b.click(); return true })()`)
await sleep(800)
const dataBody = await text()
ok('我的数据子页', dataOpen && dataBody.includes('返回我的'), dataBody.slice(0, 60))


// 8. 记账页模式切换：收入 / 转账
await click('首页'); await sleep(800)
await click('添加一条新记账'); await sleep(1300)
const incomeOk = await click('收入'); await sleep(600)
const incomeBody = await text()
const transferOk = await click('转账'); await sleep(600)
const transferBody = await text()
ok('记账四模式入口', incomeOk && transferOk && transferBody.includes('转出') && transferBody.includes('转入'),
  `income=${incomeBody.slice(0, 40)} transfer=${transferBody.slice(0, 40)}`)
await click('‹'); await sleep(700)

// 9. 我的 → 分类管理子页
await click('我的'); await sleep(900)
const catOpen = await ev(`(() => { const b=document.querySelector('button.my-grid-item[aria-label="分类管理"]'); if(!b) return false; b.click(); return true })()`)
await sleep(900)
const catBody = await text()
ok('分类管理子页', catOpen && (catBody.includes('新增大类') || catBody.includes('新增子分类')), catBody.slice(0, 60))
await clickC('返回我的'); await sleep(600)


// 10. 统计自定义区间：出现起止日期输入
await click('统计'); await sleep(900)
const customOk = await click('自定义'); await sleep(800)
const customBody = await text()
const dateInputs = await ev(`[...document.querySelectorAll('input[type="date"]')].map(i=>i.getAttribute('aria-label')||'').join('|')`)
ok('统计自定义区间', customOk && dateInputs.includes('统计开始日期'), `inputs=${dateInputs}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL' }))
chrome.kill()
