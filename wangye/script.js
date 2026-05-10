/* =========================================================
   小飞 · 跨文化传播智能体 — 前端逻辑
   - 全请求自动携带 JWT，401 自动跳登录
   - 任务列表自动轮询（运行中态）
   - 内置 Markdown 渲染（无第三方依赖）
   - 文化素材 / 内容洞察 / 审计日志 / 用户管理 全部接通
   ========================================================= */

const TOKEN_KEY = "agent_culture_token";
const ME_KEY = "agent_culture_me";
const HISTORY_KEY = "agent_culture_chat_history";
const API_BASE = window.location.origin;

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ===== Auth helpers =====
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}
function getMe() {
  try { return JSON.parse(localStorage.getItem(ME_KEY) || "null"); } catch { return null; }
}
function setMe(me) {
  if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ME_KEY);
}
function gotoLogin() {
  window.location.href = "/app/login.html";
}

// ===== Toast =====
function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  $("toastWrap").appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ===== Generic API =====
async function api(path, opts = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );
  const t = getToken();
  if (t) headers["Authorization"] = "Bearer " + t;

  const res = await fetch(API_BASE + path, {
    ...opts,
    headers,
    body: opts.body ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });

  if (res.status === 401) {
    clearAuth();
    gotoLogin();
    throw new Error("未登录或会话过期");
  }

  // raw download (e.g. CSV)
  if (opts.raw) return res;

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.detail) || (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(msg);
  }
  return data;
}

const apiGet = (p, opts) => api(p, { method: "GET", ...(opts || {}) });
const apiPost = (p, body, opts) => api(p, { method: "POST", body, ...(opts || {}) });
const apiPut = (p, body, opts) => api(p, { method: "PUT", body, ...(opts || {}) });
const apiDel = (p, opts) => api(p, { method: "DELETE", ...(opts || {}) });

// ===== Tiny markdown renderer (safe, no external deps) =====
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function renderMarkdown(src) {
  if (!src) return "";
  const lines = String(src).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false, codeLang = "", codeBuf = [];
  let listType = null, listBuf = [];
  let para = [];

  const flushList = () => {
    if (!listType) return;
    out.push(`<${listType}>` + listBuf.map((li) => `<li>${inlineMd(li)}</li>`).join("") + `</${listType}>`);
    listType = null; listBuf = [];
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(para.join(" "))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw;
    // fenced code
    if (/^```/.test(line)) {
      flushList(); flushPara();
      if (!inCode) { inCode = true; codeLang = line.slice(3).trim(); codeBuf = []; }
      else { inCode = false; out.push(`<pre><code data-lang="${escapeHtml(codeLang)}">${escapeHtml(codeBuf.join("\n"))}</code></pre>`); }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    // headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flushList(); flushPara(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); continue; }
    // hr
    if (/^---+$/.test(line.trim())) { flushList(); flushPara(); out.push("<hr/>"); continue; }
    // blockquote
    if (/^>\s?/.test(line)) { flushList(); flushPara(); out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    // unordered list
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) { flushPara(); if (listType !== "ul") { flushList(); listType = "ul"; } listBuf.push(ul[1]); continue; }
    // ordered list
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) { flushPara(); if (listType !== "ol") { flushList(); listType = "ol"; } listBuf.push(ol[1]); continue; }
    // blank
    if (line.trim() === "") { flushList(); flushPara(); continue; }
    // paragraph line
    flushList();
    para.push(line);
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  flushList(); flushPara();
  return out.join("\n");
}
function inlineMd(s) {
  let t = escapeHtml(s);
  // inline code
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // bold + italic
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // links
  t = t.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}

// ===== State =====
let me = getMe();
let allMarkets = [];
let currentMarket = "AFRICA";
let chatHistory = []; // {role, content}
let chatBusy = false;
let pollTimer = null;
let pollingActive = false;

// ===== View routing =====
const VIEWS = ["dialog", "create", "tasks", "material", "summarize", "admin", "users", "modelConfig"];
function switchView(key) {
  if (!VIEWS.includes(key)) return;
  $$(".view").forEach((v) => v.classList.remove("active"));
  const tgt = $("view" + key.charAt(0).toUpperCase() + key.slice(1));
  if (tgt) tgt.classList.add("active");
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === key));

  if (key === "tasks") loadJobs();
  if (key === "material") loadMaterial();
  if (key === "admin") loadAuditLogs();
  if (key === "users") loadUsers();
  if (key === "modelConfig") loadModelConfig();
}

// ===== Boot =====
async function boot() {
  if (!getToken()) return gotoLogin();
  try {
    me = await apiGet("/api/v1/auth/me");
    setMe(me);
    applyMe();
  } catch (e) {
    return; // 401 already redirected
  }

  bindNav();
  bindUserMenu();
  bindChat();
  bindCreate();
  bindSummarize();
  bindAdmin();
  bindUsers();
  bindModelConfig();
  bindModal();

  await Promise.all([checkHealth(), loadMarkets()]);
  loadStats();
  startPolling();
  loadChatHistory();
}

function applyMe() {
  if (!me) return;
  $("userName").textContent = me.username;
  $("userAvatar").textContent = (me.username || "?")[0].toUpperCase();
  const role = me.role || "user";
  const rEl = $("userRole");
  rEl.textContent = role;
  rEl.classList.toggle("user", role !== "admin");
  document.body.dataset.role = role;
  $("popInfo").innerHTML = `已登录：<strong>${escapeHtml(me.username)}</strong> · 角色 <strong>${escapeHtml(role)}</strong>`;
}

// ===== Health =====
async function checkHealth() {
  try {
    const res = await fetch(API_BASE + "/health");
    const j = await res.json();
    $("healthPill").className = "health-pill ok";
    $("healthText").textContent = `服务在线 (${j.env})`;
  } catch {
    $("healthPill").className = "health-pill err";
    $("healthText").textContent = "服务不可用";
  }
}

// ===== Markets =====
async function loadMarkets() {
  try {
    allMarkets = await apiGet("/api/v1/culture");
  } catch { allMarkets = []; }
  if (!allMarkets.length) {
    allMarkets = [{ id: "africa", label: "AFRICA", language: "en" }];
  }
  const opts = allMarkets
    .map((m) => `<option value="${escapeHtml((m.id || m.label).toUpperCase())}">${escapeHtml(m.label)}</option>`)
    .join("");
  for (const id of ["marketSelect", "createMarket", "sumMarket"]) {
    const el = $(id);
    if (el) el.innerHTML = opts;
  }
  setMarket(currentMarket);
}

function setMarket(m) {
  currentMarket = m;
  for (const id of ["marketSelect", "createMarket", "sumMarket"]) {
    const el = $(id);
    if (el && [...el.options].some((o) => o.value === m)) el.value = m;
  }
  $("dialogMarketName").textContent = m;
}

// ===== User menu =====
function bindUserMenu() {
  const trigger = $("userTrigger"), pop = $("userPopover");
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
  });
  document.addEventListener("click", (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== trigger) pop.hidden = true;
  });
  pop.addEventListener("click", (e) => {
    const a = e.target.dataset.action;
    if (!a) return;
    pop.hidden = true;
    if (a === "logout") {
      api("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
      clearAuth();
      gotoLogin();
    } else if (a === "docs") {
      window.open("/docs", "_blank");
    } else if (a === "profile") {
      openModal("账号信息", `
        <div class="detail-row"><div class="d-key">用户名</div><div class="d-val">${escapeHtml(me.username)}</div></div>
        <div class="detail-row"><div class="d-key">角色</div><div class="d-val">${escapeHtml(me.role)}</div></div>
        <div class="detail-row"><div class="d-key">Token</div><div class="d-val mono" style="word-break:break-all;">${escapeHtml(getToken().slice(0, 40))}…</div></div>
      `);
    }
  });
}

// ===== Navigation =====
function bindNav() {
  $$(".nav-item").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
  $("marketSelect").addEventListener("change", (e) => {
    setMarket(e.target.value);
    loadChatHistory();
  });
}

// ===== Chat =====
function bindChat() {
  $("chatSendBtn").addEventListener("click", sendChat);
  $("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  $("chatClearBtn").addEventListener("click", clearChat);
  $$(".e-chip").forEach((c) =>
    c.addEventListener("click", () => {
      $("chatInput").value = c.dataset.prompt;
      sendChat();
    })
  );
}
function chatStorageKey() { return `${HISTORY_KEY}:${currentMarket}`; }
function loadChatHistory() {
  try {
    chatHistory = JSON.parse(localStorage.getItem(chatStorageKey()) || "[]") || [];
  } catch { chatHistory = []; }
  renderChat();
}
function saveChatHistory() {
  try { localStorage.setItem(chatStorageKey(), JSON.stringify(chatHistory.slice(-50))); } catch {}
}
function clearChat() {
  if (!confirm("确认清空当前市场的会话历史？")) return;
  chatHistory = [];
  saveChatHistory(); renderChat();
}
let chatEmptyTpl = null;
function renderChat() {
  const stream = $("chatStream");
  if (!chatEmptyTpl) {
    const e = $("chatEmpty");
    if (e) chatEmptyTpl = e.cloneNode(true);
  }
  if (chatHistory.length === 0) {
    stream.innerHTML = "";
    if (chatEmptyTpl) stream.appendChild(chatEmptyTpl.cloneNode(true));
    bindChatChips();
    return;
  }
  stream.innerHTML = "";
  for (const m of chatHistory) {
    const b = document.createElement("div");
    b.className = `bubble ${m.role === "user" ? "user" : "ai"}`;
    if (m.role === "assistant") b.innerHTML = `<div class="md">${renderMarkdown(m.content)}</div>`;
    else b.textContent = m.content;
    stream.appendChild(b);
  }
  stream.scrollTop = stream.scrollHeight;
}
function bindChatChips() {
  $$(".e-chip").forEach((c) =>
    c.addEventListener("click", () => {
      $("chatInput").value = c.dataset.prompt;
      sendChat();
    })
  );
}

async function sendChat() {
  if (chatBusy) return;
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  chatHistory.push({ role: "user", content: text });
  renderChat();

  const stream = $("chatStream");
  const loading = document.createElement("div");
  loading.className = "bubble ai loading";
  loading.textContent = "思考中 ";
  stream.appendChild(loading);
  stream.scrollTop = stream.scrollHeight;

  chatBusy = true;
  $("chatSendBtn").disabled = true;
  try {
    const data = await apiPost("/api/v1/chat", {
      message: text,
      market: currentMarket,
      history: chatHistory.slice(0, -1).slice(-20),
    });
    chatHistory.push({ role: "assistant", content: data.reply });
    saveChatHistory();
    renderChat();
  } catch (e) {
    loading.classList.remove("loading");
    loading.innerHTML = `<span style="color:var(--c-error);">请求失败：${escapeHtml(e.message)}</span>`;
    toast("对话失败：" + e.message, "error");
  } finally {
    chatBusy = false;
    $("chatSendBtn").disabled = false;
  }
}

// ===== Create job =====
function bindCreate() {
  $("createSubmitBtn").addEventListener("click", submitCreate);
  $("createResetBtn").addEventListener("click", () => {
    $("createTopic").value = "";
    $("createTone").value = "neutral";
    $("createTags").value = "";
    setCreateFb("", "");
  });
}
function setCreateFb(text, type = "") {
  const fb = $("createFeedback");
  fb.textContent = text;
  fb.className = `feedback ${type}`;
}
async function submitCreate() {
  const topic = $("createTopic").value.trim();
  if (topic.length < 3) { setCreateFb("主题至少 3 个字符", "error"); return; }
  const payload = {
    topic,
    market: $("createMarket").value,
    tone: $("createTone").value.trim() || "neutral",
    audience_tags: $("createTags").value.split(",").map((s) => s.trim()).filter(Boolean),
  };
  const btn = $("createSubmitBtn");
  btn.disabled = true; btn.textContent = "提交中…";
  try {
    const data = await apiPost("/api/v1/jobs", payload);
    setCreateFb(`任务已创建：${data.job_id}`, "success");
    toast("任务已提交，正在生成…", "success");
    loadStats();
    setTimeout(() => switchView("tasks"), 600);
  } catch (e) {
    setCreateFb("创建失败：" + e.message, "error");
    toast("创建失败：" + e.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "提交任务";
  }
}

// ===== Jobs list =====
async function loadJobs() {
  const list = $("jobsList");
  try {
    const data = await apiGet("/api/v1/jobs?limit=50");
    const jobs = data.jobs || [];
    if (jobs.length === 0) {
      list.innerHTML = `<div class="empty"><svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor"><path d="M8 12h48v8H8zm0 14h48v8H8zm0 14h48v8H8z"/></svg>还没有任务，去 <a href="#" onclick="event.preventDefault();switchView('create');">创建一个</a> 吧</div>`;
      return;
    }
    list.innerHTML = jobs.map(jobCardHtml).join("");
    list.querySelectorAll(".job-card").forEach((c) => c.addEventListener("click", () => showJobDetail(c.dataset.jobId)));
  } catch (e) {
    list.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}
function jobCardHtml(job) {
  const tags = (job.request.audience_tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  return `<div class="job-card" data-job-id="${escapeHtml(job.id)}">
    <div>
      <div class="jc-topic">${escapeHtml(job.request.topic)}</div>
      <div class="jc-meta">
        <span>市场 <strong>${escapeHtml(job.request.market)}</strong></span>
        <span>语气 ${escapeHtml(job.request.tone)}</span>
        <span>${tags || "-"}</span>
      </div>
    </div>
    <div class="jc-side">
      <span class="status-badge ${job.status}">${job.status}</span>
      <span class="jc-time">${formatTime(job.created_at)}</span>
    </div>
  </div>`;
}
function formatTime(iso) {
  if (!iso) return "-";
  try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); } catch { return iso; }
}

async function showJobDetail(id) {
  openModal("任务详情", "<div class='empty'>加载中…</div>");
  try {
    const job = await apiGet(`/api/v1/jobs/${encodeURIComponent(id)}`);
    let scriptBlock = "";
    try {
      const sc = await apiGet(`/api/v1/jobs/${encodeURIComponent(id)}/script`);
      if (sc.script) {
        scriptBlock = `<div class="detail-row"><div class="d-key">生成脚本</div><div class="d-val"><pre>${escapeHtml(sc.script)}</pre></div></div>`;
      }
    } catch {}

    const videoUrl = job.result && job.result.video_url;
    let videoBlock = "";
    if (videoUrl) {
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(videoUrl);
      const isPlayable = isVideo && /^https?:/i.test(videoUrl);
      videoBlock = `<div class="detail-row"><div class="d-key">视频链接</div><div class="d-val">
        <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">${escapeHtml(videoUrl)}</a>
        ${isPlayable ? `<div class="video-preview"><video controls src="${escapeHtml(videoUrl)}"></video></div>` : ""}
      </div></div>`;
    }
    const errBlock = job.error
      ? `<div class="detail-row"><div class="d-key">错误</div><div class="d-val" style="color:var(--c-error);">${escapeHtml(job.error)}</div></div>`
      : "";

    $("modalBody").innerHTML = `
      <div class="detail-row"><div class="d-key">任务 ID</div><div class="d-val mono">${escapeHtml(job.id)}</div></div>
      <div class="detail-row"><div class="d-key">状态</div><div class="d-val"><span class="status-badge ${job.status}">${job.status}</span></div></div>
      <div class="detail-row"><div class="d-key">主题</div><div class="d-val">${escapeHtml(job.request.topic)}</div></div>
      <div class="detail-row"><div class="d-key">市场</div><div class="d-val">${escapeHtml(job.request.market)}</div></div>
      <div class="detail-row"><div class="d-key">语气</div><div class="d-val">${escapeHtml(job.request.tone)}</div></div>
      <div class="detail-row"><div class="d-key">受众</div><div class="d-val">${(job.request.audience_tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ") || "-"}</div></div>
      <div class="detail-row"><div class="d-key">创建时间</div><div class="d-val">${formatTime(job.created_at)}</div></div>
      <div class="detail-row"><div class="d-key">更新时间</div><div class="d-val">${formatTime(job.updated_at)}</div></div>
      ${videoBlock}
      ${errBlock}
      ${scriptBlock}
    `;
  } catch (e) {
    $("modalBody").innerHTML = `<div class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
  }
}

// ===== Stats / right rail =====
async function loadStats() {
  try {
    const s = await apiGet("/api/v1/jobs/stats");
    const by = s.by_status || {};
    $("metricTotal").textContent = s.total ?? 0;
    $("metricSuccess").textContent = by.success || 0;
    $("metricRunning").textContent = (by.running || 0) + (by.queued || 0);
    $("metricFailed").textContent = by.failed || 0;

    const max = Math.max(1, ...(s.by_market || []).map((x) => x.count));
    $("marketBars").innerHTML = (s.by_market || []).length === 0
      ? `<div class="empty" style="padding:14px;">暂无数据</div>`
      : s.by_market.map((x) => `
          <div class="market-bar">
            <span class="mb-label">${escapeHtml(x.market)}</span>
            <span class="mb-track"><span class="mb-fill" style="width:${(x.count / max) * 100}%"></span></span>
            <span class="mb-num">${x.count}</span>
          </div>`).join("");

    const recent = await apiGet("/api/v1/jobs?limit=5");
    const list = recent.jobs || [];
    $("recentList").innerHTML = list.length === 0
      ? `<div class="empty" style="padding:14px;">暂无</div>`
      : list.map((j) => `
          <div class="recent-item" data-job-id="${escapeHtml(j.id)}">
            <span class="r-topic" title="${escapeHtml(j.request.topic)}">${escapeHtml(j.request.topic)}</span>
            <span class="status-badge ${j.status}">${j.status}</span>
          </div>`).join("");
    $("recentList").querySelectorAll(".recent-item").forEach((el) =>
      el.addEventListener("click", () => showJobDetail(el.dataset.jobId))
    );
    pollingActive = (by.running || 0) + (by.queued || 0) > 0;
  } catch (e) { /* keep silent */ }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    loadStats();
    if (pollingActive && document.querySelector(".view#viewTasks.active")) loadJobs();
  }, 6000);
}

// ===== Refresh button =====
document.addEventListener("DOMContentLoaded", () => {
  // wire refresh after dom ready (script is at end of body so safe)
});

// ===== Material =====
async function loadMaterial() {
  const grid = $("materialGrid");
  grid.innerHTML = `<div class="empty">加载中…</div>`;
  try {
    const markets = allMarkets.length ? allMarkets : await apiGet("/api/v1/culture");
    const detailed = await Promise.all(markets.map(async (m) => ({ m, rules: await apiGet(`/api/v1/culture/${m.id}`) })));
    grid.innerHTML = detailed.map(({ m, rules }) => {
      const tones = (rules.tone_preferences || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
      const taboos = (rules.taboo_terms || []).length
        ? rules.taboo_terms.map((t) => `<span class="tag taboo">${escapeHtml(t)}</span>`).join("")
        : `<span style="color:var(--c-muted);font-size:12px;">无</span>`;
      return `<div class="mat-card">
        <div class="mc-head"><h4>${escapeHtml(m.label)}</h4><span class="mc-lang">${escapeHtml(rules.language || "en")}</span></div>
        <div class="mat-section"><div class="ms-title">推荐语气</div><div>${tones || "-"}</div></div>
        <div class="mat-section"><div class="ms-title">禁忌 / 风险词</div><div>${taboos}</div></div>
      </div>`;
    }).join("");
  } catch (e) {
    grid.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

// ===== Summarize =====
function bindSummarize() {
  $("tabUrl").addEventListener("click", () => setSumTab("url"));
  $("tabText").addEventListener("click", () => setSumTab("text"));
  $("sumSubmitBtn").addEventListener("click", submitSummarize);
}
function setSumTab(tab) {
  $("tabUrl").classList.toggle("active", tab === "url");
  $("tabText").classList.toggle("active", tab === "text");
  $("urlField").hidden = tab !== "url";
  $("textField").hidden = tab !== "text";
  $("sumSubmitBtn").dataset.tab = tab;
}
async function submitSummarize() {
  const tab = $("sumSubmitBtn").dataset.tab || "url";
  const fb = $("sumFeedback"); fb.textContent = ""; fb.className = "feedback";
  const out = $("sumOutput");
  const payload = { source_type: tab, market: $("sumMarket").value };
  if (tab === "url") {
    const u = $("sumUrl").value.trim();
    if (!u) { fb.textContent = "请填写 URL"; fb.className = "feedback error"; return; }
    payload.url = u;
  } else {
    const t = $("sumText").value.trim();
    if (t.length < 20) { fb.textContent = "正文至少 20 字"; fb.className = "feedback error"; return; }
    payload.text = t;
  }
  const btn = $("sumSubmitBtn");
  btn.disabled = true; btn.textContent = "分析中…（最多 30s）";
  out.innerHTML = `<div class="empty-out">📡 正在抓取与分析，请稍候…</div>`;
  try {
    const data = await apiPost("/api/v1/content/summarize", payload);
    out.innerHTML = renderMarkdown(data.summary || "(空)") +
      `<hr/><div style="font-size:12px;color:var(--c-muted);">原文摘录：${escapeHtml(data.source_preview || "")}</div>`;
    fb.textContent = `已生成 · 市场 ${data.market}`; fb.className = "feedback success";
  } catch (e) {
    fb.textContent = "失败：" + e.message; fb.className = "feedback error";
    out.innerHTML = `<div class="empty-out" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "生成文化洞察";
  }
}

// ===== Admin: audit =====
function bindAdmin() {
  $("auditRefreshBtn").addEventListener("click", loadAuditLogs);
  $("auditExportBtn").addEventListener("click", exportAudit);
  $("refreshJobsBtn").addEventListener("click", () => { loadJobs(); loadStats(); });
}
async function loadAuditLogs() {
  if (!me || me.role !== "admin") return;
  const tbody = $("auditTable").querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="empty">加载中…</td></tr>`;
  try {
    const data = await apiGet("/api/v1/admin/audit-logs?limit=100");
    const rows = data.logs || [];
    if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="empty">无记录</td></tr>`; return; }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td class="mono">${escapeHtml(r.created_at)}</td>
        <td>${escapeHtml(r.username)}</td>
        <td class="mono">${escapeHtml(r.client_ip)}</td>
        <td>${escapeHtml(r.action)}</td>
        <td class="mono" style="max-width:280px;word-break:break-all;">${escapeHtml(r.detail || "")}</td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</td></tr>`;
  }
}
async function exportAudit() {
  try {
    const res = await api("/api/v1/admin/audit-logs/export?limit=2000", { method: "GET", raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit_logs_${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("已导出 CSV", "success");
  } catch (e) { toast("导出失败：" + e.message, "error"); }
}

// ===== Admin: users =====
function bindUsers() {
  $("usersRefreshBtn").addEventListener("click", loadUsers);
}
async function loadUsers() {
  if (!me || me.role !== "admin") return;
  const tbody = $("usersTable").querySelector("tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="empty">加载中…</td></tr>`;
  try {
    const data = await apiGet("/api/v1/admin/users");
    const rows = data.users || [];
    tbody.innerHTML = rows.map((u) => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td><span class="status-badge ${u.role === "admin" ? "running" : "queued"}">${escapeHtml(u.role)}</span></td>
        <td class="mono">${escapeHtml(u.created_at)}</td>
        <td style="text-align:right;">
          ${u.username === me.username ? `<span style="color:var(--c-muted);font-size:12px;">当前账号</span>`
            : `<button class="btn btn-sm" data-del="${escapeHtml(u.username)}">删除</button>`}
        </td>
      </tr>`).join("");
    tbody.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteUser(b.dataset.del)));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</td></tr>`;
  }
}
async function deleteUser(name) {
  if (!confirm(`确认删除账号「${name}」？该操作不可恢复。`)) return;
  try {
    await apiDel(`/api/v1/admin/users/${encodeURIComponent(name)}`);
    toast("已删除：" + name, "success"); loadUsers();
  } catch (e) { toast("删除失败：" + e.message, "error"); }
}

// ===== Modal =====
function bindModal() {
  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").classList.add("show");
}
function closeModal() { $("modal").classList.remove("show"); }

// expose for inline handlers
window.switchView = switchView;

// ===== Model Config (admin) =====
let mcCurrent = null;
function bindModelConfig() {
  const sel = $("mcModel");
  const cust = $("mcModelCustom");
  if (!sel) return;
  sel.addEventListener("change", () => {
    cust.hidden = sel.value !== "__custom";
  });
  $("mcSaveBtn").addEventListener("click", submitModelConfig);
  $("mcTestBtn").addEventListener("click", testModelConfig);
  $("mcReloadBtn").addEventListener("click", loadModelConfig);
}
async function loadModelConfig() {
  const fb = $("mcFeedback"); if (fb) fb.textContent = "";
  try {
    const snap = await apiGet("/api/v1/admin/model-config");
    mcCurrent = snap;
    $("mcApiKey").value = "";
    $("mcApiKey").placeholder = snap.deepseek_api_key || "sk-…（未设置）";
    $("mcBaseUrl").value = snap.deepseek_base_url || "";
    const sel = $("mcModel"); const cust = $("mcModelCustom");
    const opts = Array.from(sel.options).map((o) => o.value);
    if (opts.includes(snap.deepseek_model)) {
      sel.value = snap.deepseek_model; cust.hidden = true; cust.value = "";
    } else {
      sel.value = "__custom"; cust.hidden = false; cust.value = snap.deepseek_model || "";
    }
    const pill = $("mcKeyPill");
    if (snap.deepseek_api_key_set) { pill.textContent = "已设置"; pill.classList.add("set"); }
    else { pill.textContent = "未设置"; pill.classList.remove("set"); }
  } catch (e) {
    if (fb) { fb.textContent = "加载失败：" + e.message; fb.style.color = "var(--c-error)"; }
  }
  // 视频模型信息（从 /api/v1/health 获取不到，这里只展示托管说明）
  $("mcWanModel").textContent = "Wan-AI/Wan2.2-T2V-A14B";
  $("mcWanTask").textContent = "text-to-video";
  $("mcWanSize").textContent = "1280x720";
}
function _mcCollect() {
  const sel = $("mcModel"); const cust = $("mcModelCustom");
  const model = sel.value === "__custom" ? cust.value.trim() : sel.value;
  const body = {};
  const k = $("mcApiKey").value.trim(); if (k) body.deepseek_api_key = k;
  const u = $("mcBaseUrl").value.trim(); if (u) body.deepseek_base_url = u;
  if (model) body.deepseek_model = model;
  return body;
}
async function submitModelConfig() {
  const fb = $("mcFeedback"); fb.textContent = "保存中…"; fb.style.color = "var(--c-muted)";
  try {
    const body = _mcCollect();
    const snap = await apiPut("/api/v1/admin/model-config", body);
    mcCurrent = snap;
    fb.textContent = "已保存。当前 Model: " + snap.deepseek_model + "， API Key 状态：" + (snap.deepseek_api_key_set ? "已设置" : "未设置");
    fb.style.color = "var(--c-success)";
    toast("模型配置已生效", "success");
    await loadModelConfig();
  } catch (e) {
    fb.textContent = "保存失败：" + e.message;
    fb.style.color = "var(--c-error)";
  }
}
async function testModelConfig() {
  const out = $("mcTestOut"); out.textContent = "调用中…";
  try {
    const r = await apiPost("/api/v1/admin/model-config/test", {});
    out.textContent = "✅ 成功\nmodel: " + r.model + "\nbase_url: " + r.base_url + "\nreply: " + r.reply + "\nusage: " + JSON.stringify(r.usage || {});
    toast("DeepSeek 连接正常", "success");
  } catch (e) {
    out.textContent = "❌ 调用失败\n" + e.message;
    toast("DeepSeek 调用失败", "error");
  }
}

// ===== Go =====
boot();
