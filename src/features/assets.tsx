import { useState } from 'react'
import { useLedger, useTotalAssets } from '../store'
import { ASSET_TYPE, LEND_TYPE } from '../types'
import type { Asset } from '../types'
import { money, dayOf } from '../ui-format'
import { errorMessage } from '../errors'
import { AssetIcon } from '../ui/icons'
import { ASSET_ICON_GROUPS } from '../ui/asset-icons'
import { Modal } from '../ui/modal'
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

export function Assets({ notify, onOpenSettings }: { notify: (m: string) => void; onOpenSettings?: () => void }) {
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
  const addStockAsset = useLedger((s) => s.addStockAsset)
  const deleteStockAsset = useLedger((s) => s.deleteStockAsset)
  const tradeStock = useLedger((s) => s.tradeStock)
  const setStockPrice = useLedger((s) => s.setStockPrice)
  const setStockCostMethod = useLedger((s) => s.setStockCostMethod)
  const [stockForm, setStockForm] = useState({ name: '', code: '', num: '', amount: '' })
  const [stockSell, setStockSell] = useState<Record<number, string>>({})
  const [stockSellAmt, setStockSellAmt] = useState<Record<number, string>>({})
  const [loanForm, setLoanForm] = useState({ name: '房贷', commercial: '', commercialRate: '4.3', provident: '', providentRate: '3.1', lprAdd: '', periods: '360', repayment: 'equal-payment' as 'equal-payment' | 'equal-principal' })
  const [insForm, setInsForm] = useState({ total: '', periods: '12', serviceRate: '7.2', serviceType: 0, month: new Date().toISOString().slice(0, 7), assetId: 0 })
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
  const [composition, setComposition] = useState<{ title: string; rows: Array<{ name: string; amount: number }> } | null>(null)
  const openComposition = (title: string, list: Asset[]) => setComposition({
    title,
    rows: list
      .map((a) => ({ name: a.simpleName || a.assetName, amount: toBase(a.assetNumber, a.currency, currencies, defaultCurrency) }))
      .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))
  })
  const mask = (v: number) => (hideAmount ? '••••' : money(v))
  const deposit = assets.filter((a) => a.assetNumber > 0).reduce((s, a) => s + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0)
  const liability = Math.abs(assets.filter((a) => a.assetNumber < 0).reduce((s, a) => s + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0))
  const pendingReimburse = reimbursements.filter((r) => r.status === 'pending').reduce((s, r) => s + (r.number || 0), 0)
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
    <section className="card">
      <div className="asset-banner">
        <div className="asset-net">
          <div className="asset-net-label">
            <small>净资产</small>
            <button type="button" className="link" aria-label={hideAmount ? '显示金额' : '隐藏金额'}
              onClick={() => setHideAmount((v) => !v)}>{hideAmount ? '显示' : '隐藏'}</button>
          </div>
          <button type="button" className="link asset-net-value" onClick={() => openComposition('净资产构成', assets)}>
            {mask(total)}
          </button>
        </div>
        <div className="asset-two">
          <button type="button" className="asset-two-item" onClick={() => openComposition('存款构成', assets.filter((a) => a.assetNumber > 0))}>
            <small>存款</small><b>{mask(deposit)}</b>
          </button>
          <button type="button" className="asset-two-item" onClick={() => openComposition('负债构成', assets.filter((a) => a.assetNumber < 0))}>
            <small>负债</small><b>{mask(liability)}</b>
          </button>
        </div>
        {onOpenSettings && <button type="button" className="link asset-setting" onClick={onOpenSettings}>资产设置</button>}
      </div>

      <div className="asset-cards">
        <button type="button" className="asset-card" onClick={() => openComposition('待报销明细', assets.filter((a) => a.reimAssetNumber))}>
          <small>待报销</small>
          <b>{mask(pendingReimburse)}</b>
          <small className="dim">已报 {mask(doneReimburse)}</small>
        </button>
        <button type="button" className="asset-card" onClick={() => document.getElementById('block-lend')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <small>借出借入</small>
          <b>{mask(receivable)}</b>
          <small className="dim">借入 {mask(payable)}</small>
        </button>
        <button type="button" className="asset-card" onClick={() => document.getElementById('block-stock')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <small>投资</small>
          <b>{mask(stockValue)}</b>
          <small className="dim">收益 {mask(stockProfit)}</small>
        </button>
      </div>

      <p className="hint">余额会随记账自动变动；点账户名看流水，点「改」可填实际余额。</p>

      {grouped.map(([typeKey, list]) => (
        <div key={typeKey} className="asset-group">
          <button type="button" className="asset-group-head" onClick={() => openComposition(`${ASSET_TYPE[Number(typeKey)] ?? '其他'} · 构成`, list)}>
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

      <h3 id="block-stock">投资持仓</h3>
      <p className="hint">按一木的持仓模型记录：买入/卖出自动算移动加权成本与已实现盈亏，填当前价看浮动盈亏。</p>
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
                <input aria-label={`${h.name} 现价`} placeholder="当前价" defaultValue={h.price ?? ''}
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

      <h3>房贷计划</h3>
      <p className="hint">组合贷：商业贷款 + 公积金贷款，支持等额本息/等额本金与 LPR 加点。</p>
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

      <h3>信用卡分期</h3>
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

      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={(next) => { updateAsset(next); setEditingAsset(null); notify('账户已更新') }}
        />
      )}

      <h3 id="block-lend">借入借出</h3>
      {(receivable !== 0 || payable !== 0) && (
        <p className="hint">待收回 {money(receivable)} · 待归还 {money(payable)}</p>
      )}
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
            <p className="hint">借出减少账户余额，收回与借入增加，归还减少；不计入收支。</p>
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

      <div className="label">新增账户</div>
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

      {composition && (
        <Modal label={composition.title} onClose={() => setComposition(null)}>
          <h3>{composition.title}</h3>
          {composition.rows.length === 0 && <p className="hint">没有可展示的账户。</p>}
          {composition.rows.map((r) => (
            <div key={r.name} className="row">
              <span className="grow">{r.name}</span>
              <b>{mask(r.amount)}</b>
            </div>
          ))}
          <div className="row">
            <span className="grow">合计</span>
            <b>{mask(composition.rows.reduce((sum, r) => sum + r.amount, 0))}</b>
          </div>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setComposition(null)}>关闭</button>
          </div>
        </Modal>
      )}
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
        {hasActivity && <p className="hint">已有流水的账户不能直接更改币种，避免改变历史金额的含义。</p>}
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
        <p className="hint">私有账户不会出现在共享账本的账单里；共享后该账本成员都能看到这个账户。</p>

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
