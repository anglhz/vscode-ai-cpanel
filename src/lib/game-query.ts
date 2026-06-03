import dgram from "node:dgram";

type QueryPlayer = {
  name: string;
  score: string;
  ping: string;
};

export type ServerPlayers = {
  hostname: string;
  mapName: string;
  gameType: string;
  maxClients: number | null;
  playerCount: number;
  players: QueryPlayer[];
  retrievedAt: number | null;
};

const cache = new Map<string, { expiresAt: number; data: ServerPlayers }>();

function parseInfoLine(infoLine: string) {
  const info: Record<string, string> = {};
  const parts = infoLine.split("\\").filter(Boolean);

  for (let index = 0; index < parts.length; index += 2) {
    const key = parts[index];
    const value = parts[index + 1];

    if (key && value !== undefined) {
      info[key] = value;
    }
  }

  return info;
}

function parsePlayerLine(line: string): QueryPlayer | null {
  const match = line.match(/^\s*(-?\d+)\s+(\d+)\s+"(.*)"\s*$/);

  if (!match) {
    return null;
  }

  return {
    score: match[1],
    ping: match[2],
    name: match[3] || "Unnamed player",
  };
}

function parseStatusResponse(message: Buffer): ServerPlayers {
  const text = message.toString("latin1").replace(/^\xff\xff\xff\xff/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const infoLine = lines.find((line) => line.startsWith("\\")) ?? "";
  const info = parseInfoLine(infoLine);
  const players = lines
    .slice(lines.indexOf(infoLine) + 1)
    .map(parsePlayerLine)
    .filter((player): player is QueryPlayer => Boolean(player));

  const maxClients = Number(info.sv_maxclients);

  return {
    hostname: info.sv_hostname ?? "",
    mapName: info.mapname ?? "",
    gameType: info.g_gametype ?? "",
    maxClients: Number.isFinite(maxClients) ? maxClients : null,
    playerCount: players.length,
    players,
    retrievedAt: Math.floor(Date.now() / 1000),
  };
}

export async function queryGameServerPlayers(ip: string, port: number): Promise<ServerPlayers> {
  const cacheKey = `${ip}:${port}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await new Promise<ServerPlayers>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const payload = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from("getstatus")]);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Game server query timed out."));
    }, 2_500);

    socket.once("message", (message) => {
      clearTimeout(timeout);
      socket.close();
      resolve(parseStatusResponse(message));
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });

    socket.send(payload, port, ip);
  });

  cache.set(cacheKey, {
    expiresAt: Date.now() + 5_000,
    data,
  });

  return data;
}
