import type { PriceRecord, RawFishRecord } from './types'
import { FISH_API_BASE } from './constants'

function fishDateToROC(fishDate: string): string {
  // "1150414" -> "115.04.14"
  const y = fishDate.substring(0, fishDate.length - 4)
  const m = fishDate.substring(fishDate.length - 4, fishDate.length - 2)
  const d = fishDate.substring(fishDate.length - 2)
  return `${y}.${m}.${d}`
}

export function toFishROCDate(date: Date): string {
  const y = date.getFullYear() - 1911
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

function adaptFishRecord(raw: RawFishRecord): PriceRecord {
  return {
    CropName: raw.魚貨名稱,
    MarketName: raw.市場名稱,
    TransDate: fishDateToROC(raw.交易日期),
    Avg_Price: raw.平均價,
    Upper_Price: raw.上價,
    Lower_Price: raw.下價,
    Trans_Quantity: raw.交易量,
  }
}

export async function fetchFishAPI(params: Record<string, string>): Promise<PriceRecord[]> {
  const url = new URL(FISH_API_BASE)
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val)
  }
  const resp = await fetch(url.toString())
  if (!resp.ok) throw new Error(`Fish API error: ${resp.status}`)
  const json: RawFishRecord[] = await resp.json()
  return json.map(adaptFishRecord)
}

export async function fetchTodayFish(): Promise<PriceRecord[]> {
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const fishDate = toFishROCDate(date)
    try {
      const data = await fetchFishAPI({ StartDate: fishDate, EndDate: fishDate })
      if (data.length > 0) return data
    } catch {
      continue
    }
  }
  return []
}

export async function fetchFishHistory(cropName: string, days: number): Promise<PriceRecord[]> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  try {
    const data = await fetchFishAPI({
      StartDate: toFishROCDate(start),
      EndDate: toFishROCDate(end),
    })
    return data.filter(d => d.CropName === cropName)
  } catch {
    return []
  }
}
