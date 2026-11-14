import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { loadAccountData } from '../src/account-session'
import { assetMovements } from '../src/domain/asset-trend'
import { queueBookPatch, flushBookPatches, conflictOf, hasPendingBookPatches, getBookPatch, clearBookPatch, resolveConflictUseServer, refreshBookPendingStatus } from '../src/features/book-pending'
import { advanceSessionEpoch } from '../src/domain/session-epoch'
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

const WALL_NOW = Date.now.bind(Date)
const WALL_TIMEOUT = globalThis.setTimeout

async function waitUntil(predicate: () => boolean | Promise<boolean>, timeout = 3500) {
  const deadline = WALL_NOW() + timeout
  while (WALL_NOW() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => WALL_TIMEOUT(resolve, 20))
  }
  assert.ok(await predicate(), '等待自动补传完成超时')
}

test('A 在途+B 入队+A 响应丢失：定时器自动按 A→A(原请求)→B 补传', async () => {
  setCurrentUid(910)
  const original = globalThis.fetch
  const bodies: Array<Record<string, unknown>> = []
  let lose!: (error: Error) => void
  let announce!: () => void
  const started = new Promise<void>((resolve) => { announce = resolve })
  globalThis.fetch = ((_url, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    if (bodies.length === 1) return new Promise<Response>((_resolve, reject) => { lose = reject; announce() })
    return Promise.resolve({ json: async () => ({ code: 0, result: { books: [], operationUpdatedAt: bodies.length + 1 } }) } as Response)
  }) as typeof fetch
  try {
    await queueBookPatch('A', { name: 'A' }, 1)
    const first = flushBookPatches()
    await started
    await queueBookPatch('A', { name: 'B' }, 1)
    lose(new Error('响应丢失'))
    await first
    assert.equal(bodies.length, 1, '网络失败后不得同步紧循环重试')
    const queued = await getBookPatch('A')
    assert.equal(queued?.patch.name, 'B')
    assert.equal(queued?.sending?.patch.name, 'A')
    assert.ok(queued?.retry?.at, '失败必须安排退避时间')
    // 不再显式调用 flush：1 秒基础退避后应由定时器自动恢复。
    await waitUntil(async () => bodies.length === 3 && !(await hasPendingBookPatches()))
    assert.deepEqual(bodies.map((b) => b.name), ['A', 'A', 'B'])
    assert.equal(bodies[1].operationId, bodies[0].operationId)
    assert.notEqual(bodies[2].operationId, bodies[0].operationId)
    assert.equal(bodies[1].baseUpdatedAt, bodies[0].baseUpdatedAt)
  } finally {
    globalThis.fetch = original
  }
})

test('scoped/global 同账本不同草稿：不覆盖、不清旧键，用户取舍后才清理', async () => {
  setCurrentUid(911)
  useLedger.setState({ userId: 911, accountBooks: [{ bookId: 'A', accountBookId: 0, accountBookName: 'A', role: 'normal' }] } as never)
  localStorage.setItem('xiaoman-book-pending:911', JSON.stringify({ A: { name: '账号专属草稿' } }))
  localStorage.setItem('xiaoman-book-pending', JSON.stringify({ A: { name: '全局草稿' } }))
  await queueBookPatch('A', { icon: '新编辑' }, 1)
  const entry = await getBookPatch('A')
  assert.equal(entry?.patch.name, '账号专属草稿')
  assert.equal(entry?.migrationConflict, true)
  assert.equal(entry?.conflict, true)
  assert.ok(localStorage.getItem('xiaoman-book-pending:911'))
  assert.ok(localStorage.getItem('xiaoman-book-pending'))

  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return { json: async () => ({ code: 0, result: { books: [{ bookId: 'A', name: '云端取舍', updatedAt: 5 }] } }) } as Response
  }) as typeof fetch
  try {
    assert.equal((await flushBookPatches()).sent, 0, '来源冲突不得未核对就自动覆盖服务端')
    assert.equal(calls, 0)
    const book = await resolveConflictUseServer('A')
    assert.equal(book.name, '云端取舍')
    assert.equal(await getBookPatch('A'), undefined)
    assert.equal(localStorage.getItem('xiaoman-book-pending:911'), null)
    assert.equal(localStorage.getItem('xiaoman-book-pending'), null)
  } finally {
    globalThis.fetch = original
  }
})

test('跨账号切换：旧回执不写新账号，并保留旧账号的在途快照', async () => {
  setCurrentUid(912)
  useLedger.setState({ userId: 912, accountBooks: [{ bookId: 'shared', accountBookId: 0, accountBookName: '甲本地', role: 'admin' }] } as never)
  await queueBookPatch('shared', { name: '甲编辑' }, 1)
  const original = globalThis.fetch
  let finish!: (response: Response) => void
  let announce!: () => void
  const started = new Promise<void>((resolve) => { announce = resolve })
  globalThis.fetch = (() => new Promise<Response>((resolve) => { finish = resolve; announce() })) as typeof fetch
  try {
    const pending = flushBookPatches()
    await started
    advanceSessionEpoch()
    setCurrentUid(913)
    useLedger.setState({ userId: 913, accountBooks: [{ bookId: 'shared', accountBookId: 0, accountBookName: '乙本地', role: 'admin' }] } as never)
    finish({ json: async () => ({ code: 0, result: { books: [{ bookId: 'shared', name: '甲云端', updatedAt: 2 }], operationUpdatedAt: 2 } }) } as Response)
    await pending
    assert.equal(useLedger.getState().accountBooks[0].accountBookName, '乙本地')
    setCurrentUid(912)
    const queued = await getBookPatch('shared')
    assert.equal(queued?.patch.name, '甲编辑')
    assert.equal(queued?.sending?.patch.name, '甲编辑')
    assert.equal(queued?.sending?.baseUpdatedAt, 1)
    assert.ok(queued?.sending?.operationId)
  } finally {
    globalThis.fetch = original
  }
})

test('同 UID 重新登录：旧代次回执也不能覆盖新会话', async () => {
  setCurrentUid(914)
  useLedger.setState({ userId: 914, accountBooks: [{ bookId: 'same', accountBookId: 0, accountBookName: '新会话本地', role: 'admin' }] } as never)
  await queueBookPatch('same', { name: '旧会话编辑' }, 1)
  const before = await getBookPatch('same')
  const original = globalThis.fetch
  let finish!: (response: Response) => void
  let announce!: () => void
  const started = new Promise<void>((resolve) => { announce = resolve })
  globalThis.fetch = (() => new Promise<Response>((resolve) => { finish = resolve; announce() })) as typeof fetch
  try {
    const pending = flushBookPatches()
    await started
    advanceSessionEpoch()   // uid 不变，代次变化
    useLedger.setState({ accountBooks: [{ bookId: 'same', accountBookId: 0, accountBookName: '重新登录后的本地', role: 'admin' }] } as never)
    finish({ json: async () => ({ code: 0, result: { books: [{ bookId: 'same', name: '旧会话云端', updatedAt: 2 }], operationUpdatedAt: 2 } }) } as Response)
    await pending
    assert.equal(useLedger.getState().accountBooks[0].accountBookName, '重新登录后的本地')
    const after = await getBookPatch('same')
    assert.equal(after?.operationId, before?.operationId)
    assert.deepEqual(after?.sending?.patch, before?.patch)
  } finally {
    globalThis.fetch = original
  }
})

test('租约未到期先登记唤醒，到期自动原样重放', async () => {
  setCurrentUid(915)
  await queueBookPatch('lease', { name: 'A' }, 1)
  const originalFetch = globalThis.fetch
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalNow = Date.now
  const bodies: string[] = []
  let finish!: (response: Response) => void
  let announce!: () => void
  const started = new Promise<void>((resolve) => { announce = resolve })
  let now = 1_800_000_000_000
  let timerId = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  Date.now = () => now
  globalThis.setTimeout = ((fn: () => void, delay = 0) => {
    const id = ++timerId
    timers.set(id, { at: now + Number(delay), fn })
    return id
  }) as unknown as typeof setTimeout
  globalThis.clearTimeout = ((id: number) => { timers.delete(id) }) as unknown as typeof clearTimeout
  globalThis.fetch = ((_url, init) => {
    bodies.push(String(init?.body))
    if (bodies.length === 1) return new Promise<Response>((resolve) => { finish = resolve; announce() })
    return Promise.resolve({ json: async () => ({ code: 0, result: { books: [], operationUpdatedAt: 2 } }) } as Response)
  }) as typeof fetch
  try {
    const first = flushBookPatches()
    await started
    advanceSessionEpoch()
    // 模拟旧请求晚于会话切换返回，留下领取时尚未过期的 sending 租约。
    finish({ json: async () => ({ code: 0, result: { books: [], operationUpdatedAt: 2 } }) } as Response)
    await first
    await flushBookPatches({ automatic: true })
    const status = await refreshBookPendingStatus()
    assert.equal(status.nextRetryAt, now + 60_000)
    const task = [...timers.values()].find((item) => item.at === now + 60_000)
    assert.ok(task, '租约未到期也必须设置到期定时器')
    now += 60_001
    task!.fn()
    await waitUntil(async () => bodies.length === 2 && !(await hasPendingBookPatches()))
    assert.equal(bodies[1], bodies[0])
  } finally {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
    Date.now = originalNow
  }
})

test('已有 IDB 草稿与旧 localStorage 不同：立即待核对，不上传后复活旧草稿', async () => {
  setCurrentUid(922)
  useLedger.setState({ userId: 922, accountBooks: [{ bookId: 'A', accountBookId: 0, accountBookName: 'A', role: 'normal' }] } as never)
  await queueBookPatch('A', { name: 'IDB 新草稿' }, 1)
  localStorage.setItem('xiaoman-book-pending:922', JSON.stringify({ A: { name: 'localStorage 旧草稿' } }))
  await queueBookPatch('A', { icon: '后续编辑' }, 1)
  const entry = await getBookPatch('A')
  assert.equal(entry?.patch.name, 'IDB 新草稿')
  assert.equal(entry?.patch.icon, '后续编辑')
  assert.equal(entry?.migrationConflict, true)
  assert.equal(entry?.conflict, true, '必须立即阻止自动上传，而不是等删除 IDB 后再复活旧草稿')
  assert.ok(localStorage.getItem('xiaoman-book-pending:922'))

  const original = globalThis.fetch
  globalThis.fetch = (async () => ({
    json: async () => ({ code: 0, result: { books: [{ bookId: 'A', name: '云端最终取舍', updatedAt: 3 }] } })
  }) as Response) as typeof fetch
  try {
    const book = await resolveConflictUseServer('A')
    assert.equal(book.name, '云端最终取舍')
    assert.equal(await getBookPatch('A'), undefined)
    assert.equal(localStorage.getItem('xiaoman-book-pending:922'), null)
    assert.equal(await flushBookPatches().then((r) => r.sent), 0, '旧草稿不能在确认后被重新上传')
  } finally {
    globalThis.fetch = original
  }
})
