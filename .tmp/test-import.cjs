const XLSX = require('xlsx')
const fs = require('fs')
const { parseLedgerFile, buildImportPlan, detectFormat } = require('./importer.cjs')

const header = ['日期','收支类型','金额','类别','二级分类','账户','账本','退款','优惠','备注','标签']
const rows = [
  ['2026-11-01 08:30','支出',-25.5,'食品餐饮','早餐','微信钱包','日常账本','','','豆浆油条',''],
  ['2026-11-02 12:00','支出',-48,'食品餐饮','午餐','支付宝','日常账本','','','同事聚餐','团建'],
  ['2026-11-03 09:00','收入',12000,'工资','','招行储蓄卡','日常账本','','','月薪',''],
  ['2026-11-04 19:00','支出',-3200,'居家生活','房租','招行储蓄卡','日常账本','','','11月房租',''],
  ['2026-11-05 10:00','支出',-6,'出行交通','地铁','支付宝','日常账本','','','通勤',''],
  ['bad-date','支出',-1,'其他','','支付宝','日常账本','','','坏数据',''],
  ['2026-11-02 12:00','支出',-48,'食品餐饮','午餐','支付宝','日常账本','','','同事聚餐','团建'] // 重复行
]
const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '账单')
XLSX.writeFile(wb, '.tmp/sample-yimu.xlsx')

const buf = fs.readFileSync('.tmp/sample-yimu.xlsx')
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const table = parseLedgerFile(ab, 'sample-yimu.xlsx')
console.log('格式识别:', detectFormat(table.headers))
console.log('表头:', table.headers.join(' | '))
console.log('数据行数:', table.rows.length)

const plan = buildImportPlan({
  table, existingBills: [], existingAssets: [], parentCategories: [], childCategories: [],
  userId: 1, bookId: 1
})
console.log('\n可导入:', plan.bills.length, '| 重复:', plan.duplicates, '| 解析失败:', plan.skipped.length)
console.log('收入:', plan.income, '支出:', plan.expense)
console.log('新增分类:', plan.newParents.map(c => c.name + '(' + c.kind + ')').join(', '))
console.log('新增账户:', plan.newAssets.map(a => a.assetName + '[type' + a.assetType + ']').join(', '))
console.log('\n前 3 条:')
plan.bills.slice(0,3).forEach(b => console.log(' ', new Date(b.time).toISOString().slice(0,16), b.cost, '|', b.billShareInfo.parentCategoryName, '/', b.billShareInfo.childCategoryName, '|', b.billShareInfo.assetName, '|', b.remark, '| tags=', b.tags))
console.log('\n跳过原因:', plan.skipped)
