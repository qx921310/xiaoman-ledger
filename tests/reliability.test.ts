import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { loadAccountData } from '../src/account-session'
import { assetMovements } from '../src/domain/asset-trend'
import { queueBookPatch, flushBookPatches, conflictOf, hasPendingBookPatches, getBookPatch, clearBookPatch } from '../src/features/book-pending'
import { setCurrentUid } from '../src/auth'
import { deriveAssets, unresolvedReimbursementAssets } from '../src/balances'

test('已有期初优先于过期余额缓存', async () => {
  const initial = useLedger.getInitialState()
  const snapshot = { ...initial, assets: [{ assetId: 99, assetName: '现金', assetType: 1, openingBalance: 100, assetNumber: 600 }], assetFlows: [] }
  localStorage.setItem('xiaoman-data:901', JSON.stringify({ state: snapshot, version: 0 }))
  await loadAccountData(901)
  assert.equal(useLedger.getState().assets[0].openingBalance, 100)
  assert.equal(useLedger.getState().assets[0].assetNumber, 100)
})

test('资产走势采用报销实际到账原币金额', () => {
  const movements = assetMovements({ assets: [], bills: [], transfers: [], lends: [], refunds: [], assetFlows: [], parents: [], currencies: [], defaultCurrency: 'CNY', reimbursements: [{ assetId: 2, number: 720, accountAmount: 100, status: 'done', settledAt: 10 }] } as never)
  assert.equal(movements.get(2)?.[0].delta, 100)
})

test('外币汇率缺失时不能按 1:1 确认报销', () => {
  useLedger.setState({ currentBookId: 1, accountBooks: [], defaultCurrency: 'CNY', currencies: [],
    assets: [{ assetId: 1, assetName: '美元', assetNumber: 0, openingBalance: 0, assetType: 1, currency: 'USD' }],
    bills: [], reimbursements: [], transfers: [], lends: [], refunds: [], assetFlows: [] } as never)
  const s = useLedger.getState()
  const bill = s.addBill({ assetId: 1, parentCategoryId: 7, cost: 100 })
  s.addReimbursement({ billId: bill.billId, assetId: 1, number: 100 })
  const id = useLedger.getState().reimbursements[0].reimbursementId
  assert.equal(s.settleReimbursement(id), false)
  assert.equal(useLedger.getState().reimbursements[0].status, 'pending')
  assert.equal(useLedger.getState().assets[0].assetNumber, -100)
})

test('历史外币报销缺少汇率时保留账户缓存并标记核对', () => {
  const data = { assets: [{ assetId: 3, assetName: '美元', currency: 'USD', assetNumber: 100, openingBalance: 0 }],
    bills: [], transfers: [], lends: [], refunds: [], parentCategories: [], defaultCurrency: 'CNY',
    reimbursements: [{ assetId: 3, number: 720, status: 'done' }] } as never
  assert.equal(unresolvedReimbursementAssets(data).has(3), true)
  assert.equal(deriveAssets(data)[0].assetNumber, 100)
})

test('补传期间的新修改保留，不被旧回执清掉', async () => {
  setCurrentUid(902)
  const original = globalThis.fetch
  let finish!: (response: Response) => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  let calls = 0
  const bodies: Array<Record<string, unknown>> = []
  globalThis.fetch = ((_url, init) => {
    calls++
    const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as Record<string, unknown>
    bodies.push(body)
    if (calls === 1) return new Promise<Response>((resolve) => { finish = resolve; signalStarted() })
    return Promise.resolve({ json: async () => ({ code: 0, result: { books: [{ bookId: 'A', updatedAt: 3 }], operationUpdatedAt: 3 } }) } as Response)
  }) as typeof fetch
  try {
    await queueBookPatch('A', { name: '旧' }, 1)
    const pending = flushBookPatches()
    await started
    await queueBookPatch('A', { name: '新' }, 1)
    finish({ json: async () => ({ code: 0, result: { books: [{ bookId: 'A', updatedAt: 2 }], operationUpdatedAt: 2 } }) } as Response)
    await pending
    // 第二轮会用推进后的基准把新编辑补发出去
    assert.ok(bodies.length >= 2, `应补发一次，实际请求 ${bodies.length} 次`)
    assert.equal(bodies[0].name, '旧')
    assert.equal(bodies[1].name, '新')
    assert.equal(bodies[1].baseUpdatedAt, 2, '第二轮必须使用推进后的基准')
    assert.equal(await hasPendingBookPatches(), false, '新编辑不能被丢掉，应被下一轮补传')
  } finally {
    globalThis.fetch = original
  }
})

test('冲突错误码会保留草稿并标记待核对', async () => {
  setCurrentUid(909)
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({
    json: async () => ({ code: 1, errorCode: 'BOOK_CONFLICT', msg: '该账本已在其他设备更新' })
  })) as typeof fetch
  try {
    await queueBookPatch('C', { name: '本地改' }, 1)
    const result = await flushBookPatches()
    assert.equal(result.conflicted, 1)
    const kept = await getBookPatch('C')
    assert.equal(kept?.patch.name, '本地改', '冲突不得丢弃本地草稿')
    assert.equal((await conflictOf('C'))?.conflict, true)
    // 冲突条目不会再被自动补传
    const again = await flushBookPatches()
    assert.equal(again.sent, 0)
  } finally {
    globalThis.fetch = original
  }
})

test('不同账号的账本草稿相互隔离', async () => {
  setCurrentUid(903)
  await queueBookPatch('A', { name: '账号一' }, 1)
  setCurrentUid(904)
  assert.equal(await hasPendingBookPatches(), false)
  await queueBookPatch('B', { name: '账号二' }, 2)
  setCurrentUid(903)
  const first = await getBookPatch('A')
  assert.equal(first?.patch.name, '账号一')
  assert.equal(await getBookPatch('B'), undefined)
})

test('并发写入不同账本时队列保留所有操作', async () => {
  setCurrentUid(908)
  await Promise.all(Array.from({ length: 60 }, (_, i) => queueBookPatch(`book-${i}`, { name: `账本${i}` }, 1)))
  const rows = await Promise.all(Array.from({ length: 60 }, (_, i) => getBookPatch(`book-${i}`)))
  assert.equal(rows.filter(Boolean).length, 60, '60 条并发写入必须全部保留')
  await Promise.all(Array.from({ length: 50 }, (_, i) => queueBookPatch('same', { [`field${i}`]: i }, 1)))
  const combined = await getBookPatch('same')
  assert.equal(Object.keys(combined?.patch ?? {}).length, 50, '同一账本的并发修改应合并而不是互相覆盖')
})

test('缺少 IndexedDB 时拒绝保存，避免无锁覆盖', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined })
  try {
    await assert.rejects(queueBookPatch('Z', { name: '不应写入' }, 1), /无法安全保存账本/)
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original)
  }
})

test('旧队列只迁移当前账号可以确认的账本，成功后清理旧键', async () => {
  setCurrentUid(905)
  useLedger.setState({ userId: 905, accountBooks: [{ bookId: 'A', accountBookId: 0, accountBookName: 'A' }] } as never)
  localStorage.setItem('xiaoman-book-pending', JSON.stringify({ A: { name: '本人' }, B: { name: '待确认' } }))
  await queueBookPatch('A', { icon: 'x' }, 1)
  const migrated = await getBookPatch('A')
  assert.equal(migrated?.patch.name, '本人')
  assert.equal(migrated?.patch.icon, 'x')
  const legacy = JSON.parse(localStorage.getItem('xiaoman-book-pending')!)
  assert.equal(legacy.B.name, '待确认', '归属未确认的条目留在旧键')
  assert.equal(legacy.A, undefined, '已迁移的条目必须从旧键删除')
})

test('响应丢失后用原操作编号和原请求重放', async () => {
  setCurrentUid(906)
  const original = globalThis.fetch
  const sent: string[] = []
  globalThis.fetch = (async (_url, init) => {
    sent.push(String(init?.body))
    if (sent.length === 1) throw new Error('响应丢失')
    return { json: async () => ({ code: 0, result: { books: [{ bookId: 'A', updatedAt: 2 }], operationUpdatedAt: 2 } }) } as Response
  }) as typeof fetch
  try {
    await queueBookPatch('A', { hidden: true }, 1)
    await flushBookPatches()
    assert.equal(await hasPendingBookPatches(), true)
    await flushBookPatches()
    assert.equal(sent[1], sent[0], '重放必须使用完全相同的请求体（含 operationId）')
    assert.equal(await hasPendingBookPatches(), false)
  } finally {
    globalThis.fetch = original
  }
})

test('隐藏请求未确认时恢复，按顺序提交两个操作', async () => {
  setCurrentUid(907)
  const original = globalThis.fetch
  const sent: Array<{ hidden: boolean; operationId: string }> = []
  let finish!: (response: Response) => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  globalThis.fetch = ((_url, init) => {
    sent.push(JSON.parse(String(init?.body)))
    if (sent.length === 1) return new Promise<Response>((resolve) => { finish = resolve; signalStarted() })
    return Promise.resolve({ json: async () => ({ code: 0, result: { books: [], operationUpdatedAt: 3 } }) } as Response)
  }) as typeof fetch
  try {
    await queueBookPatch('A', { hidden: true }, 1)
    const pending = flushBookPatches()
    await started
    await queueBookPatch('A', { hidden: false }, 1)
    finish({ json: async () => ({ code: 0, result: { books: [], operationUpdatedAt: 2 } }) } as Response)
    await pending
    assert.deepEqual(sent.map((x) => x.hidden), [true, false])
    assert.notEqual(sent[0].operationId, sent[1].operationId)
    assert.equal(await hasPendingBookPatches(), false)
  } finally {
    globalThis.fetch = original
  }
})
