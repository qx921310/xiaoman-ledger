import { adoptAnonymousData, setCurrentUid } from './auth'
import { useLedger } from './store'

/** Switch storage first, then restore it before making any persistent write. */
export async function loadAccountData(uid: number): Promise<void> {
  setCurrentUid(uid)
  adoptAnonymousData(uid)
  // 先读出目标账号自己的快照，据此判断哪些「后来新增的字段」它没有
  const rawTarget = localStorage.getItem(`xiaoman-data:${uid || 'anon'}`)
  let persistedKeys = new Set<string>()
  try {
    const parsed = rawTarget ? JSON.parse(rawTarget) as { state?: Record<string, unknown> } : null
    persistedKeys = new Set(Object.keys(parsed?.state ?? {}))
  } catch { persistedKeys = new Set() }

  await useLedger.persist.rehydrate()

  // rehydrate 是浅合并：目标账号快照里没有的键会保留上一个账号的值 → 跨账号串数据。
  // 这里把「目标账号没有持久化的集合字段」显式重置为初始值。
  const initial = useLedger.getInitialState() as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(initial)) {
    if (Array.isArray(value) && !persistedKeys.has(key)) patch[key] = value
  }
  if (Object.keys(patch).length) useLedger.setState(patch as never)
  useLedger.setState({ userId: uid, sessionSyncAt: 0 })
}
