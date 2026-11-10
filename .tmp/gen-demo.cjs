const XLSX = require('xlsx')
const fs = require('fs')

// 固定种子，保证每次生成同一份
let seed = 20261110
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const round2 = (n) => Math.round(n * 100) / 100

const accounts = ['招行储蓄卡', '支付宝', '微信钱包', '招行信用卡', '余额宝']
const expense = [
  ['食品餐饮', '三餐', 18, 65, ['招行信用卡', '支付宝', '微信钱包']],
  ['食品餐饮', '外卖', 22, 55, ['支付宝', '微信钱包']],
  ['食品餐饮', '零食饮料', 6, 30, ['微信钱包', '支付宝']],
  ['出行交通', '地铁', 3, 8, ['支付宝', '微信钱包']],
  ['出行交通', '打车', 15, 60, ['支付宝', '招行信用卡']],
  ['购物消费', '日用品', 20, 180, ['支付宝', '招行信用卡']],
  ['购物消费', '数码', 199, 1800, ['招行信用卡']],
  ['购物消费', '服饰', 89, 600, ['招行信用卡', '支付宝']],
  ['健康医疗', '药品', 20, 120, ['支付宝']],
  ['文化教育', '书籍', 29, 120, ['支付宝', '招行储蓄卡']],
  ['文化教育', '课程', 199, 999, ['招行储蓄卡']],
  ['通讯', '', 39, 129, ['支付宝']],
  ['人情', '', 100, 800, ['微信钱包']]
]
const remarks = {
  三餐: ['午饭', '晚饭', '早餐', '和同事吃饭', '食堂'],
  外卖: ['加班外卖', '周末外卖', '奶茶'],
  地铁: ['通勤', '出门'],
  打车: ['加班打车', '机场'],
  日用品: ['洗衣液', '纸巾', '超市采购', '牙膏'],
  数码: ['耳机', '充电器', '键盘'],
  服饰: ['T恤', '外套', '鞋子'],
  药品: ['感冒药', '维生素'],
  书籍: ['技术书', '小说'],
  课程: ['网课', '训练营'],
  '': ['月租套餐', '话费充值', '给家里', '份子钱']
}

const rows = []
const push = (d, type, amount, cat, sub, acc, remark, tags = '') =>
  rows.push([d, type, amount, cat, sub, acc, '日常账本', '', '', remark, tags])

const fmt = (dt) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}

// 2026-04-01 ~ 2026-11-10
const start = new Date(2026, 3, 1)
const end = new Date(2026, 10, 10)

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const day = new Date(d)
  // 每天 0~4 笔日常支出
  const n = Math.floor(rnd() * 4.6)
  for (let i = 0; i < n; i++) {
    const [cat, sub, lo, hi, accs] = pick(expense)
    const amount = -round2(lo + rnd() * (hi - lo))
    const t = new Date(day); t.setHours(7 + Math.floor(rnd() * 15), Math.floor(rnd() * 60))
    push(fmt(t), '支出', amount, cat, sub, pick(accs), pick(remarks[sub] || ['日常']))
  }

  // 每月 1 号房租、10 号工资、20 号理财收益
  if (day.getDate() === 1) {
    const t = new Date(day); t.setHours(9, 30)
    push(fmt(t), '支出', -3200, '居家生活', '房租', '招行储蓄卡', '当月房租')
    const t2 = new Date(day); t2.setHours(10, 0)
    push(fmt(t2), '支出', -round2(80 + rnd() * 120), '居家生活', '水电', '支付宝', '水电燃气')
  }
  if (day.getDate() === 10) {
    const t = new Date(day); t.setHours(10, 12)
    push(fmt(t), '收入', 18000, '工资', '', '招行储蓄卡', '月薪')
  }
  if (day.getDate() === 20) {
    const t = new Date(day); t.setHours(20, 0)
    push(fmt(t), '收入', round2(20 + rnd() * 90), '理财收益', '', '余额宝', '余额宝收益')
  }
  // 每月两三笔大额
  if (day.getDate() === 15 && rnd() > 0.4) {
    const t = new Date(day); t.setHours(21, 20)
    push(fmt(t), '支出', -round2(199 + rnd() * 1500), '购物消费', '数码', '招行信用卡', pick(['耳机', '键盘', '显示器支架']))
  }
  if (day.getDate() === 8 && rnd() > 0.5) {
    const t = new Date(day); t.setHours(19, 40)
    push(fmt(t), '支出', -round2(100 + rnd() * 600), '人情', '', '微信钱包', '份子钱', '人情')
  }
}

const header = ['日期','收支类型','金额','类别','二级分类','账户','账本','退款','优惠','备注','标签',
  '报销账户','报销金额','报销明细','多币种','地址','创建用户','其他','附件1','附件2','附件3','附件4','附件5']

const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, '账单')
XLSX.writeFile(wb, 'public/demo-yimu.xlsx')

const income = rows.filter(r => r[1] === '收入').reduce((s, r) => s + r[2], 0)
const out = rows.filter(r => r[1] === '支出').reduce((s, r) => s + Math.abs(r[2]), 0)
console.log('生成行数:', rows.length)
console.log('收入合计:', income.toFixed(2), '支出合计:', out.toFixed(2))
console.log('账户:', [...new Set(rows.map(r => r[5]))].join(', '))
console.log('分类:', [...new Set(rows.map(r => r[3]))].join(', '))
console.log('文件:', 'public/demo-yimu.xlsx', (fs.statSync('public/demo-yimu.xlsx').size / 1024).toFixed(0) + ' KB')
