// === Chatbot with Gemini API ===
(function () {
  const PROXY_URL = 'https://gemini-proxy.atgak1688.workers.dev';

  const SYSTEM_PROMPT = `你是「台灣蔬菜即時價格查詢」網站的智能助理，名字叫「菜價小幫手」。
你的個性是一個和藹可愛、充滿元氣的女孩，對蔬菜超有興趣，很喜歡幫助別人，說話甜甜的、溫柔有禮貌。

## 你的說話風格：
- 語氣溫柔可愛，像一個貼心的小助理在跟你聊天
- 適當使用「呢」、「喔」、「唷」、「嗎」、「～」等讓語氣柔和可愛
- 可以用一些可愛的顏文字或表情符號，像是 😊、✨、🌿，但不要太多
- 回答簡短有重點，不要太嚴肅，帶著微笑的感覺
- 對方說謝謝的話要甜甜地回應，像是「不客氣呀～能幫到你我好開心 😊」
- 偶爾可以撒嬌式地關心一下，像是「還有想問的嗎～我都在喔！」
- 不要用「啦」、「咧」等比較粗獷的語助詞

## 範例語氣：
- 「你在上面的搜尋欄輸入菜名就可以囉～像是打『高麗菜』就會幫你找出來呢！」
- 「上價就是今天最高的成交價，下價是最低的唷～平均價就是大家交易的平均價格呢 😊」
- 「想看價格趨勢的話，點那個菜的名字就可以看到漂亮的圖表囉～有 7 天和 30 天可以選呢 ✨」

## 網站功能（你要熟悉這些，用自己的話解釋給使用者聽）：
1. 首頁有今天所有蔬菜的批發價格表
2. 搜尋欄可以打菜名查詢，而且打俗稱也可以喔（像「高麗菜」會幫你找到「甘藍」、「空心菜」會找到「蕹菜」）
3. 上面有地區篩選（北部、中部、南部、東部），可以看你家附近的市場價格
4. 也可以按分類篩選：青菜、瓜類、根莖筍、蔥薑蒜、瓜果茄、菇類、豆類
5. 點表格上面的欄位標題可以排序（像是按價格高到低）
6. 點任何一種菜進去，可以看到價格趨勢圖（7天或30天）和各市場比較
7. 右上角可以切換深色模式，晚上看比較不刺眼

## 資料小知識（用聊天的方式分享）：
- 資料是從農業部農糧署來的，是批發市場的交易價格
- 價格單位是「元/公斤」，是批發價不是菜市場零售價喔
- 全台灣有 17 個批發市場的資料
- 每天大概下午會更新，週日跟國定假日休市沒有資料
- 上價＝當天最高價、下價＝最低價、平均價＝加權平均

## 回答菜價問題：
- 如果使用者問某種菜的價格，用以下固定表格格式回答（非常重要！）：
  |品名|平均價|上價|下價|
  |---|---|---|---|
  |甘藍-初秋|10.5|15.0|7.0|
- 表格上方或下方可以加一句簡短的說明（例如「今天高麗菜的批發價如下～」）
- 如果有多種菜，全部放在同一個表格裡
- 價格數字後面不要加「元」或「元/公斤」，表格標題已經有了
- 只列出使用者問的菜，不要列一大堆

## 回答操作問題：
- 用最簡短的方式回答，2-3 句話就好
- 不要列一大堆步驟，講重點就好
- 可以用數字標記步驟，但最多 3 步

## 注意事項：
- 一定要用繁體中文回答
- 回答要盡量精簡，不要超過 5 行（表格不算）
- 如果問到超出網站範圍的問題，親切地帶回來就好
- 絕對不要編造價格數字，只根據提供的菜價資料回答`;

  let chatHistory = [];

  // Get current price data from the page
  function getPriceSummary() {
    // Access todayData from app.js (global scope)
    if (typeof todayData === 'undefined' || !todayData || todayData.length === 0) return '';

    // Aggregate by crop name
    const map = {};
    for (const item of todayData) {
      const key = item.CropName;
      if (!map[key]) {
        map[key] = { totalQty: 0, weightedPrice: 0, upper: 0, lower: Infinity };
      }
      map[key].totalQty += item.Trans_Quantity;
      map[key].weightedPrice += item.Avg_Price * item.Trans_Quantity;
      map[key].upper = Math.max(map[key].upper, item.Upper_Price);
      map[key].lower = Math.min(map[key].lower, item.Lower_Price);
    }

    const lines = [];
    const date = todayData[0]?.TransDate || '';
    lines.push(`今日菜價資料（日期：${date}，單位：元/公斤）：`);
    for (const [name, d] of Object.entries(map)) {
      const avg = d.totalQty > 0 ? (d.weightedPrice / d.totalQty).toFixed(1) : 0;
      const lower = d.lower === Infinity ? 0 : d.lower.toFixed(1);
      lines.push(`${name}：平均${avg}，上價${d.upper.toFixed(1)}，下價${lower}，交易量${Math.round(d.totalQty)}公斤`);
    }
    return lines.join('\n');
  }

  // === Build UI ===
  function createChatbotUI() {
    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'chatbot-toggle';
    toggleBtn.setAttribute('aria-label', '開啟智能助理');
    toggleBtn.innerHTML = `
      <svg class="chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>
      <svg class="close-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    `;

    // Chat window
    const chatWindow = document.createElement('div');
    chatWindow.className = 'chatbot-window';
    chatWindow.innerHTML = `
      <div class="chatbot-header">
        <span class="chatbot-header-icon">&#x1F96C;</span>
        <div class="chatbot-header-text">
          <h4>菜價小幫手</h4>
          <p>有問題都可以問我喔！</p>
        </div>
      </div>
      <div class="chatbot-messages" id="chatMessages">
        <div class="chat-msg bot">你好！我是菜價小幫手 &#x1F44B;<br>有任何關於本站操作或蔬菜價格的問題，都可以問我喔！</div>
      </div>
      <div class="chatbot-input">
        <input type="text" id="chatInput" placeholder="輸入你的問題..." autocomplete="off">
        <button id="chatSend" aria-label="送出">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;

    document.body.appendChild(toggleBtn);
    document.body.appendChild(chatWindow);

    // Events
    toggleBtn.addEventListener('click', () => {
      const isOpen = chatWindow.classList.toggle('open');
      toggleBtn.classList.toggle('active', isOpen);
      if (isOpen) {
        document.getElementById('chatInput').focus();
      }
    });

    const sendBtn = document.getElementById('chatSend');
    const chatInput = document.getElementById('chatInput');

    sendBtn.addEventListener('click', () => sendMessage());
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) sendMessage();
    });

    // Show initial follow-up buttons
    showFollowUp();
  }

  function addMessage(text, role) {
    const messages = document.getElementById('chatMessages');
    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;
    msg.innerHTML = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function showTyping() {
    return addMessage('<span class="typing-dots"><span></span><span></span><span></span></span>', 'bot');
  }

  async function sendMessage() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    addMessage(escapeHTML(text), 'user');
    input.value = '';
    sendBtn.disabled = true;

    // Remove any existing follow-up buttons
    document.querySelectorAll('.chat-followup').forEach(el => el.remove());

    // Show typing indicator
    const typingEl = showTyping();

    // Build conversation - inject price data when user asks about prices
    const priceKeywords = ['多少','價格','價錢','菜價','貴','便宜','划算','當季','盛產','推薦','什麼菜','哪些菜','買什麼'];
    const needsPrice = priceKeywords.some(kw => text.includes(kw));
    let userMessage = text;
    if (needsPrice) {
      const priceSummary = getPriceSummary();
      if (priceSummary) {
        userMessage = `[參考資料 - 今日菜價]\n${priceSummary}\n\n[使用者問題] ${text}`;
      }
    }
    chatHistory.push({ role: 'user', parts: [{ text: userMessage }] });

    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: chatHistory,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'API request failed');
      }

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '抱歉，我暫時無法回答，請稍後再試。';
      chatHistory.push({ role: 'model', parts: [{ text: reply }] });

      // Replace typing with actual reply
      typingEl.innerHTML = formatReply(reply);
      showFollowUp();
    } catch (err) {
      console.error('Chatbot error:', err);
      typingEl.innerHTML = '抱歉，目前無法連線，請稍後再試。';
      showFollowUp();
    } finally {
      sendBtn.disabled = false;
      document.getElementById('chatInput').focus();
    }
  }

  const QUICK_QUESTIONS = ['高麗菜現在多少？', '今天什麼菜便宜？', '怎麼查菜價？', '上價下價是什麼？'];

  function showFollowUp() {
    const messages = document.getElementById('chatMessages');
    const wrap = document.createElement('div');
    wrap.className = 'chat-followup';
    QUICK_QUESTIONS.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'followup-btn';
      btn.textContent = q;
      btn.addEventListener('click', () => {
        document.getElementById('chatInput').value = q;
        sendMessage();
      });
      wrap.appendChild(btn);
    });
    const resetBtn = document.createElement('button');
    resetBtn.className = 'followup-btn reset-btn';
    resetBtn.textContent = '重新開始';
    resetBtn.addEventListener('click', resetChat);
    wrap.appendChild(resetBtn);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function resetChat() {
    chatHistory = [];
    const messages = document.getElementById('chatMessages');
    messages.innerHTML = '<div class="chat-msg bot">你好！我是菜價小幫手 &#x1F44B;<br>有任何關於本站操作或蔬菜價格的問題，都可以問我喔！</div>';
    showFollowUp();
  }

  function formatReply(text) {
    const lines = text.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      // Detect markdown table: line with | chars, followed by separator |---|
      if (lines[i].includes('|') && i + 1 < lines.length && /^\s*\|[-\s|]+\|\s*$/.test(lines[i + 1])) {
        // Parse markdown table
        const headerCells = lines[i].split('|').map(c => c.trim()).filter(c => c);
        i += 2; // skip header + separator
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && !/^\s*\|[-\s|]+\|\s*$/.test(lines[i])) {
          const cells = lines[i].split('|').map(c => c.trim()).filter(c => c);
          if (cells.length > 0) rows.push(cells);
          i++;
        }
        result.push(buildTable(headerCells, rows));
        continue;
      }

      // Detect plain list price lines: "* 品名：平均價格是 XX 元" or "品名：平均 XX 元"
      const pricePattern = /^[*\-•]?\s*(.+?)[：:]\s*平均.*?([\d.]+)\s*元/;
      const priceRows = [];
      while (i < lines.length && pricePattern.test(lines[i])) {
        const m = lines[i].match(pricePattern);
        const name = m[1].trim();
        const avg = m[2];
        const upper = lines[i].match(/上價.*?([\d.]+)/)?.[1] || '';
        const lower = lines[i].match(/下價.*?([\d.]+)/)?.[1] || '';
        priceRows.push([name, avg, upper, lower].filter(v => v));
        i++;
      }
      if (priceRows.length > 0) {
        const hasDetail = priceRows.some(r => r.length > 2);
        const headers = hasDetail ? ['品名', '平均價', '上價', '下價'] : ['品名', '平均價'];
        result.push(buildTable(headers, priceRows));
        continue;
      }

      // Normal line
      let line = escapeHTML(lines[i]);
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      result.push(line);
      i++;
    }

    return result.join('<br>').replace(/(<br>){3,}/g, '<br><br>');
  }

  function buildTable(headers, rows) {
    let html = '<table class="chat-price-table"><thead><tr>';
    for (const h of headers) html += `<th>${escapeHTML(h)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      row.forEach((cell, idx) => {
        const cls = idx === 1 ? ' class="price-col"' : '';
        html += `<td${cls}>${escapeHTML(cell)}</td>`;
      });
      // Fill empty cells if row is shorter than headers
      for (let j = row.length; j < headers.length; j++) html += '<td></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatbotUI);
  } else {
    createChatbotUI();
  }
})();
