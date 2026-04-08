const API_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const VEG_TYPE = 'N04';

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const marketSelect = document.getElementById('marketSelect');
const dateRange = document.getElementById('dateRange');
const summarySection = document.getElementById('summary');
const summaryTitle = document.getElementById('summaryTitle');
const updateTime = document.getElementById('updateTime');
const avgPriceEl = document.getElementById('avgPrice');
const upperPriceEl = document.getElementById('upperPrice');
const lowerPriceEl = document.getElementById('lowerPrice');
const transQtyEl = document.getElementById('transQty');
const chartSection = document.getElementById('chartSection');
const tableSection = document.getElementById('tableSection');
const tableTitle = document.getElementById('tableTitle');
const priceTableBody = document.getElementById('priceTableBody');
const loadingEl = document.getElementById('loading');
const noDataEl = document.getElementById('noData');

let priceChart = null;
let currentSort = { field: 'Avg_Price', desc: true };
let todayData = [];
let allMarkets = new Set();

// === Date helpers (ROC calendar) ===
function toROCDate(date) {
  const y = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function rocToDisplay(rocDate) {
  // "115.04.08" -> "2026/04/08"
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
  // Try live API first
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
  // Fallback to static JSON from GitHub Actions
  const staticData = await fetchStaticJSON('today.json');
  if (staticData && staticData.length > 0) return staticData;
  return [];
}

async function fetchHistory(cropName, days) {
  const { start, end } = getDateRange(days);
  try {
    return await fetchAPI({
      Start_time: start,
      End_time: end,
      CropName: cropName,
      TcType: VEG_TYPE,
    });
  } catch (err) {
    console.warn('Live API failed for history, trying static data:', err.message);
    // Fallback to static history
    const staticData = await fetchStaticJSON('history.json');
    if (staticData) {
      return staticData.filter(d => d.CropName === cropName);
    }
    return [];
  }
}

// === Rendering ===
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function showNoData(show) {
  noDataEl.classList.toggle('hidden', !show);
}

function populateMarkets(data) {
  allMarkets = new Set(data.map(d => d.MarketName));
  marketSelect.innerHTML = '<option value="">全部市場</option>';
  for (const m of [...allMarkets].sort()) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    marketSelect.appendChild(opt);
  }
}

function filterData(data) {
  let filtered = data;
  const query = searchInput.value.trim();
  if (query) {
    filtered = filtered.filter(d => d.CropName.includes(query));
  }
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
  if (sorted.length === 0) {
    showNoData(true);
    return;
  }
  showNoData(false);
  for (const item of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="crop-name">${escapeHTML(item.CropName)}</td>
      <td>${escapeHTML(item.MarketName)}</td>
      <td class="price-avg">${item.Avg_Price.toFixed(1)}</td>
      <td>${item.Upper_Price.toFixed(1)}</td>
      <td>${item.Lower_Price.toFixed(1)}</td>
      <td>${numberFormat(item.Trans_Quantity)}</td>
    `;
    tr.addEventListener('click', () => showDetail(item.CropName));
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

// === Detail view (summary + chart) ===
async function showDetail(cropName) {
  searchInput.value = cropName;
  summarySection.classList.remove('hidden');
  chartSection.classList.remove('hidden');
  summaryTitle.textContent = cropName;

  // Show today's summary (aggregate across markets)
  const todayFiltered = todayData.filter(d => d.CropName === cropName);
  if (todayFiltered.length > 0) {
    const avgP = todayFiltered.reduce((s, d) => s + d.Avg_Price * d.Trans_Quantity, 0) /
                 todayFiltered.reduce((s, d) => s + d.Trans_Quantity, 0);
    const upperP = Math.max(...todayFiltered.map(d => d.Upper_Price));
    const lowerP = Math.min(...todayFiltered.map(d => d.Lower_Price));
    const totalQ = todayFiltered.reduce((s, d) => s + d.Trans_Quantity, 0);
    avgPriceEl.textContent = avgP.toFixed(1);
    upperPriceEl.textContent = upperP.toFixed(1);
    lowerPriceEl.textContent = lowerP.toFixed(1);
    transQtyEl.textContent = numberFormat(totalQ);
    updateTime.textContent = `交易日期：${rocToDisplay(todayFiltered[0].TransDate)}`;
  }

  // Fetch history for chart
  const days = parseInt(dateRange.value);
  const history = await fetchHistory(cropName, days);

  // Aggregate by date
  const byDate = {};
  for (const item of history) {
    const date = item.TransDate;
    if (!byDate[date]) {
      byDate[date] = { totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity };
    }
    byDate[date].totalQty += item.Trans_Quantity;
    byDate[date].weightedPrice += item.Avg_Price * item.Trans_Quantity;
    byDate[date].upper = Math.max(byDate[date].upper, item.Upper_Price);
    byDate[date].lower = Math.min(byDate[date].lower, item.Lower_Price);
  }

  const dates = Object.keys(byDate).sort();
  const labels = dates.map(rocToDisplay);
  const avgPrices = dates.map(d => (byDate[d].weightedPrice / byDate[d].totalQty).toFixed(1));
  const upperPrices = dates.map(d => byDate[d].upper.toFixed(1));
  const lowerPrices = dates.map(d => byDate[d].lower.toFixed(1));

  renderChart(labels, avgPrices, upperPrices, lowerPrices);

  // Also filter table
  const filtered = filterData(todayData);
  renderTable(filtered);
}

function renderChart(labels, avgPrices, upperPrices, lowerPrices) {
  if (priceChart) priceChart.destroy();

  const ctx = document.getElementById('priceChart').getContext('2d');
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '平均價',
          data: avgPrices,
          borderColor: '#4caf50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderWidth: 2.5,
          fill: false,
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
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} 元/公斤`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: '元/公斤' },
          beginAtZero: false,
        },
        x: {
          ticks: {
            maxRotation: 45,
            maxTicksLimit: 15,
          },
        },
      },
    },
  });
}

// === Event handlers ===
function handleSearch() {
  const query = searchInput.value.trim();
  if (query) {
    // Check if it's an exact crop name
    const exactMatch = todayData.some(d => d.CropName === query);
    if (exactMatch) {
      showDetail(query);
      return;
    }
    // Partial match - just filter table
    summarySection.classList.add('hidden');
    chartSection.classList.add('hidden');
  } else {
    summarySection.classList.add('hidden');
    chartSection.classList.add('hidden');
  }
  const filtered = filterData(todayData);
  renderTable(filtered);
}

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearch();
});
marketSelect.addEventListener('change', () => {
  const filtered = filterData(todayData);
  renderTable(filtered);
});
dateRange.addEventListener('change', () => {
  const query = searchInput.value.trim();
  if (query && todayData.some(d => d.CropName === query)) {
    showDetail(query);
  }
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
    const filtered = filterData(todayData);
    renderTable(filtered);
  });
});

// === Init ===
async function init() {
  showLoading(true);
  try {
    todayData = await fetchTodayVegetables();
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

// === Theme toggle ===
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.setAttribute('data-theme', 'dark');
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

init();
