import './styles/main.css'
import type { ActiveType, AggregatedPrice, PriceRecord, UnitKey } from './types'
import {
  MARKETS, ALL_MARKET_CODES, UNITS, VEG_TYPE, FRUIT_TYPE,
  CATEGORIES, FRUIT_CATEGORIES,
} from './constants'
import {
  convertPrice, getUnitLabel, toROCDate, rocToDisplay,
  fetchAPI, classifyCrop, getSeasonStatus, getActiveAliases,
  buildReverseAliases, resolveAlias, escapeHTML, numberFormat,
  initTheme,
} from './utils'

// === State ===
let activeType: ActiveType = 'veg'
let currentSort = { field: 'Avg_Price', desc: true }
let todayData: PriceRecord[] = []
let allCropNames: string[] = []
const dataCache: Record<string, PriceRecord[] | null> = { veg: null, fruit: null }
let activeCategory = 'all'
let activeRegion = 'all'
let activeUnit: UnitKey = 'kg'
let activeSeason = 'all'
let suggestionIndex = -1
let currentPage = 1
let showAll = false
const PAGE_SIZE = 20
let REVERSE_ALIASES = buildReverseAliases(activeType)

// Expose for chatbot
;(window as any).todayData = todayData
;(window as any).activeType = activeType

// === DOM elements ===
const searchInput = document.getElementById('searchInput') as HTMLInputElement
const suggestionsEl = document.getElementById('searchSuggestions')!
const tableTitle = document.getElementById('tableTitle')!
const resultCount = document.getElementById('resultCount')!
const priceTableBody = document.getElementById('priceTableBody')!
const loadingEl = document.getElementById('loading')!
const noDataEl = document.getElementById('noData')!

// === Data fetching ===
async function fetchStaticJSON(filename: string): Promise<PriceRecord[] | null> {
  try {
    const resp = await fetch(`data/${filename}`)
    if (!resp.ok) return null
    const json = await resp.json()
    return (json.Data || []).filter((d: PriceRecord) => d.CropName !== '休市')
  } catch {
    return null
  }
}

async function fetchMarketBatch(rocDate: string, codes: number[]): Promise<PriceRecord[]> {
  const promises = codes.map(code =>
    fetchAPI({
      Start_time: rocDate,
      End_time: rocDate,
      TcType: activeType === 'fruit' ? FRUIT_TYPE : VEG_TYPE,
      MarketCode: code,
    }).catch(() => [] as PriceRecord[])
  )
  const results = await Promise.all(promises)
  return results.flat()
}

async function findLatestDate(): Promise<string | null> {
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const rocDate = toROCDate(date)
    const test = await fetchAPI({
      Start_time: rocDate,
      End_time: rocDate,
      TcType: activeType === 'fruit' ? FRUIT_TYPE : VEG_TYPE,
      MarketCode: 109,
    }).catch(() => [] as PriceRecord[])
    if (test.length > 0) return rocDate
  }
  return null
}

async function fetchTodayVegetables(onPartialData?: (data: PriceRecord[], rocDate: string) => void): Promise<PriceRecord[]> {
  const staticFile = activeType === 'fruit' ? 'today_fruit.json' : 'today.json'
  const staticData = await fetchStaticJSON(staticFile)
  if (staticData && staticData.length > 0 && onPartialData) {
    onPartialData(staticData, staticData[0].TransDate)
  }

  try {
    const rocDate = await findLatestDate()
    if (!rocDate) {
      if (staticData && staticData.length > 0) return staticData
      throw new Error('No recent data found')
    }

    const quickCodes = [109, 104, 800, 400]
    const quickData = await fetchMarketBatch(rocDate, quickCodes)
    const remainingCodes = ALL_MARKET_CODES.filter(c => !quickCodes.includes(c))
    const restData = await fetchMarketBatch(rocDate, remainingCodes)
    const allData = [...quickData, ...restData]

    if (allData.length > 0) return allData
  } catch (err) {
    console.warn('Live API failed:', (err as Error).message)
  }

  if (staticData && staticData.length > 0) return staticData
  return []
}

// === Autocomplete ===
function buildCropNames(data: PriceRecord[]) {
  const names = new Set(data.map(d => d.CropName))
  allCropNames = [...names].sort((a, b) => a.localeCompare(b, 'zh-TW'))
}

function showSuggestions(query: string) {
  if (!query) {
    hideSuggestions()
    return
  }

  let matches = allCropNames.filter(n => n.includes(query))
  const resolved = resolveAlias(query, activeType)
  if (resolved) {
    const aliasMatches = allCropNames.filter(n => n.includes(resolved))
    const matchSet = new Set([...aliasMatches, ...matches])
    matches = [...matchSet]
  }
  matches = matches.slice(0, 10)

  if (matches.length === 0) {
    hideSuggestions()
    return
  }
  suggestionIndex = -1
  suggestionsEl.innerHTML = ''
  for (const name of matches) {
    const li = document.createElement('li')
    const idx = name.indexOf(query)
    if (idx >= 0) {
      li.innerHTML =
        escapeHTML(name.substring(0, idx)) +
        '<span class="match">' + escapeHTML(query) + '</span>' +
        escapeHTML(name.substring(idx + query.length))
    } else {
      li.innerHTML = escapeHTML(name)
    }

    const baseName = name.split('-')[0]
    const aliases = REVERSE_ALIASES[baseName] || REVERSE_ALIASES[name]
    if (aliases) {
      li.innerHTML += ' <span class="alias-hint">（' + escapeHTML(aliases[0]) + '）</span>'
    }

    li.addEventListener('mousedown', (e) => {
      e.preventDefault()
      selectSuggestion(name)
    })
    suggestionsEl.appendChild(li)
  }
  suggestionsEl.classList.remove('hidden')
}

function hideSuggestions() {
  suggestionsEl.classList.add('hidden')
  suggestionIndex = -1
}

function selectSuggestion(name: string) {
  searchInput.value = name
  hideSuggestions()
  refreshTable()
  updateClearBtn()
}

function navigateToDetail(cropName: string) {
  const regionParam = activeRegion !== 'all' ? `&region=${activeRegion}` : ''
  const typeParam = activeType !== 'veg' ? `&type=${activeType}` : ''
  window.location.href = `detail.html?crop=${encodeURIComponent(cropName)}${regionParam}${typeParam}`
}

// === Rendering ===
function showLoading(show: boolean) {
  loadingEl.classList.toggle('hidden', !show)
}

function showNoData(show: boolean) {
  noDataEl.classList.toggle('hidden', !show)
}

function filterAndAggregate(data: PriceRecord[]): AggregatedPrice[] {
  let filtered = data

  if (activeRegion !== 'all') {
    const regionMarkets = MARKETS[activeRegion].map(m => m.name)
    filtered = filtered.filter(d => regionMarkets.includes(d.MarketName))
  }

  if (activeCategory !== 'all') {
    filtered = filtered.filter(d => classifyCrop(d.CropName, activeType) === activeCategory)
  }

  if (activeSeason !== 'all') {
    filtered = filtered.filter(d => getSeasonStatus(d.CropName, activeType) === activeSeason)
  }

  const query = searchInput.value.trim()
  if (query) {
    const resolved = resolveAlias(query, activeType)
    filtered = filtered.filter(d =>
      d.CropName.includes(query) || (resolved !== null && d.CropName.includes(resolved))
    )
  }

  const map: Record<string, { CropName: string; totalQty: number; weightedPrice: number; upper: number; lower: number }> = {}
  for (const item of filtered) {
    const key = item.CropName
    if (!map[key]) {
      map[key] = { CropName: key, totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity }
    }
    map[key].totalQty += item.Trans_Quantity
    map[key].weightedPrice += item.Avg_Price * item.Trans_Quantity
    map[key].upper = Math.max(map[key].upper, item.Upper_Price)
    map[key].lower = Math.min(map[key].lower, item.Lower_Price)
  }

  return Object.values(map).map(d => ({
    CropName: d.CropName,
    Avg_Price: d.totalQty > 0 ? d.weightedPrice / d.totalQty : 0,
    Upper_Price: d.upper,
    Lower_Price: d.lower === Infinity ? 0 : d.lower,
    Trans_Quantity: d.totalQty,
  }))
}

function sortData(data: AggregatedPrice[]): AggregatedPrice[] {
  const { field, desc } = currentSort
  return [...data].sort((a, b) => {
    const va = (a as any)[field]
    const vb = (b as any)[field]
    if (typeof va === 'string') {
      return desc ? vb.localeCompare(va, 'zh-TW') : va.localeCompare(vb, 'zh-TW')
    }
    return desc ? vb - va : va - vb
  })
}

function renderTable(data: AggregatedPrice[]) {
  const sorted = sortData(data)
  priceTableBody.innerHTML = ''
  resultCount.textContent = `共 ${sorted.length} 筆`

  if (sorted.length === 0) {
    showNoData(true)
    renderPagination(0)
    return
  }
  showNoData(false)

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  if (currentPage > totalPages) currentPage = 1

  const display = showAll ? sorted : sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  for (const item of display) {
    const tr = document.createElement('tr')
    const season = getSeasonStatus(item.CropName, activeType)
    const seasonBadge = season === 'in-season'
      ? ' <span class="season-badge in-season">當季</span>'
      : season === 'off-season'
      ? ' <span class="season-badge off-season">非當季</span>'
      : ''
    tr.innerHTML = `
      <td class="crop-name">${escapeHTML(item.CropName)}${seasonBadge}</td>
      <td class="price-avg">${convertPrice(item.Avg_Price, activeUnit).toFixed(1)}</td>
      <td>${convertPrice(item.Upper_Price, activeUnit).toFixed(1)}</td>
      <td>${convertPrice(item.Lower_Price, activeUnit).toFixed(1)}</td>
      <td>${numberFormat(item.Trans_Quantity)}</td>
    `
    tr.addEventListener('click', () => navigateToDetail(item.CropName))
    priceTableBody.appendChild(tr)
  }

  renderPagination(sorted.length)
}

function renderPagination(totalItems: number) {
  const paginationEl = document.getElementById('pagination')!
  paginationEl.innerHTML = ''

  if (totalItems <= PAGE_SIZE) {
    paginationEl.classList.add('hidden')
    return
  }
  paginationEl.classList.remove('hidden')

  if (showAll) {
    const btn = document.createElement('button')
    btn.className = 'show-all-btn'
    btn.textContent = '收合分頁'
    btn.addEventListener('click', () => { showAll = false; currentPage = 1; refreshTable(false); scrollToTable() })
    paginationEl.appendChild(btn)
    return
  }

  const totalPages = Math.ceil(totalItems / PAGE_SIZE)

  const prev = document.createElement('button')
  prev.textContent = '<'
  prev.disabled = currentPage === 1
  prev.addEventListener('click', () => { currentPage--; refreshTable(false); scrollToTable() })
  paginationEl.appendChild(prev)

  const pages = getPageNumbers(currentPage, totalPages)
  for (const p of pages) {
    if (p === '...') {
      const dots = document.createElement('span')
      dots.className = 'page-dots'
      dots.textContent = '...'
      paginationEl.appendChild(dots)
    } else {
      const btn = document.createElement('button')
      btn.textContent = String(p)
      btn.classList.toggle('active', p === currentPage)
      btn.addEventListener('click', () => { currentPage = p as number; refreshTable(false); scrollToTable() })
      paginationEl.appendChild(btn)
    }
  }

  const next = document.createElement('button')
  next.textContent = '>'
  next.disabled = currentPage === totalPages
  next.addEventListener('click', () => { currentPage++; refreshTable(false); scrollToTable() })
  paginationEl.appendChild(next)

  const allBtn = document.createElement('button')
  allBtn.className = 'show-all-btn'
  allBtn.textContent = '顯示全部'
  allBtn.addEventListener('click', () => { showAll = true; refreshTable(false) })
  paginationEl.appendChild(allBtn)
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = []
  pages.push(1)
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

function scrollToTable() {
  document.getElementById('tableSection')!.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function updateTableHeaders() {
  const unitLabel = UNITS[activeUnit].short
  const headers = document.querySelectorAll('th[data-sort]')
  headers.forEach(th => {
    const field = (th as HTMLElement).dataset.sort
    if (field === 'Avg_Price') th.innerHTML = `平均價(${unitLabel}) &#x25B2;&#x25BC;`
    else if (field === 'Upper_Price') th.innerHTML = `上價(${unitLabel}) &#x25B2;&#x25BC;`
    else if (field === 'Lower_Price') th.innerHTML = `下價(${unitLabel}) &#x25B2;&#x25BC;`
  })
}

function refreshTable(resetPage = true) {
  if (resetPage) { currentPage = 1; showAll = false }
  updateTableHeaders()
  const aggregated = filterAndAggregate(todayData)
  renderTable(aggregated)
}

// === Event handlers ===
function handleSearch() {
  hideSuggestions()
  refreshTable()
  updateClearBtn()
}

const clearBtn = document.getElementById('clearSearch')!

function updateClearBtn() {
  const empty = searchInput.value.trim() === ''
  clearBtn.classList.toggle('hidden', empty)
  searchInput.classList.toggle('has-value', !empty)
}

clearBtn.addEventListener('click', () => {
  searchInput.value = ''
  hideSuggestions()
  refreshTable()
  updateClearBtn()
  searchInput.focus()
})

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim()
  showSuggestions(query)
  refreshTable()
  updateClearBtn()
})

searchInput.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('li')
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1)
    items.forEach((li, i) => li.classList.toggle('active', i === suggestionIndex))
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestionIndex = Math.max(suggestionIndex - 1, 0)
    items.forEach((li, i) => li.classList.toggle('active', i === suggestionIndex))
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (suggestionIndex >= 0 && items[suggestionIndex]) {
      const name = allCropNames.filter(n => n.includes(searchInput.value.trim()))[suggestionIndex]
      if (name) selectSuggestion(name)
    } else {
      handleSearch()
    }
  } else if (e.key === 'Escape') {
    hideSuggestions()
  }
})

searchInput.addEventListener('blur', () => {
  setTimeout(hideSuggestions, 150)
})

// Type toggle
function updateTypeUI() {
  REVERSE_ALIASES = buildReverseAliases(activeType)
  const isVeg = activeType === 'veg'
  searchInput.placeholder = isVeg
    ? '輸入蔬菜名稱，例如：高麗菜、空心菜...'
    : '輸入水果名稱，例如：香蕉、芒果...'

  const catContainer = document.getElementById('categoryTags')!
  const cats = isVeg ? CATEGORIES : FRUIT_CATEGORIES
  catContainer.innerHTML = '<button class="tag active" data-category="all">全部</button>'
  for (const [key, { label }] of Object.entries(cats)) {
    catContainer.innerHTML += `<button class="tag" data-category="${key}">${label}</button>`
  }
  catContainer.innerHTML += '<button class="tag" data-category="other">其他</button>'
  activeCategory = 'all'

  activeSeason = 'all'
  document.querySelectorAll('#seasonTags .tag').forEach(t => {
    (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.season === 'all')
  })
}

document.getElementById('typeToggle')!.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('.type-btn') as HTMLElement | null
  if (!btn || btn.dataset.type === activeType) return
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  activeType = btn.dataset.type as ActiveType
  ;(window as any).activeType = activeType
  updateTypeUI()
  searchInput.value = ''
  updateClearBtn()

  if (dataCache[activeType]) {
    todayData = dataCache[activeType]!
    ;(window as any).todayData = todayData
    buildCropNames(todayData)
    if (todayData.length > 0) {
      const rocDate = todayData[0].TransDate
      tableTitle.textContent = `${activeType === 'fruit' ? '水果' : '蔬菜'}價格一覽（${rocToDisplay(rocDate)}）`
      updateDataInfo(rocDate)
    }
    refreshTable()
  } else {
    init()
  }
})

// Region tags
document.getElementById('regionTags')!.addEventListener('click', e => {
  const tag = (e.target as HTMLElement).closest('.tag') as HTMLElement | null
  if (!tag) return
  document.querySelectorAll('#regionTags .tag').forEach(t => t.classList.remove('active'))
  tag.classList.add('active')
  activeRegion = tag.dataset.region!
  refreshTable()
})

// Unit tags
document.getElementById('unitTags')!.addEventListener('click', e => {
  const tag = (e.target as HTMLElement).closest('.tag') as HTMLElement | null
  if (!tag) return
  document.querySelectorAll('#unitTags .tag').forEach(t => t.classList.remove('active'))
  tag.classList.add('active')
  activeUnit = tag.dataset.unit as UnitKey
  localStorage.setItem('unit', activeUnit)
  refreshTable()
})

// Season tags
document.getElementById('seasonTags')!.addEventListener('click', e => {
  const tag = (e.target as HTMLElement).closest('.tag') as HTMLElement | null
  if (!tag) return
  document.querySelectorAll('#seasonTags .tag').forEach(t => t.classList.remove('active'))
  tag.classList.add('active')
  activeSeason = tag.dataset.season!
  refreshTable()
})

// Category tags
document.getElementById('categoryTags')!.addEventListener('click', e => {
  const tag = (e.target as HTMLElement).closest('.tag') as HTMLElement | null
  if (!tag) return
  document.querySelectorAll('#categoryTags .tag').forEach(t => t.classList.remove('active'))
  tag.classList.add('active')
  activeCategory = tag.dataset.category!
  refreshTable()
})

// Table sorting
document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = (th as HTMLElement).dataset.sort!
    if (currentSort.field === field) {
      currentSort.desc = !currentSort.desc
    } else {
      currentSort = { field, desc: field !== 'CropName' }
    }
    refreshTable()
  })
})

// === Restore saved unit ===
const savedUnit = localStorage.getItem('unit')
if (savedUnit && savedUnit in UNITS) {
  activeUnit = savedUnit as UnitKey
  document.querySelectorAll('#unitTags .tag').forEach(t => {
    (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.unit === activeUnit)
  })
}

// === Theme ===
initTheme()

// === Data info ===
const dataInfo = document.getElementById('dataInfo')!

function showDataInfo(rocDate: string, source: string) {
  const dateStr = rocToDisplay(rocDate)
  dataInfo.innerHTML = `<span class="info-icon">&#x1F4C5;</span> 最新資料：${dateStr}（每週日及國定假日休市）`
  if (source === 'static') {
    dataInfo.innerHTML += ' <span style="opacity:0.6">· 背景更新中...</span>'
  }
  dataInfo.classList.remove('hidden')
}

function updateDataInfo(rocDate: string) {
  const dateStr = rocToDisplay(rocDate)
  dataInfo.innerHTML = `<span class="info-icon">&#x1F4C5;</span> 最新資料：${dateStr}（每週日及國定假日休市）`
}

// === Init ===
async function init() {
  showLoading(true)
  try {
    todayData = await fetchTodayVegetables((partialData, rocDate) => {
      todayData = partialData
      ;(window as any).todayData = todayData
      dataCache[activeType] = partialData
      buildCropNames(partialData)
      tableTitle.textContent = `${activeType === 'fruit' ? '水果' : '蔬菜'}價格一覽（${rocToDisplay(rocDate)}）`
      showDataInfo(rocDate, 'static')
      showLoading(false)
      refreshTable()
    })

    dataCache[activeType] = todayData
    ;(window as any).todayData = todayData
    buildCropNames(todayData)
    if (todayData.length > 0) {
      const rocDate = todayData[0].TransDate
      tableTitle.textContent = `${activeType === 'fruit' ? '水果' : '蔬菜'}價格一覽（${rocToDisplay(rocDate)}）`
      updateDataInfo(rocDate)
    }
    refreshTable()
  } catch (err) {
    console.error('Failed to load data:', err)
    noDataEl.textContent = '載入失敗，請稍後重試'
    showNoData(true)
  } finally {
    showLoading(false)
  }
}

init()
