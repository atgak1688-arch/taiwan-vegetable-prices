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
export type ActiveType = 'veg' | 'fruit'
export type UnitKey = 'kg' | 'catty' | '100g'
export type SeasonStatus = 'in-season' | 'off-season' | 'unknown'

export interface UnitConfig {
  factor: number
  label: string
  short: string
}
