import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category, Currency, Cycle, Lend, Refund, Reimbursement, Tag, Transfer } from './types'
import type { ImportPlan } from './importer'
import { TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from './taxonomy'
import { userStorage } from './auth'

const NOW = () => Date.now()

export interface Budget {
  /** 'YYYY-MM'，或 'all' 表示默认生效 */
  month: string
  /** 0 = 总预算 */
  categoryId: number
  /** 基础额度 */
  amount: number
  /** 追加额度（叠加在基础额度上） */
  addNum?: number
  /** 预算周期：month 按月 / year 按年 */
  type?: 'month' | 'year'
}

interface LedgerState {
  userId: number
  token: string | null
  currentBookId: number
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
  tombstones: { kind: string; id: string; updatedAt: number }[]
  lastSync: number
  /** 上次使用的分类/账户，用于快速记账 */
  lastParentId: number
  lastChildId: number
  lastAssetId: number
  seeded: boolean

  addBill: (patch: Partial<Bill>) => Bill
  deleteTransfer: (transferId: number) => void
  addReimbursement: (patch: { billId: number; assetId: number; number: number; detail?: string }) => void
  settleReimbursement: (reimbursementId: number) => void
  deleteReimbursement: (reimbursementId: number) => void
  addCycle: (patch: Omit<Cycle, 'cycleId' | 'generated' | 'userId' | 'updateTime' | 'enabled'> & { enabled?: boolean }) => void
  deleteCycle: (cycleId: number) => void
  toggleCycle: (cycleId: number) => void
  runCycles: () => number
  addLend: (patch: { type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: number; interest?: number; repaymentAssetId?: number; time?: number; remark?: string }) => void
  deleteLend: (lendId: number) => void
  addRefund: (patch: { billId: number; number: number }) => void
  deleteRefund: (refundId: number) => void
  setBudget: (budget: Budget) => void
  removeBudget: (month: string, categoryId: number) => void
  deleteBill: (billId: number) => void
  updateBill: (billId: number, patch: Partial<Bill>) => void
  addTransfer: (patch: { fromAssetId: number; toAssetId: number; cost: number; toCost?: number; serviceCharge?: number; time?: number; remark?: string }) => Transfer
  updateTransfer: (transferId: number, patch: Partial<Pick<Transfer, 'fromAssetId' | 'toAssetId' | 'cost' | 'toCost' | 'serviceCharge' | 'time' | 'remark'>>) => void
  addAsset: (patch: Partial<Asset>) => void
  updateAsset: (asset: Asset) => void
  setBook: (id: number) => void
  seed: () => void
  reset: () => void
  exportAll: () => object
  importAll: (data: any) => void
  applyImport: (plan: ImportPlan) => void
  mergeTaxonomy: () => void
  addTag: (patch: Omit<Tag, 'tagId' | 'positionWeight'> & { positionWeight?: number }) => Tag
  updateTag: (tagId: number, patch: Partial<Tag>) => void
  deleteTag: (tagId: number) => void
  ensureTags: (names: string[]) => number
  setCurrencyRate: (code: string, rate: number) => void
  addCurrency: (c: Currency) => void
  removeCurrency: (code: string) => void
  applyRemote: (records: any[]) => void
  setLastSync: (t: number) => void
  tombstone: (kind: string, id: string | number) => void
}

export const useLedger = create<LedgerState>()(
  persist(
    (set, get) => ({
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
      lastParentId: 7,
      lastChildId: 0,
      lastAssetId: 0,
      seeded: false,

      addBill: (patch) => {
        const s = get()
        // 与用户端一致：billId 用秒级时间戳，冲突时递增
        let billId = patch.billId ?? Math.floor(NOW() / 1000)
        while (s.bills.some((b) => b.billId === billId)) billId++
        const parent = s.parentCategories.find((c) => c.id === patch.parentCategoryId)
        const child = s.childCategories.find((c) => c.id === patch.childCategoryId)
        const asset = s.assets.find((a) => a.assetId === patch.assetId)
        const bill: Bill = {
          billId,
          time: patch.time ?? NOW(),
          cost: Number(patch.cost ?? 0),
          parentCategoryId: patch.parentCategoryId ?? 199,
          childCategoryId: patch.childCategoryId ?? 0,
          assetId: patch.assetId ?? 0,
          bookId: patch.bookId ?? s.currentBookId,
          remark: patch.remark ?? '',
          billType: patch.billType ?? 2,
          tags: patch.tags ?? [],
          userId: s.userId,
          updateTime: NOW(),
          // 冗余快照：改名不影响历史账单
          billShareInfo: {
            parentCategoryName: parent?.name ?? '',
            childCategoryName: child?.name ?? '',
            assetName: asset?.assetName ?? ''
          },
          // 可选字段原样透传（多币种、标记、地址、附件等）
          files: patch.files ?? [],
          currencyInfo: patch.currencyInfo,
          currencyAssetNumber: patch.currencyAssetNumber,
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
        const tomb = { kind: 'bill', id: String(billId), updatedAt: NOW() }
        const old = s.bills.find((b) => b.billId === billId)
        if (!old) return {}
        const sign = s.parentCategories.find((p) => p.id === old.parentCategoryId)?.kind === 'income' ? 1 : -1
        return {
          bills: s.bills.filter((b) => b.billId !== billId),
          assets: s.assets.map((a) => a.assetId === old.assetId
            ? { ...a, assetNumber: +(a.assetNumber - sign * old.cost).toFixed(2), updateTime: NOW() }
            : a),
          tombstones: [...s.tombstones, tomb]
        }
      }),

      // 改单：先把旧账单对账户的影响撤回，再按新值重新记一次
      updateBill: (billId, patch) => {
        const s = get()
        const old = s.bills.find((b) => b.billId === billId)
        if (!old) return
        const deltaOf = (b: Bill) =>
          (s.parentCategories.find((p) => p.id === b.parentCategoryId)?.kind === 'income' ? 1 : -1) * b.cost

        let assets = s.assets.map((a) => a.assetId === old.assetId
          ? { ...a, assetNumber: +(a.assetNumber - deltaOf(old)).toFixed(2) }
          : a)

        const next: Bill = { ...old, ...patch, updateTime: NOW() }
        const parent = s.parentCategories.find((p) => p.id === next.parentCategoryId)
        const asset = s.assets.find((a) => a.assetId === next.assetId)
        next.billShareInfo = {
          parentCategoryName: parent?.name ?? '',
          childCategoryName: s.childCategories.find((c) => c.id === next.childCategoryId)?.name ?? '',
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
        let billId = 0
        if (fee > 0) {
          const bill = get().addBill({
            cost: fee,
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

      addAsset: (patch) => set((s) => {
        const id = patch.assetId ?? NOW()
        const asset: Asset = {
          assetId: id,
          assetName: patch.assetName ?? '未命名账户',
          assetType: patch.assetType ?? 1,
          assetNumber: Number(patch.assetNumber ?? 0),
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
        // 撤销：转出方退回本金+手续费，转入方扣回到账金额；连带删掉手续费账单
        const back = t.cost + t.serviceCharge
        const toBack = t.toCost ?? t.cost
        return {
          transfers: s.transfers.filter((x) => x.transferId !== transferId),
          bills: t.billId ? s.bills.filter((b) => b.billId !== t.billId) : s.bills,
          assets: s.assets.map((a) => {
            if (a.assetId === t.fromAssetId) return { ...a, assetNumber: +(a.assetNumber + back).toFixed(2), updateTime: NOW() }
            if (a.assetId === t.toAssetId) return { ...a, assetNumber: +(a.assetNumber - toBack).toFixed(2), updateTime: NOW() }
            return a
          }),
          tombstones: [...s.tombstones, { kind: 'transfer', id: String(transferId), updatedAt: NOW() }]
        }
      }),

      // 登记报销：只落记录，钱还没到；确认到账时才进报销账户
      addReimbursement: ({ billId, assetId, number, detail }) => set((s) => {
        const rid = Date.now()
        const rec: Reimbursement = {
          reimbursementId: rid, billId, assetId, number: Number(number) || 0,
          detail: detail ?? '', status: 'pending', userId: s.userId, updateTime: NOW()
        }
        const bill = s.bills.find((b) => b.billId === billId)
        return {
          reimbursements: [rec, ...s.reimbursements],
          bills: bill ? s.bills.map((b) => b.billId === billId
            ? { ...b, isReimbursement: 1, reimbursementNum: rec.number, updateTime: NOW() } : b) : s.bills
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

      deleteReimbursement: (reimbursementId) => set((s) => {
        const rec = s.reimbursements.find((r) => r.reimbursementId === reimbursementId)
        if (!rec) return {}
        const refundBack = rec.status === 'done' ? rec.number : 0
        return {
          reimbursements: s.reimbursements.filter((r) => r.reimbursementId !== reimbursementId),
          assets: refundBack ? s.assets.map((a) => a.assetId === rec.assetId
            ? { ...a, assetNumber: +(a.assetNumber - refundBack).toFixed(2), updateTime: NOW() } : a) : s.assets,
          bills: s.bills.map((b) => b.billId === rec.billId
            ? { ...b, isReimbursement: 0, reimbursementNum: 0, updateTime: NOW() } : b),
          tombstones: [...s.tombstones, { kind: 'reimbursement', id: String(reimbursementId), updatedAt: NOW() }]
        }
      }),

      addCycle: (patch) => set((s) => ({
        cycles: [...s.cycles, {
          ...patch,
          cycleId: NOW(),
          enabled: patch.enabled ?? true,
          generated: [],
          userId: s.userId,
          updateTime: NOW()
        } as Cycle]
      })),

      deleteCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.filter((c) => c.cycleId !== cycleId),
        tombstones: [...s.tombstones, { kind: 'cycle', id: String(cycleId), updatedAt: NOW() }]
      })),

      toggleCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId ? { ...c, enabled: !c.enabled, updateTime: NOW() } : c)
      })),

      // 补生成所有到期未生成的周期账单；返回本次生成条数
      runCycles: () => {
        const s = get()
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const dkey = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

        /** 列出规则从 startTime 到今天的全部到期日 */
        const dueDates = (c: Cycle): Date[] => {
          const start = new Date(c.startTime)
          start.setHours(0, 0, 0, 0)
          const out: Date[] = []
          const push = (d: Date) => { if (d >= start && d <= today) out.push(d) }
          const type = c.cycleType ?? 'month'

          if (type === 'week') {
            const days = (c.weekdays && c.weekdays.length ? c.weekdays : [1]).map(Number)
            for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
              if (days.includes(d.getDay())) push(new Date(d))
            }
          } else if (type === 'year') {
            const m = (c.monthOfYear ?? 1) - 1
            for (let y = start.getFullYear(); y <= today.getFullYear(); y++) {
              const days = c.monthLast
                ? [new Date(y, m + 1, 0).getDate()]
                : (c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth])
              for (const day of days) push(new Date(y, m, Math.min(day, 28)))
            }
          } else {
            // 每月
            for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= today; d.setMonth(d.getMonth() + 1)) {
              const y = d.getFullYear(), m = d.getMonth()
              if (c.monthLast) { push(new Date(y, m + 1, 0)); continue }
              const days = c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth]
              for (const day of days) push(new Date(y, m, Math.min(day, 28)))
            }
          }
          return out
        }

        let count = 0
        const updated: Cycle[] = []

        for (const c of s.cycles.filter((x) => x.enabled)) {
          const done = new Set(c.generated)
          const fresh = dueDates(c).filter((d) => !done.has(dkey(d)))
          for (const d of fresh) {
            const time = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0).getTime()
            const t = get()
            let billId = Math.floor(time / 1000)
            while (t.bills.some((b) => b.billId === billId)) billId++
            const parent = t.parentCategories.find((p) => p.id === c.parentCategoryId)
            const asset = t.assets.find((a) => a.assetId === c.assetId)
            const bill: Bill = {
              billId, time, cost: c.cost,
              parentCategoryId: c.parentCategoryId, childCategoryId: c.childCategoryId,
              assetId: c.assetId, bookId: t.currentBookId || 1,
              remark: c.remark || c.name, billType: 4,
              tags: [], files: [], userId: t.userId, updateTime: NOW(),
              billShareInfo: {
                parentCategoryName: parent?.name ?? '',
                childCategoryName: t.childCategories.find((x) => x.id === c.childCategoryId)?.name ?? '',
                assetName: asset?.assetName ?? ''
              }
            }
            const sign = parent?.kind === 'income' ? 1 : -1
            set((st) => ({
              bills: [bill, ...st.bills],
              assets: st.assets.map((a) => a.assetId === c.assetId
                ? { ...a, assetNumber: +(a.assetNumber + sign * c.cost).toFixed(2), updateTime: NOW() } : a)
            }))
            done.add(dkey(d))
            count++
          }
          if (fresh.length) updated.push({ ...c, generated: [...done], updateTime: NOW() })
        }

        if (updated.length) {
          const map = new Map(updated.map((u) => [u.cycleId, u]))
          set((st) => ({ cycles: st.cycles.map((c) => map.get(c.cycleId) ?? c) }))
        }
        return count
      },

      // 借出 -、借入 +、收回 +、还款 -；删除则反向冲正
      addLend: ({ type, assetId, counterparty, number, interest, repaymentAssetId, time, remark }) => set((s) => {
        const amt = Number(number) || 0
        if (amt <= 0 || !assetId) return {}
        // 借出/借入走 assetId；收回/还款优先走 repaymentAssetId
        const cashAsset = (type === 2 || type === 4) && repaymentAssetId ? repaymentAssetId : assetId
        const sign = type === 1 || type === 4 ? -1 : 1
        const rec: Lend = {
          lendId: Date.now(), type, assetId, counterparty: counterparty ?? '',
          number: amt,
          interest: Number(interest) || 0,
          repaymentAssetId: repaymentAssetId || undefined,
          time: time ?? NOW(), remark: remark ?? '',
          userId: s.userId, updateTime: NOW()
        }
        return {
          lends: [rec, ...s.lends],
          assets: s.assets.map((a) => a.assetId === cashAsset
            ? { ...a, assetNumber: +(a.assetNumber + sign * amt).toFixed(2), updateTime: NOW() } : a)
        }
      }),

      deleteLend: (lendId) => set((s) => {
        const rec = s.lends.find((x) => x.lendId === lendId)
        if (!rec) return {}
        const sign = rec.type === 1 || rec.type === 4 ? 1 : -1
        const cashAsset = (rec.type === 2 || rec.type === 4) && rec.repaymentAssetId ? rec.repaymentAssetId : rec.assetId
        return {
          lends: s.lends.filter((x) => x.lendId !== lendId),
          assets: s.assets.map((a) => a.assetId === cashAsset
            ? { ...a, assetNumber: +(a.assetNumber + sign * rec.number).toFixed(2), updateTime: NOW() } : a),
          tombstones: [...s.tombstones, { kind: 'lend', id: String(lendId), updatedAt: NOW() }]
        }
      }),

      // 退款：钱退回原支付账户，直接冲减这笔支出
      addRefund: ({ billId, number }) => set((s) => {
        const bill = s.bills.find((b) => b.billId === billId)
        if (!bill) return {}
        const amt = Number(number) || 0
        if (amt <= 0) return {}
        const rec: Refund = {
          refundId: Date.now(), billId, number: amt, userId: s.userId, updateTime: NOW()
        }
        return {
          refunds: [rec, ...s.refunds],
          bills: s.bills.map((b) => b.billId === billId ? { ...b, refundNum: amt, updateTime: NOW() } : b),
          assets: s.assets.map((a) => a.assetId === bill.assetId
            ? { ...a, assetNumber: +(a.assetNumber + amt).toFixed(2), updateTime: NOW() } : a)
        }
      }),

      deleteRefund: (refundId) => set((s) => {
        const rec = s.refunds.find((r) => r.refundId === refundId)
        if (!rec) return {}
        const bill = s.bills.find((b) => b.billId === rec.billId)
        return {
          refunds: s.refunds.filter((r) => r.refundId !== refundId),
          tombstones: [...s.tombstones, { kind: 'refund', id: String(refundId), updatedAt: NOW() }],
          bills: s.bills.map((b) => b.billId === rec.billId ? { ...b, refundNum: 0, updateTime: NOW() } : b),
          assets: bill ? s.assets.map((a) => a.assetId === bill.assetId
            ? { ...a, assetNumber: +(a.assetNumber - rec.number).toFixed(2), updateTime: NOW() } : a) : s.assets
        }
      }),

      setBudget: (budget) => set((s) => {
        const rest = s.budgets.filter((b) => !(b.month === budget.month && b.categoryId === budget.categoryId))
        return { budgets: budget.amount > 0 ? [...rest, budget] : rest }
      }),

      removeBudget: (month, categoryId) => set((s) => ({
        budgets: s.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId)),
        tombstones: [...s.tombstones, { kind: 'budget', id: `${month}:${categoryId}`, updatedAt: NOW() }]
      })),

      updateAsset: (asset) => set((s) => ({
        assets: s.assets.map((a) => a.assetId === asset.assetId ? { ...asset, updateTime: NOW() } : a)
      })),

      setBook: (id) => set({ currentBookId: id }),

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
        assets: [], bills: [], transfers: [], budgets: [],
        reimbursements: [], refunds: [], lends: [], cycles: [], seeded: false,
        parentCategories: [...TAXONOMY_PARENTS, ...TAXONOMY_INCOME],
        childCategories: TAXONOMY_CHILDREN
      }),

      exportAll: () => {
        const s = get()
        return {
          version: 1,
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
          childCategories: s.childCategories
        }
      },

      setLastSync: (t) => set({ lastSync: t }),

      addTag: (patch) => {
        const tag: Tag = {
          tagId: NOW() + Math.floor(Math.random() * 1000),
          name: patch.name,
          color: patch.color || '#FED778',
          parentName: patch.parentName || undefined,
          positionWeight: patch.positionWeight ?? 0
        }
        set((s) => ({ tags: [...s.tags, tag] }))
        return tag
      },

      updateTag: (tagId, patch) => set((s) => ({
        tags: s.tags.map((t) => t.tagId === tagId ? { ...t, ...patch } : t)
      })),

      deleteTag: (tagId) => set((s) => ({ tags: s.tags.filter((t) => t.tagId !== tagId) })),

      // 导入/输入时按名字补齐标签实体，返回补齐数量
      ensureTags: (names) => {
        const s = get()
        const have = new Set(s.tags.map((t) => t.name))
        const missing = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) => !have.has(n))
        if (!missing.length) return 0
        const palette = ['#FED778', '#F8C8B0', '#CFE3F7', '#D9F0C8', '#E6D9F7', '#F7D9E6']
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

      // 合并云端记录：逐条 last-write-wins，删除墓碑生效
      applyRemote: (records) => set((s: any) => {
        const next: any = {}
        const tombstones = [...s.tombstones]
        const spec: Record<string, [string, string]> = {
          bill: ['bills', 'billId'], asset: ['assets', 'assetId'], transfer: ['transfers', 'transferId'],
          lend: ['lends', 'lendId'], cycle: ['cycles', 'cycleId'],
          parent: ['parentCategories', 'id'], child: ['childCategories', 'id'],
          book: ['accountBooks', 'accountBookId'],
          reimbursement: ['reimbursements', 'reimbursementId'], refund: ['refunds', 'refundId'],
          budget: ['budgets', 'month']
        }
        const idOf = (kind: string, item: any) =>
          kind === 'budget' ? `${item.month}:${item.categoryId}` : String(item[spec[kind][1]])

        for (const r of records || []) {
          const k = spec[r.kind]
          if (!k) continue
          const arr: any[] = next[k[0]] ?? [...(s[k[0]] || [])]
          if (r.deleted) {
            next[k[0]] = arr.filter((x) => idOf(r.kind, x) !== String(r.id))
            if (!tombstones.some((t) => t.kind === r.kind && t.id === String(r.id))) {
              tombstones.push({ kind: r.kind, id: String(r.id), updatedAt: r.updatedAt || NOW() })
            }
            continue
          }
          if (!r.payload) continue
          const idx = arr.findIndex((x) => idOf(r.kind, x) === String(r.id))
          const localTime = idx >= 0 ? (arr[idx].updateTime ?? 0) : -1
          if (idx < 0 || (r.updatedAt ?? 0) > localTime) {
            if (idx >= 0) arr[idx] = r.payload
            else arr.push(r.payload)
          }
          next[k[0]] = arr
        }
        return { ...next, tombstones }
      }),

      // 补齐内置分类（缺失的加上），并把老数据里的 emoji 图标迁移成图标键
      mergeTaxonomy: () => set((s) => {
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
        if (!addP.length && !addC.length) {
          const changed = parents.some((c, i) => c !== s.parentCategories[i])
            || children.some((c, i) => c !== s.childCategories[i])
          if (!changed && !ratesFixed) return {}
          return { parentCategories: parents, childCategories: children, ...(ratesFixed ? { currencies } : {}) }
        }
        return {
          parentCategories: [...parents, ...addP],
          childCategories: [...children, ...addC],
          ...(ratesFixed ? { currencies } : {})
        }
      }),

      // 合并式导入：新增分类/账户先落地，账单像正常记账一样冲账户余额
      applyImport: (plan) => set((s) => {
        const parents = [...s.parentCategories, ...plan.newParents]
        let assets = [...s.assets, ...plan.newAssets]

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

      importAll: (data) => set((s) => ({
        accountBooks: data.accountBooks ?? s.accountBooks,
        assets: data.assets ?? [],
        bills: data.bills ?? [],
        transfers: data.transfers ?? [],
        budgets: data.budgets ?? [],
        reimbursements: data.reimbursements ?? [],
        refunds: data.refunds ?? [],
        lends: data.lends ?? [],
        cycles: data.cycles ?? [],
        parentCategories: data.parentCategories ?? s.parentCategories,
        childCategories: data.childCategories ?? s.childCategories,
        seeded: true
      }))
    }),
    { name: 'xiaoman-data', storage: createJSONStorage(() => userStorage) }
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
    return s.assets.filter((a) => !a.hide && a.intoTotalAsset)
      .reduce((sum, a) => sum + a.assetNumber * rateOf(a.currency), 0)
  })
