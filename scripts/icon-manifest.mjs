/**
 * 扫描 public/icons 生成素材清单，并校验：
 *   1) taxonomy.ts 里引用的每个图标是否真的有文件
 *   2) 有没有多余文件（不在 taxonomy/规则里）
 *   3) 每个文件的体积、哈希、来源、许可
 * 用法: node scripts/icon-manifest.mjs [--write]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = 'public/icons'
const WRITE = process.argv.includes('--write')

const GROUPS = {
  'categories/parent': { source: 'Codex（自绘）', license: '自有' },
  'categories/child': { source: 'Codex（自绘）', license: '自有' },
  'categories/income': { source: 'Codex（自绘）', license: '自有' },
  assets: { source: 'Codex（自绘）', license: '自有' },
  brand: { source: 'Codex（自绘）', license: '自有' },
  brands: { source: 'Simple Icons', license: 'CC0-1.0' }
}

const entries = []
for (const [group, meta] of Object.entries(GROUPS)) {
  const dir = join(ROOT, group)
  let files = []
  try { files = readdirSync(dir).filter((f) => f.endsWith('.svg')) } catch { continue }
  for (const f of files.sort()) {
    const p = join(dir, f)
    const buf = readFileSync(p)
    entries.push({
      key: f.replace(/\.svg$/, ''),
      group,
      file: relative(ROOT, p).replaceAll('\\', '/'),
      bytes: statSync(p).size,
      sha256: createHash('sha256').update(buf).digest('hex').slice(0, 16),
      ...meta
    })
  }
}

// 读取 taxonomy 引用的 key
const tax = readFileSync('src/taxonomy.ts', 'utf8')
const used = new Set([...tax.matchAll(/icon: '([^']+)'/g)].map((m) => m[1]))
const have = new Set(entries.map((e) => e.key))

const missing = [...used].filter((k) => !have.has(k))
const unused = entries
  .filter((e) => e.group.startsWith('categories') && !used.has(e.key))
  .map((e) => e.key)

// 账户与品牌是规则引用，不做 unused 检查
const manifest = {
  generatedAt: new Date().toISOString(),
  total: entries.length,
  entries
}

console.log(`素材总数: ${entries.length}`)
console.log(`分类引用: ${used.size} 个 key`)
if (missing.length) {
  console.log(`\n❌ 缺文件 (${missing.length}): ${missing.join(', ')}`)
} else {
  console.log('✅ 分类引用的图标全部存在')
}
if (unused.length) {
  console.log(`\n⚠️ 多余文件 (${unused.length}，未被 taxonomy 引用): ${unused.join(', ')}`)
}
// 品牌图（多路径填充）体积天然偏大，只对分类/账户做 2KB 约束
const big = entries.filter((e) => e.bytes > 2048 && !e.group.startsWith('brands'))
if (big.length) console.log(`\n⚠️ 超过 2KB: ${big.map((b) => b.key).join(', ')}`)

if (WRITE) {
  writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('\n已写入 public/icons/manifest.json')
}
if (missing.length) process.exitCode = 1
