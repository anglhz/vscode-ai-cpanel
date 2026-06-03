import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const reorderSchema = z.object({
  serverIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(request: Request) {
  await requireAdmin();
  const parsed = reorderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reorder payload." }, { status: 400 });
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
