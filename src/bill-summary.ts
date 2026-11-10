import type { Bill, Category, Refund } from './types'
import { billNetAmount } from './bill-amount'

/** Income/expense and budget flags are independent; neither changes account movements. */
export function summarizeBills(bills: Bill[], categories: Category[], refunds: Refund[]) {
  const kinds = new Map(categories.map((category) => [category.id, category.kind]))
  const expenseByCategory = new Map<number, number>()
  const budgetByCategory = new Map<number, number>()
  let income = 0
  let expense = 0
  let budget = 0
  for (const bill of bills) {
    if (kinds.get(bill.parentCategoryId) === 'income') {
      if (!bill.notIntoTotal) income += bill.cost
      continue
    }
    const amount = billNetAmount(bill, refunds)
    if (!bill.notIntoTotal) {
      expense += amount
      expenseByCategory.set(bill.parentCategoryId, (expenseByCategory.get(bill.parentCategoryId) ?? 0) + amount)
    }
    if (!bill.notIntoBudget) {
      budget += amount
      budgetByCategory.set(bill.parentCategoryId, (budgetByCategory.get(bill.parentCategoryId) ?? 0) + amount)
    }
  }
  return { income, expense, budget, expenseByCategory, budgetByCategory }
}
