import "server-only";

const SENSITIVE = /pass(word)?|secret|token|cookie|authorization|totp|otp|code|hash|card|cvv/i;

export function redactForLog(value: unknown, depth = 0): unknown {
  if (value == null || depth > 4) return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((v) => redactForLog(v, depth + 1));
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redactForLog(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: "info" | "warn" | "error", msg: string, meta?: unknown) {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta !== undefined ? { meta: redactForLog(meta) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured logger. Keys that look sensitive are redacted; never put raw secrets in `msg`. */
export const log = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
};
