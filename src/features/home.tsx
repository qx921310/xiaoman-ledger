import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { summarizeBills } from '../bill-summary'
import { money } from '../ui-format'
import { Bills } from './bills'
import { usePullRefresh } from '../ui/use-pull-refresh'
import { syncNowImmediate } from '../sync-auto'

/** 首页：本月汇总 + 预算卡 + 记账入口 + 流水（照一木的单列结构） */
export function Home({ me, onAdd, onOpenStats, onSearch, onMore, onScreenshot }: {
  me?: { id: number; email: string }
  onAdd: () => void
  onOpenStats?: () => void
  onSearch?: () => void
  onMore?: () => void
  onScreenshot?: () => void
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

  const month = new Date().toISOString().slice(0, 7)
  const inBook = useMemo(
    () => bills.filter((b) => bookId === 0 || String(b.bookId) === String(bookId)),
    [bills, bookId]
  )
  const monthBills = useMemo(() => inBook.filter((b) => new Date(b.time).toISOString().slice(0, 7) === month), [inBook, month])
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

      <div className="home-toolbar">
        <div className="ht-left">
          <span className="ht-book" aria-label="当前账本">{bookName}</span>
          <b className="ht-month">{new Date().getFullYear()} 年 {new Date().getMonth() + 1} 月</b>
        </div>
        <div className="ht-right">
          <button type="button" className="ht-btn" aria-label="记一笔" onClick={onAdd} disabled={readOnly}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
          </button>
          <button type="button" className="ht-btn" aria-label="搜索账单" onClick={onSearch} disabled={!onSearch}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
          </button>
          <button type="button" className="ht-btn" aria-label="更多" onClick={() => setMenuOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
        </div>
      </div>
      {modules.summary && <div className="home-summary">
        <button type="button" className="hm-item" onClick={onOpenStats} disabled={!onOpenStats}>
          <small>本月支出</small>
          <b className="out">{money(used)}</b>
        </button>
        <button type="button" className="hm-item" onClick={onOpenStats} disabled={!onOpenStats}>
          <small>本月收入</small>
          <b className="in">{money(summary.income)}</b>
        </button>
        <button type="button" className="hm-item" onClick={onOpenStats} disabled={!onOpenStats}>
          <small>本月结余</small>
          <b>{money(summary.income - used)}</b>
        </button>
      </div>}

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
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>共享账本</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>模板记账</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>预算管理</button>
              <button type="button" className="hm-item" onClick={() => { setMenuOpen(false); onMore?.() }}>截图导入</button>
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

      {modules.flow && <div className="home-flow">
        <div className="hf-head">流水</div>
        <Bills me={me} onAdd={onAdd} embedded rangeAll={rangeAll} simpleView={simpleView} />
      </div>}
    </section>
  )
}
