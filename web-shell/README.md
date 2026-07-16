# Agent Web Shell

Local web interface for Hermes agents. It is designed to reduce Telegram/VPN dependency and keep diagnostics visible before an agent digs itself into a bad session.

## Run

```bash
npm start
```

Default URL:

```text
http://127.0.0.1:8787
```

## Check

```bash
npm run check
```

This checks server syntax, browser script syntax, and Python runner syntax.

```bash
npm run smoke
```

This verifies the running local shell health endpoints without starting any agent task.

## Safe Read-Only Endpoints

- `GET /api/agents` - profiles and gateway status.
- `GET /api/control-center` - compact top-level status across readiness, audit, logs, baseline, role policy, and duplicates.
- `GET /api/next-fixes` - prioritized read-only list of next safe fixes.
- `GET /api/profile-footprint` - profile footprint comparison by active/disabled skills, readiness, and log pressure.
- `GET /api/session-pressure` - active session token pressure by profile.
- `GET /api/health` - all-agent health summary.
- `GET /api/readiness` - per-agent readiness before a web-shell run, without starting tasks.
- `GET /api/audit` - sessions, startup rules, disabled toolsets, legacy process checks.
- `GET /api/incidents` - classified recent log problems: provider, approval, legacy, context.
- `GET /api/log-trends` - classified recent gateway log history over the last 2000 lines per profile.
- `GET /api/telegram-dependency` - read-only view of Telegram/VPN-sensitive log lines by profile.
- `GET /api/legacy-skills` - direct active skills with legacy/OpenClaw triggers.
- `GET /api/skill-risks` - active skills grouped by browser, Telegram, external API, media generation, storage, and shell risk markers.
- `GET /api/role-policy` - read-only role fit check for active skill classes; designer is deferred for separate review.
- `GET /api/duplicate-skills` - duplicate active skills between workspace and profile scopes.
- `GET /api/skill-catalog` - active skills by profile, scope, description, and capability tags.
- `GET /api/disabled-skills` - inventory of skills moved into `.disabled-skills`.
- `GET /api/rule-audit` - scans SOUL and active skills for eager-tool and legacy instructions.
- `GET /api/model-matrix` - provider/model/retry/session warning matrix.
- `GET /api/voice` - global speech-to-text policy and its state across all installed agents.
- `POST /api/voice` - saves one Hermes/Groq speech-to-text policy for current and future agents.
- `GET /api/config-drift` - read-only config drift against the common profile shape.
- `GET /api/baseline` - drift against the saved hygiene baseline.
- `POST /api/baseline` - saves the current hygiene state as baseline.
- `GET /api/tool-policy` - verifies web-shell forbidden toolsets stay disabled and filtered.
- `GET /api/inventory` - archives and active session state per profile.
- `GET /api/maintenance` - local web-shell run/snapshot/approval counts.
- `GET /api/self-test` - smoke check for shell files and Hermes hygiene.
- `GET /api/preflights` - local history of dry-run preflight checks.
- `GET /api/resources` - Obsidian and skill availability.
- `GET /api/routes` - API route index.
- `GET /api/export` - one JSON state bundle, including control center and profile footprint.
- `POST /api/agents/:id/preflight` - dry check before starting a web-shell run.
- `POST /api/prompt-router` - dry-run profile recommendation by prompt text.
- Preflight includes prompt risk preview, role-policy matching, and blocks browser/payment/order automation before an agent starts.

## Mutating Endpoints

- `POST /api/runs` - starts an agent task.
- `POST /api/runs/:id/stop` - stops a web-shell run.
- `POST /api/runs/:id/approval` - sends approval decision to a run.
- `POST /api/snapshots` - stores a diagnostics snapshot.
- `POST /api/actions/prune-history` - prunes old local run/snapshot/approval files.
- `POST /api/actions/cleanup-legacy` - kills detected legacy OpenClaw/browser processes.
- `POST /api/agents/:id/reset-sessions` - archives sessions and restarts that profile gateway.
- `POST /api/telegram` - saves per-agent Telegram bot tokens and `TELEGRAM_ALLOWED_USERS`, then restarts changed gateways.
- `POST /api/agents/:id/telegram` - saves Telegram settings for one agent.

## Notes

- The web shell should not call Telegram.
- Read-only diagnostics must not start agent runs.
- Real task execution still goes through Hermes, but with focused tool mode by default.
- Even `Full profile` mode is guarded: browser, delegation, memory, cron, todo, TTS, and similar toolsets are filtered in the web runner.
