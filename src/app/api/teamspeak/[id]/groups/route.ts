import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeamSpeak } from "@/lib/teamspeak-access";
import { getTeamSpeakServerGroups } from "@/lib/teamspeak-admin";

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
    return NextResponse.json(await getTeamSpeakServerGroups(server));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load TeamSpeak groups." },
      { status: 502 },
    );
  }
}
