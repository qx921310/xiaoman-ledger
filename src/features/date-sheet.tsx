import { useMemo, useRef, useState } from 'react'
import { Solar } from 'lunar-typescript'

/** 一木的日期弹层：月历 + 农历 + 时间滚轮 + 取消/确定 */
const WEEK = ['一', '二', '三', '四', '五', '六', '日']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function lunarLabel(date: Date): string {
  const lunar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate()).getLunar()
  const day = lunar.getDayInChinese()
  return day === '初一' ? lunar.getMonthInChinese() + '月' : day
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function DateSheet({ value, onCancel, onConfirm }: {
  value: string
  onCancel: () => void
  onConfirm: (next: string) => void
}) {
  const initial = useMemo(() => {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed
  }, [value])
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1))
  const [picked, setPicked] = useState(initial)
  const [hour, setHour] = useState(initial.getHours())
  const [minute, setMinute] = useState(initial.getMinutes())
  const [timeOpen, setTimeOpen] = useState(true)
  const hourRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLDivElement>(null)

  const today = new Date()
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7 // 周一开头
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const list: Array<Date | null> = Array.from({ length: offset }, () => null)
    for (let d = 1; d <= total; d += 1) list.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [cursor])

  const shiftMonth = (delta: number) => {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const confirm = () => {
    const next = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), hour, minute)
    onConfirm(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(hour)}:${pad(minute)}`)
  }

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, index: number) => {
    requestAnimationFrame(() => {
      const box = ref.current
      if (!box) return
      const item = box.children[index] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'center' })
    })
  }

  return (
    <div className="ds-mask" onClick={onCancel}>
      <div className="ds-card" role="dialog" aria-label="选择日期" onClick={(e) => e.stopPropagation()}>
        <div className="ds-head">
          <button type="button" className="ds-nav" aria-label="上个月" onClick={() => shiftMonth(-1)}>‹</button>
          <div className="ds-title">
            <b>{cursor.getMonth() + 1}月</b>
            <small>{cursor.getFullYear()}</small>
          </div>
          <button type="button" className="ds-nav" aria-label="下个月" onClick={() => shiftMonth(1)}>›</button>
        </div>

        <div className="ds-week">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>

        <div className="ds-grid">
          {cells.map((date, index) => {
            if (!date) return <span key={`e${index}`} className="ds-cell empty" />
            const future = date.getTime() > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59).getTime()
            const isToday = sameDay(date, today)
            const isPicked = sameDay(date, picked)
            return (
              <button key={date.toISOString()} type="button" disabled={future}
                className={'ds-cell' + (isToday ? ' today' : '') + (isPicked && !isToday ? ' picked' : '')}
                onClick={() => setPicked(date)}>
                <b>{date.getDate()}</b>
                <small>{future ? '' : lunarLabel(date)}</small>
              </button>
            )
          })}
        </div>

        <button type="button" className="ds-time" onClick={() => {
          const next = !timeOpen
          setTimeOpen(next)
          if (next) { scrollTo(hourRef, hour); scrollTo(minuteRef, minute) }
        }}>
          <span className="ds-clock" aria-hidden="true">◷</span>
          <span>设置时间</span>
          <span className={'ds-arrow' + (timeOpen ? ' up' : '')} aria-hidden="true">›</span>
        </button>

        {timeOpen && (
          <div className="ds-wheels">
            <div className="ds-wheel" ref={hourRef} aria-label="小时">
              {Array.from({ length: 24 }, (_, h) => (
                <button key={h} type="button" className={h === hour ? 'on' : ''} onClick={() => setHour(h)}>{pad(h)}</button>
              ))}
            </div>
            <span className="ds-colon" aria-hidden="true">:</span>
            <div className="ds-wheel" ref={minuteRef} aria-label="分钟">
              {Array.from({ length: 60 }, (_, m) => (
                <button key={m} type="button" className={m === minute ? 'on' : ''} onClick={() => setMinute(m)}>{pad(m)}</button>
              ))}
            </div>
          </div>
        )}

        <div className="ds-ft">
          <button type="button" className="ds-btn" onClick={onCancel}>取消</button>
          <button type="button" className="ds-btn ok" onClick={confirm}>确定</button>
        </div>
      </div>
    </div>
  )
}
