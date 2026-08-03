import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isLocalNode } from "@/lib/node-client";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { serializeServerWithEffectiveExecStart } from "@/lib/serializers";
import { downgradeCod1ServerTo15 } from "@/lib/systemd";

function canDowngradeCod16(role: string) {
  return role === "ADMIN" || role === "STARTUP_USER";
}

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!canDowngradeCod16(user.role)) {
    return NextResponse.json({ error: "Only admins and startup users can downgrade CoD1 servers." }, { status: 403 });
  }

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await prisma.gameServer.findUnique({
    where: { id },
    include: { assignedUsers: true, node: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  if (!isLocalNode(server.node)) {
    return NextResponse.json({ error: "CoD1 1.5 downgrade currently supports local servers only." }, { status: 400 });
  }

  try {
    const downgraded = await downgradeCod1ServerTo15(server.systemdServiceName, server.execStart);
    const updated = await prisma.gameServer.update({
      where: { id },
      data: { execStart: downgraded.execStart },
      include: { assignedUsers: true, node: true },
    });

    return NextResponse.json({
      server: await serializeServerWithEffectiveExecStart(updated, user.role),
      serverDirectory: downgraded.serverDirectory,
      skipped: downgraded.skipped,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not downgrade CoD1 server to 1.5." },
      { status: 500 },
    );
  }
}
