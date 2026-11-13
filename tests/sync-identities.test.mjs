// 同账号多设备：账单显示号的分配必须稳定、不重号（共享账本已按产品决定停用，
// 因此这里只验证「同一账号、同一账本、多设备」这一实际形态）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

test('同账号多设备：账单显示号稳定且不复用', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoman-sync-test-'))
  await copyFile(resolve('server/server.mjs'), join(dir, 'server.mjs'))
  const port = 20000 + Math.floor(Math.random() * 30000)
  const child = spawn(process.execPath, [join(dir, 'server.mjs')], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  })
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('server startup timeout')), 10000)
      child.stdout.on('data', () => { clearTimeout(timer); ok() })
      child.on('exit', code => fail(new Error('server exited ' + code)))
    })
    const base = `http://127.0.0.1:${port}/api`
    const call = async (path, data, cookie) => {
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined
      })
      const json = await res.json()
      // 服务端统一返回 { code, result }，这里把 result 摊平方便断言
      return { data: json.result ?? {}, raw: json, cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }

    const a = (await call('/auth/register', { email: 'a@example.test', password: 'testpassword' })).cookie
    const book = (await call('/books/create', { name: '工作日' }, a)).data.bookId

    // 同一账号两台设备（同 cookie，模拟同一登录态的不同设备）
    const ids = [randomUUID(), randomUUID(), randomUUID()]
    const make = (id, t = 100) => ({ kind: 'bill', id, updatedAt: t,
      payload: { syncId: id, billId: 123, bookId: book, cost: 3, updateTime: t } })
    await call('/data/push', { records: [make(ids[0])] }, a)
    await call('/data/push', { records: [make(ids[1])] }, a)
    await call('/data/push', { records: [make(ids[2])] }, a)

    let rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.map(r => r.payload.displayId).sort(), ['1-0001', '1-0002', '1-0003'],
      '同账号多设备应顺延分配，不重号')

    // 重复推送同一条：不得再分配新号
    await call('/data/push', { records: [make(ids[0])] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === ids[0]).payload.displayId, '1-0001', '重推不应换号')

    // 删除后旧的重复推送（时间更早）不得复活；这是跨设备重试的常见形态
    await call('/data/push', { records: [{ kind: 'bill', id: ids[0], deleted: true, updatedAt: 400 }] }, a)
    await call('/data/push', { records: [make(ids[0], 150)] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === ids[0]).deleted, true, '较旧的重复推送不得复活已删账单')

    // 新增一条继续顺延
    const next = randomUUID()
    await call('/data/push', { records: [make(next, 300)] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === next).payload.displayId, '1-0004', '编号继续顺延')

    // 离线删除先到、创建后到：仍应保持删除
    const offlineDeleted = randomUUID()
    await call('/data/push', { records: [{ kind: 'bill', id: offlineDeleted, bookId: book, deleted: true, updatedAt: 400 }] }, a)
    await call('/data/push', { records: [{ ...make(offlineDeleted, 400) }] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === offlineDeleted).deleted, true)
  } finally {
    child.kill()
    await new Promise(resolveExit => child.once('exit', resolveExit))
    await rm(dir, { recursive: true, force: true })
  }
})
