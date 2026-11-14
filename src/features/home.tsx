import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { summarizeBills } from '../bill-summary'
import { money, monthOf } from '../ui-format'

const plain = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
import { Bills } from './bills'
import { usePullRefresh } from '../ui/use-pull-refresh'
import { syncNowImmediate } from '../sync-auto'

/** 首页：本月汇总 + 预算卡 + 记账入口 + 流水（照一木的单列结构） */
export function Home({ me, onAdd, onOpenStats, onSearch, onMore, onScreenshot, focusBillId, onFocusHandled }: {
  me?: { id: number; email: string }
  onAdd: () => void
  onOpenStats?: () => void
  onSearch?: () => void
  onMore?: () => void
  onScreenshot?: () => void
  /** 搜索命中后要打开的账单 */
  focusBillId?: string | number | null
  onFocusHandled?: () => void
}) {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const budgets = useLedger((s) => s.budgets)
  const bookId = useLedger((s) => s.currentBookId)
  const readOnly = useLedger((s) => {
    const book = s.accountBooks.find((b) => String(b.bookId) === String(s.currentBookId))
    return book?.role === 'silent'
  })

  const month = monthOf(Date.now())
  const inBook = useMemo(
    () => bills.filter((b) => bookId === 0 || String(b.bookId) === String(bookId)),
    [bills, bookId]
  )
  const monthBills = useMemo(() => inBook.filter((b) => monthOf(b.time) === month), [inBook, month])
  const summary = useMemo(() => summarizeBills(monthBills, parents, refunds), [monthBills, parents, refunds])

  // 总预算：本月 categoryId=0 的额度，缺省回落到 all
  const budgetTotal = useMemo(() => {
    const hit = budgets.find((b) => b.month === month && b.categoryId === 0)
      ?? budgets.find((b) => b.month === 'all' && b.categoryId === 0)
    return hit?.amount ?? 0
  }, [budgets, month])
  // 一木「更多」菜单（popup_home_menu.xml）：视图 简约/详细、范围 全部/按月
  const [menuOpen, setMenuOpen] = useState(false)
  const [tipClosed, setTipClosed] = useState(() => {
    try { return localStorage.getItem('xiaoman-home-tip') === 'off' } catch { return true }
  })
  const [simpleView, setSimpleView] = useState(false)
  const [rangeAll, setRangeAll] = useState(false)
  // 下拉刷新：触发一次同步（对应一木各页的 pull_layout）
  const [pullAction, setPullAction] = useState<'sync' | 'add'>('sync')
  // 数据小卡片：选择首页显示哪些模块（一木 dialog_bottom_custom_module）
  const [modulesOpen, setModulesOpen] = useState(false)
  const [modules, setModules] = useState<{ summary: boolean; budget: boolean; flow: boolean }>(() => {
    try { return { summary: true, budget: true, flow: true, ...(JSON.parse(localStorage.getItem('xiaoman-home-modules') ?? '{}')) } }
    catch { return { summary: true, budget: true, flow: true } }
  })
  const toggleModule = (k: 'summary' | 'budget' | 'flow') => {
    const next = { ...modules, [k]: !modules[k] }
    setModules(next)
    try { localStorage.setItem('xiaoman-home-modules', JSON.stringify(next)) } catch { /* 忽略 */ }
  }
  const { progress: pullProgress, busy: pulling, text: pullText } = usePullRefresh(
    async () => {
      if (pullAction === 'add') { onAdd(); return }
      try { await syncNowImmediate() } catch { /* 离线时忽略，同步徽标会提示 */ }
    },
    64,
    pullAction === 'add'
      ? { pulling: '下拉添加一条账单', released: '松开添加一条账单', busy: '正在打开记账…' }
      : {}
  )
  const bookName = useLedger((s) => {
    const b = s.accountBooks.find((x) => String(x.bookId) === String(s.currentBookId))
    return b?.accountBookName ?? '我的账本'
  })
  const used = summary.expense
  // 预算口径必须排除「不计预算」的账单（summary.budget），与 summary.expense 不同
  const budgetUsed = summary.budget
  const percent = budgetTotal > 0 ? Math.min(100, Math.round((budgetUsed / budgetTotal) * 100)) : 0

  return (
    <section className="home">
      {(pullProgress > 0 || pulling) && (
        <div className="pull-tip" role="status" aria-live="polite">
          {pulling ? pullText.busy : pullProgress >= 1 ? pullText.released : pullText.pulling}
        </div>
      )}

      {!tipClosed && (
        <div className="home-tip" role="status">
          <span>附件仅保留 30 天（到期销毁）；导出备份只含账目数据，不含附件文件。</span>
          <button type="button" className="link" aria-label="关闭提示"
            onClick={() => { setTipClosed(true); try { localStorage.setItem('xiaoman-home-tip', 'off') } catch { /* 忽略 */ } }}>×</button>
        </div>
      )}

      {/* 顶栏：账本图标 + 账本名，右侧 搜索 / 更多（对齐真机：绿色线性图标） */}
      <div className="home-hd">
        <button type="button" className="home-hd-book" onClick={() => setMenuOpen(true)} aria-label="切换账本">
          <span className="bk-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3h13a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></svg>
          </span>
          <b>{bookName}</b>
        </button>
        <div className="home-hd-acts">
          <button type="button" className="hd-btn" aria-label="搜索账单" onClick={onSearch} disabled={!onSearch}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" strokeLinecap="round" /></svg>
          </button>
          <button type="button" className="hd-btn" aria-label="更多" onClick={() => setMenuOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          </button>
        </div>
      </div>

      {/* 汇总卡：三列概览 + 本月支出大字（对齐真机浅绿渐变卡） */}
      {modules.summary && (
        <div className="home-card">
          <div className="hc-row">
            <button type="button" className="hc-item" onClick={onOpenStats} disabled={!onOpenStats}>
              <small>本月收入</small>
              <b>{plain(summary.income)}</b>
            </button>
            <button type="button" className="hc-item" onClick={onOpenStats} disabled={!onOpenStats}>
              <small>本月结余</small>
              <b>{plain(summary.income - used)}</b>
            </button>
            <button type="button" className="hc-item" onClick={onOpenStats} disabled={!onOpenStats}>
              <small>剩余月预算</small>
              <b>{budgetTotal > 0 ? plain(Math.max(0, budgetTotal - budgetUsed)) : '--'}</b>
            </button>
          </div>
          <button type="button" className="hc-big" onClick={onOpenStats} disabled={!onOpenStats}>
            <small>本月支出(元)</small>
            <b>{plain(used)}</b>
          </button>
          <span className="hc-orn" aria-hidden="true" />
        </div>
      )}

      {/* 主按钮：添加一条新记账（整行绿底） */}
      <button type="button" className="home-add" onClick={onAdd} disabled={readOnly}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M12 9.5v5M9.5 12h5" strokeLinecap="round" />
        </svg>
        添加一条新记账
      </button>

      {modules.budget && budgetTotal > 0 && (
        <div className="home-budget" role="group" aria-label="本月预算">
          <div className="hb-head">
            <span>本月预算 {money(budgetTotal)}</span>
            <span className={percent >= 100 ? 'out' : ''}>已用 {percent}%</span>
          </div>
          <div className="hb-bar"><i style={{ width: `${percent}%` }} /></div>
          <small>剩余 {money(Math.max(0, budgetTotal - budgetUsed))}</small>
        </div>
      )}

      {modulesOpen && (
        <div className="menu-mask" onClick={() => setModulesOpen(false)}>
          <div className="home-menu" role="dialog" aria-label="选择模块" onClick={(e) => e.stopPropagation()}>
            <div className="hm-label">选择模块</div>
            <div className="hm-group">
              {([['summary', '本月收支汇总'], ['budget', '预算进度'], ['flow', '账单流水']] as const).map(([k, label]) => (
                <label key={k} className="row hm-check">
                  <span className="grow">{label}</span>
                  <input type="checkbox" checked={modules[k]} onChange={() => toggleModule(k)} />
                </label>
              ))}
            </div>
            <button type="button" className="ghost wide" onClick={() => setModulesOpen(false)}>完成</button>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="menu-mask" onClick={() => setMenuOpen(false)}>
          <div className="home-menu" role="dialog" aria-label="更多" onClick={(e) => e.stopPropagation()}>
            <div className="hm-group">
              <div className="hm-label">视图</div>
              <div className="hm-seg">
                <button type="button" className={!simpleView ? 'on' : ''} onClick={() => setSimpleView(false)}>详细</button>
                <button type="button" className={simpleView ? 'on' : ''} onClick={() => setSimpleView(true)}>简约</button>
              </div>
            </div>
            <div className="hm-group">
              <div className="hm-label">范围</div>
              <div className="hm-seg">
                <button type="button" className={!rangeAll ? 'on' : ''} onClick={() => setRangeAll(false)}>按月</button>
                <button type="button" className={rangeAll ? 'on' : ''} onClick={() => setRangeAll(true)}>全部</button>
              </div>
            </div>
            <div className="hm-group">
              <div className="hm-label">下拉动作</div>
              <div className="hm-seg">
                <button type="button" className={pullAction === 'sync' ? 'on' : ''} onClick={() => setPullAction('sync')}>同步数据</button>
                <button type="button" className={pullAction === 'add' ? 'on' : ''} onClick={() => setPullAction('add')}>添加一条账单</button>
              </div>
            </div>
            <div className="hm-group">
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onScreenshot?.() }} disabled={!onScreenshot}>AI 截图识别</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>多设备同步</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>模板记账</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>预算管理</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onScreenshot?.() }}>截图导入</button>
            </div>
            <div className="hm-group">
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); setModulesOpen(true) }}>数据小卡片</button>
              <button type="button" className="hm-item muted" disabled>扫一扫（平台限制）</button>
              <button type="button" className="hm-item muted" disabled>本地 MCP（暂不支持）</button>
            </div>
            <button type="button" className="ghost wide" onClick={() => setMenuOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      <button type="button" className="home-fab" aria-label="语音记账" onClick={onAdd} disabled={readOnly}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
        </svg>
      </button>

      {modules.flow && <div className="home-flow">
        <div className="hf-head">流水</div>
        <Bills me={me} onAdd={onAdd} embedded rangeAll={rangeAll} simpleView={simpleView}
          focusBillId={focusBillId} onFocusHandled={onFocusHandled} />
      </div>}
    </section>
  )
}
