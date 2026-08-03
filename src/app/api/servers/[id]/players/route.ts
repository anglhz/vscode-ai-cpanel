import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { queryGameServerPlayers } from "@/lib/game-query";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { queryTeamSpeakPlayers } from "@/lib/teamspeak-query";

function getPublicIp(node?: { publicIp: string } | null) {
  return node?.publicIp || process.env.SERVER_PUBLIC_IP || process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP || "144.76.41.252";
}

function getPortFromExecStart(execStart: string, serviceName: string) {
  return execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ?? serviceName.match(/^[a-zA-Z0-9_-]+-(\d+)\.service$/)?.[1] ?? null;
}

function getTeamSpeakVoicePort(execStart: string, serviceName: string) {
  return execStart.match(/default_voice_port=(\d+)/)?.[1] ?? serviceName.match(/^ts3-(\d+)\.service$/)?.[1] ?? null;
}

function getTeamSpeakQueryPort(execStart: string) {
  return execStart.match(/query_port=(\d+)/)?.[1] ?? "10011";
}

function getTeamSpeakQueryHost() {
  return process.env.TS3_QUERY_HOST ?? "127.0.0.1";
}

function isVoiceServer(serviceName: string, execStart: string) {
  return (
    serviceName.startsWith("ts3-") ||
    execStart.includes("ts3server_startscript.sh") ||
    execStart.includes("default_voice_port=")
  );
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await prisma.gameServer.findUnique({
    where: { id },
    include: { node: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  const voiceServer = isVoiceServer(server.systemdServiceName, server.execStart);
  const port = voiceServer
    ? getTeamSpeakVoicePort(server.execStart, server.systemdServiceName)
    : getPortFromExecStart(server.execStart, server.systemdServiceName);

  if (!port) {
    return NextResponse.json({ error: "Server port could not be detected." }, { status: 400 });
  }

  try {
    const players = voiceServer
      ? await queryTeamSpeakPlayers({
          host: getTeamSpeakQueryHost(),
          queryPort: Number(getTeamSpeakQueryPort(server.execStart)),
          voicePort: Number(port),
        })
      : await queryGameServerPlayers(getPublicIp(server.node), Number(port));
    return NextResponse.json(players);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load player data." },
      { status: 502 },
    );
  }
}
