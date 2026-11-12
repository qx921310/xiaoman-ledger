// CR：v2 版本协议的三条边界，用假 adapter 精确验证行为（不依赖网络）。
import assert from 'node:assert/strict'
import { runVersionedSync } from '../src/domain/sync-v2-runner'
import { emptyMeta } from '../src/domain/sync-v2-state'

function adapter(opts: { meta: any; records: any[]; remote?: any[]; onPush?: (r: any[]) => any }) {
  let meta = opts.meta
  const pushes: any[] = []
  return {
    read: () => opts.records,
    apply: () => {},
    pull: async () => ({
      records: opts.remote ?? [],
      generations: [{ bookId: 'b1', generation: 1 }]
    }),
    push: async (records: any[]) => {
      pushes.push(records)
      if (opts.onPush) return opts.onPush(records)
      return { accepted: records.length, skipped: 0, denied: 0, duplicates: 0,
        results: records.map((r: any) => ({ kind: r.kind, id: r.id, operationId: r.operationId, status: 'accepted', version: 1 })) }
    },
    load: () => meta,
    save: (m: any) => { meta = m },
    id: () => 'op-' + Math.random().toString(36).slice(2, 12),
    check: () => {}
  } as any
}

const rec = (id: string) => ({ kind: 'template', id, payload: { templateId: id }, updatedAt: 1 })

async function main() {
  console.log('v2 协议 CR 验证')

  // 1) 一条「与 p1 无关联」的冲突，是否会阻塞 p1 的推送
  {
    const { fingerprint } = await import('../src/domain/sync-v2-state')
    const meta = emptyMeta()
    meta.generations = { b1: 1 }
    const c1 = { kind: 'template', id: 'c1', payload: { templateId: 'c1' }, updatedAt: 1 }
    const p1 = { kind: 'template', id: 'p1', payload: { templateId: 'p1' }, updatedAt: 1 }
    meta.conflicts['["template","c1"]'] = '历史冲突'
    meta.bases['["template","p1"]'] = { version: 1, fingerprint: fingerprint(p1 as any) }
    meta.pending['["template","p1"]'] = { ...p1, operationId: 'op-p1', baseVersion: 1, generation: 1 } as any
    let pushedIds: string[] = []
    const a = adapter({ meta, records: [c1, p1] as any[], onPush: (r) => { pushedIds = r.map((x: any) => x.id)
      return { accepted: r.length, skipped: 0, denied: 0, duplicates: 0,
        results: r.map((x: any) => ({ kind: x.kind, id: x.id, operationId: x.operationId, status: 'accepted', version: 2 })) } } })
    await runVersionedSync(a)
    console.log(`  无关联冲突存在时，推送的记录 = ${JSON.stringify(pushedIds)}`)
    assert.deepEqual(pushedIds, ['p1'], '与冲突无关的记录应照常推送')
    console.log('  ✅ 无关冲突不会阻塞其他记录')
  }

  // 1b) 与冲突记录存在引用关系的记录：是否会被一并停发
  {
    const { fingerprint } = await import('../src/domain/sync-v2-state')
    const meta = emptyMeta()
    meta.generations = { b1: 1 }
    const c2 = { kind: 'stockAsset', id: 'c2', payload: { stockAssetId: 'c2' }, updatedAt: 1 }
    const child = { kind: 'stockInfo', id: 'i1', payload: { stockInfoId: 'i1', stockAssetId: 'c2' }, updatedAt: 1 }
    meta.conflicts['["stockAsset","c2"]'] = '历史冲突'
    meta.bases['["stockInfo","i1"]'] = { version: 1, fingerprint: fingerprint(child as any) }
    meta.pending['["stockInfo","i1"]'] = { ...child, operationId: 'op-i1', baseVersion: 1, generation: 1 } as any
    let pushed: string[] = []
    const a = adapter({ meta, records: [c2, child] as any[], onPush: (r) => { pushed = r.map((x: any) => x.id)
      return { accepted: r.length, skipped: 0, denied: 0, duplicates: 0,
        results: r.map((x: any) => ({ kind: x.kind, id: x.id, operationId: x.operationId, status: 'accepted', version: 2 })) } } })
    await runVersionedSync(a)
    console.log(`  冲突记录 c2 的子记录 i1 推送情况 = ${JSON.stringify(pushed)}`)
    assert.deepEqual(pushed, [], '父记录冲突时，子记录必须一同停发（否则会写出悬空引用）')
    console.log('  ✅ 父子关系保持绑定（避免悬空引用）')

    // 资产冲突不得拖累引用它的账单：账单丢失只是少一条账，资产冲突不该连带冻结
    const m2 = emptyMeta()
    m2.generations = { b1: 1 }
    const asset = { kind: 'asset', id: 'a1', payload: { assetId: 'a1' }, updatedAt: 1 }
    const bill = { kind: 'bill', id: 'b1', payload: { billId: 'b1', assetId: 'a1' }, updatedAt: 1 }
    m2.conflicts['["asset","a1"]'] = '历史冲突'
    m2.bases['["bill","b1"]'] = { version: 1, fingerprint: fingerprint(bill as any) }
    m2.pending['["bill","b1"]'] = { ...bill, operationId: 'op-b1', baseVersion: 1, generation: 1 } as any
    let pushedBills: string[] = []
    const a2 = adapter({ meta: m2, records: [asset, bill] as any[], onPush: (r) => { pushedBills = r.map((x: any) => x.id)
      return { accepted: r.length, skipped: 0, denied: 0, duplicates: 0,
        results: r.map((x: any) => ({ kind: x.kind, id: x.id, operationId: x.operationId, status: 'accepted', version: 2 })) } } })
    await runVersionedSync(a2)
    console.log(`  资产冲突时，引用该资产的账单推送情况 = ${JSON.stringify(pushedBills)}`)
    assert.deepEqual(pushedBills, ['b1'], '资产冲突不得阻塞引用它的账单')
  }

  // 2) 指纹是否对键顺序敏感（影响幂等）
  {
    const m = emptyMeta()
    m.generations = { b1: 1 }
    const a1 = rec('x1'); const a2 = { updatedAt: 1, payload: { templateId: 'x1' }, id: 'x1', kind: 'template' }
    const { fingerprint } = await import('../src/domain/sync-v2-state')
    const same = fingerprint(a1 as any) === fingerprint(a2 as any)
    console.log(`  键顺序不同、内容相同的两条记录指纹一致 = ${same}`)
    assert.equal(same, true, '指纹应键顺序无关，保证重试幂等')
    console.log('  ✅ 指纹键顺序无关（重试安全）')
  }

  // 3) generation 缺失时是否会拦下
  {
    const m = emptyMeta()
    m.generations = { b1: 1 }
    m.pending['["template","g1"]'] = { kind: 'template', id: 'g1', payload: {}, operationId: 'op-g1', baseVersion: 0, generation: 1 }
    const a = adapter({ meta: m, records: [rec('g1')],
      onPush: (r) => ({ accepted: 0, skipped: 0, denied: 0, duplicates: 0,
        results: r.map((x: any) => ({ kind: x.kind, id: x.id, operationId: x.operationId, status: 'stale-generation' })) }) })
    const res = await runVersionedSync(a)
    console.log(`  stale-generation 冲突数 = ${res.conflicts}`)
    assert.ok(res.conflicts > 0, '旧代次必须转成冲突而不是静默丢弃')
  }

  console.log('v2 协议 CR 验证完成')
}

main().catch((e) => { console.error(e); process.exit(1) })
