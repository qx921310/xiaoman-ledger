/** 统一把 unknown 异常转成可展示文案 */
export function errorMessage(e: unknown, fallback = '未知错误'): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return fallback
}
