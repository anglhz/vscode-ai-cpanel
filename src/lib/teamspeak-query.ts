import net from "node:net";
import type { ServerPlayers } from "@/lib/game-query";

const cache = new Map<string, { expiresAt: number; data: ServerPlayers }>();

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

function numberField(fields: Record<string, string>, key: string) {
  const value = Number(fields[key]);
  return Number.isFinite(value) ? value : 0;
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

  const fields = await new Promise<Record<string, string>>((resolve, reject) => {
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
        socket.write(`use port=${voicePort}\r\nserverinfo\r\nquit\r\n`);
      }

      const serverInfoLine = buffer
        .split(/\r?\n/)
        .find((line) => line.includes("virtualserver_clientsonline="));

      if (serverInfoLine) {
        completed = true;
        clearTimeout(timeout);
        socket.end();
        resolve(parseServerQueryFields(serverInfoLine));
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
    players: [],
    retrievedAt: Math.floor(Date.now() / 1000),
  };

  cache.set(cacheKey, {
    expiresAt: Date.now() + 5_000,
    data,
  });

  return data;
}
