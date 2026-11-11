/**
 * 持仓模型（对应一木 StockAsset / StockInfo / StockCostMethod）：
 * 统一按「移动加权平均成本」计算，卖出时的已实现盈亏累加到 historyIncome。
 */

export interface StockHolding {
  /** 持仓数量 */
  num: number
  /** 单位成本价 */
  cost: number
  /** 累计已实现盈亏 */
  realized: number
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
