import { useState } from 'react'

const KEY = 'xiaoman-gesture-pin'

export const hasPin = () => {
  try { return !!localStorage.getItem(KEY) } catch { return false }
}
export const setPin = (pin: string) => {
  try { localStorage.setItem(KEY, pin) } catch { /* 忽略 */ }
}
export const clearPin = () => {
  try { localStorage.removeItem(KEY) } catch { /* 忽略 */ }
}

/**
 * 手势密码（对应一木 GestureSettingActivity）
 * 一木是九宫格手势；网页端用 4 位数字锁等价实现（同一目的：启动/切回时需验证）。
 * 隐私模式或存储不可用时自动跳过，不影响使用。
 */
export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setInput] = useState('')
  const [err, setErr] = useState('')
  const expected = (() => { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } })()

  const submit = (value: string) => {
    if (value === expected) { onUnlock(); return }
    setErr('密码不正确')
    setInput('')
  }

  return (
    <div className="pin-lock">
      <h2>输入手势密码</h2>
      <div className="pin-dots">{Array.from({ length: 4 }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      {err && <p className="hint out">{err}</p>}
      <div className="pin-pad">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          <button key={i} type="button" className="pin-key" disabled={!k} onClick={() => {
            if (k === '⌫') { setInput(pin.slice(0, -1)); return }
            const next = pin + k
            setInput(next)
            if (next.length === 4) submit(next)
          }}>{k}</button>
        ))}
      </div>
    </div>
  )
}
