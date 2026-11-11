import { readFileSync } from 'node:fs'

const css = readFileSync('src/ui.css', 'utf8')
const root = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? ''
const token = (name) => {
  const value = root.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1]
  if (!value) throw new Error(`缺少颜色令牌 --${name}`)
  return value
}
const luminance = (hex) => {
  const values = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}
const combinations = [
  ['正文', 'ink', 'card', 4.5], ['次要文字', 'muted', 'card', 4.5],
  ['主按钮', 'action-ink', 'accent', 4.5], ['危险操作', 'danger-ink', 'card', 4.5],
  ['键盘完成', 'key-finish-ink', 'key-finish-bg', 4.5], ['焦点轮廓', 'focus-ink', 'card', 3]
]
for (const [name, foreground, background, minimum] of combinations) {
  const a = luminance(token(foreground)), b = luminance(token(background))
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  if (ratio < minimum) throw new Error(`${name}对比度 ${ratio.toFixed(2)} 低于 ${minimum}`)
  console.log(`${name}: ${ratio.toFixed(2)}:1`)
}
