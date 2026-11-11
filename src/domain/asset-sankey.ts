import type { Asset, Currency } from '../types'

/** 一木 AssetSankeyActivity 的五大类（顺序与它一致） */
export const SANKEY_GROUPS = ['流动资产', '固定资产', '无形资产', '应收款', '投资资产'] as const
export type SankeyGroup = (typeof SANKEY_GROUPS)[number]

/** 账户类型 → 桑基分类（对应一木 Z() 的映射，按我们自己的类型号） */
export function sankeyGroupOf(assetType: number): SankeyGroup {
  if (assetType === 6) return '应收款'      // 一木 type 6 = 应收款
  if (assetType === 5) return '固定资产'    // 一木 type 5 = 固定资产
  if (assetType === 4) return '投资资产'
  if (assetType === 9) return '无形资产'
  return '流动资产'
}

export interface SankeyNode {
  name: string
  group: SankeyGroup
  amount: number
}

export interface SankeyResult {
  nodes: SankeyNode[]
  groups: Array<{ group: SankeyGroup; amount: number; items: SankeyNode[] }>
  total: number
}

/**
 * 生成资产桑基数据：只统计「计入总资产且未隐藏」的账户，负数（信用卡/负债）不参与构图，
 * 与一木「|assetNumber| >= 0.005 才画」的过滤一致。
 */
export function buildAssetSankey(assets: Asset[], currencies: Currency[], defaultCurrency: string): SankeyResult {
  const rateOf = (code?: string) => {
    if (!code || code === defaultCurrency) return 1
    const c = currencies.find((x) => x.code === code)
    return c && c.rate ? c.rate : 1
  }
  const nodes: SankeyNode[] = []
  for (const a of assets) {
    if (a.hide || a.intoTotalAsset === false) continue
    const amount = a.assetNumber * rateOf(a.currency)
    if (Math.abs(amount) < 0.005) continue
    if (amount <= 0) continue
    nodes.push({ name: a.simpleName || a.assetName, group: sankeyGroupOf(a.assetType), amount: +amount.toFixed(2) })
  }
  const groups = SANKEY_GROUPS
    .map((g) => {
      const items = nodes.filter((n) => n.group === g).sort((a, b) => b.amount - a.amount)
      return { group: g, amount: +items.reduce((s, n) => s + n.amount, 0).toFixed(2), items }
    })
    .filter((g) => g.items.length > 0)
  const total = +groups.reduce((s, g) => s + g.amount, 0).toFixed(2)
  return { nodes, groups, total }
}
