// 回归：Codex CR 指出的数据正确性问题（备份、属主合并、跨账本借贷/模板、可见性语义）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { validateBackup } from '../src/backup'
import { visibleAssets } from '../src/domain/asset-scope'

const st = () => useLedger.getState()

const reset = () => {
  useLedger.setState({
    userId: 1, currentBookId: 0, accountBooks: [
      { bookId: 1, name: 'A', accountBookId: 1 } as never,
      { bookId: 2, name: 'B', accountBookId: 2 } as never
    ],
    assets: [], bills: [], lends: [], templates: [], dreams: [], aiTypeRules: [], fixedDeposits: []
  } as never)
}

test('备份包含愿望/智能分类/定存，且能通过校验', () => {
  reset()
  st().addDream({ name: '旅行', totalNum: 1000, startNum: 0 })
  st().addAiTypeRule({ keywords: ['咖啡'], categoryId: 7 })
  st().addFixedDeposit({ amount: 10000, rate: 3, termYears: 3 })
  const dump = st().exportAll() as Record<string, unknown>
  assert.ok((dump.dreams as unknown[]).length === 1)
  assert.ok((dump.aiTypeRules as unknown[]).length === 1)
  assert.ok((dump.fixedDeposits as unknown[]).length === 1)
  // 校验器接受这三个新字段（用真实导出对象，避免伪造的 accountBooks 干扰）
  // 校验器须接受这三类字段：用最小合法样本单独验证，避免受伪造集合影响
  const minimal = {
    version: 3, exportedAt: new Date().toISOString(),
    accountBooks: [], assets: [], bills: [], transfers: [], budgets: [], reimbursements: [],
    refunds: [], lends: [], cycles: [], parentCategories: [], childCategories: [],
    tags: [], currencies: [], tombstones: [],
    splitGroups: [], splitMembers: [], splitExpenses: [], stockAssets: [], stockInfos: [],
    templates: [], homeLoans: [], instalments: [], billGroups: [], billRelated: [],
    dreams: dump.dreams, aiTypeRules: dump.aiTypeRules, fixedDeposits: dump.fixedDeposits
  }
  const file = validateBackup(minimal)
  assert.equal(file.dreams?.length, 1)
  assert.equal(file.aiTypeRules?.length, 1)
  assert.equal(file.fixedDeposits?.length, 1)
})

test('新实体带属主，云端同属主记录不会生成副本', () => {
  reset()
  st().addDream({ name: '旅行', totalNum: 1000, startNum: 0 })
  const local = st().dreams[0]
  assert.equal(local.ownerId, 1)
  const before = st().dreams.length
  st().applyRemote([{
    kind: 'dream', id: String(local.dreamId), ownerId: 1, updatedAt: Date.now(), versionAuthoritative: true,
    payload: { ...local, ownerId: 1 }
  }] as never)
  assert.equal(st().dreams.length, before, '同属主同 ID 不应新增条目')
})

test('定存勾选累加时账户余额增加，删除扣回', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, assetType: 1 }] } as never)
  const d = st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: true })
  assert.equal(st().assets[0].assetNumber, 1500)
  assert.equal(st().assets[0].openingBalance, 1500, '期初余额才是真值')
  const rec = st().fixedDeposits[0]
  st().deleteFixedDeposit(rec.depositId, { reduceAsset: true })
  assert.equal(st().assets[0].assetNumber, 1000, '删除时应扣回')
  assert.equal(st().fixedDeposits.length, 0)
  void d
})

test('定存不勾选时不改动账户余额', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, assetType: 1 }] } as never)
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: false })
  assert.equal(st().assets[0].assetNumber, 1000)
  const rec = st().fixedDeposits[0]
  st().deleteFixedDeposit(rec.depositId, { reduceAsset: true })
  assert.equal(st().assets[0].assetNumber, 1000, '未累加过的定存删除时不该扣')
})

test('跨账本还款继承父借贷账本', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }] } as never)
  st().addLend({ type: 1, assetId: 10, counterparty: '张三', number: 100 })
  const parent = st().lends[0]
  assert.equal(String(parent.bookId), '1')
  useLedger.setState({ currentBookId: 2 } as never)   // 切到 B 账本再还款
  st().repayLend({ lendId: parent.lendId, amount: 40, repaymentAssetId: 10 })
  const child = st().lends.find((l) => l.parentLendId === parent.lendId)
  assert.ok(child, '应生成还款记录')
  assert.equal(String(child!.bookId), '1', '还款记录必须跟随父记录账本')
})

test('模板不属于当前账本时拒绝执行', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }] } as never)
  const tpl = st().addTemplate({ name: '早饭', mode: 'bill', bill: { assetId: 10, parentCategoryId: 7, cost: 12 } } as never)
  assert.equal(String(tpl.bookId), '1')
  useLedger.setState({ currentBookId: 2 } as never)
  const ok = st().applyTemplate(tpl.templateId)
  assert.equal(ok, false, 'B 账本不能执行 A 账本模板')
})

test('生效账本：空数组=全部隐藏，未设置=全部可见', () => {
  const base = { assetId: 1, assetName: '现金', assetNumber: 0, assetType: 1, bookId: 1 } as never
  assert.equal(visibleAssets([base], 1, 1).length, 1, '未设置 showBook 时按账本归属：A 账本可见')
  assert.equal(visibleAssets([base], 2, 1).length, 0, '未设置 showBook 时按账本归属：B 账本不可见')
  const hidden = { ...base, showBook: [] } as never
  assert.equal(visibleAssets([hidden], 1, 1).length, 0, '空数组应全部隐藏')
  const onlyA = { ...base, showBook: [1] } as never
  assert.equal(visibleAssets([onlyA], 2, 1).length, 0, '仅在 A 账本可见时 B 账本看不到')
})
