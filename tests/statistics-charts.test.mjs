import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const file = resolve('src/domain/statistics-charts.ts')
const compiled = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const mod = new Module(file)
mod.filename = file
mod.paths = Module._nodeModulePaths(process.cwd())
mod._compile(compiled, file)
const { statisticsBounds, chartTrend, categoryDistribution } = mod.exports

test('图表口径一致：退款冲减支出，不计收支的账单不出现', () => {
  const categories = [{ id: 1, name: '餐饮', kind: 'expense' }, { id: 2, name: '工资', kind: 'income' }]
  const at = (day) => new Date(2026, 1, day, 12).getTime()
  const bills = [
    { billId: 'a', parentCategoryId: 1, time: at(1), cost: 30 },
    { billId: 'b', parentCategoryId: 2, time: at(3), cost: 100 },
    { billId: 'c', parentCategoryId: 2, time: at(3), cost: 99, notIntoTotal: true }
  ]
  const refunds = [{ billId: 'a', baseAmount: 10 }]
  const bounds = statisticsBounds('month', '2026-02', '', '', '')
  const points = chartTrend(bills, categories, refunds, bounds)
  assert.equal(points.length, 28)
  assert.equal(points[0].expense, 20)
  assert.equal(points[1].expense, 0)
  assert.equal(points[2].income, 100)
  assert.equal(categoryDistribution(bills, categories, refunds, 'expense')[0].amount, 20)
  assert.equal(categoryDistribution(bills, categories, refunds, 'income')[0].amount, 100)
})

test('周从选定日期所在周开始，结束日全天纳入；年度有 12 个月', () => {
  const week = statisticsBounds('week', '2026-11', '2026-11-11', '', '')
  assert.equal(week.start.getDate(), 9)
  assert.equal(week.end.getDate(), 16)
  const bounds = statisticsBounds('custom', '', '', '2026-11-10', '2026-11-11')
  const bill = { billId: 'a', parentCategoryId: 1, time: new Date(2026, 10, 11, 23, 59, 59, 999).getTime(), cost: 1 }
  assert.equal(chartTrend([bill], [], [], bounds)[1].expense, 1)
  assert.equal(statisticsBounds('custom', '', '', '2026-11-12', '2026-11-11'), null)
  assert.equal(chartTrend([], [], [], statisticsBounds('year', '2026-11', '', '', '')).length, 12)
})
