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
  // 这里把「目标账号没有持久化的字段」重置为初始值；全新账号（无快照）整体回到初始状态。
  const initial = useLedger.getInitialState() as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  if (persistedKeys.size === 0) {
    Object.assign(patch, initial)
  } else {
    for (const [key, value] of Object.entries(initial)) {
      if (!persistedKeys.has(key)) patch[key] = value
    }
  }
  // 余额必须是「目标账号自己的资产 + 目标账号自己的流水」重算出来的。
  // rehydrate 阶段可能已经用上一账号的流水写过 openingBalance，这里先剥掉它，
  // 让受控 set 按 assetNumber 反推期初，再按（已清空的）流水算余额。
  // 全新账号（无快照）：整体用初始状态，不保留上一个账号的任何资产
  if (persistedKeys.size > 0) {
    const current = useLedger.getState()
    patch.assets = current.assets.map((a) => {
      const { openingBalance: _drop, ...rest } = a
      return rest
    })
  }
  // 关键：必须走受控 set（会按流水重算余额），否则余额会停在用上一账号流水算出的值
  useLedger.getState().applyAccountScope(patch)
  useLedger.setState({ userId: uid, sessionSyncAt: 0 })
}
