import { prisma } from "@/lib/prisma";
import type { ServerStatus } from "@/lib/systemd";

const ONE_HOUR_MS = 60 * 60 * 1_000;

type AlertableServer = {
  id: string;
  name: string;
  systemdServiceName: string;
  status: string;
  desiredState: string;
  lastDownAlertAt: Date | null;
};

function getDiscordWebhookUrl() {
  return process.env.DISCORD_ALERT_WEBHOOK_URL || "";
}

function shouldSendDownAlert(server: AlertableServer, liveStatus: ServerStatus) {
  if (server.desiredState !== "RUNNING" || liveStatus !== "OFFLINE") {
    return false;
  }

  if (!server.lastDownAlertAt) {
    return true;
  }

  return Date.now() - server.lastDownAlertAt.getTime() >= ONE_HOUR_MS;
}

async function sendDiscordMessage(content: string) {
  const webhookUrl = getDiscordWebhookUrl();

  if (!webhookUrl) {
    return { skipped: true };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Discord alert failed with HTTP ${response.status}.`);
  }

  return { skipped: false };
}

export async function handleServerStatusAlert(server: AlertableServer, liveStatus: ServerStatus) {
  if (liveStatus === "ONLINE" && server.lastDownAlertAt) {
    await prisma.gameServer.update({
      where: { id: server.id },
      data: { lastDownAlertAt: null },
    });
    return;
  }

  if (!shouldSendDownAlert(server, liveStatus)) {
    return;
  }

  let result: Awaited<ReturnType<typeof sendDiscordMessage>>;
  try {
    result = await sendDiscordMessage(
      `[ALERT] ${server.name} is down (${server.systemdServiceName}). It is expected to be running. I will remind every hour until it is back online or manually stopped.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Discord alert failed.");
    return;
  }

  if (result.skipped) {
    return;
  }

  await prisma.gameServer.update({
    where: { id: server.id },
    data: { lastDownAlertAt: new Date() },
  });
}
