const { buildSync } = require('esbuild')
const Module = require('module')
const path = require('path')
const file = path.resolve(__dirname, 'multi-tab.test.ts')
const result = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs', write: false })
const compiled = new Module(file, module)
compiled.filename = file
compiled.paths = module.paths
compiled._compile(result.outputFiles[0].text, file)
