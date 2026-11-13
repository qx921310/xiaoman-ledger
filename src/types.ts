export const BILL_TYPE: Record<number, string> = {
  1: '快捷记账', 2: '手动记账', 3: '导入记账',
  4: '周期记账', 5: '自动记账', 6: '模板记账'
}

// 一木 manager/t.java 的 k() 原样映射（资产构成与类型展示用词）
export const ASSET_TYPE: Record<number, string> = {
  1: '资金账户', 2: '信贷账户', 3: '充值账户', 4: '投资理财',
  5: '二手货物', 6: '应收款/借出', 7: '应付款/借入', 8: '贷款',
  9: '其他账户', 10: '房贷', 11: '理财账户'
}

// 一木 manager/t.java 的 j()：净资产 / 总资产 / 负资产 的口径名
export const ASSET_TOTAL_LABEL: Record<number, string> = {
  2: '负资产', 3: '净资产'
}

/** 信用卡余额以负数表示 */
export const CREDIT_CARD = 2

/** 一木：房贷计划（组合贷） */
export interface HomeLoan {
  loanId: number
  name: string
  /** 商业贷款本金与年利率 */
  commercial: number
  commercialRate: number
  /** 公积金本金与年利率 */
  provident: number
  providentRate: number
  /** LPR 加点（百分点） */
  lprAdd?: number
  periods: number
  repayment: 'equal-payment' | 'equal-principal'
  /** 首次还款日 */
  firstRepayment?: number
  /** 关联的贷款账户 */
  assetId?: number
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：信用卡分期 */
export interface Instalment {
  instalmentId: number
  assetId?: number
  /** 分期本金 */
  totalNumber: number
  periods: number
  /** 总手续费率 */
  serviceRate: number
  /** 0 一次性 / 1 每期 */
  serviceType: 0 | 1
  /** 账单月份 YYYY-MM */
  accountMonth: string
  billId?: string | number
  remark?: string
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：投资持仓（StockAsset） */
export interface StockAsset {
  stockAssetId: number
  name: string
  code?: string
  /** 一木 assetType：股票/基金/黄金等 */
  assetType?: number
  groupName?: string
  /** 持仓数量 */
  primeNum: number
  /** 成本价 */
  primeCost: number
  /** 累计已实现盈亏 */
  historyIncome: number
  /** 当前价（手动维护，一木靠行情接口） */
  price?: number
  monetary?: boolean
  /** 一木 addBill：交易时是否生成账单 */
  addBill?: boolean
  /** 一木 StockCostMethod.method：0 移动加权 / 1 先进先出 / 2 后进先出 */
  costMethod?: 0 | 1 | 2
  /** 持仓批次 */
  lots?: Array<{ num: number; cost: number }>
  hide?: boolean
  intoTotalAsset?: boolean
  remark?: string
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：一笔持仓交易（StockInfo） */
export interface StockInfo {
  stockInfoId: number
  stockAssetId: number
  /** 1 买入 / 2 卖出 */
  type: 1 | 2
  num: number
  cost: number
  serviceCharge?: number
  doTime: number
  remark?: string
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：定期存款（ActivityAssetFixedDeposit / item_fixed_deposit） */
export interface FixedDeposit {
  depositId: number
  /** 关联账户（可空） */
  assetId?: number
  /** 定存类型，一木目前为「整存整取」 */
  depositType: string
  /** 存入金额 */
  amount: number
  /** 年利率，百分数（3.28 表示 3.28%） */
  rate: number
  /** 存期（年） */
  termYears: number
  /** 存入日期 */
  startTime: number
  remark?: string
  /** 关联账单（一木 item 里带 bill_layout） */
  billId?: string | number
  /** 新增时是否「累加至账户余额」（一木 CommonCheckboxDialog 的选项） */
  toAsset?: boolean
  /** 虚拟定存账户（隐藏资产），用于让这笔钱有去处 */
  virtualAssetId?: number
  /** 对应的转账记录：余额由流水推导，删除时撤销该转账 */
  transferId?: string | number
  bookId?: string | number
  /** 属主：合并云端记录时用于判断「同一条」 */
  ownerId?: number
  updateTime?: number
}

/** 一木：自定义智能分类规则（CategoryKeyManagerActivity / AddAiTypeActivity） */
export interface AiTypeRule {
  ruleId: number
  /** 关键词（多个，命中任一即归类） */
  keywords: string[]
  /** 归类到的分类 id */
  categoryId: number
  icon?: string
  bookId?: string | number
  ownerId?: number
  updateTime?: number
}

/** 一木：愿望清单（DreamListActivity / AddDreamActivity） */
export interface Dream {
  dreamId: number
  /** 愿望名称 */
  name: string
  /** 目标金额 */
  totalNum: number
  /** 已攒金额 */
  startNum: number
  remark?: string
  /** 图标键 */
  icon?: string
  /** 开始日期 */
  startTime?: number
  bookId?: string | number
  ownerId?: number
  updateTime?: number  /** 预期达成日期（一木 endTime）；为空表示无期限 */
  endTime?: number
  /** 储蓄方式：0 手动 / 1 定期自动存入 / 3 按收入比例（一木 addType） */
  addType?: 0 | 1 | 3
  /** 定期/比例储蓄金额 */
  addNum?: number
  /** 定期周期（天） */
  interval?: number
  /** 按收入比例储蓄时的比例（0-100，一木 ratio） */
  ratio?: number
}

/** 一木：模板（ModuleManagerActivity / AddModuleTransferActivity） */
export interface Template {
  templateId: number
  name: string
  mode: 'bill' | 'transfer'
  /** 账单模板存档 */
  bill?: Partial<Bill>
  /** 转账模板存档 */
  transfer?: { fromAssetId: number; toAssetId: number; cost: number; serviceCharge?: number; remark?: string }
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：账单组（把多条账单合成一条展示） */
export interface BillGroup {
  billGroupId: number
  bookId?: string | number
  /** 组内第一条账单 id（列表定位用；我们账单 id 是 UUID 字符串） */
  firstBillId: string | number
  /** 组内账单 id 列表 */
  billList: Array<string | number>
  totalNumber: number
  parentCategoryId?: number
  childCategoryId?: number
  remark?: string
  currency?: string
  discountNum?: number
  refundNum?: number
  reimbursementNum?: number
  assetList?: number[]
  tagList?: number[]
  updateTime?: number
}

/** 一木：账单关联（两两关联） */
export interface BillRelated {
  relatedId: number
  oneBillId: string | number
  twoBillId: string | number
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：AA 群组 */
export interface SplitGroup {
  splitGroupId: number
  name: string
  userId?: number
  createTime?: number
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：群组成员，self 标记「我」 */
export interface SplitMember {
  splitMemberId: number
  splitGroupId: number
  name: string
  self?: boolean
  userId?: number
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：AA 支出（按 sourceBillId 关联账单） */
export interface SplitExpense {
  splitExpenseId: number
  splitGroupId: number
  /** 关联的账单 id（我们的账单 id 是 UUID 字符串）；独立 AA 支出为 0 */
  sourceBillId: string | number
  title: string
  amount: number
  /** 谁付的钱 */
  payerMemberId: number
  /** 0 均分 / 1 按金额 / 2 按份额 */
  splitType: 0 | 1 | 2
  /** 参与人分摊明细（一木 SplitExpense.shares，字符串形式 memberId:value） */
  shares?: SplitShareEntry[]
  /** 是否已结算 */
  settlement: boolean
  time: number
  userId?: number
  updateTime?: number
  /** 归属账本（共享账本按此作用域同步） */
  bookId?: string | number
}

/** 一木：分摊明细，JSON 存进账单的 billShareInfo */
export interface SplitShareEntry {
  memberId: number
  /** 均分时固定 1；按金额时是金额；按份额时是份数 */
  value: number
}

export interface BillShare {
  /** 参与人名称（对方不在本账本时只有名字） */
  name: string
  /** 本账本成员 id（可选） */
  userId?: number
  /** 该人应承担金额（本币） */
  amount: number
}

export interface BillFile {
  fileId?: number
  billId?: string | number
  fileName?: string
  fileSize?: number
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
  /** 由哪笔持仓交易生成（一木的理财买入卖出流水，用于「显示理财流水」开关） */
  stockInfoId?: number
  tags: string[]
  /** 附件引用 */
  files: BillFile[]
  userId: number
  updateTime: number
  /** 分类/账户名称快照（原 billShareInfo，语义正名） */
  billSnapshot?: { parentCategoryName: string; childCategoryName: string; assetName: string }
  /** 一木语义：AA 分摊明细 JSON 字符串 [{memberId, value}] */
  billShareInfo?: string | { parentCategoryName: string; childCategoryName: string; assetName: string }
  /** AA 分摊：谁一起承担这笔支出，金额之和应等于 cost */
  billShares?: BillShare[]
  /** 使用的 AA 群组（一木 splitExpense 反查用） */
  splitGroupId?: number
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
  /** 到账时真正加进账户的金额（账户币种），入账瞬间冻结，之后改汇率不影响余额 */
  accountAmount?: number
  /** 上述金额对应的账户币种 */
  accountCurrency?: string
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
  /** 选择器里默认勾选 */
  check?: boolean
  /** 不在选择器里显示 */
  hide?: boolean
  /** 指定在哪些账本隐藏 */
  hideBook?: Array<string | number>
  /** 分类归属的账本：账本开启「隐藏所有分类」时，只显示这里列出的分类 */
  bookIds?: Array<string | number>
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
  /** 生成的账单不计入收支 */
  notIntoTotal?: boolean
  /** 生成的账单不计入预算 */
  notIntoBudget?: boolean
  /** 生成的账单标记为待报销 */
  reimbursement?: boolean
  /** 报销账户（reimbursement 为真时使用） */
  reimbursementAssetId?: number
  /** 周期转账：收款方账户（有值即转账，否则是普通账单） */
  toAssetId?: number
  /** 周期转账：转出账户（fromAssetId） */
  fromAssetId?: number
  /** 周期转账：手续费 */
  serviceCharge?: number
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
  /** 归属账本：借贷参与余额计算，必须随账本同步（服务端要求 lend 带 bookId） */
  bookId?: string | number
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
  updateTime: number  /** 附件（一木 BillFile 支持挂到转账/借贷上） */
  files?: BillFile[]
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
  /** 新版「全部账本都隐藏」标记（与 showBook 分开，避免改写旧数据语义） */
  showBookNone?: boolean
  /** 账单日 / 还款日（1-28） */
  inAccountDate?: number
  outAccountDate?: number
  positionWeight: number
  remark: string
  userId: number
  updateTime: number
}

export interface Category {
  /** 记账选择器里不显示 */
  hide?: boolean
  /** 在指定账本隐藏 */
  hideBook?: Array<string | number>
  /** 分类归属的账本：账本开启「隐藏所有分类」时，只显示这里列出的分类 */
  bookIds?: Array<string | number>
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
  /** 修改时间，用于跨设备比较版本 */
  updateTime?: number
}

/** 一木资产流水（AssetHistory）：非账单类余额变动，如定存累加/扣回 */
export interface AssetFlow {
  /** 流水号：新记录用 UUID 字符串，兼容历史数字 */
  flowId: number | string
  assetId: number
  /** 变动金额，正=增加、负=减少 */
  delta: number
  /** 一木用固定文案，如「新增定存」「删除定存」 */
  reason: string
  time: number
  bookId?: string | number
  ownerId?: number
  updateTime?: number
}

export interface Transfer {
  /** 归属账本：共享账本里的事务 */
  bookId?: string | number
  /** 转账 id：历史上是秒级时间戳（两设备同秒会撞），新记录用 UUID 字符串 */
  transferId: number | string
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
  updateTime: number  /** 附件（一木 BillFile 支持挂到转账/借贷上） */
  files?: BillFile[]
}

export interface AccountBook {
  /** 服务端账本 id（共享账本用），本地账本可为数字 id */
  bookId?: string
  /** 创建者 userId */
  ownerId?: number
  /** 账本成员数（用于判断是否多人共享） */
  memberCount?: number
  /** 我在这个账本里的角色 */
  role?: 'silent' | 'peer' | 'admin'
  accountBookId: number
  accountBookName: string
  /** 账本图标键（public/icons 下选一个） */
  icon?: string
  /** 账本颜色，用于切换器与列表标识 */
  color?: string
  /** 排序权重，小的靠前 */
  positionWeight?: number
  /** 一木「隐藏所有分类」：新账本从空白分类开始 */
  hideAllCategory?: boolean
  /** 一木「显示转账债务流水」：首页/日历是否显示转账、还款、债务记录 */
  showTransfer?: boolean
  /** 一木「显示理财流水」：首页/日历是否显示买入卖出 */
  showStock?: boolean
  /** 账本隐藏（账本隐藏页可恢复） */
  hidden?: boolean
  /** 最后更新时间（一木 AccountBook.updateTime：跨设备并发以它为准） */
  updateTime?: number
  /** 从账本切换器隐藏 */
  hide?: boolean
  /** 该账本不计入总资产统计 */
  notShowStock?: boolean
  /** 该账本不计转账 */
  notShowTransfer?: boolean
  /** 该账本当前使用的预算 id（一木 currentBudgetId 语义） */
  currentBudgetId?: number
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
  /** Set only after the versioned sync layer confirms there is no local draft. */
  versionAuthoritative?: boolean
}
