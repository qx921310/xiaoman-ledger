import type { Cycle } from './types'

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 列出规则从 startTime 到 until（默认今天）的全部到期日 —— runCycles 与界面共用同一套算法 */
export function cycleDueDates(c: Cycle, until: Date = new Date()): Date[] {
  const today = new Date(until)
  today.setHours(23, 59, 59, 999)
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
    return out
  }
  if (type === 'year') {
    const m = (c.monthOfYear ?? 1) - 1
    for (let y = start.getFullYear(); y <= today.getFullYear(); y++) {
      const days = c.monthLast ? [new Date(y, m + 1, 0).getDate()]
        : (c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth])
      for (const day of days) push(new Date(y, m, Math.min(day, 28)))
    }
    return out
  }
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= today; d.setMonth(d.getMonth() + 1)) {
    const y = d.getFullYear(), m = d.getMonth()
    if (c.monthLast) { push(new Date(y, m + 1, 0)); continue }
    const days = c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth]
    for (const day of days) push(new Date(y, m, Math.min(day, 28)))
  }
  return out
}

/** 已处理过的日期：已生成 + 手动跳过 */
export function handledDates(c: Cycle): Set<string> {
  return new Set([...(c.generated ?? []), ...(c.skipDates ?? [])])
}

/** 尚未处理的到期日 */
export function pendingDates(c: Cycle, until?: Date): Date[] {
  const handled = handledDates(c)
  return cycleDueDates(c, until).filter((d) => !handled.has(dateKey(d)))
}
