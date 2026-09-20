import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Admin overview: who is watching what.
 *
 * Read-only by design. The admin does not own anyone's webhook, so there is nothing to
 * edit here — the value is answering "why did Bob not get paged?" during an outage.
 * `hint` never contains the webhook token.
 */
export async function GET() {
  await requireAdmin();

  const [subscriptions, openIncidents, stats] = await Promise.all([
    prisma.alertSubscription.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        channel: {
          select: {
            id: true,
            label: true,
            hint: true,
            verifiedAt: true,
            lastError: true,
            lastErrorAt: true,
          },
        },
        servers: { include: { server: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),

    prisma.incident.findMany({
      where: { resolvedAt: null },
      include: { server: { select: { id: true, name: true, systemdServiceName: true } } },
      orderBy: { startedAt: "desc" },
    }),

    (async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

      const [openCount, resolved24h, failed24h, resolvedWeek] = await Promise.all([
        prisma.incident.count({ where: { resolvedAt: null } }),
        prisma.incident.count({ where: { resolvedAt: { gte: dayAgo } } }),
        prisma.alertDelivery.count({ where: { ok: false, sentAt: { gte: dayAgo } } }),
        prisma.incident.findMany({
          where: { resolvedAt: { gte: weekAgo } },
          select: { durationSeconds: true },
        }),
      ]);

      const durations = resolvedWeek
        .map((row) => row.durationSeconds ?? 0)
        .filter((value) => value > 0);

      return {
        openCount,
        resolved24h,
        failed24h,
        longest7d: durations.length ? Math.max(...durations) : 0,
        uptime7dPct: durations.length
          ? Math.max(
              0,
              100 -
                (durations.reduce((sum, value) => sum + value, 0) /
                  (7 * 24 * 60 * 60)) *
                  100,
            )
          : 100,
      };
    })(),
  ]);

  return NextResponse.json({
    stats,
    openIncidents: openIncidents.map((incident) => ({
      id: incident.id,
      kind: incident.kind,
      startedAt: incident.startedAt,
      alertCount: incident.alertCount,
      server: incident.server,
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      user: subscription.user,
      scope: subscription.scope,
      servers: subscription.servers.map((entry) => entry.server),
      minDowntimeSeconds: subscription.minDowntimeSeconds,
      repeatMinutes: subscription.repeatMinutes,
      notifyOnRecovery: subscription.notifyOnRecovery,
      enabled: subscription.enabled,
      channel: subscription.channel,
    })),
  });
}
