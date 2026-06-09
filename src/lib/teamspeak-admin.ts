import net from "node:net";

export type TeamSpeakLiveInfo = {
  virtualserverName: string;
  welcomeMessage: string;
  clientCount: number;
  maxClients: number;
  uptime: number;
  status: string;
};

export type TeamSpeakClient = {
  id: string;
  databaseId: string;
  nickname: string;
  type: string;
};

type CommandResult = {
  lines: string[];
};

function escapeServerQueryValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\//g, "\\/")
    .replace(/\|/g, "\\p")
    .replace(/ /g, "\\s");
}

function unescapeServerQueryValue(value: string) {
  return value
    .replace(/\\s/g, " ")
    .replace(/\\p/g, "|")
    .replace(/\\\//g, "/")
    .replace(/\\\\/g, "\\");
}

function parseFields(line: string) {
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

async function runServerQuery({
  host,
  queryPort,
  apiKey,
  voicePort,
  commands,
}: {
  host: string;
  queryPort: number;
  apiKey: string;
  voicePort: number;
  commands: string[];
}) {
  return new Promise<CommandResult>((resolve, reject) => {
    const socket = net.createConnection({ host, port: queryPort });
    const lines: string[] = [];
    let buffer = "";
    let completedErrors = 0;
    let sent = false;
    const expectedErrors = commands.length + 3;
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("TeamSpeak query timed out."));
    }, 5_000);

    socket.setEncoding("utf8");

    socket.on("data", (chunk) => {
      buffer += chunk;

      if (!sent && buffer.includes("TS3")) {
        sent = true;
        socket.write(`auth apikey=${escapeServerQueryValue(apiKey)}\r\n`);
        socket.write(`use port=${voicePort}\r\n`);
        for (const command of commands) {
          socket.write(`${command}\r\n`);
        }
        socket.write("quit\r\n");
      }

      for (;;) {
        const newlineIndex = buffer.search(/\r?\n/);

        if (newlineIndex < 0) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(line.endsWith("\r") ? newlineIndex + 2 : newlineIndex + 1);

        if (!line || line === "TS3" || line.startsWith("Welcome")) {
          continue;
        }

        if (line.startsWith("error ")) {
          completedErrors += 1;
          const fields = parseFields(line);

          if (fields.id && fields.id !== "0") {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error(fields.msg ? `TeamSpeak query failed: ${fields.msg}` : "TeamSpeak query failed."));
            return;
          }

          if (completedErrors >= expectedErrors) {
            clearTimeout(timeout);
            socket.end();
            resolve({ lines });
          }
          continue;
        }

        lines.push(line);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function getTeamSpeakLiveInfo(config: {
  host: string;
  queryPort: number;
  voicePort: number;
  apiKey: string;
}) {
  const result = await runServerQuery({
    ...config,
    commands: ["serverinfo", "clientlist"],
  });
  const serverInfo = parseFields(result.lines.find((line) => line.includes("virtualserver_name=")) ?? "");
  const clients = parseTeamSpeakClients(result.lines.find((line) => line.includes("clid=")) ?? "");
  const queryClients = clients.filter((client) => client.type === "1").length;
  const clientCount = Math.max(0, numberField(serverInfo, "virtualserver_clientsonline") - queryClients);

  return {
    info: {
      virtualserverName: serverInfo.virtualserver_name ?? "",
      welcomeMessage: serverInfo.virtualserver_welcomemessage ?? "",
      clientCount,
      maxClients: numberField(serverInfo, "virtualserver_maxclients"),
      uptime: numberField(serverInfo, "virtualserver_uptime"),
      status: serverInfo.virtualserver_status ?? "unknown",
    } satisfies TeamSpeakLiveInfo,
    clients: clients.filter((client) => client.type !== "1"),
  };
}

export async function updateTeamSpeakVirtualServer(
  config: {
    host: string;
    queryPort: number;
    voicePort: number;
    apiKey: string;
  },
  settings: {
    virtualserverName: string;
    welcomeMessage: string;
    maxClients: number;
  },
) {
  await runServerQuery({
    ...config,
    commands: [
      `serveredit virtualserver_name=${escapeServerQueryValue(settings.virtualserverName)} virtualserver_welcomemessage=${escapeServerQueryValue(settings.welcomeMessage)} virtualserver_maxclients=${settings.maxClients}`,
    ],
  });
}

function parseTeamSpeakClients(line: string) {
  if (!line) {
    return [];
  }

  return line.split("|").map((clientLine) => {
    const fields = parseFields(clientLine);

    return {
      id: fields.clid ?? "",
      databaseId: fields.client_database_id ?? "",
      nickname: fields.client_nickname ?? "",
      type: fields.client_type ?? "0",
    };
  });
}
