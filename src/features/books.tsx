import { useState } from 'react'
import { useLedger } from '../store'
import { books as bookApi } from '../auth'
import { Modal } from '../ui/modal'
import { HiddenPage } from './hidden-page'
import { CatIcon } from '../ui/icons'

// 账本图标候选（一木 activity_add_account_book 的 icon_layout；这里用自有图标集）
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
  const [editing, setEditing] = useState<null | { bookId: string | number; name: string; icon: string; showTransfer: boolean; showStock: boolean; hideAllCategory: boolean }>(null)
  const [newIcon, setNewIcon] = useState(BOOK_ICONS[0])
  const [hidePage, setHidePage] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const visible = books.filter((b) => !b.hidden)
  const hidden = books.filter((b) => b.hidden)

  const save = async () => {
    if (!editing) return
    updateBookMeta(editing.bookId, {
      accountBookName: editing.name.trim() || '未命名账本',
      icon: editing.icon,
      showTransfer: editing.showTransfer,
      showStock: editing.showStock,
      hideAllCategory: editing.hideAllCategory
    })
    try { await bookApi.rename(String(editing.bookId), editing.name.trim()) } catch { /* 离线时仅本地生效 */ }
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
          onRestore: () => { updateBookMeta(String(b.bookId), { hidden: false }); notify('账本已恢复') }
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
            <button type="button" className="del" onClick={() => { updateBookMeta(String(b.bookId), { hidden: true }); notify('账本已隐藏') }}>隐藏</button>
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
                const r = await bookApi.create(name)
                const id = r?.bookId ?? r?.accountBookId
                // 图标与开关是本地账本元数据（服务端目前只存名称）
                if (id) updateBookMeta(String(id), { icon: newIcon, showTransfer: true, showStock: true })
                if (id) setBook(String(id))
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
