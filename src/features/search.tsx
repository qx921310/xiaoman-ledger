import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store'
import { money, dayOf, hhmm } from '../ui-format'
import { billNetAmount } from '../bill-amount'
import { CatIcon } from '../ui/icons'

const HISTORY_KEY = 'xiaoman-search-history'

/**
 * 账单搜索页（对应一木 BillSearchActivity / activity_bill_search.xml）
 * 结构：搜索框 → 搜索历史 → 结果汇总（笔数/支出/收入/结余）+ 排序 → 结果列表
 * 输入约定与一木一致：空格分隔多个关键词（AND），# 开头按标签匹配。
 */
export function Search({ onClose, onPick }: { onClose: () => void; onPick?: (billId: string | number) => void }) {
  const bills = useLedger((s) => s.bills)
  const parents = useLedger((s) => s.parentCategories)
  const refunds = useLedger((s) => s.refunds)
  const tags = useLedger((s) => s.tags)
  const assets = useLedger((s) => s.assets)
  const bookId = useLedger((s) => s.currentBookId)
  const billTags = useLedger((s) => (s as unknown as { billTags?: Array<{ billId: number | string; tagId: number }> }).billTags ?? [])

  const [kw, setKw] = useState('')
  const [sort, setSort] = useState<'time' | 'amount'>('time')
  const [filterOpen, setFilterOpen] = useState(false)
  const [fPid, setFPid] = useState<number | 0>(0)
  const [fAid, setFAid] = useState<number | 0>(0)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')) } catch { setHistory([]) }
  }, [])
  const remember = (word: string) => {
    const w = word.trim()
    if (!w) return
    const next = [w, ...history.filter((h) => h !== w)].slice(0, 12)
    setHistory(next)
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch { /* 隐私模式忽略 */ }
  }
  const clearHistory = () => {
    setHistory([])
    try { localStorage.removeItem(HISTORY_KEY) } catch { /* 忽略 */ }
  }

  const terms = useMemo(() => kw.trim().split(/\s+/).filter(Boolean), [kw])

  const hits = useMemo(() => {
    if (terms.length === 0 && !fPid && !fAid && !from && !to) return []
    const tagNameOf = new Map(tags.map((t) => [t.tagId, t.name]))
    const bookTagsOf = new Map<string, string[]>()
    for (const bt of billTags) {
      const name = tagNameOf.get(bt.tagId)
      if (!name) continue
      const key = String(bt.billId)
      bookTagsOf.set(key, [...(bookTagsOf.get(key) ?? []), name])
    }
    const matched = bills.filter((b) => {
      if (bookId !== 0 && String(b.bookId) !== String(bookId)) return false
      if (fPid && b.parentCategoryId !== fPid) return false
      if (fAid && b.assetId !== fAid) return false
      const day = new Date(b.time).toISOString().slice(0, 10)
      if (from && day < from) return false
      if (to && day > to) return false
      const cat = parents.find((p) => p.id === b.parentCategoryId)?.name ?? ''
      const billTagNames = bookTagsOf.get(String(b.billId)) ?? []
      const haystack = [cat, b.remark ?? '', ...billTagNames].join(' ')
      if (terms.length === 0) return true
      return terms.every((t) =>
        t.startsWith('#') ? billTagNames.some((n) => n.includes(t.slice(1))) : haystack.includes(t)
      )
    })
    return sort === 'time'
      ? matched.sort((a, b) => b.time - a.time)
      : matched.sort((a, b) => b.cost - a.cost)
  }, [terms, bills, bookId, parents, tags, billTags, sort, fPid, fAid, from, to])

  const sum = useMemo(() => {
    let income = 0, expense = 0
    for (const b of hits) {
      if (parents.find((p) => p.id === b.parentCategoryId)?.kind === 'income') income += b.cost
      else expense += billNetAmount(b, refunds)
    }
    return { income: +income.toFixed(2), expense: +expense.toFixed(2), balance: +(income - expense).toFixed(2) }
  }, [hits, parents, refunds])

  return (
    <section className="card search-page">
      <div className="sp-head">
        <button type="button" className="link" onClick={onClose}>‹ 返回</button>
        <input
          className="sp-input"
          autoFocus
          aria-label="搜索账单"
          placeholder="搜索账单、标签（#多个）、备注（空格分隔）"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') remember(kw) }}
        />
        {kw && <button type="button" className="link" onClick={() => setKw('')}>清空</button>}
        <button type="button" className="link" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>筛选</button>
      </div>

      {filterOpen && (
        <div className="sp-filter">
          <select aria-label="按分类筛选" value={fPid} onChange={(e) => setFPid(Number(e.target.value))}>
            <option value={0}>全部分类</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="按账户筛选" value={fAid} onChange={(e) => setFAid(Number(e.target.value))}>
            <option value={0}>全部账户</option>
            {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
          </select>
          <div className="row2">
            <input aria-label="起始日期" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input aria-label="结束日期" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      )}

      {terms.length === 0 && history.length > 0 && (
        <div className="sp-history">
          <div className="row"><b className="grow">搜索历史</b><button type="button" className="link" onClick={clearHistory}>清空</button></div>
          <div className="sp-chips">
            {history.map((h) => (
              <button key={h} type="button" className="sp-chip" onClick={() => setKw(h)}>{h}</button>
            ))}
          </div>
        </div>
      )}

      {(terms.length > 0 || fPid || fAid || from || to) && (
        <>
          <div className="sp-sum">
            <span>{hits.length} 笔</span>
            <b className="out">支 {money(sum.expense)}</b>
            <b className="in">收 {money(sum.income)}</b>
            <b>结余 {money(sum.balance)}</b>
            <button type="button" className="link" onClick={() => setSort(sort === 'time' ? 'amount' : 'time')}>
              按{sort === 'time' ? '时间' : '金额'}
            </button>
          </div>
          {hits.length === 0 && <p className="hint">没有匹配的账单。</p>}
          {hits.map((b) => {
            const p = parents.find((x) => x.id === b.parentCategoryId)
            const inc = p?.kind === 'income'
            return (
              <button key={b.billId} type="button" className="row ledger-row sp-row"
                onClick={() => { remember(kw); onPick?.(b.billId) }}>
                <span className="dot-badge" style={{ background: p?.bg ?? 'var(--accent-soft)', color: p?.color ?? 'var(--ink)' }}>
                  <CatIcon k={p?.icon} size={16} />
                </span>
                <div className="grow">
                  <div>{p?.name ?? '未分类'}{b.remark ? ` · ${b.remark}` : ''}</div>
                  <small>{dayOf(b.time)} {hhmm(b.time)}</small>
                </div>
                <b className={inc ? 'in' : 'out'}>{inc ? '+' : '-'}{money(b.cost)}</b>
              </button>
            )
          })}
        </>
      )}
    </section>
  )
}
