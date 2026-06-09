import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const teamspeakSchema = z.object({
  name: z.string().min(2),
  description: z.string().max(300).optional().default(""),
  host: z.string().min(2),
  queryPort: z.coerce.number().int().min(1).max(65535).default(10011),
  voicePort: z.coerce.number().int().min(1).max(65535).default(9987),
  apiKey: z.string().optional().default(""),
  queryUsername: z.string().optional().default(""),
  queryPassword: z.string().optional().default(""),
  assignedUserIds: z.array(z.string()).default([]),
}).refine((value) => value.apiKey || (value.queryUsername && value.queryPassword), {
  message: "API key or ServerQuery login is required.",
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

export async function GET() {
  const user = await requireUser();

  if (user.role === "ADMIN") {
    const servers = await prisma.teamSpeakServer.findMany({
      include: { assignedUsers: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ servers: servers.map(serializeTeamSpeak) });
  }

  const accessRows = await prisma.userTeamSpeakAccess.findMany({
    where: { userId: user.id },
    include: { teamspeak: { include: { assignedUsers: true } } },
    orderBy: { teamspeak: { name: "asc" } },
  });

  return NextResponse.json({ servers: accessRows.map((access) => serializeTeamSpeak(access.teamspeak)) });
}

export async function POST(request: Request) {
  await requireAdmin();
  const parsed = teamspeakSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid TeamSpeak payload." }, { status: 400 });
  }

  const server = await prisma.teamSpeakServer.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      host: parsed.data.host,
      queryPort: parsed.data.queryPort,
      voicePort: parsed.data.voicePort,
      apiKey: parsed.data.apiKey,
      queryUsername: parsed.data.queryUsername,
      queryPassword: parsed.data.queryPassword,
      assignedUsers: {
        create: parsed.data.assignedUserIds.map((userId) => ({ userId })),
      },
    },
    include: { assignedUsers: true },
  });

  return NextResponse.json({ server: serializeTeamSpeak(server) }, { status: 201 });
}
