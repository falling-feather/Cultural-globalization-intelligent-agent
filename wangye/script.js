/* ===== API Layer ===== */

const API_BASE = window.location.origin;

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || JSON.stringify(data));
  return data;
}

const api = {
  health: () => apiGet("/health"),
  chat: (message, market, history) =>
    apiPost("/api/v1/chat", { message, market, history }),
  createJob: (payload) => apiPost("/api/v1/jobs", payload),
  getJob: (id) => apiGet(`/api/v1/jobs/${id}`),
  listJobs: (limit = 20, offset = 0) =>
    apiGet(`/api/v1/jobs?limit=${limit}&offset=${offset}`),
  getJobScript: (id) => apiGet(`/api/v1/jobs/${id}/script`),
  listMarkets: () => apiGet("/api/v1/culture"),
  getMarketRules: (market) => apiGet(`/api/v1/culture/${market}`),
};

/* ===== State ===== */

let currentView = "dialog";
let chatHistory = [];
let currentMarket = "AFRICA";
let allMarkets = [];
let isWaitingReply = false;

/* ===== DOM Refs ===== */

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  healthBadge: $("healthBadge"),
  marketSelect: $("marketSelect"),
  newTaskBtn: $("newTaskBtn"),

  viewDialog: $("viewDialog"),
  viewTasks: $("viewTasks"),
  viewMaterial: $("viewMaterial"),
  viewCreate: $("viewCreate"),

  chatMessages: $("chatMessages"),
  chatInput: $("chatInput"),
  chatSendBtn: $("chatSendBtn"),
  chatFeedback: $("chatFeedback"),
  chatMarketLabel: $("chatMarketLabel"),

  jobsList: $("jobsList"),
  refreshJobsBtn: $("refreshJobsBtn"),

  materialGrid: $("materialGrid"),

  createTopic: $("createTopic"),
  createMarket: $("createMarket"),
  createTone: $("createTone"),
  createTags: $("createTags"),
  createSubmitBtn: $("createSubmitBtn"),
  createFeedback: $("createFeedback"),

  metricTotal: $("metricTotal"),
  metricHint: $("metricHint"),
  recentJobs: $("recentJobs"),
  resLine1: $("resLine1"),
  resLine2: $("resLine2"),

  taskModal: $("taskModal"),
  modalClose: $("modalClose"),
  modalBody: $("modalBody"),
};

/* ===== Navigation ===== */

const viewMap = {
  dialog: els.viewDialog,
  tasks: els.viewTasks,
  material: els.viewMaterial,
  create: els.viewCreate,
};

function switchView(viewKey) {
  if (!viewMap[viewKey]) return;
  currentView = viewKey;

  Object.values(viewMap).forEach((el) => el.classList.add("hidden"));
  viewMap[viewKey].classList.remove("hidden");

  $$(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });

  if (viewKey === "tasks") loadJobs();
  if (viewKey === "material") loadMaterial();
}

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

$("quickChat").addEventListener("click", () => switchView("dialog"));
$("quickCreate").addEventListener("click", () => switchView("create"));
$("quickMaterial").addEventListener("click", () => switchView("material"));
els.newTaskBtn.addEventListener("click", () => switchView("create"));

/* ===== Health Check ===== */

async function checkHealth() {
  try {
    const data = await api.health();
    els.healthBadge.textContent = `服务正常`;
    els.healthBadge.className = "health-badge ok";
    els.resLine1.textContent = `服务: 在线 (${data.env})`;
    els.resLine2.textContent = `市场: ${currentMarket}`;
  } catch {
    els.healthBadge.textContent = "服务不可用";
    els.healthBadge.className = "health-badge err";
    els.resLine1.textContent = "服务: 离线";
    els.resLine2.textContent = "请检查后端是否启动";
  }
}

/* ===== Markets ===== */

async function loadMarkets() {
  try {
    allMarkets = await api.listMarkets();
    const options = allMarkets
      .map(
        (m) =>
          `<option value="${m.id.toUpperCase()}"${m.id.toUpperCase() === currentMarket ? " selected" : ""}>${m.label}</option>`
      )
      .join("");

    if (options) {
      els.marketSelect.innerHTML = options;
      els.createMarket.innerHTML = options;
    }
  } catch {
    // keep default options
  }
}

els.marketSelect.addEventListener("change", () => {
  currentMarket = els.marketSelect.value;
  els.chatMarketLabel.textContent = `市场: ${currentMarket}`;
  els.resLine2.textContent = `市场: ${currentMarket}`;
});

/* ===== Chat ===== */

function appendBubble(role, text) {
  const bubble = document.createElement("article");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  els.chatMessages.appendChild(bubble);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return bubble;
}

function setLoading(loading) {
  isWaitingReply = loading;
  els.chatSendBtn.disabled = loading;
  els.chatSendBtn.textContent = loading ? "思考中..." : "发送";
}

function setChatFeedback(text, type = "") {
  els.chatFeedback.textContent = text;
  els.chatFeedback.className = `feedback ${type}`;
}

async function sendMessage() {
  const text = els.chatInput.value.trim();
  if (!text || isWaitingReply) return;

  appendBubble("user", text);
  els.chatInput.value = "";
  setChatFeedback("");

  const loadingBubble = appendBubble("ai", "正在思考...");
  loadingBubble.classList.add("loading");
  setLoading(true);

  try {
    const data = await api.chat(text, currentMarket, chatHistory);
    chatHistory.push({ role: "user", content: text });
    chatHistory.push({ role: "assistant", content: data.reply });

    loadingBubble.textContent = data.reply;
    loadingBubble.classList.remove("loading");
  } catch (err) {
    loadingBubble.textContent = `请求失败: ${err.message}`;
    loadingBubble.classList.remove("loading");
    setChatFeedback(err.message, "error");
  } finally {
    setLoading(false);
  }
}

els.chatSendBtn.addEventListener("click", sendMessage);
els.chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ===== Jobs List ===== */

function renderStatusBadge(status) {
  return `<span class="status-badge ${status}">${status}</span>`;
}

function formatTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

async function loadJobs() {
  els.jobsList.innerHTML = '<p class="empty-hint">加载中...</p>';
  try {
    const data = await api.listJobs();
    if (!data.jobs || data.jobs.length === 0) {
      els.jobsList.innerHTML = '<p class="empty-hint">暂无任务，请先创建一个视频生成任务。</p>';
      updateMetrics(0, []);
      return;
    }

    els.jobsList.innerHTML = data.jobs
      .map(
        (job) => `
      <div class="job-card" data-job-id="${job.id}">
        <div class="job-card-header">
          <span class="job-card-topic">${escapeHtml(job.request.topic)}</span>
          ${renderStatusBadge(job.status)}
        </div>
        <div class="job-card-meta">
          <span>市场: ${escapeHtml(job.request.market)}</span>
          <span>语气: ${escapeHtml(job.request.tone)}</span>
          <span>${formatTime(job.created_at)}</span>
        </div>
      </div>`
      )
      .join("");

    els.jobsList.querySelectorAll(".job-card").forEach((card) => {
      card.addEventListener("click", () => showJobDetail(card.dataset.jobId));
    });

    updateMetrics(data.total, data.jobs);
  } catch (err) {
    els.jobsList.innerHTML = `<p class="empty-hint">加载失败: ${escapeHtml(err.message)}</p>`;
  }
}

function updateMetrics(total, jobs) {
  els.metricTotal.textContent = total;
  const successCount = jobs.filter((j) => j.status === "success").length;
  const runningCount = jobs.filter((j) => j.status === "running").length;
  els.metricHint.textContent = `成功 ${successCount} | 运行中 ${runningCount}`;

  if (jobs.length === 0) {
    els.recentJobs.innerHTML = '<p class="empty-hint">暂无</p>';
    return;
  }

  els.recentJobs.innerHTML = jobs
    .slice(0, 5)
    .map(
      (job) => `
    <div class="recent-job-item" data-job-id="${job.id}">
      <span class="recent-job-topic">${escapeHtml(job.request.topic)}</span>
      <span class="recent-job-status status-badge ${job.status}">${job.status}</span>
    </div>`
    )
    .join("");

  els.recentJobs.querySelectorAll(".recent-job-item").forEach((item) => {
    item.addEventListener("click", () => showJobDetail(item.dataset.jobId));
  });
}

async function showJobDetail(jobId) {
  els.taskModal.classList.remove("hidden");
  els.modalBody.innerHTML = "<p>加载中...</p>";

  try {
    const job = await api.getJob(jobId);
    let scriptHtml = "";
    if (job.status === "success" || job.status === "running") {
      try {
        const scriptData = await api.getJobScript(jobId);
        if (scriptData.script) {
          scriptHtml = `
            <div class="detail-row" style="flex-direction:column;">
              <span class="detail-label">生成脚本</span>
              <pre>${escapeHtml(scriptData.script)}</pre>
            </div>`;
        }
      } catch {
        // script not available
      }
    }

    const videoUrl = job.result?.video_url;
    const videoHtml = videoUrl
      ? `<div class="detail-row"><span class="detail-label">视频地址</span><span class="detail-value"><a href="${escapeHtml(videoUrl)}" target="_blank" style="color:var(--primary);word-break:break-all;">${escapeHtml(videoUrl)}</a></span></div>`
      : "";

    const errorHtml = job.error
      ? `<div class="detail-row"><span class="detail-label">错误</span><span class="detail-value" style="color:var(--error);">${escapeHtml(job.error)}</span></div>`
      : "";

    els.modalBody.innerHTML = `
      <div class="detail-row"><span class="detail-label">任务 ID</span><span class="detail-value" style="font-family:monospace;font-size:12px;">${escapeHtml(job.id)}</span></div>
      <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">${renderStatusBadge(job.status)}</span></div>
      <div class="detail-row"><span class="detail-label">主题</span><span class="detail-value">${escapeHtml(job.request.topic)}</span></div>
      <div class="detail-row"><span class="detail-label">市场</span><span class="detail-value">${escapeHtml(job.request.market)}</span></div>
      <div class="detail-row"><span class="detail-label">语气</span><span class="detail-value">${escapeHtml(job.request.tone)}</span></div>
      <div class="detail-row"><span class="detail-label">受众</span><span class="detail-value">${(job.request.audience_tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</span></div>
      <div class="detail-row"><span class="detail-label">创建时间</span><span class="detail-value">${formatTime(job.created_at)}</span></div>
      <div class="detail-row"><span class="detail-label">更新时间</span><span class="detail-value">${formatTime(job.updated_at)}</span></div>
      ${videoHtml}
      ${errorHtml}
      ${scriptHtml}
    `;
  } catch (err) {
    els.modalBody.innerHTML = `<p style="color:var(--error);">加载失败: ${escapeHtml(err.message)}</p>`;
  }
}

els.modalClose.addEventListener("click", () =>
  els.taskModal.classList.add("hidden")
);
els.taskModal.addEventListener("click", (e) => {
  if (e.target === els.taskModal) els.taskModal.classList.add("hidden");
});
els.refreshJobsBtn.addEventListener("click", loadJobs);

/* ===== Material ===== */

async function loadMaterial() {
  els.materialGrid.innerHTML = '<p class="empty-hint">加载中...</p>';

  try {
    const markets = allMarkets.length > 0 ? allMarkets : await api.listMarkets();
    if (markets.length === 0) {
      els.materialGrid.innerHTML = '<p class="empty-hint">暂无文化数据</p>';
      return;
    }

    const rulesPromises = markets.map((m) =>
      api.getMarketRules(m.id).then((rules) => ({ market: m, rules }))
    );
    const results = await Promise.all(rulesPromises);

    els.materialGrid.innerHTML = results
      .map(
        ({ market, rules }) => `
      <div class="material-card">
        <h4>${escapeHtml(market.label)} (${escapeHtml(rules.language || "en")})</h4>
        <div class="rule-section">
          <div class="rule-label">推荐语气</div>
          <div class="rule-value">${(rules.tone_preferences || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</div>
        </div>
        <div class="rule-section">
          <div class="rule-label">禁忌用语</div>
          <div class="rule-value">${(rules.taboo_terms || []).length > 0 ? rules.taboo_terms.map((t) => `<span class="tag" style="background:#fee2e2;color:var(--error);">${escapeHtml(t)}</span>`).join(" ") : '<span style="color:var(--muted);">无</span>'}</div>
        </div>
        ${rules.cultural_notes ? `<div class="rule-section"><div class="rule-label">文化备注</div><div class="rule-value">${escapeHtml(typeof rules.cultural_notes === "string" ? rules.cultural_notes : JSON.stringify(rules.cultural_notes))}</div></div>` : ""}
      </div>`
      )
      .join("");
  } catch (err) {
    els.materialGrid.innerHTML = `<p class="empty-hint">加载失败: ${escapeHtml(err.message)}</p>`;
  }
}

/* ===== Create Job ===== */

function setCreateFeedback(text, type = "") {
  els.createFeedback.textContent = text;
  els.createFeedback.className = `feedback ${type}`;
}

async function submitJob() {
  const topic = els.createTopic.value.trim();
  if (!topic) {
    setCreateFeedback("请输入主题", "error");
    return;
  }

  const payload = {
    topic,
    market: els.createMarket.value,
    tone: els.createTone.value.trim() || "neutral",
    audience_tags: els.createTags.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  els.createSubmitBtn.disabled = true;
  els.createSubmitBtn.textContent = "提交中...";
  setCreateFeedback("");

  try {
    const data = await api.createJob(payload);
    setCreateFeedback(`任务已创建！ID: ${data.job_id}`, "success");
    loadJobsSilent();
  } catch (err) {
    setCreateFeedback(`创建失败: ${err.message}`, "error");
  } finally {
    els.createSubmitBtn.disabled = false;
    els.createSubmitBtn.textContent = "提交任务";
  }
}

els.createSubmitBtn.addEventListener("click", submitJob);

async function loadJobsSilent() {
  try {
    const data = await api.listJobs(5);
    updateMetrics(data.total, data.jobs || []);
  } catch {
    // silent
  }
}

/* ===== Utility ===== */

function escapeHtml(str) {
  if (str == null) return "";
  const s = String(str);
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/* ===== Init ===== */

async function init() {
  await Promise.all([checkHealth(), loadMarkets(), loadJobsSilent()]);
}

init();
