#!/usr/bin/env node
/**
 * 设备模拟器：以某个账号身份模拟一台设备做同步写入，用于双设备并发校验。
 * 用法：node scripts/dev-sim.mjs --device A [--url ...] [--email ...] [--password ...] [--count 5] [--tag sim]
 * 输出：JSON 日志（每步结果），供裁判方汇总；同时写入 .dualdev/<device>.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const DEVICE = arg('device', 'A')
const BASE = arg('url', 'https://staging.ledger.yele.win').replace(/\/$/, '')
const EMAIL = arg('email', 'dual@xiaoman.test')
const PASSWORD = arg('password', 'DualTest12345')
const COUNT = Number(arg('count', '5'))
const TAG = arg('tag', `dev${DEVICE}`)
// 每轮唯一 runId：避免跨轮同前缀记录把「漏写」伪装成 PASS
const RUN = arg('run', `run-${Date.now().toString(36)}`)
const idPrefix = `${TAG}-${DEVICE}-${RUN}`
const log = []

// 网络层的抖动模拟：两个设备错开几百毫秒，制造真实并发
const jitter = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 380))

let cookie = ''
async function call(path, init = {}) {
  await jitter()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(init.headers ?? {}) }
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 200) } }
  return json
}

const step = (name, detail) => { log.push({ at: new Date().toISOString(), name, detail }); console.log(`[${DEVICE}] ${name}`, JSON.stringify(detail).slice(0, 240)) }

async function login() {
  let r = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (r.code !== 0) r = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  step('login', { code: r.code, user: r.result?.user?.email })
  return r.code === 0
}

async function pull() {
  const r = await call('/api/data/pull?protocolVersion=2')
  return { code: r.code, records: r.result?.records ?? [], generations: r.result?.generations ?? [] }
}

async function push(records) {
  return call('/api/data/push', { method: 'POST', body: JSON.stringify({ protocolVersion: 2, records }) })
}

let idemId = ''
async function main() {
  if (!(await login())) throw new Error('登录失败')
  const first = await pull()
  // 以服务端给的 generations 为准：那是当前账号真实有权限的账本集合
  const genBooks = (first.generations ?? []).map((g) => String(g.bookId))
  const books = useBooks(first.records).filter((b) => genBooks.includes(b.bookId))
  const bookId = books[0]?.bookId ?? genBooks[0]
  if (!bookId) throw new Error('账号下没有可写账本')
  step('target-book', { bookId, bookName: books[0]?.name ?? '(未命名)', generations: genBooks })

  const generation = first.generations.find((g) => String(g.bookId) === String(bookId))?.generation ?? 0
  const created = []
  for (let i = 0; i < COUNT; i += 1) {
    const id = `${idPrefix}-c${i}${i === COUNT - 1 ? `` : ``}-${randomUUID().slice(0, 4)}`
    const now = Date.now()
    const payload = { billId: id, bookId, cost: i + 1, time: now, assetId: null, parentCategoryId: null, accountAmount: i + 1 }
    const r = await push([{ kind: 'bill', id, bookId, generation, operationId: randomUUID(), baseVersion: 0, updatedAt: now, payload }])
    const status = r.result?.results?.[0]?.status
    step(`create-${i + 1}`, { id, cost: i + 1, status })
    created.push({ id, cost: i + 1, status })
  }

  // 幂等：一笔全新记录，用同一个 operationId 连发两次；第二次应被回执识别，不产生第二条
  {
    const id = `${idPrefix}-idem-${randomUUID().slice(0, 4)}`
    idemId = id
    const op = randomUUID()
    const now = Date.now()
    const payload = { billId: id, bookId, cost: 9, time: now }
    const r1 = await push([{ kind: 'bill', id, bookId, generation, operationId: op, baseVersion: 0, updatedAt: now, payload }])
    const r2 = await push([{ kind: 'bill', id, bookId, generation, operationId: op, baseVersion: 0, updatedAt: now, payload }])
    step('idempotent-replay', {
      first: r1.result?.results?.[0]?.status,
      second: r2.result?.results?.[0]?.status,
      duplicates: r2.result?.duplicates
    })
  }

  // 陈旧版本：故意用错误 baseVersion，服务端应拒绝而不是覆盖
  if (created[1]) {
    const r = await push([{ kind: 'bill', id: created[1].id, bookId, generation, operationId: randomUUID(), baseVersion: 999, updatedAt: Date.now(), payload: { billId: created[1].id, bookId, cost: 777, time: Date.now() } }])
    step('stale-baseVersion', { status: r.result?.results?.[0]?.status })
  }

  const after = await pull()
  const mine = (after.records ?? []).filter((r) => String(r.id).startsWith(idPrefix))
  const sum = mine.reduce((n, r) => n + Number(r.payload?.cost ?? 0), 0)
  step('verify-pull', { deviceRecords: mine.length, sum, statuses: created.map((c) => c.status) })

  mkdirSync('.dualdev', { recursive: true })
  writeFileSync(`.dualdev/${DEVICE}.json`, JSON.stringify({
    device: DEVICE, run: RUN, tag: TAG, bookId,
    expectedIds: [...created.map((c) => c.id), ...log.filter((l) => l.name === 'idempotent-replay').map(() => idemId).filter(Boolean)],
    created, idemId, pulled: mine.length, sum, log
  }, null, 2))
  console.log(`[${DEVICE}] DONE records=${mine.length} sum=${sum}`)
}

function useBooks(records) {
  const map = new Map()
  for (const r of records ?? []) {
    if (r.kind !== 'book') continue
    map.set(String(r.id), { bookId: String(r.id), name: r.payload?.name ?? r.payload?.accountBookName ?? '' })
  }
  return [...map.values()]
}

main().catch((e) => { console.error(`[${DEVICE}] FAILED`, e.message); process.exitCode = 1 })
