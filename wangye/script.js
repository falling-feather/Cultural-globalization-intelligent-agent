const viewData = {
  dialog: {
    sidebarTitle: "导航 / 核心功能",
    taskTitle: "任务面板 / 江南文化国际传播方案",
    taskStatus: "状态: 生成中 34%",
    noticeText: "建议先明确目标人群（海外华人 / Z世代旅行者 / 艺术受众），可提高内容命中率。",
    userText: "请给我生成 3 种不同语气的短视频开场白，每种附传播场景。",
    aiText:
      "已为你准备：\n1) 诗意叙事风（适合文旅号）\n2) 事实冲击风（适合资讯号）\n3) 社交对话风（适合短评号）\n要不要我继续直接输出中英双语版本？",
    inputPlaceholder: "输入你的文化传播目标、受众与语气要求...",
    submitLabel: "发送",
    rightTitle: "任务与统计",
    rightSub: "当前任务进度与快捷操作",
    metricLabel: "任务完成度",
    metricValue: "34%",
    metricHint: "下一步：确认受众与语气模板",
    quickTitle: "快捷操作",
    quick1: "1. 生成中英双语开场白",
    quick2: "2. 输出三平台发布时间建议",
    todoTitle: "待办清单",
    todo1: "[ ] 确认目标受众",
    todo2: "[ ] 选择文案语气",
    todo3: "[ ] 导出投放排期",
    resources: {
      title: "资源概览",
      line1: "脚本模板 12 份",
      line2: "多语语料 3 组"
    },
    activeTab: "dialog"
  },
  material: {
    sidebarTitle: "导航 / 模板中心",
    taskTitle: "任务面板 / 素材与模板筛选",
    taskStatus: "状态: 已加载 128 个模板",
    noticeText: "可按地区、受众年龄、叙事风格筛选模板，支持一键套用到当前任务。",
    userText: "筛选条件：东亚文化圈 + 18~25岁 + 轻叙事 + 30秒短视频",
    aiText:
      "已匹配模板：\n1) 城市记忆开场（情绪导入）\n2) 非遗人物故事（人物驱动）\n3) 地标巡礼（镜头切换）\n可直接点击右侧应用模板。",
    inputPlaceholder: "输入关键词检索模板，如：国风、非遗、城市漫游...",
    submitLabel: "应用模板",
    rightTitle: "模板命中统计",
    rightSub: "当前筛选结果与可复用素材",
    metricLabel: "模板匹配度",
    metricValue: "91%",
    metricHint: "高匹配：人物故事 + 城市地标组合",
    quickTitle: "可用模板",
    quick1: "1. 口播开场模板（12）",
    quick2: "2. 叙事分镜模板（8）",
    todoTitle: "素材清单",
    todo1: "[ ] 历史图像 24 张",
    todo2: "[ ] 双语字幕模板 6 套",
    todo3: "[ ] 可商用配乐 9 首",
    resources: {
      title: "资源概览",
      line1: "脚本模板 12 份",
      line2: "多语语料 3 组"
    },
    activeTab: "material"
  },
  channel: {
    sidebarTitle: "导航 / 投放控制",
    taskTitle: "任务面板 / 渠道投放编排",
    taskStatus: "状态: 待发布 3 个平台",
    noticeText: "投放策略建议：先 TikTok 冷启动，再将高互动内容复用到 Shorts。",
    userText: "计划：今日 19:30 TikTok，20:10 Shorts，次日 12:30 Reels。",
    aiText:
      "排期校验结果：\n1) 时段冲突：无\n2) 受众重叠：中等\n3) 预算消耗：预计 78%\n建议保留 22% 预算用于次日追投。",
    inputPlaceholder: "输入投放要求，如：预算上限、地区、发布时间...",
    submitLabel: "生成排期",
    rightTitle: "投放监控",
    rightSub: "平台排期与预算消耗概览",
    metricLabel: "预算使用率",
    metricValue: "78%",
    metricHint: "TikTok 预估 CTR 高于基线 13%",
    quickTitle: "投放清单",
    quick1: "1. TikTok: 19:30（首发）",
    quick2: "2. Shorts: 20:10（复投）",
    todoTitle: "风控提醒",
    todo1: "[ ] 检查版权音乐授权",
    todo2: "[ ] 避免节日敏感词",
    todo3: "[ ] 校验地区标签",
    resources: {
      title: "资源概览",
      line1: "已创建投放计划 3 条",
      line2: "预算池余额 22%"
    },
    activeTab: "channel"
  },
  preview: {
    sidebarTitle: "导航 / 资源预览",
    taskTitle: "任务面板 / 资源预览与比对",
    taskStatus: "状态: 已加载 36 条候选素材",
    noticeText: "预览说明：支持图文、脚本、字幕三类资源并排比对。",
    userText: "当前选中：非遗人物脚本 V3（中英双语，时长 42 秒）",
    aiText:
      "资源预览摘要：\n1) 标题：青花瓷的千年回响\n2) 结构：起势-故事-升华\n3) 风格：知识叙事\n可点击发送推入主对话继续加工。",
    inputPlaceholder: "输入资源编号或关键词快速预览...",
    submitLabel: "推入会话",
    rightTitle: "资源质量评估",
    rightSub: "可读性、版权、复用率三维指标",
    metricLabel: "复用潜力",
    metricValue: "84%",
    metricHint: "建议优先复用脚本段落 2/3",
    quickTitle: "预览操作",
    quick1: "1. 对比原稿与改写稿",
    quick2: "2. 查看字幕时间轴",
    todoTitle: "预览队列",
    todo1: "[ ] 脚本 V1",
    todo2: "[ ] 脚本 V2",
    todo3: "[ ] 脚本 V3（当前）",
    resources: {
      title: "资源概览",
      line1: "素材池条目 36 条",
      line2: "当前预览版本 V3"
    },
    activeTab: "material"
  }
};

let currentView = "dialog";

const nodes = {
  sidebarTitle: document.getElementById("sidebarTitle"),
  taskTitle: document.getElementById("taskTitle"),
  taskStatus: document.getElementById("taskStatus"),
  noticeText: document.getElementById("noticeText"),
  userText: document.getElementById("userText"),
  aiText: document.getElementById("aiText"),
  composerInput: document.getElementById("composerInput"),
  submitBtn: document.getElementById("submitBtn"),
  rightTitle: document.getElementById("rightTitle"),
  rightSub: document.getElementById("rightSub"),
  metricLabel: document.getElementById("metricLabel"),
  metricValue: document.getElementById("metricValue"),
  metricHint: document.getElementById("metricHint"),
  quickTitle: document.getElementById("quickTitle"),
  quick1: document.getElementById("quick1"),
  quick2: document.getElementById("quick2"),
  todoTitle: document.getElementById("todoTitle"),
  todo1: document.getElementById("todo1"),
  todo2: document.getElementById("todo2"),
  todo3: document.getElementById("todo3"),
  resourceTitle: document.getElementById("resourceTitle"),
  resource1: document.getElementById("resource1"),
  resource2: document.getElementById("resource2"),
  feedback: document.getElementById("feedback"),
  publishBtn: document.getElementById("publishBtn"),
  channelBtn: document.getElementById("channelBtn"),
  assetBtn: document.getElementById("assetBtn")
};

const navButtons = Array.from(document.querySelectorAll(".nav-item"));
const tabButtons = Array.from(document.querySelectorAll(".tab"));

function setFeedback(text) {
  nodes.feedback.textContent = text;
}

function setActiveNav(viewKey) {
  navButtons.forEach((btn) => {
    const active = btn.dataset.view === viewKey;
    btn.classList.toggle("active", active);
  });
}

function setActiveTab(tabKey) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabKey;
    btn.classList.toggle("active", active);
  });
}

function renderView(viewKey) {
  const state = viewData[viewKey];
  if (!state) {
    return;
  }

  currentView = viewKey;

  nodes.sidebarTitle.textContent = state.sidebarTitle;
  nodes.taskTitle.textContent = state.taskTitle;
  nodes.taskStatus.textContent = state.taskStatus;
  nodes.noticeText.textContent = state.noticeText;
  nodes.userText.textContent = state.userText;
  nodes.aiText.textContent = state.aiText;
  nodes.composerInput.placeholder = state.inputPlaceholder;
  nodes.submitBtn.textContent = state.submitLabel;
  nodes.rightTitle.textContent = state.rightTitle;
  nodes.rightSub.textContent = state.rightSub;
  nodes.metricLabel.textContent = state.metricLabel;
  nodes.metricValue.textContent = state.metricValue;
  nodes.metricHint.textContent = state.metricHint;
  nodes.quickTitle.textContent = state.quickTitle;
  nodes.quick1.textContent = state.quick1;
  nodes.quick2.textContent = state.quick2;
  nodes.todoTitle.textContent = state.todoTitle;
  nodes.todo1.textContent = state.todo1;
  nodes.todo2.textContent = state.todo2;
  nodes.todo3.textContent = state.todo3;
  nodes.resourceTitle.textContent = state.resources.title;
  nodes.resource1.textContent = state.resources.line1;
  nodes.resource2.textContent = state.resources.line2;

  setActiveNav(viewKey);
  setActiveTab(state.activeTab);
  setFeedback("已切换到: " + state.sidebarTitle.replace("导航 / ", ""));
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    renderView(btn.dataset.view);
  });
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.tab;
    if (key === "dialog") {
      renderView("dialog");
    } else if (key === "material") {
      renderView(currentView === "preview" ? "preview" : "material");
    } else if (key === "channel") {
      renderView("channel");
    }
  });
});

nodes.publishBtn.addEventListener("click", () => {
  renderView("channel");
  setFeedback("已跳转到投放控制，可直接生成排期。");
});

nodes.channelBtn.addEventListener("click", () => {
  renderView("channel");
  setFeedback("当前渠道数量: 4，已进入渠道投放面板。");
});

nodes.assetBtn.addEventListener("click", () => {
  renderView("material");
  setFeedback("已跳转到素材与模板，可筛选模板后应用。");
});

nodes.submitBtn.addEventListener("click", () => {
  const text = nodes.composerInput.value.trim();
  if (!text) {
    setFeedback("请输入内容后再提交。");
    return;
  }
  setFeedback("已提交: " + text + " （演示交互，未接入后端）");
  nodes.composerInput.value = "";
});

[nodes.quick1, nodes.quick2, nodes.todo1, nodes.todo2, nodes.todo3].forEach((btn) => {
  btn.addEventListener("click", () => {
    setFeedback("已点击: " + btn.textContent);
  });
});

renderView("dialog");
