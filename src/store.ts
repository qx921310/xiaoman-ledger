import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category, Currency, Cycle, Lend, Refund, Reimbursement, SyncIncoming, Tag, Transfer } from './types'
import type { ImportPlan } from './importer'
import { normalizeBuiltInChild, resolveBillChild, TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from './taxonomy'
import { getCurrentUid, userStorage } from './auth'
import { deriveAssets } from './balances'
import { newBillIdentity } from './identity'
import { markDirty } from './domain/dirty-bus'
import { announceWrite } from './multi-tab'
import { lendRemaining } from './lend'
import { mergeRemote, type MergeableState } from './domain/sync-merge'
import { planCycles } from './domain/cycles'
import { dedupeCycleBills as dedupeBills } from './domain/cycle-dedupe'
import { mergeTaxonomyState } from './domain/taxonomy-merge'
import { serializeShares, splitAmounts } from './domain/split'
import { planInstalment } from './domain/loan'
import { applyBuyWithLot, applySellByMethod } from './domain/stock'
import { fromBase, toBase } from './money'
import { validateBackup } from './backup'
import { addRefundChanges, deleteRefundChanges } from './refund-operations'
import { DEFAULT_TAG_COLOR } from './default-colors'

const NOW = () => Date.now()

export interface Budget {
  /** 'YYYY-MM'，或 'all' 表示默认生效 */
  month: string
  /** 0 = 总预算 */
  categoryId: number
  /** 基础额度 */
  amount: number
  /** 修改时间，用于跨设备比较版本 */
  updateTime?: number
  /** 追加额度（叠加在基础额度上） */
  addNum?: number
  /** 预算周期：month 按月 / year 按年 / custom 自定义起止 */
  type?: 'month' | 'year' | 'custom'
  /** 稳定 id（自定义预算用） */
  budgetId?: number
  /** 预算名称，便于区分多个自定义预算 */
  budgetName?: string
  /** 一木：预算可隐藏（隐藏后不出现在预算页，只在「隐藏内容」里可恢复） */
  hide?: boolean
  /** 自定义区间（含首尾） */
  startTime?: number
  endTime?: number
  /** 排序权重 */
  positionWeight?: number
  /** 归属账本；为空表示全账本生效 */
  bookId?: string | number
}

interface LedgerState {
  userId: number
  token: string | null
  currentBookId: string | number
  accountBooks: AccountBook[]
  assets: Asset[]
  bills: Bill[]
  parentCategories: Category[]
  childCategories: Category[]
  transfers: Transfer[]
  budgets: Budget[]
  reimbursements: Reimbursement[]
  refunds: Refund[]
  lends: Lend[]
  cycles: Cycle[]
  /** 币种表；默认币种固定为 CNY，其余按 rate 折算 */
  tags: Tag[]
  dreams: import('./types').Dream[]
  aiTypeRules: import('./types').AiTypeRule[]
  fixedDeposits: import('./types').FixedDeposit[]
  assetFlows: import('./types').AssetFlow[]
  stockAssets: import('./types').StockAsset[]
  stockInfos: import('./types').StockInfo[]
  templates: import('./types').Template[]
  homeLoans: import('./types').HomeLoan[]
  instalments: import('./types').Instalment[]
  billGroups: import('./types').BillGroup[]
  billRelated: import('./types').BillRelated[]
  splitGroups: import('./types').SplitGroup[]
  splitMembers: import('./types').SplitMember[]
  splitExpenses: import('./types').SplitExpense[]
  currencies: Currency[]
  defaultCurrency: string
  /** 删除墓碑：同步时要把删除动作也推上去，否则别的设备会把数据拉回来 */
  tombstones: { kind: string; id: string; updatedAt: number; bookId?: string | number }[]
  lastSync: number
  /** 本次会话是否已完成过一次同步（0=未跑，-1=尝试过但失败，>0=成功时间）。不持久化 */
  sessionSyncAt: number
  /** 上次使用的分类/账户，用于快速记账 */
  lastParentId: number
  lastChildId: number
  lastAssetId: number
  seeded: boolean

  addBill: (patch: Partial<Bill>) => Bill
  deleteTransfer: (transferId: number | string) => void
  addReimbursement: (patch: { billId: string | number; assetId: number; number: number; detail?: string }) => void
  settleReimbursement: (reimbursementId: number) => void
  deleteReimbursement: (reimbursementId: number) => void
  endReimbursement: (billId: string | number) => void
  addCycle: (patch: Omit<Cycle, 'cycleId' | 'generated' | 'userId' | 'updateTime' | 'enabled'> & { enabled?: boolean }) => void
  deleteCycle: (cycleId: number | string) => void
  toggleCycle: (cycleId: number | string) => void
  skipCycleDate: (cycleId: number | string, key: string) => void
  bindCycleBook: (cycleId: number | string, bookId: string | number) => void
  dedupeCycleBills: () => number
  runCycles: () => number
  addLend: (patch: { type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: number; interest?: number; repaymentAssetId?: number; time?: number; remark?: string; parentLendId?: number; bookId?: string | number }) => void
  repayLend: (patch: { lendId: number; amount: number; repaymentAssetId?: number; time?: number }) => void
  deleteLend: (lendId: number) => void
  addRefund: (patch: { billId: string | number; number: number; assetId?: number; baseAmount?: number }) => void
  deleteRefund: (refundId: number) => void
  updateRefund: (refundId: number, patch: { number?: number; assetId?: number; baseAmount?: number }) => boolean
  setBudget: (budget: Budget) => void
  removeBudget: (month: string, categoryId: number) => void
  removeBudgetById: (budgetId: number) => void
  deleteBill: (billId: string | number) => void
  restoreBill: (bill: Bill) => void
  duplicateBill: (billId: string | number) => void
  setBillShares: (billId: string | number, shares: import('./types').BillShare[]) => void
  addSplitGroup: (patch: { name: string; members?: string[] }) => import('./types').SplitGroup
  updateSplitGroup: (splitGroupId: number, patch: { name?: string }) => void
  deleteSplitGroup: (splitGroupId: number) => void
  addSplitMember: (splitGroupId: number, name: string, self?: boolean) => import('./types').SplitMember
  updateSplitMember: (splitMemberId: number, patch: { name?: string; self?: boolean }) => void
  deleteSplitMember: (splitMemberId: number) => void
  /** 按一木规则生成分摊并落库到 SplitExpense + 账单 billShareInfo */
  applySplit: (billId: string | number, splitGroupId: number, splitType: 0 | 1 | 2, values?: Record<number, number>, payerMemberId?: number) => boolean
  settleSplit: (splitExpenseId: number, settlement: boolean) => void
  /** 账单组：把多条账单合并成一条展示（一木 BillGroup） */
  createBillGroup: (billIds: Array<string | number>) => boolean
  dissolveBillGroup: (billGroupId: number) => void
  removeFromBillGroup: (billGroupId: number, billId: string | number) => void
  /** 账单关联：两两关联（一木 BillRelated） */
  addStockAsset: (patch: { name: string; code?: string; price?: number; num?: number; cost?: number; addBill?: boolean }) => import('./types').StockAsset
  deleteStockAsset: (stockAssetId: number) => void
  /** 买入/卖出：更新持仓成本与已实现盈亏，并记录一笔 StockInfo */
  tradeStock: (stockAssetId: number, type: 1 | 2, num: number, amount: number, fee?: number, time?: number) => boolean
  /** 一木 StockHideActivity：切换持仓的隐藏状态 */
  setStockHidden: (stockAssetId: number, hidden: boolean) => void
  /** 一木：愿望清单 */
  addDream: (patch: { name: string; totalNum: number; startNum?: number; remark?: string; startTime?: number }) => void
  updateDream: (dreamId: number, patch: Partial<import('./types').Dream>) => void
  deleteDream: (dreamId: number) => void
  /** 一木：自定义智能分类 */
  addAiTypeRule: (patch: { keywords: string[]; categoryId: number }) => void
  deleteAiTypeRule: (ruleId: number) => void
  /** 一木：定期存款 */
  addFixedDeposit: (patch: { amount: number; rate: number; termYears: number; startTime?: number; remark?: string; assetId?: number; depositType?: string; toAsset?: boolean }) => void
  deleteFixedDeposit: (depositId: number, options?: { reduceAsset?: boolean }) => void
  /** 资产流水：非账单类余额变动（一木 AssetHistory） */
  addAssetFlow: (patch: { assetId: number; delta: number; reason: string; time?: number; bookId?: string | number }) => void
  setStockPrice: (stockAssetId: number, price: number) => void
  setStockCostMethod: (stockAssetId: number, method: 0 | 1 | 2) => void
  addTemplate: (patch: Omit<import('./types').Template, 'templateId' | 'updateTime'>) => import('./types').Template
  deleteTemplate: (templateId: number) => void
  /** 套用模板：直接记一笔 */
  applyTemplate: (templateId: number) => boolean
  addHomeLoan: (patch: Omit<import('./types').HomeLoan, 'loanId' | 'updateTime'>) => import('./types').HomeLoan
  deleteHomeLoan: (loanId: number) => void
  addInstalment: (patch: Omit<import('./types').Instalment, 'instalmentId' | 'updateTime'>) => import('./types').Instalment
  deleteInstalment: (instalmentId: number) => void
  /** 分期转成每期账单（记到信用卡账户上） */
  postInstalmentBills: (instalmentId: number) => number
  linkBills: (a: string | number, b: string | number) => boolean
  unlinkBills: (relatedId: number) => void
  updateBill: (billId: string | number, patch: Partial<Bill>) => void
  addTransfer: (patch: { transferId?: number | string; fromAssetId: number; toAssetId: number; cost: number; toCost?: number; serviceCharge?: number; time?: number; remark?: string; bookId?: string | number }) => Transfer
  updateTransfer: (transferId: number | string, patch: Partial<Pick<Transfer, 'fromAssetId' | 'toAssetId' | 'cost' | 'toCost' | 'serviceCharge' | 'time' | 'remark'>>) => void
  addAsset: (patch: Partial<Asset>) => void
  deleteAsset: (assetId: number) => void
  updateAsset: (asset: Asset) => void
  setBook: (id: string | number) => void
  setAccountBooks: (list: AccountBook[]) => void
  updateBookMeta: (bookId: string | number, patch: Partial<AccountBook>) => void
  migrateBookIds: (targetBookId: string) => number
  seed: () => void
  reset: () => void
  exportAll: () => object
  importAll: (data: unknown) => void
  applyImport: (plan: ImportPlan) => void
  mergeTaxonomy: () => void
  addCategory: (patch: { name: string; kind: 'expense' | 'income'; parentId: number; icon?: string; color?: string }) => Category
  updateCategory: (id: number, patch: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'bg' | 'hide' | 'positionWeight' | 'hideBook' | 'bookIds'>>) => void
  deleteCategory: (id: number) => boolean
  moveCategory: (id: number, dir: -1 | 1) => void
  addTag: (patch: Omit<Tag, 'tagId' | 'positionWeight'> & { positionWeight?: number }) => Tag
  updateTag: (tagId: number, patch: Partial<Tag>) => void
  deleteTag: (tagId: number) => void
  ensureTags: (names: string[]) => number
  setCurrencyRate: (code: string, rate: number) => void
  addCurrency: (c: Currency) => void
  removeCurrency: (code: string) => void
  applyRemote: (records: SyncIncoming[]) => void
  setLastSync: (t: number) => void
  setSessionSyncAt: (t: number) => void
  /** 处理期号冲突：内容一致才作废本地候选，被改过或有业务关联的保留并标待核对 */
  resolvePeriodConflicts: (entries: Array<{ id: string; winnerId: string }>) => { dropped: number; kept: number }
  tombstone: (kind: string, id: string | number) => void
}

// 参与同步的业务集合：只有它们变化才需要推送
const BUSINESS_KEYS = [
  'assets', 'bills', 'transfers', 'lends', 'cycles', 'tags',
  'parentCategories', 'childCategories', 'accountBooks',
  'reimbursements', 'refunds', 'budgets', 'tombstones',
  'splitGroups', 'splitMembers', 'splitExpenses',
  'stockAssets', 'stockInfos', 'templates', 'homeLoans', 'instalments',
  'billGroups', 'billRelated', 'dreams', 'aiTypeRules', 'fixedDeposits', 'assetFlows'
] as const

export const useLedger = create<LedgerState>()(
  persist(
    (persistSet, get) => {
      // Keep assetNumber as a local display cache, never as a source of truth.
      const set: typeof persistSet = (update, replace) => persistSet((state) => {
        const changes = typeof update === 'function' ? update(state) : update
        if (!changes) return changes
        const combined = { ...state, ...changes }
        const children = combined.childCategories.map(normalizeBuiltInChild)
        if (children.some((child: Category, index: number) => child !== combined.childCategories[index])) changes.childCategories = children
        if (!combined.assets || !combined.bills || !combined.parentCategories) { markDirty(); return changes }
        const assets = deriveAssets(combined).map(asset => {
          const previous = state.assets.find(a => a.assetId === asset.assetId)
          if (!previous) return asset
          const { assetNumber: _balance, updateTime: _time, ...metadata } = asset
          const { assetNumber: _oldBalance, updateTime: _oldTime, ...oldMetadata } = previous
          // A transaction changes the derived cache, not the version of opening balance.
          return JSON.stringify(metadata) === JSON.stringify(oldMetadata)
            ? { ...asset, updateTime: previous.updateTime } : asset
        })
        // 只有「业务实体」真的变了才打脏标记。
        // 否则 setSessionSyncAt/setLastSync 这类同步元数据也会触发新一轮同步 → 自循环。
        if (BUSINESS_KEYS.some((k) => (changes as Record<string, unknown>)[k] !== undefined
          && (changes as Record<string, unknown>)[k] !== (state as unknown as Record<string, unknown>)[k])) {
          markDirty()
          announceWrite()
        }
        return { ...changes, assets }
      }, replace)
      return ({
      userId: 1,
      token: null,
      currentBookId: 1,
      accountBooks: [{ accountBookId: 1, accountBookName: '日常账本', userId: 1, createTime: NOW() }],
      assets: [],
      bills: [],
      parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
      childCategories: TAXONOMY_CHILDREN,
      transfers: [],
      budgets: [],
      reimbursements: [],
      refunds: [],
      lends: [],
      cycles: [],
      tags: [],
      dreams: [],
      aiTypeRules: [],
      fixedDeposits: [],
      assetFlows: [],
      stockAssets: [],
      stockInfos: [],
      templates: [],
      homeLoans: [],
      instalments: [],
      billGroups: [],
      billRelated: [],
      splitGroups: [],
      splitMembers: [],
      splitExpenses: [],
      currencies: [
        { code: 'CNY', name: '人民币', symbol: '¥', rate: 1, positionWeight: 100 },
        { code: 'USD', name: '美元', symbol: '$', rate: 7.2, positionWeight: 90 },
        { code: 'EUR', name: '欧元', symbol: '€', rate: 7.8, positionWeight: 80 },
        { code: 'JPY', name: '日元', symbol: '¥', rate: 0.048, positionWeight: 70 },
        { code: 'HKD', name: '港币', symbol: 'HK$', rate: 0.92, positionWeight: 60 },
        { code: 'GBP', name: '英镑', symbol: '£', rate: 9.1, positionWeight: 50 },
        { code: 'KRW', name: '韩元', symbol: '₩', rate: 0.0053, positionWeight: 40 },
        { code: 'AUD', name: '澳元', symbol: 'A$', rate: 4.7, positionWeight: 30 },
        { code: 'CAD', name: '加元', symbol: 'C$', rate: 5.2, positionWeight: 20 },
        { code: 'SGD', name: '新加坡元', symbol: 'S$', rate: 5.3, positionWeight: 10 },
        { code: 'THB', name: '泰铢', symbol: '฿', rate: 0.2, positionWeight: 9 },
        { code: 'TWD', name: '新台币', symbol: 'NT$', rate: 0.22, positionWeight: 8 },
        { code: 'MOP', name: '澳门元', symbol: 'MOP$', rate: 0.9, positionWeight: 7 },
        { code: 'CHF', name: '瑞士法郎', symbol: 'CHF', rate: 8.1, positionWeight: 6 },
        { code: 'NZD', name: '新西兰元', symbol: 'NZ$', rate: 4.3, positionWeight: 5 },
        { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM', rate: 1.6, positionWeight: 4 },
        { code: 'PHP', name: '菲律宾比索', symbol: '₱', rate: 0.126, positionWeight: 3 },
        { code: 'VND', name: '越南盾', symbol: '₫', rate: 0.00028, positionWeight: 2 },
        { code: 'INR', name: '印度卢比', symbol: '₹', rate: 0.086, positionWeight: 1 },
        { code: 'AED', name: '阿联酋迪拉姆', symbol: 'AED', rate: 1.96, positionWeight: 0 }
      ],
      defaultCurrency: 'CNY',
      tombstones: [],
      lastSync: 0,
      sessionSyncAt: 0,
      lastParentId: 7,
      lastChildId: 0,
      lastAssetId: 0,
      seeded: false,

      addBill: (patch) => {
        const s = get()
        // 公共校验：一木所有记账入口（记账页/模板/周期/分期）都走同一个保存函数，
        // 所以这里集中校验，任何调用方都无法绕过
        const check = (): string | null => {
          const cost = Number(patch.cost ?? 0)
          if (!(cost > 0)) return '金额必须大于 0'
          const bookId = patch.bookId ?? (s.currentBookId === 0 ? undefined : s.currentBookId)
          if (bookId != null) {
            const book = s.accountBooks.find((bk) => String(bk.bookId) === String(bookId))
            if (book?.role === 'silent') return '当前账本只读，不能记账'
            const assetId = patch.assetId
            // -1 是一木的「无账户」哨兵，不算非法账户
            if (assetId != null && assetId !== -1 && !s.assets.some((a) => a.assetId === assetId)) return '账户不存在'
            if (assetId != null && assetId !== -1) {
              const asset = s.assets.find((a) => a.assetId === assetId)!
              const members = book?.memberCount
              if (asset.bookId == null && members != null && members > 1 && Number(bookId) !== 0) return '私有账户不能记进共享账本'
            }
          }
          return null
        }
        const problem = check()
        if (problem) throw new Error(problem)
        let identity = newBillIdentity()
        while (s.bills.some((b) => b.billId === identity.billId)) identity = newBillIdentity()
        const billId = patch.billId ?? identity.billId
        const parent = s.parentCategories.find((c) => c.id === patch.parentCategoryId)
        const child = s.childCategories.find((c) => c.id === patch.childCategoryId && c.parentId === patch.parentCategoryId)
        const asset = s.assets.find((a) => a.assetId === patch.assetId)
        const bill: Bill = {
          billId,
          syncId: patch.syncId ?? identity.syncId,
          time: patch.time ?? NOW(),
          cost: Number(patch.cost ?? 0),
          parentCategoryId: patch.parentCategoryId ?? 199,
          childCategoryId: patch.childCategoryId ?? 0,
          childCategoryIdentityVersion: 2,
          assetId: patch.assetId ?? 0,
          bookId: patch.bookId ?? s.currentBookId,
          remark: patch.remark ?? '',
          billType: patch.billType ?? 2,
          cycleId: patch.cycleId,
          tags: patch.tags ?? [],
          userId: getCurrentUid() || s.userId,
          updateTime: NOW(),
          // 冗余快照：改名不影响历史账单
          billSnapshot: {
            parentCategoryName: parent?.name ?? '',
            childCategoryName: child?.name ?? '',
            assetName: asset?.assetName ?? ''
          },
          // 可选字段原样透传（多币种、标记、地址、附件等）
          files: patch.files ?? [],
          currencyInfo: patch.currencyInfo,
          currencyAssetNumber: patch.currencyAssetNumber,
          accountAmount: patch.accountAmount ?? (asset
            ? (asset.currency && asset.currency !== s.defaultCurrency
              ? (patch.currencyInfo === asset.currency && Number.isFinite(patch.currencyAssetNumber)
                ? patch.currencyAssetNumber : fromBase(Number(patch.cost ?? 0), asset.currency, s.currencies, s.defaultCurrency))
              : Number(patch.cost ?? 0))
            : Number(patch.cost ?? 0)),
          accountCurrency: patch.accountCurrency ?? asset?.currency ?? s.defaultCurrency,
          currencyDiscountNumber: patch.currencyDiscountNumber,
          notIntoTotal: patch.notIntoTotal,
          notIntoBudget: patch.notIntoBudget,
          discountNumber: patch.discountNumber,
          refundNum: patch.refundNum,
          poiAddress: patch.poiAddress,
          totalAddress: patch.totalAddress,
          recordTime: patch.recordTime,
          inAssetTime: patch.inAssetTime,
          displayAsSelf: patch.displayAsSelf,
          fromUserId: patch.fromUserId,
          isReimbursement: patch.isReimbursement,
          reimbursementNum: patch.reimbursementNum
        }
        // 计入账户余额（信用卡为负向）
        const assets = s.assets.map((a) => {
          if (a.assetId !== bill.assetId) return a
          const isIncome = (parent?.kind ?? 'expense') === 'income'
          const delta = isIncome ? bill.cost : -bill.cost
          return { ...a, assetNumber: +(a.assetNumber + delta).toFixed(2), updateTime: NOW() }
        })
        set({
          bills: [bill, ...s.bills],
          assets,
          lastParentId: bill.parentCategoryId,
          lastChildId: bill.childCategoryId,
          lastAssetId: bill.assetId
        })
        return bill
      },

      // 删除同样要冲正：把该账单对账户的影响退回
      deleteBill: (billId) => set((s) => {
        const old = s.bills.find((b) => b.billId === billId)
        if (!old) return {}
        const tomb = { kind: 'bill', id: old.syncId ?? String(billId), bookId: old.bookId, updatedAt: NOW() }
        const sign = s.parentCategories.find((p) => p.id === old.parentCategoryId)?.kind === 'income' ? 1 : -1
        return {
          bills: s.bills.filter((b) => b.billId !== billId),
          assets: s.assets.map((a) => a.assetId === old.assetId
            ? { ...a, assetNumber: +(a.assetNumber - sign * old.cost).toFixed(2), updateTime: NOW() }
            : a),
          tombstones: [...s.tombstones, tomb]
        }
      }),

      // 撤销删除：把账单放回，并去掉对应墓碑
      restoreBill: (bill) => set((s) => ({
        bills: s.tombstones.some((t) => t.kind === 'bill' && t.id === (bill.syncId ?? String(bill.billId)))
          ? [...s.bills, bill]
          : s.bills.some((b) => b.billId === bill.billId) ? s.bills : [...s.bills, bill],
        tombstones: s.tombstones.filter((t) => !(t.kind === 'bill' && t.id === (bill.syncId ?? String(bill.billId))))
      })),

      // 复制一笔：内容照搬，时间取当下，编号重新生成
      duplicateBill: (billId) => set((s) => {
        const old = s.bills.find((b) => b.billId === billId)
        if (!old) return {}
        const { syncId, billId: newId } = newBillIdentity()
        const copy: Bill = {
          ...old,
          billId: newId,
          syncId,
          displayId: undefined,
          memberNo: undefined,
          sequenceNo: undefined,
          time: NOW(),
          updateTime: NOW(),
          // 复制出来的账单不属于任何周期规则，否则会被周期去重当成重复账单删掉
          cycleId: undefined
        }
        return { bills: [...s.bills, copy] }
      }),

      // AA 分摊：只改「谁承担多少」，不影响账户余额与统计总额
      // AA 群组（一木模型）：群组 → 成员 → 支出，分摊明细存账单 billShareInfo
      addSplitGroup: (patch) => {
        const s = get()
        let splitGroupId = Date.now()
        while (s.splitGroups.some((g) => g.splitGroupId === splitGroupId)) splitGroupId++
        const group: import('./types').SplitGroup = {
          splitGroupId, name: patch.name.trim() || 'AA 群组',
          userId: s.userId, bookId: s.currentBookId, createTime: NOW(), updateTime: NOW()
        }
        const members: import('./types').SplitMember[] = (patch.members ?? ['我']).map((name, i) => ({
          splitMemberId: splitGroupId * 100 + i, splitGroupId, name,
          self: i === 0, userId: s.userId, bookId: s.currentBookId, updateTime: NOW()
        }))
        set((st) => ({ splitGroups: [...st.splitGroups, group], splitMembers: [...st.splitMembers, ...members] }))
        return group
      },

      updateSplitGroup: (splitGroupId, patch) => set((s) => ({
        splitGroups: s.splitGroups.map((g) => g.splitGroupId === splitGroupId ? { ...g, ...patch, updateTime: NOW() } : g)
      })),

      deleteSplitGroup: (splitGroupId) => set((s) => ({
        splitGroups: s.splitGroups.filter((g) => g.splitGroupId !== splitGroupId),
        splitMembers: s.splitMembers.filter((m) => m.splitGroupId !== splitGroupId),
        tombstones: [...s.tombstones,
          { kind: 'splitGroup', id: String(splitGroupId), bookId: s.splitGroups.find((g) => g.splitGroupId === splitGroupId)?.bookId, updatedAt: NOW() },
          ...s.splitMembers.filter((m) => m.splitGroupId === splitGroupId)
            .map((m) => ({ kind: 'splitMember', id: String(m.splitMemberId), bookId: m.bookId, updatedAt: NOW() }))]
      })),

      addSplitMember: (splitGroupId, name, self) => {
        const s = get()
        let splitMemberId = Date.now()
        while (s.splitMembers.some((m) => m.splitMemberId === splitMemberId)) splitMemberId++
        const member: import('./types').SplitMember = {
          splitMemberId, splitGroupId, name: name.trim() || '成员',
          self: self || false, userId: s.userId, updateTime: NOW()
        }
        set((st) => ({ splitMembers: [...st.splitMembers, member] }))
        return member
      },

      updateSplitMember: (splitMemberId, patch) => set((s) => ({
        splitMembers: s.splitMembers.map((m) => m.splitMemberId === splitMemberId ? { ...m, ...patch, updateTime: NOW() } : m)
      })),

      deleteSplitMember: (splitMemberId) => set((s) => ({
        splitMembers: s.splitMembers.filter((m) => m.splitMemberId !== splitMemberId),
        tombstones: [...s.tombstones, { kind: 'splitMember', id: String(splitMemberId), bookId: s.splitMembers.find((m) => m.splitMemberId === splitMemberId)?.bookId, updatedAt: NOW() }]
      })),

      applySplit: (billId, splitGroupId, splitType, values, payerMemberId) => {
        const s = get()
        const bill = s.bills.find((b) => b.billId === billId)
        const members = s.splitMembers.filter((m) => m.splitGroupId === splitGroupId)
        if (!bill || !members.length) return false
        const { shares, amounts } = splitAmounts(bill.cost, members, splitType, values ?? {})
        const sum = members.reduce((acc, m) => acc + (amounts[m.splitMemberId] ?? 0), 0)
        // 精确到分：合计与账单金额必须完全一致
        if (!shares.length || Math.round(sum * 100) !== Math.round(bill.cost * 100)) return false
        let splitExpenseId = Date.now()
        while (s.splitExpenses.some((x) => x.splitExpenseId === splitExpenseId)) splitExpenseId++
        const expense: import('./types').SplitExpense = {
          splitExpenseId, splitGroupId,
          sourceBillId: bill.billId,
          title: bill.remark || 'AA 支出', amount: bill.cost,
          payerMemberId: payerMemberId ?? members.find((m) => m.self)?.splitMemberId ?? members[0].splitMemberId,
          splitType, settlement: false, time: bill.time,
          userId: s.userId, bookId: bill.bookId ?? s.currentBookId, updateTime: NOW()
        }
        set((st) => ({
          bills: st.bills.map((b) => b.billId === billId
            ? { ...b, billShareInfo: serializeShares(shares), splitGroupId, updateTime: NOW() } : b),
          // 按字符串比较：UUID 转数字会全变成 0，导致不同账单的分摊互相覆盖
          splitExpenses: [...st.splitExpenses.filter((x) => String(x.sourceBillId) !== String(expense.sourceBillId)), expense]
        }))
        return true
      },

      settleSplit: (splitExpenseId, settlement) => set((s) => ({
        splitExpenses: s.splitExpenses.map((x) => x.splitExpenseId === splitExpenseId
          ? { ...x, settlement, updateTime: NOW() } : x)
      })),

      // 定期存款：一木的「累加至账户余额」就是直接把账户余额加上去（调整，不是流水），
      // 删除时可选「减少账户余额」扣回。用 openingBalance 作为真值，assetNumber 由它派生。
      addAssetFlow: (patch) => set((s) => {
        let flowId = Date.now()
        while (s.assetFlows.some((f) => f.flowId === flowId)) flowId++
        return {
          assetFlows: [...s.assetFlows, {
            flowId, assetId: patch.assetId, delta: Number(patch.delta) || 0,
            reason: patch.reason, time: patch.time ?? NOW(),
            bookId: patch.bookId ?? (s.currentBookId === 0 ? undefined : s.currentBookId),
            ownerId: s.userId, updateTime: NOW()
          }]
        }
      }),

      addFixedDeposit: (patch) => {
        const st = get()
        let depositId = Date.now()
        while (st.fixedDeposits.some((d) => d.depositId === depositId)) depositId++
        const amt = Number(patch.amount) || 0
        const sourceAsset = patch.assetId == null ? undefined : st.assets.find((a) => a.assetId === patch.assetId)
        const toAsset = !!patch.toAsset && !!sourceAsset
        set((s) => ({
          // 一木：写入资产流水「新增定存」，余额由流水推导，不改期初
          assetFlows: toAsset
            ? [...s.assetFlows, {
                flowId: (() => { let id = NOW(); while (s.assetFlows.some((f) => f.flowId === id)) id++; return id })(),
                assetId: patch.assetId!, delta: amt, reason: '新增定存',
                time: patch.startTime ?? NOW(),
                bookId: s.currentBookId === 0 ? undefined : s.currentBookId,
                ownerId: s.userId, updateTime: NOW()
              }]
            : s.assetFlows,
          fixedDeposits: [{
            depositId, depositType: patch.depositType ?? '整存整取',
            amount: amt, rate: Number(patch.rate) || 0,
            termYears: Number(patch.termYears) || 1,
            startTime: patch.startTime ?? NOW(), remark: patch.remark ?? '',
            assetId: patch.assetId, toAsset,
            updateTime: NOW(), ownerId: s.userId,
            bookId: s.currentBookId === 0 ? undefined : s.currentBookId
          }, ...s.fixedDeposits]
        }))
      },
      deleteFixedDeposit: (depositId, options) => {
        const st = get()
        const rec = st.fixedDeposits.find((d) => d.depositId === depositId)
        // 一木：删除时勾选「减少账户余额」才扣回；不勾选则余额保持
        const reduce = !!options?.reduceAsset && rec?.toAsset && rec?.assetId != null
        set((s) => ({
          // 一木：删除时写「删除定存」反向流水（不是抹掉历史）
          assetFlows: reduce
            ? [...s.assetFlows, {
                flowId: (() => { let id = NOW(); while (s.assetFlows.some((f) => f.flowId === id)) id++; return id })(),
                assetId: rec!.assetId!, delta: -rec!.amount, reason: '删除定存',
                time: NOW(), bookId: rec?.bookId, ownerId: rec?.ownerId ?? s.userId, updateTime: NOW()
              }]
            : s.assetFlows,
          fixedDeposits: s.fixedDeposits.filter((d) => d.depositId !== depositId),
          tombstones: [...s.tombstones, { kind: 'fixedDeposit', id: String(depositId), updatedAt: NOW(),
            bookId: rec?.bookId, ownerId: rec?.ownerId ?? s.userId }]
        }))
      },

      addAiTypeRule: (patch) => set((s) => {
        let ruleId = Date.now()
        while (s.aiTypeRules.some((r) => r.ruleId === ruleId)) ruleId++
        return {
          aiTypeRules: [{ ruleId, keywords: patch.keywords, categoryId: patch.categoryId,
            updateTime: NOW(), ownerId: s.userId,
            bookId: s.currentBookId === 0 ? undefined : s.currentBookId }, ...s.aiTypeRules]
        }
      }),
      deleteAiTypeRule: (ruleId) => set((s) => {
        const rec = s.aiTypeRules.find((r) => r.ruleId === ruleId)
        return {
          aiTypeRules: s.aiTypeRules.filter((r) => r.ruleId !== ruleId),
          tombstones: [...s.tombstones, { kind: 'aiType', id: String(ruleId), updatedAt: NOW(),
            bookId: rec?.bookId, ownerId: rec?.ownerId ?? s.userId }]
        }
      }),

      addDream: (patch) => set((s) => {
        let dreamId = Date.now()
        while (s.dreams.some((d) => d.dreamId === dreamId)) dreamId++
        const rec: import('./types').Dream = {
          dreamId, name: patch.name ?? '', totalNum: Number(patch.totalNum) || 0,
          startNum: Number(patch.startNum) || 0, remark: patch.remark ?? '',
          startTime: patch.startTime ?? NOW(), updateTime: NOW(), ownerId: s.userId,
          bookId: s.currentBookId === 0 ? undefined : s.currentBookId
        }
        return { dreams: [rec, ...s.dreams] }
      }),
      updateDream: (dreamId, patch) => set((s) => ({
        dreams: s.dreams.map((d) => d.dreamId === dreamId ? { ...d, ...patch, updateTime: NOW() } : d)
      })),
      deleteDream: (dreamId) => set((s) => {
        const rec = s.dreams.find((d) => d.dreamId === dreamId)
        return {
          dreams: s.dreams.filter((d) => d.dreamId !== dreamId),
          tombstones: [...s.tombstones, { kind: 'dream', id: String(dreamId), updatedAt: NOW(),
            bookId: rec?.bookId, ownerId: rec?.ownerId ?? s.userId }]
        }
      }),

      setStockHidden: (stockAssetId, hidden) => set((s) => ({
        stockAssets: s.stockAssets.map((st) => st.stockAssetId === stockAssetId
          ? { ...st, hide: hidden, updateTime: NOW() } : st)
      })),

      addStockAsset: (patch) => {
        const s = get()
        let stockAssetId = Date.now()
        while (s.stockAssets.some((x) => x.stockAssetId === stockAssetId)) stockAssetId++
        const rec: import('./types').StockAsset = {
          stockAssetId,
          name: patch.name.trim() || '未命名投资',
          code: patch.code,
          primeNum: Number(patch.num) || 0,
          primeCost: Number(patch.cost) || 0,
          historyIncome: 0,
          price: patch.price,
          bookId: s.currentBookId,
          intoTotalAsset: true,
          addBill: patch.addBill ?? false,
          updateTime: NOW()
        }
        set((st) => ({ stockAssets: [...st.stockAssets, rec] }))
        return rec
      },

      deleteStockAsset: (stockAssetId) => set((s) => ({
        stockAssets: s.stockAssets.filter((x) => x.stockAssetId !== stockAssetId),
        stockInfos: s.stockInfos.filter((x) => x.stockAssetId !== stockAssetId),
        tombstones: [...s.tombstones,
          { kind: 'stockAsset', id: String(stockAssetId), bookId: s.stockAssets.find((x) => x.stockAssetId === stockAssetId)?.bookId, updatedAt: NOW() },
          ...s.stockInfos.filter((x) => x.stockAssetId === stockAssetId)
            .map((x) => ({ kind: 'stockInfo', id: String(x.stockInfoId), bookId: x.bookId, updatedAt: NOW() }))]
      })),

      tradeStock: (stockAssetId, type, num, amount, fee = 0, time) => {
        const s = get()
        const rec = s.stockAssets.find((x) => x.stockAssetId === stockAssetId)
        if (!rec || !(num > 0)) return false
        const h = { num: rec.primeNum, cost: rec.primeCost, realized: rec.historyIncome, lots: rec.lots }
        const method = rec.costMethod ?? 0
        const next = type === 1 ? applyBuyWithLot(h, num, amount, fee) : applySellByMethod(h, method, num, amount, fee)
        if (next === h) return false                     // 卖出超量或参数非法
        let stockInfoId = Date.now()
        while (s.stockInfos.some((x) => x.stockInfoId === stockInfoId)) stockInfoId++
        // 一木 addBill：交易同时生成账单
        if (rec.addBill && s.assets[0]) {
          get().addBill({
            assetId: s.assets[0].assetId,
            parentCategoryId: 4,
            cost: amount,
            remark: `${type === 1 ? '买入' : '卖出'} ${rec.name}`,
            time: time ?? Date.now()
          })
        }
        set((st) => ({
          stockAssets: st.stockAssets.map((x) => x.stockAssetId === stockAssetId
            ? { ...x, primeNum: next.num, primeCost: next.cost, historyIncome: next.realized, lots: next.lots, updateTime: NOW() }
            : x),
          stockInfos: [...st.stockInfos, {
            stockInfoId, stockAssetId, bookId: rec.bookId ?? s.currentBookId, type, num, cost: amount,
            serviceCharge: fee || undefined, doTime: time ?? Date.now(), updateTime: NOW()
          }]
        }))
        return true
      },

      setStockCostMethod: (stockAssetId, method) => set((s) => ({
        stockAssets: s.stockAssets.map((x) => x.stockAssetId === stockAssetId
          ? { ...x, costMethod: method, updateTime: NOW() } : x)
      })),

      setStockPrice: (stockAssetId, price) => set((s) => ({
        stockAssets: s.stockAssets.map((x) => x.stockAssetId === stockAssetId
          ? { ...x, price, updateTime: NOW() } : x)
      })),

      addTemplate: (patch) => {
        const s = get()
        let templateId = Date.now()
        while (s.templates.some((t) => t.templateId === templateId)) templateId++
        const tpl: import('./types').Template = { ...patch, templateId, bookId: patch.bookId ?? s.currentBookId, updateTime: NOW() }
        set((st) => ({ templates: [...st.templates, tpl] }))
        return tpl
      },

      deleteTemplate: (templateId) => set((s) => {
        const t = s.templates.find((x) => x.templateId === templateId)
        return {
          templates: s.templates.filter((x) => x.templateId !== templateId),
          // 删除必须留墓碑，否则下次同步会把云端旧记录拉回来（复活）
          tombstones: [...s.tombstones, { kind: 'template', id: String(templateId), bookId: t?.bookId, updatedAt: NOW() }]
        }
      }),

      // 模板记账（对齐一木 r2.o / z1.J 的真实行为：
      //  - 账本用模板自身账本，账本已不存在才回退当前账本
      //  - 账户被删不拒绝，落到 -1（一木的「无账户」）
      //  - 分类缺失落到「其他」
      //  - 外币账户按汇率折算成本币，并记录原币金额
      //  - 账单标记 billType=6（模板记账）
      applyTemplate: (templateId) => {
        const s = get()
        const tpl = s.templates.find((t) => t.templateId === templateId)
        if (!tpl) return false
        const bookExists = (id: unknown) => id != null && s.accountBooks.some((b) => String(b.bookId) === String(id))
        const tplBook = tpl.bookId != null && tpl.bookId !== 0 && bookExists(tpl.bookId) ? tpl.bookId : undefined
        const targetBook = tplBook ?? (s.currentBookId === 0 ? undefined : s.currentBookId)
        // 只读账本：任何模板分支（账单/转账）都不允许记账，必须放在最前面
        const roleOf = (id: string | number | undefined) => id == null ? undefined
          : s.accountBooks.find((bk) => String(bk.bookId) === String(id))?.role
        if (roleOf(targetBook) === 'silent') return false

        if (tpl.mode === 'transfer' && tpl.transfer) {
          const tr = tpl.transfer
          if (!(Number(tr.cost) > 0)) return false
          const hasFrom = s.assets.some((a) => a.assetId === tr.fromAssetId)
          const hasTo = s.assets.some((a) => a.assetId === tr.toAssetId)
          if (!hasFrom || !hasTo) return false
          if (tr.fromAssetId === tr.toAssetId) return false
          get().addTransfer({ ...tr, time: Date.now(), bookId: targetBook })
          return true
        }
        if (tpl.mode === 'bill' && tpl.bill) {
          const b = tpl.bill
          const source = Number(b.cost) || 0
          // 金额为 0 或模板被锁定：一木走「打开记账页预填」；这里返回 false 由调用方打开记账页
          if (!(source > 0) || (tpl as { moduleLock?: boolean }).moduleLock) return false

          const asset = s.assets.find((a) => a.assetId === b.assetId)
          // 私有账户不许通过模板记进共享账本（与记账页同一校验）
          if (asset && targetBook != null && Number(targetBook) !== 0) {
            const book = s.accountBooks.find((bk) => String(bk.bookId) === String(targetBook))
            const members = book?.memberCount
            if (asset.bookId == null && members != null && members > 1) return false
          }
          const otherId = s.parentCategories.find((p) => p.kind === 'expense' && p.name === '其他')?.id
            ?? s.parentCategories.find((p) => p.kind === 'expense')?.id ?? 0
          const parentId = s.parentCategories.some((p) => p.id === b.parentCategoryId)
            ? b.parentCategoryId : otherId

          // 外币折算：模板账户币种与默认币种不同时，按两边汇率折算
          const rateOf = (code: string) => s.currencies.find((c) => c.code === code)?.rate ?? 1
          const assetCurrency = asset?.currency ?? s.defaultCurrency
          const foreign = assetCurrency !== s.defaultCurrency && rateOf(assetCurrency) > 0 && rateOf(s.defaultCurrency) > 0
          const cost = foreign ? +((source * rateOf(assetCurrency)) / rateOf(s.defaultCurrency)).toFixed(2) : source

          try {
            get().addBill({
            assetId: asset ? asset.assetId : -1,     // 一木：账户已删则记 -1（无账户）
            parentCategoryId: parentId,
            childCategoryId: s.childCategories.some((c) => c.id === (b.childCategoryId ?? 0)) ? (b.childCategoryId ?? 0) : 0,
            cost,
            remark: b.remark ?? '',
            time: Date.now(),
            notIntoTotal: b.notIntoTotal,
            notIntoBudget: b.notIntoBudget,
            bookId: targetBook,
            billType: 6,
            ...(foreign ? { currencyInfo: `${assetCurrency} ${source}`, currencyAssetNumber: source } : {})
            })
          } catch { return false }
          return true
        }
        return false
      },

      addHomeLoan: (patch) => {
        const s = get()
        let loanId = Date.now()
        while (s.homeLoans.some((x) => x.loanId === loanId)) loanId++
        const loan: import('./types').HomeLoan = { ...patch, loanId, bookId: patch.bookId ?? s.currentBookId, updateTime: NOW() }
        set((st) => ({ homeLoans: [...st.homeLoans, loan] }))
        return loan
      },

      deleteHomeLoan: (loanId) => set((s) => ({
        homeLoans: s.homeLoans.filter((x) => x.loanId !== loanId),
        tombstones: [...s.tombstones, { kind: 'homeLoan', id: String(loanId), bookId: s.homeLoans.find((x) => x.loanId === loanId)?.bookId, updatedAt: NOW() }]
      })),

      addInstalment: (patch) => {
        const s = get()
        let instalmentId = Date.now()
        while (s.instalments.some((x) => x.instalmentId === instalmentId)) instalmentId++
        const rec: import('./types').Instalment = { ...patch, instalmentId, bookId: patch.bookId ?? s.currentBookId, updateTime: NOW() }
        set((st) => ({ instalments: [...st.instalments, rec] }))
        return rec
      },

      deleteInstalment: (instalmentId) => set((s) => ({
        instalments: s.instalments.filter((x) => x.instalmentId !== instalmentId),
        tombstones: [...s.tombstones, { kind: 'instalment', id: String(instalmentId), bookId: s.instalments.find((x) => x.instalmentId === instalmentId)?.bookId, updatedAt: NOW() }]
      })),

      // 把分期计划的每期本金+手续费生成账单（支出），只生成一次
      postInstalmentBills: (instalmentId) => {
        const s = get()
        const rec = s.instalments.find((x) => x.instalmentId === instalmentId)
        if (!rec || !rec.assetId) return 0
        const plan = planInstalment({ total: rec.totalNumber, periods: rec.periods, serviceRate: rec.serviceRate, serviceType: rec.serviceType })
        const start = new Date(`${rec.accountMonth}-01T00:00:00`)
        let created = 0
        for (const p of plan.periods) {
          const time = new Date(start.getFullYear(), start.getMonth() + (p.period - 1), 20, 12).getTime()
          const exists = get().bills.some((b) => b.assetId === rec.assetId && b.time === time && b.cost === p.total)
          if (exists) continue
          get().addBill({
            assetId: rec.assetId, parentCategoryId: 4, cost: p.total, time,
            remark: `分期第 ${p.period}/${rec.periods} 期${p.service ? '（含手续费 ' + p.service + '）' : ''}`,
            notIntoTotal: false
          })
          created++
        }
        return created
      },

      // 账单组（一木 BillGroup）：要求同一账本、至少两条且不重复
      createBillGroup: (billIds) => {
        const s = get()
        const key = (b: { billId: string | number }) => String(b.billId)
        const raw = billIds.map(String)
        const ids = [...new Set(raw)].filter((id) => s.bills.some((b) => key(b) === id))
        if (ids.length < 2) return false
        const picked = s.bills.filter((b) => ids.includes(key(b)))
        const bookIds = new Set(picked.map((b) => String(b.bookId ?? '')))
        if (bookIds.size > 1) return false
        // 已经在别的组里的账单不能再入组
        if (ids.some((id) => s.billGroups.some((g) => g.billList.map(String).includes(id)))) return false
        let billGroupId = Date.now()
        while (s.billGroups.some((g) => g.billGroupId === billGroupId)) billGroupId++
        const group: import('./types').BillGroup = {
          billGroupId,
          bookId: picked[0]?.bookId,
          firstBillId: ids[0],
          billList: ids,
          totalNumber: +picked.reduce((sum, b) => sum + b.cost, 0).toFixed(2),
          parentCategoryId: picked[0]?.parentCategoryId,
          remark: picked[0]?.remark,
          updateTime: NOW()
        }
        set((st) => ({ billGroups: [...st.billGroups, group] }))
        return true
      },

      dissolveBillGroup: (billGroupId) => set((s) => ({
        billGroups: s.billGroups.filter((g) => g.billGroupId !== billGroupId)
      })),

      removeFromBillGroup: (billGroupId, billId) => set((s) => ({
        billGroups: s.billGroups
          .map((g) => g.billGroupId === billGroupId
            ? { ...g, billList: g.billList.filter((x) => String(x) !== String(billId)) } : g)
          .filter((g) => g.billList.length >= 2)
      })),

      // 账单关联：同一对账单只保留一条关联，且不能自关联
      linkBills: (a, b) => {
        const s = get()
        const one = String(a), two = String(b)
        if (!one || !two || one === two) return false
        if (!s.bills.some((x) => String(x.billId) === one) || !s.bills.some((x) => String(x.billId) === two)) return false
        const exists = s.billRelated.some((r) =>
          (String(r.oneBillId) === one && String(r.twoBillId) === two)
          || (String(r.oneBillId) === two && String(r.twoBillId) === one))
        if (exists) return false
        let relatedId = Date.now()
        while (s.billRelated.some((r) => r.relatedId === relatedId)) relatedId++
        set((st) => ({ billRelated: [...st.billRelated, {
          relatedId, oneBillId: one, twoBillId: two,
          bookId: s.bills.find((b) => String(b.billId) === one)?.bookId ?? s.currentBookId,
          updateTime: NOW()
        }] }))
        return true
      },

      unlinkBills: (relatedId) => set((s) => ({
        billRelated: s.billRelated.filter((r) => r.relatedId !== relatedId),
        tombstones: [...s.tombstones, { kind: 'billRelated', id: String(relatedId), bookId: s.billRelated.find((r) => r.relatedId === relatedId)?.bookId, updatedAt: NOW() }]
      })),

      setBillShares: (billId, shares) => set((s) => ({
        bills: s.bills.map((b) => b.billId === billId
          ? { ...b, billShares: shares.length ? shares : undefined, updateTime: NOW() }
          : b)
      })),

      // 改单：先把旧账单对账户的影响撤回，再按新值重新记一次
      updateBill: (billId, patch) => {
        const s = get()
        const old = s.bills.find((b) => b.billId === billId)
        if (!old) return
        const refunded = s.refunds.filter((r) => r.billId === billId).reduce((sum, r) => sum + (r.baseAmount ?? 0), 0)
        if (patch.cost != null && (!Number.isFinite(patch.cost) || patch.cost < refunded)) return
        const deltaOf = (b: Bill) =>
          (s.parentCategories.find((p) => p.id === b.parentCategoryId)?.kind === 'income' ? 1 : -1) * b.cost

        let assets = s.assets.map((a) => a.assetId === old.assetId
          ? { ...a, assetNumber: +(a.assetNumber - deltaOf(old)).toFixed(2) }
          : a)

        const next: Bill = { ...old, ...patch, updateTime: NOW() }
        if (patch.childCategoryId != null) next.childCategoryIdentityVersion = 2
        const amountChanged = next.cost !== old.cost
        const accountChanged = next.assetId !== old.assetId
        if (old.accountAmount != null && (amountChanged || accountChanged)) {
          const destination = s.assets.find((a) => a.assetId === next.assetId)
          next.accountCurrency = destination?.currency ?? s.defaultCurrency
          next.accountAmount = !accountChanged || next.accountCurrency === old.accountCurrency
            ? (old.cost ? +(old.accountAmount * next.cost / old.cost).toFixed(2) : 0)
            : fromBase(next.cost, next.accountCurrency, s.currencies, s.defaultCurrency)
          if (amountChanged && old.currencyAssetNumber != null && old.cost) {
            next.currencyAssetNumber = +(old.currencyAssetNumber * next.cost / old.cost).toFixed(2)
          }
        }
        const parent = s.parentCategories.find((p) => p.id === next.parentCategoryId)
        const asset = s.assets.find((a) => a.assetId === next.assetId)
        next.billSnapshot = {
          parentCategoryName: parent?.name ?? '',
          childCategoryName: next.childCategoryId ? (resolveBillChild(next, s.childCategories)?.name ?? old.billSnapshot?.childCategoryName ?? '') : '',
          assetName: asset?.assetName ?? ''
        }

        assets = assets.map((a) => a.assetId === next.assetId
          ? { ...a, assetNumber: +(a.assetNumber + deltaOf(next)).toFixed(2), updateTime: NOW() }
          : a)

        set({ bills: s.bills.map((b) => (b.billId === billId ? next : b)), assets })
      },

      // 转账：本金不计收支；手续费若 >0 则单独生成一条支出账单（与原产品一致）
      // 注意：本金必须从转出方扣、给转入方加；手续费是额外的一笔支出账单。
      addTransfer: (patch) => {
        const s = get()
        // 旧实现用秒级时间戳：两台设备同一秒各建一笔转账会拿到同一个 id，
        // 同步到服务端后互相覆盖（丢账）。这里改用全局唯一值。
        // 新转账一律用全局唯一 id；历史数字 id 仍可读、可编辑
        const newId = () => globalThis.crypto?.randomUUID?.() ?? `t-${NOW()}-${Math.random().toString(36).slice(2, 10)}`
        // 编辑时传入原 id，保证身份不变（否则每次改金额都会变成一笔"新转账"）
        let transferId: string | number = patch.transferId ?? newId()
        while (!patch.transferId && s.transfers.some((t) => String(t.transferId) === String(transferId))) transferId = newId()
        const fee = Number(patch.serviceCharge ?? 0)
        const time = patch.time ?? NOW()
        const toCost = Number(patch.toCost ?? patch.cost)

        // 1) 本金：转出方 -，转入方 +
        set((st) => ({
          assets: st.assets.map((a) => {
            if (a.assetId === patch.fromAssetId) return { ...a, assetNumber: +(a.assetNumber - patch.cost).toFixed(2), updateTime: NOW() }
            if (a.assetId === patch.toAssetId) return { ...a, assetNumber: +(a.assetNumber + toCost).toFixed(2), updateTime: NOW() }
            return a
          })
        }))

        // 2) 手续费：单独一条支出账单（内部会给转出方再扣一次）
        let billId: string | number = 0
        if (fee > 0) {
          const bill = get().addBill({
            cost: toBase(fee, s.assets.find(a => a.assetId === patch.fromAssetId)?.currency, s.currencies, s.defaultCurrency),
            accountAmount: fee,
            parentCategoryId: 199,
            childCategoryId: 0,
            assetId: patch.fromAssetId,
            remark: `转账手续费${patch.remark ? '：' + patch.remark : ''}`,
            billType: 5,
            time,
            // 手续费必须与转账同一账本
            bookId: patch.bookId ?? (s.currentBookId === 0 ? undefined : s.currentBookId)
          })
          billId = bill.billId
        }

        const t: Transfer = {
          transferId,
          // 账本作用域：优先用显式传入（模板/调用方），否则当前账本；0 视为未归属
          bookId: patch.bookId ?? (s.currentBookId === 0 ? undefined : s.currentBookId),
          fromAssetId: patch.fromAssetId,
          toAssetId: patch.toAssetId,
          cost: Number(patch.cost),
          toCost,
          serviceCharge: fee,
          billId,
          time,
          remark: patch.remark ?? '',
          tags: [],
          userId: s.userId,
          updateTime: NOW()
        }
        set((st) => ({ transfers: [t, ...st.transfers] }))
        return t
      },

      // 改转账：先完整撤销旧记录（含手续费账单），再按新值重记
      updateTransfer: (transferId, patch) => {
        const s = get()
        const old = s.transfers.find((t) => t.transferId === transferId)
        if (!old) return
        const feeBill = old.billId ? s.bills.find((b) => b.billId === old.billId) : undefined
        const feeBack = feeBill ? feeBill.cost : 0

        set((st) => ({
          transfers: st.transfers.filter((t) => t.transferId !== transferId),
          bills: old.billId ? st.bills.filter((b) => b.billId !== old.billId) : st.bills,
          tombstones: old.billId
            ? [...st.tombstones.filter((x) => !(x.kind === 'bill' && x.id === (feeBill?.syncId ?? String(old.billId)))),
               { kind: 'bill', id: feeBill?.syncId ?? String(old.billId), bookId: feeBill?.bookId, updatedAt: NOW() }]
            : st.tombstones,
          assets: st.assets.map((a) => {
            let v = a.assetNumber
            if (a.assetId === old.fromAssetId) v += old.cost + feeBack
            if (a.assetId === old.toAssetId) v -= (old.toCost ?? old.cost)
            return v === a.assetNumber ? a : { ...a, assetNumber: +v.toFixed(2), updateTime: NOW() }
          })
        }))

        get().addTransfer({
          transferId: old.transferId,
          fromAssetId: patch.fromAssetId ?? old.fromAssetId,
          toAssetId: patch.toAssetId ?? old.toAssetId,
          cost: patch.cost ?? old.cost,
          toCost: patch.toCost ?? old.toCost ?? old.cost,
          serviceCharge: patch.serviceCharge ?? old.serviceCharge,
          time: patch.time ?? old.time,
          remark: patch.remark ?? old.remark
        })
      },

      // 删除账户：同时写墓碑，避免下次同步又被拉回来
      deleteAsset: (assetId) => set((s) => ({
        assets: s.assets.filter((a) => a.assetId !== assetId),
        tombstones: [...s.tombstones, {
          kind: 'asset', id: String(assetId),
          ownerId: s.assets.find((a) => a.assetId === assetId)?.userId,
          updatedAt: NOW()
        }]
      })),

      addAsset: (patch) => set((s) => {
        patch = { ...patch, ownerId: patch.ownerId ?? s.userId }
        const id = patch.assetId ?? NOW()
        // 用展开而不是逐字段硬编码：新增字段不会再被静默丢掉
        const asset: Asset = {
          ...patch,
          assetId: id,
          assetName: patch.assetName ?? '未命名账户',
          assetType: patch.assetType ?? 1,
          currency: patch.currency ?? s.defaultCurrency,
          assetNumber: Number(patch.assetNumber ?? 0),
          openingBalance: Number(patch.openingBalance ?? patch.assetNumber ?? 0),
          groupName: patch.groupName ?? '',
          hide: patch.hide ?? false,
          intoTotalAsset: patch.intoTotalAsset ?? true,
          positionWeight: patch.positionWeight ?? s.assets.length,
          remark: patch.remark ?? '',
          userId: s.userId,
          updateTime: NOW()
        }
        return { assets: [...s.assets, asset] }
      }),

      // 删转账：转出方退回本金+手续费，转入方扣回本金
      deleteTransfer: (transferId) => set((s) => {
        const t = s.transfers.find((x) => x.transferId === transferId)
        if (!t) return {}
        const feeBill = s.bills.find(b => b.billId === t.billId)
        const feeIdentity = feeBill?.syncId ?? String(t.billId)
        // 撤销：转出方退回本金+手续费，转入方扣回到账金额；连带删掉手续费账单
        const back = t.cost + t.serviceCharge
        const toBack = t.toCost ?? t.cost
        return {
          transfers: s.transfers.filter((x) => x.transferId !== transferId),
          bills: t.billId ? s.bills.filter((b) => b.billId !== t.billId) : s.bills,
          // 转账本身和它的手续费账单都要写墓碑，否则下次拉取会被同步回来
          tombstones: [
            ...s.tombstones.filter((x) => !(t.billId && x.kind === 'bill' && x.id === feeIdentity)
              && !(x.kind === 'transfer' && x.id === String(transferId))),
            { kind: 'transfer', id: String(transferId), bookId: feeBill?.bookId, updatedAt: NOW() },
            ...(t.billId ? [{ kind: 'bill', id: feeIdentity, bookId: feeBill?.bookId, updatedAt: NOW() }] : [])
          ],
          assets: s.assets.map((a) => {
            if (a.assetId === t.fromAssetId) return { ...a, assetNumber: +(a.assetNumber + back).toFixed(2), updateTime: NOW() }
            if (a.assetId === t.toAssetId) return { ...a, assetNumber: +(a.assetNumber - toBack).toFixed(2), updateTime: NOW() }
            return a
          })
        }
      }),

      // 登记报销：只落记录，钱还没到；确认到账时才进报销账户
      addReimbursement: ({ billId, assetId, number, detail }) => set((s) => {
        const bill = s.bills.find((b) => b.billId === billId)
        if (!bill || !s.assets.some((a) => a.assetId === assetId) || !Number.isFinite(number) || number <= 0) return {}
        // 多次报销：累计金额不得超过原账单
        const claimed = s.reimbursements.filter((r) => r.billId === billId).reduce((sum, r) => sum + (Number(r.number) || 0), 0)
        if (number > +(bill.cost - claimed).toFixed(2)) return {}
        // 同一毫秒内连续登记会撞 id，这里顺延保证唯一
        let rid = Date.now()
        while (s.reimbursements.some((r) => r.reimbursementId === rid)) rid++
        const rec: Reimbursement = {
          reimbursementId: rid, billId, assetId, number: Number(number) || 0,
          bookId: bill.bookId,
          detail: detail ?? '', status: 'pending', userId: s.userId, updateTime: NOW()
        }
        const total = claimed + rec.number
        return {
          reimbursements: [rec, ...s.reimbursements],
          bills: s.bills.map((b) => b.billId === billId
            ? { ...b, isReimbursement: 1, reimbursementNum: +total.toFixed(2), updateTime: NOW() } : b)
        }
      }),

      settleReimbursement: (reimbursementId) => set((s) => {
        const rec = s.reimbursements.find((r) => r.reimbursementId === reimbursementId)
        if (!rec || rec.status === 'done') return {}
        return {
          reimbursements: s.reimbursements.map((r) => r.reimbursementId === reimbursementId
            ? { ...r, status: 'done' as const, settledAt: NOW(), updateTime: NOW() } : r),
          assets: s.assets.map((a) => a.assetId === rec.assetId
            ? { ...a, assetNumber: +(a.assetNumber + rec.number).toFixed(2), updateTime: NOW() } : a)
        }
      }),

      // 结束报销：账单标记结束，同时把待报销记录收口，避免待办列表残留
      endReimbursement: (billId) => set((s) => ({
        bills: s.bills.map((b) => b.billId === billId ? { ...b, reimbursementEnd: true, updateTime: NOW() } : b),
        reimbursements: s.reimbursements.map((r) => r.billId === billId && r.status === 'pending'
          ? { ...r, status: 'ended' as const, updateTime: NOW() } : r)
      })),

      deleteReimbursement: (reimbursementId) => set((s) => {
        const rec = s.reimbursements.find((r) => r.reimbursementId === reimbursementId)
        if (!rec) return {}
        const refundBack = rec.status === 'done' ? rec.number : 0
        const rest = s.reimbursements.filter((r) => r.reimbursementId !== reimbursementId && r.billId === rec.billId)
        const remainTotal = +rest.reduce((sum, r) => sum + (Number(r.number) || 0), 0).toFixed(2)
        return {
          reimbursements: s.reimbursements.filter((r) => r.reimbursementId !== reimbursementId),
          assets: refundBack ? s.assets.map((a) => a.assetId === rec.assetId
            ? { ...a, assetNumber: +(a.assetNumber - refundBack).toFixed(2), updateTime: NOW() } : a) : s.assets,
          bills: s.bills.map((b) => b.billId === rec.billId
            ? { ...b, isReimbursement: remainTotal > 0 ? 1 : 0, reimbursementNum: remainTotal, updateTime: NOW() } : b),
          tombstones: [...s.tombstones, { kind: 'reimbursement', id: String(reimbursementId), updatedAt: NOW() }]
        }
      }),

      addCycle: (patch) => set((s) => ({
        cycles: [...s.cycles, {
          ...patch,
          bookId: s.currentBookId || 1,
          // 稳定 UUID：两台设备创建同一条规则时不会各用各的时间戳
          cycleId: (globalThis.crypto?.randomUUID?.() ?? String(NOW())),
          enabled: patch.enabled ?? true,
          generated: [],
          userId: s.userId,
          updateTime: NOW()
        } as Cycle]
      })),

      deleteCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.filter((c) => c.cycleId !== cycleId),
        tombstones: [...s.tombstones, {
          kind: 'cycle', id: String(cycleId),
          bookId: s.cycles.find((c) => c.cycleId === cycleId)?.bookId,
          updatedAt: NOW()
        }]
      })),

      toggleCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId ? { ...c, enabled: !c.enabled, updateTime: NOW() } : c)
      })),

      // 补生成所有到期未生成的周期账单；返回本次生成条数
      // 旧周期规则确认账本归属（用户显式操作，不做静默推断）
      bindCycleBook: (cycleId, bookId) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId ? { ...c, bookId, updateTime: NOW() } : c)
      })),

      // 跳过某一期：记进 skipDates，这期不再生成，后续不受影响
      skipCycleDate: (cycleId, key) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId
          ? { ...c, skipDates: Array.from(new Set([...(c.skipDates ?? []), key])), updateTime: NOW() }
          : c)
      })),

      // 周期账单去重：必须走这层 set，才能触发余额重算并把墓碑写入待同步队列
      dedupeCycleBills: () => {
        const s = get()
        // 有退款/报销关联的账单不参与删除
        const protectedIds = new Set<string>([
          ...s.refunds.map((r) => String(r.billId)),
          ...s.reimbursements.map((r) => String(r.billId))
        ])
        const { bills, removed } = dedupeBills(s.bills, protectedIds)
        if (!removed.length) return 0
        set((st) => ({
          bills,
          tombstones: [
            ...st.tombstones,
            ...removed.map((b) => ({ kind: 'bill', id: String(b.syncId ?? b.billId), bookId: b.bookId, updatedAt: NOW() }))
          ]
        }))
        return removed.length
      },

      runCycles: () => {
        const s = get()
        const plan = planCycles({
          cycles: s.cycles, bills: s.bills, assets: s.assets,
          parentCategories: s.parentCategories, childCategories: s.childCategories,
          currentBookId: s.currentBookId, currencies: s.currencies, defaultCurrency: s.defaultCurrency,
          userId: s.userId, uid: getCurrentUid() || undefined
        })
        if (!plan.count) return 0
        const cycleMap = new Map(plan.cycles.map((c) => [c.cycleId, c]))
        // 周期转账先走 addTransfer（它会自己带出手续费账单），再落周期状态
        for (const t of plan.transfers ?? []) {
          get().addTransfer({
            fromAssetId: t.fromAssetId, toAssetId: t.toAssetId,
            cost: t.cost, serviceCharge: t.serviceCharge, time: t.time, remark: t.remark
          })
        }
        set((st) => ({
          bills: [...plan.bills, ...st.bills],
          assets: st.assets.map((a) => plan.assetDelta.has(a.assetId)
            ? { ...a, assetNumber: +(a.assetNumber + (plan.assetDelta.get(a.assetId) ?? 0)).toFixed(2), updateTime: NOW() }
            : a),
          cycles: st.cycles.map((c) => cycleMap.get(c.cycleId) ?? c)
        }))
        return plan.count
      },

      // 借出 -、借入 +、收回 +、还款 -；删除则反向冲正
      addLend: ({ type, assetId, counterparty, number, interest, repaymentAssetId, time, remark, parentLendId, bookId }) => set((s) => {
        const amt = Number(number) || 0
        if (amt <= 0 || !assetId) return {}
        // 借出/借入走 assetId；收回/还款优先走 repaymentAssetId
        const cashAsset = (type === 2 || type === 4) && repaymentAssetId ? repaymentAssetId : assetId
        const sign = type === 1 || type === 4 ? -1 : 1
        // 同一毫秒内连续登记会撞 id，顺延保证唯一（父记录与还款记录常在同一次点击内创建）
        let lendId = Date.now()
        while (s.lends.some((l) => l.lendId === lendId)) lendId++
        // 有父记录时必须继承父记录账本；调用方漏传也不能漂移到当前账本
        const parentBook = parentLendId != null ? s.lends.find((l) => l.lendId === parentLendId)?.bookId : undefined
        const rec: Lend = {
          lendId,
          // 借贷参与余额计算，必须带账本；还款记录继承父记录的账本，不随当前账本漂移
          bookId: bookId !== undefined ? bookId
            : parentLendId != null ? parentBook
            : (s.currentBookId === 0 ? undefined : s.currentBookId),
          type, assetId, counterparty: counterparty ?? '',
          number: amt,
          interest: Number(interest) || 0,
          repaymentAssetId: repaymentAssetId || undefined,
          time: time ?? NOW(), remark: remark ?? '',
          parentLendId: parentLendId || undefined,
          userId: s.userId, updateTime: NOW()
        }
        return {
          lends: [rec, ...s.lends],
          assets: s.assets.map((a) => a.assetId === cashAsset
            ? { ...a, assetNumber: +(a.assetNumber + sign * amt).toFixed(2), updateTime: NOW() } : a)
        }
      }),

      // 部分还款/收款：生成一条关联记录，剩余额度由 lend.ts 派生
      repayLend: ({ lendId, amount, repaymentAssetId, time }) => {
        const s = get()
        const parent = s.lends.find((l) => l.lendId === lendId)
        if (!parent || (parent.type !== 1 && parent.type !== 3)) return
        const amt = Number(amount) || 0
        const remaining = lendRemaining(parent, s.lends)
        if (amt <= 0 || amt > remaining) return
        s.addLend({
          // 账本继承父借贷：跨账本还款时不能落到当前账本
          bookId: parent.bookId,
          type: parent.type === 1 ? 2 : 4,
          assetId: parent.repaymentAssetId ?? parent.assetId,
          counterparty: parent.counterparty,
          number: amt,
          repaymentAssetId: repaymentAssetId ?? parent.repaymentAssetId ?? parent.assetId,
          parentLendId: parent.lendId,
          time,
          remark: parent.remark
        })
      },

      // 删借贷：删除父记录时连带删除其还款/收款子记录，避免留下孤记录
      deleteLend: (lendId) => set((s) => {
        const rec = s.lends.find((x) => x.lendId === lendId)
        if (!rec) return {}
        const targets = [rec, ...s.lends.filter((x) => x.parentLendId === lendId)]
        let assets = s.assets
        let tombstones = s.tombstones
        for (const r of targets) {
          const sign = r.type === 1 || r.type === 4 ? 1 : -1
          const cashAsset = (r.type === 2 || r.type === 4) && r.repaymentAssetId ? r.repaymentAssetId : r.assetId
          assets = assets.map((a) => a.assetId === cashAsset
            ? { ...a, assetNumber: +(a.assetNumber + sign * r.number).toFixed(2), updateTime: NOW() } : a)
          tombstones = [...tombstones.filter((t) => !(t.kind === 'lend' && t.id === String(r.lendId))),
            { kind: 'lend', id: String(r.lendId), updatedAt: NOW(),
              bookId: r.bookId ?? (s.currentBookId === 0 ? undefined : s.currentBookId) }]
        }
        return {
          lends: s.lends.filter((x) => !targets.some((r) => r.lendId === x.lendId)),
          assets,
          tombstones
        }
      }),

      // 账户余额由退款流水自动推导，不再手动改缓存。
      addRefund: (patch) => set((s) => addRefundChanges(s, patch, NOW())),
      deleteRefund: (refundId) => set((s) => deleteRefundChanges(s, refundId, NOW())),

      // 编辑已有退款：校验累计不超过账单金额；余额由退款派生，自动跟着变
      updateRefund: (refundId, patch) => {
        const s = get()
        const rec = s.refunds.find((r) => r.refundId === refundId)
        if (!rec) return false
        const bill = s.bills.find((b) => b.billId === rec.billId)
        if (!bill) return false
        const number = patch.number ?? rec.number
        const baseAmount = Number(patch.baseAmount ?? (number === rec.number ? rec.baseAmount
          : toBase(number, rec.currency ?? s.defaultCurrency, s.currencies, s.defaultCurrency)))
        const others = s.refunds.filter((r) => r.billId === rec.billId && r.refundId !== refundId)
        const refunded = others.reduce((sum, r) => sum + (r.baseAmount ?? 0), 0)
        if (!Number.isFinite(number) || number <= 0) return false
        if (!Number.isFinite(baseAmount) || baseAmount <= 0) return false
        if (refunded + baseAmount > bill.cost + 1e-6) return false
        set((st) => ({
          refunds: st.refunds.map((r) => r.refundId === refundId
            ? { ...r, number, baseAmount, assetId: patch.assetId ?? r.assetId, updateTime: NOW() } : r),
          bills: st.bills.map((b) => b.billId === rec.billId
            ? { ...b, refundNum: +(refunded + baseAmount).toFixed(2), updateTime: NOW() } : b)
        }))
        return true
      },

      // 预算身份：自定义预算用 budgetId（可并存多个），月/年预算用 type+分类
      setBudget: (budget) => set((s) => {
        const sameKey = (b: typeof budget) => budget.type === 'custom'
          ? b.type === 'custom' && b.budgetId === budget.budgetId
          : (b.type ?? 'month') === (budget.type ?? 'month') && b.categoryId === budget.categoryId
        const rest = s.budgets.filter((b) => !sameKey(b))
        const tombId = budget.type === 'custom'
          ? String(budget.budgetId)
          : `${budget.type ?? 'month'}:${budget.categoryId}`
        if (budget.amount > 0) return { budgets: [...rest, { ...budget, updateTime: NOW() }] }
        // 填 0 表示取消：要写墓碑，否则云端旧预算会再拉回来
        return {
          budgets: rest,
          tombstones: [...s.tombstones, { kind: 'budget', id: tombId, updatedAt: NOW() }]
        }
      }),

      removeBudget: (month, categoryId) => set((s) => {
        const target = s.budgets.find((b) => b.month === month && b.categoryId === categoryId
          && (b.type ?? 'month') === 'month')
        const id = target?.type === 'custom' && target.budgetId != null
          ? String(target.budgetId)
          : `month:${categoryId}`
        return {
          budgets: s.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId
            && (b.type ?? 'month') === 'month')),
          tombstones: [...s.tombstones, { kind: 'budget', id, updatedAt: NOW() }]
        }
      }),

      // 自定义预算删除：按 budgetId 精确定位
      removeBudgetById: (budgetId: number) => set((s) => ({
        budgets: s.budgets.filter((b) => b.budgetId !== budgetId),
        tombstones: [...s.tombstones, { kind: 'budget', id: String(budgetId), updatedAt: NOW() }]
      })),

      updateAsset: (asset) => set((s) => ({
        assets: s.assets.map((a) => a.assetId === asset.assetId
          ? { ...asset, openingBalance: (a.openingBalance ?? a.assetNumber) + (asset.assetNumber - a.assetNumber), updateTime: NOW() }
          : a)
      })),

      setBook: (id) => set({ currentBookId: id }),

      // 老数据的 bookId 是数字（本地账本），切到服务端账本后要把它们迁过去，否则会被过滤掉
      migrateBookIds: (targetBookId) => {
        let n = 0
        set((s) => ({
          bills: s.bills.map((b) => {
            if (typeof b.bookId === 'string') return b
            n++
            return { ...b, bookId: targetBookId }
          })
        }))
        return n
      },

      // 账本的图标/颜色/排序是本地展示属性，服务端不存；重载时按 bookId 保留
      updateBookMeta: (bookId, patch) => set((s) => ({
        accountBooks: s.accountBooks.map((b) =>
          String(b.bookId) === String(bookId) ? { ...b, ...patch } : b)
      })),

      setAccountBooks: (list) => set((s) => {
        // 保留本地账本（数字 id），替换服务端账本；
        // 图标/颜色/排序/关联预算是本地展示属性，按 bookId 从旧数据带过来
        const meta = new Map(s.accountBooks.filter((b) => b.bookId).map((b) => [String(b.bookId), b]))
        const merged = list.map((b) => {
          const old = meta.get(String(b.bookId))
          return old
            ? { ...b, icon: old.icon, color: old.color, positionWeight: old.positionWeight, currentBudgetId: old.currentBudgetId }
            : b
        })
        const local = s.accountBooks.filter((b) => !b.bookId)
        return { accountBooks: [...local, ...merged] }
      }),

      seed: () => {
        const assets: Asset[] = [
          { assetId: 1, assetName: '招行储蓄卡', assetType: 1, assetNumber: 12500.5, groupName: '银行卡', hide: false, intoTotalAsset: true, positionWeight: 0, remark: '', userId: 1, updateTime: NOW() },
          { assetId: 2, assetName: '招行信用卡', assetType: 2, assetNumber: -2380, groupName: '信用卡', hide: false, intoTotalAsset: true, positionWeight: 1, remark: '', userId: 1, updateTime: NOW() },
          { assetId: 3, assetName: '支付宝', assetType: 1, assetNumber: 860.2, groupName: '电子钱包', hide: false, intoTotalAsset: true, positionWeight: 2, remark: '', userId: 1, updateTime: NOW() }
        ]
        set({ assets, bills: [], seeded: true })
        const day = 86400000
        const mk = (daysAgo: number, cost: number, pid: number, cid: number, aid: number, remark: string) =>
          get().addBill({
            time: NOW() - daysAgo * day, cost, parentCategoryId: pid,
            childCategoryId: cid, assetId: aid, remark, billType: 2
          })
        mk(0, 32.5, 7, 706, 3, '午饭')      // 食品餐饮 / 午餐
        mk(0, 128, 8, 811, 1, '洗衣液和纸巾') // 购物消费 / 日常家居
        mk(1, 6, 6, 605, 3, '地铁')          // 出行交通 / 公共交通
        mk(2, 45, 3, 301, 1, '一本书')       // 文化教育 / 书报杂志
        mk(3, 3200, 4, 402, 1, '房租')       // 居家生活 / 房租还贷
        mk(4, 12000, 903, 0, 1, '月薪')      // 工资
      },

      reset: () => set({
        sessionSyncAt: 0,
        assets: [], bills: [], transfers: [], budgets: [],
        reimbursements: [], refunds: [], lends: [], cycles: [], seeded: false,
        // 新增实体也要一起清空，否则"清空数据"会留下 AA/持仓/模板等
        splitGroups: [], splitMembers: [], splitExpenses: [],
        dreams: [],
      aiTypeRules: [],
      fixedDeposits: [],
      stockAssets: [], stockInfos: [], templates: [],
        homeLoans: [], instalments: [],
        billGroups: [], billRelated: [],
        parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
        childCategories: TAXONOMY_CHILDREN
      }),

      exportAll: () => {
        const s = get()
        return {
          version: 3,
          exportedAt: new Date().toISOString(),
          accountBooks: s.accountBooks,
          assets: s.assets,
          bills: s.bills,
          transfers: s.transfers,
          budgets: s.budgets,
          reimbursements: s.reimbursements,
          refunds: s.refunds,
          lends: s.lends,
          cycles: s.cycles,
          parentCategories: s.parentCategories,
          childCategories: s.childCategories,
          tags: s.tags,
          currencies: s.currencies,
          defaultCurrency: s.defaultCurrency,
          tombstones: s.tombstones,
          currentBookId: s.currentBookId,
          // v3：AA / 持仓 / 模板 / 房贷 / 分期 / 账单组 也要进备份，否则换设备就丢
          splitGroups: s.splitGroups,
          splitMembers: s.splitMembers,
          splitExpenses: s.splitExpenses,
          stockAssets: s.stockAssets,
          stockInfos: s.stockInfos,
          templates: s.templates,
          homeLoans: s.homeLoans,
          instalments: s.instalments,
          billGroups: s.billGroups,
          billRelated: s.billRelated,
          // v3：愿望清单 / 智能分类 / 定期存款
          dreams: s.dreams,
          aiTypeRules: s.aiTypeRules,
          fixedDeposits: s.fixedDeposits,
          assetFlows: s.assetFlows
        }
      },

      setLastSync: (t) => set({ lastSync: t }),
      setSessionSyncAt: (t) => set({ sessionSyncAt: t }),

      // 期号冲突：只有「与胜出记录内容一致」的本地候选才作废；
      // 用户改过金额/备注/分类，或被退款报销引用的，一律保留并标待核对
      resolvePeriodConflicts: (entries) => {
        const s = get()
        const keyOf = (b: Bill) => String(b.syncId ?? b.billId)
        // 内容比对要覆盖账户、币种快照、标签与标记——只比金额会误删真正不同的记录
        const sameContent = (a: Bill, b: Bill) => a.cost === b.cost && a.time === b.time
          && a.parentCategoryId === b.parentCategoryId
          && (a.childCategoryId ?? 0) === (b.childCategoryId ?? 0)
          && a.assetId === b.assetId
          && (a.accountAmount ?? a.cost) === (b.accountAmount ?? b.cost)
          && (a.currencyInfo ?? '') === (b.currencyInfo ?? '')
          && (a.remark ?? '') === (b.remark ?? '')
          && (a.notIntoTotal ?? false) === (b.notIntoTotal ?? false)
          && (a.notIntoBudget ?? false) === (b.notIntoBudget ?? false)
          && [...(a.tags ?? [])].sort().join('|') === [...(b.tags ?? [])].sort().join('|')
          && (a.files?.length ?? 0) === (b.files?.length ?? 0)
        // 关联判定要按真实 billId（历史/导入数据里 billId 与 syncId 可能不同）
        const idsOf = (b: Bill) => [String(b.billId), keyOf(b)]
        const linked = (b: Bill) => {
          const ids = new Set(idsOf(b))
          return s.refunds.some((r) => ids.has(String(r.billId)))
            || s.reimbursements.some((r) => ids.has(String(r.billId)))
        }
        const drop: Bill[] = []
        const keep: Bill[] = []
        for (const e of entries) {
          const local = s.bills.find((b) => keyOf(b) === String(e.id))
          if (!local) continue
          const winner = s.bills.find((b) => keyOf(b) === String(e.winnerId))
          if (!linked(local) && winner && sameContent(local, winner)) drop.push(local)
          else keep.push(local)
        }
        if (!drop.length && !keep.length) return { dropped: 0, kept: 0 }
        set((st) => ({
          bills: st.bills
            .filter((b) => !drop.includes(b))
            .map((b) => keep.includes(b) ? { ...b, conflict: true } : b),
          tombstones: [...st.tombstones, ...drop.map((b) => ({
            kind: 'bill' as const, id: keyOf(b), bookId: b.bookId, updatedAt: NOW()
          }))]
        }))
        return { dropped: drop.length, kept: keep.length }
      },

      addTag: (patch) => {
        const parent = patch.parentTagId != null ? get().tags.find((t) => t.tagId === patch.parentTagId) : undefined
        const st0 = get()
        const used = new Set(st0.tags.map((t) => String(t.tagId)))
        // 用确定性递增代替「时间戳+随机」，并显式检查占用，避免两条标签拿到同一 ID
        let tagId = Math.max(NOW(), ...st0.tags.map((t) => t.tagId).filter(Number.isFinite), 0) + 1
        while (used.has(String(tagId))) tagId++
        const tag: Tag = {
          tagId,
          name: patch.name,
          color: patch.color || DEFAULT_TAG_COLOR,
          parentTagId: patch.parentTagId,
          parentName: parent?.name ?? patch.parentName ?? undefined,
          positionWeight: patch.positionWeight ?? 0,
          updateTime: NOW()
        }
        set((s) => ({ tags: [...s.tags, tag] }))
        return tag
      },

      updateTag: (tagId, patch) => set((s) => ({
        tags: s.tags.map((t) => {
          if (t.tagId !== tagId) return t
          const next = { ...t, ...patch, updateTime: NOW() }
          // 父标签变更时同步派生 parentName，保证两套表示一致
          if ('parentTagId' in patch) {
            next.parentName = patch.parentTagId != null
              ? s.tags.find((x) => x.tagId === patch.parentTagId)?.name
              : undefined
          }
          return next
        })
      })),

      deleteTag: (tagId) => set((s) => ({
        tags: s.tags.filter((t) => t.tagId !== tagId),
        tombstones: [...s.tombstones, { kind: 'tag', id: String(tagId), updatedAt: NOW() }]
      })),

      // 导入/输入时按名字补齐标签实体，返回补齐数量
      ensureTags: (names) => {
        const s = get()
        const have = new Set(s.tags.map((t) => t.name))
        const missing = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) => !have.has(n))
        if (!missing.length) return 0
        const palette = [DEFAULT_TAG_COLOR, '#F8C8B0', '#CFE3F7', '#D9F0C8', '#E6D9F7', '#F7D9E6']
        const i = s.tags.length
        let nextId = Math.max(NOW(), ...s.tags.map((t) => t.tagId).filter(Number.isFinite), 0) + 1
        const used = new Set(s.tags.map((t) => String(t.tagId)))
        set((st) => ({
          tags: [...st.tags, ...missing.map((n) => ({
            tagId: (() => { while (used.has(String(nextId))) nextId++; used.add(String(nextId)); return nextId++ })(),
            name: n,
            color: palette[i % palette.length],
            positionWeight: i
          } as Tag))]
        }))
        return missing.length
      },

      setCurrencyRate: (code, rate) => set((s) => {
        const r = Number(rate)
        // 非法或非正数一律忽略，绝不允许把汇率写成 0（否则金额会按 1:1 记账）
        if (!Number.isFinite(r) || r <= 0) return {}
        return {
          currencies: s.currencies.map((c) => c.code === code
            ? { ...c, rate: c.code === s.defaultCurrency ? 1 : r } : c)
        }
      }),

      addCurrency: (c) => set((s) => s.currencies.some((x) => x.code === c.code)
        ? {}
        : { currencies: [...s.currencies, c] }),

      removeCurrency: (code) => set((s) => code === s.defaultCurrency ? {}
        : { currencies: s.currencies.filter((c) => c.code !== code) }),

      tombstone: (kind, id) => set((s) => ({
        tombstones: [
          ...s.tombstones.filter((t) => !(t.kind === kind && t.id === String(id))),
          { kind, id: String(id), updatedAt: NOW() }
        ]
      })),

      // 合并云端记录：算法在 domain/sync-merge.ts，这里只做接线
      applyRemote: (records) => set((s) => mergeRemote(s as unknown as MergeableState, records) as Partial<LedgerState>),

      // 补齐内置分类（缺失的加上），并把老数据里的 emoji 图标迁移成图标键
      // 分类规范化：算法在 domain/taxonomy-merge.ts
      // 新增分类：parentId=0 表示大类，否则是子分类
      addCategory: (patch) => {
        const s = get()
        const sameLevel = patch.parentId === 0 ? s.parentCategories.filter((c) => c.kind === patch.kind) : s.childCategories.filter((c) => c.parentId === patch.parentId)
        let id = Date.now()
        while ([...s.parentCategories, ...s.childCategories].some((c) => c.id === id)) id++
        const cat: Category = {
          id, name: patch.name.trim(), parentId: patch.parentId, kind: patch.kind,
          color: patch.color ?? DEFAULT_TAG_COLOR, positionWeight: sameLevel.length,
          icon: patch.icon, updateTime: NOW()
        }
        set((st) => patch.parentId === 0
          ? { parentCategories: [...st.parentCategories, cat] }
          : { childCategories: [...st.childCategories, cat] })
        return cat
      },

      updateCategory: (id, patch) => set((s) => ({
        parentCategories: s.parentCategories.map((c) => c.id === id ? { ...c, ...patch, updateTime: NOW() } : c),
        childCategories: s.childCategories.map((c) => c.id === id ? { ...c, ...patch, updateTime: NOW() } : c)
      })),

      // 删除分类：大类会连子分类一起删；被账单引用时拒绝，避免历史账目丢失分类
      deleteCategory: (id) => {
        const s = get()
        const isParent = s.parentCategories.some((c) => c.id === id)
        const childIds = s.childCategories.filter((c) => c.parentId === id).map((c) => c.id)
        const used = s.bills.some((b) => b.parentCategoryId === id || childIds.includes(b.childCategoryId ?? -1))
          || s.cycles.some((c) => c.parentCategoryId === id || childIds.includes(c.childCategoryId))
        if (used) return false
        set((st) => ({
          parentCategories: isParent ? st.parentCategories.filter((c) => c.id !== id) : st.parentCategories,
          childCategories: st.childCategories.filter((c) => c.id !== id && c.parentId !== id),
          tombstones: [
            ...st.tombstones,
            ...(isParent ? [{ kind: 'parent', id: String(id), updatedAt: NOW() }] : [{ kind: 'child', id: String(id), updatedAt: NOW() }]),
            ...childIds.map((cid) => ({ kind: 'child', id: String(cid), updatedAt: NOW() }))
          ]
        }))
        return true
      },

      // 排序：同级重排后统一重新编号，避免权重重复导致“交换等于没换”
      moveCategory: (id, dir) => set((s) => {
        const inParent = s.parentCategories.some((c) => c.id === id)
        const list = inParent ? s.parentCategories : s.childCategories
        const target = list.find((c) => c.id === id)
        if (!target) return {}
        const siblings = (inParent
          ? list.filter((c) => c.kind === target.kind)
          : list.filter((c) => c.parentId === target.parentId))
          .slice()
          .sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0) || a.id - b.id)
        const idx = siblings.findIndex((c) => c.id === id)
        const next = idx + dir
        if (next < 0 || next >= siblings.length) return {}
        const reordered = [...siblings]
        const [moved] = reordered.splice(idx, 1)
        reordered.splice(next, 0, moved)
        const weight = new Map(reordered.map((c, i) => [c.id, i]))
        const apply = (c: Category) => weight.has(c.id) ? { ...c, positionWeight: weight.get(c.id)! } : c
        return inParent
          ? { parentCategories: s.parentCategories.map(apply) }
          : { childCategories: s.childCategories.map(apply) }
      }),

      mergeTaxonomy: () => set((s) => {
        // 旧周期规则不做静默绑定：历史归属无法可靠推断，留空则由生成时按当前账本兜底
        return mergeTaxonomyState(s)
      }),

      // 合并式导入：新增分类/账户先落地，账单像正常记账一样冲账户余额
      applyImport: (plan) => set((s) => {
        const parents = [...s.parentCategories, ...plan.newParents]
        let assets = [...s.assets, ...plan.newAssets.map(a => ({ ...a, openingBalance: 0 }))]

        const delta = (assetId: number, value: number) => {
          assets = assets.map((a) => a.assetId === assetId
            ? { ...a, assetNumber: +(a.assetNumber + value).toFixed(2), updateTime: NOW() }
            : a)
        }

        for (const b of plan.bills) {
          const kind = parents.find((p) => p.id === b.parentCategoryId)?.kind
          delta(b.assetId, (kind === 'income' ? 1 : -1) * b.cost)
        }
        for (const t of plan.transfers) {
          delta(t.fromAssetId, -(t.cost + t.serviceCharge))
          delta(t.toAssetId, t.cost)
        }

        return {
          parentCategories: parents,
          childCategories: [...s.childCategories, ...plan.newChildren],
          accountBooks: [...s.accountBooks, ...plan.newBooks],
          assets,
          bills: [...plan.bills, ...s.bills],
          transfers: [...plan.transfers, ...s.transfers],
          reimbursements: [...plan.reimbursements, ...s.reimbursements],
          refunds: [...plan.refunds, ...s.refunds],
          seeded: true
        }
      }),

      importAll: (input) => {
        const data = validateBackup(input)
        set((s) => ({
          accountBooks: data.accountBooks,
          assets: data.assets,
          bills: data.bills,
          transfers: data.transfers,
          budgets: data.budgets,
          reimbursements: data.reimbursements,
          refunds: data.refunds,
          lends: data.lends,
          cycles: data.cycles,
          parentCategories: data.parentCategories,
          childCategories: data.childCategories,
          ...(data.version >= 2 ? {
            tags: data.tags,
            currencies: data.currencies,
            defaultCurrency: data.defaultCurrency,
            tombstones: data.tombstones,
            currentBookId: data.currentBookId ?? s.currentBookId
          } : {}),
          // v3 新增实体：旧备份没有这些字段，用空数组兜底
          splitGroups: data.splitGroups ?? [],
          splitMembers: data.splitMembers ?? [],
          splitExpenses: data.splitExpenses ?? [],
          stockAssets: data.stockAssets ?? [],
          stockInfos: data.stockInfos ?? [],
          templates: data.templates ?? [],
          homeLoans: data.homeLoans ?? [],
          instalments: data.instalments ?? [],
          billGroups: data.billGroups ?? [],
          billRelated: data.billRelated ?? [],
          dreams: data.dreams ?? [],
          aiTypeRules: data.aiTypeRules ?? [],
          fixedDeposits: data.fixedDeposits ?? [],
          assetFlows: data.assetFlows ?? [],
          seeded: true
        }))
      }
    }) },
    {
      name: 'xiaoman-data',
      storage: createJSONStorage(() => userStorage),
      // 会话级标记不落盘，否则"过去同步过"会被误当成"本次已同步"
      partialize: (state) => {
        const { sessionSyncAt: _session, ...rest } = state
        return rest as LedgerState
      },
      merge: (persisted, current) => {
        const snapshot = { ...current, ...(persisted as Partial<LedgerState>) }
        snapshot.childCategories = snapshot.childCategories.map(normalizeBuiltInChild)
        // 历史数据：billShareInfo 是快照，正名为 billSnapshot
        snapshot.bills = (snapshot.bills ?? []).map((b) => {
          // 只有旧版对象形态的快照才迁移；JSON 字符串是一木的 AA 分摊，保持原样
          if (b.billSnapshot || !b.billShareInfo || typeof b.billShareInfo === 'string') return b
          const { billShareInfo, ...rest } = b
          return { ...rest, billSnapshot: billShareInfo }
        })
        return { ...snapshot, assets: deriveAssets(snapshot) }
      }
    }
  )
)

export const useTotalAssets = () =>
  useLedger((s) => {
    // 账户可带币种，汇总前统一折成本币
    const rateOf = (code?: string) => {
      if (!code || code === s.defaultCurrency) return 1
      const c = s.currencies.find((x) => x.code === code)
      return c && c.rate ? c.rate : 1
    }
    // 账本设了「不计入总资产」时，归属它的账户也不参与汇总
    const hiddenBooks = new Set(
      s.accountBooks.filter((b) => b.notShowStock).map((b) => String(b.bookId ?? ''))
    )
    return s.assets.filter((a) => !a.hide && a.intoTotalAsset)
      .filter((a) => a.bookId == null || !hiddenBooks.has(String(a.bookId)))
      .reduce((sum, a) => sum + a.assetNumber * rateOf(a.currency), 0)
  })
