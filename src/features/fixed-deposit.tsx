import { useState } from 'react'
import { useLedger } from '../store'
import { money, fullDay } from '../ui-format'
import { Modal } from '../ui/modal'

/**
 * 定期存款（对应一木 ActivityAssetFixedDeposit / item_fixed_deposit）
 * 字段：定存类型（整存整取）/ 存入金额 / 年利率 / 存期(年) / 存入日期 / 备注
 * 列表项：金额 · 存期 · 剩余天数 · 到期日 · 年利率 · 预计收益
 */
export function FixedDepositList({ onBack, notify }: { onBack: () => void; notify: (m: string) => void }) {
  const list = useLedger((s) => s.fixedDeposits ?? [])
  const add = useLedger((s) => s.addFixedDeposit)
  const del = useLedger((s) => s.deleteFixedDeposit)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: '', rate: '', term: '1', start: '', remark: '' })

  const info = (startTime: number, termYears: number, amount: number, rate: number) => {
    // 按日历整年顺延：跨闰年不出现差一天
    const dueDate = new Date(startTime)
    dueDate.setFullYear(dueDate.getFullYear() + Math.max(1, termYears))
    const due = dueDate.getTime()
    const remain = Math.max(0, Math.ceil((due - Date.now()) / 86400000))
    const income = +(amount * (rate / 100) * termYears).toFixed(2)
    return { due, remain, income }
  }

  return (
    <>
      <div className="subpage-head">
        <button type="button" className="link" onClick={onBack}>‹ 返回</button>
        <h3>定期存款</h3>
        <button type="button" className="link" onClick={() => setOpen(true)}>新增</button>
      </div>

      {list.length === 0 && (
        <>
          <p className="hint">没有任何定存记录</p>
          <button type="button" className="primary" onClick={() => setOpen(true)}>新增定存</button>
        </>
      )}

      {list.map((d) => {
        const { due, remain, income } = info(d.startTime, d.termYears, d.amount, d.rate)
        return (
          <div key={d.depositId} className="row">
            <div className="grow">
              <div>{money(d.amount)} · {d.termYears} 年</div>
              <small>{d.depositType} · 年利率 {d.rate}% · 剩余 {remain} 天</small>
              <small>{fullDay(due)} 到期 · 预计收益 {money(income)}</small>
            </div>
            <button type="button" className="del" onClick={() => del(d.depositId)}>删</button>
          </div>
        )
      })}

      {open && (
        <Modal label="新增定存" onClose={() => setOpen(false)}>
          <h3>定期存款</h3>
          <div className="label">定存类型</div>
          <input aria-label="定存类型" value="整存整取" readOnly />
          <div className="label">存入金额</div>
          <input aria-label="存入金额" inputMode="decimal" value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
          <div className="row2">
            <div>
              <div className="label">年利率 %</div>
              <input aria-label="年利率" inputMode="decimal" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value.replace(/[^\d.]/g, '') })} />
            </div>
            <div>
              <div className="label">存期（年）</div>
              <input aria-label="存期年" inputMode="numeric" value={form.term}
                onChange={(e) => setForm({ ...form, term: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>
          <div className="label">存入日期</div>
          <input aria-label="存入日期" type="date" value={form.start}
            onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <div className="label">备注</div>
          <input aria-label="备注" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} />
          <div className="modal-btns">
            <button type="button" className="ghost" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="primary" onClick={() => {
              const amount = Number(form.amount) || 0
              if (amount <= 0) { notify('请填写存入金额'); return }
              add({
                amount, rate: Number(form.rate) || 0, termYears: Number(form.term) || 1,
                startTime: form.start ? new Date(`${form.start}T00:00:00`).getTime() : Date.now(),
                remark: form.remark
              })
              setForm({ amount: '', rate: '', term: '1', start: '', remark: '' })
              setOpen(false)
            }}>保存</button>
          </div>
        </Modal>
      )}
    </>
  )
}
