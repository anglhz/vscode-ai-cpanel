import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

export async function canAccessServer(user: SessionUser, serverId: string) {
  if (user.role === "ADMIN") {
    return true;
  }

  const access = await prisma.userServerAccess.findUnique({
    where: { userId_serverId: { userId: user.id, serverId } },
  });

  return Boolean(access);
}
