// 并发压测：4 组场景 × 每组 100 并发 × 重复 3 轮，输出统计分布与跨轮聚合。
// A 不同记录并发新增（不许丢）  B 并发改同一条（收敛到最大时间戳）
// C 抢同一周期号（只能落一条）  D 同时间戳不同内容（冲突必须可见）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

const N = 100
const ROUNDS = 3

const q = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const stats = (arr) => ({
  n: arr.length,
  min: Math.round(Math.min(...arr)),
  p50: Math.round(q(arr, 50)),
  p95: Math.round(q(arr, 95)),
  p99: Math.round(q(arr, 99)),
  max: Math.round(Math.max(...arr)),
  avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
})

test(`并发压测：4 组 × ${N} 并发 × ${ROUNDS} 轮`, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-conc-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((r, j) => probe.close((e) => e ? j(e) : r()))
  const child = spawn(process.execPath, [join(temp, 'server', 'server.mjs')], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    await Promise.race([once(child.stdout, 'data'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('startup timeout')), 10000).unref())])
    const base = `http://127.0.0.1:${port}`
    const req = async (path, data, cookie) => {
      const t0 = performance.now()
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
        body: data === undefined ? undefined : JSON.stringify(data)
      })
      const body = await res.json()
      return { body, ms: performance.now() - t0, ok: res.ok, cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }
    const reg = await req('/api/auth/register', { email: 'conc@multi.test', password: 'conc-pass-123' })
    assert.equal(reg.body.code, 0, '注册成功: ' + JSON.stringify(reg.body))
    const dev = reg.cookie
    const books = await req('/api/books', undefined, dev)
    assert.ok(books.body.result?.books?.length, '账本列表: ' + JSON.stringify(books.body))
    const bookId = books.body.result.books[0].bookId
    const push = (records) => req('/api/data/push', { records }, dev)

    const allLat = { A: [], B: [], C: [], D: [] }
    const rounds = []

    for (let r = 0; r < ROUNDS; r++) {
      const now = Date.now() + r * 1_000_000
      const row = { round: r + 1 }

      // A
      const tA = Date.now()
      const A = await Promise.all(Array.from({ length: N }, (_, i) =>
        push([{ kind: 'stockAsset', id: `A${r}-${i}`, bookId, updatedAt: now + i,
          payload: { stockAssetId: `A${r}-${i}`, name: `并发-${r}-${i}`, bookId, updateTime: now + i } }])))
      allLat.A.push(...A.map((x) => x.ms))
      const aggA = A.reduce((a, x) => { const y = x.body.result || {}
        a.accepted += y.accepted ?? 0; a.denied += y.denied ?? 0; a.errors += x.ok ? 0 : 1; return a },
        { accepted: 0, denied: 0, errors: 0 })
      const pullA = (await req('/api/data/pull', undefined, dev)).body.result.records
        .filter((x) => x.kind === 'stockAsset' && String(x.id).startsWith(`A${r}-`))
      row.A = { ...aggA, landed: pullA.length, wall: Date.now() - tA, lat: stats(A.map((x) => x.ms)) }

      // B
      const tB = Date.now()
      const B = await Promise.all(Array.from({ length: N }, (_, i) =>
        push([{ kind: 'homeLoan', id: `B${r}`, bookId, updatedAt: now + i,
          payload: { loanId: `B${r}`, name: `版本-${i}`, bookId, updateTime: now + i } }])))
      allLat.B.push(...B.map((x) => x.ms))
      const pullB = (await req('/api/data/pull', undefined, dev)).body.result.records
        .find((x) => x.kind === 'homeLoan' && x.id === `B${r}`)
      row.B = { final: pullB?.payload?.name, wall: Date.now() - tB, lat: stats(B.map((x) => x.ms)),
        errors: B.filter((x) => !x.ok).length }

      // C
      const periodKey = `${bookId}|conc-${r}|2026-11-12`
      const tC = Date.now()
      const C = await Promise.all(Array.from({ length: N }, (_, i) =>
        push([{ kind: 'bill', id: `C${r}-${i}`, bookId, periodKey, updatedAt: now + i,
          payload: { billId: `C${r}-${i}`, cost: 10 + i, bookId, time: now, updateTime: now + i } }])))
      allLat.C.push(...C.map((x) => x.ms))
      const aggC = C.reduce((a, x) => { const y = x.body.result || {}
        a.accepted += y.accepted ?? 0; a.duplicates += y.duplicates ?? 0; a.errors += x.ok ? 0 : 1; return a },
        { accepted: 0, duplicates: 0, errors: 0 })
      const pullC = (await req('/api/data/pull', undefined, dev)).body.result.records
        .filter((x) => x.kind === 'bill' && x.payload && String(x.payload.billId).startsWith(`C${r}-`))
      row.C = { ...aggC, landed: pullC.length, wall: Date.now() - tC, lat: stats(C.map((x) => x.ms)) }

      // D
      const tD = now + 900000
      const tD0 = Date.now()
      const D = await Promise.all(Array.from({ length: N }, (_, i) =>
        push([{ kind: 'template', id: `D${r}`, bookId, updatedAt: tD,
          payload: { templateId: `D${r}`, name: `同刻-${i}`, bookId, updateTime: tD } }])))
      allLat.D.push(...D.map((x) => x.ms))
      const aggD = D.reduce((a, x) => { const y = x.body.result || {}
        a.accepted += y.accepted ?? 0; a.conflicts += y.conflicts ?? 0; a.errors += x.ok ? 0 : 1; return a },
        { accepted: 0, conflicts: 0, errors: 0 })
      const pullD = (await req('/api/data/pull', undefined, dev)).body.result.records
        .find((x) => x.kind === 'template' && x.id === `D${r}`)
      row.D = { ...aggD, final: pullD?.payload?.name, wall: Date.now() - tD0, lat: stats(D.map((x) => x.ms)) }

      rounds.push(row)

      // 每轮都断言，不是只看最后一轮
      assert.deepEqual({ a: row.A.accepted, d: row.A.denied, e: row.A.errors }, { a: N, d: 0, e: 0 }, `第${r + 1}轮 A 组`)
      assert.equal(row.A.landed, N, `第${r + 1}轮 A 组全部落库`)
      assert.equal(row.B.errors, 0, `第${r + 1}轮 B 组无错误`)
      assert.equal(row.B.final, `版本-${N - 1}`, `第${r + 1}轮 B 组收敛到最大时间戳`)
      assert.equal(row.C.accepted, 1, `第${r + 1}轮 C 组只落一条`)
      assert.equal(row.C.duplicates, N - 1, `第${r + 1}轮 C 组其余判重`)
      assert.equal(row.C.landed, 1, `第${r + 1}轮 C 组最终 1 条`)
      assert.equal(row.D.accepted, 1, `第${r + 1}轮 D 组只落一条`)
      assert.equal(row.D.conflicts, N - 1, `第${r + 1}轮 D 组其余记冲突`)
    }

    console.log('\n══════ 并发压测：4 组 × 100 并发 × 3 轮 ══════')
    for (const row of rounds) {
      console.log(`第 ${row.round} 轮`)
      console.log(`  A 新增   accepted=${row.A.accepted} denied=${row.A.denied} errors=${row.A.errors} 落库=${row.A.landed} 墙钟=${row.A.wall}ms`)
      console.log(`  B 同条   final=${row.B.final} errors=${row.B.errors} 墙钟=${row.B.wall}ms`)
      console.log(`  C 同期号 accepted=${row.C.accepted} 判重=${row.C.duplicates} 落库=${row.C.landed} 墙钟=${row.C.wall}ms`)
      console.log(`  D 同时间 accepted=${row.D.accepted} 冲突=${row.D.conflicts} final=${row.D.final} 墙钟=${row.D.wall}ms`)
    }
    console.log('\n────── 跨轮延迟聚合（ms，全部请求合并）──────')
    for (const [k, v] of Object.entries(allLat)) {
      console.log(`  ${k} 组: ${JSON.stringify(stats(v))}`)
    }
    const total = Object.values(allLat).flat()
    console.log(`  合计: ${JSON.stringify(stats(total))}  样本数=${total.length}`)
    const totalErrors = rounds.reduce((a, r) => a + r.A.errors + r.B.errors + r.C.errors + r.D.errors, 0)
    console.log(`  总请求错误数: ${totalErrors}`)
    console.log('════════════════════════════════════════════\n')
    assert.equal(totalErrors, 0, '3 轮 1200 次并发请求不应有 HTTP 错误')
    assert.equal(total.length, ROUNDS * 4 * N, '样本数应为 3 轮 × 4 组 × 100')
  } finally {
    child.kill()
    await rm(temp, { recursive: true, force: true }).catch(() => {})
  }
})
