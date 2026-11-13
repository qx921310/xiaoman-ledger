// 资产走势：必须按「当前余额 − 之后发生的变动」反向推算，区间外的转账/借贷/定存也要算进去
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assetTrend } from '../src/domain/asset-trend'

const DAY = 86400000
const at = (daysAgo: number) => new Date(2026, 10, 20).getTime() - daysAgo * DAY   // 2026-11-20 为基准

const base = {
  parents: [{ id: 7, kind: 'expense' }, { id: 8, kind: 'income' }] as never,
  currencies: [] as never,
  defaultCurrency: 'CNY',
  refunds: [] as never,
  reimbursements: [] as never,
  lends: [] as never,
  transfers: [] as never,
  assetFlows: [] as never
}

test('无记录时每天都是当前余额', () => {
  const assets = [{ assetId: 1, assetNumber: 100, assetType: 1 }] as never
  const pts = assetTrend({ ...base, assets, bills: [] as never } as never, at(3), at(0))
  assert.equal(pts.length, 4)
  assert.ok(pts.every((p) => p.value === 100))
})

test('区间外发生的转账也会影响走势（旧实现只减区间内账单，会算错）', () => {
  const assets = [{ assetId: 1, assetNumber: 500, assetType: 1 }] as never
  // 今天之前 10 天有一笔 200 转出
  const transfers = [{ transferId: 't1', fromAssetId: 1, toAssetId: 2, cost: 200, serviceCharge: 0, time: at(10) }] as never
  const bills: never[] = []
  const pts = assetTrend({ ...base, assets, bills, transfers } as never, at(3), at(0))
  // 近 3 天都在转账之后，余额应恒为 500
  assert.ok(pts.every((p) => p.value === 500), '区间内没有新变动，走势应保持 500')
})

test('借贷与资产流水都进入走势', () => {
  const assets = [{ assetId: 1, assetNumber: 300, assetType: 1 }] as never
  const lends = [{ lendId: 1, type: 1, assetId: 1, number: 100, time: at(1) }] as never  // 昨天借出 100
  const assetFlows = [{ flowId: 'f1', assetId: 1, delta: 50, reason: '新增定存', time: at(2) }] as never
  const pts = assetTrend({ ...base, assets, bills: [] as never, lends, assetFlows } as never, at(3), at(0))
  const values = pts.map((p) => p.value)
  // 由远到近：350（两笔都没发生）→ 400（定存 +50）→ 300（借出 −100）→ 300（今天无变动）
  assert.deepEqual(values, [350, 400, 300, 300])
})
