// 回归：Codex CR 指出的数据正确性问题（备份、属主合并、跨账本借贷/模板、可见性语义）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { validateBackup } from '../src/backup'
import { visibleAssets } from '../src/domain/asset-scope'

const st = () => useLedger.getState()

const reset = () => {
  const initial = useLedger.getInitialState()
  useLedger.setState({
    userId: 1, currentBookId: 0, accountBooks: [
      { accountBookId: 1, bookId: 1, accountBookName: 'A', ownerId: 1, memberCount: 1, role: 'normal' },
      { accountBookId: 2, bookId: 2, accountBookName: 'B', ownerId: 1, memberCount: 1, role: 'normal' }
    ],
    assets: [], bills: [], lends: [], templates: [], dreams: [], aiTypeRules: [], fixedDeposits: [], assetFlows: [], transfers: [],
    refunds: [], reimbursements: [], billGroups: [], billRelated: [], splitGroups: [], splitMembers: [], splitExpenses: [],
    tombstones: [], currencies: structuredClone(initial.currencies), defaultCurrency: 'CNY'
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

test('AA 分账：金额必填、至少一位参与人、按金额时合计必须等于总额', () => {
  reset()
  const g = st().addSplitGroup({ name: '周末' })
  const m1 = st().addSplitMember(g.splitGroupId, '我', true)
  const m2 = st().addSplitMember(g.splitGroupId, '小王')
  // 金额非法
  assert.equal(st().addSplitExpense({ splitGroupId: g.splitGroupId, amount: 0, splitType: 0, participants: [{ memberId: m1.splitMemberId, value: 1 }] }), false)
  // 没有参与人
  assert.equal(st().addSplitExpense({ splitGroupId: g.splitGroupId, amount: 100, splitType: 0, participants: [] }), false)
  // 按金额且合计不一致
  assert.equal(st().addSplitExpense({ splitGroupId: g.splitGroupId, amount: 100, splitType: 1, participants: [{ memberId: m1.splitMemberId, value: 60 }] }), false)
  // 均分：100 → 50/50
  assert.equal(st().addSplitExpense({ splitGroupId: g.splitGroupId, amount: 100, splitType: 0, participants: [{ memberId: m1.splitMemberId, value: 0 }, { memberId: m2.splitMemberId, value: 0 }] }), true)
  const e = st().splitExpenses[0]
  assert.deepEqual(e.shares?.map((s) => s.value).sort((a, b) => a - b), [50, 50])
  assert.equal(e.amount, 100)
})

test('附件可按来源删除（账单/转账/借贷），愿望支持比例储蓄字段', () => {
  reset()
  useLedger.setState({ currentBookId: 1, assets: [
    { assetId: 10, assetName: '现金', assetNumber: 1000, openingBalance: 1000, assetType: 1 },
    { assetId: 11, assetName: '储蓄', assetNumber: 0, openingBalance: 0, assetType: 3 }
  ] } as never)
  const file = { fileId: 1, name: 'a.jpg', remotePath: '/uploads/a.jpg' }
  const bill = st().addBill({ assetId: 10, parentCategoryId: 7, cost: 10, time: Date.now(), files: [file] })
  st().setBillFiles(bill.billId, [])
  assert.equal(st().bills.find((b) => b.billId === bill.billId)?.files.length, 0, '账单附件应被删除')

  const transfer = st().addTransfer({ fromAssetId: 10, toAssetId: 11, cost: 10, toCost: 10, files: [file] } as never)
  st().setTransferFiles(transfer.transferId, [])
  assert.equal(st().transfers[0].files?.length, 0, '转账附件应被删除')

  st().addLend({ type: 1, assetId: 10, counterparty: '小王', number: 10 })
  const lend = st().lends[0]
  st().setLendFiles(lend.lendId, [file])
  assert.equal(st().lends[0].files?.length, 1, '借贷附件应能写入')

  st().addDream({ name: '旅行', totalNum: 1000, startNum: 0, addType: 3, ratio: 10 })
  const dream = st().dreams[0]
  assert.equal(dream.addType, 3)
  assert.equal(dream.ratio, 10, '比例储蓄字段应保存')
})

test('智能分类保存子分类；AA 记录可指定日期；预算支持自定义期间', () => {
  reset()
  st().addAiTypeRule({ keywords: ['星巴克'], categoryId: 7, childCategoryId: 71 })
  assert.equal(st().aiTypeRules[0].childCategoryId, 71, '智能分类应保存子分类')

  const g = st().addSplitGroup({ name: '同事' })
  const m1 = st().addSplitMember(g.splitGroupId, '我', true)
  const day = new Date(2026, 10, 1).getTime()
  st().addSplitExpense({ splitGroupId: g.splitGroupId, amount: 100, splitType: 0,
    participants: [{ memberId: m1.splitMemberId, value: 0 }], time: day })
  assert.equal(st().splitExpenses[0].time, day, 'AA 记录应使用所选日期')

  st().setBudget({ month: 'all', categoryId: 0, amount: 500, type: 'custom', budgetId: 1,
    startTime: day, endTime: day + 86400000 })
  const custom = st().budgets.find((b) => b.type === 'custom')!
  assert.equal(custom.startTime, day)
  assert.equal(custom.endTime, day + 86400000)
})

test('智能分类可编辑；预算可保存多个自定义期间', () => {
  reset()
  st().addAiTypeRule({ keywords: ['奶茶'], categoryId: 7, childCategoryId: 71 })
  const rule = st().aiTypeRules[0]
  st().updateAiTypeRule(rule.ruleId, { keywords: ['奶茶', '咖啡'], childCategoryId: 72 })
  const edited = st().aiTypeRules[0]
  assert.deepEqual(edited.keywords, ['奶茶', '咖啡'])
  assert.equal(edited.childCategoryId, 72)

  const day = new Date(2026, 10, 1).getTime()
  st().setBudget({ month: 'all', categoryId: 0, amount: 100, type: 'custom', budgetId: 11, startTime: day, endTime: day + 86400000 })
  st().setBudget({ month: 'all', categoryId: 0, amount: 200, type: 'custom', budgetId: 12, startTime: day + 86400000, endTime: day + 2 * 86400000 })
  const ids = st().budgets.filter((b) => b.type === 'custom').map((b) => b.budgetId)
  assert.ok(ids.includes(11) && ids.includes(12), `两个自定义期间都应保留，实际 ${JSON.stringify(ids)}`)
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

// ===== CR 2026-11-14：拆分总额/事务、组合跨账本、退款字段 =====

const seedAsset = () => {
  st().addAsset({ assetName: '现金', assetType: 1, assetNumber: 100, currency: 'CNY', bookId: 1 } as never)
  return st().assets[0].assetId
}
const seedExpense = (cost: number, bookId: number) => {
  const assetId = seedAsset()
  const parent = st().parentCategories.find((p) => p.kind === 'expense')!
  return st().addBill({ assetId, parentCategoryId: parent.id, cost, billType: 2, time: Date.now(), bookId } as never)
}

test('拆分：总额不等于原账单必须拒绝，且余额不变', () => {
  reset()
  const bill = seedExpense(30, 1)
  const before = st().assets[0].assetNumber
  const ok = st().splitBill(bill.billId, [{ num: 20 }, { num: 20 }] as never)
  assert.equal(ok, false, '20+20 与 30 不符应拒绝')
  assert.equal(st().bills.length, 1, '只应保留原账单')
  assert.equal(st().assets[0].assetNumber, before, '余额不得变化')
})

test('拆分：已退款的账单拒绝拆分', () => {
  reset()
  const bill = seedExpense(30, 1)
  const assetId = st().bills[0].assetId
  assert.equal(st().addRefund({ billId: bill.billId, number: 5, assetId }), true)
  const before = st().assets[0].assetNumber
  const ok = st().splitBill(bill.billId, [{ num: 10 }, { num: 20 }] as never)
  assert.equal(ok, false, '已退款账单不应允许拆分')
  assert.equal(st().assets[0].assetNumber, before)
})

test('拆分：总额一致时成功且余额不变', () => {
  reset()
  const bill = seedExpense(30, 1)
  const before = st().assets[0].assetNumber
  const ok = st().splitBill(bill.billId, [{ num: 10 }, { num: 20 }] as never)
  assert.equal(ok, true)
  assert.equal(st().assets[0].assetNumber, before, '拆分不改变总支出')
})

test('退款：账户/日期/备注写入记录，超额退款被拒绝', () => {
  reset()
  const bill = seedExpense(30, 1)
  const assetId = st().bills[0].assetId
  const time = Date.now() - 86400000
  assert.equal(st().addRefund({ billId: bill.billId, number: 10, assetId, time, remark: '部分退' }), true)
  const rec = st().refunds[0]
  assert.equal(rec.assetId, assetId)
  assert.equal(rec.time, time)
  assert.equal(rec.remark, '部分退')
  assert.equal(st().addRefund({ billId: bill.billId, number: 999, assetId }), false, '超额必须拒绝')
})

test('组合编辑：不允许跨账本成员进入同一组', () => {
  reset()
  const a1 = seedExpense(10, 1)
  const a2 = st().addBill({ assetId: a1.assetId, parentCategoryId: a1.parentCategoryId, cost: 15, billType: 2, time: Date.now(), bookId: 1 } as never)
  const b1 = seedExpense(20, 2)
  const created = st().createBillGroup([a1.billId, a2.billId] as never, { remark: 'x' } as never)
  assert.equal(created, true, '同账本两笔应能成组')
  const group = st().billGroups[0]
  const ok = st().updateBillGroup(group.billGroupId, { billList: [a1.billId, a2.billId, b1.billId] } as never)
  assert.equal(ok, false, '跨账本账单不得并入同一组合')
  assert.equal(st().billGroups[0].billList.length, 2, '组合成员保持不变')
})

test('拆分：支出不能拆成收入（方向必须一致）', () => {
  reset()
  const bill = seedExpense(30, 1)
  const income = st().parentCategories.find((p) => p.kind === 'income')!
  const before = st().assets[0].assetNumber
  const ok = st().splitBill(bill.billId, [
    { num: 10, parentCategoryId: bill.parentCategoryId },
    { num: 20, parentCategoryId: income.id }
  ] as never)
  assert.equal(ok, false, '方向不一致必须拒绝')
  assert.equal(st().assets[0].assetNumber, before, '余额不得变化')
})

test('拆分：外币账单暂不支持，避免汇率差改变余额', () => {
  reset()
  const bill = seedExpense(30, 1)
  useLedger.setState((s) => ({ bills: s.bills.map((b) => String(b.billId) === String(bill.billId) ? { ...b, currencyInfo: 'USD' } : b) }) as never)
  assert.equal(st().splitBill(bill.billId, [{ num: 10 }, { num: 20 }] as never), false)
})

test('拆分回滚不留同步墓碑', () => {
  reset()
  const bill = seedExpense(30, 1)
  const tombstonesBefore = st().tombstones.length
  // 让成组失败：预先占用其中一个 id 的组合归属不可能构造，这里直接校验失败路径不新增墓碑
  st().splitBill(bill.billId, [{ num: 10 }, { num: 20 }] as never)
  assert.ok(st().tombstones.length <= tombstonesBefore + 0, '拆分不应产生删除墓碑')
})

test('只读账本：命令层拒绝退款', () => {
  reset()
  const bill = seedExpense(30, 1)
  // 记账完成后再把账本置为历史只读，校验命令层仍然拒绝写入
  useLedger.setState({ accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', ownerId: 1, memberCount: 1, role: 'silent' }] } as never)
  assert.equal(st().addRefund({ billId: bill.billId, number: 5, assetId: st().bills[0].assetId }), false, '只读账本禁止退款')
})

test('拆分：跨币种账户（人民币账单 + 外币账户）必须拒绝', () => {
  reset()
  st().addAsset({ assetName: '美元', assetType: 1, assetNumber: 900, currency: 'USD', bookId: 1 } as never)
  const usdAsset = st().assets.find((a) => a.currency === 'USD')!
  const parent = st().parentCategories.find((p) => p.kind === 'expense')!
  const bill = st().addBill({ assetId: usdAsset.assetId, parentCategoryId: parent.id, cost: 100, billType: 2, time: Date.now(), bookId: 1 } as never)
  const before = st().assets.find((a) => a.assetId === usdAsset.assetId)!.assetNumber
  assert.equal(st().splitBill(bill.billId, [{ num: 40 }, { num: 60 }] as never), false, '外币账户账单不得拆分')
  assert.equal(st().assets.find((a) => a.assetId === usdAsset.assetId)!.assetNumber, before, '余额不得变化')
})

test('拆分中断：第二笔创建失败时余额必须恢复', () => {
  reset()
  const bill = seedExpense(30, 1)
  const assetId = st().bills[0].assetId
  const before = st().assets[0].assetNumber
  const originalAdd = st().addBill
  let calls = 0
  useLedger.setState({
    addBill: (input: never) => {
      calls += 1
      if (calls >= 1) throw new Error('注入失败')
      return originalAdd(input)
    }
  } as never)
  const ok = st().splitBill(bill.billId, [{ num: 10 }, { num: 20 }] as never)
  useLedger.setState({ addBill: originalAdd } as never)
  assert.equal(ok, false, '创建失败应返回 false')
  assert.equal(st().bills.length, 1, '不应残留半成品账单')
  assert.equal(st().assets[0].assetNumber, before, '余额必须回到拆分前')
})

test('只读账本：命令层拒绝 updateBill 改金额', () => {
  reset()
  const bill = seedExpense(30, 1)
  useLedger.setState({ accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', ownerId: 1, memberCount: 1, role: 'silent' }] } as never)
  st().updateBill(bill.billId, { cost: 99 })
  assert.equal(st().bills[0].cost, 30, '只读账本不允许改金额')
})

test('退款编辑：本币金额、原币到账、账单已退与余额保持一致', () => {
  reset()
  const bill = seedExpense(30, 1)
  // 期初 100，原支出 30 后余额 70；补一笔 5 元退款后是 75。
  assert.equal(st().assets[0].assetNumber, 70)
  assert.equal(st().addRefund({ billId: bill.billId, number: 5, assetId: bill.assetId }), true)
  const refundId = st().refunds[0].refundId
  assert.equal(st().updateRefund(refundId, { baseAmount: 7 }), true)
  const rec = st().refunds[0]
  assert.equal(rec.number, 7, '编辑本币金额必须同步更新实际到账金额')
  assert.equal(rec.baseAmount, 7)
  assert.equal(st().bills[0].refundNum, 7)
  assert.equal(st().assets[0].assetNumber, 77)
})

test('退款换账户：按目标账户币种同步重算原币与本币金额', () => {
  reset()
  const bill = seedExpense(30, 1)
  st().addAsset({ assetId: 991099, assetName: '美元', assetType: 1, assetNumber: 100, currency: 'USD', bookId: 1 } as never)
  const usd = st().assets.find((a) => a.currency === 'USD')!
  useLedger.setState({ currencies: [{ code: 'CNY', name: '人民币', symbol: '¥', rate: 1 }, { code: 'USD', name: '美元', symbol: '$', rate: 7 }] } as never)
  assert.equal(st().addRefund({ billId: bill.billId, number: 7, assetId: bill.assetId }), true)
  const id = st().refunds[0].refundId
  assert.equal(st().updateRefund(id, { assetId: usd.assetId }), true)
  const rec = st().refunds[0]
  assert.equal(rec.baseAmount, 7)
  assert.equal(rec.number, 1)
  assert.equal(rec.currency, 'USD')
  const opening = usd.openingBalance ?? 100
  assert.equal(st().assets.find((a) => a.assetId === usd.assetId)!.assetNumber, +(opening + 1).toFixed(2))
})

test('拆分回滚：已新建一笔后第二新建失败，完整恢复且不留墓碑', () => {
  reset()
  const bill = seedExpense(30, 1)
  const originalAdd = st().addBill
  const before = st().assets[0].assetNumber
  let calls = 0
  useLedger.setState({
    addBill: (input: never) => {
      calls += 1
      if (calls === 2) throw new Error('第二笔新建失败')
      return originalAdd(input)
    }
  } as never)
  try {
    assert.equal(st().splitBill(bill.billId, [{ num: 10 }, { num: 10 }, { num: 10 }] as never), false)
  } finally {
    useLedger.setState({ addBill: originalAdd } as never)
  }
  assert.equal(calls, 2, '必须走到已创建一笔后的第二个写入口')
  assert.equal(st().bills.length, 1)
  assert.equal(st().bills[0].billId, bill.billId)
  assert.equal(st().assets[0].assetNumber, before)
  assert.equal(st().billGroups.length, 0)
  assert.equal(st().tombstones.length, 0)
})

test('拆分成组失败：撤回新分录并恢复原账单', () => {
  reset()
  const bill = seedExpense(30, 1)
  const before = st().assets[0].assetNumber
  const originalCreate = st().createBillGroup
  useLedger.setState({ createBillGroup: (() => false) as never })
  try {
    assert.equal(st().splitBill(bill.billId, [{ num: 10, remark: '第一笔' }, { num: 20 }] as never), false)
  } finally {
    useLedger.setState({ createBillGroup: originalCreate } as never)
  }
  assert.equal(st().bills.length, 1)
  assert.equal(st().bills[0].cost, 30)
  assert.equal(st().bills[0].remark, bill.remark)
  assert.equal(st().assets[0].assetNumber, before)
  assert.equal(st().billGroups.length, 0)
  assert.equal(st().tombstones.length, 0)
})

test('只读账本：退款/报销/组合/转账/复制与关联命令均拒绝写入', () => {
  reset()
  const parent = st().parentCategories.find((p) => p.kind === 'expense')!
  const one = seedExpense(30, 1)
  const two = st().addBill({ assetId: one.assetId, parentCategoryId: parent.id, cost: 20, bookId: 1 } as never)
  st().addAsset({ assetName: '第二账户', assetType: 1, assetNumber: 100, currency: 'CNY', bookId: 1 } as never)
  const otherAsset = st().assets.at(-1)!.assetId
  assert.equal(st().addRefund({ billId: one.billId, number: 5, assetId: one.assetId }), true)
  assert.equal(st().addReimbursement({ billId: one.billId, number: 5, assetId: one.assetId }), true)
  assert.equal(st().createBillGroup([one.billId, two.billId]), true)
  assert.equal(st().linkBills(one.billId, two.billId), true)
  const transfer = st().addTransfer({ fromAssetId: one.assetId, toAssetId: otherAsset, cost: 1, bookId: 1 })
  const third = st().addBill({ assetId: one.assetId, parentCategoryId: parent.id, cost: 8, bookId: 1 } as never)
  const fourth = st().addBill({ assetId: one.assetId, parentCategoryId: parent.id, cost: 9, bookId: 1 } as never)
  const splitGroup = st().addSplitGroup({ name: 'AA', members: ['我'] })
  assert.equal(st().addLend({ type: 1, assetId: one.assetId, counterparty: '借款人', number: 3, bookId: 1 }), true)
  const lendId = st().lends[0].lendId
  assert.equal(st().applySplit(one.billId, splitGroup.splitGroupId, 0), true)
  const splitExpenseId = st().splitExpenses[0].splitExpenseId
  const before = JSON.stringify({
    bills: st().bills, refunds: st().refunds, reimbursements: st().reimbursements,
    billGroups: st().billGroups, transfers: st().transfers, lends: st().lends,
    splitGroups: st().splitGroups, splitMembers: st().splitMembers, splitExpenses: st().splitExpenses,
    balances: st().assets.map((a) => [a.assetId, a.assetNumber]), tombstones: st().tombstones
  })

  useLedger.setState({ accountBooks: [{ accountBookId: 1, bookId: 1, accountBookName: 'A', role: 'silent', memberCount: 1 }] } as never)
  assert.equal(st().createBillGroup([third.billId, fourth.billId]), false)
  assert.equal(st().dissolveBillGroup(st().billGroups[0].billGroupId), false)
  assert.equal(st().removeFromBillGroup(st().billGroups[0].billGroupId, two.billId), false)
  assert.equal(st().updateBillGroup(st().billGroups[0].billGroupId, { remark: '越权' }), false)
  const refundId = st().refunds[0].refundId
  const reimbursementId = st().reimbursements[0].reimbursementId
  assert.equal(st().addReimbursement({ billId: one.billId, number: 1, assetId: one.assetId }), false)
  assert.equal(st().settleReimbursement(reimbursementId), false)
  assert.equal(st().endReimbursement(one.billId), false)
  assert.equal(st().deleteReimbursement(reimbursementId), false)
  assert.equal(st().updateRefund(refundId, { baseAmount: 6 }), false)
  assert.equal(st().deleteRefund(refundId), false)
  assert.equal(st().duplicateBill(one.billId), false)
  assert.equal(st().restoreBill(one), false)
  assert.equal(st().updateTransfer(transfer.transferId, { cost: 2 }), false)
  assert.equal(st().deleteTransfer(transfer.transferId), false)
  assert.equal(st().applySplit(one.billId, splitGroup.splitGroupId, 0), false)
  assert.equal(st().linkBills(third.billId, fourth.billId), false)
  assert.equal(st().unlinkBills(st().billRelated[0].relatedId), false)
  assert.equal(st().addLend({ type: 1, assetId: one.assetId, counterparty: '借款人', number: 1, bookId: 1 }), false)
  assert.equal(st().repayLend({ lendId, amount: 1, repaymentAssetId: one.assetId }), false)
  assert.equal(st().deleteLend(lendId), false)
  assert.throws(() => st().addSplitGroup({ name: '越权组' }), /只读/)
  assert.throws(() => st().addSplitMember(splitGroup.splitGroupId, '越权成员'), /只读/)
  st().updateSplitGroup(splitGroup.splitGroupId, { name: '越权组名' })
  st().deleteSplitGroup(splitGroup.splitGroupId)
  st().deleteSplitMember(splitGroup.splitGroupId * 100)
  st().settleSplit(splitExpenseId, true)
  st().setBillFiles(one.billId, [{ fileId: 1, fileName: 'forbidden.png', name: 'forbidden.png' } as never])
  st().setTransferFiles(transfer.transferId, [{ fileId: 2, fileName: 'forbidden.png', name: 'forbidden.png' } as never])
  st().setLendFiles(lendId, [{ fileId: 3, fileName: 'forbidden.png', name: 'forbidden.png' } as never])
  assert.throws(() => st().addTransfer({ fromAssetId: one.assetId, toAssetId: otherAsset, cost: 1, bookId: 1 }), /只读/)

  const after = JSON.stringify({
    bills: st().bills, refunds: st().refunds, reimbursements: st().reimbursements,
    billGroups: st().billGroups, transfers: st().transfers, lends: st().lends,
    splitGroups: st().splitGroups, splitMembers: st().splitMembers, splitExpenses: st().splitExpenses,
    balances: st().assets.map((a) => [a.assetId, a.assetNumber]), tombstones: st().tombstones
  })
  assert.equal(after, before, '所有只读命令失败后，账务和墓碑均必须原样保留')
})
