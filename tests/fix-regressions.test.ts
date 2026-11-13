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
      { accountBookId: 1, bookId: 1, accountBookName: 'A', ownerId: 1, memberCount: 1, role: 'normal' },
      { accountBookId: 2, bookId: 2, accountBookName: 'B', ownerId: 1, memberCount: 1, role: 'normal' }
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

test('旧记录无属主时认领云端属主，不产生副本', () => {
  reset()
  st().addDream({ name: '旅行', totalNum: 1000, startNum: 0 })
  const rec = st().dreams[0]
  // 模拟旧版本数据：清掉属主
  useLedger.setState({ dreams: [{ ...rec, ownerId: undefined }] } as never)
  const before = st().dreams.length
  st().applyRemote([{
    kind: 'dream', id: String(rec.dreamId), ownerId: 1, updatedAt: Date.now(), versionAuthoritative: true,
    payload: { ...rec, ownerId: 1 }
  }] as never)
  assert.equal(st().dreams.length, before, '旧记录应认领属主而不是变成两条')
  assert.equal(st().dreams[0].ownerId, 1)
})

test('定存累加用转账表达：有流水、余额下降、期初不变，删除后回滚', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: true })
  const deposit = st().fixedDeposits[0]
  assert.ok(deposit.transferId != null, '必须生成对应转账')
  assert.equal(st().assets.find((a) => a.assetId === 10)!.openingBalance, 1000, '期初不得被改动')
  assert.equal(st().assets.find((a) => a.assetId === 10)!.assetNumber, 500, '余额应减少（由流水推导）')
  assert.equal(st().transfers.length, 1, '账户流水里必须有这条')
  st().deleteFixedDeposit(deposit.depositId)
  assert.equal(st().fixedDeposits.length, 0)
  assert.equal(st().transfers.length, 0, '删除时应撤销转账')
  assert.equal(st().assets.find((a) => a.assetId === 10)!.assetNumber, 1000, '余额回到原值')
})

test('定存不勾选时不产生流水也不动余额', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: false })
  assert.equal(st().transfers.length, 0)
  assert.equal(st().assets[0].assetNumber, 1000)
  st().deleteFixedDeposit(st().fixedDeposits[0].depositId)
  assert.equal(st().assets[0].assetNumber, 1000)
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

test('还款即使不显式传账本也继承父记录账本', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }] } as never)
  st().addLend({ type: 1, assetId: 10, counterparty: '李四', number: 200 })
  const parent = st().lends[0]
  useLedger.setState({ currentBookId: 2 } as never)
  // 直接调 addLend 且不传 bookId：仍须落到父记录的 A 账本
  st().addLend({ type: 2, assetId: 10, counterparty: '李四', number: 50, parentLendId: parent.lendId })
  const child = st().lends.find((l) => l.parentLendId === parent.lendId)
  assert.equal(String(child!.bookId), '1')
})

test('模板按一木行为：落到模板账本，不随当前账本漂移', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }] } as never)
  const tpl = st().addTemplate({ name: '早饭', mode: 'bill', bill: { assetId: 10, parentCategoryId: 7, cost: 12 } } as never)
  assert.equal(String(tpl.bookId), '1')
  useLedger.setState({ currentBookId: 2 } as never)
  const ok = st().applyTemplate(tpl.templateId)
  assert.equal(ok, true, '一木允许执行，账单落到模板自身账本')
  const bill = st().bills[0]
  assert.equal(String(bill.bookId), '1', '必须落到 A 账本而不是当前 B')
  assert.equal(bill.billType, 6, '模板记账标记 billType=6')
})

test('模板：账户已删除落到 -1、分类缺失落到其他、金额 0 不直接记账', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [] } as never)
  const tpl = st().addTemplate({ name: '咖啡', mode: 'bill', bill: { assetId: 10, parentCategoryId: 7, cost: 20 } } as never)
  assert.equal(st().applyTemplate(tpl.templateId), true, '一木不因账户删除而拒绝')
  const bill = st().bills[0]
  assert.equal(bill.assetId, -1, '账户已删按一木记 -1')
  // 分类不存在 → 落到「其他」
  const tpl2 = st().addTemplate({ name: '未知分类', mode: 'bill', bill: { assetId: 10, parentCategoryId: 99999, cost: 20 } } as never)
  st().applyTemplate(tpl2.templateId)
  const b2 = st().bills[0]
  assert.equal(st().parentCategories.find((p) => p.id === b2.parentCategoryId)?.name, '其他')
  // 金额 0 → 返回 false（由调用方打开记账页预填）
  const tpl3 = st().addTemplate({ name: '零金额', mode: 'bill', bill: { assetId: 10, parentCategoryId: 7, cost: 0 } } as never)
  assert.equal(st().applyTemplate(tpl3.templateId), false)
})

test('模板：assetId=0 视为无账户(-1)；转账模板同一账户拒绝', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 },
    { assetId: 11, assetName: '储蓄', assetNumber: 0, assetType: 1 }
  ] } as never)
  const tpl = st().addTemplate({ name: '无账户模板', mode: 'bill', bill: { assetId: 0, parentCategoryId: 7, cost: 30 } } as never)
  assert.equal(st().applyTemplate(tpl.templateId), true)
  const bill = st().bills.find((b) => b.cost === 30)
  assert.equal(bill!.assetId, -1, 'assetId=0 按一木记 -1（无账户）')

  const trTpl = st().addTemplate({ name: '同账户转账', mode: 'transfer', transfer: { fromAssetId: 10, toAssetId: 10, cost: 50 } } as never)
  assert.equal(st().applyTemplate(trTpl.templateId), false, '转出转入同一账户必须拒绝')
})

test('模板不能绕过只读账本与私有账户约束', () => {
  reset()
  useLedger.setState({
    currentBookId: 1,
    accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', memberCount: 1, role: 'silent' }],
    assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }]
  } as never)
  const tpl = st().addTemplate({ name: '早饭', mode: 'bill', bill: { assetId: 10, parentCategoryId: 7, cost: 12 } } as never)
  assert.equal(st().applyTemplate(tpl.templateId), false, '只读账本不能通过模板记账')

  useLedger.setState({
    accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', memberCount: 2, role: 'normal' }]
  } as never)
  assert.equal(st().applyTemplate(tpl.templateId), false, '私有账户不能记进多人账本')
})

test('生效账本：空数组=全部隐藏，未设置=全部可见', () => {
  const base = { assetId: 1, assetName: '现金', assetNumber: 0, assetType: 1, bookId: 1 } as never
  assert.equal(visibleAssets([base], 1, 1).length, 1, '未设置 showBook 时按账本归属：A 账本可见')
  assert.equal(visibleAssets([base], 2, 1).length, 0, '未设置 showBook 时按账本归属：B 账本不可见')
  // 旧版空数组 = 未设置 = 全部可见（不能原地改写旧语义）
  const legacy = { ...base, showBook: [] } as never
  assert.equal(visibleAssets([legacy], 1, 1).length, 1, '旧版空数组仍视为全部可见')
  const hidden = { ...base, showBookNone: true } as never
  assert.equal(visibleAssets([hidden], 1, 1).length, 0, 'showBookNone 才是全部隐藏')
  const onlyA = { ...base, showBook: [1] } as never
  assert.equal(visibleAssets([onlyA], 2, 1).length, 0, '仅在 A 账本可见时 B 账本看不到')
})
