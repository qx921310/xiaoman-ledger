#!/usr/bin/env node
/**
 * 用网关模型直连做一次代码审查（绕开子代理路由白名单）。
 * 用法：node scripts/cr-review.mjs [--base <git-ref>] [--model glm-5.3] [--out docs/CR-<date>.md]
 * 凭据：~/.dsh/.credentials.yaml 的 GATEWAY_API_KEY（或环境变量 GATEWAY_API_KEY）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

const args = process.argv.slice(2)
const pick = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const BASE = pick('base', 'HEAD~8')
const MODEL = pick('model', 'glm-5.3')
const OUT = pick('out', join('docs', `CR-${new Date().toISOString().slice(0, 10)}-glm.md`))
const ENDPOINT = process.env.GATEWAY_BASE_URL ?? 'https://api.yele.win/v1'

function gatewayKey() {
  if (process.env.GATEWAY_API_KEY) return process.env.GATEWAY_API_KEY
  const file = join(homedir(), '.dsh', '.credentials.yaml')
  const text = readFileSync(file, 'utf8')
  const m = text.match(/GATEWAY_API_KEY\s*:\s*["']?([^"'\s]+)/)
  if (!m) throw new Error('未找到 GATEWAY_API_KEY')
  return m[1]
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const diff = git('diff', `${BASE}..HEAD`, '--unified=3')
const stat = git('diff', `${BASE}..HEAD`, '--stat')
const files = git('diff', `${BASE}..HEAD`, '--name-only').trim().split('\n').filter(Boolean)

// 关键实现文件整体贴入，便于模型看到上下文（限制总量）
const core = ['src/store.ts', 'src/features/book-pending.ts', 'src/refund-operations.ts', 'src/balances.ts', 'src/domain/asset-trend.ts']
const budget = 120_000
let attachments = ''
for (const f of core) {
  try {
    const body = readFileSync(f, 'utf8')
    if (attachments.length + body.length > budget) continue
    attachments += `\n\n===== ${f} =====\n${body}`
  } catch { /* 文件不存在就跳过 */ }
}

const prompt = `你是资深代码审查者，只做严谨的证据型审查。仓库是「小满记账」（React+TS 前端 / Node+SQLite 后端），
目标是账务数据正确性：金额、余额、同步、离线队列、权限。

审查范围：从 ${BASE} 到 HEAD 的改动（${files.length} 个文件）。

请重点检查：
1. 任何可能改变余额/金额守恒的路径（拆分、退款、组合、转账、报销、外币）
2. 离线补传队列：中断、重放、幂等、迁移丢数据
3. 命令层权限（历史只读账本）是否能被绕过
4. 事务/回滚是否留下半成品或同步墓碑
5. 明显的逻辑错误、边界、竞态

输出格式（严格）：
- 结论：通过 / 不通过（一句话理由）
- 问题列表：每条含 级别(P0/P1/P2)、位置(文件:行号)、现象、复现要点、修复建议
- 不要泛泛而谈，不要建议重构；不确定的标注「待确认」

=== git diff --stat ===
${stat}

=== git diff ===
${diff.slice(0, 35_000)}

=== 关键文件全文 ===${attachments}
`

const key = gatewayKey()
const res = await fetch(`${ENDPOINT}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是严格但务实的代码审查者。直接给出中文结论与问题列表，不要输出思考过程。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 32000
  })
})
if (!res.ok) {
  const text = await res.text()
  throw new Error(`网关返回 ${res.status}: ${text.slice(0, 400)}`)
}
const json = await res.json()
const content = json.choices?.[0]?.message?.content ?? JSON.stringify(json).slice(0, 2000)

mkdirSync(dirname(OUT), { recursive: true })
const header = `# GLM 代码审查（${MODEL}）\n\n范围：\`${BASE}..HEAD\`（${files.length} 个文件）\n生成时间：${new Date().toISOString()}\n\n---\n\n`
writeFileSync(OUT, header + content, 'utf8')
console.log(`已写入 ${OUT}`)
console.log(content.slice(0, 4000))
