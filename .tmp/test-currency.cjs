global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
const rate=c=>S().currencies.find(x=>x.code===c).rate

console.log('初始 USD:', rate('USD'))
S().setCurrencyRate('USD', NaN);      console.log('写入 NaN 后:', rate('USD'), '(应不变 7.2)')
S().setCurrencyRate('USD', 0);        console.log('写入 0   后:', rate('USD'), '(应不变 7.2)')
S().setCurrencyRate('USD', -3);       console.log('写入 -3  后:', rate('USD'), '(应不变 7.2)')
S().setCurrencyRate('USD', 7.5);      console.log('写入 7.5 后:', rate('USD'), '(应为 7.5)')
S().setCurrencyRate('CNY', 5);        console.log('改默认币种 CNY:', rate('CNY'), '(应锁定 1)')

// 自修复：人为把汇率置 0，再跑 mergeTaxonomy
const st=S()
useLedger.setState({ currencies: st.currencies.map(c=>c.code==='USD'?{...c,rate:0}:c) })
console.log('人为置 0 后:', rate('USD'))
S().mergeTaxonomy()
console.log('mergeTaxonomy 自修复后:', rate('USD'), '(应恢复 7.2)')

// 资产按币种折算
const a=S().assets[0]
useLedger.setState({ assets: [{...a, currency:'USD', assetNumber:100}] })
// 用与 useTotalAssets 相同的换算逻辑验证（hook 需要 React 运行环境，这里直接算）
const st2=S()
const usd=st2.currencies.find(c=>c.code==='USD')
console.log('100 USD 账户折算本币:', (100*usd.rate).toFixed(2), '(应 720.00)')
