export function redactSensitiveText(value) {
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

export function redactSupportLogText(value) {
  return redactSensitiveText(value)
    // Gateway logs may contain complete user prompts. They are not required
    // to diagnose timing, transport, provider, or persistence failures.
    .replace(/\b(msg|message|prompt|query|caption|content)=("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+)/gi, "$1=[redacted-user-text]")
    .replace(/(Cached user document at\s+)[^\r\n]+/gi, "$1[redacted-user-document]")
    .replace(/(user document(?:s)?(?:\s+at|\s*:)?\s+)[^\r\n]+/gi, "$1[redacted-user-document]")
    .replace(/\b(chat_id|user_id|sender_id|chat)=\d{5,}\b/gi, "$1=[redacted-id]")
    .replace(/(telegram:(?:dm|group|channel):)\d{5,}/gi, "$1[redacted-id]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[user]")
    .replace(/\/home\/[^/\s]+/g, "/home/[user]");
}

export function redactSupportValue(value) {
  if (typeof value === "string") return redactSupportLogText(value);
  if (Array.isArray(value)) return value.map((item) => redactSupportValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/token|secret|password|authorization|api[_-]?key/i.test(key)) {
        return [key, item ? "[redacted]" : item];
      }
      if (/^(?:soulHead|prompt|message|caption|query|content)$/i.test(key)) {
        return [key, item ? "[redacted-user-text]" : item];
      }
      if (/^(?:chatId|userId|senderId)$/i.test(key)) {
        return [key, item ? "[redacted-id]" : item];
      }
      return [key, redactSupportValue(item)];
    }));
  }
  return value;
}
