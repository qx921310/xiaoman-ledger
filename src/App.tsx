import { useEffect, useRef, useState } from 'react'
import { useLedger } from './store'
import { auth, books as bookApi, setCurrentUid, type BookInfo, type User } from './auth'
import { loadAccountData } from './account-session'
import { syncNow } from './sync'
import { startAutoSync, stopAutoSync, subscribeAutoSync, syncNowImmediate, getAutoSyncState, type AutoSyncState } from './sync-auto'
import { startMultiTab } from './multi-tab'

import { AuthScreen } from './features/auth'
import { AddBill } from './features/add-bill'
import { Home } from './features/home'
import { CalendarPage } from './features/calendar'
import { Assets } from './features/assets'
import { Stats } from './features/stats'
import { Settings } from './features/settings'
import { ROLE_LABEL } from './ui/roles'
import type { AccountBook } from './types'

type Tab = 'home' | 'calendar' | 'assets' | 'stats' | 'me' | 'add'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [syncWarning, setSyncWarning] = useState('')

  /**
   * 账号初始化：启动恢复、登录、注册共用同一条路径。
   * 顺序：切换身份 → 清会话状态 → 载入该账号数据 → 设当前用户 → 加载账本 → 同步。
   */
  const initAccount = async (u: User) => {
    await loadAccountData(u.id)
    setUser(u)
    await loadBooks()
    startAutoSync({ sync: () => syncNow() })
    // 多标签页：别的标签改了数据就重新加载，避免本标签的旧状态把对方覆盖
    startMultiTab({
      rehydrate: () => useLedger.persist.rehydrate(),
      isBusy: () => {
        const st = getAutoSyncState()
        return st.running || st.pending
      }
    })
    await autoSyncOnce()
  }

  useEffect(() => {
    auth.me().then(async (u) => {
      if (u) await initAccount(u)
      else setUser(null)
    })
  }, [])

  // 打开应用时自动同步一次；失败不打扰用户，手动同步仍可用
  const autoSyncOnce = async () => {
    try {
      const r = await syncNow()
      const warn = r.denied ? `${r.denied} 条记录未能推送，请到设置页检查同步结果。` : ''
      setSyncWarning(warn || (r.conflictsKept ? `有 ${r.conflictsKept} 笔同期账单内容不同，已保留并在列表里标为待核对。` : ''))
      console.log('[sync] 自动同步完成', r)
    } catch (e) {
      console.warn('[sync] 自动同步失败（可手动重试）', e)
    }
  }

  const loadBooks = async () => {
    try {
      const r = await bookApi.list()
      const list: BookInfo[] = r?.books ?? []
      const setBooks = useLedger.getState().setAccountBooks
      setBooks(list.map((b) => ({
        accountBookId: 0,
        accountBookName: b.name,
        userId: 0,
        createTime: 0,
        bookId: b.bookId,
        ownerId: b.ownerId,
        role: b.role
      })))
      if (list[0]) {
        // 老账单的 bookId 是数字，统一迁到服务端第一个账本
        useLedger.getState().migrateBookIds(list[0].bookId)
      }
      // 缓存账本列表：断网重开时用它把账本恢复出来
      try { localStorage.setItem('xm-books-cache', JSON.stringify(list)) } catch { /* 忽略 */ }
      const cur = useLedger.getState().currentBookId
      const match = list.find((b) => b.bookId === localStorage.getItem('xm-current-book'))
      if (match) useLedger.getState().setBook(match.bookId)
      else if (list[0]) useLedger.getState().setBook(list[0].bookId)
      else if (!cur) useLedger.getState().setBook(0)
    } catch (e) {
      // 断网：用上次缓存的账本列表把应用打开，同步恢复后会自动刷新
      const cached = (() => {
        try { return JSON.parse(localStorage.getItem('xm-books-cache') || 'null') as BookInfo[] | null } catch { return null }
      })()
      if (cached?.length) {
        useLedger.getState().setAccountBooks(cached.map((b) => ({
          accountBookId: 0, accountBookName: b.name, userId: 0, createTime: 0,
          bookId: b.bookId, ownerId: b.ownerId, role: b.role
        })))
        const match = cached.find((b) => b.bookId === localStorage.getItem('xm-current-book')) ?? cached[0]
        if (match) useLedger.getState().setBook(match.bookId)
        setSyncWarning('当前离线，正在使用本机数据；恢复网络后会自动同步。')
      } else {
        console.warn('[books] 加载失败', e)
      }
    }
  }

  // 登录/注册走同一条初始化路径，避免和启动恢复逻辑分叉
  const afterAuth = async (u: User) => { await initAccount(u) }

  const logout = async () => {
    // 先停调度，避免在途请求的结果落到下一个账号
    stopAutoSync()
    try { await auth.logout() } catch { /* 忽略 */ }
    setCurrentUid(0)
    setSyncWarning('')
    await useLedger.persist.rehydrate()
    setUser(null)
  }

  if (user === undefined) return <div className="boot" role="status">加载中…</div>
  if (user === null) return <AuthScreen onAuthed={afterAuth} />
  return <Shell user={user} onLogout={logout} syncWarning={syncWarning} dismissSyncWarning={() => setSyncWarning('')} />
}


function Shell({ user, onLogout, syncWarning, dismissSyncWarning }: { user: User; onLogout: () => void; syncWarning: string; dismissSyncWarning: () => void }) {
  const [tab, setTab] = useState<Tab>('home')
  const mergeTaxonomy = useLedger((s) => s.mergeTaxonomy)

  const runCycles = useLedger((s) => s.runCycles)

  // 启动时补齐内置分类（幂等，不动用户已有分类）
  useEffect(() => { mergeTaxonomy() }, [mergeTaxonomy])
  // 补生成周期账单：必须等首次同步拉完，否则两台设备会各自生成同一期
  const sessionSyncAt = useLedger((s) => s.sessionSyncAt)
  const cyclesRan = useRef(false)
  const [syncGrace, setSyncGrace] = useState(false)
  useEffect(() => {
    // 离线或服务端不可用时，3 秒后仍然本地补生成，避免用户看不到到期账单
    const t = setTimeout(() => setSyncGrace(true), 3000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (cyclesRan.current) return
    if (sessionSyncAt !== 0 || syncGrace) {
      cyclesRan.current = true
      runCycles()
    }
  }, [sessionSyncAt, syncGrace, runCycles])
  const [autoSync, setAutoSync] = useState<AutoSyncState | null>(null)
  useEffect(() => subscribeAutoSync(setAutoSync), [])
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo-img" src="/icons/brand/logo-mark.svg" alt="小满记账" />
          <div>
            <strong>小满记账</strong>
            <small>小有盈余，日子清楚</small>
          </div>
        </div>
        <div className="userbox">
          <SyncBadge state={autoSync} onRetry={() => { void syncNowImmediate() }} />
          <BookSwitch />
          <span className="uemail" title={user.email}>{user.email}</span>
          <button className="ghost tiny" onClick={onLogout}>退出</button>
        </div>
      </header>

      <nav className="nav">
        {([['home', '首页'], ['calendar', '日历'], ['assets', '资产'], ['stats', '统计'], ['me', '我的']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      <main className="main">
        {syncWarning && <div className="warn" role="alert">{syncWarning} <button className="link" onClick={() => { setTab('me'); dismissSyncWarning() }}>查看同步</button></div>}
        {tab === 'home' && <Home me={user} onAdd={() => setTab('add')} />}
        {tab === 'calendar' && <CalendarPage />}
        {tab === 'assets' && <Assets notify={notify} />}
        {tab === 'stats' && <Stats />}
        {tab === 'me' && <Settings notify={notify} me={user} />}
        {tab === 'add' && <AddBill notify={notify} onClose={() => setTab('home')} onNeedAsset={() => setTab('assets')} />}
      </main>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}

function BookSwitch() {
  const books = useLedger((s) => s.accountBooks)
  const current = useLedger((s) => s.currentBookId)
  const setBook = useLedger((s) => s.setBook)
  const keyOf = (b: AccountBook) => String(b.bookId ?? b.accountBookId)
  return (
    <select aria-label="切换账本"
      value={String(current)}
      onChange={(e) => {
        const v = e.target.value
        localStorage.setItem('xm-current-book', v)
        setBook(/^\d+$/.test(v) ? Number(v) : v)
      }}
      className="book">
      <option value="0">全部账本</option>
      {[...books].filter((b) => !b.hide).sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0)).map((b) => {
        const k = keyOf(b)
        return (
          <option key={k} value={k}>{b.color ? '● ' : ''}
            {b.accountBookName}{b.role ? ` · ${ROLE_LABEL[b.role] ?? b.role}` : ''}
          </option>
        )
      })}
    </select>
  )
}

/** 同步状态徽标：待同步 / 同步中 / 失败可重试 / 上次同步时间 */
function SyncBadge({ state, onRetry }: { state: AutoSyncState | null; onRetry: () => void }) {
  if (!state) return null
  if (state.running) return <span className="sync-badge sync-running" title="正在同步">同步中…</span>
  if (state.lastError) {
    return (
      <button type="button" className="sync-badge sync-failed" title={state.lastError} onClick={onRetry}>
        同步失败 · 重试
      </button>
    )
  }
  if (state.pending) return <span className="sync-badge sync-pending" title="有本地改动待推送">待同步</span>
  if (state.incomplete > 0) {
    return (
      <button type="button" className="sync-badge sync-failed"
        title={`${state.incomplete} 条记录未被服务端接受（冲突或拒绝），请到设置页查看`} onClick={onRetry}>
        {state.incomplete} 条待处理
      </button>
    )
  }
  if (state.lastOkAt) {
    const t = new Date(state.lastOkAt)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    return <span className="sync-badge sync-ok" title="已与服务端一致">{hh}:{mm} 已同步</span>
  }
  return null
}
