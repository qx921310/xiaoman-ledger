const { buildSync } = require('esbuild')
const Module = require('module')
const path = require('path')
const store = new Map()
global.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k), key: i => [...store.keys()][i], get length() { return store.size } }
const file = path.resolve(__dirname, 'asset-trend.test.ts')
const result = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false })
const compiled = new Module(file, module)
compiled.filename = file
compiled.paths = module.paths
compiled._compile(result.outputFiles[0].text, file)
