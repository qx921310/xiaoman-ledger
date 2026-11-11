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

export interface BillShare {
  /** 参与人名称（对方不在本账本时只有名字） */
  name: string
  /** 本账本成员 id（可选） */
  userId?: number
  /** 该人应承担金额（本币） */
  amount: number
}

export interface BillFile {
  name: string
  remotePath: string
}

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
  /** 由哪条周期规则生成（跨设备去重用） */
  cycleId?: number | string
  tags: string[]
  /** 附件引用 */
  files: BillFile[]
  userId: number
  updateTime: number
  /** 分类/账户名称快照（原 billShareInfo，语义正名） */
  billSnapshot?: { parentCategoryName: string; childCategoryName: string; assetName: string }
  /** @deprecated 旧字段名，仅用于读取历史数据 */
  billShareInfo?: { parentCategoryName: string; childCategoryName: string; assetName: string }
  /** AA 分摊：谁一起承担这笔支出，金额之和应等于 cost */
  billShares?: BillShare[]
  /** 一木导出里的「其他」列：不计入收支 / 不计入预算 */
  notIntoTotal?: boolean
  notIntoBudget?: boolean
  /** 优惠金额（本币）；仅作记录与展示，cost 仍是实付 */
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
  /** 外币优惠金额（原币） */
  currencyDiscountNumber?: number
  /** 报销流程结束标记（不再等待报销） */
  reimbursementEnd?: boolean
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
  bookId?: string | number
  number: number
  detail: string
  /** pending=登记待报销，done=已到账（钱已进报销账户），ended=用户主动结束 */
  status: 'pending' | 'done' | 'ended'
  settledAt?: number
  userId: number
  updateTime: number
}

/** 标签：独立实体，可着色、可嵌套 */
export interface Tag {
  tagId: number
  name: string
  color: string
  /** 父标签名（空表示顶层）；由 parentTagId 派生，兼容旧数据 */
  parentName?: string
  /** 父标签 id（真实的嵌套关系） */
  parentTagId?: number
  /** 不在选择器里显示 */
  hide?: boolean
  /** 指定在哪些账本隐藏 */
  hideBook?: Array<string | number>
  positionWeight: number
  /** 修改时间，用于跨设备比较版本 */
  updateTime?: number
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
  /** 新规则用 UUID，保证多台设备对同一条规则得到同一个 id；历史规则可能是数字 */
  cycleId: number | string
  /** 所属账本：周期规则固定在创建时的账本，避免切换账本后记错位置 */
  bookId?: string | number
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
  /** 结束方式：不限 / 记满 N 次 / 到某天为止 */
  endMode?: 'never' | 'times' | 'date'
  /** endMode=times 时的总次数 */
  times?: number
  /** endMode=date 时的截止日（含当天） */
  endDate?: number
  /** 手动跳过的日期键（这期不记，也不影响后续） */
  skipDates?: string[]
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
  /** 所属账本（共享账本里必须与账单一致，否则服务器会当个人记录） */
  bookId?: string | number
  /** Refunded amount in the ledger's base currency, captured when recorded. */
  baseAmount?: number
  number: number
  userId: number
  updateTime: number
}

export interface Asset {
  assetId: number
  /**
   * 归属账本：为空 = 私有账户，只有本人可见；
   * 有值 = 共享到该账本，成员可见。
   */
  bookId?: string | number
  /** 创建者，用于判断私有账户归属 */
  ownerId?: number
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
  /** 自定义图标键（public/icons/assets 下的文件名，不含扩展名） */
  assetIcon?: string
  /** 简称：列表和选择器优先显示 */
  simpleName?: string
  /** 还款日是否顺延到下月（账单日之后还款） */
  outDayNotNext?: boolean
  /** 报销额度（该账户可报销上限，仅作提示与统计） */
  reimAssetNumber?: number
  /** 额度共享自哪个账户（副卡共享主卡额度） */
  shareQuotaAsset?: number
  /** 在哪些账本显示；为空表示按 bookId/私有规则 */
  showBook?: Array<string | number>
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

/** 同步删除标记 */
export interface TombstoneV1 {
  kind: string
  id: string
  updatedAt: number
  bookId?: string | number
  /** 记录属主；跨账号同名编号时用它区分，避免误删 */
  ownerId?: number
}

/** 从服务端拉回的一条同步记录 */
export interface SyncIncoming {
  kind: string
  id: string | number
  payload: Record<string, unknown> | null
  updatedAt?: number
  deleted?: boolean
  ownerId?: number
  bookId?: string | number
}
