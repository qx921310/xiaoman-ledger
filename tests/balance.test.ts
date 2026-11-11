import { strict as assert } from 'node:assert'
import { deriveAssets } from '../src/balances'
import { buildExportTable, buildImportPlan, parseLedgerFile } from '../src/importer'
import * as XLSX from 'xlsx'
import { editAmount, evaluateAmount, formatAmount } from '../src/ui/keypad'
import { lendRemaining, lendTotals } from '../src/lend'
import { mergeRemote } from '../src/domain/sync-merge'
import { leaksPrivateAccount, visibleAssets } from '../src/domain/asset-scope'
import { dedupeCycleBills as dedupeBills } from '../src/domain/cycle-dedupe'
import { planCycles } from '../src/domain/cycles'
import { fullDay, humanDay } from '../src/ui-format'
import { accountHistory } from '../src/domain/account-history'
import { parseShares, splitAmounts } from '../src/domain/split'
import { buildAssetSankey, sankeyGroupOf } from '../src/domain/asset-sankey'
import { planInstalment, planLoan } from '../src/domain/loan'
import { byAsset, byTag, dailyTrend } from '../src/domain/stats-breakdown'
import { dateKey, pendingDates } from '../src/cycle-dates'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssetIcon } from '../src/ui/icons'
import { childCategoryNeedsReview, normalizeBuiltInChild, resolveBillChild, TAXONOMY_CHILDREN } from '../src/taxonomy'
import { useLedger } from '../src/store'
import { collectRecords } from '../src/sync'
import { billNetAmount } from '../src/bill-amount'
import { summarizeBills } from '../src/bill-summary'

const state = () => useLedger.getState()
const balance = (id: number) => state().assets.find(a => a.assetId === id)!.assetNumber
state().reset()
state().addAsset({ assetId: 11, assetName: '测试账户', assetNumber: 1000 })
state().addAsset({ assetId: 12, assetName: '测试钱包', assetNumber: 100 })
const assetVersion = state().assets.find(a => a.assetId === 11)!.updateTime
const bill = state().addBill({ assetId: 11, parentCategoryId: 7, cost: 100 })
assert.equal(balance(11), 900)
assert.equal(state().assets.find(a => a.assetId === 11)!.updateTime, assetVersion)
state().addRefund({ billId: bill.billId, number: 20 })
assert.equal(balance(11), 920)
state().addReimbursement({ billId: bill.billId, assetId: 11, number: 10 })
assert.equal(balance(11), 920)
state().settleReimbursement(state().reimbursements[0].reimbursementId)
assert.equal(balance(11), 930)
state().addLend({ type: 1, assetId: 11, counterparty: '测试', number: 30 })
assert.equal(balance(11), 900)
const transfer = state().addTransfer({ fromAssetId: 11, toAssetId: 12, cost: 200, toCost: 190, serviceCharge: 5 })
assert.equal(balance(11), 695)
assert.equal(balance(12), 290)
state().deleteTransfer(transfer.transferId)
assert.equal(balance(11), 900)
assert.equal(balance(12), 100)
const asset = state().assets.find(a => a.assetId === 11)!
state().updateAsset({ ...asset, assetNumber: 850 })
assert.equal(balance(11), 850)
assert.equal(state().assets.find(a => a.assetId === 11)!.openingBalance, 950)
assert.ok(collectRecords().filter(r => r.kind === 'asset').every(r => !('assetNumber' in r.payload)))

const snapshot = state()
const oldAssets = snapshot.assets.map(({ openingBalance, ...asset }) => asset)
const migrated = deriveAssets({ ...snapshot, assets: oldAssets })
assert.equal(migrated.find(a => a.assetId === 11)!.assetNumber, 850)
assert.equal(migrated.find(a => a.assetId === 11)!.openingBalance, 950)
assert.deepEqual(deriveAssets({ ...snapshot, assets: migrated }), migrated)

state().reset()
const csv = '日期,收支类型,金额,类别,二级分类,账户,备注,退款\n2026-01-01,支出,-25,食品餐饮,早餐,测试卡,早餐,5\n2026-01-02,收入,100,工资,,测试卡,工资,0'
const bytes = new TextEncoder().encode(csv)
const table = parseLedgerFile(bytes.buffer, 'synthetic.csv')
const p = buildImportPlan({ table, existingBills: [], existingAssets: [], existingBooks: state().accountBooks,
  parentCategories: state().parentCategories, childCategories: state().childCategories, userId: 1, bookId: 1 })
assert.equal(p.bills.length, 2)
state().applyImport(p)
assert.equal(state().assets[0].assetNumber, 80)
assert.equal(state().assets[0].openingBalance, 0)

// A second offline transaction arrives after an unrelated local transaction.
const s = state()
const remoteBill = { ...s.bills[0], billId: 987654321, syncId: crypto.randomUUID(), cost: 10, updateTime: Date.now() + 1 }
const before = s.assets[0].assetNumber
state().applyRemote([{ kind: 'bill', id: remoteBill.syncId, payload: remoteBill, updatedAt: remoteBill.updateTime }])
const kind = state().parentCategories.find(c => c.id === remoteBill.parentCategoryId)?.kind
assert.equal(state().assets[0].assetNumber, before + (kind === 'income' ? 10 : -10))
const afterRemote = state().assets[0].assetNumber
// 真实同步的墓碑会带 bookId；作用域缺失时按 A1 策略不会删除
state().applyRemote([{ kind: 'bill', id: remoteBill.syncId, bookId: remoteBill.bookId, payload: null, deleted: true, updatedAt: remoteBill.updateTime + 10 }])
assert.equal(state().assets[0].assetNumber, before)
assert.notEqual(afterRemote, before)

// Two devices starting from the same snapshot contribute distinct offline bills.
const sharedBase = { ...state(), bills: [], refunds: [], transfers: [], lends: [], reimbursements: [] }
const original = { ...sharedBase.assets[0], openingBalance: 100, assetNumber: 100 }
const expense = { ...s.bills.find(b => b.parentCategoryId === 7)!, billId: 101, cost: 10, assetId: original.assetId }
const income = { ...s.bills.find(b => b.parentCategoryId !== 7)!, billId: 102, cost: 20, assetId: original.assetId }
assert.equal(deriveAssets({ ...sharedBase, assets: [original], bills: [expense, income] })[0].assetNumber, 110)

state().reset()
state().setBook('shared-book')
state().addAsset({ assetId: 11, assetName: '测试', assetNumber: 30 })
const first = state().addBill({ assetId: 11, parentCategoryId: 7, cost: 3, time: 123 })
const second = state().addBill({ assetId: 11, parentCategoryId: 7, cost: 3, time: 123 })
assert.notEqual(first.billId, second.billId)
assert.notEqual(first.syncId, second.syncId)
assert.equal(collectRecords().filter(r => r.kind === 'bill' && !r.deleted).length, 2)
state().applyRemote([{ kind: 'bill', id: first.syncId, payload: { ...first, displayId: '1-0001', memberNo: 1, sequenceNo: 1 }, ownerId: 1, updatedAt: first.updateTime }])
assert.equal(state().bills.find(b => b.billId === first.billId)?.displayId, '1-0001')
state().deleteBill(first.billId)
assert.equal(collectRecords().find(r => r.kind === 'bill' && r.id === first.syncId && r.deleted)?.bookId, 'shared-book')
state().applyRemote([{ kind: 'bill', id: first.syncId, payload: first, updatedAt: first.updateTime }])
assert.equal(state().bills.some(b => b.billId === first.billId), false)
assert.equal(state().bills.some(b => b.billId === second.billId), true)

// The account movement is frozen in the account's own currency.
state().reset()
state().addAsset({ assetId: 21, assetName: 'USD test', assetNumber: 1000, currency: 'USD' })
const foreign = state().addBill({ assetId: 21, parentCategoryId: 7, cost: 720, currencyInfo: 'USD', currencyAssetNumber: 100 })
assert.equal(foreign.accountAmount, 100)
assert.equal(foreign.accountCurrency, 'USD')
assert.equal(collectRecords().find(r => r.kind === 'bill' && r.id === foreign.syncId)?.payload.accountAmount, 100)
assert.equal(balance(21), 900)
state().setCurrencyRate('USD', 8)
assert.equal(balance(21), 900)
state().updateBill(foreign.billId, { cost: 360 })
assert.equal(balance(21), 950)
assert.equal(state().bills.find(b => b.billId === foreign.billId)!.currencyAssetNumber, 50)
state().addAsset({ assetId: 22, assetName: 'CNY test', assetNumber: 0, currency: 'CNY' })
const fxTransfer = state().addTransfer({ fromAssetId: 21, toAssetId: 22, cost: 20, toCost: 160, serviceCharge: 2 })
assert.equal(balance(21), 928)
assert.equal(balance(22), 160)
assert.equal(state().bills.find(b => b.billId === fxTransfer.billId)!.cost, 16)
state().deleteTransfer(fxTransfer.transferId)
assert.equal(balance(21), 950)
assert.equal(balance(22), 0)

// Existing bills without the new snapshot keep the legacy balance calculation.
const legacyForeign = { ...foreign, accountAmount: undefined, accountCurrency: undefined }
const legacyAssets = [{ ...state().assets.find(a => a.assetId === 21)!, openingBalance: undefined, assetNumber: 280 }]
const legacySnapshot = { ...state(), assets: legacyAssets, bills: [legacyForeign], transfers: [], refunds: [], lends: [], reimbursements: [] }
assert.equal(deriveAssets(legacySnapshot)[0].assetNumber, 280)

// A refund stays in the actual receiving account when the bill is moved later.
state().reset()
state().addAsset({ assetId: 31, assetName: '原账户', assetNumber: 100, currency: 'USD' })
state().addAsset({ assetId: 32, assetName: '新账户', assetNumber: 100, currency: 'USD' })
const refundedBill = state().addBill({ assetId: 31, parentCategoryId: 7, cost: 72, currencyInfo: 'USD', currencyAssetNumber: 10 })
state().addRefund({ billId: refundedBill.billId, number: 4 })
const refund = state().refunds[0]
assert.equal(refund.assetId, 31)
assert.equal(refund.currency, 'USD')
assert.equal(balance(31), 94)
state().addRefund({ billId: refundedBill.billId, number: 4 })
assert.equal(state().refunds.length, 2)
assert.equal(balance(31), 98)
state().deleteRefund(state().refunds[0].refundId)
assert.equal(state().refunds.length, 1)
assert.equal(balance(31), 94)
state().updateBill(refundedBill.billId, { assetId: 32 })
assert.equal(balance(31), 104)
assert.equal(balance(32), 90)
assert.equal(collectRecords().find(r => r.kind === 'refund' && r.id === String(refund.refundId))?.payload.assetId, 31)
state().deleteRefund(refund.refundId)
assert.equal(balance(31), 100)
assert.equal(balance(32), 90)

// Legacy refunds retain their existing bill-account semantics.
state().addRefund({ billId: refundedBill.billId, number: 2 })
const legacyRefund = { ...state().refunds[0], assetId: undefined, currency: undefined }
const oldRefundSnapshot = { ...state(), refunds: [legacyRefund] }
assert.equal(deriveAssets(oldRefundSnapshot).find(a => a.assetId === 32)!.assetNumber, 92)

// Reimbursements require a real account and a positive, finite amount.
state().addReimbursement({ billId: refundedBill.billId, assetId: 0, number: 10 })
state().addReimbursement({ billId: refundedBill.billId, assetId: 31, number: 0 })
assert.equal(state().reimbursements.length, 0)
// 允许分次报销，但累计不得超过原账单金额
state().addReimbursement({ billId: refundedBill.billId, assetId: 31, number: 5 })
state().addReimbursement({ billId: refundedBill.billId, assetId: 31, number: 5 })
assert.equal(state().reimbursements.length, 2)
assert.equal(state().bills.find((b) => b.billId === refundedBill.billId)?.reimbursementNum, 10)
// 超出剩余额度应被拒绝
state().addReimbursement({ billId: refundedBill.billId, assetId: 31, number: refundedBill.cost })
assert.equal(state().reimbursements.length, 2)
assert.equal(balance(31), 100)
state().settleReimbursement(state().reimbursements[0].reimbursementId)
assert.equal(balance(31), 105)
// 撤销单笔后累计值按剩余重算，而不是清零
state().deleteReimbursement(state().reimbursements[0].reimbursementId)
assert.equal(balance(31), 100)
assert.equal(state().bills.find((b) => b.billId === refundedBill.billId)?.reimbursementNum, 5)

// 借贷：支持部分还款，累计不得超过应还金额
state().reset()
state().addAsset({ assetId: 51, assetName: '借出账户', assetNumber: 1000, currency: 'CNY' })
state().addLend({ type: 1, assetId: 51, counterparty: '张三', number: 1000 })
const lend = state().lends[0]
assert.equal(balance(51), 0)
assert.equal(lendRemaining(lend, state().lends), 1000)
state().repayLend({ lendId: lend.lendId, amount: 300 })
assert.equal(balance(51), 300)
assert.equal(lendRemaining(state().lends.find((l) => l.lendId === lend.lendId)!, state().lends), 700)
// 超额应被拒绝
state().repayLend({ lendId: lend.lendId, amount: 800 })
assert.equal(balance(51), 300)
assert.equal(lendRemaining(state().lends.find((l) => l.lendId === lend.lendId)!, state().lends), 700)
// 还清
state().repayLend({ lendId: lend.lendId, amount: 700 })
assert.equal(balance(51), 1000)
const totals = lendTotals(state().lends)
assert.equal(totals.receivable, 0)
assert.equal(totals.payable, 0)

// A refund reduces the existing bill rather than creating another bill.
state().reset()
state().addAsset({ assetId: 41, assetName: '支付账户', assetNumber: 10, currency: 'CNY' })
state().addAsset({ assetId: 42, assetName: '退款账户', assetNumber: 20, currency: 'CNY' })
const cola = state().addBill({ assetId: 41, parentCategoryId: 7, cost: 3 })
state().addRefund({ billId: cola.billId, number: 3 })
const originalRefundId = state().refunds[0].refundId
assert.equal(state().bills.length, 1)
assert.equal(state().bills[0].cost, 3)
assert.equal(state().bills[0].refundNum, 3)
assert.equal(billNetAmount(state().bills[0], state().refunds), 0)

assert.equal(balance(41), 10)
assert.equal(balance(42), 20)
state().updateBill(cola.billId, { cost: 2 })
assert.equal(state().bills[0].cost, 3)
state().deleteRefund(state().refunds[0].refundId)
assert.equal(billNetAmount(state().bills[0], state().refunds), 3)
assert.equal(balance(41), 7)
state().addRefund({ billId: cola.billId, number: 2, assetId: 42 })
assert.notEqual(state().refunds[0].refundId, originalRefundId)
assert.equal(balance(41), 7)
assert.equal(balance(42), 22)
assert.equal(billNetAmount(state().bills[0], state().refunds), 1)
assert.equal(billNetAmount(state().bills[0], [{ ...state().refunds[0], baseAmount: undefined }]), 3)

// A foreign-currency refund snapshots both the account amount and base amount.
state().reset()
state().addAsset({ assetId: 51, assetName: '人民币', assetNumber: 100, currency: 'CNY' })
state().addAsset({ assetId: 52, assetName: '美元', assetNumber: 0, currency: 'USD' })
state().setCurrencyRate('USD', 7.2)
const fxBill = state().addBill({ assetId: 51, parentCategoryId: 7, cost: 72 })
state().addRefund({ billId: fxBill.billId, assetId: 52, number: 10, baseAmount: 72 })
assert.equal(balance(51), 28)
assert.equal(balance(52), 10)
assert.equal(billNetAmount(state().bills[0], state().refunds), 0)
state().setCurrencyRate('USD', 8)
assert.equal(balance(52), 10)
assert.equal(billNetAmount(state().bills[0], state().refunds), 0)
// Income/expense and budget exclusions are independent, and neither skips account movements.
state().reset()
state().addAsset({ assetId: 61, assetName: '汇总测试', assetNumber: 1000 })
const normalExpense = state().addBill({ assetId: 61, parentCategoryId: 7, cost: 10 })
const noTotal = state().addBill({ assetId: 61, parentCategoryId: 7, cost: 20, notIntoTotal: true })
state().addBill({ assetId: 61, parentCategoryId: 7, cost: 30, notIntoBudget: true })
state().addBill({ assetId: 61, parentCategoryId: 7, cost: 40, notIntoTotal: true, notIntoBudget: true })
state().addBill({ assetId: 61, parentCategoryId: 903, cost: 60, notIntoTotal: true })
state().addBill({ assetId: 61, parentCategoryId: 903, cost: 70 })
state().addRefund({ billId: normalExpense.billId, number: 5 })
let summary = summarizeBills(state().bills, state().parentCategories, state().refunds)
assert.equal(summary.income, 70)
assert.equal(summary.expense, 35)
assert.equal(summary.budget, 25)
assert.equal(summary.expenseByCategory.get(7), 35)
assert.equal(summary.budgetByCategory.get(7), 25)
assert.equal(balance(61), 1035)
state().updateBill(noTotal.billId, { notIntoTotal: false, notIntoBudget: true })
summary = summarizeBills(state().bills, state().parentCategories, state().refunds)
assert.equal(summary.expense, 55)
assert.equal(summary.budget, 5)
assert.equal(balance(61), 1035)

// Export a real workbook, parse it and apply the plan into a fresh store.
state().reset()
state().setCurrencyRate('USD', 7.2)
state().addAsset({ assetId: 71, assetName: '支付卡', assetNumber: 100, currency: 'CNY' })
state().addAsset({ assetId: 72, assetName: '外币钱包', assetNumber: 0, currency: 'USD' })
const exportedBill = state().addBill({ assetId: 71, parentCategoryId: 7, cost: 72 })
state().addRefund({ billId: exportedBill.billId, assetId: 72, number: 10, baseAmount: 72 })
const exportTable = buildExportTable(state().bills, state().parentCategories, state().childCategories, state().assets, state().accountBooks, state().reimbursements, state().refunds)
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([exportTable.headers, ...exportTable.rows]), exportTable.sheetName)
const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const parsedExport = parseLedgerFile(workbookBytes, 'virtual-export.xlsx')
state().reset()
const makePlan = (t: typeof parsedExport, existingAssets = state().assets) => buildImportPlan({ table: t, existingBills: [], existingAssets, existingBooks: state().accountBooks,
  parentCategories: state().parentCategories, childCategories: state().childCategories, userId: 1, bookId: 1 })
const roundTrip = makePlan(parsedExport, [])
assert.equal(roundTrip.skipped.length, 0)
assert.equal(roundTrip.bills.length, 1)
assert.equal(roundTrip.refunds.length, 1)
assert.equal(roundTrip.expense, 0)
state().applyImport(roundTrip)
const importedPay = state().assets.find(a => a.assetName === '支付卡')!
const importedRefundAccount = state().assets.find(a => a.assetName === '外币钱包')!
assert.equal(importedPay.currency, 'CNY')
assert.equal(importedRefundAccount.currency, 'USD')
assert.equal(importedPay.assetNumber, -72)
assert.equal(importedRefundAccount.assetNumber, 10)
assert.equal(state().refunds[0].baseAmount, 72)
assert.equal(state().refunds[0].assetId, importedRefundAccount.assetId)
assert.equal(billNetAmount(state().bills[0], state().refunds), 0)

// Ambiguous currencies or incomplete metadata must not create a partial record.
const conflict = makePlan(parsedExport, [{ ...importedRefundAccount, currency: 'CNY' }])
assert.equal(conflict.bills.length, 0)
assert.equal(conflict.refunds.length, 0)
assert.equal(conflict.skipped.length, 1)
const brokenRows = parsedExport.rows.map(row => [...row])
brokenRows[0][parsedExport.headers.indexOf('小满退款到账金额')] = ''
const incomplete = makePlan({ ...parsedExport, rows: brokenRows }, [])
assert.equal(incomplete.bills.length, 0)
assert.equal(incomplete.skipped.length, 1)
const partialRows = parsedExport.rows.map(row => [...row])
partialRows[0][parsedExport.headers.indexOf('退款')] = 36
partialRows[0][parsedExport.headers.indexOf('小满退款本币金额')] = 36
partialRows[0][parsedExport.headers.indexOf('小满退款到账金额')] = 5
const partialPlan = makePlan({ ...parsedExport, rows: partialRows }, [])
assert.equal(partialPlan.expense, 36)
assert.equal(billNetAmount(partialPlan.bills[0], partialPlan.refunds), 36)
const oldColumnCount = parsedExport.headers.indexOf('小满账户币种')
const legacyPlan = makePlan({ ...parsedExport, headers: parsedExport.headers.slice(0, oldColumnCount), rows: parsedExport.rows.map(row => row.slice(0, oldColumnCount)) }, [])
assert.equal(legacyPlan.refunds[0].baseAmount, undefined)
assert.equal(billNetAmount(legacyPlan.bills[0], legacyPlan.refunds), 72)

// A zero-net expense with a refund still contains a purchase and a refund movement.
state().reset()
const refundedCsv = [
  '日期,收支类型,金额,类别,账户,退款,退款账户,多币种,备注',
  '2026-03-01,支出,0,食品餐饮,钱包,3,,,可乐',
  '2026-03-02,支出,0,食品餐饮,钱包,5,银行卡,,零食',
  '2026-03-03,支出,0,食品餐饮,钱包,0,,,空金额',
  '2026-03-04,支出,0,食品餐饮,钱包,7,,USD,外币',
  '2026-03-05,收入,0,工资,钱包,8,,,收入'
].join('\n')
const refundBytes = new TextEncoder().encode(refundedCsv)
const fullRefundTable = parseLedgerFile(refundBytes.buffer, 'virtual-full-refund.csv')
const fullRefundPlan = makePlan(fullRefundTable, [])
assert.equal(fullRefundPlan.bills.length, 2)
assert.equal(fullRefundPlan.refunds.length, 2)
assert.equal(fullRefundPlan.expense, 0)
assert.equal(fullRefundPlan.warnings.length, 2)
assert.equal(fullRefundPlan.skipped.length, 3)
assert.equal(fullRefundPlan.bills.find(b => b.remark === '可乐')!.cost, 3)
assert.equal(billNetAmount(fullRefundPlan.bills.find(b => b.remark === '可乐')!, fullRefundPlan.refunds), 0)
state().applyImport(fullRefundPlan)
assert.equal(state().assets.find(a => a.assetName === '钱包')!.assetNumber, -5)
assert.equal(state().assets.find(a => a.assetName === '银行卡')!.assetNumber, 5)
const importedCola = state().bills.find(b => b.remark === '可乐')!
const importedColaRefund = state().refunds.find(r => r.billId === importedCola.billId)!
assert.equal(importedColaRefund.number, 3)
assert.equal(importedColaRefund.baseAmount, 3)
assert.equal(importedColaRefund.assetId, importedCola.assetId)

// Identical rows may be two real purchases; keep both, even after synchronization.
state().reset()
const identicalCsv = [
  '日期,收支类型,金额,类别,账户,备注',
  '2026-04-01 12:00:00,支出,-3,食品餐饮,导入钱包,可乐',
  '2026-04-01 12:00:00,支出,-3,食品餐饮,导入钱包,可乐'
].join('\n')
const identicalBytes = new TextEncoder().encode(identicalCsv)
const identicalTable = parseLedgerFile(identicalBytes.buffer, 'identical.csv')
const planIdentical = (table: typeof identicalTable) => buildImportPlan({ table, existingBills: state().bills,
  existingAssets: state().assets, existingBooks: state().accountBooks, parentCategories: state().parentCategories,
  childCategories: state().childCategories, userId: 1, bookId: 1 })
const identicalPlan = planIdentical(identicalTable)
assert.equal(identicalPlan.bills.length, 2)
assert.equal(identicalPlan.duplicates, 1)
assert.notEqual(identicalPlan.bills[0].billId, identicalPlan.bills[1].billId)
state().applyImport(identicalPlan)
const importedWallet = state().assets.find(a => a.assetName === '导入钱包')!
assert.equal(importedWallet.assetNumber, -6)
const syncedBills = collectRecords().filter(r => r.kind === 'bill' && !r.deleted)
assert.equal(syncedBills.length, 2)
assert.notEqual(syncedBills[0].id, syncedBills[1].id)
state().applyRemote(syncedBills)
assert.equal(state().bills.length, 2)
assert.equal(balance(importedWallet.assetId), -6)
const repeatedPlan = planIdentical(identicalTable)
assert.equal(repeatedPlan.bills.length, 2)
assert.equal(repeatedPlan.duplicates, 2)
assert.ok(repeatedPlan.bills.every(b => !state().bills.some(existing => existing.billId === b.billId)))

// New accounts created by a later import must not reuse an existing account ID.
const anotherBytes = new TextEncoder().encode('日期,收支类型,金额,类别,账户,备注\n2026-04-02,支出,-1,食品餐饮,另一张卡,测试')
const anotherPlan = planIdentical(parseLedgerFile(anotherBytes.buffer, 'second.csv'))
assert.equal(anotherPlan.newAssets.length, 1)
assert.notEqual(anotherPlan.newAssets[0].assetId, importedWallet.assetId)
state().applyImport(anotherPlan)
assert.equal(state().assets.find(a => a.assetName === '导入钱包')!.assetNumber, -6)
assert.equal(state().assets.find(a => a.assetName === '另一张卡')!.assetNumber, -1)

// Separate partial refunds can use different account currencies and be revoked independently.
state().reset()
state().setCurrencyRate('USD', 8)
state().addAsset({ assetId: 91, assetName: '人民币退款', assetNumber: 100, currency: 'CNY' })
state().addAsset({ assetId: 92, assetName: '美元退款', assetNumber: 0, currency: 'USD' })
const partialBill = state().addBill({ assetId: 91, parentCategoryId: 7, cost: 72 })
state().addRefund({ billId: partialBill.billId, number: 8, baseAmount: 8 })
const firstPartial = state().refunds[0]
state().addRefund({ billId: partialBill.billId, assetId: 92, number: 4, baseAmount: 32 })
assert.equal(state().refunds.length, 2)
assert.equal(state().bills.find(b => b.billId === partialBill.billId)!.refundNum, 40)
assert.equal(billNetAmount(state().bills.find(b => b.billId === partialBill.billId)!, state().refunds), 32)
assert.equal(balance(91), 36)
assert.equal(balance(92), 4)
const multiExport = buildExportTable(state().bills, state().parentCategories, state().childCategories, state().assets, state().accountBooks, state().reimbursements, state().refunds)
const multiWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(multiWorkbook, XLSX.utils.aoa_to_sheet([multiExport.headers, ...multiExport.rows]), multiExport.sheetName)
const multiBytes = XLSX.write(multiWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const multiParsed = parseLedgerFile(multiBytes, 'multi-refunds.xlsx')
const multiPlan = buildImportPlan({ table: multiParsed, existingBills: [], existingAssets: [], existingBooks: state().accountBooks,
  parentCategories: state().parentCategories, childCategories: state().childCategories, userId: 1, bookId: 1 })
assert.equal(multiPlan.skipped.length, 0)
assert.equal(multiPlan.refunds.length, 2)
assert.equal(multiPlan.expense, 32)
assert.equal(billNetAmount(multiPlan.bills[0], multiPlan.refunds), 32)
const multiAssets = deriveAssets({ ...state(), assets: multiPlan.newAssets.map(a => ({ ...a, openingBalance: 0 })), bills: multiPlan.bills,
  refunds: multiPlan.refunds, transfers: [], lends: [], reimbursements: [] })
assert.equal(multiAssets.find(a => a.assetName === '人民币退款')!.assetNumber, -64)
assert.equal(multiAssets.find(a => a.assetName === '美元退款')!.assetNumber, 4)
const damagedMulti = { ...multiParsed, rows: multiParsed.rows.map(row => [...row]) }
damagedMulti.rows[0][multiParsed.headers.indexOf('小满退款明细')] = '[坏数据]'
const rejectedMulti = buildImportPlan({ table: damagedMulti, existingBills: [], existingAssets: [], existingBooks: state().accountBooks,
  parentCategories: state().parentCategories, childCategories: state().childCategories, userId: 1, bookId: 1 })
assert.equal(rejectedMulti.bills.length, 0)
assert.equal(rejectedMulti.skipped.length, 1)
state().addRefund({ billId: partialBill.billId, number: 33, baseAmount: 33 })
assert.equal(state().refunds.length, 2)
state().updateBill(partialBill.billId, { cost: 39 })
assert.equal(state().bills.find(b => b.billId === partialBill.billId)!.cost, 72)
state().deleteRefund(firstPartial.refundId)
assert.equal(state().bills.find(b => b.billId === partialBill.billId)!.refundNum, 32)
assert.equal(balance(91), 28)
assert.equal(balance(92), 4)
assert.equal(billNetAmount(state().bills.find(b => b.billId === partialBill.billId)!, state().refunds), 40)

// JSON backup preserves account movements, settings and deletion markers.
state().reset()
state().addAsset({ assetId: 81, assetName: '备份账户', assetNumber: 100 })
const backupBill = state().addBill({ assetId: 81, parentCategoryId: 7, cost: 10 })
state().addRefund({ billId: backupBill.billId, number: 3 })
state().setCurrencyRate('USD', 9.5)
const backupTag = state().addTag({ name: '备份测试', color: '#123456' })
state().tombstone('bill', 'deleted-backup-test')
const backup = JSON.parse(JSON.stringify(state().exportAll()))
assert.equal(backup.version, 2)
assert.equal('token' in backup, false)
state().deleteTag(backupTag.tagId)
state().setCurrencyRate('USD', 7.2)
state().reset()
state().importAll(backup)
assert.equal(balance(81), 93)
assert.equal(state().refunds[0].baseAmount, 3)
assert.equal(state().currencies.find(c => c.code === 'USD')!.rate, 9.5)
assert.ok(state().tags.some(t => t.tagId === backupTag.tagId))
assert.ok(state().tombstones.some(t => t.id === 'deleted-backup-test'))
// 其余集合也要完整往返（借贷、周期、转账、报销、预算）
state().addLend({ type: 1, assetId: 81, counterparty: '备份借贷', number: 50 })
state().addTransfer({ fromAssetId: 81, toAssetId: 81, cost: 1 })
state().addReimbursement({ billId: backupBill.billId, assetId: 81, number: 2 })
state().setBudget({ month: '2026-11', categoryId: 7, amount: 300 } as any)
const fullBackup = JSON.parse(JSON.stringify(state().exportAll()))
const backupShape = (st: any) => ({
  lends: st.lends.length, transfers: st.transfers.length,
  reimbursements: st.reimbursements.length, budgets: st.budgets.length,
  receivable: lendTotals(st.lends).receivable
})
const snapBefore = backupShape(state())
state().reset()
state().importAll(fullBackup)
assert.deepEqual(backupShape(state()), snapBefore)

// 周期：跳过某一期后不再生成，且不影响下一期
state().reset()
state().addAsset({ assetId: 61, assetName: '周期账户', assetNumber: 0, currency: 'CNY' })
const cycleStart = new Date(); cycleStart.setDate(1)
state().addCycle({ name: '房租', kind: 'expense', parentCategoryId: 2, childCategoryId: 0,
  assetId: 61, cost: 100, dayOfMonth: 1, startTime: cycleStart.getTime(), enabled: true, cycleType: 'month' } as any)
const cyc = state().cycles[0]
const handledFirst = dateKey(new Date(cycleStart))
assert.equal(pendingDates(cyc).length > 0, true)
state().runCycles()
const afterFirst = state().bills.length
assert.equal(afterFirst > 0, true)
state().skipCycleDate(cyc.cycleId, handledFirst)
assert.equal(pendingDates(state().cycles[0]).some((d) => dateKey(d) === handledFirst), false)
state().runCycles()
assert.equal(state().bills.length, afterFirst)

// 删除父借贷应连带删除还款子记录，且余额完全回退
state().reset()
state().addAsset({ assetId: 71, assetName: '借贷账户', assetNumber: 500, currency: 'CNY' })
const baseBalance = balance(71)
state().addLend({ type: 1, assetId: 71, counterparty: '李四', number: 200 })
const parent = state().lends[0]
state().repayLend({ lendId: parent.lendId, amount: 120 })
assert.equal(balance(71), baseBalance - 80)
assert.equal(state().lends.length, 2)
state().deleteLend(parent.lendId)
assert.equal(state().lends.length, 0)
assert.equal(balance(71), baseBalance)

// ---------- 同步身份、墓碑与周期去重（Codex 验收复现） ----------
const emptyMergeState = () => ({
  bills: [], assets: [], transfers: [], lends: [], cycles: [],
  parentCategories: [], childCategories: [], accountBooks: [],
  reimbursements: [], refunds: [], tags: [], tombstones: []
})
const assetRec = (updatedAt: number) => ({
  kind: 'asset', id: '7', ownerId: 2, updatedAt,
  payload: { assetId: 7, assetName: '对方卡', assetNumber: 50, ownerId: 2, userId: 2, updateTime: updatedAt }
})

// 改号后：更新应保留已分配编号，而不是回到原编号
let ms: any = { ...emptyMergeState(), assets: [{ assetId: 7, assetName: '本地卡', assetNumber: 100, ownerId: 1, userId: 1, updateTime: 10 }] }
ms = { ...ms, ...mergeRemote(ms, [assetRec(20)]) }
assert.deepEqual(ms.assets.map((a: any) => a.assetId), [7, 7002])
ms = { ...ms, ...mergeRemote(ms, [assetRec(25)]) }
assert.deepEqual(ms.assets.map((a: any) => a.assetId), [7, 7002], '更新后应保留改号结果')
assert.equal(ms.assets[1].assetName, '对方卡')

// 删除应按来源身份删除，不能误删本地同编号记录
ms = { ...ms, ...mergeRemote(ms, [{ ...assetRec(40), deleted: true, payload: null }]) }
assert.deepEqual(ms.assets.map((a: any) => a.assetId), [7], '只应删掉属主 2 的记录')
assert.equal(ms.assets[0].ownerId, 1)

// 标签没有属主语义：拉回自己的标签不应产生副本
let tagState: any = { ...emptyMergeState(), tags: [{ tagId: 5, name: '日常', color: '#fff', positionWeight: 0 }] }
tagState = { ...tagState, ...mergeRemote(tagState, [{ kind: 'tag', id: '5', ownerId: 2, updatedAt: 20, payload: { tagId: 5, name: '日常', color: '#fff', positionWeight: 0 } }]) }
assert.deepEqual(tagState.tags.map((t: any) => t.tagId), [5], '标签不应被改号')

// 较新的墓碑要覆盖旧墓碑时间，否则更早的记录会复活
let tomb: any = emptyMergeState()
tomb = { ...tomb, ...mergeRemote(tomb, [{ kind: 'asset', id: '77', updatedAt: 10, deleted: true, payload: null }]) }
tomb = { ...tomb, ...mergeRemote(tomb, [{ kind: 'asset', id: '77', updatedAt: 30, deleted: true, payload: null }]) }
const revived = mergeRemote(tomb, [{ kind: 'asset', id: '77', updatedAt: 20, payload: { assetId: 77, assetName: '旧', assetNumber: 1, updateTime: 20 } }])
assert.equal((revived.assets ?? []).length, 0, '时间 20 的旧记录不应复活')

// 周期去重：同账本同日同规则收敛到一条；跨账本不受影响
const mkCycleBill = (id: string, bookId: string, cycleId = 1) => ({
  billId: id, syncId: id, cycleId, bookId, time: new Date(2026, 10, 1, 9).getTime(),
  cost: 10, assetId: 1, parentCategoryId: 7, billType: 4, userId: 1, updateTime: 1,
  remark: '', tags: [], files: []
} as any)
const dedupedA = dedupeBills([mkCycleBill('b', 'book-a'), mkCycleBill('a', 'book-a'), mkCycleBill('c', 'book-a')])
assert.deepEqual(dedupedA.bills.map((b: any) => b.billId), ['a'])
assert.equal(dedupedA.removed.length, 2)
const crossBook = dedupeBills([mkCycleBill('x', 'book-a'), mkCycleBill('y', 'book-b')])
assert.equal(crossBook.removed.length, 0, '不同账本不能互相去重')

// 同一墓碑重复拉取，不能删掉另一属主的记录
let rep: any = { ...emptyMergeState(), assets: [
  { assetId: 7, assetName: '本地卡', ownerId: 1, userId: 1, updateTime: 10 },
  { assetId: 7002, assetName: '对方卡', ownerId: 2, userId: 2, updateTime: 20, __originId: '7', __originOwner: 2 }
] }
const tombRec = { kind: 'asset', id: '7', ownerId: 2, updatedAt: 40, deleted: true, payload: null }
rep = { ...rep, ...mergeRemote(rep, [tombRec]) }
assert.deepEqual(rep.assets.map((a: any) => a.assetId), [7], '第一次应删掉属主 2 的记录')
rep = { ...rep, ...mergeRemote(rep, [tombRec]) }
assert.deepEqual(rep.assets.map((a: any) => a.assetId), [7], '重复墓碑不能再删属主 1 的记录')

// 去重时带退款/报销的账单必须保留
const keepRefund = mkCycleBill('r1', 'book-a')
const protectedSet = new Set<string>(['r1'])
const withProtected = dedupeBills([keepRefund, mkCycleBill('r2', 'book-a')], protectedSet)
// 保留项带退款（内容一致的另一条可安全删除），有退款的记账不能被删
assert.ok(withProtected.bills.some((b: any) => b.billId === 'r1'), '有退款的那条必须保留')
assert.equal(withProtected.bills.length, 1, '内容一致的重复可收敛为一条')
const allProtected = dedupeBills([mkCycleBill('r1', 'book-a'), mkCycleBill('r2', 'book-a')], new Set(['r1', 'r2']))
assert.equal(allProtected.removed.length, 0, '全都有业务关联时不做去重')

// 较旧墓碑不能删除较新的本地记录
let stale: any = { ...emptyMergeState(), assets: [{ assetId: 9, assetName: '新记录', ownerId: 2, userId: 2, updateTime: 30 }] }
stale = { ...stale, ...mergeRemote(stale, [{ kind: 'asset', id: '9', ownerId: 2, updatedAt: 20, deleted: true, payload: null }]) }
assert.deepEqual(stale.assets.map((a: any) => a.assetId), [9], '本地更新时应保留')

// 无属主类型（标签/预算）的墓碑必须能跨设备生效
let ownerless: any = { ...emptyMergeState(), tags: [{ tagId: 12, name: '旧标签', color: '#fff', positionWeight: 0 }] }
ownerless = { ...ownerless, ...mergeRemote(ownerless, [{ kind: 'tag', id: '12', ownerId: 3, updatedAt: 40, deleted: true, payload: null }]) }
assert.deepEqual(ownerless.tags, [], '标签删除应在另一设备生效')

// 内容被改过的周期账单不应被自动去重
const edited = { ...mkCycleBill('e1', 'book-a'), cost: 99 }
const identical = mkCycleBill('e2', 'book-a')
const mixed = dedupeBills([edited, identical])
assert.equal(mixed.removed.length, 0, '有内容差异时保留并待核对')
const twins = dedupeBills([mkCycleBill('t1', 'book-a'), mkCycleBill('t2', 'book-a')])
assert.equal(twins.removed.length, 1, '完全一致时才自动收敛')

// 属主 2 的墓碑不能挡住属主 1 的有效记录（两种顺序都要成立）
const blocked = { kind: 'asset', id: '7', ownerId: 2, updatedAt: 10, deleted: true, payload: null }
const valid = { kind: 'asset', id: '7', ownerId: 1, updatedAt: 20, payload: { assetId: 7, assetName: '属主1', assetNumber: 5, ownerId: 1, userId: 1, updateTime: 20 } }
let orderA: any = emptyMergeState()
orderA = { ...orderA, ...mergeRemote(orderA, [blocked]) }
orderA = { ...orderA, ...mergeRemote(orderA, [valid]) }
assert.equal(orderA.assets.length, 1, '墓碑先到不影响另一属主')
let orderB: any = emptyMergeState()
orderB = { ...orderB, ...mergeRemote(orderB, [valid]) }
orderB = { ...orderB, ...mergeRemote(orderB, [blocked]) }
assert.equal(orderB.assets.length, 1, '墓碑后到也不能误删')

// 不同账本的同编号记录：墓碑只作用于自己账本
let crossBookScope: any = emptyMergeState()
crossBookScope = { ...crossBookScope, assets: [
  { assetId: 20, assetName: '账本A', assetNumber: 10, bookId: 'book-a', ownerId: 1, userId: 1, updateTime: 10 },
  { assetId: 20, assetName: '账本B', assetNumber: 20, bookId: 'book-b', ownerId: 1, userId: 1, updateTime: 10 }
] }
crossBookScope = { ...crossBookScope, ...mergeRemote(crossBookScope, [
  { kind: 'asset', id: '20', bookId: 'book-a', ownerId: 1, updatedAt: 30, deleted: true, payload: null }
]) }
assert.deepEqual(crossBookScope.assets.map((a: any) => a.assetName), ['账本B'], '只删本账本那条')
assert.equal(crossBookScope.tombstones[0].bookId, 'book-a', '墓碑要记住作用域')

// 去重比较必须覆盖标签与不计收支等业务字段
const tagged = { ...mkCycleBill('g1', 'book-a'), tags: ['出差'], notIntoTotal: true }
const plain = mkCycleBill('g2', 'book-a')
const contentDiff = dedupeBills([tagged, plain])
assert.equal(contentDiff.removed.length, 0, '标签/不计收支不同不能自动删')

// AA 分摊：只改承担关系，不影响余额与统计总额
state().reset()
state().addAsset({ assetId: 91, assetName: 'AA 账户', assetNumber: 500 })
const aaBill = state().addBill({ assetId: 91, parentCategoryId: 7, cost: 100 })
assert.equal(balance(91), 400)
state().setBillShares(aaBill.billId, [
  { name: '我', amount: 50 },
  { name: '张三', amount: 50 }
])
assert.equal(balance(91), 400, '分摊不改余额')
assert.equal(state().bills.find((b) => b.billId === aaBill.billId)?.billShares?.length, 2)
assert.equal(summarizeBills(state().bills, state().parentCategories, state().refunds).expense, 100, '统计仍按总额')

// 优惠金额只展示，不改变实付与统计
state().reset()
state().addAsset({ assetId: 92, assetName: '优惠账户', assetNumber: 200 })
const disc = state().addBill({ assetId: 92, parentCategoryId: 7, cost: 90, discountNumber: 10 })
assert.equal(balance(92), 110, '余额按实付 90 扣')
assert.equal(summarizeBills(state().bills, state().parentCategories, state().refunds).expense, 90, '统计按实付')
assert.equal(state().bills.find((b) => b.billId === disc.billId)?.discountNumber, 10)
state().updateBill(disc.billId, { reimbursementEnd: true })
assert.equal(state().bills.find((b) => b.billId === disc.billId)?.reimbursementEnd, true)

// 标签嵌套：parentTagId 保存时派生 parentName，两套表示保持一致
state().reset()
const rootTag = state().addTag({ name: '出差' })
const subTag = state().addTag({ name: '机票', parentTagId: rootTag.tagId })
assert.equal(state().tags.find((t) => t.tagId === subTag.tagId)?.parentName, '出差')
state().updateTag(subTag.tagId, { parentTagId: undefined })
assert.equal(state().tags.find((t) => t.tagId === subTag.tagId)?.parentName, undefined)

// 结束报销：待报销记录收口为 ended，且不计入余额
state().reset()
state().addAsset({ assetId: 93, assetName: '报销账户', assetNumber: 100 })
const reimbBill = state().addBill({ assetId: 93, parentCategoryId: 7, cost: 50 })
state().addReimbursement({ billId: reimbBill.billId, assetId: 93, number: 20 })
assert.equal(state().reimbursements[0].status, 'pending')
state().endReimbursement(reimbBill.billId)
assert.equal(state().reimbursements[0].status, 'ended', '待报销应被收口')

// 周期结束方式：记满 N 次 / 到某天为止
const makeCycle = (patch: any) => ({
  cycleId: 'c-' + Math.random(), bookId: 'book-a', name: '房租', kind: 'expense',
  parentCategoryId: 7, childCategoryId: 0, assetId: 1, cost: 100, dayOfMonth: 1,
  startTime: new Date(2026, 0, 1).getTime(), enabled: true, generated: [], ...patch
})
const cycleBase = {
  bills: [], assets: [{ assetId: 1, assetName: 'A', assetType: 1, assetNumber: 0, currency: 'CNY', positionWeight: 0, remark: '', userId: 1, updateTime: 1 }],
  parentCategories: state().parentCategories, childCategories: state().childCategories,
  currencies: [{ code: 'CNY', name: '人民币', symbol: '¥', rate: 1 }], defaultCurrency: 'CNY',
  userId: 1, currentBookId: 'book-a'
}
const timesPlan = planCycles({ ...cycleBase, cycles: [makeCycle({ endMode: 'times', times: 2 })] }, new Date(2026, 5, 1))
assert.equal(timesPlan.count, 2, '记满 2 次后不再生成')
const datePlan = planCycles({ ...cycleBase, cycles: [makeCycle({ endMode: 'date', endDate: new Date(2026, 2, 15).getTime() })] }, new Date(2026, 5, 1))
assert.equal(datePlan.count, 3, '截止到 3 月 15 日应生成 1/2/3 三期')


assert.equal(state().bills.find((b) => b.billId === reimbBill.billId)?.reimbursementEnd, true)
assert.equal(balance(93), 50, '已结束的报销不进账户')

// 账户可见性：私有只对本人可见，共享只对本账本可见
const scopeAssets: any[] = [
  { assetId: 1, assetName: '我的私卡', assetType: 1, assetNumber: 0, ownerId: 7, positionWeight: 0, remark: '', userId: 7, updateTime: 1 },
  { assetId: 2, assetName: '共享卡', assetType: 1, assetNumber: 0, ownerId: 7, bookId: 'book-a', positionWeight: 0, remark: '', userId: 7, updateTime: 1 },
  { assetId: 3, assetName: '别人私卡', assetType: 1, assetNumber: 0, ownerId: 8, positionWeight: 0, remark: '', userId: 8, updateTime: 1 }
]
assert.deepEqual(visibleAssets(scopeAssets, 'book-a', 7).map((a) => a.assetId), [1, 2], '私有本人 + 本账本共享')
assert.deepEqual(visibleAssets(scopeAssets, 'book-b', 8).map((a) => a.assetId), [3], '看不到别人的私有账户')
const twoPersonBook = [{ bookId: 'book-a', memberCount: 2 }]
const soloBook = [{ bookId: 'solo', memberCount: 1 }]
assert.equal(leaksPrivateAccount(scopeAssets[0] as any, 'book-a', twoPersonBook), true, '私有账户用于多人账本会泄露')
assert.equal(leaksPrivateAccount(scopeAssets[1] as any, 'book-a', twoPersonBook), false, '共享账户不泄露')
assert.equal(leaksPrivateAccount(scopeAssets[0] as any, 'solo', soloBook), false, '单人账本不误拦')

// showBook 显式指定可见账本时优先于 bookId
const showBookAssets: any[] = [
  { assetId: 11, assetName: '多账本卡', assetType: 1, assetNumber: 0, ownerId: 7, bookId: 'book-a', showBook: ['book-a', 'book-b'], positionWeight: 0, remark: '', userId: 7, updateTime: 1 }
]
assert.equal(visibleAssets(showBookAssets, 'book-b', 7).length, 1, 'showBook 里有的账本可见')
assert.equal(visibleAssets(showBookAssets, 'book-c', 7).length, 0, 'showBook 里没有的账本不可见')
const unmigratedBackup = JSON.parse(JSON.stringify(backup))
delete unmigratedBackup.assets[0].openingBalance
state().importAll(unmigratedBackup)
assert.equal(balance(81), 93)
assert.equal(state().assets[0].openingBalance, 100)

// Invalid or incomplete backups must leave existing state untouched.
const beforeInvalid = JSON.stringify({ assets: state().assets, bills: state().bills, refunds: state().refunds, currencies: state().currencies })
for (const invalid of [{}, { ...backup, assets: null }, { ...backup, bills: [{ billId: 'bad' }] }, { ...backup, version: 999 }]) {
  assert.throws(() => state().importAll(invalid))
  assert.equal(JSON.stringify({ assets: state().assets, bills: state().bills, refunds: state().refunds, currencies: state().currencies }), beforeInvalid)
}

// V1 did not contain these settings; restoring it retains current settings.
const { tags: _tags, currencies: _currencies, defaultCurrency: _defaultCurrency, tombstones: _tombstones, currentBookId: _currentBookId, ...v1 } = backup
state().setCurrencyRate('USD', 8)
state().importAll({ ...v1, version: 1 })
assert.equal(balance(81), 93)
assert.equal(state().currencies.find(c => c.code === 'USD')!.rate, 8)
assert.ok(state().tags.some(t => t.tagId === backupTag.tagId))
assert.equal(editAmount('', '.'), '0.')
assert.equal(editAmount('3.2', '.'), '3.2')
assert.equal(editAmount('3.', '00'), '3.00')
assert.equal(editAmount('3.00', '退格'), '3.0')
assert.equal(editAmount('3.0', '清空'), '')
assert.equal(editAmount('3+2', '.'), '3+2.')
assert.equal(editAmount('3+', '×'), '3×')
// 运算优先级、除零与小数输入
assert.equal(evaluateAmount('2+3×4'), 14)
assert.equal(evaluateAmount('2×3+4'), 10)
assert.equal(evaluateAmount('10-2-3'), 5)
assert.equal(evaluateAmount('1÷0'), null)
assert.equal(evaluateAmount(''), null)
assert.equal(editAmount('1.5', '.'), '1.5')
assert.equal(editAmount('1+2', '.'), '1+2.')
// 前导零不累积，同时不破坏 "00" 快捷键
assert.equal(editAmount('0', '0'), '0')
assert.equal(editAmount('0', '7'), '7')
assert.equal(editAmount('1.0', '0'), '1.00')

// 千分位显示：只影响展示，不影响求值
assert.equal(formatAmount('12345.6'), '12,345.6')
assert.equal(formatAmount('1234+5678'), '1,234+5,678')
assert.equal(formatAmount('1234.'), '1,234.')
assert.equal(formatAmount(''), '')
assert.equal(formatAmount('12,345'), '12,345')
// 带千分位的串先还原成无逗号原文再编辑，展示层负责重新加逗号
assert.equal(editAmount('12,345', '退格'), '1234')
assert.equal(formatAmount(editAmount('12,345', '退格')), '1,234')
assert.equal(evaluateAmount('12,345'), 12345)
assert.equal(evaluateAmount('3+2×4'), 11)
assert.equal(evaluateAmount('10-6÷2'), 7)
assert.equal(evaluateAmount('1÷0'), null)
assert.equal(evaluateAmount('3+'), null)
for (const name of ['支付宝', '微信', '招商银行']) {
  const icon = renderToStaticMarkup(createElement(AssetIcon, { type: 1, name }))
  assert.match(icon, /\/icons\/assets\//)
  assert.doesNotMatch(icon, /\/icons\/(brands|banks|wallets)\//)
}

// Built-in child IDs must be globally unique, including after receiving old sync records.
assert.equal(new Set(TAXONOMY_CHILDREN.map((c) => c.id)).size, TAXONOMY_CHILDREN.length)
const vegetable = TAXONOMY_CHILDREN.find((c) => c.name === '蔬菜' && c.parentId === 7)!
const grain = TAXONOMY_CHILDREN.find((c) => c.name === '粮油调味' && c.parentId === 7)!
assert.notEqual(vegetable.id, grain.id)
assert.equal(normalizeBuiltInChild({ ...vegetable, id: 701 }).id, vegetable.id)
state().reset()
state().addAsset({ assetId: 101, assetName: '分类测试', assetNumber: 50 })
const classificationBill = state().addBill({ assetId: 101, parentCategoryId: 7, childCategoryId: grain.id, cost: 1 })
assert.equal(classificationBill.childCategoryIdentityVersion, 2)
assert.equal(resolveBillChild(classificationBill, state().childCategories)?.name, '粮油调味')
const legacyAmbiguous = { ...classificationBill, childCategoryIdentityVersion: undefined }
assert.equal(childCategoryNeedsReview(legacyAmbiguous), true)
assert.equal(resolveBillChild(legacyAmbiguous, state().childCategories), undefined)
assert.throws(() => buildExportTable([legacyAmbiguous], state().parentCategories, state().childCategories, state().assets), /分类/)
const legacyMedical = { ...legacyAmbiguous, parentCategoryId: 1, childCategoryId: 801 }
assert.equal(childCategoryNeedsReview(legacyMedical), false)
assert.equal(resolveBillChild(legacyMedical, state().childCategories)?.name, '社保')
const oldVegetable = { ...vegetable, id: 701 }
const beforeChildCount = state().childCategories.length
const oldChildRecord = { kind: 'child', id: '701', payload: oldVegetable, ownerId: 999, updatedAt: 1 }
state().applyRemote([oldChildRecord])
state().applyRemote([oldChildRecord])
assert.equal(state().childCategories.length, beforeChildCount)
assert.equal(state().childCategories.filter((c) => c.name === '蔬菜' && c.parentId === 7).length, 1)
assert.equal(state().childCategories.find((c) => c.name === '蔬菜' && c.parentId === 7)!.id, vegetable.id)
console.log('balance and synthetic CSV tests passed')

// 账本展示属性：重载服务端列表时要保留本地图标/颜色/排序
state().reset()
state().setAccountBooks([
  { accountBookId: 0, accountBookName: '家庭', userId: 0, createTime: 0, bookId: 'book-x' },
  { accountBookId: 0, accountBookName: '工作', userId: 0, createTime: 0, bookId: 'book-y' }
])
state().updateBookMeta('book-x', { color: '#ff0000', icon: 'ic_asset_wallet', positionWeight: 2 })
assert.equal(state().accountBooks.find((b) => b.bookId === 'book-x')?.color, '#ff0000')
// 模拟一次重新拉取（服务端不带这些字段）
state().setAccountBooks([
  { accountBookId: 0, accountBookName: '家庭', userId: 0, createTime: 0, bookId: 'book-x' },
  { accountBookId: 0, accountBookName: '工作', userId: 0, createTime: 0, bookId: 'book-y' }
])
const kept = state().accountBooks.find((b) => b.bookId === 'book-x')
assert.equal(kept?.color, '#ff0000', '重载后颜色应保留')
assert.equal(kept?.positionWeight, 2, '重载后排序应保留')

// 预算：年/自定义区间与追加额度
state().reset()
const bMonth = { month: 'all', categoryId: 0, amount: 1000, type: 'month' as const }
const bYear = { month: 'all', categoryId: 0, amount: 12000, type: 'year' as const }
state().setBudget(bMonth as any)
state().setBudget(bYear as any)
assert.equal(state().budgets.filter((b) => b.type === 'year').length, 1, '年预算与月预算并存')
const bCustom = {
  month: 'all', categoryId: 0, amount: 500, addNum: 100, type: 'custom' as const,
  budgetId: 1, budgetName: '装修',
  startTime: new Date(2026, 0, 1).getTime(), endTime: new Date(2026, 2, 31).getTime()
}
state().setBudget(bCustom as any)
const custom = state().budgets.find((b) => b.type === 'custom')
assert.equal(custom?.budgetName, '装修')
assert.equal((custom?.amount ?? 0) + (custom?.addNum ?? 0), 600, '额度含追加')

// 账户流水：期初 + 逐笔变动 = 当前余额
state().reset()
state().addAsset({ assetId: 95, assetName: '流水账户', assetNumber: 300 })
state().addBill({ assetId: 95, parentCategoryId: 7, cost: 40 })
state().addBill({ assetId: 95, parentCategoryId: 903, cost: 20 })
const flowAsset = state().assets.find((a) => a.assetId === 95)!
const h = accountHistory({
  asset: flowAsset, bills: state().bills, transfers: [], lends: [],
  refunds: [], reimbursements: [], parents: state().parentCategories
})
assert.equal(h.entries.length, 2)
assert.equal(h.closing, flowAsset.assetNumber, '逐笔累加应与余额一致')
assert.equal(h.entries[h.entries.length - 1].time >= h.entries[0].time, true, '按时间排序')

// 统计三维度：按日 / 按账户 / 按标签
state().reset()
state().addAsset({ assetId: 96, assetName: '统计账户', assetNumber: 0 })
const t1 = new Date(2026, 5, 2, 10).getTime()
const t2 = new Date(2026, 5, 3, 10).getTime()
const sBill = state().addBill({ assetId: 96, parentCategoryId: 7, cost: 30, time: t1, tags: ['出差'] })
state().addBill({ assetId: 96, parentCategoryId: 903, cost: 100, time: t2 })
const trend = dailyTrend(state().bills, state().parentCategories, state().refunds, '2026-06')
assert.equal(trend.length, 2, '两天各一条')
assert.equal(trend[0].expense, 30)
assert.equal(trend[1].income, 100)
const assetRows = byAsset(state().bills, state().assets, state().parentCategories, state().refunds)
assert.equal(assetRows[0].expense, 30, '账户维度只统计支出')
assert.equal(assetRows[0].income, 100)
state().ensureTags(['出差'])
const tagRows = byTag(state().bills, state().tags, state().parentCategories, state().refunds)
assert.equal(tagRows.length, 1, '只有被标签标记的支出进入标签统计')
assert.equal(tagRows[0].name, '出差')
assert.equal(tagRows[0].amount, 30)
assert.equal(sBill.time, t1)

// 账户流水期末余额必须等于资产余额（含转账手续费只算一次）
state().reset()
state().addAsset({ assetId: 97, assetName: '流水A', assetNumber: 1000 })
state().addAsset({ assetId: 98, assetName: '流水B', assetNumber: 0 })
state().addTransfer({ fromAssetId: 97, toAssetId: 98, cost: 100, serviceCharge: 2 })
const a97 = state().assets.find((a) => a.assetId === 97)!
const h97 = accountHistory({
  asset: a97, bills: state().bills, transfers: state().transfers, lends: [],
  refunds: [], reimbursements: [], parents: state().parentCategories
})
assert.equal(h97.closing, a97.assetNumber, '流水期末 = 资产余额（手续费不重复）')
assert.equal(a97.assetNumber, 898, '转出 100 + 手续费 2')

// 日期分组键必须是完整本地日期，避免 NaN
assert.equal(fullDay(new Date(2026, 10, 11, 9).getTime()), '2026-11-11')
assert.ok(humanDay('2025-03-05').includes('月'), 'humanDay 接受 YYYY-MM-DD')
assert.equal(humanDay(fullDay(Date.now())), '今天', '当天显示今天')

// 预算身份：月预算与自定义预算并存，不互相覆盖
state().reset()
state().setBudget({ month: 'all', categoryId: 0, amount: 1000, type: 'month' } as any)
state().setBudget({ month: 'all', categoryId: 0, amount: 200, type: 'custom', budgetId: 11, budgetName: '装修' } as any)
assert.equal(state().budgets.length, 2, '月预算与自定义预算并存')
state().setBudget({ month: 'all', categoryId: 0, amount: 150, type: 'custom', budgetId: 12, budgetName: '旅行' } as any)
assert.equal(state().budgets.filter((b) => b.type === 'custom').length, 2, '多个自定义预算并存')
state().setBudget({ month: 'all', categoryId: 0, amount: 1200, type: 'month' } as any)
assert.equal(state().budgets.filter((b) => b.type === 'month').length, 1, '月预算原地更新')
assert.equal(state().budgets.find((b) => b.type === 'month')?.amount, 1200)
state().removeBudgetById(11)
assert.equal(state().budgets.filter((b) => b.type === 'custom').length, 1, '按 id 删除自定义预算')

// 服务端判定期号冲突后：本地候选作废并留墓碑，不会覆盖胜出记录
state().reset()
state().addAsset({ assetId: 99, assetName: '周期账户', assetNumber: 1000 })
const cand = state().addBill({ assetId: 99, parentCategoryId: 7, cost: 50, cycleId: 'rule-x' })
const syncId = String(cand.syncId ?? cand.billId)
state().resolvePeriodConflicts([{ id: syncId, winnerId: syncId }])
assert.equal(state().bills.some((b) => String(b.syncId ?? b.billId) === syncId), false, '本地候选已移除')
assert.ok(state().tombstones.some((t) => t.kind === 'bill' && t.id === syncId), '留下墓碑避免重推')

// 分类管理：新增/改名/换图标/排序/删除保护
state().reset()
const newParent = state().addCategory({ name: '宠物', kind: 'expense', parentId: 0, icon: 'ic_parent_other' })
assert.ok(state().parentCategories.some((c) => c.id === newParent.id), '大类已新增')
const newChild = state().addCategory({ name: '猫粮', kind: 'expense', parentId: newParent.id })
assert.ok(state().childCategories.some((c) => c.id === newChild.id), '子分类已新增')
state().updateCategory(newChild.id, { name: '猫砂', icon: 'ic_shopping_bag' })
assert.equal(state().childCategories.find((c) => c.id === newChild.id)?.name, '猫砂')
// 排序：把新大类往上移一位
const beforeOrder = state().parentCategories.filter((c) => c.kind === 'expense').sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0)).map((c) => c.id)
state().moveCategory(newParent.id, -1)
const afterOrder = state().parentCategories.filter((c) => c.kind === 'expense').sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0)).map((c) => c.id)
assert.notDeepEqual(beforeOrder, afterOrder, '排序生效')
// 删除保护：有账单引用时不能删
state().addAsset({ assetId: 90, assetName: '分类测试账户', assetNumber: 100 })
state().addBill({ assetId: 90, parentCategoryId: newParent.id, cost: 10 })
assert.equal(state().deleteCategory(newParent.id), false, '被引用时拒绝删除')
assert.ok(state().parentCategories.some((c) => c.id === newParent.id))

// 期号冲突：内容相同才作废候选；改过的或被引用的保留并标待核对
state().reset()
state().addAsset({ assetId: 88, assetName: '冲突账户', assetNumber: 1000 })
const win = state().addBill({ assetId: 88, parentCategoryId: 7, cost: 50, cycleId: 'rule-c', time: new Date(2026, 5, 1, 9).getTime() })
const cand1 = state().addBill({ assetId: 88, parentCategoryId: 7, cost: 50, cycleId: 'rule-c', time: new Date(2026, 5, 1, 9).getTime() })
const r1 = state().resolvePeriodConflicts([{ id: String(cand1.syncId ?? cand1.billId), winnerId: String(win.syncId ?? win.billId) }])
assert.equal(r1.dropped, 1, '内容一致的重复候选作废')
assert.equal(state().bills.filter((b) => b.cycleId === 'rule-c').length, 1)

const cand2 = state().addBill({ assetId: 88, parentCategoryId: 7, cost: 80, cycleId: 'rule-c', time: new Date(2026, 5, 1, 9).getTime() })
const r2 = state().resolvePeriodConflicts([{ id: String(cand2.syncId ?? cand2.billId), winnerId: String(win.syncId ?? win.billId) }])
assert.equal(r2.kept, 1, '改过金额的候选保留')
const keptConflict = state().bills.find((b) => String(b.syncId ?? b.billId) === String(cand2.syncId ?? cand2.billId))
assert.equal(keptConflict?.conflict, true, '保留项标记待核对')

// 编辑账单：优惠金额与 AA 分摊必须真正持久化（曾出现输入无效）
state().reset()
state().addAsset({ assetId: 87, assetName: '编辑账户', assetNumber: 500 })
const editable = state().addBill({ assetId: 87, parentCategoryId: 7, cost: 100 })
state().updateBill(editable.billId, {
  discountNumber: 12,
  billShares: [{ name: '我', amount: 50 }, { name: '分摊人1', amount: 50 }]
})
const afterEdit = state().bills.find((b) => b.billId === editable.billId)!
assert.equal(afterEdit.discountNumber, 12, '优惠金额已保存')
assert.equal(afterEdit.billShares?.length, 2, 'AA 分摊已保存')
assert.equal(balance(87), 400, '优惠与分摊不改变余额')

// 编辑已有退款：金额可改，超过可退额被拒，余额随之变化
state().reset()
state().addAsset({ assetId: 86, assetName: '退款账户', assetNumber: 1000 })
const rb = state().addBill({ assetId: 86, parentCategoryId: 7, cost: 100 })
state().addRefund({ billId: rb.billId, number: 30 })
assert.equal(balance(86), 930, '退款到账后 930')
const refundId = state().refunds[0].refundId
assert.equal(state().updateRefund(refundId, { number: 20 }), true)
assert.equal(state().refunds[0].number, 20)
assert.equal(balance(86), 920, '改为 20 后余额跟着变')
assert.equal(state().updateRefund(refundId, { number: 200 }), false, '超过可退额被拒')
assert.equal(state().refunds[0].number, 20, '被拒时保持原值')

// AA 群组（一木模型）：群组→成员→按三种方式分摊，合计必须等于账单
state().reset()
state().addAsset({ assetId: 85, assetName: 'AA 账户', assetNumber: 1000 })
const group = state().addSplitGroup({ name: '周末聚餐', members: ['我'] })
state().addSplitMember(group.splitGroupId, '张三')
state().addSplitMember(group.splitGroupId, '李四')
const mem = state().splitMembers.filter((m) => m.splitGroupId === group.splitGroupId)
assert.equal(mem.length, 3, '群组三名成员')
const aaGroupBill = state().addBill({ assetId: 85, parentCategoryId: 7, cost: 300 })
// 均分：每人 100
assert.equal(state().applySplit(aaGroupBill.billId, group.splitGroupId, 0), true)
const savedBill = state().bills.find((b) => b.billId === aaGroupBill.billId)!
const savedShares = parseShares(savedBill.billShareInfo)
assert.equal(savedShares.length, 3, '均分三人')
assert.equal(savedShares.every((x) => x.value === 1), true, '均分时 value 固定为 1')
const equalAmounts = splitAmounts(300, mem, 0, {}).amounts
assert.equal(Object.values(equalAmounts).reduce((a, b) => a + b, 0), 300, '均分合计等于总额')
// 按金额：合计不等时拒绝
const values = { [mem[0].splitMemberId]: 100, [mem[1].splitMemberId]: 100, [mem[2].splitMemberId]: 50 }
assert.equal(state().applySplit(aaGroupBill.billId, group.splitGroupId, 1, values), false, '合计不等于总额应拒绝')
values[mem[2].splitMemberId] = 100
assert.equal(state().applySplit(aaGroupBill.billId, group.splitGroupId, 1, values), true, '合计相等才接受')
// 待结算 + 结算
const aaExpense = state().splitExpenses[0]
assert.equal(aaExpense.settlement, false)
state().settleSplit(aaExpense.splitExpenseId, true)
assert.equal(state().splitExpenses[0].settlement, true)
// 分摊不影响余额
assert.equal(balance(85), 700, 'AA 分摊不改变账户余额')

// 账单组与关联（一木 BillGroup / BillRelated）
state().reset()
state().addAsset({ assetId: 84, assetName: '组账户', assetNumber: 1000 })
const gb1 = state().addBill({ assetId: 84, parentCategoryId: 7, cost: 40 })
const gb2 = state().addBill({ assetId: 84, parentCategoryId: 7, cost: 60 })
assert.equal(state().createBillGroup([gb1.billId, gb2.billId]), true, '两条同账本账单可合并')
const grp = state().billGroups[0]
assert.equal(grp.billList.length, 2)
assert.equal(grp.totalNumber, 100, '组内合计')
assert.equal(state().createBillGroup([gb1.billId, gb2.billId]), false, '重复合并被拒')
assert.equal(state().createBillGroup([gb1.billId]), false, '单条不能成组')
state().dissolveBillGroup(grp.billGroupId)
assert.equal(state().billGroups.length, 0, '解散后不残留')
// 关联
const l1 = state().addBill({ assetId: 84, parentCategoryId: 7, cost: 10 })
const l2 = state().addBill({ assetId: 84, parentCategoryId: 7, cost: 20 })
assert.equal(state().linkBills(l1.billId, l2.billId), true)
assert.equal(state().linkBills(l1.billId, l2.billId), false, '重复关联被拒')
assert.equal(state().linkBills(l1.billId, l1.billId), false, '不能自关联')
state().unlinkBills(state().billRelated[0].relatedId)
assert.equal(state().billRelated.length, 0, '解除关联')
assert.equal(balance(84), 870, '合并与关联不改变余额')

// 资产桑基：五大类映射、负数与隐藏账户不参与、外币折算
state().reset()
state().addAsset({ assetId: 81, assetName: '储蓄卡', assetType: 1, assetNumber: 1000 })
state().addAsset({ assetId: 82, assetName: '基金', assetType: 4, assetNumber: 500 })
state().addAsset({ assetId: 83, assetName: '信用卡', assetType: 2, assetNumber: -300 })
state().addAsset({ assetId: 84, assetName: '隐藏账户', assetType: 1, assetNumber: 999, hide: true })
const sk = buildAssetSankey(state().assets, state().currencies, state().defaultCurrency)
assert.equal(sk.total, 1500, '信用卡负数与隐藏账户不计入')
assert.equal(sk.groups.find((g) => g.group === '流动资产')?.amount, 1000)
assert.equal(sk.groups.find((g) => g.group === '投资资产')?.amount, 500)
assert.equal(sankeyGroupOf(6), '应收款')
assert.equal(sankeyGroupOf(5), '固定资产')
assert.equal(sankeyGroupOf(9), '无形资产')

// 新增账户不能丢掉额度、卡号、账单日、隐藏标记等字段
state().reset()
state().addAsset({
  assetId: 80, assetName: '招行信用卡', assetType: 2, assetNumber: -1200,
  totalQuota: 20000, cardCode: '1234', inAccountDate: 5, outAccountDate: 20,
  hide: true, intoTotalAsset: false, simpleName: '招行', bookId: 'book-x'
})
const made = state().assets.find((a) => a.assetId === 80)!
assert.equal(made.totalQuota, 20000, '额度保留')
assert.equal(made.cardCode, '1234', '卡号保留')
assert.equal(made.outAccountDate, 20, '还款日保留')
assert.equal(made.hide, true, '隐藏标记保留')
assert.equal(made.intoTotalAsset, false, '不计总资产保留')
assert.equal(made.simpleName, '招行', '简称保留')
assert.equal(made.bookId, 'book-x', '归属账本保留')

// 周期转账（一木 Cycle 带 toAssetId）：生成转账而不是账单，手续费单独成账单
const transferCycle = {
  cycleId: 'cyc-transfer', bookId: 'book-a', name: '每月转存', kind: 'expense' as const,
  parentCategoryId: 7, childCategoryId: 0, assetId: 3001, cost: 200,
  fromAssetId: 3001, toAssetId: 3002, serviceCharge: 2,
  dayOfMonth: 1, startTime: new Date(2026, 0, 1).getTime(), enabled: true, generated: []
}
const tPlan = planCycles({
  cycles: [transferCycle as any],
  bills: [],
  assets: [
    { assetId: 3001, assetName: '储蓄卡', assetType: 1, assetNumber: 1000, currency: 'CNY', positionWeight: 0, remark: '', userId: 1, updateTime: 1 },
    { assetId: 3002, assetName: '理财', assetType: 4, assetNumber: 0, currency: 'CNY', positionWeight: 1, remark: '', userId: 1, updateTime: 1 }
  ],
  parentCategories: state().parentCategories, childCategories: state().childCategories,
  currencies: [{ code: 'CNY', name: '人民币', symbol: '¥', rate: 1 }], defaultCurrency: 'CNY',
  userId: 1, currentBookId: 'book-a'
}, new Date(2026, 2, 1))
assert.equal(tPlan.bills.length, 0, '周期转账不生成账单')
assert.equal(tPlan.transfers?.length, 3, '1/2/3 月各一次转账')
assert.equal(tPlan.transfers?.[0].toAssetId, 3002)
assert.equal(tPlan.transfers?.[0].serviceCharge, 2)

// 房贷：等额本息公式、总额守恒、组合贷合并
const ep = planLoan({ commercial: { amount: 1000000, rate: 0.043 }, periods: 360, repayment: 'equal-payment' })
assert.equal(ep.periods.length, 360)
assert.equal(ep.totalPrincipal, 1000000, '本金合计等于贷款额')
// 经典校验：100 万 / 4.3% / 30 年，等额本息月供约 4948.7
assert.ok(Math.abs(ep.firstMonthly - 4948.71) < 1.5, '首月月供接近理论值, 实际 ' + ep.firstMonthly)
assert.ok(Math.abs(ep.periods.reduce((s, x) => s + x.total, 0) - (ep.totalPrincipal + ep.totalInterest)) < 0.5, '还款总额 = 本金 + 利息')

// 等额本金：首月最高，逐期递减，本金每期相同
const eq = planLoan({ commercial: { amount: 300000, rate: 0.043 }, periods: 120, repayment: 'equal-principal' })
assert.equal(eq.totalPrincipal, 300000)
assert.ok(eq.periods[0].total > eq.periods[eq.periods.length - 1].total, '等额本金逐期递减')
assert.equal(eq.periods[0].principal, eq.periods[1].principal, '本金每期相同')

// 组合贷：商贷 + 公积金，按期合并
const combo = planLoan({
  commercial: { amount: 400000, rate: 0.043 },
  provident: { amount: 600000, rate: 0.031 },
  periods: 240, repayment: 'equal-payment'
})
assert.equal(combo.totalPrincipal, 1000000, '组合贷本金合计')
assert.ok(combo.firstMonthly > 0)

// LPR 加点：加点后利息更高
const base = planLoan({ commercial: { amount: 500000, rate: 0.035 }, periods: 120, repayment: 'equal-payment' })
const add = planLoan({ commercial: { amount: 500000, rate: 0.035, lprAdd: 0.6 }, periods: 120, repayment: 'equal-payment' })
assert.ok(add.totalInterest > base.totalInterest, 'LPR 加点后利息更高')

// 信用卡分期：一次性 / 每期手续费，合计守恒
const insOnce = planInstalment({ total: 12000, periods: 12, serviceRate: 0.072, serviceType: 0 })
assert.equal(insOnce.periods.length, 12)
assert.equal(insOnce.totalService, 864, '总手续费 = 本金 × 费率')
assert.equal(insOnce.periods[0].service, 864, '一次性手续费全在第 1 期')
assert.equal(insOnce.periods[1].service, 0)
assert.equal(insOnce.periods.reduce((s, x) => s + x.principal, 0), 12000, '本金合计守恒')
const insPer = planInstalment({ total: 12000, periods: 12, serviceRate: 0.072, serviceType: 1 })
assert.equal(Math.round(insPer.periods.reduce((s, x) => s + x.service, 0)), 864, '每期手续费合计等于总手续费')

// 房贷/分期计划可持久化，分期能生成每期账单
state().reset()
state().addAsset({ assetId: 79, assetName: '信用卡', assetType: 2, assetNumber: 0 })
const loanRec = state().addHomeLoan({
  name: '首套', commercial: 400000, commercialRate: 0.043,
  provident: 200000, providentRate: 0.031, periods: 120, repayment: 'equal-payment'
})
assert.equal(state().homeLoans.length, 1)
assert.equal(loanRec.commercial, 400000)
const insRec = state().addInstalment({
  totalNumber: 1200, periods: 6, serviceRate: 0.06, serviceType: 0,
  accountMonth: '2026-11', assetId: 79
})
assert.equal(state().instalments.length, 1)
const posted = state().postInstalmentBills(insRec.instalmentId)
assert.equal(posted, 6, '生成 6 期账单')
assert.equal(state().postInstalmentBills(insRec.instalmentId), 0, '重复生成会被跳过')
assert.equal(state().bills.filter((b) => b.assetId === 79).length, 6)
state().deleteInstalment(insRec.instalmentId)
state().deleteHomeLoan(loanRec.loanId)
assert.equal(state().instalments.length + state().homeLoans.length, 0)

// 模板：存为模板后一键记账，金额与分类一致
state().reset()
state().addAsset({ assetId: 78, assetName: '模板账户', assetNumber: 500 })
const tpl = state().addTemplate({
  name: '早餐', mode: 'bill',
  bill: { assetId: 78, parentCategoryId: 7, childCategoryId: 0, cost: 12, remark: '包子' }
})
assert.equal(state().templates.length, 1)
assert.equal(state().applyTemplate(tpl.templateId), true, '套用模板记账')
assert.equal(state().bills.length, 1)
assert.equal(state().bills[0].cost, 12, '模板金额')
assert.equal(balance(78), 488)
state().deleteTemplate(tpl.templateId)
assert.equal(state().templates.length, 0)
