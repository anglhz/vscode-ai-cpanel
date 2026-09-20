import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/alert-crypto";

/**
 * Fire a representative down + recovery pair into the caller's own webhook.
 *
 * This exists so a user can see exactly what an alert looks like before trusting it.
 * It deliberately does not touch Incident or AlertDelivery — it is a cosmetic probe.
 */
export async function POST() {
  const user = await requireUser();

  const channel = await prisma.alertChannel.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (!channel) {
    return NextResponse.json({ error: "Add a Discord webhook first." }, { status: 400 });
  }

  let webhookUrl: string;
  try {
    webhookUrl = decryptSecret(channel.destination);
  } catch {
    return NextResponse.json(
      { error: "Stored webhook could not be read. Paste it again." },
      { status: 500 },
    );
  }

  const messages = [
    "[ALERT] **Example Game Server** is down (example.service).\nIt is expected to be running, but has been offline since <t:1750000000:t> (just now).\nI will remind you every 60 min until it recovers.\n\n_This is a test — nothing is actually broken._",
    "[RECOVERED] **Example Game Server** is back online.\nWas down for 4m 12s.\n\n_This is a test — nothing was actually broken._",
  ];

  for (const content of messages) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Discord returned HTTP ${response.status}`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not reach Discord.";

      await prisma.alertChannel.update({
        where: { id: channel.id },
        data: { verifiedAt: null, lastError: message, lastErrorAt: new Date() },
      });

      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  await prisma.alertChannel.update({
    where: { id: channel.id },
    data: { verifiedAt: new Date(), lastError: null, lastErrorAt: null },
  });

  return NextResponse.json({ ok: true });
}
