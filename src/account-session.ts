import { adoptAnonymousData, hasUserData, setCurrentUid } from './auth'
import { useLedger } from './store'

/** Switch storage first, then restore it before making any persistent write. */
export async function loadAccountData(uid: number): Promise<void> {
  setCurrentUid(uid)
  adoptAnonymousData(uid)
  if (!hasUserData(uid)) {
    // A new account must start from a full initial state, not the previous user's
    // partial reset; this write is safe because the target account has no data.
    useLedger.setState(useLedger.getInitialState(), true)
  }
  await useLedger.persist.rehydrate()
  useLedger.setState({ userId: uid, sessionSyncAt: 0 })
}
