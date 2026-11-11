import { useState } from 'react'
import { useLedger, useTotalAssets } from '../store'
import { ASSET_TYPE, LEND_TYPE } from '../types'
import type { Asset } from '../types'
import { money, dayOf } from '../ui-format'
import { AssetIcon } from '../ui/icons'
import { ASSET_ICON_GROUPS } from '../ui/asset-icons'
import { Modal } from '../ui/modal'
import { accountMoney, toBase } from '../money'
import { visibleAssets } from '../domain/asset-scope'
import { accountHistory } from '../domain/account-history'
import { lendRemaining, lendTotals } from '../lend'

export function Assets({ notify }: { notify: (m: string) => void }) {
  const allAssets = useLedger((s) => s.assets)
  const currentBookId = useLedger((s) => s.currentBookId)
  const meId = useLedger((s) => s.userId)
  const assets = visibleAssets(allAssets, currentBookId, meId)
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

  const create = () => {
    if (!name.trim()) return notify('请输入账户名')
    addAsset({ assetName: name.trim(), assetType: type, assetNumber: Number(num) || 0, assetIcon: newIcon || undefined })
    setName(''); setNum(''); setNewIcon('')
    notify('账户已添加')
  }

  const debts = assets.filter((a) => a.assetType === 2 || a.assetType === 7 || a.assetType === 8).reduce((s, a) => s + toBase(a.assetNumber, a.currency, currencies, defaultCurrency), 0)

  return (
    <section className="card">
      <div className="totalbox">
        <small>净资产</small>
        <strong>{money(total)}</strong>
        <span>负资产 {money(debts)}</span>
      </div>

      <p className="hint">余额会随记账自动变动；点右侧「改」可填入实际余额（迁移后建议先对一次账）。</p>

      {assets.map((a) => (
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

      {editingAsset && (
        <AssetEditor
          asset={editingAsset}
          onClose={() => setEditingAsset(null)}
          onSave={(next) => { updateAsset(next); setEditingAsset(null); notify('账户已更新') }}
        />
      )}

      <h3>借入借出</h3>
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
      <div className="row2">
        <input aria-label="新账户名称" value={name} onChange={(e) => setName(e.target.value)} placeholder="账户名" />
        <select aria-label="新账户类型" value={type} onChange={(e) => setType(Number(e.target.value))}>
          {Object.entries(ASSET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="label">余额（可选）</div>
      <input aria-label="新账户余额" value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="余额（信用卡填负数）" />
      <div className="label">账户图标（可选）</div>
      <select aria-label="新账户图标" value={newIcon} onChange={(e) => setNewIcon(e.target.value)}>
        <option value="">按类型默认</option>
        {ASSET_ICON_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
          {group.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </optgroup>)}
      </select>
      <span className="asset-badge" aria-label="新账户图标预览"><AssetIcon type={type} name={name} icon={newIcon} size={20} /></span>
      <button className="ghost wide" onClick={create}>添加</button>
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
