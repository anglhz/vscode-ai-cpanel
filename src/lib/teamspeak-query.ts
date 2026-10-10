import net from "node:net";
import type { ServerPlayers } from "@/lib/game-query";

const cache = new Map<string, { expiresAt: number; data: ServerPlayers }>();

type QueryStage = "welcome" | "use" | "serverinfo" | "complete";

export type TeamSpeakQueryErrorContext = {
  host: string;
  queryPort: number;
  voicePort: number;
  stage: QueryStage;
  socketCode?: string;
  welcomeReceived: boolean;
  useSent: boolean;
  serverInfoSent: boolean;
  responseExcerpt: string;
  teamSpeakError?: string;
};

export class TeamSpeakQueryError extends Error {
  readonly context: TeamSpeakQueryErrorContext;

  constructor(message: string, context: TeamSpeakQueryErrorContext, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TeamSpeakQueryError";
    this.context = context;
  }
}

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

function parseErrorLine(line: string) {
  if (!line.startsWith("error ")) {
    return null;
  }

  const fields = parseServerQueryFields(line);
  return { id: fields.id ?? "unknown", line };
}

function sanitizeResponse(lines: string[]) {
  return lines
    .slice(-12)
    .join("\n")
    .replace(/(password|token|apikey|api_key|auth)=[^\s]*/gi, "$1=[redacted]")
    .slice(0, 2_000);
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
    let pending = "";
    let stage: QueryStage = "welcome";
    let welcomeReceived = false;
    let useSent = false;
    let serverInfoSent = false;
    let settled = false;
    let serverInfoFields: Record<string, string> | null = null;
    const responseLines: string[] = [];

    const context = (socketCode?: string, teamSpeakError?: string): TeamSpeakQueryErrorContext => ({
      host,
      queryPort,
      voicePort,
      stage,
      socketCode,
      welcomeReceived,
      useSent,
      serverInfoSent,
      responseExcerpt: sanitizeResponse(responseLines),
      teamSpeakError,
    });

    const finishError = (message: string, socketCode?: string, teamSpeakError?: string, cause?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      reject(new TeamSpeakQueryError(message, context(socketCode, teamSpeakError), { cause }));
    };

    const finishSuccess = (result: Record<string, string>) => {
      if (settled) return;
      settled = true;
      stage = "complete";
      clearTimeout(timeout);
      socket.write("quit\r\n", () => socket.end());
      resolve(result);
    };

    const timeout = setTimeout(() => finishError("TeamSpeak query timed out.", "ETIMEDOUT"), 5_000);

    socket.setEncoding("utf8");

    const processLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;

      responseLines.push(line);

      if (stage === "welcome") {
        if (line === "TS3") {
          welcomeReceived = true;
          useSent = true;
          stage = "use";
          socket.write(`use port=${voicePort}\r\n`);
        }
        return;
      }

      const queryError = parseErrorLine(line);

      if (stage === "use") {
        if (!queryError) return;
        if (queryError.id !== "0") {
          finishError(`TeamSpeak use command failed with error ${queryError.id}.`, undefined, queryError.line);
          return;
        }

        serverInfoSent = true;
        stage = "serverinfo";
        socket.write("serverinfo\r\n");
        return;
      }

      if (stage === "serverinfo") {
        if (line.includes("virtualserver_clientsonline=")) {
          serverInfoFields = parseServerQueryFields(line);
          return;
        }

        if (!queryError) return;
        if (queryError.id !== "0") {
          finishError(`TeamSpeak serverinfo command failed with error ${queryError.id}.`, undefined, queryError.line);
          return;
        }
        if (!serverInfoFields) {
          finishError("TeamSpeak serverinfo response did not include player counts.", undefined, queryError.line);
          return;
        }

        finishSuccess(serverInfoFields);
      }
    };

    socket.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      finishError(`TeamSpeak socket error${error.code ? ` (${error.code})` : ""}.`, error.code, undefined, error);
    });

    socket.once("end", () => {
      if (pending) {
        processLine(pending);
        pending = "";
      }
    });

    socket.once("close", () => {
      if (!settled) {
        finishError(
          welcomeReceived
            ? "TeamSpeak query connection closed before the command completed."
            : "TeamSpeak query connection closed before the welcome banner.",
        );
      }
    });
  });

  const online = Math.max(
    0,
    numberField(fields, "virtualserver_clientsonline") - numberField(fields, "virtualserver_queryclientsonline"),
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

  cache.set(cacheKey, { expiresAt: Date.now() + 5_000, data });
  return data;
}
