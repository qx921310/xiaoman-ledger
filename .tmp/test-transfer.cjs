global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const from=S().assets[0], to=S().assets[1]
const bal=id=>S().assets.find(a=>a.assetId===id).assetNumber
const f0=bal(from.assetId), t0=bal(to.assetId)
const t=S().addTransfer({fromAssetId:from.assetId,toAssetId:to.assetId,cost:500,serviceCharge:2,remark:'测试'})
console.log('转账 500 + 手续费 2:')
console.log('  转出方:', f0, '→', bal(from.assetId), '(应 -502)')
console.log('  转入方:', t0, '→', bal(to.assetId), '(应 +500)')
console.log('  净资产变化:', ((bal(from.assetId)+bal(to.assetId))-(f0+t0)).toFixed(2), '(应 -2)')
// 改成 800 + 手续费 5
S().updateTransfer(t.transferId, {cost:800, serviceCharge:5})
console.log('改为 800 + 手续费 5:')
console.log('  转出方:', bal(from.assetId), '(应 =', (f0-805).toFixed(2), ')')
console.log('  转入方:', bal(to.assetId), '(应 =', (t0+800).toFixed(2), ')')
console.log('  手续费账单数:', S().bills.filter(b=>String(b.remark).includes('转账手续费')).length, '(应为 1)')
