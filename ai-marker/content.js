// ===== 工具 =====
// 防止在旧环境执行
if (!chrome?.storage) {
  console.log("旧插件环境，脚本退出");
  throw new Error("Extension context invalidated");
}


function showTip(text, color = "#333") {

  let bar = document.getElementById("ai-marker-tip");

  if (!bar) {
    bar = document.createElement("div");
    bar.id = "ai-marker-tip";

    Object.assign(bar.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      padding: "8px",
      textAlign: "center",
      zIndex: 99999,
      background: "#fffbe6",
      borderBottom: "1px solid #ffe58f"
    });

    document.body.appendChild(bar);
  }

  bar.style.color = color;
  bar.innerText = text;
}

function hideTip() {
  const bar =
    document.getElementById("ai-marker-tip");

  if (bar) bar.remove();
}


function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function hash(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );

  return [...new Uint8Array(buf)]
    .map(b =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

// ===== 平台 =====
function getPlatform() {
  if (location.host.includes("chatgpt"))
    return "chatgpt";

  if (location.host.includes("deepseek"))
    return "deepseek";

  return "unknown";
}

// ===== 取真实AI正文 =====
function getReplyText(el) {

  const clone = el.cloneNode(true);

  clone
    .querySelectorAll("button,svg,textarea")
    .forEach(b => b.remove());

  let text = clone.innerText.trim();

  text = text
    .replace("复制", "")
    .replace("Copy", "")
    .replace("👍", "")
    .replace("👎", "");

  return text.trim();
}

// ===== 找AI回复 =====
function findAIReplies() {

  // ChatGPT
  if (getPlatform() === "chatgpt") {

    const all =
      document.querySelectorAll(
        '[data-testid^="conversation-turn"]'
      );

    return [...all].filter(el => {

      // 没输入框 = AI
      if (el.querySelector("textarea"))
        return false;

      return true;
    });
  }

  // DeepSeek
  return document.querySelectorAll(
    ".chat-message.assistant"
  );
}

// ===== 注入按钮 =====
function injectButtons() {

  const replies = findAIReplies();

  replies.forEach(el => {

    if (el.querySelector(".ai-marker-btn"))
      return;

    const btn =
      document.createElement("button");

    btn.innerText = "🔖 标记";
    btn.className = "ai-marker-btn";

    Object.assign(btn.style, {
      margin: "4px",
      padding: "2px 6px",
      cursor: "pointer"
    });

    btn.onclick = () => saveMark(el);

    el.prepend(btn);
  });
}

// ===== 保存 =====
async function saveMark(element) {

  const text = getReplyText(element);

  const mark = {
    id: crypto.randomUUID(),

    platform: getPlatform(),

    url: location.href,

    snippet: text.slice(0, 60),

    hash: await hash(text),

    time: new Date().toLocaleString()
  };

  const { marks = [] } =
    await chrome.storage.local.get(
      "marks"
    );

  marks.push(mark);

  await chrome.storage.local.set({
    marks
  });

  flash(element);
}

// ===== 高亮 =====
function flash(el) {
  el.style.background = "#fff3cd";

  setTimeout(() => {
    el.style.background = "";
  }, 800);
}

function focusTop(el) {

  // 1. 先瞬间到顶部（更稳定）
  el.scrollIntoView({
    block: "start"
  });

  // 2. 再平滑微调
  setTimeout(() => {

    el.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    // 留一点呼吸空间
    window.scrollBy({
      top: -60,
      behavior: "smooth"
    });

  }, 200);

  el.style.outline = "3px solid #ff9800";
  el.style.background = "#fff8e1";
}


async function tryLocateOnce(mark) {

  const replies = findAIReplies();

  // ---- 1. hash ----
  for (const r of replies) {

    const text = getReplyText(r);
    const h = await hash(text);

    if (h === mark.hash) {
      focusTop(r);
      return true;
    }
  }

  // ---- 2. 片段 ----
  for (const r of replies) {

    const text = getReplyText(r);

    if (text.includes(mark.snippet)) {
      focusTop(r);
      return true;
    }
  }

  // ---- 3. 相似 ----
  let best = null;
  let bestScore = 0;

  for (const r of replies) {

    const text = getReplyText(r);

    const score =
      similarity(text, mark.snippet);

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (bestScore > 0.25) {
    focusTop(best);
    return true;
  }

  return false;
}


// ===== 定位 =====
async function locate(mark) {

  showTip("🔍 标记消息定位中...");

  // 最多尝试 10 次
  for (let i = 0; i < 10; i++) {

    const ok = await tryLocateOnce(mark);

    if (ok) {
      showTip("✅ 定位完成", "green");

      setTimeout(hideTip, 1200);
      return true;
    }

    // 触发加载更多历史
    window.scrollBy(0, 400);

    await sleep(1200);
  }

  showTip("❌ 定位失败", "red");

  setTimeout(hideTip, 2000);

  return false;
}


// ===== 滚动 =====
function focus(el) {

  el.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  el.style.outline =
    "3px solid #ff9800";

  el.style.background =
    "#fff8e1";
}

// ===== 主循环 =====
async function safeLoop() {
  try {

    injectButtons();

    const data =
      await chrome.storage.local.get("jumpTo");

    if (data && data.jumpTo) {
      await locate(data.jumpTo);

      await chrome.storage.local.remove("jumpTo");
    }

  } catch (e) {

    // 👈 关键：遇到 Extension context invalidated 就停止
    if (String(e).includes("Extension context")) {
      console.log("插件已重载，停止旧脚本");
      return;
    }

    console.log("AI-Marker error:", e);
  }
}

setInterval(safeLoop, 1500);

