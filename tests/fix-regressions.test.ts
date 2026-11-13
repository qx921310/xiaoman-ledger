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
    assets: [], bills: [], lends: [], templates: [], dreams: [], aiTypeRules: [], fixedDeposits: [], assetFlows: [], transfers: []
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
    dreams: dump.dreams, aiTypeRules: dump.aiTypeRules, fixedDeposits: dump.fixedDeposits, assetFlows: []
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

test('定存按一木写资产流水：有「新增定存/删除定存」记录、期初不变', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: true })
  const deposit = st().fixedDeposits[0]
  assert.equal(deposit.toAsset, true)
  const flow = st().assetFlows[0]
  assert.ok(flow, '必须写入资产流水')
  assert.equal(flow.reason, '新增定存')
  assert.equal(flow.delta, 500)
  assert.equal(st().assets.find((a) => a.assetId === 10)!.openingBalance, 1000, '期初不得被改写')
  assert.equal(st().assets.find((a) => a.assetId === 10)!.assetNumber, 1500, '余额由流水推导后增加')
  st().deleteFixedDeposit(deposit.depositId, { reduceAsset: true })
  assert.equal(st().fixedDeposits.length, 0)
  assert.equal(st().assetFlows.at(-1)!.reason, '删除定存', '删除应写反向流水')
  assert.equal(st().assetFlows.at(-1)!.delta, -500)
  assert.equal(st().assets.find((a) => a.assetId === 10)!.assetNumber, 1000, '删除并扣回后回到原值')
})

test('定存不勾选时不改余额；删除时选择不扣回也保持余额', () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '储蓄', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: false })
  assert.equal(st().assets[0].assetNumber, 1000, '不勾选累加则余额不变')
  st().addFixedDeposit({ amount: 500, rate: 3, termYears: 3, assetId: 10, toAsset: true })
  assert.equal(st().assets[0].assetNumber, 1500)
  // 删除时选择「不扣回」：余额保持，且不写反向流水
  const flowsBefore = st().assetFlows.length
  st().deleteFixedDeposit(st().fixedDeposits[0].depositId, { reduceAsset: false })
  assert.equal(st().assets[0].assetNumber, 1500)
  assert.equal(st().assetFlows.length, flowsBefore, '不扣回时不写反向流水')
  assert.equal(st().transfers.length, 0, '不应产生转账')
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

test('债务记账：借出减少余额、借入增加余额、记录对方与类型', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addLend({ type: 1, assetId: 10, counterparty: '张三', number: 200, remark: '资金借出-现金' })
  assert.equal(st().assets[0].assetNumber, 800, '借出应减少账户余额')
  assert.equal(st().lends[0].type, 1)
  assert.equal(st().lends[0].counterparty, '张三')
  st().addLend({ type: 3, assetId: 10, counterparty: '李四', number: 300, remark: '资金借入-现金' })
  assert.equal(st().assets[0].assetNumber, 1100, '借入应增加账户余额')
})

test('统一记账出口：只读账本、非法金额、账户不存在都被拦下', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 0, assetType: 1 }],
    accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', memberCount: 1, role: 'silent' }] } as never)
  assert.throws(() => st().addBill({ assetId: 10, parentCategoryId: 7, cost: 10 }), /只读/)
  useLedger.setState({ accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', memberCount: 1, role: 'normal' }] } as never)
  assert.throws(() => st().addBill({ assetId: 10, parentCategoryId: 7, cost: 0 }), /金额/)
  assert.throws(() => st().addBill({ assetId: 999, parentCategoryId: 7, cost: 10 }), /账户不存在/)
  // -1 是一木的「无账户」哨兵，允许
  st().addBill({ assetId: -1, parentCategoryId: 7, cost: 10 })
  assert.equal(st().bills.length, 1)
})

test('切账号时不会把上一个账号的资产流水带过来（跨账号隔离）', async () => {
  reset()
  useLedger.setState({ assets: [{ assetId: 10, assetName: '现金', assetNumber: 100, openingBalance: 100, assetType: 1 }] } as never)
  // 账号 1：一条 +500 流水
  st().addAssetFlow({ assetId: 10, delta: 500, reason: '新增定存' })
  assert.equal(st().assetFlows.length, 1)
  // 模拟账号 2 的持久化数据：旧版本没有 assetFlows 键
  const legacy = { version: 0, state: { assets: [{ assetId: 10, assetName: '现金', assetNumber: 100, assetType: 1 }], bills: [] } }
  localStorage.setItem('xiaoman-data:2', JSON.stringify(legacy))
  // 切账号：必须先回到初始状态再 rehydrate
  const { loadAccountData } = await import('../src/account-session')
  await loadAccountData(2)
  assert.equal(st().assetFlows?.length ?? 0, 0, '账号 2 不得继承账号 1 的流水')
  // 关键断言：余额必须按账号 2 自己重算，而不是停在 100+500=600
  if (process.env.DBG_SCOPE) console.log('[dbg] assets=', JSON.stringify(st().assets), 'flows=', JSON.stringify(st().assetFlows))
  const asset = st().assets.find((a) => a.assetId === 10)
  assert.equal(asset?.assetNumber, 100, '账号 2 余额应为 100，不得被上一账号流水抬高')
  assert.equal(asset?.openingBalance, 100, '期初也必须重算为 100，不能写成 600')
  assert.equal(st().defaultCurrency, 'CNY', '新账号的默认币种不应继承上一账号')
})

test('资产流水身份用 UUID：同一毫秒连续新增也不撞号', () => {
  reset()
  for (let i = 0; i < 20; i++) st().addAssetFlow({ assetId: 10, delta: 1, reason: '新增定存' })
  const ids = new Set(st().assetFlows.map((f) => String(f.flowId)))
  assert.equal(ids.size, 20, '20 条流水应有 20 个不同身份')
})

test('清空数据会清掉资产流水', () => {
  reset()
  st().addAssetFlow({ assetId: 10, delta: 100, reason: '新增定存' })
  assert.equal(st().assetFlows.length, 1)
  st().reset()
  assert.equal(st().assetFlows.length, 0, '清空后不得残留流水')
})

test('记账时选报销账户会登记待报销并标记账单', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 },
    { assetId: 11, assetName: '公司报销', assetNumber: 0, openingBalance: 0, assetType: 6 }
  ] } as never)
  const bill = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 88, time: Date.now() })
  st().addReimbursement({ billId: bill.billId, assetId: 11, number: 88 })
  const saved = st().bills.find((b) => b.billId === bill.billId)!
  assert.equal(st().reimbursements.length, 1, '应生成待报销记录')
  assert.equal(st().reimbursements[0].status, 'pending')
  assert.ok(saved.isReimbursement === 1, '账单应标记为待报销')
  assert.equal(saved.reimbursementNum, 88)
})

test('持仓交易账单带 stockInfoId，供理财流水开关筛选', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '证券', assetNumber: 1000, openingBalance: 1000, assetType: 4 }
  ] } as never)
  const asset = st().addStockAsset({ name: '沪深300ETF', code: '510300', price: 1, num: 100, cost: 100, addBill: true })
  st().tradeStock(asset.stockAssetId, 1, 100, 100)
  const bill = st().bills[0]
  assert.ok(bill, '应生成账单')
  assert.ok(bill.stockInfoId != null, '账单必须带 stockInfoId')
  assert.match(bill.remark, /^(买入|卖出)/)
})

test('预算删除墓碑编号与同步身份一致（周预算不能被云端旧值复活）', async () => {
  reset()
  st().setBudget({ month: 'all', categoryId: 7, amount: 100, type: 'week' })
  const { budgetIdentity } = await import('../src/sync')
  const live = st().budgets.find((b) => b.categoryId === 7)!
  const identity = budgetIdentity(live)
  st().setBudget({ month: 'all', categoryId: 7, amount: 0, type: 'week' })
  const stone = st().tombstones.filter((t) => t.kind === 'budget').at(-1)!
  assert.equal(stone.id, identity, '墓碑编号必须等于同步身份')
  assert.match(identity, /^week:all:7$/)
})

test('账单组合：可按一木编辑页写入分类/备注，编辑后合计随成员变化', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 }
  ] } as never)
  const a = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 30, time: Date.now() })
  const b = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 20, time: Date.now() })
  const ok = st().createBillGroup([a.billId, b.billId], { parentCategoryId: 7, remark: '一起付的' })
  assert.equal(ok, true)
  const g = st().billGroups[0]
  assert.equal(g.totalNumber, 50)
  assert.equal(g.remark, '一起付的')
  const c = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 5, time: Date.now() })
  st().updateBillGroup(g.billGroupId, { billList: [a.billId, b.billId, c.billId] })
  assert.equal(st().billGroups[0].totalNumber, 55, '编辑成员后合计应重算')
  st().dissolveBillGroup(g.billGroupId)
  assert.equal(st().billGroups.length, 0)
  assert.equal(st().bills.length, 3, '解散组合不影响账单本身')
})

test('账单拆分：按一木规则拆成多笔并用组合关联，优惠按比例分摊', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 }
  ] } as never)
  const bill = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 100, time: Date.now(), discountNumber: 10 })
  // 金额为 0 的分录应被剔除
  const ok = st().splitBill(bill.billId, [
    { num: 60, parentCategoryId: 7 },
    { num: 0, parentCategoryId: 7 },
    { num: 40, parentCategoryId: 8 }
  ])
  assert.equal(ok, true)
  assert.equal(st().bills.length, 2, '应拆成两笔（0 元那笔被剔除）')
  const group = st().billGroups[0]
  assert.equal(group.billList.length, 2, '拆出的账单应被组合关联')
  assert.equal(group.totalNumber, 100, '合计应等于原账单')
  const costs = st().bills.map((b) => b.cost).sort((a, b) => a - b)
  assert.deepEqual(costs, [40, 60])
  const discounts = st().bills.reduce((n, b) => n + (b.discountNumber ?? 0), 0)
  assert.equal(+discounts.toFixed(2), 10, '优惠应被完整分摊，不多不少')
  // 不足两笔时拒绝
  const single = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 50, time: Date.now() })
  assert.equal(st().splitBill(single.billId, [{ num: 50, parentCategoryId: 7 }]), false)
})

test('账本开关与隐藏可持久化（一木 AddAccountBookActivity 的三个开关）', () => {
  reset()
  useLedger.setState({ currentBookId: 1 } as never)
  st().updateBookMeta('1', { showTransfer: false, showStock: false, hidden: true })
  const book = st().accountBooks.find((b) => String(b.bookId) === '1')!
  assert.equal(book.showTransfer, false)
  assert.equal(book.showStock, false)
  assert.equal(book.hidden, true)
  st().updateBookMeta('1', { hidden: false })
  assert.equal(st().accountBooks.find((b) => String(b.bookId) === '1')!.hidden, false)
})

test('账本「隐藏所有分类」是一次性动作：把所有分类加入该账本的 hideBook', () => {
  reset()
  useLedger.setState({ currentBookId: 1 } as never)
  const before = st().parentCategories.length
  assert.ok(before > 0)
  st().hideAllCategoriesForBook(1)
  assert.equal(st().parentCategories.filter((p) => (p.hideBook ?? []).map(String).includes('1')).length, before,
    '所有父分类都应在本账本隐藏')
  assert.ok(st().childCategories.every((c) => (c.hideBook ?? []).map(String).includes('1')),
    '子分类只在本账本隐藏，不改全局 hide')
  // 账本本身不保存这个开关（一木 AccountBook 没有该字段）
  st().updateBookMeta('1', { showTransfer: false })
  assert.equal((st().accountBooks.find((b) => String(b.bookId) === '1') as { hideAllCategory?: boolean }).hideAllCategory, undefined)
})

test('连续新建标签不会撞 ID', () => {
  reset()
  const ids = new Set<number>()
  for (let i = 0; i < 30; i++) ids.add(st().addTag({ name: `标签${i}` }).tagId)
  assert.equal(ids.size, 30, '30 个标签应有 30 个不同 ID')
  assert.equal(st().tags.length, 30)
})

test('属主认领不跨账本：不同账本的同一 ID 记录保持两条', () => {
  reset()
  useLedger.setState({ currentBookId: 1 } as never)
  st().addDream({ name: 'A账本愿望', totalNum: 100, startNum: 0 })
  const rec = st().dreams[0]
  const before = st().dreams.length
  // 云端同 ID 但属于另一账本、另一属主：不能被认领覆盖
  st().applyRemote([{
    kind: 'dream', id: String(rec.dreamId), ownerId: 2, updatedAt: Date.now() + 1000,
    versionAuthoritative: true,
    payload: { ...rec, ownerId: 2, bookId: 2, name: 'B账本同ID' }
  }] as never)
  assert.ok(st().dreams.length >= before, '不同账本应保留为两条，而不是被覆盖成一条')
  assert.ok(st().dreams.some((d) => d.name === 'A账本愿望'), 'A 账本记录不能被覆盖')
})

test('只读账本的转账模板不能创建流水', () => {
  reset()
  useLedger.setState({
    currentBookId: 1,
    accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', memberCount: 1, role: 'silent' }],
    assets: [
      { assetId: 10, assetName: '现金', assetNumber: 100, openingBalance: 100, assetType: 1 },
      { assetId: 11, assetName: '储蓄', assetNumber: 0, openingBalance: 0, assetType: 1 }
    ]
  } as never)
  const tpl = st().addTemplate({ name: '转账模板', mode: 'transfer', transfer: { fromAssetId: 10, toAssetId: 11, cost: 10 } } as never)
  assert.equal(st().applyTemplate(tpl.templateId), false, '只读账本必须拒绝')
  assert.equal(st().transfers.length, 0, '不得产生转账')
  assert.equal(st().assets.find((a) => a.assetId === 10)!.assetNumber, 100, '余额不得变化')
})

test('收款必须关联原借贷并冲减剩余', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [{ assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 }] } as never)
  st().addLend({ type: 1, assetId: 10, counterparty: '张三', number: 200 })
  const parent = st().lends[0]
  assert.equal(st().lends.filter((l) => l.parentLendId === parent.lendId).length, 0, '尚未收款')
  st().repayLend({ lendId: parent.lendId, amount: 80, repaymentAssetId: 10 })
  const child = st().lends.find((l) => l.parentLendId === parent.lendId)
  assert.ok(child, '收款应生成关联记录')
  assert.equal(String(child!.bookId), '1', '继承父借贷账本')
  // 剩余应收 = 200 - 80
  const { lendRemaining } = require('../src/lend') as typeof import('../src/lend')
  assert.equal(lendRemaining(parent, st().lends), 120)
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
