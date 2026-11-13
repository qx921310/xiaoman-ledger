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

test('两台空设备并发首登：同 id 不产生重复账户（冲突显式待核对）', async () => {
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
    // v2 的 operationId/baseVersion 是「每条记录」的字段，不是请求级
    const record = (t, opId) => ({
      kind: 'asset', id: String(id), bookId,
      recordId: String(id), ownerId: me, updatedAt: t,
      operationId: opId, baseVersion: 0,
      payload: { assetId: id, assetName: '现金', assetType: 1, bookId, ownerId: me, updateTime: t }
    })
    // 用真实 v2 协议推送：protocolVersion + operationId + baseVersion
    const t0 = Date.now()
    const pushV2 = (records, opId) => req('/api/data/push', {
      protocolVersion: 2, operationId: opId, baseVersion: 0, records
    }, dev)
    const [p1, p2] = await Promise.all([
      pushV2([record(t0, `seed-device-a-${t0}`)], `seed-a-${t0}`),
      pushV2([record(t0 + 1, `seed-device-b-${t0}`)], `seed-b-${t0}`)
    ])
    assert.equal(p1.body.code, 0)
    assert.equal(p2.body.code, 0)

    const final = await req('/api/data/pull', undefined, dev)
    const cash = assetsOf(final).filter((x) => String(x.id) === String(id))
    // v2 的真实语义：同 id 同属主的并发推送 → 版本冲突（conflicts>0），交用户核对，
    // 绝不会静默写成两条；因此这里断言「最多一条」且冲突被显式报告。
    assert.ok(cash.length <= 1, `同一确定性 id 不得产生两条现金账户，实际 ${cash.length}`)
    const conflicted = Number(p1.body.result?.conflicts ?? 0) + Number(p2.body.result?.conflicts ?? 0)
    const accepted = Number(p1.body.result?.accepted ?? 0) + Number(p2.body.result?.accepted ?? 0)
    assert.ok(cash.length === accepted, '未接受推送时不应在云端出现记录')
    if (conflicted > 0) {
      // 冲突路径：本地保留、云端待核对，用户下次同步会看到「N 条待核对」
      assert.ok(conflicted >= 1, '冲突必须被显式返回给客户端')
    } else {
      assert.equal(cash.length, 1, '无冲突时应恰好一条')
    }
  } finally {
    // 等子进程真正退出再删目录，避免 Windows 上 SQLite 文件被占用（EBUSY）
    const exited = once(child, 'exit').catch(() => {})
    child.kill()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
