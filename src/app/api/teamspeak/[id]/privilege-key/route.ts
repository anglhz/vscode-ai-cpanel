import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeamSpeak } from "@/lib/teamspeak-access";
import { createTeamSpeakPrivilegeKey } from "@/lib/teamspeak-admin";

const keySchema = z.object({
  groupId: z.string().regex(/^\d+$/),
  description: z.string().max(120).default("Created from Intuitive Gamepanel"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessTeamSpeak(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = keySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid privilege key request." }, { status: 400 });
  }

  const server = await prisma.teamSpeakServer.findUnique({ where: { id } });

  if (!server) {
    return NextResponse.json({ error: "TeamSpeak server not found." }, { status: 404 });
  }

  try {
    return NextResponse.json(await createTeamSpeakPrivilegeKey(server, parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create privilege key." },
      { status: 502 },
    );
  }
}
