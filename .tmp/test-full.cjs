const XLSX=require('xlsx'), fs=require('fs')
const { parseLedgerFile, buildImportPlan } = require('./importer.cjs')

const header=['日期','收支类型','金额','类别','二级分类','账户','账本','退款','优惠','备注','标签',
  '报销账户','报销金额','报销明细','多币种','地址','创建用户','其他','附件1','附件2','附件3','附件4','附件5']
const rows=[
  ['2026-11-01 12:00','支出',-120,'食品餐饮','午餐','支付宝','日常账本','','5','客户餐叙','商务',
   '报销账户A','100','餐费报销','','杭州西湖','2','不计入预算','https://x/a.jpg','','','',''],
  ['2026-11-02 09:00','支出',-300,'购物消费','数码','招行信用卡','旅行账本','30','','耳机','数码',
   '','','','USD 42.5','','1','不计入收支、不计入预算','','','','',''],
  ['2026-11-03 10:00','收入',5000,'工资','','招行储蓄卡','日常账本','','','补发','','','','','','','','','','','',''],
]
const ws=XLSX.utils.aoa_to_sheet([header,...rows])
const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'账单')
XLSX.writeFile(wb,'.tmp/rich.xlsx')

const buf=fs.readFileSync('.tmp/rich.xlsx')
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)
const table=parseLedgerFile(ab,'rich.xlsx')
const plan=buildImportPlan({table,existingBills:[],existingAssets:[],existingBooks:[],
  parentCategories:[],childCategories:[],userId:1,bookId:1})

console.log('导入条数:',plan.bills.length,'| 跳过:',plan.skipped.length)
console.log('新增账本:',plan.newBooks.map(b=>b.accountBookName))
console.log('报销记录:',plan.reimbursements.length,JSON.stringify(plan.reimbursements[0]||{}))
console.log('退款记录:',plan.refunds.length,JSON.stringify(plan.refunds[0]||{}))
console.log('\n列填充率:', plan.columnCoverage.map(c=>`${c.column}=${c.filled}`).join(' '))
console.log('\n逐条校验:')
plan.bills.forEach(b=>{
  console.log(` [${b.billShareInfo.parentCategoryName}/${b.billShareInfo.childCategoryName}] ¥${b.cost}`)
  console.log(`   不计入收支=${b.notIntoTotal} 不计入预算=${b.notIntoBudget} 优惠=${b.discountNumber} 退款=${b.refundNum}`)
  console.log(`   多币种="${b.currencyInfo}" 地址="${b.poiAddress}" 创建人=${b.fromUserId} 附件=${b.files.length} 账本id=${b.bookId} 标签=${JSON.stringify(b.tags)}`)
})
