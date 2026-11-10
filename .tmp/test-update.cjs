global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
const { useLedger } = require('./store.cjs')
const S = () => useLedger.getState()

S().seed()                                   // 演示数据
const before = S().assets.map(a => [a.assetName, a.assetNumber])
const target = S().bills.find(b => b.parentCategoryName === undefined && b.remark === '房租')
console.log('改前 账单:', target.remark, target.cost, '账户:', before.find(x => true) && S().assets.find(a => a.assetId === target.assetId).assetNumber)
const assetId = target.assetId
const accBefore = S().assets.find(a => a.assetId === assetId).assetNumber

// 3200 -> 3500：余额应再减 300
S().updateBill(target.billId, { cost: 3500 })
const accAfter = S().assets.find(a => a.assetId === assetId).assetNumber
console.log('改单 3200→3500 后余额:', accBefore, '→', accAfter, '| 差:', (accAfter - accBefore).toFixed(2))

// 换账户：旧账户应退回 3500，新账户应扣 3500
const other = S().assets.find(a => a.assetId !== assetId)
const otherBefore = other.assetNumber
S().updateBill(target.billId, { assetId: other.assetId })
const oldAfter = S().assets.find(a => a.assetId === assetId).assetNumber
const newAfter = S().assets.find(a => a.assetId === other.assetId).assetNumber
console.log('转账户后 旧账户:', oldAfter, '(应 +3500 =', (accAfter + 3500).toFixed(2), ')')
console.log('           新账户:', newAfter, '(应 -3500 =', (otherBefore - 3500).toFixed(2), ')')

// 收入改支出：符号应翻转
const income = S().bills.find(b => b.remark === '月薪')
const incAsset = income.assetId
const incBefore = S().assets.find(a => a.assetId === incAsset).assetNumber
S().updateBill(income.billId, { parentCategoryId: 105 })
const incAfter = S().assets.find(a => a.assetId === incAsset).assetNumber
console.log('收入改支出后 账户差:', (incAfter - incBefore).toFixed(2), '(应 -24000 = 先退 12000 再扣 12000)')
