import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeamSpeak } from "@/lib/teamspeak-access";
import { runTeamSpeakClientAction } from "@/lib/teamspeak-admin";

const actionSchema = z.object({
  action: z.enum(["poke", "kick", "ban"]),
  clientId: z.string().regex(/^\d+$/),
  message: z.string().max(160).default("Managed from Intuitive Gamepanel"),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessTeamSpeak(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = actionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client action." }, { status: 400 });
  }

  const server = await prisma.teamSpeakServer.findUnique({ where: { id } });

  if (!server) {
    return NextResponse.json({ error: "TeamSpeak server not found." }, { status: 404 });
  }

  try {
    await runTeamSpeakClientAction(server, parsed.data.action, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not run client action." },
      { status: 502 },
    );
  }
}
