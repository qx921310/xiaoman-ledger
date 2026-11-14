import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../store'
import type { Cycle } from '../types'
import type { ImportPlan } from '../importer'
import { books as bookApi } from '../auth'
import { syncNow, getVersionedConflicts, getVersionedRecovery, keepLocalConflict, acceptRemoteConflict, previewVersionedConflict } from '../sync'
import { syncNowImmediate, getLastSyncResult, subscribeAutoSync, type AutoSyncState } from '../sync-auto'
import { money, fullDay } from '../ui-format'

const APP_VERSION = 'v0.1.0'
import { HiddenPage } from './hidden-page'
import { AiTypeManager } from './ai-type'
import { Guide } from './guide'
import { BillFiles } from './bill-files'
import { BookManager } from './books'
import { BudgetManager } from './budget'
import { SplitManager } from './split'
import { MortgageCalc } from './mortgage'
import { DreamList } from './dreams'
import { FilteredBills } from './filtered-bills'
import { TemplateList } from './templates'
import { hasPin, setPin, clearPin, verifyPin } from './lock'
import { usePullRefresh } from '../ui/use-pull-refresh'
import { validateBackup } from '../backup'
import { CHILD_ICONS, PARENT_ICONS } from '../ui/category-icons'
import { dateKey, pendingDates } from '../cycle-dates'
import { Modal } from '../ui/modal'
import { DEFAULT_TAG_COLOR } from '../default-colors'
import type { BackupFile } from '../backup'
import { errorMessage } from '../errors'
import { visibleAssets } from '../domain/asset-scope'
import { validateOcrDraft, type OcrDraft } from '../domain/ocr-confirm'
import { sortCategories } from '../domain/category-order'

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
  { code: 'MOP', name: '澳门元', symbol: 'MOP$', rate: 0.9 },
  { code: 'CHF', name: '瑞士法郎', symbol: 'CHF', rate: 8.1 },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$', rate: 4.3 },
  { code: 'MYR', name: '马来西亚林吉特', symbol: 'RM', rate: 1.6 },
  { code: 'PHP', name: '菲律宾比索', symbol: '₱', rate: 0.126 },
  { code: 'VND', name: '越南盾', symbol: '₫', rate: 0.00028 },
  { code: 'INR', name: '印度卢比', symbol: '₹', rate: 0.086 },
  { code: 'AED', name: '阿联酋迪拉姆', symbol: 'AED', rate: 1.96 },
  { code: 'RUB', name: '俄罗斯卢布', symbol: '₽', rate: 0.079 },
  { code: 'BRL', name: '巴西雷亚尔', symbol: 'R$', rate: 1.3 }
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



export function Settings({ notify, me, onLogout }: { notify: (m: string) => void; me?: { id: number; email: string }; onLogout?: () => void }) {
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
  const [syncConflicts, setSyncConflicts] = useState(getVersionedConflicts)
  const [syncBlocked, setSyncBlocked] = useState(0)
  const [autoSync, setAutoSync] = useState<AutoSyncState | null>(null)
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [dreamOpen, setDreamOpen] = useState(false)
  const [aiTypeOpen, setAiTypeOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [booksOpen, setBooksOpen] = useState(false)
  const [filesOpen, setFilesOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [mortgageOpen, setMortgageOpen] = useState(false)
  const [meScreen, setMeScreen] = useState<'book' | 'cat' | 'tag' | 'data' | null>(null)
  const [cycleDrill, setCycleDrill] = useState<{ title: string; cycleId: string | number } | null>(null)
  const [backupOpen, setBackupOpen] = useState(false)
  // 一木 UserInfoActivity：昵称与头像可改（本地保存，账号维度）
  const profileKey = `xiaoman-profile:${me?.id ?? 0}`
  const [profile, setProfile] = useState<{ nick: string; avatar: string }>(() => {
    try { return JSON.parse(localStorage.getItem(profileKey) ?? 'null') ?? { nick: me?.email?.split('@')[0] ?? '我', avatar: '' } }
    catch { return { nick: me?.email?.split('@')[0] ?? '我', avatar: '' } }
  })
  const saveProfile = (next: { nick: string; avatar: string }) => {
    setProfile(next)
    try { localStorage.setItem(profileKey, JSON.stringify(next)) } catch { /* 忽略 */ }
    setProfileOpen(false)
    notify('已保存')
  }
  const budgets = useLedger((s2) => s2.budgets)

  // 连续记账天数：从今天（或昨天）往前数，直到断档
  const streak = useMemo(() => {
    const days = new Set(bills.map((b) => fullDay(b.time)))
    let n = 0
    const d = new Date()
    // 今天没记则从昨天起算（当天还没记完不算断）
    if (!days.has(fullDay(d.getTime()))) d.setDate(d.getDate() - 1)
    while (days.has(fullDay(d.getTime()))) { n++; d.setDate(d.getDate() - 1) }
    return n
  }, [bills])


  const attachmentCount = useMemo(
    () => bills.reduce((n, b) => n + (b.files?.length ?? 0), 0),
    [bills]
  )

  const syncLine = autoSync?.running ? '同步中…'
    : autoSync?.lastError ? '同步失败'
    : (autoSync?.incomplete ?? 0) > 0 ? `${autoSync?.incomplete} 条待核对`
    : autoSync?.pending ? '待同步'
    : autoSync?.lastOkAt ? new Date(autoSync.lastOkAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '尚未同步'
  const [rateBusy, setRateBusy] = useState(false)
  const setBudget = useLedger((s2) => s2.setBudget)
  const pull = usePullRefresh(async () => setHiddenOpen(true), 64,
    { pulling: '下拉进入隐藏内容', released: '松开进入隐藏内容', busy: '正在打开…' },
    !hiddenOpen)
  useEffect(() => subscribeAutoSync(setAutoSync), [])
  const [conflictPreview, setConflictPreview] = useState<Awaited<ReturnType<typeof previewVersionedConflict>> | null>(null)
  useEffect(() => subscribeAutoSync(() => setSyncConflicts(getVersionedConflicts())), [])
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
  const [addingTag, setAddingTag] = useState(false)
  const [newTagParent, setNewTagParent] = useState('')
  const setBook = useLedger((s) => s.setBook)
  const updateBookMeta = useLedger((s) => s.updateBookMeta)
  const currentBook = accountBooks.find((b) => b.bookId && String(b.bookId) === String(currentBookId))
  const lastSync = useLedger((s) => s.lastSync)
  const runSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      await syncNowImmediate()
      const r = getLastSyncResult() as Awaited<ReturnType<typeof syncNow>> | null
      setSyncBlocked(Number((r as { blocked?: number } | null)?.blocked ?? 0))
      if (!r) setSyncMsg('同步完成')
      else {
        const bits = [`已推送 ${r.pushed} 条（跳过 ${r.skipped} 条较旧记录），拉回 ${r.pulled} 条`]
        if (r.denied) bits.push(`${r.denied} 条未能推送，请核对权限、账本和记录身份`)
        if (r.conflicts) bits.push(`${r.conflicts} 条需要核对，本地内容已保留：${r.conflicted.map(c => `${c.kind}/${c.id}（${c.reason}）`).join('；')}`)
        const blocked = Number((r as { blocked?: number }).blocked ?? 0)
        if (blocked) bits.push(`另有 ${blocked} 条记录因关联到待核对的对象而暂停上传，处理完上面的冲突后会自动补传`)
        setSyncMsg(bits.join('；'))
      }
    } catch (e) {
      setSyncMsg('同步失败：' + (errorMessage(e, '未知错误')))
    } finally {
      setSyncing(false)
    }
  }
  const cycles = useLedger((s) => s.cycles)
  const skipCycleDate = useLedger((s) => s.skipCycleDate)
  const bindCycleBook = useLedger((s) => s.bindCycleBook)
  const addCategory = useLedger((s) => s.addCategory)
  const updateCategory = useLedger((s) => s.updateCategory)
  const deleteCategory = useLedger((s) => s.deleteCategory)
  const moveCategory = useLedger((s) => s.moveCategory)
  const moveVisibleCategory = (id: number, dir: -1 | 1) => {
    const state = useLedger.getState()
    const target = [...state.parentCategories, ...state.childCategories].find(c => c.id === id)
    if (!target) return
    const siblings = sortCategories(target.parentId === 0
      ? state.parentCategories.filter(c => c.kind === target.kind)
      : state.childCategories.filter(c => c.parentId === target.parentId))
    const index = siblings.findIndex(c => c.id === id)
    if (index + dir < 0 || index + dir >= siblings.length) return
    // Normalize through the existing store action, so its ordering and the visible
    // default order agree before applying the user's requested move.
    const current = [...siblings].sort((a, b) => (a.positionWeight ?? 0) - (b.positionWeight ?? 0) || a.id - b.id)
    siblings.forEach((c, i) => {
      let at = current.findIndex(item => item.id === c.id)
      while (at > i) {
        moveCategory(c.id, -1)
        ;[current[at - 1], current[at]] = [current[at], current[at - 1]]
        at--
      }
    })
    moveCategory(id, dir)
  }
  const parentCategories = useLedger((s) => s.parentCategories)
  const childCategories = useLedger((s) => s.childCategories)
  const templates = useLedger((s) => s.templates)
  const applyTemplate = useLedger((s) => s.applyTemplate)
  const deleteTemplate = useLedger((s) => s.deleteTemplate)
  const splitGroups = useLedger((s) => s.splitGroups)
  const splitMembers = useLedger((s) => s.splitMembers)
  const splitExpenses = useLedger((s) => s.splitExpenses)
  const addSplitGroup = useLedger((s) => s.addSplitGroup)
  const deleteSplitGroup = useLedger((s) => s.deleteSplitGroup)
  const addSplitMember = useLedger((s) => s.addSplitMember)
  const deleteSplitMember = useLedger((s) => s.deleteSplitMember)
  const updateSplitMember = useLedger((s) => s.updateSplitMember)
  const settleSplit = useLedger((s) => s.settleSplit)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [ocrSaving, setOcrSaving] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrDraft | null>(null)
  const addBill = useLedger((s) => s.addBill)
  const [newGroup, setNewGroup] = useState('')
  const [newMember, setNewMember] = useState<Record<number, string>>({})
  const [newCat, setNewCat] = useState<{ parentId: number; kind: 'expense' | 'income'; name: string; icon: string } | null>(null)
  const [newCatScoped, setNewCatScoped] = useState(false)
  const addCycle = useLedger((s) => s.addCycle)
  const deleteCycle = useLedger((s) => s.deleteCycle)
  const toggleCycle = useLedger((s) => s.toggleCycle)
  const runCycles = useLedger((s) => s.runCycles)
  const [cycleForm, setCycleForm] = useState<{
    notIntoTotal?: boolean
    notIntoBudget?: boolean
    reimbursement?: boolean
    toAssetId?: number
    fromAssetId?: number
    serviceCharge?: string
    endMode?: 'never' | 'times' | 'date'
    times?: string
    endDate?: string
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
    const blob = new Blob([JSON.stringify({ ...exportAll(), syncRecovery: getVersionedRecovery() }, null, 2)], { type: 'application/json' })
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
      const { lendRemaining } = await import('../lend')
      const allLends = useLedger.getState().lends
      exportXlsx(bills, parents, children, assets, accountBooks, reimbursements, refunds, {
        transfers: useLedger.getState().transfers,
        lends: allLends,
        lendTotals: (l) => lendRemaining(l, allLends)
      })
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
      <h2 className="page-title">我的</h2>

      <button type="button" className="my-user" onClick={() => setProfileOpen(true)}>
        <span className="my-avatar" aria-hidden="true" style={profile.avatar ? { background: profile.avatar } : undefined}>
          {profile.avatar ? '' : (profile.nick || '我')[0].toUpperCase()}
        </span>
        <span className="grow">
          <b>{profile.nick || me?.email?.split('@')[0] || '我'}</b>
          <span className="muted">已连续记账 {streak} 天</span>
        </span>
      </button>

      <div className="my-vip">
        <span>会员权益（记账不限量、云备份扩容）</span>
        <button type="button" className="link" onClick={() => notify('敬请期待')}>了解</button>
      </div>

      {(pull.progress > 0 || pull.busy) && !hiddenOpen && (
        <div className="pull-tip" role="status" aria-live="polite">
          {pull.busy ? pull.text.busy : pull.progress >= 1 ? pull.text.released : pull.text.pulling}
        </div>
      )}

      {hiddenOpen && (
        <>
          <div className="subpage-head">
            <button type="button" className="link" onClick={() => setHiddenOpen(false)}>‹ 返回</button>
            <h3>隐藏内容</h3>
          </div>
          <HiddenPage
            title="隐藏内容"
            tip="被隐藏的账本、标签与预算。下拉「我的」可再次进入。"
            groups={[
              {
                key: 'books', label: '账本',
                rows: (accountBooks as Array<{ bookId?: string | number; accountBookName?: string; hide?: boolean }>)
                  .filter((b) => b.hide === true)
                  .map((b) => ({ key: String(b.bookId), name: b.accountBookName ?? '账本', value: '',
                    onRestore: () => { updateBookMeta(String(b.bookId), { hide: false }); notify('已恢复显示') } }))
              },
              {
                key: 'budgets', label: '预算',
                rows: budgets.filter((b) => b.hide).map((b) => ({
                  key: `budget-${b.month}-${b.categoryId}-${b.type ?? 'month'}`,
                  name: `${b.budgetName || (b.categoryId === 0 ? '总预算' : `分类 ${b.categoryId}`)} · ${b.month}`,
                  value: money(b.amount),
                  onRestore: () => {
                    // 一木语义：恢复显示 = 移除隐藏标记，而不是写入 hide:false，
                    // 这样老客户端（无该字段）与本端 payload 一致，不会产生伪冲突
                    const { hide: _hidden, ...rest } = b
                    setBudget(rest)
                    notify('已恢复显示')
                  }
                }))
              },
              {
                key: 'tags', label: '标签',
                rows: (tags ?? []).filter((t) => t.hide).map((t) => ({
                  key: String(t.tagId), name: t.name, value: '',
                  onRestore: () => { updateTag(t.tagId, { hide: false }); notify('已恢复显示') }
                }))
              },
            ]}
            emptyText="没有被隐藏的内容。"
          />
        </>
      )}


      <div className="me-book">
        <label className="label" htmlFor="me-book-switch">当前账本</label>
        <select id="me-book-switch" value={String(currentBookId)}
          onChange={(e) => { const v = e.target.value; setBook(v === '0' ? 0 : v) }}>
          {accountBooks.filter((b) => b.bookId != null && !b.hidden).map((b) => (
            <option key={String(b.bookId)} value={String(b.bookId)}>{b.accountBookName}</option>
          ))}
        </select>
        <small className="muted">{currentBook?.hidden ? '已隐藏' : '仅自己可见'}</small>
      </div>

      <div className="me-sync">
        {autoSync?.running ? '同步中…'
          : autoSync?.lastError ? `同步失败：${autoSync.lastError}（点下方「立即同步」重试）`
          : autoSync?.pending ? '有改动待同步'
          : autoSync?.lastOkAt ? `上次同步 ${new Date(autoSync.lastOkAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
          : '尚未同步'}
      </div>


      {dreamOpen && <DreamList notify={notify} onBack={() => setDreamOpen(false)} />}
      {aiTypeOpen && <AiTypeManager onBack={() => setAiTypeOpen(false)} notify={notify} />}
      {cycleDrill && (
        <FilteredBills title={cycleDrill.title}
          bills={bills.filter((b) => String(b.cycleId) === String(cycleDrill.cycleId))}
          onBack={() => setCycleDrill(null)} />
      )}

      {guideOpen && <Guide onBack={() => setGuideOpen(false)} />}
      {tplOpen && <TemplateList onBack={() => setTplOpen(false)} onAdd={() => { setTplOpen(false); notify('请到记账页点「存为模板」') }} notify={notify} />}
      {booksOpen && <BookManager notify={notify} onBack={() => setBooksOpen(false)} />}
      {filesOpen && <BillFiles notify={notify} onBack={() => setFilesOpen(false)} />}
      {budgetOpen && <BudgetManager notify={notify} onBack={() => setBudgetOpen(false)} />}
      {splitOpen && <SplitManager notify={notify} onBack={() => setSplitOpen(false)} />}

      {mortgageOpen && <MortgageCalc onBack={() => setMortgageOpen(false)} notify={notify} />}

      {aboutOpen && (
        <Modal label="关于" onClose={() => setAboutOpen(false)}>
          <h3>关于小满记账</h3>
          <div className="row"><span className="grow">版本</span><span className="muted">v1 · {new Date().getFullYear()}</span></div>
          <div className="row"><span className="grow">存储</span><span className="muted">本地优先，多设备同步</span></div>
          <div className="row"><span className="grow">数据</span><span className="muted">导出 JSON / Excel，随时带走</span></div>
          <p className="hint">小满记账：小有盈余，日子清楚。</p>
          <button type="button" className="ghost wide" onClick={() => setAboutOpen(false)}>知道了</button>
        </Modal>
      )}
      {dreamOpen && <DreamList notify={notify} onBack={() => setDreamOpen(false)} />}
      {aiTypeOpen && <AiTypeManager notify={notify} onBack={() => setAiTypeOpen(false)} />}

      {profileOpen && (
        <Modal label="个人资料" onClose={() => setProfileOpen(false)}>
          <h3>个人资料</h3>
          <div className="label">昵称</div>
          <input aria-label="昵称" value={profile.nick} maxLength={12}
            onChange={(e) => setProfile({ ...profile, nick: e.target.value })} />
          <div className="label">头像颜色</div>
          <div className="avatar-row">
            {['', 'var(--accent)', 'var(--focus-ink)', 'var(--muted)', 'var(--out)', 'var(--in)'].map((c) => (
              <button key={c || 'default'} type="button" className={'avatar-dot' + (profile.avatar === c ? ' on' : '')}
                style={c ? { background: c } : undefined} aria-label={c ? '选择该颜色' : '默认颜色'}
                onClick={() => setProfile({ ...profile, avatar: c })} />
            ))}
          </div>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setProfileOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={() => saveProfile(profile)}>保存</button>
          </div>
        </Modal>
      )}

      {backupOpen && (
        <Modal label="云备份" onClose={() => setBackupOpen(false)}>
          <h3>云备份</h3>
          <div className="row"><span className="grow">上次同步</span>
            <span className="muted">{autoSync?.lastOkAt ? new Date(autoSync.lastOkAt).toLocaleString('zh-CN') : '尚未同步'}</span></div>
          <div className="row"><span className="grow">账单数</span><span className="muted">{bills.length} 条</span></div>
          <div className="row"><span className="grow">附件</span><span className="muted">{attachmentCount} 个（不含在备份内）</span></div>
          <p className="hint">云端保存的是账目数据，附件 30 天后销毁。</p>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setBackupOpen(false)}>关闭</button>
            <button type="button" className="primary" onClick={async () => { try { await syncNowImmediate(); notify('已同步') } catch { notify('同步失败') } }}>立即同步</button>
          </div>
        </Modal>
      )}

      <h3>功能</h3>
      <div className="my-grid">
        {([
          ['账本管理', 'book'],
          ['分类管理', 'cat'],
          ['标签管理', 'tag'],
          ['导入导出', 'import'],
          ['愿望清单', 'dream'],
          ['预算管理', 'budget'],
          ['AA 分账', 'split'],
          ['模板记账', 'tpl'],
          ['周期记账', 'cycle'],
          ['智能分类', 'ai'],
          ['数据备份', 'backup'],
          ['主题设置', 'theme'],
          ['安全设置', 'gesture'],
          ['使用指南', 'guide'],
          ['更多应用', 'apps'],
          ['关于', 'about'],
        ] as Array<[string, string]>).map(([label, key]) => (
          <button key={key} type="button" className="my-grid-item" onClick={() => {
            // 记账相关：落到我们已有的页面/功能；商业化项按约定提示「敬请期待」
            const jump = (id: string) => {
              const el = document.getElementById(id)
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
              else notify('暂未找到该区块')
            }
            if (key === 'book') { setMeScreen('book'); window.scrollTo({ top: 0 }); return }
            if (key === 'cat') { setMeScreen('cat'); window.scrollTo({ top: 0 }); return }
            if (key === 'tag') { setMeScreen('tag'); window.scrollTo({ top: 0 }); return }
            if (key === 'cycle') { jump('sec-cycle'); return }
            if (key === 'backup' || key === 'import') { setMeScreen('data'); window.scrollTo({ top: 0 }); return }
            if (key === 'dream') { setDreamOpen(true); return }
            if (key === 'ai') { setAiTypeOpen(true); return }
            if (key === 'guide') { setGuideOpen(true); return }
            if (key === 'tpl') { setTplOpen(true); return }
            if (key === 'gesture') {
              if (hasPin()) {
                const p0 = prompt('请输入当前手势密码以关闭')
                if (p0 == null) return
                if (!verifyPin(p0)) { notify('密码不正确'); return }
                clearPin(); notify('已关闭手势密码')
              }
              else {
                const p1 = prompt('设置 4 位数字密码')
                if (p1 && /^\d{4}$/.test(p1)) { setPin(p1); notify('手势密码已设置') }
                else if (p1) notify('请输入 4 位数字')
              }
              return
            }
            if (key === 'theme') { notify('敬请期待：主题设置'); return }
            if (key === 'about') { setAboutOpen(true); return }
            notify('敬请期待')
          }}>{label}</button>
        ))}
      </div>

      {meScreen === 'data' && (<>
      <button type="button" className="link" onClick={() => setMeScreen(null)}>‹ 返回我的</button>
      <h3>数据</h3>
      <div className="my-data">
        <div className="row"><span className="grow">云同步</span><span className="muted">{syncLine}</span></div>
        <button type="button" className="row my-row-btn" onClick={() => setBackupOpen(true)}>
          <span className="grow">云备份</span><span className="muted">{syncLine}</span>
        </button>
        <div className="row"><span className="grow">导出备份</span><span className="muted">JSON</span></div>
      </div>

      <h3>账单文件</h3>
      <div className="row">
        <span className="grow">{attachmentCount === 0 ? '还没有附件' : `共 ${attachmentCount} 个附件`}</span>
        <button type="button" className="link" onClick={() => setFilesOpen(true)}>查看账单图片</button>
      </div>
      <h3>从其他记账软件迁移</h3>
      <p className="hint">支持 Excel/CSV 与转账流水表，重复账单会提示核对。</p>

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
          {plan.duplicates > 0 && <p className="hint">重复记录也会导入，请先核对。</p>}
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

      <h3 id="ocr-section">截图识别</h3>
      <p className="hint">识别截图后可直接入账。</p>
      <label className="filebtn">
        选择账单截图
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          setOcrBusy(true); setOcrResult(null)
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const r = new FileReader()
              r.onload = () => resolve(String(r.result))
              r.onerror = () => reject(new Error('读取图片失败'))
              r.readAsDataURL(f)
            })
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 30000)
            let resp: Response
            try { resp = await fetch('/api/ocr', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: dataUrl }), signal: controller.signal
            }) } finally { clearTimeout(timer) }
            const json = await resp.json()
            if (json.code !== 0) throw new Error(json.msg || '识别失败')
            const result = json.result as { date?: string; amount?: number; direction?: string; category?: string; remark?: string; payment?: string }
            const direction = result.direction === 'income' ? 'income' : 'expense'
            const category = parents.find((p) => p.kind === direction && p.name === result.category)
            setOcrResult({ date: result.date ?? '', amount: Number.isFinite(result.amount) ? String(result.amount) : '', direction, categoryId: category ? String(category.id) : '', assetId: '', remark: result.remark ?? '', payment: result.payment })
          } catch (err) { notify(err instanceof Error && err.name === 'AbortError' ? '识别超时，请稍后重试' : errorMessage(err, '识别失败，请稍后重试')) }
          finally { setOcrBusy(false); e.target.value = '' }
        }} />
      </label>
      {ocrBusy && <p className="hint">识别中…</p>}
      {ocrResult && (
        <div className="budget-box small">
          <p className="hint"></p>
          <div className="label">日期</div>
          <input aria-label="识别账单日期" type="date" value={ocrResult.date} onChange={(e) => setOcrResult({ ...ocrResult, date: e.target.value })} />
          <div className="label">金额（{defaultCurrency}）</div>
          <input aria-label="识别账单金额" inputMode="decimal" value={ocrResult.amount} onChange={(e) => setOcrResult({ ...ocrResult, amount: e.target.value })} />
          <div className="label">收支方向</div>
          <select aria-label="识别账单方向" value={ocrResult.direction} onChange={(e) => setOcrResult({ ...ocrResult, direction: e.target.value as 'income' | 'expense', categoryId: '' })}>
            <option value="expense">支出</option><option value="income">收入</option>
          </select>
          <div className="label">分类</div>
          <select aria-label="识别账单分类" value={ocrResult.categoryId} onChange={(e) => setOcrResult({ ...ocrResult, categoryId: e.target.value })}>
            <option value="">请选择分类</option>{parents.filter((p) => p.kind === ocrResult.direction && !p.hide).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="label">账户</div>
          <select aria-label="识别账单账户" value={ocrResult.assetId} onChange={(e) => setOcrResult({ ...ocrResult, assetId: e.target.value })}>
            <option value="">请选择账户</option>{visibleAssets(assets, currentBookId, me?.id).map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
          </select>
          {!assets.length && <p className="hint">请先到资产页新建账户。</p>}
          <div className="label">备注</div>
          <input aria-label="识别账单备注" value={ocrResult.remark} onChange={(e) => setOcrResult({ ...ocrResult, remark: e.target.value })} />
          {ocrResult.payment && <p className="hint">识别到的支付方式：{ocrResult.payment}；请手动选择账户。</p>}
          <div className="btns">
            <button className="primary" disabled={ocrSaving} onClick={async () => {
              if (ocrSaving) return
              if (!currentBookId) return notify('请先选择具体账本')
              setOcrSaving(true)
              try {
              let freshBooks = accountBooks
              try {
                const result = await bookApi.members(String(currentBookId))
                if (!Array.isArray(result?.members) || !result.members.length) throw new Error('无法确认账本成员')
                freshBooks = accountBooks.map((b) => String(b.bookId) === String(currentBookId) ? { ...b, memberCount: result.members.length } : b)
                if (!freshBooks.some((b) => String(b.bookId) === String(currentBookId))) throw new Error('无法确认账本')
              } catch { return notify('无法确认账本成员，请联网后重试') }
              if (String(useLedger.getState().currentBookId) !== String(currentBookId) || useLedger.getState().userId !== currentUserId) return notify('账号或账本已切换，请重新确认')
              const checked = validateOcrDraft(ocrResult, assets, parents, currentBookId, freshBooks, currencies, defaultCurrency, me?.id ?? currentUserId)
              if ('error' in checked) return notify(checked.error)
              addBill({
                assetId: checked.asset.assetId,
                parentCategoryId: checked.category.id,
                cost: checked.amount,
                remark: ocrResult.remark,
                time: checked.time
              })
              setOcrResult(null)
              notify('已按识别结果记一笔')
              } finally { setOcrSaving(false) }
            }}>{ocrSaving ? '保存中…' : '记一笔'}</button>
            <button className="ghost" onClick={() => setOcrResult(null)}>忽略</button>
          </div>
        </div>
      )}

      <h3>导出</h3>
      <p className="hint">Excel 用于交换，完整备份用 JSON。</p>
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
            <p className="hint">恢复前请先导出 JSON 备份。</p>
            {restorePreview.data.version === 1 && <p className="hint">旧版备份不含币种、汇率、标签。</p>}
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
      <p className="hint"></p>
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
            <button type="button" className="grow cycle-open" onClick={() => setCycleDrill({ title: `${c.name} · 已生成账单`, cycleId: c.cycleId })}>
              <div>
                {c.name}
                <span className="tag">{describeCycle(c)}</span>
              </div>
              <small>
                {p?.name ?? '分类'} · {a?.assetName ?? '账户'} · {money(c.cost)} · {c.enabled ? '启用中' : '已暂停'}
                {c.endMode === 'times' && c.times ? ` · 已记 ${(c.generated ?? []).length}/${c.times} 次` : ''}
                {c.endMode === 'date' && c.endDate ? ` · 至 ${new Date(c.endDate).toISOString().slice(0, 10)}` : ''}
                {c.bookId == null ? ' · ⚠️ 账本待确认' : ''}
              </small>
            </button>
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
                {accountBooks.filter((b) => b.bookId != null && !b.hidden).map((b) => (
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
            <p className="hint"></p>
            <div className="modal-btns">
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(cycleForm.notIntoTotal)}
                onChange={(e) => setCycleForm({ ...cycleForm, notIntoTotal: e.target.checked })} />
              生成的账单不计入收支
            </label>
            <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(cycleForm.notIntoBudget)}
                onChange={(e) => setCycleForm({ ...cycleForm, notIntoBudget: e.target.checked })} />
              不计入预算
            </label>
            <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={Boolean(cycleForm.reimbursement)}
                onChange={(e) => setCycleForm({ ...cycleForm, reimbursement: e.target.checked })} />
              生成的账单标记为待报销
            </label>

            <div className="label">类型</div>
            <select aria-label="周期类型" value={cycleForm.toAssetId ? 'transfer' : 'bill'}
              onChange={(e) => setCycleForm({ ...cycleForm, toAssetId: e.target.value === 'transfer' ? (assets[1]?.assetId ?? 0) : undefined })}>
              <option value="bill">记账（支出/收入）</option>
              <option value="transfer">转账</option>
            </select>
            {cycleForm.toAssetId != null && (
              <>
                <div className="label">转出账户</div>
                <select aria-label="周期转出账户" value={String(cycleForm.fromAssetId ?? '')}
                  onChange={(e) => setCycleForm({ ...cycleForm, fromAssetId: Number(e.target.value) })}>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
                <div className="label">转入账户</div>
                <select aria-label="周期转入账户" value={String(cycleForm.toAssetId)}
                  onChange={(e) => setCycleForm({ ...cycleForm, toAssetId: Number(e.target.value) })}>
                  {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
                </select>
                <div className="label">手续费（可选）</div>
                <input aria-label="周期转账手续费" value={cycleForm.serviceCharge ?? ''} inputMode="decimal"
                  onChange={(e) => setCycleForm({ ...cycleForm, serviceCharge: e.target.value.replace(/[^\d.]/g, '') })} />
              </>
            )}

            <div className="label">结束方式</div>
            <div className="row2">
              <select aria-label="结束方式" value={cycleForm.endMode ?? 'never'}
                onChange={(e) => setCycleForm({ ...cycleForm, endMode: e.target.value as 'never' | 'times' | 'date' })}>
                <option value="never">一直重复</option>
                <option value="times">记满次数</option>
                <option value="date">到某天为止</option>
              </select>
              {cycleForm.endMode === 'times' && (
                <input aria-label="总次数" value={cycleForm.times ?? ''} inputMode="numeric" placeholder="总次数，如 12"
                  onChange={(e) => setCycleForm({ ...cycleForm, times: e.target.value.replace(/\D/g, '') })} />
              )}
              {cycleForm.endMode === 'date' && (
                <input aria-label="结束日期" type="date" value={cycleForm.endDate ?? ''}
                  onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })} />
              )}
            </div>
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

      <h3>实用工具</h3>
      <div className="my-grid">
        {([
          ['AA 分账', () => setSplitOpen(true)],
          ['模板记账', () => setTplOpen(true)],
          ['账单图片', () => setFilesOpen(true)],
          ['智能分类', () => setAiTypeOpen(true)],
          ['愿望清单', () => setDreamOpen(true)],
          ['房贷计算', () => setMortgageOpen(true)],
        ] as Array<[string, () => void]>).map(([label, run]) => (
          <button key={label} type="button" className="my-grid-item" onClick={run}>{label}</button>
        ))}
      </div>

      <button type="button" className="link" onClick={() => setMeScreen(null)}>‹ 返回我的</button>
      </>)}
      {meScreen === 'book' && (<>
      <button type="button" className="link" onClick={() => setMeScreen(null)}>‹ 返回我的</button>
      <h3>账本</h3>
      <p className="hint">账本只属于你自己，同一账号可多设备登录同一账本。</p>
      <div className="row">
        <span className="grow">共 {accountBooks.filter((b) => !b.hidden).length} 个账本（已隐藏 {accountBooks.filter((b) => b.hidden).length} 个）</span>
        <button type="button" className="link" onClick={() => setBooksOpen(true)}>账本管理</button>
      </div>

      </>)}
      {meScreen === 'cat' && (<>
      <button type="button" className="link" onClick={() => setMeScreen(null)}>‹ 返回我的</button>
      <h3>分类</h3>
      <p className="hint">已有账单使用的分类不能删除。</p>
      {(['expense', 'income'] as const).map((kind) => (
        <div key={kind}>
          <div className="label">{kind === 'expense' ? '支出分类' : '收入分类'}</div>
          {sortCategories(parentCategories.filter((p) => p.kind === kind)).map((p) => (
            <div key={p.id} className="cat-block">
              <div className="row">
                <span className="tag-dot" style={{ background: p.color }} />
                <div className="grow">
                  <input aria-label={`${p.name} 分类名称`} value={p.name}
                    onChange={(e) => updateCategory(p.id, { name: e.target.value })} />
                  <small>{childCategories.filter((c) => c.parentId === p.id).length} 个子分类</small>
                </div>
                <select aria-label={`${p.name} 图标`} value={p.icon ?? ''}
                  onChange={(e) => updateCategory(p.id, { icon: e.target.value || undefined })}>
                  <option value="">默认</option>
                  {(kind === 'income' ? PARENT_ICONS : PARENT_ICONS).map((k) => (
                    <option key={k} value={k}>{k.replace('ic_parent_', '')}</option>
                  ))}
                </select>
                <input aria-label={`${p.name} 颜色`} className="color" type="color" value={p.color}
                  onChange={(e) => updateCategory(p.id, { color: e.target.value })} />
                <button className="link" aria-label={`${p.name} 在本账本${(p.bookIds ?? []).some((b) => String(b) === String(currentBookId)) ? '可用（点击移出）' : '不可用（点击加入）'}`}
                  onClick={() => {
                    const id = String(currentBookId)
                    const list = (p.hideBook ?? []).map(String)
                    // 一木的分类隐藏：把该账本加入/移出 hideBook
                    updateCategory(p.id, { hideBook: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] })
                  }}>{(p.hideBook ?? []).some((b) => String(b) === String(currentBookId)) ? '本账本隐藏' : '本账本显示'}</button>
                <button className="link" aria-label={`${p.name} 上移`} onClick={() => moveVisibleCategory(p.id, -1)}>↑</button>
                <button className="link" aria-label={`${p.name} 下移`} onClick={() => moveVisibleCategory(p.id, 1)}>↓</button>
                <button className="del" aria-label={`删除分类 ${p.name}`} onClick={() => {
                  if (!deleteCategory(p.id)) notify('这个分类已有账单在用，不能删除')
                }}>删</button>
              </div>
              <div className="cat-children">
                {sortCategories(childCategories.filter((c) => c.parentId === p.id)).map((c) => (
                  <div key={c.id} className="cat-child">
                    <input aria-label={`${c.name} 子分类名称`} value={c.name}
                      onChange={(e) => updateCategory(c.id, { name: e.target.value })} />
                    <select aria-label={`${c.name} 图标`} value={c.icon ?? ''}
                      onChange={(e) => updateCategory(c.id, { icon: e.target.value || undefined })}>
                      <option value="">默认</option>
                      {CHILD_ICONS.map((k) => <option key={k} value={k}>{k.replace('ic_', '')}</option>)}
                    </select>
                    <button className="link" aria-label={`${c.name} 上移`} onClick={() => moveVisibleCategory(c.id, -1)}>↑</button>
                    <button className="link" aria-label={`${c.name} 下移`} onClick={() => moveVisibleCategory(c.id, 1)}>↓</button>
                    <button className="del" aria-label={`删除子分类 ${c.name}`} onClick={() => {
                      if (!deleteCategory(c.id)) notify('这个子分类已有账单在用，不能删除')
                    }}>删</button>
                  </div>
                ))}
                <button className="link" onClick={() => setNewCat({ parentId: p.id, kind, name: '', icon: '' })}>＋ 新增子分类</button>
              </div>
            </div>
          ))}
          <button className="ghost" onClick={() => setNewCat({ parentId: 0, kind, name: '', icon: '' })}>
            ＋ 新增大类
          </button>
        </div>
      ))}

      {newCat && (
        <Modal label="新增分类" onClose={() => setNewCat(null)}>
          <h3>新增分类</h3>
          <div className="label">名称</div>
          <input aria-label="分类名称" value={newCat.name} autoFocus
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <div className="label">图标</div>
          <select aria-label="分类图标" value={newCat.icon}
            onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })}>
            <option value="">默认</option>
            {(newCat.parentId === 0 ? PARENT_ICONS : CHILD_ICONS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <label className="row">
            <span className="grow">仅在本账本显示</span>
            <input type="checkbox" checked={newCatScoped} onChange={(e) => setNewCatScoped(e.target.checked)} />
          </label>
          <p className="hint">在其他账本将默认不显示，只显示在本账本</p>
          <div className="modal-btns">
            <button className="ghost" onClick={() => { setNewCat(null); setNewCatScoped(false) }}>取消</button>
            <button className="primary" onClick={() => {
              if (!newCat.name.trim()) return notify('请填写名称')
              const created = addCategory({ ...newCat, name: newCat.name.trim(), icon: newCat.icon || undefined })
              // 一木 AddAccountBookActivity.Y(long)：仅本账本 = 把该分类从其它账本隐藏（hideBook 记其它账本号）
              if (newCatScoped && accountBooks.length > 1) {
                const others = accountBooks
                  .filter((b) => b.bookId && String(b.bookId) !== String(currentBookId))
                  .map((b) => b.bookId as number | string)
                if (others.length) updateCategory(created.id, { hideBook: others })
              }
              setNewCat(null); setNewCatScoped(false)
              notify('分类已添加')
            }}>保存</button>
          </div>
        </Modal>
      )}

      </>)}
      <h3>模板</h3>
      <p className="hint"></p>
      {templates.length === 0 && <p className="hint">还没有模板。</p>}
      {templates.map((t) => (
        <div key={t.templateId} className="row">
          <div className="grow">
            <div>{t.name}</div>
            <small>
              {t.mode === 'transfer'
                ? `转账 ${money(t.transfer?.cost ?? 0)}`
                : `${parents.find((p) => p.id === t.bill?.parentCategoryId)?.name ?? '未分类'} ${money(t.bill?.cost ?? 0)}`}
            </small>
          </div>
          <button className="link" onClick={() => {
            if (applyTemplate(t.templateId)) notify('已按模板记一笔')
          }}>记账</button>
          <button className="del" onClick={() => deleteTemplate(t.templateId)}>删</button>
        </div>
      ))}

      <h3>AA 群组</h3>
      <p className="hint">建群组后，记账时可选择 AA 分摊。</p>
      <div className="row2">
        <input aria-label="新群组名称" value={newGroup} placeholder="群组名，如 周末聚餐"
          onChange={(e) => setNewGroup(e.target.value)} />
        <button className="ghost" onClick={() => {
          if (!newGroup.trim()) return notify('请填写群组名')
          addSplitGroup({ name: newGroup.trim(), members: ['我'] })
          setNewGroup('')
          notify('群组已创建')
        }}>新建群组</button>
      </div>
      {splitGroups.length === 0 && <p className="hint">还没有 AA 群组。</p>}
      {splitGroups.map((g) => {
        const members = splitMembers.filter((m) => m.splitGroupId === g.splitGroupId)
        const expenses = splitExpenses.filter((x) => x.splitGroupId === g.splitGroupId)
        const pending = expenses.filter((x) => !x.settlement)
        return (
          <div key={g.splitGroupId} className="cat-block">
            <div className="row">
              <div className="grow">
                <b>{g.name}</b>
                <small>{members.length} 位成员 · {pending.length} 笔待结算</small>
              </div>
              <button className="del" aria-label={`删除群组 ${g.name}`} onClick={() => deleteSplitGroup(g.splitGroupId)}>删</button>
            </div>
            <div className="cat-children">
              {members.map((m) => (
                <div key={m.splitMemberId} className="cat-child">
                  <span className="grow">{m.name}{m.self ? '（我）' : ''}</span>
                  {!m.self && (
                    <button className="link" onClick={() => {
                      members.forEach((x) => updateSplitMember(x.splitMemberId, { self: false }))
                      updateSplitMember(m.splitMemberId, { self: true })
                    }}>设为我</button>
                  )}
                  <button className="del" onClick={() => deleteSplitMember(m.splitMemberId)}>删</button>
                </div>
              ))}
              <div className="row2">
                <input aria-label={`${g.name} 新成员`} value={newMember[g.splitGroupId] ?? ''} placeholder="成员名"
                  onChange={(e) => setNewMember({ ...newMember, [g.splitGroupId]: e.target.value })} />
                <button className="ghost" onClick={() => {
                  const name = (newMember[g.splitGroupId] ?? '').trim()
                  if (!name) return
                  addSplitMember(g.splitGroupId, name)
                  setNewMember({ ...newMember, [g.splitGroupId]: '' })
                }}>加成员</button>
              </div>
              {expenses.map((x) => (
                <div key={x.splitExpenseId} className="cat-child">
                  <span className="grow">{x.title} · {money(x.amount)} · {['均分', '按金额', '按份额'][x.splitType]}</span>
                  <button className="link" onClick={() => settleSplit(x.splitExpenseId, !x.settlement)}>
                    {x.settlement ? '已结算' : '标记已结算'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {meScreen === 'tag' && (<>
      <button type="button" className="link" onClick={() => setMeScreen(null)}>‹ 返回我的</button>
      <div className="pane-head">
        <h3>标签管理</h3>
        <button type="button" className="link" onClick={() => setAddingTag(true)}>新增</button>
      </div>
      {tags.length === 0 && <p className="hint"></p>}
      {tags.map((t) => (
        <div key={t.tagId} className="row tag-row">
          <span className="tag-dot" style={{ background: t.color }} />
          <span className="grow tag-name">{t.name}{t.parentName ? <span className="tag">属于 {t.parentName}</span> : null}</span>
          <details className="tag-more">
            <summary aria-label={`${t.name} 设置`}>设置</summary>
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
            <input aria-label={`${t.name} 标签颜色`} className="color" type="color" value={t.color}
              onChange={(e) => updateTag(t.tagId, { color: e.target.value })} />
          </details>
          <button className="del" aria-label={`删除标签 ${t.name}`} onClick={() => deleteTag(t.tagId)}>删</button>
        </div>
      ))}
      {addingTag && <div className="row2">
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
          setAddingTag(false)
          notify('标签已添加')
        }}>添加标签</button>
      </div>}

      </>)}
      <h3>币种与汇率</h3>
      <div className="row">
        <span className="grow" />
        <button type="button" className="link" disabled={rateBusy} onClick={async () => {
          setRateBusy(true)
          try {
            const res = await fetch(`/api/rates?base=${encodeURIComponent(defaultCurrency)}`, { credentials: 'same-origin' })
            const json = await res.json()
            if (json.code !== 0) throw new Error(json.msg || '获取汇率信息失败')
            const rates: Record<string, number> = json.result?.rates ?? {}
            let n = 0
            for (const c of useLedger.getState().currencies) {
              if (c.code === defaultCurrency) continue
              const v = rates[c.code]
              if (Number.isFinite(v) && v > 0) { setCurrencyRate(c.code, v); n++ }
            }
            notify(n > 0 ? `已更新 ${n} 个币种汇率（${json.result?.date ?? ''}）` : '获取汇率信息失败')
          } catch (e) {
            notify(e instanceof Error ? e.message : '获取汇率信息失败')
          } finally { setRateBusy(false) }
        }}>{rateBusy ? '刷新中…' : '刷新汇率'}</button>
      </div>
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
        同步冲突时保留本地内容并提示。
      </p>
      <div className="btns">
        <button onClick={runSync} disabled={syncing}>{syncing ? '同步中…' : '立即同步'}</button>
      </div>
      {lastSync > 0 && <p className="hint">上次同步：{new Date(lastSync).toLocaleString('zh-CN')}</p>}
      {syncMsg && <p className="hint">{syncMsg}</p>}
      {syncConflicts.length > 0 && <div className="warn" role="status" id="sync-conflicts">
        <p>以下记录的本机版本已保留。建议先导出 JSON 备份；选择本机版本会尝试覆盖该记录的当前云端版本。</p>
        {syncBlocked > 0 && (
          <p className="hint">另有 {syncBlocked} 条记录关联到下面待核对的对象，已暂停上传；处理完冲突后会自动补传。</p>
        )}
        {syncConflicts.map(item => <div key={item.key}>
          <div className="row">
          <span className="grow">{item.kind} / {item.id}：{item.reason}</span>
          <button className="ghost" disabled={syncing} onClick={async () => {
            try { setConflictPreview(await previewVersionedConflict(item.key)) }
            catch (error) { setSyncMsg(errorMessage(error, '读取失败')) }
          }}>查看两份内容</button>
          </div>
          {conflictPreview?.key === item.key && <div>
          <p>本机内容</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(conflictPreview.local.payload, null, 2)}</pre>
          <p>云端内容</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{conflictPreview.remote?.deleted ? '已删除' : JSON.stringify(conflictPreview.remote?.payload ?? '云端无此记录', null, 2)}</pre>
          <button className="ghost" disabled={syncing} onClick={async () => {
            if (!confirm('确定使用本机版本吗？这会尝试替换该记录的云端版本，双方版本将先保存在本机同步备份中。')) return
            setSyncing(true)
            try {
              const result = await keepLocalConflict(item.key, conflictPreview)
              setConflictPreview(null)
              setSyncMsg(result.conflicts ? `仍有 ${result.conflicts} 条记录需要核对` : '该记录已同步')
              setSyncConflicts(getVersionedConflicts())
              await syncNowImmediate()
            } catch (error) { setSyncMsg(errorMessage(error, '处理失败，本机数据已保留')) }
            finally { setSyncing(false) }
          }}>使用本机版本</button>
          <button className="ghost" disabled={syncing || !conflictPreview.remote} onClick={async () => {
            if (!confirm('确定使用云端版本吗？本机版本会先保存在同步备份中，可导出后回溯。')) return
            setSyncing(true)
            try {
              await acceptRemoteConflict(item.key, conflictPreview)
              setConflictPreview(null)
              setSyncMsg('已改用云端版本')
              setSyncConflicts(getVersionedConflicts())
              await syncNowImmediate()
            } catch (error) { setSyncMsg(errorMessage(error, '处理失败，本机数据已保留')) }
            finally { setSyncing(false) }
          }}>使用云端版本</button>
          </div>}
        </div>)}
      </div>}

      <h3>账号</h3>
      {me && <p className="hint">当前登录：{me.email}</p>}
      {onLogout && <button className="ghost wide" onClick={() => { if (confirm('确定退出登录吗？本机数据会保留。')) onLogout() }}>退出登录</button>}

      <h3>财务工具</h3>
      <p className="hint">房贷计划、信用卡分期在「资产」页使用。</p>

      <h3>更多</h3>
      <div className="my-links">
        {[
          ['安全设置', 'gesture'],
          ['使用指南', 'guide'], ['意见反馈', 'feedback'], ['去评分', 'evaluate'],
          ['邀请好友', 'invite'], ['活动中心', 'activity'], ['更多应用', 'apps'],
          ['桌面小组件', 'widget'],
          ['手势密码', 'gesture'] as const,
        ].map(([label, key]) => (
          <button key={key} type="button" className="my-link" onClick={() => notify('敬请期待')}>{label}</button>
        ))}
      </div>

      <h3>关于</h3>
      <div className="my-about">
        <div className="row"><span className="grow">小满记账</span><span className="muted">{APP_VERSION}</span></div>
        <div className="row"><span className="grow">备案号</span><span className="muted">—</span></div>
      </div>
      <p className="hint">
        数据存在你自己的账号下，登录后自动同步。
      </p>
    </section>
  )
}
