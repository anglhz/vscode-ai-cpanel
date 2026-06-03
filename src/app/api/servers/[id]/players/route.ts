import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryGameServerPlayers } from "@/lib/game-query";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { queryTeamSpeakPlayers } from "@/lib/teamspeak-query";

function getPublicIp() {
  return process.env.SERVER_PUBLIC_IP ?? process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP ?? "144.76.41.252";
}

function getPortFromExecStart(execStart: string) {
  return execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ?? null;
}

function getTeamSpeakVoicePort(execStart: string) {
  return execStart.match(/default_voice_port=(\d+)/)?.[1] ?? null;
}

function getTeamSpeakQueryPort(execStart: string) {
  return execStart.match(/query_port=(\d+)/)?.[1] ?? "10011";
}

function getTeamSpeakQueryHost() {
  return process.env.TS3_QUERY_HOST ?? "127.0.0.1";
}

function isVoiceServer(serviceName: string) {
  return serviceName.startsWith("ts3-");
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await prisma.gameServer.findUnique({ where: { id } });

  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  const port = isVoiceServer(server.systemdServiceName)
    ? getTeamSpeakVoicePort(server.execStart)
    : getPortFromExecStart(server.execStart);

  if (!port) {
    return NextResponse.json({ error: "Server port could not be detected." }, { status: 400 });
  }

  try {
    const players = isVoiceServer(server.systemdServiceName)
      ? await queryTeamSpeakPlayers({
          host: getTeamSpeakQueryHost(),
          queryPort: Number(getTeamSpeakQueryPort(server.execStart)),
          voicePort: Number(port),
        })
      : await queryGameServerPlayers(getPublicIp(), Number(port));
    return NextResponse.json(players);
  } catch {
    return NextResponse.json({ error: "Could not load player data." }, { status: 502 });
  }
}
