const state = {
  agents: [],
  active: "coordinator",
  resources: null,
  diagnostics: null,
  controlCenter: null,
  nextFixes: null,
  profileFootprint: null,
  sessionPressure: null,
  chats: [],
  activeChatId: null,
  activeChatByAgent: {},
  messageCache: {},
  promptRouter: null,
  preflights: [],
  preflightStats: null,
  health: null,
  readiness: null,
  runs: [],
  audit: null,
  incidents: null,
  logTrends: null,
  telegramDependency: null,
  legacySkills: null,
  skillRisks: null,
  rolePolicy: null,
  skillCatalog: null,
  duplicateSkills: null,
  disabledSkills: null,
  ruleAudit: null,
  baseline: null,
  toolPolicy: null,
  selfTest: null,
  inventory: null,
  modelMatrix: null,
  modelSettings: null,
  configDrift: null,
  telegramSettings: null,
  controlMessage: "",
  routes: null,
  snapshots: [],
  maintenance: null,
  selectedRunId: null,
  runId: null,
  eventSource: null,
  approvals: new Map(),
  pendingAttachments: [],
  cardAgentId: null,
  cardEditing: false,
  cardPhotoFile: null,
  cardPhotoUrl: "",
  groups: [],
  cgStep: 1,
  cgSelected: new Set(),
  cgPhotoFile: null,
  cgPhotoUrl: "",
  groupCardId: null,
  activeGroupId: null,
  currentResponder: null,
  mentionAt: -1,
  view: "control",
  docs: [],
  activeDocId: null,
  docEditing: false,
  docCollapsed: new Set(),
};

const avatarSources = {};

const nullEl = {
  className: "",
  innerHTML: "",
  textContent: "",
  value: "",
  disabled: false,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {},
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  appendChild() {},
  prepend() {},
  append() {},
  setAttribute() {},
  removeAttribute() {},
  remove() {},
  focus() {},
};

const els = {
  agents: document.querySelector("#agents") || nullEl,
  activeName: document.querySelector("#activeName") || nullEl,
  activeMeta: document.querySelector("#activeMeta") || nullEl,
  activeAvatar: document.querySelector("#activeAvatar") || nullEl,
  chatHead: document.querySelector("#chatHead") || nullEl,
  agentCard: document.querySelector("#agentCard") || nullEl,
  cardClose: document.querySelector("#cardClose") || nullEl,
  cardEdit: document.querySelector("#cardEdit") || nullEl,
  cardAvatar: document.querySelector("#cardAvatar") || nullEl,
  cardPhotoBtn: document.querySelector("#cardPhotoBtn") || nullEl,
  cardFile: document.querySelector("#cardFile") || nullEl,
  cardView: document.querySelector("#cardView") || nullEl,
  cardName: document.querySelector("#cardName") || nullEl,
  cardSub: document.querySelector("#cardSub") || nullEl,
  cardForm: document.querySelector("#cardForm") || nullEl,
  cardNameInput: document.querySelector("#cardNameInput") || nullEl,
  cardCancel: document.querySelector("#cardCancel") || nullEl,
  cardSave: document.querySelector("#cardSave") || nullEl,
  cardBarTitle: document.querySelector("#cardBarTitle") || nullEl,
  cardSkillsSection: document.querySelector("#cardSkillsSection") || nullEl,
  cardSkillsList: document.querySelector("#cardSkillsList") || nullEl,
  cardSkillsCount: document.querySelector("#cardSkillsCount") || nullEl,
  ctxGauge: document.querySelector("#ctxGauge") || nullEl,
  ctxArc: document.querySelector("#ctxArc") || nullEl,
  ctxTip: document.querySelector("#ctxTip") || nullEl,
  newChatBtn: document.querySelector("#newChatBtn") || nullEl,
  settingsBtn: document.querySelector("#settingsBtn") || nullEl,
  settingsPanel: document.querySelector("#settingsPanel") || nullEl,
  settingsClose: document.querySelector("#settingsClose") || nullEl,
  modelStatus: document.querySelector("#modelStatus") || nullEl,
  modelAgentRows: document.querySelector("#modelAgentRows") || nullEl,
  modelSave: document.querySelector("#modelSave") || nullEl,
  telegramStatus: document.querySelector("#telegramStatus") || nullEl,
  telegramAgentTokens: document.querySelector("#telegramAgentTokens") || nullEl,
  telegramToggle: document.querySelector("#telegramToggle") || nullEl,
  telegramSave: document.querySelector("#telegramSave") || nullEl,
  createGroup: document.querySelector("#createGroup") || nullEl,
  cgBack: document.querySelector("#cgBack") || nullEl,
  cgTitle: document.querySelector("#cgTitle") || nullEl,
  cgNext: document.querySelector("#cgNext") || nullEl,
  cgCreate: document.querySelector("#cgCreate") || nullEl,
  cgStep1: document.querySelector("#cgStep1") || nullEl,
  cgStep2: document.querySelector("#cgStep2") || nullEl,
  cgSelected: document.querySelector("#cgSelected") || nullEl,
  cgMembers: document.querySelector("#cgMembers") || nullEl,
  cgAvatar: document.querySelector("#cgAvatar") || nullEl,
  cgPhotoBtn: document.querySelector("#cgPhotoBtn") || nullEl,
  cgFile: document.querySelector("#cgFile") || nullEl,
  cgName: document.querySelector("#cgName") || nullEl,
  cgSummary: document.querySelector("#cgSummary") || nullEl,
  cgSummaryCount: document.querySelector("#cgSummaryCount") || nullEl,
  groupCard: document.querySelector("#groupCard") || nullEl,
  gcClose: document.querySelector("#gcClose") || nullEl,
  gcDelete: document.querySelector("#gcDelete") || nullEl,
  gcAvatar: document.querySelector("#gcAvatar") || nullEl,
  gcName: document.querySelector("#gcName") || nullEl,
  gcSub: document.querySelector("#gcSub") || nullEl,
  gcCount: document.querySelector("#gcCount") || nullEl,
  gcMembers: document.querySelector("#gcMembers") || nullEl,
  mentionPopup: document.querySelector("#mentionPopup") || nullEl,
  app: document.querySelector("#app") || nullEl,
  controlMain: document.querySelector("#controlMain") || nullEl,
  controlSummary: document.querySelector("#controlSummary") || nullEl,
  controlAgents: document.querySelector("#controlAgents") || nullEl,
  restartAllGateways: document.querySelector("#restartAllGateways") || nullEl,
  downloadDiagnostics: document.querySelector("#downloadDiagnostics") || nullEl,
  brandTitle: document.querySelector("#brandTitle") || nullEl,
  brandSubtitle: document.querySelector("#brandSubtitle") || nullEl,
  newDocBtn: document.querySelector("#newDocBtn") || nullEl,
  docsTree: document.querySelector("#docsTree") || nullEl,
  docsEmpty: document.querySelector("#docsEmpty") || nullEl,
  docsEmptyNew: document.querySelector("#docsEmptyNew") || nullEl,
  docsEditor: document.querySelector("#docsEditor") || nullEl,
  docTitle: document.querySelector("#docTitle") || nullEl,
  docEditToggle: document.querySelector("#docEditToggle") || nullEl,
  docChild: document.querySelector("#docChild") || nullEl,
  docDelete: document.querySelector("#docDelete") || nullEl,
  docSaveState: document.querySelector("#docSaveState") || nullEl,
  docView: document.querySelector("#docView") || nullEl,
  docBody: document.querySelector("#docBody") || nullEl,
  messages: document.querySelector("#messages") || nullEl,
  composer: document.querySelector("#composer") || nullEl,
  prompt: document.querySelector("#prompt") || nullEl,
  previewPrompt: document.querySelector("#previewPrompt") || nullEl,
  send: document.querySelector("#send") || nullEl,
  attachBtn: document.querySelector("#attachBtn") || nullEl,
  fileInput: document.querySelector("#fileInput") || nullEl,
  micBtn: document.querySelector("#micBtn") || nullEl,
  attachPreview: document.querySelector("#attachPreview") || nullEl,
  composerRow: document.querySelector("#composerRow") || nullEl,
  recordBar: document.querySelector("#recordBar") || nullEl,
  recordTime: document.querySelector("#recordTime") || nullEl,
  recordCancel: document.querySelector("#recordCancel") || nullEl,
  recordSend: document.querySelector("#recordSend") || nullEl,
  stopRun: document.querySelector("#stopRun") || nullEl,
  refreshAgents: document.querySelector("#refreshAgents") || nullEl,
  refreshDiagnostics: document.querySelector("#refreshDiagnostics") || nullEl,
  snapshot: document.querySelector("#snapshot") || nullEl,
  cleanupLegacy: document.querySelector("#cleanupLegacy") || nullEl,
  pruneHistory: document.querySelector("#pruneHistory") || nullEl,
  runSelfTest: document.querySelector("#runSelfTest") || nullEl,
  resetSessions: document.querySelector("#resetSessions") || nullEl,
  toolMode: document.querySelector("#toolMode") || nullEl,
  controlCenter: document.querySelector("#controlCenter") || nullEl,
  nextFixes: document.querySelector("#nextFixes") || nullEl,
  profileFootprint: document.querySelector("#profileFootprint") || nullEl,
  sessionPressure: document.querySelector("#sessionPressure") || nullEl,
  chats: document.querySelector("#chats") || nullEl,
  promptRouter: document.querySelector("#promptRouter") || nullEl,
  preflights: document.querySelector("#preflights") || nullEl,
  systemHealth: document.querySelector("#systemHealth") || nullEl,
  readiness: document.querySelector("#readiness") || nullEl,
  audit: document.querySelector("#audit") || nullEl,
  incidents: document.querySelector("#incidents") || nullEl,
  logTrends: document.querySelector("#logTrends") || nullEl,
  telegramDependency: document.querySelector("#telegramDependency") || nullEl,
  legacySkills: document.querySelector("#legacySkills") || nullEl,
  skillRisks: document.querySelector("#skillRisks") || nullEl,
  rolePolicy: document.querySelector("#rolePolicy") || nullEl,
  skillCatalog: document.querySelector("#skillCatalog") || nullEl,
  duplicateSkills: document.querySelector("#duplicateSkills") || nullEl,
  disabledSkills: document.querySelector("#disabledSkills") || nullEl,
  ruleAudit: document.querySelector("#ruleAudit") || nullEl,
  baseline: document.querySelector("#baseline") || nullEl,
  toolPolicy: document.querySelector("#toolPolicy") || nullEl,
  selfTest: document.querySelector("#selfTest") || nullEl,
  inventory: document.querySelector("#inventory") || nullEl,
  modelMatrix: document.querySelector("#modelMatrix") || nullEl,
  configDrift: document.querySelector("#configDrift") || nullEl,
  diagnostics: document.querySelector("#diagnostics") || nullEl,
  snapshots: document.querySelector("#snapshots") || nullEl,
  maintenance: document.querySelector("#maintenance") || nullEl,
  runs: document.querySelector("#runs") || nullEl,
  logTail: document.querySelector("#logTail") || nullEl,
  resources: document.querySelector("#resources") || nullEl,
  routes: document.querySelector("#routes") || nullEl,
  approvals: document.querySelector("#approvals") || nullEl,
  activity: document.querySelector("#activity") || nullEl,
};

function formatTime(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function gatewayText(status) {
  const labels = {
    running: "Online",
    stale: "требует проверки",
    stopped: "Offline",
  };
  return labels[status] || status || "неизвестно";
}

function avatarLabel(agent) {
  return "";
}

function agentAvatarSrc(agent) {
  return agent.avatar || avatarSources[agent.id] || "";
}

function avatarMarkup(agent) {
  const label = escapeHtml(avatarLabel(agent));
  const src = agentAvatarSrc(agent);
  if (!src) return `<div class="agent-avatar avatar-${escapeHtml(agent.id)}">${label}</div>`;
  return `
    <div class="agent-avatar avatar-${escapeHtml(agent.id)}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(agent.name)}" loading="lazy" onerror="this.remove()" />
      <span>${label}</span>
    </div>
  `;
}

function modeLabel(mode) {
  const labels = {
    focused: "Фокус",
    quick: "Быстро",
    full: "Весь профиль",
  };
  return labels[mode] || mode || "Фокус";
}

function statusLabel(status) {
  const labels = {
    starting: "старт",
    running: "в работе",
    completed: "готово",
    failed: "ошибка",
    interrupted: "прервано",
    stopped: "остановлено",
    ready: "готов",
    "ready-with-warnings": "есть предупреждения",
    blocked: "заблокирован",
    clean: "чисто",
    high: "высокая",
    bloated: "раздута",
  };
  return labels[status] || status || "неизвестно";
}

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatContactDate(at) {
  if (!at) return "";
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if ((now - date) / 86400000 < 7) {
    return date.toLocaleDateString("ru-RU", { weekday: "short" });
  }
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function groupInitials(name) {
  const letters = String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  return (letters || "?").toUpperCase();
}

function groupAvatarMarkup(group) {
  const initials = escapeHtml(groupInitials(group.name));
  return group.avatar
    ? `<div class="agent-avatar"><img src="${escapeHtml(group.avatar)}" alt="" onerror="this.remove()" /><span>${initials}</span></div>`
    : `<div class="agent-avatar">${initials}</div>`;
}

function groupMembersText(group) {
  const names = (group.members || [])
    .map((id) => state.agents.find((a) => a.id === id)?.name || id)
    .filter(Boolean);
  return names.join(", ");
}

function renderAgents() {
  els.agents.innerHTML = "";
  for (const group of state.groups) {
    const btn = document.createElement("button");
    btn.className = "agent";
    btn.innerHTML = `
      <div class="agent-photo">${groupAvatarMarkup(group)}</div>
      <div class="agent-main">
        <div class="agent-row-top">
          <strong class="agent-name">${escapeHtml(group.name)}</strong>
        </div>
        <div class="agent-row-bottom">
          <span class="agent-preview">${escapeHtml(groupMembersText(group))}</span>
        </div>
      </div>
    `;
    btn.classList.toggle("active", group.id === state.activeGroupId);
    btn.addEventListener("click", () => openGroup(group.id));
    els.agents.appendChild(btn);
  }
  for (const agent of state.agents) {
    const btn = document.createElement("button");
    btn.className = `agent ${agent.id === state.active ? "active" : ""}`;
    const lm = agent.lastMessage;
    const preview = lm
      ? `${lm.role === "user" ? "Вы: " : ""}${lm.text}`
      : gatewayText(agent.gateway);
    const date = lm ? formatContactDate(lm.at) : "";
    btn.innerHTML = `
      <div class="agent-photo">
        ${avatarMarkup(agent)}
        <span class="gw-dot ${agent.gateway}"></span>
      </div>
      <div class="agent-main">
        <div class="agent-row-top">
          <strong class="agent-name">${escapeHtml(agent.name)}</strong>
          <span class="agent-date">${escapeHtml(date)}</span>
        </div>
        <div class="agent-row-bottom">
          <span class="agent-preview">${escapeHtml(preview)}</span>
        </div>
      </div>
    `;
    btn.addEventListener("click", () => {
      selectAgent(agent.id);
    });
    els.agents.appendChild(btn);
  }
}

function activeGroup() {
  return state.groups.find((g) => g.id === state.activeGroupId) || null;
}

function updateActive() {
  const group = activeGroup();
  if (group) {
    els.activeName.textContent = group.name;
    els.activeMeta.textContent = `${group.members.length} ${pluralMembers(group.members.length)}`;
    els.activeMeta.classList.remove("typing");
    els.activeAvatar.innerHTML = group.avatar
      ? `<img src="${escapeHtml(group.avatar)}" alt="" onerror="this.remove()" />`
      : escapeHtml(groupInitials(group.name));
    els.ctxGauge.hidden = true;
    return;
  }
  els.ctxGauge.hidden = false;
  const agent = state.agents.find((item) => item.id === state.active);
  els.activeName.textContent = agent?.name || state.active;
  els.activeMeta.textContent = "в сети";
  els.activeMeta.classList.remove("typing");
  const src = agent && agentAvatarSrc(agent);
  els.activeAvatar.innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="" onerror="this.remove()" />`
    : escapeHtml(agent ? avatarLabel(agent) : "");
  updateContextGauge(agent);
}

function openGroup(id) {
  state.activeGroupId = id;
  state.active = null;
  state.activeChatId = null;
  els.messages.innerHTML = "";
  updateActive();
  renderAgents();
  const group = activeGroup();
  if (group) {
    const names = group.members
      .map((mid) => state.agents.find((a) => a.id === mid)?.name)
      .filter(Boolean)
      .map((n) => `@${n}`)
      .join(", ");
    addInlineEvent({ type: "group", ts: Date.now(), status: `Напиши через @имя, кому адресовано. Участники: ${names}` });
  }
}

function setActiveTyping(on) {
  if (on) {
    els.activeMeta.textContent = "печатает…";
    els.activeMeta.classList.add("typing");
  } else {
    els.activeMeta.textContent = "в сети";
    els.activeMeta.classList.remove("typing");
  }
}

function cardAgent() {
  return state.agents.find((item) => item.id === state.cardAgentId) || null;
}

function renderCardAvatar(src, label) {
  els.cardAvatar.innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="" onerror="this.remove()" />`
    : escapeHtml(label || "");
}

function openAgentCard(id) {
  state.cardAgentId = id;
  state.cardEditing = false;
  state.cardPhotoFile = null;
  state.cardPhotoUrl = "";
  renderAgentCard();
  els.agentCard.hidden = false;
  loadAgentCardSkills(id);
}

function closeAgentCard() {
  if (state.cardPhotoUrl) URL.revokeObjectURL(state.cardPhotoUrl);
  state.cardPhotoUrl = "";
  state.cardPhotoFile = null;
  state.cardEditing = false;
  els.agentCard.hidden = true;
}

function renderAgentCard() {
  const agent = cardAgent();
  if (!agent) return;
  const editing = state.cardEditing;
  const src = state.cardPhotoUrl || agentAvatarSrc(agent);
  renderCardAvatar(src, avatarLabel(agent));
  els.cardView.hidden = editing;
  els.cardForm.hidden = !editing;
  els.cardEdit.hidden = editing;
  els.cardCancel.hidden = !editing;
  els.cardSave.hidden = !editing;
  els.cardPhotoBtn.hidden = !editing;
  els.cardSkillsSection.hidden = editing;
  els.cardBarTitle.textContent = editing ? "Изменить" : "Профиль";
  if (editing) {
    els.cardNameInput.value = agent.name || "";
  } else {
    els.cardName.textContent = agent.name || agent.id;
    els.cardSub.textContent = gatewayText(agent.gateway);
  }
}

async function loadAgentCardSkills(id) {
  els.cardSkillsList.innerHTML = '<div class="skill-empty">загрузка…</div>';
  els.cardSkillsCount.textContent = "";
  try {
    const data = await api(`/api/agents/${id}/skills`);
    if (state.cardAgentId !== id) return;
    const skills = data.skills || [];
    els.cardSkillsCount.textContent = skills.length ? ` · ${skills.length}` : "";
    if (!skills.length) {
      els.cardSkillsList.innerHTML = '<div class="skill-empty">У агента нет активных скиллов.</div>';
      return;
    }
    els.cardSkillsList.innerHTML = skills
      .map(
        (skill) => `
        <div class="skill-row">
          <div class="skill-name">${escapeHtml(skill.name)}</div>
          ${skill.description ? `<div class="skill-desc">${escapeHtml(skill.description)}</div>` : ""}
        </div>`,
      )
      .join("");
  } catch (error) {
    if (state.cardAgentId !== id) return;
    els.cardSkillsList.innerHTML = `<div class="skill-empty">Не удалось загрузить скиллы: ${escapeHtml(error.message)}</div>`;
  }
}

function formatTokens(n) {
  const value = Number(n) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}k`;
  return String(value);
}

function updateContextGauge(agent) {
  const ctx = agent?.context;
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const percent = ctx && ctx.window ? Math.min(1, ctx.used / ctx.window) : 0;
  els.ctxArc.style.strokeDasharray = `${circumference}`;
  els.ctxArc.style.strokeDashoffset = `${circumference * (1 - percent)}`;
  const color = percent < 0.5 ? "#4dca5e" : percent < 0.8 ? "#e6a561" : "#e2504a";
  els.ctxArc.style.stroke = color;
  const used = ctx ? ctx.used : 0;
  const window = ctx ? ctx.window : 0;
  const model = ctx && ctx.model ? `<br>${escapeHtml(ctx.model)}` : "";
  els.ctxTip.innerHTML = `<b>Контекст: ${Math.round(percent * 100)}%</b><br>${formatTokens(used)} / ${formatTokens(window)} токенов${model}`;
}

async function loadGroups() {
  const data = await api("/api/groups");
  state.groups = data.groups || [];
}

function memberAvatarMarkup(agent) {
  const src = agent && agentAvatarSrc(agent);
  return src
    ? `<div class="m-avatar"><img src="${escapeHtml(src)}" alt="" onerror="this.remove()" /></div>`
    : `<div class="m-avatar">${escapeHtml(agent ? avatarLabel(agent) : "?")}</div>`;
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

// ---- Create group wizard ----

function openCreateGroup() {
  state.cgStep = 1;
  state.cgSelected = new Set();
  state.cgPhotoFile = null;
  if (state.cgPhotoUrl) URL.revokeObjectURL(state.cgPhotoUrl);
  state.cgPhotoUrl = "";
  els.cgName.value = "";
  renderCgMembers();
  renderCgSelected();
  showCgStep();
  els.createGroup.hidden = false;
}

function closeCreateGroup() {
  if (state.cgPhotoUrl) URL.revokeObjectURL(state.cgPhotoUrl);
  state.cgPhotoUrl = "";
  state.cgPhotoFile = null;
  els.createGroup.hidden = true;
}

function showCgStep() {
  const step2 = state.cgStep === 2;
  els.cgStep1.hidden = step2;
  els.cgStep2.hidden = !step2;
  els.cgNext.hidden = step2;
  els.cgCreate.hidden = !step2;
  els.cgTitle.textContent = step2 ? "Название чата" : "Новый чат";
  els.cgNext.disabled = state.cgSelected.size === 0;
  if (step2) {
    renderCgSummary();
    renderCgPhoto();
    els.cgCreate.disabled = !els.cgName.value.trim();
    els.cgName.focus();
  }
}

function renderCgMembers() {
  els.cgMembers.innerHTML = "";
  for (const agent of state.agents) {
    const row = document.createElement("div");
    const selected = state.cgSelected.has(agent.id);
    row.className = `member-row${selected ? " selected" : ""}`;
    row.innerHTML = `${memberAvatarMarkup(agent)}<div class="m-main"><div class="m-name">${escapeHtml(agent.name)}</div><div class="m-sub">${escapeHtml(gatewayText(agent.gateway))}</div></div><div class="m-check">${CHECK_SVG}</div>`;
    row.addEventListener("click", () => toggleCgMember(agent.id));
    els.cgMembers.appendChild(row);
  }
}

function toggleCgMember(id) {
  if (state.cgSelected.has(id)) state.cgSelected.delete(id);
  else state.cgSelected.add(id);
  renderCgMembers();
  renderCgSelected();
  els.cgNext.disabled = state.cgSelected.size === 0;
}

function renderCgSelected() {
  const ids = [...state.cgSelected];
  els.cgSelected.hidden = ids.length === 0;
  els.cgSelected.innerHTML = ids
    .map((id) => {
      const agent = state.agents.find((a) => a.id === id);
      if (!agent) return "";
      const src = agentAvatarSrc(agent);
      const av = src
        ? `<span class="chip-av"><img src="${escapeHtml(src)}" alt="" onerror="this.remove()" /></span>`
        : `<span class="chip-av">${escapeHtml(avatarLabel(agent))}</span>`;
      return `<span class="cg-chip">${av}${escapeHtml(agent.name)}<span class="chip-x" data-id="${escapeHtml(id)}">×</span></span>`;
    })
    .join("");
  for (const x of els.cgSelected.querySelectorAll(".chip-x")) {
    x.addEventListener("click", () => toggleCgMember(x.dataset.id));
  }
}

function renderCgSummary() {
  const ids = [...state.cgSelected];
  els.cgSummaryCount.textContent = ids.length ? ` · ${ids.length}` : "";
  els.cgSummary.innerHTML = ids
    .map((id) => {
      const agent = state.agents.find((a) => a.id === id);
      if (!agent) return "";
      return `<div class="member-row static">${memberAvatarMarkup(agent)}<div class="m-main"><div class="m-name">${escapeHtml(agent.name)}</div></div></div>`;
    })
    .join("");
}

function renderCgPhoto() {
  els.cgAvatar.innerHTML = state.cgPhotoUrl
    ? `<img src="${escapeHtml(state.cgPhotoUrl)}" alt="" />`
    : escapeHtml(groupInitials(els.cgName.value || "Чат"));
}

async function submitCreateGroup() {
  const name = els.cgName.value.trim();
  if (!name || !state.cgSelected.size) return;
  els.cgCreate.disabled = true;
  try {
    let avatar = "";
    if (state.cgPhotoFile) {
      const att = await uploadFile(state.cgPhotoFile);
      avatar = att.url;
    }
    const data = await api("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name, avatar, members: [...state.cgSelected] }),
    });
    closeCreateGroup();
    await loadGroups();
    renderAgents();
    if (data.group) openGroupCard(data.group.id);
  } catch (error) {
    addMessage("assistant", `Не удалось создать чат: ${error.message}`, "error");
    els.cgCreate.disabled = false;
  }
}

// ---- Group profile ----

function openGroupCard(id) {
  state.groupCardId = id;
  renderGroupCard();
  els.groupCard.hidden = false;
}

function closeGroupCard() {
  els.groupCard.hidden = true;
}

function renderGroupCard() {
  const group = state.groups.find((g) => g.id === state.groupCardId);
  if (!group) return;
  els.gcAvatar.innerHTML = group.avatar
    ? `<img src="${escapeHtml(group.avatar)}" alt="" />`
    : escapeHtml(groupInitials(group.name));
  els.gcName.textContent = group.name;
  els.gcSub.textContent = `${group.members.length} ${pluralMembers(group.members.length)}`;
  els.gcCount.textContent = ` · ${group.members.length}`;
  els.gcMembers.innerHTML = group.members
    .map((mid) => {
      const agent = state.agents.find((a) => a.id === mid);
      if (!agent) return "";
      return `<div class="member-row static">${memberAvatarMarkup(agent)}<div class="m-main"><div class="m-name">${escapeHtml(agent.name)}</div><div class="m-sub">${escapeHtml(gatewayText(agent.gateway))}</div></div></div>`;
    })
    .join("");
}

function pluralMembers(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "участник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "участника";
  return "участников";
}

async function deleteGroupCard() {
  const group = state.groups.find((g) => g.id === state.groupCardId);
  if (!group) return;
  if (!window.confirm(`Удалить чат «${group.name}»?`)) return;
  try {
    await api(`/api/groups/${group.id}`, { method: "DELETE" });
    closeGroupCard();
    await loadGroups();
    renderAgents();
  } catch (error) {
    addMessage("assistant", `Не удалось удалить чат: ${error.message}`, "error");
  }
}

function enterCardEdit() {
  state.cardEditing = true;
  renderAgentCard();
  els.cardNameInput.focus();
}

function exitCardEdit() {
  if (state.cardPhotoUrl) URL.revokeObjectURL(state.cardPhotoUrl);
  state.cardPhotoUrl = "";
  state.cardPhotoFile = null;
  state.cardEditing = false;
  renderAgentCard();
}

async function saveAgentCard() {
  const agent = cardAgent();
  if (!agent) return;
  els.cardSave.disabled = true;
  try {
    const patch = { name: els.cardNameInput.value.trim() };
    if (state.cardPhotoFile) {
      const att = await uploadFile(state.cardPhotoFile);
      patch.avatar = att.url;
    }
    await api(`/api/agents/${agent.id}/profile`, {
      method: "POST",
      body: JSON.stringify(patch),
    });
    await loadAgents();
    if (agent.id === state.active) updateActive();
    state.cardPhotoFile = null;
    if (state.cardPhotoUrl) URL.revokeObjectURL(state.cardPhotoUrl);
    state.cardPhotoUrl = "";
    state.cardEditing = false;
    renderAgentCard();
  } catch (error) {
    addMessage("assistant", `Не удалось сохранить профиль: ${error.message}`, "error");
  } finally {
    els.cardSave.disabled = false;
  }
}

async function loadAgents() {
  const data = await api("/api/agents");
  state.agents = data.agents;
  if (!state.agents.some((agent) => agent.id === state.active)) {
    state.active = state.agents[0]?.id || "default";
  }
  renderAgents();
  updateActive();
}

async function loadTelegramSettings() {
  const data = await api("/api/telegram");
  state.telegramSettings = data;
  renderTelegramSettings();
}

async function loadModelSettings() {
  const data = await api("/api/models");
  state.modelSettings = data;
  renderModelSettings();
}

async function loadControlPanel(message = "") {
  const [agentsResult, healthResult, telegramResult, modelResult] = await Promise.allSettled([
    api("/api/agents"),
    api("/api/health"),
    api("/api/telegram"),
    api("/api/models"),
  ]);
  if (agentsResult.status === "fulfilled") state.agents = agentsResult.value.agents || [];
  if (healthResult.status === "fulfilled") state.health = healthResult.value;
  if (telegramResult.status === "fulfilled") state.telegramSettings = telegramResult.value;
  if (modelResult.status === "fulfilled") state.modelSettings = modelResult.value;
  const partialFailure = [agentsResult, healthResult, telegramResult, modelResult].some((result) => result.status === "rejected");
  state.controlMessage = message || (partialFailure ? "Часть данных не загрузилась. Попробуй обновить страницу или скачай диагностику." : "");
  renderAgents();
  renderControlPanel();
}

function controlAgentMeta(agent) {
  const healthAgent = (state.health?.agents || []).find((item) => item.id === agent.id);
  const telegram = (state.telegramSettings?.profiles || []).find((item) => item.profile === agent.id);
  const model = (state.modelSettings?.profiles || []).find((item) => item.profile === agent.id);
  const issues = healthAgent?.issues || [];
  return {
    health: healthAgent?.health || (agent.gateway === "running" ? "ok" : "attention"),
    issues,
    sessions: healthAgent?.sessions,
    logs: healthAgent?.logs,
    telegram,
    model,
  };
}

function renderControlPanel() {
  const agents = state.agents || [];
  const running = agents.filter((agent) => agent.gateway === "running").length;
  const stale = agents.filter((agent) => agent.gateway === "stale").length;
  const stopped = agents.filter((agent) => agent.gateway === "stopped").length;
  const telegramProfiles = state.telegramSettings?.profiles || [];
  const telegramReady = telegramProfiles.filter((profile) => profile.configured).length;
  const messageHtml = state.controlMessage
    ? `<div class="control-message">${escapeHtml(state.controlMessage)}</div>`
    : "";
  els.controlSummary.innerHTML = `
    ${messageHtml}
    <div class="control-stat ${stopped || stale ? "attention" : "ok"}">
      <span>Gateway</span>
      <strong>${running}/${agents.length || 0}</strong>
      <small>${stale} требуют проверки · ${stopped} offline</small>
    </div>
    <div class="control-stat ${telegramReady === telegramProfiles.length && telegramProfiles.length ? "ok" : "attention"}">
      <span>Telegram</span>
      <strong>${telegramReady}/${telegramProfiles.length || 0}</strong>
      <small>токены подключены</small>
    </div>
    <div class="control-stat ok">
      <span>Модель</span>
      <strong>${escapeHtml((state.modelSettings?.models || []).join(", ") || state.modelSettings?.fallback || "не задано")}</strong>
      <small>меняется в настройках</small>
    </div>
  `;
  els.controlAgents.innerHTML = agents.map((agent) => {
    const meta = controlAgentMeta(agent);
    const telegramText = meta.telegram?.configured ? `Telegram: ${escapeHtml(meta.telegram.tokenPreview)}` : "Telegram: токен не добавлен";
    const allowedText = meta.telegram?.allowedUsersConfigured ? `ID: ${escapeHtml(meta.telegram.allowedUsers)}` : "ID: не ограничен";
    const modelText = meta.model?.current || meta.model?.model || state.modelSettings?.fallback || "не задано";
    const issueText = meta.issues.length ? meta.issues.slice(0, 2).join("; ") : "без критичных проблем";
    return `
      <article class="control-agent-card ${meta.health}" data-agent-card="${escapeHtml(agent.id)}">
        <div class="control-agent-head">
          <div class="control-agent-title">
            <span class="gw-dot ${agent.gateway}"></span>
            <strong>${escapeHtml(agent.name)}</strong>
          </div>
          <span class="control-pill ${agent.gateway}">${escapeHtml(gatewayText(agent.gateway))}</span>
        </div>
        <div class="control-agent-grid">
          <div><span>Модель</span><strong>${escapeHtml(modelText)}</strong></div>
          <div><span>Telegram</span><strong>${telegramText}</strong><small>${allowedText}</small></div>
          <div><span>Сессии</span><strong>${meta.sessions?.count ?? "?"}</strong><small>${meta.sessions?.maxPromptTokens ?? 0} токенов</small></div>
          <div><span>Логи</span><strong>${meta.logs?.problemCount ?? 0}</strong><small>свежие предупреждения</small></div>
        </div>
        <div class="control-agent-issue">${escapeHtml(issueText)}</div>
        <div class="control-agent-actions">
          <button type="button" class="mini-action" data-action="restart-agent" data-agent="${escapeHtml(agent.id)}">Перезапустить</button>
          <button type="button" class="mini-action" data-action="settings-agent" data-agent="${escapeHtml(agent.id)}">Настройки</button>
          <button type="button" class="mini-action" data-action="logs-agent" data-agent="${escapeHtml(agent.id)}">Логи</button>
          <button type="button" class="mini-action" data-action="test-agent" data-agent="${escapeHtml(agent.id)}">Тест</button>
        </div>
      </article>
    `;
  }).join("");
  for (const btn of els.controlAgents.querySelectorAll("[data-action]")) {
    btn.addEventListener("click", () => handleControlAction(btn.dataset.action, btn.dataset.agent));
  }
}

function renderModelSettings(message = "") {
  const settings = state.modelSettings;
  const profiles = settings?.profiles || [];
  const options = settings?.options || [];
  const fallback = settings?.fallback || options[0] || "";
  const manualCount = profiles.filter((profile) => profile.manual).length;
  els.modelStatus.className = `settings-status ${profiles.length ? "ok" : ""}`;
  els.modelStatus.textContent = message || (profiles.length
    ? `Модель можно менять отдельно по агентам. Ручной выбор: ${manualCount} из ${profiles.length}`
    : "Модели еще не найдены");
  els.modelAgentRows.innerHTML = profiles.map((profile) => {
    const current = profile.current || fallback;
    const optionHtml = options.map((model) => `
      <option value="${escapeHtml(model)}"${model === current ? " selected" : ""}>${escapeHtml(model)}</option>
    `).join("");
    return `
      <div class="model-settings-row">
        <span class="model-settings-meta">
          <strong>${escapeHtml(profile.name || profile.profile)}</strong>
          <small>${profile.manual ? "выбрана вручную" : "выбрана установщиком автоматически"}</small>
          <small>сейчас: ${escapeHtml(current || "не задано")}</small>
        </span>
        <label class="model-select-field">
          <span>Модель</span>
          <select class="card-input model-select-input" data-agent="${escapeHtml(profile.profile)}">
            ${optionHtml}
          </select>
        </label>
      </div>
    `;
  }).join("");
}

function renderTelegramSettings(message = "") {
  const settings = state.telegramSettings;
  const profiles = settings?.profiles || [];
  const configuredCount = profiles.filter((profile) => profile.configured).length;
  const restrictedCount = profiles.filter((profile) => profile.allowedUsersConfigured).length;
  els.telegramStatus.className = `settings-status ${configuredCount ? "ok" : ""}`;
  els.telegramStatus.textContent = message || (profiles.length
    ? `Подключено агентов: ${configuredCount} из ${profiles.length}. Ограничен доступ: ${restrictedCount} из ${profiles.length}`
    : "Telegram еще не подключен");
  els.telegramAgentTokens.innerHTML = profiles.map((profile) => `
    <div class="telegram-token-row">
      <span class="telegram-token-meta">
        <strong>${escapeHtml(profile.name || profile.profile)}</strong>
        <small>${profile.configured ? `подключен: ${escapeHtml(profile.tokenPreview)}` : "токен не добавлен"}</small>
        <small>${profile.allowedUsersConfigured ? `доступ: ${escapeHtml(profile.allowedUsers)}` : "ID не указан"}</small>
      </span>
      <label class="telegram-token-field">
        <span>Bot token</span>
        <input class="card-input telegram-token-input" data-agent="${escapeHtml(profile.profile)}" type="text" autocomplete="off" spellcheck="false" placeholder="1234567890:AA..." />
      </label>
      <label class="telegram-token-field">
        <span>Telegram ID</span>
        <input class="card-input telegram-allowed-users-input" data-agent="${escapeHtml(profile.profile)}" type="text" autocomplete="off" spellcheck="false" value="${escapeHtml(profile.allowedUsers || "")}" placeholder="123456789, 987654321" />
      </label>
    </div>
  `).join("");
}

async function openSettings() {
  els.settingsPanel.hidden = false;
  els.telegramToggle.hidden = true;
  renderModelSettings("Проверяю модели…");
  renderTelegramSettings("Проверяю Telegram…");
  const [modelResult, telegramResult] = await Promise.allSettled([
    loadModelSettings(),
    loadTelegramSettings(),
  ]);
  if (modelResult.status === "rejected") {
    els.modelStatus.className = "settings-status error";
    els.modelStatus.textContent = `Не удалось проверить модели: ${modelResult.reason.message}`;
  }
  if (telegramResult.status === "rejected") {
    els.telegramStatus.className = "settings-status error";
    els.telegramStatus.textContent = `Не удалось проверить Telegram: ${telegramResult.reason.message}`;
  }
}

function closeSettings() {
  els.settingsPanel.hidden = true;
}

async function saveTelegramSettings() {
  els.telegramSave.disabled = true;
  els.telegramStatus.className = "settings-status";
  els.telegramStatus.textContent = "Сохраняю Telegram и перезапускаю gateway…";
  try {
    const tokens = {};
    for (const input of els.telegramAgentTokens.querySelectorAll(".telegram-token-input")) {
      const value = input.value.trim();
      if (value) tokens[input.dataset.agent] = value;
    }
    const allowedUsers = {};
    for (const input of els.telegramAgentTokens.querySelectorAll(".telegram-allowed-users-input")) {
      allowedUsers[input.dataset.agent] = input.value.trim();
    }
    const data = await api("/api/telegram", {
      method: "POST",
      body: JSON.stringify({ tokens, allowedUsers }),
    });
    const fresh = await api("/api/telegram");
    state.telegramSettings = fresh;
    const results = data.results || [];
    const restarted = results.filter((item) => item.restart?.restarted).length;
    const failed = results.filter((item) => item.restart && !item.restart.restarted);
    if (failed.length) {
      els.telegramStatus.className = "settings-status error";
      els.telegramStatus.textContent = `Настройки сохранены, но Telegram не перезапустился: ${failed.map((item) => item.name || item.profile).join(", ")}`;
    } else {
      renderTelegramSettings(results.length ? `Сохранено и перезапущено: ${restarted} из ${results.length}` : "Изменений нет");
    }
    await refreshSidebar();
  } catch (error) {
    els.telegramStatus.className = "settings-status error";
    els.telegramStatus.textContent = `Не удалось сохранить Telegram: ${error.message}`;
  } finally {
    els.telegramSave.disabled = false;
  }
}

async function saveModelSettings() {
  els.modelSave.disabled = true;
  els.modelStatus.className = "settings-status";
  els.modelStatus.textContent = "Сохраняю модель и перезапускаю gateway…";
  try {
    const models = {};
    for (const input of els.modelAgentRows.querySelectorAll(".model-select-input")) {
      models[input.dataset.agent] = input.value.trim();
    }
    const data = await api("/api/models", {
      method: "POST",
      body: JSON.stringify({ models }),
    });
    const fresh = await api("/api/models");
    state.modelSettings = fresh;
    const results = data.results || [];
    const restarted = results.filter((item) => item.restart?.restarted).length;
    const failed = results.filter((item) => item.restart && !item.restart.restarted);
    if (failed.length) {
      els.modelStatus.className = "settings-status error";
      els.modelStatus.textContent = `Модель сохранена, но gateway не перезапустился: ${failed.map((item) => item.name || item.profile).join(", ")}`;
    } else {
      renderModelSettings(results.length ? `Сохранено и перезапущено: ${restarted} из ${results.length}` : "Изменений нет");
    }
    await refreshSidebar();
  } catch (error) {
    els.modelStatus.className = "settings-status error";
    els.modelStatus.textContent = `Не удалось сохранить модель: ${error.message}`;
  } finally {
    els.modelSave.disabled = false;
  }
}

async function restartGateway(agentId) {
  const agent = state.agents.find((item) => item.id === agentId);
  state.controlMessage = `Перезапускаю ${agent?.name || agentId}…`;
  renderControlPanel();
  const result = await api(`/api/agents/${agentId}/restart-gateway`, { method: "POST", body: "{}" });
  const ok = result.restart?.restarted || result.restarted;
  await loadControlPanel(ok ? `${agent?.name || agentId}: gateway перезапущен` : `${agent?.name || agentId}: не удалось перезапустить gateway`);
}

async function restartAllGateways() {
  els.restartAllGateways.disabled = true;
  try {
    const agents = [...(state.agents || [])];
    state.controlMessage = "Перезапускаю все gateway…";
    renderControlPanel();
    const results = [];
    for (const agent of agents) {
      try {
        const result = await api(`/api/agents/${agent.id}/restart-gateway`, { method: "POST", body: "{}" });
        results.push({ agent, ok: result.restart?.restarted || result.restarted });
      } catch {
        results.push({ agent, ok: false });
      }
    }
    const okCount = results.filter((item) => item.ok).length;
    await loadControlPanel(`Перезапущено: ${okCount} из ${results.length}`);
  } finally {
    els.restartAllGateways.disabled = false;
  }
}

async function downloadDiagnosticsBundle() {
  els.downloadDiagnostics.disabled = true;
  try {
    const data = await api("/api/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `infobiz-diagnostics-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.controlMessage = "Диагностика скачана.";
    renderControlPanel();
  } finally {
    els.downloadDiagnostics.disabled = false;
  }
}

async function handleControlAction(action, agentId) {
  if (action === "restart-agent") {
    await restartGateway(agentId).catch((error) => {
      state.controlMessage = `Не удалось перезапустить ${agentId}: ${error.message}`;
      renderControlPanel();
    });
    return;
  }
  if (action === "settings-agent") {
    state.active = agentId;
    openSettings();
    return;
  }
  if (action === "logs-agent") {
    state.active = agentId;
    await loadDiagnostics().catch(() => {});
    const logs = await api(`/api/agents/${agentId}/logs?lines=220`).catch((error) => ({ text: error.message }));
    state.controlMessage = `Логи ${state.agents.find((item) => item.id === agentId)?.name || agentId}: ${String(logs.text || "нет данных").slice(-500)}`;
    renderControlPanel();
    return;
  }
  if (action === "test-agent") {
    selectAgent(agentId);
    setView("chats");
  }
}

async function loadResources() {
  state.resources = await api("/api/resources");
  renderResources();
}

async function loadDiagnostics() {
  if (!state.active) return;
  const data = await api(`/api/agents/${state.active}/diagnostics`);
  state.diagnostics = data.diagnostics;
  renderDiagnostics();
  const logs = await api(`/api/agents/${state.active}/logs?lines=160`);
  els.logTail.className = logs.text ? "log-tail" : "log-tail empty";
  els.logTail.textContent = logs.text || "нет данных";
}

async function loadControlCenter() {
  state.controlCenter = await api("/api/control-center");
  renderControlCenter();
}

async function loadNextFixes() {
  state.nextFixes = await api("/api/next-fixes");
  renderNextFixes();
}

async function loadProfileFootprint() {
  state.profileFootprint = await api("/api/profile-footprint");
  renderProfileFootprint();
}

async function loadSessionPressure() {
  state.sessionPressure = await api("/api/session-pressure");
  renderSessionPressure();
}

async function loadAgentChats({ refreshMessages = true } = {}) {
  if (!state.active) return;
  const agentId = state.active;
  const data = await api(`/api/agents/${agentId}/chats`);
  if (state.active !== agentId) return;
  state.chats = data.chats || [];
  state.activeChatId = state.activeChatByAgent[agentId] || null;
  if (!state.activeChatId || !state.chats.some((chat) => chat.id === state.activeChatId)) {
    state.activeChatId = state.chats[0]?.id || null;
  }
  state.activeChatByAgent[agentId] = state.activeChatId;
  renderAgentChats();
  if (refreshMessages && state.activeChatId) {
    restoreCachedMessages(agentId, state.activeChatId);
    await loadChatMessages(state.activeChatId, { silent: true, agentId });
  } else if (refreshMessages) {
    if (!restoreCachedMessages(agentId, "")) clearMessagesForAgent(agentId);
  }
}

async function loadHealth() {
  state.health = await api("/api/health");
  renderHealth();
}

async function loadPreflights() {
  const data = await api("/api/preflights");
  state.preflights = data.preflights || [];
  state.preflightStats = data.stats || null;
  renderPreflights();
}

async function loadReadiness() {
  state.readiness = await api("/api/readiness");
  renderReadiness();
}

async function loadRuns() {
  const data = await api("/api/runs");
  state.runs = data.runs || [];
  renderRuns();
}

async function loadAudit() {
  state.audit = await api("/api/audit");
  renderAudit();
}

async function loadIncidents() {
  state.incidents = await api("/api/incidents");
  renderIncidents();
}

async function loadLogTrends() {
  state.logTrends = await api("/api/log-trends");
  renderLogTrends();
}

async function loadTelegramDependency() {
  state.telegramDependency = await api("/api/telegram-dependency");
  renderTelegramDependency();
}

async function loadLegacySkills() {
  state.legacySkills = await api("/api/legacy-skills");
  renderLegacySkills();
}

async function loadSkillRisks() {
  state.skillRisks = await api("/api/skill-risks");
  renderSkillRisks();
}

async function loadRolePolicy() {
  state.rolePolicy = await api("/api/role-policy");
  renderRolePolicy();
}

async function loadSkillCatalog() {
  state.skillCatalog = await api("/api/skill-catalog");
  renderSkillCatalog();
}

async function loadDuplicateSkills() {
  state.duplicateSkills = await api("/api/duplicate-skills");
  renderDuplicateSkills();
}

async function loadDisabledSkills() {
  state.disabledSkills = await api("/api/disabled-skills");
  renderDisabledSkills();
}

async function loadRuleAudit() {
  state.ruleAudit = await api("/api/rule-audit");
  renderRuleAudit();
}

async function loadBaseline() {
  state.baseline = await api("/api/baseline");
  renderBaseline();
}

async function loadToolPolicy() {
  state.toolPolicy = await api("/api/tool-policy");
  renderToolPolicy();
}

async function loadSelfTest() {
  state.selfTest = await api("/api/self-test");
  renderSelfTest();
}

async function loadInventory() {
  state.inventory = await api("/api/inventory");
  renderInventory();
}

async function loadModelMatrix() {
  state.modelMatrix = await api("/api/model-matrix");
  renderModelMatrix();
}

async function loadConfigDrift() {
  state.configDrift = await api("/api/config-drift");
  renderConfigDrift();
}

async function loadRoutes() {
  state.routes = await api("/api/routes");
  renderRoutes();
}

async function loadSnapshots() {
  const data = await api("/api/snapshots");
  state.snapshots = data.snapshots || [];
  renderSnapshots();
}

async function loadMaintenance() {
  state.maintenance = await api("/api/maintenance");
  renderMaintenance();
}

function renderHealth() {
  const health = state.health;
  if (!health) {
    els.systemHealth.className = "health-list empty";
    els.systemHealth.textContent = "нет данных";
    return;
  }
  const badAgents = health.agents.filter((agent) => agent.health !== "ok");
  els.systemHealth.className = "health-list";
  els.systemHealth.innerHTML = `
    <div class="health-summary ${badAgents.length ? "attention" : "ok"}">
      <strong>${badAgents.length ? `${badAgents.length} требуют внимания` : "все спокойно"}</strong>
      <span>${health.forbiddenProcesses.length} старых процессов · ${health.activeRuns.length} активных запусков</span>
    </div>
    <div class="health-agents">
      ${health.agents.map((agent) => `
        <button class="health-agent ${agent.health}" data-agent="${agent.id}">
          <span>${escapeHtml(agent.name)}</span>
          <small>${agent.sessions.maxPromptTokens} токенов · ${agent.logs.problemCount} предупреждений</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.systemHealth.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      selectAgent(btn.dataset.agent);
    });
  }
}

function renderControlCenter() {
  const report = state.controlCenter;
  if (!report) {
    els.controlCenter.className = "control-center-list empty";
    els.controlCenter.textContent = "нет данных";
    return;
  }
  const bad = report.checks.filter((check) => !check.ok);
  els.controlCenter.className = "control-center-list";
  els.controlCenter.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.ok ? "все чисто" : `${bad.length} требуют внимания`}</strong>
      <span>${new Date(report.checkedAt).toLocaleTimeString("ru-RU")}</span>
    </div>
    <div class="audit-checks">
      ${report.checks.map((check) => `
        <div class="audit-check ${check.ok ? "ok" : "attention"}">
          <span>${check.ok ? "ok" : "!"}</span>
          <div>
            <strong>${escapeHtml(check.label)}</strong>
            <small>${escapeHtml(check.detail)}</small>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderNextFixes() {
  const report = state.nextFixes;
  if (!report) {
    els.nextFixes.className = "next-fix-list empty";
    els.nextFixes.textContent = "нет данных";
    return;
  }
  els.nextFixes.className = "next-fix-list";
  els.nextFixes.innerHTML = `
    <div class="health-summary ${report.totals.high ? "attention" : "ok"}">
      <strong>${report.totals.fixes} фиксов</strong>
      <span>${report.totals.high} высокий приоритет</span>
    </div>
    <div class="incident-rows">
      ${report.fixes.slice(0, 6).map((fix) => `
        <button class="incident-row ${fix.priority === "high" ? "attention" : "ok"}" data-agent="${fix.profile}">
          <span>${escapeHtml(fix.title)} · ${escapeHtml(fix.priority)}</span>
          <small>${escapeHtml(fix.detail)} · ${escapeHtml(fix.action)}</small>
        </button>
      `).join("") || `<div class="event-meta">очередь пустая</div>`}
    </div>
  `;
  for (const btn of els.nextFixes.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderProfileFootprint() {
  const report = state.profileFootprint;
  if (!report) {
    els.profileFootprint.className = "profile-footprint-list empty";
    els.profileFootprint.textContent = "нет данных";
    return;
  }
  els.profileFootprint.className = "profile-footprint-list";
  els.profileFootprint.innerHTML = `
    <div class="health-summary ok">
      <strong>${report.totals.activeSkills} активных</strong>
      <span>${report.totals.disabledSkills} отключенных</span>
    </div>
    <div class="incident-rows">
      ${report.profiles.slice(0, 7).map((profile) => `
        <button class="incident-row ${profile.readiness}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.activeSkills} активных · ${profile.disabledSkills} отключенных</span>
          <small>${escapeHtml(statusLabel(profile.readiness))} · логи ${profile.freshLogProblems}/${profile.tailLogProblems} · оценка ${profile.score}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.profileFootprint.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderSessionPressure() {
  const report = state.sessionPressure;
  if (!report) {
    els.sessionPressure.className = "session-pressure-list empty";
    els.sessionPressure.textContent = "нет данных";
    return;
  }
  els.sessionPressure.className = "session-pressure-list";
  els.sessionPressure.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.totals.bloated ? `${report.totals.bloated} раздутых` : "сессии в норме"}</strong>
      <span>${report.totals.sessions} сессий · ${report.totals.totalPromptTokens} токенов · лимит ${report.limit}</span>
    </div>
    <div class="health-agents">
      ${report.profiles.slice(0, 6).map((profile) => `
        <button class="health-agent ${profile.state === "bloated" || profile.state === "high" ? "attention" : "ok"}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.pressure}%</span>
          <small>${profile.maxPromptTokens} макс. токенов · ${profile.count} сессий · ${escapeHtml(profile.suggestedAction)}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.sessionPressure.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      selectAgent(btn.dataset.agent);
    });
  }
}

function renderAgentChats() {
  if (!els.chats) return;
  if (!state.chats.length) {
    els.chats.className = "chat-list empty";
    els.chats.textContent = "нет активных сессий";
    return;
  }
  els.chats.className = "chat-list";
  els.chats.innerHTML = state.chats.slice(0, 8).map((chat) => {
    const pressure = !chat.fileExists ? "warn" : chat.lastPromptTokens >= 20000 ? "attention" : chat.lastPromptTokens >= 14000 ? "warn" : "ok";
    const active = chat.id === state.activeChatId ? "active" : "";
    const when = chat.updatedAt ? new Date(chat.updatedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "без даты";
    const fileState = chat.fileExists ? "" : " · только индекс";
    return `
      <button class="chat-item ${active} ${pressure}" data-chat="${escapeHtml(chat.id)}">
        <span>${escapeHtml(chat.displayName || chat.id)}</span>
        <small>${escapeHtml(chat.platform)} · ${when} · ${chat.lastPromptTokens || 0} токенов${fileState}</small>
      </button>
    `;
  }).join("");
  for (const btn of els.chats.querySelectorAll("[data-chat]")) {
    btn.addEventListener("click", () => loadChatMessages(btn.dataset.chat));
  }
}

function getActiveChat() {
  return state.chats.find((chat) => chat.id === state.activeChatByAgent[state.active]) || null;
}

async function loadChatMessages(sessionId, { silent = false, agentId = state.active } = {}) {
  const data = await api(`/api/agents/${agentId}/chats/${sessionId}/messages`);
  if (state.active !== agentId) return;
  state.activeChatId = sessionId;
  state.activeChatByAgent[agentId] = sessionId;
  renderAgentChats();
  els.messages.innerHTML = "";
  closeStatusGroup();
  const agent = state.agents.find((item) => item.id === state.active);
  if (!silent) {
    addActivity({ type: "chat.opened", text: `${agent?.name || state.active}: ${sessionId}`, ts: Date.now() });
  }
  const session = data.session || {};
  addInlineEvent({
    type: "session.loaded",
    ts: Date.now(),
    status: session.missing ? `файл сессии не найден · ${session.id}` : `${session.platform || "Hermes"} · ${session.messageCount || 0} сообщений · ${session.id}`,
  });
  if (session.missing) {
    addMessage("assistant", "В индексе Hermes есть эта сессия, но файл сообщений уже отсутствует или был архивирован.", "warning");
  }
  for (const message of dedupeMessages(data.messages || [])) {
    if (message.role === "tool") {
      addStatusEvent({ type: message.kind || "tool", ts: Date.now(), text: message.text });
    } else {
      closeStatusGroup();
      if (message.role === "assistant") renderRichAssistant(message.text);
      else addMessage(message.role, message.text);
    }
  }
  closeStatusGroup();
  saveActiveMessages();
}

function activeConversationKey() {
  return state.activeGroupId ? `group:${state.activeGroupId}` : `agent:${state.active || ""}`;
}

function messageFingerprint(role, text, extraClass = "", sender = null) {
  const senderId = sender?.id || "";
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return `${role || ""}|${extraClass || ""}|${senderId}|${normalized}`;
}

function lastMessageRow() {
  const rows = [...els.messages.querySelectorAll(".msg-row:not(.typing):not(.tool-status)")];
  return rows[rows.length - 1] || null;
}

function isRecentDuplicateMessage(role, text, extraClass = "", sender = null) {
  const last = lastMessageRow();
  if (!last) return false;
  const fingerprint = messageFingerprint(role, text, extraClass, sender);
  if (!fingerprint.endsWith("|")) {
    const ts = Number(last.dataset.ts || 0);
    if (last.dataset.fingerprint === fingerprint && Date.now() - ts < 15000) return true;
  }
  return false;
}

function dedupeMessages(messages) {
  const result = [];
  let last = "";
  for (const message of messages || []) {
    if (!message || typeof message !== "object") continue;
    const role = message.role || "";
    const kind = message.kind || "";
    const text = message.text || "";
    const key = `${role}|${kind}|${String(text).replace(/\s+/g, " ").trim()}`;
    if (key === last) continue;
    last = key;
    result.push(message);
  }
  return result;
}

function messageCacheKey(agentId = state.active, chatId = state.activeChatId) {
  if (state.activeGroupId) return `group:${state.activeGroupId}`;
  return `agent:${agentId || ""}:${chatId || "draft"}`;
}

function saveActiveMessages() {
  if (state.activeGroupId || !state.active) return;
  state.messageCache[messageCacheKey()] = els.messages.innerHTML;
}

function restoreCachedMessages(agentId = state.active, chatId = state.activeChatId) {
  const html = state.messageCache[messageCacheKey(agentId, chatId)];
  if (!html) return false;
  els.messages.innerHTML = html;
  closeStatusGroup();
  scrollMessages();
  return true;
}

function clearMessagesForAgent(agentId) {
  if (state.active !== agentId || state.activeGroupId) return;
  els.messages.innerHTML = "";
  closeStatusGroup();
  addInlineEvent({ type: "chat.empty", ts: Date.now(), status: "Новый чистый чат" });
}

function selectAgent(agentId) {
  if (!agentId || state.active === agentId && !state.activeGroupId) return;
  saveActiveMessages();
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.active = agentId;
  state.activeGroupId = null;
  state.activeChatId = state.activeChatByAgent[agentId] || null;
  state.chats = [];
  if (!restoreCachedMessages(agentId, state.activeChatId)) {
    els.messages.innerHTML = "";
    closeStatusGroup();
    addInlineEvent({ type: "chat.loading", ts: Date.now(), status: "Загружаю чат агента…" });
  }
  updateActive();
  renderAgents();
  loadAgentChats().catch((error) => {
    if (state.active === agentId) addMessage("assistant", error.message, "error");
  });
  loadDiagnostics().catch(() => {});
}

function renderPromptRouter() {
  const report = state.promptRouter;
  if (!report) {
    els.promptRouter.className = "prompt-router-list empty";
    els.promptRouter.textContent = "ожидание проверки";
    return;
  }
  const selected = report.candidates.find((candidate) => candidate.selected);
  const recommended = report.recommended;
  const mismatch = selected && recommended && selected.id !== recommended.id;
  const suggestedMode = report.suggestedMode || "quick";
  els.promptRouter.className = "prompt-router-list";
  els.promptRouter.innerHTML = `
    <div class="health-summary ${mismatch ? "attention" : "ok"}">
      <strong>${recommended ? escapeHtml(recommended.name) : "no route"}</strong>
      <span>${report.hits.length ? report.hits.map(escapeHtml).join(" · ") : "обычная задача"}${mismatch ? ` · выбрано ${escapeHtml(selected.name)}` : ""} · ${escapeHtml(modeLabel(suggestedMode))}</span>
    </div>
    <div class="router-actions">
      ${recommended && mismatch ? `<button class="mini-action" data-select-agent="${recommended.id}">Выбрать ${escapeHtml(recommended.name)}</button>` : ""}
      <button class="mini-action" data-mode="${escapeHtml(suggestedMode)}">Режим: ${escapeHtml(modeLabel(suggestedMode))}</button>
    </div>
    <div class="incident-rows">
      ${report.candidates.slice(0, 5).map((candidate) => `
        <button class="incident-row ${candidate.selected ? "selected" : ""}" data-select-agent="${candidate.id}">
          <span>${escapeHtml(candidate.name)} · оценка ${candidate.score}${candidate.deferred ? " · отложено" : ""}</span>
          <small>подходит: ${escapeHtml(candidate.matchedAllowed.join(", ") || "нет")} · нежелательно: ${escapeHtml(candidate.matchedDiscouraged.join(", ") || "нет")}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.promptRouter.querySelectorAll("[data-select-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.selectAgent;
      updateActive();
      renderAgents();
      loadDiagnostics();
      addActivity({ type: "router.select", text: `выбран ${state.active}`, ts: Date.now() });
    });
  }
  for (const btn of els.promptRouter.querySelectorAll("[data-mode]")) {
    btn.addEventListener("click", () => {
      if (els.toolMode) els.toolMode.value = btn.dataset.mode;
      addActivity({ type: "router.mode", text: modeLabel(btn.dataset.mode), ts: Date.now() });
    });
  }
}

function renderPreflights() {
  if (!state.preflights.length) {
    els.preflights.className = "preflight-list empty";
    els.preflights.textContent = "нет проверок";
    return;
  }
  els.preflights.className = "preflight-list";
  const stats = state.preflightStats || { total: state.preflights.length, blocked: state.preflights.filter((item) => !item.ok).length, failedChecks: {}, riskHits: {} };
  const topCheck = Object.entries(stats.failedChecks || {}).sort((a, b) => b[1] - a[1])[0];
  const topRisk = Object.entries(stats.riskHits || {}).sort((a, b) => b[1] - a[1])[0];
  els.preflights.innerHTML = `
    <div class="health-summary ${stats.blocked ? "attention" : "ok"}">
      <strong>${stats.blocked}/${stats.total} остановлено</strong>
      <span>${escapeHtml(topCheck ? `${topCheck[0]}:${topCheck[1]}` : "провалы не найдены")} · ${escapeHtml(topRisk ? `${topRisk[0]}:${topRisk[1]}` : "рисков нет")}</span>
    </div>
    <div class="incident-rows">
      ${state.preflights.slice(0, 6).map((item) => `
        <button class="incident-row ${item.ok ? "ok" : "attention"}" data-agent="${item.profile}">
          <span>${escapeHtml(item.profile)} · ${item.ok ? "ок" : "остановлено"} · ${escapeHtml(item.routing?.recommended || "нет")}</span>
          <small>${escapeHtml((item.failedChecks || []).join(", ") || (item.promptRisk?.hits || []).join(", ") || "обычная")} · ${escapeHtml(item.messagePreview || "")}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.preflights.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderReadiness() {
  const readiness = state.readiness;
  if (!readiness) {
    els.readiness.className = "readiness-list empty";
    els.readiness.textContent = "нет данных";
    return;
  }
  const attention = readiness.profiles.filter((profile) => profile.status !== "ready").slice(0, 6);
  els.readiness.className = "readiness-list";
  els.readiness.innerHTML = `
    <div class="health-summary ${readiness.ok ? "ok" : "attention"}">
      <strong>${readiness.totals.ready} готовы</strong>
      <span>${readiness.totals["ready-with-warnings"]} с предупреждениями · ${readiness.totals.blocked} заблокированы</span>
    </div>
    <div class="incident-rows">
      ${(attention.length ? attention : readiness.profiles.slice(0, 4)).map((profile) => `
        <button class="incident-row ${profile.status}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${escapeHtml(profile.status)} · ${escapeHtml(profile.suggestedMode)}</span>
          <small>${escapeHtml((profile.blockers.length ? profile.blockers : profile.warnings).join(" · ") || `${profile.activeSkills} активных скиллов`)}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.readiness.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderRuns() {
  if (!state.runs.length) {
    els.runs.className = "runs-list empty";
    els.runs.textContent = "нет запусков";
    return;
  }
  els.runs.className = "runs-list";
  els.runs.innerHTML = state.runs.slice().reverse().slice(0, 8).map((run) => `
    <button class="run-card ${run.status} ${run.id === state.selectedRunId ? "selected" : ""}" data-run="${run.id}">
      <div><strong>${escapeHtml(run.profile)}</strong> · ${escapeHtml(statusLabel(run.status))}</div>
      <div class="event-meta">${escapeHtml(run.sessionId || "")}</div>
      <div class="event-meta">${Math.round(((run.endedAt || Date.now()) - run.startedAt) / 1000)}с · ${run.eventCount || 0} событий</div>
      <div class="event-meta">защита: ${escapeHtml(run.guard?.routing?.recommended?.id || "нет")} · риск ${(run.guard?.promptRisk?.hits || []).map(escapeHtml).join(", ") || "нет"}</div>
    </button>
  `).join("");
  for (const btn of els.runs.querySelectorAll("[data-run]")) {
    btn.addEventListener("click", () => inspectRun(btn.dataset.run));
  }
}

function renderAudit() {
  const audit = state.audit;
  if (!audit) {
    els.audit.className = "audit-list empty";
    els.audit.textContent = "нет данных";
    return;
  }
  els.audit.className = "audit-list";
  els.audit.innerHTML = `
    <div class="health-summary ${audit.ok ? "ok" : "attention"}">
      <strong>${audit.ok ? "аудит ок" : "нужно внимание"}</strong>
      <span>${audit.forbiddenProcesses.length} старых процессов · ${audit.openclaw.active.length} OpenClaw launchd</span>
    </div>
    <div class="audit-checks">
      ${audit.checks.map((check) => `
        <div class="audit-check ${check.ok ? "ok" : "attention"}">
          <span>${check.ok ? "ok" : "!"}</span>
          <div>${escapeHtml(check.label)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderIncidents() {
  const incidents = state.incidents;
  if (!incidents) {
    els.incidents.className = "incident-list empty";
    els.incidents.textContent = "нет данных";
    return;
  }
  const noisy = incidents.profiles.filter((profile) => profile.total > 0).slice(0, 5);
  els.incidents.className = "incident-list";
  els.incidents.innerHTML = `
    <div class="maintenance-grid">
      <div class="diag-card"><span>Провайдер</span><strong class="${incidents.totals.provider ? "warn-text" : "ok-text"}">${incidents.totals.provider}</strong><small>таймауты/ретраи</small></div>
      <div class="diag-card"><span>Разрешения</span><strong class="${incidents.totals.approval ? "warn-text" : "ok-text"}">${incidents.totals.approval}</strong><small>заблокированные команды</small></div>
      <div class="diag-card"><span>Старое</span><strong class="${incidents.totals.legacy ? "warn-text" : "ok-text"}">${incidents.totals.legacy}</strong><small>OpenClaw/browser</small></div>
      <div class="diag-card"><span>Контекст</span><strong class="${incidents.totals.context ? "warn-text" : "ok-text"}">${incidents.totals.context}</strong><small>раздутые токены</small></div>
    </div>
    <div class="incident-rows">
      ${noisy.length ? noisy.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.total}</span>
          <small>${escapeHtml(profile.latest).slice(-160)}</small>
        </button>
      `).join("") : `<div class="event-meta">свежих инцидентов нет</div>`}
    </div>
  `;
  for (const btn of els.incidents.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderLogTrends() {
  const trends = state.logTrends;
  if (!trends) {
    els.logTrends.className = "log-trend-list empty";
    els.logTrends.textContent = "нет данных";
    return;
  }
  const noisy = trends.profiles.filter((profile) => profile.freshTotal > 0 || profile.total > 0).slice(0, 6);
  const totals = trends.freshTotals || trends.totals;
  els.logTrends.className = "log-trend-list";
  els.logTrends.innerHTML = `
    <div class="maintenance-grid">
      <div class="diag-card"><span>Провайдер</span><strong class="${totals.provider ? "warn-text" : "ok-text"}">${totals.provider}</strong><small>после рестарта</small></div>
      <div class="diag-card"><span>Разрешения</span><strong class="${totals.approval ? "warn-text" : "ok-text"}">${totals.approval}</strong><small>после рестарта</small></div>
      <div class="diag-card"><span>Старое</span><strong class="${totals.legacy ? "warn-text" : "ok-text"}">${totals.legacy}</strong><small>после рестарта</small></div>
      <div class="diag-card"><span>Контекст</span><strong class="${totals.context ? "warn-text" : "ok-text"}">${totals.context}</strong><small>после рестарта</small></div>
    </div>
    <div class="incident-rows">
      ${noisy.length ? noisy.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · fresh ${profile.freshTotal || 0} / tail ${profile.total}</span>
          <small>${escapeHtml(Object.entries(profile.freshCounts || profile.counts).map(([key, value]) => `${key}:${value}`).join(" · "))}</small>
        </button>
      `).join("") : `<div class="event-meta">история логов чистая</div>`}
    </div>
  `;
  for (const btn of els.logTrends.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderTelegramDependency() {
  const report = state.telegramDependency;
  if (!report) {
    els.telegramDependency.className = "telegram-dependency-list empty";
    els.telegramDependency.textContent = "нет данных";
    return;
  }
  const rows = report.profiles.filter((profile) => profile.telegramLines || profile.timeoutLines).slice(0, 6);
  els.telegramDependency.className = "telegram-dependency-list";
  els.telegramDependency.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.totals.timeoutLines} timeouts</strong>
      <span>${report.totals.vpnSensitive} vpn-sensitive · ${report.totals.inboundLines} inbound</span>
    </div>
    <div class="incident-rows">
      ${(rows.length ? rows : report.profiles.slice(0, 3)).map((profile) => `
        <button class="incident-row ${profile.status === "vpn-sensitive" ? "attention" : "ok"}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${escapeHtml(profile.status)}</span>
          <small>${profile.timeoutLines} timeout lines · ${profile.inboundLines} inbound · ${escapeHtml(profile.latest).slice(-120)}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.telegramDependency.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderLegacySkills() {
  const report = state.legacySkills;
  if (!report) {
    els.legacySkills.className = "legacy-skill-list empty";
    els.legacySkills.textContent = "нет данных";
    return;
  }
  els.legacySkills.className = "legacy-skill-list";
  els.legacySkills.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.ok ? "чисто" : `${report.active.length} активных`}</strong>
      <span>прямые скиллы со старыми триггерами</span>
    </div>
    <div class="incident-rows">
      ${report.active.length ? report.active.slice(0, 6).map((skill) => `
        <div class="incident-row">
          <span>${escapeHtml(skill.profile)} / ${escapeHtml(skill.name)}</span>
          <small>${escapeHtml(skill.scope)} · ${escapeHtml(skill.reasons.join(", "))}</small>
        </div>
      `).join("") : `<div class="event-meta">опасных direct skills не видно</div>`}
    </div>
  `;
}

function renderSkillRisks() {
  const report = state.skillRisks;
  if (!report) {
    els.skillRisks.className = "skill-risk-list empty";
    els.skillRisks.textContent = "нет данных";
    return;
  }
  const topProfiles = report.profiles.filter((profile) => profile.riskySkills > 0).slice(0, 6);
  const totalRiskRefs = Object.values(report.totals).reduce((sum, value) => sum + value, 0);
  els.skillRisks.className = "skill-risk-list";
  els.skillRisks.innerHTML = `
    <div class="health-summary ${totalRiskRefs ? "attention" : "ok"}">
      <strong>${totalRiskRefs} risk refs</strong>
      <span>${Object.entries(report.totals).map(([key, value]) => `${key}:${value}`).join(" · ") || "clean"}</span>
    </div>
    <div class="incident-rows">
      ${topProfiles.length ? topProfiles.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.riskySkills}/${profile.totalSkills}</span>
          <small>${Object.entries(profile.counts).map(([key, value]) => `${key}:${value}`).join(" · ")}</small>
        </button>
      `).join("") : `<div class="event-meta">risk-классов не найдено</div>`}
    </div>
  `;
  for (const btn of els.skillRisks.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderRolePolicy() {
  const report = state.rolePolicy;
  if (!report) {
    els.rolePolicy.className = "role-policy-list empty";
    els.rolePolicy.textContent = "нет данных";
    return;
  }
  const bad = report.profiles.filter((profile) => !profile.ok && !profile.deferred).slice(0, 6);
  els.rolePolicy.className = "role-policy-list";
  els.rolePolicy.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.totals.profiles} profiles</strong>
      <span>${report.totals.refs} discouraged refs · ${report.totals.deferred} deferred</span>
    </div>
    <div class="incident-rows">
      ${bad.length ? bad.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.discouraged.map((item) => `${item.tag}:${item.count}`).join(" · ")}</span>
          <small>${escapeHtml(profile.examples.slice(0, 3).map((item) => `${item.name}(${item.tags.join(",")})`).join(", "))}</small>
        </button>
      `).join("") : `<div class="event-meta">ролевых пересечений не видно; дизайнер отложен отдельно</div>`}
    </div>
  `;
  for (const btn of els.rolePolicy.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderSkillCatalog() {
  const catalog = state.skillCatalog;
  if (!catalog) {
    els.skillCatalog.className = "skill-catalog-list empty";
    els.skillCatalog.textContent = "нет данных";
    return;
  }
  const topProfiles = catalog.profiles.slice().sort((a, b) => b.total - a.total).slice(0, 6);
  els.skillCatalog.className = "skill-catalog-list";
  els.skillCatalog.innerHTML = `
    <div class="health-summary ok">
      <strong>${catalog.totals.skills} активных</strong>
      <span>${Object.entries(catalog.totals).filter(([key]) => key !== "skills").map(([key, value]) => `${key}:${value}`).join(" · ")}</span>
    </div>
    <div class="incident-rows">
      ${topProfiles.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.total}</span>
          <small>${escapeHtml(Object.entries(profile.byScope).map(([key, value]) => `${key}:${value}`).join(" · "))}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.skillCatalog.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderDuplicateSkills() {
  const report = state.duplicateSkills;
  if (!report) {
    els.duplicateSkills.className = "duplicate-skill-list empty";
    els.duplicateSkills.textContent = "нет данных";
    return;
  }
  const bad = report.profiles.filter((profile) => !profile.ok).slice(0, 6);
  els.duplicateSkills.className = "duplicate-skill-list";
  els.duplicateSkills.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.totals.duplicates} duplicates</strong>
      <span>${report.totals.profiles} profiles</span>
    </div>
    <div class="incident-rows">
      ${bad.length ? bad.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.duplicateCount}</span>
          <small>${escapeHtml(profile.duplicates.map((item) => item.skill).join(", "))}</small>
        </button>
      `).join("") : `<div class="event-meta">workspace/profile дублей нет</div>`}
    </div>
  `;
  for (const btn of els.duplicateSkills.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderDisabledSkills() {
  const report = state.disabledSkills;
  if (!report) {
    els.disabledSkills.className = "disabled-skill-list empty";
    els.disabledSkills.textContent = "нет данных";
    return;
  }
  els.disabledSkills.className = "disabled-skill-list";
  const reasonEntries = Object.entries(report.totals.reasons || {}).sort((a, b) => b[1] - a[1]);
  els.disabledSkills.innerHTML = `
    <div class="health-summary ok">
      <strong>${report.totals.total} отключенных</strong>
      <span>${Object.entries(report.totals).filter(([key]) => !["total", "reasons"].includes(key)).map(([key, value]) => `${key}:${value}`).join(" · ") || "нет"}</span>
    </div>
    <div class="diag-grid compact">
      ${reasonEntries.map(([reason, count]) => `
        <div class="diag-card">
          <span>${escapeHtml(reason)}</span>
          <strong>${count}</strong>
          <small>отключено</small>
        </div>
      `).join("")}
    </div>
    <div class="incident-rows">
      ${report.skills.slice(0, 8).map((item) => `
        <div class="incident-row">
          <span>${escapeHtml(item.name)} · ${escapeHtml(item.skill)}</span>
          <small>${escapeHtml(item.reason?.label || "отключено")} · ${escapeHtml(item.scope)} · ${escapeHtml(item.path)}</small>
        </div>
      `).join("") || `<div class="event-meta">отключенных skills нет</div>`}
    </div>
  `;
}

function renderRuleAudit() {
  const report = state.ruleAudit;
  if (!report) {
    els.ruleAudit.className = "rule-audit-list empty";
    els.ruleAudit.textContent = "нет данных";
    return;
  }
  const bad = report.profiles.filter((profile) => !profile.ok).slice(0, 6);
  els.ruleAudit.className = "rule-audit-list";
  els.ruleAudit.innerHTML = `
    <div class="health-summary ${report.ok ? "ok" : "attention"}">
      <strong>${report.ok ? "rules clean" : `${report.totals.profiles} profiles`}</strong>
      <span>${report.totals.risks} risk refs · ${report.totals.missingGuardrails} missing guardrails</span>
    </div>
    <div class="incident-rows">
      ${bad.length ? bad.map((profile) => {
        const firstRisk = profile.risks[0];
        const missing = profile.missingGuardrails.map((rule) => rule.id).join(", ");
        const detail = firstRisk
          ? `${firstRisk.label} · ${firstRisk.name}:${firstRisk.line} · ${firstRisk.excerpt}`
          : `missing: ${missing}`;
        return `
          <button class="incident-row" data-agent="${profile.id}">
            <span>${escapeHtml(profile.name)} · ${profile.riskCount} refs</span>
            <small>${escapeHtml(detail).slice(0, 180)}</small>
          </button>
        `;
      }).join("") : `<div class="event-meta">правила не толкают агентов в лишние действия</div>`}
    </div>
  `;
  for (const btn of els.ruleAudit.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderBaseline() {
  const drift = state.baseline;
  if (!drift) {
    els.baseline.className = "baseline-list empty";
    els.baseline.textContent = "нет данных";
    return;
  }
  els.baseline.className = "baseline-list";
  if (!drift.hasBaseline) {
    els.baseline.innerHTML = `
      <div class="health-summary attention">
        <strong>no baseline</strong>
        <span>зафиксируй текущую чистую конфигурацию</span>
      </div>
      <button id="saveBaseline" class="mini-action">Save current baseline</button>
    `;
  } else {
    els.baseline.innerHTML = `
      <div class="health-summary ${drift.ok ? "ok" : "attention"}">
        <strong>${drift.ok ? "no drift" : `${drift.changes.length} changes`}</strong>
        <span>baseline ${new Date(drift.capturedAt).toLocaleString("ru-RU")}</span>
      </div>
      <div class="incident-rows">
        ${drift.changes.length ? drift.changes.slice(0, 6).map((change) => `
          <div class="incident-row">
            <span>${escapeHtml(change.type)} / ${escapeHtml(change.id)}</span>
            <small>${escapeHtml(JSON.stringify(change).slice(0, 160))}</small>
          </div>
        `).join("") : `<div class="event-meta">drift не найден</div>`}
      </div>
      <button id="saveBaseline" class="mini-action">Refresh baseline</button>
    `;
  }
  els.baseline.querySelector("#saveBaseline")?.addEventListener("click", saveBaseline);
}

function renderToolPolicy() {
  const policy = state.toolPolicy;
  if (!policy) {
    els.toolPolicy.className = "tool-policy-list empty";
    els.toolPolicy.textContent = "нет данных";
    return;
  }
  const bad = policy.profiles.filter((profile) => !profile.ok);
  els.toolPolicy.className = "tool-policy-list";
  els.toolPolicy.innerHTML = `
    <div class="health-summary ${policy.ok ? "ok" : "attention"}">
      <strong>${policy.ok ? "filtered" : `${bad.length} profiles`}</strong>
      <span>${policy.forbidden.join(", ")}</span>
    </div>
    <div class="incident-rows">
      ${bad.length ? bad.map((profile) => `
        <button class="incident-row" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)}</span>
          <small>missing: ${escapeHtml(profile.missingDisabled.join(", "))}</small>
        </button>
      `).join("") : `<div class="event-meta">forbidden toolsets закрыты</div>`}
    </div>
  `;
  for (const btn of els.toolPolicy.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderSelfTest() {
  const test = state.selfTest;
  if (!test) {
    els.selfTest.className = "self-test-list empty";
    els.selfTest.textContent = "нет данных";
    return;
  }
  els.selfTest.className = "self-test-list";
  els.selfTest.innerHTML = `
    <div class="health-summary ${test.ok ? "ok" : "attention"}">
      <strong>${test.ok ? "self test ok" : "self test failed"}</strong>
      <span>${test.checks.filter((check) => check.ok).length}/${test.checks.length} checks</span>
    </div>
    ${test.checks.map((check) => `
      <div class="audit-check ${check.ok ? "ok" : "attention"}">
        <span>${check.ok ? "ok" : "!"}</span>
        <div>${escapeHtml(check.label)}</div>
      </div>
    `).join("")}
  `;
}

function renderInventory() {
  const inventory = state.inventory;
  if (!inventory) {
    els.inventory.className = "inventory-list empty";
    els.inventory.textContent = "нет данных";
    return;
  }
  els.inventory.className = "inventory-list";
  els.inventory.innerHTML = `
    <div class="maintenance-grid">
      <div class="diag-card"><span>Archives</span><strong>${inventory.totals.archives}</strong><small>total</small></div>
      <div class="diag-card"><span>Sessions</span><strong>${inventory.totals.sessionArchives}</strong><small>archives</small></div>
      <div class="diag-card"><span>Config</span><strong>${inventory.totals.configBackups}</strong><small>backups</small></div>
      <div class="diag-card"><span>State</span><strong>${inventory.totals.stateBackups}</strong><small>backups</small></div>
    </div>
    <div class="inventory-profiles">
      ${inventory.profiles.map((profile) => `
        <div class="event-meta">${escapeHtml(profile.name)}: ${profile.archiveCount} архивов · ${profile.activeSession.maxPromptTokens} токенов</div>
      `).join("")}
    </div>
  `;
}

function renderModelMatrix() {
  const matrix = state.modelMatrix;
  if (!matrix) {
    els.modelMatrix.className = "model-matrix empty";
    els.modelMatrix.textContent = "нет данных";
    return;
  }
  els.modelMatrix.className = "model-matrix";
  els.modelMatrix.innerHTML = `
    <div class="health-summary ${matrix.profiles.some((profile) => profile.needsAttention) ? "attention" : "ok"}">
      <strong>${matrix.models.join(", ") || "unknown"}</strong>
      <span>${matrix.providers.join(", ") || "unknown"} · ${matrix.profiles.length} profiles</span>
    </div>
    <div class="matrix-rows">
      ${matrix.profiles.map((profile) => `
        <button class="matrix-row ${profile.needsAttention ? "attention" : "ok"}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)}</span>
          <small>${escapeHtml(profile.provider)} / ${escapeHtml(profile.model)}</small>
          <small>${profile.maxTurns || "?"} turns · ${profile.apiMaxRetries || 0} retries · ${profile.maxPromptTokens} tok · ${profile.problemCount} warn</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.modelMatrix.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderRoutes() {
  const docs = state.routes;
  if (!docs) {
    els.routes.className = "route-list empty";
    els.routes.textContent = "нет данных";
    return;
  }
  els.routes.className = "route-list";
  els.routes.innerHTML = docs.routes.slice(0, 10).map((route) => `
    <div class="route-row">
      <span>${escapeHtml(route.method)}</span>
      <strong>${escapeHtml(route.path)}</strong>
      <small>${escapeHtml(route.description)}</small>
    </div>
  `).join("");
}

async function loadDocs() {
  const data = await api("/api/docs");
  state.docs = data.docs || [];
  if (!state.activeDocId || !state.docs.some((doc) => doc.id === state.activeDocId)) {
    state.activeDocId = state.docs[0]?.id || null;
  }
  renderDocsTree();
  renderActiveDoc();
}

function docsChildren(parentId = null) {
  return state.docs
    .filter((doc) => (doc.parentId || null) === (parentId || null))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.title || "").localeCompare(String(b.title || ""), "ru"));
}

function renderDocsTree() {
  if (!state.docs.length) {
    els.docsTree.innerHTML = '<div class="docs-tree-empty">Пока нет страниц</div>';
    return;
  }
  els.docsTree.innerHTML = docsChildren(null).map((doc) => docTreeRow(doc, 0)).join("");
  for (const row of els.docsTree.querySelectorAll("[data-doc]")) {
    row.addEventListener("click", (event) => {
      if (event.target.closest("[data-add-child]")) return;
      state.activeDocId = row.dataset.doc;
      state.docEditing = false;
      renderDocsTree();
      renderActiveDoc();
    });
  }
  for (const btn of els.docsTree.querySelectorAll("[data-add-child]")) {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await createDoc(btn.dataset.addChild);
    });
  }
}

function docTreeRow(doc, level) {
  const children = docsChildren(doc.id);
  const active = doc.id === state.activeDocId ? "active" : "";
  return `
    <div class="docs-row ${active}" data-doc="${escapeHtml(doc.id)}" style="padding-left:${8 + level * 16}px">
      <span class="dr-twist ${children.length ? "" : "empty"}">›</span>
      <span class="dr-icon">${escapeHtml(doc.icon || "·")}</span>
      <span class="dr-title">${escapeHtml(doc.title || "Без названия")}</span>
      <button class="dr-add" type="button" data-add-child="${escapeHtml(doc.id)}" title="Дочерняя страница">+</button>
    </div>
    ${children.map((child) => docTreeRow(child, level + 1)).join("")}
  `;
}

function activeDoc() {
  return state.docs.find((doc) => doc.id === state.activeDocId) || null;
}

function renderActiveDoc() {
  const doc = activeDoc();
  els.docsEmpty.hidden = Boolean(doc);
  els.docsEditor.hidden = !doc;
  if (!doc) return;
  els.docTitle.value = doc.title || "";
  els.docBody.value = doc.content || "";
  els.docView.innerHTML = renderMarkdown(doc.content || "");
  els.docBody.hidden = !state.docEditing;
  els.docView.hidden = state.docEditing;
  els.docEditToggle.textContent = state.docEditing ? "Просмотр" : "Редактировать";
  els.docSaveState.textContent = "сохранено";
}

function renderMarkdown(text) {
  const lines = String(text || "").split(/\r?\n/);
  const html = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  };
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^\s*-\s+/, ""))}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      html.push("");
    } else if (line.startsWith("### ")) {
      html.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("# ")) {
      html.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else {
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }
  closeList();
  return html.join("\n");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function createDoc(parentId = null) {
  const data = await api("/api/docs", {
    method: "POST",
    body: JSON.stringify({ title: "Новая страница", parentId, content: "" }),
  });
  state.docs.push(data.doc);
  state.activeDocId = data.doc.id;
  state.docEditing = true;
  renderDocsTree();
  renderActiveDoc();
  els.docTitle.focus();
  els.docTitle.select();
}

let docSaveTimer = null;
function scheduleDocSave() {
  const doc = activeDoc();
  if (!doc) return;
  doc.title = els.docTitle.value.trim() || "Без названия";
  doc.content = els.docBody.value;
  els.docSaveState.textContent = "сохраняю…";
  clearTimeout(docSaveTimer);
  docSaveTimer = setTimeout(saveActiveDoc, 450);
}

async function saveActiveDoc() {
  const doc = activeDoc();
  if (!doc) return;
  try {
    const data = await api(`/api/docs/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: doc.title, content: doc.content }),
    });
    Object.assign(doc, data.doc);
    els.docSaveState.textContent = "сохранено";
    renderDocsTree();
    if (!state.docEditing) els.docView.innerHTML = renderMarkdown(doc.content || "");
  } catch (error) {
    els.docSaveState.textContent = `ошибка: ${error.message}`;
  }
}

async function deleteActiveDoc() {
  const doc = activeDoc();
  if (!doc) return;
  if (!window.confirm(`Удалить «${doc.title || "Без названия"}» и дочерние страницы?`)) return;
  await api(`/api/docs/${doc.id}`, { method: "DELETE" });
  await loadDocs();
}

function renderSnapshots() {
  if (!state.snapshots.length) {
    els.snapshots.className = "snapshots-list empty";
    els.snapshots.textContent = "нет snapshot";
    return;
  }
  els.snapshots.className = "snapshots-list";
  els.snapshots.innerHTML = state.snapshots.slice(0, 6).map((snapshot) => `
    <button class="snapshot-card" data-snapshot="${snapshot.id}">
      <strong>${escapeHtml(snapshot.name.replace(".json", ""))}</strong>
      <span>${new Date(snapshot.mtimeMs).toLocaleString("ru-RU")}</span>
    </button>
  `).join("");
  for (const btn of els.snapshots.querySelectorAll("[data-snapshot]")) {
    btn.addEventListener("click", () => inspectSnapshot(btn.dataset.snapshot));
  }
}

function renderMaintenance() {
  const maintenance = state.maintenance;
  if (!maintenance) {
    els.maintenance.className = "maintenance-list empty";
    els.maintenance.textContent = "нет данных";
    return;
  }
  els.maintenance.className = "maintenance-list";
  els.maintenance.innerHTML = `
      <div class="maintenance-grid">
      <div class="diag-card"><span>Запуски</span><strong>${maintenance.counts.runs}</strong><small>лимит ${maintenance.limits.runs}</small></div>
        <div class="diag-card"><span>Снимки</span><strong>${maintenance.counts.snapshots}</strong><small>лимит ${maintenance.limits.snapshots}</small></div>
        <div class="diag-card"><span>Разрешения</span><strong>${maintenance.counts.approvals}</strong><small>локальные папки</small></div>
        <div class="diag-card"><span>Проверки</span><strong>${maintenance.counts.preflights}</strong><small>лимит ${maintenance.limits.preflights}</small></div>
      </div>
    <button id="exportState" class="mini-action">Вывести состояние в активность</button>
  `;
  els.maintenance.querySelector("#exportState")?.addEventListener("click", exportStateToActivity);
}

function renderConfigDrift() {
  const drift = state.configDrift;
  if (!drift) {
    els.configDrift.className = "config-drift-list empty";
    els.configDrift.textContent = "нет данных";
    return;
  }
  const bad = drift.profiles.filter((profile) => !profile.ok).slice(0, 6);
  els.configDrift.className = "config-drift-list";
  els.configDrift.innerHTML = `
    <div class="health-summary ${drift.ok ? "ok" : "attention"}">
      <strong>${drift.ok ? "config aligned" : `${drift.totals.profiles} profiles`}</strong>
      <span>${drift.totals.fieldDrift} field drift · ${drift.totals.missingToolsets} missing toolsets</span>
    </div>
    <div class="incident-rows">
      ${(bad.length ? bad : drift.profiles.slice(0, 4)).map((profile) => `
        <button class="incident-row ${profile.ok ? "ok" : "attention"}" data-agent="${profile.id}">
          <span>${escapeHtml(profile.name)} · ${profile.disabledToolsetCount} отключено</span>
          <small>${escapeHtml(profile.fieldDrift.map((item) => `${item.field}:${item.actual || "?"}`).join(" · ") || profile.missingToolsets.join(", ") || "ok")}</small>
        </button>
      `).join("")}
    </div>
  `;
  for (const btn of els.configDrift.querySelectorAll("[data-agent]")) {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.agent;
      updateActive();
      renderAgents();
      loadDiagnostics();
    });
  }
}

function renderDiagnostics() {
  const d = state.diagnostics;
  if (!d) {
    els.diagnostics.className = "diagnostics empty";
    els.diagnostics.textContent = "нет данных";
    return;
  }
  const issueHtml = d.issues.length
    ? d.issues.map((issue) => `<div class="diag-issue">${escapeHtml(issue)}</div>`).join("")
    : `<div class="diag-ok">ok</div>`;
  const runHtml = d.activeRuns.length
    ? d.activeRuns.map((run) => `<div class="event-meta">${escapeHtml(run.id)} · ${Math.round(run.ageMs / 1000)}с</div>`).join("")
    : `<div class="event-meta">нет активных run</div>`;
  els.diagnostics.className = "diagnostics";
  els.diagnostics.innerHTML = `
    <div class="diag-grid">
      <div class="diag-card">
        <span>Шлюз</span>
        <strong class="${d.gateway.status === "running" ? "ok-text" : "warn-text"}">${escapeHtml(d.gateway.status)}</strong>
        <small>${escapeHtml(d.gateway.label)} · pid ${escapeHtml(String(d.gateway.pid || "нет"))}</small>
      </div>
      <div class="diag-card">
        <span>Сессии</span>
        <strong class="${d.sessions.status === "clean" ? "ok-text" : "warn-text"}">${d.sessions.count} / ${d.sessions.maxPromptTokens}</strong>
        <small>max prompt tokens</small>
      </div>
      <div class="diag-card">
        <span>Конфиг</span>
        <strong>${d.config.maxTurns || "?"} turns</strong>
        <small>${d.config.disabledToolsets.length} отключенных наборов</small>
      </div>
      <div class="diag-card">
        <span>Скиллы</span>
        <strong>${d.skills.workspace.skills.length + d.skills.profile.skills.length + d.skills.shared.skills.length}</strong>
        <small>workspace/profile/shared</small>
      </div>
      <div class="diag-card">
        <span>Логи</span>
        <strong class="${d.logs.problemCount ? "warn-text" : "ok-text"}">${d.logs.problemCount}</strong>
        <small>свежие предупреждения</small>
      </div>
    </div>
    <div class="diag-section">
      <div class="diag-label">Проблемы</div>
      ${issueHtml}
    </div>
    <div class="diag-section">
      <div class="diag-label">Активные запуски</div>
      ${runHtml}
    </div>
    <div class="diag-section">
      <div class="diag-label">Скиллы</div>
      <div class="event-meta">воркспейс: ${escapeHtml(d.skills.workspace.skills.join(", ") || "нет")}</div>
      <div class="event-meta">профиль: ${escapeHtml(d.skills.profile.skills.join(", ") || "нет")}</div>
      <div class="event-meta">общие: ${escapeHtml(d.skills.shared.skills.join(", ") || "нет")}</div>
    </div>
    <div class="diag-section">
      <div class="diag-label">Свежие предупреждения логов</div>
      ${
        d.logs.problems.length
          ? d.logs.problems.map((line) => `<div class="event-meta mono">${escapeHtml(line).slice(-220)}</div>`).join("")
          : `<div class="event-meta">чисто</div>`
      }
    </div>
  `;
}

function renderResources() {
  const obsidian = state.resources?.obsidian;
  if (!obsidian) return;
  els.resources.className = "resource-list";
  els.resources.innerHTML = `
    <div class="resource">
      <strong>Obsidian</strong>
      <div class="event-meta">${obsidian.vaultExists ? "vault ok" : "vault не найден"}</div>
      <div class="event-meta">${obsidian.skillExists ? "skill ok" : "skill не найден"}</div>
      <div class="event-meta">${escapeHtml(obsidian.vault)}</div>
    </div>
    <div class="resource">
      <strong>Скиллы</strong>
      ${
        (state.resources.skills || []).map((item) => {
          const count = item.workspace.skills.length + item.profile.skills.length + item.shared.skills.length + item.bundled.skills.length;
          return `<div class="event-meta">${escapeHtml(item.name)}: ${count}</div>`;
        }).join("")
      }
    </div>
  `;
}

function messageTime(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function scrollMessages() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function bubbleSide(role) {
  return role === "user" ? "out" : "in";
}

function applyGrouping() {
  const rows = [...els.messages.querySelectorAll(".msg-row")];
  rows.forEach((row, index) => {
    const next = rows[index + 1];
    const prev = rows[index - 1];
    const side = row.dataset.side;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;
    const noTail = side === "service" || side === "status";
    const newGroup = !prev || prev.dataset.side !== side;
    row.classList.toggle("grp-start", newGroup && index > 0);
    const lastInGroup = !next || next.dataset.side !== side;
    bubble.classList.toggle("tailed", lastInGroup && !noTail);
  });
}

const SENDER_COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#faa774"];

function senderColor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash + ch.charCodeAt(0)) % SENDER_COLORS.length;
  return SENDER_COLORS[hash];
}

function addMessage(role, text, extraClass = "", sender = null) {
  if (isRecentDuplicateMessage(role, text, extraClass, sender)) return lastMessageRow();
  const side = bubbleSide(role);
  const row = document.createElement("div");
  row.className = `msg-row ${side}${sender ? " with-sender" : ""}`;
  row.dataset.side = side;
  row.dataset.ts = String(Date.now());
  row.dataset.fingerprint = messageFingerprint(role, text, extraClass, sender);

  if (sender) {
    const av = document.createElement("div");
    av.className = "row-avatar";
    av.innerHTML = memberAvatarMarkup(sender);
    row.appendChild(av);
  }

  const bubble = document.createElement("div");
  bubble.className = `bubble ${role} ${extraClass}`.trim();

  const meta = document.createElement("div");
  meta.className = "bubble-meta";
  meta.innerHTML = `${messageTime()}${side === "out" ? '<span class="bubble-check">✓</span>' : ""}`;
  bubble.appendChild(meta);

  if (sender) {
    const senderEl = document.createElement("div");
    senderEl.className = "bubble-sender";
    senderEl.style.color = senderColor(sender.id);
    senderEl.textContent = sender.name || sender.id;
    bubble.appendChild(senderEl);
  }

  const textEl = document.createElement("div");
  textEl.className = "bubble-text";
  textEl.textContent = text;
  bubble.appendChild(textEl);

  row.appendChild(bubble);
  els.messages.appendChild(row);
  applyGrouping();
  scrollMessages();
  row.__text = textEl;
  return row;
}

function setMessageText(row, text) {
  if (row?.__text) row.__text.textContent = text;
  if (row) {
    const bubble = row.querySelector(".bubble");
    const role = bubble?.classList.contains("user") ? "user" : "assistant";
    const extraClass = bubble?.classList.contains("warning") ? "warning" : bubble?.classList.contains("error") ? "error" : "";
    row.dataset.ts = String(Date.now());
    row.dataset.fingerprint = messageFingerprint(role, text, extraClass);
  }
  scrollMessages();
}

function resolveMediaSrc(src) {
  const value = String(src || "").trim();
  if (/^https?:\/\//i.test(value) || value.startsWith("/uploads/")) return value;
  if (value.startsWith("/")) return `/api/file?path=${encodeURIComponent(value)}`;
  return value;
}

function mediaKindForSrc(src) {
  const ext = (String(src).split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  return "image";
}

function extractMedia(text) {
  const media = [];
  let clean = String(text || "");
  clean = clean.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g, (_m, alt, src) => {
    media.push({ src, alt: alt.trim() });
    return "";
  });
  clean = clean.replace(
    /(?:https?:\/\/|\/)[^\s)<>"']+\.(?:png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov)(?:\?[^\s)<>"']*)?/gi,
    (m) => {
      media.push({ src: m, alt: "" });
      return "";
    },
  );
  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), media };
}

function renderRichAssistant(text, sender = null, existingNode = null) {
  const { clean, media } = extractMedia(text);
  if (!media.length) {
    if (existingNode) setMessageText(existingNode, String(text || ""));
    else addMessage("assistant", String(text || ""), "", sender);
    return;
  }
  if (existingNode) {
    if (clean) setMessageText(existingNode, clean);
    else existingNode.remove();
  } else if (clean) {
    addMessage("assistant", clean, "", sender);
  }
  for (const item of media) {
    addAttachment(
      "assistant",
      { url: resolveMediaSrc(item.src), kind: mediaKindForSrc(item.src), name: item.alt || "image" },
      sender,
    );
  }
}

function addTyping() {
  const row = document.createElement("div");
  row.className = "msg-row in typing";
  row.dataset.side = "in";
  row.innerHTML = '<div class="bubble"><span class="typing-dots"><i></i><i></i><i></i></span></div>';
  els.messages.appendChild(row);
  applyGrouping();
  scrollMessages();
  return row;
}

function removeTyping(row) {
  if (row && row.parentNode) row.remove();
  applyGrouping();
}

const STATUS_ICONS = {
  file: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V9h5.5L13 3.5z"/></svg>',
  skill: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M12 3l9 5-9 5-9-5 9-5zm0 7.6l9-5V15l-9 5-9-5V5.6l9 5z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M6 10V8a6 6 0 1112 0v2h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 10-8 0v2z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 00-1.7-1l-.3-2.5h-4l-.3 2.5a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 000 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 001.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 001.7-1l2.4 1 2-3.5-2-1.5zM12 15a3 3 0 110-6 3 3 0 010 6z"/></svg>',
};

function statusIcon(text) {
  const t = String(text).toLowerCase();
  if (/write_file|read_file|\bfile\b|\.(md|txt|json|py|js|csv|pdf|png|jpg)/.test(t)) return STATUS_ICONS.file;
  if (/skill/.test(t)) return STATUS_ICONS.skill;
  if (/approval|разрешени|нужно разрешение/.test(t)) return STATUS_ICONS.lock;
  return STATUS_ICONS.gear;
}

let statusNode = null;

function closeStatusGroup() {
  statusNode = null;
}

function addStatusEvent(event) {
  const detail = event.event ? summarizeToolEvent(event.event) : summarizeEvent(event);
  const text = detail || event.type || "событие";
  if (!statusNode || !statusNode.isConnected) {
    statusNode = document.createElement("div");
    statusNode.className = "msg-row tool-status";
    statusNode.dataset.side = "status";
    statusNode.innerHTML = '<div class="bubble tool-status"><div class="status-lines"></div><div class="bubble-meta"></div></div>';
    els.messages.appendChild(statusNode);
  }
  const line = document.createElement("div");
  line.className = "status-line";
  line.innerHTML = `<span class="status-ic">${statusIcon(text)}</span><span class="status-text">${escapeHtml(text)}</span>`;
  statusNode.querySelector(".status-lines").appendChild(line);
  const meta = statusNode.querySelector(".bubble-meta");
  if (meta) meta.textContent = messageTime(event.ts);
  applyGrouping();
  const typingRow = els.messages.querySelector(".msg-row.typing");
  if (typingRow) els.messages.appendChild(typingRow);
  scrollMessages();
  return statusNode;
}

function addInlineEvent(event) {
  return addStatusEvent(event);
}

function summarizeEvent(event) {
  if (event.type === "agent.ready") {
    return `${event.profile || "агент"} · ${modeLabel(event.toolMode || "focused")} · ${(event.toolsets || []).join(", ")}`;
  }
  if (event.type === "run.started") {
    const source = event.sourceSession?.id ? ` · контекст: ${event.sourceSession.id}` : "";
    const history = event.historyMessages ? ` · ${event.historyMessages} сообщений истории` : "";
    return `${event.profile || "агент"} · ${event.sessionId || ""}${source}${history}`;
  }
  if (event.type === "toolsets.filtered") {
    return `заблокировано: ${(event.blocked || []).join(", ") || "нет"} · режим ${modeLabel(event.toolMode || "focused")}`;
  }
  if (event.type === "approval.requested") {
    return event.description || event.command || "нужно разрешение";
  }
  return event.error || event.text || event.warning || event.status || JSON.stringify(event).slice(0, 220);
}

function summarizeToolEvent(event) {
  const name = event.name || event.tool || event.type || event.action || "tool";
  const status = event.status || event.phase || event.state || "";
  const text = event.text || event.message || event.command || event.path || event.query || event.delta || "";
  const payload = text || JSON.stringify(event);
  return `${name}${status ? ` · ${status}` : ""}${payload ? ` · ${payload}` : ""}`.slice(0, 260);
}

function addActivity(event) {
  if (els.activity.classList.contains("empty")) {
    els.activity.className = "activity-list";
    els.activity.innerHTML = "";
  }
  const node = document.createElement("div");
  node.className = "event";
  const labels = {
    "router.select": "роутер",
    "router.mode": "режим",
    "preflight.preview": "предпроверка",
    "sessions.archive": "архив сессий",
    "snapshot.saved": "снимок сохранен",
    "snapshot.opened": "снимок открыт",
    "snapshot.health": "здоровье снимка",
    "snapshot.audit": "аудит снимка",
    "history.pruned": "история очищена",
    "self-test": "самопроверка",
    "state.export": "экспорт состояния",
    "baseline.saved": "база сохранена",
    "legacy.cleanup": "старое очищено",
    "run.started": "запуск начат",
    "run.completed": "запуск готов",
    "run.failed": "ошибка запуска",
    "run.exited": "запуск завершен",
    "tool.event": "инструмент",
    "agent.ready": "агент готов",
    "toolsets.filtered": "инструменты отфильтрованы",
    "history.load_failed": "история не загрузилась",
    "approval.requested": "нужно разрешение",
    "approval.sent": "разрешение отправлено",
  };
  const label = labels[event.type] || event.type || "событие";
  const details = event.error || event.text || event.delta || event.status || event.decision || "";
  node.innerHTML = `<div>${label}</div><div class="event-meta">${formatTime(event.ts)} ${escapeHtml(String(details).slice(0, 140))}</div>`;
  els.activity.prepend(node);
}

function renderApprovals() {
  if (state.approvals.size === 0) {
    els.approvals.className = "approval-list empty";
    els.approvals.textContent = "нет запросов";
    return;
  }
  els.approvals.className = "approval-list";
  els.approvals.innerHTML = "";
  for (const approval of state.approvals.values()) {
    const node = document.createElement("div");
    node.className = "approval";
    node.innerHTML = `
      <div>${escapeHtml(approval.description || "нужно разрешение")}</div>
      <div class="approval-command">${escapeHtml(approval.command || "")}</div>
      <div class="approval-actions">
        <button data-decision="once">Один раз</button>
        <button data-decision="session">Сессия</button>
        <button data-decision="always">Всегда</button>
        <button data-decision="deny">Отказать</button>
      </div>
    `;
    for (const btn of node.querySelectorAll("button")) {
      btn.addEventListener("click", () => sendApproval(approval.approvalId, btn.dataset.decision));
    }
    els.approvals.appendChild(node);
  }
}

async function sendApproval(approvalId, decision) {
  if (!state.runId) return;
  await api(`/api/runs/${state.runId}/approval`, {
    method: "POST",
    body: JSON.stringify({ approvalId, decision }),
  });
  state.approvals.delete(approvalId);
  renderApprovals();
}

async function inspectRun(runId) {
  const data = await api(`/api/runs/${runId}`);
  const run = data.run;
  state.selectedRunId = runId;
  renderRuns();
  els.activity.className = "activity-list";
  els.activity.innerHTML = "";
  for (const event of (run.events || []).slice(-80).reverse()) {
    addActivity(event);
  }
  els.activeMeta.textContent = `${run.profile} · ${statusLabel(run.status)} · ${run.eventCount || 0} событий`;
}

async function inspectSnapshot(snapshotId) {
  const data = await api(`/api/snapshots/${snapshotId}`);
  const snapshot = data.snapshot;
  els.activity.className = "activity-list";
  els.activity.innerHTML = "";
  addActivity({ type: "snapshot.opened", text: data.path, ts: Date.now() });
  addActivity({ type: "snapshot.health", text: `agents=${snapshot.health?.agents?.length || 0}, legacy=${snapshot.health?.forbiddenProcesses?.length || 0}`, ts: Date.now() });
  addActivity({ type: "snapshot.audit", text: `ok=${Boolean(snapshot.audit?.ok)}, skillRiskRefs=${Object.values(snapshot.skillRisks?.totals || {}).reduce((sum, value) => sum + value, 0)}`, ts: Date.now() });
  els.activeMeta.textContent = `${snapshotId} · snapshot`;
}

function connectEvents(runId, sender = null) {
  if (state.eventSource) state.eventSource.close();
  const conversationKey = activeConversationKey();
  const boundAgent = state.active;
  const boundGroupId = state.activeGroupId;
  state.eventSource = new EventSource(`/api/runs/${runId}/events`);
  let assistantNode = null;
  let typingNode = addTyping();
  let assistantBuffer = "";
  if (sender) {
    els.activeMeta.textContent = `${sender.name} печатает…`;
    els.activeMeta.classList.add("typing");
  } else {
    setActiveTyping(true);
  }
  closeStatusGroup();

  const clearTyping = () => {
    if (typingNode) {
      removeTyping(typingNode);
      typingNode = null;
    }
    if (state.activeGroupId) updateActive();
    else setActiveTyping(false);
  };

  state.eventSource.onmessage = (message) => {
    const event = JSON.parse(message.data);
    addActivity(event);
    if (activeConversationKey() !== conversationKey) {
      if (event.type === "run.completed" || event.type === "run.failed" || event.type === "run.exited") {
        loadRuns().catch(() => {});
      }
      return;
    }

    if (event.type === "message.delta") {
      assistantBuffer += event.delta || "";
      if (!assistantNode) {
        clearTyping();
        closeStatusGroup();
        assistantNode = addMessage("assistant", "", "", sender);
      }
      setMessageText(assistantNode, assistantBuffer);
    }

    if (event.type === "run.started" && event.sessionId && !boundGroupId) {
      state.activeChatId = event.sessionId;
      state.activeChatByAgent[boundAgent] = event.sessionId;
      renderAgentChats();
    }

    if (event.type === "message.attachment" && event.attachment) {
      clearTyping();
      closeStatusGroup();
      addAttachment("assistant", event.attachment, sender);
    }

    if (event.type === "approval.requested") {
      state.approvals.set(event.approvalId, event);
      renderApprovals();
      addInlineEvent(event);
    }

    if (event.type === "monitor.warning") {
      addMessage("assistant", `Мониторинг: ${event.warning}`, "warning");
      loadHealth().catch(() => {});
      loadRuns().catch(() => {});
      loadDiagnostics().catch(() => {});
    }

    if (event.type === "tool.event" || event.type === "toolsets.filtered" || event.type === "agent.ready") {
      addInlineEvent(event);
    }

    if (event.type === "run.completed") {
      clearTyping();
      closeStatusGroup();
      if (!assistantNode || !assistantBuffer.trim()) {
        renderRichAssistant(event.output || "Готово.", sender);
      } else {
        renderRichAssistant(assistantBuffer, sender, assistantNode);
      }
      finishRun("готово");
      loadHealth().catch(() => {});
      loadRuns().catch(() => {});
      if (activeConversationKey() === conversationKey) loadAgentChats({ refreshMessages: false }).catch(() => {});
    }

    if (event.type === "run.failed") {
      clearTyping();
      closeStatusGroup();
      addMessage("assistant", event.error || "Ошибка запуска", "error");
      finishRun("ошибка");
      loadHealth().catch(() => {});
      loadRuns().catch(() => {});
    }

    if (event.type === "run.exited") {
      clearTyping();
      closeStatusGroup();
      finishRun(statusLabel(event.status) || "завершен");
      loadHealth().catch(() => {});
      loadRuns().catch(() => {});
    }
  };

  state.eventSource.onerror = () => {
    clearTyping();
    closeStatusGroup();
    finishRun("соединение закрыто");
  };
}

function finishRun() {
  els.send.disabled = false;
  if (els.stopRun) els.stopRun.disabled = true;
  if (state.activeGroupId) updateActive();
  else setActiveTyping(false);
}

async function startAgentRun(rawMessage, attachments = [], targetId = null) {
  const message = String(rawMessage || "").trim();
  if (!message && !attachments.length) return;
  const target = targetId || state.active;
  state.currentResponder = state.activeGroupId ? state.agents.find((a) => a.id === target) || null : null;
  els.send.disabled = true;
  try {
    const preflight = await api(`/api/agents/${target}/preflight`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    state.promptRouter = preflight.routing;
    renderPromptRouter();
    loadPreflights().catch(() => {});
    if (!preflight.ok) {
      const failed = preflight.checks
        .filter((check) => !check.ok && check.blocking !== false)
        .map((check) => check.failLabel || check.label)
        .join("; ");
      const risk = preflight.promptRisk?.blockers?.length
        ? ` Риск: ${preflight.promptRisk.blockers.join(", ")}. Режим: ${modeLabel(preflight.promptRisk.suggestedMode)}.`
        : "";
      const roleRisk = preflight.roleRisk?.blockers?.length
        ? ` Не та роль: ${preflight.roleRisk.blockers.join(", ")}.`
        : "";
      addMessage("assistant", `Предпроверка остановила запуск: ${failed}.${risk}${roleRisk}`, "warning");
      els.send.disabled = false;
      return;
    }
  } catch (error) {
    addMessage("assistant", error.message, "error");
    els.send.disabled = false;
    return;
  }

  for (const att of attachments) addAttachment("user", att);
  if (message) addMessage("user", message);
  if (els.stopRun) els.stopRun.disabled = false;
  state.approvals.clear();
  renderApprovals();
  els.activity.className = "activity-list empty";
  els.activity.textContent = "старт";

  try {
    const sourceChat = getActiveChat();
    const sourceSessionId = sourceChat?.fileExists ? sourceChat.id : "";
    if (sourceSessionId) {
      addInlineEvent({
        type: "session.context",
        ts: Date.now(),
        status: `контекст из ${sourceChat.displayName || sourceSessionId} · ${sourceSessionId}`,
      });
    }
    const run = await api("/api/runs", {
      method: "POST",
      body: JSON.stringify({
        profile: target,
        message,
        attachments,
        toolMode: els.toolMode ? els.toolMode.value : "focused",
        sourceSessionId,
      }),
    });
    state.runId = run.runId;
    state.selectedRunId = run.runId;
    connectEvents(run.runId, state.currentResponder);
    loadHealth().catch(() => {});
    loadRuns().catch(() => {});
    loadDiagnostics().catch(() => {});
  } catch (error) {
    addMessage("assistant", error.message, "error");
    finishRun();
  }
}

async function submitPrompt(event) {
  event.preventDefault();
  const message = els.prompt.value;
  const pending = state.pendingAttachments.slice();
  if (!message.trim() && !pending.length) return;
  els.send.disabled = true;
  let uploaded = [];
  try {
    uploaded = await uploadPending(pending);
  } catch (error) {
    addMessage("assistant", `Не удалось загрузить вложение: ${error.message}`, "error");
    els.send.disabled = false;
    return;
  }
  els.prompt.value = "";
  els.prompt.style.height = "auto";
  clearPendingAttachments();
  hideMentionPopup();
  updateComposerButtons();

  if (state.activeGroupId) {
    const target = resolveMention(message);
    if (!target) {
      if (message.trim()) addMessage("user", message);
      const example = (activeGroup()?.members || [])
        .map((id) => state.agents.find((a) => a.id === id)?.name)
        .filter(Boolean)[0];
      addInlineEvent({ type: "group", ts: Date.now(), status: `Укажи получателя через @имя${example ? ` — например, @${example}` : ""}` });
      els.send.disabled = false;
      return;
    }
    await startAgentRun(message, uploaded, target.id);
    return;
  }
  await startAgentRun(message, uploaded);
}

function resolveMention(text) {
  const group = activeGroup();
  if (!group) return null;
  const lower = String(text).toLowerCase();
  let best = null;
  for (const id of group.members) {
    const agent = state.agents.find((a) => a.id === id);
    if (!agent) continue;
    if (lower.includes(`@${agent.name.toLowerCase()}`)) {
      if (!best || agent.name.length > best.name.length) best = agent;
    }
  }
  return best;
}

function hideMentionPopup() {
  els.mentionPopup.hidden = true;
  state.mentionAt = -1;
}

function updateMentionPopup() {
  if (!state.activeGroupId) {
    hideMentionPopup();
    return;
  }
  const value = els.prompt.value;
  const caret = els.prompt.selectionStart ?? value.length;
  const before = value.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1 || (at > 0 && !/\s/.test(before[at - 1]))) {
    hideMentionPopup();
    return;
  }
  const query = before.slice(at + 1).toLowerCase();
  const group = activeGroup();
  const members = (group?.members || [])
    .map((id) => state.agents.find((a) => a.id === id))
    .filter(Boolean)
    .filter((a) => a.name.toLowerCase().startsWith(query));
  if (!members.length) {
    hideMentionPopup();
    return;
  }
  state.mentionAt = at;
  els.mentionPopup.innerHTML = members
    .map(
      (a, i) =>
        `<div class="mention-item${i === 0 ? " active" : ""}" data-id="${escapeHtml(a.id)}">${memberAvatarMarkup(a)}<span class="mi-name">${escapeHtml(a.name)}</span></div>`,
    )
    .join("");
  for (const item of els.mentionPopup.querySelectorAll(".mention-item")) {
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      insertMention(item.dataset.id);
    });
  }
  els.mentionPopup.hidden = false;
}

function insertMention(id) {
  const agent = state.agents.find((a) => a.id === id);
  if (!agent || state.mentionAt < 0) return;
  const value = els.prompt.value;
  const caret = els.prompt.selectionStart ?? value.length;
  els.prompt.value = `${value.slice(0, state.mentionAt)}@${agent.name} ${value.slice(caret)}`;
  const pos = state.mentionAt + agent.name.length + 2;
  hideMentionPopup();
  els.prompt.focus();
  els.prompt.setSelectionRange(pos, pos);
  updateComposerButtons();
  autoGrowPrompt();
}

async function previewPrompt() {
  const message = els.prompt.value.trim();
  if (!message) return;
  els.previewPrompt.disabled = true;
  try {
    const preflight = await api(`/api/agents/${state.active}/preflight`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    state.promptRouter = preflight.routing;
    renderPromptRouter();
    loadPreflights().catch(() => {});
    const failed = preflight.checks
      .filter((check) => !check.ok && check.blocking !== false)
      .map((check) => check.failLabel || check.label);
    const hits = preflight.promptRisk?.hits?.length ? preflight.promptRisk.hits.join(", ") : "нет";
    const blockers = preflight.promptRisk?.blockers?.length ? preflight.promptRisk.blockers.join(", ") : "нет";
    const roleBlockers = preflight.roleRisk?.blockers?.length ? preflight.roleRisk.blockers.join(", ") : "нет";
    const status = preflight.ok ? "ок" : "остановлено";
    const recommendation = preflight.routing?.recommended
      ? `${preflight.routing.recommended.name} (${preflight.routing.recommended.id})`
      : "нет";
    addActivity({
      type: "preflight.preview",
      text: `${state.active}: ${status}; агент=${recommendation}; риск=${hits}; блокеры=${blockers}; роль=${roleBlockers}; режим=${modeLabel(preflight.promptRisk?.suggestedMode || "quick")}`,
      ts: Date.now(),
    });
    if (failed.length) addMessage("assistant", `Предпроверка: ${failed.join("; ")}`, "warning");
    else addMessage("assistant", `Предпроверка ок. Рекомендованный агент: ${recommendation}. Риск: ${hits}. Роль: ${roleBlockers}. Режим: ${modeLabel(preflight.promptRisk?.suggestedMode || "quick")}.`);
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.previewPrompt.disabled = false;
  }
}

async function stopRun() {
  if (!state.runId) return;
  await api(`/api/runs/${state.runId}/stop`, { method: "POST", body: "{}" });
  finishRun("остановка");
  loadHealth().catch(() => {});
  loadRuns().catch(() => {});
  loadDiagnostics().catch(() => {});
}

async function resetSessions() {
  const agent = state.agents.find((item) => item.id === state.active);
  if (!agent) return;
  const ok = window.confirm(`Архивировать активные web/Telegram sessions для ${agent.name}? История уйдет в archive, gateway не будет перезапущен.`);
  if (!ok) return;
  els.resetSessions.disabled = true;
  try {
    const result = await api(`/api/agents/${state.active}/archive-sessions`, { method: "POST", body: "{}" });
    addActivity({ type: "sessions.archive", text: result.archive || result.sessions, ts: Date.now() });
    await loadAgents();
    await loadHealth();
    await loadRuns();
    await loadDiagnostics();
    await loadAgentChats();
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.resetSessions.disabled = false;
  }
}

async function createSnapshot() {
  els.snapshot.disabled = true;
  try {
    const result = await api("/api/snapshots", { method: "POST", body: "{}" });
    addActivity({ type: "snapshot.saved", text: result.path, ts: Date.now() });
    await loadSnapshots();
    await loadMaintenance();
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.snapshot.disabled = false;
  }
}

async function pruneHistory() {
  els.pruneHistory.disabled = true;
  try {
    const result = await api("/api/actions/prune-history", { method: "POST", body: "{}" });
    addActivity({ type: "history.pruned", text: `runs=${result.runs.removed.length}, snapshots=${result.snapshots.removed.length}, approvals=${result.approvals.removed.length}`, ts: Date.now() });
    await loadRuns();
    await loadSnapshots();
    await loadMaintenance();
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.pruneHistory.disabled = false;
  }
}

async function runSelfTest() {
  els.runSelfTest.disabled = true;
  try {
    await loadSelfTest();
    await loadInventory();
    addActivity({ type: "self-test", text: `ok=${state.selfTest.ok}, checks=${state.selfTest.checks.length}`, ts: Date.now() });
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.runSelfTest.disabled = false;
  }
}

async function exportStateToActivity() {
  const data = await api("/api/export");
  addActivity({
    type: "state.export",
    text: `audit=${data.audit.ok}, agents=${data.health.agents.length}, models=${data.modelMatrix.models.length}, runs=${data.runs.length}, snapshots=${data.snapshots.length}`,
    ts: Date.now(),
  });
}

async function saveBaseline() {
  const result = await api("/api/baseline", { method: "POST", body: "{}" });
  state.baseline = result.drift;
  renderBaseline();
  addActivity({ type: "baseline.saved", text: result.path, ts: Date.now() });
}

async function cleanupLegacy() {
  els.cleanupLegacy.disabled = true;
  try {
    const result = await api("/api/actions/cleanup-legacy", { method: "POST", body: "{}" });
    addActivity({ type: "legacy.cleanup", text: `killed=${result.killedPids.length}, after=${result.after.length}`, ts: Date.now() });
    await loadHealth();
    await loadAudit();
    await loadDiagnostics();
  } catch (error) {
    addMessage("assistant", error.message, "error");
  } finally {
    els.cleanupLegacy.disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(n) {
  if (!n) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fileKind(file) {
  const t = file.type || "";
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

function kindGlyph(kind) {
  if (kind === "video") {
    return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M4 5h11a2 2 0 012 2v2.5l4-2.5v10l-4-2.5V17a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>';
  }
  if (kind === "audio") {
    return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zm7 9a7 7 0 01-6 6.93V22h-2v-3.07A7 7 0 015 12h2a5 5 0 0010 0h2z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V9h5.5L13 3.5z"/></svg>';
}

async function uploadFile(file) {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name || "file"),
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).attachment;
}

async function uploadPending(items) {
  const out = [];
  for (const it of items) out.push(await uploadFile(it.file));
  return out;
}

function addPendingFiles(fileList) {
  for (const file of fileList) {
    state.pendingAttachments.push({
      file,
      kind: fileKind(file),
      previewUrl: (file.type || "").startsWith("image/") ? URL.createObjectURL(file) : "",
    });
  }
  renderAttachPreview();
  updateComposerButtons();
}

function removePending(index) {
  const it = state.pendingAttachments[index];
  if (it?.previewUrl) URL.revokeObjectURL(it.previewUrl);
  state.pendingAttachments.splice(index, 1);
  renderAttachPreview();
  updateComposerButtons();
}

function clearPendingAttachments() {
  for (const it of state.pendingAttachments) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
  state.pendingAttachments = [];
  renderAttachPreview();
}

function renderAttachPreview() {
  const items = state.pendingAttachments;
  els.attachPreview.hidden = items.length === 0;
  els.attachPreview.innerHTML = items
    .map((it, i) => {
      const thumb = it.previewUrl
        ? `<img src="${it.previewUrl}" alt="" />`
        : `<span class="chip-ic">${kindGlyph(it.kind)}</span>`;
      return `<div class="attach-chip">${thumb}<span class="chip-name">${escapeHtml(it.file.name || it.kind)}</span><button type="button" class="chip-x" data-remove="${i}" aria-label="Убрать">×</button></div>`;
    })
    .join("");
  for (const btn of els.attachPreview.querySelectorAll("[data-remove]")) {
    btn.addEventListener("click", () => removePending(Number(btn.dataset.remove)));
  }
}

function updateComposerButtons() {
  const hasContent = els.prompt.value.trim().length > 0 || state.pendingAttachments.length > 0;
  els.micBtn.hidden = true;
  els.send.hidden = !hasContent;
}

function attachmentMetaHTML(side) {
  return `<div class="bubble-meta">${messageTime()}${side === "out" ? '<span class="bubble-check">✓</span>' : ""}</div>`;
}

function attachmentInnerHTML(att, side) {
  const url = escapeHtml(att.url || "");
  const name = escapeHtml(att.name || "файл");
  const meta = attachmentMetaHTML(side);
  const kind = att.kind || "file";
  if (kind === "image") {
    return `<a class="media-image-wrap" href="${url}" target="_blank" rel="noopener"><img class="media-image" src="${url}" alt="${name}" loading="lazy" />${meta}</a>`;
  }
  if (kind === "video") {
    return `<video class="media-video" src="${url}" controls preload="metadata"></video>${meta}`;
  }
  return `
    <a class="file-card" href="${url}" download="${name}">
      <span class="file-ic">${kindGlyph("file")}</span>
      <span class="file-info"><span class="file-name">${name}</span><span class="file-size">${formatBytes(att.size || 0)}</span></span>
    </a>${meta}`;
}

function addAttachment(role, att, sender = null) {
  const side = bubbleSide(role);
  const kind = att.kind || "file";
  const row = document.createElement("div");
  row.className = `msg-row ${side}${sender ? " with-sender" : ""}`;
  row.dataset.side = side;
  if (sender) {
    const av = document.createElement("div");
    av.className = "row-avatar";
    av.innerHTML = memberAvatarMarkup(sender);
    row.appendChild(av);
  }
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}${kind === "image" || kind === "video" ? " media" : ""}`;
  let inner = attachmentInnerHTML(att, side);
  if (sender) {
    inner = `<div class="bubble-sender" style="color:${senderColor(sender.id)}">${escapeHtml(sender.name || sender.id)}</div>${inner}`;
  }
  bubble.innerHTML = inner;
  row.appendChild(bubble);
  els.messages.appendChild(row);
  applyGrouping();
  scrollMessages();
  return row;
}

els.composer.addEventListener("submit", submitPrompt);
els.attachBtn.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files?.length) {
    addPendingFiles(els.fileInput.files);
    els.fileInput.value = "";
  }
});
els.prompt.addEventListener("input", updateComposerButtons);
els.prompt.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (files.length) {
    event.preventDefault();
    addPendingFiles(files);
  }
});
for (const zone of [els.messages, els.composer]) {
  zone.addEventListener("dragover", (event) => event.preventDefault());
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) addPendingFiles(event.dataTransfer.files);
  });
}
updateComposerButtons();

function openActiveProfile() {
  if (state.activeGroupId) openGroupCard(state.activeGroupId);
  else if (state.active) openAgentCard(state.active);
}
els.chatHead.addEventListener("click", openActiveProfile);
els.chatHead.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openActiveProfile();
  }
});
els.cardClose.addEventListener("click", closeAgentCard);
els.cardEdit.addEventListener("click", enterCardEdit);
els.cardCancel.addEventListener("click", exitCardEdit);
els.cardSave.addEventListener("click", saveAgentCard);
els.cardPhotoBtn.addEventListener("click", () => els.cardFile.click());
els.cardFile.addEventListener("change", () => {
  const file = els.cardFile.files?.[0];
  if (!file) return;
  if (state.cardPhotoUrl) URL.revokeObjectURL(state.cardPhotoUrl);
  state.cardPhotoFile = file;
  state.cardPhotoUrl = URL.createObjectURL(file);
  els.cardFile.value = "";
  renderAgentCard();
});
els.agentCard.addEventListener("click", (event) => {
  if (event.target === els.agentCard) closeAgentCard();
});

els.settingsBtn.addEventListener("click", openSettings);
els.settingsClose.addEventListener("click", closeSettings);
els.modelSave.addEventListener("click", saveModelSettings);
els.telegramSave.addEventListener("click", saveTelegramSettings);
els.settingsPanel.addEventListener("click", (event) => {
  if (event.target === els.settingsPanel) closeSettings();
});

els.newChatBtn.addEventListener("click", openCreateGroup);
els.cgBack.addEventListener("click", () => {
  if (state.cgStep === 2) {
    state.cgStep = 1;
    showCgStep();
  } else {
    closeCreateGroup();
  }
});
els.cgNext.addEventListener("click", () => {
  if (!state.cgSelected.size) return;
  state.cgStep = 2;
  showCgStep();
});
els.cgCreate.addEventListener("click", submitCreateGroup);
els.cgName.addEventListener("input", () => {
  els.cgCreate.disabled = !els.cgName.value.trim();
  if (!state.cgPhotoUrl) renderCgPhoto();
});
els.cgPhotoBtn.addEventListener("click", () => els.cgFile.click());
els.cgFile.addEventListener("change", () => {
  const file = els.cgFile.files?.[0];
  if (!file) return;
  if (state.cgPhotoUrl) URL.revokeObjectURL(state.cgPhotoUrl);
  state.cgPhotoFile = file;
  state.cgPhotoUrl = URL.createObjectURL(file);
  els.cgFile.value = "";
  renderCgPhoto();
});
els.gcClose.addEventListener("click", closeGroupCard);
els.gcDelete.addEventListener("click", deleteGroupCard);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.settingsPanel.hidden) closeSettings();
  else if (!els.groupCard.hidden) closeGroupCard();
  else if (!els.createGroup.hidden) closeCreateGroup();
  else if (!els.agentCard.hidden) closeAgentCard();
});

function autoGrowPrompt() {
  els.prompt.style.height = "auto";
  els.prompt.style.height = `${Math.min(els.prompt.scrollHeight, 140)}px`;
}

els.prompt.addEventListener("input", autoGrowPrompt);
els.prompt.addEventListener("input", updateMentionPopup);
els.prompt.addEventListener("click", updateMentionPopup);
els.prompt.addEventListener("blur", () => setTimeout(hideMentionPopup, 150));
els.prompt.addEventListener("keydown", (event) => {
  const popupOpen = !els.mentionPopup.hidden;
  if (popupOpen && event.key === "Escape") {
    event.preventDefault();
    hideMentionPopup();
    return;
  }
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    if (popupOpen) {
      const active = els.mentionPopup.querySelector(".mention-item.active") || els.mentionPopup.querySelector(".mention-item");
      if (active) {
        event.preventDefault();
        insertMention(active.dataset.id);
        return;
      }
    }
    event.preventDefault();
    els.composer.requestSubmit();
  }
});

function setView(view) {
  state.view = view;
  els.app.classList.toggle("mode-control", view === "control");
  els.app.classList.toggle("mode-chats", view === "chats");
  els.app.classList.toggle("mode-docs", view === "docs");
  els.brandTitle.textContent = view === "docs" ? "Документы" : "Агенты";
  for (const item of document.querySelectorAll(".side-nav-item")) {
    item.classList.toggle("active", item.dataset.view === view);
  }
  els.newChatBtn.hidden = view !== "chats";
  els.newDocBtn.hidden = view !== "docs";
  if (view === "control") loadControlPanel().catch((error) => {
    state.controlMessage = `Не удалось загрузить панель: ${error.message}`;
    renderControlPanel();
  });
  if (view === "docs") loadDocs().catch((error) => addMessage("assistant", `Не удалось загрузить документы: ${error.message}`, "error"));
}

for (const item of document.querySelectorAll(".side-nav-item")) {
  item.addEventListener("click", () => setView(item.dataset.view));
}

els.newDocBtn.addEventListener("click", () => createDoc().catch((error) => addMessage("assistant", `Не удалось создать страницу: ${error.message}`, "error")));
els.docsEmptyNew.addEventListener("click", () => createDoc().catch((error) => addMessage("assistant", `Не удалось создать страницу: ${error.message}`, "error")));
els.docChild.addEventListener("click", () => createDoc(state.activeDocId).catch((error) => addMessage("assistant", `Не удалось создать страницу: ${error.message}`, "error")));
els.docDelete.addEventListener("click", () => deleteActiveDoc().catch((error) => addMessage("assistant", `Не удалось удалить страницу: ${error.message}`, "error")));
els.docEditToggle.addEventListener("click", () => {
  state.docEditing = !state.docEditing;
  renderActiveDoc();
  if (state.docEditing) els.docBody.focus();
});
els.docTitle.addEventListener("input", scheduleDocSave);
els.docBody.addEventListener("input", scheduleDocSave);
els.restartAllGateways.addEventListener("click", () => restartAllGateways().catch((error) => {
  state.controlMessage = `Не удалось перезапустить gateway: ${error.message}`;
  renderControlPanel();
}));
els.downloadDiagnostics.addEventListener("click", () => downloadDiagnosticsBundle().catch((error) => {
  state.controlMessage = `Не удалось скачать диагностику: ${error.message}`;
  renderControlPanel();
}));

async function refreshSidebar() {
  try {
    const [groupsData, agentsData] = await Promise.all([api("/api/groups"), api("/api/agents")]);
    state.groups = groupsData.groups || [];
    state.agents = agentsData.agents || [];
    renderAgents();
    if (!state.activeGroupId && !els.activeMeta.classList.contains("typing")) {
      updateContextGauge(state.agents.find((a) => a.id === state.active));
    }
  } catch {
    // Silent: keep last known state until the next tick.
  }
}

setInterval(refreshSidebar, 8000);

(() => {
  const SIDEBAR_MIN = 260;
  const SIDEBAR_MAX = 540;
  const MAIN_MIN = 380;
  const sidebar = document.querySelector(".agent-sidebar");
  const resizer = document.querySelector("#sidebarResizer");
  const app = document.querySelector("#app");
  if (!sidebar || !resizer || !app) return;

  const maxWidth = () => Math.min(SIDEBAR_MAX, window.innerWidth - MAIN_MIN);
  const setWidth = (value) => {
    const width = Math.max(SIDEBAR_MIN, Math.min(maxWidth(), Math.round(value)));
    document.documentElement.style.setProperty("--sidebar-w", `${width}px`);
    return width;
  };

  const saved = Number(localStorage.getItem("sidebar-w"));
  if (saved) setWidth(saved);

  let startX = 0;
  let startW = 0;
  const onMove = (event) => setWidth(startW + (event.clientX - startX));
  const onUp = (event) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    app.classList.remove("resizing");
    resizer.classList.remove("dragging");
    if (resizer.hasPointerCapture?.(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    localStorage.setItem("sidebar-w", String(Math.round(sidebar.getBoundingClientRect().width)));
  };
  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startX = event.clientX;
    startW = sidebar.getBoundingClientRect().width;
    app.classList.add("resizing");
    resizer.classList.add("dragging");
    resizer.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  resizer.addEventListener("dblclick", () => {
    document.documentElement.style.removeProperty("--sidebar-w");
    localStorage.removeItem("sidebar-w");
  });
  window.addEventListener("resize", () => {
    const current = sidebar.getBoundingClientRect().width;
    if (current > maxWidth()) setWidth(current);
  });
})();

loadGroups()
  .catch(() => {})
  .finally(() => loadAgents().catch((error) => addMessage("assistant", error.message, "error")))
  .finally(() => setView("control"));
