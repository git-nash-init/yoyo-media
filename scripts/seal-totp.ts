/**
 * One-off: encrypt any TOTP secrets that were stored before encryption at rest existed.
 *   npx tsx --env-file=.env scripts/seal-totp.ts
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("SESSION_SECRET missing");
const key = createHash("sha256").update(`yoyo-seal:${secret}`).digest();
const seal = (plain: string) => {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
};

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.user.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } });
  let n = 0;
  for (const r of rows) {
    if (r.totpSecret && !r.totpSecret.startsWith("v1:")) {
      await prisma.user.update({ where: { id: r.id }, data: { totpSecret: seal(r.totpSecret) } });
      n++;
    }
  }
  console.log(`Encrypted ${n} TOTP secret(s).`);
  await prisma.$disconnect();
}
main();
