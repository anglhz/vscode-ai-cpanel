import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { serializeServerWithEffectiveExecStart } from "@/lib/serializers";
import { composeExecStartFromExisting } from "@/lib/exec-start";
import { applySystemdExecStart } from "@/lib/systemd";

const execStartSchema = z.string().min(1).max(1000).refine((value) => !/[\r\n]/.test(value), {
  message: "ExecStart must be a single line.",
});
const startupValueSchema = z.string().max(200).refine((value) => !/[\r\n"]/.test(value), {
  message: "Startup values must be single-line values without quotes.",
});
const extraParametersSchema = z.string().max(500).refine((value) => !/[\r\n]/.test(value), {
  message: "Extra parameters must be a single line.",
});

const serverSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  systemdServiceName: z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/),
  execStart: execStartSchema,
});

const userServerSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(2),
  fsGame: startupValueSchema,
  punkbuster: z.boolean(),
  configFile: startupValueSchema,
  rconPassword: z.string().max(128).refine((value) => !/[\r\n]/.test(value), {
    message: "RCON password must be a single line.",
  }),
  extraParameters: extraParametersSchema,
});

function isVoiceServer(serviceName: string) {
  return serviceName.startsWith("ts3-");
}

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

  const existingServer = await prisma.gameServer.findUnique({ where: { id } });

  if (!existingServer) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  let data;
  let targetServiceName = existingServer.systemdServiceName;
  let targetExecStart = existingServer.execStart;
  const voiceServer = isVoiceServer(existingServer.systemdServiceName);

  if (user.role === "ADMIN") {
    const adminParsed = serverSchema.parse(body);
    data = voiceServer
      ? {
          name: adminParsed.name,
          description: adminParsed.description,
          systemdServiceName: adminParsed.systemdServiceName,
        }
      : adminParsed;
    targetServiceName = adminParsed.systemdServiceName;
    targetExecStart = voiceServer ? existingServer.execStart : adminParsed.execStart;
  } else {
    const userParsed = userServerSchema.parse(body);
    targetExecStart = voiceServer
      ? existingServer.execStart
      : composeExecStartFromExisting(
          existingServer.execStart,
          existingServer.systemdServiceName,
          userParsed,
        );

    data = voiceServer
      ? {
          name: userParsed.name,
          description: userParsed.description,
        }
      : {
          name: userParsed.name,
          description: userParsed.description,
          fsGame: userParsed.fsGame,
          punkbuster: userParsed.punkbuster,
          configFile: userParsed.configFile,
          rconPassword: userParsed.rconPassword,
          extraParameters: userParsed.extraParameters,
          execStart: targetExecStart,
        };
  }

  if (!voiceServer) {
    await applySystemdExecStart(targetServiceName, targetExecStart);
  }

  const server = await prisma.gameServer.update({
    where: { id },
    data,
    include: { assignedUsers: true },
  });

  return NextResponse.json({ server: await serializeServerWithEffectiveExecStart(server, user.role) });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  await prisma.gameServer.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
