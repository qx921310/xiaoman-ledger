import assert from 'node:assert/strict'
import { useLedger } from '../src/store'
import { syncNow } from '../src/sync'
import { advanceSessionEpoch } from '../src/domain/session-epoch'
import { startAutoSync, stopAutoSync, syncNowImmediate, getAutoSyncState } from '../src/sync-auto'

const map = new Map<string, string>()
// Exercise an already-started request, independently of Node's Web Locks scheduler.
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k), key: (i: number) => [...map.keys()][i] ?? null, get length() { return map.size } }, configurable: true })
const result = (result: unknown) => ({ json: async () => ({ code: 0, result }) }) as Response
async function main() {
  map.set('xiaoman-sync-v2:0', JSON.stringify({ schema: 2, generations: { '1': 0 }, bases: {}, pending: {}, conflicts: {} }))
  let releasePush!: (response: Response) => void
  let seenSignal: AbortSignal | undefined
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => { seenSignal = init?.signal ?? undefined; return new Promise<Response>(resolve => { releasePush = resolve }) }) as typeof fetch
  const pendingPush = syncNow()
  advanceSessionEpoch()
  assert.equal(seenSignal?.aborted, true)
  useLedger.setState({ userId: 999, sessionSyncAt: 123 })
  releasePush(result({ accepted: 0, denied: 0 }))
  await assert.rejects(pendingPush, { name: 'AbortError' })
  assert.equal(useLedger.getState().userId, 999)
  assert.equal(useLedger.getState().sessionSyncAt, 123)

  let releasePull!: (response: Response) => void
  let pulls = 0
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/push')) {
      const records = JSON.parse(String(init?.body ?? '{}')).records ?? []
      return result({ accepted: records.length, skipped: 0, denied: 0, duplicates: 0,
        results: records.map((r: { kind: string; id: string; operationId: string }) => ({ ...r, status: 'accepted', version: 1 })) })
    }
    pulls++
    return new Promise<Response>(resolve => { releasePull = resolve })
  }) as typeof fetch
  const pendingPull = syncNow()
  while (!pulls) await Promise.resolve()
  advanceSessionEpoch()
  useLedger.setState({ userId: 888, sessionSyncAt: 456 })
  releasePull(result({ records: [{ kind: 'asset', id: '991', ownerId: 1, updatedAt: 1, payload: { assetId: 991, assetName: '旧账号不应出现', userId: 1 } }] }))
  await assert.rejects(pendingPull, { name: 'AbortError' })
  assert.equal(useLedger.getState().userId, 888)
  assert.equal(useLedger.getState().sessionSyncAt, 456)
  assert.equal(useLedger.getState().assets.some(a => a.assetId === 991), false)
  let rejectOld!: (error: Error) => void
  startAutoSync({ sync: () => new Promise((_resolve, reject) => { rejectOld = reject }), pollMs: 0 })
  const oldRun = syncNowImmediate()
  stopAutoSync()
  let newCalls = 0
  startAutoSync({ sync: async () => { newCalls++; return { denied: 0, conflicts: 0 } }, pollMs: 0 })
  await syncNowImmediate()
  rejectOld(new Error('旧账号请求失败'))
  await oldRun
  assert.equal(newCalls, 1)
  assert.equal(getAutoSyncState().lastError, null, '旧账号失败不能污染新账号同步状态')
  stopAutoSync()
  console.log('会话切换中止在途推送和拉取：通过')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
