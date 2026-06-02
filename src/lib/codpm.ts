type CodPmPlayer = {
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
  players: CodPmPlayer[];
  retrievedAt: number | null;
};

const cache = new Map<string, { expiresAt: number; data: ServerPlayers }>();
let codPmQueue = Promise.resolve();
let lastCodPmRequestAt = 0;

function getCodPmBaseUrl() {
  return process.env.CODPM_API_BASE_URL ?? "https://api.cod.pm";
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePlayers(value: unknown): CodPmPlayer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((player) => {
    const record = player && typeof player === "object" ? (player as Record<string, unknown>) : {};

    return {
      name: normalizeText(record.name) || "Unnamed player",
      score: normalizeText(record.score) || "0",
      ping: normalizeText(record.ping) || "0",
    };
  });
}

async function fetchWithCodPmLimit(url: string) {
  const run = async () => {
    const waitMs = Math.max(0, 1_000 - (Date.now() - lastCodPmRequestAt));

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    lastCodPmRequestAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      return await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const next = codPmQueue.then(run, run);
  codPmQueue = next.then(
    () => undefined,
    () => undefined,
  );

  return next;
}

export async function getCodPmPlayers(ip: string, port: string): Promise<ServerPlayers> {
  const cacheKey = `${ip}:${port}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await fetchWithCodPmLimit(`${getCodPmBaseUrl()}/getstatus/${ip}/${port}`);

  if (!response.ok) {
    throw new Error("cod.pm status request failed.");
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const serverinfo =
    payload.serverinfo && typeof payload.serverinfo === "object"
      ? (payload.serverinfo as Record<string, unknown>)
      : {};
  const players = normalizePlayers(payload.playerinfo);

  const data: ServerPlayers = {
    hostname: normalizeText(serverinfo.sv_hostname),
    mapName: normalizeText(serverinfo.mapname),
    gameType: normalizeText(serverinfo.g_gametype),
    maxClients: normalizeNumber(serverinfo.sv_maxclients),
    playerCount: players.length,
    players,
    retrievedAt: normalizeNumber(payload.time_retrieved),
  };

  cache.set(cacheKey, {
    expiresAt: Date.now() + 10_000,
    data,
  });

  return data;
}
