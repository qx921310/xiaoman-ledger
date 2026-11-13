/** 账号与会话（方案 A：httpOnly Cookie，前端读不到令牌） */

export interface User {
  id: number
  email: string
}

let currentUid = 0
export const getCurrentUid = () => currentUid
export const setCurrentUid = (id: number) => { currentUid = id }

/** 网络不可用（fetch 本身失败），区别于「服务端明确说没登录」 */
export class OfflineError extends Error {
  constructor(message = '网络不可用') { super(message); this.name = 'OfflineError' }
}

async function call(path: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch('/api' + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...init
    })
  } catch {
    throw new OfflineError()
  }
  const data = await res.json().catch(() => ({ code: 1, msg: '响应不是 JSON' }))
  if (data.code !== 0) {
    // 服务端明确拒绝（含 401）→ 真正的未登录/无权限
    // errorCode 是服务端稳定错误码（BOOK_CONFLICT 等）；msg 只用于展示
    const err = new Error(data.msg || '操作失败') as Error & { status?: number; errorCode?: string }
    err.status = res.status
    err.errorCode = typeof data.errorCode === 'string' ? data.errorCode : undefined
    throw err
  }
  return data.result
}

export interface BookInfo {
  bookId: string
  name: string
  ownerId: number
  role: 'silent' | 'peer' | 'admin'
  memberNo?: number
  /** 账本图标（一木 icon） */
  icon?: string | null
  /** 一木账本显示开关：1/0 或 true/false，兼容两种返回 */
  showTransfer?: number | boolean | null
  showStock?: number | boolean | null
  hideAllCategory?: number | boolean | null
  hidden?: number | boolean | null
  /** 账本最后更新时间（一木 AccountBook.updateTime，用于并发保护） */
  updatedAt?: number | null
}

export const books = {
  list: () => call('/books'),
  create: (name: string, icon?: string) => call('/books/create', { method: 'POST', body: JSON.stringify({ name, icon }) }),
  /** 账本元数据（图标/显示开关/隐藏）：与一木编辑账本一致 */
  update: (bookId: string, patch: { name?: string; icon?: string; showTransfer?: boolean; showStock?: boolean; hideAllCategory?: boolean; hidden?: boolean; baseUpdatedAt?: number | null; operationId?: string }) =>
    call('/books/update', { method: 'POST', body: JSON.stringify({ bookId, ...patch }) }),
  rename: (bookId: string, name: string) => call('/books/rename', { method: 'POST', body: JSON.stringify({ bookId, name }) }),
  invite: (bookId: string) => call('/books/invite', { method: 'POST', body: JSON.stringify({ bookId }) }),
  join: (code: string) => call('/books/join', { method: 'POST', body: JSON.stringify({ code }) }),
  members: (bookId: string) => call(`/books/members?bookId=${encodeURIComponent(bookId)}`),
  setRole: (bookId: string, userId: number, role: string) =>
    call('/books/role', { method: 'POST', body: JSON.stringify({ bookId, userId, role }) }),
  removeMember: (bookId: string, userId: number) =>
    call('/books/remove-member', { method: 'POST', body: JSON.stringify({ bookId, userId }) }),
  leave: (bookId: string) => call('/books/leave', { method: 'POST', body: JSON.stringify({ bookId }) }),
  remove: (bookId: string) => call('/books/delete', { method: 'POST', body: JSON.stringify({ bookId }) }),
  clear: (bookId: string) => call('/books/clear', { method: 'POST', body: JSON.stringify({ bookId }) })
}

/** 上次成功登录的身份：断网重开时用它把应用打开 */
const LAST_USER_KEY = 'xiaoman-last-user'
export function cacheUser(u: User | null) {
  try {
    if (u) localStorage.setItem(LAST_USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(LAST_USER_KEY)
  } catch { /* 隐私模式下忽略 */ }
}
export function cachedUser(): User | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    if (!raw) return null
    const u = JSON.parse(raw) as User
    return u && typeof u.id === 'number' ? u : null
  } catch { return null }
}

export const auth = {
  /**
   * 取当前登录身份。断网时不能用「未登录」处理——那会让离线用户连本地账本都打不开。
   * 只有服务端明确说没登录才返回 null。
   */
  me: async (): Promise<User | null> => {
    try {
      const r = await call('/auth/me')
      const u = (r?.user ?? null) as User | null
      cacheUser(u)
      return u
    } catch (e) {
      if (e instanceof OfflineError) {
        const cached = cachedUser()
        if (cached) return cached
        return null
      }
      cacheUser(null)
      return null
    }
  },
  login: (email: string, password: string) =>
    call('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    call('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call('/auth/logout', { method: 'POST', body: '{}' })
}

/** 每个账号一份本地数据，互不串 */
const PREFIX = 'xiaoman-data'
const keyFor = (uid: number) => `${PREFIX}:${uid || 'anon'}`

export const userStorage = {
  getItem: (_name: string) => localStorage.getItem(keyFor(currentUid)),
  setItem: (_name: string, value: string) => localStorage.setItem(keyFor(currentUid), value),
  removeItem: (_name: string) => localStorage.removeItem(keyFor(currentUid))
}

/**
 * 首次登录时把「这台机器上未绑定账号的数据」接到当前账号下。
 * 只在**这台机器上还没有任何账号数据**时执行一次（即第一个登录的账号），
 * 避免第二个账号把同一份数据又接一遍。
 */
/** 这个账号在这台机器上是否已有本地数据 */
export function hasUserData(uid: number) {
  return !!localStorage.getItem(keyFor(uid))
}

export function adoptAnonymousData(uid: number) {
  const target = keyFor(uid)
  if (localStorage.getItem(target)) return false

  // 已经有别的账号在这台机器上存过数据 → 不接管
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (/^xiaoman-data:\d+$/.test(k)) return false
  }

  for (const c of ['ledger-data-store', keyFor(0)]) {
    const raw = localStorage.getItem(c)
    if (raw) {
      localStorage.setItem(target, raw)
      localStorage.removeItem(c)   // 源数据只搬一次，避免被下一个账号再搬
      return true
    }
  }
  return false
}
