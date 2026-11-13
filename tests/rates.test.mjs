// 汇率接口：CFETS 中间价解析（含 JPY 以 100 为单位的换算）与未登录拒绝
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'

test('汇率接口：未登录 401，登录后返回 CFETS 中间价且 JPY 已折算为每 1 单位', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'xiaoman-rates-'))
  await mkdir(join(temp, 'server'))
  await copyFile('server/server.mjs', join(temp, 'server', 'server.mjs'))
  const probe = createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const port = probe.address().port
  await new Promise((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())))
  const child = spawn(process.execPath, [join(temp, 'server', 'server.mjs')], {
    env: { ...process.env, PORT: String(port), DATA_DIR: join(temp, 'data') }, stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('server startup timeout')), 10000).unref())
    ])
    const base = `http://127.0.0.1:${port}`
    const call = async (path, data, cookie) => {
      const res = await fetch(base + path, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { ...(cookie ? { cookie } : {}), ...(data ? { 'content-type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined
      })
      return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
    }

    const anon = await call('/api/rates')
    // 本项目 API 统一用 body.code 表达业务错误（HTTP 200）
    assert.notEqual(anon.body.code, 0, '未登录必须拒绝')
    assert.equal(anon.body.msg, '请先登录')

    const reg = await call('/api/auth/register', { email: 'rate@xiaoman.test', password: 'rate-pass-123' })
    const r = await call('/api/rates', undefined, reg.cookie)
    assert.equal(r.body.code, 0, '登录后应拿到汇率')
    const rates = r.body.result.rates
    assert.ok(rates.USD > 1 && rates.USD < 15, `USD 汇率量级应合理，实际 ${rates.USD}`)
    assert.ok(rates.JPY > 0 && rates.JPY < 1, `JPY 应为每 1 日元兑人民币（<1），实际 ${rates.JPY}`)
    assert.equal(r.body.result.source, 'cfets', '主源应为 CFETS 中间价')
    assert.equal(r.body.result.base, 'CNY', '默认 base 为 CNY')

    // 默认币种不是人民币时：应换算成「1 单位外币 = N 该币种」
    const usdBase = await call('/api/rates?base=USD', undefined, reg.cookie)
    assert.equal(usdBase.body.result.base, 'USD')
    const usdRateOfCny = usdBase.body.result.rates.CNY
    assert.ok(usdRateOfCny > 0 && usdRateOfCny < 1, `1 元应约 0.15 美元，实际 ${usdRateOfCny}`)
    assert.ok(Math.abs(usdRateOfCny * r.body.result.rates.USD - 1) < 0.01, '两组汇率应互为倒数')

    // 主源不覆盖的本位币（MYR）：要么给正确换算，要么明确失败，绝不能带错标签成功
    const myr = await call('/api/rates?base=MYR', undefined, reg.cookie)
    if (myr.body.code === 0) {
      const r1 = myr.body.result
      assert.equal(r1.base, 'MYR')
      const oneUsdInMyr = r1.rates.USD
      assert.ok(oneUsdInMyr > 3, `1 美元应约 4.4 马币，实际 ${oneUsdInMyr}（若返回 7 左右即为错把人民币当马币）`)
    } else {
      assert.match(String(myr.body.msg), /本位币/, '失败时须说明缺本位币基准价')
    }
  } finally {
    child.kill()
    await rm(temp, { recursive: true, force: true })
  }
})
