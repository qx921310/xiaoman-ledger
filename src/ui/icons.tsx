const iconGroup = (k: string) =>
  k.startsWith('ic_parent_') ? 'parent'
    : (k.startsWith('ic_income_') || k.startsWith('ic_other_') || k.startsWith('ic_r_')) ? 'income'
      : 'child'

/** 分类图标：用 CSS mask 上色，跟随 currentColor */
export function CatIcon({ k, size = 18 }: { k?: string; size?: number }) {
  if (!k) return null
  const url = `/icons/categories/${iconGroup(k)}/${k}.svg`
  return (
    <span
      className="cat-ico"
      style={{ width: size, height: size, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` } as React.CSSProperties}
    />
  )
}

/** 账户类型 → 账户图标（6–9 为近似映射） */
const ASSET_ICON: Record<number, string> = {
  1: 'ic_asset_wallet', 2: 'ic_asset_credit_card', 3: 'ic_asset_savings_card',
  4: 'ic_asset_investment', 5: 'ic_asset_default', 6: 'ic_asset_deposit',
  7: 'ic_asset_cash', 8: 'ic_asset_fixed_deposit', 9: 'ic_asset_insurance'
}

/** 账户名 → 品牌图标（Simple Icons，CC0，单色可用 mask 上色） */
const BRAND_RULES: [RegExp, string, string][] = [
  [/支付宝|alipay/i, 'alipay', '#1677FF'],
  [/微信|wechat|weixin/i, 'wechat', '#07C160'],
  [/apple\s*pay/i, 'applepay', '#111111'],
  [/google\s*pay/i, 'googlepay', '#4285F4'],
  [/paypal/i, 'paypal', '#003087'],
  [/visa/i, 'visa', '#1A1F71'],
  [/master/i, 'mastercard', '#EB001B'],
  [/stripe/i, 'stripe', '#635BFF'],
  [/paytm/i, 'paytm', '#00BAF2']
]
const brandOf = (name: string) => BRAND_RULES.find(([re]) => re.test(name ?? ''))

/** 银行机构 → 官方图标（一木 CDN 取回的 PNG，100×100） */
const BANK_ICON: [RegExp, string][] = [
  [/招商|招行/i, 'zhaoshang'], [/工商|工行/i, 'gongshang'], [/建设|建行/i, 'jianshe'],
  [/农业|农行/i, 'nongye'], [/中国银行|中行/i, 'zhongguo'], [/交通|交行/i, 'jiaotong'],
  [/邮储|邮政/i, 'youzheng'], [/平安/i, 'pingan'], [/浦发/i, 'pufa'],
  [/民生/i, 'mingsheng'], [/兴业/i, 'xingye'], [/中信/i, 'zhongxin'],
  [/光大/i, 'guangda'], [/华夏/i, 'huaxia'], [/广发/i, 'guangfa'],
  [/北京银行/i, 'beijing'], [/上海银行/i, 'shanghai'], [/宁波/i, 'ningbo'],
  [/江苏银行/i, 'jiangsu'], [/南京/i, 'nanjing'], [/杭州银行/i, 'hangzhou'],
  [/成都/i, 'chengdu'], [/重庆/i, 'chongqing'], [/西安/i, 'xian'],
  [/微众/i, 'weizhong'], [/长沙/i, 'changsha'], [/苏州/i, 'suzhou'],
  [/青岛/i, 'qingdao'], [/厦门/i, 'xiamen'], [/郑州/i, 'zhengzhou']
]
const bankIconOf = (name: string) => BANK_ICON.find(([re]) => re.test(name ?? ''))

/** 钱包/资产类 → 图标（同 CDN 取回） */
const WALLET_ICON: [RegExp, string][] = [
  [/支付宝/i, 'ic_asset_zhifubao'], [/微信/i, 'ic_asset_weixin'], [/QQ\s*钱包/i, 'ic_asset_qqqianbao'],
  [/花呗/i, 'ic_asset_huabei'], [/白条/i, 'ic_asset_baitiao'], [/京东/i, 'ic_asset_jdjinrong'],
  [/现金/i, 'ic_asset_xianjin'], [/信用卡/i, 'ic_asset_xinyongka'], [/银行卡|储蓄卡|借记卡/i, 'ic_asset_yinhangka'],
  [/会员卡/i, 'ic_asset_huiyuanka'], [/公交卡/i, 'ic_asset_gongjiaoka'], [/饭卡/i, 'ic_asset_fanka'],
  [/虚拟货币|比特币/i, 'ic_asset_xunihuobi'], [/押金/i, 'ic_asset_yajin'], [/基金/i, 'ic_asset_jijin'],
  [/股票/i, 'ic_asset_gupiao'], [/理财|投资/i, 'ic_asset_invest'], [/保险/i, 'ic_asset_baoxian'],
  [/房子|房产/i, 'ic_asset_fangzi'], [/车/i, 'ic_asset_che'], [/报销/i, 'ic_asset_baoxiao'],
  [/借出|应收/i, 'ic_asset_jiechu'], [/借入|应付/i, 'ic_asset_jieru'], [/定期/i, 'ic_asset_fixed']
]
const walletIconOf = (name: string) => WALLET_ICON.find(([re]) => re.test(name ?? ''))

/** 银行机构 → 品牌色与字母（没有官方图标时兜底） */
const BANK_RULES: [RegExp, string, string][] = [
  [/招商|招行/i, '招', '#E4002B'],
  [/工商|工行/i, '工', '#C7000B'],
  [/建设|建行/i, '建', '#0066B3'],
  [/农业|农行/i, '农', '#009B4C'],
  [/中国银行|中行/i, '中', '#B01F24'],
  [/交通|交行/i, '交', '#004B8D'],
  [/邮储|邮政/i, '邮', '#007A33'],
  [/平安/i, '平', '#F36F21'],
  [/民生/i, '民', '#005BAC'],
  [/浦发/i, '浦', '#00447C'],
  [/兴业/i, '兴', '#003D7C'],
  [/中信/i, '信', '#D2232A'],
  [/光大/i, '光', '#6E2C91'],
  [/华夏/i, '华', '#E60012'],
  [/广发/i, '广', '#C8102E']
]
const bankOf = (name: string) => BANK_RULES.find(([re]) => re.test(name ?? ''))

export function AssetIcon({ type, size = 18, name }: { type: number; size?: number; name?: string }) {
  const brand = name ? brandOf(name) : undefined
  if (brand) {
    const [, key, color] = brand
    return (
      <span
        className="asset-ico"
        title={name}
        style={{
          width: size, height: size, color,
          WebkitMaskImage: `url(/icons/brands/${key}.svg)`, maskImage: `url(/icons/brands/${key}.svg)`
        } as React.CSSProperties}
      />
    )
  }
  // 先认银行（具体机构），再认钱包/资产类型（通用）
  const icon = name ? bankIconOf(name) : undefined
  if (icon) {
    return (
      <img className="asset-bank" alt="" title={name}
        src={`/icons/banks/ic_bank_${icon[1]}.png`}
        style={{ width: size, height: size }} />
    )
  }
  const wallet = name ? walletIconOf(name) : undefined
  if (wallet) {
    return (
      <img className="asset-bank" alt="" title={name}
        src={`/icons/wallets/${wallet[1]}.png`} style={{ width: size, height: size }} />
    )
  }
  const bank = name ? bankOf(name) : undefined
  if (bank) {
    const [, letter, color] = bank
    return (
      <span className="asset-letter" title={name}
        style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.62) }}>
        {letter}
      </span>
    )
  }
  const k = ASSET_ICON[type] ?? 'ic_asset_default'
  return (
    <span
      className="asset-ico"
      style={{ width: size, height: size, WebkitMaskImage: `url(/icons/assets/${k}.svg)`, maskImage: `url(/icons/assets/${k}.svg)` } as React.CSSProperties}
    />
  )
}
