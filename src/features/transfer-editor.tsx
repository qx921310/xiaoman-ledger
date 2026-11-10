import { useState } from 'react'
import type { Transfer } from '../types'
import { useLedger } from '../store'
import { toLocalInput } from '../ui-format'

export function TransferEditor({ transfer, onClose, onSave }: {
  transfer: Transfer; onClose: () => void
  onSave: (p: { fromAssetId: number; toAssetId: number; cost: number; toCost: number; serviceCharge: number; remark: string; time: number }) => void
}) {
  const assets = useLedger((s) => s.assets)
  const [from, setFrom] = useState(transfer.fromAssetId)
  const [to, setTo] = useState(transfer.toAssetId)
  const [cost, setCost] = useState(String(transfer.cost))
  const [fee, setFee] = useState(String(transfer.serviceCharge))
  const [toCost, setToCost] = useState(String(transfer.toCost ?? transfer.cost))
  const [remark, setRemark] = useState(transfer.remark)
  const [time, setTime] = useState(toLocalInput(transfer.time))

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>修改转账</h3>
        <div className="row2">
          <div>
            <div className="label">转出账户</div>
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
          </div>
          <div>
            <div className="label">转入账户</div>
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.assetName}</option>)}
            </select>
          </div>
        </div>
        <div className="row2">
          <div>
            <div className="label">金额</div>
            <input value={cost} autoFocus inputMode="decimal"
              onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          <div>
            <div className="label">手续费</div>
            <input value={fee} inputMode="decimal"
              onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
        </div>
        <div className="label">到账金额</div>
        <input value={toCost} inputMode="decimal"
          onChange={(e) => setToCost(e.target.value.replace(/[^\d.]/g, ''))} />
        <div className="label">时间</div>
        <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
        <div className="label">备注</div>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} />
        <p className="hint">保存会先撤销原转账（含手续费账单），再按新值重记。</p>
        <div className="modal-btns">
          <button className="ghost" onClick={onClose}>取消</button>
          <button className="primary" onClick={() => onSave({
            fromAssetId: from, toAssetId: to,
            cost: Number(cost) || 0,
            toCost: Number(toCost) || Number(cost) || 0,
            serviceCharge: Number(fee) || 0,
            remark, time: new Date(time).getTime()
          })}>保存</button>
        </div>
      </div>
    </div>
  )
}
