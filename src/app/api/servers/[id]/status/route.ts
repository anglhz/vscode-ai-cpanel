import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { getSystemdStatus } from "@/lib/systemd";

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

  const liveStatus = await getSystemdStatus(server.systemdServiceName);
  const updated =
    liveStatus === "UNKNOWN"
      ? server
      : await prisma.gameServer.update({
          where: { id },
          data: { status: liveStatus },
        });

  return NextResponse.json({ status: updated.status });
}
