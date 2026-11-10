global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
useLedger.setState({userId:1, bills:[]})
S().addBill({cost:3, parentCategoryId:7, assetId:S().assets[0].assetId, remark:'可乐'})
const mine=S().bills[0]
// 云端来的另一个人，恰好同一个 ID
S().applyRemote([{ kind:'bill', id:String(mine.billId), updatedAt:Date.now(), ownerId:2,
  payload:{...mine, ownerId:2, cost:4, remark:'蛋糕', updateTime:Date.now()} }])
console.log('账单条数:', S().bills.length, '(应 2)')
for (const b of S().bills) console.log('  ', b.remark, b.cost, 'id=', b.billId, 'owner=', b.ownerId)
