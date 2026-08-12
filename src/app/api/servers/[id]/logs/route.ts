import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isLocalNode } from "@/lib/node-client";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { streamSystemdLogs } from "@/lib/server-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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

  if (!isLocalNode(server.node)) {
    return NextResponse.json({ error: "Live console currently supports local servers only." }, { status: 400 });
  }

  return new Response(streamSystemdLogs(server.systemdServiceName, request.signal), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
