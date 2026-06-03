import net from "node:net";
import type { ServerPlayers } from "@/lib/game-query";

const cache = new Map<string, { expiresAt: number; data: ServerPlayers }>();

type TeamSpeakQueryData = {
  serverInfo: Record<string, string>;
  channelList: Record<string, string>[];
  clientList: Record<string, string>[];
};

function unescapeServerQueryValue(value: string) {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\p/g, "|")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

function parseServerQueryFields(line: string) {
  const fields: Record<string, string> = {};

  for (const part of line.trim().split(/\s+/)) {
    const separatorIndex = part.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    fields[part.slice(0, separatorIndex)] = unescapeServerQueryValue(part.slice(separatorIndex + 1));
  }

  return fields;
}

function parseServerQueryList(line: string) {
  return line
    .trim()
    .split("|")
    .filter(Boolean)
    .map(parseServerQueryFields);
}

function numberField(fields: Record<string, string>, key: string) {
  const value = Number(fields[key]);
  return Number.isFinite(value) ? value : 0;
}

function getLineAfterCommand(lines: string[], command: string) {
  const commandIndex = lines.findIndex((line) => line.trim() === command);

  if (commandIndex < 0) {
    return "";
  }

  return lines.slice(commandIndex + 1).find((line) => line.trim() && !line.startsWith("error ")) ?? "";
}

export async function queryTeamSpeakPlayers({
  host,
  queryPort,
  voicePort,
}: {
  host: string;
  queryPort: number;
  voicePort: number;
}): Promise<ServerPlayers> {
  const cacheKey = `${host}:${queryPort}:${voicePort}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const queryData = await new Promise<TeamSpeakQueryData>((resolve, reject) => {
    const socket = net.createConnection({ host, port: queryPort });
    let buffer = "";
    let serverInfoSent = false;
    let completed = false;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("TeamSpeak query timed out."));
    }, 4_000);

    socket.setEncoding("utf8");

    socket.on("data", (chunk) => {
      buffer += chunk;

      if (!serverInfoSent && buffer.includes("TS3")) {
        serverInfoSent = true;
        socket.write(`use port=${voicePort}\r\nserverinfo\r\nchannellist\r\nclientlist\r\nquit\r\n`);
      }

      const lines = buffer.split(/\r?\n/);
      const serverInfoLine = getLineAfterCommand(lines, "serverinfo");
      const channelListLine = getLineAfterCommand(lines, "channellist");
      const clientListLine = getLineAfterCommand(lines, "clientlist");

      if (serverInfoLine && channelListLine && clientListLine) {
        completed = true;
        clearTimeout(timeout);
        socket.end();
        resolve({
          serverInfo: parseServerQueryFields(serverInfoLine),
          channelList: parseServerQueryList(channelListLine),
          clientList: parseServerQueryList(clientListLine),
        });
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on("close", () => {
      clearTimeout(timeout);

      if (!completed) {
        reject(new Error(serverInfoSent ? "TeamSpeak query closed before serverinfo." : "TeamSpeak query closed before welcome."));
      }
    });
  });

  const fields = queryData.serverInfo;
  const clientsByChannel = new Map<string, ServerPlayers["players"]>();

  for (const client of queryData.clientList) {
    if (client.client_type === "1") {
      continue;
    }

    const channelId = client.cid ?? "0";
    const existingClients = clientsByChannel.get(channelId) ?? [];
    existingClients.push({
      name: client.client_nickname ?? "Unnamed client",
      score: "",
      ping: client.client_ping ?? "",
    });
    clientsByChannel.set(channelId, existingClients);
  }

  const channels = queryData.channelList.map((channel) => ({
    id: channel.cid ?? "",
    parentId: channel.pid ?? "0",
    order: channel.channel_order ?? "0",
    name: channel.channel_name ?? "Unnamed channel",
    clients: clientsByChannel.get(channel.cid ?? "") ?? [],
  }));
  const online = Math.max(
    0,
    numberField(fields, "virtualserver_clientsonline") -
      numberField(fields, "virtualserver_queryclientsonline"),
  );
  const maxClients = numberField(fields, "virtualserver_maxclients");
  const data: ServerPlayers = {
    hostname: fields.virtualserver_name ?? "",
    mapName: "",
    gameType: "ts3",
    maxClients: maxClients > 0 ? maxClients : null,
    playerCount: online,
    players: channels.flatMap((channel) => channel.clients),
    channels,
    retrievedAt: Math.floor(Date.now() / 1000),
  };

  cache.set(cacheKey, {
    expiresAt: Date.now() + 5_000,
    data,
  });

  return data;
}
