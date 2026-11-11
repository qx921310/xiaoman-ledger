/**
 * 记录身份（A1）：全局唯一的一套作用域规则。
 *
 * 同步合并、墓碑删除、改号回填都必须走这里，
 * 不允许再出现「一处按属主、一处只按编号」的分裂。
 */

export type ScopeKind = 'user' | 'book'

/** 每类记录的身份作用域：共享账本里的数据按账本，个人数据按账号 */
export const KIND_SCOPE: Record<string, ScopeKind> = {
  bill: 'book', transfer: 'book', lend: 'book', refund: 'book', reimbursement: 'book', cycle: 'book',
  asset: 'user', tag: 'user', budget: 'user', parent: 'user', child: 'user', book: 'user'
}

/** 这些类型没有「属主」概念，写入时不要带 ownerId */
export const OWNERLESS = new Set(['tag', 'budget', 'parent', 'child', 'book'])

type Rec = Record<string, unknown>

/** 记录的作用域标识；无法判定时返回 null（调用方必须保守处理） */
export function scopeOf(kind: string, rec: Rec | null | undefined): string | null {
  if (!rec) return null
  const kindScope = KIND_SCOPE[kind] ?? 'user'
  if (kindScope === 'book') {
    const bookId = rec.bookId
    return bookId == null || bookId === '' ? null : `book:${String(bookId)}`
  }
  const owner = rec.ownerId ?? rec.userId
  return owner == null ? null : `user:${String(owner)}`
}

/**
 * 身份比对三态：
 * - true    同一身份，可以覆盖/删除
 * - false   不同身份，必须并存
 * - 'unknown' 作用域缺失（历史数据），**不做破坏性操作**
 */
export function sameIdentity(kind: string, a: Rec | null | undefined, b: Rec | null | undefined): boolean | 'unknown' {
  // 无属主语义的类型（标签/预算/分类/账本）只有业务 ID，天然同一作用域
  if (OWNERLESS.has(kind)) return true
  const sa = scopeOf(kind, a)
  const sb = scopeOf(kind, b)
  if (sa == null || sb == null) return 'unknown'
  return sa === sb
}

/** 墓碑与记录的比对：墓碑只有 id + ownerId/bookId，没有 payload */
export function tombstoneMatches(kind: string, tomb: Rec, record: Rec): boolean {
  const verdict = sameIdentity(kind, tomb, record)
  // 判定不了作用域时一律不删：宁可留重复，不可丢数据
  return verdict === true
}
