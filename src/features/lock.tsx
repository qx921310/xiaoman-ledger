import { useState } from 'react'

const KEY = 'xiaoman-gesture-pin'
// 按账号隔离：同一浏览器多账号各自独立
let scope = ''
export const setPinScope = (userId: number | string) => { scope = String(userId) }
const keyOf = () => (scope ? `${KEY}:${scope}` : KEY)

export const hasPin = () => {
  try { return !!localStorage.getItem(keyOf()) } catch { return false }
}
export const setPin = (pin: string) => {
  try { localStorage.setItem(keyOf(), pin) } catch { /* 忽略 */ }
}
export const clearPin = () => {
  try { localStorage.removeItem(keyOf()) } catch { /* 忽略 */ }
}
/** 校验输入的 PIN 是否与已设置的相同（关闭手势密码前必须验证） */
export const verifyPin = (pin: string) => {
  try { return localStorage.getItem(keyOf()) === pin } catch { return false }
}

/**
 * 手势密码（对应一木 GestureSettingActivity）
 * 一木是九宫格手势；网页端用 4 位数字锁等价实现（同一目的：启动/切回时需验证）。
 * 隐私模式或存储不可用时自动跳过，不影响使用。
 */
export function PinLock({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setInput] = useState('')
  const [err, setErr] = useState('')
  const expected = (() => { try { return localStorage.getItem(keyOf()) ?? '' } catch { return '' } })()

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
