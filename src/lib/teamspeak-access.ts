import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function canAccessTeamSpeak(user: SessionUser, teamspeakId: string) {
  if (user.role === "ADMIN") {
    return true;
  }

  const access = await prisma.userTeamSpeakAccess.findUnique({
    where: { userId_teamspeakId: { userId: user.id, teamspeakId } },
  });

  return Boolean(access);
}
