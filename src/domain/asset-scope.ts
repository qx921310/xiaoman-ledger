import type { Asset } from '../types'

const sameBook = (a: string | number | undefined, b: string | number) =>
  a != null && String(a) === String(b)

/**
 * 当前场景下可见的账户：
 * - 私有账户：只有创建者本人可见（财务隐私）
 * - 共享账户：归属当前账本时，全体成员可见
 */
export function visibleAssets(assets: Asset[], bookId: string | number, me?: number): Asset[] {
  return assets.filter((a) => {
    // 显式设置了 showBook（含空数组=全部隐藏）时以它为准（一木的 showBook 语义）
    if (Array.isArray(a.showBook)) {
      if (Number(bookId) === 0) return true
      if (!a.showBook.some((b) => String(b) === String(bookId))) return false
      return a.bookId != null || me == null || a.ownerId == null || Number(a.ownerId) === Number(me)
    }
    if (a.bookId == null) return me == null || a.ownerId == null || Number(a.ownerId) === Number(me)
    if (Number(bookId) === 0) return true          // 「全部账本」视图
    return sameBook(a.bookId, bookId)
  })
}

/**
 * 私有账户被用在「多人账本」里会泄露账户名。
 * 只有当前账本存在其他成员时才算泄露；单人账本不拦（Codex 指出的误拦截）。
 */
export function leaksPrivateAccount(
  asset: Asset | undefined,
  bookId: string | number,
  books: Array<{ bookId?: string | number; memberCount?: number; members?: unknown[] }> = [],
  me?: number
): boolean {
  if (!asset) return false
  if (asset.bookId != null) return false
  if (Number(bookId) === 0) return false
  const book = books.find((b) => b.bookId != null && String(b.bookId) === String(bookId))
  if (!book) return false
  // 优先用成员数；没有成员数信息时按「有归属账本即为共享」保守判断
  const count = book.memberCount ?? (Array.isArray(book.members) ? book.members.length : undefined)
  if (count != null) return count > 1
  return true
}
