import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id (algorithm 2) with OWASP-recommended parameters.
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;
/** Hash to verify against when the account does not exist, so timing does not reveal which emails are registered. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("not-a-real-password");
  return dummy;
}

export const PASSWORD_MIN = 10;
/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 200) return "Password is too long.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  return null;
}
