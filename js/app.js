const API_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const VEG_TYPE = 'N04';

// === All 17 markets grouped by region ===
const MARKETS = {
  north: [
    { code: 109, name: '台北一' },
    { code: 104, name: '台北二' },
    { code: 220, name: '板橋區' },
    { code: 241, name: '三重區' },
    { code: 260, name: '宜蘭市' },
    { code: 338, name: '桃農' },
  ],
  central: [
    { code: 400, name: '台中市' },
    { code: 420, name: '豐原區' },
    { code: 512, name: '永靖鄉' },
    { code: 514, name: '溪湖鎮' },
    { code: 540, name: '南投市' },
  ],
  south: [
    { code: 648, name: '西螺鎮' },
    { code: 800, name: '高雄市' },
    { code: 830, name: '鳳山區' },
    { code: 900, name: '屏東市' },
  ],
  east: [
    { code: 930, name: '台東市' },
    { code: 950, name: '花蓮市' },
  ],
};

const ALL_MARKET_CODES = Object.values(MARKETS).flat().map(m => m.code);

function getRegion(marketName) {
  for (const [region, markets] of Object.entries(MARKETS)) {
    if (markets.some(m => m.name === marketName)) return region;
  }
  return null;
}

// === Category classification ===
const CATEGORIES = {
  leafy: {
    label: '青菜',
    keywords: [
      '白菜','甘藍','菠菜','萵苣','油菜','芥菜','芥藍','茼蒿','蕹菜',
      '莧菜','青江','包心白','大心菜','西洋菜','皇宮菜','紅鳳菜','雪里紅',
      '榨菜','鹹菜','甘薯葉','藤川七','芹菜','芽菜',
      '花椰菜','青花苔','蕨菜','海菜','朴菜'
    ],
  },
  gourd: {
    label: '瓜類',
    keywords: [
      '花胡瓜','胡瓜','絲瓜','苦瓜','南瓜','冬瓜','扁蒲','隼人瓜','醃瓜'
    ],
  },
  root: {
    label: '根莖筍',
    keywords: [
      '蘿蔔','胡蘿蔔','馬鈴薯','甘薯','牛蒡','芋','蓮藕',
      '薯蕷','荸薺','菱角','竹筍','茭白筍','蘆筍','筍茸','熟筍','晚香玉筍',
      '球莖甘藍','萵苣莖','豆薯','金針筍','筍片','草石蠶'
    ],
  },
  spice: {
    label: '蔥薑蒜',
    keywords: [
      '青蔥','大蒜','薑','洋蔥','辣椒','九層塔','芫荽','巴西利',
      '茴香','香茅','韭菜','蕎頭'
    ],
  },
  fruit: {
    label: '瓜果茄',
    keywords: [
      '番茄','小番茄','茄子','甜椒','玉米','黃秋葵'
    ],
  },
  mushroom: {
    label: '菇類',
    keywords: [
      '杏鮑菇','秀珍菇','金絲菇','柳松菇','洋菇','木耳','香菇',
      '草菇','鴻喜菇','蠔菇','珊瑚菇','菇類'
    ],
  },
  bean: {
    label: '豆類',
    keywords: [
      '毛豆','敏豆','菜豆','豌豆','萊豆','虎豆','鵲豆','落花生'
    ],
  },
};

function classifyCrop(cropName) {
  for (const [cat, { keywords }] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => cropName.includes(kw))) return cat;
  }
  return 'other';
}

// === Common name aliases (俗稱 → API品名關鍵字) ===
const ALIASES = {
  '高麗菜': '甘藍', '包心菜': '甘藍', '捲心菜': '甘藍',
  '空心菜': '蕹菜', '甕菜': '蕹菜',
  '地瓜': '甘薯', '番薯': '甘薯', '蕃薯': '甘薯',
  '地瓜葉': '甘薯葉',
  '紅蘿蔔': '胡蘿蔔',
  '白蘿蔔': '蘿蔔',
  '菜頭': '蘿蔔',
  '蔥': '青蔥', '大蔥': '青蔥',
  '蒜': '大蒜', '蒜頭': '大蒜',
  '薯仔': '馬鈴薯', '土豆': '馬鈴薯',
  '山藥': '薯蕷',
  '香菜': '芫荽',
  '大黃瓜': '胡瓜',
  '小黃瓜': '花胡瓜',
  'A菜': '萵苣菜', 'a菜': '萵苣菜', '鵝仔菜': '萵苣菜',
  '美生菜': '萵苣菜', '蘿蔓': '萵苣菜', '羅美': '萵苣菜',
  '花菜': '花椰菜', '白花菜': '花椰菜',
  '青花菜': '青花苔', '綠花椰': '青花苔', '西蘭花': '青花苔',
  '大白菜': '包心白', '白菜': '包心白',
  '青江菜': '青江白菜',
  '小松菜': '油菜',
  '刈菜': '芥菜', '芥藍': '芥藍菜',
  '菜心': '大心菜',
  '豆芽': '芽菜類', '豆芽菜': '芽菜類', '銀芽': '芽菜類',
  '金針菇': '金絲菇',
  '四季豆': '敏豆',
  '荷蘭豆': '豌豆', '碗豆': '豌豆',
  '筊白筍': '茭白筍', '美人腿': '茭白筍',
  '佛手瓜': '隼人瓜', '龍鬚菜': '隼人瓜',
  '蒲瓜': '扁蒲', '蒲仔': '扁蒲', '菜瓜': '扁蒲',
  '青椒': '甜椒', '彩椒': '甜椒',
  '秋葵': '黃秋葵',
  '木耳': '濕木耳', '黑木耳': '濕木耳',
  '香菇': '濕香菇',
  '過貓': '蕨菜', '山蘇': '蕨菜',
  '花生': '落花生',
  '皇帝菜': '茼蒿', '打某菜': '茼蒿',
  '莧菜': '莧菜', '紅莧菜': '莧菜',
  '水蓮': '海菜',
  '川七': '藤川七',
  '鮑魚菇': '蠔菇',
  '杏鮑菇': '杏鮑菇',
  '秀珍菇': '秀珍菇',
  '大陸妹': '萵苣菜',
};

// Build reverse map: API name → list of aliases
const REVERSE_ALIASES = {};
for (const [alias, apiName] of Object.entries(ALIASES)) {
  if (!REVERSE_ALIASES[apiName]) REVERSE_ALIASES[apiName] = [];
  REVERSE_ALIASES[apiName].push(alias);
}

// Get display name with alias hint
function getDisplayName(cropName) {
  // Find the base name (before the dash)
  const baseName = cropName.split('-')[0];
  const aliases = REVERSE_ALIASES[baseName] || REVERSE_ALIASES[cropName];
  if (aliases && aliases.length > 0) {
    // Pick the most common alias (first one)
    return `${cropName}（${aliases[0]}）`;
  }
  return cropName;
}

// Resolve search query: if user types an alias, return the API name
function resolveAlias(query) {
  // Exact alias match
  if (ALIASES[query]) return ALIASES[query];
  // Partial alias match
  for (const [alias, apiName] of Object.entries(ALIASES)) {
    if (alias.includes(query) || query.includes(alias)) return apiName;
  }
  return null;
}

// === DOM elements ===
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('searchSuggestions');
const tableTitle = document.getElementById('tableTitle');
const resultCount = document.getElementById('resultCount');
const priceTableBody = document.getElementById('priceTableBody');
const loadingEl = document.getElementById('loading');
const noDataEl = document.getElementById('noData');

let currentSort = { field: 'Avg_Price', desc: true };
let todayData = [];
let allCropNames = [];
let activeCategory = 'all';
let activeRegion = 'all';
let suggestionIndex = -1;

// === Date helpers (ROC calendar) ===
function toROCDate(date) {
  const y = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function rocToDisplay(rocDate) {
  const parts = rocDate.split('.');
  const year = parseInt(parts[0]) + 1911;
  return `${year}/${parts[1]}/${parts[2]}`;
}

// === API ===
async function fetchAPI(params) {
  const url = new URL(API_BASE);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  const json = await resp.json();
  return (json.Data || []).filter(d => d.CropName !== '休市');
}

async function fetchStaticJSON(filename) {
  try {
    const resp = await fetch(`data/${filename}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    return (json.Data || []).filter(d => d.CropName !== '休市');
  } catch {
    return null;
  }
}

// Fetch a batch of market codes in parallel
async function fetchMarketBatch(rocDate, codes) {
  const promises = codes.map(code =>
    fetchAPI({
      Start_time: rocDate,
      End_time: rocDate,
      TcType: VEG_TYPE,
      MarketCode: code,
    }).catch(() => [])
  );
  const results = await Promise.all(promises);
  return results.flat();
}

// Find the latest trading date (try today, then go back)
async function findLatestDate() {
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const rocDate = toROCDate(date);
    // Quick check with just one market
    const test = await fetchAPI({
      Start_time: rocDate,
      End_time: rocDate,
      TcType: VEG_TYPE,
      MarketCode: 109,
    }).catch(() => []);
    if (test.length > 0) return rocDate;
  }
  return null;
}

async function fetchTodayVegetables(onPartialData) {
  // Strategy: static JSON first (fast), then API in background (complete)

  // Phase 1: Try static JSON for instant display
  const staticData = await fetchStaticJSON('today.json');
  if (staticData && staticData.length > 0 && onPartialData) {
    onPartialData(staticData, staticData[0].TransDate);
  }

  // Phase 2: Fetch fresh data from API
  try {
    const rocDate = await findLatestDate();
    if (!rocDate) {
      // API found nothing, use static data if we have it
      if (staticData && staticData.length > 0) return staticData;
      throw new Error('No recent data found');
    }

    // Fetch all markets
    const quickCodes = [109, 104, 800, 400];
    const quickData = await fetchMarketBatch(rocDate, quickCodes);
    const remainingCodes = ALL_MARKET_CODES.filter(c => !quickCodes.includes(c));
    const restData = await fetchMarketBatch(rocDate, remainingCodes);
    const allData = [...quickData, ...restData];

    if (allData.length > 0) return allData;
  } catch (err) {
    console.warn('Live API failed:', err.message);
  }

  // Fallback to static data
  if (staticData && staticData.length > 0) return staticData;
  return [];
}

// === Autocomplete / Suggestions ===
function buildCropNames(data) {
  const names = new Set(data.map(d => d.CropName));
  allCropNames = [...names].sort((a, b) => a.localeCompare(b, 'zh-TW'));
}

function showSuggestions(query) {
  if (!query) {
    hideSuggestions();
    return;
  }

  // Direct matches
  let matches = allCropNames.filter(n => n.includes(query));

  // Alias matches: if query matches an alias, add the corresponding API names
  const resolved = resolveAlias(query);
  if (resolved) {
    const aliasMatches = allCropNames.filter(n => n.includes(resolved));
    // Merge without duplicates, alias matches first
    const matchSet = new Set([...aliasMatches, ...matches]);
    matches = [...matchSet];
  }

  matches = matches.slice(0, 10);

  if (matches.length === 0) {
    hideSuggestions();
    return;
  }
  suggestionIndex = -1;
  suggestionsEl.innerHTML = '';
  for (const name of matches) {
    const li = document.createElement('li');
    const displayName = getDisplayName(name);

    // Highlight matching part
    const idx = name.indexOf(query);
    if (idx >= 0) {
      li.innerHTML =
        escapeHTML(name.substring(0, idx)) +
        '<span class="match">' + escapeHTML(query) + '</span>' +
        escapeHTML(name.substring(idx + query.length));
    } else {
      li.innerHTML = escapeHTML(name);
    }

    // Add alias hint if exists
    const baseName = name.split('-')[0];
    const aliases = REVERSE_ALIASES[baseName] || REVERSE_ALIASES[name];
    if (aliases) {
      li.innerHTML += ' <span class="alias-hint">（' + escapeHTML(aliases[0]) + '）</span>';
    }

    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectSuggestion(name);
    });
    suggestionsEl.appendChild(li);
  }
  suggestionsEl.classList.remove('hidden');
}

function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionIndex = -1;
}

function selectSuggestion(name) {
  searchInput.value = name;
  hideSuggestions();
  refreshTable();
  updateClearBtn();
}

function navigateToDetail(cropName) {
  const regionParam = activeRegion !== 'all' ? `&region=${activeRegion}` : '';
  window.location.href = `detail.html?crop=${encodeURIComponent(cropName)}${regionParam}`;
}

// === Rendering ===
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function showNoData(show) {
  noDataEl.classList.toggle('hidden', !show);
}

function filterAndAggregate(data) {
  let filtered = data;

  // Region filter
  if (activeRegion !== 'all') {
    const regionMarkets = MARKETS[activeRegion].map(m => m.name);
    filtered = filtered.filter(d => regionMarkets.includes(d.MarketName));
  }

  // Category filter
  if (activeCategory !== 'all') {
    filtered = filtered.filter(d => classifyCrop(d.CropName) === activeCategory);
  }

  // Search filter (supports aliases)
  const query = searchInput.value.trim();
  if (query) {
    const resolved = resolveAlias(query);
    filtered = filtered.filter(d =>
      d.CropName.includes(query) || (resolved && d.CropName.includes(resolved))
    );
  }

  // Aggregate by crop name
  const map = {};
  for (const item of filtered) {
    const key = item.CropName;
    if (!map[key]) {
      map[key] = { CropName: key, totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity };
    }
    map[key].totalQty += item.Trans_Quantity;
    map[key].weightedPrice += item.Avg_Price * item.Trans_Quantity;
    map[key].upper = Math.max(map[key].upper, item.Upper_Price);
    map[key].lower = Math.min(map[key].lower, item.Lower_Price);
  }

  return Object.values(map).map(d => ({
    CropName: d.CropName,
    Avg_Price: d.totalQty > 0 ? d.weightedPrice / d.totalQty : 0,
    Upper_Price: d.upper,
    Lower_Price: d.lower === Infinity ? 0 : d.lower,
    Trans_Quantity: d.totalQty,
  }));
}

function sortData(data) {
  const { field, desc } = currentSort;
  return [...data].sort((a, b) => {
    let va = a[field], vb = b[field];
    if (typeof va === 'string') {
      return desc ? vb.localeCompare(va, 'zh-TW') : va.localeCompare(vb, 'zh-TW');
    }
    return desc ? vb - va : va - vb;
  });
}

function renderTable(data) {
  const sorted = sortData(data);
  priceTableBody.innerHTML = '';
  resultCount.textContent = `共 ${sorted.length} 筆`;

  if (sorted.length === 0) {
    showNoData(true);
    return;
  }
  showNoData(false);

  for (const item of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="crop-name">${escapeHTML(item.CropName)}</td>
      <td class="price-avg">${item.Avg_Price.toFixed(1)}</td>
      <td>${item.Upper_Price.toFixed(1)}</td>
      <td>${item.Lower_Price.toFixed(1)}</td>
      <td>${numberFormat(item.Trans_Quantity)}</td>
    `;
    tr.addEventListener('click', () => navigateToDetail(item.CropName));
    priceTableBody.appendChild(tr);
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function numberFormat(n) {
  return Math.round(n).toLocaleString('zh-TW');
}

function refreshTable() {
  const aggregated = filterAndAggregate(todayData);
  renderTable(aggregated);
}

// === Event handlers ===
function handleSearch() {
  hideSuggestions();
  refreshTable();
  updateClearBtn();
}

// Clear button
const clearBtn = document.getElementById('clearSearch');

function updateClearBtn() {
  clearBtn.classList.toggle('hidden', searchInput.value.trim() === '');
}

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  hideSuggestions();
  refreshTable();
  updateClearBtn();
  searchInput.focus();
});

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  showSuggestions(query);
  refreshTable();
  updateClearBtn();
});

searchInput.addEventListener('keydown', e => {
  const items = suggestionsEl.querySelectorAll('li');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1);
    items.forEach((li, i) => li.classList.toggle('active', i === suggestionIndex));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    suggestionIndex = Math.max(suggestionIndex - 1, 0);
    items.forEach((li, i) => li.classList.toggle('active', i === suggestionIndex));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (suggestionIndex >= 0 && items[suggestionIndex]) {
      const name = allCropNames.filter(n => n.includes(searchInput.value.trim()))[suggestionIndex];
      if (name) selectSuggestion(name);
    } else {
      handleSearch();
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
});

searchInput.addEventListener('blur', () => {
  setTimeout(hideSuggestions, 150);
});

// Region tags
document.getElementById('regionTags').addEventListener('click', e => {
  const tag = e.target.closest('.tag');
  if (!tag) return;
  document.querySelectorAll('#regionTags .tag').forEach(t => t.classList.remove('active'));
  tag.classList.add('active');
  activeRegion = tag.dataset.region;
  refreshTable();
});

// Category tags
document.getElementById('categoryTags').addEventListener('click', e => {
  const tag = e.target.closest('.tag');
  if (!tag) return;
  document.querySelectorAll('#categoryTags .tag').forEach(t => t.classList.remove('active'));
  tag.classList.add('active');
  activeCategory = tag.dataset.category;
  refreshTable();
});

// Table sorting
document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    if (currentSort.field === field) {
      currentSort.desc = !currentSort.desc;
    } else {
      currentSort = { field, desc: field !== 'CropName' };
    }
    refreshTable();
  });
});

// === Theme toggle ===
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.checked = theme === 'dark';
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  applyTheme(savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  applyTheme('dark');
} else {
  applyTheme('light');
}

themeToggle.addEventListener('change', () => {
  const next = themeToggle.checked ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('theme', next);
});

// === Data info display ===
const dataInfo = document.getElementById('dataInfo');

function showDataInfo(rocDate, source) {
  const dateStr = rocToDisplay(rocDate);
  dataInfo.innerHTML = `<span class="info-icon">&#x1F4C5;</span> 最新資料：${dateStr}（每週日及國定假日休市）`;
  if (source === 'static') {
    dataInfo.innerHTML += ' <span style="opacity:0.6">· 背景更新中...</span>';
  }
  dataInfo.classList.remove('hidden');
}

function updateDataInfo(rocDate) {
  const dateStr = rocToDisplay(rocDate);
  dataInfo.innerHTML = `<span class="info-icon">&#x1F4C5;</span> 最新資料：${dateStr}（每週日及國定假日休市）`;
}

// === Init ===
async function init() {
  showLoading(true);
  try {
    todayData = await fetchTodayVegetables((partialData, rocDate) => {
      // Static JSON loaded — show instantly
      todayData = partialData;
      buildCropNames(partialData);
      tableTitle.textContent = `蔬菜價格一覽（${rocToDisplay(rocDate)}）`;
      showDataInfo(rocDate, 'static');
      showLoading(false);
      refreshTable();
    });

    // Full API data ready
    buildCropNames(todayData);
    if (todayData.length > 0) {
      const rocDate = todayData[0].TransDate;
      tableTitle.textContent = `蔬菜價格一覽（${rocToDisplay(rocDate)}）`;
      updateDataInfo(rocDate);
    }
    refreshTable();
  } catch (err) {
    console.error('Failed to load data:', err);
    noDataEl.textContent = '載入失敗，請稍後重試';
    showNoData(true);
  } finally {
    showLoading(false);
  }
}

init();
