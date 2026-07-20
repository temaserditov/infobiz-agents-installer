import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createZip } from "./zip.mjs";

function text(value) {
  return String(value ?? "").replace(/\r\n/g, "\n");
}

function environmentText(environment) {
  const platformLabel = environment.platform === "darwin"
    ? "macOS"
    : environment.platform === "linux"
      ? "Linux/VPS"
      : environment.platform;
  const lines = [
    `Создан: ${environment.generatedAt || new Date().toISOString()}`,
    `Платформа агентов: ${platformLabel || "не определена"}`,
    `Архитектура: ${environment.arch || "не определена"}`,
    `Папка установки: ${environment.installRoot || "$HOME/InfobizAgents"}`,
  ];
  if (environment.sshTarget) {
    lines.push(`SSH: ${environment.sshTarget}`);
    lines.push(`Источник SSH-адреса: ${environment.sshTargetSource || "автоматически определён"}`);
  }
  lines.push("Пароли, токены и ключи в этот файл не включаются.");
  return `${lines.join("\n")}\n`;
}

function agentsInstructions(environment, hasDiagnostics) {
  const remote = environment.platform === "linux";
  const target = environment.sshTarget || "логин@IP_ИЗ_ПАНЕЛИ_VPS";
  return `# Infobiz Agents: правила ремонта

Ты помогаешь владельцу восстановить Infobiz Agents на Hermes.

1. Сначала прочитай \`docs/START_HERE.md\`, затем \`docs/CODEX_RUNBOOK.md\`,
   \`docs/SYSTEM_MAP.md\` и подходящий раздел \`docs/TROUBLESHOOTING.md\`.
2. ${hasDiagnostics ? "Используй `diagnostics.json` как снимок, но перед изменениями проверь живое состояние." : "Сначала собери живую диагностику по документации."}
3. ${remote ? `Агенты находятся на VPS. Подключись по SSH к \`${target}\`. Не проси пароль в чате: остановись и дай пользователю ввести его в SSH prompt.` : `Агенты находятся на этом Mac в \`${environment.installRoot || "$HOME/InfobizAgents"}\`. Работай с живой установкой, а не только с файлами пакета.`}
4. Не удаляй \`~/.hermes\`, профили, OAuth, Telegram-токены, память, сессии,
   документы и скиллы. Не переносись на OpenClaw-команды.
5. Перед изменением сделай резервную копию конкретного файла. Используй минимальное
   исправление и официальные команды Hermes либо актуальный Infobiz-апдейтер.
6. После исправления проверь WebShell, все установленные gateway и свежие логи.
7. Не показывай и не сохраняй секреты. Если причина внешняя, назови точный контур:
   VPS/SSH, course token, сеть, OpenAI/OAuth, Telegram либо продуктовый баг.

Пользователь опишет наблюдаемую проблему в сообщении. Сам задай только те вопросы,
ответы на которые нельзя получить из системы.
`;
}

function promptText() {
  return `Изучи приложенный пакет Infobiz Agents и почини проблему.

Сначала выполни правила из AGENTS.md. Сам собери недостающую диагностику,
найди первопричину, сделай минимальное исправление и проверь результат.

Моя проблема: опишу следующим сообщением.
`;
}

function readmeText(environment, hasDiagnostics) {
  const remote = environment.platform === "linux";
  return `ПАКЕТ ПОДДЕРЖКИ INFOBIZ AGENTS

1. Откройте Codex на Mac или Windows.
2. Загрузите этот ZIP в новую задачу либо распакуйте его и откройте папку в Codex.
3. Напишите проблему своими словами. Например: «Дизайнер перестал отвечать в Telegram».

Codex сам прочитает AGENTS.md, документацию${hasDiagnostics ? " и безопасную диагностику" : ""}.
${remote ? "Агенты находятся на VPS. Когда Codex подключится по SSH и попросит пароль, введите пароль непосредственно в терминале. Не отправляйте пароль в чат." : "Агенты находятся на этом Mac. Codex проверит живую установку в указанной папке."}

Если WebShell не работает и пакет скачан с сайта школы, диагностики внутри не будет.
Codex соберёт её самостоятельно после доступа к Mac или VPS.
`;
}

function documentationEntries(docsDir) {
  if (!docsDir || !existsSync(docsDir)) return [];
  return readdirSync(docsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({ name: `docs/${basename(name)}`, data: readFileSync(join(docsDir, name)) }));
}

export function buildCodexSupportArchive({ docsDir, diagnostics = null, environment = {} } = {}) {
  const normalizedEnvironment = {
    generatedAt: new Date().toISOString(),
    ...environment,
  };
  const hasDiagnostics = diagnostics !== null && diagnostics !== undefined;
  const entries = [
    { name: "AGENTS.md", data: agentsInstructions(normalizedEnvironment, hasDiagnostics) },
    { name: "PROMPT.txt", data: promptText() },
    { name: "README.txt", data: readmeText(normalizedEnvironment, hasDiagnostics) },
    { name: "CONNECTION.txt", data: environmentText(normalizedEnvironment) },
    { name: "environment.json", data: `${JSON.stringify(normalizedEnvironment, null, 2)}\n` },
    ...documentationEntries(docsDir),
  ];
  if (hasDiagnostics) {
    entries.push({ name: "diagnostics.json", data: `${JSON.stringify(diagnostics, null, 2)}\n` });
  }
  return createZip(entries);
}

export function codexSupportFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  return `infobiz-agents-codex-${stamp}.zip`;
}
