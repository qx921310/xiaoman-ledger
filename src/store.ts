import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category, Transfer } from './types'
import type { ImportPlan } from './importer'

const NOW = () => Date.now()

function makeParents(): Category[] {
  const src: [number, string, 'expense' | 'income', string][] = [
    [100, '食品餐饮', 'expense', '#f97316'],
    [101, '出行交通', 'expense', '#3b82f6'],
    [102, '购物消费', 'expense', '#ec4899'],
    [103, '健康医疗', 'expense', '#10b981'],
    [104, '文化教育', 'expense', '#8b5cf6'],
    [105, '居家生活', 'expense', '#f59e0b'],
    [199, '其他', 'expense', '#94a3b8'],
    [200, '工资', 'income', '#22c55e'],
    [201, '收款', 'income', '#14b8a6'],
    [202, '理财收益', 'income', '#0ea5e9']
  ]
  return src.map(([id, name, kind, color], i) => ({
    id, name, parentId: 0, kind, color, positionWeight: i
  }))
}

function makeChildren(): Category[] {
  const src: [number, number, string][] = [
    [1001, 100, '三餐'], [1002, 100, '零食饮料'], [1003, 100, '外卖'],
    [1011, 101, '公交地铁'], [1012, 101, '打车'], [1013, 101, '加油'],
    [1021, 102, '日用品'], [1022, 102, '数码'],
    [1031, 103, '药品'], [1032, 103, '门诊'],
    [1041, 104, '书籍'], [1042, 104, '课程'],
    [1051, 105, '房租'], [1052, 105, '水电']
  ]
  return src.map(([id, parentId, name], i) => ({
    id, name, parentId, kind: 'expense' as const, color: '#cbd5e1', positionWeight: i
  }))
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
  seeded: boolean

  addBill: (patch: Partial<Bill>) => Bill
  deleteBill: (billId: number) => void
  updateBill: (billId: number, patch: Partial<Bill>) => void
  addTransfer: (patch: { fromAssetId: number; toAssetId: number; cost: number; serviceCharge?: number; time?: number; remark?: string }) => Transfer
  addAsset: (patch: Partial<Asset>) => void
  updateAsset: (asset: Asset) => void
  setBook: (id: number) => void
  seed: () => void
  reset: () => void
  exportAll: () => object
  importAll: (data: any) => void
  applyImport: (plan: ImportPlan) => void
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
      parentCategories: makeParents(),
      childCategories: makeChildren(),
      transfers: [],
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
        set({ bills: [bill, ...s.bills], assets })
        return bill
      },

      deleteBill: (billId) => set((s) => ({ bills: s.bills.filter((b) => b.billId !== billId) })),

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
      addTransfer: (patch) => {
        const s = get()
        let transferId = Math.floor(NOW() / 1000)
        while (s.transfers.some((t) => t.transferId === transferId)) transferId++
        const fee = Number(patch.serviceCharge ?? 0)
        const time = patch.time ?? NOW()
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
        } else {
          // 无手续费也要扣转出方的本金
          set((st) => ({
            assets: st.assets.map((a) => a.assetId === patch.fromAssetId
              ? { ...a, assetNumber: +(a.assetNumber - patch.cost).toFixed(2), updateTime: NOW() }
              : a)
          }))
        }

        set((st) => ({
          assets: st.assets.map((a) => a.assetId === patch.toAssetId
            ? { ...a, assetNumber: +(a.assetNumber + patch.cost).toFixed(2), updateTime: NOW() }
            : a)
        }))

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
        mk(0, 32.5, 100, 1001, 3, '午饭')
        mk(0, 128, 102, 1021, 1, '洗衣液和纸巾')
        mk(1, 6, 101, 1011, 3, '地铁')
        mk(2, 45, 104, 1041, 1, '一本书')
        mk(3, 3200, 105, 1051, 1, '房租')
        mk(4, 12000, 200, 0, 1, '月薪')
      },

      reset: () => set({ assets: [], bills: [], transfers: [], seeded: false }),

      exportAll: () => {
        const s = get()
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          accountBooks: s.accountBooks,
          assets: s.assets,
          bills: s.bills,
          transfers: s.transfers,
          parentCategories: s.parentCategories,
          childCategories: s.childCategories
        }
      },

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
          assets,
          bills: [...plan.bills, ...s.bills],
          transfers: [...plan.transfers, ...s.transfers],
          seeded: true
        }
      }),

      importAll: (data) => set((s) => ({
        accountBooks: data.accountBooks ?? s.accountBooks,
        assets: data.assets ?? [],
        bills: data.bills ?? [],
        transfers: data.transfers ?? [],
        parentCategories: data.parentCategories ?? s.parentCategories,
        childCategories: data.childCategories ?? s.childCategories,
        seeded: true
      }))
    }),
    { name: 'ledger-data-store' }
  )
)

export const useTotalAssets = () =>
  useLedger((s) => s.assets.filter((a) => !a.hide && a.intoTotalAsset)
    .reduce((sum, a) => sum + a.assetNumber, 0))
