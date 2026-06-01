import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { serializeServer } from "@/lib/serializers";
import { composeExecStart } from "@/lib/exec-start";
import { applySystemdExecStart } from "@/lib/systemd";

const execStartSchema = z.string().min(1).max(1000).refine((value) => !/[\r\n]/.test(value), {
  message: "ExecStart must be a single line.",
});
const execStartExtraSchema = z.string().max(500).refine((value) => !/[\r\n]/.test(value), {
  message: "ExecStart additions must be a single line.",
});

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  systemdServiceName: z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/),
  execStart: execStartSchema,
});

const userServerSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  execStartExtra: execStartExtraSchema,
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json();

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = user.role === "ADMIN" ? serverSchema.safeParse(body) : userServerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server payload." }, { status: 400 });
  }

  const existingServer = await prisma.gameServer.findUnique({ where: { id } });

  if (!existingServer) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  let data;
  let targetServiceName = existingServer.systemdServiceName;
  let targetExecStart = existingServer.execStart;

  if (user.role === "ADMIN") {
    const adminParsed = serverSchema.parse(body);
    data = adminParsed;
    targetServiceName = adminParsed.systemdServiceName;
    targetExecStart = adminParsed.execStart;
  } else {
    const userParsed = userServerSchema.parse(body);
    targetExecStart = composeExecStart(existingServer.systemdServiceName, userParsed.execStartExtra);

    data = {
      name: userParsed.name,
      description: userParsed.description,
      execStart: targetExecStart,
    };
  }

  await applySystemdExecStart(targetServiceName, targetExecStart);

  const server = await prisma.gameServer.update({
    where: { id },
    data,
    include: { assignedUsers: true },
  });

  return NextResponse.json({ server: serializeServer(server, user.role) });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  await prisma.gameServer.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
