import { useCallback, useEffect, useState } from 'react'
import { Modal } from '../ui/modal'
import { useLedger } from '../store'

/**
 * 一木「数据修复」：本地账单数量 vs 云备份账单数量，两个显式动作。
 * 文案与动作方向对齐 apk-dec/res/layout/dialog_data_sync_all.xml、
 * dialog_data_sync_download.xml（见 docs/规格-一木同步模式.md）。
 */
export function DataRepair({ onResetCloud, onDownloadAll }: {
  onResetCloud?: () => void | Promise<void>
  onDownloadAll?: () => void | Promise<void>
}) {
  const bills = useLedger((s) => s.bills)
  const currentBookId = useLedger((s) => s.currentBookId)
  const [cloud, setCloud] = useState<{ bills: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<'reset' | 'download' | null>(null)

  const bookId = String(currentBookId ?? '')
  const localBills = bills.filter((b) => String(b.bookId ?? '') === bookId).length

  const load = useCallback(async () => {
    if (!bookId) return
    try {
      const r = await fetch(`/api/data/counts?bookId=${encodeURIComponent(bookId)}`, { credentials: 'include' })
      const j = await r.json()
      if (j?.result) setCloud({ bills: Number(j.result.bills) || 0 })
    } catch { setCloud(null) }
  }, [bookId])

  useEffect(() => { void load() }, [load])

  const run = async (kind: 'reset' | 'download') => {
    if (busy) return
    setBusy(true)
    try {
      if (kind === 'reset') await onResetCloud?.()
      else await onDownloadAll?.()
      await load()
    } finally { setBusy(false) }
  }

  return (
    <div className="fix-block">
      <div className="row"><span className="grow">本地账单数量</span><b>{localBills} 条</b></div>
      <div className="row"><span className="grow">云备份账单数量</span><b>{cloud ? `${cloud.bills} 条` : '读取中…'}</b></div>
      <div className="btns">
        <button type="button" className="ghost" onClick={() => setAsk('download')} disabled={busy}>重新下载备份</button>
        <button type="button" className="primary" onClick={() => setAsk('reset')} disabled={busy}>重新云同步</button>
      </div>

      {ask && (
        <Modal label={ask === 'reset' ? '重新云同步' : '重新下载备份'} onClose={() => setAsk(null)}>
          <h3>{ask === 'reset' ? '重新云同步' : '重新下载备份'}</h3>
          <p className="hint">
            {ask === 'reset'
              ? '必须仔细阅读：此操作会清除云备份并重新上传本地数据，如果当前本地没有数据或数据有误，千万不要执行此操作'
              : '此操作会重新同步云备份数据至本地，如果当前云备份数据有误，建议不要执行此操作'}
          </p>
          <p>本地账单数量：{localBills} / 云备份账单数量：{cloud ? cloud.bills : '—'}</p>
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setAsk(null)}>取消</button>
            <button type="button" className="primary" onClick={async () => { const k = ask; setAsk(null); await run(k) }}>确认</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
