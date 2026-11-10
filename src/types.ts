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
  billId: number
  time: number
  cost: number
  parentCategoryId: number
  childCategoryId: number
  assetId: number
  bookId: number
  remark: string
  billType: number
  tags: string[]
  files: any[]
  userId: number
  updateTime: number
  billShareInfo?: { parentCategoryName: string; childCategoryName: string; assetName: string }
}

export interface Asset {
  assetId: number
  assetName: string
  assetType: number
  assetNumber: number
  groupName: string
  hide: boolean
  intoTotalAsset: boolean
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
  /** 语义图标（当前用 emoji 占位，图标规范见设计稿） */
  icon?: string
}

export interface Transfer {
  transferId: number
  fromAssetId: number
  toAssetId: number
  cost: number
  /** 手续费：>0 时单独生成一条支出账单，与 transfer 通过 billId 关联 */
  serviceCharge: number
  billId: number
  time: number
  remark: string
  tags: string[]
  userId: number
  updateTime: number
}

export interface AccountBook {
  accountBookId: number
  accountBookName: string
  userId: number
  createTime: number
}
