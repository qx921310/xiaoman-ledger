// 自动同步调度：防抖合并、并发串行、失败退避、状态可见。
// 按项目规矩放样本量：100 次改动 / 100 次并发手动同步。
import assert from 'node:assert/strict'
import { startAutoSync, schedule, syncNowImmediate, getAutoSyncState, stopAutoSync, __resetForTest } from '../src/sync-auto'
import { markDirty } from '../src/domain/dirty-bus'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function scenario(name: string, fn: () => Promise<void>) {
  __resetForTest()
  try {
    await fn()
    console.log('  ✅ ' + name)
  } catch (e) {
    console.log('  ❌ ' + name)
    throw e
  } finally {
    stopAutoSync()
    __resetForTest()
  }
}

async function main() {
  console.log('自动同步调度测试')

  await scenario('100 次连续改动只触发 1 次同步', async () => {
    let calls = 0
    startAutoSync({ sync: async () => { calls++ }, debounceMs: 40, pollMs: 0 })
    for (let i = 0; i < 100; i++) markDirty()
    await wait(150)
    assert.equal(calls, 1, `100 次改动应合并为 1 次，实际 ${calls}`)
    assert.ok(getAutoSyncState().lastOkAt, '成功后应记录时间')
    assert.equal(getAutoSyncState().lastError, null)
  })

  await scenario('同步途中再变脏，结束后补跑一次', async () => {
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    startAutoSync({ sync: async () => { calls++; if (calls === 1) await gate }, debounceMs: 10, pollMs: 0 })
    schedule(0)
    await wait(40)
    assert.equal(calls, 1, '第一次同步已开始')
    schedule(0)
    release()
    await wait(120)
    assert.equal(calls, 2, '完成后必须补跑一次')
  })

  await scenario('失败暴露错误并指数退避重试', async () => {
    let calls = 0
    startAutoSync({ sync: async () => { calls++; throw new Error('网络断了') }, debounceMs: 10, pollMs: 0 })
    schedule(0)
    await wait(80)
    assert.equal(calls, 1)
    assert.equal(getAutoSyncState().lastError, '网络断了', '错误必须可见')
    assert.equal(getAutoSyncState().attempts, 1)
    await wait(6000)
    assert.ok(calls >= 2, `应自动重试，实际 ${calls}`)
  })

  await scenario('100 个并发手动同步只打一次请求', async () => {
    let calls = 0
    startAutoSync({ sync: async () => { calls++; await wait(40) }, debounceMs: 10, pollMs: 0 })
    await Promise.all(Array.from({ length: 100 }, () => syncNowImmediate()))
    assert.equal(calls, 1, `100 次手动同步应合并为 1 次，实际 ${calls}`)
  })

  console.log('自动同步调度测试通过')
}

main().catch((e) => { console.error(e); process.exit(1) })
