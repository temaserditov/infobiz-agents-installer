import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodexSupportArchive } from "../web-shell/lib/codex-package.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const output = process.env.CODEX_SUPPORT_PACKAGE || join(repoRoot, "dist", "infobiz-agents-codex-support.zip");
const archive = buildCodexSupportArchive({
  docsDir: join(repoRoot, "web-shell", "public", "support-docs"),
  environment: {
    platform: "определит Codex",
    arch: "определит Codex",
    installRoot: "$HOME/InfobizAgents",
  },
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, archive);
process.stdout.write(`${output}\n`);

