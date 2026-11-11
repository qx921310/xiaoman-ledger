import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { buildSync } from 'esbuild'

const Module = createRequire(import.meta.url)('node:module')
function load(file) {
  const path = resolve(file)
  const code = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
  const mod = new Module(path)
  mod.filename = path
  mod.paths = Module._nodeModulePaths(process.cwd())
  mod._compile(code, path)
  return mod.exports
}
const { sortCategories } = load('src/domain/category-order.ts')
const { TAXONOMY_PARENTS, TAXONOMY_INCOME, TAXONOMY_CHILDREN } = load('src/taxonomy.ts')

test('默认分类按常用顺序排列，其他放末尾', () => {
  const food = sortCategories(TAXONOMY_CHILDREN.filter(c => c.parentId === 7))
  assert.deepEqual(food.slice(0, 4).map(c => c.name), ['早餐', '午餐', '晚餐', '下午茶'])
  for (const parent of TAXONOMY_PARENTS) {
    const items = sortCategories(TAXONOMY_CHILDREN.filter(c => c.parentId === parent.id))
    if (items.some(c => c.name === '其他')) assert.equal(items.at(-1).name, '其他', parent.name)
  }
  assert.equal(sortCategories(TAXONOMY_PARENTS).at(-1).name, '其他')
  assert.equal(sortCategories(TAXONOMY_INCOME).at(-1).name, '其他')
  assert.equal(sortCategories(TAXONOMY_INCOME)[0].name, '工资')
})

test('已有手动排序优先，自定义分类不会让默认顺序失效', () => {
  const food = TAXONOMY_CHILDREN.filter(c => c.parentId === 7)
  const custom = { id: 70000, parentId: 7, kind: 'expense', name: '自定义', color: '', positionWeight: food.length }
  const initial = sortCategories([...food, custom])
  assert.equal(initial[0].name, '早餐')
  assert.equal(initial.at(-1).name, '其他')
  const manual = initial.map((c, i) => ({ ...c, positionWeight: i }))
  const others = manual.find(c => c.name === '其他')
  others.positionWeight = -1
  assert.equal(sortCategories(manual)[0].name, '其他')
})
