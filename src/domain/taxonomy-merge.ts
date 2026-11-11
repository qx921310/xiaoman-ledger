import { childCategoryNeedsReview, TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from '../taxonomy'
import type { Bill, Category, Currency } from '../types'

export interface TaxonomyMergeState {
  currencies: Currency[]
  parentCategories: Category[]
  childCategories: Category[]
  bills: Bill[]
}

export interface TaxonomyMergeResult {
  parentCategories?: Category[]
  childCategories?: Category[]
  bills?: Bill[]
  currencies?: Currency[]
}

/**
 * 补齐内置分类、清理脏数据、同名去重、账单分类引用重映射、汇率自修复。
 * 纯函数：不读写 store，返回需要写回的部分状态。
 */
export function mergeTaxonomyState(s: TaxonomyMergeState): TaxonomyMergeResult {

// 汇率自修复：任何非正汇率都恢复为默认值（0 会导致外币按 1:1 记账）
const DEFAULT_RATE: Record<string, number> = { CNY: 1, USD: 7.2, EUR: 7.8, JPY: 0.048, HKD: 0.92 }
const currencies = (s.currencies ?? []).map((c) =>
  !c.rate || c.rate <= 0 ? { ...c, rate: DEFAULT_RATE[c.code] ?? 1 } : c)
const key = (c: Category) => `${c.parentId}|${c.name}|${c.kind}`
const haveP = new Set(s.parentCategories.map(key))
const haveC = new Set(s.childCategories.map(key))
const addP = [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME].filter((c) => !haveP.has(key(c)))
const addC = TAXONOMY_CHILDREN.filter((c) => !haveC.has(key(c)))

// name+kind → 内置定义，用于修正图标/配色
const byName = new Map<string, Category>()
for (const c of [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME, ...TAXONOMY_CHILDREN]) {
  byName.set(`${c.name}|${c.kind}`, c)
}
// 老名字 → 新名字（同一分类改名时避免被当成两个）
const RENAMED: Record<string, string> = { '房租还贷': '房贷' }
const fix = (c: Category): Category => {
  // 旧数据/云端记录可能缺 kind，按 id 段推断，避免同名分类被当成两个
  if (!c.kind) c = { ...c, kind: c.parentId ? 'expense' : c.id >= 900 ? 'income' : 'expense' }
  const renamed = RENAMED[c.name]
  if (renamed) c = { ...c, name: renamed }
  if (c.icon?.startsWith('ic_')) return c
  const t = byName.get(`${c.name}|${c.kind}`)
  return t ? { ...c, icon: t.icon, color: t.color, bg: t.bg } : c
}
let parents = s.parentCategories.map(fix)
let children = s.childCategories.map(fix)

// 一次性清理：早期测试造出来的分类，若没有任何账单引用就删掉
const JUNK = new Set(['通讯', '人情', '外卖', '三餐', '零食饮料', '药品'])
const used = new Set<number>()
for (const b of s.bills) {
  used.add(b.parentCategoryId)
  if (b.childCategoryId) used.add(b.childCategoryId)
}
children = children.filter((c) => !JUNK.has(c.name) || used.has(c.id))
parents = parents.filter((c) => !JUNK.has(c.name) || used.has(c.id))

// 这 3 个原先被错放进「收入」，实际属于「支出 > 其他」
const INCOME_MISPLACED = new Set(['慈善捐助', '理财支出', '罚款赔偿'])
parents = parents.filter((c) => !(c.kind === 'income' && INCOME_MISPLACED.has(c.name) && !used.has(c.id)))

const ratesFixed = currencies.some((c, i) => c !== (s.currencies ?? [])[i])
// ---- 去重：同名分类只保留一个（优先保留内置 id，其次最小的）----
const canonical = new Map<string, number>()
for (const c of [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME]) canonical.set(`${c.name}|${c.kind}`, c.id)
for (const c of TAXONOMY_CHILDREN) canonical.set(`${c.parentId}|${c.name}|child`, c.id)

const keepP = new Map<string, Category>()
for (const c of parents) {
  const k = `${c.name}|${c.kind}`
  const prev = keepP.get(k)
  if (!prev) { keepP.set(k, c); continue }
  const want = canonical.get(`${c.name}|${c.kind}`)
  // 若当前这个是内置 id 而已有的不是，则替换
  if (want != null && c.id === want && prev.id !== want) keepP.set(k, c)
}
// 父 id → 父名（去重后的保留项）
const parentNameOf = (id: number) => [...keepP.values()].find((p) => p.id === id)?.name ?? String(id)
const keepC = new Map<string, Category>()
for (const c of children) {
  const k = `${parentNameOf(c.parentId)}|${c.name}`
  const prev = keepC.get(k)
  if (!prev) { keepC.set(k, c); continue }
  const want = canonical.get(`${c.parentId}|${c.name}|child`)
  if (want != null && c.id === want && prev.id !== want) keepC.set(k, c)
}
const remapP = new Map<number, number>()
for (const c of parents) {
  const keep = keepP.get(`${c.name}|${c.kind}`)
  if (keep && keep.id !== c.id) remapP.set(c.id, keep.id)
}
const remapC = new Map<number, number>()
for (const c of children) {
  const keep = keepC.get(`${parentNameOf(c.parentId)}|${c.name}`)
  if (keep && keep.id !== c.id) remapC.set(c.id, keep.id)
}
parents = [...keepP.values()]
children = [...keepC.values()]
const bills = (remapP.size || remapC.size)
  ? s.bills.map((b) => {
    const p2 = remapP.get(b.parentCategoryId)
    const c2 = childCategoryNeedsReview(b) ? undefined : remapC.get(b.childCategoryId)
    return p2 == null && c2 == null ? b : { ...b, parentCategoryId: p2 ?? b.parentCategoryId, childCategoryId: c2 ?? b.childCategoryId }
  })
  : s.bills

if (!addP.length && !addC.length) {
  const changed =
    parents.length !== s.parentCategories.length
    || children.length !== s.childCategories.length
    || parents.some((c, i) => c !== s.parentCategories[i])
    || children.some((c, i) => c !== s.childCategories[i])
  if (!changed && !ratesFixed) return {}
  return { parentCategories: parents, childCategories: children, bills, ...(ratesFixed ? { currencies } : {}) }
}
return {
  parentCategories: [...parents, ...addP],
  childCategories: [...children, ...addC],
  bills,
  ...(ratesFixed ? { currencies } : {})
}
}
