import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AccountBook, Asset, Bill, Category } from './types'

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
  seeded: boolean

  addBill: (patch: Partial<Bill>) => Bill
  deleteBill: (billId: number) => void
  addAsset: (patch: Partial<Asset>) => void
  updateAsset: (asset: Asset) => void
  setBook: (id: number) => void
  seed: () => void
  reset: () => void
  exportAll: () => object
  importAll: (data: any) => void
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

      reset: () => set({ assets: [], bills: [], seeded: false }),

      exportAll: () => {
        const s = get()
        return {
          version: 1,
          exportedAt: new Date().toISOString(),
          accountBooks: s.accountBooks,
          assets: s.assets,
          bills: s.bills,
          parentCategories: s.parentCategories,
          childCategories: s.childCategories
        }
      },

      importAll: (data) => set((s) => ({
        accountBooks: data.accountBooks ?? s.accountBooks,
        assets: data.assets ?? [],
        bills: data.bills ?? [],
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
