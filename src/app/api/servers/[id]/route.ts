import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { serializeServer } from "@/lib/serializers";

const execStartSchema = z.string().min(1).max(1000).refine((value) => !/[\r\n]/.test(value), {
  message: "ExecStart must be a single line.",
});

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  systemdServiceName: z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/),
  execStart: execStartSchema,
});

const userServerSchema = z.object({
  execStart: execStartSchema,
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

  const server = await prisma.gameServer.update({
    where: { id },
    data: user.role === "ADMIN" ? parsed.data : { execStart: parsed.data.execStart },
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
