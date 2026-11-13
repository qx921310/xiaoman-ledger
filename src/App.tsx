import { useEffect, useMemo, useRef, useState } from 'react'
import { useLedger } from './store'
import { auth, books as bookApi, setCurrentUid, type BookInfo, type User } from './auth'
import { loadAccountData } from './account-session'
import { syncNow } from './sync'
import { startAutoSync, stopAutoSync, getAutoSyncState } from './sync-auto'
import { startMultiTab } from './multi-tab'
import { advanceSessionEpoch, captureSessionEpoch } from './domain/session-epoch'

import { AuthScreen } from './features/auth'
import { AddBill } from './features/add-bill'
import { Home } from './features/home'
import { Search } from './features/search'
import { PinLock, hasPin, setPinScope } from './features/lock'
import { flushBookPatches, hasPendingBookPatches } from './features/book-pending'
import { CalendarPage } from './features/calendar'
import { Assets } from './features/assets'
import { Stats } from './features/stats'
import { Settings } from './features/settings'

type Tab = 'home' | 'calendar' | 'assets' | 'stats' | 'me' | 'add'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  // 冷启动时账号作用域尚未确定，不能在这一刻判断 hasPin()；等 user 就绪后再上锁
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!user) return
    setPinScope(user.id)
    setLocked(hasPin())
  }, [user?.id])
  // 切后台/切回前台重新上锁（一木同类行为：离开即锁）
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden' && hasPin()) setLocked(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  const [syncWarning, setSyncWarning] = useState('')
  const multiTabHandle = useRef<ReturnType<typeof startMultiTab> | null>(null)

  /**
   * 账号初始化：启动恢复、登录、注册共用同一条路径。
   * 顺序：切换身份 → 清会话状态 → 载入该账号数据 → 设当前用户 → 加载账本 → 同步。
   */
  const initAccount = async (u: User) => {
    advanceSessionEpoch()
    multiTabHandle.current?.stop()
    multiTabHandle.current = null
    const session = captureSessionEpoch()
    await loadAccountData(u.id)
    if (session.signal.aborted) return
    setUser(u)
    await loadBooks()
    if (session.signal.aborted) return
    startAutoSync({ sync: () => syncNow() })
    // 多标签页：别的标签改了数据就重新加载，避免本标签的旧状态把对方覆盖
    multiTabHandle.current = startMultiTab({
      rehydrate: () => useLedger.persist.rehydrate(),
      isBusy: () => {
        const st = getAutoSyncState()
        return st.running || st.pending
      }
    })
    await autoSyncOnce()
  }

  useEffect(() => {
    // 账本离线改动：网络恢复或页面回到前台时补传，不依赖账本页是否打开
    const flush = () => { if (hasPendingBookPatches()) void flushBookPatches() }
    window.addEventListener('online', flush)
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    auth.me().then(async (u) => {
      if (u) {
        await initAccount(u)
        // 登录后补传离线期间的账本改动（经过服务端并发校验）
        void flushBookPatches()
      } else setUser(null)
    })
  }, [])

  // 打开应用时自动同步一次；失败不打扰用户，手动同步仍可用
  const autoSyncOnce = async () => {
    try {
      const r = await syncNow()
      const warn = r.denied ? `${r.denied} 条记录未能推送，请到设置页检查同步结果。` : ''
      const kept = Number(r.conflictsKept ?? 0) + Number(r.conflicts ?? 0)
      setSyncWarning(warn || (kept ? `有 ${kept} 条记录待核对（冲突或未推送），请到设置页处理。` : ''))
      console.log('[sync] 自动同步完成', r)
    } catch (e) {
      console.warn('[sync] 自动同步失败（可手动重试）', e)
    }
  }

  const loadBooks = async () => {
    const session = captureSessionEpoch()
    try {
      const r = await bookApi.list()
      if (session.signal.aborted) return
      const list: BookInfo[] = r?.books ?? []
      const setBooks = useLedger.getState().setAccountBooks
      setBooks(list.map((b) => ({
        accountBookId: 0,
        accountBookName: b.name,
        userId: 0,
        createTime: 0,
        bookId: b.bookId,
        ownerId: b.ownerId,
        role: b.role,
        // 账本元数据（一木：图标与显示开关由服务端保存，换设备不丢）
        icon: b.icon ?? undefined,
        showTransfer: b.showTransfer === 0 || b.showTransfer === false ? false : true,
        showStock: b.showStock === 0 || b.showStock === false ? false : true,
        hideAllCategory: !!(b.hideAllCategory ?? 0),
        hidden: !!(b.hidden ?? 0),
        updateTime: b.updatedAt ?? undefined
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
      if (session.signal.aborted) return
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
    advanceSessionEpoch()
    multiTabHandle.current?.stop()
    multiTabHandle.current = null
    // 先停调度，避免在途请求的结果落到下一个账号
    stopAutoSync()
    try { await auth.logout() } catch { /* 忽略 */ }
    setCurrentUid(0)
    setSyncWarning('')
    await useLedger.persist.rehydrate()
    setUser(null)
  }

  if (user === undefined) return <div className="boot" role="status">加载中…</div>
  if (user && locked) return <PinLock onUnlock={() => setLocked(false)} />
  if (user === null) return <AuthScreen onAuthed={afterAuth} />
  return <Shell user={user} onLogout={logout} syncWarning={syncWarning} dismissSyncWarning={() => setSyncWarning('')} />
}


function Shell({ user, onLogout, syncWarning, dismissSyncWarning }: { user: User; onLogout: () => void; syncWarning: string; dismissSyncWarning: () => void }) {
  const [tab, setTab] = useState<Tab>('home')
  const [searchOpen, setSearchOpen] = useState(false)
  const [focusBillId, setFocusBillId] = useState<string | number | null>(null)
  const changeTab = (next: Tab) => { setSearchOpen(false); setTab(next) }
  const mergeTaxonomy = useLedger((s) => s.mergeTaxonomy)

  const runCycles = useLedger((s) => s.runCycles)

  // 启动时补齐内置分类（幂等，不动用户已有分类）
  useEffect(() => { mergeTaxonomy() }, [mergeTaxonomy])

  // 首个账户兜底：一木记账必须选账户，新用户没有账户会卡在第一步。
  // 注：一木的默认账户集合存在 resources.arsc（未反编译出明文字符串），
  // 这里只补一个最小可用的「现金」（资产类型 1 资金账户），不臆造更多。
  const assets = useLedger((s) => s.assets)
  const addAsset = useLedger((s) => s.addAsset)
  const seededAsset = useRef(false)
  // 确定性种子 id：同一账号在任何设备上算出的值相同（不走时间戳，避免并发各建一条）
  const seedCashId = useMemo(() => {
    const uid = String(user?.id ?? 0)
    let h = 2166136261
    for (const ch of `cash:${uid}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) }
    return -Math.abs(h >>> 0)    // 负数，避开时间戳正数区间
  }, [user?.id])
  // 必须等首次同步完成再判断，否则新设备在拉取云端数据前会各自建一个「现金」，导致重复
  const synced = useLedger((s) => s.sessionSyncAt)
  useEffect(() => {
    if (seededAsset.current) return
    if (!(synced && synced > 0)) return   // 未开始(-0)或拉取失败(-1)：都不假定云端为空
    if (assets.length > 0) return
    seededAsset.current = true
    // 用按用户确定的 id 做幂等种子：两台空设备同时首次登录会生成同一个 assetId，
    // 同步后按 id 收敛成一条，而不是各建一条「现金」
    addAsset({ assetId: seedCashId, assetName: '现金', assetType: 1, assetNumber: 0, intoTotal: 1 } as never)
  }, [synced, assets.length, addAsset, seedCashId])
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
  const [toast, setToast] = useState('')
  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2200)
  }

  return (
    <div className="app">

      <nav className="nav">
        {([['home', '首页'], ['calendar', '日历'], ['assets', '资产'], ['stats', '统计'], ['me', '我的']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => changeTab(k)}>{label}</button>
        ))}
      </nav>

      <main className="main">
        {syncWarning && <div className="warn" role="alert">{syncWarning} <button className="link" onClick={() => { setTab('me'); dismissSyncWarning() }}>查看同步</button></div>}
        {searchOpen && (
          <Search onClose={() => setSearchOpen(false)}
            onPick={(id) => { setSearchOpen(false); setFocusBillId(id); setTab('home') }} />
        )}
        {!searchOpen && tab === 'home' && (
          <Home me={user} onAdd={() => setTab('add')}
            onOpenStats={() => setTab('stats')}
            onSearch={() => setSearchOpen(true)}
            onMore={() => setTab('me')}
            onScreenshot={() => {
              setTab('me')
              setTimeout(() => document.getElementById('ocr-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
            }}
            focusBillId={focusBillId}
            onFocusHandled={() => setFocusBillId(null)} />
        )}
        {tab === 'calendar' && (
          <CalendarPage onAddBill={() => setTab('add')} onOpenMonthBills={() => setTab('home')} />
        )}
        {tab === 'assets' && <Assets notify={notify} onOpenSettings={() => setTab('me')}  onOpenStats={() => setTab('stats')} onOpenSearch={() => setSearchOpen(true)} />}
        {tab === 'stats' && <Stats notify={notify} />}
        {tab === 'me' && <Settings notify={notify} me={user} onLogout={onLogout} />}
        {tab === 'add' && <AddBill notify={notify} onClose={() => setTab('home')} onNeedAsset={() => setTab('assets')} />}
      </main>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}


