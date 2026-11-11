/**
 * 持仓模型（对应一木 StockAsset / StockInfo / StockCostMethod）：
 * 统一按「移动加权平均成本」计算，卖出时的已实现盈亏累加到 historyIncome。
 */

/** 成本计量方式：0 移动加权平均 / 1 先进先出 / 2 后进先出 */
export type CostMethod = 0 | 1 | 2

/** 一批持仓（FIFO/LIFO 需要按批次结转成本） */
export interface StockLot {
  num: number
  /** 该批次的单位成本 */
  cost: number
}

export interface StockHolding {
  /** 持仓数量 */
  num: number
  /** 单位成本价 */
  cost: number
  /** 累计已实现盈亏 */
  realized: number
  /** 持仓批次（仅 FIFO/LIFO 使用；移动加权可忽略） */
  lots?: StockLot[]
}

/**
 * 买入：总成本并入，重新计算加权平均单价。
 * @param amount 本次买入总金额（不含手续费时传 0 手续费）
 * @param fee 手续费（计入成本）
 */
export function applyBuy(h: StockHolding, num: number, amount: number, fee = 0): StockHolding {
  if (!(num > 0)) return h
  const addCost = amount + fee
  const newNum = +(h.num + num).toFixed(6)
  const newCost = newNum === 0 ? 0 : +(((h.num * h.cost) + addCost) / newNum).toFixed(6)
  return { num: newNum, cost: newCost, realized: h.realized }
}

/**
 * 卖出：按当前成本价结转成本，差额即已实现盈亏（手续费从盈亏里扣）。
 * 卖出的数量不能超过持仓。
 */
export function applySell(h: StockHolding, num: number, amount: number, fee = 0): StockHolding {
  if (!(num > 0) || num > h.num + 1e-9 || !(amount > 0)) return h
  const costPart = +(num * h.cost).toFixed(2)
  const realized = +((amount - fee) - costPart).toFixed(2)
  const left = +(h.num - num).toFixed(6)
  return {
    num: left,
    // 卖出不改变剩余持仓的单位成本
    cost: left <= 1e-9 ? 0 : h.cost,
    realized: +(h.realized + realized).toFixed(2)
  }
}

/** 当前市值与浮动盈亏 */
export function holdingValue(num: number, cost: number, price: number) {
  const market = +(num * price).toFixed(2)
  const costValue = +(num * cost).toFixed(2)
  return { market, costValue, floating: +(market - costValue).toFixed(2) }
}

/** 总盈亏 = 已实现 + 浮动 */
export function totalProfit(realized: number, floating: number) {
  return +(realized + floating).toFixed(2)
}

/**
 * 按成本法卖出：返回新的持仓。
 * - 移动加权平均：按平均成本结转
 * - 先进先出：从最早批次扣
 * - 后进先出：从最新批次扣
 * 已实现盈亏 = 卖出到账额 − 结转成本（与一木公式一致）。
 */
export function applySellByMethod(
  h: StockHolding, method: CostMethod, num: number, amount: number, fee = 0
): StockHolding {
  if (!(num > 0) || num > h.num + 1e-9 || !(amount > 0)) return h
  if (method === 0 || !h.lots?.length) return applySell(h, num, amount, fee)

  // 按索引消费批次：先进先出从小到大，后进先出从大到小。
  // 不再 reverse 数组副本（连续卖出时顺序会错乱）。
  const lots = h.lots.map((x) => ({ ...x }))
  const order = lots.map((_, i) => i)
  if (method === 2) order.reverse()

  let left = num
  let costPart = 0
  for (const i of order) {
    if (left <= 1e-9) break
    const lot = lots[i]
    const take = Math.min(lot.num, left)
    costPart += take * lot.cost
    lot.num = +(lot.num - take).toFixed(6)
    left = +(left - take).toFixed(6)
  }
  if (left > 1e-9) return h          // 批次不足（数据不一致时不动作）

  const realized = +((amount - fee) - costPart).toFixed(2)
  const kept = lots.filter((x) => x.num > 1e-6)
  const totalNum = +kept.reduce((s2, x) => s2 + x.num, 0).toFixed(6)
  const totalCost = totalNum ? +(kept.reduce((s2, x) => s2 + x.num * x.cost, 0) / totalNum).toFixed(6) : 0
  return { num: totalNum, cost: totalCost, realized: +(h.realized + realized).toFixed(2), lots: kept }
}

/** 买入时把新批次追加进去，并重算平均成本 */
export function applyBuyWithLot(h: StockHolding, num: number, amount: number, fee = 0): StockHolding {
  const next = applyBuy(h, num, amount, fee)
  const unit = num > 0 ? +((amount + fee) / num).toFixed(6) : 0
  const lots = [...(h.lots ?? []), { num, cost: unit }]
  return { ...next, lots }
}
