import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync, createReadStream, existsSync, statSync, rmSync } from 'node:fs'
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { dirname, join, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'ledger.db'))
// WAL：读写不互相阻塞，单请求延迟明显下降；synchronous=NORMAL 在 WAL 下仍然安全
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS books (
    book_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS book_members (
    book_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'peer',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS book_member_numbers (
    book_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    member_no INTEGER NOT NULL,
    PRIMARY KEY (book_id, user_id),
    UNIQUE (book_id, member_no)
  );
  CREATE TABLE IF NOT EXISTS book_bill_numbers (
    book_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    member_no INTEGER NOT NULL,
    sequence_no INTEGER NOT NULL,
    PRIMARY KEY (book_id, record_id),
    UNIQUE (book_id, member_no, sequence_no)
  );
  CREATE TABLE IF NOT EXISTS files (
    file_id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    book_id TEXT,
    bill_id TEXT,
    name TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bill_periods (
    book_id TEXT NOT NULL,
    period_key TEXT NOT NULL,
    record_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (book_id, period_key)
  );
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    rid TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, kind, rid)
  );
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS bills (bill_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, user_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS assets (asset_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, user_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sync_v2_users (user_id INTEGER PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS sync_v2_books (book_id TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS sync_operations (
    user_id INTEGER NOT NULL, operation_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
    result TEXT NOT NULL, PRIMARY KEY (user_id, operation_id)
  );
`)

// 迁移要在建表之后：新库先建出 records，再按需补 book_id 列
try {
  const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name)
  if (!cols.includes('book_id')) db.exec('ALTER TABLE records ADD COLUMN book_id TEXT')
  if (!cols.includes('revision')) db.exec('ALTER TABLE records ADD COLUMN revision INTEGER NOT NULL DEFAULT 1')
  const bookCols = db.prepare('PRAGMA table_info(books)').all().map((c) => c.name)
  if (!bookCols.includes('generation')) db.exec('ALTER TABLE books ADD COLUMN generation INTEGER NOT NULL DEFAULT 0')
  const operationCols = db.prepare('PRAGMA table_info(sync_operations)').all().map((c) => c.name)
  if (!operationCols.includes('created_at')) {
    db.exec('ALTER TABLE sync_operations ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0')
    db.prepare('UPDATE sync_operations SET created_at = ? WHERE created_at = 0').run(Date.now())
  }
  db.exec('CREATE INDEX IF NOT EXISTS sync_operations_created_at ON sync_operations(created_at)')
} catch (e) {
  console.error('[migrate] 同步数据库迁移失败:', e.message)
  throw e
}

// Expired receipts fall back to revision checks: an ancient retry may require
// manual review, but must never be applied again as a fresh operation.
let lastReceiptCleanup = 0
function cleanupSyncReceipts(now) {
  if (now - lastReceiptCleanup < 60 * 60 * 1000) return
  db.prepare('DELETE FROM sync_operations WHERE created_at < ?').run(now - 30 * 24 * 60 * 60 * 1000)
  lastReceiptCleanup = now
}

// 附件保留 30 天：到期销毁（暂时不承担长期存储成本；将来可改为快照/对象存储）
const UPLOAD_RETAIN_MS = 30 * 24 * 60 * 60 * 1000
let lastUploadCleanup = 0
function cleanupExpiredUploads(now) {
  if (now - lastUploadCleanup < 60 * 60 * 1000) return
  lastUploadCleanup = now
  const cutoff = now - UPLOAD_RETAIN_MS
  const rows = db.prepare('SELECT file_id FROM files WHERE created_at < ?').all(cutoff)
  for (const r of rows) {
    try { rmSync(join(UPLOAD_DIR, r.file_id), { force: true }) } catch { /* 文件已不在，忽略 */ }
  }
  db.prepare('DELETE FROM files WHERE created_at < ?').run(cutoff)
  if (rows.length) console.log(`[uploads] 清理过期附件 ${rows.length} 个`)
}

// 每小时的定时清理：不依赖推送，保证「满 30 天即销毁」这句话成立
setInterval(() => { try { cleanupExpiredUploads(Date.now()) } catch { /* 清理失败不阻塞服务 */ } }, 60 * 60 * 1000).unref?.()

const PORT = Number(process.env.PORT || 8787)

// ---------- 账号与会话 ----------
const SESSION_DAYS = 30
const COOKIE = 'xm_session'

const sha = (v) => createHash('sha256').update(v).digest('hex')

function makePassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function checkPassword(password, salt, hash) {
  const a = scryptSync(password, salt, 64)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function parseCookies(req) {
  const raw = req.headers.cookie || ''
  const out = {}
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function setSessionCookie(res, token, req) {
  const secure = (req.headers['x-forwarded-proto'] || '').includes('https') || req.socket.encrypted
  const bits = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`
  ]
  if (secure) bits.push('Secure')
  res.setHeader('Set-Cookie', bits.join('; '))
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex')
  const now = Date.now()
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha(token), userId, now, now + SESSION_DAYS * 86400 * 1000)
  return token
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE]
  if (!token) return null
  const row = db.prepare('SELECT s.user_id, s.expires_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
    .get(sha(token))
  if (!row) return null
  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
    return null
  }
  return { id: row.user_id, email: row.email }
}

// ---------- 共享账本 ----------
const ROLES = ['silent', 'peer', 'admin']
/** 服务端会往账单里附加编号字段，客户端拿不到；比较业务内容时必须忽略 */
const SERVER_ADDED_FIELDS = ['ownerId', 'memberNo', 'sequenceNo', 'displayId']
function normalizePayload(raw) {
  let obj = raw
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch { return raw }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return JSON.stringify(obj ?? null)
  const out = {}
  for (const k of Object.keys(obj).sort()) {
    if (SERVER_ADDED_FIELDS.includes(k)) continue
    out[k] = obj[k]
  }
  return JSON.stringify(out)
}
function sameBusinessContent(a, b) {
  return normalizePayload(a) === normalizePayload(b)
}

const roleOf = (bookId, userId) => {
  const m = db.prepare('SELECT role FROM book_members WHERE book_id = ? AND user_id = ?').get(bookId, userId)
  return m ? m.role : null
}
const canWrite = (role) => role === 'peer' || role === 'admin'
const isAdmin = (role) => role === 'admin'
function memberNumber(bookId, userId) {
  const existing = db.prepare('SELECT member_no FROM book_member_numbers WHERE book_id = ? AND user_id = ?').get(bookId, userId)
  if (existing) return existing.member_no
  const n = db.prepare('SELECT COALESCE(MAX(member_no),0)+1 AS n FROM book_member_numbers WHERE book_id = ?').get(bookId).n
  db.prepare('INSERT INTO book_member_numbers (book_id,user_id,member_no) VALUES (?,?,?)').run(bookId, userId, n)
  return n
}
// Existing members have no number yet. Preserve owner first, then known join order.
for (const book of db.prepare('SELECT book_id, owner_id FROM books').all()) {
  const members = db.prepare('SELECT user_id FROM book_members WHERE book_id = ? ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, joined_at, user_id').all(book.book_id, book.owner_id)
  for (const m of members) memberNumber(book.book_id, m.user_id)
}
function billNumber(bookId, recordId, userId) {
  const row = db.prepare('SELECT creator_id,member_no,sequence_no FROM book_bill_numbers WHERE book_id = ? AND record_id = ?').get(bookId, recordId)
  if (row) return row
  const memberNo = memberNumber(bookId, userId)
  const sequenceNo = db.prepare('SELECT COALESCE(MAX(sequence_no),0)+1 AS n FROM book_bill_numbers WHERE book_id = ? AND member_no = ?').get(bookId, memberNo).n
  db.prepare('INSERT INTO book_bill_numbers VALUES (?,?,?,?,?)').run(bookId, recordId, userId, memberNo, sequenceNo)
  return { creator_id: userId, member_no: memberNo, sequence_no: sequenceNo }
}
const myBooks = (userId) =>
  db.prepare(`SELECT b.book_id AS bookId, b.name, b.owner_id AS ownerId, m.role, n.member_no AS memberNo,
      (SELECT COUNT(*) FROM book_members x WHERE x.book_id = b.book_id) AS memberCount
    FROM books b JOIN book_members m ON m.book_id = b.book_id
    LEFT JOIN book_member_numbers n ON n.book_id=m.book_id AND n.user_id=m.user_id
    WHERE m.user_id = ?`).all(userId)
const bookMembers = (bookId) =>
  db.prepare('SELECT m.user_id AS userId, m.role, u.email, n.member_no AS memberNo FROM book_members m JOIN users u ON u.id = m.user_id LEFT JOIN book_member_numbers n ON n.book_id=m.book_id AND n.user_id=m.user_id WHERE m.book_id = ? ORDER BY n.member_no').all(bookId)

// 仅依赖服务端已保存的账户或同一请求中可被正常写入的新版本。
function accountForBook(assetId, ownerId, bookId, pending = []) {
  const id = String(assetId)
  const saved = db.prepare('SELECT payload, updated_at, deleted, user_id, book_id FROM records WHERE kind = ? AND rid = ? AND (user_id = ? OR book_id = ?) ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END')
    .all('asset', id, ownerId, bookId, ownerId)
  let row = saved[0]
  const candidates = pending.filter((r) => r?.kind === 'asset' && String(r.id) === id && String(r.payload?.assetId) === id && !r.deleted)
  const candidate = candidates.reduce((best, r) => !best || Number(r.updatedAt || 0) > Number(best.updatedAt || 0) ? r : best, null)
  if (candidate && (!row || (Number(row.user_id) === Number(ownerId) && Number(candidate.updatedAt || 0) > Number(row.updated_at || 0)))) {
    const candidateBook = candidate.bookId || candidate.payload.bookId || null
    const sameScope = !row?.book_id || !candidateBook || String(row.book_id) === String(candidateBook)
    if (sameScope && (!candidateBook || (String(candidateBook) === String(bookId) && canWrite(roleOf(String(bookId), ownerId))))) {
      row = { payload: JSON.stringify(candidate.payload), updated_at: Number(candidate.updatedAt || 0), deleted: 0, user_id: ownerId, book_id: candidateBook }
    }
  }
  if (!row || row.deleted) return null
  try { return { ...JSON.parse(row.payload), scopeBook: row.book_id } } catch { return null }
}

function referencedAccounts(kind, payload) {
  if (!payload || typeof payload !== 'object') return []
  const keys = {
    bill: ['assetId'], transfer: ['fromAssetId', 'toAssetId'], cycle: ['assetId', 'fromAssetId', 'toAssetId', 'reimbursementAssetId'],
    refund: ['assetId'], reimbursement: ['assetId'], lend: ['assetId', 'repaymentAssetId'], billGroup: ['assetList']
  }[kind] ?? []
  return keys.flatMap((key) => Array.isArray(payload[key]) ? payload[key] : [payload[key]])
    .filter((id) => id != null && id !== '' && String(id) !== '0')
}

function isAccountShared(asset, bookId) {
  return Boolean(asset && asset.scopeBook != null && String(asset.scopeBook) === String(bookId))
}

// 只对传输结果脱敏，不改数据库的原始快照或记录版本。
function redactPrivateSnapshot(kind, payload, ownerId, bookId, viewerId) {
  if (!payload || kind !== 'bill' || !bookId || Number(ownerId) === Number(viewerId)) return payload
  const asset = payload.assetId ? accountForBook(payload.assetId, ownerId, bookId) : null
  if (isAccountShared(asset, bookId)) return payload
  const out = { ...payload }
  if (out.billSnapshot && typeof out.billSnapshot === 'object') out.billSnapshot = { ...out.billSnapshot, assetName: '私有账户' }
  if (out.billShareInfo && typeof out.billShareInfo === 'object' && !Array.isArray(out.billShareInfo)) out.billShareInfo = { ...out.billShareInfo, assetName: '私有账户' }
  return out
}

const emailOk = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
// 写接口默认关闭：只有设置了 LEDGER_WRITE_TOKEN 且请求带 x-write-token 才允许写入。
// 记账数据本来只存浏览器本地，服务端只是可选同步点，公开部署不该留匿名写入口。
const WRITE_TOKEN = process.env.LEDGER_WRITE_TOKEN || ''
const DIST = join(here, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

/** 静态资源：命中就发文件，未命中回落 index.html（SPA 路由） */
function serveStatic(url, res) {
  if (!existsSync(DIST)) return false
  let rel = decodeURIComponent(url.pathname)
  if (rel.includes('..')) return false
  let file = join(DIST, rel)
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file) || !statSync(file).isFile()) file = join(DIST, 'index.html')
  if (!existsSync(file)) return false
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
  })
  createReadStream(file).pipe(res)
  return true
}

const send = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Cookie',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  })
  res.end(JSON.stringify(body))
}
const ok = (res, result) => send(res, 200, { code: 0, result })
const fail = (res, msg) => send(res, 200, { code: 1, msg })

const readBody = (req) => new Promise((resolve) => {
  let buf = ''
  req.on('data', (c) => { buf += c; if (buf.length > 5e7) req.destroy() })
  req.on('end', () => {
    try { resolve(JSON.parse(buf || '{}')) } catch { resolve({}) }
  })
})

const UPLOAD_DIR = join(dataDir, 'uploads')
mkdirSync(UPLOAD_DIR, { recursive: true })

/** 二进制请求体（附件上传用），带体积上限 */
const readRaw = (req, maxBytes = 8 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  req.on('data', (c) => {
    size += c.length
    if (size > maxBytes) { req.destroy(); reject(new Error('文件过大（上限 8MB）')); return }
    chunks.push(c)
  })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})

const upsertKv = (k, v) => {
  db.prepare('INSERT INTO kv (k, v, updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at')
    .run(k, JSON.stringify(v), Date.now())
}
const getKv = (k) => {
  const row = db.prepare('SELECT v FROM kv WHERE k = ?').get(k)
  return row ? JSON.parse(row.v) : null
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname

  try {
    if (path === '/api/health') return ok(res, { ok: true, service: 'ledger-api', time: Date.now(), writable: Boolean(WRITE_TOKEN) })

    // 任何写请求都要过令牌；未配置令牌时服务端保持只读
    // 账号相关接口例外：注册/登录本身就是写操作，且必须对公网开放
    // 账号与数据接口走会话鉴权，不再需要写令牌
    // 白名单式：走会话鉴权的接口都在这里，新增一组记得加进来
    const isSessionPath = ['/api/auth/', '/api/data/', '/api/books/', '/api/files', '/api/ocr'].some((p) => path.startsWith(p))
    if (req.method === 'POST' && path.startsWith('/api/') && !isSessionPath) {
      if (!WRITE_TOKEN || req.headers['x-write-token'] !== WRITE_TOKEN) {
        return send(res, 403, { code: 1, msg: '服务端只读：写接口需要 x-write-token，且必须与 LEDGER_WRITE_TOKEN 一致' })
      }
    }

    // ---------- 账号 ----------
    if (path === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!emailOk(email)) return fail(res, '邮箱格式不对')
      if (password.length < 8) return fail(res, '密码至少 8 位')
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return fail(res, '这个邮箱已经注册过了')
      const { salt, hash } = makePassword(password)
      const info = db.prepare('INSERT INTO users (email, salt, hash, created_at) VALUES (?,?,?,?)')
        .run(email, salt, hash, Date.now())
      const token = createSession(Number(info.lastInsertRowid))
      setSessionCookie(res, token, req)
      return ok(res, { user: { id: Number(info.lastInsertRowid), email } })
    }

    if (path === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req)
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (!row || !checkPassword(password, row.salt, row.hash)) return fail(res, '邮箱或密码不对')
      const token = createSession(row.id)
      setSessionCookie(res, token, req)
      return ok(res, { user: { id: row.id, email: row.email } })
    }

    if (path === '/api/auth/logout' && req.method === 'POST') {
      const token = parseCookies(req)[COOKIE]
      if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
      clearSessionCookie(res)
      return ok(res, { ok: true })
    }

    if (path === '/api/auth/me' && req.method === 'GET') {
      const user = currentUser(req)
      return ok(res, { user })
    }

    // ---------- 共享账本 ----------
    if (path === '/api/books' && req.method === 'GET') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const books = myBooks(user.id)
      // 顺带保证：每个账号至少有一个「我的账本」
      if (!books.length) {
        const bookId = 'b' + Date.now().toString(36)
        db.prepare('INSERT INTO books (book_id, name, owner_id, created_at) VALUES (?,?,?,?)')
          .run(bookId, '我的账本', user.id, Date.now())
        db.prepare('INSERT INTO book_members (book_id, user_id, role, joined_at) VALUES (?,?,?,?)')
          .run(bookId, user.id, 'admin', Date.now())
        memberNumber(bookId, user.id)
        return ok(res, { books: myBooks(user.id) })
      }
      return ok(res, { books })
    }

    if (path === '/api/books/create' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const body = await readBody(req)
      const name = String(body.name || '').trim() || '新账本'
      const bookId = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
      db.prepare('INSERT INTO books (book_id, name, owner_id, created_at) VALUES (?,?,?,?)')
        .run(bookId, name, user.id, Date.now())
      db.prepare('INSERT INTO book_members (book_id, user_id, role, joined_at) VALUES (?,?,?,?)')
        .run(bookId, user.id, 'admin', Date.now())
      memberNumber(bookId, user.id)
      return ok(res, { bookId, books: myBooks(user.id) })
    }

    if (path === '/api/books/rename' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId, name } = await readBody(req)
      if (!isAdmin(roleOf(bookId, user.id))) return fail(res, '只有「管理」可以重命名账本')
      db.prepare('UPDATE books SET name = ? WHERE book_id = ?').run(String(name || '').trim() || '未命名', bookId)
      return ok(res, { books: myBooks(user.id) })
    }

    if (path === '/api/books/invite' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId } = await readBody(req)
      if (!isAdmin(roleOf(bookId, user.id))) return fail(res, '只有「管理」可以邀请成员')
      const count = db.prepare('SELECT COUNT(*) AS n FROM book_members WHERE book_id = ?').get(bookId).n
      if (count >= 6) return fail(res, '一个账本最多 6 人')
      const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
      const now = Date.now()
      db.prepare('DELETE FROM invites WHERE book_id = ?').run(bookId)
      db.prepare('INSERT INTO invites (code, book_id, created_by, expires_at) VALUES (?,?,?,?)')
        .run(code, bookId, user.id, now + 24 * 3600 * 1000)
      return ok(res, { code, expiresAt: now + 24 * 3600 * 1000 })
    }

    if (path === '/api/books/join' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { code } = await readBody(req)
      const inv = db.prepare('SELECT * FROM invites WHERE code = ?').get(String(code || '').trim().toUpperCase())
      if (!inv) return fail(res, '邀请码不存在')
      if (inv.expires_at < Date.now()) return fail(res, '邀请码已过期')
      const exists = roleOf(inv.book_id, user.id)
      if (exists) return ok(res, { bookId: inv.book_id, already: true, books: myBooks(user.id) })
      const count = db.prepare('SELECT COUNT(*) AS n FROM book_members WHERE book_id = ?').get(inv.book_id).n
      if (count >= 6) return fail(res, '这个账本已经满 6 人')
      db.prepare('INSERT INTO book_members (book_id, user_id, role, joined_at) VALUES (?,?,?,?)')
        .run(inv.book_id, user.id, 'silent', Date.now())
      memberNumber(inv.book_id, user.id)
      return ok(res, { bookId: inv.book_id, books: myBooks(user.id) })
    }

    if (path === '/api/books/members' && req.method === 'GET') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const bookId = new URL(req.url, 'http://x').searchParams.get('bookId')
      if (!roleOf(bookId, user.id)) return fail(res, '不在这个账本里')
      return ok(res, { members: bookMembers(bookId) })
    }

    if (path === '/api/books/role' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId, userId, role } = await readBody(req)
      if (!isAdmin(roleOf(bookId, user.id))) return fail(res, '只有「管理」可以改权限')
      if (!ROLES.includes(role)) return fail(res, '角色不合法')
      const book = db.prepare('SELECT owner_id FROM books WHERE book_id = ?').get(bookId)
      if (book && book.owner_id === Number(userId)) return fail(res, '不能修改创建者权限')
      db.prepare('UPDATE book_members SET role = ? WHERE book_id = ? AND user_id = ?').run(role, bookId, userId)
      return ok(res, { members: bookMembers(bookId) })
    }

    if (path === '/api/books/remove-member' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId, userId } = await readBody(req)
      if (!isAdmin(roleOf(bookId, user.id))) return fail(res, '只有「管理」可以移除成员')
      const book = db.prepare('SELECT owner_id FROM books WHERE book_id = ?').get(bookId)
      if (book && book.owner_id === Number(userId)) return fail(res, '不能移除创建者')
      db.prepare('DELETE FROM book_members WHERE book_id = ? AND user_id = ?').run(bookId, userId)
      return ok(res, { members: bookMembers(bookId) })
    }

    if (path === '/api/books/delete' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId } = await readBody(req)
      const book = db.prepare('SELECT owner_id FROM books WHERE book_id = ?').get(bookId)
      if (!book) return fail(res, '账本不存在')
      if (book.owner_id !== user.id) return fail(res, '只有创建者可以删除账本')
      db.prepare('DELETE FROM records WHERE book_id = ?').run(bookId)
      db.prepare('DELETE FROM invites WHERE book_id = ?').run(bookId)
      db.prepare('DELETE FROM book_members WHERE book_id = ?').run(bookId)
      db.prepare('DELETE FROM books WHERE book_id = ?').run(bookId)
      return ok(res, { books: myBooks(user.id) })
    }

    if (path === '/api/books/clear' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId } = await readBody(req)
      if (!isAdmin(roleOf(bookId, user.id))) return fail(res, '只有「管理」可以清空账本数据')
      // 关键：不能物理删除。离线设备会拿着旧记录重推，物理删掉会被"复活"。
      // 改成写墓碑（deleted=1, updated_at=now），旧数据推上来时因版本更旧被跳过。
      const now = Date.now()
      db.exec('BEGIN IMMEDIATE')
      try {
        const info = db.prepare(`UPDATE records SET payload = 'null', deleted = 1, updated_at = ?, revision = revision + 1
          WHERE book_id = ? AND deleted = 0 AND kind NOT IN ('book', 'asset')`).run(now, bookId)
        db.prepare('UPDATE books SET generation = generation + 1 WHERE book_id = ?').run(bookId)
        db.prepare('DELETE FROM bill_periods WHERE book_id = ?').run(bookId)
        const generation = db.prepare('SELECT generation FROM books WHERE book_id = ?').get(bookId).generation
        db.exec('COMMIT')
        return ok(res, { removed: info.changes, tombstoned: true, generation, at: now })
      } catch (e) { db.exec('ROLLBACK'); throw e }
    }

    if (path === '/api/books/leave' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const { bookId } = await readBody(req)
      const book = db.prepare('SELECT owner_id FROM books WHERE book_id = ?').get(bookId)
      if (book && book.owner_id === user.id) return fail(res, '创建者不能退出，只能删除账本')
      db.prepare('DELETE FROM book_members WHERE book_id = ? AND user_id = ?').run(bookId, user.id)
      return ok(res, { books: myBooks(user.id) })
    }

    // ---------- 数据同步（需要登录） ----------
    if (path === '/api/data/push' && req.method === 'POST') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const body = await readBody(req)
      const list = Array.isArray(body.records) ? body.records : []
      const v2 = body.protocolVersion === 2
      if (v2) cleanupSyncReceipts(Date.now())
      cleanupExpiredUploads(Date.now())
      if (!v2 && db.prepare('SELECT 1 FROM sync_v2_users WHERE user_id = ?').get(user.id)) {
        return fail(res, '同步协议已升级，请更新客户端；本地未同步数据会保留', 409)
      }
      let accepted = 0, skipped = 0, denied = 0, duplicates = 0, conflicts = 0
      // 逐条权威结果：客户端据此作废本地候选，而不是靠排序猜
      const authoritative = []
      const conflicted = []
      const results = []
      db.exec('BEGIN IMMEDIATE')
      try {
      if (v2) {
        db.prepare('INSERT OR IGNORE INTO sync_v2_users(user_id) VALUES (?)').run(user.id)
        db.prepare('INSERT OR IGNORE INTO sync_v2_books(book_id) SELECT book_id FROM book_members WHERE user_id = ?').run(user.id)
      }
      // Resolve account references only after same-batch account operations have actually succeeded.
      const ordered = v2 ? [...list].sort((a, b) => Number(b?.kind === 'asset') - Number(a?.kind === 'asset')) : list
      for (const r of ordered) {
        if (!r || typeof r.kind !== 'string' || r.id == null) { skipped++; continue }
        const rid = String(r.id)
        const reject = (status) => {
          denied++
          if (v2) results.push({ kind: r.kind, id: rid, operationId: r.operationId, status })
        }
        const updatedAt = Number(r.updatedAt) || 0

        // 1) 定位这条记录所属账本：优先用提交内容，墓碑则从服务端已有记录反查
        let bookId = r.bookId || (r.payload && r.payload.bookId != null ? String(r.payload.bookId) : null)
        const existing = db.prepare(`SELECT user_id, book_id, updated_at, deleted, payload, revision FROM records
          WHERE kind = ? AND rid = ? AND (user_id = ? OR book_id IN (
            SELECT book_id FROM book_members WHERE user_id = ?))`)
          .all(r.kind, rid, user.id, user.id)
        if (!bookId && existing.length) bookId = existing[0].book_id || null
        if (v2 && !bookId && ['bill', 'transfer', 'lend', 'refund', 'reimbursement', 'cycle',
          'splitGroup', 'splitMember', 'splitExpense', 'template', 'homeLoan', 'instalment',
          'stockAsset', 'stockInfo', 'billGroup', 'billRelated', 'fixedDeposit'].includes(r.kind)) { reject('book-required'); continue }
        if (existing.some(e => e.book_id && bookId && e.book_id !== String(bookId))) { reject('scope-conflict'); continue }
        // 记录存在于别人的账本里、而我不是成员 → 直接拒绝，避免写出一条无意义的私有墓碑
        if (!bookId && existing.some((e) => e.user_id !== user.id && e.book_id)) { reject('permission-denied'); continue }

        // 2) 权限：账本内必须可写；删除/改写他人记录要求 admin
        if (bookId) {
          const role = roleOf(bookId, user.id)
          if (!role) { reject('permission-denied'); continue }
          if (!canWrite(role)) { reject('permission-denied'); continue }
          if (!v2 && (db.prepare('SELECT 1 FROM sync_v2_books WHERE book_id = ?').get(bookId) || db.prepare('SELECT 1 FROM book_members m JOIN sync_v2_users u ON u.user_id = m.user_id WHERE m.book_id = ?').get(bookId))) { reject('protocol-upgrade-required'); continue }
          const others = existing.filter((e) => e.book_id === bookId && e.user_id !== user.id)
          if (others.length && !isAdmin(role)) { reject('permission-denied'); continue }
          const multiMember = db.prepare('SELECT COUNT(*) AS n FROM book_members WHERE book_id = ?').get(bookId).n > 1
          if (multiMember && !r.deleted && r.payload) {
            // 若账户不明，宁可拒绝并提示核对，也不能把私有账户快照发给其他成员。
            const refs = referencedAccounts(r.kind, r.payload)
            if (refs.some((id) => !isAccountShared(accountForBook(id, user.id, bookId, v2 ? [] : list), bookId))) { reject('account-not-shared'); continue }
          }
          // 非所有者拿到的是脱敏快照，不能把该快照写回覆盖原始历史记录。
          if (!r.deleted && r.kind === 'bill' && existing.some((e) => e.book_id === bookId && Number(e.user_id) !== Number(user.id))) {
            const old = db.prepare('SELECT payload,user_id FROM records WHERE kind = ? AND rid = ? AND book_id = ? LIMIT 1').get(r.kind, rid, bookId)
            let previous = null
            try { previous = old && JSON.parse(old.payload) } catch { /* 未能确认隐私时拒绝 */ }
            if (!previous || !isAccountShared(accountForBook(previous.assetId, old.user_id, bookId), bookId)) { reject('private-history'); continue }
          }
        }

        // 3) 版本比较（同一身份下）
        // An asset is owned by the account even when it is newly shared with a
        // book. Its previous private revision remains the CAS baseline.
        const mine = existing.find((e) => (e.book_id || null) === bookId) ??
          (r.kind === 'asset' ? existing.find((e) => e.user_id === user.id && !e.book_id) : undefined)
        if (v2) {
          if (typeof r.operationId !== 'string' || r.operationId.length < 8 || r.operationId.length > 128 || !Number.isSafeInteger(r.baseVersion) || r.baseVersion < 0) {
            denied++; results.push({ kind: r.kind, id: rid, operationId: r.operationId, status: 'invalid-operation' }); continue
          }
          const fingerprint = sha(JSON.stringify(r))
          const prior = db.prepare('SELECT fingerprint, result FROM sync_operations WHERE user_id = ? AND operation_id = ?').get(user.id, r.operationId)
          if (prior) {
            if (prior.fingerprint !== fingerprint) { denied++; results.push({ kind: r.kind, id: rid, operationId: r.operationId, status: 'operation-id-reused' }); continue }
            results.push(JSON.parse(prior.result)); skipped++; continue
          }
          if (bookId) {
            const generation = db.prepare('SELECT generation FROM books WHERE book_id = ?').get(bookId)?.generation
            if (!Number.isSafeInteger(r.generation) || r.generation !== generation) {
              conflicts++; results.push({ kind: r.kind, id: rid, operationId: r.operationId, status: 'stale-generation', generation }); continue
            }
          }
          const version = mine?.revision ?? 0
          if (r.baseVersion !== version) {
            conflicts++; results.push({ kind: r.kind, id: rid, operationId: r.operationId, status: 'version-conflict', version }); continue
          }
        }
        if (!v2 && mine && (mine.updated_at > updatedAt || (mine.updated_at === updatedAt && mine.deleted && !r.deleted))) { skipped++; continue }
        // 同一时间戳但内容不同：两台设备时钟相同时会互相覆盖，静默丢一方。
        // 策略：保留服务端已有版本，把对方内容作为冲突回执返回，客户端标待核对。
        if (!v2 && mine && mine.updated_at === updatedAt && !r.deleted && !mine.deleted) {
          const samePayload = sameBusinessContent(mine.payload, r.payload)
          if (!samePayload) {
            conflicts++
            conflicted.push({ kind: r.kind, id: rid, reason: 'equal-timestamp', serverUpdatedAt: mine.updated_at })
            continue
          }
        }

        let payload = r.payload ?? null
        // 周期账单：同一账本同一期只允许落地一条（服务端权威期号）
        if (r.kind === 'bill' && !r.deleted && bookId && r.periodKey) {
          const held = db.prepare('SELECT record_id FROM bill_periods WHERE book_id = ? AND period_key = ?')
            .get(bookId, String(r.periodKey))
          if (held && held.record_id !== rid) {
            duplicates++
            authoritative.push({ kind: 'bill', id: rid, periodKey: String(r.periodKey), winnerId: held.record_id, reason: 'duplicate-period' })
            if (v2) results.push({ kind: r.kind, id: rid, operationId: r.operationId, status: 'duplicate-period', winnerId: held.record_id })
            continue
          }
        }
        if (r.kind === 'bill' && !r.deleted && bookId && payload) {
          if (payload.syncId && payload.syncId !== rid) { reject('invalid-identity'); continue }
          const number = billNumber(bookId, rid, mine?.user_id ?? user.id)
          payload = { ...payload, ownerId: number.creator_id, memberNo: number.member_no,
            sequenceNo: number.sequence_no, displayId: number.member_no + '-' + String(number.sequence_no).padStart(4, '0') }
        }
        db.prepare(`INSERT INTO records (user_id, kind, rid, payload, updated_at, deleted, book_id, revision)
          VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(user_id, kind, rid) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at,
            deleted=excluded.deleted, book_id=excluded.book_id, revision=excluded.revision`)
          .run(mine?.user_id ?? user.id, r.kind, rid, JSON.stringify(payload), updatedAt, r.deleted ? 1 : 0, bookId, (mine?.revision ?? 0) + 1)
        if (r.kind === 'bill' && !r.deleted && bookId && r.periodKey) {
          db.prepare(`INSERT INTO bill_periods (book_id, period_key, record_id, user_id, created_at)
            VALUES (?,?,?,?,?) ON CONFLICT(book_id, period_key) DO NOTHING`)
            .run(bookId, String(r.periodKey), rid, user.id, Date.now())
        }
        accepted++
        if (v2) {
          const receipt = { kind: r.kind, id: rid, operationId: r.operationId, status: 'accepted', version: (mine?.revision ?? 0) + 1 }
          db.prepare('INSERT INTO sync_operations(user_id, operation_id, fingerprint, result, created_at) VALUES (?,?,?,?,?)')
            .run(user.id, r.operationId, sha(JSON.stringify(r)), JSON.stringify(receipt), Date.now())
          results.push(receipt)
        }
      }
      if (v2 && (denied || conflicts || duplicates)) {
        db.exec('ROLLBACK')
        return ok(res, { accepted: 0, skipped, denied, duplicates, conflicts, authoritative, conflicted,
          results: results.map(result => result.status === 'accepted' ? { ...result, status: 'batch-aborted', version: undefined } : result), at: Date.now() })
      }
      upsertKv(`lastSync:${user.id}`, Date.now())
      db.exec('COMMIT')
      } catch (e) { db.exec('ROLLBACK'); throw e }
      return ok(res, { accepted, skipped, denied, duplicates, conflicts, authoritative, conflicted, results, at: Date.now() })
    }

    if (path === '/api/data/pull' && req.method === 'GET') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const mine = db.prepare('SELECT book_id FROM book_members WHERE user_id = ?').all(user.id).map((r) => r.book_id)
      const placeholders = mine.length ? `OR r.book_id IN (${mine.map(() => '?').join(',')})` : ''
      // 带上记录作用域：客户端靠 bookId/ownerId 判断「同一条记录」，墓碑也需要
      const rows = db.prepare(`SELECT r.kind, r.rid, r.payload, r.updated_at, r.deleted, r.user_id, r.book_id, r.revision
        FROM records r WHERE (r.user_id = ? ${placeholders})`).all(user.id, ...mine)
      const records = rows.map((r) => ({
        kind: r.kind,
        id: r.rid,
        payload: r.payload ? redactPrivateSnapshot(r.kind, JSON.parse(r.payload), r.user_id, r.book_id, user.id) : null,
        updatedAt: r.updated_at,
        deleted: r.deleted === 1,
        version: r.revision,
        ownerId: r.user_id,
        bookId: r.book_id ?? undefined
      }))
      const generations = db.prepare('SELECT b.book_id AS bookId, b.generation FROM books b JOIN book_members m ON m.book_id = b.book_id WHERE m.user_id = ?').all(user.id)
      return ok(res, { records, generations, lastSync: getKv(`lastSync:${user.id}`) })
    }

    // 旧版 REST/sync 接口已移除：客户端只用 /api/data/*、/api/auth/*、/api/books/*
    // 这些接口曾用请求头 user-id 识别用户，无法安全鉴权，保留即是越权入口。

    // 行情：转发腾讯行情接口（与满满 market 服务同一数据源），返回最新价
    if (path === '/api/quote' && req.method === 'GET') {
      const u = currentUser(req)
      if (!u) return fail(res, '请先登录', 401)
      const code = String(url.searchParams.get('code') || '').trim()
      if (!/^[a-zA-Z0-9.]{2,20}$/.test(code)) return fail(res, '代码格式不对')
      try {
        const r = await fetch(`https://qt.gtimg.cn/q=${encodeURIComponent(code)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.qq.com/' }
        })
        const text = await r.text()
        // 形如 v_sh600519="1~贵州茅台~600519~1680.00~..."
        const m = text.match(/="([^"]+)"/)
        if (!m) return fail(res, '行情源没有返回该代码')
        const parts = m[1].split('~')
        const price = Number(parts[3])
        if (!Number.isFinite(price) || price <= 0) return fail(res, '行情源没有有效价格')
        return ok(res, { code, name: parts[1], price })
      } catch (e) {
        return fail(res, '行情获取失败：' + (e?.message || '网络错误'))
      }
    }

    // 截图识别：调用网关 vision 模型，返回结构化账单字段
    if (path === '/api/ocr' && req.method === 'POST') {
      const u = currentUser(req)
      if (!u) return fail(res, '请先登录', 401)
      const visionUrl = process.env.LEDGER_VISION_URL
      const visionKey = process.env.LEDGER_VISION_KEY
      const visionModel = process.env.LEDGER_VISION_MODEL || 'deepseek-v4-flash-vision-exp'
      if (!visionUrl || !visionKey) return fail(res, '服务端未配置识别服务（LEDGER_VISION_KEY）')
      const body = await readBody(req)
      const image = String(body.image || '')
      if (!image.startsWith('data:image/')) return fail(res, '请上传图片')
      const prompt = [
        '你是记账助手。请从这张账单/支付截图里提取信息，只输出 JSON，不要解释。',
        '字段：date(YYYY-MM-DD，识别不到就给今天)、amount(数字，正数)、direction(支出/收入)、',
        'category(尽量用：食品餐饮/交通出行/购物消费/居家生活/休闲娱乐/医疗健康/教育文化 之一)、',
        'remark(商户或商品，简短)、payment(支付方式，如 微信/支付宝/银行卡)。',
        '示例：{"date":"2026-06-01","amount":25.5,"direction":"支出","category":"食品餐饮","remark":"兰州拉面","payment":"微信"}'
      ].join('')
      try {
        const r = await fetch(`${visionUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${visionKey}` },
          body: JSON.stringify({
            model: visionModel,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image } }
              ]
            }],
            temperature: 0
          })
        })
        const data = await r.json()
        if (!r.ok) return fail(res, data?.error?.message || '识别服务返回错误')
        const text = data?.choices?.[0]?.message?.content ?? ''
        const m = String(text).match(/\{[\s\S]*\}/)
        if (!m) return fail(res, '没能从图片里识别出账单')
        const parsed = JSON.parse(m[0])
        return ok(res, {
          date: parsed.date || new Date().toISOString().slice(0, 10),
          amount: Number(parsed.amount) || 0,
          direction: parsed.direction === '收入' ? 'income' : 'expense',
          category: parsed.category || '其他',
          remark: parsed.remark || '',
          payment: parsed.payment || ''
        })
      } catch (e) {
        return fail(res, '识别失败：' + (e?.message || '网络错误'))
      }
    }

    // 附件上传：鉴权后写入 server/data/uploads，返回可访问路径
    if (path === '/api/files' && req.method === 'POST') {
      const u = currentUser(req)
      if (!u) return fail(res, '请先登录', 401)
      const raw = String(url.searchParams.get('name') || 'file')
      const ext = (raw.includes('.') ? raw.split('.').pop() : '').toLowerCase()
      if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'].includes(ext)) return fail(res, '只支持图片或 PDF')
      const buf = await readRaw(req)
      if (!buf.length) return fail(res, '空文件')
      // 30 天后自动销毁，前端会提示用户
      const file = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      writeFileSync(join(UPLOAD_DIR, file), buf)
      // 记录归属：只有本人或该账本成员可以访问
      const bookId = url.searchParams.get('bookId') || null
      const billId = url.searchParams.get('billId') || null
      if (bookId && !roleOf(bookId, u.id)) {
        return fail(res, '没有该账本的写入权限')
      }
      db.prepare('INSERT INTO files (file_id, owner_id, book_id, bill_id, name, created_at) VALUES (?,?,?,?,?,?)')
        .run(file, u.id, bookId, billId, raw, Date.now())
      return ok(res, { url: `/uploads/${file}`, name: raw })
    }

    // 附件访问：必须登录，避免附件被公开抓取
    if (path.startsWith('/uploads/')) {
      // 附件用标准状态码，浏览器才能正确识别未授权/不存在
      if (!currentUser(req)) return send(res, 401, { code: 1, msg: '请先登录' })
      const file = basename(decodeURIComponent(path.slice('/uploads/'.length)))
      const full = join(UPLOAD_DIR, file)
      if (!existsSync(full)) return send(res, 404, { code: 1, msg: '文件不存在' })
      const u = currentUser(req)
      const meta2 = db.prepare('SELECT owner_id, book_id FROM files WHERE file_id = ?').get(file)
      const allowed = meta2
        ? Number(meta2.owner_id) === u.id || (meta2.book_id && Boolean(roleOf(meta2.book_id, u.id)))
        : false
      if (!allowed) return send(res, 403, { code: 1, msg: '无权访问该附件' })
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream', 'Cache-Control': 'private,max-age=86400' })
      createReadStream(full).pipe(res)
      return
    }

    if (path.startsWith('/api/')) return fail(res, 'not found: ' + path)
    if (serveStatic(url, res)) return
    return send(res, 404, { code: 1, msg: 'not found' })
  } catch (e) {
    return fail(res, String(e && e.message || e))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ledger-api listening on http://127.0.0.1:${PORT}`)
})
