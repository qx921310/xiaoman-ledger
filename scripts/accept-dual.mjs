#!/usr/bin/env node
/**
 * 双设备同账号：两个独立浏览器实例（各自 profile），同账号登录，互相验证同步。
 * 用法：node scripts/accept-dual.mjs [url] [--email demo-xxx@xiaoman.test] [--password DemoTest12345]
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }
const BASE = (args[0] ?? 'https://ledger.yele.win').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', 'DemoTest12345')
const OUT = arg('out', '.dual')
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!EMAIL) throw new Error('需要 --email（演示账号）')
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const ok = (n, p, d = '') => { checks.push({ n, p, d }); console.log(`${p ? 'PASS' : 'FAIL'} ${n} ${d}`) }

class Cdp {
  constructor(s) { this.s = s; this.id = 0; this.w = new Map() }
  static async connect(u) { const s = new WebSocket(u); await new Promise((r, j) => { s.onopen = r; s.onerror = j }); const c = new Cdp(s); s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && c.w.has(m.id)) { c.w.get(m.id)(m); c.w.delete(m.id) } }; return c }
  send(m, p = {}, sid) { const id = ++this.id; this.s.send(JSON.stringify({ id, method: m, params: p, ...(sid ? { sessionId: sid } : {}) })); return new Promise((r) => this.w.set(id, r)) }
}

async function launch(name, port) {
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu',
    '--no-first-run', `--user-data-dir=${resolve(OUT, name)}`, 'about:blank'], { stdio: 'ignore' })
  let ws
  for (let i = 0; i < 80; i += 1) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) { ws = p.webSocketDebuggerUrl; break } } catch { /* 等 */ }
    await sleep(250)
  }
  const cdp = await Cdp.connect(ws)
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
  await sleep(3500)
  const text = () => ev("document.body.innerText.replace(/\\s+/g,' ')")
  const click = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.trim()===${JSON.stringify(s2)}); if(!e) return false; e.click(); return true })()`)
  const clickC = (s2) => ev(`(() => { const e=[...document.querySelectorAll('button,a,summary')].find(x=>x.textContent.includes(${JSON.stringify(s2)})); if(!e) return false; e.click(); return true })()`)
  const reload = async () => { await cdp.send('Page.reload', {}, sid); await sleep(3500) }
  const addExpense = async (digits) => {
    await click('添加一条新记账'); await sleep(1400)
    await clickC('食品餐饮'); await sleep(400)
    for (const k of digits) { await click(k); await sleep(110) }
    await ev("document.querySelector('.entry-edit')?.click()"); await sleep(2500)
  }
  return { proc, ev, text, click, clickC, reload, addExpense, cookie }
}

const A = await launch('deviceA', 9521)
const B = await launch('deviceB', 9522)
ok('两台设备登录同一账号', true, EMAIL)

// 云端基线
const api = async (p) => (await fetch(`${BASE}${p}`, { headers: { Cookie: A.cookie } })).json()
const countBills = async () => ((await api('/api/data/pull?protocolVersion=2')).result?.records ?? []).filter((x) => x.kind === 'bill' && !x.deleted).length
const base = await countBills()
console.log('baseline bills', base)

// A 记 33.33
await A.addExpense(['3', '3', '.', '3', '3'])
await sleep(2500)
const afterA = await countBills()
ok('设备A记账后云端 +1', afterA === base + 1, `${base} → ${afterA}`)

// B 刷新应看到 33.33
await B.reload()
const bText = await B.text()
ok('设备B看到A的账单', bText.includes('33.33'), bText.slice(0, 80))

// B 记 44.44
await B.addExpense(['4', '4', '.', '4', '4'])
await sleep(2500)
const afterB = await countBills()
ok('设备B记账后云端再 +1', afterB === base + 2, `${afterA} → ${afterB}`)

// A 刷新应看到 44.44
await A.reload()
const aText = await A.text()
ok('设备A看到B的账单', aText.includes('44.44'), aText.slice(0, 80))

// 两端本月支出应一致
const num = (t) => {
  const m = t.match(/本月支出(?!\(元\))\s*([\d,]+\.\d{2})/)
  return m ? Number(m[1].replace(/,/g, '')) : null
}
const aNum = num(await A.text())
const bNum = num(await B.text())
ok('两端本月支出一致', aNum != null && aNum === bNum, `A=${aNum} B=${bNum}`)

const pass = checks.filter((c) => c.p).length
writeFileSync(`${OUT}/report.json`, JSON.stringify({ email: EMAIL, checks, base, afterA, afterB }, null, 2))
console.log(JSON.stringify({ pass, total: checks.length, verdict: pass === checks.length ? 'PASS' : 'PARTIAL' }))
A.proc.kill(); B.proc.kill()
