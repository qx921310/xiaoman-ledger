global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
// 本地已有一条我记的账单 billId=12345
S().addBill({cost:25, parentCategoryId:7, assetId:S().assets[0].assetId, remark:'我的午餐'})
const mine=S().bills[0]
console.log('本地账单 id:', mine.billId, 'ownerId:', mine.ownerId)

// 云端来了另一个人、同一秒同一 id 的记录
S().applyRemote([{
  kind:'bill', id:String(mine.billId), updatedAt:Date.now()+1000, ownerId:99,
  payload:{...mine, cost:26, remark:'他的午餐', ownerId:99, updateTime:Date.now()+1000}
}])
const after=S().bills.find(b=>b.billId===mine.billId)
console.log('合并后 conflict =', after.conflict, '(应 true)')
console.log('冲突对方 ownerId =', after.conflictOwnerId, '(应 1 → 本地归属)')

// 再合并一次同源记录，不应重复
S().applyRemote([{
  kind:'bill', id:String(mine.billId), updatedAt:Date.now()+2000, ownerId:99,
  payload:{...mine, cost:27, ownerId:99, updateTime:Date.now()+2000}
}])
console.log('账单总数:', S().bills.length, '(应仍 1 条，不重复)')
