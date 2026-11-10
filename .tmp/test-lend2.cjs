global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const [a1,a2]=S().assets
const bal=id=>S().assets.find(a=>a.assetId===id).assetNumber

console.log('=== 借出 1000，约定利息 50 ===')
const b1=bal(a1.assetId)
S().addLend({type:1,assetId:a1.assetId,counterparty:'张三',number:1000,interest:50})
const rec=S().lends[0]
console.log(`  ${b1} → ${bal(a1.assetId)} (应 -1000，利息不动现金)`)
console.log('  记录利息:', rec.interest)

console.log('\n=== 收回 1050（本金+利息），走另一个账户 ===')
const b2=bal(a2.assetId)
S().addLend({type:2,assetId:a1.assetId,repaymentAssetId:a2.assetId,counterparty:'张三',number:1050})
console.log(`  收款账户: ${b2} → ${bal(a2.assetId)} (应 +1050)`)
console.log(`  原账户未变: ${bal(a1.assetId)} (应仍 = ${(b1-1000).toFixed(2)})`)

console.log('\n=== 待收回/待归还口径 ===')
const r=S().lends
const rec2 = r.filter(l=>l.type===1).reduce((s,l)=>s+l.number+(l.interest??0),0) - r.filter(l=>l.type===2).reduce((s,l)=>s+l.number,0)
console.log('  待收回:', rec2, '(应 1050-1050=0)')
