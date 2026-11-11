import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('共享账本服务端保护私有账户和历史快照', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-privacy-'))
  assert.equal(dirname(temp), tmpdir().replace(/[\\/]$/, ''))
  assert.ok(basename(temp).startsWith('xiaoman-privacy-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()))
  const child = spawn(process.execPath, [join(temp, 'server', 'server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => setTimeout(() => reject(new Error('server startup timeout')), 10000).unref())])
    const base = `http://127.0.0.1:${port}`
    const req = async (path, data, cookie) => {
      const res = await fetch(base + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) })
      return { body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }
    const a = await req('/api/auth/register', { email: 'a@privacy.test', password: 'test-pass-123' })
    const b = await req('/api/auth/register', { email: 'b@privacy.test', password: 'test-pass-123' })
    const book = (await req('/api/books/create', { name: '测试账本' }, a.cookie)).body.result.bookId
    const privateAsset = { kind: 'asset', id: '101', updatedAt: 100, payload: { assetId: 101, assetName: '私有名称' } }
    const bill = { kind: 'bill', id: 'bill-1', updatedAt: 101, payload: { billId: 'bill-1', syncId: 'bill-1', bookId: book, assetId: 101, billSnapshot: { assetName: '私有名称' }, cost: 3 } }
    const initial = await req('/api/data/push', { records: [bill, privateAsset] }, a.cookie)
    assert.equal(initial.body.result.accepted, 2, '单人账本可以使用私有账户')
    const code = (await req('/api/books/invite', { bookId: book }, a.cookie)).body.result.code
    await req('/api/books/join', { code }, b.cookie)
    const viewer = (await req('/api/data/pull', undefined, b.cookie)).body.result.records.find((r) => r.id === 'bill-1')
    const owner = (await req('/api/data/pull', undefined, a.cookie)).body.result.records.find((r) => r.id === 'bill-1')
    assert.equal(viewer.payload.billSnapshot.assetName, '私有账户')
    assert.equal(owner.payload.billSnapshot.assetName, '私有名称', '原始历史数据不被覆盖')
    await req('/api/books/role', { bookId: book, userId: b.body.result.user.id, role: 'admin' }, a.cookie)
    const replay = await req('/api/data/push', { records: [{ kind: 'bill', id: 'bill-1', updatedAt: 500, payload: viewer.payload }] }, b.cookie)
    assert.equal(replay.body.result.denied, 1, '其他成员不能把脱敏快照写回覆盖原始账单')
    const ownerAfterReplay = (await req('/api/data/pull', undefined, a.cookie)).body.result.records.find((r) => r.id === 'bill-1')
    assert.equal(ownerAfterReplay.payload.billSnapshot.assetName, '私有名称')
    const denied = await req('/api/data/push', { records: [{ ...bill, id: 'bill-2', payload: { ...bill.payload, billId: 'bill-2', syncId: 'bill-2' } }] }, a.cookie)
    assert.equal(denied.body.result.denied, 1, '多人账本拒绝私有账户')
    const unknown = await req('/api/data/push', { records: [{ ...bill, id: 'bill-3', payload: { ...bill.payload, billId: 'bill-3', syncId: 'bill-3', assetId: 999 } }] }, a.cookie)
    assert.equal(unknown.body.result.denied, 1, '账户信息不明时拒绝写入')
    const shared = { kind: 'asset', id: '102', updatedAt: 200, payload: { assetId: 102, assetName: '共享账户', bookId: book } }
    const sharedBill = { ...bill, id: 'bill-4', updatedAt: 201, payload: { ...bill.payload, billId: 'bill-4', syncId: 'bill-4', assetId: 102, billSnapshot: { assetName: '共享账户' } } }
    const batch = await req('/api/data/push', { records: [sharedBill, shared] }, a.cookie)
    assert.equal(batch.body.result.accepted, 2, '账单先于同批次共享账户也能保存')
    const pull = (await req('/api/data/pull', undefined, b.cookie)).body.result.records
    assert.equal(pull.find((r) => r.id === 'bill-4').payload.billSnapshot.assetName, '共享账户')
    const blockedTransfer = await req('/api/data/push', { records: [{ kind: 'transfer', id: 'transfer', updatedAt: 300, payload: { bookId: book, fromAssetId: 101, toAssetId: 102 } }] }, a.cookie)
    assert.equal(blockedTransfer.body.result.denied, 1)
    for (const kind of ['refund', 'reimbursement', 'cycle', 'lend']) {
      const blocked = await req('/api/data/push', { records: [{ kind, id: `${kind}-private`, updatedAt: 301, payload: { bookId: book, assetId: 101 } }] }, a.cookie)
      assert.equal(blocked.body.result.denied, 1, `${kind} 不能引用私有账户`)
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await once(child, 'exit').catch(() => {})
    }
    await rm(temp, { recursive: true, force: true })
  }
})
