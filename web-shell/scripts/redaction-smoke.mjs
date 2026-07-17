import assert from "node:assert/strict";
import { redactSensitiveText, redactSupportLogText, redactSupportValue } from "../lib/redaction.mjs";

const token = "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi";
const generic = redactSensitiveText(`TELEGRAM_BOT_TOKEN=${token}`);
assert(!generic.includes(token));
assert(generic.includes("[redacted]"));

const support = redactSupportLogText([
  `msg='сделай стратегию по моим личным данным' chat_id=123456789`,
  `Cached user document at /Users/roman/Documents/Очень личный документ.docx`,
  `session=agent:main:telegram:dm:123456789 token=${token}`,
].join("\n"));

assert(!support.includes("сделай стратегию"));
assert(!support.includes("Очень личный документ"));
assert(!support.includes("123456789"));
assert(!support.includes(token));
assert(support.includes("[redacted-user-text]"));
assert(support.includes("[redacted-user-document]"));
assert(support.includes("[redacted-id]"));

const structured = redactSupportValue({
  soulHead: "секретный системный промпт",
  chatId: 123456789,
  nested: { message: "личное сообщение", model: "gpt-test" },
});
assert.equal(structured.soulHead, "[redacted-user-text]");
assert.equal(structured.chatId, "[redacted-id]");
assert.equal(structured.nested.message, "[redacted-user-text]");
assert.equal(structured.nested.model, "gpt-test");

console.log("WebShell support redaction smoke passed.");
