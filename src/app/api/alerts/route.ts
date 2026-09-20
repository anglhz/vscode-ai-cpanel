import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret, parseDiscordWebhook, describeDestination } from "@/lib/alert-crypto";

/**
 * A user's alert configuration, in one payload.
 *
 * The client never sees a webhook URL. It sends one on save; the server encrypts it and
 * returns only a non-secret `hint` so the UI can show "Discord · …a1b2c3".
 */

const saveSchema = z.object({
  /** Omit to keep the existing webhook; omit entirely when none exists yet. */
  webhookUrl: z.string().trim().optional(),
  label: z.string().trim().max(60).optional(),
  /** All servers the user can see, or only the ones listed below. */
  scope: z.enum(["ALL", "SPECIFIC"]),
  serverIds: z.array(z.string()).default([]),
  minDowntimeSeconds: z.number().int().min(0).max(86_400).default(0),
  repeatMinutes: z.number().int().min(0).max(1_440).default(60),
  notifyOnRecovery: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Servers this user is allowed to subscribe to. */
async function visibleServers(userId: string, role: string) {
  if (role === "ADMIN") {
    return prisma.gameServer.findMany({
      select: { id: true, name: true, status: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  }

  const rows = await prisma.userServerAccess.findMany({
    where: { userId },
    include: { server: { select: { id: true, name: true, status: true } } },
  });

  return rows
    .map((row) => row.server)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  const user = await requireUser();

  const [channel, subscription, servers] = await Promise.all([
    prisma.alertChannel.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { subscriptions: { include: { servers: { select: { serverId: true } } } } },
    }),
    prisma.alertSubscription.findFirst({
      where: { userId: user.id },
      include: { servers: { select: { serverId: true } } },
    }),
    visibleServers(user.id, user.role),
  ]);

  const recent = await prisma.alertDelivery.findMany({
    where: { subscription: { userId: user.id } },
    orderBy: { sentAt: "desc" },
    take: 8,
    include: { incident: { include: { server: { select: { name: true } } } } },
  });

  return NextResponse.json({
    servers,
    channel: channel
      ? {
          id: channel.id,
          label: channel.label,
          hint: channel.hint,
          verifiedAt: channel.verifiedAt,
          lastError: channel.lastError,
          lastErrorAt: channel.lastErrorAt,
          hasWebhook: true,
        }
      : null,
    subscription: subscription
      ? {
          id: subscription.id,
          scope: subscription.scope,
          serverIds: subscription.servers.map((entry) => entry.serverId),
          minDowntimeSeconds: subscription.minDowntimeSeconds,
          repeatMinutes: subscription.repeatMinutes,
          notifyOnRecovery: subscription.notifyOnRecovery,
          enabled: subscription.enabled,
        }
      : null,
    history: recent.map((delivery) => ({
      id: delivery.id,
      kind: delivery.kind,
      ok: delivery.ok,
      error: delivery.error,
      sentAt: delivery.sentAt,
      serverName: delivery.incident.server.name,
    })),
  });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(await request.json());

  if (!parsed.success) {
    return invalid("Invalid alert settings.");
  }

  const { webhookUrl, label, serverIds, ...subscriptionData } = parsed.data;

  // ── Channel: create or replace the webhook ────────────────────────────────
  let channel = await prisma.alertChannel.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (webhookUrl) {
    const parsedHook = parseDiscordWebhook(webhookUrl);

    if (!parsedHook) {
      return invalid(
        "That does not look like a Discord webhook URL. It should start with https://discord.com/api/webhooks/",
      );
    }

    const destination = encryptSecret(webhookUrl.trim());
    const hint = describeDestination(webhookUrl);

    if (channel) {
      channel = await prisma.alertChannel.update({
        where: { id: channel.id },
        data: { destination, hint, label: label || channel.label, lastError: null, lastErrorAt: null },
      });
    } else {
      channel = await prisma.alertChannel.create({
        data: {
          userId: user.id,
          destination,
          hint,
          label: label || "Discord",
        },
      });
    }

    // Prove the webhook works before the user relies on it.
    try {
      const response = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content:
            "✅ **Intuitive Gaming alerts connected.** You will get downtime messages in this channel.",
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord returned HTTP ${response.status}`);
      }

      channel = await prisma.alertChannel.update({
        where: { id: channel.id },
        data: { verifiedAt: new Date(), lastError: null, lastErrorAt: null },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not reach Discord.";

      channel = await prisma.alertChannel.update({
        where: { id: channel.id },
        data: { verifiedAt: null, lastError: message, lastErrorAt: new Date() },
      });

      return NextResponse.json(
        {
          error: `Saved, but the test message failed: ${message}`,
          saved: true,
          channelId: channel.id,
        },
        { status: 502 },
      );
    }
  }

  if (!channel) {
    return invalid("Add a Discord webhook first.");
  }

  // ── Subscription: replace scope rows wholesale, it is a tiny set ──────────
  const allowed = await visibleServers(user.id, user.role);
  const allowedIds = new Set(allowed.map((server) => server.id));
  const chosen = serverIds.filter((id) => allowedIds.has(id));

  if (subscriptionData.scope === "SPECIFIC" && chosen.length === 0) {
    return invalid("Pick at least one server, or switch to all servers.");
  }

  const existing = await prisma.alertSubscription.findFirst({ where: { userId: user.id } });

  const subscription = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.alertSubscription.update({
          where: { id: existing.id },
          data: { channelId: channel.id, ...subscriptionData },
        })
      : await tx.alertSubscription.create({
          data: { userId: user.id, channelId: channel.id, ...subscriptionData },
        });

    await tx.alertSubscriptionServer.deleteMany({ where: { subscriptionId: saved.id } });

    if (subscriptionData.scope === "SPECIFIC") {
      await tx.alertSubscriptionServer.createMany({
        data: chosen.map((serverId) => ({ subscriptionId: saved.id, serverId })),
      });
    }

    return saved;
  });

  return NextResponse.json({
    ok: true,
    channel: {
      id: channel.id,
      label: channel.label,
      hint: channel.hint,
      verifiedAt: channel.verifiedAt,
      lastError: channel.lastError,
      hasWebhook: true,
    },
    subscription: {
      id: subscription.id,
      scope: subscription.scope,
      serverIds: subscription.scope === "SPECIFIC" ? chosen : [],
      minDowntimeSeconds: subscription.minDowntimeSeconds,
      repeatMinutes: subscription.repeatMinutes,
      notifyOnRecovery: subscription.notifyOnRecovery,
      enabled: subscription.enabled,
    },
  });
}

/** Remove the webhook and all of the user's alert settings. */
export async function DELETE() {
  const user = await requireUser();

  await prisma.alertChannel.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({ ok: true });
}
