global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store.cjs')
const S=()=>useLedger.getState()
S().seed()
const a=S().assets[0]
const bal=()=>S().assets.find(x=>x.assetId===a.assetId).assetNumber
const b0=bal()
S().addLend({type:1,assetId:a.assetId,counterparty:'张三',number:500})
console.log('借出 500:', b0, '→', bal(), '(应 -500)')
S().addLend({type:2,assetId:a.assetId,counterparty:'张三',number:200})
console.log('收回 200:', '→', bal(), '(应 +200)')
S().addLend({type:3,assetId:a.assetId,counterparty:'李四',number:300})
console.log('借入 300:', '→', bal(), '(应 +300)')
const last=S().lends[0]
S().deleteLend(last.lendId)
console.log('删掉借入 300:', '→', bal(), '(应 -300 回到原值)')
