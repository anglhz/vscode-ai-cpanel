import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const callOfDutyServers = [
  {
    name: "CoDBase Public",
    description: "Main public Call of Duty 1 server for open community play.",
    systemdServiceName: "codbase-public.service",
    execStart:
      "/opt/game-servers/codbase-public/cod_lnxded +set dedicated 2 +set net_port 28960 +exec server.cfg +map_rotate",
  },
  ...Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const port = 28960 + number;

    return {
      name: `CoDBase #${number}`,
      description: `Call of Duty 1 CoDBase match server #${number}.`,
      systemdServiceName: `codbase-${number}.service`,
      execStart: `/opt/game-servers/codbase-${number}/cod_lnxded +set dedicated 2 +set net_port ${port} +exec server.cfg +map_rotate`,
    };
  }),
  {
    name: "CoDBase SoloQ #1",
    description: "Call of Duty 1 SoloQ server for pickup matches and practice.",
    systemdServiceName: "codbase-soloq-1.service",
    execStart:
      "/opt/game-servers/codbase-soloq-1/cod_lnxded +set dedicated 2 +set net_port 28971 +exec server.cfg +map_rotate",
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
      },
      create: {
        ...serverData,
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
