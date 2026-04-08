const API_BASE = 'https://data.moa.gov.tw/api/v1/AgriProductsTransType/';
const VEG_TYPE = 'N04';

// === Markets by region (same as app.js) ===
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

const REGION_NAMES = {
  north: '北部',
  central: '中部',
  south: '南部',
  east: '東部',
};

// Get params from URL
const urlParams = new URLSearchParams(window.location.search);
const cropName = urlParams.get('crop');
const regionParam = urlParams.get('region'); // null = all

function getMarketCodes() {
  if (regionParam && MARKETS[regionParam]) {
    return MARKETS[regionParam].map(m => m.code);
  }
  return Object.values(MARKETS).flat().map(m => m.code);
}

function getMarketNames() {
  if (regionParam && MARKETS[regionParam]) {
    return MARKETS[regionParam].map(m => m.name);
  }
  return Object.values(MARKETS).flat().map(m => m.name);
}

// DOM
const cropTitle = document.getElementById('cropTitle');
const detailDate = document.getElementById('detailDate');
const avgPriceEl = document.getElementById('avgPrice');
const upperPriceEl = document.getElementById('upperPrice');
const lowerPriceEl = document.getElementById('lowerPrice');
const transQtyEl = document.getElementById('transQty');
const marketCardsEl = document.getElementById('marketCards');
const loadingEl = document.getElementById('loading');
const noDataEl = document.getElementById('noData');

let priceChart = null;

// === Date helpers ===
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

async function fetchTodayForCrop(name) {
  const codes = getMarketCodes();
  for (let offset = 0; offset < 5; offset++) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const rocDate = toROCDate(date);
    // Fetch all markets in parallel
    const promises = codes.map(code =>
      fetchAPI({
        Start_time: rocDate,
        End_time: rocDate,
        CropName: name,
        TcType: VEG_TYPE,
        MarketCode: code,
      }).catch(() => [])
    );
    const results = await Promise.all(promises);
    const data = results.flat();
    if (data.length > 0) return data;
  }
  return [];
}

async function fetchHistory(name, days) {
  const { start, end } = getDateRange(days);
  // For history, use a single request without MarketCode (faster)
  // then filter by region market names
  try {
    const data = await fetchAPI({
      Start_time: start,
      End_time: end,
      CropName: name,
      TcType: VEG_TYPE,
    });
    const validMarkets = getMarketNames();
    return data.filter(d => validMarkets.includes(d.MarketName));
  } catch {
    // Fallback: fetch per market
    const codes = getMarketCodes();
    const promises = codes.map(code =>
      fetchAPI({
        Start_time: start,
        End_time: end,
        CropName: name,
        TcType: VEG_TYPE,
        MarketCode: code,
      }).catch(() => [])
    );
    const results = await Promise.all(promises);
    return results.flat();
  }
}

function numberFormat(n) {
  return Math.round(n).toLocaleString('zh-TW');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === Render summary ===
function renderSummary(data) {
  if (data.length === 0) return;

  const totalQ = data.reduce((s, d) => s + d.Trans_Quantity, 0);
  const avgP = data.reduce((s, d) => s + d.Avg_Price * d.Trans_Quantity, 0) / totalQ;
  const upperP = Math.max(...data.map(d => d.Upper_Price));
  const lowerP = Math.min(...data.map(d => d.Lower_Price));

  avgPriceEl.textContent = avgP.toFixed(1);
  upperPriceEl.textContent = upperP.toFixed(1);
  lowerPriceEl.textContent = lowerP.toFixed(1);
  transQtyEl.textContent = numberFormat(totalQ);
  detailDate.textContent = `交易日期：${rocToDisplay(data[0].TransDate)}`;
}

// === Render market cards ===
function renderMarkets(data) {
  marketCardsEl.innerHTML = '';
  const sorted = [...data].sort((a, b) => b.Avg_Price - a.Avg_Price);

  for (const item of sorted) {
    const card = document.createElement('div');
    card.className = 'market-card';
    card.innerHTML = `
      <div class="market-card-name">${escapeHTML(item.MarketName)}</div>
      <div class="market-card-row">
        <span class="market-card-label">平均價</span>
        <span class="market-card-value price">${item.Avg_Price.toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">上價</span>
        <span class="market-card-value">${item.Upper_Price.toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">下價</span>
        <span class="market-card-value">${item.Lower_Price.toFixed(1)} 元</span>
      </div>
      <div class="market-card-row">
        <span class="market-card-label">交易量</span>
        <span class="market-card-value">${numberFormat(item.Trans_Quantity)} 公斤</span>
      </div>
    `;
    marketCardsEl.appendChild(card);
  }
}

// === Render chart ===
async function renderChart(days) {
  const history = await fetchHistory(cropName, days);

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
          ticks: { maxRotation: 45, maxTicksLimit: 15 },
        },
      },
    },
  });
}

// === Range buttons ===
document.querySelectorAll('.range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderChart(parseInt(btn.dataset.days));
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

// === Update back link with region ===
function updateBackLink() {
  const backLink = document.querySelector('.back-link');
  if (backLink) {
    backLink.href = 'index.html';
  }
}

// === Init ===
async function init() {
  if (!cropName) {
    loadingEl.classList.add('hidden');
    noDataEl.classList.remove('hidden');
    noDataEl.textContent = '未指定蔬菜名稱';
    return;
  }

  const regionLabel = regionParam ? REGION_NAMES[regionParam] : '全部地區';
  cropTitle.textContent = `${cropName}`;
  document.title = `${cropName} - 台灣蔬菜即時價格查詢`;

  // Show region info in subtitle area
  const subtitle = document.querySelector('.subtitle');
  if (subtitle) {
    const backLink = subtitle.querySelector('.back-link');
    subtitle.innerHTML = '';
    if (backLink) subtitle.appendChild(backLink);
    subtitle.appendChild(document.createTextNode(` | ${regionLabel}市場`));
  }

  updateBackLink();

  try {
    const todayData = await fetchTodayForCrop(cropName);
    loadingEl.classList.add('hidden');

    if (todayData.length === 0) {
      noDataEl.classList.remove('hidden');
      return;
    }

    renderSummary(todayData);
    renderMarkets(todayData);
    await renderChart(7);
  } catch (err) {
    console.error('Failed to load data:', err);
    loadingEl.classList.add('hidden');
    noDataEl.textContent = '載入失敗，請稍後重試';
    noDataEl.classList.remove('hidden');
  }
}

init();
