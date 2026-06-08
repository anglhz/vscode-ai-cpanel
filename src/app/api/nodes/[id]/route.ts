import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const nodeSchema = z.object({
  name: z.string().min(2),
  baseUrl: z.string().min(3),
  publicIp: z.string().min(1),
  apiToken: z.string().optional(),
  isLocal: z.boolean(),
});

function serializeNode(node: {
  id: string;
  name: string;
  baseUrl: string;
  publicIp: string;
  apiToken: string;
  isLocal: boolean;
}) {
  return {
    id: node.id,
    name: node.name,
    baseUrl: node.baseUrl,
    publicIp: node.publicIp,
    hasApiToken: Boolean(node.apiToken),
    isLocal: node.isLocal,
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const parsed = nodeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid node payload." }, { status: 400 });
  }

  const data = {
    name: parsed.data.name,
    baseUrl: parsed.data.baseUrl,
    publicIp: parsed.data.publicIp,
    isLocal: parsed.data.isLocal,
    ...(parsed.data.apiToken ? { apiToken: parsed.data.apiToken } : {}),
  };
  const node = await prisma.serverNode.update({ where: { id }, data });

  return NextResponse.json({ node: serializeNode(node) });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;

  if (id === "local") {
    return NextResponse.json({ error: "The local node cannot be deleted." }, { status: 400 });
  }

  await prisma.serverNode.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
