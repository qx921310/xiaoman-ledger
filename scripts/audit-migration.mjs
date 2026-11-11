#!/usr/bin/env node
/**
 * 历史数据审计与安全迁移。
 *
 * 用法：
 *   node scripts/audit-migration.mjs backup.json              # 只读扫描，输出报告
 *   node scripts/audit-migration.mjs backup.json --fix out.json  # 只修复可证明的项
 *
 * 原则：只修复「有确凿证据」的项；无法证明的一律标注 needsReview，绝不猜测。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [file, ...rest] = process.argv.slice(2)
if (!file) {
  console.error('用法: node scripts/audit-migration.mjs <backup.json> [--fix <out.json>]')
  process.exit(1)
}
const fixIdx = rest.indexOf('--fix')
const outFile = fixIdx >= 0 ? rest[fixIdx + 1] : null

const data = JSON.parse(readFileSync(file, 'utf8'))
const bills = data.bills ?? []
const cycles = data.cycles ?? []
const refunds = data.refunds ?? []
const reimb = data.reimbursements ?? []
const assets = data.assets ?? []

const report = {
  total: { bills: bills.length, cycles: cycles.length, refunds: refunds.length, reimbursements: reimb.length },
  missingBookOnBill: bills.filter((b) => b.bookId == null).length,
  missingBookOnRefund: refunds.filter((r) => r.bookId == null).length,
  missingBookOnReimbursement: reimb.filter((r) => r.bookId == null).length,
  cyclesWithoutId: cycles.filter((c) => c.cycleId == null).length,
  cyclesWithoutBook: cycles.filter((c) => c.bookId == null).length,
  duplicatePeriods: [],
  billsWithMissingAsset: [],
  billsWithMissingCategory: [],
  fixes: { refunds: 0, reimbursements: 0, cycles: 0 }
}

// 周期重复：同账本 + 同规则 + 同日
const groups = new Map()
for (const b of bills) {
  if (b.cycleId == null) continue
  const d = new Date(b.time)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const key = `${b.bookId ?? '?'}|${b.cycleId}|${day}`
  groups.set(key, [...(groups.get(key) ?? []), b.billId])
}
for (const [key, ids] of groups) if (ids.length > 1) report.duplicatePeriods.push({ key, ids })

// 引用完整性
const assetIds = new Set(assets.map((a) => a.assetId))
const catIds = new Set([...(data.parentCategories ?? []), ...(data.childCategories ?? [])].map((c) => c.id))
for (const b of bills) {
  if (!assetIds.has(b.assetId)) report.billsWithMissingAsset.push(b.billId)
  if (!catIds.has(b.parentCategoryId)) report.billsWithMissingCategory.push(b.billId)
}

// ---- 安全修复：只做「账单上已有账本」的继承 ----
const bookOf = new Map(bills.map((b) => [String(b.billId), b.bookId]))
for (const r of refunds) {
  if (r.bookId != null) continue
  const book = bookOf.get(String(r.billId))
  if (book != null) { r.bookId = book; report.fixes.refunds++ }
}
for (const r of reimb) {
  if (r.bookId != null) continue
  const book = bookOf.get(String(r.billId))
  if (book != null) { r.bookId = book; report.fixes.reimbursements++ }
}
// 周期规则：只有当它生成的账单全部指向同一账本时才回填
for (const c of cycles) {
  if (c.bookId != null) continue
  const books = new Set(bills.filter((b) => String(b.cycleId) === String(c.cycleId)).map((b) => b.bookId).filter((v) => v != null))
  if (books.size === 1) { c.bookId = [...books][0]; report.fixes.cycles++ }
}

console.log(JSON.stringify(report, null, 2))
if (report.duplicatePeriods.length) {
  console.error('\n⚠️  存在重复周期账单，需人工核对，未自动删除')
}
if (report.billsWithMissingAsset.length || report.billsWithMissingCategory.length) {
  console.error('⚠️  存在引用缺失的账单，需人工核对')
}
if (outFile) {
  writeFileSync(outFile, JSON.stringify(data, null, 2))
  console.error(`\n已写出修复后的备份: ${outFile}（修复 ${report.fixes.refunds} 退款 / ${report.fixes.reimbursements} 报销 / ${report.fixes.cycles} 周期）`)
}
