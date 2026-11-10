global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const bill=S().bills.find(b=>b.remark==='午饭')
const acc=S().assets.find(a=>a.assetId===bill.assetId)
const before=acc.assetNumber
const target=S().assets.find(a=>a.assetId!==bill.assetId)

// 登记报销（未到账）
S().addReimbursement({billId:bill.billId, assetId:target.assetId, number:32.5})
const rec0=S().reimbursements[0]
let after=S().assets.find(a=>a.assetId===target.assetId).assetNumber
console.log('登记后 报销账户:', after, '（应不变）| 状态:', rec0.status)

// 确认到账
S().settleReimbursement(rec0.reimbursementId)
after=S().assets.find(a=>a.assetId===target.assetId).assetNumber
console.log('确认到账后 报销账户:', after, '（应 +32.5）| 状态:', S().reimbursements[0].status)

// 退款
const beforeRefund=S().assets.find(a=>a.assetId===bill.assetId).assetNumber
S().addRefund({billId:bill.billId, number:10})
const afterRefund=S().assets.find(a=>a.assetId===bill.assetId).assetNumber
console.log('退款 10 后 支付账户:', beforeRefund, '→', afterRefund, '（应 +10）| 账单 refundNum:', S().bills.find(b=>b.billId===bill.billId).refundNum)
