import { useEffect, useState } from 'react'
import { useLedger } from '../store'
import { books as bookApi } from '../auth'
import { Modal } from '../ui/modal'
import { HiddenPage } from './hidden-page'
import { CatIcon } from '../ui/icons'

// 账本图标候选（一木 activity_add_account_book 的 icon_layout；这里用自有图标集）
const PENDING_KEY = 'xiaoman-book-pending'

/** 离线时把账本改动排队，下次进入账本页自动补传 */
const queuePending = (bookId: string, patch: Record<string, unknown>) => {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const all = raw ? JSON.parse(raw) as Record<string, Record<string, unknown>> : {}
    all[bookId] = { ...(all[bookId] ?? {}), ...patch }
    localStorage.setItem(PENDING_KEY, JSON.stringify(all))
  } catch { /* 存储不可用则放弃补传 */ }
}
const PENDING_FLUSH_EVENT = 'xiaoman-book-flush'
/** 任何地方都可以触发补传（登录后、联网时、进入账本页） */
export const flushBookPending = () => { void flushPending() }
export const notifyBookFlush = () => window.dispatchEvent(new Event(PENDING_FLUSH_EVENT))

const flushPending = async () => {
  let all: Record<string, Record<string, unknown>> = {}
  try { all = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as typeof all } catch { return 0 }
  let done = 0
  for (const [bookId, patch] of Object.entries(all)) {
    try { await bookApi.update(bookId, patch as never); delete all[bookId]; done++ } catch { /* 下次再试 */ }
  }
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(all)) } catch { /* 忽略 */ }
  return done
}

const BOOK_ICONS = ['ic_parent_daily', 'ic_parent_food', 'ic_parent_traffic', 'ic_parent_shopping',
  'ic_parent_home', 'ic_parent_fun', 'ic_parent_medical', 'ic_parent_education']


/**
 * 账本管理（对齐一木 AccountBookActivity / AddAccountBookActivity / EditAccountBookActivity）
 * 一木：账本管理列表（新增/隐藏）+ 新增账本（名称/图标/隐藏所有分类/显示转账债务流水/显示理财流水）
 *      + 编辑账本（同名 + 两个显示开关 + 删除）
 * 共享账本（成员/邀请码）按产品决定不做。
 */
export function BookManager({ notify, onBack }: { notify: (m: string) => void; onBack: () => void }) {
  const books = useLedger((s) => s.accountBooks)
  const currentBookId = useLedger((s) => s.currentBookId)
  const setBook = useLedger((s) => s.setBook)
  const updateBookMeta = useLedger((s) => s.updateBookMeta)
  const setAccountBooks = useLedger((s) => s.setAccountBooks)
  const hideAllCategoriesForBook = useLedger((s) => s.hideAllCategoriesForBook)
  const [editing, setEditing] = useState<null | { bookId: string | number; name: string; icon: string; showTransfer: boolean; showStock: boolean; hideAllCategory: boolean }>(null)
  const [newIcon, setNewIcon] = useState(BOOK_ICONS[0])
  const [hidePage, setHidePage] = useState(false)
  useEffect(() => {
    const run = () => { void flushPending() }
    run()
    window.addEventListener(PENDING_FLUSH_EVENT, run)
    window.addEventListener('online', run)
    return () => {
      window.removeEventListener(PENDING_FLUSH_EVENT, run)
      window.removeEventListener('online', run)
    }
  }, [])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const visible = books.filter((b) => !b.hidden)
  const hidden = books.filter((b) => b.hidden)

  const save = async () => {
    if (!editing) return
    const patch = {
      accountBookName: editing.name.trim() || '未命名账本',
      icon: editing.icon,
      showTransfer: editing.showTransfer,
      showStock: editing.showStock
    }
    if (editing.hideAllCategory) {
      // 一木：勾选后把所有分类在该账本隐藏（一次性动作，账本本身不存这个开关）
      hideAllCategoriesForBook(editing.bookId)
      setEditing((prev) => prev ? { ...prev, hideAllCategory: false } : prev)
    }
    updateBookMeta(editing.bookId, patch)
    try {
      const serverBook = books.find((b) => String(b.bookId) === String(editing.bookId))
      await bookApi.update(String(editing.bookId), {
        name: patch.accountBookName, icon: patch.icon,
        showTransfer: patch.showTransfer, showStock: patch.showStock,
        baseUpdatedAt: serverBook?.updateTime ?? null
      })
      // 已成功落库：清掉该账本的离线待补，避免旧值之后覆盖新值
      try {
        const raw = localStorage.getItem(PENDING_KEY)
        if (raw) {
          const all = JSON.parse(raw) as Record<string, unknown>
          delete all[String(editing.bookId)]
          localStorage.setItem(PENDING_KEY, JSON.stringify(all))
        }
      } catch { /* 忽略 */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('其他设备')) {
        notify('该账本已在其他设备更新，请返回后重新进入再改')
        setEditing(null)
        return
      }
      // 离线：本地已生效，排队等联网后补传，避免被服务端旧值覆盖
      queuePending(String(editing.bookId), {
        name: patch.accountBookName, icon: patch.icon,
        showTransfer: patch.showTransfer, showStock: patch.showStock
      })
      notify('已本地保存，联网后自动同步')
    }
    notify('账本已更新')
    setEditing(null)
  }

  if (hidePage) {
    return (
      <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={() => setHidePage(false)}>‹ 返回</button>
        <h3>账本隐藏</h3>
      </div>
      <HiddenPage title="账本隐藏" tip="隐藏的账本不会出现在切换列表里，数据仍保留。"
        groups={[{ key: 'books', label: '账本', rows: hidden.map((b) => ({
          key: String(b.bookId ?? b.accountBookId),
          name: b.accountBookName,
          value: '已隐藏',
          onRestore: () => {
            updateBookMeta(String(b.bookId), { hidden: false })
            void bookApi.update(String(b.bookId), { hidden: false }).catch(() => {})
            notify('账本已恢复')
          }
        })) }]} />
      </>
    )
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>账本管理</h3>
        <button type="button" className="link" onClick={() => setCreating(true)}>新增</button>
      </div>

      {visible.map((b) => {
        const active = String(b.bookId) === String(currentBookId)
        return (
          <div key={String(b.bookId ?? b.accountBookId)} className="row">
            <button type="button" className="grow" onClick={() => { setBook(String(b.bookId)); localStorage.setItem('xm-current-book', String(b.bookId)) }}>
              <div><CatIcon k={b.icon} size={14} /> {b.accountBookName}{active && <span className="tag ok">当前</span>}</div>
              <small>
                {b.showTransfer === false ? '不显示转账债务流水' : '显示转账债务流水'} · {b.showStock === false ? '不显示理财流水' : '显示理财流水'}
              </small>
            </button>
            <button type="button" className="link" onClick={() => setEditing({
              bookId: String(b.bookId), name: b.accountBookName, icon: b.icon ?? 'book',
              showTransfer: b.showTransfer !== false, showStock: b.showStock !== false,
              hideAllCategory: !!b.hideAllCategory
            })}>编辑</button>
            <button type="button" className="del" onClick={async () => {
              updateBookMeta(String(b.bookId), { hidden: true })
              try { await bookApi.update(String(b.bookId), { hidden: true }) } catch { /* 离线仅本地 */ }
              notify('账本已隐藏')
            }}>隐藏</button>
          </div>
        )
      })}

      <button type="button" className="ghost wide" onClick={() => setHidePage(true)}>账本隐藏（{hidden.length}）</button>

      {creating && (
        <Modal label="新增账本" onClose={() => setCreating(false)}>
          <h3>新增账本</h3>
          <div className="label">账本名称</div>
          <input aria-label="账本名称" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如 家庭账本" />
          <div className="label">账本图标</div>
          <div className="icon-grid">
            {BOOK_ICONS.map((k) => (
              <button key={k} type="button" className={newIcon === k ? 'icon-cell on' : 'icon-cell'}
                aria-label={`图标 ${k}`} onClick={() => setNewIcon(k)}><CatIcon k={k} size={20} /></button>
            ))}
          </div>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setCreating(false)}>取消</button>
            <button type="button" className="primary" onClick={async () => {
              const name = newName.trim()
              if (!name) { notify('请填写账本名称'); return }
              try {
                const r = await bookApi.create(name, newIcon)
                const id = r?.bookId ?? r?.accountBookId
                if (id) {
                  // 服务端返回当前账号全部账本：直接用最新列表，避免本地不更新
                  const fresh = (r as { books?: Array<Record<string, unknown>> }).books
                  if (Array.isArray(fresh)) {
                    setAccountBooks(fresh.map((b) => ({
                      accountBookId: 0, accountBookName: String(b.name ?? ''), userId: 0, createTime: 0,
                      bookId: String(b.bookId ?? ''), ownerId: b.ownerId as number | undefined,
                      role: b.role as never,
                      icon: (b.icon as string | null) ?? undefined,
                      showTransfer: !(b.showTransfer === 0 || b.showTransfer === false),
                      showStock: !(b.showStock === 0 || b.showStock === false),
                      hideAllCategory: !!(b.hideAllCategory ?? 0),
                      hidden: !!(b.hidden ?? 0)
                    })))
                  } else {
                    // 服务端未返回列表时，本地先补一条，保证界面立刻可见
                    setAccountBooks([...books, {
                      accountBookId: 0, accountBookName: name, userId: 0, createTime: 0,
                      bookId: String(id), icon: newIcon, showTransfer: true, showStock: true
                    } as never])
                  }
                  setBook(String(id))
                }
                notify('账本已创建')
                setNewName(''); setCreating(false)
              } catch { notify('新建账本失败，请联网后重试') }
            }}>创建</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal label="编辑账本" onClose={() => setEditing(null)}>
          <h3>编辑账本</h3>
          <div className="label">账本名称</div>
          <input aria-label="账本名称" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="label">账本图标</div>
          <div className="icon-grid">
            {BOOK_ICONS.map((k) => (
              <button key={k} type="button" className={editing.icon === k ? 'icon-cell on' : 'icon-cell'}
                aria-label={`图标 ${k}`} onClick={() => setEditing({ ...editing, icon: k })}>
                <CatIcon k={k} size={20} />
              </button>
            ))}
          </div>
          <label className="row"><input type="checkbox" checked={editing.hideAllCategory}
            onChange={(e) => setEditing({ ...editing, hideAllCategory: e.target.checked })} /><span className="grow">隐藏所有分类</span></label>
          <p className="hint">当现有分类均不属于当前账本时，可开启。</p>
          <label className="row"><input type="checkbox" checked={editing.showTransfer} onChange={(e) => setEditing({ ...editing, showTransfer: e.target.checked })} /><span className="grow">显示转账债务流水</span></label>
          <p className="hint">在首页、日历视图中显示转账还款债务流水。</p>
          <label className="row"><input type="checkbox" checked={editing.showStock} onChange={(e) => setEditing({ ...editing, showStock: e.target.checked })} /><span className="grow">显示理财流水</span></label>
          <p className="hint">在首页、日历视图中显示理财买入卖出流水。</p>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setEditing(null)}>取消</button>
            <button type="button" className="primary" onClick={save}>保存</button>
          </div>
        </Modal>
      )}
    </>
  )
}
