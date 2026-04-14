export interface MarketInfo {
  code: number
  name: string
}

export interface PriceRecord {
  CropName: string
  MarketName: string
  TransDate: string
  Avg_Price: number
  Upper_Price: number
  Lower_Price: number
  Trans_Quantity: number
}

export interface AggregatedPrice {
  CropName: string
  Avg_Price: number
  Upper_Price: number
  Lower_Price: number
  Trans_Quantity: number
}

export type Region = 'north' | 'central' | 'south' | 'east'
export type ActiveType = 'veg' | 'fruit' | 'fish'
export type UnitKey = 'kg' | 'catty' | '100g'
export type SeasonStatus = 'in-season' | 'off-season' | 'unknown'

export interface RawFishRecord {
  交易日期: string
  品種代碼: number
  魚貨名稱: string
  市場名稱: string
  上價: number
  中價: number
  下價: number
  交易量: number
  平均價: number
}

export interface UnitConfig {
  factor: number
  label: string
  short: string
}
