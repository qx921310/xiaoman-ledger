import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const Module = createRequire(import.meta.url)('node:module')
const file = resolve('src/domain/sync-v2-runner.ts')
const source = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd()); mod._compile(source, file)
const { runVersionedSync } = mod.exports
const rec = (id, text) => ({ kind: 'bill', id, bookId: 'book', payload: { billId: id, bookId: 'book', remark: text }, updatedAt: 1 })
function setup() {
  let remote = [{ ...rec('bill-1', '原始'), version: 1 }]; let generation = 0; let counter = 0
  const seen = new Map()
  const pull = async () => ({ records: structuredClone(remote), generations: [{ bookId: 'book', generation }] })
  const push = async operations => {
    const results = []
    for (const op of operations) {
      if (seen.has(op.operationId)) { results.push(seen.get(op.operationId)); continue }
      const item = remote.find(r => r.id === op.id)
      let status = op.generation !== generation ? 'stale-generation' : (op.baseVersion !== (item?.version ?? 0) ? 'version-conflict' : 'accepted')
      const version = (item?.version ?? 0) + 1
      const result = { kind: op.kind, id: op.id, operationId: op.operationId, status, ...(status === 'accepted' ? { version } : {}) }
      if (status === 'accepted') {
        const { operationId, baseVersion, generation: ignoredGeneration, ...plain } = op
        remote = [...remote.filter(r => r.id !== op.id), { ...plain, version }]
        seen.set(op.operationId, result)
      }
      results.push(result)
    }
    return { accepted: results.filter(r => r.status === 'accepted').length, skipped: 0, denied: 0, duplicates: 0, results }
  }
  const device = () => {
    let records = [rec('bill-1', '原始')], meta = null
    return { adapter: { read: () => structuredClone(records), apply: incoming => { for (const r of incoming) records = [...records.filter(x => x.id !== r.id), structuredClone(r)] }, pull, push, load: () => structuredClone(meta), save: m => { meta = structuredClone(m) }, id: () => `operation-${++counter}`, check: () => {} },
      edit: text => { records = [rec('bill-1', text)] }, add: (id, text) => { records.push(rec(id, text)) }, read: () => records, meta: () => meta }
  }
  return { device, clear: () => { generation++; remote = remote.map(r => ({ ...r, payload: null, deleted: true, version: r.version + 1 })) } }
}
test('两个设备从同一版本离线修改，第二份草稿不能被覆盖', async () => {
  const s = setup(), a = s.device(), b = s.device()
  await runVersionedSync(a.adapter); await runVersionedSync(b.adapter)
  a.edit('设备 A'); b.edit('设备 B')
  assert.equal((await runVersionedSync(a.adapter)).conflicts, 0)
  const result = await runVersionedSync(b.adapter)
  assert.equal(result.conflicts, 1); assert.equal(b.read()[0].payload.remark, '设备 B')
  assert.equal((await runVersionedSync(b.adapter)).conflicts, 1, '冲突跨同步保留')
})
test('清空前离线新增在清空后不能上传，草稿留在本地', async () => {
  const s = setup(), a = s.device(), b = s.device()
  await runVersionedSync(a.adapter); await runVersionedSync(b.adapter)
  b.add('offline-new', '未上传草稿'); s.clear()
  const result = await runVersionedSync(b.adapter)
  assert.ok(result.conflicts >= 1); assert.equal(b.read().find(r => r.id === 'offline-new').payload.remark, '未上传草稿')
})

test('冲突不阻塞无关联账单，但关联退款保持待处理', async () => {
  const s = setup(), a = s.device(), b = s.device()
  await runVersionedSync(a.adapter); await runVersionedSync(b.adapter)
  a.edit('设备 A'); b.edit('设备 B')
  await runVersionedSync(a.adapter); await runVersionedSync(b.adapter)
  b.add('unrelated', '独立账单')
  b.add('linked', '关联退款')
  const linked = b.read().find(r => r.id === 'linked')
  linked.kind = 'refund'; linked.payload = { refundId: 'linked', billId: 'bill-1', bookId: 'book' }
  const result = await runVersionedSync(b.adapter)
  assert.equal(result.pushed, 1, '独立账单应继续推送')
  assert.ok(b.meta().pending[JSON.stringify(['refund', 'linked'])], '关联冲突账单的退款不能先推送')
  assert.equal(b.meta().pending[JSON.stringify(['bill', 'unrelated'])], undefined)
})
