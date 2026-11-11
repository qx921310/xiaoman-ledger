/** Account icon choices. Keys reference existing local assets, never remote URLs. */
const banks: [string, string][] = [
  ['beijing','北京银行'], ['beijingnongshang','北京农商银行'], ['bohai','渤海银行'], ['changsha','长沙银行'],
  ['chengdu','成都银行'], ['chongqing','重庆银行'], ['dalian','大连银行'], ['dongguan','东莞银行'],
  ['gansu','甘肃银行'], ['gongshang','工商银行'], ['guangda','光大银行'], ['guangfa','广发银行'],
  ['guangzhou','广州银行'], ['guizhou','贵州银行'], ['guojiakaifa','国家开发银行'], ['hangzhou','杭州银行'],
  ['hankou','汉口银行'], ['hebei','河北银行'], ['hengfeng','恒丰银行'], ['huaqi','花旗银行'],
  ['huaxia','华夏银行'], ['hubei','湖北银行'], ['huifeng','汇丰银行'], ['huzhou','湖州银行'],
  ['jiangsu','江苏银行'], ['jiangxi','江西银行'], ['jianshe','建设银行'], ['jiaotong','交通银行'],
  ['jiling','吉林银行'], ['lanzhou','兰州银行'], ['longjiang','龙江银行'], ['mingsheng','民生银行'],
  ['nanjing','南京银行'], ['ningbo','宁波银行'], ['ningxia','宁夏银行'], ['nongshe','农村信用社'],
  ['nongye','农业银行'], ['pingan','平安银行'], ['pufa','浦发银行'], ['qingdao','青岛银行'],
  ['qinghai','青海银行'], ['shanghai','上海银行'], ['shanghainongcun','上海农商银行'], ['shaoxing','绍兴银行'],
  ['shengjing','盛京银行'], ['suzhou','苏州银行'], ['tailong','泰隆银行'], ['taizhou','台州银行'],
  ['tianjing','天津银行'], ['weizhong','微众银行'], ['wenzhou','温州银行'], ['xiamen','厦门银行'],
  ['xian','西安银行'], ['xingye','兴业银行'], ['youzheng','邮储银行'], ['zhaoshang','招商银行'],
  ['zhengzhou','郑州银行'], ['zheshang','浙商银行'], ['zhongguo','中国银行'], ['zhongxin','中信银行']
]
const wallets: [string, string][] = [
  ['baitiao','京东白条'], ['baoxian','保险'], ['baoxiao','报销'], ['book','账本'], ['che','车辆'],
  ['fangzi','房产'], ['fanka','饭卡'], ['fixed','定期'], ['gongjiaoka','公交卡'], ['gupiao','股票'],
  ['huabei','花呗'], ['huiyuanka','会员卡'], ['invest','理财'], ['jdjinrong','京东金融'], ['jiechu','借出'],
  ['jieru','借入'], ['jijin','基金'], ['manager','管理'], ['qita','其他'], ['qqqianbao','QQ 钱包'],
  ['stock','证券'], ['weixin','微信'], ['xianjin','现金'], ['xinyongka','信用卡'], ['xunihuobi','虚拟货币'],
  ['yajin','押金'], ['yinhangka','银行卡'], ['zhifubao','支付宝']
]
export const ASSET_ICON_GROUPS = [
  { label: '通用', options: [
    ['ic_asset_wallet','钱包'], ['ic_asset_credit_card','信用卡'], ['ic_asset_debit_card','银行卡'],
    ['ic_asset_savings_card','储蓄卡'], ['ic_asset_cash','现金'], ['ic_asset_fund','基金'],
    ['ic_asset_stock','股票'], ['ic_asset_investment','投资'], ['ic_asset_deposit','存款'],
    ['ic_asset_fixed_deposit','定期'], ['ic_asset_insurance','保险'], ['ic_asset_property','房产'],
    ['ic_asset_vehicle','车辆'], ['ic_asset_default','其他']
  ] },
  { label: '银行', options: banks.map(([key, label]) => [`bank:ic_bank_${key}`, label]) },
  { label: '钱包与账户', options: wallets.map(([key, label]) => [`wallet:ic_asset_${key}`, label]) },
  { label: '支付品牌', options: [
    ['brand:alipay', '支付宝'], ['brand:wechat', '微信支付'], ['brand:applepay', 'Apple Pay'],
    ['brand:googlepay', 'Google Pay'], ['brand:mastercard', 'Mastercard'], ['brand:visa', 'Visa'],
    ['brand:paypal', 'PayPal'], ['brand:paytm', 'Paytm'], ['brand:stripe', 'Stripe']
  ] }
] as { label: string; options: string[][] }[]

export function assetIconImagePath(icon?: string): string | null {
  if (!icon) return null
  // 保留已保存的图标 key，使用项目自有的投资图标。
  if (icon === 'wallet:ic_asset_invest') return '/icons/assets/ic_asset_investment.svg'
  const brand = /^brand:([a-z0-9_]+)$/.exec(icon)
  if (brand && ASSET_ICON_GROUPS.some((group) => group.options.some(([key]) => key === icon))) return `/icons/brands/${brand[1]}.svg`
  const match = /^(bank|wallet):(ic_(?:bank|asset)_[a-z0-9_]+)$/.exec(icon)
  if (!match || !ASSET_ICON_GROUPS.some((group) => group.options.some(([key]) => key === icon))) return null
  return `/icons/${match[1] === 'bank' ? 'banks' : 'wallets'}/${match[2]}.png`
}
