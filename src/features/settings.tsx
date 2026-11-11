import { useEffect, useState } from 'react'
import { useLedger } from '../store'
import type { Cycle } from '../types'
import type { ImportPlan } from '../importer'
import { books as bookApi, type BookInfo } from '../auth'
import { syncNow } from '../sync'
import { money } from '../ui-format'
import { ROLE_LABEL } from '../ui/roles'
import { validateBackup } from '../backup'
import { dateKey, pendingDates } from '../cycle-dates'
import { Modal } from '../ui/modal'
import { DEFAULT_TAG_COLOR } from '../default-colors'
import type { BackupFile } from '../backup'
import { errorMessage } from '../errors'

function RateInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    if (Number.isFinite(n) && n > 0) onCommit(n)
    setDraft(null)
  }
  return (
    <input
      className="rate"
      aria-label={label}
      inputMode="decimal"
      value={draft ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { commit(); (e.currentTarget as HTMLInputElement).blur() } }}
    />
  )
}

/** 常见币种预置（新增时选一个，汇率可随后调整） */
const CURRENCY_PRESETS = [
  { code: 'USD', name: '美元', symbol: '$', rate: 7.2 },
  { code: 'EUR', name: '欧元', symbol: '€', rate: 7.8 },
  { code: 'JPY', name: '日元', symbol: '¥', rate: 0.048 },
  { code: 'HKD', name: '港币', symbol: 'HK$', rate: 0.92 },
  { code: 'GBP', name: '英镑', symbol: '£', rate: 9.1 },
  { code: 'KRW', name: '韩元', symbol: '₩', rate: 0.0053 },
  { code: 'AUD', name: '澳元', symbol: 'A$', rate: 4.7 },
  { code: 'CAD', name: '加元', symbol: 'C$', rate: 5.2 },
  { code: 'SGD', name: '新加坡元', symbol: 'S$', rate: 5.3 },
  { code: 'THB', name: '泰铢', symbol: '฿', rate: 0.2 },
  { code: 'TWD', name: '新台币', symbol: 'NT$', rate: 0.22 },
  { code: 'MOP', name: '澳门元', symbol: 'MOP$', rate: 0.9 }
]

/** 把周期规则翻译成一句人话 */
function describeCycle(c: Cycle): string {
  const t = c.cycleType ?? 'month'
  if (t === 'week') {
    const names = ['日', '一', '二', '三', '四', '五', '六']
    const days = (c.weekdays && c.weekdays.length ? c.weekdays : [1]).map((d) => '周' + names[d]).join('、')
    return `每${days}`
  }
  if (t === 'year') {
    return `每年 ${c.monthOfYear ?? 1} 月 ${c.dayOfMonth} 日`
  }
  if (c.monthLast && !(c.monthDays && c.monthDays.length)) return '每月最后一天'
  const days = c.monthDays && c.monthDays.length ? c.monthDays : [c.dayOfMonth]
  return `每月 ${days.join('、')} 日`
}



export function Settings({ notify, me }: { notify: (m: string) => void; me?: { id: number; email: string } }) {
  const seed = useLedger((s) => s.seed)
  const reset = useLedger((s) => s.reset)
  const exportAll = useLedger((s) => s.exportAll)
  const importAll = useLedger((s) => s.importAll)
  const applyImport = useLedger((s) => s.applyImport)
  const bills = useLedger((s) => s.bills)
  const assets = useLedger((s) => s.assets)
  const parents = useLedger((s) => s.parentCategories)
  const children = useLedger((s) => s.childCategories)
  const accountBooks = useLedger((s) => s.accountBooks)
  const reimbursements = useLedger((s) => s.reimbursements)
  const refunds = useLedger((s) => s.refunds)
  const currentBookId = useLedger((s) => s.currentBookId)

  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [restorePreview, setRestorePreview] = useState<{ name: string; data: BackupFile } | null>(null)
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [syncing, setSyncing] = useState(false)
  const currencies = useLedger((s) => s.currencies)
  const defaultCurrency = useLedger((s) => s.defaultCurrency)
  const setCurrencyRate = useLedger((s) => s.setCurrencyRate)
  const addCurrency = useLedger((s) => s.addCurrency)
  const removeCurrency = useLedger((s) => s.removeCurrency)
  const [newCurrency, setNewCurrency] = useState('')
  const tags = useLedger((s) => s.tags)
  const addTag = useLedger((s) => s.addTag)
  const updateTag = useLedger((s) => s.updateTag)
  const deleteTag = useLedger((s) => s.deleteTag)
  const [newTag, setNewTag] = useState('')
  const [newTagParent, setNewTagParent] = useState('')
  const setBook = useLedger((s) => s.setBook)
  const [members, setMembers] = useState<{ userId: number; role: string; email: string }[]>([])
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null)
  const currentBook = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))
  const reloadBooks = async () => {
    const r = await bookApi.list()
    useLedger.getState().setAccountBooks((r?.books ?? []).map((b: BookInfo) => ({
      accountBookId: 0, accountBookName: b.name, userId: 0, createTime: 0,
      bookId: b.bookId, ownerId: b.ownerId, role: b.role
    })))
  }
  useEffect(() => {
    if (!currentBook?.bookId) return
    bookApi.members(String(currentBook.bookId))
      .then((r) => setMembers(r.members))
      .catch(() => setMembers([]))
  }, [currentBook?.bookId])
  const lastSync = useLedger((s) => s.lastSync)
  const runSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await syncNow()
      setSyncMsg(`已推送 ${r.pushed} 条（跳过 ${r.skipped} 条较旧记录），拉回 ${r.pulled} 条` + (r.denied ? `；${r.denied} 条未能推送，请核对权限、账本和记录身份` : ''))
    } catch (e) {
      setSyncMsg('同步失败：' + (errorMessage(e, '未知错误')))
    } finally {
      setSyncing(false)
    }
  }
  const cycles = useLedger((s) => s.cycles)
  const skipCycleDate = useLedger((s) => s.skipCycleDate)
  const bindCycleBook = useLedger((s) => s.bindCycleBook)
  const addCycle = useLedger((s) => s.addCycle)
  const deleteCycle = useLedger((s) => s.deleteCycle)
  const toggleCycle = useLedger((s) => s.toggleCycle)
  const runCycles = useLedger((s) => s.runCycles)
  const [cycleForm, setCycleForm] = useState<{
    name: string; kind: 'expense' | 'income'; parentCategoryId: number; childCategoryId: number
    assetId: number; cost: string; dayOfMonth: number; remark: string
    cycleType: 'month' | 'week' | 'year'; weekdays: number[]; extraDays: string
    monthLast: boolean; monthOfYear: number
  } | null>(null)

  const fmtLabel = (f: string) =>
    f === 'yimu' ? '一木记账导出' : f === 'transfer' ? '转账流水' : f === 'generic' ? '通用账单表' : '未识别的表头'

  const currentUserId = useLedger((s) => s.userId)

  const pickFile = async (f: File) => {
    setErr('')
    setPlan(null)
    try {
      const { parseLedgerFile, buildImportPlan } = await import('../importer')
      const table = parseLedgerFile(await f.arrayBuffer(), f.name)
      const p = buildImportPlan({
        table, existingBills: bills, existingAssets: assets, existingBooks: accountBooks,
        parentCategories: parents, childCategories: children,
        // 用当前登录账号与当前账本，不能写死 1
        userId: currentUserId, bookId: currentBookId || 1
      })
      setFileName(f.name)
      setPlan(p)
      if (p.total === 0) setErr('文件里没有数据行')
    } catch (e) {
      setErr('解析失败：' + errorMessage(e, String(e)))
      setFileName(f.name)
    }
  }

  const loadDemo = async () => {
    setErr('')
    try {
      const res = await fetch('/demo-yimu.xlsx')
      if (!res.ok) throw new Error('示例文件不可用')
      const buf = await res.arrayBuffer()
      const { parseLedgerFile, buildImportPlan } = await import('../importer')
      const table = parseLedgerFile(buf, 'demo-yimu.xlsx')
      const p = buildImportPlan({
        table, existingBills: bills, existingAssets: assets, existingBooks: accountBooks,
        parentCategories: parents, childCategories: children,
        // 用当前登录账号与当前账本，不能写死 1
        userId: currentUserId, bookId: currentBookId || 1
      })
      setFileName('内置示例 demo-yimu.xlsx')
      setPlan(p)
    } catch (e) {
      setErr('载入示例失败：' + errorMessage(e, String(e)))
    }
  }

  const confirmImport = () => {
    if (!plan) return
    const n = plan.bills.length + plan.transfers.length
    applyImport(plan)
    setPlan(null)
    notify(`已导入 ${n} 条` + (plan.duplicates ? `，其中 ${plan.duplicates} 条疑似重复，请核对` : '') + '；账户余额已按流水推算，可在资产页调整')
  }

  const doExportJson = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `qingzhang-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    notify('已导出 JSON')
  }

  const doExportXlsx = async () => {
    if (bills.length === 0) return notify('还没有账单可导出')
    try {
      const { exportXlsx } = await import('../importer')
      exportXlsx(bills, parents, children, assets, accountBooks, reimbursements, refunds)
      notify(`已导出 ${bills.length} 条为 Excel`)
    } catch (e) {
      notify('导出失败：' + (errorMessage(e, '请检查账户信息')))
    }
  }

  const doImportJson = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        setRestorePreview({ name: f.name, data: validateBackup(JSON.parse(String(r.result))) })
      } catch (e) { notify('备份无法读取：' + (errorMessage(e, '文件格式不对'))) }
    }
    r.onerror = () => notify('备份文件读取失败')
    r.readAsText(f)
  }

  return (
    <section className="card">
      <h3>从其他记账软件迁移</h3>
      <p className="hint">
        支持 <b>一木记账导出的 Excel/CSV</b>（表头含 日期/收支类型/金额/类别/二级分类/账户）、
        转账流水表，以及含时间与金额的通用表格。疑似重复的账单会提示核对，并全部保留。
      </p>

      <label className="filebtn big">
        选择文件（.xlsx / .xls / .csv）
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
      </label>

      <button className="ghost wide" onClick={loadDemo}>没有数据？载入内置示例（471 条，走同一套导入流程）</button>

      {err && <p className="warn">{err}</p>}

      {plan && (
        <div className="preview">
          <div className="preview-head">
            <b>{fileName || '未选择'}</b>
            <span className="badge">{fmtLabel(plan.format)}</span>
          </div>
          <div className="preview-stats">
            <div><small>总行数</small><b>{plan.total}</b></div>
            <div><small>可导入</small><b className="in">{plan.bills.length + plan.transfers.length}</b></div>
            <div><small>疑似重复</small><b>{plan.duplicates}</b></div>
            <div><small>无法解析</small><b>{plan.skipped.length}</b></div>
          </div>
          <div className="preview-stats">
            <div><small>收入合计</small><b className="in">{money(plan.income)}</b></div>
            <div><small>支出合计</small><b className="out">{money(plan.expense)}</b></div>
            <div><small>新增分类</small><b>{plan.newParents.length}</b></div>
            <div><small>新增账户/账本</small><b>{plan.newAssets.length}/{plan.newBooks.length}</b></div>
          </div>
          {(plan.reimbursements.length > 0 || plan.refunds.length > 0) && (
            <p className="hint">带过来的附属记录：报销 {plan.reimbursements.length} 条、退款 {plan.refunds.length} 条。</p>
          )}
          {plan.columnCoverage.length > 0 && (
            <p className="hint">
              识别到的列：{plan.columnCoverage.map((c) => c.column).join('、')}
            </p>
          )}
          {plan.skipped.length > 0 && (
            <p className="hint">跳过示例：第 {plan.skipped.slice(0, 3).map((x) => x.row).join('、')} 行 —— {plan.skipped[0].reason}</p>
          )}
          {plan.warnings.length > 0 && (
            <p className="hint">需要核对 {plan.warnings.length} 条：例如第 {plan.warnings[0].row} 行，{plan.warnings[0].reason}。</p>
          )}
          {plan.duplicates > 0 && <p className="hint">疑似重复记录也会全部导入。若重复导入同一文件，请先核对，避免多记。</p>}
          {plan.skippedRows > 0 && (
            <p className="hint due-hint">
              有 {plan.skippedRows} 行因账本无法匹配被跳过（{plan.unresolvedBooks.join('、')}）。
              请先把这些账本在设置里建好，或在导出时去掉账本列，再重新导入。
            </p>
          )}
          <button className="primary" onClick={confirmImport} disabled={plan.bills.length + plan.transfers.length === 0}>
            确认导入 {plan.bills.length + plan.transfers.length} 条
          </button>
        </div>
      )}

      <h3>导出</h3>
      <p className="hint">Excel 用于账单交换；完整备份和恢复账户余额请使用 JSON。</p>
      <div className="btns">
        <button onClick={doExportXlsx}>导出 Excel</button>
        <button onClick={doExportJson}>导出 JSON</button>
        <label className="filebtn">
          导入 JSON 备份
          <input type="file" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) doImportJson(file); e.target.value = '' }} />
        </label>
      </div>
      {restorePreview && (
        <Modal label="恢复 JSON 备份" onClose={() => setRestorePreview(null)}>
            <h3>恢复 JSON 备份</h3>
            <p>{restorePreview.name}</p>
            <p>备份包含 {restorePreview.data.bills.length} 条账单、{restorePreview.data.assets.length} 个账户和 {restorePreview.data.refunds.length} 条退款。</p>
            <p className="hint">恢复会替换当前设备上的本地数据。建议先导出当前 JSON 备份；云端及其他设备的数据不会随此操作回滚，同步后可能重新出现。</p>
            {restorePreview.data.version === 1 && <p className="hint">旧版备份不含币种、汇率、标签和删除记录，将保留当前设备上的这些设置。</p>}
            <div className="modal-btns">
              <button className="ghost" onClick={() => setRestorePreview(null)}>取消</button>
              <button className="primary" onClick={() => {
                try { importAll(restorePreview.data); setRestorePreview(null); notify('已恢复本地 JSON 备份') }
                catch (e) { notify('恢复失败：' + (errorMessage(e, '备份格式不正确'))) }
              }}>确认恢复</button>
            </div>
        </Modal>
      )}

      <h3>周期记账</h3>
      <p className="hint">每月固定日期自动生成账单；打开应用时补生成，不会重复。</p>
      {(() => {
        const pending = cycles.filter((c) => c.enabled).flatMap((c) => pendingDates(c).map((d) => ({ c, key: dateKey(d) })))
        return pending.length > 0 ? (
          <p className="hint due-hint">
            有 {pending.length} 期待生成：
            {pending.slice(0, 3).map(({ c, key }) => ` ${c.name} ${key.slice(5)}`).join('、')}
            {pending.length > 3 ? ' …' : ''}
          </p>
        ) : null
      })()}
      {cycles.length === 0 && <p className="hint">还没有周期规则（比如房租、工资）。</p>}
      {cycles.map((c) => {
        const p = parents.find((x) => x.id === c.parentCategoryId)
        const a = assets.find((x) => x.assetId === c.assetId)
        return (
          <div key={c.cycleId} className="row">
            <div className="grow">
              <div>
                {c.name}
                <span className="tag">{describeCycle(c)}</span>
              </div>
              <small>
                {p?.name ?? '分类'} · {a?.assetName ?? '账户'} · {money(c.cost)} · {c.enabled ? '启用中' : '已暂停'}
                {c.bookId == null ? ' · ⚠️ 账本待确认' : ''}
              </small>
            </div>
            {(() => {
              const next = pendingDates(c)[0]
              return next ? (
                <button className="link" aria-label={`跳过 ${c.name} 下一期`}
                  onClick={() => skipCycleDate(c.cycleId, dateKey(next))}>跳过{next.getMonth() + 1}/{next.getDate()}</button>
              ) : null
            })()}
            {c.bookId == null && (
              <select aria-label={`为 ${c.name} 选择账本`} value="" onChange={(e) => {
                const value = e.target.value
                if (!value) return
                bindCycleBook(c.cycleId, value)
                // 绑定后立即补齐到期账单，用户不用等下次打开
                const generated = runCycles()
                notify(generated > 0 ? `已绑定账本并补生成 ${generated} 笔` : '已绑定账本')
              }}>
                <option value="">选择账本…</option>
                {accountBooks.filter((b) => b.bookId != null).map((b) => (
                  <option key={String(b.bookId)} value={String(b.bookId)}>{b.accountBookName}</option>
                ))}
              </select>
            )}
            <button className="link" onClick={() => toggleCycle(c.cycleId)}>{c.enabled ? '暂停' : '启用'}</button>
            <button className="del" onClick={() => deleteCycle(c.cycleId)}>删</button>
          </div>
        )
      })}
      <button className="ghost wide" onClick={() => setCycleForm({
        name: '', kind: 'expense', parentCategoryId: 4, childCategoryId: 0,
        assetId: assets[0]?.assetId ?? 0, cost: '', dayOfMonth: 1, remark: '',
        cycleType: 'month', weekdays: [1], extraDays: '', monthLast: false, monthOfYear: 1
      })}>新增周期规则</button>

      {cycleForm && (
        <Modal label="周期记账" onClose={() => setCycleForm(null)}>
            <h3>周期记账</h3>
            <div className="label">名称</div>
            <input aria-label="周期名称" value={cycleForm.name} onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })} placeholder="如：房租、工资" />
            <div className="label">类型</div>
            <select aria-label="收支类型" value={cycleForm.kind} onChange={(e) => setCycleForm({ ...cycleForm, kind: e.target.value as 'income' | 'expense', parentCategoryId: e.target.value === 'income' ? 903 : 4 })}>
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
            <div className="label">分类</div>
            <select aria-label="周期分类" value={cycleForm.parentCategoryId} onChange={(e) => setCycleForm({ ...cycleForm, parentCategoryId: Number(e.target.value) })}>
              {parents.filter((p) => p.kind === cycleForm.kind).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="label">周期</div>
            <select aria-label="周期" value={cycleForm.cycleType} onChange={(e) => setCycleForm({ ...cycleForm, cycleType: e.target.value as 'month' | 'week' | 'year' })}>
              <option value="month">每月</option>
              <option value="week">每周</option>
              <option value="year">每年</option>
            </select>
            <div className="row2">
              <div>
                <div className="label">金额</div>
                <input aria-label="周期金额" value={cycleForm.cost} inputMode="decimal" autoFocus
                  onChange={(e) => setCycleForm({ ...cycleForm, cost: e.target.value.replace(/[^\d.]/g, '') })} />
              </div>
              <div>
                <div className="label">
                  {cycleForm.cycleType === 'week' ? '星期' : (cycleForm.cycleType === 'year' ? '月份' : '日期')}
                </div>
                {cycleForm.cycleType === 'week' ? (
                  <div className="chips">
                    {['日', '一', '二', '三', '四', '五', '六'].map((w, i) => (
                      <button key={i} className={'chip small' + (cycleForm.weekdays.includes(i) ? ' on' : '')}
                        onClick={() => setCycleForm({
                          ...cycleForm,
                          weekdays: cycleForm.weekdays.includes(i)
                            ? cycleForm.weekdays.filter((x) => x !== i)
                            : [...cycleForm.weekdays, i].sort()
                        })}>{w}</button>
                    ))}
                  </div>
                ) : cycleForm.cycleType === 'year' ? (
                  <select aria-label="月份" value={cycleForm.monthOfYear}
                    onChange={(e) => setCycleForm({ ...cycleForm, monthOfYear: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m} 月</option>
                    ))}
                  </select>
                ) : (
                  <input aria-label="日期" value={String(cycleForm.dayOfMonth)} inputMode="numeric"
                    onChange={(e) => {
                      const n = Math.min(28, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))
                      setCycleForm({ ...cycleForm, dayOfMonth: n })
                    }} />
                )}
              </div>
            </div>
            {cycleForm.cycleType !== 'week' && (
              <>
                <div className="label">额外日期（可选，逗号分隔，如 15,25）</div>
                <input aria-label="额外日期" value={cycleForm.extraDays} placeholder="留空则只用上面的日期"
                  onChange={(e) => setCycleForm({ ...cycleForm, extraDays: e.target.value.replace(/[^\d,，]/g, '') })} />
                <label className="inline">
                  <input type="checkbox" checked={cycleForm.monthLast}
                    onChange={(e) => setCycleForm({ ...cycleForm, monthLast: e.target.checked })} />
                  每月最后一天
                </label>
              </>
            )}
            <div className="label">账户</div>
            <select aria-label="周期账户" value={cycleForm.assetId} onChange={(e) => setCycleForm({ ...cycleForm, assetId: Number(e.target.value) })}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
            <div className="label">备注</div>
            <input aria-label="周期备注" value={cycleForm.remark} onChange={(e) => setCycleForm({ ...cycleForm, remark: e.target.value })} />
            <p className="hint">保存后立即补生成当月已到期的账单。</p>
            <div className="modal-btns">
              <button className="ghost" onClick={() => setCycleForm(null)}>取消</button>
              <button className="primary" onClick={() => {
                const extra = cycleForm.extraDays
                  .split(/[,，]/).map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 28)
                addCycle({
                  name: cycleForm.name || '周期账单',
                  kind: cycleForm.kind,
                  parentCategoryId: cycleForm.parentCategoryId,
                  childCategoryId: cycleForm.childCategoryId,
                  childCategoryIdentityVersion: 2,
                  assetId: cycleForm.assetId,
                  cost: Number(cycleForm.cost) || 0,
                  dayOfMonth: cycleForm.dayOfMonth,
                  cycleType: cycleForm.cycleType,
                  weekdays: cycleForm.cycleType === 'week' ? cycleForm.weekdays : undefined,
                  monthDays: extra.length ? [...new Set([cycleForm.dayOfMonth, ...extra])].sort((a, b) => a - b) : undefined,
                  monthLast: cycleForm.monthLast || undefined,
                  monthOfYear: cycleForm.monthOfYear,
                  remark: cycleForm.remark,
                  startTime: Date.now()
                })
                setCycleForm(null)
                setTimeout(() => runCycles(), 0)
                notify('周期规则已保存')
              }}>保存</button>
            </div>
        </Modal>
      )}

      <h3>数据</h3>
      <div className="btns">
        <button onClick={() => { seed(); notify('已填充演示数据') }}>填充演示数据</button>
        <button className="danger" onClick={() => { reset(); notify('已清空') }}>清空数据</button>
      </div>

      <h3>账本与成员</h3>
      <p className="hint">
        共享账本支持 2–6 人共记共看。角色：<b>静默</b>只读、<b>同伴</b>可增删改账单、<b>管理</b>可改名/邀请/清空/删账本。
      </p>
      {accountBooks.filter((b) => b.bookId).map((b) => {
        const active = String(b.bookId) === String(currentBookId)
        return (
          <div key={String(b.bookId)} className="row">
            <div className="grow">
              <div>
                {b.accountBookName}
                <span className="tag">{ROLE_LABEL[b.role ?? ''] ?? b.role}</span>
                {active && <span className="tag ok">当前</span>}
              </div>
              <small>{b.ownerId === me?.id ? '我创建的' : `创建者 #${b.ownerId}`}</small>
            </div>
            <button className="link" onClick={() => { setBook(String(b.bookId)); localStorage.setItem('xm-current-book', String(b.bookId)) }}>进入</button>
          </div>
        )
      })}
      <div className="btns">
        <button onClick={async () => {
          const name = prompt('新账本名称', '家庭账本')
          if (!name) return
          await bookApi.create(name)
          await reloadBooks()
          notify('账本已创建')
        }}>新建账本</button>
        <button onClick={async () => {
          const code = prompt('输入邀请码')
          if (!code) return
          try {
            await bookApi.join(code.trim().toUpperCase())
            await reloadBooks()
            notify('已加入账本')
          } catch (e) { notify(errorMessage(e, '加入失败')) }
        }}>加入账本</button>
      </div>

      {currentBook && (
        <div className="row">
          <div className="grow">
            <div>当前：{currentBook.accountBookName}</div>
            <small>我的角色：{ROLE_LABEL[currentBook.role ?? ''] ?? currentBook.role}</small>
          </div>
          {currentBook.role === 'admin' && (
            <button className="ghost tiny" onClick={async () => {
              try {
                const r = await bookApi.invite(String(currentBook.bookId))
                setInvite({ code: r.code, expiresAt: r.expiresAt })
                notify(`邀请码 ${r.code}`)
              } catch (e) { notify(errorMessage(e, '生成失败')) }
            }}>生成邀请码</button>
          )}
        </div>
      )}
      {currentBook && currentBook.role === 'admin' && (
        <div className="btns">
          <button onClick={async () => {
            const name = prompt('账本名称', currentBook.accountBookName)
            if (!name) return
            await bookApi.rename(String(currentBook.bookId), name)
            await reloadBooks()
            notify('已重命名')
          }}>重命名</button>
          <button onClick={async () => {
            if (!confirm('清空这个账本里的所有账单？操作不可撤销')) return
            try {
              const r = await bookApi.clear(String(currentBook.bookId))
              notify(`已清空 ${r.removed} 条服务端记录（本地请点「清空数据」）`)
            } catch (e) { notify(errorMessage(e, '失败')) }
          }}>清空账本</button>
          {me?.id === currentBook.ownerId && (
            <button className="danger" onClick={async () => {
              if (!confirm('删除这个账本？所有成员都会失去它')) return
              try {
                await bookApi.remove(String(currentBook.bookId))
                await reloadBooks()
                notify('账本已删除')
              } catch (e) { notify(errorMessage(e, '失败')) }
            }}>删除账本</button>
          )}
        </div>
      )}

      {currentBook && currentBook.role !== 'admin' && currentBook.role && (
        <button className="ghost wide" onClick={async () => {
          if (!confirm('退出这个账本？你的历史账单会保留在账本里')) return
          await bookApi.leave(String(currentBook.bookId))
          await reloadBooks()
          notify('已退出账本')
        }}>退出账本</button>
      )}

      {members.length > 0 && (
        <>
          <div className="label">成员（{members.length}/6）</div>
          {members.map((m) => (
            <div key={m.userId} className="row">
              <div className="grow">
                <div>{m.email}{m.userId === me?.id ? '（我）' : ''}</div>
                <small>{ROLE_LABEL[m.role] ?? m.role}</small>
              </div>
              {currentBook?.role === 'admin' && m.userId !== currentBook.ownerId && (
                <select aria-label={`${m.email} 的角色`} value={m.role} onChange={async (e) => {
                  await bookApi.setRole(String(currentBook.bookId), m.userId, e.target.value)
                  setMembers((await bookApi.members(String(currentBook.bookId))).members)
                }}>
                  <option value="silent">静默</option>
                  <option value="peer">同伴</option>
                  <option value="admin">管理</option>
                </select>
              )}
            </div>
          ))}
        </>
      )}

      {invite && (
        <div className="invite">
          <div>
            <span className="code">{invite.code}</span>
            <small>有效期至 {new Date(invite.expiresAt).toLocaleString('zh-CN')}</small>
          </div>
          <button className="link" onClick={() => setInvite(null)}>收起</button>
        </div>
      )}

      <h3>标签</h3>
      <p className="hint">标签可着色、可嵌套；记账时按名字自动关联。</p>
      {tags.length === 0 && <p className="hint">还没有标签。下面可以新建，或在记账备注里写 #标签。</p>}
      {tags.map((t) => (
        <div key={t.tagId} className="row">
          <span className="tag-dot" style={{ background: t.color }} />
          <div className="grow">
            <div>{t.name}{t.parentName ? <span className="tag">属于 {t.parentName}</span> : null}</div>
            <select aria-label={`${t.name} 的父标签`} value={t.parentTagId ?? ''}
              onChange={(e) => updateTag(t.tagId, { parentTagId: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">顶层标签</option>
              {tags.filter((x) => x.tagId !== t.tagId && x.parentTagId == null).map((x) => (
                <option key={x.tagId} value={x.tagId}>属于 {x.name}</option>
              ))}
            </select>
            <label className="hint" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(t.hide)} onChange={(e) => updateTag(t.tagId, { hide: e.target.checked })} />
              记账时不显示
            </label>
          </div>
          <input
            aria-label={`${t.name} 标签颜色`}
            className="color"
            type="color"
            value={t.color}
            onChange={(e) => updateTag(t.tagId, { color: e.target.value })}
          />
          <button className="del" aria-label={`删除标签 ${t.name}`} onClick={() => deleteTag(t.tagId)}>删</button>
        </div>
      ))}
      <div className="row2">
        <input aria-label="新标签名" value={newTag} placeholder="新标签名" onChange={(e) => setNewTag(e.target.value)} />
        <select aria-label="新标签的父标签" value={newTagParent} onChange={(e) => setNewTagParent(e.target.value)}>
          <option value="">顶层标签</option>
          {tags.filter((x) => x.parentTagId == null).map((x) => (
            <option key={x.tagId} value={x.tagId}>属于 {x.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={() => {
          if (!newTag.trim()) return
          addTag({ name: newTag.trim(), color: DEFAULT_TAG_COLOR, parentTagId: newTagParent ? Number(newTagParent) : undefined })
          setNewTag('')
          setNewTagParent('')
          notify('标签已添加')
        }}>添加标签</button>
      </div>

      <h3>币种与汇率</h3>
      <p className="hint">
        汇率含义：1 单位该币种 = 多少 {defaultCurrency}。记账时选外币会自动折算成本币入账。
      </p>
      {currencies.map((c) => (
        <div key={c.code} className="row">
          <div className="grow">
            <div>{c.name} <span className="tag">{c.code}</span></div>
            <small>
              {c.symbol}
              {c.code === defaultCurrency ? ' · 默认币种' : ` · 1 ${c.code} = ${c.rate} ${defaultCurrency}`}
            </small>
          </div>
          {c.code !== defaultCurrency && (
            <RateInput
              value={c.rate}
              label={`${c.code} 汇率`}
              onCommit={(v) => setCurrencyRate(c.code, v)}
            />
          )}
          {c.code !== defaultCurrency && (
            <button className="del" aria-label={`删除币种 ${c.code}`} onClick={() => removeCurrency(c.code)}>删</button>
          )}
        </div>
      ))}
      <div className="row2">
        <select aria-label="新增币种" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
          <option value="">新增币种…</option>
          {CURRENCY_PRESETS.filter((p) => !currencies.some((c) => c.code === p.code)).map((p) => (
            <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
          ))}
        </select>
        <button className="ghost" disabled={!newCurrency} onClick={() => {
          const preset = CURRENCY_PRESETS.find((p) => p.code === newCurrency)
          if (!preset) return
          addCurrency({ code: preset.code, name: preset.name, symbol: preset.symbol, rate: preset.rate, positionWeight: currencies.length })
          setNewCurrency('')
        }}>添加</button>
      </div>

      <h3>云端同步</h3>
      <p className="hint">
        数据存在你自己的账号下。同步是<b>先推后拉</b>：本地改动推到服务器，再把别的设备改过的记录合并回来（逐条取更新时间晚的）。
      </p>
      <div className="btns">
        <button onClick={runSync} disabled={syncing}>{syncing ? '同步中…' : '立即同步'}</button>
      </div>
      {lastSync > 0 && <p className="hint">上次同步：{new Date(lastSync).toLocaleString('zh-CN')}</p>}
      {syncMsg && <p className="hint">{syncMsg}</p>}

      <h3>关于</h3>
      <p className="hint">
        数据保存在当前设备；登录后打开应用会尝试自动同步，也可手动同步。同步数据保存在服务端，供账号和共享账本成员使用。
      </p>
    </section>
  )
}
