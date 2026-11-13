import { useMemo, useState } from 'react'
import { useLedger } from '../store'
import { fullDay } from '../ui-format'

/**
 * 账单图片（对齐一木 BillFileActivity + activity_bill_file / item_bill_file）
 * 一木行为（反编译取证）：
 *  - 取所有 BillFile，归属账单/转账/借贷中时间为 0 的丢弃；
 *  - 只保留有 remotePath 或本地文件存在的记录；
 *  - 按「所属记录的时间」的天分组（t2.k0），组内按天倒序；
 *  - 空态文案「没有任何附件」；
 *  - 列表项：cover / file_name / file_size / share / delete。
 * 我们额外遵守自己的 30 天销毁策略并在页首说明。
 */
export function BillFiles({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const bills = useLedger((s) => s.bills)
  const updateBill = useLedger((s) => s.updateBill)
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null)

  const groups = useMemo(() => {
    const rows = bills.flatMap((b) => (b.files ?? []).map((f) => ({
      key: `${b.billId}-${f.remotePath || f.name}`,
      name: f.name,
      url: f.remotePath,
      time: b.time,
      size: f.fileSize ?? 0
    })))
    // 一木：没有可用路径的附件不展示
    const usable = rows.filter((r) => r.url)
    const byDay = new Map<string, typeof usable>()
    for (const r of usable) {
      const day = fullDay(r.time)
      byDay.set(day, [...(byDay.get(day) ?? []), r])
    }
    // 一木：按天倒序
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [bills])

  const total = groups.reduce((n, [, rows]) => n + rows.length, 0)

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>账单图片</h3>
        <span className="muted">{total} 个</span>
      </div>
      <p className="hint">附件仅保留 30 天，到期销毁；导出备份不含附件文件。</p>

      {total === 0 && <p className="hint">没有任何附件</p>}

      {groups.map(([day, rows]) => (
        <div key={day} className="group">
          <div className="day"><span>{day}</span><small>{rows.length} 个</small></div>
          <div className="file-grid">
            {rows.map((r) => (
              <div key={r.key} className="file-cell">
                <button type="button" className="file-cover" aria-label={`查看 ${r.name}`} onClick={() => setViewing({ name: r.name, url: r.url })}>
                  {/\.(png|jpe?g|webp|gif)$/i.test(r.url)
                    ? <img src={r.url} alt={r.name} loading="lazy" />
                    : <span className="file-ext">{(r.name.split('.').pop() ?? '').toUpperCase()}</span>}
                </button>
                <small className="file-name">{r.name}</small>
                <div className="file-actions">
                  <a className="link" href={r.url} target="_blank" rel="noreferrer">查看</a>
                  <button type="button" className="del" onClick={() => {
                    if (!confirm(`删除附件 ${r.name}？账单本身不受影响。`)) return
                    const owner = bills.find((b) => (b.files ?? []).some((f) => (f.remotePath || f.name) === (r.url || r.name)))
                    if (!owner) { notify('找不到所属账单'); return }
                    updateBill(owner.billId, { files: (owner.files ?? []).filter((f) => (f.remotePath || f.name) !== (r.url || r.name)) })
                    notify('附件已删除')
                  }}>删</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {viewing && (
        <div className="menu-mask" onClick={() => setViewing(null)}>
          <div className="file-viewer" onClick={(e) => e.stopPropagation()}>
            <img src={viewing.url} alt={viewing.name} />
            <div className="row"><span className="grow">{viewing.name}</span><button type="button" className="link" onClick={() => setViewing(null)}>关闭</button></div>
          </div>
        </div>
      )}
    </>
  )
}
