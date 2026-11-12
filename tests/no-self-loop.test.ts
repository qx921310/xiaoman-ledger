// 真实 store + 真实 syncNow：同步完成后不允许再触发同步（Codex CR 第 1 条）。
// 按规矩放大样本：多次本地改动，观察 1.2 秒内的请求次数。
import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { syncNow } from '../src/sync'
import { startAutoSync, syncNowImmediate, getAutoSyncState, stopAutoSync, __resetForTest } from '../src/sync-auto'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size }
}

let pushCalls = 0
let pullCalls = 0
const realFetch = globalThis.fetch

function installFetch() {
  pushCalls = 0; pullCalls = 0
  ;(globalThis as any).fetch = async (url: string) => {
    if (String(url).includes('/api/data/push')) {
      pushCalls++
      return { status: 200, json: async () => ({ code: 0, result: { accepted: 0, skipped: 0, denied: 0, duplicates: 0, conflicts: 0, authoritative: [], at: Date.now() } }) }
    }
    if (String(url).includes('/api/data/pull')) {
      pullCalls++
      return { status: 200, json: async () => ({ code: 0, result: { records: [], lastSync: 0 } }) }
    }
    return { status: 200, json: async () => ({ code: 0, result: {} }) }
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log('同步自循环检测')
  installFetch()
  const s = useLedger.getState()
  s.addAsset({ assetId: 1, assetName: '现金', assetNumber: 1000, assetType: 1 } as any)

  __resetForTest()
  startAutoSync({ sync: () => syncNow(), debounceMs: 20, pollMs: 0 })

  // 一次真实写入 → 触发一次同步
  useLedger.getState().addBill({ assetId: 1, parentCategoryId: 7, cost: 10 } as any)
  await wait(600)
  const afterFirst = pushCalls
  console.log(`  一次本地写入后：push=${pushCalls} pull=${pullCalls}`)
  assert.equal(afterFirst, 1, `一次写入只应同步一次，实际 ${afterFirst}`)

  // 再等 1.2 秒：如果自循环存在，这里会继续涨
  await wait(1200)
  console.log(`  静置 1.2 秒后：push=${pushCalls} pull=${pullCalls}`)
  assert.equal(pushCalls, afterFirst, '同步完成后不应再自动同步（自循环）')
  assert.equal(getAutoSyncState().lastError, null)

  // 连续 50 次写入 → 合并后仍只允许少量同步（不是 50 次，也不是无限循环）
  for (let i = 0; i < 50; i++) useLedger.getState().addBill({ assetId: 1, parentCategoryId: 7, cost: 1 } as any)
  await wait(600)
  const afterBurst = pushCalls - afterFirst
  console.log(`  连续 50 次写入后：新增 push=${afterBurst}`)
  assert.ok(afterBurst <= 3, `50 次连续写入应合并为少量同步，实际 ${afterBurst}`)

  await wait(1000)
  const stable = pushCalls - afterFirst
  assert.equal(stable, afterBurst, '写入停止后必须彻底安静')

  stopAutoSync()
  __resetForTest()
  globalThis.fetch = realFetch as typeof fetch
  console.log('同步自循环检测通过')
}

main().catch((e) => { console.error(e); process.exit(1) })
