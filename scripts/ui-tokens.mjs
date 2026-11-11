import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync('src/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const roots = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join('\n')
const body = css.replace(/:root\s*\{[^}]*\}/g, '')
const definitions = new Map([...roots.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
const radii = ['--r-sm', '--r-md', '--r-lg', '--r-pill']
const sizes = ['--font-xs', '--font-sm', '--font-md', '--font-lg', '--font-xl', '--font-display']
for (const [prefix, names] of [['--r-', radii], ['--font-', sizes]]) {
  const actual = [...definitions.keys()].filter((name) => name.startsWith(prefix))
  if (actual.length !== names.length || names.some((name) => !definitions.has(name))) throw new Error(`${prefix} 阶梯应恰好包含 ${names.length} 个令牌`)
  if (new Set(names.map((name) => definitions.get(name))).size !== names.length) throw new Error(`${prefix} 阶梯的值必须各不相同`)
}
for (const [, value] of body.matchAll(/\bborder-radius\s*:\s*([^;}]+)/g)) {
  const rest = value.replace(/var\(--r-(?:sm|md|lg|pill)\)/g, '').replace(/\b0\b/g, '').trim()
  if (rest) throw new Error(`圆角必须使用规定令牌：${value}`)
}
for (const [, value] of body.matchAll(/\bfont-size\s*:\s*([^;}]+)/g)) {
  if (!/^var\(--font-(?:xs|sm|md|lg|xl|display)\)$/.test(value.trim())) throw new Error(`字号必须使用规定令牌：${value}`)
}
const literal = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/i
if (literal.test(body)) throw new Error('主题颜色和透明色只能定义在 :root 令牌中')
const hex = new Set([...roots.matchAll(/#[\da-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))
if (hex.size > 12) throw new Error(`主题色超过 12 种：${hex.size}`)
// TSX presentation must not bypass the shared tokens. Data defaults and user
// colors live in data modules and are intentionally outside this check.
function scanComponents(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) scanComponents(path)
    else if (item.isFile() && path.endsWith('.tsx')) {
      const source = readFileSync(path, 'utf8')
      const match = source.match(literal)
      if (match) throw new Error(`${path} 包含颜色字面量 ${match[0]}；请使用主题令牌或数据常量`)
    }
  }
}
scanComponents('src')
console.log(`视觉令牌检查通过：${radii.length} 档圆角、${sizes.length} 档字号、${hex.size} 种主题色；TSX 颜色字面量为零`)
