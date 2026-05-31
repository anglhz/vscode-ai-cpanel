import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeServer } from "@/lib/serializers";

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  systemdServiceName: z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await context.params;
  const parsed = serverSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid server payload." }, { status: 400 });
  }

  const server = await prisma.gameServer.update({
    where: { id },
    data: parsed.data,
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
