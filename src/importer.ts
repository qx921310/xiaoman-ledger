import * as XLSX from 'xlsx'
import type { AccountBook, Asset, Bill, Category, Refund, Reimbursement, Transfer } from './types'
import { newBillIdentity } from './identity'

export interface ParsedTable {
  headers: string[]
  rows: any[][]
  sheetName: string
}

export type SourceFormat = 'yimu' | 'transfer' | 'generic' | 'unknown'

/** 解析 xlsx / xls / csv（自动识别 UTF-8 与 GBK） */
export function parseLedgerFile(buf: ArrayBuffer, fileName: string): ParsedTable {
  const isCsv = /\.csv$/i.test(fileName)
  let wb: XLSX.WorkBook

  if (isCsv) {
    const bytes = new Uint8Array(buf)
    const utf8 = hasBom(bytes) || isUtf8(bytes)
    const text = new TextDecoder(utf8 ? 'utf-8' : 'gbk').decode(bytes)
    wb = XLSX.read(text, { type: 'string' })
  } else {
    wb = XLSX.read(buf, { type: 'array' })
  }

  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('文件里没有可读的工作表')
  const sheet = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false })
  const headerIdx = aoa.findIndex((r) => Array.isArray(r) && r.some((c) => String(c).trim()))
  const rawHeaders = (aoa[headerIdx] || []) as any[]
  const headers = rawHeaders.map((h) => String(h ?? '').trim())
  const rows = aoa
    .slice(headerIdx + 1)
    .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
    .map((r) => headers.map((_, i) => r[i] ?? ''))
  return { headers, rows, sheetName }
}

function hasBom(b: Uint8Array) {
  return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf
}

function isUtf8(b: Uint8Array) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b)
    return true
  } catch {
    return false
  }
}

export function detectFormat(headers: string[]): SourceFormat {
  const has = (k: string) => headers.includes(k)
  if (has('日期') && has('收支类型') && has('金额') && (has('类别') || has('分类'))) return 'yimu'
  if (has('转出账户') && has('转入账户') && has('金额')) return 'transfer'
  if ((has('时间') || has('日期')) && has('金额')) return 'generic'
  return 'unknown'
}

export interface ImportPlan {
  format: SourceFormat
  headers: string[]
  total: number
  bills: Bill[]
  transfers: Transfer[]
  newParents: Category[]
  newChildren: Category[]
  newAssets: Asset[]
  newBooks: AccountBook[]
  reimbursements: Reimbursement[]
  refunds: Refund[]
  duplicates: number
  skipped: { row: number; reason: string }[]
  income: number
  expense: number
  /** 各列的填充情况，用于告诉用户哪些字段真的带过来了 */
  columnCoverage: { column: string; filled: number }[]
}

interface BuildArgs {
  table: ParsedTable
  existingBills: Bill[]
  existingAssets: Asset[]
  existingBooks: AccountBook[]
  parentCategories: Category[]
  childCategories: Category[]
  userId: number
  bookId: number
}

const num = (v: any) => {
  const n = Number(String(v).replace(/[¥$€,，\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const str = (v: any) => String(v ?? '').trim()

function buildIndex(headers: string[]) {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (h && idx[h] === undefined) idx[h] = i
  })
  return (name: string) => (idx[name] !== undefined ? idx[name] : -1)
}

function parseTime(v: any): number {
  const s = str(v)
  if (!s) return NaN
  if (/^\d{10,13}$/.test(s)) return Number(s.length === 10 ? s + '000' : s)
  const m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日]?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    return new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)
    ).getTime()
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? NaN : t
}

export function buildImportPlan(args: BuildArgs): ImportPlan {
  const { table, existingBills, existingAssets, existingBooks, parentCategories, childCategories, userId, bookId } = args
  const format = detectFormat(table.headers)
  const col = buildIndex(table.headers)

  const parents = [...parentCategories]
  const children = [...childCategories]
  const assets = [...existingAssets]
  const books = [...existingBooks]
  const newParents: Category[] = []
  const newChildren: Category[] = []
  const newAssets: Asset[] = []
  const newBooks: AccountBook[] = []
  const reimbursements: Reimbursement[] = []
  const refunds: Refund[] = []

  const seen = new Set(existingBills.map((b) => `${b.time}|${b.cost.toFixed(2)}|${b.assetId}|${b.remark}`))
  const bills: Bill[] = []
  const transfers: Transfer[] = []
  const skipped: { row: number; reason: string }[] = []
  let duplicates = 0
  let income = 0
  let expense = 0
  let seq = 0
  const idFor = (base: number) => base + (seq++)

  const ensureParent = (name: string, kind: 'expense' | 'income'): number => {
    const n = str(name) || '未分类'
    const hit = parents.find((p) => p.name === n && p.kind === kind)
    if (hit) return hit.id
    const cat: Category = { id: idFor(900000), name: n, parentId: 0, kind, color: '#94a3b8', positionWeight: parents.length }
    parents.push(cat); newParents.push(cat)
    return cat.id
  }

  const ensureChild = (name: string, parentId: number): number => {
    const n = str(name)
    if (!n) return 0
    const hit = children.find((c) => c.name === n && c.parentId === parentId)
    if (hit) return hit.id
    const cat: Category = { id: idFor(950000), name: n, parentId, kind: 'expense', color: '#cbd5e1', positionWeight: children.length }
    children.push(cat); newChildren.push(cat)
    return cat.id
  }

  const ensureAsset = (name: string, currency?: string): number => {
    const n = str(name) || '默认账户'
    const hit = assets.find((a) => a.assetName === n)
    if (hit) return hit.assetId
    const isCredit = /信用卡|花呗|白条/.test(n)
    const asset: Asset = {
      assetId: idFor(800000), assetName: n, assetType: isCredit ? 2 : 1, assetNumber: 0,
      currency: currency || undefined, groupName: isCredit ? '信用卡' : '导入', hide: false, intoTotalAsset: true,
      positionWeight: assets.length, remark: '', userId, updateTime: Date.now()
    }
    assets.push(asset); newAssets.push(asset)
    return asset.assetId
  }

  const ensureBook = (name: string): number => {
    const n = str(name) || '日常账本'
    const hit = books.find((b) => b.accountBookName === n)
    if (hit) return hit.accountBookId
    const book: AccountBook = { accountBookId: idFor(700000), accountBookName: n, userId, createTime: Date.now() }
    books.push(book); newBooks.push(book)
    return book.accountBookId
  }

  // 列填充率：让用户看到哪些字段真的带过来了
  const coverageCols = ['日期', '收支类型', '金额', '类别', '二级分类', '账户', '账本', '退款', '优惠',
    '备注', '标签', '报销账户', '报销金额', '报销明细', '多币种', '地址', '创建用户', '其他', '附件1']
  const columnCoverage = coverageCols
    .filter((c) => col(c) >= 0)
    .map((c) => ({ column: c, filled: table.rows.filter((r) => str(r[col(c)]) !== '').length }))
    .filter((x) => x.filled > 0)

  if (format === 'transfer') {
    table.rows.forEach((r, i) => {
      const time = parseTime(r[col('日期')] ?? r[col('时间')])
      const cost = num(r[col('金额')])
      if (!time || !cost) {
        skipped.push({ row: i + 2, reason: '日期或金额无法解析' })
        return
      }
      transfers.push({
        transferId: Date.now() + i,
        fromAssetId: ensureAsset(str(r[col('转出账户')])),
        toAssetId: ensureAsset(str(r[col('转入账户')])),
        cost: Math.abs(cost),
        serviceCharge: Math.abs(num(r[col('手续费')])),
        billId: 0,
        time,
        remark: str(r[col('备注')]),
        tags: [],
        userId,
        updateTime: Date.now()
      })
    })
    return {
      format, headers: table.headers, total: table.rows.length, bills, transfers,
      newParents, newChildren, newAssets, newBooks, reimbursements, refunds,
      duplicates, skipped, income, expense, columnCoverage
    }
  }

  // 记录「行号 → 账单」用于回填报销/退款的 billId
  const pendings: { bill: Bill; reimb?: { assetName: string; amount: number; detail: string }; refund?: { amount: number; assetId?: number; currency?: string; baseAmount?: number } }[] = []

  table.rows.forEach((r, i) => {
    const dateRaw = r[col('日期')] ?? r[col('时间')] ?? r[col('日期时间')]
    const time = parseTime(dateRaw)
    if (!time) {
      skipped.push({ row: i + 2, reason: '日期无法解析：' + str(dateRaw) })
      return
    }

    const typeText = str(r[col('收支类型')] ?? r[col('收/支')] ?? r[col('类型')] ?? r[col('收支')])
    const amountRaw = num(r[col('金额')])
    if (!amountRaw) {
      skipped.push({ row: i + 2, reason: '金额为空或为 0' })
      return
    }
    const isIncome = /收入/.test(typeText) ? true : /支出/.test(typeText) ? false : amountRaw > 0
    const cost = Math.abs(amountRaw)

    // The extra columns are written only by this app. Legacy external files
    // keep their original refund semantics instead of guessing gross/net.
    const accountName = str(r[col('账户')] ?? r[col('支付账户')]) || '默认账户'
    const accountCurrency = str(r[col('小满账户币种')])
    const accountAmountText = str(r[col('小满账户金额')])
    const refundAccountName = str(r[col('小满退款账户')])
    const refundCurrency = str(r[col('小满退款币种')])
    const refundAmountText = str(r[col('小满退款到账金额')])
    const refundBaseText = str(r[col('小满退款本币金额')])
    const refundMetadata = !!(refundAccountName || refundCurrency || refundAmountText || refundBaseText)
    const validAmount = (text: string) => text !== '' && Number.isFinite(Number(text)) && Number(text) > 0
    if ((accountAmountText && (!accountCurrency || !validAmount(accountAmountText))) ||
        (accountCurrency && !/^[A-Z]{3}$/.test(accountCurrency)) ||
        (refundMetadata && (!refundAccountName || !refundCurrency || !validAmount(refundAmountText) ||
          !/^[A-Z]{3}$/.test(refundCurrency) ||
          (refundBaseText && (!validAmount(refundBaseText) || Number(refundBaseText) > cost || Number(refundBaseText) !== Math.abs(num(r[col('退款')]))))))) {
      skipped.push({ row: i + 2, reason: '账户或退款扩展字段不完整或金额无效' })
      return
    }
    const requestedAccounts = [[accountName, accountCurrency], [refundAccountName, refundCurrency]].filter(([name, currency]) => name && currency)
    const conflictingAccounts = requestedAccounts.some(([name, currency]) => {
      const matches = assets.filter((a) => a.assetName === name)
      return matches.length > 1 || matches.some((a) => (a.currency || 'CNY') !== currency)
    }) || (accountName === refundAccountName && !!accountCurrency && !!refundCurrency && accountCurrency !== refundCurrency)
    if (conflictingAccounts) {
      skipped.push({ row: i + 2, reason: '同名账户的币种不一致或账户名不唯一，请先核对账户' })
      return
    }

    const parentName = str(r[col('类别')] ?? r[col('分类')] ?? r[col('一级分类')] ?? r[col('大类')]) || (isIncome ? '其他收入' : '其他')
    const childName = str(r[col('二级分类')] ?? r[col('子分类')])
    const assetId = ensureAsset(accountName, accountCurrency)
    const parentCategoryId = ensureParent(parentName, isIncome ? 'income' : 'expense')
    const childCategoryId = ensureChild(childName, parentCategoryId)
    const remark = str(r[col('备注')])
    const bookIdOfRow = col('账本') >= 0 ? ensureBook(str(r[col('账本')])) : bookId

    const key = `${time}|${cost.toFixed(2)}|${assetId}|${remark}`
    if (seen.has(key)) { duplicates++; return }
    seen.add(key)

    if (isIncome) income += cost
    else expense += cost - (refundBaseText ? Number(refundBaseText) : 0)

    // 「其他」列写成 "不计入收支、不计入预算" 这类文本
    const otherText = str(r[col('其他')])
    const attachmentUrls = [1, 2, 3, 4, 5]
      .map((n) => str(r[col(`附件${n}`)]))
      .filter(Boolean)

    const bill: Bill = {
      billId: time,
      time,
      cost,
      parentCategoryId,
      childCategoryId,
      assetId,
      bookId: bookIdOfRow,
      remark,
      billType: 3,
      tags: str(r[col('标签')]).split(/[,，;；\s]+/).filter(Boolean),
      files: attachmentUrls.map((u, idx) => ({ name: `附件${idx + 1}`, remotePath: u })),
      userId,
      updateTime: Date.now(),
      billShareInfo: { parentCategoryName: parentName, childCategoryName: childName, assetName: assets.find((a) => a.assetId === assetId)?.assetName ?? '' },
      notIntoTotal: /不计入收支/.test(otherText),
      notIntoBudget: /不计入预算/.test(otherText),
      discountNumber: Math.abs(num(r[col('优惠')])),
      refundNum: Math.abs(num(r[col('退款')])),
      currencyInfo: str(r[col('多币种')]),
      accountAmount: accountAmountText ? Number(accountAmountText) : undefined,
      accountCurrency: accountAmountText ? accountCurrency : undefined,
      poiAddress: str(r[col('地址')]),
      totalAddress: str(r[col('完整地址')]) || undefined,
      recordTime: time,
      fromUserId: num(r[col('创建用户')]) || 0
    }
    bills.push(bill)

    const reimbAcc = str(r[col('报销账户')])
    const reimbAmt = Math.abs(num(r[col('报销金额')]))
    const reimbDetail = str(r[col('报销明细')])
    const refundAmt = Math.abs(num(r[col('退款')]))
    pendings.push({
      bill,
      reimb: (reimbAcc || reimbAmt > 0) ? { assetName: reimbAcc, amount: reimbAmt, detail: reimbDetail } : undefined,
      refund: refundMetadata ? { amount: Number(refundAmountText), assetId: ensureAsset(refundAccountName, refundCurrency), currency: refundCurrency, baseAmount: refundBaseText ? Number(refundBaseText) : undefined }
        : refundAmt > 0 ? { amount: refundAmt } : undefined
    })
  })

  // billId 冲突消解
  const used = new Set(existingBills.map((b) => b.billId))
  bills.sort((a, b) => a.time - b.time)
  bills.forEach((b) => {
    let identity = newBillIdentity()
    while (used.has(identity.billId)) identity = newBillIdentity()
    b.billId = identity.billId
    b.syncId = identity.syncId
    used.add(identity.billId)
  })

  // 报销 / 退款挂到最终 billId 上
  let rseq = 0
  pendings.forEach((p) => {
    if (p.reimb) {
      reimbursements.push({
        reimbursementId: Date.now() + (rseq++),
        billId: p.bill.billId,
        assetId: p.reimb.assetName ? ensureAsset(p.reimb.assetName) : 0,
        number: p.reimb.amount,
        detail: p.reimb.detail,
        // 导入的报销视为「已登记待确认」，用户核对后可点到账
        status: 'pending',
        userId,
        updateTime: Date.now()
      })
    }
    if (p.refund) {
      refunds.push({
        refundId: Date.now() + (rseq++),
        billId: p.bill.billId,
        number: p.refund.amount,
        assetId: p.refund.assetId,
        currency: p.refund.currency,
        baseAmount: p.refund.baseAmount,
        userId,
        updateTime: Date.now()
      })
    }
  })

  return {
    format, headers: table.headers, total: table.rows.length, bills, transfers,
    newParents, newChildren, newAssets, newBooks, reimbursements, refunds,
    duplicates, skipped, income, expense, columnCoverage
  }
}

/** 标准列可供其他工具使用，小满扩展列用于本应用的退款往返。 */
export function buildExportTable(
  bills: Bill[], parents: Category[], children: Category[], assets: Asset[],
  books: AccountBook[] = [], reimbursements: Reimbursement[] = [], refunds: Refund[] = []
) {
  const header = ['日期', '收支类型', '金额', '类别', '二级分类', '账户', '账本', '退款', '优惠', '备注', '标签',
    '报销账户', '报销金额', '报销明细', '多币种', '地址', '创建用户', '其他', '附件1', '附件2', '附件3', '附件4', '附件5',
    '小满账户币种', '小满账户金额', '小满退款账户', '小满退款币种', '小满退款到账金额', '小满退款本币金额']
  const rows = bills.map((b) => {
    const p = parents.find((x) => x.id === b.parentCategoryId)
    const c = children.find((x) => x.id === b.childCategoryId)
    const a = assets.find((x) => x.assetId === b.assetId)
    const bk = books.find((x) => x.accountBookId === b.bookId)
    const reimb = reimbursements.find((x) => x.billId === b.billId)
    const billRefunds = refunds.filter((x) => x.billId === b.billId)
    if (billRefunds.length > 1) throw new Error('一笔账单有多条退款，Excel 暂不支持完整导出，请使用 JSON 备份')
    const refund = billRefunds[0]
    const refundAsset = refund?.assetId != null ? assets.find((x) => x.assetId === refund.assetId) : undefined
    if ((b.accountAmount != null && (!a || !b.accountCurrency || (a.currency ?? 'CNY') !== b.accountCurrency)) ||
        (refund?.assetId != null && (!refundAsset || !refund.currency || (refundAsset.currency ?? 'CNY') !== refund.currency)) ||
        (refund?.baseAmount != null && (!refundAsset || refund.baseAmount !== b.refundNum || refund.baseAmount > b.cost))) {
      throw new Error('账单或退款账户缺失、币种不一致，无法安全导出；请先核对账户或使用 JSON 备份')
    }
    if ([a, refundAsset].some((account) => account && assets.filter((x) => x.assetName === account.assetName).length > 1)) {
      throw new Error('存在同名账户，无法安全匹配表格中的账户；请重命名后导出或使用 JSON 备份')
    }
    const isIncome = p?.kind === 'income'
    const flags = [b.notIntoTotal ? '不计入收支' : '', b.notIntoBudget ? '不计入预算' : ''].filter(Boolean).join('、')
    const files = (b.files || []).slice(0, 5).map((f: any) => f?.remotePath ?? '')
    while (files.length < 5) files.push('')
    return [
      fmtTime(b.time),
      isIncome ? '收入' : '支出',
      isIncome ? b.cost : -Math.abs(b.cost),
      p?.name ?? '',
      c?.name ?? '',
      a?.assetName ?? '',
      bk?.accountBookName ?? '日常账本',
      b.refundNum ?? 0,
      b.discountNumber ?? 0,
      b.remark,
      (b.tags || []).join(','),
      reimb ? (assets.find((x) => x.assetId === reimb.assetId)?.assetName ?? '') : '',
      reimb ? reimb.number : '',
      reimb ? reimb.detail : '',
      b.currencyInfo ?? '',
      b.poiAddress ?? '',
      b.fromUserId || '',
      flags,
      ...files,
      a?.currency ?? 'CNY',
      b.accountAmount ?? '',
      refundAsset?.assetName ?? '',
      refundAsset ? refund?.currency ?? '' : '',
      refundAsset ? refund?.number ?? '' : '',
      refundAsset ? refund?.baseAmount ?? '' : ''
    ]
  })
  return { headers: header, rows, sheetName: '账单' }
}

export function exportXlsx(
  bills: Bill[], parents: Category[], children: Category[], assets: Asset[],
  books: AccountBook[] = [], reimbursements: Reimbursement[] = [], refunds: Refund[] = []
) {
  const { headers, rows } = buildExportTable(bills, parents, children, assets, books, reimbursements, refunds)
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '账单')
  XLSX.writeFile(wb, `小满记账导出_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function fmtTime(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
