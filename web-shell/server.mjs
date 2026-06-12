import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || process.env.WEB_SHELL_HOST || "127.0.0.1";
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "/tmp";
const LOCAL_BIN = join(HOME_DIR, ".local", "bin");
const LAUNCH_AGENTS_DIR = join(HOME_DIR, "Library", "LaunchAgents");
const HERMES_ROOT = process.env.HERMES_ROOT || join(HOME_DIR, ".hermes");
const HERMES_AGENT_ROOT = process.env.HERMES_AGENT_ROOT || join(HERMES_ROOT, "hermes-agent");
const HERMES_PYTHON = process.env.HERMES_PYTHON || join(HERMES_AGENT_ROOT, "venv", "bin", "python3");
const HERMES_WORKSPACES_ROOT = process.env.HERMES_WORKSPACES_ROOT || join(HOME_DIR, ".hermes-workspaces");
const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE || join(HOME_DIR, "InfobizAgents", "workspace");
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || join(HOME_DIR, "InfobizAgents", "obsidian-vault");
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

const ALL_PROFILE_ORDER = ["default", "assistant", "coordinator", "copywriter", "designer", "marketer", "producer", "rop", "tech"];
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
const WEB_FORBIDDEN_TOOLSETS = ["browser", "chatplace", "cronjob", "delegation", "kanban", "memory", "session_search", "todo", "tts"];
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
  producer: { allowed: ["media-gen", "external-api"], discouraged: ["browser", "telegram", "personal-data", "shell", "obsidian", "notion"] },
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
    for (const name of readdirSync(root).sort()) {
      if (PROFILE_ALLOW.size && !PROFILE_ALLOW.has(name)) continue;
      const dir = join(root, name);
      if (!statSync(dir).isDirectory()) continue;
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
  [/gpt-5|gpt5|codex/, 400000],
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

function contextWindowForModel(model) {
  const name = String(model || "").toLowerCase();
  if (!name) return CONTEXT_WINDOW_DEFAULT;
  for (const [key, value] of Object.entries(MODEL_WINDOW_OVERRIDES)) {
    if (name.includes(String(key).toLowerCase())) return Number(value) || CONTEXT_WINDOW_DEFAULT;
  }
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
  writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), "utf8");
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
  writeFileSync(GROUPS_PATH, JSON.stringify(groups, null, 2), "utf8");
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
  writeFileSync(DOCS_PATH, JSON.stringify(docs, null, 2), "utf8");
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
    producer: "Продакшн",
    rop: "Продажник",
    tech: "Технарь",
  };
  return labels[id] || id;
}

function gatewayLabel(profile) {
  return profile === "default" ? "ai.hermes.gateway" : `ai.hermes.gateway-${profile}`;
}

function readText(path, fallback = "") {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
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
  writeFileSync(runFile(run.id), JSON.stringify(payload, null, 2), "utf8");
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
    runs.set(saved.id, {
      ...saved,
      status: ["starting", "running"].includes(saved.status) ? "interrupted" : saved.status,
      events: Array.isArray(saved.events) ? saved.events : [],
      clients: new Set(),
      proc: null,
      watchdog: null,
      approvalDir: saved.approvalDir || join(APPROVALS_DIR, saved.id),
    });
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

function expectedGatewayCommandMatches(profile, command) {
  if (!command.includes("hermes_cli.main") || !command.includes("gateway run")) return false;
  if (profile === "default") return !command.includes("--profile ");
  return command.includes(`--profile ${profile}`);
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
    const commandMatches = alive && expectedGatewayCommandMatches(id, command);
    const launchMatches = Boolean(launch?.pid && pid && Number(launch.pid) === Number(pid));
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

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    code: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
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

function listAgentChats(agentId) {
  const dir = profileDir(agentId);
  const sessionsDir = join(dir, "sessions");
  if (!existsSync(sessionsDir)) return { chats: [] };
  const indexPath = join(sessionsDir, "sessions.json");
  const index = readJson(indexPath, {});
  const byId = new Map();

  for (const entry of Object.values(index || {})) {
    if (!entry?.session_id) continue;
    const path = join(sessionsDir, `session_${entry.session_id}.json`);
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
      fileExists: existsSync(path),
      source: "index",
    });
  }

  const files = readdirSync(sessionsDir)
    .filter((name) => /^session_[A-Za-z0-9_-]+\.json$/.test(name))
    .map((name) => {
      const path = join(sessionsDir, name);
      return { name, path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, CHAT_HISTORY_LIMIT);

  for (const file of files) {
    const id = file.name.replace(/^session_/, "").replace(/\.json$/, "");
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
  if (!existsSync(path)) {
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
    { id: "gateway", label: "Gateway running", ok: diagnostics.gateway.status === "running" },
    { id: "sessions", label: "Active sessions are not bloated", ok: diagnostics.sessions.bloatedCount === 0 },
    { id: "legacy", label: "No legacy OpenClaw/browser process", ok: diagnostics.forbiddenProcesses.length === 0 },
    { id: "prompt-size", label: "Prompt size is within web-shell limit", ok: true },
    { id: "prompt-risk", label: "Prompt does not look like browser/payment/order automation", ok: promptRisk.blockers.length === 0 },
    { id: "prompt-role-policy", label: "Prompt matches selected agent role", ok: roleRisk.blockers.length === 0 },
  ];
  if (text) {
    const lower = text.toLowerCase();
    checks.push({
      id: "legacy-prompt",
      label: "Prompt does not explicitly ask for OpenClaw",
      ok: !FORBIDDEN_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase())),
    });
  }
  return {
    ok: checks.every((check) => check.ok),
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
  writeFileSync(preflightFile(id), JSON.stringify(record, null, 2), "utf8");
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
  const uid = String(process.getuid?.() || 501);
  const label = gatewayLabel(agentId);
  runCommand("launchctl", ["bootout", `gui/${uid}/${label}`]);
  const result = archiveAgentSessions(agentId, "web-reset");
  const plist = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
  runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
  runCommand("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`]);
  return { ...result, restarted: true };
}

function restartAgentGateway(agentId) {
  const dir = profileDir(agentId);
  if (!existsSync(dir)) throw new Error(`profile not found: ${agentId}`);
  const uid = String(process.getuid?.() || 501);
  const label = gatewayLabel(agentId);
  const plist = join(LAUNCH_AGENTS_DIR, `${label}.plist`);
  runCommand("launchctl", ["bootout", `gui/${uid}/${label}`]);
  if (existsSync(plist)) runCommand("launchctl", ["bootstrap", `gui/${uid}`, plist]);
  runCommand("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`]);
  return { ok: true, restarted: true, label };
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
  writeFileSync(join(sessionDir, "sessions.json"), "{}\n", "utf8");
  return { ok: true, archive, sessions: join(sessionDir, "sessions.json"), restarted: false };
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

function telegramSettings(agentId) {
  const path = envPath(agentId);
  const text = readText(path, "");
  const token = readEnvValue(text, "TELEGRAM_BOT_TOKEN");
  return {
    ok: existsSync(profileDir(agentId)),
    profile: agentId,
    configured: Boolean(token),
    tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : "",
    envPath: path,
    gateway: agentDiagnostics(agentId).gateway.status,
  };
}

function saveTelegramToken(agentId, token) {
  if (!/^[0-9]+:[A-Za-z0-9_-]{20,}$/.test(token) && token !== "") {
    throw new Error("invalid Telegram bot token");
  }
  const path = envPath(agentId);
  let text = readText(path, "");
  if (!text) text = "";
  text = writeEnvValue(text, "TELEGRAM_BOT_TOKEN", token);
  writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });
  let restart = { ok: false, restarted: false };
  try {
    restart = restartAgentGateway(agentId);
  } catch (error) {
    restart = { ok: false, restarted: false, error: error.message || String(error) };
  }
  return { ok: true, settings: telegramSettings(agentId), restart };
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
  const requiredToolsets = new Set(WEB_FORBIDDEN_TOOLSETS);
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
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf8");
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
    const missingDisabled = WEB_FORBIDDEN_TOOLSETS.filter((toolset) => !config.disabledToolsets.includes(toolset));
    return {
      id,
      name: nameLabel(id),
      missingDisabled,
      ok: missingDisabled.length === 0,
    };
  });
  return { ok: profiles.every((profile) => profile.ok), forbidden: WEB_FORBIDDEN_TOOLSETS, profiles };
}

function routeSummary() {
  const routes = [
    { method: "GET", path: "/api/agents", group: "agents", description: "список профилей и статус gateway" },
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
    { method: "GET", path: "/api/agents/:id/telegram", group: "agent", description: "статус Telegram Bot Token без раскрытия токена" },
    { method: "POST", path: "/api/agents/:id/telegram", group: "agent", description: "сохраняет Telegram Bot Token и перезапускает gateway" },
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
  return {
    agents: PROFILE_ORDER.map((id) => agentDiagnostics(id)),
    forbiddenProcesses: forbiddenProcesses(),
    activeRuns: [...runs.values()]
      .filter((run) => ["starting", "running"].includes(run.status))
      .map((run) => safeRun(run, { includeEvents: false })),
  };
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
  writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf8");
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
  const coordinatorSkills = skillsSummary("coordinator");
  const coordinatorCloseLoopDisabled =
    !coordinatorSkills.workspace.skills.includes("close-loop") &&
    !coordinatorSkills.profile.skills.includes("close-loop");
  const coordinatorActiveSkills = [...coordinatorSkills.workspace.skills, ...coordinatorSkills.profile.skills];
  const coordinatorLean =
    coordinatorActiveSkills.length === 1 &&
    coordinatorActiveSkills[0] === "internal-handoff" &&
    (skillRiskSummary().profiles.find((profile) => profile.id === "coordinator")?.riskySkills || 0) === 0;
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
    { id: "coordinator-close-loop", label: "Coordinator close-loop skill disabled", ok: coordinatorCloseLoopDisabled },
    { id: "coordinator-lean-skills", label: "Coordinator has only internal-handoff active", ok: coordinatorLean },
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
  });
  res.end(body);
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
  const enriched = { ts: Date.now(), ...event };
  run.events.push(enriched);
  if (run.events.length > 1000) run.events.shift();
  for (const client of run.clients) {
    client.write(`data: ${JSON.stringify(enriched)}\n\n`);
  }
  const warning = classifyEventWarning(enriched);
  if (warning && event.type !== "monitor.warning") {
    const monitorEvent = { ts: Date.now(), type: "monitor.warning", warning };
    run.events.push(monitorEvent);
    if (run.events.length > 1000) run.events.shift();
    for (const client of run.clients) {
      client.write(`data: ${JSON.stringify(monitorEvent)}\n\n`);
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
  const agent = profile || "coordinator";
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
    writeFileSync(historyPath, JSON.stringify(sourceHistory.history, null, 2), "utf8");
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

  const runnerArgs = [join(__dirname, "runner.py"), "--profile", agent, "--session-id", hermesSessionId, "--prompt", message];
  if (sourceHistory.history.length) runnerArgs.push("--history-json", historyPath);

  const proc = spawn(HERMES_PYTHON, runnerArgs, {
    cwd: WORKSPACE_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

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

function readRawBody(req, maxBytes = 200 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
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

function kindForMime(mime, voice) {
  if (voice) return "voice";
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

function saveUpload({ buffer, name, mime, voice }) {
  const ext = uploadExt(name, mime);
  const fileName = `${randomUUID().replaceAll("-", "")}${ext}`;
  writeFileSync(join(UPLOADS_DIR, fileName), buffer);
  return {
    url: `/uploads/${fileName}`,
    name: String(name || fileName),
    mime: mime || "application/octet-stream",
    size: buffer.length,
    kind: kindForMime(mime || "", voice),
  };
}

function attachmentPath(url) {
  if (typeof url !== "string" || !url.startsWith("/uploads/")) return "";
  const filePath = resolve(join(UPLOADS_DIR, url.replace("/uploads/", "")));
  return filePath.startsWith(UPLOADS_DIR) ? filePath : "";
}

function serveUpload(pathname, res) {
  const filePath = resolve(join(UPLOADS_DIR, pathname.replace("/uploads/", "")));
  if (!filePath.startsWith(UPLOADS_DIR) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": STATIC_MIME[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
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
  createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(join(__dirname, "public", pathname));
  if (!filePath.startsWith(join(__dirname, "public"))) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": STATIC_MIME[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/api/agents") {
      sendJson(res, 200, { agents: listAgents() });
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
      sendJson(res, 200, { path, text: tailLines(path, Math.min(Math.max(lines, 20), 1000)) });
      return;
    }

    const agentTelegramMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/telegram$/);
    if (req.method === "GET" && agentTelegramMatch) {
      sendJson(res, 200, telegramSettings(agentTelegramMatch[1]));
      return;
    }

    if (req.method === "POST" && agentTelegramMatch) {
      const body = await readBody(req);
      sendJson(res, 200, saveTelegramToken(agentTelegramMatch[1], String(body.token || "").trim()));
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
      const voice = String(req.headers["x-voice"] || "") === "1";
      const buffer = await readRawBody(req);
      if (!buffer.length) {
        sendJson(res, 400, { error: "empty upload" });
        return;
      }
      sendJson(res, 200, { attachment: saveUpload({ buffer, name, mime, voice }) });
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
      for (const event of run.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
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
      if (!approvalId) {
        sendJson(res, 400, { error: "approvalId is required" });
        return;
      }
      writeFileSync(join(run.approvalDir, `${approvalId}.json`), JSON.stringify({ decision }), "utf8");
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
