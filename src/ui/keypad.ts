/** Apply one key to a decimal amount without allowing multiple decimal points. */
export function editAmount(value: string, key: string): string {
  if (key === '清空') return ''
  if (key === '退格') return value.slice(0, -1)
  if (['+', '-', '×', '÷'].includes(key)) {
    if (!value) return value
    return /[+\-×÷]$/.test(value) ? value.slice(0, -1) + key : value + key
  }
  if (key === '.') {
    const last = value.split(/[+\-×÷]/).pop() ?? ''
    return last.includes('.') ? value : value + (last ? '.' : '0.')
  }
  if (!/^\d{1,2}$/.test(key)) return value
  return value + key
}

/** Evaluate a small arithmetic expression without executing arbitrary code. */
export function evaluateAmount(value: string): number | null {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[+\-×÷](?:\d+(?:\.\d*)?|\.\d+))*$/.test(value)) return null
  const tokens = value.match(/\d+(?:\.\d*)?|\.\d+|[+\-×÷]/g) ?? []
  const terms: number[] = []
  const signs: string[] = []
  let current = Number(tokens[0])
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const next = Number(tokens[i + 1])
    if (op === '×') current *= next
    else if (op === '÷') { if (next === 0) return null; current /= next }
    else { terms.push(current); signs.push(op); current = next }
  }
  let result = terms.length ? terms[0] : current
  if (terms.length) {
    for (let i = 0; i < signs.length; i++) {
      const term = i + 1 < terms.length ? terms[i + 1] : current
      result = signs[i] === '+' ? result + term : result - term
    }
  }
  return Number.isFinite(result) ? +result.toFixed(2) : null
}
