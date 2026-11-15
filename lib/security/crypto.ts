import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
export const hmacSha256 = (secret: string, payload: string) =>
  createHmac("sha256", secret).update(payload).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---- Encryption at rest for small secrets (e.g. TOTP seeds) ----
// AES-256-GCM with a key derived from SESSION_SECRET. Stored format: "v1:<iv>.<tag>.<ciphertext>" (base64url).
const SEAL_PREFIX = "v1:";
const sealKey = () => createHash("sha256").update(`yoyo-seal:${env.SESSION_SECRET}`).digest();

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${SEAL_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

/** Decrypts a sealed value. Values stored before encryption existed (no prefix) are returned as-is. Returns null if tampered. */
export function openSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!stored.startsWith(SEAL_PREFIX)) return stored;
  try {
    const [iv, tag, data] = stored.slice(SEAL_PREFIX.length).split(".");
    const decipher = createDecipheriv("aes-256-gcm", sealKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
