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
    // 显式指定了显示账本时，以它为准（一木的 showBook 语义）
    if (a.showBook?.length) {
      if (Number(bookId) === 0) return true
      if (!a.showBook.some((b) => String(b) === String(bookId))) return false
      return a.bookId != null || me == null || a.ownerId == null || Number(a.ownerId) === Number(me)
    }
    if (a.bookId == null) return me == null || a.ownerId == null || Number(a.ownerId) === Number(me)
    if (Number(bookId) === 0) return true          // 「全部账本」视图
    return sameBook(a.bookId, bookId)
  })
}

/** 私有账户被用在共享账本里会泄露账户名，记账前应拦截 */
export function leaksPrivateAccount(asset: Asset | undefined, bookId: string | number): boolean {
  if (!asset) return false
  if (asset.bookId != null) return false
  return Number(bookId) !== 0
}
