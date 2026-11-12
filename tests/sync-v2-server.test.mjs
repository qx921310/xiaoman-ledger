import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'

test('版本与账本代次：冲突、幂等、清空及旧客户端', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoman-v2-'))
  await mkdir(join(dir, 'server'))
  await copyFile('server/server.mjs', join(dir, 'server/server.mjs'))
  const probe = createServer().listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  const server = spawn(process.execPath, [join(dir, 'server/server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('server exited') })])
    const req = async (path, data, cookie) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) })
      return { body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const login = await req('/auth/register', { email: 'v2@example.test', password: 'test-password-123' })
    const cookie = login.cookie
    const bookId = (await req('/books', undefined, cookie)).body.result.books[0].bookId
    const record = (op, version, generation, note, id = 'bill-v2') => ({ kind: 'bill', id, operationId: op, baseVersion: version, generation, bookId, updatedAt: 100, payload: { billId: id, syncId: id, bookId, assetId: 1, cost: 3, remark: note } })
    const push = async records => (await req('/data/push', { protocolVersion: 2, records }, cookie)).body.result
    const asset = { kind: 'asset', id: 'asset-1', operationId: 'asset-operation-1', baseVersion: 0, updatedAt: 1, payload: { assetId: 'asset-1', assetName: '测试账户' } }
    assert.equal((await push([asset])).results[0].version, 1)
    const shared = { ...asset, operationId: 'asset-operation-2', baseVersion: 1, generation: 0, bookId, payload: { ...asset.payload, bookId } }
    assert.equal((await push([shared])).results[0].version, 2, '私有账户共享时保留版本基准')
    const book = { kind: 'book', id: 'local-book', operationId: 'book-operation-1', baseVersion: 0, generation: 0, bookId, updatedAt: 1, payload: { accountBookId: 'local-book', bookId, accountBookName: '测试账本' } }
    assert.equal((await push([book])).results[0].status, 'accepted')
    const first = record('operation-1', 0, 0, '初始')
    assert.equal((await push([first])).results[0].version, 1)
    assert.equal((await push([first])).results[0].version, 1, '重试同一操作应幂等')
    assert.equal((await push([{ ...first, payload: { ...first.payload, remark: '伪造' } }])).results[0].status, 'operation-id-reused')
    const a = record('operation-2', 1, 0, '设备A')
    assert.equal((await push([a])).results[0].version, 2)
    assert.equal((await push([record('operation-3', 1, 0, '设备B')])).results[0].status, 'version-conflict')
    const atomic = await push([record('operation-atomic-a', 0, 0, '关联新账单', 'atomic-new'), record('operation-atomic-b', 1, 0, '旧版本')])
    assert.equal(atomic.accepted, 0)
    assert.equal(atomic.results.find(x => x.id === 'atomic-new').status, 'batch-aborted')
    let pulled = (await req('/data/pull', undefined, cookie)).body.result
    assert.equal(pulled.records.find(x => x.id === 'bill-v2').payload.remark, '设备A')
    assert.equal(pulled.records.find(x => x.id === 'bill-v2').version, 2)
    assert.equal(pulled.records.some(x => x.id === 'atomic-new'), false, '批次冲突时不得部分落库')
    const clear = (await req('/books/clear', { bookId }, cookie)).body.result
    assert.equal(clear.generation, 1)
    const afterClear = (await req('/data/pull', undefined, cookie)).body.result.records
    assert.equal(afterClear.find(x => x.id === 'asset-1').deleted, false, '清空账本不应删除账户')
    assert.equal(afterClear.find(x => x.id === 'local-book').deleted, false, '清空账本不应删除账本信息')
    assert.equal((await push([record('operation-4', 0, 0, '离线新增', 'offline-new')])).results[0].status, 'stale-generation')
    const unscoped = record('operation-unscoped', 0, 1, '缺账本', 'unscoped')
    delete unscoped.bookId; delete unscoped.payload.bookId
    assert.equal((await push([unscoped])).results[0].status, 'book-required', '账本流水不能通过省略账本绕过代次')
    assert.equal((await push([record('operation-5', 0, 1, '新代账单', 'new-bill')])).results[0].status, 'accepted')
    const legacy = (await req('/data/push', { records: [record('operation-6', 0, 0, '旧客户端', 'legacy')] }, cookie)).body
    assert.notEqual(legacy.code, 0, '激活后旧客户端不得绕过')
    pulled = (await req('/data/pull', undefined, cookie)).body.result
    assert.equal(pulled.generations.find(x => x.bookId === bookId).generation, 1)
    assert.equal(pulled.records.some(x => x.id === 'offline-new'), false)
  } finally {
    if (server.exitCode === null && server.signalCode === null) { server.kill(); await once(server, 'exit').catch(() => {}) }
    await rm(dir, { recursive: true, force: true })
  }
})
