import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionSftpUser } from "@/lib/sftp";

const roles = ["ADMIN", "USER"] as const;

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(roles),
  serverIds: z.array(z.string()).default([]),
  createSftpUser: z.boolean().default(false),
  sftpUsername: z.string().regex(/^[a-zA-Z0-9_-]{2,32}$/).optional().or(z.literal("")),
  sftpPassword: z.string().min(8).optional().or(z.literal("")),
});

export async function GET() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sftpUsername: true,
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

  if (parsed.data.createSftpUser) {
    if (!parsed.data.sftpUsername || !parsed.data.sftpPassword) {
      return NextResponse.json({ error: "SFTP username and password are required." }, { status: 400 });
    }

    try {
      const sftpResult = await provisionSftpUser({
        username: parsed.data.sftpUsername,
        password: parsed.data.sftpPassword,
      });

      if (sftpResult.skipped) {
        return NextResponse.json(
          { error: "SFTP provisioning is disabled. Set SFTP_USER_PROVISIONING_ENABLED=true in .env." },
          { status: 400 },
        );
      }
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not create SFTP user." },
        { status: 500 },
      );
    }
  }

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      sftpUsername: parsed.data.createSftpUser ? parsed.data.sftpUsername : null,
      passwordHash,
      serverAccess: {
        create: parsed.data.serverIds.map((serverId) => ({ serverId })),
      },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
