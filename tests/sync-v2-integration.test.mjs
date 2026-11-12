import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'

const Module = createRequire(import.meta.url)('node:module')
const file = resolve('src/domain/sync-v2-runner.ts')
const source = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd()); mod._compile(source, file)
const { runVersionedSync } = mod.exports

test('真实服务端与两个客户端：清空后旧草稿保留，账户和账本信息不丢失', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoman-v2-integration-'))
  await mkdir(join(dir, 'server'))
  await copyFile('server/server.mjs', join(dir, 'server/server.mjs'))
  const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const server = spawn(process.execPath, [join(dir, 'server/server.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw new Error('server exited') })])
    async function request(path, data, cookie) {
      const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) }, body: data === undefined ? undefined : JSON.stringify(data) })
      const body = await response.json(); assert.equal(body.code, 0, body.msg)
      return { result: body.result, cookie: response.headers.get('set-cookie')?.split(';')[0] }
    }
    const cookie = (await request('/auth/register', { email: 'integration@example.test', password: 'test-password-123' })).cookie
    const bookId = (await request('/books', undefined, cookie)).result.books[0].bookId
    let counter = 0
    const record = (kind, id, payload) => ({ kind, id, bookId, payload: { ...payload, bookId }, updatedAt: 1 })
    const asset = record('asset', 'asset-int', { assetId: 'asset-int', assetName: '账户' })
    const book = record('book', 'book-int', { accountBookId: 'book-int', accountBookName: '账本' })
    const original = record('bill', 'bill-int', { billId: 'bill-int', syncId: 'bill-int', assetId: 'asset-int', cost: 3 })
    function device() {
      let records = [], meta = null
      return { add: r => { records.push(r) }, read: () => structuredClone(records), adapter: {
        read: () => structuredClone(records), apply: incoming => { for (const r of incoming) records = [...records.filter(x => x.kind !== r.kind || x.id !== r.id), structuredClone(r)] },
        load: () => structuredClone(meta), save: m => { meta = structuredClone(m) }, id: () => `integration-operation-${++counter}`, check: () => {},
        pull: async () => (await request('/data/pull', undefined, cookie)).result,
        push: async operations => (await request('/data/push', { protocolVersion: 2, records: operations }, cookie)).result
      } }
    }
    const a = device(), b = device()
    await runVersionedSync(a.adapter); await runVersionedSync(b.adapter)
    a.add(asset); a.add(book); a.add(original); assert.equal((await runVersionedSync(a.adapter)).conflicts, 0)
    assert.equal((await runVersionedSync(b.adapter)).conflicts, 0)
    b.add(record('bill', 'offline-int', { billId: 'offline-int', syncId: 'offline-int', assetId: 'asset-int', cost: 7 }))
    assert.equal((await request('/books/clear', { bookId }, cookie)).result.generation, 1)
    const outcome = await runVersionedSync(b.adapter)
    assert.ok(outcome.conflicted.some(c => c.id === 'offline-int'))
    assert.equal(b.read().find(r => r.id === 'offline-int').payload.cost, 7)
    assert.equal(b.read().find(r => r.id === 'asset-int').deleted, false)
    assert.equal(b.read().find(r => r.id === 'book-int').deleted, false)
    const cloud = (await request('/data/pull', undefined, cookie)).result.records
    assert.equal(cloud.some(r => r.id === 'offline-int'), false)
    assert.equal(cloud.find(r => r.id === 'asset-int').deleted, false)
    assert.equal(cloud.find(r => r.id === 'book-int').deleted, false)
  } finally {
    if (server.exitCode === null && server.signalCode === null) { server.kill(); await once(server, 'exit').catch(() => {}) }
    await rm(dir, { recursive: true, force: true })
  }
})
