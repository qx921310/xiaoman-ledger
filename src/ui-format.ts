// 金额与时间格式化（从 App.tsx 抽出，纯函数）
export const money = (n: number) => '¥' + (n < 0 ? '-' : '') + Math.abs(n).toFixed(2)
export const pad = (n: number) => String(n).padStart(2, '0')
export const monthOf = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** 完整本地日期键 YYYY-MM-DD，用于分组与 humanDay */
export const fullDay = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const dayOf = (t: number) => {
  const d = new Date(t)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
export const hhmm = (t: number) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const toLocalInput = (t: number) => {
  const d = new Date(t - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

/** 日期分组标题：今天 / 昨天 / 2026年11月9日 周日（一木的日期头写法） */
export function humanDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  const today = new Date()
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (sameDay(date, today)) return '今天'
  if (sameDay(date, yesterday)) return '昨天'
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]
  return `${y}年${m}月${d}日 ${week}`
}
