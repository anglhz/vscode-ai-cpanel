import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeServer } from "@/lib/serializers";

const serverStatuses = ["ONLINE", "OFFLINE", "STARTING", "STOPPING", "RESTARTING", "UNKNOWN"] as const;

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  systemdServiceName: z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/),
  execStart: z.string().min(1).max(1000).refine((value) => !/[\r\n]/.test(value), {
    message: "ExecStart must be a single line.",
  }),
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

  const server = await prisma.gameServer.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      systemdServiceName: parsed.data.systemdServiceName,
      execStart: parsed.data.execStart,
      status: parsed.data.status ?? "UNKNOWN",
    },
    include: { assignedUsers: true },
  });

  return NextResponse.json({ server: serializeServer(server, user.role) }, { status: 201 });
}
