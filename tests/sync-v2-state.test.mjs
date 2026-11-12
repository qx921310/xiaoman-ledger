import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const Module = createRequire(import.meta.url)('node:module')
const file = resolve('src/domain/sync-v2-state.ts')
const source = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const mod = new Module(file); mod.filename = file; mod.paths = Module._nodeModulePaths(process.cwd()); mod._compile(source, file)
const { bootstrapMeta, queueChanges, acknowledge, recordKey } = mod.exports
const rec = (text) => ({ kind: 'bill', id: 'x', bookId: 'book', payload: { billId: 'x', bookId: 'book', remark: text }, updatedAt: 1 })
test('离线草稿保留创建时的基版本与代次，重试不变，后续编辑不被确认清掉', () => {
  const original = rec('原文'); const meta = bootstrapMeta([original], [{ ...original, version: 4 }], { book: 2 })
  const changed = rec('修改'); queueChanges(meta, [changed], () => 'operation-1')
  const key = recordKey(changed); assert.equal(meta.pending[key].baseVersion, 4); assert.equal(meta.pending[key].generation, 2)
  queueChanges(meta, [rec('再次修改')], () => 'operation-2'); assert.equal(meta.pending[key].operationId, 'operation-1')
  acknowledge(meta, key, 'operation-1', 5); queueChanges(meta, [rec('再次修改')], () => 'operation-2')
  assert.equal(meta.pending[key].baseVersion, 5); assert.equal(meta.pending[key].payload.remark, '再次修改')
})
test('旧数据初次升级不得猜测冲突或清空后的本地新记录', () => {
  let m = bootstrapMeta([rec('本地')], [{ ...rec('云端'), version: 2 }], { book: 0 })
  queueChanges(m, [rec('本地')], () => 'should-not-run'); assert.equal(Object.keys(m.pending).length, 0); assert.equal(Object.keys(m.conflicts).length, 1)
  m = bootstrapMeta([rec('本地')], [], { book: 1 }); queueChanges(m, [rec('本地')], () => 'should-not-run')
  assert.equal(Object.keys(m.pending).length, 0); assert.equal(Object.keys(m.conflicts).length, 1)
  m = bootstrapMeta([rec('旧协议遗留')], [], { book: 0 }); queueChanges(m, [rec('旧协议遗留')], () => 'should-not-run')
  assert.equal(Object.keys(m.pending).length, 0); assert.equal(Object.keys(m.conflicts).length, 1, '代次零无法证明旧记录是清空后新增')
})

test('云端改变时不能覆盖本地未提交修改，也不能提前提升账本代次', () => {
  const { reconcileRemote, advanceGenerations } = mod.exports
  const original = rec('初始'); const meta = bootstrapMeta([original], [{ ...original, version: 1 }], { book: 0 })
  const edited = rec('本地编辑'); const cloud = { ...rec('云端编辑'), version: 2 }
  assert.equal(reconcileRemote(meta, [cloud], [edited]).length, 0)
  assert.equal(Object.keys(meta.conflicts).length, 1)
  advanceGenerations(meta, { book: 1 }, [edited]); assert.equal(meta.generations.book, 0)
})
