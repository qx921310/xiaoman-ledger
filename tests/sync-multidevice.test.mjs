// 同账号多设备联测：两「设备」共享一个账号，验证 9 类新实体的双向同步、
// 删除墓碑、LWW 冲突与周期去重。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

const KINDS = [
  ['splitGroup', 'splitGroupId', { name: '联测AA组' }],
  ['splitMember', 'splitMemberId', { name: '联测成员' }],
  ['splitExpense', 'splitExpenseId', { amount: 100 }],
  ['stockAsset', 'stockAssetId', { name: '联测持仓' }],
  ['stockInfo', 'stockInfoId', { num: 10 }],
  ['template', 'templateId', { name: '联测模板' }],
  ['homeLoan', 'loanId', { name: '联测房贷' }],
  ['instalment', 'instalmentId', { totalNumber: 1200 }],
  ['billGroup', 'billGroupId', { firstBillId: 'b1' }],
  ['billRelated', 'relatedId', { oneBillId: 'b1', twoBillId: 'b2' }]
]

test('同账号两台设备：新实体同步、删除、冲突与周期去重', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-multidev-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()))
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

    // 一个账号，两台设备共用同一个会话 cookie（同账号多设备）
    const reg = await req('/api/auth/register', { email: 'dev@multi.test', password: 'multi-pass-123' })
    assert.equal(reg.body.code, 0, '注册成功')
    const dev = reg.cookie

    const books = await req('/api/books', undefined, dev)
    const bookId = books.body.result.books[0].bookId ?? books.body.result.books[0].accountBookId
    assert.ok(bookId, '应拿到账本 id')

    // ── 设备 A：推送 10 类新实体 ──
    const now = Date.now()
    const records = KINDS.map(([kind, key, extra], i) => ({
      kind, id: String(1000 + i), bookId,
      updatedAt: now + i,
      payload: { [key]: 1000 + i, bookId, ...extra, updateTime: now + i }
    }))
    const pushed = await req('/api/data/push', { records }, dev)
    assert.equal(pushed.body.code, 0, '设备 A 推送成功')

    // ── 设备 B：拉取应拿到全部 10 类 ──
    const pulled = await req('/api/data/pull', undefined, dev)
    const got = new Map(pulled.body.result.records.map((r) => [r.kind + ':' + r.id, r]))
    for (const [kind, , extra] of KINDS) {
      const hit = [...got.entries()].find(([k]) => k.startsWith(kind + ':'))
      assert.ok(hit, `设备 B 应拉到 ${kind}`)
      assert.equal(hit[1].bookId, bookId, `${kind} 应带账本作用域`)
    }

    // ── 设备 A 修改一条，时间更新 ──
    const edited = await req('/api/data/push', {
      records: [{ kind: 'stockAsset', id: '1003', bookId, updatedAt: now + 500,
        payload: { stockAssetId: 1003, name: '联测持仓-已改', bookId, updateTime: now + 500 } }]
    }, dev)
    assert.equal(edited.body.code, 0)
    const afterEdit = await req('/api/data/pull', undefined, dev)
    const stock = afterEdit.body.result.records.find((r) => r.kind === 'stockAsset' && r.id === '1003')
    assert.equal(stock.payload.name, '联测持仓-已改', '修改同步到另一设备')

    // ── 设备 A 删除一条（墓碑）──
    const del = await req('/api/data/push', {
      records: [{ kind: 'template', id: '1005', bookId, updatedAt: now + 600, payload: null, deleted: true }]
    }, dev)
    assert.equal(del.body.code, 0)
    const afterDel = await req('/api/data/pull', undefined, dev)
    const tpl = afterDel.body.result.records.find((r) => r.kind === 'template' && r.id === '1005')
    assert.ok(tpl && tpl.deleted === true, '删除以墓碑形式同步')

    // ── 冲突：同一条记录两个时间戳，服务端应保留较新的 ──
    await req('/api/data/push', { records: [{ kind: 'homeLoan', id: '1006', bookId, updatedAt: now + 700,
      payload: { loanId: 1006, name: '新版本', bookId, updateTime: now + 700 } }] }, dev)
    await req('/api/data/push', { records: [{ kind: 'homeLoan', id: '1006', bookId, updatedAt: now + 100,
      payload: { loanId: 1006, name: '旧版本', bookId, updateTime: now + 100 } }] }, dev)
    const afterConflict = await req('/api/data/pull', undefined, dev)
    const loan = afterConflict.body.result.records.find((r) => r.kind === 'homeLoan' && r.id === '1006')
    assert.equal(loan.payload.name, '新版本', '旧写入不能覆盖新版本')

    // ── 周期账单：同一期号两台设备各推一条，只应保留一条 ──
    const periodKey = `${bookId}|cycle-1|2026-11-12`
    const p1 = await req('/api/data/push', { records: [{ kind: 'bill', id: 'bill-a', bookId, periodKey,
      updatedAt: now + 800, payload: { billId: 'bill-a', cost: 30, bookId, time: now, updateTime: now + 800 } }] }, dev)
    const p2 = await req('/api/data/push', { records: [{ kind: 'bill', id: 'bill-b', bookId, periodKey,
      updatedAt: now + 900, payload: { billId: 'bill-b', cost: 30, bookId, time: now, updateTime: now + 900 } }] }, dev)
    assert.equal(p1.body.code, 0)
    assert.equal(p2.body.code, 0)
    const authed = (p2.body.result?.authoritative ?? []).concat(p1.body.result?.authoritative ?? [])
    const dup = p2.body.result?.duplicates ?? p1.body.result?.duplicates ?? 0
    assert.ok(dup > 0 || authed.length > 0, '同期号第二条应被判重或返回权威记录')
    const finalPull = await req('/api/data/pull', undefined, dev)
    const periodBills = finalPull.body.result.records.filter(
      (r) => r.kind === 'bill' && r.payload && String(r.payload.time) === String(now))
    assert.equal(periodBills.length, 1, '同一期号只保留一条账单')

    // ── Codex P0-3：同一时间戳、内容不同，不能静默覆盖 ──
    const tEq = now + 2000
    await req('/api/data/push', { records: [{ kind: 'template', id: 'eq-1', bookId, updatedAt: tEq,
      payload: { templateId: 'eq-1', name: '设备A的模板', bookId, updateTime: tEq } }] }, dev)
    const eqPush = await req('/api/data/push', { records: [{ kind: 'template', id: 'eq-1', bookId, updatedAt: tEq,
      payload: { templateId: 'eq-1', name: '设备B的模板', bookId, updateTime: tEq } }] }, dev)
    assert.equal(eqPush.body.result.conflicts, 1, '同时间戳不同内容应记为冲突')
    assert.equal(eqPush.body.result.conflicted[0].reason, 'equal-timestamp')
    const eqPull = await req('/api/data/pull', undefined, dev)
    const eqTpl = eqPull.body.result.records.find((r) => r.kind === 'template' && r.id === 'eq-1')
    assert.equal(eqTpl.payload.name, '设备A的模板', '冲突时保留先在服务端的版本，不静默覆盖')

    // ── Codex CR-2：完全相同的重推必须幂等，不能误报冲突 ──
    const idemTime = now + 3000
    const idemRec = { kind: 'stockInfo', id: 'idem-1', bookId, updatedAt: idemTime,
      payload: { stockInfoId: 'idem-1', num: 5, bookId, updateTime: idemTime } }
    await req('/api/data/push', { records: [idemRec] }, dev)
    const idemAgain = await req('/api/data/push', { records: [idemRec] }, dev)
    assert.equal(idemAgain.body.result.conflicts, 0, '完全相同的重推不应算冲突')
    assert.equal(idemAgain.body.result.accepted + idemAgain.body.result.skipped, 1, '重推应被幂等接受或跳过')

    // 键顺序不同但内容相同 → 仍视为同一版本
    const reordered = { kind: 'stockInfo', id: 'idem-1', bookId, updatedAt: idemTime,
      payload: { updateTime: idemTime, bookId, num: 5, stockInfoId: 'idem-1' } }
    const idemShuffled = await req('/api/data/push', { records: [reordered] }, dev)
    assert.equal(idemShuffled.body.result.conflicts, 0, '键顺序不同不应算冲突')

    // ── Codex P0-5：清空账本后，离线设备重推旧记录不能复活 ──
    const clearRes = await req('/api/books/clear', { bookId }, dev)
    assert.equal(clearRes.body.code, 0, '清空成功')
    assert.equal(clearRes.body.result.tombstoned, true, '清空应为墓碑而非物理删除')
    // 设备 B 离线时手里还是旧记录，重推
    // 离线设备手里的版本时间必然早于清空时刻
    const replay = await req('/api/data/push', { records: [{ kind: 'stockAsset', id: '1003', bookId,
      updatedAt: now, payload: { stockAssetId: 1003, name: '联测持仓-已改', bookId, updateTime: now } }] }, dev)
    assert.equal(replay.body.result.accepted, 0, '旧版本重推应被拒绝')
    const afterClear = await req('/api/data/pull', undefined, dev)
    const revivedStock = afterClear.body.result.records.find((r) => r.kind === 'stockAsset' && r.id === '1003')
    assert.ok(!revivedStock || revivedStock.deleted === true, '清空后旧数据不能复活')
  } finally {
    child.kill()
    await rm(temp, { recursive: true, force: true }).catch(() => {})
  }
})
