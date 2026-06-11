const BASE_URL = process.env.AGENT_SHELL_URL || "http://127.0.0.1:8787";

const checks = [
  { name: "control-center", path: "/api/control-center", ok: (data) => typeof data.ok === "boolean" && Array.isArray(data.checks) },
  { name: "next-fixes", path: "/api/next-fixes", ok: (data) => data.totals && Array.isArray(data.fixes) },
  { name: "profile-footprint", path: "/api/profile-footprint", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "session-pressure", path: "/api/session-pressure", ok: (data) => data.limit && data.totals && Array.isArray(data.profiles) },
  { name: "gateway-runtime", path: "/api/gateway-runtime", ok: (data) => data.ok === true && Array.isArray(data.profiles) && data.profiles.every((profile) => profile.ok === true) },
  { name: "self-test", path: "/api/self-test", ok: (data) => data.ok === true },
  { name: "readiness", path: "/api/readiness", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "audit", path: "/api/audit", ok: (data) => data.ok === true },
  { name: "tool-policy", path: "/api/tool-policy", ok: (data) => data.ok === true },
  { name: "legacy-skills", path: "/api/legacy-skills", ok: (data) => data.ok === true },
  { name: "bundled-skills", path: "/api/bundled-skills", ok: (data) => data.ok === true && data.activeCount === 0 },
  { name: "context-surface", path: "/api/context-surface", ok: (data) => data.ok === true && Array.isArray(data.blockedPaths) && data.blockedPaths.length === 0 && Number.isFinite(data.skillDocCount) },
  { name: "log-trends", path: "/api/log-trends", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "telegram-dependency", path: "/api/telegram-dependency", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "telegram-lite-router", path: "/api/telegram-lite-router", ok: (data) => data.ok === true && data.sourceOk === true && data.testOk === true && (data.sampleExpectations || []).length >= 6 },
  { name: "session-token-guard", path: "/api/session-token-guard", ok: (data) => data.ok === true && data.sourceOk === true && data.testOk === true && data.limit >= 20000 },
  { name: "role-policy", path: "/api/role-policy", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "duplicate-skills", path: "/api/duplicate-skills", ok: (data) => data.ok === true && data.totals },
  { name: "skill-catalog", path: "/api/skill-catalog", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "disabled-skills", path: "/api/disabled-skills", ok: (data) => data.totals?.reasons && Array.isArray(data.skills) },
  { name: "rule-audit", path: "/api/rule-audit", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "baseline", path: "/api/baseline", ok: (data) => data.hasBaseline === true && Array.isArray(data.changes) },
  { name: "routes", path: "/api/routes", ok: (data) => Array.isArray(data.routes) && data.routes.length >= 20 },
  { name: "export", path: "/api/export", ok: (data) => typeof data.controlCenter?.ok === "boolean" && Array.isArray(data.nextFixes?.fixes) && Array.isArray(data.profileFootprint?.profiles) },
  { name: "inventory", path: "/api/inventory", ok: (data) => data.totals && Array.isArray(data.profiles) && data.profiles.every((profile) => (profile.archives || []).every((archive) => archive.path.includes("/.archives/"))) },
  { name: "config-drift", path: "/api/config-drift", ok: (data) => data.totals && Array.isArray(data.profiles) },
  { name: "preflights", path: "/api/preflights", ok: (data) => data.stats && Array.isArray(data.preflights) },
];

async function readJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

const failures = [];
for (const check of checks) {
  try {
    const data = await readJson(check.path);
    if (!check.ok(data)) failures.push(`${check.name}: bad response`);
    else console.log(`ok ${check.name}`);
  } catch (error) {
    failures.push(`${check.name}: ${error.message}`);
  }
}

try {
  const safe = await postJson("/api/agents/coordinator/preflight", { message: "запиши короткую заметку в obsidian" });
  if (!safe.promptRisk?.hits?.includes("obsidian")) failures.push("preflight-safe: missing obsidian risk hint");
  else console.log("ok preflight-safe");
  const risky = await postJson("/api/agents/coordinator/preflight", { message: "открой сайт и закажи курьера" });
  if (risky.ok !== false || !risky.promptRisk?.blockers?.includes("browser")) failures.push("preflight-risky: missing browser blocker");
  else console.log("ok preflight-risky");
  const roleRisk = await postJson("/api/agents/coordinator/preflight", { message: "сгенерируй картинку для поста" });
  if (roleRisk.ok !== false || !roleRisk.roleRisk?.blockers?.includes("media-gen")) failures.push("preflight-role-risk: missing media-gen role blocker");
  else console.log("ok preflight-role-risk");
  const routed = await postJson("/api/prompt-router", { message: "запиши короткую заметку в obsidian", selected: "coordinator" });
  if (!routed.recommended?.id || !Array.isArray(routed.candidates)) failures.push("prompt-router: bad response");
  else console.log("ok prompt-router");
  const preflightRoute = await postJson("/api/agents/coordinator/preflight", { message: "запиши короткую заметку в obsidian" });
  if (!preflightRoute.routing?.recommended?.id) failures.push("preflight-routing: missing routing");
  else console.log("ok preflight-routing");
  if (!preflightRoute.limits?.bloatTokenLimit || !preflightRoute.roleRisk) failures.push("preflight-guard-shape: bad response");
  else console.log("ok preflight-guard-shape");
  if (!preflightRoute.record?.id) failures.push("preflight-record: missing record");
  else console.log("ok preflight-record");
} catch (error) {
  failures.push(`preflight: ${error.message}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `fail ${failure}`).join("\n"));
  process.exit(1);
}
