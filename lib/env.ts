import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32, "PAYMENT_WEBHOOK_SECRET must be at least 32 characters"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast at boot: never run with missing or weak secrets.
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
