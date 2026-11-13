// 账本元数据：图标与显示开关由服务端保存，换设备后仍在（一木 AddAccountBookActivity）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('账本图标与三个开关可保存并在重新拉取时返回', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-books-'))
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
    const call = async (path, data, cookie) => {
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined
      })
      return { body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }

    const reg = await call('/api/auth/register', { email: 'book@xiaoman.test', password: 'book-pass-123' })
    const cookie = reg.cookie
    const created = await call('/api/books/create', { name: '旅行账本', icon: 'ic_parent_traffic' }, cookie)
    assert.equal(created.body.code, 0, '创建成功')

    let list = (await call('/api/books', undefined, cookie)).body.result.books
    const book = list.find((b) => b.name === '旅行账本')
    assert.ok(book, '应能列出新账本')
    assert.equal(book.icon, 'ic_parent_traffic', '图标应保存到服务端')

    const updated = await call('/api/books/update', {
      bookId: book.bookId, showTransfer: false, showStock: false, hideAllCategory: true
    }, cookie)
    assert.equal(updated.body.code, 0, '更新成功')

    list = (await call('/api/books', undefined, cookie)).body.result.books
    const after = list.find((b) => b.bookId === book.bookId)
    assert.equal(Number(after.showTransfer), 0, '显示转账债务流水=关')
    assert.equal(Number(after.showStock), 0, '显示理财流水=关')
    assert.equal(Number(after.hideAllCategory), 1, '隐藏所有分类=开')
    assert.equal(after.icon, 'ic_parent_traffic', '图标仍在')

    // 服务端已经提交但客户端丢失响应：同一操作重试必须返回原确认。
    const replayBody = { bookId: book.bookId, hidden: true, baseUpdatedAt: after.updatedAt, operationId: 'book-operation-12345' }
    const first = await call('/api/books/update', replayBody, cookie)
    const replay = await call('/api/books/update', replayBody, cookie)
    assert.equal(first.body.code, 0)
    assert.equal(replay.body.code, 0)
    assert.equal(replay.body.result.operationUpdatedAt, first.body.result.operationUpdatedAt)
    const changed = await call('/api/books/update', { ...replayBody, hidden: false }, cookie)
    assert.notEqual(changed.body.code, 0, '同一操作编号不能用于不同内容')
  } finally {
    const exited = once(child, 'exit').catch(() => {})
    child.kill()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

// 一木 AddAccountBookActivity / EditAccountBookActivity：名称不能为空、不能重名；
// AccountBook 有 updateTime，并发时应以服务端较新值为准并拒绝旧设备覆盖。
test('账本名称唯一与服务端并发保护', async () => {
  const { mkdtemp, mkdir, copyFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { spawn } = await import('node:child_process')
  const { createServer } = await import('node:net')
  const { once } = await import('node:events')
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-books2-'))
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
    const reg = await call('/api/auth/register', { email: 'book2@xiaoman.test', password: 'book-pass-123' })
    const cookie = reg.cookie
    const a = await call('/api/books/create', { name: '账本甲' }, cookie)
    const b = await call('/api/books/create', { name: '账本乙' }, cookie)
    const bookA = a.body.result.bookId
    const bookB = b.body.result.bookId

    const empty = await call('/api/books/update', { bookId: bookA, name: '   ' }, cookie)
    assert.notEqual(empty.body.code, 0, '空名称必须拒绝')
    assert.match(String(empty.body.msg), /名称/)

    const dup = await call('/api/books/update', { bookId: bookA, name: '账本乙' }, cookie)
    assert.notEqual(dup.body.code, 0, '重名必须拒绝')
    assert.match(String(dup.body.msg), /已经存在/)

    let list = (await call('/api/books', undefined, cookie)).body.result.books
    const baseAt = Number(list.find((x) => x.bookId === bookB).updatedAt)
    // 设备 1 更新成功 → 服务端 updatedAt 变新
    const first = await call('/api/books/update', { bookId: bookB, name: '账本乙-新', baseUpdatedAt: baseAt }, cookie)
    assert.equal(first.body.code, 0)
    // 设备 2 用旧基准再改 → 必须被拒绝，不能覆盖设备 1 的结果
    const stale = await call('/api/books/update', { bookId: bookB, name: '账本乙-旧设备', baseUpdatedAt: baseAt }, cookie)
    assert.notEqual(stale.body.code, 0, '旧设备的更新必须被拒绝')
    list = (await call('/api/books', undefined, cookie)).body.result.books
    assert.equal(list.find((x) => x.bookId === bookB).name, '账本乙-新', '不得被旧设备覆盖')
  } finally {
    const exited = once(child, 'exit').catch(() => {})
    child.kill()
    await exited
    await new Promise((r) => setTimeout(r, 200))
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
