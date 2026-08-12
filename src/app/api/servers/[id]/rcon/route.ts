import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isLocalNode } from "@/lib/node-client";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { sendCodRcon } from "@/lib/server-console";
import { getEffectiveSystemdExecStart } from "@/lib/systemd";

export const runtime = "nodejs";

const rconSchema = z.object({
  command: z.string().min(1).max(200).refine((value) => !/[\r\n]/.test(value), {
    message: "RCON command must be a single line.",
  }),
});

function getPublicIp(node?: { publicIp: string } | null) {
  return node?.publicIp || process.env.SERVER_PUBLIC_IP || process.env.NEXT_PUBLIC_SERVER_PUBLIC_IP || "144.76.41.252";
}

function getPortFromServer(execStart: string, serviceName: string) {
  return execStart.match(/\+set\s+net_port\s+(\d+)/)?.[1] ?? serviceName.match(/^[a-zA-Z0-9_-]+-(\d+)\.service$/)?.[1] ?? null;
}

function getRconPasswordFromExecStart(execStart: string) {
  const quoted = execStart.match(/\+set\s+rconpassword\s+"((?:\\"|[^"])*)"/);

  if (quoted?.[1]) {
    return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  return execStart.match(/\+set\s+rconpassword\s+(\S+)/)?.[1] ?? "";
}

function isVoiceServer(serviceName: string, execStart: string) {
  return (
    serviceName.startsWith("ts3-") ||
    execStart.includes("ts3server_startscript.sh") ||
    execStart.includes("default_voice_port=")
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;

  if (!(await canAccessServer(user, id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = rconSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid RCON command." }, { status: 400 });
  }

  const server = await prisma.gameServer.findUnique({
    where: { id },
    include: { node: true },
  });

  if (!server) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  if (!isLocalNode(server.node)) {
    return NextResponse.json({ error: "RCON currently supports local servers only." }, { status: 400 });
  }

  const effectiveExecStart = await getEffectiveSystemdExecStart(server.systemdServiceName, server.execStart);

  if (isVoiceServer(server.systemdServiceName, effectiveExecStart)) {
    return NextResponse.json({ error: "Use the TeamSpeak page for TeamSpeak commands." }, { status: 400 });
  }

  const port = getPortFromServer(effectiveExecStart, server.systemdServiceName);

  if (!port) {
    return NextResponse.json({ error: "Server port could not be detected." }, { status: 400 });
  }

  try {
    const output = await sendCodRcon({
      host: getPublicIp(server.node),
      port: Number(port),
      password: server.rconPassword || getRconPasswordFromExecStart(effectiveExecStart),
      command: parsed.data.command,
    });

    return NextResponse.json({ output });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send RCON command." },
      { status: 502 },
    );
  }
}
