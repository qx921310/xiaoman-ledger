global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
// 用户 1 记账
useLedger.setState({userId:1, bills:[]})
S().addBill({cost:3, parentCategoryId:7, assetId:S().assets[0].assetId, remark:'可乐'})
const a=S().bills[0]
// 用户 2 同一秒记账（模拟另一位成员）
useLedger.setState({userId:2})
const before=S().bills.map(b=>b.billId)
S().addBill({cost:4, parentCategoryId:7, assetId:S().assets[0].assetId, remark:'蛋糕'})
const b=S().bills[0]
console.log('用户1 账单 id:', a.billId)
console.log('用户2 账单 id:', b.billId)
console.log('ID 相同?', a.billId===b.billId, '(应 false)')
console.log('两条都在?', S().bills.length, '(应 2)')
