import { books as bookApi } from '../auth'

/**
 * 账本改动的离线补传队列。
 *
 * 之前的实现只在「账本管理页打开时」监听 online，页面一关就再也不会补传；
 * 而且补传时不带 baseUpdatedAt，等于绕过了服务端的并发校验，可能用旧值覆盖新值。
 * 这里把队列独立出来，App 启动、登录后、网络恢复、每次同步成功后都会触发补传。
 */
const KEY = 'xiaoman-book-pending'

export interface PendingBookPatch {
  patch: Record<string, unknown>
  /** 入队时服务端的更新时间，补传时作为并发基准 */
  baseUpdatedAt: number | null
  at: number
  /** 与别的设备冲突，等待用户核对（不会再自动补传） */
  conflict?: boolean
}

type PendingMap = Record<string, PendingBookPatch>

function readAll(): PendingMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    // 兼容旧格式（直接存 patch）
    const out: PendingMap = {}
    for (const [bookId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<PendingBookPatch>
      out[bookId] = v && typeof v === 'object' && 'patch' in v
        ? { patch: (v.patch ?? {}) as Record<string, unknown>, baseUpdatedAt: v.baseUpdatedAt ?? null, at: v.at ?? 0 }
        : { patch: (value ?? {}) as Record<string, unknown>, baseUpdatedAt: null, at: 0 }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(all: PendingMap) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* 存储不可用时放弃补传 */ }
}

/** 记录一次失败的账本保存，等待联网后补传 */
export function queueBookPatch(bookId: string, patch: Record<string, unknown>, baseUpdatedAt: number | null) {
  const all = readAll()
  all[bookId] = {
    patch: { ...(all[bookId]?.patch ?? {}), ...patch },
    baseUpdatedAt: baseUpdatedAt ?? all[bookId]?.baseUpdatedAt ?? null,
    at: Date.now()
  }
  writeAll(all)
}

/** 保存成功后清掉该账本的待补（避免旧值之后覆盖新值） */
export function clearBookPatch(bookId: string) {
  const all = readAll()
  if (!(bookId in all)) return
  delete all[bookId]
  writeAll(all)
}

/**
 * 补传：带 baseUpdatedAt 走服务端并发校验。
 * 若服务端已更新（说明别的设备改过），丢弃本地待补，以服务端为准，不再覆盖。
 */
export async function flushBookPatches(): Promise<{ sent: number; conflicted: number }> {
  let sent = 0
  let conflicted = 0
  // 逐个从存储里取最新队列再处理：补传期间可能有新的修改入队，不能拿旧快照整体写回
  for (const bookId of Object.keys(readAll())) {
    const entry = readAll()[bookId]
    if (!entry || entry.conflict) continue
    try {
      await bookApi.update(bookId, { ...entry.patch, baseUpdatedAt: entry.baseUpdatedAt })
      const latest = readAll()
      delete latest[bookId]
      writeAll(latest)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('其他设备')) {
        // 冲突：保留本地内容并标记，交由用户核对，不能静默丢弃
        const latest = readAll()
        if (latest[bookId]) {
          latest[bookId] = { ...latest[bookId], conflict: true }
          writeAll(latest)
        }
        conflicted++
      }
      // 其他错误（离线/网络）保留，下次再试
    }
  }
  return { sent, conflicted }
}

/** 该账本是否有与其他设备冲突、待用户核对的本地改动 */
export function conflictOf(bookId: string): PendingBookPatch | undefined {
  return readAll()[bookId]?.conflict ? readAll()[bookId] : undefined
}

/** 用户选择「以本地为准」：清掉冲突标记，下次补传仍带旧基准会被再拒，需显式覆盖 */
export async function resolveConflictKeepLocal(bookId: string): Promise<boolean> {
  const all = readAll()
  const entry = all[bookId]
  if (!entry) return false
  try {
    // 覆盖式提交：带服务端最新版本重发一次，明确以本地为准
    const fresh = await bookApi.list()
    const serverBook = (fresh?.books ?? []).find((b: { bookId?: string }) => String(b.bookId) === String(bookId))
    await bookApi.update(bookId, { ...entry.patch, baseUpdatedAt: serverBook?.updatedAt ?? null })
    delete all[bookId]
    writeAll(all)
    return true
  } catch {
    return false
  }
}

/** 用户选择「以服务端为准」：放弃本地待补 */
export function resolveConflictUseServer(bookId: string) {
  const all = readAll()
  delete all[bookId]
  writeAll(all)
}

export function hasPendingBookPatches(): boolean {
  return Object.keys(readAll()).length > 0
}
