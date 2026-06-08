import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isLocalNode, remoteGetServerStatus } from "@/lib/node-client";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { handleServerStatusAlert } from "@/lib/server-alerts";
import { getSystemdStatus } from "@/lib/systemd";

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

  const liveStatus =
    !server.node || isLocalNode(server.node)
      ? await getSystemdStatus(server.systemdServiceName)
      : await remoteGetServerStatus(server.node, server.systemdServiceName);
  await handleServerStatusAlert(server, liveStatus);
  const updated =
    liveStatus === "UNKNOWN"
      ? server
      : await prisma.gameServer.update({
          where: { id },
          data: { status: liveStatus },
        });

  return NextResponse.json({ status: updated.status });
}
