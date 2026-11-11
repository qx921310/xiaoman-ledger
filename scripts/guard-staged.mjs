#!/usr/bin/env node
/**
 * 提交前守卫：拦截不该进仓库的产物，并打印将要提交的文件清单。
 * 用法：node scripts/guard-staged.mjs        （pre-commit 钩子里自动跑）
 */
import { execSync } from 'node:child_process'

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

let staged = ''
try {
  staged = run('git -c core.quotepath=false diff --cached --name-only')
} catch {
  process.exit(0) // 不在 git 环境里，放行
}
const files = staged ? staged.split('\n').filter(Boolean) : []
if (!files.length) process.exit(0)

const FORBIDDEN = [
  { re: /(^|\/)\.tmp\//, why: '构建/调试产物，不应入库' },
  { re: /(^|\/)dist\//, why: '构建输出，由 CI 生成' },
  { re: /server\/data\//, why: '本地数据库，含真实账目' },
  { re: /\.env(\.|$)/, why: '可能含密钥' },
  { re: /credential|secret|vault/i, why: '疑似凭据文件' }
]
const bad = files.filter((f) => FORBIDDEN.some((r) => r.re.test(f)))
if (bad.length) {
  console.error('✖ 拒绝提交以下文件：')
  for (const f of bad) {
    const rule = FORBIDDEN.find((r) => r.re.test(f))
    console.error(`  ${f}  —— ${rule.why}`)
  }
  process.exit(1)
}

// 打印清单，便于肉眼确认没有混入别人的在途改动
console.log(`将提交 ${files.length} 个文件：`)
for (const f of files.slice(0, 40)) console.log(`  ${f}`)
if (files.length > 40) console.log(`  … 另有 ${files.length - 40} 个`)
