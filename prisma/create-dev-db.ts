import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "passwordHash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'USER',
      "sftpUsername" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ServerNode" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "baseUrl" TEXT NOT NULL,
      "publicIp" TEXT NOT NULL DEFAULT '',
      "apiToken" TEXT NOT NULL,
      "isLocal" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GameServer" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "nodeId" TEXT,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "systemdServiceName" TEXT NOT NULL,
      "execStart" TEXT NOT NULL DEFAULT '',
      "fsGame" TEXT NOT NULL DEFAULT '',
      "punkbuster" BOOLEAN NOT NULL DEFAULT false,
      "configFile" TEXT NOT NULL DEFAULT '',
      "rconPassword" TEXT NOT NULL DEFAULT '',
      "extraParameters" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
      "desiredState" TEXT NOT NULL DEFAULT 'STOPPED',
      "lastDownAlertAt" DATETIME,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserServerAccess" (
      "userId" TEXT NOT NULL,
      "serverId" TEXT NOT NULL,
      "displayOrder" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("userId", "serverId"),
      CONSTRAINT "UserServerAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "UserServerAccess_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "GameServer_systemdServiceName_key" ON "GameServer"("systemdServiceName");
  `);

  await addColumnIfMissing("execStart", `TEXT NOT NULL DEFAULT ''`);
  await addColumnIfMissing("nodeId", `TEXT`);
  await addColumnIfMissing("fsGame", `TEXT NOT NULL DEFAULT ''`);
  await addColumnIfMissing("punkbuster", `BOOLEAN NOT NULL DEFAULT false`);
  await addColumnIfMissing("configFile", `TEXT NOT NULL DEFAULT ''`);
  await addColumnIfMissing("rconPassword", `TEXT NOT NULL DEFAULT ''`);
  await addColumnIfMissing("extraParameters", `TEXT NOT NULL DEFAULT ''`);
  await addColumnIfMissing("desiredState", `TEXT NOT NULL DEFAULT 'STOPPED'`);
  await addColumnIfMissing("lastDownAlertAt", `DATETIME`);
  await addColumnIfMissing("displayOrder", `INTEGER NOT NULL DEFAULT 0`);
  await addAccessColumnIfMissing("displayOrder", `INTEGER NOT NULL DEFAULT 0`);
  await addUserColumnIfMissing("sftpUsername", `TEXT`);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_sftpUsername_key" ON "User"("sftpUsername");
  `);

  await prisma.$executeRaw`
    INSERT INTO "ServerNode" ("id", "name", "baseUrl", "publicIp", "apiToken", "isLocal", "updatedAt")
    SELECT 'local', 'Local machine', 'local', COALESCE(NULLIF(${process.env.SERVER_PUBLIC_IP ?? ""}, ''), '127.0.0.1'), '', true, CURRENT_TIMESTAMP
    WHERE NOT EXISTS (SELECT 1 FROM "ServerNode" WHERE "id" = 'local');
  `;
}

async function addUserColumnIfMissing(name: string, definition: string) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN "${name}" ${definition};
    `);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

async function addColumnIfMissing(name: string, definition: string) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "GameServer" ADD COLUMN "${name}" ${definition};
    `);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

async function addAccessColumnIfMissing(name: string, definition: string) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "UserServerAccess" ADD COLUMN "${name}" ${definition};
    `);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
      throw error;
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
