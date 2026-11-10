global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const acc=S().assets[0]
const bal=()=>S().assets.find(a=>a.assetId===acc.assetId).assetNumber
const b0=bal()

// 从 3 个月前开始，每月 1 号 3200 房租
const start=new Date(); start.setMonth(start.getMonth()-3); start.setDate(1)
S().addCycle({name:'房租',kind:'expense',parentCategoryId:4,childCategoryId:402,
  assetId:acc.assetId,cost:3200,dayOfMonth:1,remark:'房租',startTime:start.getTime()})

const n1=S().runCycles()
console.log('首次生成:', n1, '条')
const b1=bal()
console.log('账户余额:', b0, '→', b1, '（应减少', n1*3200, '）')

const n2=S().runCycles()
console.log('再次运行生成:', n2, '条（应为 0，幂等）')

const cyc=S().cycles[0]
console.log('已生成月份:', cyc.generated.join(', '))
console.log('生成的账单类型:', [...new Set(S().bills.filter(b=>b.billType===4).map(b=>b.remark))])
