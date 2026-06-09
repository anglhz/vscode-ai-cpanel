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
  channelId: string;
};

export type TeamSpeakChannel = {
  id: string;
  parentId: string;
  order: string;
  name: string;
  clients: TeamSpeakClient[];
};

export type TeamSpeakServerGroup = {
  id: string;
  name: string;
  type: string;
};

type CommandResult = {
  lines: string[];
};

type TeamSpeakConfig = {
  host: string;
  queryPort: number;
  voicePort: number;
  apiKey: string;
  queryUsername?: string;
  queryPassword?: string;
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
  queryUsername,
  queryPassword,
  voicePort,
  commands,
}: {
  host: string;
  queryPort: number;
  apiKey: string;
  queryUsername?: string;
  queryPassword?: string;
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
        if (apiKey) {
          socket.write(`auth apikey=${escapeServerQueryValue(apiKey)}\r\n`);
        } else if (queryUsername && queryPassword) {
          socket.write(`login ${escapeServerQueryValue(queryUsername)} ${escapeServerQueryValue(queryPassword)}\r\n`);
        }
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

async function runAuthenticatedQuery(config: TeamSpeakConfig, commands: string[]) {
  try {
    return await runServerQuery({ ...config, commands });
  } catch (error) {
    if (!config.apiKey || !config.queryUsername || !config.queryPassword || !String(error).includes("command not found")) {
      throw error;
    }

    return runServerQuery({ ...config, apiKey: "", commands });
  }
}

export async function getTeamSpeakLiveInfo(config: TeamSpeakConfig) {
  const commands = ["serverinfo", "clientlist"];
  const result = await runAuthenticatedQuery(config, commands);
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
  config: TeamSpeakConfig,
  settings: {
    virtualserverName: string;
    welcomeMessage: string;
    maxClients: number;
    password?: string;
  },
) {
  const commands = [
    `serveredit virtualserver_name=${escapeServerQueryValue(settings.virtualserverName)} virtualserver_welcomemessage=${escapeServerQueryValue(settings.welcomeMessage)} virtualserver_maxclients=${settings.maxClients}${settings.password !== undefined ? ` virtualserver_password=${escapeServerQueryValue(settings.password)}` : ""}`,
  ];

  await runAuthenticatedQuery(config, commands);
}

export async function getTeamSpeakChannels(config: TeamSpeakConfig) {
  const result = await runAuthenticatedQuery(config, ["channellist", "clientlist"]);
  const clients = parseTeamSpeakClients(result.lines.find((line) => line.includes("clid=")) ?? "");
  const channels = parseList(result.lines.find((line) => line.includes("cid=")) ?? "").map((fields) => ({
    id: fields.cid ?? "",
    parentId: fields.pid ?? "0",
    order: fields.channel_order ?? "0",
    name: fields.channel_name ?? "",
    clients: clients.filter((client) => client.channelId === fields.cid),
  }));

  return { channels };
}

export async function getTeamSpeakServerGroups(config: TeamSpeakConfig) {
  const result = await runAuthenticatedQuery(config, ["servergrouplist"]);
  const groups = parseList(result.lines.find((line) => line.includes("sgid=")) ?? "")
    .filter((fields) => fields.type !== "2")
    .map((fields) => ({
      id: fields.sgid ?? "",
      name: fields.name ?? "",
      type: fields.type ?? "",
    }));

  return { groups };
}

export async function createTeamSpeakPrivilegeKey(
  config: TeamSpeakConfig,
  settings: {
    groupId: string;
    description: string;
  },
) {
  const result = await runAuthenticatedQuery(config, [
    `privilegekeyadd tokentype=0 tokenid1=${Number(settings.groupId)} tokenid2=0 tokendescription=${escapeServerQueryValue(settings.description)}`,
  ]);
  const fields = parseFields(result.lines.find((line) => line.includes("token=")) ?? "");

  return { token: fields.token ?? "" };
}

export async function runTeamSpeakClientAction(
  config: TeamSpeakConfig,
  action: "poke" | "kick" | "ban",
  settings: {
    clientId: string;
    message: string;
  },
) {
  const clientId = Number(settings.clientId);
  const message = escapeServerQueryValue(settings.message || "Managed from Intuitive Gamepanel");
  const command =
    action === "poke"
      ? `clientpoke clid=${clientId} msg=${message}`
      : action === "kick"
        ? `clientkick clid=${clientId} reasonid=5 reasonmsg=${message}`
        : `banclient clid=${clientId} time=3600 banreason=${message}`;

  await runAuthenticatedQuery(config, [command]);
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
      channelId: fields.cid ?? "",
    };
  });
}

function parseList(line: string) {
  if (!line) {
    return [];
  }

  return line.split("|").map(parseFields);
}
