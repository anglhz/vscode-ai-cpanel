import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123!", 12);

  await prisma.user.upsert({
    where: { email: "admin@intuitive.local" },
    update: { passwordHash, role: "ADMIN" },
    create: {
      name: "Intuitive Admin",
      email: "admin@intuitive.local",
      passwordHash,
      role: "ADMIN",
    },
  });

  await prisma.gameServer.deleteMany({
    where: { systemdServiceName: { startsWith: "codbase-" } },
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
