import type { ActiveType, PriceRecord, SeasonStatus, UnitKey } from './types'
import {
  API_BASE, VEG_TYPE, FRUIT_TYPE, MARKETS, UNITS,
  CATEGORIES, FRUIT_CATEGORIES, SEASONAL_DATA, FRUIT_SEASONAL,
  ALIASES, FRUIT_ALIASES,
} from './constants'

// === Unit conversion ===
export function convertPrice(price: number, unit: UnitKey): number {
  return price * UNITS[unit].factor
}

export function getUnitLabel(unit: UnitKey): string {
  return UNITS[unit].label
}

// === Date helpers (ROC calendar) ===
export function toROCDate(date: Date): string {
  const y = date.getFullYear() - 1911
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

export function rocToDisplay(rocDate: string): string {
  const parts = rocDate.split('.')
  const year = parseInt(parts[0]) + 1911
  return `${year}/${parts[1]}/${parts[2]}`
}

export function getDateRange(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  return { start: toROCDate(start), end: toROCDate(end) }
}

// === API ===
export async function fetchAPI(params: Record<string, string | number>): Promise<PriceRecord[]> {
  const url = new URL(API_BASE)
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, String(val))
  }
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`API error: ${resp.status}`)
  const json = await resp.json()
  return (json.Data || []).filter((d: PriceRecord) => d.CropName !== '休市')
}

// === Region helpers ===
export function getRegion(marketName: string): string | null {
  for (const [region, markets] of Object.entries(MARKETS)) {
    if (markets.some(m => m.name === marketName)) return region
  }
  return null
}

// === Category classification ===
export function classifyCrop(cropName: string, activeType: ActiveType): string {
  const cats = activeType === 'fruit' ? FRUIT_CATEGORIES : CATEGORIES
  for (const [cat, { keywords }] of Object.entries(cats)) {
    if (keywords.some(kw => cropName.includes(kw))) return cat
  }
  return 'other'
}

// === Seasonal ===
export function getSeasonStatus(cropName: string, activeType: ActiveType): SeasonStatus {
  const month = new Date().getMonth() + 1
  const data = activeType === 'fruit' ? FRUIT_SEASONAL : SEASONAL_DATA
  for (const [keyword, months] of Object.entries(data)) {
    if (cropName.includes(keyword)) {
      return months.includes(month) ? 'in-season' : 'off-season'
    }
  }
  return 'unknown'
}

// === Aliases ===
export function getActiveAliases(activeType: ActiveType): Record<string, string> {
  return activeType === 'fruit' ? FRUIT_ALIASES : ALIASES
}

export function buildReverseAliases(activeType: ActiveType): Record<string, string[]> {
  const reverse: Record<string, string[]> = {}
  const aliases = getActiveAliases(activeType)
  for (const [alias, apiName] of Object.entries(aliases)) {
    if (!reverse[apiName]) reverse[apiName] = []
    reverse[apiName].push(alias)
  }
  return reverse
}

export function getDisplayName(cropName: string, reverseAliases: Record<string, string[]>): string {
  const baseName = cropName.split('-')[0]
  const aliases = reverseAliases[baseName] || reverseAliases[cropName]
  if (aliases && aliases.length > 0) {
    return `${cropName}（${aliases[0]}）`
  }
  return cropName
}

export function resolveAlias(query: string, activeType: ActiveType): string | null {
  const aliases = getActiveAliases(activeType)
  if (aliases[query]) return aliases[query]
  for (const [alias, apiName] of Object.entries(aliases)) {
    if (alias.includes(query) || query.includes(alias)) return apiName
  }
  return null
}

// === DOM helpers ===
export function escapeHTML(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export function numberFormat(n: number): string {
  return Math.round(n).toLocaleString('zh-TW')
}

// === Theme ===
export function initTheme(): void {
  const themeToggle = document.getElementById('themeToggle') as HTMLInputElement
  if (!themeToggle) return

  function applyTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme)
    themeToggle.checked = theme === 'dark'
  }

  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    applyTheme(savedTheme)
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark')
  } else {
    applyTheme('light')
  }

  themeToggle.addEventListener('change', () => {
    const next = themeToggle.checked ? 'dark' : 'light'
    applyTheme(next)
    localStorage.setItem('theme', next)
  })
}
