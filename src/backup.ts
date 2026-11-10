/** Validate before touching the live store; v1 backups predate settings snapshots. */
export function validateBackup(input: unknown): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('不是有效的备份对象')
  const data = input as Record<string, any>
  if (data.version !== 1 && data.version !== 2) throw new Error('不支持的备份版本')
  const collections = ['accountBooks', 'assets', 'bills', 'transfers', 'budgets', 'reimbursements', 'refunds', 'lends', 'cycles', 'parentCategories', 'childCategories']
  if (data.version === 2) collections.push('tags', 'currencies', 'tombstones')
  for (const key of collections) {
    if (!Array.isArray(data[key]) || data[key].some((item: unknown) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error(`备份中的 ${key} 格式不正确`)
    }
  }
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  const id = (value: unknown) => (typeof value === 'string' && value.length > 0) || finite(value)
  const invalid = (key: string, predicate: (value: any) => boolean) => {
    if (data[key].some((item: any) => !predicate(item))) throw new Error(`备份中的 ${key} 记录不完整`)
  }
  invalid('assets', (a) => finite(a.assetId) && finite(a.assetNumber) && (a.openingBalance == null || finite(a.openingBalance)))
  invalid('bills', (b) => id(b.billId) && finite(b.cost) && b.cost >= 0 && finite(b.assetId) && finite(b.parentCategoryId) && finite(b.time) &&
    (b.accountAmount == null || finite(b.accountAmount)) && (b.tags == null || Array.isArray(b.tags)) && (b.files == null || Array.isArray(b.files)))
  invalid('transfers', (t) => id(t.transferId) && finite(t.fromAssetId) && finite(t.toAssetId) && finite(t.cost) &&
    (t.toCost == null || finite(t.toCost)) && (t.serviceCharge == null || finite(t.serviceCharge)))
  invalid('lends', (l) => id(l.lendId) && finite(l.assetId) && finite(l.number))
  invalid('refunds', (r) => id(r.refundId) && id(r.billId) && finite(r.number) && (r.baseAmount == null || finite(r.baseAmount)))
  invalid('reimbursements', (r) => id(r.reimbursementId) && id(r.billId) && finite(r.assetId) && finite(r.number))
  invalid('accountBooks', (b) => finite(b.accountBookId) && typeof b.accountBookName === 'string')
  invalid('budgets', (b) => typeof b.month === 'string' && finite(b.categoryId) && finite(b.amount))
  invalid('cycles', (c) => id(c.cycleId) && finite(c.assetId) && finite(c.cost) && (c.generated == null || Array.isArray(c.generated)))
  invalid('parentCategories', (c) => finite(c.id))
  invalid('childCategories', (c) => finite(c.id))
  if (data.version === 2) {
    invalid('tags', (t) => id(t.tagId) && typeof t.name === 'string')
    invalid('currencies', (c) => typeof c.code === 'string' && c.code.length > 0 && finite(c.rate) && c.rate > 0)
    invalid('tombstones', (t) => typeof t.kind === 'string' && id(t.id) && finite(t.updatedAt))
    if (typeof data.defaultCurrency !== 'string' || !data.currencies.some((c: any) => c.code === data.defaultCurrency)) {
      throw new Error('备份中的默认币种不存在')
    }
    if (data.currentBookId != null && !id(data.currentBookId)) throw new Error('备份中的当前账本格式不正确')
  }
  return data
}
