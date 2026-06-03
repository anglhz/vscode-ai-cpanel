import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const reorderSchema = z.object({
  serverIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(request: Request) {
  const user = await requireUser();
  const parsed = reorderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reorder payload." }, { status: 400 });
  }

  if (user.role !== "ADMIN") {
    const allowedAccess = await prisma.userServerAccess.findMany({
      where: {
        userId: user.id,
        serverId: { in: parsed.data.serverIds },
      },
      select: { serverId: true },
    });

    if (allowedAccess.length !== parsed.data.serverIds.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.$transaction(
      parsed.data.serverIds.map((serverId, index) =>
        prisma.userServerAccess.update({
          where: { userId_serverId: { userId: user.id, serverId } },
          data: { displayOrder: index },
        }),
      ),
    );

    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(
    parsed.data.serverIds.map((id, index) =>
      prisma.gameServer.update({
        where: { id },
        data: { displayOrder: index },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
