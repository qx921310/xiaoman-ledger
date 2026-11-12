// 多标签页协调：别的标签写入时本标签应重新水合，但本地有未提交改动时不能抢。
// 按项目规矩：每类判定 100 次样本。
import assert from 'node:assert/strict'
import { shouldReload } from '../src/multi-tab'

const SELF = 'self-tab'

function check(name: string, fn: () => void) {
  fn()
  console.log('  ✅ ' + name)
}

console.log('多标签页协调测试')

check('别的标签写入 + 本标签空闲 → 100 次都应重新水合', () => {
  for (let i = 0; i < 100; i++) assert.equal(shouldReload(false, 'other-tab', SELF), true, `第 ${i + 1} 次`)
})

check('本标签自己写入 → 100 次都不应重载（避免自我循环）', () => {
  for (let i = 0; i < 100; i++) assert.equal(shouldReload(false, SELF, SELF), false, `第 ${i + 1} 次`)
})

check('本地有未提交改动 → 100 次都让路（不抢用户正在编辑的数据）', () => {
  for (let i = 0; i < 100; i++) assert.equal(shouldReload(true, 'other-tab', SELF), false, `第 ${i + 1} 次`)
})

check('本地忙 + 自己写入 → 100 次都不重载', () => {
  for (let i = 0; i < 100; i++) assert.equal(shouldReload(true, SELF, SELF), false, `第 ${i + 1} 次`)
})

console.log('多标签页协调测试通过')
