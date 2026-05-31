import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const roles = ["ADMIN", "USER"] as const;

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(roles),
  serverIds: z.array(z.string()).default([]),
});

export async function GET() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      serverAccess: { select: { serverId: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      serverIds: user.serverAccess.map((access) => access.serverId),
      serverAccess: undefined,
    })),
  });
}

export async function POST(request: Request) {
  await requireAdmin();
  const parsed = userSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      passwordHash,
      serverAccess: {
        create: parsed.data.serverIds.map((serverId) => ({ serverId })),
      },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
