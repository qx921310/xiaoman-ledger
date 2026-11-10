import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category, Cycle, Lend, Refund, Reimbursement, Transfer } from './types'
import type { ImportPlan } from './importer'
import { TAXONOMY_CHILDREN, TAXONOMY_INCOME, TAXONOMY_PARENTS } from './taxonomy'
import { userStorage } from './auth'

const NOW = () => Date.now()

export interface Budget {
  /** 'YYYY-MM'，或 'all' 表示默认每月生效 */
  month: string
  /** 0 = 总预算 */
  categoryId: number
  amount: number
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
  addLend: (patch: { type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: number; time?: number; remark?: string }) => void
  deleteLend: (lendId: number) => void
  addRefund: (patch: { billId: number; number: number }) => void
  deleteRefund: (refundId: number) => void
  setBudget: (budget: Budget) => void
  removeBudget: (month: string, categoryId: number) => void
  deleteBill: (billId: number) => void
  updateBill: (billId: number, patch: Partial<Bill>) => void
  addTransfer: (patch: { fromAssetId: number; toAssetId: number; cost: number; serviceCharge?: number; time?: number; remark?: string }) => Transfer
  updateTransfer: (transferId: number, patch: Partial<Pick<Transfer, 'fromAssetId' | 'toAssetId' | 'cost' | 'serviceCharge' | 'time' | 'remark'>>) => void
  addAsset: (patch: Partial<Asset>) => void
  updateAsset: (asset: Asset) => void
  setBook: (id: number) => void
  seed: () => void
  reset: () => void
  exportAll: () => object
  importAll: (data: any) => void
  applyImport: (plan: ImportPlan) => void
  mergeTaxonomy: () => void
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
          files: [],
          userId: s.userId,
          updateTime: NOW(),
          // 冗余快照：改名不影响历史账单
          billShareInfo: {
            parentCategoryName: parent?.name ?? '',
            childCategoryName: child?.name ?? '',
            assetName: asset?.assetName ?? ''
          }
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
        const sign = s.parentCategories.find((p) => p.id === old.parentCategoryId)?.kind === 'income' ? 1 : -1
        return {
          bills: s.bills.filter((b) => b.billId !== billId),
          assets: s.assets.map((a) => a.assetId === old.assetId
            ? { ...a, assetNumber: +(a.assetNumber - sign * old.cost).toFixed(2), updateTime: NOW() }
            : a)
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

        // 1) 本金：转出方 -，转入方 +
        set((st) => ({
          assets: st.assets.map((a) => {
            if (a.assetId === patch.fromAssetId) return { ...a, assetNumber: +(a.assetNumber - patch.cost).toFixed(2), updateTime: NOW() }
            if (a.assetId === patch.toAssetId) return { ...a, assetNumber: +(a.assetNumber + patch.cost).toFixed(2), updateTime: NOW() }
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
            if (a.assetId === old.toAssetId) v -= old.cost
            return v === a.assetNumber ? a : { ...a, assetNumber: +v.toFixed(2), updateTime: NOW() }
          })
        }))

        get().addTransfer({
          fromAssetId: patch.fromAssetId ?? old.fromAssetId,
          toAssetId: patch.toAssetId ?? old.toAssetId,
          cost: patch.cost ?? old.cost,
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
        const back = t.cost + t.serviceCharge
        return {
          transfers: s.transfers.filter((x) => x.transferId !== transferId),
          assets: s.assets.map((a) => {
            if (a.assetId === t.fromAssetId) return { ...a, assetNumber: +(a.assetNumber + back).toFixed(2), updateTime: NOW() }
            if (a.assetId === t.toAssetId) return { ...a, assetNumber: +(a.assetNumber - t.cost).toFixed(2), updateTime: NOW() }
            return a
          })
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
            ? { ...b, isReimbursement: 0, reimbursementNum: 0, updateTime: NOW() } : b)
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

      deleteCycle: (cycleId) => set((s) => ({ cycles: s.cycles.filter((c) => c.cycleId !== cycleId) })),

      toggleCycle: (cycleId) => set((s) => ({
        cycles: s.cycles.map((c) => c.cycleId === cycleId ? { ...c, enabled: !c.enabled, updateTime: NOW() } : c)
      })),

      // 补生成所有到期未生成的周期账单；返回本次生成条数
      runCycles: () => {
        const s = get()
        const now = new Date()
        const todayDay = now.getDate()
        const cy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        let count = 0

        const pending = s.cycles.filter((c) => c.enabled).map((c) => {
          const start = new Date(c.startTime)
          const gen: string[] = []
          for (let d = new Date(start.getFullYear(), start.getMonth(), 1); ; d.setMonth(d.getMonth() + 1)) {
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const isCurrent = key === cy
            const due = isCurrent ? todayDay >= c.dayOfMonth : key < cy
            if (due && !c.generated.includes(key) && !gen.includes(key)) gen.push(key)
            if (key >= cy) break
          }
          return { c, gen }
        })

        const updated: Cycle[] = []
        for (const { c, gen } of pending) {
          for (const key of gen) {
            const [y, m] = key.split('-').map(Number)
            const time = new Date(y, m - 1, Math.min(c.dayOfMonth, 28), 9, 0, 0).getTime()
            // 直接落一条正常账单（周期记账 billType=4）
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
            count++
          }
          if (gen.length) updated.push({ ...c, generated: [...c.generated, ...gen], updateTime: NOW() })
        }
        if (updated.length) {
          const map = new Map(updated.map((u) => [u.cycleId, u]))
          set((st) => ({ cycles: st.cycles.map((c) => map.get(c.cycleId) ?? c) }))
        }
        return count
      },

      // 借出 -、借入 +、收回 +、还款 -；删除则反向冲正
      addLend: ({ type, assetId, counterparty, number, time, remark }) => set((s) => {
        const amt = Number(number) || 0
        if (amt <= 0 || !assetId) return {}
        const sign = type === 1 || type === 4 ? -1 : 1
        const rec: Lend = {
          lendId: Date.now(), type, assetId, counterparty: counterparty ?? '',
          number: amt, time: time ?? NOW(), remark: remark ?? '',
          userId: s.userId, updateTime: NOW()
        }
        return {
          lends: [rec, ...s.lends],
          assets: s.assets.map((a) => a.assetId === assetId
            ? { ...a, assetNumber: +(a.assetNumber + sign * amt).toFixed(2), updateTime: NOW() } : a)
        }
      }),

      deleteLend: (lendId) => set((s) => {
        const rec = s.lends.find((x) => x.lendId === lendId)
        if (!rec) return {}
        const sign = rec.type === 1 || rec.type === 4 ? 1 : -1
        return {
          lends: s.lends.filter((x) => x.lendId !== lendId),
          assets: s.assets.map((a) => a.assetId === rec.assetId
            ? { ...a, assetNumber: +(a.assetNumber + sign * rec.number).toFixed(2), updateTime: NOW() } : a)
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
        budgets: s.budgets.filter((b) => !(b.month === month && b.categoryId === categoryId))
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

      // 补齐内置分类（缺失的加上），并把老数据里的 emoji 图标迁移成图标键
      mergeTaxonomy: () => set((s) => {
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
        const fix = (c: Category): Category => {
          if (c.icon?.startsWith('ic_')) return c
          const t = byName.get(`${c.name}|${c.kind}`)
          return t ? { ...c, icon: t.icon, color: t.color, bg: t.bg } : c
        }
        const parents = s.parentCategories.map(fix)
        const children = s.childCategories.map(fix)

        if (!addP.length && !addC.length) {
          const changed = parents.some((c, i) => c !== s.parentCategories[i])
            || children.some((c, i) => c !== s.childCategories[i])
          return changed ? { parentCategories: parents, childCategories: children } : {}
        }
        return {
          parentCategories: [...parents, ...addP],
          childCategories: [...children, ...addC]
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
  useLedger((s) => s.assets.filter((a) => !a.hide && a.intoTotalAsset)
    .reduce((sum, a) => sum + a.assetNumber, 0))
