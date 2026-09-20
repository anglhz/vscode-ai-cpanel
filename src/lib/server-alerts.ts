import { prisma } from "@/lib/prisma";
import type { ServerStatus } from "@/lib/systemd";
import { decryptSecret } from "@/lib/alert-crypto";

/**
 * Downtime alerting.
 *
 * The unit of alerting is an `Incident`, not a server status snapshot. Each monitor
 * tick reconciles one server against its open incident:
 *
 *   expected running + actually offline  -> open an incident (or repeat on an open one)
 *   expected running + actually online   -> resolve the open incident, send all-clear
 *   expected stopped (any status)        -> resolve silently, the user asked for this
 *
 * Subscribers are resolved per incident. A subscriber is an `AlertSubscription` row
 * owned by a user, pointing at one of that user's own Discord webhooks.
 */

/** A server that has come back and gone down again inside this window is flapping. */
const FLAP_WINDOW_MS = 10 * 60 * 1_000;

/** An incident is not considered "flapping" until it has reopened this many times. */
const FLAP_THRESHOLD = 3;

type AlertableServer = {
  id: string;
  name: string;
  systemdServiceName: string;
  status: string;
  desiredState: string;
  lastDownAlertAt: Date | null;
};

type OpenIncident = {
  id: string;
  kind: string;
  startedAt: Date;
  alertCount: number;
  lastAlertAt: Date | null;
};

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

async function findOpenIncident(serverId: string): Promise<OpenIncident | null> {
  return prisma.incident.findFirst({
    where: { serverId, resolvedAt: null },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      kind: true,
      startedAt: true,
      alertCount: true,
      lastAlertAt: true,
    },
  });
}

/**
 * Which incidents were recently resolved for this server? Used for the flap guard:
 * three recoveries inside the flap window means stop trusting the up/down signal.
 */
async function countRecentResolutions(serverId: string) {
  const since = new Date(Date.now() - FLAP_WINDOW_MS);

  return prisma.incident.count({
    where: { serverId, resolvedAt: { not: null, gte: since } },
  });
}

/**
 * Resolve the subscriptions that should hear about this incident.
 *
 * Access rules:
 *  - `scope = ALL` matches every server the subscriber can currently see.
 *  - `scope = SPECIFIC` matches only the servers listed on the join table.
 * Admins always see every server, which is how "admin alerts for all servers" works
 * without a separate code path: an admin subscription with `scope = ALL` is just a row.
 */
async function resolveSubscribers(serverId: string) {
  const server = await prisma.gameServer.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      name: true,
      systemdServiceName: true,
      assignedUsers: { select: { userId: true } },
    },
  });

  if (!server) {
    return [];
  }

  const assignedUserIds = server.assignedUsers.map((entry) => entry.userId);

  return prisma.alertSubscription.findMany({
    where: {
      enabled: true,
      OR: [
        // Scope ALL, but only for people who can actually see this server.
        {
          scope: "ALL",
          user: {
            role: "ADMIN",
          },
        },
        {
          scope: "ALL",
          userId: { in: assignedUserIds.length ? assignedUserIds : ["__none__"] },
        },
        // Scope SPECIFIC: the join row is the permission.
        {
          scope: "SPECIFIC",
          servers: { some: { serverId } },
        },
      ],
    },
    include: {
      channel: true,
      user: { select: { id: true, name: true, role: true } },
    },
  });
}

type DeliveryTarget = Awaited<ReturnType<typeof resolveSubscribers>>[number];

/**
 * Send one message to one Discord webhook. Discord returns 204 on success.
 * A 404/401 means the webhook was deleted or its token rotated — record it so the UI
 * can tell the user their channel is broken, instead of failing silently forever.
 */
async function postToChannel(webhookUrl: string, content: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });

  if (!response.ok) {
    throw new Error(`Discord returned HTTP ${response.status}`);
  }
}

async function deliver(
  subscription: DeliveryTarget,
  incidentId: string,
  kind: string,
  content: string,
) {
  let ok = true;
  let error: string | null = null;

  try {
    const webhookUrl = decryptSecret(subscription.channel.destination);
    await postToChannel(webhookUrl, content);

    await prisma.alertChannel.update({
      where: { id: subscription.channelId },
      data: { verifiedAt: new Date(), lastError: null, lastErrorAt: null },
    });
  } catch (cause) {
    ok = false;
    error = cause instanceof Error ? cause.message : "Unknown delivery error";

    await prisma.alertChannel.update({
      where: { id: subscription.channelId },
      data: { lastError: error, lastErrorAt: new Date() },
    });
  }

  await prisma.alertDelivery.create({
    data: {
      incidentId,
      subscriptionId: subscription.id,
      channelId: subscription.channelId,
      kind,
      ok,
      error,
    },
  });

  return ok;
}

function mentionFor(subscription: DeliveryTarget) {
  if (subscription.user.role === "ADMIN") {
    return " (admin)";
  }

  return "";
}

async function openIncident(server: AlertableServer) {
  const recentResolutions = await countRecentResolutions(server.id);
  const kind = recentResolutions >= FLAP_THRESHOLD ? "FLAPPING" : "DOWN";

  return prisma.incident.create({
    data: { serverId: server.id, kind, startedAt: new Date() },
  });
}

async function resolveIncident(
  server: AlertableServer,
  incident: OpenIncident,
  reason: string,
) {
  const resolvedAt = new Date();
  const durationSeconds = Math.max(
    0,
    Math.round((resolvedAt.getTime() - incident.startedAt.getTime()) / 1000),
  );

  await prisma.incident.update({
    where: { id: incident.id },
    data: { resolvedAt, durationSeconds, resolution: reason },
  });

  return durationSeconds;
}

export async function handleServerStatusAlert(
  server: AlertableServer,
  liveStatus: ServerStatus,
) {
  if (liveStatus === "UNKNOWN") {
    return;
  }

  const openIncidentRow = await findOpenIncident(server.id);
  const expectedRunning = server.desiredState === "RUNNING";
  const actuallyDown = liveStatus === "OFFLINE";

  // ── Server came back (or was stopped on purpose) while an incident was open ──
  if (!actuallyDown || !expectedRunning) {
    if (!openIncidentRow) {
      return;
    }

    const reason = !expectedRunning ? "manually stopped" : "recovered";
    const durationSeconds = await resolveIncident(server, openIncidentRow, reason);

    await prisma.gameServer.update({
      where: { id: server.id },
      data: { lastDownAlertAt: null },
    });

    if (reason !== "recovered") {
      return;
    }

    // All-clear only goes to subscribers who asked for recovery notices.
    const subscribers = await resolveSubscribers(server.id);
    const heading =
      openIncidentRow.kind === "FLAPPING"
        ? `[RECOVERED] ${server.name} is back, but it has been flapping.`
        : `[RECOVERED] ${server.name} is back online.`;

    const message = `${heading}\nWas down for ${formatDuration(durationSeconds)} (since <t:${Math.floor(
      openIncidentRow.startedAt.getTime() / 1000,
    )}:t>).`;

    for (const subscription of subscribers) {
      if (!subscription.notifyOnRecovery) {
        continue;
      }

      await deliver(subscription, openIncidentRow.id, "RECOVERY", message);
    }

    return;
  }

  // ── Server is unexpectedly down ─────────────────────────────────────────────
  const incident = openIncidentRow ?? (await openIncident(server));
  const isNew = !openIncidentRow;
  const downForSeconds = (Date.now() - incident.startedAt.getTime()) / 1000;
  const subscribers = await resolveSubscribers(server.id);
  const now = Date.now();

  for (const subscription of subscribers) {
    // Sensitivity: hold the message until the outage is long enough to matter.
    if (isNew && downForSeconds < subscription.minDowntimeSeconds) {
      continue;
    }

    // Throttle: one message per (incident, subscription) per repeatMinutes.
    const lastDelivery = await prisma.alertDelivery.findFirst({
      where: { incidentId: incident.id, subscriptionId: subscription.id, kind: "DOWN" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });

    if (lastDelivery) {
      const repeatMs = Math.max(1, subscription.repeatMinutes) * 60 * 1_000;

      if (now - lastDelivery.sentAt.getTime() < repeatMs) {
        continue;
      }
    }

    const kind = incident.kind === "FLAPPING" ? "FLAPPING" : "DOWN";
    const prefix = incident.kind === "FLAPPING" ? "[FLAPPING]" : "[ALERT]";
    const elapsed =
      downForSeconds < 60
        ? "just now"
        : `${formatDuration(downForSeconds)} ago`;

    const message = [
      `${prefix} ${server.name} is down (${server.systemdServiceName})${mentionFor(subscription)}.`,
      `It is expected to be running, but has been offline since <t:${Math.floor(
        incident.startedAt.getTime() / 1000,
      )}:t> (${elapsed}).`,
      incident.kind === "FLAPPING"
        ? "This server keeps coming back and going down again — it is probably crash-looping."
        : "",
      subscription.repeatMinutes > 0
        ? `I will remind you every ${subscription.repeatMinutes} min until it recovers.`
        : "You will get one more message when it recovers.",
    ]
      .filter(Boolean)
      .join("\n");

    await deliver(subscription, incident.id, kind, message);
  }

  if (!isNew) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { alertCount: { increment: 1 }, lastAlertAt: new Date() },
    });
  } else {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { alertCount: 1, lastAlertAt: subscribers.length ? new Date() : null },
    });
  }

  await prisma.gameServer.update({
    where: { id: server.id },
    data: { lastDownAlertAt: new Date() },
  });
}

export { formatDuration };
