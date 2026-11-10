import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

test('offline bills receive stable, non-reused book member sequences', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoman-sync-test-'))
  await copyFile(resolve('server/server.mjs'), join(dir, 'server.mjs'))
  const port = 20000 + Math.floor(Math.random() * 30000)
  const child = spawn(process.execPath, [join(dir, 'server.mjs')], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  })
  const base = `http://127.0.0.1:${port}/api`
  async function call(path, data, cookie) {
    const res = await fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) })
    })
    const body = await res.json()
    assert.equal(body.code, 0, body.msg)
    return { data: body.result, cookie: res.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('test server did not start')), 10000)
      child.stdout.on('data', () => { clearTimeout(timer); ok() })
      child.on('exit', code => { clearTimeout(timer); fail(new Error('server exited ' + code)) })
    })
    const a = (await call('/auth/register', { email: 'a@example.test', password: 'testpassword' })).cookie
    const bReg = await call('/auth/register', { email: 'b@example.test', password: 'testpassword' })
    const b = bReg.cookie
    const book = (await call('/books/create', { name: 'isolated' }, a)).data.bookId
    const invite = (await call('/books/invite', { bookId: book }, a)).data.code
    await call('/books/join', { code: invite }, b)
    await call('/books/role', { bookId: book, userId: bReg.data.user.id, role: 'peer' }, a)
    let members = (await call('/books/members?bookId=' + book, undefined, a)).data.members
    assert.deepEqual(members.map(m => m.memberNo), [1, 2])
    const ids = [randomUUID(), randomUUID(), randomUUID()]
    const make = id => ({ kind: 'bill', id, updatedAt: 100, payload: { syncId: id, billId: 123, bookId: book, cost: 3, updateTime: 100 } })
    await call('/data/push', { records: [make(ids[0])] }, a)
    await call('/data/push', { records: [make(ids[1])] }, b)
    // Another device of the same account sends an independent but identical bill.
    await call('/data/push', { records: [make(ids[2])] }, a)
    await call('/data/push', { records: [make(ids[0])] }, a)
    let rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.length, 3)
    assert.deepEqual(rows.map(r => r.payload.displayId).sort(), ['1-0001', '1-0002', '2-0001'])
    await call('/data/push', { records: [{ ...make(ids[1]), updatedAt: 110,
      payload: { ...make(ids[1]).payload, ownerId: 999, displayId: 'fake' } }] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    const edited = rows.find(r => r.id === ids[1])
    assert.equal(edited.ownerId, bReg.data.user.id)
    assert.equal(edited.payload.displayId, '2-0001')
    assert.equal(edited.payload.ownerId, bReg.data.user.id)
    await call('/data/push', { records: [{ kind: 'bill', id: ids[0], deleted: true, updatedAt: 200 }] }, a)
    await call('/data/push', { records: [make(ids[0])] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === ids[0]).deleted, true)
    const next = randomUUID()
    await call('/data/push', { records: [make(next)] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === next).payload.displayId, '1-0003')
    // A locally deleted bill can reach the server before its first create.
    const offlineDeleted = randomUUID()
    await call('/data/push', { records: [{ kind: 'bill', id: offlineDeleted, bookId: book, deleted: true, updatedAt: 300 }] }, a)
    await call('/data/push', { records: [{ ...make(offlineDeleted), updatedAt: 300 }] }, a)
    rows = (await call('/data/pull', undefined, a)).data.records.filter(r => r.kind === 'bill')
    assert.equal(rows.find(r => r.id === offlineDeleted).deleted, true)
    // Departing members retain their number; newcomers cannot inherit it.
    await call('/books/leave', { bookId: book }, b)
    const cReg = await call('/auth/register', { email: 'c@example.test', password: 'testpassword' })
    const invite2 = (await call('/books/invite', { bookId: book }, a)).data.code
    await call('/books/join', { code: invite2 }, cReg.cookie)
    members = (await call('/books/members?bookId=' + book, undefined, a)).data.members
    assert.deepEqual(members.map(m => m.memberNo), [1, 3])
  } finally {
    child.kill()
    await new Promise(resolveExit => child.once('exit', resolveExit))
    await rm(dir, { recursive: true, force: true })
  }
})
