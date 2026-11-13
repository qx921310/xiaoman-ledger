const { buildSync } = require('esbuild')
const Module = require('module')
const path = require('path')
const store = new Map()
global.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
  key: index => [...store.keys()][index],
  get length() { return store.size }
}
const file = path.resolve(__dirname, 'fix-regressions.test.ts')
const result = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false })
const compiled = new Module(file, module)
compiled.filename = file
compiled.paths = module.paths
compiled._compile(result.outputFiles[0].text, file)
