// === Chatbot with Gemini API ===
(function () {
  const PROXY_URL = 'https://gemini-proxy.atgak1688.workers.dev';

  const SYSTEM_PROMPT = `你是「台灣蔬菜即時價格查詢」網站的智能助理，名字叫「菜價小幫手」。
你的任務是幫助使用者了解如何操作這個網站，以及回答蔬菜相關的問題。

## 網站功能介紹：
1. **首頁（價格總覽）**：顯示今日所有蔬菜的批發價格表，包含品名、平均價、上價、下價、交易量
2. **搜尋功能**：在搜尋欄輸入蔬菜名稱即可篩選，支援俗稱搜尋（例如：輸入「高麗菜」會找到「甘藍」，輸入「空心菜」會找到「蕹菜」）
3. **地區篩選**：可以選擇「全部地區」、「北部」、「中部」、「南部」、「東部」來查看特定區域的價格
4. **分類篩選**：可以按「青菜」、「瓜類」、「根莖筍」、「蔥薑蒜」、「瓜果茄」、「菇類」、「豆類」、「其他」分類瀏覽
5. **排序功能**：點擊表格的欄位標題（品名、平均價、上價、下價、交易量）可以排序
6. **詳情頁面**：點擊任一蔬菜，可以查看該蔬菜的價格趨勢圖（7天/30天）和各市場的價格比較
7. **深淺模式**：右上角有切換按鈕，可以切換深色/淺色主題

## 資料說明：
- 資料來源：農業部農糧署 批發市場交易行情
- 價格單位：元/公斤（批發價，非零售價）
- 涵蓋全台 17 個批發市場
- 上價 = 當日最高成交價，下價 = 當日最低成交價，平均價 = 加權平均
- 每日約下午更新（週日及國定假日休市）

## 回答規則：
- 用繁體中文回答，語氣親切友善
- 回答要簡潔明瞭，不要太長
- 如果使用者問的問題超出網站功能範圍，請禮貌地引導回網站相關話題
- 如果使用者問具體菜價，建議他們使用搜尋功能查詢最新資料
- 不要編造價格數字`;

  let chatHistory = [];


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
      <div class="quick-questions" id="quickQuestions">
        <button class="quick-q">怎麼查菜價？</button>
        <button class="quick-q">可以看歷史價格嗎？</button>
        <button class="quick-q">上價下價是什麼？</button>
        <button class="quick-q">怎麼切換地區？</button>
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

    // Quick questions
    document.getElementById('quickQuestions').addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-q');
      if (!btn) return;
      chatInput.value = btn.textContent;
      sendMessage();
    });
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

    // Hide quick questions after first message
    const quickQ = document.getElementById('quickQuestions');
    if (quickQ) quickQ.style.display = 'none';

    // Show typing indicator
    const typingEl = showTyping();

    // Build conversation
    chatHistory.push({ role: 'user', parts: [{ text }] });

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
    } catch (err) {
      console.error('Chatbot error:', err);
      typingEl.innerHTML = '抱歉，目前無法連線，請稍後再試。';
    } finally {
      sendBtn.disabled = false;
      document.getElementById('chatInput').focus();
    }
  }

  function formatReply(text) {
    // Basic markdown: **bold**, newlines
    return escapeHTML(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
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
