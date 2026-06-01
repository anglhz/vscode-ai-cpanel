import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { composeExecStart } from "../src/lib/exec-start";

const prisma = new PrismaClient();

const callOfDutyServers = [
  {
    name: "CoDBase Public",
    description: "Main public server for open community play.",
    systemdServiceName: "codbase-public.service",
    execStart: composeExecStart("codbase-public.service", { punkbuster: false }),
  },
  ...Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;

    return {
      name: `CoDBase #${number}`,
      description: `Match server #${number}.`,
      systemdServiceName: `codbase-${number}.service`,
      execStart: composeExecStart(`codbase-${number}.service`, { punkbuster: false }),
    };
  }),
  {
    name: "CoDBase SoloQ #1",
    description: "SoloQ server for pickup matches and practice.",
    systemdServiceName: "codbase-soloq-1.service",
    execStart: composeExecStart("codbase-soloq-1.service", { punkbuster: false }),
  },
];

const callOfDutyServiceNames = callOfDutyServers.map((server) => server.systemdServiceName);

async function main() {
  const passwordHash = await bcrypt.hash("admin123!", 12);

  const admin = await prisma.user.upsert({
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
    where: { systemdServiceName: { notIn: callOfDutyServiceNames } },
  });

  for (const serverData of callOfDutyServers) {
    const server = await prisma.gameServer.upsert({
      where: { systemdServiceName: serverData.systemdServiceName },
      update: {
        name: serverData.name,
        description: serverData.description,
        execStart: serverData.execStart,
        punkbuster: false,
      },
      create: {
        ...serverData,
        punkbuster: false,
        status: "UNKNOWN",
      },
    });

    await prisma.userServerAccess.upsert({
      where: { userId_serverId: { userId: admin.id, serverId: server.id } },
      update: {},
      create: { userId: admin.id, serverId: server.id },
    });
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
