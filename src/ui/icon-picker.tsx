import { useMemo, useState } from 'react'
import { ASSET_ICON_GROUPS } from './asset-icons'
import { AssetIcon } from './icons'
import { Modal } from './modal'

/**
 * 账户图标选择器（对应一木 asset_icon 点击后的选择页）：
 * 支持按名称搜索、分组切换、网格预览。
 */
export function IconPicker({
  value, onChange, onClose, assetType = 1
}: {
  value?: string
  onChange: (icon: string | undefined) => void
  onClose: () => void
  assetType?: number
}) {
  const [kw, setKw] = useState('')
  const [tab, setTab] = useState<string>('全部')

  const all = useMemo(
    () => ASSET_ICON_GROUPS.flatMap((g) => g.options.map(([key, label]) => ({ key, label, group: g.label }))),
    []
  )
  const tabs = useMemo(() => ['全部', ...ASSET_ICON_GROUPS.map((g) => g.label)], [])
  const list = all.filter((x) =>
    (tab === '全部' || x.group === tab) && (!kw || x.label.includes(kw) || x.key.includes(kw.toLowerCase()))
  )

  return (
    <Modal label="选择账户图标" onClose={onClose}>
      <h3>选择图标</h3>
      <input aria-label="搜索图标" placeholder="搜索银行 / 钱包 / 支付品牌" value={kw}
        onChange={(e) => setKw(e.target.value)} autoFocus />
      <div className="icon-tabs">
        {tabs.map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div className="icon-grid">
        {list.map((x) => (
          <button key={x.key} className={'icon-cell' + (value === x.key ? ' on' : '')}
            title={x.label}
            onClick={() => { onChange(x.key); onClose() }}>
            <AssetIcon type={assetType} name={x.label} icon={x.key} size={26} />
            <span>{x.label}</span>
          </button>
        ))}
        {list.length === 0 && <p className="hint">没有匹配的图标。</p>}
      </div>
      <div className="modal-btns">
        <button className="ghost" onClick={() => { onChange(undefined); onClose() }}>用默认图标</button>
        <button className="ghost" onClick={onClose}>取消</button>
      </div>
    </Modal>
  )
}
