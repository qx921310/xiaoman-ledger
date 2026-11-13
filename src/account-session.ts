import { adoptAnonymousData, setCurrentUid } from './auth'
import { useLedger } from './store'

/**
 * 切换账号：把状态**整体**换成目标账号自己的快照。
 *
 * 之前用 `persist.rehydrate()` 是错的：它只做浅合并，
 * 目标账号快照里缺少的键会保留上一个账号的值（assetFlows 就是这么串过去的），
 * 而且清空后立刻写回还会污染目标账号的存储。
 *
 * 现在的做法是确定性的：
 *   1. 直接读目标账号的 localStorage 快照；
 *   2. 以「初始状态」为底，用快照逐键覆盖；
 *   3. 剥掉 assets 上的 openingBalance（它是派生结果，可能被别的账号污染过），
 *      交给受控 set 用「快照里的 assetNumber − 该账号自己的流水」重新推期初；
 *   4. 用 replaceAccountState 整替换，一个键都不共享。
 */
export async function loadAccountData(uid: number): Promise<void> {
  setCurrentUid(uid)
  adoptAnonymousData(uid)

  const initial = useLedger.getInitialState() as unknown as Record<string, unknown>
  const snapshot = readSnapshot(uid)
  // 全新账号：整体回到初始状态，连默认币种都不继承
  const merged: Record<string, unknown> = snapshot ? { ...initial, ...snapshot } : { ...initial }

  // openingBalance 是派生缓存：不信任快照里的值，按 assetNumber 重推
  const assets = Array.isArray(merged.assets) ? merged.assets as Array<Record<string, unknown>> : []
  merged.assets = assets.map((a) => {
    const { openingBalance: _drop, ...rest } = a
    return rest
  })

  useLedger.getState().replaceAccountState(merged)
  useLedger.setState({ userId: uid, sessionSyncAt: 0 })
}

function readSnapshot(uid: number): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(`xiaoman-data:${uid || 'anon'}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
    if (!parsed?.state || typeof parsed.state !== 'object') return null
    return parsed.state
  } catch {
    return null
  }
}
