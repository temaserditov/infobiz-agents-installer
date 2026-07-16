import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || process.env.WEB_SHELL_HOST || "127.0.0.1";
const WEB_SHELL_ACCESS_TOKEN = String(process.env.WEB_SHELL_ACCESS_TOKEN || "").trim();
const LOOPBACK_BIND_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
if (!WEB_SHELL_ACCESS_TOKEN && !LOOPBACK_BIND_HOSTS.has(String(HOST).trim().toLowerCase())) {
  throw new Error("WEB_SHELL_ACCESS_TOKEN is required when WebShell listens outside loopback");
}
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/tmp";
const LOCAL_BIN = join(HOME_DIR, ".local", "bin");
const LAUNCH_AGENTS_DIR = join(HOME_DIR, "Library", "LaunchAgents");
const HERMES_ROOT = process.env.HERMES_ROOT || join(HOME_DIR, ".hermes");
const HERMES_AGENT_ROOT = process.env.HERMES_AGENT_ROOT || join(HERMES_ROOT, "hermes-agent");
const HERMES_PYTHON = process.env.HERMES_PYTHON || join(HERMES_AGENT_ROOT, "venv", "bin", "python3");
const HERMES_WORKSPACES_ROOT = process.env.HERMES_WORKSPACES_ROOT || join(HOME_DIR, ".hermes-workspaces");
const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE || join(HOME_DIR, "InfobizAgents", "workspace");
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || join(HOME_DIR, "InfobizAgents", "obsidian-vault");
const INSTALL_ROOT = process.env.INSTALL_ROOT || resolve(join(__dirname, ".."));
const RUNS_DIR = join(__dirname, "runs");
const APPROVALS_DIR = join(__dirname, "approvals");
const SNAPSHOTS_DIR = join(__dirname, "snapshots");
const PREFLIGHTS_DIR = join(__dirname, "preflights");
const UPLOADS_DIR = join(__dirname, "uploads");
const BASELINE_PATH = join(__dirname, "baseline.json");
const OVERRIDES_PATH = join(__dirname, "agent-overrides.json");
const GROUPS_PATH = join(__dirname, "groups.json");
const DOCS_PATH = join(__dirname, "docs.json");
const PUBLIC_AVATARS_DIR = join(__dirname, "public", "assets", "avatars");

mkdirSync(RUNS_DIR, { recursive: true });
mkdirSync(APPROVALS_DIR, { recursive: true });
mkdirSync(SNAPSHOTS_DIR, { recursive: true });
mkdirSync(PREFLIGHTS_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

const runs = new Map();

const ALL_PROFILE_ORDER = ["default", "marketer", "copywriter", "designer", "tech"];
const PROFILE_ALLOW = new Set(
  String(process.env.AGENT_PROFILE_ALLOW || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const PROFILE_ORDER = PROFILE_ALLOW.size
  ? ALL_PROFILE_ORDER.filter((id) => PROFILE_ALLOW.has(id))
  : ALL_PROFILE_ORDER;
const BLOAT_TOKEN_LIMIT = 20_000;
const LONG_RUN_MS = 120_000;
const ACTIVE_GATEWAY_TURN_MS = Number(process.env.INFOBIZ_ACTIVE_GATEWAY_TURN_MS || 5 * 60 * 1000);
const FORBIDDEN_PATTERNS = [
  join(HOME_DIR, ".openclaw"),
  "agent-browser-darwin",
  "remote-debugging-port=9222",
  "open-design",
  "openclaw",
];
const RUN_HISTORY_LIMIT = 100;
const SNAPSHOT_HISTORY_LIMIT = 50;
const PREFLIGHT_HISTORY_LIMIT = 120;
const CHAT_HISTORY_LIMIT = 20;
const CHAT_MESSAGE_LIMIT = 50;
const CHAT_MESSAGE_MAX_CHARS = 6000;
const RUN_HISTORY_MESSAGE_LIMIT = 14;
const RUN_HISTORY_TOTAL_CHARS = 24_000;
const RUN_HISTORY_MESSAGE_CHARS = 4_000;
const MAX_WEB_PROMPT_CHARS = 50_000;
const MAX_UPLOAD_FILES = 120;
const MAX_UPLOAD_TOTAL_BYTES = 500 * 1024 * 1024;
const OPENAI_CODEX_MODEL_OPTIONS = (process.env.INFOBIZ_MODEL_OPTIONS || "gpt-5.6-sol,gpt-5.6-sol-pro,gpt-5.6-terra,gpt-5.6-terra-pro,gpt-5.6-luna,gpt-5.6-luna-pro,gpt-5.5,gpt-5.4,gpt-5.4-mini,gpt-5.3-codex")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const OPENAI_CODEX_MODEL_FALLBACK = process.env.INFOBIZ_MODEL_FALLBACK || "gpt-5.4-mini";
const MODEL_DISCOVERY_TTL_MS = 60_000;
const MODEL_PROBE_TTL_MS = 10 * 60_000;
let modelDiscoveryCache = { at: 0, models: [] };
const modelProbeCache = new Map();
const GROQ_STT_MODEL_OPTIONS = (process.env.INFOBIZ_STT_GROQ_MODELS || "whisper-large-v3-turbo,whisper-large-v3,distil-whisper-large-v3-en")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const GROQ_STT_MODEL_FALLBACK = process.env.INFOBIZ_STT_GROQ_FALLBACK || GROQ_STT_MODEL_OPTIONS[0] || "whisper-large-v3-turbo";
const STT_PROVIDER_OPTIONS = [
  { id: "local", label: "Hermes", description: "Родной speech-to-text без API-ключа" },
  { id: "groq", label: "Groq", description: "Groq Whisper API через ключ gsk_..." },
];
const PROFILE_DISABLED_TOOLSETS = ["browser", "chatplace", "cronjob", "delegation", "kanban", "memory", "session_search", "todo", "tts"];
const WEB_RUNTIME_FORBIDDEN_TOOLSETS = [...new Set([...PROFILE_DISABLED_TOOLSETS, "code_execution", "file", "terminal"])];
const CONTEXT_BLOAT_PATHS = [
  join(HERMES_WORKSPACES_ROOT, "assistant", "projects", "open-design"),
  join(HERMES_WORKSPACES_ROOT, "assistant", "projects", "chatplace-bot"),
  join(HERMES_WORKSPACES_ROOT, "assistant", "scripts", "kie-media.js"),
  join(HERMES_WORKSPACES_ROOT, "assistant", "scripts", "kie-image"),
  join(HERMES_WORKSPACES_ROOT, "assistant", "scripts", "kie-video"),
  join(HERMES_WORKSPACES_ROOT, "assistant", "scripts", "openclaw_stuck_watchdog.py"),
  ...PROFILE_ORDER.filter((id) => id !== "default").map((id) => join(HERMES_WORKSPACES_ROOT, id, ".backups")),
  ...PROFILE_ORDER.filter((id) => id !== "default").map((id) => join(HERMES_WORKSPACES_ROOT, id, ".openclaw")),
  ...PROFILE_ORDER.filter((id) => id !== "default").map((id) => join(profileDir(id), "home", ".openclaw")),
  ...PROFILE_ORDER.filter((id) => id !== "default").map((id) => join(profileDir(id), "home", ".codex", ".tmp", "plugins")),
];
const RULE_GUARDRAILS = [
  { id: "trigger", label: "Telegram trigger rule" },
  { id: "lazy", label: "Lazy context rule" },
  { id: "anti-bloat", label: "Anti-bloat task rule" },
  { id: "openclaw-isolation", label: "OpenClaw isolation rule" },
];
const RULE_RISK_PATTERNS = [
  { id: "legacy", label: "legacy/OpenClaw/browser reference", pattern: /openclaw|agent-browser|remote-debugging-port=9222|open-design|close-loop/i },
  { id: "eager-tools", label: "eager tool usage instruction", pattern: /сначала[^.\n]{0,80}(проверь|прочитай|найди|открой|посмотри|search|read|inspect)|always[^.\n]{0,80}(search|inspect|read)|обязательно[^.\n]{0,80}(terminal|search_files|skill_view|execute_code)/i },
  { id: "context-bloat", label: "memory/session/history expansion", pattern: /session_search|memory|conversation history|истори[яю]|контекст|вспомни/i },
  { id: "approval-prone", label: "approval-prone command path", pattern: /curl\s+|python3\s+.*<<|open\s+-a|osascript|subprocess|shell|terminal/i },
];
const ROLE_SKILL_POLICY = {
  default: { allowed: ["external-api", "media-gen", "telegram", "personal-data", "notion", "obsidian", "shell"], discouraged: ["browser"] },
  assistant: { allowed: ["obsidian", "personal-data", "external-api", "telegram"], discouraged: ["browser", "media-gen", "shell"] },
  coordinator: { allowed: ["obsidian"], discouraged: ["browser", "media-gen", "telegram", "personal-data", "notion", "shell", "external-api"] },
  copywriter: { allowed: ["telegram", "external-api", "obsidian"], discouraged: ["browser", "media-gen", "personal-data", "shell", "notion"] },
  designer: { deferred: true, allowed: ["media-gen", "obsidian", "notion", "external-api", "shell"], discouraged: [] },
  marketer: { allowed: ["telegram", "external-api", "media-gen", "obsidian", "notion"], discouraged: ["browser", "personal-data", "shell"] },
  rop: { allowed: ["telegram", "personal-data", "external-api"], discouraged: ["browser", "media-gen", "shell", "obsidian", "notion"] },
  tech: { allowed: ["external-api", "shell"], discouraged: ["browser", "media-gen", "telegram", "personal-data", "obsidian", "notion"] },
};
const ROLE_POLICY_EXEMPTIONS = {
  assistant: {
    gmail: ["browser", "shell"],
    "google-sheet": ["shell"],
    "macos-calendar": ["shell"],
    "project-documentation": ["shell"],
    "telegram-channel-reader": ["shell"],
  },
  copywriter: { "telegram-channel-reader": ["shell"] },
  marketer: { "telegram-channel-reader": ["shell"] },
  rop: { "telegram-channel-reader": ["shell"] },
};

loadPersistedRuns();

function profileDir(profile) {
  return profile === "default" ? HERMES_ROOT : join(HERMES_ROOT, "profiles", profile);
}

function listAgents() {
  const profiles = PROFILE_ALLOW.size && !PROFILE_ALLOW.has("default")
    ? []
    : [{ id: "default", name: "Гермес", path: HERMES_ROOT }];
  const root = join(HERMES_ROOT, "profiles");
  if (existsSync(root)) {
    const dirs = new Set(
      readdirSync(root)
        .filter((name) => {
          const dir = join(root, name);
          return statSync(dir).isDirectory() && (!PROFILE_ALLOW.size || PROFILE_ALLOW.has(name));
        })
    );
    const ordered = [
      ...PROFILE_ORDER.filter((id) => id !== "default" && dirs.has(id)),
      ...[...dirs].filter((id) => !PROFILE_ORDER.includes(id)).sort(),
    ];
    for (const name of ordered) {
      const dir = join(root, name);
      profiles.push({ id: name, name: nameLabel(name), path: dir });
    }
  }
  const overrides = readOverrides();
  return profiles.map((agent) => {
    const pidFile = join(agent.path, "gateway.pid");
    let gateway = "stopped";
    if (existsSync(pidFile)) {
      const rawPid = readFileSync(pidFile, "utf8").trim();
      let pid = rawPid;
      try {
        const parsed = JSON.parse(rawPid);
        pid = parsed?.pid;
      } catch {
        pid = rawPid;
      }
      if (pid) {
        try {
          process.kill(Number(pid), 0);
          gateway = "running";
        } catch {
          gateway = "stale";
        }
      }
    }
    const override = overrides[agent.id] || {};
    const defaultAvatar = existsSync(join(PUBLIC_AVATARS_DIR, `${agent.id}.jpg`))
      ? `/assets/avatars/${agent.id}.jpg`
      : null;
    return {
      ...agent,
      name: override.name || agent.name,
      gateway,
      avatar: override.avatar || defaultAvatar,
      lastMessage: agentLastMessage(agent.id),
      context: agentContext(agent.id),
    };
  });
}

const CONTEXT_WINDOW_DEFAULT = Number(process.env.AGENT_CONTEXT_WINDOW || 200000);
const MODEL_WINDOW_OVERRIDES = (() => {
  try {
    return JSON.parse(process.env.AGENT_CONTEXT_WINDOWS || "{}");
  } catch {
    return {};
  }
})();
const MODEL_WINDOW_RULES = [
  [/gpt-5\.6|gpt-5\.5|gpt-5\.4/, 272000],
  [/gpt-5|gpt5|codex/, 256000],
  [/gpt-4\.1/, 1000000],
  [/gpt-4o|gpt-4-turbo/, 128000],
  [/gpt-3\.5/, 16000],
  [/claude/, 200000],
  [/gemini/, 1000000],
  [/deepseek/, 128000],
  [/llama/, 128000],
  [/mistral|mixtral/, 128000],
  [/qwen/, 128000],
];

function cachedCodexContextWindow(model) {
  const cache = readJson(join(HOME_DIR, ".codex", "models_cache.json"), {});
  const entries = Array.isArray(cache?.models) ? cache.models : [];
  const wanted = String(model || "").trim().toLowerCase();
  const found = entries.find((entry) => {
    const id = String(entry?.slug || entry?.id || entry?.model || "").trim().toLowerCase();
    return id === wanted;
  });
  const value = Number(found?.context_window || found?.contextWindow || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function contextWindowForModel(model) {
  const name = String(model || "").toLowerCase();
  if (!name) return CONTEXT_WINDOW_DEFAULT;
  for (const [key, value] of Object.entries(MODEL_WINDOW_OVERRIDES)) {
    if (name.includes(String(key).toLowerCase())) return Number(value) || CONTEXT_WINDOW_DEFAULT;
  }
  const codexCached = cachedCodexContextWindow(model);
  if (codexCached) return codexCached;
  for (const [pattern, value] of MODEL_WINDOW_RULES) {
    if (pattern.test(name)) return value;
  }
  return CONTEXT_WINDOW_DEFAULT;
}

function agentContext(agentId) {
  const indexPath = join(profileDir(agentId), "sessions", "sessions.json");
  const sessions = readJson(indexPath, {});
  let latest = null;
  for (const entry of Object.values(sessions || {})) {
    if (!entry || typeof entry !== "object") continue;
    const at = entry.updated_at || entry.created_at || "";
    if (!latest || String(at) > String(latest.at)) {
      latest = { at, used: Number(entry.last_prompt_tokens || entry.input_tokens || 0) };
    }
  }
  const used = latest ? latest.used : 0;
  const config = configSummary(agentId);
  const model = config.model || "";
  const window = config.contextLength || contextWindowForModel(model);
  return { used, window, percent: window ? Math.min(1, used / window) : 0, model };
}

function agentSkills(agentId) {
  const roots = [
    { scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, agentId, "skills") },
    { scope: "profile", path: join(profileDir(agentId), "skills") },
    { scope: "shared", path: join(HERMES_ROOT, "skills") },
    { scope: "bundled", path: join(HERMES_AGENT_ROOT, "skills") },
  ];
  const skills = [];
  for (const root of roots) {
    for (const skill of directSkillDirs(root.path, root.scope, agentId)) {
      const docPath = join(skill.path, existsSync(join(skill.path, "SKILL.md")) ? "SKILL.md" : "skill.md");
      skills.push({
        scope: root.scope,
        name: skill.name,
        description: skillDescription(readText(docPath, "")),
      });
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills };
}

function readOverrides() {
  const data = readJson(OVERRIDES_PATH, {});
  return data && typeof data === "object" ? data : {};
}

function writeOverrides(data) {
  atomicWriteFile(OVERRIDES_PATH, JSON.stringify(data, null, 2), "utf8");
}

function setAgentProfile(agentId, patch) {
  const overrides = readOverrides();
  const current = overrides[agentId] || {};
  if (typeof patch.name === "string") {
    const name = patch.name.trim().slice(0, 80);
    if (name) current.name = name;
    else delete current.name;
  }
  if (typeof patch.avatar === "string") {
    const avatar = patch.avatar.trim();
    if (avatar) current.avatar = avatar;
    else delete current.avatar;
  }
  if (Object.keys(current).length) overrides[agentId] = current;
  else delete overrides[agentId];
  writeOverrides(overrides);
  return current;
}

function readGroups() {
  const data = readJson(GROUPS_PATH, []);
  return Array.isArray(data) ? data : [];
}

function writeGroups(groups) {
  atomicWriteFile(GROUPS_PATH, JSON.stringify(groups, null, 2), "utf8");
}

function createGroup({ name, avatar, members }) {
  const valid = new Set(listAgents().map((a) => a.id));
  const cleanName = String(name || "").trim().slice(0, 80);
  const cleanMembers = [...new Set((Array.isArray(members) ? members : []).map(String))].filter((m) => valid.has(m));
  const cleanAvatar = typeof avatar === "string" && avatar.startsWith("/uploads/") ? avatar : "";
  if (!cleanName) throw new Error("name is required");
  if (!cleanMembers.length) throw new Error("select at least one agent");
  const group = {
    id: `grp_${randomUUID().replaceAll("-", "")}`,
    name: cleanName,
    avatar: cleanAvatar,
    members: cleanMembers,
    createdAt: new Date().toISOString(),
  };
  const groups = readGroups();
  groups.push(group);
  writeGroups(groups);
  return group;
}

function updateGroup(id, patch) {
  const groups = readGroups();
  const group = groups.find((g) => g.id === id);
  if (!group) throw new Error("group not found");
  if (typeof patch.name === "string" && patch.name.trim()) group.name = patch.name.trim().slice(0, 80);
  if (typeof patch.avatar === "string") group.avatar = patch.avatar.startsWith("/uploads/") ? patch.avatar : group.avatar;
  if (Array.isArray(patch.members)) {
    const valid = new Set(listAgents().map((a) => a.id));
    const members = [...new Set(patch.members.map(String))].filter((m) => valid.has(m));
    if (members.length) group.members = members;
  }
  writeGroups(groups);
  return group;
}

function deleteGroup(id) {
  const groups = readGroups().filter((g) => g.id !== id);
  writeGroups(groups);
  return { ok: true };
}

function readDocs() {
  const data = readJson(DOCS_PATH, []);
  return Array.isArray(data) ? data : [];
}

function writeDocs(docs) {
  atomicWriteFile(DOCS_PATH, JSON.stringify(docs, null, 2), "utf8");
}

function createDoc({ title, parentId, content, icon }) {
  const docs = readDocs();
  const siblings = docs.filter((d) => (d.parentId || null) === (parentId || null));
  const doc = {
    id: `doc_${randomUUID().replaceAll("-", "")}`,
    title: String(title || "").slice(0, 200) || "Без названия",
    icon: typeof icon === "string" ? icon.slice(0, 8) : "",
    parentId: parentId || null,
    order: siblings.length ? Math.max(...siblings.map((d) => d.order || 0)) + 1 : 0,
    content: String(content || ""),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  docs.push(doc);
  writeDocs(docs);
  return doc;
}

function updateDoc(id, patch) {
  const docs = readDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) throw new Error("doc not found");
  if (typeof patch.title === "string") doc.title = patch.title.slice(0, 200);
  if (typeof patch.content === "string") doc.content = patch.content;
  if (typeof patch.icon === "string") doc.icon = patch.icon.slice(0, 8);
  if ("parentId" in patch) doc.parentId = patch.parentId || null;
  if (typeof patch.order === "number") doc.order = patch.order;
  doc.updatedAt = new Date().toISOString();
  writeDocs(docs);
  return doc;
}

function deleteDoc(id) {
  const docs = readDocs();
  const remove = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of docs) {
      if (d.parentId && remove.has(d.parentId) && !remove.has(d.id)) {
        remove.add(d.id);
        changed = true;
      }
    }
  }
  writeDocs(docs.filter((d) => !remove.has(d.id)));
  return { ok: true, removed: [...remove] };
}

function searchDocs(query, limit = 20) {
  const q = String(query || "").trim().toLowerCase();
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  if (!q) return { query: q, results: [] };
  const results = readDocs()
    .map((doc) => {
      const title = String(doc.title || "");
      const content = String(doc.content || "");
      const haystack = `${title}\n${content}`.toLowerCase();
      const index = haystack.indexOf(q);
      if (index === -1) return null;
      const raw = `${title}\n${content}`.replace(/\s+/g, " ").trim();
      const start = Math.max(0, index - 80);
      return {
        id: doc.id,
        title: title || "Без названия",
        parentId: doc.parentId || null,
        updatedAt: doc.updatedAt || "",
        snippet: raw.slice(start, start + 220),
      };
    })
    .filter(Boolean)
    .slice(0, max);
  return { query: q, results };
}

function agentLastMessage(agentId) {
  const sessionsDir = join(profileDir(agentId), "sessions");
  if (!existsSync(sessionsDir)) return null;
  let newest = null;
  for (const name of readdirSync(sessionsDir)) {
    if (!/^session_[A-Za-z0-9_-]+\.json$/.test(name)) continue;
    const path = join(sessionsDir, name);
    const mtimeMs = statSync(path).mtimeMs;
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
  }
  if (!newest) return null;
  const session = readJson(newest.path, null);
  if (!session) return null;
  const rawMessages = Array.isArray(session.messages) ? session.messages : [];
  let last = null;
  for (let i = rawMessages.length - 1; i >= 0; i -= 1) {
    const message = rawMessages[i];
    if (!message || typeof message !== "object") continue;
    const role = String(message.role || "");
    if (role === "system" || role === "tool") continue;
    const content = String(message.content || "").trim();
    if (!content || content.startsWith("[CONTEXT COMPACTION")) continue;
    last = { role: role === "user" ? "user" : "assistant", text: content };
    break;
  }
  if (!last) return null;
  return {
    role: last.role,
    text: last.text.replace(/\s+/g, " ").trim().slice(0, 120),
    at: session.last_updated || new Date(newest.mtimeMs).toISOString(),
  };
}

function nameLabel(id) {
  const labels = {
    default: "Гермес",
    assistant: "Ассистент",
    coordinator: "Координатор",
    copywriter: "Копирайтер",
    designer: "Дизайнер",
    marketer: "Маркетолог",
    rop: "Продажник",
    tech: "Технарь",
  };
  return labels[id] || id;
}

function gatewayLabel(profile) {
  return profile === "default" ? "ai.hermes.gateway" : `ai.hermes.gateway-${profile}`;
}

function systemdGatewayService(profile) {
  return profile === "default" ? "infobiz-hermes-gateway.service" : `infobiz-hermes-gateway-${profile}.service`;
}

function readText(path, fallback = "") {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

function atomicWriteFile(path, data, options = "utf8") {
  const normalized = typeof options === "string" ? { encoding: options } : { ...options };
  if (normalized.mode === undefined && existsSync(path)) {
    normalized.mode = statSync(path).mode & 0o777;
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${String(path).split("/").at(-1)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tmp, data, normalized);
    if (normalized.mode !== undefined) chmodSync(tmp, normalized.mode);
    renameSync(tmp, path);
  } catch (error) {
    try { unlinkSync(tmp); } catch {}
    throw error;
  }
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readText(path, ""));
  } catch {
    return fallback;
  }
}

function runFile(runId) {
  return join(RUNS_DIR, `${runId}.json`);
}

function safeRun(run, { includeEvents = true } = {}) {
  const { proc, clients, watchdog, ...payload } = run;
  return {
    ...payload,
    events: includeEvents ? run.events || [] : undefined,
    eventCount: (run.events || []).length,
    clientCount: run.clients?.size || 0,
    ageMs: Date.now() - run.startedAt,
    longRunning: ["starting", "running"].includes(run.status) && Date.now() - run.startedAt > LONG_RUN_MS,
  };
}

function persistRun(run) {
  const payload = safeRun(run, { includeEvents: true });
  delete payload.clientCount;
  delete payload.ageMs;
  delete payload.longRunning;
  atomicWriteFile(runFile(run.id), JSON.stringify(payload, null, 2), "utf8");
  pruneRunHistory();
}

function pruneRunHistory() {
  pruneFiles(RUNS_DIR, (name) => name.startsWith("run_") && name.endsWith(".json"), RUN_HISTORY_LIMIT);
}

function preflightFile(id) {
  return join(PREFLIGHTS_DIR, `${id}.json`);
}

function pruneFiles(dir, predicate, limit) {
  const files = readdirSync(dir)
    .filter(predicate)
    .map((name) => {
      const path = join(dir, name);
      return { name, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const removed = [];
  for (const file of files.slice(limit)) {
    try {
      unlinkSync(file.path);
      removed.push(file.path);
    } catch {
      // Best-effort pruning; stale files are harmless.
    }
  }
  return { kept: files.slice(0, limit).map((file) => file.path), removed };
}

function loadPersistedRuns() {
  const files = readdirSync(RUNS_DIR)
    .filter((name) => name.startsWith("run_") && name.endsWith(".json"))
    .map((name) => join(RUNS_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, RUN_HISTORY_LIMIT);
  for (const file of files.reverse()) {
    const saved = readJson(file, null);
    if (!saved?.id) continue;
    const savedEvents = Array.isArray(saved.events) ? saved.events : [];
    const wasInterrupted = ["starting", "running"].includes(saved.status);
    let nextEventId = savedEvents.reduce((max, event, index) => Math.max(max, Number(event?.eventId || index + 1)), 0);
    if (wasInterrupted && savedEvents.at(-1)?.type !== "run.interrupted") {
      nextEventId += 1;
      savedEvents.push({
        ts: Date.now(),
        type: "run.interrupted",
        status: "interrupted",
        error: "WebShell restarted while the agent was working",
        eventId: nextEventId,
      });
    }
    const restoredRun = {
      ...saved,
      status: wasInterrupted ? "interrupted" : saved.status,
      events: savedEvents,
      nextEventId,
      clients: new Set(),
      proc: null,
      watchdog: null,
      approvalDir: saved.approvalDir || join(APPROVALS_DIR, saved.id),
    };
    runs.set(saved.id, restoredRun);
    if (wasInterrupted) persistRun(restoredRun);
  }
}

function readPid(path) {
  const raw = readText(path, "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.pid || null;
  } catch {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid) {
  if (!pid) return "";
  return runCommand("ps", ["-p", String(pid), "-o", "command="]).stdout.trim();
}

function launchctlGatewayRows() {
  const rows = {};
  for (const line of runCommand("launchctl", ["list"]).stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("ai.hermes.gateway")) continue;
    const parts = trimmed.split(/\s+/);
    const label = parts.at(-1);
    if (!label?.startsWith("ai.hermes.gateway")) continue;
    rows[label] = {
      raw: trimmed,
      pid: Number(parts[0]) || null,
      status: parts[1] || null,
    };
  }
  return rows;
}

function processEnvValue(pid, key) {
  if (!pid || process.platform !== "linux") return "";
  try {
    const envText = readFileSync(`/proc/${pid}/environ`, "utf8");
    const prefix = `${key}=`;
    return envText.split("\0").find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
  } catch {
    return "";
  }
}

function expectedGatewayCommandMatches(profile, command, pid = null) {
  if (!command.includes("hermes_cli.main") || !command.includes("gateway run")) return false;
  if (profile === "default") return !command.includes("--profile ");
  return command.includes(`--profile ${profile}`) || processEnvValue(pid, "HERMES_HOME") === profileDir(profile);
}

function gatewayRuntimeSummary() {
  const launchRows = launchctlGatewayRows();
  const profiles = PROFILE_ORDER.map((id) => {
    const dir = profileDir(id);
    const label = gatewayLabel(id);
    const pid = readPid(join(dir, "gateway.pid"));
    const alive = isPidAlive(pid);
    const command = alive ? processCommand(pid) : "";
    const launch = launchRows[label] || null;
    const commandMatches = alive && expectedGatewayCommandMatches(id, command, pid);
    const launchMatches = process.platform === "darwin" ? Boolean(launch?.pid && pid && Number(launch.pid) === Number(pid)) : alive;
    return {
      id,
      name: nameLabel(id),
      label,
      pid,
      alive,
      command,
      commandMatches,
      launch,
      launchMatches,
      ok: alive && commandMatches && launchMatches,
    };
  });
  return {
    ok: profiles.every((profile) => profile.ok),
    profiles,
    launchRows,
  };
}

function tailLines(path, count = 120) {
  const text = readText(path, "");
  if (!text) return "";
  return text.split(/\r?\n/).slice(-count).join("\n");
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return {
    code: result.status ?? (result.error ? 127 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, "[telegram-token]")
    .replace(/\bgsk_[A-Za-z0-9_-]{16,}\b/g, "[groq-key]")
    .replace(/\bsk-proj-[A-Za-z0-9_-]{20,}\b/g, "[openai-key]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[openai-key]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s"'<>]+/gi, "$1[redacted]")
    .replace(/((?:OPENAI_API_KEY|GROQ_API_KEY|TELEGRAM_BOT_TOKEN|WEB_SHELL_ACCESS_TOKEN|INFOBIZ_SUPPORT_TOKEN|TOKEN|SECRET|PASSWORD|AUTH|BEARER)\s*(?::|=|=>)\s*)("[^"]*"|'[^']*'|[^\s,;<>]+)/gi, "$1[redacted]")
    .replace(/(<string>\s*(?:WEB_SHELL_ACCESS_TOKEN|INFOBIZ_SUPPORT_TOKEN|TELEGRAM_BOT_TOKEN|GROQ_API_KEY)\s*<\/string>\s*<string>)[^<]*(<\/string>)/gi, "$1[redacted]$2")
    .replace(/([?&](?:token|access_token)=)[^&#\s]+/gi, "$1[redacted]");
}

function redactSensitive(value) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
        return [key, item ? "[redacted]" : item];
      }
      return [key, redactSensitive(item)];
    }));
  }
  return value;
}

function safeCommand(command, args, options = {}) {
  const result = runCommand(command, args, options);
  return {
    command: [command, ...args].join(" "),
    code: result.code,
    stdout: redactSensitiveText(result.stdout).slice(-20_000),
    stderr: redactSensitiveText(result.stderr).slice(-20_000),
  };
}

function safeTail(path, count = 220) {
  return {
    path,
    exists: existsSync(path),
    text: redactSensitiveText(tailLines(path, count)).slice(-30_000),
  };
}

function checkFile(path) {
  const exists = existsSync(path);
  return { path, exists, size: exists ? statSync(path).size : 0 };
}

function commandCheck(id, label, command, args) {
  const result = runCommand(command, args);
  return {
    id,
    label,
    ok: result.code === 0,
    code: result.code,
    stderr: result.stderr.trim().slice(0, 1000),
  };
}

function inspectProcessText() {
  return runCommand("ps", ["-axo", "pid=,ppid=,etime=,command="]).stdout;
}

function forbiddenProcesses() {
  const text = inspectProcessText();
  return text
    .split(/\r?\n/)
    .filter((line) => FORBIDDEN_PATTERNS.some((pattern) => line.toLowerCase().includes(pattern.toLowerCase())))
    .filter((line) => !line.includes(" rg ") && !line.includes("/bin/zsh -c"))
    .map((line) => line.trim())
    .filter(Boolean);
}

function forbiddenProcessPids() {
  return forbiddenProcesses()
    .map((line) => Number(line.trim().split(/\s+/, 1)[0]))
    .filter((pid) => Number.isFinite(pid) && pid > 0);
}

function openClawLaunchAgents() {
  const active = runCommand("launchctl", ["list"]).stdout
    .split(/\r?\n/)
    .filter((line) => /openclaw|open-design|agent-browser|claw/i.test(line))
    .map((line) => line.trim())
    .filter(Boolean);
  const disabledDir = join(HOME_DIR, "Library", "LaunchAgents.disabled-openclaw");
  const disabled = existsSync(disabledDir)
    ? readdirSync(disabledDir).filter((name) => name.includes("openclaw")).sort()
    : [];
  return { active, disabledDir, disabled };
}

function sessionSummary(agentId) {
  const dir = profileDir(agentId);
  const indexPath = join(dir, "sessions", "sessions.json");
  const sessions = readJson(indexPath, {});
  const entries = Object.values(sessions || {});
  let maxPromptTokens = 0;
  let totalPromptTokens = 0;
  let bloatedCount = 0;
  let latestUpdatedAt = null;
  for (const entry of entries) {
    const tokens = Number(entry.last_prompt_tokens || entry.input_tokens || 0);
    maxPromptTokens = Math.max(maxPromptTokens, tokens);
    totalPromptTokens += tokens;
    if (tokens > BLOAT_TOKEN_LIMIT) bloatedCount += 1;
    if (entry.updated_at && (!latestUpdatedAt || entry.updated_at > latestUpdatedAt)) latestUpdatedAt = entry.updated_at;
  }
  return {
    path: indexPath,
    count: entries.length,
    maxPromptTokens,
    totalPromptTokens,
    bloatedCount,
    latestUpdatedAt,
    status: bloatedCount ? "bloated" : "clean",
  };
}

function sessionFilePath(agentId, sessionId) {
  const id = String(sessionId || "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid session id");
  return join(profileDir(agentId), "sessions", `session_${id}.json`);
}

function sessionTranscriptPath(agentId, sessionId) {
  const id = String(sessionId || "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid session id");
  return join(profileDir(agentId), "sessions", `${id}.jsonl`);
}

function listAgentChats(agentId) {
  const dir = profileDir(agentId);
  const sessionsDir = join(dir, "sessions");
  if (!existsSync(sessionsDir)) return { chats: [] };
  const indexPath = join(sessionsDir, "sessions.json");
  const index = readJson(indexPath, {});
  const byId = new Map();

  for (const entry of Object.values(index || {})) {
    if (!entry?.session_id) continue;
    const legacyPath = join(sessionsDir, `session_${entry.session_id}.json`);
    const transcriptPath = join(sessionsDir, `${entry.session_id}.jsonl`);
    byId.set(entry.session_id, {
      id: entry.session_id,
      sessionKey: entry.session_key || "",
      displayName: entry.display_name || entry.origin?.chat_name || entry.session_id,
      platform: entry.platform || entry.origin?.platform || "unknown",
      chatType: entry.chat_type || entry.origin?.chat_type || "",
      updatedAt: entry.updated_at || entry.created_at || "",
      lastPromptTokens: Number(entry.last_prompt_tokens || 0),
      totalTokens: Number(entry.total_tokens || 0),
      suspended: Boolean(entry.suspended),
      freshReset: Boolean(entry.is_fresh_reset),
      fileExists: existsSync(legacyPath) || existsSync(transcriptPath),
      source: "index",
    });
  }

  const files = readdirSync(sessionsDir)
    .filter((name) => /^session_[A-Za-z0-9_-]+\.json$/.test(name) || /^[A-Za-z0-9_-]+\.jsonl$/.test(name))
    .map((name) => {
      const path = join(sessionsDir, name);
      return { name, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, CHAT_HISTORY_LIMIT);

  for (const file of files) {
    const id = file.name.replace(/^session_/, "").replace(/\.json$/, "").replace(/\.jsonl$/, "");
    if (byId.has(id)) continue;
    const session = readJson(file.path, {});
    byId.set(id, {
      id,
      sessionKey: "",
      displayName: session.platform ? `${session.platform} session` : id,
      platform: session.platform || "unknown",
      chatType: "",
      updatedAt: session.last_updated || new Date(file.mtimeMs).toISOString(),
      lastPromptTokens: 0,
      totalTokens: 0,
      suspended: false,
      freshReset: false,
      fileExists: true,
      source: "file",
    });
  }

  const chats = [...byId.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, CHAT_HISTORY_LIMIT);
  return { chats, indexPath };
}

function summarizeToolCalls(message) {
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return calls
    .map((call) => {
      const fn = call.function || {};
      const name = fn.name || call.name || call.type || "tool";
      const args = typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments || call.arguments || {});
      return `${name}${args && args !== "{}" ? `: ${args}` : ""}`;
    })
    .join("\n");
}

function compactMessageText(text) {
  return String(text || "");
}

function compactRunHistoryText(text, maxChars = RUN_HISTORY_MESSAGE_CHARS) {
  const raw = String(text || "").trim();
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n\n...[history trimmed ${raw.length - maxChars} chars]`;
}

function buildRunConversationHistory(agentId, sourceSessionId) {
  if (!sourceSessionId) return { history: [], source: null, warning: "" };
  const path = sessionFilePath(agentId, sourceSessionId);
  if (!existsSync(path)) {
    return { history: [], source: { id: sourceSessionId, path, missing: true }, warning: "source session file is missing" };
  }
  const session = readJson(path, null);
  const rawMessages = Array.isArray(session?.messages) ? session.messages : [];
  const candidates = [];
  for (const message of rawMessages) {
    if (!message || typeof message !== "object") continue;
    const role = String(message.role || "");
    if (role !== "user" && role !== "assistant") continue;
    const content = String(message.content || "").trim();
    if (!content) continue;
    if (role === "assistant" && content.startsWith("[CONTEXT COMPACTION")) continue;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length) continue;
    candidates.push({ role, content: compactRunHistoryText(content) });
  }
  const selected = [];
  let total = 0;
  for (const message of candidates.slice(-RUN_HISTORY_MESSAGE_LIMIT).reverse()) {
    const size = message.content.length;
    if (selected.length && total + size > RUN_HISTORY_TOTAL_CHARS) continue;
    selected.push(message);
    total += size;
  }
  selected.reverse();
  return {
    history: selected,
    source: {
      id: sourceSessionId,
      path,
      messageCount: rawMessages.length,
      selectedMessages: selected.length,
      selectedChars: total,
      model: session?.model || "",
      platform: session?.platform || "",
    },
    warning: selected.length ? "" : "source session has no compact user/assistant messages",
  };
}

function sessionMessages(agentId, sessionId) {
  const path = sessionFilePath(agentId, sessionId);
  const transcriptPath = sessionTranscriptPath(agentId, sessionId);
  if (!existsSync(path)) {
    if (existsSync(transcriptPath)) {
      const rows = readText(transcriptPath, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const messages = rows
        .map((message) => {
          const role = String(message.role || "assistant");
          const content = String(message.content || message.text || "");
          if (!content.trim() || role === "system") return null;
          return {
            role: role === "user" ? "user" : "assistant",
            kind: "message",
            text: compactMessageText(content),
          };
        })
        .filter(Boolean);
      const stat = statSync(transcriptPath);
      return {
        session: {
          id: sessionId,
          model: "",
          platform: "telegram",
          startedAt: "",
          updatedAt: new Date(stat.mtimeMs).toISOString(),
          messageCount: rows.length,
          shownMessages: messages.length,
          path: transcriptPath,
          missing: false,
          source: "jsonl",
        },
        messages,
      };
    }
    return {
      session: {
        id: sessionId,
        model: "",
        platform: "",
        startedAt: "",
        updatedAt: "",
        messageCount: 0,
        shownMessages: 0,
        path,
        missing: true,
      },
      messages: [],
    };
  }
  const session = readJson(path, null);
  if (!session) throw new Error("session not found");
  const rawMessages = Array.isArray(session.messages) ? session.messages : [];
  const messages = [];
  for (const message of rawMessages) {
    if (!message || typeof message !== "object") continue;
    const role = String(message.role || "assistant");
    const content = String(message.content || "");
    if (role === "system") continue;
    if (role === "assistant" && content.startsWith("[CONTEXT COMPACTION")) continue;
    if (role === "assistant" && !content.trim() && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      messages.push({
        role: "tool",
        kind: "tool_calls",
        text: compactMessageText(summarizeToolCalls(message)),
      });
      continue;
    }
    if (role === "tool") {
      messages.push({
        role: "tool",
        kind: "tool_result",
        text: compactMessageText(content),
        toolCallId: message.tool_call_id || "",
      });
      continue;
    }
    if (!content.trim()) continue;
    messages.push({
      role: role === "user" ? "user" : "assistant",
      kind: "message",
      text: compactMessageText(content),
    });
  }
  return {
    session: {
      id: sessionId,
      model: session.model || "",
      platform: session.platform || "",
      startedAt: session.session_start || "",
      updatedAt: session.last_updated || "",
      messageCount: rawMessages.length,
      shownMessages: Math.min(messages.length, CHAT_MESSAGE_LIMIT),
      path,
    },
    messages: messages.slice(-CHAT_MESSAGE_LIMIT),
  };
}

function configSummary(agentId) {
  const config = readText(join(profileDir(agentId), "config.yaml"), "");
  const disabled = [];
  const disabledMatch = config.match(/disabled_toolsets:\n((?:\s+- .+\n)+)/);
  if (disabledMatch) {
    for (const line of disabledMatch[1].split(/\r?\n/)) {
      const item = line.match(/-\s+(.+)/)?.[1]?.trim();
      if (item) disabled.push(item);
    }
  }
  const maxTurns = Number(config.match(/max_turns:\s*(\d+)/)?.[1] || 0);
  const idleMinutes = Number(config.match(/idle_minutes:\s*(\d+)/)?.[1] || 0);
  const apiMaxRetries = Number(config.match(/api_max_retries:\s*(\d+)/)?.[1] || 0);
  const provider = config.match(/^model:\n(?:.*\n){0,6}?\s+provider:\s*([^\n]+)/m)?.[1]?.trim() || config.match(/provider:\s*([^\n]+)/)?.[1]?.trim() || "";
  const model = config.match(/^model:\n\s+default:\s*([^\n]+)/m)?.[1]?.trim() || "";
  const contextLength = Number(config.match(/context_length:\s*(\d+)/)?.[1] || 0);
  return { maxTurns, idleMinutes, apiMaxRetries, provider, model, contextLength, disabledToolsets: disabled };
}

function stripYamlScalar(value) {
  return String(value || "")
    .trim()
    .replace(/\s+#.*$/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function sttConfigSummary(agentId) {
  const config = readText(join(profileDir(agentId), "config.yaml"), "");
  const block = config.match(/^stt:\s*\n((?:  .*(?:\n|$))*)/m)?.[1] || "";
  const provider = stripYamlScalar(block.match(/^  provider:\s*(.+)$/m)?.[1] || "local") || "local";
  const localModel = stripYamlScalar(block.match(/^  local:\s*\n(?:    .*(?:\n|$))*?    model:\s*(.+)$/m)?.[1] || "");
  const groqModel = stripYamlScalar(block.match(/^  groq:\s*\n(?:    .*(?:\n|$))*?    model:\s*(.+)$/m)?.[1] || "");
  return {
    provider,
    localModel,
    groqModel,
  };
}

function modelSettings(agentId) {
  const config = configSummary(agentId);
  const env = readText(envPath(agentId), "");
  const envModel = readEnvValue(env, "HERMES_INFERENCE_MODEL");
  const manualModel = readEnvValue(env, "INFOBIZ_MODEL_MANUAL_SELECTED");
  const autoModel = readEnvValue(env, "INFOBIZ_MODEL_AUTO_SELECTED");
  const current = envModel || config.model || autoModel || OPENAI_CODEX_MODEL_FALLBACK;
  return {
    ok: existsSync(profileDir(agentId)),
    profile: agentId,
    name: nameLabel(agentId),
    provider: config.provider || "openai-codex",
    current,
    model: current,
    envModel,
    autoModel,
    manualModel,
    manual: Boolean(manualModel),
    gateway: agentDiagnostics(agentId).gateway.status,
  };
}

function runChildCapture(command, args, { cwd, env, timeoutMs = 30_000, maxOutputBytes = 1_000_000 } = {}) {
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let spawnError = null;
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const append = (current, chunk) => `${current}${chunk}`.slice(-maxOutputBytes);
    child.stdout?.on("data", (chunk) => { stdout = append(stdout, chunk.toString("utf8")); });
    child.stderr?.on("data", (chunk) => { stderr = append(stderr, chunk.toString("utf8")); });
    child.on("error", (error) => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ status, signal, stdout, stderr, timedOut, error: spawnError });
    });
  });
}

async function discoverOpenAICodexModels({ force = false } = {}) {
  const now = Date.now();
  if (!force && modelDiscoveryCache.models.length && now - modelDiscoveryCache.at < MODEL_DISCOVERY_TTL_MS) {
    return modelDiscoveryCache.models;
  }
  const code = String.raw`
import json

from hermes_cli.codex_models import get_codex_model_ids

try:
    from agent.auxiliary_client import _read_codex_access_token
    token = _read_codex_access_token()
except Exception:
    token = None

print(json.dumps(get_codex_model_ids(token), ensure_ascii=True))
`;
  const result = await runChildCapture(HERMES_PYTHON, ["-c", code], {
    cwd: HERMES_AGENT_ROOT,
    env: { ...process.env, HERMES_HOME: profileDir("default") },
    timeoutMs: 15_000,
  });
  let discovered = [];
  if (result.status === 0) {
    try {
      const line = String(result.stdout || "").trim().split(/\r?\n/).at(-1) || "[]";
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed)) discovered = parsed;
    } catch {
      discovered = [];
    }
  }
  const models = [...new Set([...discovered, ...OPENAI_CODEX_MODEL_OPTIONS])]
    .map((item) => String(item || "").trim())
    .filter((item) => /^[a-z0-9][a-z0-9._-]{1,80}$/i.test(item));
  modelDiscoveryCache = { at: now, models };
  return models;
}

async function probeOpenAICodexModel(agentId, model) {
  const cacheKey = `${agentId}:${model}`;
  const cache = modelProbeCache.get(cacheKey);
  if (cache && Date.now() - cache.at < MODEL_PROBE_TTL_MS) return cache;
  const env = {
    ...process.env,
    HERMES_HOME: profileDir(agentId),
    HERMES_INFERENCE_PROVIDER: "openai-codex",
    HERMES_INFERENCE_MODEL: model,
  };
  const result = await runChildCapture(HERMES_PYTHON, [
    "-m", "hermes_cli.main", "-z", "Return exactly MODEL_OK and nothing else.",
    "--provider", "openai-codex", "--model", model, "--ignore-rules",
  ], {
    cwd: HERMES_AGENT_ROOT,
    env,
    timeoutMs: 90_000,
  });
  const output = redactSensitiveText(`${result.stdout || ""}\n${result.stderr || ""}`).trim();
  const probe = {
    at: Date.now(),
    ok: result.status === 0 && output.includes("MODEL_OK"),
    model,
    error: result.timedOut
      ? "проверка не ответила за 90 секунд"
      : result.error?.message || (result.status === 0 ? "" : output.slice(-600)),
  };
  modelProbeCache.set(cacheKey, probe);
  return probe;
}

async function modelSettingsAll() {
  const profiles = PROFILE_ORDER
    .filter((id) => existsSync(profileDir(id)))
    .map((id) => modelSettings(id));
  const options = [...new Set([
    ...await discoverOpenAICodexModels(),
    ...profiles.map((profile) => profile.model).filter(Boolean),
  ])];
  return {
    ok: true,
    provider: "openai-codex",
    options,
    fallback: OPENAI_CODEX_MODEL_FALLBACK,
    profiles,
    models: [...new Set(profiles.map((profile) => profile.model).filter(Boolean))].sort(),
  };
}

async function validateOpenAICodexModel(model) {
  const value = String(model || "").trim();
  if (!value) throw new Error("model is required");
  if (!(await discoverOpenAICodexModels()).includes(value)) {
    throw new Error(`unsupported model: ${value}`);
  }
  return value;
}

function writeConfigModel(agentId, model) {
  const configPath = join(profileDir(agentId), "config.yaml");
  const code = String.raw`
import re
import sys
import uuid
from pathlib import Path
import yaml

def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.webshell.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.chmod(0o600)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()

path = Path(sys.argv[1])
model = sys.argv[2]
data = yaml.safe_load(path.read_text(encoding="utf-8", errors="ignore") if path.exists() else "") or {}
if not isinstance(data, dict):
    data = {}
model_cfg = data.setdefault("model", {})
if not isinstance(model_cfg, dict):
    model_cfg = {}
    data["model"] = model_cfg
model_cfg["provider"] = "openai-codex"
model_cfg["default"] = model
model_cfg["base_url"] = ""
model_cfg.pop("context_length", None)
model_cfg["openai_runtime"] = "auto"
model_cfg.pop("api_mode", None)
auxiliary = data.setdefault("auxiliary", {})
if not isinstance(auxiliary, dict):
    auxiliary = {}
    data["auxiliary"] = auxiliary
title_generation = auxiliary.setdefault("title_generation", {})
if not isinstance(title_generation, dict):
    title_generation = {}
    auxiliary["title_generation"] = title_generation
title_generation["enabled"] = False
atomic_write(path, yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
`;
  const result = spawnSync(HERMES_PYTHON, ["-", configPath, model], {
    input: code,
    encoding: "utf8",
    env: { ...process.env, HERMES_HOME: profileDir(agentId) },
    cwd: HERMES_AGENT_ROOT,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Could not write config model").trim());
  }
}

async function saveModelSetting(agentId, model) {
  model = await validateOpenAICodexModel(model);
  const before = modelSettings(agentId);
  if (before.model !== model || before.envModel !== model) {
    const probe = await probeOpenAICodexModel(agentId, model);
    if (!probe.ok) {
      throw new Error(`Модель ${model} недоступна для этой авторизации${probe.error ? `: ${probe.error}` : "."}`);
    }
  }
  const path = envPath(agentId);
  let text = readText(path, "");
  text = writeEnvValue(text, "HERMES_INFERENCE_PROVIDER", "openai-codex");
  text = writeEnvValue(text, "HERMES_INFERENCE_MODEL", model);
  text = writeEnvValue(text, "INFOBIZ_MODEL_MANUAL_SELECTED", model);
  atomicWriteFile(path, text, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  writeConfigModel(agentId, model);
  let restart = { ok: false, restarted: false };
  try {
    restart = restartAgentGateway(agentId);
  } catch (error) {
    restart = { ok: false, restarted: false, error: error.message || String(error) };
  }
  return {
    ok: true,
    profile: agentId,
    name: nameLabel(agentId),
    changed: before.model !== model || before.envModel !== model,
    settings: modelSettings(agentId),
    restart,
  };
}

async function saveModelSettings(models) {
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    throw new Error("models object required");
  }
  const allowed = new Set(PROFILE_ORDER);
  const results = [];
  for (const [agentId, rawModel] of Object.entries(models)) {
    if (!allowed.has(agentId)) continue;
    const model = await validateOpenAICodexModel(rawModel);
    const before = modelSettings(agentId);
    if (before.model === model && before.envModel === model) continue;
    results.push(await saveModelSetting(agentId, model));
  }
  return { ok: true, settings: await modelSettingsAll(), results };
}

function sttProviderLabel(provider) {
  return STT_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label || provider || "Hermes";
}

function groqKeyPreview(key) {
  if (!key) return "";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function validateSttProvider(provider) {
  const value = String(provider || "local").trim().toLowerCase();
  if (value === "hermes") return "local";
  if (!STT_PROVIDER_OPTIONS.some((option) => option.id === value)) {
    throw new Error(`unsupported voice engine: ${provider}`);
  }
  return value;
}

function validateGroqApiKey(key) {
  const value = String(key || "").trim();
  if (!value) return "";
  if (!/^gsk_[A-Za-z0-9_-]{16,}$/.test(value)) {
    throw new Error("invalid Groq API key");
  }
  return value;
}

function validateGroqSttModel(model) {
  const value = String(model || GROQ_STT_MODEL_FALLBACK).trim();
  if (!value) return GROQ_STT_MODEL_FALLBACK;
  if (!GROQ_STT_MODEL_OPTIONS.includes(value)) {
    throw new Error(`unsupported Groq STT model: ${value}`);
  }
  return value;
}

function voiceSettings(agentId) {
  const env = readText(envPath(agentId), "");
  const stt = sttConfigSummary(agentId);
  const rawProvider = String(stt.provider || "local").trim().toLowerCase();
  const provider = STT_PROVIDER_OPTIONS.some((option) => option.id === rawProvider) ? rawProvider : "local";
  const groqKey = readEnvValue(env, "GROQ_API_KEY");
  const envGroqModel = readEnvValue(env, "STT_GROQ_MODEL");
  const groqModel = stt.groqModel || envGroqModel || GROQ_STT_MODEL_FALLBACK;
  const localModel = stt.localModel || "base";
  return {
    ok: existsSync(profileDir(agentId)),
    profile: agentId,
    name: nameLabel(agentId),
    provider,
    providerLabel: sttProviderLabel(provider),
    unsupportedProvider: provider === rawProvider ? "" : rawProvider,
    model: provider === "groq" ? groqModel : localModel,
    groqModel,
    localModel,
    groqConfigured: Boolean(groqKey),
    groqKeyPreview: groqKeyPreview(groqKey),
    envPath: envPath(agentId),
    gateway: agentDiagnostics(agentId).gateway.status,
  };
}

function voiceSettingsAll() {
  const profiles = PROFILE_ORDER
    .filter((id) => existsSync(profileDir(id)))
    .map((id) => voiceSettings(id));
  const providers = [...new Set(profiles.map((profile) => profile.provider))];
  return {
    ok: true,
    options: STT_PROVIDER_OPTIONS,
    groqModels: GROQ_STT_MODEL_OPTIONS,
    groqFallbackModel: GROQ_STT_MODEL_FALLBACK,
    provider: providers.length === 1 ? providers[0] : "mixed",
    providerLabel: providers.length === 1 ? sttProviderLabel(providers[0]) : "Разные",
    profiles,
    groqEnabled: profiles.filter((profile) => profile.provider === "groq").length,
    groqConfigured: profiles.filter((profile) => profile.provider === "groq" && profile.groqConfigured).length,
    total: profiles.length,
  };
}

function writeConfigStt(agentId, provider, groqModel) {
  const configPath = join(profileDir(agentId), "config.yaml");
  const code = String.raw`
import sys
import uuid
from pathlib import Path
import yaml

def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.webshell.tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        tmp.chmod(0o600)
        tmp.replace(path)
    finally:
        if tmp.exists():
            tmp.unlink()

path = Path(sys.argv[1])
provider = sys.argv[2]
groq_model = sys.argv[3]

data = yaml.safe_load(path.read_text(encoding="utf-8", errors="ignore") if path.exists() else "") or {}
if not isinstance(data, dict):
    data = {}
stt = data.setdefault("stt", {})
if not isinstance(stt, dict):
    stt = {}
    data["stt"] = stt
stt["enabled"] = True
stt["provider"] = provider
local = stt.setdefault("local", {})
if isinstance(local, dict):
    local.setdefault("model", "base")
else:
    stt["local"] = {"model": "base"}
if provider == "groq":
    groq = stt.setdefault("groq", {})
    if not isinstance(groq, dict):
        groq = {}
        stt["groq"] = groq
    groq["model"] = groq_model
atomic_write(path, yaml.safe_dump(data, allow_unicode=True, sort_keys=False))
`;
  const result = spawnSync(HERMES_PYTHON, ["-", configPath, provider, groqModel], {
    input: code,
    encoding: "utf8",
    env: { ...process.env, HERMES_HOME: profileDir(agentId) },
    cwd: HERMES_AGENT_ROOT,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Could not write STT config").trim());
  }
}

function saveVoiceSetting(agentId, { provider, groqApiKey, updateGroqApiKey = false, groqModel } = {}) {
  provider = validateSttProvider(provider);
  groqModel = validateGroqSttModel(groqModel);
  groqApiKey = validateGroqApiKey(groqApiKey);
  const before = voiceSettings(agentId);
  const path = envPath(agentId);
  let text = readText(path, "");
  if (provider === "groq") {
    if (updateGroqApiKey) {
      if (!groqApiKey) throw new Error("Groq API key is required");
      text = writeEnvValue(text, "GROQ_API_KEY", groqApiKey);
    } else if (!readEnvValue(text, "GROQ_API_KEY")) {
      throw new Error(`Вставь Groq API key для «${nameLabel(agentId)}»`);
    }
    text = writeEnvValue(text, "STT_GROQ_MODEL", groqModel);
  } else {
    // The local Hermes engine does not need the external secret. Switching
    // back to local is also the explicit way to remove the stored Groq key.
    text = deleteEnvValue(text, "GROQ_API_KEY");
  }
  text = writeEnvValue(text, "INFOBIZ_VOICE_ENGINE", provider);
  atomicWriteFile(path, text, { encoding: "utf8", mode: 0o600 });
  writeConfigStt(agentId, provider, groqModel);
  let restart = { ok: false, restarted: false };
  try {
    restart = restartAgentGateway(agentId);
  } catch (error) {
    restart = { ok: false, restarted: false, error: error.message || String(error) };
  }
  const settings = voiceSettings(agentId);
  return {
    ok: true,
    profile: agentId,
    name: nameLabel(agentId),
    changed: before.provider !== settings.provider || before.model !== settings.model || before.groqConfigured !== settings.groqConfigured,
    settings,
    restart,
  };
}

function saveVoiceSettings({ provider, groqApiKey, updateGroqApiKey = false, groqModel, agentIds = null } = {}) {
  const allowed = new Set(PROFILE_ORDER);
  const targets = (Array.isArray(agentIds) && agentIds.length ? agentIds : PROFILE_ORDER)
    .map((id) => String(id || "").trim())
    .filter((id) => allowed.has(id) && existsSync(profileDir(id)));
  const results = [];
  for (const agentId of targets) {
    const before = voiceSettings(agentId);
    const normalizedProvider = validateSttProvider(provider);
    const normalizedModel = validateGroqSttModel(groqModel);
    if (
      normalizedProvider === before.provider &&
      (normalizedProvider !== "local" || !before.groqConfigured) &&
      (normalizedProvider !== "groq" || before.groqModel === normalizedModel) &&
      (normalizedProvider !== "groq" || before.groqConfigured || updateGroqApiKey) &&
      (!updateGroqApiKey || !groqApiKey)
    ) {
      continue;
    }
    results.push(saveVoiceSetting(agentId, {
      provider: normalizedProvider,
      groqApiKey,
      updateGroqApiKey,
      groqModel: normalizedModel,
    }));
  }
  return { ok: true, settings: voiceSettingsAll(), results };
}

function listSkillNames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() && (existsSync(join(path, "SKILL.md")) || existsSync(join(path, "skill.md")));
    })
    .sort();
}

function directSkillDirs(dir, scope, profile) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name), scope, profile }))
    .filter((item) => statSync(item.path).isDirectory())
    .filter((item) => existsSync(join(item.path, "SKILL.md")) || existsSync(join(item.path, "skill.md")))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function findSkillDocs(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (name === "SKILL.md" || name === "skill.md") {
        found.push(path);
      }
    }
  };
  visit(dir);
  return found.sort();
}

function findSkillDocsPruned(dir, skipNames = new Set()) {
  if (!existsSync(dir)) return [];
  const found = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      if (skipNames.has(name)) continue;
      const path = join(current, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (name === "SKILL.md" || name === "skill.md") {
        found.push(path);
      }
    }
  };
  visit(dir);
  return found.sort();
}

function contextSurfaceSummary() {
  const dynamicBlocked = [];
  for (const id of PROFILE_ORDER) {
    const dir = profileDir(id);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.startsWith("sessions.archive-") || name.includes(".bak-") || name.startsWith(".env.bak-") || name.startsWith("state.backup")) {
        dynamicBlocked.push(join(dir, name));
      }
    }
  }
  const blockedPaths = [...CONTEXT_BLOAT_PATHS, ...dynamicBlocked].filter((path) => existsSync(path));
  const skipNames = new Set([
    ".archives",
    ".disabled-skills",
    ".disabled-shared-skills",
    ".agents",
    "content-factory-fixed",
    "node_modules",
    "projects",
    ".venv",
    "__pycache__",
  ]);
  const auditedProfiles = PROFILE_ORDER.filter((id) => !ROLE_SKILL_POLICY[id]?.deferred);
  const skillDocs = auditedProfiles.flatMap((id) => {
    const workspaceSkills = id === "default" ? [] : findSkillDocsPruned(join(HERMES_WORKSPACES_ROOT, id, "skills"), skipNames);
    const profileSkills = findSkillDocsPruned(join(profileDir(id), "skills"), skipNames);
    return [...workspaceSkills, ...profileSkills];
  }).filter((path) => !path.includes("/.codex/skills/.system/"));
  const skillDocLimit = 120;
  return {
    ok: blockedPaths.length === 0,
    blockedPaths,
    skillDocCount: skillDocs.length,
    skillDocLimit,
    auditedProfiles,
    sample: skillDocs.slice(0, 120),
  };
}

function skillPromptPolicySummary() {
  const sourcePath = join(HERMES_AGENT_ROOT, "agent", "prompt_builder.py");
  const source = readText(sourcePath, "");
  const sourceOk =
    source.includes("## Skills (lazy/on-demand)") &&
    source.includes("Proceed without loading a skill whenever the direct answer is sufficient.") &&
    !source.includes("## Skills (mandatory)") &&
    !source.includes("MUST load it with skill_view(name)");
  const staleSessions = [];
  for (const id of PROFILE_ORDER.filter((profile) => profile !== "default")) {
    const sessionsDir = join(profileDir(id), "sessions");
    if (!existsSync(sessionsDir)) continue;
    for (const name of readdirSync(sessionsDir)) {
      if (!name.startsWith("session_") || !name.endsWith(".json")) continue;
      const path = join(sessionsDir, name);
      const session = readJson(path, {});
      const prompt = String(session.system_prompt || "");
      if (prompt.includes("## Skills (mandatory)") || prompt.includes("MUST load it with skill_view(name)")) {
        staleSessions.push({ profile: id, path, sessionId: session.session_id || name });
      }
    }
  }
  return {
    ok: sourceOk && staleSessions.length === 0,
    sourcePath,
    sourceOk,
    staleSessions,
    note: "If sourceOk is true but agents still load skills eagerly, restart Hermes gateways so running Python processes load the patched prompt builder.",
  };
}

function telegramLiteRouterSummary() {
  const sourcePath = join(HERMES_AGENT_ROOT, "gateway", "run.py");
  const testPath = join(HERMES_AGENT_ROOT, "tests", "gateway", "test_telegram_lite_router.py");
  const source = readText(sourcePath, "");
  const testSource = readText(testPath, "");
  const sourceOk =
    source.includes("def _select_turn_toolsets(") &&
    source.includes("HERMES_TELEGRAM_LITE_TOOLS") &&
    source.includes("return []") &&
    source.includes("telegram lite tools: using zero-tool turn");
  const testOk =
    testSource.includes("test_simple_telegram_turns_use_zero_tools") &&
    testSource.includes("test_external_work_keeps_configured_tools") &&
    testSource.includes("test_non_telegram_or_disabled_lite_router_keeps_configured_tools");
  const sampleExpectations = [
    { prompt: "составь короткий список личных дел", expected: "lite" },
    { prompt: "перепиши это в сильный Telegram-пост", expected: "lite" },
    { prompt: "предложи концепцию обложки, картинку пока не генерируй", expected: "lite" },
    { prompt: "посмотри логи gateway почему агент тупит", expected: "full" },
    { prompt: "загрузи это в Obsidian", expected: "full" },
    { prompt: "сгенерируй картинку для обложки", expected: "full" },
  ];
  const recentLiteLogs = PROFILE_ORDER
    .filter((id) => id !== "default")
    .flatMap((id) => {
      const lines = tailLines(join(profileDir(id), "logs", "gateway.log"), 200)
        .split(/\r?\n/)
        .filter((line) => line.includes("telegram lite tools: using zero-tool turn"));
      return lines.map((line) => ({ profile: id, line }));
    })
    .slice(-20);
  return {
    ok: sourceOk && testOk,
    sourcePath,
    testPath,
    sourceOk,
    testOk,
    env: process.env.HERMES_TELEGRAM_LITE_TOOLS || "1",
    behavior: "Telegram turns use zero tool schemas unless the message explicitly asks for files/logs/terminal/web/Notion/Obsidian/image generation/diagnostics.",
    sampleExpectations,
    recentLiteLogs,
  };
}

function sessionTokenGuardSummary() {
  const sessionPath = join(HERMES_AGENT_ROOT, "gateway", "session.py");
  const runPath = join(HERMES_AGENT_ROOT, "gateway", "run.py");
  const testPath = join(HERMES_AGENT_ROOT, "tests", "gateway", "test_session.py");
  const sessionSource = readText(sessionPath, "");
  const runSource = readText(runPath, "");
  const testSource = readText(testPath, "");
  const sourceOk =
    sessionSource.includes("DEFAULT_PROMPT_TOKEN_GUARD_LIMIT = 20_000") &&
    sessionSource.includes("HERMES_SESSION_MAX_PROMPT_TOKENS") &&
    sessionSource.includes("Session prompt-token guard reset") &&
    runSource.includes("prompt_token_guard");
  const testOk =
    testSource.includes("class TestSessionStorePromptTokenGuard") &&
    testSource.includes("test_bloated_session_rotates_before_next_turn") &&
    testSource.includes("test_guard_does_not_reset_sessions_with_active_processes");
  return {
    ok: sourceOk && testOk,
    limit: Number(process.env.HERMES_SESSION_MAX_PROMPT_TOKENS || BLOAT_TOKEN_LIMIT),
    sessionPath,
    runPath,
    testPath,
    sourceOk,
    testOk,
    behavior: "When an existing session is above the prompt-token limit, the next inbound turn opens a fresh session before the agent runs.",
  };
}

function bundledSkillDumpSummary() {
  const activeRoot = join(HERMES_AGENT_ROOT, "skills");
  const disabledRoot = join(HERMES_AGENT_ROOT, ".disabled-skills");
  const activeDocs = findSkillDocs(activeRoot);
  const disabledDocs = findSkillDocs(disabledRoot);
  return {
    ok: activeDocs.length === 0,
    activeRoot,
    disabledRoot,
    activeCount: activeDocs.length,
    disabledCount: disabledDocs.length,
    activeDocs: activeDocs.slice(0, 100),
  };
}

function legacySkillSummary() {
  const roots = [
    ...PROFILE_ORDER.flatMap((id) => [
      { profile: id, scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, "skills") },
      { profile: id, scope: "profile", path: join(profileDir(id), "skills") },
    ]),
    { profile: "shared", scope: "shared", path: join(HERMES_ROOT, "skills") },
  ];
  const dangerousText = /remote-debugging-port=9222|openclaw gateway start|\/\.openclaw\/workspace\/projects\/open-design|agent-browser-darwin/i;
  const dangerousNames = new Set(["agent-browser-clawdbot", "chatplace", "close-loop", "open-design-builder", "openclaw-telegram-setup", "yandex-lavka-ordering"]);
  const active = [];
  const disabledSharedRoot = join(HERMES_ROOT, ".disabled-shared-skills");
  const disabledShared = existsSync(disabledSharedRoot)
    ? readdirSync(disabledSharedRoot).filter((name) => ["dogfood", "openclaw-imports", "yuanbao"].includes(name)).sort()
    : [];
  for (const root of roots) {
    for (const skill of directSkillDirs(root.path, root.scope, root.profile)) {
      const text = readText(join(skill.path, "SKILL.md"), readText(join(skill.path, "skill.md"), ""));
      const name = skill.name;
      const reasons = [];
      if (dangerousNames.has(name)) reasons.push("dangerous skill name");
      if (dangerousText.test(text)) reasons.push("legacy command/path");
      if (reasons.length) active.push({ ...skill, reasons });
    }
  }
  return { ok: active.length === 0, active, disabledShared };
}

function classifySkillRisk(skillName, text) {
  const haystack = `${skillName}\n${text}`.toLowerCase();
  const risks = [];
  if (/browser|playwright|chrome|safari|web automation|agent-browser|remote-debugging/.test(haystack)) risks.push("browser");
  if (/telegram|userbot|bot api|tg\b|канал|чат/.test(haystack)) risks.push("telegram");
  if (/api[_ -]?key|bearer|oauth|token|https:\/\/|curl |requests\.|urllib|fetch\(/.test(haystack)) risks.push("external-api");
  if (/image|gpt-image|kie|laozhang|nano-banana|midjourney|sora|video|veo|heygen|remotion/.test(haystack)) risks.push("media-gen");
  if (/notion/.test(haystack)) risks.push("notion");
  if (/obsidian|vault/.test(haystack)) risks.push("obsidian");
  if (/calendar|gmail|sheet|crm|yandex|lavka|yclients/.test(haystack)) risks.push("personal-data");
  if (/subprocess|shell|python3|node |npm |npx |pnpm |open -a|osascript/.test(haystack)) risks.push("shell");
  return [...new Set(risks)];
}

function skillRiskSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const roots = [
      { scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, "skills") },
      { scope: "profile", path: join(profileDir(id), "skills") },
    ];
    const skills = [];
    for (const root of roots) {
      for (const skill of directSkillDirs(root.path, root.scope, id)) {
        const text = readText(join(skill.path, "SKILL.md"), readText(join(skill.path, "skill.md"), ""));
        const risks = classifySkillRisk(skill.name, text);
        if (risks.length) skills.push({ name: skill.name, scope: skill.scope, path: skill.path, risks });
      }
    }
    const counts = {};
    for (const skill of skills) {
      for (const risk of skill.risks) counts[risk] = (counts[risk] || 0) + 1;
    }
    return {
      id,
      name: nameLabel(id),
      totalSkills: roots.reduce((sum, root) => sum + directSkillDirs(root.path, root.scope, id).length, 0),
      riskySkills: skills.length,
      counts,
      skills: skills.sort((a, b) => b.risks.length - a.risks.length || a.name.localeCompare(b.name)),
    };
  });
  const totals = {};
  for (const profile of profiles) {
    for (const [risk, count] of Object.entries(profile.counts)) totals[risk] = (totals[risk] || 0) + count;
  }
  return { totals, profiles: profiles.sort((a, b) => b.riskySkills - a.riskySkills) };
}

function rolePolicySummary() {
  const riskReport = skillRiskSummary();
  const profiles = PROFILE_ORDER.map((id) => {
    const policy = ROLE_SKILL_POLICY[id] || { allowed: [], discouraged: [] };
    const riskProfile = riskReport.profiles.find((profile) => profile.id === id) || { counts: {}, skills: [] };
    const examples = [];
    for (const skill of riskProfile.skills || []) {
      const overlap = effectiveDiscouragedTags(id, skill, policy);
      if (overlap.length) examples.push({ name: skill.name, scope: skill.scope, path: skill.path, tags: overlap });
    }
    const discouragedCounts = {};
    for (const example of examples) {
      for (const tag of example.tags) discouragedCounts[tag] = (discouragedCounts[tag] || 0) + 1;
    }
    const discouraged = Object.entries(discouragedCounts).map(([tag, count]) => ({ tag, count }));
    return {
      id,
      name: nameLabel(id),
      deferred: Boolean(policy.deferred),
      ok: Boolean(policy.deferred) || discouraged.length === 0,
      allowed: policy.allowed || [],
      discouragedTags: policy.discouraged || [],
      discouraged,
      examples: examples.slice(0, 10),
    };
  });
  const activeProfiles = profiles.filter((profile) => !profile.deferred);
  const totals = activeProfiles.reduce(
    (acc, profile) => {
      if (!profile.ok) acc.profiles += 1;
      acc.refs += profile.discouraged.reduce((sum, item) => sum + item.count, 0);
      return acc;
    },
    { profiles: 0, refs: 0, deferred: profiles.filter((profile) => profile.deferred).length },
  );
  return { ok: totals.profiles === 0, totals, profiles };
}

function effectiveDiscouragedTags(profileId, skill, policy) {
  const exemptions = ROLE_POLICY_EXEMPTIONS[profileId]?.[skill.name] || [];
  return skill.risks.filter((tag) => (policy.discouraged || []).includes(tag) && !exemptions.includes(tag));
}

function ruleAuditSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const soulPath = join(profileDir(id), "SOUL.md");
    const soul = readText(soulPath, "");
    const guardrails = RULE_GUARDRAILS.map((rule) => ({ ...rule, present: soul.includes(rule.label) }));
    const docs = [
      { scope: "soul", name: "SOUL.md", path: soulPath, text: soul },
      ...[
        { scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, "skills") },
        { scope: "profile", path: join(profileDir(id), "skills") },
      ].flatMap((root) =>
        directSkillDirs(root.path, root.scope, id).map((skill) => ({
          scope: skill.scope,
          name: skill.name,
          path: join(skill.path, existsSync(join(skill.path, "SKILL.md")) ? "SKILL.md" : "skill.md"),
          text: readText(join(skill.path, "SKILL.md"), readText(join(skill.path, "skill.md"), "")),
        })),
      ),
    ];
    const risks = [];
    for (const doc of docs) {
      const lines = doc.text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        for (const risk of RULE_RISK_PATTERNS) {
          if (doc.scope !== "soul" && risk.id !== "legacy") continue;
          if (isProtectiveRuleLine(line)) continue;
          if (!risk.pattern.test(line)) continue;
          risks.push({
            id: risk.id,
            label: risk.label,
            scope: doc.scope,
            name: doc.name,
            path: doc.path,
            line: index + 1,
            excerpt: line.trim().slice(0, 220),
          });
        }
      }
    }
    const missingGuardrails = guardrails.filter((rule) => !rule.present);
    return {
      id,
      name: nameLabel(id),
      path: profileDir(id),
      ok: missingGuardrails.length === 0 && risks.length === 0,
      guardrails,
      missingGuardrails,
      riskCount: risks.length,
      risks: risks.slice(0, 30),
    };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      acc.missingGuardrails += profile.missingGuardrails.length;
      acc.risks += profile.riskCount;
      if (!profile.ok) acc.profiles += 1;
      return acc;
    },
    { profiles: 0, missingGuardrails: 0, risks: 0 },
  );
  return { ok: totals.profiles === 0, totals, profiles: profiles.sort((a, b) => b.riskCount - a.riskCount || b.missingGuardrails.length - a.missingGuardrails.length) };
}

function isProtectiveRuleLine(line) {
  if (RULE_GUARDRAILS.some((rule) => line.includes(rule.label))) return true;
  return /\/Users\/serditov\/\.hermes-workspaces\/.*\/(IDENTITY|USER|LEARNING|MEMORY)\.md|^\s*Контекст:|не\s+(используй|читай|восстанавливай|запускай|вызывай|открывай|проверяй|ищи|лезь|делай|строй)|не надо|остановись|вместо продолжения|без\s+(tools|инструментов|поиска|контекста|браузера|terminal)|проверь\s+только|проверяй\s+только|do not|don't|never|ignore it|treat it as stale|unless the user explicitly/i.test(line);
}

function skillsSummary(agentId) {
  const workspaceSkillDir = join(HERMES_WORKSPACES_ROOT, agentId, "skills");
  const profileSkillDir = join(profileDir(agentId), "skills");
  const sharedSkillDir = join(HERMES_ROOT, "skills");
  const bundledSkillDir = join(HERMES_AGENT_ROOT, "skills");
  return {
    workspace: { path: workspaceSkillDir, skills: listSkillNames(workspaceSkillDir) },
    profile: { path: profileSkillDir, skills: listSkillNames(profileSkillDir) },
    shared: { path: sharedSkillDir, skills: listSkillNames(sharedSkillDir) },
    bundled: { path: bundledSkillDir, skills: listSkillNames(bundledSkillDir) },
  };
}

function disabledSkillSummary() {
  const roots = [
    ...PROFILE_ORDER.flatMap((id) => [
      { profile: id, scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, ".disabled-skills") },
      { profile: id, scope: "profile", path: join(profileDir(id), ".disabled-skills") },
    ]),
    { profile: "shared", scope: "shared", path: join(HERMES_ROOT, ".disabled-shared-skills") },
  ];
  const skills = [];
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const name of readdirSync(root.path).sort()) {
      const skillPath = join(root.path, name);
      if (!statSync(skillPath).isDirectory()) continue;
      const reason = disabledSkillReason(root.profile, name);
      skills.push({
        profile: root.profile,
        name: nameLabel(root.profile),
        scope: root.scope,
        skill: name,
        reason,
        path: skillPath,
        hasSkillDoc: existsSync(join(skillPath, "SKILL.md")) || existsSync(join(skillPath, "skill.md")),
      });
    }
  }
  const totals = skills.reduce((acc, item) => {
    acc.total += 1;
    acc[item.scope] = (acc[item.scope] || 0) + 1;
    acc.reasons[item.reason.id] = (acc.reasons[item.reason.id] || 0) + 1;
    return acc;
  }, { total: 0, reasons: {} });
  return { totals, skills };
}

function disabledSkillReason(profile, skillName) {
  const baseName = skillName.replace(/\.(workspace-duplicate|role-policy)$/, "");
  if (skillName.endsWith(".workspace-duplicate")) {
    return { id: "workspace-duplicate", label: "workspace/profile duplicate", action: "kept profile copy active" };
  }
  if (skillName.endsWith(".role-policy")) {
    return { id: "role-policy", label: "role policy mismatch", action: "removed from active tool surface" };
  }
  if (/openclaw|open-design|agent-browser|chatplace|close-loop|dogfood|yuanbao|lavka|courier/i.test(baseName)) {
    return { id: "legacy-or-eager", label: "legacy/eager skill", action: "disabled to stop startup digging" };
  }
  if (profile === "designer") {
    return { id: "designer-deferred", label: "designer deferred", action: "left disabled until separate designer pass" };
  }
  return { id: "manual-hygiene", label: "manual hygiene", action: "kept out of active skills" };
}

function duplicateSkillSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const roots = [
      { scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, "skills") },
      { scope: "profile", path: join(profileDir(id), "skills") },
    ];
    const seen = {};
    for (const root of roots) {
      for (const skill of directSkillDirs(root.path, root.scope, id)) {
        (seen[skill.name] ||= []).push({ scope: root.scope, path: skill.path });
      }
    }
    const duplicates = Object.entries(seen)
      .filter(([, locations]) => locations.length > 1)
      .map(([skill, locations]) => ({ skill, locations }));
    return { id, name: nameLabel(id), ok: duplicates.length === 0, duplicates, duplicateCount: duplicates.length };
  });
  const total = profiles.reduce((sum, profile) => sum + profile.duplicateCount, 0);
  return { ok: total === 0, totals: { duplicates: total, profiles: profiles.filter((profile) => !profile.ok).length }, profiles };
}

function skillCatalogSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const roots = [
      { scope: "workspace", path: join(HERMES_WORKSPACES_ROOT, id, "skills") },
      { scope: "profile", path: join(profileDir(id), "skills") },
      { scope: "shared", path: join(HERMES_ROOT, "skills") },
      { scope: "bundled", path: join(HERMES_AGENT_ROOT, "skills") },
    ];
    const skills = [];
    for (const root of roots) {
      for (const skill of directSkillDirs(root.path, root.scope, id)) {
        const docPath = join(skill.path, existsSync(join(skill.path, "SKILL.md")) ? "SKILL.md" : "skill.md");
        const text = readText(docPath, "");
        skills.push({
          scope: root.scope,
          name: skill.name,
          path: skill.path,
          docPath,
          description: skillDescription(text),
          tags: classifySkillRisk(skill.name, text),
        });
      }
    }
    const byScope = skills.reduce((acc, skill) => {
      acc[skill.scope] = (acc[skill.scope] || 0) + 1;
      return acc;
    }, {});
    const tags = skills.reduce((acc, skill) => {
      for (const tag of skill.tags) acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});
    return {
      id,
      name: nameLabel(id),
      total: skills.length,
      byScope,
      tags,
      skills: skills.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name)),
    };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      acc.skills += profile.total;
      for (const [scope, count] of Object.entries(profile.byScope)) acc[scope] = (acc[scope] || 0) + count;
      return acc;
    },
    { skills: 0 },
  );
  return { totals, profiles };
}

function skillDescription(text) {
  const frontmatterDescription = text.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (frontmatterDescription) return frontmatterDescription.replace(/^["']|["']$/g, "").slice(0, 180);
  const firstParagraph = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s*/gm, "").trim())
    .find((part) => part && !part.startsWith("```"));
  return (firstParagraph || "").replace(/\s+/g, " ").slice(0, 180);
}

function logSummary(agentId) {
  const dir = profileDir(agentId);
  const logPath = join(dir, "logs", "gateway.log");
  const rawTail = tailLines(logPath, 260);
  const rawLines = rawTail.split(/\r?\n/);
  const startIndex = rawLines.findLastIndex((line) => line.includes("Starting Hermes Gateway"));
  const tail = (startIndex >= 0 ? rawLines.slice(startIndex) : rawLines.slice(-160)).join("\n");
  const lines = tail.split(/\r?\n/).filter(Boolean);
  const problems = lines.filter((line) => /API call failed|APITimeoutError|Request timed out|TimedOut|Connection error|Dangerous command|Max retries|openclaw|agent-browser/i.test(line));
  return {
    path: logPath,
    tail,
    problemCount: problems.length,
    problems: problems.slice(-12),
  };
}

function logTrendSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const logPath = join(profileDir(id), "logs", "gateway.log");
    const text = tailLines(logPath, 2000);
    const allLines = text.split(/\r?\n/).filter(Boolean);
    const startIndex = allLines.findLastIndex((line) => line.includes("Starting Hermes Gateway"));
    const freshLines = startIndex >= 0 ? allLines.slice(startIndex) : allLines;
    const counts = countProblemLines(allLines);
    const freshCounts = countProblemLines(freshLines);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const freshTotal = Object.values(freshCounts).reduce((sum, value) => sum + value, 0);
    const latest = allLines.filter(isProblemLine).at(-1) || "";
    return { id, name: nameLabel(id), path: logPath, total, freshTotal, counts, freshCounts, latest };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      for (const [key, value] of Object.entries(profile.counts)) acc[key] += value;
      acc.total += profile.total;
      return acc;
    },
    { provider: 0, approval: 0, legacy: 0, context: 0, other: 0, total: 0 },
  );
  const freshTotals = profiles.reduce(
    (acc, profile) => {
      for (const [key, value] of Object.entries(profile.freshCounts)) acc[key] += value;
      acc.total += profile.freshTotal;
      return acc;
    },
    { provider: 0, approval: 0, legacy: 0, context: 0, other: 0, total: 0 },
  );
  return { totals, freshTotals, profiles: profiles.sort((a, b) => b.freshTotal - a.freshTotal || b.total - a.total) };
}

function telegramDependencySummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const logPath = join(profileDir(id), "logs", "gateway.log");
    const lines = tailLines(logPath, 1200).split(/\r?\n/).filter(Boolean);
    const telegramLines = lines.filter((line) => /telegram|Telegram|get_file|TimedOut|ConnectTimeout/i.test(line));
    const timeoutLines = telegramLines.filter((line) =>
      /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(line) &&
      /TimedOut|ConnectTimeout|Request timed out|Connection error|Fallback IP .* failed/i.test(line)
    );
    const inboundLines = telegramLines.filter((line) => /inbound message: platform=telegram/i.test(line));
    const latest = telegramLines.at(-1) || "";
    return {
      id,
      name: nameLabel(id),
      logPath,
      telegramLines: telegramLines.length,
      timeoutLines: timeoutLines.length,
      inboundLines: inboundLines.length,
      latest,
      status: timeoutLines.length ? "vpn-sensitive" : inboundLines.length ? "active" : "quiet",
    };
  }).sort((a, b) => b.timeoutLines - a.timeoutLines || b.telegramLines - a.telegramLines);
  const totals = profiles.reduce(
    (acc, profile) => {
      acc.telegramLines += profile.telegramLines;
      acc.timeoutLines += profile.timeoutLines;
      acc.inboundLines += profile.inboundLines;
      if (profile.status === "vpn-sensitive") acc.vpnSensitive += 1;
      return acc;
    },
    { telegramLines: 0, timeoutLines: 0, inboundLines: 0, vpnSensitive: 0 },
  );
  return { ok: totals.timeoutLines === 0, totals, profiles };
}

function isProblemLine(line) {
  return /API call failed|APITimeoutError|Request timed out|TimedOut|Connection error|Dangerous command|Max retries|openclaw|agent-browser|last_prompt_tokens|prompt tokens|too large|approval/i.test(line);
}

function countProblemLines(lines) {
  const counts = { provider: 0, approval: 0, legacy: 0, context: 0, other: 0 };
  for (const line of lines) {
    if (!isProblemLine(line)) continue;
    counts[classifyProblemLine(line)] += 1;
  }
  return counts;
}

function classifyProblemLine(line) {
  if (/\/Users\/serditov\/\.openclaw|agent-browser-darwin|remote-debugging-port=9222|open-design|openclaw/i.test(line)) return "legacy";
  if (/Dangerous command|requires approval|approval/i.test(line)) return "approval";
  if (/APITimeoutError|Request timed out|TimedOut|Connection error|API call failed|Max retries/i.test(line)) return "provider";
  if (/last_prompt_tokens|prompt tokens|too large/i.test(line)) return "context";
  return "other";
}

function incidentSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const logs = logSummary(id);
    const sessions = sessionSummary(id);
    const counts = { provider: 0, approval: 0, legacy: 0, context: 0, other: 0 };
    for (const line of logs.problems) counts[classifyProblemLine(line)] += 1;
    if (sessions.bloatedCount) counts.context += sessions.bloatedCount;
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return {
      id,
      name: nameLabel(id),
      gateway: isPidAlive(readPid(join(profileDir(id), "gateway.pid"))) ? "running" : "not-running",
      counts,
      total,
      maxPromptTokens: sessions.maxPromptTokens,
      latest: logs.problems.at(-1) || "",
    };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      for (const [key, value] of Object.entries(profile.counts)) acc[key] += value;
      acc.total += profile.total;
      return acc;
    },
    { provider: 0, approval: 0, legacy: 0, context: 0, other: 0, total: 0 },
  );
  return { totals, profiles: profiles.sort((a, b) => b.total - a.total) };
}

function activeRunsFor(agentId) {
  return [...runs.values()]
    .filter((run) => run.profile === agentId && ["starting", "running"].includes(run.status))
    .map((run) => ({
      id: run.id,
      sessionId: run.sessionId,
      ageMs: Date.now() - run.startedAt,
      status: run.status,
      longRunning: Date.now() - run.startedAt > LONG_RUN_MS,
    }));
}

function parseGatewayLogTime(line) {
  const match = String(line || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[,.]\d+)?/);
  if (!match) return 0;
  const time = Date.parse(`${match[1]}T${match[2]}`);
  return Number.isFinite(time) ? time : 0;
}

function latestGatewayTurnEvents(agentId) {
  const logPath = join(profileDir(agentId), "logs", "gateway.log");
  const lines = tailLines(logPath, 700).split(/\r?\n/).filter(Boolean);
  const busyPattern = /(inbound message|flushing (?:text|photo) batch|image routing|cached .*photo|routed telegram photo|image_generate|generating image|sending generated image|MEDIA:)/i;
  const donePattern = /(response ready|telegram response sent|sent .*message|sent .*photo|gateway running|received SIGTERM|shutdown complete|disconnected from telegram)/i;
  let lastBusy = null;
  let lastDone = null;
  for (const line of lines) {
    const ts = parseGatewayLogTime(line);
    if (!ts) continue;
    if (busyPattern.test(line)) lastBusy = { ts, line: redactSensitiveText(line).slice(0, 260) };
    if (donePattern.test(line)) lastDone = { ts, line: redactSensitiveText(line).slice(0, 260) };
  }
  return { logPath, lastBusy, lastDone };
}

function gatewayStateActivity(agentId) {
  const statePath = join(profileDir(agentId), "gateway_state.json");
  const state = readJson(statePath, null);
  if (!state || typeof state !== "object") return null;
  const activeAgents = Number(state.active_agents ?? state.activeAgents ?? state.active ?? 0);
  const updatedRaw = state.updated_at || state.updatedAt || state.timestamp || "";
  const updatedAt = updatedRaw ? Date.parse(updatedRaw) : 0;
  const fresh = !updatedAt || Date.now() - updatedAt < ACTIVE_GATEWAY_TURN_MS * 2;
  if (activeAgents > 0 && fresh) {
    return {
      source: "gateway_state",
      activeAgents,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : "",
    };
  }
  return null;
}

function gatewayRestartGuard(agentId) {
  const activeRuns = activeRunsFor(agentId);
  if (activeRuns.length) {
    return {
      blocked: true,
      reason: "active-web-run",
      message: "Агент сейчас отвечает в WebShell. Перезапуск пропущен.",
      activeRuns,
    };
  }

  const stateActivity = gatewayStateActivity(agentId);
  if (stateActivity) {
    return {
      blocked: true,
      reason: "active-gateway-turn",
      message: "Агент сейчас обрабатывает задачу. Перезапуск пропущен.",
      state: stateActivity,
    };
  }

  const events = latestGatewayTurnEvents(agentId);
  const { lastBusy, lastDone } = events;
  const busyIsOpen = lastBusy && (!lastDone || lastBusy.ts > lastDone.ts);
  if (busyIsOpen && Date.now() - lastBusy.ts < ACTIVE_GATEWAY_TURN_MS) {
    return {
      blocked: true,
      reason: "recent-telegram-turn",
      message: "Агент недавно получил Telegram-задачу и еще не закончил ответ. Перезапуск пропущен.",
      events,
    };
  }

  return { blocked: false, events };
}

function agentDiagnostics(agentId) {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  const pid = readPid(join(dir, "gateway.pid"));
  const alive = isPidAlive(pid);
  const sessions = sessionSummary(agentId);
  const logs = logSummary(agentId);
  const forbidden = forbiddenProcesses();
  const runsForAgent = activeRunsFor(agentId);
  const issues = [];
  if (!alive) issues.push("gateway is not running");
  if (sessions.bloatedCount) issues.push(`${sessions.bloatedCount} bloated session(s)`);
  if (logs.problemCount) issues.push(`${logs.problemCount} recent log warning/error line(s)`);
  if (forbidden.length) issues.push(`${forbidden.length} forbidden legacy process(es)`);
  if (runsForAgent.some((run) => run.longRunning)) issues.push("active run is older than 2 minutes");
  return {
    id: agentId,
    name: nameLabel(agentId),
    path: dir,
    gateway: { label: gatewayLabel(agentId), pid, status: alive ? "running" : pid ? "stale" : "stopped" },
    sessions,
    config: configSummary(agentId),
    skills: skillsSummary(agentId),
    logs: { path: logs.path, problemCount: logs.problemCount, problems: logs.problems },
    activeRuns: runsForAgent,
    restartGuard: gatewayRestartGuard(agentId),
    forbiddenProcesses: forbidden,
    issues,
    health: issues.length ? "attention" : "ok",
  };
}

function preflightSummary(agentId, message = "") {
  const diagnostics = agentDiagnostics(agentId);
  const text = String(message || "");
  const promptRisk = promptRiskPreview(text);
  const roleRisk = promptRoleRisk(agentId, promptRisk.hits);
  const routing = promptRoutingSummary(text, agentId, promptRisk);
  const checks = [
    { id: "gateway", label: "Gateway running", failLabel: "Gateway is not running", ok: diagnostics.gateway.status === "running", blocking: true },
    { id: "sessions", label: "Active sessions are not bloated", failLabel: "Active sessions are bloated", ok: diagnostics.sessions.bloatedCount === 0, blocking: false },
    { id: "legacy", label: "No legacy OpenClaw/browser process", failLabel: "Legacy OpenClaw/browser process detected", ok: diagnostics.forbiddenProcesses.length === 0, blocking: false },
    { id: "prompt-size", label: "Prompt size is within web-shell limit", failLabel: "Prompt is too large", ok: true, blocking: true },
    { id: "prompt-risk", label: "Prompt does not look like browser/payment/order automation", failLabel: "Prompt looks like browser/payment/order automation", ok: promptRisk.blockers.length === 0, blocking: true },
    { id: "prompt-role-policy", label: "Prompt matches selected agent role", failLabel: "Prompt does not match selected agent role", ok: roleRisk.blockers.length === 0, blocking: true },
  ];
  if (text) {
    const lower = text.toLowerCase();
    checks.push({
      id: "legacy-prompt",
      label: "Prompt does not explicitly ask for OpenClaw",
      failLabel: "Prompt explicitly asks for OpenClaw",
      ok: !FORBIDDEN_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase())),
      blocking: true,
    });
  }
  return {
    ok: checks.every((check) => check.ok || !check.blocking),
    checks,
    promptRisk,
    roleRisk,
    routing,
    limits: { maxPromptChars: MAX_WEB_PROMPT_CHARS, bloatTokenLimit: BLOAT_TOKEN_LIMIT },
    diagnostics,
  };
}

function promptRiskPreview(message) {
  const text = String(message || "").toLowerCase();
  const hits = [];
  const rules = [
    { tag: "browser", pattern: /браузер|сайт|страниц|лендинг|открой|клик|click|browser|playwright|chrome|safari|скриншот|screenshot/ },
    { tag: "payment", pattern: /оплат|плат[её]ж|prodamus|stripe|касс|invoice|заказ|курьер|delivery|доставк|yandex|яндекс/ },
    { tag: "external-api", pattern: /api|webhook|curl|token|bearer|oauth|интеграц|notion|google sheet|таблиц|gmail|calendar/ },
    { tag: "media-gen", pattern: /картин|изображ|баннер|video|видео|reel|gpt-image|kie|veo|heygen|remotion/ },
    { tag: "obsidian", pattern: /obsidian|vault|заметк|md\b|markdown/ },
    { tag: "telegram", pattern: /telegram|телеграм|канал|посты|юзербот|userbot|@[\w_]+/ },
  ];
  for (const rule of rules) {
    if (rule.pattern.test(text)) hits.push(rule.tag);
  }
  const blockers = hits.filter((tag) => ["browser", "payment"].includes(tag));
  const suggestedMode = blockers.length ? "quick" : hits.length ? "focused" : "quick";
  return { hits: [...new Set(hits)], blockers: [...new Set(blockers)], suggestedMode };
}

function promptRoleRisk(agentId, hits) {
  const policy = ROLE_SKILL_POLICY[agentId] || ROLE_SKILL_POLICY.default;
  if (policy.deferred) {
    return { checked: false, blockers: [], warnings: [], policy: "deferred" };
  }
  const uniqueHits = [...new Set(hits || [])];
  const discouraged = new Set(policy.discouraged || []);
  const allowed = new Set(policy.allowed || []);
  const blockers = uniqueHits.filter((tag) => discouraged.has(tag) && !allowed.has(tag));
  return {
    checked: true,
    blockers,
    warnings: uniqueHits.filter((tag) => allowed.has(tag)),
    allowed: [...allowed],
    discouraged: [...discouraged],
  };
}

function promptRoutingSummary(message, selectedId = null, promptRisk = null) {
  const risk = promptRisk || promptRiskPreview(message);
  const hits = [...new Set(risk.hits || [])];
  const candidates = PROFILE_ORDER.map((id) => {
    const policy = ROLE_SKILL_POLICY[id] || ROLE_SKILL_POLICY.default;
    const allowed = new Set(policy.allowed || []);
    const discouraged = new Set(policy.discouraged || []);
    const matchedAllowed = hits.filter((tag) => allowed.has(tag));
    const matchedDiscouraged = hits.filter((tag) => discouraged.has(tag) && !allowed.has(tag));
    let score = matchedAllowed.length * 3 - matchedDiscouraged.length * 5;
    if (id === "coordinator" && hits.length === 0) score += 1;
    if (id === "assistant" && hits.includes("obsidian")) score += 1;
    if (policy.deferred) score -= 50;
    return {
      id,
      name: nameLabel(id),
      selected: id === selectedId,
      deferred: Boolean(policy.deferred),
      score,
      matchedAllowed,
      matchedDiscouraged,
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const recommended = candidates.find((candidate) => !candidate.deferred && candidate.score >= 0) || candidates[0] || null;
  return { hits, suggestedMode: risk.suggestedMode || "quick", recommended, candidates };
}

function recordPreflight(agentId, message, result) {
  if (!String(message || "").trim()) return null;
  const id = `preflight_${new Date().toISOString().replace(/[-:.]/g, "")}_${randomUUID().slice(0, 8)}`;
  const record = {
    id,
    checkedAt: new Date().toISOString(),
    profile: agentId,
    ok: result.ok,
    messagePreview: String(message || "").slice(0, 240),
    failedChecks: result.checks.filter((check) => !check.ok).map((check) => check.id),
    promptRisk: result.promptRisk,
    roleRisk: {
      blockers: result.roleRisk?.blockers || [],
      warnings: result.roleRisk?.warnings || [],
    },
    routing: {
      recommended: result.routing?.recommended?.id || null,
      selected: result.routing?.candidates?.find((candidate) => candidate.selected)?.id || agentId,
      suggestedMode: result.routing?.suggestedMode || result.promptRisk?.suggestedMode || "quick",
    },
  };
  atomicWriteFile(preflightFile(id), JSON.stringify(record, null, 2), "utf8");
  pruneFiles(PREFLIGHTS_DIR, (name) => name.startsWith("preflight_") && name.endsWith(".json"), PREFLIGHT_HISTORY_LIMIT);
  return record;
}

function listPreflights() {
  return readdirSync(PREFLIGHTS_DIR)
    .filter((name) => name.startsWith("preflight_") && name.endsWith(".json"))
    .map((name) => {
      const path = join(PREFLIGHTS_DIR, name);
      return { path, ...readJson(path, {}), mtimeMs: statSync(path).mtimeMs };
    })
    .filter((item) => item.id)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, PREFLIGHT_HISTORY_LIMIT);
}

function preflightStats(records = listPreflights()) {
  const stats = {
    total: records.length,
    blocked: records.filter((record) => !record.ok).length,
    profiles: {},
    failedChecks: {},
    riskHits: {},
  };
  for (const record of records) {
    stats.profiles[record.profile] = (stats.profiles[record.profile] || 0) + 1;
    for (const check of record.failedChecks || []) stats.failedChecks[check] = (stats.failedChecks[check] || 0) + 1;
    for (const hit of record.promptRisk?.hits || []) stats.riskHits[hit] = (stats.riskHits[hit] || 0) + 1;
  }
  return stats;
}

function readinessSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const preflight = preflightSummary(id, "");
    const diagnostics = preflight.diagnostics;
    const blockers = preflight.checks.filter((check) => !check.ok).map((check) => check.label);
    const warnings = [];
    const sessionPressure = Math.round((diagnostics.sessions.maxPromptTokens / BLOAT_TOKEN_LIMIT) * 100);
    if (diagnostics.logs.problemCount) warnings.push(`${diagnostics.logs.problemCount} recent log warnings`);
    if (diagnostics.sessions.maxPromptTokens > BLOAT_TOKEN_LIMIT * 0.7) {
      warnings.push(`${diagnostics.sessions.maxPromptTokens} prompt tokens in active sessions (${sessionPressure}% of limit)`);
    }
    if (diagnostics.skills.workspace.skills.length + diagnostics.skills.profile.skills.length > 25) warnings.push("large active skill surface");
    return {
      id,
      name: nameLabel(id),
      ok: preflight.ok,
      status: preflight.ok ? (warnings.length ? "ready-with-warnings" : "ready") : "blocked",
      gateway: diagnostics.gateway.status,
      sessionStatus: diagnostics.sessions.status,
      maxPromptTokens: diagnostics.sessions.maxPromptTokens,
      activeSkills: diagnostics.skills.workspace.skills.length + diagnostics.skills.profile.skills.length,
      blockers,
      warnings,
      suggestedMode: sessionPressure > 70 || diagnostics.logs.problemCount ? "quick" : "focused",
    };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      acc[profile.status] = (acc[profile.status] || 0) + 1;
      return acc;
    },
    { ready: 0, "ready-with-warnings": 0, blocked: 0 },
  );
  return { ok: totals.blocked === 0, totals, profiles };
}

function resetAgentSessions(agentId) {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  if (process.platform === "linux") {
    const service = systemdGatewayService(agentId);
    runCommand("systemctl", ["stop", service]);
    const result = archiveAgentSessions(agentId, "web-reset");
    const start = runCommand("systemctl", ["start", service]);
    return {
      ...result,
      restarted: start.code === 0,
      method: "systemd",
      error: start.code === 0 ? "" : (start.stderr || start.stdout || `exit ${start.code}`),
    };
  }

  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() || 501);
    const label = gatewayLabel(agentId);
    const target = `gui/${uid}/${label}`;
    runCommand("launchctl", ["bootout", target]);
    const result = archiveAgentSessions(agentId, "web-reset");
    const plist = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    if (existsSync(plist)) runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
    const kick = runCommand("launchctl", ["kickstart", "-k", target]);
    return {
      ...result,
      restarted: kick.code === 0,
      method: "launchctl",
      error: kick.code === 0 ? "" : (kick.stderr || kick.stdout || `exit ${kick.code}`),
    };
  }

  const result = archiveAgentSessions(agentId, "web-reset");
  const restart = restartAgentGateway(agentId, { force: true });
  return { ...result, restarted: Boolean(restart.restarted), method: restart.method, error: restart.error || "" };
}

function restartAgentGateway(agentId, options = {}) {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  const force = Boolean(options.force);
  const guard = force ? { blocked: false, forced: true } : gatewayRestartGuard(agentId);
  const label = gatewayLabel(agentId);
  if (guard.blocked) {
    return {
      ok: true,
      restarted: false,
      skipped: true,
      label,
      reason: guard.reason,
      message: guard.message,
      guard,
    };
  }
  const errors = [];
  if (process.platform === "linux") {
    const service = systemdGatewayService(agentId);
    const restart = runCommand("systemctl", ["restart", service]);
    if (restart.code === 0) return { ok: true, restarted: true, method: "systemd", label: service, guard };
    errors.push(`systemctl ${service}: ${restart.stderr || restart.stdout || `exit ${restart.code}`}`);
  }

  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() || 501);
    const target = `gui/${uid}/${label}`;
    const plist = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    const kick = runCommand("launchctl", ["kickstart", "-k", target]);
    if (kick.code === 0) return { ok: true, restarted: true, method: "launchctl-kickstart", label, guard };
    errors.push(`launchctl kickstart ${label}: ${kick.stderr || kick.stdout || `exit ${kick.code}`}`);

    runCommand("launchctl", ["bootout", target]);
    if (existsSync(plist)) {
      const bootstrap = runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
      if (bootstrap.code !== 0) errors.push(`launchctl bootstrap ${label}: ${bootstrap.stderr || bootstrap.stdout || `exit ${bootstrap.code}`}`);
    } else {
      errors.push(`launch plist not found: ${plist}`);
    }
    const secondKick = runCommand("launchctl", ["kickstart", "-k", target]);
    if (secondKick.code === 0) return { ok: true, restarted: true, method: "launchctl-bootstrap", label, guard };
    errors.push(`launchctl second kickstart ${label}: ${secondKick.stderr || secondKick.stdout || `exit ${secondKick.code}`}`);
  }

  const hermes = join(HERMES_AGENT_ROOT, "venv", "bin", "hermes");
  const command = existsSync(hermes) ? hermes : HERMES_PYTHON;
  const commandPrefix = existsSync(hermes) ? [] : [join(HERMES_AGENT_ROOT, "cli.py")];
  const env = {
    ...process.env,
    HERMES_HOME: dir,
    PATH: [
      LOCAL_BIN,
      join(HERMES_ROOT, "node", "bin"),
      join(HERMES_AGENT_ROOT, "venv", "bin"),
      process.env.PATH || "",
    ].filter(Boolean).join(":"),
  };
  const install = runCommand(command, [...commandPrefix, "gateway", "install", "--force"], { env, cwd: HERMES_AGENT_ROOT });
  if (install.code !== 0) errors.push(`hermes gateway install ${label}: ${install.stderr || install.stdout || `exit ${install.code}`}`);
  const start = runCommand(command, [...commandPrefix, "gateway", "start"], { env, cwd: HERMES_AGENT_ROOT });
  if (start.code === 0) return { ok: true, restarted: true, method: "hermes-gateway-start", label, guard };
  errors.push(`hermes gateway start ${label}: ${start.stderr || start.stdout || `exit ${start.code}`}`);
  return { ok: false, restarted: false, label, error: errors.join("\n").slice(0, 2000) };
}

function archiveAgentSessions(agentId, reason = "web-archive") {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  const sessionDir = join(dir, "sessions");
  const archiveRoot = join(dir, ".archives");
  mkdirSync(archiveRoot, { recursive: true });
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}-${randomUUID().slice(0, 8)}`;
  let archive = null;
  if (existsSync(sessionDir)) {
    archive = join(archiveRoot, `sessions.archive-${reason}-${stamp}`);
    renameSync(sessionDir, archive);
  }
  mkdirSync(sessionDir, { recursive: true });
  atomicWriteFile(join(sessionDir, "sessions.json"), "{}\n", { encoding: "utf8", mode: 0o600 });
  return { ok: true, archive, sessions: join(sessionDir, "sessions.json"), restarted: false };
}

function archiveTelegramSessions(agentId, reason = "telegram-token") {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  const sessionDir = join(dir, "sessions");
  const indexPath = join(sessionDir, "sessions.json");
  const index = readJson(indexPath, {});
  const archiveRoot = join(dir, ".archives", `telegram-sessions.${reason}-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}-${randomUUID().slice(0, 8)}`);
  const removed = [];
  const kept = {};

  mkdirSync(sessionDir, { recursive: true });
  for (const [key, entry] of Object.entries(index || {})) {
    const platform = String(entry?.platform || entry?.origin?.platform || "").toLowerCase();
    const sessionId = String(entry?.session_id || key || "");
    if (platform !== "telegram" || !/^[A-Za-z0-9_-]+$/.test(sessionId)) {
      kept[key] = entry;
      continue;
    }
    mkdirSync(archiveRoot, { recursive: true });
    for (const name of [`session_${sessionId}.json`, `${sessionId}.jsonl`]) {
      const source = join(sessionDir, name);
      if (existsSync(source)) renameSync(source, join(archiveRoot, name));
    }
    removed.push(sessionId);
  }

  if (removed.length) {
    atomicWriteFile(indexPath, `${JSON.stringify(kept, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  return { ok: true, removed: removed.length, archive: removed.length ? archiveRoot : null };
}

function envPath(agentId) {
  return join(profileDir(agentId), ".env");
}

function envSingleQuote(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function readEnvValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escaped}=(.*)$`, "m"));
  if (!match) return "";
  const raw = match[1].trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function writeEnvValue(text, key, value) {
  const line = `${key}=${envSingleQuote(value)}`;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^${escaped}=`, "m").test(text)) {
    return text.replace(new RegExp(`^${escaped}=.*$`, "m"), line);
  }
  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

function deleteEnvValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`^${escaped}=.*\\n?`, "m"), "")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeTelegramAllowedUsers(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parts = raw.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return "";
  const invalid = parts.find((item) => !/^[0-9]{3,20}$/.test(item));
  if (invalid) {
    throw new Error(`invalid Telegram user ID: ${invalid}`);
  }
  return [...new Set(parts)].join(",");
}

function ensureTelegramPlatformEnabled(agentId) {
  const configPath = join(profileDir(agentId), "config.yaml");
  let text = readText(configPath, "");
  if (/^platforms:\s*$/m.test(text) && /(^|\n)  telegram:\s*\n(?:    .*\n)*?    enabled:\s*true\b/m.test(text)) return;
  text = `${text.replace(/\s*$/, "")}\n\n# Infobiz Agents messaging defaults\nplatforms:\n  telegram:\n    enabled: true\n`;
  atomicWriteFile(configPath, text, { encoding: "utf8", mode: 0o600 });
}

function telegramSettings(agentId) {
  const path = envPath(agentId);
  const text = readText(path, "");
  const token = readEnvValue(text, "TELEGRAM_BOT_TOKEN");
  const allowedUsersRaw = readEnvValue(text, "TELEGRAM_ALLOWED_USERS");
  const allowAllUsers = readEnvValue(text, "GATEWAY_ALLOW_ALL_USERS").toLowerCase() === "true";
  let allowedUsers = allowedUsersRaw;
  try {
    allowedUsers = normalizeTelegramAllowedUsers(allowedUsersRaw);
  } catch {
    allowedUsers = allowedUsersRaw;
  }
  return {
    ok: existsSync(profileDir(agentId)),
    profile: agentId,
    configured: Boolean(token),
    tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : "",
    allowedUsers,
    allowedUsersConfigured: Boolean(allowedUsers),
    allowAllUsers,
    accessClosed: Boolean(token) && !allowedUsers && !allowAllUsers,
    envPath: path,
    gateway: agentDiagnostics(agentId).gateway.status,
  };
}

function telegramSettingsAll() {
  const profiles = PROFILE_ORDER
    .filter((id) => existsSync(profileDir(id)))
    .map((id) => ({ name: nameLabel(id), ...telegramSettings(id) }));
  return {
    ok: true,
    profiles,
    configured: profiles.filter((profile) => profile.configured).length,
    total: profiles.length,
  };
}

function telegramTokenOwner(token, exceptAgentId = "") {
  token = String(token || "").trim();
  if (!token) return null;
  for (const id of PROFILE_ORDER) {
    if (id === exceptAgentId || !existsSync(profileDir(id))) continue;
    const existing = readEnvValue(readText(envPath(id), ""), "TELEGRAM_BOT_TOKEN");
    if (existing && existing === token) return id;
  }
  return null;
}

function assertTelegramTokenAvailable(agentId, token) {
  const owner = telegramTokenOwner(token, agentId);
  if (!owner) return;
  throw new Error(`Этот Telegram Bot Token уже подключен к агенту «${nameLabel(owner)}». Для каждого агента нужен отдельный бот-токен.`);
}

function saveTelegramSettings(agentId, { token, allowedUsers, updateToken = true, updateAllowedUsers = true } = {}) {
  token = String(token || "").trim();
  if (updateToken && !/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token) && token !== "") {
    throw new Error("invalid Telegram bot token");
  }
  if (updateToken && token) {
    assertTelegramTokenAvailable(agentId, token);
  }
  const normalizedAllowedUsers = updateAllowedUsers ? normalizeTelegramAllowedUsers(allowedUsers) : "";
  const path = envPath(agentId);
  let text = readText(path, "");
  if (!text) text = "";
  const beforeToken = readEnvValue(text, "TELEGRAM_BOT_TOKEN");
  const beforeAllowedUsers = normalizeTelegramAllowedUsers(readEnvValue(text, "TELEGRAM_ALLOWED_USERS"));
  if (updateToken) {
    text = writeEnvValue(text, "TELEGRAM_BOT_TOKEN", token);
  }
  if (updateAllowedUsers) {
    text = normalizedAllowedUsers
      ? writeEnvValue(text, "TELEGRAM_ALLOWED_USERS", normalizedAllowedUsers)
      : deleteEnvValue(text, "TELEGRAM_ALLOWED_USERS");
  }
  // A bot without an allowlist must be closed, not exposed to every Telegram
  // user. Adding an ID later opens access only for those explicit accounts.
  text = writeEnvValue(text, "GATEWAY_ALLOW_ALL_USERS", "false");
  text = writeEnvValue(text, "INFOBIZ_AGENT_IDENTITY_REV", "20260614-telegram-identity");
  atomicWriteFile(path, text, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
  ensureTelegramPlatformEnabled(agentId);
  const tokenChanged = updateToken && beforeToken !== token;
  const allowlistChanged = updateAllowedUsers && beforeAllowedUsers !== normalizedAllowedUsers;
  const sessions = tokenChanged || allowlistChanged
    ? archiveTelegramSessions(agentId)
    : { ok: true, removed: 0, archive: null };
  let restart = { ok: false, restarted: false };
  try {
    restart = restartAgentGateway(agentId);
  } catch (error) {
    restart = { ok: false, restarted: false, error: error.message || String(error) };
  }
  return { ok: true, settings: telegramSettings(agentId), restart, sessions };
}

function saveTelegramToken(agentId, token) {
  return saveTelegramSettings(agentId, { token, updateToken: true, updateAllowedUsers: false });
}

function saveTelegramTokens(tokens, allowedUsers = {}) {
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) {
    throw new Error("tokens object required");
  }
  if (!allowedUsers || typeof allowedUsers !== "object" || Array.isArray(allowedUsers)) {
    throw new Error("allowedUsers object required");
  }
  const allowed = new Set(PROFILE_ORDER);
  const results = [];
  const agentIds = new Set([...Object.keys(tokens), ...Object.keys(allowedUsers)]);
  const requestedTokens = new Map();
  for (const agentId of agentIds) {
    if (!allowed.has(agentId)) continue;
    if (!Object.prototype.hasOwnProperty.call(tokens, agentId)) continue;
    const token = String(tokens[agentId] || "").trim();
    if (!token) continue;
    if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token)) {
      throw new Error(`invalid Telegram bot token for ${nameLabel(agentId)}`);
    }
    const existing = requestedTokens.get(token);
    if (existing) {
      throw new Error(`Один Telegram Bot Token указан сразу для «${nameLabel(existing)}» и «${nameLabel(agentId)}». Для каждого агента нужен отдельный бот-токен.`);
    }
    requestedTokens.set(token, agentId);
  }
  for (const [token, agentId] of requestedTokens.entries()) {
    assertTelegramTokenAvailable(agentId, token);
  }
  for (const agentId of agentIds) {
    if (!allowed.has(agentId)) continue;
    const hasToken = Object.prototype.hasOwnProperty.call(tokens, agentId);
    const hasAllowedUsers = Object.prototype.hasOwnProperty.call(allowedUsers, agentId);
    const token = String(tokens[agentId] || "").trim();
    const before = telegramSettings(agentId);
    const requestedAllowedUsers = hasAllowedUsers ? normalizeTelegramAllowedUsers(allowedUsers[agentId]) : before.allowedUsers;
    if ((!hasToken || !token) && (!hasAllowedUsers || requestedAllowedUsers === before.allowedUsers)) continue;
    const saved = saveTelegramSettings(agentId, {
      token,
      allowedUsers: requestedAllowedUsers,
      updateToken: hasToken && Boolean(token),
      updateAllowedUsers: hasAllowedUsers,
    });
    results.push({
      profile: agentId,
      name: nameLabel(agentId),
      changed: saved.settings.tokenPreview !== before.tokenPreview || saved.settings.allowedUsers !== before.allowedUsers,
      settings: saved.settings,
      restart: saved.restart,
      sessions: saved.sessions,
    });
  }
  return { ok: true, settings: telegramSettingsAll(), results };
}

function resourceSummary() {
  return {
    obsidian: {
      vault: OBSIDIAN_VAULT,
      vaultExists: existsSync(OBSIDIAN_VAULT),
      skillExists: existsSync(join(HERMES_ROOT, "skills", "note-taking", "obsidian")) ||
        existsSync(join(HERMES_AGENT_ROOT, "skills", "note-taking", "obsidian")),
    },
    skills: PROFILE_ORDER.map((id) => ({ id, name: nameLabel(id), ...skillsSummary(id) })),
    toolModes: [
      { id: "focused", name: "Focused", description: "Core tools + skills/Obsidian, без delegation/memory/cron." },
      { id: "quick", name: "Quick", description: "Самый легкий режим без skill_view." },
      { id: "full", name: "Full", description: "Шире focused, но web-shell все равно фильтрует browser/delegation/memory/cron." },
    ],
  };
}

function modelMatrixSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const config = configSummary(id);
    const sessions = sessionSummary(id);
    const logs = logSummary(id);
    return {
      id,
      name: nameLabel(id),
      gateway: agentDiagnostics(id).gateway.status,
      provider: config.provider || "unknown",
      model: config.model || "unknown",
      maxTurns: config.maxTurns,
      idleMinutes: config.idleMinutes,
      apiMaxRetries: config.apiMaxRetries,
      disabledToolsetCount: config.disabledToolsets.length,
      maxPromptTokens: sessions.maxPromptTokens,
      problemCount: logs.problemCount,
      needsAttention: sessions.bloatedCount > 0 || logs.problemCount > 0,
    };
  });
  const providers = [...new Set(profiles.map((profile) => profile.provider))].sort();
  const models = [...new Set(profiles.map((profile) => profile.model))].sort();
  return { providers, models, profiles };
}

function configDriftSummary() {
  const profiles = PROFILE_ORDER.map((id) => ({ id, name: nameLabel(id), config: configSummary(id) }));
  const fields = ["provider", "model", "maxTurns", "idleMinutes", "apiMaxRetries"];
  const expected = Object.fromEntries(fields.map((field) => [field, mostCommonValue(profiles.map((profile) => profile.config[field]))]));
  const requiredToolsets = new Set(PROFILE_DISABLED_TOOLSETS);
  const rows = profiles.map((profile) => {
    const fieldDrift = fields
      .filter((field) => String(profile.config[field] || "") !== String(expected[field] || ""))
      .map((field) => ({ field, expected: expected[field], actual: profile.config[field] }));
    const missingToolsets = [...requiredToolsets].filter((toolset) => !profile.config.disabledToolsets.includes(toolset));
    return {
      id: profile.id,
      name: profile.name,
      fieldDrift,
      missingToolsets,
      disabledToolsetCount: profile.config.disabledToolsets.length,
      ok: fieldDrift.length === 0 && missingToolsets.length === 0,
    };
  }).sort((a, b) => (b.fieldDrift.length + b.missingToolsets.length) - (a.fieldDrift.length + a.missingToolsets.length));
  const totals = rows.reduce(
    (acc, row) => {
      if (!row.ok) acc.profiles += 1;
      acc.fieldDrift += row.fieldDrift.length;
      acc.missingToolsets += row.missingToolsets.length;
      return acc;
    },
    { profiles: 0, fieldDrift: 0, missingToolsets: 0 },
  );
  return { ok: totals.profiles === 0, expected, totals, profiles: rows };
}

function mostCommonValue(values) {
  const counts = new Map();
  for (const value of values) {
    const key = String(value || "");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function hygieneState() {
  return {
    capturedAt: new Date().toISOString(),
    audit: auditSummary(),
    contextSurface: contextSurfaceSummary(),
    skillPromptPolicy: skillPromptPolicySummary(),
    telegramLiteRouter: telegramLiteRouterSummary(),
    legacySkills: legacySkillSummary(),
    bundledSkills: bundledSkillDumpSummary(),
    skillRisks: skillRiskSummary(),
    rolePolicy: rolePolicySummary(),
    duplicateSkills: duplicateSkillSummary(),
    ruleAudit: ruleAuditSummary(),
    toolPolicy: webToolPolicySummary(),
    modelMatrix: modelMatrixSummary(),
    agents: PROFILE_ORDER.map((id) => ({
      id,
      name: nameLabel(id),
      config: configSummary(id),
      sessions: sessionSummary(id),
      skills: skillsSummary(id),
    })),
  };
}

function createBaseline() {
  const baseline = hygieneState();
  atomicWriteFile(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf8");
  return { ok: true, path: BASELINE_PATH, baseline, drift: baselineDriftSummary(baseline) };
}

function profileById(items, id) {
  return (items || []).find((item) => item.id === id) || null;
}

function diffList(before = [], after = []) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((item) => !beforeSet.has(item)),
    removed: before.filter((item) => !afterSet.has(item)),
  };
}

function baselineDriftSummary(baseline = readJson(BASELINE_PATH, null)) {
  const current = hygieneState();
  if (!baseline) return { ok: false, hasBaseline: false, path: BASELINE_PATH, changes: [], current };
  const changes = [];
  const baselineChecks = new Map((baseline.audit?.checks || []).map((check) => [check.id, check.ok]));
  for (const check of current.audit.checks || []) {
    if (baselineChecks.has(check.id) && baselineChecks.get(check.id) !== check.ok) {
      changes.push({ type: "audit", id: check.id, label: check.label, before: baselineChecks.get(check.id), after: check.ok });
    }
  }
  for (const profile of current.agents) {
    const previous = profileById(baseline.agents, profile.id);
    if (!previous) {
      changes.push({ type: "profile", id: profile.id, after: "added" });
      continue;
    }
    for (const field of ["provider", "model", "maxTurns", "idleMinutes", "apiMaxRetries"]) {
      if (previous.config?.[field] !== profile.config?.[field]) {
        changes.push({ type: "config", id: profile.id, field, before: previous.config?.[field], after: profile.config?.[field] });
      }
    }
    const beforeSkills = [...(previous.skills?.workspace?.skills || []), ...(previous.skills?.profile?.skills || [])].sort();
    const afterSkills = [...(profile.skills?.workspace?.skills || []), ...(profile.skills?.profile?.skills || [])].sort();
    const skillDiff = diffList(beforeSkills, afterSkills);
    if (skillDiff.added.length || skillDiff.removed.length) {
      changes.push({ type: "skills", id: profile.id, ...skillDiff });
    }
    const previousBloated = (previous.sessions?.maxPromptTokens || 0) > BLOAT_TOKEN_LIMIT;
    const currentBloated = (profile.sessions?.maxPromptTokens || 0) > BLOAT_TOKEN_LIMIT;
    const deferredProfile = Boolean(ROLE_SKILL_POLICY[profile.id]?.deferred);
    if (!deferredProfile && previousBloated !== currentBloated) {
      changes.push({ type: "tokens", id: profile.id, before: previous.sessions?.maxPromptTokens || 0, after: profile.sessions?.maxPromptTokens || 0 });
    }
  }
  const beforeRiskTotals = baseline.skillRisks?.totals || {};
  const afterRiskTotals = current.skillRisks?.totals || {};
  for (const key of [...new Set([...Object.keys(beforeRiskTotals), ...Object.keys(afterRiskTotals)])].sort()) {
    if ((beforeRiskTotals[key] || 0) !== (afterRiskTotals[key] || 0)) {
      changes.push({ type: "skill-risk", id: key, before: beforeRiskTotals[key] || 0, after: afterRiskTotals[key] || 0 });
    }
  }
  const beforeToolPolicy = baseline.toolPolicy?.profiles || [];
  const afterToolPolicy = current.toolPolicy?.profiles || [];
  for (const profile of afterToolPolicy) {
    const previous = profileById(beforeToolPolicy, profile.id);
    const beforeMissing = previous?.missingDisabled || [];
    const afterMissing = profile.missingDisabled || [];
    const policyDiff = diffList(beforeMissing, afterMissing);
    if (policyDiff.added.length || policyDiff.removed.length) {
      changes.push({ type: "tool-policy", id: profile.id, ...policyDiff });
    }
  }
  return {
    ok: changes.length === 0 && current.audit.ok,
    hasBaseline: true,
    path: BASELINE_PATH,
    capturedAt: baseline.capturedAt,
    checkedAt: new Date().toISOString(),
    changes,
    current,
  };
}

function controlCenterSummary() {
  const readiness = readinessSummary();
  const audit = auditSummary();
  const baseline = baselineDriftSummary();
  const gatewayRuntime = gatewayRuntimeSummary();
  const logTrends = logTrendSummary();
  const rolePolicy = rolePolicySummary();
  const duplicates = duplicateSkillSummary();
  const checks = [
    { id: "readiness", label: "Launch readiness", ok: readiness.ok, detail: `${readiness.totals.ready} ready · ${readiness.totals["ready-with-warnings"]} warnings · ${readiness.totals.blocked} blocked` },
    { id: "gateway-runtime", label: "Gateway runtime", ok: gatewayRuntime.ok, detail: `${gatewayRuntime.profiles.filter((profile) => profile.ok).length}/${gatewayRuntime.profiles.length} pidfiles match` },
    { id: "audit", label: "Hermes hygiene", ok: audit.ok, detail: `${audit.checks.filter((check) => !check.ok).length} failing checks` },
    { id: "baseline", label: "Baseline drift", ok: baseline.ok, detail: `${baseline.changes.length} changes` },
    { id: "fresh-logs", label: "Fresh log problems", ok: (logTrends.freshTotals?.total || 0) === 0, detail: `${logTrends.freshTotals?.total || 0} since restart` },
    { id: "role-policy", label: "Role policy", ok: rolePolicy.ok, detail: `${rolePolicy.totals.refs} discouraged refs · ${rolePolicy.totals.deferred} deferred` },
    { id: "duplicate-skills", label: "Duplicate skills", ok: duplicates.ok, detail: `${duplicates.totals.duplicates} duplicates` },
  ];
  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
    summary: { readiness, gatewayRuntime, audit, baseline, logTrends, rolePolicy, duplicates },
  };
}

function nextFixSummary() {
  const fixes = [];
  const sessionPressure = sessionPressureSummary();
  const runtime = gatewayRuntimeSummary();
  for (const profile of runtime.profiles.filter((item) => !item.ok).slice(0, 3)) {
    const reason = !profile.alive
      ? "pidfile process is not alive"
      : !profile.commandMatches
        ? "pidfile points to an unexpected process"
        : "launchctl PID does not match pidfile";
    fixes.push({
      id: `gateway-runtime-${profile.id}`,
      priority: "high",
      profile: profile.id,
      title: `${profile.name}: gateway runtime mismatch`,
      detail: reason,
      action: "Restart the profile gateway and refresh pidfile/runtime state.",
      requiresUser: false,
    });
  }
  for (const profile of sessionPressure.profiles.filter((item) => item.suggestedAction !== "none").slice(0, 3)) {
    fixes.push({
      id: `session-${profile.id}`,
      priority: profile.state === "bloated" ? "high" : "medium",
      profile: profile.id,
      title: `${profile.name}: session pressure`,
      detail: `${profile.maxPromptTokens} max prompt tokens, ${profile.pressure}% of bloat limit`,
      action: profile.suggestedAction,
      requiresUser: false,
    });
  }
  const config = configDriftSummary();
  for (const profile of config.profiles.filter((item) => !item.ok).slice(0, 3)) {
    fixes.push({
      id: `config-${profile.id}`,
      priority: "medium",
      profile: profile.id,
      title: `${profile.name}: config drift`,
      detail: `${profile.fieldDrift.length} field drift, ${profile.missingToolsets.length} missing toolsets`,
      action: "Review config before changing runtime behavior.",
      requiresUser: false,
    });
  }
  const role = rolePolicySummary();
  for (const profile of role.profiles.filter((item) => !item.ok && !item.deferred).slice(0, 3)) {
    const discouragedRefs = profile.discouraged?.reduce((sum, item) => sum + item.count, 0) || profile.examples?.length || 0;
    fixes.push({
      id: `role-${profile.id}`,
      priority: "high",
      profile: profile.id,
      title: `${profile.name}: role-policy mismatch`,
      detail: `${discouragedRefs} discouraged active skill refs`,
      action: "Disable or re-home skills that do not match the role.",
      requiresUser: false,
    });
  }
  const sorted = fixes.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));
  return { ok: sorted.every((fix) => fix.priority !== "high"), totals: { fixes: sorted.length, high: sorted.filter((fix) => fix.priority === "high").length }, fixes: sorted.slice(0, 12) };
}

function priorityRank(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] || 0;
}

function profileFootprintSummary() {
  const catalog = skillCatalogSummary();
  const disabled = disabledSkillSummary();
  const readiness = readinessSummary();
  const logTrends = logTrendSummary();
  const profiles = PROFILE_ORDER.map((id) => {
    const catalogProfile = catalog.profiles.find((profile) => profile.id === id) || { total: 0, byScope: {}, tags: {} };
    const readinessProfile = readiness.profiles.find((profile) => profile.id === id) || {};
    const logProfile = logTrends.profiles.find((profile) => profile.id === id) || { freshTotal: 0, total: 0 };
    const disabledCount = disabled.skills.filter((skill) => skill.profile === id).length;
    const score = catalogProfile.total + disabledCount + (logProfile.freshTotal || 0) * 5 + (readinessProfile.status === "blocked" ? 20 : readinessProfile.status === "ready-with-warnings" ? 8 : 0);
    return {
      id,
      name: nameLabel(id),
      activeSkills: catalogProfile.total,
      disabledSkills: disabledCount,
      byScope: catalogProfile.byScope,
      tags: catalogProfile.tags,
      readiness: readinessProfile.status || "unknown",
      suggestedMode: readinessProfile.suggestedMode || "focused",
      freshLogProblems: logProfile.freshTotal || 0,
      tailLogProblems: logProfile.total || 0,
      score,
    };
  });
  return { profiles: profiles.sort((a, b) => b.score - a.score), totals: { activeSkills: catalog.totals.skills, disabledSkills: disabled.totals.total } };
}

function sessionPressureSummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const sessions = sessionSummary(id);
    const pressure = Math.min(100, Math.round((sessions.maxPromptTokens / BLOAT_TOKEN_LIMIT) * 100));
    const state = sessions.bloatedCount ? "bloated" : sessions.maxPromptTokens > BLOAT_TOKEN_LIMIT * 0.7 ? "high" : sessions.maxPromptTokens > 0 ? "active" : "empty";
    return {
      id,
      name: nameLabel(id),
      state,
      pressure,
      count: sessions.count,
      maxPromptTokens: sessions.maxPromptTokens,
      totalPromptTokens: sessions.totalPromptTokens,
      bloatedCount: sessions.bloatedCount,
      latestUpdatedAt: sessions.latestUpdatedAt,
      path: sessions.path,
      suggestedAction: sessions.bloatedCount ? "archive-session" : sessions.maxPromptTokens > BLOAT_TOKEN_LIMIT * 0.7 ? "prefer-quick-mode" : "none",
    };
  }).sort((a, b) => b.maxPromptTokens - a.maxPromptTokens);
  const totals = profiles.reduce(
    (acc, profile) => {
      acc.sessions += profile.count;
      acc.totalPromptTokens += profile.totalPromptTokens;
      acc.bloated += profile.bloatedCount;
      if (profile.state === "high") acc.high += 1;
      return acc;
    },
    { sessions: 0, totalPromptTokens: 0, bloated: 0, high: 0 },
  );
  return { ok: totals.bloated === 0, limit: BLOAT_TOKEN_LIMIT, totals, profiles };
}

function webToolPolicySummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const config = configSummary(id);
    const missingDisabled = PROFILE_DISABLED_TOOLSETS.filter((toolset) => !config.disabledToolsets.includes(toolset));
    return {
      id,
      name: nameLabel(id),
      missingDisabled,
      ok: missingDisabled.length === 0,
    };
  });
  return {
    ok: profiles.every((profile) => profile.ok),
    forbidden: WEB_RUNTIME_FORBIDDEN_TOOLSETS,
    profileDisabled: PROFILE_DISABLED_TOOLSETS,
    runtimeOnly: WEB_RUNTIME_FORBIDDEN_TOOLSETS.filter((toolset) => !PROFILE_DISABLED_TOOLSETS.includes(toolset)),
    profiles,
  };
}

function routeSummary() {
  const routes = [
    { method: "GET", path: "/api/agents", group: "agents", description: "список профилей и статус gateway" },
    { method: "GET", path: "/api/support/bundle", group: "support", description: "read-only пакет диагностики для временной поддержки" },
    { method: "GET", path: "/api/control-center", group: "diagnostics", description: "короткий верхний статус ключевых diagnostics checks" },
    { method: "GET", path: "/api/next-fixes", group: "diagnostics", description: "автоматический список следующих безопасных фиксов" },
    { method: "GET", path: "/api/profile-footprint", group: "diagnostics", description: "сравнение профилей по активным/disabled skills, readiness и свежим логам" },
    { method: "GET", path: "/api/session-pressure", group: "diagnostics", description: "карта веса active sessions по профилям" },
    { method: "GET", path: "/api/gateway-runtime", group: "diagnostics", description: "сверка pidfile, ps command и launchctl label gateway" },
    { method: "GET", path: "/api/health", group: "diagnostics", description: "общий health всех агентов" },
    { method: "GET", path: "/api/readiness", group: "diagnostics", description: "готовность профилей к безопасному web-run без запуска задач" },
    { method: "GET", path: "/api/audit", group: "diagnostics", description: "проверка правил, toolsets, legacy-процессов" },
    { method: "GET", path: "/api/incidents", group: "diagnostics", description: "классификация свежих проблем в gateway logs" },
    { method: "GET", path: "/api/log-trends", group: "diagnostics", description: "классификация последних 2000 строк gateway logs по профилям" },
    { method: "GET", path: "/api/telegram-dependency", group: "diagnostics", description: "следы Telegram/VPN-зависимости в логах профилей" },
    { method: "GET", path: "/api/legacy-skills", group: "diagnostics", description: "активные direct skills с legacy/OpenClaw-триггерами" },
    { method: "GET", path: "/api/bundled-skills", group: "diagnostics", description: "проверка глобального bundled skill dump" },
    { method: "GET", path: "/api/context-surface", group: "diagnostics", description: "проверка searchable backup/OpenClaw/OpenDesign dumps в рабочих деревьях" },
    { method: "GET", path: "/api/skill-prompt-policy", group: "diagnostics", description: "проверка, что skills в system prompt lazy/on-demand, а не mandatory" },
    { method: "GET", path: "/api/telegram-lite-router", group: "diagnostics", description: "проверка zero-tool роутера для простых Telegram-сообщений" },
    { method: "GET", path: "/api/session-token-guard", group: "diagnostics", description: "проверка авто-ротации раздутых сессий" },
    { method: "GET", path: "/api/skill-risks", group: "diagnostics", description: "карта тяжелых/сетевых/браузерных active skills" },
    { method: "GET", path: "/api/role-policy", group: "diagnostics", description: "read-only проверка skill-классов против роли профиля" },
    { method: "GET", path: "/api/duplicate-skills", group: "diagnostics", description: "дубли active skills между workspace и profile" },
    { method: "GET", path: "/api/skill-catalog", group: "diagnostics", description: "каталог активных skills по профилям и scope" },
    { method: "GET", path: "/api/disabled-skills", group: "diagnostics", description: "инвентарь skills, вынесенных в .disabled-skills" },
    { method: "GET", path: "/api/rule-audit", group: "diagnostics", description: "аудит SOUL/active skills на стартовый долгоебизм и legacy-инструкции" },
    { method: "GET", path: "/api/model-matrix", group: "diagnostics", description: "модели, провайдеры, лимиты и признаки проблем по профилям" },
    { method: "GET", path: "/api/config-drift", group: "diagnostics", description: "отклонения config.yaml от общей нормы профилей" },
    { method: "GET", path: "/api/baseline", group: "diagnostics", description: "drift hygiene-конфигурации относительно baseline" },
    { method: "POST", path: "/api/baseline", group: "diagnostics", description: "сохраняет текущую hygiene-конфигурацию как baseline" },
    { method: "GET", path: "/api/tool-policy", group: "diagnostics", description: "проверка forbidden web toolsets по профилям" },
    { method: "GET", path: "/api/inventory", group: "maintenance", description: "активные sessions и архивы по профилям" },
    { method: "GET", path: "/api/maintenance", group: "maintenance", description: "локальные runs, snapshots и approvals" },
    { method: "GET", path: "/api/self-test", group: "maintenance", description: "syntax/audit/obsidian/legacy smoke-check" },
    { method: "GET", path: "/api/export", group: "maintenance", description: "полный read-only export текущего состояния" },
    { method: "GET", path: "/api/preflights", group: "maintenance", description: "история dry-run preflight проверок" },
    { method: "POST", path: "/api/actions/prune-history", group: "maintenance", description: "чистит старые локальные runs/snapshots и orphan approvals" },
    { method: "POST", path: "/api/actions/cleanup-legacy", group: "maintenance", description: "останавливает найденные legacy OpenClaw/browser процессы" },
    { method: "GET", path: "/api/resources", group: "resources", description: "Obsidian и skills по профилям" },
    { method: "GET", path: "/api/snapshots", group: "snapshots", description: "список сохраненных diagnostics snapshots" },
    { method: "POST", path: "/api/snapshots", group: "snapshots", description: "создает diagnostics snapshot" },
    { method: "GET", path: "/api/snapshots/:id", group: "snapshots", description: "читает один snapshot" },
    { method: "GET", path: "/api/agents/:id/diagnostics", group: "agent", description: "детальная диагностика профиля" },
    { method: "POST", path: "/api/agents/:id/preflight", group: "agent", description: "проверка перед запуском web run" },
    { method: "POST", path: "/api/prompt-router", group: "agent", description: "dry-run рекомендация профиля по тексту задачи" },
    { method: "GET", path: "/api/agents/:id/chats", group: "agent", description: "последние реальные Hermes-сессии профиля" },
    { method: "GET", path: "/api/agents/:id/chats/:sessionId/messages", group: "agent", description: "сообщения реальной Hermes-сессии" },
    { method: "GET", path: "/api/agents/:id/logs", group: "agent", description: "tail gateway.log профиля" },
    { method: "POST", path: "/api/agents/:id/restart-gateway", group: "agent", description: "перезапускает gateway профиля" },
    { method: "GET", path: "/api/agents/:id/telegram", group: "agent", description: "статус Telegram Bot Token без раскрытия токена" },
    { method: "POST", path: "/api/agents/:id/telegram", group: "agent", description: "сохраняет Telegram Bot Token и перезапускает gateway" },
    { method: "GET", path: "/api/models", group: "settings", description: "доступные варианты модели и текущая модель по профилям" },
    { method: "POST", path: "/api/models", group: "settings", description: "сохраняет модель по профилям и перезапускает измененные gateway" },
    { method: "POST", path: "/api/agents/:id/archive-sessions", group: "agent", description: "архивирует sessions без перезапуска gateway" },
    { method: "POST", path: "/api/agents/:id/reset-sessions", group: "agent", description: "архивирует sessions и перезапускает gateway профиля" },
    { method: "GET", path: "/api/runs", group: "runs", description: "история web runs" },
    { method: "GET", path: "/api/runs/:id", group: "runs", description: "детали web run" },
    { method: "POST", path: "/api/runs", group: "runs", description: "запускает задачу агенту через web shell" },
    { method: "GET", path: "/api/runs/:id/events", group: "runs", description: "SSE stream событий run" },
    { method: "POST", path: "/api/runs/:id/approval", group: "runs", description: "ответ на approval request" },
    { method: "POST", path: "/api/runs/:id/stop", group: "runs", description: "останавливает активный web run" },
  ];
  return { routes, groups: [...new Set(routes.map((route) => route.group))].sort() };
}

function healthSummary() {
  const agents = listAgents()
    .map((agent) => supportSection(agent.id, () => agentDiagnostics(agent.id)))
    .filter((section) => section.ok)
    .map((section) => section.value);
  return {
    agents,
    forbiddenProcesses: forbiddenProcesses(),
    activeRuns: [...runs.values()]
      .filter((run) => ["starting", "running"].includes(run.status))
      .map((run) => safeRun(run, { includeEvents: false })),
  };
}

function supportSection(name, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function supportProcessRows() {
  return inspectProcessText()
    .split(/\r?\n/)
    .filter((line) => /hermes|infobiz|server\.mjs|gateway run|node .*web-shell/i.test(line))
    .filter((line) => !/ rg |sed -n|ps -axo/.test(line))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function supportServiceSummary() {
  if (process.platform === "linux") {
    const services = ["infobiz-web-shell.service", ...PROFILE_ORDER.map((id) => systemdGatewayService(id))];
    return {
      platform: "linux",
      services: services.map((service) => ({
        service,
        isActive: safeCommand("systemctl", ["is-active", service]),
        status: safeCommand("systemctl", ["status", service, "--no-pager", "-l"]),
        journal: safeCommand("journalctl", ["-u", service, "-n", "80", "--no-pager"]),
      })),
    };
  }
  if (process.platform === "darwin") {
    const uid = String(process.getuid?.() || 501);
    const webShellLabel = "com.infobiz.agents.web-shell";
    return {
      platform: "darwin",
      uid,
      launchctl: {
        webShell: safeCommand("launchctl", ["print", `gui/${uid}/${webShellLabel}`]),
        gateways: launchctlGatewayRows(),
      },
      plists: [
        safeTail(join(LAUNCH_AGENTS_DIR, `${webShellLabel}.plist`), 260),
        ...PROFILE_ORDER.map((id) => safeTail(join(LAUNCH_AGENTS_DIR, `${gatewayLabel(id)}.plist`), 180)),
      ],
    };
  }
  return { platform: process.platform, note: "service summary is not implemented for this platform" };
}

function profileRuntimeFiles(agentId) {
  const dir = profileDir(agentId);
  const soul = readText(join(dir, "SOUL.md"), "");
  const config = readText(join(dir, "config.yaml"), "");
  const env = readText(join(dir, ".env"), "");
  const kanbanMatch = config.match(/^kanban:\s*\n(?:  .*\n)*?  dispatch_in_gateway:\s*(true|false)\s*$/m);
  const modelMatch = config.match(/^\s*(?:default|model):\s*['"]?([^'"\n]+)['"]?\s*$/m);
  const stt = sttConfigSummary(agentId);
  return {
    profileDir: dir,
    soulExists: existsSync(join(dir, "SOUL.md")),
    soulTitle: (soul.match(/^#\s+(.+)$/m)?.[1] || "").slice(0, 180),
    soulHead: soul.split(/\r?\n/).slice(0, 12).join("\n"),
    configExists: existsSync(join(dir, "config.yaml")),
    kanbanDispatchInGateway: kanbanMatch ? kanbanMatch[1] === "true" : null,
    modelHint: modelMatch ? modelMatch[1].trim() : "",
    envExists: existsSync(join(dir, ".env")),
    telegramConfigured: Boolean(readEnvValue(env, "TELEGRAM_BOT_TOKEN")),
    sttProvider: stt.provider,
    groqSttConfigured: Boolean(readEnvValue(env, "GROQ_API_KEY")),
    kanbanEnv: readEnvValue(env, "HERMES_KANBAN_DISPATCH_IN_GATEWAY"),
    hermesHomeEnv: readEnvValue(env, "HERMES_HOME"),
  };
}

function supportBundle() {
  const agents = PROFILE_ORDER
    .filter((id) => existsSync(profileDir(id)))
    .map((id) => ({
      id,
      name: nameLabel(id),
      diagnostics: supportSection("diagnostics", () => agentDiagnostics(id)),
      telegram: supportSection("telegram", () => telegramSettings(id)),
      voice: supportSection("voice", () => voiceSettings(id)),
      runtimeFiles: supportSection("runtimeFiles", () => profileRuntimeFiles(id)),
      logs: {
        gateway: safeTail(join(profileDir(id), "logs", "gateway.log"), 260),
        gatewayError: safeTail(join(profileDir(id), "logs", "gateway.error.log"), 180),
      },
    }));
  const bundle = {
    ok: true,
    generatedAt: new Date().toISOString(),
    runtime: {
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      host: HOST,
      port: PORT,
      homeDir: HOME_DIR,
      installRoot: INSTALL_ROOT,
      webShellRoot: __dirname,
      hermesRoot: HERMES_ROOT,
      hermesAgentRoot: HERMES_AGENT_ROOT,
      workspaceRoot: WORKSPACE_ROOT,
      obsidianVault: OBSIDIAN_VAULT,
      profileOrder: PROFILE_ORDER,
      authEnabled: Boolean(WEB_SHELL_ACCESS_TOKEN),
    },
    summaries: {
      agents: supportSection("agents", () => listAgents()),
      controlCenter: supportSection("controlCenter", () => controlCenterSummary()),
      health: supportSection("health", () => healthSummary()),
      readiness: supportSection("readiness", () => readinessSummary()),
      gatewayRuntime: supportSection("gatewayRuntime", () => gatewayRuntimeSummary()),
      incidents: supportSection("incidents", () => incidentSummary()),
      logTrends: supportSection("logTrends", () => logTrendSummary()),
      telegram: supportSection("telegram", () => telegramSettingsAll()),
    },
    agents,
    logs: {
      webShellOut: safeTail(join(INSTALL_ROOT, "web-shell.out.log"), 260),
      webShellErr: safeTail(join(INSTALL_ROOT, "web-shell.err.log"), 260),
      install: safeTail(join(INSTALL_ROOT, "install.log"), 180),
      update: safeTail(join(INSTALL_ROOT, "update.log"), 180),
    },
    processes: supportSection("processes", () => supportProcessRows()),
    services: supportSection("services", () => supportServiceSummary()),
  };
  return redactSensitive(bundle);
}

function createSnapshot() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const path = join(SNAPSHOTS_DIR, `diagnostics-${stamp}.json`);
  const snapshot = {
    createdAt: new Date().toISOString(),
    audit: auditSummary(),
    controlCenter: controlCenterSummary(),
    nextFixes: nextFixSummary(),
    profileFootprint: profileFootprintSummary(),
    sessionPressure: sessionPressureSummary(),
    health: healthSummary(),
    readiness: readinessSummary(),
    incidents: incidentSummary(),
    logTrends: logTrendSummary(),
    contextSurface: contextSurfaceSummary(),
    skillPromptPolicy: skillPromptPolicySummary(),
    telegramLiteRouter: telegramLiteRouterSummary(),
    legacySkills: legacySkillSummary(),
    bundledSkills: bundledSkillDumpSummary(),
    skillRisks: skillRiskSummary(),
    rolePolicy: rolePolicySummary(),
    duplicateSkills: duplicateSkillSummary(),
    skillCatalog: skillCatalogSummary(),
    disabledSkills: disabledSkillSummary(),
    ruleAudit: ruleAuditSummary(),
    modelMatrix: modelMatrixSummary(),
    configDrift: configDriftSummary(),
    resources: resourceSummary(),
    runs: [...runs.values()].map((run) => safeRun(run, { includeEvents: false })),
  };
  atomicWriteFile(path, JSON.stringify(snapshot, null, 2), "utf8");
  pruneFiles(SNAPSHOTS_DIR, (name) => name.endsWith(".json"), SNAPSHOT_HISTORY_LIMIT);
  return { ok: true, path, snapshot };
}

function listSnapshots() {
  return readdirSync(SNAPSHOTS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const path = join(SNAPSHOTS_DIR, name);
      const info = statSync(path);
      return { id: name.replace(/\.json$/, ""), name, path, size: info.size, mtimeMs: info.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, SNAPSHOT_HISTORY_LIMIT);
}

function readSnapshot(id) {
  const name = id.endsWith(".json") ? id : `${id}.json`;
  if (!/^diagnostics-[A-Za-z0-9T]+\.json$/.test(name)) throw new Error("invalid snapshot id");
  const path = join(SNAPSHOTS_DIR, name);
  if (!existsSync(path)) throw new Error("snapshot not found");
  return { path, snapshot: readJson(path, {}) };
}

function maintenanceSummary() {
  const runFiles = readdirSync(RUNS_DIR).filter((name) => name.startsWith("run_") && name.endsWith(".json"));
  const snapshotFiles = readdirSync(SNAPSHOTS_DIR).filter((name) => name.endsWith(".json"));
  const approvalDirs = readdirSync(APPROVALS_DIR).filter((name) => name.startsWith("run_"));
  const preflightFiles = readdirSync(PREFLIGHTS_DIR).filter((name) => name.startsWith("preflight_") && name.endsWith(".json"));
  return {
    limits: { runs: RUN_HISTORY_LIMIT, snapshots: SNAPSHOT_HISTORY_LIMIT, preflights: PREFLIGHT_HISTORY_LIMIT },
    counts: { runs: runFiles.length, snapshots: snapshotFiles.length, approvals: approvalDirs.length, preflights: preflightFiles.length },
    dirs: { runs: RUNS_DIR, snapshots: SNAPSHOTS_DIR, approvals: APPROVALS_DIR, preflights: PREFLIGHTS_DIR },
  };
}

function listArchivesFor(dir) {
  if (!existsSync(dir)) return [];
  const roots = [
    { root: dir, names: readdirSync(dir) },
    { root: join(dir, ".archives"), names: existsSync(join(dir, ".archives")) ? readdirSync(join(dir, ".archives")) : [] },
  ];
  return roots.flatMap(({ root, names }) => names
    .filter((name) => name.startsWith("sessions.archive-") || name.startsWith("config.yaml.bak") || name.startsWith("state.backup"))
    .map((name) => {
      const path = join(root, name);
      const info = statSync(path);
      return { name, path, type: info.isDirectory() ? "dir" : "file", size: info.size, mtimeMs: info.mtimeMs };
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function inventorySummary() {
  const profiles = PROFILE_ORDER.map((id) => {
    const dir = profileDir(id);
    const archives = listArchivesFor(dir);
    return {
      id,
      name: nameLabel(id),
      path: dir,
      activeSession: sessionSummary(id),
      archives,
      archiveCount: archives.length,
      config: checkFile(join(dir, "config.yaml")),
      soul: checkFile(join(dir, "SOUL.md")),
      stateDb: checkFile(join(dir, "state.db")),
    };
  });
  const totals = profiles.reduce(
    (acc, profile) => {
      acc.archives += profile.archiveCount;
      acc.sessionArchives += profile.archives.filter((item) => item.name.startsWith("sessions.archive-")).length;
      acc.configBackups += profile.archives.filter((item) => item.name.startsWith("config.yaml.bak")).length;
      acc.stateBackups += profile.archives.filter((item) => item.name.startsWith("state.backup")).length;
      return acc;
    },
    { archives: 0, sessionArchives: 0, configBackups: 0, stateBackups: 0 },
  );
  return { totals, profiles };
}

function archiveIsolationSummary() {
  const inventory = inventorySummary();
  const leaks = inventory.profiles.flatMap((profile) =>
    profile.archives
      .filter((archive) => !archive.path.includes("/.archives/"))
      .map((archive) => ({ profile: profile.id, ...archive })),
  );
  return {
    ok: leaks.length === 0,
    leaks,
    archiveCount: inventory.totals.archives,
  };
}

function selfTestSummary() {
  const checks = [
    { id: "server-file", label: "server.mjs exists", ok: checkFile(join(__dirname, "server.mjs")).exists },
    { id: "runner-file", label: "runner.py exists", ok: checkFile(join(__dirname, "runner.py")).exists },
    { id: "ui-file", label: "public/app.js exists", ok: checkFile(join(__dirname, "public", "app.js")).exists },
    commandCheck("server-syntax", "server.mjs syntax", process.execPath, ["--check", join(__dirname, "server.mjs")]),
    commandCheck("ui-syntax", "public/app.js syntax", process.execPath, ["--check", join(__dirname, "public", "app.js")]),
    commandCheck("runner-syntax", "runner.py syntax", HERMES_PYTHON, ["-m", "py_compile", join(__dirname, "runner.py")]),
    { id: "audit", label: "audit ok", ok: auditSummary().ok },
    { id: "tool-policy", label: "web forbidden toolsets filtered", ok: webToolPolicySummary().ok },
    { id: "telegram-lite-router", label: "Telegram zero-tool router enabled", ok: telegramLiteRouterSummary().ok },
    { id: "session-token-guard", label: "bloated sessions auto-rotate", ok: sessionTokenGuardSummary().ok },
    { id: "gateway-runtime", label: "gateway pidfiles match running launchctl jobs", ok: gatewayRuntimeSummary().ok },
    { id: "role-policy", label: "non-deferred profiles match role skill policy", ok: rolePolicySummary().ok },
    { id: "duplicate-skills", label: "no duplicate active workspace/profile skills", ok: duplicateSkillSummary().ok },
    { id: "rule-audit", label: "profile rules do not force eager/legacy work", ok: ruleAuditSummary().ok },
    { id: "archive-isolation", label: "archives live under .archives", ok: archiveIsolationSummary().ok },
    { id: "obsidian", label: "Obsidian vault exists", ok: existsSync(OBSIDIAN_VAULT) },
    { id: "legacy", label: "no forbidden legacy processes", ok: forbiddenProcesses().length === 0 },
  ];
  return { ok: checks.every((check) => check.ok), checks, checkedAt: new Date().toISOString() };
}

function pruneHistory() {
  const prunedRuns = pruneFiles(RUNS_DIR, (name) => name.startsWith("run_") && name.endsWith(".json"), RUN_HISTORY_LIMIT);
  const prunedSnapshots = pruneFiles(SNAPSHOTS_DIR, (name) => name.endsWith(".json"), SNAPSHOT_HISTORY_LIMIT);
  const prunedPreflights = pruneFiles(PREFLIGHTS_DIR, (name) => name.startsWith("preflight_") && name.endsWith(".json"), PREFLIGHT_HISTORY_LIMIT);
  const knownRunIds = new Set([...runs.keys()]);
  const removedApprovals = [];
  for (const name of readdirSync(APPROVALS_DIR).filter((entry) => entry.startsWith("run_"))) {
    if (knownRunIds.has(name)) continue;
    const path = join(APPROVALS_DIR, name);
    try {
      for (const child of readdirSync(path)) unlinkSync(join(path, child));
      rmdirSync(path);
      removedApprovals.push(path);
    } catch {
      // Best-effort cleanup.
    }
  }
  for (const removedPath of prunedRuns.removed) {
    const id = removedPath.split("/").pop()?.replace(/\.json$/, "");
    if (id) runs.delete(id);
  }
  return { ok: true, runs: prunedRuns, snapshots: prunedSnapshots, preflights: prunedPreflights, approvals: { removed: removedApprovals }, maintenance: maintenanceSummary() };
}

function exportState() {
  return {
    exportedAt: new Date().toISOString(),
    audit: auditSummary(),
    controlCenter: controlCenterSummary(),
    nextFixes: nextFixSummary(),
    profileFootprint: profileFootprintSummary(),
    sessionPressure: sessionPressureSummary(),
    gatewayRuntime: gatewayRuntimeSummary(),
    health: healthSummary(),
    readiness: readinessSummary(),
    modelMatrix: modelMatrixSummary(),
    configDrift: configDriftSummary(),
    incidents: incidentSummary(),
    logTrends: logTrendSummary(),
    contextSurface: contextSurfaceSummary(),
    skillPromptPolicy: skillPromptPolicySummary(),
    legacySkills: legacySkillSummary(),
    bundledSkills: bundledSkillDumpSummary(),
    skillRisks: skillRiskSummary(),
    rolePolicy: rolePolicySummary(),
    duplicateSkills: duplicateSkillSummary(),
    skillCatalog: skillCatalogSummary(),
    disabledSkills: disabledSkillSummary(),
    ruleAudit: ruleAuditSummary(),
    baseline: baselineDriftSummary(),
    toolPolicy: webToolPolicySummary(),
    sessionTokenGuard: sessionTokenGuardSummary(),
    resources: resourceSummary(),
    maintenance: maintenanceSummary(),
    preflights: { stats: preflightStats(), records: listPreflights() },
    inventory: inventorySummary(),
    archiveIsolation: archiveIsolationSummary(),
    selfTest: selfTestSummary(),
    snapshots: listSnapshots(),
    runs: [...runs.values()].map((run) => safeRun(run, { includeEvents: false })),
  };
}

function auditSummary() {
  const requiredDisabled = ["browser", "chatplace", "cronjob", "delegation", "kanban", "memory", "session_search", "todo", "tts"];
  const legacySkills = legacySkillSummary();
  const bundledSkills = bundledSkillDumpSummary();
  const contextSurface = contextSurfaceSummary();
  const skillPromptPolicy = skillPromptPolicySummary();
  const telegramLiteRouter = telegramLiteRouterSummary();
  const sessionTokenGuard = sessionTokenGuardSummary();
  const gatewayRuntime = gatewayRuntimeSummary();
  const sharedLegacyDisabled = ["dogfood", "openclaw-imports", "yuanbao"].every((name) => legacySkills.disabledShared.includes(name));
  const agents = PROFILE_ORDER.map((id) => {
    const cfg = configSummary(id);
    const soul = readText(join(profileDir(id), "SOUL.md"), "");
    const sessions = sessionSummary(id);
    const missingDisabled = requiredDisabled.filter((toolset) => !cfg.disabledToolsets.includes(toolset));
    return {
      id,
      name: nameLabel(id),
      deferred: Boolean(ROLE_SKILL_POLICY[id]?.deferred),
      gateway: agentDiagnostics(id).gateway.status,
      sessions: sessions.status,
      maxPromptTokens: sessions.maxPromptTokens,
      rules: {
        trigger: soul.includes("Telegram trigger rule"),
        lazy: soul.includes("Lazy context rule"),
        antiBloat: soul.includes("Anti-bloat task rule"),
        openClawIsolation: soul.includes("OpenClaw isolation rule"),
      },
      missingDisabled,
      ok: Boolean(ROLE_SKILL_POLICY[id]?.deferred) || sessions.status === "clean" &&
        missingDisabled.length === 0 &&
        soul.includes("Telegram trigger rule") &&
        soul.includes("Lazy context rule") &&
        soul.includes("Anti-bloat task rule") &&
        soul.includes("OpenClaw isolation rule") &&
        agentDiagnostics(id).gateway.status === "running",
    };
  });
  const openclaw = openClawLaunchAgents();
  const defaultConfig = readText(join(HERMES_ROOT, "config.yaml"), "");
  const auditedAgents = agents.filter((agent) => !agent.deferred);
  const checks = [
    { id: "gateways", label: "All non-deferred gateways running", ok: auditedAgents.every((agent) => agent.gateway === "running") },
    { id: "gateway-runtime", label: "Gateway pidfiles match launchctl runtime", ok: gatewayRuntime.ok },
    { id: "sessions", label: "No unguarded bloated active non-deferred sessions", ok: auditedAgents.every((agent) => agent.sessions === "clean") || sessionTokenGuard.ok },
    { id: "rules", label: "Startup/anti-bloat/OpenClaw rules present", ok: auditedAgents.every((agent) => agent.rules.trigger && agent.rules.lazy && agent.rules.antiBloat && agent.rules.openClawIsolation) },
    { id: "toolsets", label: "Heavy toolsets disabled", ok: auditedAgents.every((agent) => agent.missingDisabled.length === 0) },
    { id: "legacy-skills", label: "No active legacy direct skills", ok: legacySkills.ok },
    { id: "bundled-skill-dump", label: "Global bundled skill dump disabled", ok: bundledSkills.ok },
    { id: "context-bloat-roots", label: "No searchable backup/OpenClaw/OpenDesign dumps", ok: contextSurface.ok },
    { id: "lazy-skill-prompt", label: "Skills prompt is lazy/on-demand, not mandatory", ok: skillPromptPolicy.ok },
    { id: "telegram-lite-router", label: "Telegram simple turns use zero-tool routing", ok: telegramLiteRouter.ok },
    { id: "session-token-guard", label: "Bloated sessions auto-rotate before agent run", ok: sessionTokenGuard.ok },
    { id: "shared-legacy-disabled", label: "Shared OpenClaw/browser/Yuanbao skills disabled", ok: sharedLegacyDisabled },
    { id: "legacy-processes", label: "No legacy OpenClaw/browser processes", ok: forbiddenProcesses().length === 0 },
    { id: "legacy-launchd", label: "No active OpenClaw launchd jobs", ok: openclaw.active.length === 0 },
    { id: "chatplace", label: "ChatPlace disabled by default", ok: /chatplace:[\s\S]*?enabled:\s*false/.test(defaultConfig) },
  ];
  return {
    ok: checks.every((check) => check.ok),
    checks,
    agents,
    openclaw,
    legacySkills,
    bundledSkills,
    contextSurface,
    skillPromptPolicy,
    telegramLiteRouter,
    sessionTokenGuard,
    gatewayRuntime,
    forbiddenProcesses: forbiddenProcesses(),
  };
}

function cleanupLegacy() {
  const before = forbiddenProcesses();
  const pids = forbiddenProcessPids();
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  const uid = String(process.getuid?.() || 501);
  for (const label of ["ai.openclaw.gateway", "ai.openclaw.obsidian-sync", "ai.openclaw.stuck-watchdog"]) {
    runCommand("launchctl", ["bootout", `gui/${uid}/${label}`]);
  }
  const after = forbiddenProcesses();
  return { ok: after.length === 0, killedPids: pids, before, after, openclaw: openClawLaunchAgents() };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function parseCookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    try {
      result[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    } catch {
      continue;
    }
  }
  return result;
}

function isAuthorizedRequest(req, url) {
  if (!WEB_SHELL_ACCESS_TOKEN) return true;
  if (isDirectLoopbackDocsRequest(req, url)) return true;
  if (url.searchParams.get("token") === WEB_SHELL_ACCESS_TOKEN) return true;
  return parseCookies(req).web_shell_token === WEB_SHELL_ACCESS_TOKEN;
}

function isDirectLoopbackDocsRequest(req, url) {
  if (!/^\/api\/docs(?:\/|$)/.test(url.pathname)) return false;
  const hasProxyIdentityHeader = Object.keys(req.headers).some(
    (name) => name === "forwarded" || name === "x-real-ip" || name.startsWith("x-forwarded-"),
  );
  if (hasProxyIdentityHeader) return false;
  const remote = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "").toLowerCase();
  if (!LOOPBACK_BIND_HOSTS.has(remote)) return false;
  try {
    const host = new URL(`http://${String(req.headers.host || "")}`).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return LOOPBACK_BIND_HOSTS.has(host);
  } catch {
    return false;
  }
}

function isSafeMutationOrigin(req) {
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(String(req.method || "").toUpperCase())) return true;
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return false;
  const origin = String(req.headers.origin || "").trim();
  if (!origin || origin === "null") return !origin;
  try {
    const parsed = new URL(origin);
    const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const requestHost = forwardedHost || String(req.headers.host || "").trim();
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === requestHost;
  } catch {
    return false;
  }
}

function handleAccessToken(req, res, url) {
  if (!WEB_SHELL_ACCESS_TOKEN) return true;
  if (url.searchParams.get("token") === WEB_SHELL_ACCESS_TOKEN) {
    if (url.pathname.startsWith("/api/")) return true;
    url.searchParams.delete("token");
    const location = `${url.pathname}${url.search}${url.hash}` || "/";
    const secure = req.socket?.encrypted || String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
    res.writeHead(302, {
      "Set-Cookie": `web_shell_token=${encodeURIComponent(WEB_SHELL_ACCESS_TOKEN)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure ? "; Secure" : ""}`,
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end();
    return false;
  }
  if (isAuthorizedRequest(req, url)) return true;
  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 401, { error: "access token required" });
  } else {
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><meta charset=\"utf-8\"><title>Агенты</title><body style=\"font-family:system-ui;margin:40px\"><h1>Нужен токен доступа</h1><p>Открой ссылку, которую показал установщик.</p></body>");
  }
  return false;
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function pushEvent(run, event) {
  run.nextEventId = Number(run.nextEventId || 0) + 1;
  const enriched = { ts: Date.now(), ...event, eventId: run.nextEventId };
  run.events.push(enriched);
  if (run.events.length > 1000) run.events.shift();
  for (const client of run.clients) {
    client.write(`id: ${enriched.eventId}\ndata: ${JSON.stringify(enriched)}\n\n`);
  }
  const warning = classifyEventWarning(enriched);
  if (warning && event.type !== "monitor.warning") {
    run.nextEventId += 1;
    const monitorEvent = { ts: Date.now(), type: "monitor.warning", warning, eventId: run.nextEventId };
    run.events.push(monitorEvent);
    if (run.events.length > 1000) run.events.shift();
    for (const client of run.clients) {
      client.write(`id: ${monitorEvent.eventId}\ndata: ${JSON.stringify(monitorEvent)}\n\n`);
    }
  }
  persistRun(run);
}

function classifyEventWarning(event) {
  const text = JSON.stringify(event);
  if (/\/Users\/serditov\/\.openclaw|agent-browser-darwin|remote-debugging-port=9222|open-design|openclaw/i.test(text)) {
    return "legacy OpenClaw/browser route detected";
  }
  if (/APITimeoutError|Request timed out|Max retries|Connection error|API call failed/i.test(text)) {
    return "provider/network retry detected";
  }
  const usage = event.usage || {};
  if (Number(usage.inputTokens || 0) > BLOAT_TOKEN_LIMIT) {
    return `large prompt detected: ${usage.inputTokens} tokens`;
  }
  return null;
}

function startRun({ profile, message, sessionId, toolMode, sourceSessionId, attachments }) {
  const agent = profile || "default";
  const dir = profileDir(agent);
  if (!existsSync(dir)) {
    throw new Error(`profile not found: ${agent}`);
  }
  const atts = (Array.isArray(attachments) ? attachments : [])
    .map((a) => ({ ...a, file: attachmentPath(a?.url) }))
    .filter((a) => a.file);
  let promptText = String(message || "");
  if (atts.length) {
    const lines = atts.map((a) => `- ${a.name || "файл"} [${a.kind || "file"}]: ${a.file}`);
    promptText = `${promptText ? `${promptText}\n\n` : ""}[Вложения от пользователя (локальные файлы, можно открыть):\n${lines.join("\n")}\n]`;
  }
  message = promptText;
  const preflight = preflightSummary(agent, message);
  if (!preflight.ok) {
    const failed = preflight.checks.filter((check) => !check.ok).map((check) => check.label).join("; ");
    throw new Error(`preflight failed: ${failed}`);
  }

  const runId = `run_${randomUUID().replaceAll("-", "")}`;
  const sourceHistory = buildRunConversationHistory(agent, sourceSessionId || "");
  const hermesSessionId = sessionId || `web_${agent}_${Date.now()}`;
  const approvalDir = join(APPROVALS_DIR, runId);
  mkdirSync(approvalDir, { recursive: true });
  const historyPath = join(approvalDir, "history.json");
  if (sourceHistory.history.length) {
    atomicWriteFile(historyPath, JSON.stringify(sourceHistory.history, null, 2), { encoding: "utf8", mode: 0o600 });
  }

  const run = {
    id: runId,
    profile: agent,
    sessionId: hermesSessionId,
    sourceSession: sourceHistory.source,
    status: "starting",
    guard: runGuardSnapshot(preflight),
    events: [],
    clients: new Set(),
    startedAt: Date.now(),
    proc: null,
    approvalDir,
    watchdog: null,
    nextEventId: 0,
  };
  runs.set(runId, run);

  const env = {
    ...process.env,
    HERMES_HOME: dir,
    HERMES_SESSION_KEY: hermesSessionId,
    HERMES_GATEWAY_SESSION: "1",
    AGENT_WEB_APPROVAL_DIR: approvalDir,
    AGENT_WEB_TOOL_MODE: String(toolMode || "focused"),
    WEB_SHELL_API_URL: process.env.WEB_SHELL_API_URL || `http://${HOST}:${PORT}`,
    OBSIDIAN_VAULT,
    PYTHONPATH: `${HERMES_AGENT_ROOT}${process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : ""}`,
    PATH: [
      LOCAL_BIN,
      join(HERMES_ROOT, "node", "bin"),
      join(HERMES_AGENT_ROOT, "venv", "bin"),
      process.env.PATH || "",
    ].filter(Boolean).join(":"),
  };

  const runnerArgs = [join(__dirname, "runner.py"), "--profile", agent, "--session-id", hermesSessionId, "--prompt-stdin"];
  if (sourceHistory.history.length) runnerArgs.push("--history-json", historyPath);

  const proc = spawn(HERMES_PYTHON, runnerArgs, {
    cwd: WORKSPACE_ROOT,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stdin.on("error", () => {});
  proc.stdin.end(message);

  run.proc = proc;
  run.status = "running";
  pushEvent(run, {
    type: "run.started",
    runId,
    profile: agent,
    sessionId: hermesSessionId,
    sourceSession: sourceHistory.source,
    historyMessages: sourceHistory.history.length,
    historyWarning: sourceHistory.warning,
  });
  run.watchdog = setTimeout(() => {
    if (run.status === "running") {
      pushEvent(run, { type: "monitor.warning", warning: "run is older than 2 minutes" });
    }
  }, LONG_RUN_MS);

  let stdoutBuffer = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let idx;
    while ((idx = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, idx).trim();
      stdoutBuffer = stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      try {
        pushEvent(run, JSON.parse(line));
      } catch {
        pushEvent(run, { type: "log", stream: "stdout", text: line });
      }
    }
  });

  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      pushEvent(run, { type: "log", stream: "stderr", text: line });
    }
  });

  proc.on("exit", (code, signal) => {
    if (run.watchdog) clearTimeout(run.watchdog);
    run.status = code === 0 ? "completed" : signal ? "stopped" : "failed";
    run.endedAt = Date.now();
    pushEvent(run, { type: "run.exited", code, signal, status: run.status });
    for (const client of run.clients) client.end();
    run.clients.clear();
  });

  return run;
}

function runGuardSnapshot(preflight) {
  return {
    checkedAt: new Date().toISOString(),
    ok: preflight.ok,
    failedChecks: preflight.checks.filter((check) => !check.ok).map((check) => check.id),
    promptRisk: preflight.promptRisk,
    roleRisk: {
      checked: preflight.roleRisk?.checked,
      blockers: preflight.roleRisk?.blockers || [],
      warnings: preflight.roleRisk?.warnings || [],
    },
    routing: {
      hits: preflight.routing?.hits || [],
      recommended: preflight.routing?.recommended
        ? {
            id: preflight.routing.recommended.id,
            name: preflight.routing.recommended.name,
            score: preflight.routing.recommended.score,
          }
        : null,
      selected: preflight.routing?.candidates?.find((candidate) => candidate.selected)?.id || null,
    },
    limits: preflight.limits,
  };
}

const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const UPLOAD_MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "application/pdf": ".pdf",
};

function readRawBody(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new Error("upload too large"));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("upload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function kindForMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function uploadExt(name, mime) {
  const fromName = extname(String(name || "")).toLowerCase();
  if (fromName && /^\.[a-z0-9]{1,6}$/.test(fromName)) return fromName;
  return UPLOAD_MIME_EXT[mime] || "";
}

function saveUpload({ buffer, name, mime }) {
  const existing = readdirSync(UPLOADS_DIR)
    .map((fileName) => {
      const path = join(UPLOADS_DIR, fileName);
      try {
        const stat = statSync(path);
        return stat.isFile() ? { path, size: stat.size, mtimeMs: stat.mtimeMs } : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  let totalBytes = existing.reduce((sum, file) => sum + file.size, 0);
  while (existing.length >= MAX_UPLOAD_FILES || totalBytes + buffer.length > MAX_UPLOAD_TOTAL_BYTES) {
    const oldest = existing.shift();
    if (!oldest) break;
    try {
      unlinkSync(oldest.path);
      totalBytes -= oldest.size;
    } catch {}
  }
  if (totalBytes + buffer.length > MAX_UPLOAD_TOTAL_BYTES) {
    throw new Error("upload storage quota exceeded");
  }
  const ext = uploadExt(name, mime);
  const fileName = `${randomUUID().replaceAll("-", "")}${ext}`;
  writeFileSync(join(UPLOADS_DIR, fileName), buffer);
  return {
    url: `/uploads/${fileName}`,
    name: String(name || fileName),
    mime: mime || "application/octet-stream",
    size: buffer.length,
    kind: kindForMime(mime || ""),
  };
}

function attachmentPath(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return "";
  const filePath = resolve(join(UPLOADS_DIR, url.replace("/uploads/", "")));
  return filePath.startsWith(`${UPLOADS_DIR}/`) && existsSync(filePath) && statSync(filePath).isFile() ? filePath : "";
}

function serveUpload(pathname, res) {
  const filePath = resolve(join(UPLOADS_DIR, pathname.replace("/uploads/", "")));
  if (!filePath.startsWith(`${UPLOADS_DIR}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": STATIC_MIME[extname(filePath)] || "application/octet-stream" });
  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const FILE_SERVE_ROOTS = [
  resolve(HERMES_ROOT),
  resolve(HERMES_AGENT_ROOT),
  resolve(WORKSPACE_ROOT),
  resolve(HERMES_WORKSPACES_ROOT),
];
const SERVE_MEDIA_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic",
  ".mp4", ".webm", ".mov", ".ogg", ".oga", ".mp3", ".m4a", ".wav", ".pdf",
]);

function serveAgentFile(rawPath, res) {
  const filePath = resolve(String(rawPath || ""));
  const ext = extname(filePath).toLowerCase();
  const allowed = FILE_SERVE_ROOTS.some((root) => filePath === root || filePath.startsWith(`${root}/`));
  if (!allowed || !SERVE_MEDIA_EXT.has(ext) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": STATIC_MIME[ext] || "application/octet-stream" });
  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

function serveStatic(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const publicRoot = resolve(join(__dirname, "public"));
  const filePath = resolve(join(publicRoot, pathname));
  if (!filePath.startsWith(`${publicRoot}/`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": STATIC_MIME[extname(filePath)] || "application/octet-stream" });
  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (!handleAccessToken(req, res, url)) return;
    if (!isSafeMutationOrigin(req)) {
      sendJson(res, 403, { error: "cross-site request blocked" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/agents") {
      sendJson(res, 200, { agents: listAgents() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/support/bundle") {
      if (!WEB_SHELL_ACCESS_TOKEN) {
        sendJson(res, 403, { error: "support mode is not enabled" });
        return;
      }
      sendJson(res, 200, supportBundle());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/control-center") {
      sendJson(res, 200, controlCenterSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/next-fixes") {
      sendJson(res, 200, nextFixSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/profile-footprint") {
      sendJson(res, 200, profileFootprintSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session-pressure") {
      sendJson(res, 200, sessionPressureSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/gateway-runtime") {
      sendJson(res, 200, gatewayRuntimeSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, healthSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/readiness") {
      sendJson(res, 200, readinessSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/audit") {
      sendJson(res, 200, auditSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/maintenance") {
      sendJson(res, 200, maintenanceSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/telegram") {
      sendJson(res, 200, telegramSettingsAll());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/telegram") {
      const body = await readBody(req);
      sendJson(res, 200, saveTelegramTokens(body.tokens || {}, body.allowedUsers || {}));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      sendJson(res, 200, await modelSettingsAll());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/models") {
      const body = await readBody(req);
      sendJson(res, 200, await saveModelSettings(body.models || {}));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/voice") {
      sendJson(res, 200, voiceSettingsAll());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice") {
      const body = await readBody(req);
      sendJson(res, 200, saveVoiceSettings({
        provider: body.provider,
        groqApiKey: String(body.groqApiKey || "").trim(),
        updateGroqApiKey: Object.prototype.hasOwnProperty.call(body, "groqApiKey") && String(body.groqApiKey || "").trim().length > 0,
        groqModel: body.groqModel,
        agentIds: Array.isArray(body.agentIds) ? body.agentIds : null,
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/model-matrix") {
      sendJson(res, 200, modelMatrixSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config-drift") {
      sendJson(res, 200, configDriftSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/baseline") {
      sendJson(res, 200, baselineDriftSummary());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/baseline") {
      sendJson(res, 200, createBaseline());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/incidents") {
      sendJson(res, 200, incidentSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/log-trends") {
      sendJson(res, 200, logTrendSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/telegram-dependency") {
      sendJson(res, 200, telegramDependencySummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/legacy-skills") {
      sendJson(res, 200, legacySkillSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bundled-skills") {
      sendJson(res, 200, bundledSkillDumpSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/context-surface") {
      sendJson(res, 200, contextSurfaceSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/skill-prompt-policy") {
      sendJson(res, 200, skillPromptPolicySummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/telegram-lite-router") {
      sendJson(res, 200, telegramLiteRouterSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/session-token-guard") {
      sendJson(res, 200, sessionTokenGuardSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/skill-risks") {
      sendJson(res, 200, skillRiskSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/role-policy") {
      sendJson(res, 200, rolePolicySummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/duplicate-skills") {
      sendJson(res, 200, duplicateSkillSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/skill-catalog") {
      sendJson(res, 200, skillCatalogSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/disabled-skills") {
      sendJson(res, 200, disabledSkillSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rule-audit") {
      sendJson(res, 200, ruleAuditSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tool-policy") {
      sendJson(res, 200, webToolPolicySummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/routes") {
      sendJson(res, 200, routeSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/inventory") {
      sendJson(res, 200, inventorySummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/self-test") {
      sendJson(res, 200, selfTestSummary());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/actions/prune-history") {
      sendJson(res, 200, pruneHistory());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/export") {
      sendJson(res, 200, exportState());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/preflights") {
      const preflights = listPreflights();
      sendJson(res, 200, { stats: preflightStats(preflights), preflights });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/actions/cleanup-legacy") {
      sendJson(res, 200, cleanupLegacy());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/snapshots") {
      sendJson(res, 200, createSnapshot());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/snapshots") {
      sendJson(res, 200, { snapshots: listSnapshots() });
      return;
    }

    const snapshotMatch = url.pathname.match(/^\/api\/snapshots\/([^/]+)$/);
    if (req.method === "GET" && snapshotMatch) {
      sendJson(res, 200, readSnapshot(snapshotMatch[1]));
      return;
    }

    const agentDiagMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/diagnostics$/);
    if (req.method === "GET" && agentDiagMatch) {
      sendJson(res, 200, { diagnostics: agentDiagnostics(agentDiagMatch[1]) });
      return;
    }

    const agentPreflightMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/preflight$/);
    if (req.method === "POST" && agentPreflightMatch) {
      const body = await readBody(req);
      const result = preflightSummary(agentPreflightMatch[1], body.message || "");
      const record = recordPreflight(agentPreflightMatch[1], body.message || "", result);
      sendJson(res, 200, { ...result, record });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/prompt-router") {
      const body = await readBody(req);
      sendJson(res, 200, promptRoutingSummary(body.message || "", body.selected || null));
      return;
    }

    const agentLogsMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/logs$/);
    if (req.method === "GET" && agentLogsMatch) {
      const lines = Number(url.searchParams.get("lines") || 220);
      const path = join(profileDir(agentLogsMatch[1]), "logs", "gateway.log");
      sendJson(res, 200, { path, text: redactSensitiveText(tailLines(path, Math.min(Math.max(lines, 20), 1000))) });
      return;
    }

    const agentRestartMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/restart-gateway$/);
    if (req.method === "POST" && agentRestartMatch) {
      const id = agentRestartMatch[1];
      if (!/^[a-z0-9_-]+$/i.test(id)) {
        sendJson(res, 400, { error: "invalid agent id" });
        return;
      }
      const body = await readBody(req);
      const restart = restartAgentGateway(id, { force: Boolean(body.force) });
      sendJson(res, 200, { ok: restart.ok, restarted: restart.restarted, restart, diagnostics: agentDiagnostics(id) });
      return;
    }

    const agentTelegramMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/telegram$/);
    if (req.method === "GET" && agentTelegramMatch) {
      sendJson(res, 200, telegramSettings(agentTelegramMatch[1]));
      return;
    }

    if (req.method === "POST" && agentTelegramMatch) {
      const body = await readBody(req);
      sendJson(res, 200, saveTelegramSettings(agentTelegramMatch[1], {
        token: String(body.token || "").trim(),
        allowedUsers: body.allowedUsers,
        updateToken: Object.prototype.hasOwnProperty.call(body, "token"),
        updateAllowedUsers: Object.prototype.hasOwnProperty.call(body, "allowedUsers"),
      }));
      return;
    }

    const agentVoiceMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/voice$/);
    if (req.method === "GET" && agentVoiceMatch) {
      sendJson(res, 200, voiceSettings(agentVoiceMatch[1]));
      return;
    }

    if (req.method === "POST" && agentVoiceMatch) {
      const body = await readBody(req);
      sendJson(res, 200, saveVoiceSetting(agentVoiceMatch[1], {
        provider: body.provider,
        groqApiKey: String(body.groqApiKey || "").trim(),
        updateGroqApiKey: Object.prototype.hasOwnProperty.call(body, "groqApiKey") && String(body.groqApiKey || "").trim().length > 0,
        groqModel: body.groqModel,
      }));
      return;
    }

    const agentChatsMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/chats$/);
    if (req.method === "GET" && agentChatsMatch) {
      sendJson(res, 200, listAgentChats(agentChatsMatch[1]));
      return;
    }

    const agentChatMessagesMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/chats\/([^/]+)\/messages$/);
    if (req.method === "GET" && agentChatMessagesMatch) {
      sendJson(res, 200, sessionMessages(agentChatMessagesMatch[1], agentChatMessagesMatch[2]));
      return;
    }

    const agentResetMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/reset-sessions$/);
    if (req.method === "POST" && agentResetMatch) {
      sendJson(res, 200, resetAgentSessions(agentResetMatch[1]));
      return;
    }

    const agentArchiveMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/archive-sessions$/);
    if (req.method === "POST" && agentArchiveMatch) {
      sendJson(res, 200, archiveAgentSessions(agentArchiveMatch[1]));
      return;
    }

    const agentSkillsMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/skills$/);
    if (req.method === "GET" && agentSkillsMatch) {
      sendJson(res, 200, agentSkills(agentSkillsMatch[1]));
      return;
    }

    const agentProfileMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/profile$/);
    if (req.method === "POST" && agentProfileMatch) {
      const id = agentProfileMatch[1];
      if (!/^[a-z0-9_-]+$/i.test(id)) {
        sendJson(res, 400, { error: "invalid agent id" });
        return;
      }
      const body = await readBody(req);
      const profile = setAgentProfile(id, body);
      sendJson(res, 200, { ok: true, profile });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/groups") {
      sendJson(res, 200, { groups: readGroups() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/groups") {
      const body = await readBody(req);
      try {
        sendJson(res, 201, { group: createGroup(body) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupMatch) {
      const id = groupMatch[1];
      if (req.method === "PATCH") {
        const body = await readBody(req);
        try {
          sendJson(res, 200, { group: updateGroup(id, body) });
        } catch (error) {
          sendJson(res, 404, { error: error.message });
        }
        return;
      }
      if (req.method === "DELETE") {
        sendJson(res, 200, deleteGroup(id));
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/docs") {
      sendJson(res, 200, { docs: readDocs() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/docs") {
      const body = await readBody(req);
      sendJson(res, 201, { doc: createDoc(body) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/docs/search") {
      sendJson(res, 200, searchDocs(url.searchParams.get("q") || "", url.searchParams.get("limit") || 20));
      return;
    }

    const docMatch = url.pathname.match(/^\/api\/docs\/([^/]+)$/);
    if (docMatch) {
      const id = docMatch[1];
      if (req.method === "GET") {
        const doc = readDocs().find((d) => d.id === id);
        if (!doc) {
          sendJson(res, 404, { error: "doc not found" });
          return;
        }
        sendJson(res, 200, { doc });
        return;
      }
      if (req.method === "PATCH") {
        const body = await readBody(req);
        try {
          sendJson(res, 200, { doc: updateDoc(id, body) });
        } catch (error) {
          sendJson(res, 404, { error: error.message });
        }
        return;
      }
      if (req.method === "DELETE") {
        sendJson(res, 200, deleteDoc(id));
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/api/resources") {
      sendJson(res, 200, resourceSummary());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runs") {
      sendJson(res, 200, {
        runs: [...runs.values()].map((run) => safeRun(run, { includeEvents: false })),
      });
      return;
    }

    const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (req.method === "GET" && runMatch) {
      const run = runs.get(runMatch[1]);
      if (!run) {
        sendJson(res, 404, { error: "run not found" });
        return;
      }
      sendJson(res, 200, { run: safeRun(run, { includeEvents: true }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const body = await readBody(req);
      const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;
      if ((!body.message || typeof body.message !== "string") && !hasAttachments) {
        sendJson(res, 400, { error: "message is required" });
        return;
      }
      body.message = String(body.message || "");
      const run = startRun(body);
      sendJson(res, 202, { runId: run.id, sessionId: run.sessionId, status: run.status });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/uploads") {
      const mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();
      const name = decodeURIComponent(String(req.headers["x-filename"] || "file"));
      const buffer = await readRawBody(req);
      if (!buffer.length) {
        sendJson(res, 400, { error: "empty upload" });
        return;
      }
      sendJson(res, 200, { attachment: saveUpload({ buffer, name, mime }) });
      return;
    }

    const eventsMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) {
      const run = runs.get(eventsMatch[1]);
      if (!run) {
        sendJson(res, 404, { error: "run not found" });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const requestedAfter = Number(url.searchParams.get("after") || 0);
      const headerAfter = Number(req.headers["last-event-id"] || 0);
      const after = Math.max(Number.isFinite(requestedAfter) ? requestedAfter : 0, Number.isFinite(headerAfter) ? headerAfter : 0);
      for (const event of run.events) {
        const eventId = Number(event.eventId || 0);
        if (eventId && eventId <= after) continue;
        res.write(`${eventId ? `id: ${eventId}\n` : ""}data: ${JSON.stringify(event)}\n\n`);
      }
      if (["completed", "failed", "stopped", "interrupted"].includes(run.status)) {
        res.end();
        return;
      }
      run.clients.add(res);
      req.on("close", () => run.clients.delete(res));
      return;
    }

    const approvalMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/approval$/);
    if (req.method === "POST" && approvalMatch) {
      const run = runs.get(approvalMatch[1]);
      if (!run) {
        sendJson(res, 404, { error: "run not found" });
        return;
      }
      const body = await readBody(req);
      const decision = String(body.decision || "");
      if (!["once", "session", "always", "deny"].includes(decision)) {
        sendJson(res, 400, { error: "invalid decision" });
        return;
      }
      const approvalId = String(body.approvalId || "");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(approvalId)) {
        sendJson(res, 400, { error: "invalid approvalId" });
        return;
      }
      const approvalPath = resolve(join(run.approvalDir, `${approvalId}.json`));
      if (!approvalPath.startsWith(`${resolve(run.approvalDir)}/`)) {
        sendJson(res, 400, { error: "invalid approvalId" });
        return;
      }
      atomicWriteFile(approvalPath, JSON.stringify({ decision }), { encoding: "utf8", mode: 0o600 });
      pushEvent(run, { type: "approval.sent", approvalId, decision });
      sendJson(res, 200, { ok: true });
      return;
    }

    const stopMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/stop$/);
    if (req.method === "POST" && stopMatch) {
      const run = runs.get(stopMatch[1]);
      if (!run) {
        sendJson(res, 404, { error: "run not found" });
        return;
      }
      if (run.proc && !run.proc.killed) {
        run.proc.kill("SIGTERM");
        setTimeout(() => {
          if (run.proc && !run.proc.killed && run.status === "running") run.proc.kill("SIGKILL");
        }, 5000);
      }
      pushEvent(run, { type: "run.stop_requested" });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/uploads/")) {
      serveUpload(url.pathname, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/file") {
      serveAgentFile(url.searchParams.get("path") || "", res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent web shell: http://${HOST}:${PORT}`);
});
