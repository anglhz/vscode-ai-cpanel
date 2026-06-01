import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeServer } from "@/lib/serializers";
import { provisionSystemdServer } from "@/lib/systemd";

const serverStatuses = ["ONLINE", "OFFLINE", "STARTING", "STOPPING", "RESTARTING", "UNKNOWN"] as const;

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  game: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_-]+$/),
  port: z.coerce.number().int().min(1024).max(65535),
  maxClients: z.coerce.number().int().min(1).max(128).default(12),
  binaryName: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/).default("cod_lnxded"),
  status: z.enum(serverStatuses).optional(),
});

export async function GET() {
  const user = await requireUser();
  const servers =
    user.role === "ADMIN"
      ? await prisma.gameServer.findMany({
          include: { assignedUsers: true },
          orderBy: { name: "asc" },
        })
      : await prisma.gameServer.findMany({
          where: { assignedUsers: { some: { userId: user.id } } },
          orderBy: { name: "asc" },
        });

  return NextResponse.json({
    servers: servers.map((server) => serializeServer(server, user.role)),
  });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const parsed = serverSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server payload." }, { status: 400 });
  }

  const provisioned = await provisionSystemdServer({
    name: parsed.data.name,
    game: parsed.data.game,
    port: parsed.data.port,
    maxClients: parsed.data.maxClients,
    binaryName: parsed.data.binaryName,
  });

  const server = await prisma.gameServer.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      systemdServiceName: provisioned.serviceName,
      execStart: provisioned.execStart,
      status: parsed.data.status ?? "UNKNOWN",
    },
    include: { assignedUsers: true },
  });

  return NextResponse.json({ server: serializeServer(server, user.role) }, { status: 201 });
}
