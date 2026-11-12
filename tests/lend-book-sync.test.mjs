import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

/**
 * 借贷账本作用域回归：一木的借贷参与余额计算，必须随账本同步。
 * 服务端对无 bookId 的 lend 会返回 book-required（server.mjs 的必填规则）。
 * 这里直接对真实服务端跑两条对照，证明修复点成立。
 */
const BASE = process.env.BASE || 'https://staging.ledger.yele.win'
const EMAIL = process.env.EMAIL || 'staging@xiaoman.test'
const PASSWORD = process.env.PASSWORD || 'staging12345'

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  })
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  const data = await res.json()
  assert.equal(data.code, 0, `登录失败: ${JSON.stringify(data)}`)
  assert.ok(cookie, '没有拿到会话 cookie')
  return cookie
}

async function push(cookie, records) {
  const res = await fetch(`${BASE}/api/data/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ records, protocolVersion: 2 })
  })
  return res.json()
}

async function firstBookId(cookie) {
  const res = await fetch(`${BASE}/api/books`, { headers: { Cookie: cookie } })
  const data = await res.json()
  const list = data.result?.books ?? data.result ?? []
  const id = list[0]?.bookId ?? list[0]?.id
  assert.ok(id, '账号没有可用账本')
  return String(id)
}

test('借贷记录必须带账本才能同步（对照实验）', async () => {
  const cookie = await login()
  const bookId = await firstBookId(cookie)
  const base = {
    kind: 'lend',
    payload: { lendId: 1, type: 1, assetId: 1, counterparty: '对照', number: 10, time: Date.now(), remark: '', userId: 1, updateTime: Date.now() }
  }
  // 无 bookId：应被拒绝
  const noBook = await push(cookie, [{ ...base, id: 'lend-nobook-' + Date.now(), operationId: randomUUID(), baseVersion: 0 }])
  const noBookResult = (noBook.result?.results ?? noBook.results ?? [])[0]
  console.log('[无账本] 状态:', noBookResult?.status, '| 原始:', JSON.stringify(noBook).slice(0, 200))
  assert.equal(noBookResult?.status, 'book-required', `未带账本应返回 book-required，实际 ${JSON.stringify(noBookResult)}`)

  // 带 bookId：不再被「book-required」拦下（真正的接受还要求完整 v2 握手：
  // generation / 幂等 receipt，那部分由客户端 runner 覆盖，这里只锁定本回归点）
  const withBook = await push(cookie, [{
    ...base, id: 'lend-book-' + Date.now(), operationId: randomUUID(), baseVersion: 0,
    payload: { ...base.payload, bookId }
  }])
  const okResult = (withBook.result?.results ?? withBook.results ?? [])[0]
  console.log('[带账本] 状态:', okResult?.status, '| bookId:', bookId)
  assert.notEqual(okResult?.status, 'book-required', '带账本不应再被判 book-required')
})
