import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCodexSupportArchive } from "../lib/codex-package.mjs";

function centralDirectoryEntries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(eocd >= 0, "ZIP end-of-central-directory is missing");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "invalid central-directory entry");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      unixMode: (buffer.readUInt32LE(offset + 38) >>> 16) & 0xffff,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const root = mkdtempSync(join(tmpdir(), "infobiz-codex-package-"));
try {
  writeFileSync(join(root, "START_HERE.md"), "# Test docs\n");
  const archive = buildCodexSupportArchive({
    docsDir: root,
    diagnostics: { ok: true, token: "[redacted]" },
    environment: { platform: "linux", arch: "x64", installRoot: "/root/InfobizAgents", sshTarget: "root@example.test" },
  });
  const entries = centralDirectoryEntries(archive);
  const names = entries.map((entry) => entry.name);
  for (const required of ["AGENTS.md", "PROMPT.txt", "README.txt", "CONNECTION.txt", "environment.json", "diagnostics.json", "docs/START_HERE.md"]) {
    assert(names.includes(required), `missing ${required}`);
  }
  assert(entries.every((entry) => entry.unixMode === 0o100644), "ZIP files must extract with 0644 permissions");
  assert(archive.length > 500, "support archive is unexpectedly small");
  console.log("Codex support package smoke passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
