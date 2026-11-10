global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const b=S().bills.find(x=>x.remark==='房租')
const acc=()=>S().assets.find(a=>a.assetId===b.assetId).assetNumber
const before=acc()
S().deleteBill(b.billId)
console.log('删除房租 3200 前后:', before, '→', acc(), '| 差:', (acc()-before).toFixed(2), '(应 +3200)')
const inc=S().bills.find(x=>x.remark==='月薪')
const a2=()=>S().assets.find(a=>a.assetId===inc.assetId).assetNumber
const b2=a2()
S().deleteBill(inc.billId)
console.log('删除收入 12000 前后:', b2, '→', a2(), '| 差:', (a2()-b2).toFixed(2), '(应 -12000)')
