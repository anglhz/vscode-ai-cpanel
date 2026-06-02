import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCodPmPlayers } from "@/lib/codpm";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";

function getPublicIp() {
  return process.env.SERVER_PUBLIC_IP ?? process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP ?? "144.76.41.252";
}

function getPortFromExecStart(execStart: string) {
  return execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ?? null;
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

  const port = getPortFromExecStart(server.execStart);

  if (!port) {
    return NextResponse.json({ error: "Server port could not be detected." }, { status: 400 });
  }

  try {
    const players = await getCodPmPlayers(getPublicIp(), port);
    return NextResponse.json(players);
  } catch {
    return NextResponse.json({ error: "Could not load player data." }, { status: 502 });
  }
}
