import type { PriceRecord } from './types'
import { escapeHTML as escape } from './utils'

const PROXY_URL = 'https://gemini-proxy.atgak1688.workers.dev'

const SYSTEM_PROMPT = `你是「台灣生鮮即時價格查詢」網站的智能助理，名字叫「生鮮小幫手」。
你的個性是一個和藹可愛、充滿元氣的女孩，對蔬果漁產都很有研究，很喜歡幫助別人，說話甜甜的、溫柔有禮貌。

## 說話風格：
- 語氣溫柔可愛，適當使用「呢」、「喔」、「唷」、「～」等語助詞
- 可用少量表情符號（😊、✨、🐟、🥬、🍎），不要太多
- 回答簡短有重點，不超過 5 行（表格不算）

## 網站功能：
1. 首頁有蔬菜、水果、漁產三種模式可切換
2. 搜尋欄支援俗稱（高麗菜→甘藍、蚵仔→牡蠣、台灣鯛→吳郭魚）
3. 地區篩選（北部、中部、南部、東部）
4. 分類篩選：蔬菜有青菜/瓜類/根莖筍等，漁產有淡水魚/海水魚/蝦蟹類/貝類/頭足類/加工品
5. 點品名進入詳情頁看價格趨勢圖（7天/30天）和各市場比較
6. 右上角可切換深色模式

## 資料小知識：
- 資料來自農業部，是批發市場交易價格（非零售價）
- 蔬果有 17 個市場，漁產有 19 個市場
- 每天下午更新，週日及國定假日休市
- 上價＝最高價、下價＝最低價、平均價＝加權平均

## 回答價格問題：
- 用固定表格格式：
  |品名|平均價|上價|下價|
  |---|---|---|---|
  |甘藍-初秋|10.5|15.0|7.0|
- 最多列 10 筆，價格數字不加「元」
- 只列使用者問的品項

## 注意事項：
- 繁體中文回答
- 絕對不要編造價格，只根據提供的資料回答
- 超出範圍的問題，親切地帶回來就好`

let chatHistory: Array<{ role: string; parts: Array<{ text: string }> }> = []

function getPriceSummary(): string {
  const data = (window as any).todayData as PriceRecord[] | undefined
  if (!data || data.length === 0) return ''

  const map: Record<string, { totalQty: number; weightedPrice: number; upper: number; lower: number }> = {}
  for (const item of data) {
    const key = item.CropName
    if (!map[key]) {
      map[key] = { totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity }
    }
    map[key].totalQty += item.Trans_Quantity
    map[key].weightedPrice += item.Avg_Price * item.Trans_Quantity
    map[key].upper = Math.max(map[key].upper, item.Upper_Price)
    map[key].lower = Math.min(map[key].lower, item.Lower_Price)
  }

  const items = Object.entries(map).map(([name, d]) => ({
    name,
    avg: d.totalQty > 0 ? d.weightedPrice / d.totalQty : 0,
    upper: d.upper,
    lower: d.lower === Infinity ? 0 : d.lower,
    qty: d.totalQty,
  }))

  const sorted = [...items].sort((a, b) => a.avg - b.avg)
  const cheap = sorted.slice(0, 15)
  const expensive = sorted.slice(-5)
  const selected = [...cheap, ...expensive.filter(e => !cheap.includes(e))]

  const date = data[0]?.TransDate || ''
  const currentType = (window as any).activeType as string
  const typeNames: Record<string, string> = { veg: '蔬菜', fruit: '水果', fish: '漁產品' }
  const typeName = typeNames[currentType] || '蔬菜'
  const lines = [`今日${typeName}價格（${date}，元/公斤，共${items.length}項，以下為部分摘要）：`]
  for (const d of selected) {
    lines.push(`${d.name}：平均${d.avg.toFixed(1)}，上價${d.upper.toFixed(1)}，下價${d.lower.toFixed(1)}`)
  }
  return lines.join('\n')
}

function escapeHTML(str: string): string {
  return escape(str)
}

function createChatbotUI() {
  const toggleBtn = document.createElement('button')
  toggleBtn.className = 'chatbot-toggle'
  toggleBtn.setAttribute('aria-label', '開啟智能助理')
  toggleBtn.innerHTML = `
    <svg class="chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
    <svg class="close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
  `

  const chatWindow = document.createElement('div')
  chatWindow.className = 'chatbot-window'
  chatWindow.innerHTML = `
    <div class="chatbot-header">
      <span class="chatbot-header-icon">&#x1F33F;</span>
      <div class="chatbot-header-text">
        <h4>生鮮小幫手</h4>
        <p>蔬菜、水果、漁產都可以問我喔！</p>
      </div>
    </div>
    <div class="chatbot-messages" id="chatMessages">
      <div class="chat-msg bot">你好！我是生鮮小幫手 &#x1F44B;<br>蔬菜、水果、漁產的價格和操作問題，都可以問我喔～</div>
    </div>
    <div class="chatbot-input">
      <input type="text" id="chatInput" placeholder="輸入你的問題..." autocomplete="off">
      <button id="chatSend" aria-label="送出">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `

  document.body.appendChild(toggleBtn)
  document.body.appendChild(chatWindow)

  toggleBtn.addEventListener('click', () => {
    const isOpen = chatWindow.classList.toggle('open')
    toggleBtn.classList.toggle('active', isOpen)
    if (isOpen) {
      document.getElementById('chatInput')!.focus()
    }
  })

  const sendBtn = document.getElementById('chatSend')!
  const chatInput = document.getElementById('chatInput') as HTMLInputElement

  sendBtn.addEventListener('click', () => sendMessage())
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) sendMessage()
  })

  showFollowUp()
}

function addMessage(text: string, role: string): HTMLElement {
  const messages = document.getElementById('chatMessages')!
  const msg = document.createElement('div')
  msg.className = `chat-msg ${role}`
  msg.innerHTML = text
  messages.appendChild(msg)
  messages.scrollTop = messages.scrollHeight
  return msg
}

function showTyping(): HTMLElement {
  return addMessage('<span class="typing-dots"><span></span><span></span><span></span></span>', 'bot')
}

async function sendMessage() {
  const input = document.getElementById('chatInput') as HTMLInputElement
  const sendBtn = document.getElementById('chatSend') as HTMLButtonElement
  const text = input.value.trim()
  if (!text) return

  addMessage(escapeHTML(text), 'user')
  input.value = ''
  sendBtn.disabled = true

  document.querySelectorAll('.chat-followup').forEach(el => el.remove())

  const typingEl = showTyping()

  const priceKeywords = ['多少','價格','價錢','菜價','果價','魚價','貴','便宜','划算','當季','盛產','推薦','什麼菜','哪些菜','買什麼','什麼水果','哪些水果','什麼魚','哪些魚','蝦','蟹','海鮮']
  const needsPrice = priceKeywords.some(kw => text.includes(kw))
  const currentType = (window as any).activeType as string
  const typeLabels: Record<string, string> = { veg: '蔬菜', fruit: '水果', fish: '漁產品' }
  const typeLabel = typeLabels[currentType] || '蔬菜'
  let userMessage = text
  if (needsPrice) {
    const priceSummary = getPriceSummary()
    if (priceSummary) {
      userMessage = `[目前模式：${typeLabel}]\n[參考資料 - 今日${typeLabel}價格]\n${priceSummary}\n\n[使用者問題] ${text}`
    }
  }

  if (chatHistory.length > 10) {
    chatHistory = chatHistory.slice(-10)
  }
  chatHistory.push({ role: 'user', parts: [{ text: userMessage }] })

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: chatHistory,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed')
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我暫時無法回答，請稍後再試。'
    chatHistory.push({ role: 'model', parts: [{ text: reply }] })

    typingEl.innerHTML = formatReply(reply)
    showFollowUp()
  } catch (err) {
    console.error('Chatbot error:', err)
    typingEl.innerHTML = '抱歉，目前無法連線，請稍後再試。'
    showFollowUp()
  } finally {
    sendBtn.disabled = false
    document.getElementById('chatInput')!.focus()
  }
}

const TYPE_QUESTIONS: Record<string, string[]> = {
  veg:  ['高麗菜現在多少？', '今天什麼菜便宜？', '當季蔬菜有哪些？'],
  fruit: ['香蕉現在多少？', '今天什麼水果便宜？', '當季水果有哪些？'],
  fish: ['白鯧現在多少？', '今天什麼魚便宜？', '蝦類價格怎麼樣？'],
}
const COMMON_QUESTIONS = ['怎麼查價格？', '上價下價是什麼？']

function getQuickQuestions(): string[] {
  const currentType = (window as any).activeType as string || 'veg'
  return [...(TYPE_QUESTIONS[currentType] || TYPE_QUESTIONS.veg), ...COMMON_QUESTIONS]
}

function refreshFollowUp() {
  document.querySelectorAll('.chat-followup').forEach(el => el.remove())
  showFollowUp()
}

function showFollowUp() {
  const messages = document.getElementById('chatMessages')!
  const wrap = document.createElement('div')
  wrap.className = 'chat-followup'
  getQuickQuestions().forEach(q => {
    const btn = document.createElement('button')
    btn.className = 'followup-btn'
    btn.textContent = q
    btn.addEventListener('click', () => {
      ;(document.getElementById('chatInput') as HTMLInputElement).value = q
      sendMessage()
    })
    wrap.appendChild(btn)
  })
  const resetBtn = document.createElement('button')
  resetBtn.className = 'followup-btn reset-btn'
  resetBtn.textContent = '重新開始'
  resetBtn.addEventListener('click', resetChat)
  wrap.appendChild(resetBtn)
  messages.appendChild(wrap)
  messages.scrollTop = messages.scrollHeight
}

function resetChat() {
  chatHistory = []
  const messages = document.getElementById('chatMessages')!
  messages.innerHTML = '<div class="chat-msg bot">你好！我是生鮮小幫手 &#x1F44B;<br>蔬菜、水果、漁產的價格和操作問題，都可以問我喔～</div>'
  showFollowUp()
}

function formatReply(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let i = 0

  while (i < lines.length) {
    if (lines[i].includes('|') && i + 1 < lines.length && /^\s*\|[-\s|]+\|\s*$/.test(lines[i + 1])) {
      const headerCells = lines[i].split('|').map(c => c.trim()).filter(c => c)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && !/^\s*\|[-\s|]+\|\s*$/.test(lines[i])) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(c => c)
        if (cells.length > 0) rows.push(cells)
        i++
      }
      result.push(buildTable(headerCells, rows))
      continue
    }

    const pricePattern = /^[*\-•]?\s*(.+?)[：:]\s*平均.*?([\d.]+)\s*元/
    const priceRows: string[][] = []
    while (i < lines.length && pricePattern.test(lines[i])) {
      const m = lines[i].match(pricePattern)!
      const name = m[1].trim()
      const avg = m[2]
      const upper = lines[i].match(/上價.*?([\d.]+)/)?.[1] || ''
      const lower = lines[i].match(/下價.*?([\d.]+)/)?.[1] || ''
      priceRows.push([name, avg, upper, lower].filter(v => v))
      i++
    }
    if (priceRows.length > 0) {
      const hasDetail = priceRows.some(r => r.length > 2)
      const headers = hasDetail ? ['品名', '平均價', '上價', '下價'] : ['品名', '平均價']
      result.push(buildTable(headers, priceRows))
      continue
    }

    let line = escapeHTML(lines[i])
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    result.push(line)
    i++
  }

  return result.join('<br>').replace(/(<br>){3,}/g, '<br><br>')
}

function buildTable(headers: string[], rows: string[][]): string {
  let html = '<table class="chat-price-table"><thead><tr>'
  for (const h of headers) html += `<th>${escapeHTML(h)}</th>`
  html += '</tr></thead><tbody>'
  for (const row of rows) {
    html += '<tr>'
    row.forEach((cell, idx) => {
      const cls = idx === 1 ? ' class="price-col"' : ''
      html += `<td${cls}>${escapeHTML(cell)}</td>`
    })
    for (let j = row.length; j < headers.length; j++) html += '<td></td>'
    html += '</tr>'
  }
  html += '</tbody></table>'
  return html
}

// Init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

function init() {
  createChatbotUI()
  // Refresh quick questions when user switches type
  document.getElementById('typeToggle')?.addEventListener('click', () => {
    setTimeout(refreshFollowUp, 50)
  })
}
