import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isLocalNode } from "@/lib/node-client";
import { prisma } from "@/lib/prisma";
import { canAccessServer } from "@/lib/rbac";
import { updateCodbaseLinkedFiles } from "@/lib/systemd";

const TARGET_SERVICES = [
  "cod1-28902.service",
  "cod1-28903.service",
  "cod1-28904.service",
  "cod1-28905.service",
  "cod1-28906.service",
  "cod1-28907.service",
  "cod1-28908.service",
  "cod1-28909.service",
  "cod1-28913.service",
];

export async function POST() {
  const user = await requireUser();
  const servers = await prisma.gameServer.findMany({
    where: {
      systemdServiceName: {
        in: ["cod1-28901.service", ...TARGET_SERVICES],
      },
    },
    include: { node: true },
  });
  const master = servers.find((server) => server.systemdServiceName === "cod1-28901.service");
  const targets = servers.filter((server) => TARGET_SERVICES.includes(server.systemdServiceName));

  if (!master) {
    return NextResponse.json({ error: "CoDBase master server cod1-28901.service was not found." }, { status: 404 });
  }

  if (!isLocalNode(master.node) || targets.some((server) => !isLocalNode(server.node))) {
    return NextResponse.json({ error: "CoDBase link update currently supports local servers only." }, { status: 400 });
  }

  if (user.role !== "ADMIN") {
    const allowed = await Promise.all([master, ...targets].map((server) => canAccessServer(user, server.id)));

    if (allowed.some((value) => !value)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const result = await updateCodbaseLinkedFiles({
      masterExecStart: master.execStart,
      targetExecStarts: targets.map((server) => server.execStart),
    });

    return NextResponse.json({ ok: true, updated: result.updated, skipped: result.skipped });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update CoDBase links." },
      { status: 500 },
    );
  }
}
