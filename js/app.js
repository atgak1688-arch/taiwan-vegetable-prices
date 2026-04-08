const API_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const VEG_TYPE = 'N04';

// === Category classification ===
const CATEGORIES = {
  leafy: {
    keywords: [
      '白菜','甘藍','菠菜','萵苣','油菜','芥菜','芥藍','茼蒿','蕹菜',
      '莧菜','青江','包心白','大心菜','西洋菜','皇宮菜','紅鳳菜','雪里紅',
      '榨菜','鹹菜','甘薯葉','芫荽','巴西利','九層塔','茴香','香茅',
      '韭菜','藤川七','青蔥','石蓮花','芹菜','芽菜','水蓮'
    ],
  },
  root: {
    keywords: [
      '蘿蔔','胡蘿蔔','馬鈴薯','甘薯','薑','牛蒡','洋蔥','芋','蓮藕',
      '薯蕷','荸薺','菱角','竹筍','茭白筍','蘆筍','筍茸','熟筍','晚香玉筍',
      '球莖甘藍','萵苣莖','大蒜','豆薯','金針筍'
    ],
  },
  gourd: {
    keywords: [
      '花胡瓜','胡瓜','絲瓜','苦瓜','南瓜','冬瓜','扁蒲','隼人瓜',
      '番茄','小番茄','茄子','甜椒','辣椒','玉米','黃秋葵','醃瓜',
      '花椰菜','青花苔'
    ],
  },
  bean: {
    keywords: [
      '毛豆','敏豆','菜豆','豌豆','萊豆','虎豆','鵲豆','落花生'
    ],
  },
  mushroom: {
    keywords: [
      '杏鮑菇','秀珍菇','金絲菇','柳松菇','洋菇','木耳','香菇',
      '草菇','鴻喜菇','蠔菇','珊瑚菇','菇類','蕨菜','海菜'
    ],
  },
};

function classifyCrop(cropName) {
  for (const [cat, { keywords }] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => cropName.includes(kw))) return cat;
  }
  return 'other';
}

// === DOM elements ===
const searchInput = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('searchSuggestions');
const marketSelect = document.getElementById('marketSelect');
const tableTitle = document.getElementById('tableTitle');
const resultCount = document.getElementById('resultCount');
const priceTableBody = document.getElementById('priceTableBody');
const loadingEl = document.getElementById('loading');
const noDataEl = document.getElementById('noData');

let currentSort = { field: 'Avg_Price', desc: true };
let todayData = [];
let allCropNames = [];
let activeCategory = 'all';
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

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: toROCDate(start), end: toROCDate(end) };
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

async function fetchTodayVegetables() {
  try {
    for (let offset = 0; offset < 5; offset++) {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      const rocDate = toROCDate(date);
      const data = await fetchAPI({
        Start_time: rocDate,
        End_time: rocDate,
        TcType: VEG_TYPE,
      });
      if (data.length > 0) return data;
    }
  } catch (err) {
    console.warn('Live API failed, trying static data:', err.message);
  }
  const staticData = await fetchStaticJSON('today.json');
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
  const matches = allCropNames.filter(n => n.includes(query)).slice(0, 8);
  if (matches.length === 0) {
    hideSuggestions();
    return;
  }
  suggestionIndex = -1;
  suggestionsEl.innerHTML = '';
  for (const name of matches) {
    const li = document.createElement('li');
    const idx = name.indexOf(query);
    li.innerHTML =
      escapeHTML(name.substring(0, idx)) +
      '<span class="match">' + escapeHTML(query) + '</span>' +
      escapeHTML(name.substring(idx + query.length));
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
  navigateToDetail(name);
}

function navigateToDetail(cropName) {
  window.location.href = `detail.html?crop=${encodeURIComponent(cropName)}`;
}

// === Rendering ===
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function showNoData(show) {
  noDataEl.classList.toggle('hidden', !show);
}

function populateMarkets(data) {
  const markets = new Set(data.map(d => d.MarketName));
  marketSelect.innerHTML = '<option value="">全部市場</option>';
  for (const m of [...markets].sort()) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    marketSelect.appendChild(opt);
  }
}

function filterData(data) {
  let filtered = data;

  // Category filter
  if (activeCategory !== 'all') {
    filtered = filtered.filter(d => classifyCrop(d.CropName) === activeCategory);
  }

  // Search filter
  const query = searchInput.value.trim();
  if (query) {
    filtered = filtered.filter(d => d.CropName.includes(query));
  }

  // Market filter
  const market = marketSelect.value;
  if (market) {
    filtered = filtered.filter(d => d.MarketName === market);
  }

  return filtered;
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
      <td class="hide-mobile">${escapeHTML(item.MarketName)}</td>
      <td class="price-avg">${item.Avg_Price.toFixed(1)}</td>
      <td class="hide-mobile">${item.Upper_Price.toFixed(1)}</td>
      <td class="hide-mobile">${item.Lower_Price.toFixed(1)}</td>
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
  const filtered = filterData(todayData);
  renderTable(filtered);
}

// === Event handlers ===
function handleSearch() {
  hideSuggestions();
  const query = searchInput.value.trim();
  if (query) {
    const exactMatch = todayData.some(d => d.CropName === query);
    if (exactMatch) {
      navigateToDetail(query);
      return;
    }
  }
  refreshTable();
}

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  showSuggestions(query);
  refreshTable();
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

marketSelect.addEventListener('change', refreshTable);

// Category tags
document.getElementById('categoryTags').addEventListener('click', e => {
  const tag = e.target.closest('.tag');
  if (!tag) return;
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
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

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  applyTheme(savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  applyTheme('dark');
} else {
  applyTheme('light');
}

themeToggle.addEventListener('click', () => {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('theme', next);
});

// === Init ===
async function init() {
  showLoading(true);
  try {
    todayData = await fetchTodayVegetables();
    buildCropNames(todayData);
    populateMarkets(todayData);
    if (todayData.length > 0) {
      tableTitle.textContent = `蔬菜價格一覽（${rocToDisplay(todayData[0].TransDate)}）`;
    }
    renderTable(todayData);
  } catch (err) {
    console.error('Failed to load data:', err);
    noDataEl.textContent = '載入失敗，請稍後重試';
    showNoData(true);
  } finally {
    showLoading(false);
  }
}

init();
