import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, 'data')
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(join(dataDir, 'ledger.db'))
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS bills (bill_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, user_id INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS assets (asset_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, user_id INTEGER NOT NULL);
`)

const PORT = Number(process.env.PORT || 8787)
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
    if (req.method === 'POST' && path.startsWith('/api/')) {
      if (!WRITE_TOKEN || req.headers['x-write-token'] !== WRITE_TOKEN) {
        return send(res, 403, { code: 1, msg: '服务端只读：写接口需要 x-write-token，且必须与 LEDGER_WRITE_TOKEN 一致' })
      }
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
