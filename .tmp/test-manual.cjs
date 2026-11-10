global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store2.cjs')
const S=()=>useLedger.getState()
S().seed()
const a=S().assets[0]
S().addBill({cost:100, parentCategoryId:7, assetId:a.assetId})
const before=S().assets.find(x=>x.assetId===a.assetId)
console.log('记账后 余额=', before.assetNumber, ' 期初=', before.openingBalance)

// 用户手动把余额改成实际值 9999（对账）
S().updateAsset({...before, assetNumber: 9999})
const after=S().assets.find(x=>x.assetId===a.assetId)
console.log('手动改余额后: 余额=', after.assetNumber, ' 期初=', after.openingBalance, '(期初应已调整, 余额应=9999)')

// 再记一笔，余额应从 9999 继续
S().addBill({cost:9, parentCategoryId:7, assetId:a.assetId})
const after2=S().assets.find(x=>x.assetId===a.assetId)
console.log('再记 9 元后余额=', after2.assetNumber, '(应 9990)')
