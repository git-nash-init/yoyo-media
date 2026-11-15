import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { log } from "@/lib/logger";

/** Record an admin or security-relevant action. Never throws. */
export async function audit(
  userId: string | null,
  action: string,
  target?: string,
  meta?: Prisma.InputJsonValue,
) {
  try {
    await prisma.auditLog.create({ data: { userId, action, target: target?.slice(0, 191), meta } });
  } catch (e) {
    log.error("audit write failed", { action, error: e });
  }
}
