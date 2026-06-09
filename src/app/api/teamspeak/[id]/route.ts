import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeamSpeak } from "@/lib/teamspeak-access";
import { getTeamSpeakLiveInfo, updateTeamSpeakVirtualServer } from "@/lib/teamspeak-admin";

const updateSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(300).optional().default(""),
  host: z.string().min(2),
  queryPort: z.coerce.number().int().min(1).max(65535),
  voicePort: z.coerce.number().int().min(1).max(65535),
  apiKey: z.string().optional().or(z.literal("")),
  queryUsername: z.string().optional().or(z.literal("")),
  queryPassword: z.string().optional().or(z.literal("")),
  assignedUserIds: z.array(z.string()).default([]),
});

const settingsSchema = z.object({
  virtualserverName: z.string().min(1).max(80).refine((value) => !/[\r\n]/.test(value)),
  welcomeMessage: z.string().max(300).refine((value) => !/[\r\n]/.test(value)),
  maxClients: z.coerce.number().int().min(1).max(1024),
  password: z.string().max(80).optional().refine((value) => !value || !/[\r\n]/.test(value)),
});

function serializeTeamSpeak(server: {
  id: string;
  name: string;
  description: string;
  host: string;
  queryPort: number;
  voicePort: number;
  apiKey: string;
  queryUsername: string;
  queryPassword: string;
  assignedUsers?: { userId: string }[];
}) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    host: server.host,
    queryPort: server.queryPort,
    voicePort: server.voicePort,
    hasApiKey: Boolean(server.apiKey),
    hasQueryPassword: Boolean(server.queryPassword),
    queryUsername: server.queryUsername,
    assignedUserIds: server.assignedUsers?.map((access) => access.userId) ?? [],
  };
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessTeamSpeak(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await prisma.teamSpeakServer.findUnique({ where: { id } });

  if (!server) {
    return NextResponse.json({ error: "TeamSpeak server not found." }, { status: 404 });
  }

  try {
    const live = await getTeamSpeakLiveInfo(server);
    return NextResponse.json(live);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load TeamSpeak data." },
      { status: 502 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json();
  const server = await prisma.teamSpeakServer.findUnique({
    where: { id },
    include: { assignedUsers: true },
  });

  if (!server) {
    return NextResponse.json({ error: "TeamSpeak server not found." }, { status: 404 });
  }

  if (user.role === "ADMIN" && "host" in body) {
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid TeamSpeak payload." }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.userTeamSpeakAccess.deleteMany({ where: { teamspeakId: id } });
      return tx.teamSpeakServer.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          host: parsed.data.host,
          queryPort: parsed.data.queryPort,
          voicePort: parsed.data.voicePort,
          ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
          queryUsername: parsed.data.queryUsername ?? "",
          ...(parsed.data.queryPassword ? { queryPassword: parsed.data.queryPassword } : {}),
          assignedUsers: {
            create: parsed.data.assignedUserIds.map((userId) => ({ userId })),
          },
        },
        include: { assignedUsers: true },
      });
    });

    return NextResponse.json({ server: serializeTeamSpeak(updated) });
  }

  if (!(await canAccessTeamSpeak(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = settingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid TeamSpeak settings." }, { status: 400 });
  }

  try {
    await updateTeamSpeakVirtualServer(server, parsed.data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save TeamSpeak settings." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  await prisma.teamSpeakServer.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
