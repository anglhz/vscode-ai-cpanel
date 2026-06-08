import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ prisma }, { handleServerStatusAlert }, { isLocalNode, remoteGetServerStatus }, { getSystemdStatus }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/server-alerts"),
    import("@/lib/node-client"),
    import("@/lib/systemd"),
  ]);
  const servers = await prisma.gameServer.findMany({
    include: { node: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  for (const server of servers) {
    try {
      const liveStatus =
        !server.node || isLocalNode(server.node)
          ? await getSystemdStatus(server.systemdServiceName)
          : await remoteGetServerStatus(server.node, server.systemdServiceName);
      await handleServerStatusAlert(server, liveStatus);

      if (liveStatus !== "UNKNOWN" && liveStatus !== server.status) {
        await prisma.gameServer.update({
          where: { id: server.id },
          data: { status: liveStatus },
        });
      }
    } catch (error) {
      console.error(
        `Could not monitor ${server.name}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}

main()
  .then(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    process.exit(1);
  });
