const XLSX=require('xlsx'), fs=require('fs')
const { parseLedgerFile, buildImportPlan, exportXlsx } = require('./importer-ext.cjs')

// 1) 造一份含全部字段的表
const header=['日期','收支类型','金额','类别','二级分类','账户','账本','退款','优惠','备注','标签',
  '报销账户','报销金额','报销明细','多币种','地址','创建用户','其他','附件1','附件2','附件3','附件4','附件5']
const rows=[['2026-11-01 12:00','支出',-120,'食品餐饮','午餐','支付宝','日常账本','30','5','客户餐叙','商务,差旅',
  '报销账户A','100','餐费报销','USD 18.5','杭州西湖','2','不计入收支、不计入预算','https://x/a.jpg','','','','']]
const ws=XLSX.utils.aoa_to_sheet([header,...rows])
const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'账单')
XLSX.writeFile(wb,'.tmp/rt-in.xlsx')

// 2) 导入
const buf=fs.readFileSync('.tmp/rt-in.xlsx')
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)
const plan=buildImportPlan({table:parseLedgerFile(ab,'rt-in.xlsx'),existingBills:[],existingAssets:[],
  existingBooks:[],parentCategories:[],childCategories:[],userId:1,bookId:1})

// 3) 导出（改写 writeFile 到固定路径）
const origWrite=XLSX.writeFile
XLSX.writeFile=(wbk)=>{ origWrite(wbk,'.tmp/rt-out.xlsx') }
exportXlsx(plan.bills, plan.newParents.concat([{id:7,name:'食品餐饮',kind:'expense',parentId:0,color:'',positionWeight:0}]),
  plan.newChildren, plan.newAssets, plan.newBooks, plan.reimbursements, plan.refunds)
XLSX.writeFile=origWrite

// 4) 读回比对
const out=XLSX.readFile('.tmp/rt-out.xlsx')
const back=XLSX.utils.sheet_to_json(out.Sheets[out.SheetNames[0]],{header:1,defval:''})
const h=back[0], r=back[1]
const get=(k)=>r[h.indexOf(k)]
const expect={日期:'2026-11-01 12:00',收支类型:'支出',金额:-120,类别:'食品餐饮',二级分类:'午餐',账户:'支付宝',
  账本:'日常账本',退款:30,优惠:5,备注:'客户餐叙',标签:'商务,差旅',报销账户:'报销账户A',报销金额:100,
  报销明细:'餐费报销',多币种:'USD 18.5',地址:'杭州西湖',创建用户:2,其他:'不计入收支、不计入预算',附件1:'https://x/a.jpg'}
let ok=0,bad=[]
for(const [k,v] of Object.entries(expect)){
  const got=get(k)
  const pass = String(got)===String(v) || Number(got)===Number(v)
  if(pass) ok++; else bad.push(`${k}: 期望 ${v} 实际 ${got}`)
}
console.log(`往返字段核对: ${ok}/${Object.keys(expect).length} 通过`)
if(bad.length) console.log('不一致:', bad.join(' | '))
