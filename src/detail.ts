import './styles/main.css'
import './styles/detail.css'
import type { PriceRecord, UnitKey } from './types'
import { MARKETS, REGION_NAMES, UNITS, VEG_TYPE, FRUIT_TYPE, FISH_MARKETS } from './constants'
import {
  convertPrice, getUnitLabel, toROCDate, rocToDisplay, getDateRange,
  fetchAPI, escapeHTML, numberFormat, initTheme,
} from './utils'
import { fetchTodayFish, fetchFishHistory } from './fishAdapter'
import Chart from 'chart.js/auto'

// Get params from URL
const urlParams = new URLSearchParams(window.location.search)
const cropName = urlParams.get('crop')
const regionParam = urlParams.get('region')
const typeParam = urlParams.get('type') || 'veg'

function getMarketCodes(): number[] {
  if (regionParam && MARKETS[regionParam]) {
    return MARKETS[regionParam].map(m => m.code)
  }
  return Object.values(MARKETS).flat().map(m => m.code)
}

function getMarketNames(): string[] {
  if (typeParam === 'fish') {
    if (regionParam && FISH_MARKETS[regionParam]) {
      return FISH_MARKETS[regionParam]
    }
    return Object.values(FISH_MARKETS).flat()
  }
  if (regionParam && MARKETS[regionParam]) {
    return MARKETS[regionParam].map(m => m.name)
  }
  return Object.values(MARKETS).flat().map(m => m.name)
}

// DOM
const cropTitle = document.getElementById('cropTitle')!
const detailDate = document.getElementById('detailDate')!
const avgPriceEl = document.getElementById('avgPrice')!
const upperPriceEl = document.getElementById('upperPrice')!
const lowerPriceEl = document.getElementById('lowerPrice')!
const transQtyEl = document.getElementById('transQty')!
const marketCardsEl = document.getElementById('marketCards')!
const loadingEl = document.getElementById('loading')!
const noDataEl = document.getElementById('noData')!

let priceChart: Chart | null = null
let activeUnit: UnitKey = 'kg'
let todayData: PriceRecord[] = []

// === API ===
async function fetchTodayForCrop(name: string): Promise<PriceRecord[]> {
  if (typeParam === 'fish') {
    const allFish = await fetchTodayFish()
    const validMarkets = getMarketNames()
    return allFish.filter(d => d.CropName === name && validMarkets.includes(d.MarketName))
  }
  const codes = getMarketCodes()
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const rocDate = toROCDate(date)
    const promises = codes.map(code =>
      fetchAPI({
        Start_time: rocDate,
        End_time: rocDate,
        CropName: name,
        TcType: typeParam === 'fruit' ? FRUIT_TYPE : VEG_TYPE,
        MarketCode: code,
      }).catch(() => [] as PriceRecord[])
    )
    const results = await Promise.all(promises)
    const data = results.flat()
    if (data.length > 0) return data
  }
  return []
}

async function fetchHistory(name: string, days: number): Promise<PriceRecord[]> {
  if (typeParam === 'fish') {
    const data = await fetchFishHistory(name, days)
    const validMarkets = getMarketNames()
    return data.filter(d => validMarkets.includes(d.MarketName))
  }
  const { start, end } = getDateRange(days)
  try {
    const data = await fetchAPI({
      Start_time: start,
      End_time: end,
      CropName: name,
      TcType: typeParam === 'fruit' ? FRUIT_TYPE : VEG_TYPE,
    })
    const validMarkets = getMarketNames()
    return data.filter(d => validMarkets.includes(d.MarketName))
  } catch {
    const codes = getMarketCodes()
    const promises = codes.map(code =>
      fetchAPI({
        Start_time: start,
        End_time: end,
        CropName: name,
        TcType: typeParam === 'fruit' ? FRUIT_TYPE : VEG_TYPE,
        MarketCode: code,
      }).catch(() => [] as PriceRecord[])
    )
    const results = await Promise.all(promises)
    return results.flat()
  }
}

// === Render summary ===
function renderSummary(data: PriceRecord[]) {
  if (data.length === 0) return

  const totalQ = data.reduce((s, d) => s + d.Trans_Quantity, 0)
  const avgP = data.reduce((s, d) => s + d.Avg_Price * d.Trans_Quantity, 0) / totalQ
  const upperP = Math.max(...data.map(d => d.Upper_Price))
  const lowerP = Math.min(...data.map(d => d.Lower_Price))

  avgPriceEl.textContent = convertPrice(avgP, activeUnit).toFixed(1)
  upperPriceEl.textContent = convertPrice(upperP, activeUnit).toFixed(1)
  lowerPriceEl.textContent = convertPrice(lowerP, activeUnit).toFixed(1)
  transQtyEl.textContent = numberFormat(totalQ)

  document.querySelectorAll('.card-unit').forEach(el => {
    if (el.textContent!.includes('元')) el.textContent = getUnitLabel(activeUnit)
  })
  detailDate.textContent = `交易日期：${rocToDisplay(data[0].TransDate)}`
}

// === Render market cards ===
function renderMarkets(data: PriceRecord[]) {
  marketCardsEl.innerHTML = ''
  const sorted = [...data].sort((a, b) => b.Avg_Price - a.Avg_Price)

  for (const item of sorted) {
    const card = document.createElement('div')
    card.className = 'market-card'
    card.innerHTML = `
      <div class="market-card-name">${escapeHTML(item.MarketName)}</div>
      <div class="market-card-row">
        <span class="market-card-label">平均價</span>
        <span class="market-card-value price">${convertPrice(item.Avg_Price, activeUnit).toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">上價</span>
        <span class="market-card-value">${convertPrice(item.Upper_Price, activeUnit).toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">下價</span>
        <span class="market-card-value">${convertPrice(item.Lower_Price, activeUnit).toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">交易量</span>
        <span class="market-card-value">${numberFormat(item.Trans_Quantity)} 公斤</span>
      </div>
    `
    marketCardsEl.appendChild(card)
  }
}

// === Render chart ===
async function renderChart(days: number) {
  const history = await fetchHistory(cropName!, days)

  const byDate: Record<string, { totalQty: number; weightedPrice: number; upper: number; lower: number }> = {}
  for (const item of history) {
    const date = item.TransDate
    if (!byDate[date]) {
      byDate[date] = { totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity }
    }
    byDate[date].totalQty += item.Trans_Quantity
    byDate[date].weightedPrice += item.Avg_Price * item.Trans_Quantity
    byDate[date].upper = Math.max(byDate[date].upper, item.Upper_Price)
    byDate[date].lower = Math.min(byDate[date].lower, item.Lower_Price)
  }

  const dates = Object.keys(byDate).sort()
  const labels = dates.map(rocToDisplay)
  const avgPrices = dates.map(d => parseFloat(convertPrice(byDate[d].weightedPrice / byDate[d].totalQty, activeUnit).toFixed(1)))
  const upperPrices = dates.map(d => parseFloat(convertPrice(byDate[d].upper, activeUnit).toFixed(1)))
  const lowerPrices = dates.map(d => parseFloat(convertPrice(byDate[d].lower, activeUnit).toFixed(1)))

  if (priceChart) priceChart.destroy()

  const ctx = (document.getElementById('priceChart') as HTMLCanvasElement).getContext('2d')!
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '平均價',
          data: avgPrices,
          borderColor: '#b5845a',
          backgroundColor: 'rgba(181, 132, 90, 0.1)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
        {
          label: '上價',
          data: upperPrices,
          borderColor: '#ff7043',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: '下價',
          data: lowerPrices,
          borderColor: '#42a5f5',
          borderWidth: 1.5,
          borderDash: [5, 3],
          fill: false,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} ${getUnitLabel(activeUnit)}`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: getUnitLabel(activeUnit) },
          beginAtZero: false,
        },
        x: {
          ticks: { maxRotation: 45, maxTicksLimit: 15 },
        },
      },
    },
  })
}

// === Unit tags ===
const savedUnit = localStorage.getItem('unit')
if (savedUnit && savedUnit in UNITS) {
  activeUnit = savedUnit as UnitKey
  document.querySelectorAll('#unitTags .tag').forEach(t => {
    (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.unit === activeUnit)
  })
}

document.getElementById('unitTags')!.addEventListener('click', e => {
  const tag = (e.target as HTMLElement).closest('.tag') as HTMLElement | null
  if (!tag) return
  document.querySelectorAll('#unitTags .tag').forEach(t => t.classList.remove('active'))
  tag.classList.add('active')
  activeUnit = tag.dataset.unit as UnitKey
  localStorage.setItem('unit', activeUnit)
  if (todayData.length > 0) {
    renderSummary(todayData)
    renderMarkets(todayData)
  }
  const activeDays = parseInt(document.querySelector('.range-btn.active')?.getAttribute('data-days') || '7')
  renderChart(activeDays)
})

// === Range buttons ===
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    renderChart(parseInt((btn as HTMLElement).dataset.days!))
  })
})

// === Theme ===
initTheme()

// === Init ===
async function init() {
  if (!cropName) {
    loadingEl.classList.add('hidden')
    noDataEl.classList.remove('hidden')
    noDataEl.textContent = '未指定蔬菜名稱'
    return
  }

  const regionLabel = regionParam ? REGION_NAMES[regionParam] : '全部地區'
  cropTitle.textContent = cropName
  document.title = `${cropName} - 台灣蔬菜即時價格查詢`

  const subtitle = document.querySelector('.subtitle')
  if (subtitle) {
    const backLink = subtitle.querySelector('.back-link')
    subtitle.innerHTML = ''
    if (backLink) subtitle.appendChild(backLink)
    subtitle.appendChild(document.createTextNode(` | ${regionLabel}市場`))
  }

  try {
    todayData = await fetchTodayForCrop(cropName)
    loadingEl.classList.add('hidden')

    if (todayData.length === 0) {
      noDataEl.classList.remove('hidden')
      return
    }

    renderSummary(todayData)
    renderMarkets(todayData)
    await renderChart(7)
  } catch (err) {
    console.error('Failed to load data:', err)
    loadingEl.classList.add('hidden')
    noDataEl.textContent = '載入失敗，請稍後重試'
    noDataEl.classList.remove('hidden')
  }
}

init()
