import type { SplitMember, SplitShareEntry } from '../types'

/** 一木 splitType 的三档文案 */
export const SPLIT_TYPES = ['均分', '按金额', '按份额'] as const
export type SplitType = 0 | 1 | 2

/** 解析账单里的 billShareInfo（一木存 JSON 字符串） */
export function parseShares(raw: unknown): SplitShareEntry[] {
  if (typeof raw !== 'string') return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter((x) => x && typeof x.memberId === 'number')
      .map((x) => ({ memberId: Number(x.memberId), value: Number(x.value) || 0 }))
  } catch {
    return []
  }
}

export function serializeShares(list: SplitShareEntry[]): string {
  return JSON.stringify(list.map((x) => ({ memberId: x.memberId, value: x.value })))
}

/**
 * 按一木规则生成每人的应付金额：
 * - 0 均分：每人 value=1，金额等分，尾差给最后一人
 * - 1 按金额：value 就是金额，合计必须等于总额
 * - 2 按份额：value 是份数，按份数占比分配
 */
export function splitAmounts(total: number, members: SplitMember[], type: SplitType, values: Record<number, number>): {
  shares: SplitShareEntry[]
  amounts: Record<number, number>
} {
  const shares: SplitShareEntry[] = []
  const amounts: Record<number, number> = {}
  if (!members.length || !Number.isFinite(total)) return { shares, amounts }

  if (type === 0) {
    const each = Math.floor((total / members.length) * 100) / 100
    members.forEach((m, i) => {
      shares.push({ memberId: m.splitMemberId, value: 1 })
      amounts[m.splitMemberId] = i === members.length - 1
        ? +(total - each * (members.length - 1)).toFixed(2) : each
    })
    return { shares, amounts }
  }

  const weights = members.map((m) => (type === 1 ? Number(values[m.splitMemberId]) || 0 : Number(values[m.splitMemberId]) || 0))
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return { shares, amounts }
  // 按金额时必须精确到分：先转成分再比，避免 0.01 容差放过错误输入
  if (type === 1) {
    const toCents = (n: number) => Math.round(n * 100)
    if (toCents(sum) !== toCents(total)) return { shares, amounts }
  }

  let allocated = 0
  members.forEach((m, i) => {
    shares.push({ memberId: m.splitMemberId, value: weights[i] })
    if (i === members.length - 1) {
      amounts[m.splitMemberId] = +(total - allocated).toFixed(2)
    } else {
      const amt = type === 1 ? +weights[i].toFixed(2) : Math.floor((total * weights[i] / sum) * 100) / 100
      amounts[m.splitMemberId] = amt
      allocated = +(allocated + amt).toFixed(2)
    }
  })
  return { shares, amounts }
}

/** 我该收/该付多少：总额 - 我的应付 */
export function myShare(total: number, members: SplitMember[], amounts: Record<number, number>): number {
  const me = members.find((m) => m.self)
  if (!me) return 0
  return +(total - (amounts[me.splitMemberId] ?? 0)).toFixed(2)
}
