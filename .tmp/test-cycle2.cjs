global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const acc=S().assets[0]
const base={name:'t',kind:'expense',parentCategoryId:4,childCategoryId:0,assetId:acc.assetId,cost:10,remark:'x'}
const ago=(n)=>{const d=new Date();d.setDate(d.getDate()-n);d.setHours(0,0,0,0);return d.getTime()}

// 1) 每周一、三、五，从 14 天前开始
useLedger.setState({cycles:[],bills:[]})
S().addCycle({...base,dayOfMonth:1,cycleType:'week',weekdays:[1,3,5],startTime:ago(14)})
let n=S().runCycles(); console.log('每周一三五，14天:', n, '条 (应 6~7)')
console.log('  生成日期:', S().cycles[0].generated.join(' '))

// 2) 幂等
console.log('  再跑一次:', S().runCycles(), '条 (应 0)')

// 3) 每月 1 号和 15 号
useLedger.setState({cycles:[],bills:[]})
const d=new Date(); d.setMonth(d.getMonth()-2); d.setDate(1)
S().addCycle({...base,dayOfMonth:1,cycleType:'month',monthDays:[1,15],startTime:d.getTime()})
console.log('\n每月1/15，近两月:', S().runCycles(), '条 (应 5~6)')

// 4) 每月最后一天
useLedger.setState({cycles:[],bills:[]})
S().addCycle({...base,dayOfMonth:28,cycleType:'month',monthLast:true,startTime:ago(70)})
console.log('每月最后一天，70天:', S().runCycles(), '条')

// 5) 每年一次（今年 1 月 1 日，已过）
useLedger.setState({cycles:[],bills:[]})
const y=new Date(); y.setFullYear(y.getFullYear()-2); y.setMonth(0); y.setDate(1)
S().addCycle({...base,dayOfMonth:1,cycleType:'year',monthOfYear:1,startTime:y.getTime()})
console.log('每年1月1日，从两年前:', S().runCycles(), '条 (应 3)')

// 6) 暂停的规则不生成
useLedger.setState({cycles:[],bills:[]})
S().addCycle({...base,dayOfMonth:1,cycleType:'week',weekdays:[1],startTime:ago(7)})
S().toggleCycle(S().cycles[0].cycleId)
console.log('暂停后运行:', S().runCycles(), '条 (应 0)')
