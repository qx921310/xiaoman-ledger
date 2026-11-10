import { strict as assert } from 'node:assert'
import { deriveAssets } from '../src/balances'
import { buildImportPlan, parseLedgerFile } from '../src/importer'
import { useLedger } from '../src/store'
import { collectRecords } from '../src/sync'

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
state().applyRemote([{ kind: 'bill', id: remoteBill.syncId, payload: null, deleted: true, updatedAt: remoteBill.updateTime + 10 }])
assert.equal(state().assets[0].assetNumber, before)
assert.notEqual(afterRemote, before)

// Two devices starting from the same snapshot contribute distinct offline bills.
const sharedBase = { ...state(), bills: [], refunds: [], transfers: [], lends: [], reimbursements: [] }
const original = { ...sharedBase.assets[0], openingBalance: 100, assetNumber: 100 }
const expense = { ...s.bills.find(b => b.parentCategoryId === 7)!, billId: 101, cost: 10, assetId: original.assetId }
const income = { ...s.bills.find(b => b.parentCategoryId !== 7)!, billId: 102, cost: 20, assetId: original.assetId }
assert.equal(deriveAssets({ ...sharedBase, assets: [original], bills: [expense, income] })[0].assetNumber, 110)
console.log('balance and synthetic CSV tests passed')
