import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'

const Module = createRequire(import.meta.url)('node:module')
const file = resolve('src/domain/ocr-confirm.ts')
const code = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const mod = new Module(file)
mod.filename = file
mod.paths = Module._nodeModulePaths(process.cwd())
mod._compile(code, file)
const { validateOcrDraft } = mod.exports

test('截图识别确认必须显式选择账户并核对金额、方向和账本隐私', () => {
  const assets = [{ assetId: 1, assetName: '现金', ownerId: 1 }, { assetId: 2, assetName: '共享', bookId: 'b1', ownerId: 1 }]
  const categories = [{ id: 1, name: '餐饮', kind: 'expense' }, { id: 2, name: '工资', kind: 'income' }]
  const books = [{ bookId: 'b1', memberCount: 2 }]
  const draft = { date: '2026-11-11', amount: '12.50', direction: 'expense', categoryId: '1', assetId: '', remark: '' }
  const check = (overrides = {}) => validateOcrDraft({ ...draft, ...overrides }, assets, categories, 'b1', books, [], 'CNY', 1)
  assert.match(check().error, /请选择账户/)
  assert.match(check({ assetId: '1' }).error, /私有账户/)
  assert.match(check({ assetId: '2', amount: '0' }).error, /金额/)
  assert.match(check({ assetId: '2', amount: '1.001' }).error, /金额/)
  assert.match(check({ assetId: '2', direction: 'income' }).error, /分类/)
  assert.match(check({ assetId: '2', date: '' }).error, /日期/)
  const valid = check({ assetId: '2', direction: 'income', categoryId: '2' })
  assert.equal(valid.amount, 12.5)
  assert.equal(valid.category.kind, 'income')
  assert.equal(valid.asset.assetId, 2)
})
