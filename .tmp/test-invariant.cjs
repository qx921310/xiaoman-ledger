global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}}
const { useLedger } = require('./store2.cjs')
const { deriveAssets } = require('./bal.cjs')
const S=()=>useLedger.getState()
S().seed()
const a1=S().assets[0], a2=S().assets[1]
const check=(label)=>{
  const st=S()
  const derived = deriveAssets({
    assets: st.assets, bills: st.bills, transfers: st.transfers, lends: st.lends,
    refunds: st.refunds, reimbursements: st.reimbursements, parentCategories: st.parentCategories
  })
  let bad=[]
  for (const d of derived) {
    const cur = st.assets.find(x=>x.assetId===d.assetId)
    if (Math.abs(d.assetNumber - cur.assetNumber) > 0.005) bad.push(`${cur.assetName}: 直接记 ${cur.assetNumber} vs 重算 ${d.assetNumber}`)
  }
  console.log(bad.length ? `❌ ${label}\n   ` + bad.join('\n   ') : `✅ ${label}`)
}
check('初始')

S().addBill({cost:100, parentCategoryId:7, assetId:a1.assetId, remark:'午餐'})
check('记一笔支出后')

const t=S().addTransfer({fromAssetId:a1.assetId,toAssetId:a2.assetId,cost:500,toCost:495,serviceCharge:2})
check('转账(到账495/手续费2)后')

S().addLend({type:1,assetId:a1.assetId,counterparty:'张三',number:300})
check('借出300后')

S().addRefund({billId:S().bills[0].billId, number:30})
check('退款30后')

const b=S().bills[0]
S().addReimbursement({billId:b.billId, assetId:a2.assetId, number:50})
check('登记报销(未到账)后')
S().settleReimbursement(S().reimbursements[0].reimbursementId)
check('报销到账50后')

S().deleteTransfer(t.transferId)
check('删转账后')

S().deleteBill(S().bills[0].billId)
check('删账单后')
