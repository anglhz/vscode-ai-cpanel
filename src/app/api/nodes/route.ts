import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const nodeSchema = z.object({
  name: z.string().min(2),
  baseUrl: z.string().min(3),
  publicIp: z.string().min(1),
  apiToken: z.string().optional().default(""),
  isLocal: z.boolean().default(false),
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

export async function GET() {
  await requireAdmin();
  const nodes = await prisma.serverNode.findMany({
    orderBy: [{ isLocal: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ nodes: nodes.map(serializeNode) });
}

export async function POST(request: Request) {
  await requireAdmin();
  const parsed = nodeSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid node payload." }, { status: 400 });
  }

  const node = await prisma.serverNode.create({
    data: parsed.data,
  });

  return NextResponse.json({ node: serializeNode(node) }, { status: 201 });
}
