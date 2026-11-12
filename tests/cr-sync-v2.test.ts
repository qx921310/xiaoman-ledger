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

  // 1) 一条冲突是否会阻塞其他记录的推送
  {
    const meta = emptyMeta()
    meta.generations = { b1: 1 }
    meta.conflicts['["template","c1"]'] = '历史冲突'
    meta.pending['["template","p1"]'] = { kind: 'template', id: 'p1', payload: {}, operationId: 'op-p1', baseVersion: 0, generation: 1 }
    let pushedCount = -1
    const a = adapter({ meta, records: [rec('p1')], onPush: (r) => { pushedCount = r.length
      return { accepted: 1, skipped: 0, denied: 0, duplicates: 0, results: [] } } })
    await runVersionedSync(a)
    console.log(`  1 条冲突时，实际推送条数 = ${pushedCount}`)
    assert.equal(pushedCount, 0, '存在任何冲突时，该账号所有待推送记录都被停发')
    console.log('  ⚠️ 已证实：一条冲突会冻结整个账号的同步')
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
