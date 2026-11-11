import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { buildSync } from 'esbuild'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const entry = `export { loadAccountData } from './src/account-session';
export { useLedger } from './src/store';
export { ASSET_ICON_GROUPS, assetIconImagePath } from './src/ui/asset-icons'`
const bundle = buildSync({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
const makePage = (name) => {
  const file = resolve(`${name}.cjs`)
  const module = new Module(file)
  module.filename = file
  module.paths = Module._nodeModulePaths(process.cwd())
  module._compile(bundle, file)
  return module.exports
}

test('account storage survives reopening and isolates a new user', async () => {
  const items = new Map()
  globalThis.localStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
    get length() { return items.size }
  }
  const first = makePage('ledger-first-page')
  await first.loadAccountData(41)
  first.useLedger.getState().addAsset({ assetId: 101, assetName: '测试账户一', assetNumber: 10, assetIcon: 'bank:ic_bank_zhaoshang' })
  first.useLedger.getState().addAsset({ assetId: 102, assetName: '测试账户二', assetNumber: 20 })
  first.useLedger.getState().addTag({ name: '仅账号一', color: '#FED778' })

  const reopened = makePage('ledger-reopened-page')
  await reopened.loadAccountData(41)
  assert.deepEqual(reopened.useLedger.getState().assets.map((a) => a.assetId), [101, 102])
  assert.equal(reopened.useLedger.getState().assets[0].assetIcon, 'bank:ic_bank_zhaoshang')
  assert.deepEqual(JSON.parse(items.get('xiaoman-data:41')).state.assets.map((a) => a.assetId), [101, 102])

  await reopened.loadAccountData(42)
  assert.equal(reopened.useLedger.getState().assets.length, 0)
  assert.equal(reopened.useLedger.getState().tags.length, 0)
  await reopened.loadAccountData(41)
  assert.deepEqual(reopened.useLedger.getState().assets.map((a) => a.assetId), [101, 102])
  assert.deepEqual(reopened.useLedger.getState().tags.map((t) => t.name), ['仅账号一'])
})

test('each account icon choice resolves to a local file', () => {
  const page = makePage('ledger-icon-catalog')
  const choices = page.ASSET_ICON_GROUPS.flatMap((group) => group.options)
  assert.equal(new Set(choices.map(([key]) => key)).size, choices.length)
  assert.equal(page.assetIconImagePath('wallet:ic_asset_invest'), '/icons/assets/ic_asset_investment.svg')
  for (const [key] of choices) {
    const url = page.assetIconImagePath(key) ?? `/icons/assets/${key}.svg`
    const path = join('public', url)
    assert.ok(existsSync(path), `${key} is missing ${url}`)
    if (url.endsWith('.png')) {
      const header = readFileSync(path).subarray(0, 8)
      assert.deepEqual(header, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), `${key} is not a PNG image`)
    }
  }
})
