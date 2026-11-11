export const BILL_TYPE: Record<number, string> = {
  1: '快捷记账', 2: '手动记账', 3: '导入记账',
  4: '周期记账', 5: '自动记账', 6: '模板记账'
}

export const ASSET_TYPE: Record<number, string> = {
  1: '资金账户', 2: '信用卡', 3: '充值账户', 4: '投资理财',
  5: '二手货物', 6: '借出', 7: '借入', 8: '贷款', 9: '报销'
}

/** 信用卡余额以负数表示 */
export const CREDIT_CARD = 2

export interface Bill {
  billId: string | number
  /** Stable creation identity; old records may have only the numeric billId. */
  syncId?: string
  /** Assigned by the server within this book. */
  memberNo?: number
  sequenceNo?: number
  displayId?: string
  time: number
  cost: number
  parentCategoryId: number
  childCategoryId: number
  /** Version 2 records a globally unique child-category ID. */
  childCategoryIdentityVersion?: 2
  assetId: number
  bookId: string | number
  remark: string
  billType: number
  tags: string[]
  files: any[]
  userId: number
  updateTime: number
  billShareInfo?: { parentCategoryName: string; childCategoryName: string; assetName: string }
  /** 一木导出里的「其他」列：不计入收支 / 不计入预算 */
  notIntoTotal?: boolean
  notIntoBudget?: boolean
  /** 优惠金额 */
  discountNumber?: number
  /** 退款金额 */
  refundNum?: number
  /** 币种代码，如 'USD'；为空表示默认币种 */
  currencyInfo?: string
  /** 外币原金额（cost 存折合本币后的金额） */
  currencyAssetNumber?: number
  /** Actual amount posted to the selected account, in that account's currency. */
  accountAmount?: number
  /** Currency of accountAmount at the time of posting. */
  accountCurrency?: string
  /** 外币优惠金额 */
  currencyDiscountNumber?: number
  /** 地点名（POI） */
  poiAddress?: string
  /** 完整地址 */
  totalAddress?: string
  /** 记录时间（≠ 账单时间，用于补记） */
  recordTime?: number
  /** 计入资产的时间 */
  inAssetTime?: number
  /** 共享账本中是否按本人显示 */
  displayAsSelf?: boolean
  /** 记录人 userId（共享账本用于显示「谁记的」） */
  ownerId?: number
  /** 并发冲突标记：与他人同一秒记账撞了 ID，这条是保留下来的那条 */
  conflict?: boolean
  /** 冲突时对方的记录人（仅用于提示） */
  conflictOwnerId?: number
  /** 是否报销中 */
  isReimbursement?: number
  /** 报销金额（冗余，便于列表展示） */
  reimbursementNum?: number
  fromUserId?: number
}

/** 报销：挂在账单上的附属记录（不改变账单本身） */
export interface Reimbursement {
  reimbursementId: number
  billId: string | number
  /** 报销账户（资产） */
  assetId: number
  number: number
  detail: string
  /** pending=登记待报销，done=已到账（钱已进报销账户） */
  status: 'pending' | 'done'
  settledAt?: number
  userId: number
  updateTime: number
}

/** 标签：独立实体，可着色、可嵌套 */
export interface Tag {
  tagId: number
  name: string
  color: string
  /** 父标签名（空表示顶层） */
  parentName?: string
  positionWeight: number
}

/** 币种。rate 语义：1 单位该币种 = rate 个默认币种 */
export interface Currency {
  code: string       // USD
  name: string       // 美元
  symbol: string     // $
  rate: number       // 对本币汇率
  positionWeight: number
}

/** 周期记账规则：每月固定日期自动生成账单 */
export interface Cycle {
  cycleId: number
  name: string
  kind: 'expense' | 'income'
  parentCategoryId: number
  childCategoryId: number
  childCategoryIdentityVersion?: 2
  assetId: number
  cost: number
  /** 周期类型：每月 / 每周 / 每年 */
  cycleType?: 'month' | 'week' | 'year'
  /** 每月第几天（1–28），cycleType=month/year 时用 */
  dayOfMonth: number
  /** 每月多天，如 [1, 15]；有值时优先于 dayOfMonth */
  monthDays?: number[]
  /** 每月最后一天 */
  monthLast?: boolean
  /** 每周的星期几，0=周日 */
  weekdays?: number[]
  /** 每年几月（1-12），cycleType=year 时用 */
  monthOfYear?: number
  remark: string
  enabled: boolean
  /** 生效起始月（时间戳，取当月即可） */
  startTime: number
  /** 已生成过的日期，格式 YYYY-MM-DD，保证不重复 */
  generated: string[]
  userId: number
  updateTime: number
}

/** 借入借出：独立资金动作，有自己的流水 */
export interface Lend {
  lendId: number
  /** 1 借出 / 2 借出收回 / 3 借入 / 4 借入还款 */
  type: 1 | 2 | 3 | 4
  /** 资金所在账户 */
  assetId: number
  /** 对方（人名/机构） */
  counterparty: string
  /** 本金 */
  number: number
  /** 利息（应收/应付，不计入本金流水） */
  interest?: number
  /** 收回/还款记录指向的原借贷（用于计算剩余） */
  parentLendId?: number
  /** 还款/收款账户；缺省沿用 assetId */
  repaymentAssetId?: number
  time: number
  remark: string
  userId: number
  updateTime: number
}

export const LEND_TYPE: Record<number, string> = {
  1: '借出', 2: '收回借款', 3: '借入', 4: '归还借款'
}

/** 退款：同样挂在账单上 */
export interface Refund {
  refundId: number
  billId: string | number
  /** Account and currency receiving the refund at registration time. */
  assetId?: number
  currency?: string
  /** Refunded amount in the ledger's base currency, captured when recorded. */
  baseAmount?: number
  number: number
  userId: number
  updateTime: number
}

export interface Asset {
  assetId: number
  assetName: string
  assetType: number
  assetNumber: number
  /** Starting balance; assetNumber is a derived local display cache. */
  openingBalance?: number
  groupName: string
  hide: boolean
  intoTotalAsset: boolean
  /** 账户币种，默认 CNY */
  currency?: string
  /** 总额度（信用卡常用） */
  totalQuota?: number
  /** 卡号后四位 */
  cardCode?: string
  /** 账单日 / 还款日（1-28） */
  inAccountDate?: number
  outAccountDate?: number
  positionWeight: number
  remark: string
  userId: number
  updateTime: number
}

export interface Category {
  id: number
  name: string
  parentId: number
  kind: 'expense' | 'income'
  color: string
  positionWeight: number
  /** 图标键，对应 public/icons/categories/<group>/<key>.svg */
  icon?: string
  /** 图标底色（大类磁贴用） */
  bg?: string
}

export interface Transfer {
  transferId: number
  fromAssetId: number
  toAssetId: number
  /** 转出金额（按转出账户币种） */
  cost: number
  /** 实际到账金额（按转入账户币种）；缺省等于 cost */
  toCost?: number
  /** 手续费：>0 时单独生成一条支出账单，与 transfer 通过 billId 关联 */
  serviceCharge: number
  billId: string | number
  time: number
  remark: string
  tags: string[]
  userId: number
  updateTime: number
}

export interface AccountBook {
  /** 服务端账本 id（共享账本用），本地账本可为数字 id */
  bookId?: string
  /** 创建者 userId */
  ownerId?: number
  /** 我在这个账本里的角色 */
  role?: 'silent' | 'peer' | 'admin'
  accountBookId: number
  accountBookName: string
  userId: number
  createTime: number
}
