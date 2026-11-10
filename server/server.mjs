import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs'
import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'ledger.db'))
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
`)

// 迁移要在建表之后：新库先建出 records，再按需补 book_id 列
try {
  const cols = db.prepare('PRAGMA table_info(records)').all().map((c) => c.name)
  if (!cols.includes('book_id')) db.exec('ALTER TABLE records ADD COLUMN book_id TEXT')
} catch (e) {
  console.error('[migrate] records.book_id 补列失败:', e.message)
}

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
const roleOf = (bookId, userId) => {
  const m = db.prepare('SELECT role FROM book_members WHERE book_id = ? AND user_id = ?').get(bookId, userId)
  return m ? m.role : null
}
const canWrite = (role) => role === 'peer' || role === 'admin'
const isAdmin = (role) => role === 'admin'
const myBooks = (userId) =>
  db.prepare('SELECT b.book_id AS bookId, b.name, b.owner_id AS ownerId, m.role FROM books b JOIN book_members m ON m.book_id = b.book_id WHERE m.user_id = ?').all(userId)
const bookMembers = (bookId) =>
  db.prepare('SELECT m.user_id AS userId, m.role, u.email FROM book_members m JOIN users u ON u.id = m.user_id WHERE m.book_id = ?').all(bookId)

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
  const userId = Number(req.headers['user-id'] || 1)

  try {
    if (path === '/api/health') return ok(res, { ok: true, service: 'ledger-api', time: Date.now(), writable: Boolean(WRITE_TOKEN) })

    // 任何写请求都要过令牌；未配置令牌时服务端保持只读
    // 账号相关接口例外：注册/登录本身就是写操作，且必须对公网开放
    // 账号与数据接口走会话鉴权，不再需要写令牌
    // 白名单式：走会话鉴权的接口都在这里，新增一组记得加进来
    const isSessionPath = ['/api/auth/', '/api/data/', '/api/books/'].some((p) => path.startsWith(p))
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
      const info = db.prepare('DELETE FROM records WHERE book_id = ?').run(bookId)
      return ok(res, { removed: info.changes })
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
      const get = db.prepare('SELECT updated_at FROM records WHERE user_id = ? AND kind = ? AND rid = ?')
      const put = db.prepare(`INSERT INTO records (user_id, kind, rid, payload, updated_at, deleted)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id, kind, rid) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at, deleted=excluded.deleted`)
      let accepted = 0, skipped = 0, denied = 0
      for (const r of list) {
        if (!r || typeof r.kind !== 'string' || r.id == null) { skipped++; continue }
        const rid = String(r.id)
        const updatedAt = Number(r.updatedAt) || 0
        const bookId = r.payload && r.payload.bookId != null ? String(r.payload.bookId) : null

        // 账本权限：不是成员 → 拒绝；静默 → 拒绝所有写
        if (bookId) {
          const role = roleOf(bookId, user.id)
          if (!role || !canWrite(role)) { denied++; continue }
        }

        const cur = get.get(user.id, r.kind, rid)
        if (cur && cur.updated_at > updatedAt) { skipped++; continue }
        db.prepare(`INSERT INTO records (user_id, kind, rid, payload, updated_at, deleted, book_id)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(user_id, kind, rid) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at,
            deleted=excluded.deleted, book_id=excluded.book_id`)
          .run(user.id, r.kind, rid, JSON.stringify(r.payload ?? null), updatedAt, r.deleted ? 1 : 0, bookId)
        accepted++
      }
      upsertKv(`lastSync:${user.id}`, Date.now())
      return ok(res, { accepted, skipped, denied, at: Date.now() })
    }

    if (path === '/api/data/pull' && req.method === 'GET') {
      const user = currentUser(req)
      if (!user) return fail(res, '请先登录')
      const mine = db.prepare('SELECT book_id FROM book_members WHERE user_id = ?').all(user.id).map((r) => r.book_id)
      const placeholders = mine.length ? `OR r.book_id IN (${mine.map(() => '?').join(',')})` : ''
      const rows = db.prepare(`SELECT r.kind, r.rid, r.payload, r.updated_at, r.deleted, r.user_id
        FROM records r WHERE (r.user_id = ? ${placeholders})`).all(user.id, ...mine)
      const records = rows.map((r) => ({
        kind: r.kind,
        id: r.rid,
        payload: r.payload ? JSON.parse(r.payload) : null,
        updatedAt: r.updated_at,
        deleted: r.deleted === 1,
        ownerId: r.user_id
      }))
      return ok(res, { records, lastSync: getKv(`lastSync:${user.id}`) })
    }

    if (path === '/api/sync/push' && req.method === 'POST') {
      const body = await readBody(req)
      const bills = Array.isArray(body.bills) ? body.bills : []
      const assets = Array.isArray(body.assets) ? body.assets : []
      const tx = db.transaction ? null : null
      for (const b of bills) {
        db.prepare('INSERT INTO bills (bill_id, payload, user_id) VALUES (?,?,?) ON CONFLICT(bill_id) DO UPDATE SET payload=excluded.payload')
          .run(b.billId, JSON.stringify(b), userId)
      }
      for (const a of assets) {
        db.prepare('INSERT INTO assets (asset_id, payload, user_id) VALUES (?,?,?) ON CONFLICT(asset_id) DO UPDATE SET payload=excluded.payload')
          .run(a.assetId, JSON.stringify(a), userId)
      }
      upsertKv(`lastSync:${userId}`, Date.now())
      return ok(res, { bills: bills.length, assets: assets.length, syncedAt: Date.now() })
    }

    if (path === '/api/sync/pull' && req.method === 'GET') {
      if (!currentUser(req)) return fail(res, '请先登录')
      const bills = db.prepare('SELECT payload FROM bills WHERE user_id = ?').all(userId).map((r) => JSON.parse(r.payload))
      const assets = db.prepare('SELECT payload FROM assets WHERE user_id = ?').all(userId).map((r) => JSON.parse(r.payload))
      return ok(res, { bills, assets, lastSync: getKv(`lastSync:${userId}`) })
    }

    // 与原产品同构的写接口（供后续对接）
    if (path === '/api/bill/addOrUpdateBill' && req.method === 'POST') {
      const b = await readBody(req)
      if (!b.billId || typeof b.cost !== 'number') return fail(res, 'bad bill')
      db.prepare('INSERT INTO bills (bill_id, payload, user_id) VALUES (?,?,?) ON CONFLICT(bill_id) DO UPDATE SET payload=excluded.payload')
        .run(b.billId, JSON.stringify(b), userId)
      return ok(res, b)
    }
    if (path === '/api/bill/deleteBill' && req.method === 'POST') {
      const b = await readBody(req)
      db.prepare('DELETE FROM bills WHERE bill_id = ?').run(b.billId)
      return ok(res, { billId: b.billId })
    }
    if (path.startsWith('/api/bill/getAccountBillPage/')) {
      const [, , , u, off] = path.split('/')
      const offset = Number(off || 0)
      const rows = db.prepare('SELECT payload FROM bills WHERE user_id = ? ORDER BY bill_id DESC LIMIT 200 OFFSET ?')
        .all(Number(u || 1), offset).map((r) => JSON.parse(r.payload))
      return ok(res, rows)
    }
    if (path === '/api/asset/addOrUpdateAsset' && req.method === 'POST') {
      const a = await readBody(req)
      db.prepare('INSERT INTO assets (asset_id, payload, user_id) VALUES (?,?,?) ON CONFLICT(asset_id) DO UPDATE SET payload=excluded.payload')
        .run(a.assetId, JSON.stringify(a), userId)
      return ok(res, a)
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
