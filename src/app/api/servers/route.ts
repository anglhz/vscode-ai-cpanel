import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { GAME_KEYS } from "@/lib/game-profiles";
import { prisma } from "@/lib/prisma";
import { serializeServerWithEffectiveExecStart } from "@/lib/serializers";
import { provisionSystemdServer } from "@/lib/systemd";

const serverStatuses = ["ONLINE", "OFFLINE", "STARTING", "STOPPING", "RESTARTING", "UNKNOWN"] as const;

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  ownerUserId: z.string().min(1),
  game: z.enum(GAME_KEYS),
  port: z.coerce.number().int().min(1024).max(65535),
  maxClients: z.coerce.number().int().min(1).max(128).default(12),
  binaryName: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.\/-]+$/),
  status: z.enum(serverStatuses).optional(),
});

export async function GET() {
  const user = await requireUser();
  const servers = await getVisibleServers(user);

  return NextResponse.json({
    servers: await Promise.all(
      servers.map((server) => serializeServerWithEffectiveExecStart(server, user.role)),
    ),
  });
}

async function getVisibleServers(user: Awaited<ReturnType<typeof requireUser>>) {
  if (user.role === "ADMIN") {
    return prisma.gameServer.findMany({
      include: { assignedUsers: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  }

  const accessRows = await prisma.userServerAccess.findMany({
    where: { userId: user.id },
    include: { server: { include: { assignedUsers: true } } },
    orderBy: [{ displayOrder: "asc" }, { server: { name: "asc" } }],
  });

  return accessRows.map((access) => access.server);
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const parsed = serverSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server payload." }, { status: 400 });
  }

  const ownerUser = await prisma.user.findUnique({
    where: { id: parsed.data.ownerUserId },
    select: { sftpUsername: true, name: true },
  });

  if (!ownerUser?.sftpUsername) {
    return NextResponse.json(
      { error: "Selected user does not have an SFTP username/folder configured." },
      { status: 400 },
    );
  }

  let provisioned;
  try {
    provisioned = await provisionSystemdServer({
      name: parsed.data.name,
      ownerFolder: ownerUser.sftpUsername,
      game: parsed.data.game,
      port: parsed.data.port,
      maxClients: parsed.data.maxClients,
      binaryName: parsed.data.binaryName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not provision server." },
      { status: 500 },
    );
  }
  const nextDisplayOrder = await prisma.gameServer.count();

  try {
    const server = await prisma.gameServer.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        systemdServiceName: provisioned.serviceName,
        execStart: provisioned.execStart,
        status: parsed.data.status ?? "UNKNOWN",
        displayOrder: nextDisplayOrder,
        assignedUsers: {
          create: { userId: parsed.data.ownerUserId },
        },
      },
      include: { assignedUsers: true },
    });

    return NextResponse.json(
      { server: await serializeServerWithEffectiveExecStart(server, user.role) },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save server." },
      { status: 500 },
    );
  }
}
