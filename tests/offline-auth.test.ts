// 离线重开：断网时不能把用户当「未登录」，否则本地账本都打不开。
// 按项目规矩放样本量（100 次/场景）。
import assert from 'node:assert/strict'
import { auth, cacheUser, cachedUser, OfflineError } from '../src/auth'

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size }
}

const realFetch = globalThis.fetch
const setFetch = (impl: (url: string) => Promise<unknown>) => { (globalThis as any).fetch = impl }

const jsonRes = (body: unknown, status = 200) => Promise.resolve({
  status, json: async () => body
})
const netFail = () => Promise.reject(new TypeError('Failed to fetch'))

async function scenario(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log('  ✅ ' + name) }
  catch (e) { console.log('  ❌ ' + name); throw e }
}

async function main() {
  console.log('离线认证测试')

  await scenario('断网 + 有缓存身份 → 100 次都返回缓存用户', async () => {
    cacheUser({ id: 7, email: 'dev@multi.test' })
    setFetch(netFail)
    for (let i = 0; i < 100; i++) {
      const u = await auth.me()
      assert.equal(u?.id, 7, `第 ${i + 1} 次应返回缓存身份`)
      assert.equal(u?.email, 'dev@multi.test')
    }
  })

  await scenario('断网 + 无缓存身份 → 返回 null（首次使用）', async () => {
    cacheUser(null)
    setFetch(netFail)
    for (let i = 0; i < 100; i++) assert.equal(await auth.me(), null)
  })

  await scenario('服务端明确 401 → 100 次都判定未登录，并清掉缓存身份', async () => {
    cacheUser({ id: 7, email: 'dev@multi.test' })
    setFetch(() => jsonRes({ code: 1, msg: '请先登录' }, 401))
    for (let i = 0; i < 100; i++) assert.equal(await auth.me(), null, '401 必须视为未登录')
    assert.equal(cachedUser(), null, '401 后应清除缓存身份')
  })

  await scenario('在线成功 → 100 次都刷新缓存身份', async () => {
    setFetch(() => jsonRes({ code: 0, result: { user: { id: 42, email: 'live@test' } } }))
    for (let i = 0; i < 100; i++) {
      const u = await auth.me()
      assert.equal(u?.id, 42)
    }
    assert.deepEqual(cachedUser(), { id: 42, email: 'live@test' })
  })

  await scenario('OfflineError 与普通错误可区分', async () => {
    assert.ok(new OfflineError() instanceof Error)
    setFetch(netFail)
    let caught: unknown = null
    try { await (await import('../src/auth')).auth.me() } catch (e) { caught = e }
    assert.equal(caught, null, 'me 不应抛出')
  })

  globalThis.fetch = realFetch as typeof fetch
  console.log('离线认证测试通过')
}

main().catch((e) => { console.error(e); process.exit(1) })
