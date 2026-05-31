import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const roles = ["ADMIN", "USER"] as const;

const updateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional().or(z.literal("")),
  role: z.enum(roles),
  serverIds: z.array(z.string()).default([]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const parsed = updateUserSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  }

  const { serverIds, password, ...data } = parsed.data;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  await prisma.$transaction([
    prisma.userServerAccess.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        ...data,
        email: data.email.toLowerCase(),
        ...(passwordHash ? { passwordHash } : {}),
        serverAccess: { create: serverIds.map((serverId) => ({ serverId })) },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await context.params;

  if (admin.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
