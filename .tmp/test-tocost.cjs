global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const [from, to] = S().assets
const bal=id=>S().assets.find(a=>a.assetId===id).assetNumber

console.log('=== 场景1：跨境转账，转出 100 USD，到账 680 CNY ===')
useLedger.setState({ assets: S().assets.map((a,i)=> i===0?{...a,currency:'USD',assetNumber:1000}: i===1?{...a,currency:'CNY',assetNumber:0}: a) })
const f0=bal(from.assetId), t0=bal(to.assetId)
const t=S().addTransfer({fromAssetId:from.assetId,toAssetId:to.assetId,cost:100,toCost:680,serviceCharge:0})
console.log(`  转出方(USD): ${f0} → ${bal(from.assetId)}  (应 -100)`)
console.log(`  转入方(CNY): ${t0} → ${bal(to.assetId)}  (应 +680)`)
console.log('  记录的 toCost:', t.toCost)

console.log('\n=== 场景2：不填 toCost，默认等于 cost ===')
const t2=S().addTransfer({fromAssetId:from.assetId,toAssetId:to.assetId,cost:50})
console.log('  toCost:', t2.toCost, '(应 50)')

console.log('\n=== 场景3：带手续费 + toCost ===')
const f1=bal(from.assetId), t1=bal(to.assetId)
const t3=S().addTransfer({fromAssetId:from.assetId,toAssetId:to.assetId,cost:200,toCost:190,serviceCharge:5})
console.log(`  转出方: ${f1} → ${bal(from.assetId)} (应 -200-5=-205)`)
console.log(`  转入方: ${t1} → ${bal(to.assetId)} (应 +190)`)
console.log('  手续费账单:', S().bills.filter(b=>b.remark.includes('转账手续费')).length, '条')

console.log('\n=== 场景4：改单 200→300，toCost 190→280 ===')
S().updateTransfer(t3.transferId, {cost:300, toCost:280})
console.log(`  转出方: ${bal(from.assetId)} (应 = ${(f1-300-5).toFixed(2)})`)
console.log(`  转入方: ${bal(to.assetId)} (应 = ${(t1+280).toFixed(2)})`)
console.log('  手续费账单:', S().bills.filter(b=>b.remark.includes('转账手续费')).length, '条（应仍 1）')

console.log('\n=== 场景5：删掉它，两端冲正 ===')
S().deleteTransfer(t3.transferId)
console.log(`  转出方: ${bal(from.assetId)} (应 = ${(f1-5).toFixed(2)}，本金已退回、手续费保留)`)
console.log(`  转入方: ${bal(to.assetId)} (应 = ${t1.toFixed(2)})`)
