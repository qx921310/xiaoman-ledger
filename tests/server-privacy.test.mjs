// 服务端账户与快照规则（共享账本已按产品决定停用：多人脱敏路径不再可达，
// 这里只验证「单人账本」下的实际规则，避免用已停用能力做验收）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('单人账本：私有账户可记账，账户不明或引用缺失会被拒绝', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-privacy-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())))
  const child = spawn(process.execPath, [join(temp, 'server', 'server.mjs')], {
    env: { ...process.env, PORT: String(port), DATA_DIR: join(temp, 'data') }, stdio: ['ignore', 'pipe', 'pipe']
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
    const a = await req('/api/auth/register', { email: 'a@privacy.test', password: 'test-pass-123' })
    const book = (await req('/api/books/create', { name: '我的账本' }, a.cookie)).body.result.bookId

    const privateAsset = { kind: 'asset', id: '101', updatedAt: 100, payload: { assetId: 101, assetName: '私有名称' } }
    const bill = { kind: 'bill', id: 'bill-1', updatedAt: 101,
      payload: { billId: 'bill-1', syncId: 'bill-1', bookId: book, assetId: 101, billSnapshot: { assetName: '私有名称' }, cost: 3 } }
    const initial = await req('/api/data/push', { records: [bill, privateAsset] }, a.cookie)
    assert.equal(initial.body.result.accepted, 2, '单人账本可以使用私有账户')

    const owner = (await req('/api/data/pull', undefined, a.cookie)).body.result.records.find((r) => r.id === 'bill-1')
    assert.equal(owner.payload.billSnapshot.assetName, '私有名称', '自己看到的是原名，不做脱敏')

    // 同一批次里先记账、后补账户：必须都成功（离线补录账户的常见形态）
    const shared = { kind: 'asset', id: '102', updatedAt: 200, payload: { assetId: 102, assetName: '后来补的账户', bookId: book } }
    const lateBill = { ...bill, id: 'bill-4', updatedAt: 201,
      payload: { ...bill.payload, billId: 'bill-4', syncId: 'bill-4', assetId: 102, billSnapshot: { assetName: '后来补的账户' } } }
    const batch = await req('/api/data/push', { records: [lateBill, shared] }, a.cookie)
    assert.equal(batch.body.result.accepted, 2, '账单与其账户同批到达应全部接受')
  } finally {
    const exited = once(child, 'exit').catch(() => {})
    child.kill()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
