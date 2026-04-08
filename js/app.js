const API_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const VEG_TYPE = 'N04';

// Region mapping
const REGIONS = {
  '北部': ['台北一', '台北二', '三重區', '板橋區', '桃農'],
  '中部': ['台中市'],
};

function getRegion(marketName) {
  for (const [region, markets] of Object.entries(REGIONS)) {
    if (markets.includes(marketName)) return region;
  }
  return '其他';
}

// DOM elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const marketSelect = document.getElementById('marketSelect');
const dateRange = document.getElementById('dateRange');
const summarySection = document.getElementById('summary');
const summaryTitle = document.getElementById('summaryTitle');
const updateTime = document.getElementById('updateTime');
const avgPriceEl = document.getElementById('avgPrice');
const transQtyEl = document.getElementById('transQty');
const chartSection = document.getElementById('chartSection');
const tableTitle = document.getElementById('tableTitle');
const priceTableBody = document.getElementById('priceTableBody');
const loadingEl = document.getElementById('loading');
const noDataEl = document.getElementById('noData');

let priceChart = null;
let currentSort = { field: 'Avg_Price', desc: true };
let rawData = [];       // raw API data
let todayData = [];     // aggregated (deduplicated) data

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

// === Aggregate: merge same CropName into one row ===
function aggregateByCrop(data) {
  const map = {};
  for (const item of data) {
    const key = item.CropName;
    if (!map[key]) {
      map[key] = { CropName: key, totalQty: 0, weightedPrice: 0 };
    }
    map[key].totalQty += item.Trans_Quantity;
    map[key].weightedPrice += item.Avg_Price * item.Trans_Quantity;
  }
  return Object.values(map).map(d => ({
    CropName: d.CropName,
    Avg_Price: d.totalQty > 0 ? d.weightedPrice / d.totalQty : 0,
    Trans_Quantity: d.totalQty,
  }));
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

function filterByRegion(data) {
  const region = marketSelect.value;
  if (!region) return data;
  const markets = REGIONS[region] || [];
  return data.filter(d => markets.includes(d.MarketName));
}

function filterAndAggregate() {
  // 1. Filter raw data by region
  let filtered = filterByRegion(rawData);
  // 2. Filter by search query
  const query = searchInput.value.trim();
  if (query) {
    filtered = filtered.filter(d => d.CropName.includes(query));
  }
  // 3. Aggregate same crop names
  return aggregateByCrop(filtered);
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
      <td class="price-avg">${item.Avg_Price.toFixed(1)}</td>
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

  // Summary from raw data (filtered by region)
  let filtered = filterByRegion(rawData).filter(d => d.CropName === cropName);
  if (filtered.length > 0) {
    const totalQty = filtered.reduce((s, d) => s + d.Trans_Quantity, 0);
    const avgP = filtered.reduce((s, d) => s + d.Avg_Price * d.Trans_Quantity, 0) / totalQty;
    avgPriceEl.textContent = avgP.toFixed(1);
    transQtyEl.textContent = numberFormat(totalQty);
    updateTime.textContent = `交易日期：${rocToDisplay(filtered[0].TransDate)}`;
  }

  // Fetch history for chart
  const days = parseInt(dateRange.value);
  let history = await fetchHistory(cropName, days);

  // Apply region filter to history too
  const region = marketSelect.value;
  if (region) {
    const markets = REGIONS[region] || [];
    history = history.filter(d => markets.includes(d.MarketName));
  }

  // Aggregate by date
  const byDate = {};
  for (const item of history) {
    const date = item.TransDate;
    if (!byDate[date]) {
      byDate[date] = { totalQty: 0, weightedPrice: 0 };
    }
    byDate[date].totalQty += item.Trans_Quantity;
    byDate[date].weightedPrice += item.Avg_Price * item.Trans_Quantity;
  }

  const dates = Object.keys(byDate).sort();
  const labels = dates.map(rocToDisplay);
  const avgPrices = dates.map(d => (byDate[d].weightedPrice / byDate[d].totalQty).toFixed(1));

  renderChart(labels, avgPrices);

  // Update table
  const tableData = filterAndAggregate();
  renderTable(tableData);
}

function renderChart(labels, avgPrices) {
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
          backgroundColor: 'rgba(76, 175, 80, 0.15)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#4caf50',
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
        legend: { display: false },
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
    const exactMatch = todayData.some(d => d.CropName === query);
    if (exactMatch) {
      showDetail(query);
      return;
    }
    summarySection.classList.add('hidden');
    chartSection.classList.add('hidden');
  } else {
    summarySection.classList.add('hidden');
    chartSection.classList.add('hidden');
  }
  const tableData = filterAndAggregate();
  renderTable(tableData);
}

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearch();
});
marketSelect.addEventListener('change', () => {
  const tableData = filterAndAggregate();
  renderTable(tableData);
  // If detail is open, refresh it
  const query = searchInput.value.trim();
  if (query && !summarySection.classList.contains('hidden')) {
    showDetail(query);
  }
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
    const tableData = filterAndAggregate();
    renderTable(tableData);
  });
});

// === Init ===
async function init() {
  showLoading(true);
  try {
    rawData = await fetchTodayVegetables();
    todayData = aggregateByCrop(rawData);
    if (rawData.length > 0) {
      tableTitle.textContent = `蔬菜價格一覽（${rocToDisplay(rawData[0].TransDate)}）`;
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
