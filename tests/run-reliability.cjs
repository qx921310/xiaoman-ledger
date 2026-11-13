require('fake-indexeddb/auto')
const { buildSync } = require('esbuild')
const Module = require('module')
const path = require('path')
const values = new Map()
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key), key: i => [...values.keys()][i], get length() { return values.size } }
const file = path.resolve(__dirname, 'reliability.test.ts')
const result = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false })
const compiled = new Module(file, module)
compiled.filename = file
compiled.paths = module.paths
compiled._compile(result.outputFiles[0].text, file)
