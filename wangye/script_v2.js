/* =========================================================
   小飞 V2.0 增量脚本：品牌音调 / 反馈洞察 / 评分 / 标签 / 导出
   依赖 script.js 中已暴露的 api/apiGet/apiPost/apiPut/apiDel/toast/openModal/closeModal/escapeHtml
   ========================================================= */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ===== 公共：触发文件下载 =====
  async function downloadBlob(path, filename) {
    try {
      const res = await api(path, { method: "GET", raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast("已开始下载：" + filename, "success");
    } catch (e) {
      toast("下载失败：" + e.message, "error");
    }
  }

  // ===== 1. 品牌音调（Brand Voice） =====
  const BV = (window.BV = { items: [], load: loadBV });

  async function loadBV() {
    const grid = $("bvGrid");
    if (!grid) return;
    grid.innerHTML = `<div class="empty">加载中…</div>`;
    try {
      const data = await apiGet("/api/v1/brand-voices");
      BV.items = data.items || [];
      refreshBVOptions();
      renderBV();
    } catch (e) {
      grid.innerHTML = `<div class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
    }
  }

  function renderBV() {
    const grid = $("bvGrid");
    if (!BV.items.length) {
      grid.innerHTML = `<div class="empty">还没有规则包，点「新建规则包」创建第一个。</div>`;
      return;
    }
    grid.innerHTML = BV.items.map((it) => `
      <div class="bv-card">
        <div class="bv-name">${escapeHtml(it.name)}</div>
        <div class="bv-meta">所有人：${escapeHtml(it.owner)} · ${escapeHtml((it.updated_at || "").replace("T", " ").slice(0, 16))}</div>
        <div class="bv-row"><span class="k">关键词</span>${(it.keywords || []).map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join(" ") || "—"}</div>
        <div class="bv-row"><span class="k">禁用词</span>${(it.banned_words || []).map((k) => `<span class="tag taboo">${escapeHtml(k)}</span>`).join(" ") || "—"}</div>
        <div class="bv-row"><span class="k">风格</span>${escapeHtml((it.style_notes || "").slice(0, 60)) || "—"}</div>
        <div class="bv-actions">
          <button class="btn btn-sm" data-bv-edit="${escapeHtml(it.id)}">编辑</button>
          <button class="btn btn-sm" data-bv-del="${escapeHtml(it.id)}" style="color:var(--c-error);">删除</button>
        </div>
      </div>
    `).join("");
    grid.querySelectorAll("[data-bv-edit]").forEach((b) => b.addEventListener("click", () => openBVEdit(b.dataset.bvEdit)));
    grid.querySelectorAll("[data-bv-del]").forEach((b) => b.addEventListener("click", () => deleteBV(b.dataset.bvDel)));
  }

  function refreshBVOptions() {
    const opts = `<option value="">（不使用）</option>` +
      BV.items.map((it) => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.name)}</option>`).join("");
    for (const id of ["chatBrandVoice", "createBrandVoice"]) {
      const sel = $(id);
      if (!sel) continue;
      const cur = sel.value;
      sel.innerHTML = opts;
      if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    }
  }

  function openBVEdit(id) {
    const rec = id ? BV.items.find((x) => x.id === id) : null;
    const isNew = !rec;
    openModal(isNew ? "新建品牌音调规则包" : `编辑：${rec.name}`, `
      <div class="field"><label>名称</label><input id="bvName" type="text" maxlength="80" value="${rec ? escapeHtml(rec.name) : ""}" placeholder="例如：CompanyA-海外严肃风" /></div>
      <div class="field"><label>推荐关键词（逗号或换行分隔，最多 30）</label>
        <textarea id="bvKw" rows="2" placeholder="可信赖, 共同体, 携手">${rec ? escapeHtml((rec.keywords || []).join(", ")) : ""}</textarea>
      </div>
      <div class="field"><label>禁用词（逗号或换行分隔，最多 30）</label>
        <textarea id="bvBan" rows="2" placeholder="便宜, 廉价, hack">${rec ? escapeHtml((rec.banned_words || []).join(", ")) : ""}</textarea>
      </div>
      <div class="field"><label>风格说明（最多 2000 字）</label>
        <textarea id="bvStyle" rows="6" placeholder="句式偏短，不用感叹号；强调专业、克制；面向 B 端读者；…">${rec ? escapeHtml(rec.style_notes || "") : ""}</textarea>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button class="btn btn-ghost" id="bvCancelBtn">取消</button>
        <button class="btn btn-primary" id="bvSaveBtn">保存</button>
      </div>
    `);
    $("bvCancelBtn").addEventListener("click", closeModal);
    $("bvSaveBtn").addEventListener("click", async () => {
      const body = {
        name: $("bvName").value.trim(),
        keywords: $("bvKw").value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
        banned_words: $("bvBan").value.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean),
        style_notes: $("bvStyle").value.trim(),
      };
      if (!body.name) { toast("请填写名称", "error"); return; }
      try {
        if (isNew) await apiPost("/api/v1/brand-voices", body);
        else await apiPut(`/api/v1/brand-voices/${encodeURIComponent(id)}`, body);
        toast(isNew ? "已创建" : "已保存", "success");
        closeModal();
        loadBV();
      } catch (e) {
        toast("保存失败：" + e.message, "error");
      }
    });
  }

  async function deleteBV(id) {
    if (!confirm("确认删除这个规则包？正在挂载它的对话/任务不受影响。")) return;
    try {
      await apiDel(`/api/v1/brand-voices/${encodeURIComponent(id)}`);
      toast("已删除", "success");
      loadBV();
    } catch (e) {
      toast("删除失败：" + e.message, "error");
    }
  }

  // ===== 2. 文化适配评分 =====
  function getSummarizeText() {
    const tab = $("sumSubmitBtn") && $("sumSubmitBtn").dataset.tab || "url";
    if (tab === "text") return $("sumText").value || "";
    // URL 模式下用最近一次分析的 raw_excerpt 或正文
    if (window._lastSummarize && window._lastSummarize.raw_excerpt) return window._lastSummarize.raw_excerpt;
    return "";
  }

  async function runScore() {
    const market = ($("sumMarket") && $("sumMarket").value) || "AFRICA";
    const text = (getSummarizeText() || "").trim();
    if (text.length < 10) { toast("请先粘贴或抓取一段正文（至少 10 字）", "error"); return; }
    const panel = $("scorePanel");
    panel.hidden = false;
    panel.innerHTML = `<div class="empty" style="grid-column:1/-1;">DeepSeek 评分中…</div>`;
    try {
      const r = await apiPost("/api/v1/content/score", { text: text.slice(0, 5000), market });
      renderScore(r);
    } catch (e) {
      panel.innerHTML = `<div class="empty" style="grid-column:1/-1; color:var(--c-error);">评分失败：${escapeHtml(e.message)}</div>`;
    }
  }

  function renderScore(r) {
    const panel = $("scorePanel");
    const dims = [
      ["tone", "语气贴合"],
      ["taboo", "禁忌（10=干净）"],
      ["localization", "本地化"],
      ["credibility", "可信度"],
      ["resonance", "受众共鸣"],
    ];
    const scores = r.scores || {};
    const overall = r.overall || 0;
    panel.innerHTML = `
      ${radarSvg(dims.map(([k]) => scores[k] || 0), dims.map(([_, l]) => l))}
      <div>
        <div class="score-table">
          ${dims.map(([k, label]) => {
            const v = Number(scores[k] || 0);
            return `<div class="row"><span class="label">${escapeHtml(label)}</span>
              <span class="bar"><i style="width:${(v / 10) * 100}%"></i></span>
              <span class="num">${v.toFixed(1)}</span></div>`;
          }).join("")}
          <div class="overall">综合得分：${overall.toFixed(1)} / 10 · 引擎：${escapeHtml(r.engine || "?")}</div>
        </div>
        <div class="score-advice">
          <strong>改写建议：</strong>
          ${(r.advice || []).length ? `<ul>${r.advice.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : `<div style="color:var(--c-muted);font-size:12px;">无</div>`}
        </div>
        <div class="bubble-actions" style="margin-top:10px;">
          <button data-fb="1" data-source="score">这个评分有用</button>
          <button data-fb="-1" data-source="score">不准确</button>
        </div>
      </div>
    `;
    panel.querySelectorAll("[data-fb]").forEach((b) => b.addEventListener("click", () => {
      sendFeedback({ rating: Number(b.dataset.fb), source: "score", market: ($("sumMarket") && $("sumMarket").value) || "DEFAULT", excerpt: JSON.stringify(scores) });
      b.classList.add("active"); b.disabled = true;
    }));
  }

  function radarSvg(values, labels) {
    const cx = 120, cy = 120, R = 90;
    const n = values.length;
    const pts = values.map((v, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const r = (Math.max(0, Math.min(10, v)) / 10) * R;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
    const polyData = pts.map((p) => p.join(",")).join(" ");
    const grids = [0.25, 0.5, 0.75, 1].map((f) => {
      const ring = Array.from({ length: n }).map((_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)].join(",");
      }).join(" ");
      return `<polygon points="${ring}" fill="none" stroke="#dde0e6" />`;
    }).join("");
    const axes = labels.map((l, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const lx = cx + (R + 14) * Math.cos(a);
      const ly = cy + (R + 14) * Math.sin(a);
      return `<line x1="${cx}" y1="${cy}" x2="${cx + R * Math.cos(a)}" y2="${cy + R * Math.sin(a)}" stroke="#e2e4ea" />
        <text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#666">${escapeHtml(l)}</text>`;
    }).join("");
    return `<svg class="score-radar" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      ${grids}${axes}
      <polygon points="${polyData}" fill="rgba(201,138,43,0.25)" stroke="#c98a2b" stroke-width="2" />
    </svg>`;
  }

  // ===== 3. 反馈闭环 =====
  async function sendFeedback({ rating, source, market, excerpt, comment }) {
    try {
      await apiPost("/api/v1/feedback", {
        rating, source: source || "chat",
        market: market || "DEFAULT",
        comment: comment || "",
        message_excerpt: (excerpt || "").slice(0, 500),
      });
      toast("已记录反馈，感谢！", "success");
    } catch (e) {
      toast("反馈提交失败：" + e.message, "error");
    }
  }

  const FB = (window.FB = { load: loadFeedback });

  async function loadFeedback() {
    if (!window.me || me.role !== "admin") return;
    const card = $("fbStatsCard");
    card.innerHTML = `<div class="empty">加载中…</div>`;
    const tbody = $("fbTable").querySelector("tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="empty">加载中…</td></tr>`;
    try {
      const [stats, list] = await Promise.all([
        apiGet("/api/v1/admin/feedback/stats"),
        apiGet("/api/v1/admin/feedback/list?limit=50"),
      ]);
      renderFBStats(stats);
      renderFBList(list.items || []);
    } catch (e) {
      card.innerHTML = `<div class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</div>`;
      tbody.innerHTML = `<tr><td colspan="6" class="empty" style="color:var(--c-error);">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderFBStats(s) {
    const card = $("fbStatsCard");
    const total = s.total || 0;
    if (!total) {
      card.innerHTML = `<div class="empty">尚无反馈数据，去对话页给 AI 回复点击「有用 / 无用」试试。</div>`;
      return;
    }
    const sourceItems = Object.entries(s.by_source || {}).map(([k, v]) => `<span class="tag">${escapeHtml(k)} ${v}</span>`).join(" ") || "—";
    card.innerHTML = `
      <div class="metric-grid" style="grid-template-columns:repeat(4, 1fr);">
        <div class="metric-cell"><div class="m-label">总反馈</div><div class="m-value">${total}</div></div>
        <div class="metric-cell success"><div class="m-label">有用</div><div class="m-value">${s.positive || 0}</div></div>
        <div class="metric-cell error"><div class="m-label">无用</div><div class="m-value">${s.negative || 0}</div></div>
        <div class="metric-cell warn"><div class="m-label">满意度</div><div class="m-value">${s.satisfaction || 0}%</div></div>
      </div>
      <div style="margin-top:12px;"><strong>按市场满意度：</strong></div>
      <div style="margin-top:6px;">
        ${(s.by_market || []).map((m) => `
          <div class="market-bar">
            <span class="mb-label">${escapeHtml(m.market)}</span>
            <span class="mb-track"><span class="mb-fill" style="width:${m.satisfaction}%"></span></span>
            <span class="mb-num">${m.satisfaction}%（${m.positive}/${m.total}）</span>
          </div>`).join("")}
      </div>
      <div style="margin-top:12px;"><strong>按来源：</strong> ${sourceItems}</div>
    `;
  }

  function renderFBList(rows) {
    const tbody = $("fbTable").querySelector("tbody");
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">无记录</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td class="mono">${escapeHtml(r.created_at || "")}</td>
        <td>${escapeHtml(r.username || "")}</td>
        <td>${escapeHtml(r.market || "")}</td>
        <td>${escapeHtml(r.source || "")}</td>
        <td>${r.rating > 0 ? '<span class="status-badge success">有用</span>' : '<span class="status-badge failed">无用</span>'}</td>
        <td class="mono" style="max-width:280px; word-break:break-all;">${escapeHtml(r.comment || r.message_excerpt || "")}</td>
      </tr>`).join("");
  }

  // ===== 4. Chat AI 气泡反馈按钮（hook renderChat） =====
  function attachChatFeedbackButtons() {
    const bubbles = document.querySelectorAll("#chatStream .bubble.ai:not(.loading):not([data-fb-bound])");
    bubbles.forEach((b) => {
      b.dataset.fbBound = "1";
      const text = b.textContent.slice(0, 200);
      const bar = document.createElement("div");
      bar.className = "bubble-actions";
      bar.innerHTML = `
        <button data-fb="1">有用</button>
        <button data-fb="-1">无用</button>
      `;
      bar.querySelectorAll("[data-fb]").forEach((btn) => btn.addEventListener("click", () => {
        sendFeedback({ rating: Number(btn.dataset.fb), source: "chat", market: window.currentMarket || "DEFAULT", excerpt: text });
        bar.querySelectorAll("[data-fb]").forEach((x) => x.disabled = true);
        btn.classList.add("active");
      }));
      b.appendChild(bar);
    });
  }

  // ===== 5. 素材标签内联编辑（增强 showMyMaterial 后续插入） =====
  function attachTagEditor() {
    const body = $("modalBody");
    if (!body) return;
    if (body.querySelector(".tags-edit")) return; // already
    // 找到「标签」那行，仅在「素材详情」modal 里有
    const rows = body.querySelectorAll(".detail-row");
    let target = null;
    rows.forEach((r) => {
      const k = r.querySelector(".d-key");
      if (k && k.textContent.trim() === "标签") target = r;
    });
    if (!target) return;
    // 从 modal 标题猜：素材详情才走（避免误注入到任务详情）
    if (!/素材详情/.test($("modalTitle").textContent)) return;
    // material id：通过最近一次点击元素拿
    const mid = body.dataset.materialId;
    if (!mid) return;
    const valCell = target.querySelector(".d-val");
    const cur = (window._editingMaterial && window._editingMaterial.user_tags) || [];
    valCell.insertAdjacentHTML("beforeend", `
      <div style="margin-top:8px;">
        <div style="font-size:12px;color:var(--c-muted);margin-bottom:4px;">我的自定义标签（最多 20）</div>
        <div class="tags-edit" id="tagsEditWrap">
          ${cur.map((t) => chipHtml(t)).join("")}
          <input id="tagsEditInput" type="text" placeholder="输入后回车" />
          <button class="btn btn-sm" id="tagsSaveBtn">保存</button>
        </div>
      </div>
    `);
    const wrap = $("tagsEditWrap");
    const input = $("tagsEditInput");
    function readTags() {
      return Array.from(wrap.querySelectorAll(".chip")).map((c) => c.dataset.t);
    }
    wrap.addEventListener("click", (e) => {
      if (e.target.classList.contains("x")) {
        e.target.parentElement.remove();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        if (readTags().includes(v)) { input.value = ""; return; }
        if (readTags().length >= 20) { toast("最多 20 个标签", "error"); return; }
        input.insertAdjacentHTML("beforebegin", chipHtml(v));
        input.value = "";
      }
    });
    $("tagsSaveBtn").addEventListener("click", async () => {
      const tags = readTags();
      try {
        await apiPut(`/api/v1/materials/${encodeURIComponent(mid)}/tags`, { tags });
        toast("已保存标签", "success");
        if (window._editingMaterial) window._editingMaterial.user_tags = tags;
      } catch (e) { toast("保存失败：" + e.message, "error"); }
    });
  }

  function chipHtml(t) {
    return `<span class="chip" data-t="${escapeHtml(t)}">${escapeHtml(t)}<span class="x">✕</span></span>`;
  }

  // ===== 6. 导出按钮 =====
  function bindExports() {
    const matCsv = $("matExportCsvBtn");
    const matJson = $("matExportJsonBtn");
    if (matCsv) matCsv.addEventListener("click", () => downloadBlob("/api/v1/materials-export?format=csv", "materials.csv"));
    if (matJson) matJson.addEventListener("click", () => downloadBlob("/api/v1/materials-export?format=json", "materials.json"));
    const jobCsv = $("jobsExportCsvBtn");
    const jobJson = $("jobsExportJsonBtn");
    if (jobCsv) jobCsv.addEventListener("click", () => downloadBlob("/api/v1/jobs/export?format=csv", "jobs.csv"));
    if (jobJson) jobJson.addEventListener("click", () => downloadBlob("/api/v1/jobs/export?format=json", "jobs.json"));
  }

  // ===== 7. 入口绑定 =====
  function init() {
    // 绑定品牌音调
    const nb = $("bvNewBtn"); if (nb) nb.addEventListener("click", () => openBVEdit(null));
    const rb = $("bvRefreshBtn"); if (rb) rb.addEventListener("click", () => loadBV());
    const fr = $("fbRefreshBtn"); if (fr) fr.addEventListener("click", () => loadFeedback());
    const sb = $("scoreRunBtn"); if (sb) sb.addEventListener("click", runScore);

    bindExports();

    // 预拉取 brand voices 以便对话/创建任务时下拉可见
    if (window.getToken && getToken()) {
      loadBV().catch(() => {});
    }

    // 用 MutationObserver 自动给新出现的 AI bubble 加反馈按钮，并给打开的素材详情加标签编辑
    const stream = $("chatStream");
    if (stream) {
      const obs = new MutationObserver(() => attachChatFeedbackButtons());
      obs.observe(stream, { childList: true, subtree: true });
      attachChatFeedbackButtons();
    }
    const modalBody = $("modalBody");
    if (modalBody) {
      const obs2 = new MutationObserver(() => attachTagEditor());
      obs2.observe(modalBody, { childList: true });
    }

    // 包装原 showMyMaterial，记录 material id 到 modalBody.dataset
    if (typeof window.showMyMaterial === "function") {
      const orig = window.showMyMaterial;
      window.showMyMaterial = async function (id) {
        await orig(id);
        const mb = $("modalBody"); if (mb) mb.dataset.materialId = id;
        try {
          const it = await apiGet(`/api/v1/materials/${encodeURIComponent(id)}`);
          window._editingMaterial = it;
          attachTagEditor();
        } catch {}
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // script.js 已经在底部，立即执行
    setTimeout(init, 0);
  }
})();
