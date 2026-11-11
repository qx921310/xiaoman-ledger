const iconGroup = (k: string) =>
  k.startsWith('ic_parent_') ? 'parent'
    : (k.startsWith('ic_income_') || k.startsWith('ic_other_') || k.startsWith('ic_r_')) ? 'income'
      : 'child'

/** 分类图标使用项目图标库，颜色随界面主题变化。 */
export function CatIcon({ k, size = 18 }: { k?: string; size?: number }) {
  if (!k) return null
  const url = `/icons/categories/${iconGroup(k)}/${k}.svg`
  return <span className="cat-ico" style={{ width: size, height: size, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` } as React.CSSProperties} />
}

const ASSET_TYPE_ICONS: Record<number, string> = {
  1: 'ic_asset_wallet', 2: 'ic_asset_credit_card', 3: 'ic_asset_savings_card',
  4: 'ic_asset_investment', 5: 'ic_asset_default', 6: 'ic_asset_deposit',
  7: 'ic_asset_cash', 8: 'ic_asset_fixed_deposit', 9: 'ic_asset_insurance'
}

/** Use neutral asset illustrations; product names stay visible as account text. */
const ASSET_NAME_ICONS: [RegExp, string][] = [
  [/信用卡|花呗|白条/i, 'ic_asset_credit_card'],
  [/现金/i, 'ic_asset_cash'],
  [/基金/i, 'ic_asset_fund'],
  [/股票|证券/i, 'ic_asset_stock'],
  [/房产|房子/i, 'ic_asset_property'],
  [/汽车|车辆/i, 'ic_asset_vehicle'],
  [/保险/i, 'ic_asset_insurance'],
  [/定期/i, 'ic_asset_fixed_deposit'],
  [/银行卡|储蓄卡|借记卡|银行|招行|工行|建行|农行|中行/i, 'ic_asset_debit_card'],
  [/支付宝|微信|钱包|alipay|wechat|paypal/i, 'ic_asset_wallet'],
  [/理财|投资/i, 'ic_asset_investment']
]

export function AssetIcon({ type, size = 18, name, icon }: { type: number; size?: number; name?: string; icon?: string }) {
  const k = ASSET_NAME_ICONS.find(([pattern]) => pattern.test(name ?? ''))?.[1] ?? ASSET_TYPE_ICONS[type] ?? 'ic_asset_default'
  const url = `/icons/assets/${k}.svg`
  return <span className="asset-ico" title={name} style={{ width: size, height: size, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` } as React.CSSProperties} />
}
