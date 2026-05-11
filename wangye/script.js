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
  bindMaterial();

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
  const g = $("chatInsertCultureBtn"); if (g) g.addEventListener("click", () => insertCultureToChat("guide"));
  const t = $("chatInsertTabooBtn");   if (t) t.addEventListener("click", () => insertCultureToChat("taboo"));
  const o = $("chatInsertToneBtn");    if (o) o.addEventListener("click", () => insertCultureToChat("tone"));
  const r = $("chatRefMaterialBtn");   if (r) r.addEventListener("click", openMaterialPicker);
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
      material_ids: _chatRefMaterials.map((x) => x.id),
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

// ===== 引用素材 =====
let _chatRefMaterials = []; // [{id, title, market}]

function _renderRefChips() {
  const wrap = $("chatRefChips");
  if (!wrap) return;
  if (!_chatRefMaterials.length) { wrap.hidden = true; wrap.innerHTML = ""; return; }
  wrap.hidden = false;
  wrap.innerHTML = _chatRefMaterials.map((m) =>
    `<span class="ref-chip" data-rid="${escapeHtml(m.id)}">${escapeHtml(m.title)} · ${escapeHtml(m.market)}<span class="x" data-x="${escapeHtml(m.id)}">✕</span></span>`
  ).join("");
  wrap.querySelectorAll("[data-x]").forEach((x) => x.addEventListener("click", () => {
    _chatRefMaterials = _chatRefMaterials.filter((m) => m.id !== x.dataset.x);
    _renderRefChips();
  }));
}

async function openMaterialPicker() {
  openModal("引用素材到对话", `<div class="empty">加载中…</div>`);
  try {
    const data = await apiGet("/api/v1/materials?limit=200");
    let items = data.items || [];
    // 默认按当前市场过滤；提供切换全部
    const renderBody = (filterAll) => {
      const filtered = filterAll ? items : items.filter((it) => it.market === (currentMarket || "").toUpperCase());
      const checked = new Set(_chatRefMaterials.map((m) => m.id));
      const list = filtered.length ? `
        <div class="picker-list">
          ${filtered.map((it) => `
            <label class="picker-item ${checked.has(it.id) ? "checked" : ""}" data-pid="${escapeHtml(it.id)}">
              <input type="checkbox" ${checked.has(it.id) ? "checked" : ""} data-cb="${escapeHtml(it.id)}" />
              <div style="flex:1;">
                <div class="pi-title">${escapeHtml(it.title)}</div>
                <div class="pi-meta">${escapeHtml(it.market)} · ${escapeHtml((it.created_at || "").slice(0, 10))} · ${escapeHtml((it.structured && (it.structured.tags || []).slice(0, 3).join("、")) || "")}</div>
              </div>
            </label>`).join("")}
        </div>` : `<div class="empty">该市场下没有保存过素材，先去「内容洞察」分析并入库。</div>`;
      $("modalBody").innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px;">
          <label><input type="checkbox" id="pkAllMarkets" ${filterAll ? "checked" : ""} /> 显示所有市场（默认仅 ${escapeHtml(currentMarket)}）</label>
          <span style="flex:1;"></span>
          <span style="color:var(--c-muted); font-size:12px;">最多引用 10 条</span>
        </div>
        ${list}
        <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="pkCancelBtn">取消</button>
          <button class="btn btn-primary" id="pkConfirmBtn">确定引用</button>
        </div>`;
      $("pkAllMarkets").addEventListener("change", (e) => renderBody(e.target.checked));
      $("pkCancelBtn").addEventListener("click", closeModal);
      $("pkConfirmBtn").addEventListener("click", () => {
        const picks = [];
        $$("[data-cb]", $("modalBody")).forEach((cb) => {
          if (cb.checked) {
            const it = items.find((x) => x.id === cb.dataset.cb);
            if (it) picks.push({ id: it.id, title: it.title, market: it.market });
          }
        });
        if (picks.length > 10) { toast("最多引用 10 条", "error"); return; }
        _chatRefMaterials = picks;
        _renderRefChips();
        toast(`已引用 ${picks.length} 条素材`, "success");
        closeModal();
      });
    };
    renderBody(false);
  } catch (e) {
    $("modalBody").innerHTML = `<div class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
  }
}

// ===== Culture quick-apply (快捷调用文化素材) =====
const _cultureCache = {};
async function getCultureRules(marketUpper) {
  const key = (marketUpper || "").toUpperCase();
  if (_cultureCache[key]) return _cultureCache[key];
  const m = (allMarkets || []).find((x) => (x.id || x.label || "").toUpperCase() === key);
  const apiId = m ? m.id : key.toLowerCase();
  const r = await apiGet(`/api/v1/culture/${encodeURIComponent(apiId)}`);
  _cultureCache[key] = r;
  return r;
}
function _summarizeRules(r) {
  const tones = (r.tone_preferences || []).join("、") || "无明确偏好";
  const taboos = (r.taboo_terms || []).join("、") || "无";
  return { tones, taboos, lang: r.language || "en" };
}

async function applyCultureToCreate() {
  const fb = $("createCultureHint");
  const wrap = $("createCultureQuick");
  try {
    const market = $("createMarket").value || currentMarket;
    const r = await getCultureRules(market);
    const s = _summarizeRules(r);
    const firstTone = (r.tone_preferences || [])[0];
    if (firstTone) $("createTone").value = firstTone;
    const tagsEl = $("createTags");
    const cur = tagsEl.value.split(",").map((t) => t.trim()).filter(Boolean);
    const langTag = `lang:${s.lang}`;
    const avoidTag = (r.taboo_terms || []).length ? `avoid:${(r.taboo_terms || []).slice(0, 2).join("|")}` : "";
    if (!cur.includes(langTag)) cur.push(langTag);
    if (avoidTag && !cur.some((t) => t.startsWith("avoid:"))) cur.push(avoidTag);
    tagsEl.value = cur.join(", ");
    wrap.classList.add("applied");
    fb.textContent = `已套用 ${market}：语气=${s.tones} · 禁忌=${s.taboos}`;
    toast("已套用市场文化风格", "success");
  } catch (e) {
    toast("加载文化规则失败：" + e.message, "error");
  }
}

async function insertCultureToChat(kind) {
  try {
    const r = await getCultureRules(currentMarket);
    const s = _summarizeRules(r);
    let snippet = "";
    if (kind === "guide") {
      snippet = `请严格遵循 ${currentMarket} 市场的文化指南（语言=${s.lang}，推荐语气=${s.tones}，需避开=${s.taboos}）。\n`;
    } else if (kind === "taboo") {
      snippet = `请重点告诉我 ${currentMarket} 市场上需避开的表达与示例。已知禁忌词：${s.taboos}。`;
    } else if (kind === "tone") {
      snippet = `接下来的回复请采用 ${currentMarket} 市场推荐语气：${s.tones}。`;
    }
    const ta = $("chatInput");
    const cur = ta.value.trim();
    ta.value = cur ? `${snippet}\n${cur}` : snippet;
    ta.focus();
    toast("已插入文化提示", "success");
  } catch (e) {
    toast("加载文化规则失败：" + e.message, "error");
  }
}

async function applyCultureToSummarize() {
  try {
    const market = $("sumMarket").value || currentMarket;
    const r = await getCultureRules(market);
    const s = _summarizeRules(r);
    const prefix = `[市场指南 · ${market}] 语言=${s.lang}；推荐语气=${s.tones}；需避开=${s.taboos}。\n\n`;
    const tab = $("sumSubmitBtn").dataset.tab || "url";
    if (tab === "text") {
      const el = $("sumText");
      el.value = prefix + (el.value || "");
      el.focus();
      toast("已在正文前追加市场指南", "success");
    } else {
      setSumTab("text");
      $("sumText").value = prefix;
      $("sumText").focus();
      toast("已切到「粘贴正文」并填入市场指南", "success");
    }
  } catch (e) {
    toast("加载文化规则失败：" + e.message, "error");
  }
}

// ===== Create job =====
function bindCreate() {
  $("createSubmitBtn").addEventListener("click", submitCreate);
  $("createResetBtn").addEventListener("click", () => {
    $("createTopic").value = "";
    $("createTone").value = "neutral";
    $("createTags").value = "";
    const wrap = $("createCultureQuick"); if (wrap) wrap.classList.remove("applied");
    setCreateFb("", "");
  });
  const ac = $("createApplyCultureBtn");
  if (ac) ac.addEventListener("click", applyCultureToCreate);
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
let _materialCache = { systems: [], mine: [] };
let _matFilterMarket = "";
let _matSearch = "";

function bindMaterial() {
  const refresh = $("matRefreshBtn");
  if (refresh) refresh.addEventListener("click", () => loadMaterial(true));
  const sel = $("matMarketFilter");
  if (sel) sel.addEventListener("change", () => { _matFilterMarket = sel.value || ""; renderMaterial(); });
  const s = $("matSearch");
  if (s) s.addEventListener("input", () => { _matSearch = s.value.trim().toLowerCase(); renderMaterial(); });
}

async function loadMaterial(force = false) {
  const grid = $("materialGrid");
  grid.innerHTML = `<div class="empty">加载中…</div>`;
  try {
    const markets = allMarkets.length ? allMarkets : await apiGet("/api/v1/culture");
    const detailed = await Promise.all(markets.map(async (m) => ({ m, rules: await apiGet(`/api/v1/culture/${m.id}`) })));
    _materialCache.systems = detailed.map(({ m, rules }) => ({
      _kind: "system",
      id: "sys:" + m.id,
      market: (m.id || "").toUpperCase(),
      title: m.label,
      rules,
    }));
    const data = await apiGet("/api/v1/materials?limit=200");
    _materialCache.mine = (data.items || []).map((it) => ({ _kind: "mine", ...it }));
    // 填充 market filter
    const sel = $("matMarketFilter");
    if (sel && sel.options.length <= 1) {
      const seen = new Set();
      [..._materialCache.systems, ..._materialCache.mine].forEach((x) => seen.add(x.market));
      [...seen].sort().forEach((mk) => {
        const opt = document.createElement("option"); opt.value = mk; opt.textContent = mk;
        sel.appendChild(opt);
      });
    }
    renderMaterial();
  } catch (e) {
    grid.innerHTML = `<div class="empty">加载失败：${escapeHtml(e.message)}</div>`;
  }
}

function renderMaterial() {
  const grid = $("materialGrid");
  const all = [..._materialCache.systems, ..._materialCache.mine];
  const filtered = all.filter((it) => {
    if (_matFilterMarket && it.market !== _matFilterMarket) return false;
    if (_matSearch) {
      const hay = (
        (it.title || "") + " " +
        (it.market || "") + " " +
        ((it.structured && (it.structured.tags || []).join(" ")) || "") + " " +
        ((it.structured && (it.structured.tags || [])).join(" ") || "")
      ).toLowerCase();
      if (!hay.includes(_matSearch)) return false;
    }
    return true;
  });
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">没有匹配的素材</div>`;
    return;
  }
  grid.innerHTML = filtered.map((it) => {
    if (it._kind === "system") {
      const tones = (it.rules.tone_preferences || []).slice(0, 3).join("、") || "无";
      const taboos = (it.rules.taboo_terms || []).slice(0, 3).join("、") || "无";
      return `<div class="mat-row" data-sys="${escapeHtml(it.market)}">
        <span class="mr-badge system">系统</span>
        <div>
          <div class="mr-title">${escapeHtml(it.title)} · ${escapeHtml(it.market)}</div>
          <div class="mr-meta">
            <span>语言 ${escapeHtml(it.rules.language || "en")}</span>
            <span>语气：${escapeHtml(tones)}</span>
            <span>禁忌：${escapeHtml(taboos)}</span>
          </div>
        </div>
        <div class="mr-actions"><button class="btn btn-sm" data-sys-detail="${escapeHtml(it.market)}">查看</button></div>
      </div>`;
    } else {
      const tags = ((it.structured && it.structured.tags) || []).slice(0, 4).join("、") || "—";
      return `<div class="mat-row" data-mine="${escapeHtml(it.id)}">
        <span class="mr-badge mine">我的</span>
        <div>
          <div class="mr-title">${escapeHtml(it.title)} · ${escapeHtml(it.market)}</div>
          <div class="mr-meta">
            <span>${escapeHtml(it.source_type === "url" ? (it.source_url || "URL") : "正文")}</span>
            <span>标签：${escapeHtml(tags)}</span>
            <span>${escapeHtml((it.created_at || "").replace("T", " ").slice(0, 16))}</span>
          </div>
        </div>
        <div class="mr-actions">
          <button class="btn btn-sm" data-mine-detail="${escapeHtml(it.id)}">查看</button>
          <button class="btn btn-sm" data-mine-del="${escapeHtml(it.id)}" style="color:var(--c-error);">删除</button>
        </div>
      </div>`;
    }
  }).join("");
  grid.querySelectorAll("[data-sys-detail]").forEach((b) =>
    b.addEventListener("click", () => showSystemMaterial(b.dataset.sysDetail))
  );
  grid.querySelectorAll("[data-mine-detail]").forEach((b) =>
    b.addEventListener("click", () => showMyMaterial(b.dataset.mineDetail))
  );
  grid.querySelectorAll("[data-mine-del]").forEach((b) =>
    b.addEventListener("click", () => deleteMyMaterial(b.dataset.mineDel))
  );
}

function showSystemMaterial(market) {
  const it = _materialCache.systems.find((x) => x.market === market);
  if (!it) return;
  const tones = (it.rules.tone_preferences || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ") || "—";
  const taboos = (it.rules.taboo_terms || []).map((t) => `<span class="tag taboo">${escapeHtml(t)}</span>`).join(" ") || "—";
  openModal(`系统市场 · ${it.title}`, `
    <div class="detail-row"><div class="d-key">市场代码</div><div class="d-val mono">${escapeHtml(it.market)}</div></div>
    <div class="detail-row"><div class="d-key">语言</div><div class="d-val">${escapeHtml(it.rules.language || "en")}</div></div>
    <div class="detail-row"><div class="d-key">推荐语气</div><div class="d-val">${tones}</div></div>
    <div class="detail-row"><div class="d-key">禁忌词</div><div class="d-val">${taboos}</div></div>
  `);
}

async function showMyMaterial(id) {
  openModal("素材详情", `<div class="empty">加载中…</div>`);
  try {
    const it = await apiGet(`/api/v1/materials/${encodeURIComponent(id)}`);
    const s = it.structured || {};
    const list = (arr) => (arr && arr.length) ? `<ul style="margin:6px 0 0 16px;">${arr.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "—";
    $("modalBody").innerHTML = `
      <div class="detail-row"><div class="d-key">标题</div><div class="d-val">${escapeHtml(it.title)}</div></div>
      <div class="detail-row"><div class="d-key">市场</div><div class="d-val">${escapeHtml(it.market)}</div></div>
      <div class="detail-row"><div class="d-key">来源</div><div class="d-val mono" style="word-break:break-all;">${escapeHtml(it.source_url || it.source_type)}</div></div>
      <div class="detail-row"><div class="d-key">创建时间</div><div class="d-val">${escapeHtml((it.created_at || "").replace("T", " "))}</div></div>
      <div class="detail-row"><div class="d-key">语气观察</div><div class="d-val">${list(s.tone_observed)}</div></div>
      <div class="detail-row"><div class="d-key">风险</div><div class="d-val">${list(s.risks)}</div></div>
      <div class="detail-row"><div class="d-key">触及禁忌</div><div class="d-val">${list(s.taboo_hits)}</div></div>
      <div class="detail-row"><div class="d-key">标签</div><div class="d-val">${(s.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ") || "—"}</div></div>
      <div class="detail-row"><div class="d-key">关键引用</div><div class="d-val">${list(s.key_quotes)}</div></div>
      <div class="detail-row"><div class="d-key">报告</div><div class="d-val">${renderMarkdown(it.summary_md || "(空)")}</div></div>
    `;
  } catch (e) {
    $("modalBody").innerHTML = `<div class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
  }
}

async function deleteMyMaterial(id) {
  if (!confirm("确认删除这条素材？")) return;
  try {
    await apiDel(`/api/v1/materials/${encodeURIComponent(id)}`);
    toast("已删除", "success");
    loadMaterial(true);
  } catch (e) { toast("删除失败：" + e.message, "error"); }
}

// ===== Summarize =====
let _lastSummarize = null; // {market, source_url, source_type, raw_excerpt, summary, structured}

function bindSummarize() {
  $("tabUrl").addEventListener("click", () => setSumTab("url"));
  $("tabText").addEventListener("click", () => setSumTab("text"));
  $("sumSubmitBtn").addEventListener("click", submitSummarize);
  const ac = $("sumApplyCultureBtn");
  if (ac) ac.addEventListener("click", applyCultureToSummarize);
  const sb = $("sumSaveBtn"); if (sb) sb.addEventListener("click", saveSummarizeToLibrary);
  const cb = $("sumSaveCancelBtn"); if (cb) cb.addEventListener("click", () => { $("sumSavePanel").hidden = true; });
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
  const payload = { source_type: tab, market: $("sumMarket").value, extract: true };
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
  btn.disabled = true; btn.textContent = "分析中…（首轮总结+二次结构化）";
  out.innerHTML = `<div class="empty-out">正在抓取与分析，请稍候…</div>`;
  $("sumSavePanel").hidden = true;
  try {
    const data = await apiPost("/api/v1/content/summarize", payload);
    _lastSummarize = data;
    out.innerHTML = renderMarkdown(data.summary || "(空)") +
      `<hr/><div style="font-size:12px;color:var(--c-muted);">原文摘录：${escapeHtml(data.source_preview || "")}</div>`;
    fb.textContent = `已生成 · 市场 ${data.market}`; fb.className = "feedback success";
    if (data.structured) {
      $("sumSaveTitle").value = data.structured.title || "未命名素材";
      $("sumSaveMarket").textContent = data.market;
      $("sumSaveSource").textContent = data.source_url || "(粘贴正文)";
      $("sumSaveStructured").textContent = JSON.stringify(data.structured, null, 2);
      $("sumSaveFb").textContent = "";
      $("sumSavePanel").hidden = false;
    }
  } catch (e) {
    fb.textContent = "失败：" + e.message; fb.className = "feedback error";
    out.innerHTML = `<div class="empty-out" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = "生成文化洞察";
  }
}

async function saveSummarizeToLibrary() {
  if (!_lastSummarize) { toast("没有可保存的分析结果", "error"); return; }
  const fb = $("sumSaveFb"); fb.textContent = "保存中…"; fb.className = "feedback";
  let structured = {};
  try { structured = JSON.parse($("sumSaveStructured").textContent); } catch { structured = _lastSummarize.structured || {}; }
  const body = {
    market: _lastSummarize.market,
    title: $("sumSaveTitle").value.trim() || structured.title || "未命名素材",
    source_type: _lastSummarize.source_type,
    source_url: _lastSummarize.source_url || "",
    summary_md: _lastSummarize.summary || "",
    raw_excerpt: _lastSummarize.raw_excerpt || "",
    structured,
  };
  const btn = $("sumSaveBtn"); btn.disabled = true;
  try {
    const rec = await apiPost("/api/v1/materials", body);
    fb.textContent = `已入库 · ${rec.id}`; fb.className = "feedback success";
    toast("素材已保存到我的库", "success");
    $("sumSavePanel").hidden = true;
    _materialCache.mine.unshift({ _kind: "mine", ...rec });
  } catch (e) {
    fb.textContent = "保存失败：" + e.message; fb.className = "feedback error";
  } finally {
    btn.disabled = false;
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
