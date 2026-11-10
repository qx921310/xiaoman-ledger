/** 账号与会话（方案 A：httpOnly Cookie，前端读不到令牌） */

export interface User {
  id: number
  email: string
}

let currentUid = 0
export const getCurrentUid = () => currentUid
export const setCurrentUid = (id: number) => { currentUid = id }

async function call(path: string, init?: RequestInit) {
  const res = await fetch('/api' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  const data = await res.json().catch(() => ({ code: 1, msg: '响应不是 JSON' }))
  if (data.code !== 0) throw new Error(data.msg || '请求失败')
  return data.result
}

export interface BookInfo {
  bookId: string
  name: string
  ownerId: number
  role: 'silent' | 'peer' | 'admin'
  memberNo?: number
}

export const books = {
  list: () => call('/books'),
  create: (name: string) => call('/books/create', { method: 'POST', body: JSON.stringify({ name }) }),
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

export const auth = {
  me: async (): Promise<User | null> => {
    try {
      const r = await call('/auth/me')
      return r?.user ?? null
    } catch {
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
