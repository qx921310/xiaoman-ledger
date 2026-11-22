/**
 * 本地偏好（一木：更多设置 → 账单设置）。
 * 只影响展示层，不参与同步；按设备保存。
 */
export interface Prefs {
  multiCurrency: boolean
  remarkFirst: boolean
  simpleCategory: boolean
  showTime: boolean
  showOriginAmount: boolean
  showAssetIcon: boolean
  colorMoney: boolean
}

const KEY = 'xiaoman-prefs'
const DEFAULTS: Prefs = {
  multiCurrency: true,
  remarkFirst: false,
  simpleCategory: false,
  showTime: true,
  showOriginAmount: false,
  showAssetIcon: true,
  colorMoney: true
}

export function readPrefs(): Prefs {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) } }
  catch { return { ...DEFAULTS } }
}

export function writePrefs(next: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('xiaoman-prefs', { detail: next }))
  } catch { /* 忽略：隐私模式写不进去也不该影响使用 */ }
}
