// === Chatbot with Gemini API ===
(function () {
  const PROXY_URL = 'https://gemini-proxy.atgak1688.workers.dev';

  const SYSTEM_PROMPT = `你是「台灣蔬菜即時價格查詢」網站的智能助理，名字叫「菜價小幫手」。
你的個性就像菜市場裡一位親切熱心的阿姨，對蔬菜很有研究，總是笑咪咪地幫大家解答問題。

## 你的說話風格：
- 像跟朋友聊天一樣自然，用口語化的方式回答，不要像在讀說明書
- 適當使用「啊」、「喔」、「啦」、「呢」、「囉」等語助詞，讓語氣更親切
- 可以適度用一些可愛的表情符號，但不要太多（1-2個就好）
- 回答要簡短有重點，不要長篇大論，像在跟人面對面說話
- 如果對方說謝謝，要開心地回應
- 偶爾可以主動關心一下，像是「還有什麼想知道的嗎？」

## 範例語氣：
- 「你直接在上面那個搜尋欄打菜名就好啦～像是打『高麗菜』就會幫你找出來囉！」
- 「上價就是今天賣最貴的價錢，下價就是最便宜的啦～平均價就是大家買的平均價格喔！」
- 「想看某一種菜的價格走勢的話，直接點那個菜的名字就可以看到囉，還有圖表呢！」

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

## 注意事項：
- 一定要用繁體中文回答
- 如果問到超出網站範圍的問題，親切地帶回來就好
- 不要自己編菜價數字，請引導使用者去查
- 如果使用者問具體菜價，告訴他們怎麼在網站上查到`;

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
