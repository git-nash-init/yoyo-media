import "server-only";
import { generateSecret as otpGenerateSecret, generateURI, verify } from "otplib";

export const TOTP_ISSUER = "YoYo Videos";
const PERIOD_SEC = 30;

/** New random Base32 secret (160 bits) for an authenticator app. */
export function generateSecret(): string {
  return otpGenerateSecret();
}

/** otpauth:// URI to render as a QR code. */
export function keyuri(accountEmail: string, secret: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountEmail, secret, period: PERIOD_SEC });
}

/** Verify a 6-digit code, accepting one time step either side for clock drift. Never throws. */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(token) || !secret) return false;
  try {
    const result = await verify({ secret, token, period: PERIOD_SEC, epochTolerance: PERIOD_SEC });
    return result.valid === true;
  } catch {
    return false;
  }
}

/** Manual-entry formatting: groups of four characters. */
export function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}
