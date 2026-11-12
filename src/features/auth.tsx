import { useState } from 'react'
import { auth, type User } from '../auth'
import { errorMessage } from '../errors'

export function AuthScreen({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (!email.trim()) return setErr('请输入邮箱')
    if (pw.length < 8) return setErr('密码至少 8 位')
    if (mode === 'register' && pw !== pw2) return setErr('两次密码不一致')
    setBusy(true)
    try {
      const r = mode === 'login' ? await auth.login(email.trim(), pw) : await auth.register(email.trim(), pw)
      onAuthed(r.user)
    } catch (e) {
      setErr(errorMessage(e, '操作失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/icons/brand/logo-mark.svg" alt="小满记账" />
          <div>
            <strong>小满记账</strong>
            <small>小有盈余，日子清楚</small>
          </div>
        </div>

        <div className="seg">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr('') }}>登录</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setErr('') }}>注册</button>
        </div>

        <label className="label" htmlFor="auth-email">邮箱</label>
        <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        <label className="label" htmlFor="auth-password">密码</label>
        <input id="auth-password" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="至少 8 位" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'register' && (
          <>
            <label className="label" htmlFor="auth-password-confirm">确认密码</label>
            <input id="auth-password-confirm" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再输一次" autoComplete="new-password" />
          </>
        )}

        {err && <p className="warn" role="alert">{err}</p>}

        <button className="primary" onClick={submit} disabled={busy}>{busy ? '处理中…' : (mode === 'login' ? '登录' : '注册并登录')}</button>
        <p className="hint">仅支持邮箱注册。</p>
      </div>
    </div>
  )
}
