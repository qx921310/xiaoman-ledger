import type { Category } from '../types'
import { TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from '../taxonomy'

// A practical starting order, not a measurement of any individual user's habits.
const expenseOrder = ['食品餐饮', '购物消费', '出行交通', '居家生活', '休闲娱乐', '健康医疗', '送礼人情', '文化教育', '旅游度假', '其他']
const incomeOrder = ['工资', '奖金', '补贴', '兼职外快', '报销', '理财盈利', '二手闲置', '礼金人情', '借入', '中奖', '其他']
const childOrder: Record<number, string[]> = {
  1: ['买药', '医院', '滋补保健', '保险', '社保', '其他'],
  2: ['红包', '礼物', '孝敬长辈', '打赏', '借出', '其他'],
  3: ['书报杂志', '培训考试', '学费', '其他'],
  4: ['电费', '水费', '燃气费', '话费宽带', '房租', '物业费', '房贷', '家政清洁', '车位费', '发财树', '其他'],
  5: ['APP会员', '游戏', '电影唱歌', '运动健身', '棋牌桌游', '足浴按摩', '演出', '酒吧', '旅游度假', '其他'],
  6: ['公共交通', '打车', '加油', '停车费', 'ETC', '火车', '飞机', '保养修车', '酒店', '游玩门票', '其他'],
  7: ['早餐', '午餐', '晚餐', '下午茶', '饮料酒水', '生鲜食品', '蔬菜', '水果', '休闲零食', '夜宵', '粮油调味', '请客吃饭', '其他'],
  8: ['日常家居', '拼多多', '个护美妆', '服饰运动', '虚拟充值', '理发', '手机数码', '生活电器', '办公用品', '宠物用品', '母婴玩具', '配饰腕表', '装修装饰', '海运', '其他'],
  9: ['餐食', '酒店民宿', '门票', '打车', '地铁', '火车高铁', '机票', '购物', '酒水饮料', '按摩', '轮船', '祈愿还愿', '其他'],
  10: ['理财支出', '慈善捐助', '罚款赔偿', '其他'],
}

/** Sort one sibling group; old default weights are recognized without rewriting persisted data. */
export function sortCategories(categories: Category[]): Category[] {
  if (!categories.length) return []
  const first = categories[0]
  const builtins = first.parentId === 0 ? (first.kind === 'income' ? TAXONOMY_INCOME : TAXONOMY_PARENTS) : TAXONOMY_CHILDREN.filter(c => c.parentId === first.parentId)
  const original = new Map(builtins.map(c => [c.id, c]))
  const hasManualOrder = categories.some(c => {
    const base = original.get(c.id)
    return base && (c.positionWeight ?? 0) !== (base.positionWeight ?? 0)
  })
  if (hasManualOrder) return [...categories].sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0) || a.id - b.id)
  const order = first.parentId === 0 ? (first.kind === 'income' ? incomeOrder : expenseOrder) : (childOrder[first.parentId] ?? [])
  const rank = (c: Category) => {
    const base = original.get(c.id)
    const name = base?.name ?? c.name
    if (name === '其他') return Number.MAX_SAFE_INTEGER
    const index = base ? order.indexOf(name) : -1
    return index < 0 ? order.length : index
  }
  return [...categories].sort((a, b) => rank(a) - rank(b) || (a.positionWeight ?? 0) - (b.positionWeight ?? 0) || a.id - b.id)
}
