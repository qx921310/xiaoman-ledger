import { useCallback, useEffect, useState } from 'react'
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
    const text = kind === 'reset'
      ? '重新云同步会清除云备份并重新上传本地数据。\n如果当前本地没有数据或数据有误，千万不要执行此操作。\n\n确定继续？'
      : '重新下载备份会用云备份覆盖本地数据。\n如果当前云备份数据有误，建议不要执行此操作。\n\n确定继续？'
    if (!window.confirm(text)) return
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
        <button type="button" className="ghost" onClick={() => void run('download')} disabled={busy}>重新下载备份</button>
        <button type="button" className="primary" onClick={() => void run('reset')} disabled={busy}>重新云同步</button>
      </div>
    </div>
  )
}
