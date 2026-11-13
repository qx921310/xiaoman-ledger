import { useEffect, useRef, useState } from 'react'
import { useLedger, useTotalAssets } from '../store'
import { ASSET_TYPE, LEND_TYPE } from '../types'
import type { Asset } from '../types'
import { money, dayOf, fullDay } from '../ui-format'
import { errorMessage } from '../errors'
import { AssetIcon } from '../ui/icons'
import { ASSET_ICON_GROUPS } from '../ui/asset-icons'
import { Modal } from '../ui/modal'
import { usePullRefresh } from '../ui/use-pull-refresh'
import { HiddenPage } from './hidden-page'
import { AssetSankey } from './asset-sankey'
import { FixedDepositList } from './fixed-deposit'
import { accountMoney, toBase } from '../money'
import { visibleAssets } from '../domain/asset-scope'
import { accountHistory } from '../domain/account-history'
import { planInstalment, planLoan } from '../domain/loan'
import { holdingValue, totalProfit } from '../domain/stock'
import { IconPicker } from '../ui/icon-picker'
import { lendRemaining, lendTotals } from '../lend'

/** 图标 key → 中文名，用于选择按钮上显示 */
function iconLabel(key: string): string {
  for (const g of ASSET_ICON_GROUPS) {
    const hit = g.options.find(([k]) => k === key)
    if (hit) return hit[1]
  }
  return ''
}

export function Assets({ notify, onOpenSettings, onOpenStats, onOpenSearch }: {
  notify: (m: string) => void
  onOpenSettings?: () => void
  onOpenStats?: () => void
  onOpenSearch?: () => void
}) {
  const allAssets = useLedger((s) => s.assets)
  const currentBookId = useLedger((s) => s.currentBookId)
  const meId = useLedger((s) => s.userId)
  const assets = visibleAssets(allAssets, currentBookId, meId)
  const accountBooks = useLedger((s) => s.accountBooks)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const total = useTotalAssets()
  const addAsset = useLedger((s) => s.addAsset)
  const updateAsset = useLedger((s) => s.updateAsset)
  const lends = useLedger((s) => s.lends)
  const repayLend = useLedger((s) => s.repayLend)
  const addLend = useLedger((s) => s.addLend)
  const deleteLend = useLedger((s) => s.deleteLend)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const deleteAsset = useLedger((s) => s.deleteAsset)
  const homeLoans = useLedger((s) => s.homeLoans)
  const instalments = useLedger((s) => s.instalments)
  const addHomeLoan = useLedger((s) => s.addHomeLoan)
  const deleteHomeLoan = useLedger((s) => s.deleteHomeLoan)
  const addInstalment = useLedger((s) => s.addInstalment)
  const deleteInstalment = useLedger((s) => s.deleteInstalment)
  const postInstalmentBills = useLedger((s) => s.postInstalmentBills)
  const stockAssets = useLedger((s) => s.stockAssets)
  const setStockHidden = useLedger((s) => s.setStockHidden)
  const addStockAsset = useLedger((s) => s.addStockAsset)
  const deleteStockAsset = useLedger((s) => s.deleteStockAsset)
  const tradeStock = useLedger((s) => s.tradeStock)
  const setStockPrice = useLedger((s) => s.setStockPrice)
  const setStockCostMethod = useLedger((s) => s.setStockCostMethod)
  const [stockForm, setStockForm] = useState({ name: '', code: '', num: '', amount: '' })
  const [stockSell, setStockSell] = useState<Record<number, string>>({})
  const [stockSellAmt, setStockSellAmt] = useState<Record<number, string>>({})
  const [loanForm, setLoanForm] = useState({ name: '房贷', commercial: '', commercialRate: '4.3', provident: '', providentRate: '3.1', lprAdd: '', periods: '360', repayment: 'equal-payment' as 'equal-payment' | 'equal-principal' })
  const [insForm, setInsForm] = useState({ total: '', periods: '12', serviceRate: '7.2', serviceType: 0, month: fullDay(Date.now()).slice(0, 7), assetId: 0 })
  const bills = useLedger((s) => s.bills)
  const allAssetsParents = useLedger((s) => s.parentCategories)
  const transfers = useLedger((s) => s.transfers)
  const refunds = useLedger((s) => s.refunds)
  const reimbursements = useLedger((s) => s.reimbursements)
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null)
  const [repayForm, setRepayForm] = useState<{ lendId: number; remaining: number; amount: string; assetId: number } | null>(null)
  const [lendForm, setLendForm] = useState<{ type: 1 | 2 | 3 | 4; assetId: number; counterparty: string; number: string; interest: string; repaymentAssetId: number; remark: string } | null>(null)
  const { receivable, payable } = lendTotals(lends)

  const [name, setName] = useState('')
  const [type, setType] = useState(1)
  const [num, setNum] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newCurrency, setNewCurrency] = useState(defaultCurrency)
  const [newSimple, setNewSimple] = useState('')
  const [newCardCode, setNewCardCode] = useState('')
  const [newBookId, setNewBookId] = useState('')
  const [newQuota, setNewQuota] = useState('')
  const [newInDay, setNewInDay] = useState('')
  const [newOutDay, setNewOutDay] = useState('')
  const [newIntoTotal, setNewIntoTotal] = useState(true)
  const [newRemark, setNewRemark] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const create = () => {
    if (!name.trim()) return notify('请输入账户名')
    addAsset({
      assetName: name.trim(),
      assetType: type,
      assetNumber: Number(num) || 0,
      assetIcon: newIcon || undefined,
      currency: newCurrency,
      simpleName: newSimple.trim() || undefined,
      cardCode: newCardCode || undefined,
      bookId: newBookId === '' ? undefined : newBookId,
      totalQuota: type === 2 && newQuota ? Number(newQuota) : undefined,
      inAccountDate: type === 2 && newInDay ? Number(newInDay) : undefined,
      outAccountDate: type === 2 && newOutDay ? Number(newOutDay) : undefined,
      intoTotalAsset: newIntoTotal,
      remark: newRemark
    })
    setName(''); setNum(''); setNewIcon('')
    notify('账户已添加')
  }


  // 一木资产页：净资产（可隐藏）+ 存款/负债 两栏 + 三张汇总卡片 + 按类型分组列表
  const [hideAmount, setHideAmount] = useState(false)
  // 一木：点净资产/存款/负债/组头 → 弹「构成」明细
  type CompRow = { name: string; amount: number; unit?: 'money' | 'count' | 'percent' }
  // 一木把「待报销 / 借出借入 / 投资持仓」做成独立页面；这里用条件渲染的子页复刻
  const [screen, setScreen] = useState<'assets' | 'reimburse' | 'lend' | 'stock' | 'hidden'>('assets')
  const subpageTitle = useRef<HTMLHeadingElement>(null)
  // 只记录「从哪个卡片进来的」，不持有 DOM 节点（返回时卡片是重新渲染的，旧节点已卸载）
  const cameFrom = useRef<'reimburse' | 'lend' | 'stock' | 'hidden'>('reimburse')
  const rootRef = useRef<HTMLElement>(null)
  const prevScreen = useRef<'assets' | 'reimburse' | 'lend' | 'stock' | 'hidden'>('assets')

  /** 进入子页：压一条历史记录（去重，避免连点双压）；系统返回键可退回 */
  const goto = (next: 'reimburse' | 'lend' | 'stock' | 'hidden') => {
    cameFrom.current = next
    try {
      // 合并原 state，避免覆盖宿主或其他模块写进去的 history 字段
      if (history.state?.assetsScreen !== next) history.pushState({ ...(history.state ?? {}), assetsScreen: next }, '')
    } catch { /* file:// 等环境忽略 */ }
    setScreen(next)
  }
  const backToAssets = () => {
    // 以 React 状态为准，history 只作为「能否后退」的旁证，避免两者不同步时决策错误
    if (screen !== 'assets' && history.state?.assetsScreen) { history.back(); return }
    setScreen('assets')
  }
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = (e: PopStateEvent) => {
      // 组件已卸载或用户切到别的标签页时不响应，避免在后台抢状态/焦点
      if (document.visibilityState === 'hidden') return
      const next = e.state?.assetsScreen
      const target = next === 'reimburse' || next === 'lend' || next === 'stock' ? next : 'assets'
      if (target !== 'assets') cameFrom.current = target
      setScreen(target)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    const was = prevScreen.current
    prevScreen.current = screen
    // 首次挂载不抢焦点：只有「从子页回到主页面」才把焦点还给对应卡片
    if (screen !== 'assets') { subpageTitle.current?.focus(); return }
    if (was === 'assets') return
    const back = rootRef.current?.querySelector<HTMLElement>(`[data-asset-card="${cameFrom.current}"]`)
    back?.focus()
  }, [screen])
  // 一木 popup_asset_menu：搜索账户/还款提醒/生效账本/定期存款/资产统计/资产隐藏/资产分布/更多数据/资产组成
  const [settingOpen, setSettingOpen] = useState(false)
  const [sankeyOpen, setSankeyOpen] = useState(false)
  const [repayOpen, setRepayOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [assetSearchOpen, setAssetSearchOpen] = useState(false)
  const [assetKw, setAssetKw] = useState('')
  const [remindOpen, setRemindOpen] = useState(false)
  const [bookScopeOpen, setBookScopeOpen] = useState(false)
  const [moreDataOpen, setMoreDataOpen] = useState(false)
  const currentBookIdForScope = useLedger((st) => st.currentBookId)
  // 私有资产（无 bookId）只属于本人，生效账本按当前账本判断
  const bookScopeId = currentBookIdForScope === 0 ? (accountBooks[0]?.bookId ?? '') : currentBookIdForScope
  const [remindDays, setRemindDays] = useState<number>(() => {
    try { return Number(localStorage.getItem('xiaoman-repay-remind') ?? 3) } catch { return 3 }
  })
  const [composition, setComposition] = useState<{ title: string; note?: string; rows: CompRow[] } | null>(null)
  // 一木：资产页下拉进入「资产隐藏页面」
  const hiddenPull = usePullRefresh(
    async () => { setScreen('hidden') },
    64,
    { pulling: '下拉进入资产隐藏页面', released: '松开进入资产隐藏页面', busy: '正在打开…' },
    screen === 'assets' && !composition
  )
  const openComposition = (title: string, rows: CompRow[], note?: string) =>
    setComposition({ title, note, rows: [...rows].sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)) })
  /** 账户 → 构成行；负债统一取绝对值，与顶部正数口径一致 */
  const assetRows = (list: Asset[]) => list.map((a) => ({
    name: a.simpleName || a.assetName,
    amount: Math.abs(toBase(a.assetNumber, a.currency, currencies, defaultCurrency)),
    unit: 'money' as const
  }))
  const mask = (v: number) => (hideAmount ? '••••' : money(v))
  const deposit = assets.filter((a) => a.assetNumber > 0).reduce((s, a) => s + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0)
  const liability = Math.abs(assets.filter((a) => a.assetNumber < 0).reduce((s, a) => s + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0))
  const pendingList = reimbursements.filter((r) => r.status === 'pending')
  const pendingReimburseCount = pendingList.length
  const pendingReimburse = pendingList.reduce((s, r) => s + (r.number || 0), 0)
  const deleteReimbursement = useLedger((st) => st.deleteReimbursement)
  const doneReimburse = reimbursements.filter((r) => r.status !== 'pending').reduce((s, r) => s + (r.number || 0), 0)
  const stockValue = stockAssets.reduce((s, h) => s + holdingValue(h.primeNum, h.primeCost, h.price ?? h.primeCost).market, 0)
  const stockProfit = stockAssets.reduce((s, h) => s + totalProfit(h.historyIncome, holdingValue(h.primeNum, h.primeCost, h.price ?? h.primeCost).floating), 0)
  const grouped = Object.entries(
    assets.reduce<Record<string, Asset[]>>((acc, a) => {
      const k = String(a.assetType)
      ;(acc[k] ??= []).push(a)
      return acc
    }, {})
  ).sort(([a], [b]) => Number(a) - Number(b))

  return (
    <section ref={rootRef} className={screen === 'assets' ? 'card' : 'card subpage'}>
      {(hiddenPull.progress > 0 || hiddenPull.busy) && screen === 'assets' && (
        <div className="pull-tip" role="status" aria-live="polite">
          {hiddenPull.busy ? hiddenPull.text.busy : hiddenPull.progress >= 1 ? hiddenPull.text.released : hiddenPull.text.pulling}
        </div>
      )}

      {screen !== 'assets' && (
        <div className="subpage-head">
          <button type="button" className="link" onClick={backToAssets}>‹ 返回资产</button>
          <h3 ref={subpageTitle} tabIndex={-1}>{{ reimburse: '待报销', lend: '借入借出', stock: '投资持仓', hidden: '隐藏资产' }[screen]}</h3>
        </div>
      )}

      {screen === 'assets' && (<>
      <div className="asset-banner">
        <div className="asset-net">
          <div className="asset-net-label">
            <small>净资产（{assets.filter((a) => a.intoTotalAsset !== false && !a.hide).length} 个账户）</small>
            <button type="button" className="link" aria-label={hideAmount ? '显示金额' : '隐藏金额'}
              onClick={() => setHideAmount((v) => !v)}>{hideAmount ? '显示' : '隐藏'}</button>
          </div>
          <button type="button" className="link asset-net-value" onClick={() => openComposition('净资产构成', assetRows(assets))}>
            {mask(total)}
          </button>
        </div>
        <div className="asset-two">
          <button type="button" className="asset-two-item" onClick={() => openComposition('存款构成', assetRows(assets.filter((a) => a.assetNumber > 0)))}>
            <small>存款</small><b>{mask(deposit)}</b>
          </button>
          <button type="button" className="asset-two-item" onClick={() => openComposition('负债构成', assetRows(assets.filter((a) => a.assetNumber < 0)))}>
            <small>负债</small><b>{mask(liability)}</b>
          </button>
        </div>
        {onOpenSettings && <button type="button" className="link asset-setting" onClick={() => setSettingOpen(true)}>资产设置</button>}
      </div>

      <div className="asset-cards">
        <button type="button" className="asset-card" data-asset-card="reimburse" onClick={() => goto('reimburse')}>
          <small>待报销</small>
          <b>{mask(pendingReimburse)}</b>
          <small className="dim">已报 {mask(doneReimburse)}</small>
        </button>
        <button type="button" className="asset-card" data-asset-card="lend" onClick={() => goto('lend')}>
          <small>借出借入</small>
          <b>{mask(receivable)}</b>
          <small className="dim">借入 {mask(payable)}</small>
        </button>
        <button type="button" className="asset-card" data-asset-card="stock" onClick={() => goto('stock')}>
          <small>投资</small>
          <b>{mask(stockValue)}</b>
          <small className="dim">收益 {mask(stockProfit)}</small>
        </button>
      </div>

      

      {grouped.map(([typeKey, list]) => (
        <div key={typeKey} className="asset-group">
          <button type="button" className="asset-group-head" onClick={() => {
            const sum = list.reduce((acc, a) => acc + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0)
            const share = total ? Math.round((Math.abs(sum) / Math.abs(total)) * 100) : 0
            openComposition(`${ASSET_TYPE[Number(typeKey)] ?? '其他'} · 统计`, [
              { name: '账户数', amount: list.length, unit: 'count' },
              { name: '合计', amount: sum, unit: 'money' },
              { name: '占净资产', amount: share, unit: 'percent' }
            ], '组头点击查看该类型的统计概览')
          }}>
            <span>{ASSET_TYPE[Number(typeKey)] ?? '其他'} ›</span>
            <b>{mask(list.reduce((sum, a) => sum + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0))}</b>
          </button>
          {list.map((a) => (
        <div key={a.assetId} className="row">
          <span className="asset-badge"><AssetIcon type={a.assetType} name={a.assetName} size={16} icon={a.assetIcon} /></span>
          <div className="grow">

            <div>
              <button className="link" aria-label={`查看 ${a.assetName} 流水`}
                onClick={() => setHistoryAsset(a)}>{a.simpleName || a.assetName}</button>
              {a.cardCode && <span className="tag">尾号 {a.cardCode}</span>}
            </div>
            <small>
              {ASSET_TYPE[a.assetType]}{a.groupName ? ' · ' + a.groupName : ''}
              {a.inAccountDate ? ` · 账单日 ${a.inAccountDate}` : ''}
              {a.outAccountDate ? ` · 还款日 ${a.outAccountDate}` : ''}
              {a.assetType === 2 && a.totalQuota ? ` · 额度 ${accountMoney(a.totalQuota, a.currency, currencies, defaultCurrency)}` : ''}
              {a.reimAssetNumber ? ` · 报销额度 ${money(a.reimAssetNumber)}` : ''}
              {a.shareQuotaAsset ? ` · 额度共享自 ${allAssets.find((x) => x.assetId === a.shareQuotaAsset)?.assetName ?? '已删除账户'}` : ''}
              {a.outDayNotNext && a.outAccountDate ? ' · 还款顺延' : ''}
            </small>
            {a.assetType === 2 && dueHint(a.outAccountDate) && (
              <span className="tag due">{dueHint(a.outAccountDate)}</span>
            )}
          </div>
          <b className={a.assetNumber < 0 ? 'out' : ''}>{accountMoney(a.assetNumber, a.currency, currencies, defaultCurrency)}</b>
          <button className="link" aria-label={`编辑账户 ${a.assetName}`} onClick={() => setEditingAsset(a)}>改</button>
          <button className="del" aria-label={`删除账户 ${a.assetName}`} onClick={() => {
            const used = bills.some((b) => b.assetId === a.assetId)
              || transfers.some((t) => t.fromAssetId === a.assetId || t.toAssetId === a.assetId)
              || lends.some((l) => l.assetId === a.assetId || l.repaymentAssetId === a.assetId)
              || refunds.some((r) => r.assetId === a.assetId)
              || reimbursements.some((r) => r.assetId === a.assetId)
            if (used) return notify('这个账户已有流水，不能删除；可先隐藏或迁移账单')
            deleteAsset(a.assetId)
            notify('账户已删除')
          }}>删</button>
        </div>
          ))}
        </div>
      ))}

      {historyAsset && (() => {
        const { entries, opening } = accountHistory({
          asset: historyAsset, bills, transfers, lends, refunds, reimbursements, parents: allAssetsParents
        })
        let running = opening
        return (
          <Modal label={`${historyAsset.assetName} 流水`} onClose={() => setHistoryAsset(null)}>
            <h3>{historyAsset.simpleName || historyAsset.assetName}</h3>
            <p className="hint">
              期初 {money(opening)} · 当前 {accountMoney(historyAsset.assetNumber, historyAsset.currency, currencies, defaultCurrency)} · 共 {entries.length} 笔
            </p>
            {entries.length === 0 && <p className="hint">这个账户还没有流水。</p>}
            {entries.map((e) => {
              running = +(running + e.delta).toFixed(2)
              return (
                <div key={e.key} className="row">
                  <div className="grow">
                    <div>{e.label}</div>
                    <small>{dayOf(e.time)} · 余额 {money(running)}</small>
                  </div>
                  <b className={e.delta >= 0 ? 'in' : 'out'}>{e.delta >= 0 ? '+' : '-'}{money(Math.abs(e.delta))}</b>
                </div>
              )
            })}
            <div className="modal-btns">
              <button className="ghost" onClick={() => setHistoryAsset(null)}>关闭</button>
            </div>
          </Modal>
        )
      })()}

      </>)}
      {screen === 'stock' && (
      <div className="subpage-block">
      <div className="subpage-sum">
        <div><small>总市值</small><b>{mask(stockValue)}</b></div>
        <div><small>收益</small><b className={stockProfit < 0 ? 'out' : 'in'}>{mask(stockProfit)}</b></div>
      </div>
      
      <div className="row2">
        <input aria-label="持仓名称" value={stockForm.name} placeholder="名称，如 沪深300ETF"
          onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })} />
        <input aria-label="持仓代码" value={stockForm.code} placeholder="代码（可选）"
          onChange={(e) => setStockForm({ ...stockForm, code: e.target.value })} />
      </div>
      <div className="row2">
        <input aria-label="买入数量" value={stockForm.num} placeholder="数量" inputMode="decimal"
          onChange={(e) => setStockForm({ ...stockForm, num: e.target.value.replace(/[^\d.]/g, '') })} />
        <input aria-label="买入金额" value={stockForm.amount} placeholder="买入金额"
          onChange={(e) => setStockForm({ ...stockForm, amount: e.target.value.replace(/[^\d.]/g, '') })} />
      </div>
      <button className="ghost wide" onClick={() => {
        if (!stockForm.name.trim()) return notify('请填名称')
        const rec = addStockAsset({ name: stockForm.name, code: stockForm.code })
        if (Number(stockForm.num) > 0 && Number(stockForm.amount) > 0) {
          tradeStock(rec.stockAssetId, 1, Number(stockForm.num), Number(stockForm.amount))
        }
        setStockForm({ name: '', code: '', num: '', amount: '' })
        notify('持仓已建立')
      }}>建立持仓</button>

      {stockAssets.map((h) => {
        const price = h.price ?? h.primeCost
        const v = holdingValue(h.primeNum, h.primeCost, price)
        const profit = totalProfit(h.historyIncome, v.floating)
        return (
          <div key={h.stockAssetId} className="cat-block">
            <div className="row">
              <div className="grow">
                <b>{h.name}{h.code ? ` · ${h.code}` : ''}</b>
                <small>
                  {h.primeNum} 份 · 成本 {money(h.primeCost)} · 现价 {money(price)} ·
                  市值 {money(v.market)} · 盈亏 <span className={profit >= 0 ? 'in' : 'out'}>{money(profit)}</span>
                </small>
              </div>
              <button className="del" onClick={() => deleteStockAsset(h.stockAssetId)}>删</button>
            </div>
            <div className="cat-children">
              <div className="row2">
                <select aria-label={`${h.name} 成本法`} value={h.costMethod ?? 0}
                  onChange={(e) => setStockCostMethod(h.stockAssetId, Number(e.target.value) as 0 | 1 | 2)}>
                  <option value={0}>移动加权平均</option>
                  <option value={1}>先进先出</option>
                  <option value={2}>后进先出</option>
                </select>
                <button className="ghost" disabled={!h.code} onClick={async () => {
                  if (!h.code) return notify('这个持仓没有代码，无法拉行情')
                  try {
                    const r = await fetch(`/api/quote?code=${encodeURIComponent(h.code)}`, { credentials: 'same-origin' })
                    const j = await r.json()
                    if (j.code !== 0) throw new Error(j.msg)
                    setStockPrice(h.stockAssetId, j.result.price)
                    notify(`已更新 ${h.name} 现价 ${j.result.price}`)
                  } catch (e) { notify(errorMessage(e, '行情获取失败')) }
                }}>刷新行情</button>
              </div>
              <div className="row2">
                <input key={`price-${h.stockAssetId}-${h.price ?? ''}`} aria-label={`${h.name} 现价`} placeholder="当前价" defaultValue={h.price ?? ''}
                  inputMode="decimal"
                  onBlur={(e) => { const v2 = Number(e.target.value); if (v2 > 0) setStockPrice(h.stockAssetId, v2) }} />
                <input aria-label={`${h.name} 卖出份额`} placeholder="卖出份额" value={stockSell[h.stockAssetId] ?? ''}
                  onChange={(e) => setStockSell({ ...stockSell, [h.stockAssetId]: e.target.value.replace(/[^\d.]/g, '') })} />
                <input aria-label={`${h.name} 卖出金额`} placeholder="卖出金额" value={stockSellAmt[h.stockAssetId] ?? ''}
                  onChange={(e) => setStockSellAmt({ ...stockSellAmt, [h.stockAssetId]: e.target.value.replace(/[^\d.]/g, '') })} />
                <button className="link" onClick={() => {
                  const n = Number(stockSell[h.stockAssetId]); const amt = Number(stockSellAmt[h.stockAssetId])
                  if (!(n > 0) || !(amt > 0)) return notify('填卖出份额与金额')
                  if (!tradeStock(h.stockAssetId, 2, n, amt)) return notify('卖出份额超过持仓')
                  setStockSell({ ...stockSell, [h.stockAssetId]: '' })
                  setStockSellAmt({ ...stockSellAmt, [h.stockAssetId]: '' })
                  notify('已记录卖出')
                }}>卖出</button>
              </div>
            </div>
          </div>
        )
      })}

      </div>
      )}
      {screen === 'assets' && (<>
      <details className="fold">
        <summary>房贷计划</summary>
      
      <div className="row2">
        <input aria-label="商业贷款金额" placeholder="商贷金额" value={loanForm.commercial} inputMode="decimal"
          onChange={(e) => setLoanForm({ ...loanForm, commercial: e.target.value.replace(/[^\d.]/g, '') })} />
        <input aria-label="商贷年利率" placeholder="商贷年利率 %" value={loanForm.commercialRate} inputMode="decimal"
          onChange={(e) => setLoanForm({ ...loanForm, commercialRate: e.target.value.replace(/[^\d.]/g, '') })} />
      </div>
      <div className="row2">
        <input aria-label="公积金贷款金额" placeholder="公积金金额" value={loanForm.provident} inputMode="decimal"
          onChange={(e) => setLoanForm({ ...loanForm, provident: e.target.value.replace(/[^\d.]/g, '') })} />
        <input aria-label="公积金年利率" placeholder="公积金年利率 %" value={loanForm.providentRate} inputMode="decimal"
          onChange={(e) => setLoanForm({ ...loanForm, providentRate: e.target.value.replace(/[^\d.]/g, '') })} />
      </div>
      <div className="row2">
        <input aria-label="期数" placeholder="期数（月）" value={loanForm.periods} inputMode="numeric"
          onChange={(e) => setLoanForm({ ...loanForm, periods: e.target.value.replace(/\D/g, '') })} />
        <select aria-label="还款方式" value={loanForm.repayment}
          onChange={(e) => setLoanForm({ ...loanForm, repayment: e.target.value as 'equal-payment' | 'equal-principal' })}>
          <option value="equal-payment">等额本息</option>
          <option value="equal-principal">等额本金</option>
        </select>
      </div>
      {(() => {
        const plan = planLoan({
          commercial: { amount: Number(loanForm.commercial) || 0, rate: (Number(loanForm.commercialRate) || 0) / 100 },
          provident: { amount: Number(loanForm.provident) || 0, rate: (Number(loanForm.providentRate) || 0) / 100 },
          periods: Number(loanForm.periods) || 360,
          repayment: loanForm.repayment
        })
        if (!plan.periods.length) return null
        return (
          <div className="budget-box small">
            <div className="budget-line"><span>首期月供</span><b>{money(plan.firstMonthly)}</b></div>
            <div className="budget-line"><span>利息总额</span><b>{money(plan.totalInterest)}</b></div>
            <div className="budget-line"><span>还款总额</span><b>{money(plan.totalPrincipal + plan.totalInterest)}</b></div>
            <button className="ghost wide" onClick={() => {
              addHomeLoan({
                name: loanForm.name,
                commercial: Number(loanForm.commercial) || 0,
                commercialRate: (Number(loanForm.commercialRate) || 0) / 100,
                provident: Number(loanForm.provident) || 0,
                providentRate: (Number(loanForm.providentRate) || 0) / 100,
                lprAdd: Number(loanForm.lprAdd) || undefined,
                periods: Number(loanForm.periods) || 360,
                repayment: loanForm.repayment
              })
              notify('房贷计划已保存')
            }}>保存计划</button>
          </div>
        )
      })()}
      {homeLoans.map((l) => {
        const plan = planLoan({
          commercial: { amount: l.commercial, rate: l.commercialRate },
          provident: { amount: l.provident, rate: l.providentRate },
          periods: l.periods, repayment: l.repayment
        })
        return (
          <div key={l.loanId} className="row">
            <div className="grow">
              <div>{l.name} · {l.repayment === 'equal-payment' ? '等额本息' : '等额本金'}</div>
              <small>本金 {money(l.commercial + l.provident)} · 月供 {money(plan.firstMonthly)} · 利息 {money(plan.totalInterest)}</small>
            </div>
            <button className="del" onClick={() => deleteHomeLoan(l.loanId)}>删</button>
          </div>
        )
      })}

      </details>
      <details className="fold">
        <summary>信用卡分期</summary>
      <div className="row2">
        <input aria-label="分期本金" placeholder="分期本金" value={insForm.total} inputMode="decimal"
          onChange={(e) => setInsForm({ ...insForm, total: e.target.value.replace(/[^\d.]/g, '') })} />
        <input aria-label="分期期数" placeholder="期数" value={insForm.periods} inputMode="numeric"
          onChange={(e) => setInsForm({ ...insForm, periods: e.target.value.replace(/\D/g, '') })} />
      </div>
      <div className="row2">
        <input aria-label="手续费率" placeholder="总手续费率 %" value={insForm.serviceRate} inputMode="decimal"
          onChange={(e) => setInsForm({ ...insForm, serviceRate: e.target.value.replace(/[^\d.]/g, '') })} />
        <select aria-label="手续费方式" value={insForm.serviceType}
          onChange={(e) => setInsForm({ ...insForm, serviceType: Number(e.target.value) })}>
          <option value={0}>手续费一次性收</option>
          <option value={1}>手续费每期收</option>
        </select>
      </div>
      {(() => {
        const plan = planInstalment({
          total: Number(insForm.total) || 0,
          periods: Number(insForm.periods) || 12,
          serviceRate: (Number(insForm.serviceRate) || 0) / 100,
          serviceType: insForm.serviceType === 1 ? 1 : 0
        })
        if (!plan.periods.length) return null
        return (
          <div className="budget-box small">
            <div className="budget-line"><span>每期本金</span><b>{money(plan.periods[0].principal)}</b></div>
            <div className="budget-line"><span>手续费合计</span><b>{money(plan.totalService)}</b></div>
            <button className="ghost wide" onClick={() => {
              addInstalment({
                totalNumber: Number(insForm.total) || 0,
                periods: Number(insForm.periods) || 12,
                serviceRate: (Number(insForm.serviceRate) || 0) / 100,
                serviceType: insForm.serviceType === 1 ? 1 : 0,
                accountMonth: insForm.month,
                assetId: insForm.assetId || assets.find((a) => a.assetType === 2)?.assetId
              })
              notify('分期已登记')
            }}>登记分期</button>
          </div>
        )
      })()}
      {instalments.map((i) => {
        const plan = planInstalment({ total: i.totalNumber, periods: i.periods, serviceRate: i.serviceRate, serviceType: i.serviceType })
        return (
          <div key={i.instalmentId} className="row">
            <div className="grow">
              <div>{money(i.totalNumber)} · {i.periods} 期 · 手续费 {money(plan.totalService)}</div>
              <small>每期约 {money(plan.periods[0]?.principal ?? 0)} · 从 {i.accountMonth} 起</small>
            </div>
            <button className="link" onClick={() => {
              const n = postInstalmentBills(i.instalmentId)
              notify(n ? `已生成 ${n} 期账单` : '没有可生成的账单（账户缺失或已生成）')
            }}>生成账单</button>
            <button className="del" onClick={() => deleteInstalment(i.instalmentId)}>删</button>
          </div>
        )
      })}

      </details>
      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={(next) => { updateAsset(next); setEditingAsset(null); notify('账户已更新') }}
        />
      )}
      </>)}

      {screen === 'lend' && (
      <div className="subpage-block">
      <div className="subpage-sum">
        <div><small>借入</small><b>{mask(payable)}</b></div>
        <div><small>借出</small><b>{mask(receivable)}</b></div>
      </div>
      {lends.length === 0 && <p className="hint">还没有借贷记录。</p>}
      {lends.slice(0, 8).map((l) => (
        <div key={l.lendId} className="row">
          <div className="grow">
            <div>{LEND_TYPE[l.type]} · {l.counterparty || '未填对方'}</div>
            <small>
              {assets.find((a) => a.assetId === l.assetId)?.assetName ?? '账户'} · {dayOf(l.time)}
              {l.interest ? ` · 利息 ${money(l.interest)}` : ''}
              {(l.type === 1 || l.type === 3) && l.parentLendId == null
                ? (lendRemaining(l, lends) > 0
                  ? ` · ${l.type === 1 ? '未收' : '未还'} ${money(lendRemaining(l, lends))}`
                  : ' · ✅ 已结清')
                : ''}
              {l.remark ? ' · ' + l.remark : ''}
            </small>
          </div>
          <b className={l.type === 2 || l.type === 4 ? 'neutral' : ''}>{money(l.number)}</b>
          {(l.type === 1 || l.type === 3) && lendRemaining(l, lends) > 0 && (
            <button className="link" aria-label={`结清 ${l.counterparty}`}
              onClick={() => { repayLend({ lendId: l.lendId, amount: lendRemaining(l, lends), repaymentAssetId: l.repaymentAssetId ?? l.assetId }) }}>结清</button>
          )}
          {(l.type === 1 || l.type === 3) && lendRemaining(l, lends) > 0 && (
            <button className="link" aria-label={`${l.type === 1 ? '收款' : '还款'} ${l.counterparty}`}
              onClick={() => setRepayForm({
                lendId: l.lendId, remaining: lendRemaining(l, lends), amount: '',
                assetId: l.repaymentAssetId ?? l.assetId
              })}>{l.type === 1 ? '收' : '还'}</button>
          )}
          <button className="del" aria-label={`删除${LEND_TYPE[l.type]}记录`} onClick={() => deleteLend(l.lendId)}>删</button>
        </div>
      ))}
      <button className="ghost wide" onClick={() => setLendForm({
        type: 1, assetId: assets[0]?.assetId ?? 0, counterparty: '', number: '',
        interest: '', repaymentAssetId: 0, remark: ''
      })}>记一笔借贷</button>

      {repayForm && (
        <Modal label="部分还款" onClose={() => setRepayForm(null)}>
          <h3>{lends.find((x) => x.lendId === repayForm.lendId)?.type === 1 ? '收回' : '还款'}</h3>
          <p className="hint">剩余 {money(repayForm.remaining)}</p>
          <div className="label">本次金额</div>
          <input aria-label="本次还款金额" autoFocus inputMode="decimal" value={repayForm.amount}
            placeholder={`最多 ${repayForm.remaining}`}
            onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="label">进哪个账户</div>
          <select aria-label="还款账户" value={repayForm.assetId}
            onChange={(e) => setRepayForm({ ...repayForm, assetId: Number(e.target.value) })}>
            {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
          </select>
          <div className="modal-btns">
            <button className="ghost" onClick={() => setRepayForm(null)}>取消</button>
            <button className="primary"
              disabled={!(Number(repayForm.amount) > 0) || Number(repayForm.amount) > repayForm.remaining}
              onClick={() => { repayLend({ lendId: repayForm.lendId, amount: Number(repayForm.amount), repaymentAssetId: repayForm.assetId }); setRepayForm(null) }}>确认</button>
          </div>
        </Modal>
      )}

      {lendForm && (
        <Modal label="借入借出" onClose={() => setLendForm(null)}>
            <h3>借入借出</h3>
            <div className="label">类型</div>
            <select aria-label="借贷类型" value={lendForm.type} onChange={(e) => setLendForm({ ...lendForm, type: Number(e.target.value) as 1 | 2 | 3 | 4 })}>
              {Object.entries(LEND_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="label">对方</div>
            <input aria-label="借贷对方" value={lendForm.counterparty} onChange={(e) => setLendForm({ ...lendForm, counterparty: e.target.value })} placeholder="借给谁 / 向谁借" />
            <div className="label">金额</div>
            <input aria-label="借贷金额" value={lendForm.number} autoFocus inputMode="decimal"
              onChange={(e) => setLendForm({ ...lendForm, number: e.target.value.replace(/[^\d.]/g, '') })} />
            <div className="row2">
              <div>
                <div className="label">利息（可选）</div>
                <input aria-label="借贷利息" value={lendForm.interest} inputMode="decimal"
                  onChange={(e) => setLendForm({ ...lendForm, interest: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
              <div>
                <div className="label">
                  {lendForm.type === 2 || lendForm.type === 4 ? '收款账户' : '资金账户'}
                </div>
                <select
                  aria-label={lendForm.type === 2 || lendForm.type === 4 ? '收款账户' : '资金账户'}
                  value={lendForm.repaymentAssetId || lendForm.assetId}
                  onChange={(e) => setLendForm({
                    ...lendForm,
                    ...(lendForm.type === 2 || lendForm.type === 4
                      ? { repaymentAssetId: Number(e.target.value) }
                      : { assetId: Number(e.target.value) })
                  })}>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
              </div>
            </div>
            <div className="label">备注</div>
            <input aria-label="借贷备注" value={lendForm.remark} onChange={(e) => setLendForm({ ...lendForm, remark: e.target.value })} />
            <p className="hint"></p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setLendForm(null)}>取消</button>
              <button className="primary" onClick={() => {
                addLend({
                  type: lendForm.type, assetId: lendForm.assetId,
                  counterparty: lendForm.counterparty, number: Number(lendForm.number) || 0,
                  interest: Number(lendForm.interest) || 0,
                  repaymentAssetId: lendForm.repaymentAssetId || undefined,
                  remark: lendForm.remark
                })
                setLendForm(null)
              }}>保存</button>
            </div>
        </Modal>
      )}

      </div>
      )}
      {screen === 'hidden' && (
        <HiddenPage
          title="隐藏资产"
          tip="这里是被隐藏或不计入总资产的账户。资产页下拉可再次进入本页。"
          summary={[
            { label: '隐藏账户', value: `${assets.filter((a) => a.hide === true || a.intoTotalAsset === false).length} 个` },
            { label: '隐藏合计', value: mask(assets.filter((a) => a.hide === true || a.intoTotalAsset === false)
              .reduce((s2, a) => s2 + Math.abs(toBase(a.assetNumber, a.currency, currencies, defaultCurrency)), 0)) }
          ]}
          groups={[
            {
              key: 'reimburse', label: '报销',
              rows: assets.filter((a) => (a.hide === true || a.intoTotalAsset === false) && a.assetType === 9)
                .map((a) => ({ key: String(a.assetId), name: a.simpleName || a.assetName, value: mask(a.assetNumber),
                  onRestore: () => { updateAsset({ ...a, hide: false }); notify('已恢复显示（是否计入总资产保持不变）') } }))
            },
            {
              key: 'lend', label: '借贷',
              rows: assets.filter((a) => (a.hide === true || a.intoTotalAsset === false) && (a.assetType === 6 || a.assetType === 7))
                .map((a) => ({ key: String(a.assetId), name: a.simpleName || a.assetName, value: mask(a.assetNumber),
                  onRestore: () => { updateAsset({ ...a, hide: false }); notify('已恢复显示（是否计入总资产保持不变）') } }))
            },
            {
              key: 'stock', label: '投资持仓',
              rows: (stockAssets ?? []).filter((st) => st.hide === true)
                .map((st) => ({ key: `stock-${st.stockAssetId}`, name: st.name, value: String(st.primeNum),
                  onRestore: () => { setStockHidden(st.stockAssetId, false); notify('已恢复显示') } }))
            },
            {
              key: 'other', label: '其他隐藏账户',
              rows: assets.filter((a) => (a.hide === true || a.intoTotalAsset === false) && ![6, 7, 9].includes(a.assetType))
                .map((a) => ({ key: String(a.assetId), name: a.simpleName || a.assetName, value: mask(a.assetNumber),
                  onRestore: () => { updateAsset({ ...a, hide: false }); notify('已恢复显示（是否计入总资产保持不变）') } }))
            }
          ]}
          emptyText="没有隐藏的账户。"
        />
      )}

      {screen === 'reimburse' && (<>
        <div className="subpage-sum">
          <div><small>未报销</small><b>{mask(pendingReimburse)}</b></div>
          <div><small>已报销</small><b>{mask(doneReimburse)}</b></div>
        </div>
        <div className="row"><b className="grow">待报销明细</b><span className="muted">共 {pendingReimburseCount} 笔</span></div>
        {reimbursements.filter((r) => r.status === 'pending').length === 0 && <p className="hint">没有待报销的账单。</p>}
        {reimbursements.filter((r) => r.status === 'pending').map((r) => {
          const bill = bills.find((b) => String(b.billId) === String(r.billId))
          return (
            <div key={r.reimbursementId} className="row">
              <div className="grow">
                <div>{bill?.remark || `账单 ${String(r.billId).slice(0, 6)}`}</div>
                <small>{dayOf(r.updateTime ?? Date.now())}{r.detail ? ` · ${r.detail}` : ''}</small>
              </div>
              <b>{money(r.number || 0)}</b>
              <button type="button" className="del" onClick={() => { deleteReimbursement(r.reimbursementId); notify('已撤销该笔报销登记') }}>撤销</button>
            </div>
          )
        })}
      </>)}

      {screen === 'assets' && (<>
      <details className="fold">
        <summary>新增账户</summary>
      {/* 字段顺序照一木 AddCapitalActivity / AddCreditCardActivity */}
      <input aria-label="新账户名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="账户名（如：招行储蓄卡）" />
      <div className="row2">
        <select aria-label="新账户类型" value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="新账户币种" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select>
      </div>
      <div className="row2">
        <input aria-label="账户简称" value={newSimple} onChange={(e) => setNewSimple(e.target.value)} placeholder="简称（可选）" maxLength={8} />
        <input aria-label="卡号后四位" value={newCardCode} onChange={(e) => setNewCardCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="卡号后四位（可选）" />
      </div>
      <div className="row2">
        <input aria-label="新账户余额" value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="余额（信用卡填负数）" />
        <select aria-label="新账户归属" value={newBookId} onChange={(e) => setNewBookId(e.target.value)}>
          <option value="">私有（只有我可见）</option>
          {accountBooks.filter((b) => b.bookId != null).map((b) => (
            <option key={String(b.bookId)} value={String(b.bookId)}>共享到「{b.accountBookName}」</option>
          ))}
        </select>
      </div>

      {type === 2 && (
        <div className="row2">
          <input aria-label="信用额度" value={newQuota} onChange={(e) => setNewQuota(e.target.value.replace(/[^\d.]/g, ''))} placeholder="信用额度" />
          <input aria-label="账单日" value={newInDay} onChange={(e) => setNewInDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="账单日（1-28）" />
          <input aria-label="还款日" value={newOutDay} onChange={(e) => setNewOutDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="还款日（1-28）" />
        </div>
      )}

      <div className="label">账户图标</div>
      <button type="button" className="icon-pick" onClick={() => setPickerOpen(true)}>
        <span className="asset-badge"><AssetIcon type={type} name={name} icon={newIcon} size={20} /></span>
        <span>{iconLabel(newIcon) || '点击选择图标'}</span>
        <span className="muted">›</span>
      </button>

      <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={newIntoTotal} onChange={(e) => setNewIntoTotal(e.target.checked)} />
        计入总资产
      </label>
      <input aria-label="账户备注" value={newRemark} onChange={(e) => setNewRemark(e.target.value)} placeholder="备注（可选）" />

      <button className="ghost wide" onClick={create}>添加</button>

      {pickerOpen && (
        <IconPicker value={newIcon} assetType={type}
          onChange={(icon) => setNewIcon(icon ?? '')}
          onClose={() => setPickerOpen(false)} />
      )}

      {settingOpen && (
        <div className="menu-mask" onClick={() => setSettingOpen(false)}>
          <div className="home-menu" role="dialog" aria-label="资产设置" onClick={(e) => e.stopPropagation()}>
            <div className="hm-group">
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setScreen('hidden') }}>资产隐藏</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setSankeyOpen(true) }}>资产分布</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); openComposition('资产组成', assetRows(assets)) }}>资产组成</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setRemindOpen(true) }}>还款提醒</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); onOpenStats?.() }}>资产统计</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setAssetSearchOpen(true) }}>搜索账户</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setBookScopeOpen(true) }}>生效账本</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setDepositOpen(true) }}>定期存款</button>
              <button type="button" className="hm-item" onClick={() => { setSettingOpen(false); setMoreDataOpen(true) }}>更多数据</button>
            </div>
            <button type="button" className="ghost wide" onClick={() => setSettingOpen(false)}>关闭</button>
          </div>
        </div>
      )}

      {sankeyOpen && (
        <Modal label="资产分布" onClose={() => setSankeyOpen(false)}>
          <h3>资产分布</h3>
          <AssetSankey />
          <div className="modal-btns"><button type="button" className="ghost" onClick={() => setSankeyOpen(false)}>关闭</button></div>
        </Modal>
      )}

      {moreDataOpen && (() => {
        const cards = assets.filter((a) => a.assetType === 2)
        const monthDebt = cards.reduce((n, a) => n + Math.max(0, -a.assetNumber), 0)
        const cash = assets.filter((a) => a.assetType !== 2).reduce((n, a) => n + Math.max(0, a.assetNumber), 0)
        return (
          <Modal label="资产数据" onClose={() => setMoreDataOpen(false)}>
            <h3>资产数据</h3>
            <div className="row"><span className="grow">本月总还款</span><b>{mask(monthDebt)}</b></div>
            <div className="row"><span className="grow">本月剩余待还</span><b>{mask(monthDebt)}</b></div>
            <div className="row"><span className="grow">可使用资金</span><b>{mask(cash)}</b></div>
            <div className="modal-btns"><button type="button" className="ghost" onClick={() => setMoreDataOpen(false)}>关闭</button></div>
          </Modal>
        )
      })()}

      {bookScopeOpen && (
        <Modal label="生效账本" onClose={() => setBookScopeOpen(false)}>
          <h3>生效账本</h3>
          <p className="hint">为每个账本设置需要显示/隐藏的资产账户。</p>
          {assets.map((a) => {
            const allBooks = accountBooks.map((b) => String(b.bookId))
            const cur = String(bookScopeId)
            // showBook 未设置 = 全部账本可见；空数组 = 全部账本隐藏（两者语义不同）
            const scope = a.showBook == null ? allBooks : a.showBook.map(String)
            const shown = scope.includes(cur)
            return (
              <label key={a.assetId} className="row asset-scope-row">
                <span className="grow">{a.simpleName || a.assetName}</span>
                <input type="checkbox" checked={shown} onChange={(e) => {
                  const next = new Set(scope)
                  if (e.target.checked) next.add(cur); else next.delete(cur)
                  // 覆盖全部账本时回写 undefined（=全部可见）；否则写具体列表（可能是空 = 全隐藏）
                  updateAsset({ ...a, showBook: next.size >= allBooks.length ? undefined : [...next] })
                }} />
              </label>
            )
          })}
          <div className="modal-btns"><button type="button" className="ghost" onClick={() => setBookScopeOpen(false)}>完成</button></div>
        </Modal>
      )}

      {assetSearchOpen && (
        <Modal label="搜索账户" onClose={() => setAssetSearchOpen(false)}>
          <h3>搜索账户</h3>
          <input className="sp-input" aria-label="搜索账户" autoFocus placeholder="账户名 / 分组"
            value={assetKw} onChange={(e) => setAssetKw(e.target.value)} />
          {assets
            .filter((a) => !assetKw.trim() || (a.simpleName || a.assetName).includes(assetKw.trim()) || a.groupName?.includes(assetKw.trim()))
            .map((a) => (
              <div key={a.assetId} className="row">
                <span className="grow">{a.simpleName || a.assetName}</span>
                <span className="muted">{ASSET_TYPE[a.assetType] ?? ''}</span>
                <b>{mask(a.assetNumber)}</b>
              </div>
            ))}
          <div className="modal-btns"><button type="button" className="ghost" onClick={() => setAssetSearchOpen(false)}>关闭</button></div>
        </Modal>
      )}

      {remindOpen && (
        <Modal label="还款提醒" onClose={() => setRemindOpen(false)}>
          <h3>还款提醒</h3>
          <div className="label">提前天数</div>
          <select aria-label="提前天数" value={remindDays}
            onChange={(e) => { const v = Number(e.target.value); setRemindDays(v); try { localStorage.setItem('xiaoman-repay-remind', String(v)) } catch { /* 忽略 */ } }}>
            {[1, 3, 5, 7].map((d) => <option key={d} value={d}>提前 {d} 天</option>)}
          </select>
          <div className="label">账户还款日</div>
          {assets.filter((a) => a.assetType === 2).length === 0 && <p className="hint">没有信贷账户。</p>}
          {assets.filter((a) => a.assetType === 2).map((a) => (
            <div key={a.assetId} className="row">
              <span className="grow">{a.simpleName || a.assetName}</span>
              <span className="muted">{a.outAccountDate ? `每月 ${a.outAccountDate} 日` : '未设置'}</span>
            </div>
          ))}
          <div className="modal-btns"><button type="button" className="ghost" onClick={() => setRemindOpen(false)}>完成</button></div>
        </Modal>
      )}

      {depositOpen && <FixedDepositList onBack={() => setDepositOpen(false)} notify={notify} />}

      {repayOpen && (
        <Modal label="还款提醒" onClose={() => setRepayOpen(false)}>
          <h3>还款提醒</h3>
          {assets.filter((a) => a.assetType === 2).length === 0 && <p className="hint">没有信贷账户。</p>}
          {assets.filter((a) => a.assetType === 2).map((a) => (
            <div key={a.assetId} className="row">
              <span className="grow">{a.simpleName || a.assetName}</span>
              <span className="muted">{a.outAccountDate ? `${a.outAccountDate} 日还款` : '未设还款日'}</span>
              <b className="out">{mask(Math.abs(a.assetNumber))}</b>
            </div>
          ))}
          <div className="modal-btns"><button type="button" className="ghost" onClick={() => setRepayOpen(false)}>关闭</button></div>
        </Modal>
      )}

      {composition && (
        <Modal label={composition.title} onClose={() => setComposition(null)}>
          <h3>{composition.title}</h3>
          {composition.note && <p className="hint">{composition.note}</p>}
          {composition.rows.length === 0 && <p className="hint">没有可展示的账户。</p>}
          {composition.rows.map((r) => (
            <div key={r.name} className="row">
              <span className="grow">{r.name}</span>
              <b>{r.unit === 'count' ? `${r.amount} 个` : r.unit === 'percent' ? `${r.amount}%` : mask(r.amount)}</b>
            </div>
          ))}
          {composition.rows.some((r) => (r.unit ?? 'money') === 'money') && (
            <div className="row">
              <span className="grow">合计</span>
              <b>{mask(composition.rows.filter((r) => (r.unit ?? 'money') === 'money').reduce((sum, r) => sum + r.amount, 0))}</b>
            </div>
          )}
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setComposition(null)}>关闭</button>
          </div>
        </Modal>
      )}
      </details>
      </>)}
    </section>
  )
}


/** 信用卡还款提醒：仅在未来 3 天内提示 */
function dueHint(day?: number): string | null {
  if (!day) return null
  const today = new Date()
  const target = new Date(today.getFullYear(), today.getMonth(), day)
  if (target.getDate() !== day) return null            // 该月没有这一天
  if (target < new Date(today.getFullYear(), today.getMonth(), today.getDate())) target.setMonth(target.getMonth() + 1)
  const diff = Math.round((target.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  if (diff === 0) return '今天还款'
  if (diff <= 3) return `${diff} 天后还款`
  return null
}

function AssetEditor({ asset, onClose, onSave }: { asset: Asset; onClose: () => void; onSave: (a: Asset) => void }) {
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const hasActivity = useLedger((s) =>
    s.bills.some((b) => b.assetId === asset.assetId) ||
    s.transfers.some((t) => t.fromAssetId === asset.assetId || t.toAssetId === asset.assetId) ||
    s.lends.some((l) => l.assetId === asset.assetId || l.repaymentAssetId === asset.assetId) ||
    s.refunds.some((r) => r.assetId === asset.assetId) ||
    s.reimbursements.some((r) => r.assetId === asset.assetId))
  const [currency, setCurrency] = useState(asset.currency ?? defaultCurrency)
  const [quota, setQuota] = useState(asset.totalQuota ? String(asset.totalQuota) : '')
  const [cardCode, setCardCode] = useState(asset.cardCode ?? '')
  const [inDay, setInDay] = useState(asset.inAccountDate ? String(asset.inAccountDate) : '')
  const accountBooks = useLedger((s) => s.accountBooks)
  const allAssetsForEditor = useLedger((s) => s.assets)
  const [bookId, setBookId] = useState(asset.bookId == null ? '' : String(asset.bookId))
  const [simpleName, setSimpleName] = useState(asset.simpleName ?? '')
  const [icon, setIcon] = useState(asset.assetIcon ?? '')
  const [outNotNext, setOutNotNext] = useState(Boolean(asset.outDayNotNext))
  const [reimQuota, setReimQuota] = useState(asset.reimAssetNumber != null ? String(asset.reimAssetNumber) : '')
  const [shareQuota, setShareQuota] = useState(asset.shareQuotaAsset != null ? String(asset.shareQuotaAsset) : '')
  const [outDay, setOutDay] = useState(asset.outAccountDate ? String(asset.outAccountDate) : '')
  const [name, setName] = useState(asset.assetName)
  const [type, setType] = useState(asset.assetType)
  // 留空＝保持原余额；填入即覆盖（避免把新值追加在旧值后面）
  const [num, setNum] = useState('')

  return (
    <Modal label="编辑账户" onClose={onClose}>
        <h3>编辑账户</h3>
        <div className="label">名称</div>
        <input aria-label="账户名称" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="label">币种</div>
        <select aria-label="账户币种" value={currency} disabled={hasActivity} onChange={(e) => setCurrency(e.target.value)}>
          {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
        </select>
        {hasActivity && <p className="hint">有流水的账户不能改币种。</p>}
        <div className="label">类型</div>
        <select aria-label="账户类型" value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="row2">
          <div>
            <div className="label">总额度（信用卡）</div>
            <input aria-label="信用卡总额度" value={quota} inputMode="decimal" placeholder="可留空"
              onChange={(e) => setQuota(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div>
            <div className="label">卡号后四位</div>
            <input aria-label="卡号后四位" value={cardCode} placeholder="可留空" maxLength={4}
              onChange={(e) => setCardCode(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div className="row2">
          <div>
            <div className="label">账单日（1–28）</div>
            <input aria-label="账单日" value={inDay} inputMode="numeric" placeholder="可留空"
              onChange={(e) => setInDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
          <div>
            <div className="label">还款日（1–28）</div>
            <input aria-label="还款日" value={outDay} inputMode="numeric" placeholder="可留空"
              onChange={(e) => setOutDay(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </div>
        </div>
        <div className="row2">
          <div>
            <div className="label">简称（可选）</div>
            <input aria-label="账户简称" value={simpleName} placeholder="列表里优先显示" maxLength={8}
              onChange={(e) => setSimpleName(e.target.value)} />
          </div>
          <div>
            <div className="label">图标</div>
            <select aria-label="账户图标" value={icon} onChange={(e) => setIcon(e.target.value)}>
              <option value="">按类型默认</option>
              {ASSET_ICON_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
                {group.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </optgroup>)}
            </select>
            <span className="asset-badge" aria-label="所选图标预览"><AssetIcon type={type} name={name} icon={icon} size={20} /></span>
          </div>
        </div>
        <div className="row2">
          <div>
            <div className="label">报销额度（可选）</div>
            <input aria-label="报销额度" value={reimQuota} inputMode="decimal" placeholder="用于提示"
              onChange={(e) => setReimQuota(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div>
            <div className="label">额度共享自</div>
            <select aria-label="额度共享自" value={shareQuota} onChange={(e) => setShareQuota(e.target.value)}>
              <option value="">不共享</option>
              {allAssetsForEditor.filter((a) => a.assetId !== asset.assetId).map((a) => (
                <option key={a.assetId} value={a.assetId}>{a.assetName}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={outNotNext} onChange={(e) => setOutNotNext(e.target.checked)} />
          还款日顺延到下月（账单日之后还款）
        </label>

        <div className="label">归属</div>
        <select aria-label="账户归属" value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">私有（只有我可见）</option>
          {accountBooks.filter((b) => b.bookId != null).map((b) => (
            <option key={String(b.bookId)} value={String(b.bookId)}>共享到「{b.accountBookName}」</option>
          ))}
        </select>
        

        <div className="label">设为实际余额（当前 {accountMoney(asset.assetNumber, asset.currency, currencies, defaultCurrency)}，信用卡填负数）</div>
        <input
          aria-label="账户实际余额"
          value={num}
          autoFocus
          placeholder="留空则保持不变"
          onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))}
          inputMode="decimal"
        />
        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" onClick={() => {
            const day = (v: string) => {
              const n = Number(v)
              return Number.isFinite(n) && n >= 1 && n <= 28 ? n : undefined
            }
            onSave({
              ...asset,
              assetName: name.trim() || asset.assetName,
              assetType: type,
              currency,
              totalQuota: quota.trim() === '' ? undefined : Number(quota),
              cardCode: cardCode.trim() || undefined,
              bookId: bookId === '' ? undefined : bookId,
              simpleName: simpleName.trim() || undefined,
              assetIcon: icon || undefined,
              outDayNotNext: outNotNext || undefined,
              reimAssetNumber: reimQuota.trim() === '' ? undefined : Number(reimQuota),
              shareQuotaAsset: shareQuota === '' ? undefined : Number(shareQuota),
              inAccountDate: day(inDay),
              outAccountDate: day(outDay),
              assetNumber: num.trim() === '' ? asset.assetNumber : (Number(num) || 0)
            })
          }}>保存</button>
        </div>
    </Modal>
  )
}
