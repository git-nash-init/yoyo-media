/**
 * Create (or promote) an admin account. There are no default credentials:
 *   npm run create-admin -- admin@example.com "Admin Name"
 * The password is read from the ADMIN_PASSWORD env var or prompted for, never
 * passed as an argument. MFA must then be set up on first admin visit.
 */
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

async function main() {
  const [email, name = "Admin"] = process.argv.slice(2);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: npm run create-admin -- <email> "<name>"');
    process.exit(1);
  }
  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Choose an admin password (min 12 chars): ");
    rl.close();
  }
  if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.error("Password must be at least 12 characters and include a letter and a number.");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name, passwordHash, role: "ADMIN" },
    update: { passwordHash, role: "ADMIN", name },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Admin ready: ${user.email}. Sign in and set up two-factor authentication to open /admin.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
