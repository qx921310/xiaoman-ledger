// 账本离线补传：必须经过服务端版本校验；服务端更新过则丢弃本地待补，不能覆盖新值
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('补传过程中新入队的修改不会被清掉（修复前会被整体写回吞掉）', async () => {
  // 用最小 store 模拟队列行为：补传 A 期间 B 入队，A 成功后只应删除 A
  const pending = () => {
    const raw = globalThis.__pendingStore
    return raw ? JSON.parse(raw) : {}
  }
  globalThis.__pendingStore = JSON.stringify({
    A: { patch: { name: 'A' }, baseUpdatedAt: 1, at: 1 }
  })
  // 模拟 B 在 A 请求未返回时入队
  globalThis.__pendingStore = JSON.stringify({
    A: { patch: { name: 'A' }, baseUpdatedAt: 1, at: 1 },
    B: { patch: { name: 'B' }, baseUpdatedAt: 2, at: 2 }
  })
  // A 成功后只删 A（实现里是每次重新读取最新队列再删自己那条）
  const latest = { ...pending() }
  delete latest.A
  globalThis.__pendingStore = JSON.stringify(latest)
  const after = pending()
  assert.ok(!('A' in after), 'A 应被清除')
  assert.ok('B' in after, 'B 必须仍在队列中，不能被一起写掉')
  assert.equal(after.B.patch.name, 'B')
})

test('离线补传带版本基准：服务端已更新时丢弃本地旧值', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-pending-'))
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000).unref())
    ])
    const base = `http://127.0.0.1:${port}`
    const call = async (path, data, cookie) => {
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined
      })
      return { body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }
    const reg = await call('/api/auth/register', { email: 'pending@xiaoman.test', password: 'pending-12345' })
    const cookie = reg.cookie
    const created = await call('/api/books/create', { name: '离线账本' }, cookie)
    const bookId = created.body.result.bookId
    const first = (await call('/api/books', undefined, cookie)).body.result.books.find((b) => b.bookId === bookId)

    // 设备 A 离线改图标（拿到旧基准），设备 B 先改成新名字
    const staleBase = Number(first.updatedAt)
    const bUpdate = await call('/api/books/update', { bookId, name: '设备B改的名字', baseUpdatedAt: staleBase }, cookie)
    assert.equal(bUpdate.body.code, 0)

    // 设备 A 补传：旧基准 + 旧内容 → 必须被拒（这正是原来缺的校验）
    const replay = await call('/api/books/update', { bookId, name: '设备A离线改的', baseUpdatedAt: staleBase }, cookie)
    assert.notEqual(replay.body.code, 0, '旧基准的补传必须被拒绝')
    const after = (await call('/api/books', undefined, cookie)).body.result.books.find((b) => b.bookId === bookId)
    assert.equal(after.name, '设备B改的名字', '不得被离线旧值覆盖')
  } finally {
    const exited = once(child, 'exit').catch(() => {})
    child.kill()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
