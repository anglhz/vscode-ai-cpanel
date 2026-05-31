import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { isServerAction, runSystemdAction } from "@/lib/systemd";

const nextStatus = {
  start: "STARTING",
  stop: "STOPPING",
  restart: "RESTARTING",
};

export async function POST(
  _: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  const user = await requireUser();
  const { id, action } = await context.params;

  if (!isServerAction(action)) {
    return NextResponse.json({ error: "Unsupported server action." }, { status: 404 });
  }

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const server = await prisma.gameServer.findUnique({ where: { id } });

  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  try {
    await runSystemdAction(server.systemdServiceName, action);
    const updated = await prisma.gameServer.update({
      where: { id },
      data: { status: nextStatus[action] },
    });

    return NextResponse.json({ status: updated.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server action failed." },
      { status: 500 },
    );
  }
}
