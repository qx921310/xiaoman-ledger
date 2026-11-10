import * as XLSX from 'xlsx'
import type { Asset, Bill, Category, Transfer } from './types'

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

/** 识别来源：一木导出 / 转账导出 / 通用 */
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
  duplicates: number
  skipped: { row: number; reason: string }[]
  income: number
  expense: number
}

interface BuildArgs {
  table: ParsedTable
  existingBills: Bill[]
  existingAssets: Asset[]
  parentCategories: Category[]
  childCategories: Category[]
  userId: number
  bookId: number
}

const num = (v: any) => {
  const n = Number(String(v).replace(/[¥,\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const str = (v: any) => String(v ?? '').trim()

/** 把表头映射成列索引；缺失返回 -1 */
function buildIndex(headers: string[]) {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (idx[h] === undefined) idx[h] = i
  })
  return (name: string) => (idx[name] !== undefined ? idx[name] : -1)
}

function parseTime(v: any): number {
  const s = str(v)
  if (!s) return NaN
  // YYYY-MM-DD HH:mm / YYYY/MM/DD HH:mm / 时间戳
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

/** 生成导入计划（不落库，先给用户看） */
export function buildImportPlan(args: BuildArgs): ImportPlan {
  const { table, existingBills, existingAssets, parentCategories, childCategories, userId, bookId } = args
  const format = detectFormat(table.headers)
  const col = buildIndex(table.headers)

  const parents = [...parentCategories]
  const children = [...childCategories]
  const assets = [...existingAssets]
  const newParents: Category[] = []
  const newChildren: Category[] = []
  const newAssets: Asset[] = []

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
    parents.push(cat)
    newParents.push(cat)
    return cat.id
  }

  const ensureChild = (name: string, parentId: number): number => {
    const n = str(name)
    if (!n) return 0
    const hit = children.find((c) => c.name === n && c.parentId === parentId)
    if (hit) return hit.id
    const cat: Category = { id: idFor(950000), name: n, parentId, kind: 'expense', color: '#cbd5e1', positionWeight: children.length }
    children.push(cat)
    newChildren.push(cat)
    return cat.id
  }

  const ensureAsset = (name: string): number => {
    const n = str(name) || '默认账户'
    const hit = assets.find((a) => a.assetName === n)
    if (hit) return hit.assetId
    const isCredit = /信用卡|花呗|白条/.test(n)
    const asset: Asset = {
      assetId: idFor(800000),
      assetName: n,
      assetType: isCredit ? 2 : 1,
      assetNumber: 0,
      groupName: isCredit ? '信用卡' : '导入',
      hide: false,
      intoTotalAsset: true,
      positionWeight: assets.length,
      remark: '',
      userId,
      updateTime: Date.now()
    }
    assets.push(asset)
    newAssets.push(asset)
    return asset.assetId
  }

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
    return { format, headers: table.headers, total: table.rows.length, bills, transfers, newParents, newChildren, newAssets, duplicates, skipped, income, expense }
  }

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
    // 收入正、支出负；也兼容"支出为正"的通用表格
    const isIncome = /收入|收/.test(typeText) && !/支出/.test(typeText)
      ? true
      : /支出|支/.test(typeText)
        ? false
        : amountRaw > 0

    const cost = Math.abs(amountRaw)
    const parentName = str(r[col('类别')] ?? r[col('分类')] ?? r[col('一级分类')] ?? r[col('大类')]) || (isIncome ? '其他收入' : '其他')
    const childName = str(r[col('二级分类')] ?? r[col('子分类')])
    const assetName = str(r[col('账户')] ?? r[col('支付账户')])
    const remark = str(r[col('备注')])
    const assetId = ensureAsset(assetName)
    const parentCategoryId = ensureParent(parentName, isIncome ? 'income' : 'expense')
    const childCategoryId = ensureChild(childName, parentCategoryId)

    const key = `${time}|${cost.toFixed(2)}|${assetId}|${remark}`
    if (seen.has(key)) {
      duplicates++
      return
    }
    seen.add(key)

    if (isIncome) income += cost
    else expense += cost

    bills.push({
      billId: time, // 秒级时间戳，下面统一校正冲突
      time,
      cost,
      parentCategoryId,
      childCategoryId,
      assetId,
      bookId,
      remark,
      billType: 3, // 导入记账
      tags: str(r[col('标签')]).split(/[,，;；\s]+/).filter(Boolean),
      files: [],
      userId,
      updateTime: Date.now(),
      billShareInfo: { parentCategoryName: parentName, childCategoryName: childName, assetName }
    })
  })

  // billId 冲突消解
  const used = new Set(existingBills.map((b) => b.billId))
  bills.sort((a, b) => a.time - b.time)
  bills.forEach((b) => {
    let id = Math.floor(b.time / 1000)
    while (used.has(id)) id++
    b.billId = id
    used.add(id)
  })

  return { format, headers: table.headers, total: table.rows.length, bills, transfers, newParents, newChildren, newAssets, duplicates, skipped, income, expense }
}

/** 导出成与原产品同构的 xlsx（可再被打回） */
export function exportXlsx(bills: Bill[], parents: Category[], children: Category[], assets: Asset[]) {
  const header = ['日期', '收支类型', '金额', '类别', '二级分类', '账户', '账本', '备注', '标签', '不计入收支']
  const rows = bills.map((b) => {
    const p = parents.find((x) => x.id === b.parentCategoryId)
    const c = children.find((x) => x.id === b.childCategoryId)
    const a = assets.find((x) => x.assetId === b.assetId)
    const isIncome = p?.kind === 'income'
    return [
      fmtTime(b.time),
      isIncome ? '收入' : '支出',
      isIncome ? b.cost : -Math.abs(b.cost),
      p?.name ?? '',
      c?.name ?? '',
      a?.assetName ?? '',
      '日常账本',
      b.remark,
      (b.tags || []).join(','),
      ''
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '账单')
  XLSX.writeFile(wb, `青账导出_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

function fmtTime(t: number) {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
