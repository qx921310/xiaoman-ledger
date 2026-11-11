import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category, Currency, Cycle, Lend, Refund, Reimbursement, SyncIncoming, Tag, Transfer } from './types'
import type { ImportPlan } from './importer'
import { normalizeBuiltInChild, resolveBillChild, TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from './taxonomy'
import { getCurrentUid, userStorage } from './auth'
import { deriveAssets } from './balances'
import { newBillIdentity } from './identity'
import { lendRemaining } from './lend'
import { mergeRemote, type MergeableState } from './domain/sync-merge'
import { planCycles } from './domain/cycles'
import { dedupeCycleBills as dedupeBills } from './domain/cycle-dedupe'
import { mergeTaxonomyState } from './domain/taxonomy-merge'
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
  deleteTransfer: (transferId: number) => void
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
  addLend: (patch: { type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: number; interest?: number; repaymentAssetId?: number; time?: number; remark?: string; parentLendId?: number }) => void
  repayLend: (patch: { lendId: number; amount: number; repaymentAssetId?: number; time?: number }) => void
  deleteLend: (lendId: number) => void
  addRefund: (patch: { billId: string | number; number: number; assetId?: number; baseAmount?: number }) => void
  deleteRefund: (refundId: number) => void
  setBudget: (budget: Budget) => void
  removeBudget: (month: string, categoryId: number) => void
  deleteBill: (billId: string | number) => void
  restoreBill: (bill: Bill) => void
  duplicateBill: (billId: string | number) => void
  setBillShares: (billId: string | number, shares: import('./types').BillShare[]) => void
  updateBill: (billId: string | number, patch: Partial<Bill>) => void
  addTransfer: (patch: { fromAssetId: number; toAssetId: number; cost: number; toCost?: number; serviceCharge?: number; time?: number; remark?: string }) => Transfer
  updateTransfer: (transferId: number, patch: Partial<Pick<Transfer, 'fromAssetId' | 'toAssetId' | 'cost' | 'toCost' | 'serviceCharge' | 'time' | 'remark'>>) => void
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
  tombstone: (kind: string, id: string | number) => void
}

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
        if (!combined.assets || !combined.bills || !combined.parentCategories) return changes
        const assets = deriveAssets(combined).map(asset => {
          const previous = state.assets.find(a => a.assetId === asset.assetId)
          if (!previous) return asset
          const { assetNumber: _balance, updateTime: _time, ...metadata } = asset
          const { assetNumber: _oldBalance, updateTime: _oldTime, ...oldMetadata } = previous
          // A transaction changes the derived cache, not the version of opening balance.
          return JSON.stringify(metadata) === JSON.stringify(oldMetadata)
            ? { ...asset, updateTime: previous.updateTime } : asset
        })
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
      currencies: [
        { code: 'CNY', name: '人民币', symbol: '¥', rate: 1, positionWeight: 100 },
        { code: 'USD', name: '美元', symbol: '$', rate: 7.2, positionWeight: 90 },
        { code: 'EUR', name: '欧元', symbol: '€', rate: 7.8, positionWeight: 80 },
        { code: 'JPY', name: '日元', symbol: '¥', rate: 0.048, positionWeight: 70 },
        { code: 'HKD', name: '港币', symbol: 'HK$', rate: 0.92, positionWeight: 60 }
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
          childCategoryName: next.childCategoryId ? (resolveBillChild(next, s.childCategories)?.name ?? (old.billSnapshot ?? old.billShareInfo)?.childCategoryName ?? '') : '',
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
        let transferId = Math.floor(NOW() / 1000)
        while (s.transfers.some((t) => t.transferId === transferId)) transferId++
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
            time
          })
          billId = bill.billId
        }

        const t: Transfer = {
          transferId,
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
        const asset: Asset = {
          assetId: id,
          assetName: patch.assetName ?? '未命名账户',
          assetType: patch.assetType ?? 1,
          currency: patch.currency ?? s.defaultCurrency,
          assetNumber: Number(patch.assetNumber ?? 0),
          openingBalance: Number(patch.openingBalance ?? patch.assetNumber ?? 0),
          groupName: patch.groupName ?? '',
          hide: false,
          intoTotalAsset: true,
          positionWeight: s.assets.length,
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
      addLend: ({ type, assetId, counterparty, number, interest, repaymentAssetId, time, remark, parentLendId }) => set((s) => {
        const amt = Number(number) || 0
        if (amt <= 0 || !assetId) return {}
        // 借出/借入走 assetId；收回/还款优先走 repaymentAssetId
        const cashAsset = (type === 2 || type === 4) && repaymentAssetId ? repaymentAssetId : assetId
        const sign = type === 1 || type === 4 ? -1 : 1
        // 同一毫秒内连续登记会撞 id，顺延保证唯一（父记录与还款记录常在同一次点击内创建）
        let lendId = Date.now()
        while (s.lends.some((l) => l.lendId === lendId)) lendId++
        const rec: Lend = {
          lendId, type, assetId, counterparty: counterparty ?? '',
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
            { kind: 'lend', id: String(r.lendId), updatedAt: NOW() }]
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

      setBudget: (budget) => set((s) => {
        const rest = s.budgets.filter((b) => !(b.month === budget.month && b.categoryId === budget.categoryId))
        if (budget.amount > 0) return { budgets: [...rest, { ...budget, updateTime: NOW() }] }
        // 填 0 表示取消：要写墓碑，否则云端旧预算会再拉回来
        return {
          budgets: rest,
          tombstones: [...s.tombstones, { kind: 'budget', id: `${budget.month}:${budget.categoryId}`, updatedAt: NOW() }]
        }
      }),

      removeBudget: (month, categoryId) => set((s) => ({
        budgets: s.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId)),
        tombstones: [...s.tombstones, { kind: 'budget', id: `${month}:${categoryId}`, updatedAt: NOW() }]
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
        parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
        childCategories: TAXONOMY_CHILDREN
      }),

      exportAll: () => {
        const s = get()
        return {
          version: 2,
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
          currentBookId: s.currentBookId
        }
      },

      setLastSync: (t) => set({ lastSync: t }),
      setSessionSyncAt: (t) => set({ sessionSyncAt: t }),

      addTag: (patch) => {
        const parent = patch.parentTagId != null ? get().tags.find((t) => t.tagId === patch.parentTagId) : undefined
        const tag: Tag = {
          tagId: NOW() + Math.floor(Math.random() * 1000),
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
        let i = s.tags.length
        set((st) => ({
          tags: [...st.tags, ...missing.map((n) => ({
            tagId: NOW() + (i++),
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
          ...(data.version === 2 ? {
            tags: data.tags,
            currencies: data.currencies,
            defaultCurrency: data.defaultCurrency,
            tombstones: data.tombstones,
            currentBookId: data.currentBookId ?? s.currentBookId
          } : {}),
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
          if (b.billSnapshot || !b.billShareInfo) return b
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
