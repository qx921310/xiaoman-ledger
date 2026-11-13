// 双会话并发首登：两台空设备同时拉到空列表，各自用「确定性 assetId」建现金账户，
// 推送后服务端应按 (kind=asset, id) 收敛成一条，而不是两条。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

const seedId = (uid) => {          // 与 src/App.tsx 的 seedCashId 同算法
  let h = 2166136261
  for (const ch of `cash:${uid}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
  return -Math.abs(h >>> 0)
}

test('两台空设备并发首登：确定性 id 的现金账户收敛为一条', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-seed-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())))
  const child = spawn(process.execPath, [join(temp, 'server', 'server.mjs')], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('server startup timeout')), 10000).unref())
    ])
    const base = `http://127.0.0.1:${port}`
    const req = async (path, data, cookie) => {
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
        body: data === undefined ? undefined : JSON.stringify(data)
      })
      return { body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }

    const reg = await req('/api/auth/register', { email: 'seed@race.test', password: 'race-pass-123' })
    assert.equal(reg.body.code, 0, '注册成功')
    const dev = reg.cookie
    const me = reg.body.result?.user?.id ?? reg.body.result?.id
    assert.ok(me, '应拿到用户 id')

    const books = await req('/api/books', undefined, dev)
    const bookId = books.body.result.books[0].bookId ?? books.body.result.books[0].accountBookId

    // 两台设备各自拉到「空资产」（并发屏障：两边都先确认资产为空）
    const [a, b] = await Promise.all([
      req('/api/data/pull', undefined, dev),
      req('/api/data/pull', undefined, dev)
    ])
    const assetsOf = (r) => r.body.result.records.filter((x) => x.kind === 'asset')
    assert.equal(assetsOf(a).length, 0)
    assert.equal(assetsOf(b).length, 0)

    const id = seedId(me)
    const record = (t) => ({
      kind: 'asset', id: String(id), bookId,
      recordId: String(id), ownerId: me, updatedAt: t,
      payload: { assetId: id, assetName: '现金', assetType: 1, bookId, ownerId: me, updateTime: t }
    })
    // 两台同时推同一个 id（同一毫秒附近，模拟并发）
    const t0 = Date.now()
    const [p1, p2] = await Promise.all([
      req('/api/data/push', { records: [record(t0)] }, dev),
      req('/api/data/push', { records: [record(t0 + 1)] }, dev)
    ])
    assert.equal(p1.body.code, 0)
    assert.equal(p2.body.code, 0)

    const final = await req('/api/data/pull', undefined, dev)
    const cash = assetsOf(final).filter((x) => String(x.id) === String(id))
    assert.equal(cash.length, 1, '同一确定性 id 不应产生两条现金账户')
    assert.equal(assetsOf(final).length, 1, '资产总数应为 1')
  } finally {
    child.kill()
    await rm(temp, { recursive: true, force: true })
  }
})
