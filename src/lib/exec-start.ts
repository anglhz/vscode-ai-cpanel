import { GAME_PROFILES, isGameKey } from "@/lib/game-profiles";

const SERVICE_PORTS: Record<string, number> = {
  "codbase-public.service": 28960,
  "codbase-soloq-1.service": 28971,
};
const DEFAULT_MAX_CLIENTS = 12;

for (let index = 1; index <= 10; index += 1) {
  SERVICE_PORTS[`codbase-${index}.service`] = 28960 + index;
}

export function getExecStartBase(systemdServiceName: string) {
  const port = SERVICE_PORTS[systemdServiceName];
  const folder = systemdServiceName.replace(/\.service$/, "");
  const genericPort = systemdServiceName.match(/^game-server-(\d+)\.service$/)?.[1];
  const gameMatch = systemdServiceName.match(/^([a-zA-Z0-9_-]+)-(\d+)\.service$/);
  const game = gameMatch?.[1] ?? "";
  const gamePort = gameMatch?.[2];
  const binaryName = isGameKey(game) ? GAME_PROFILES[game].defaultBinaryName : "server_binary";

  if (port) {
    return `/opt/game-servers/${folder}/cod_lnxded +set dedicated 2 +set net_port ${port} +set sv_maxclients ${DEFAULT_MAX_CLIENTS} +map_rotate`;
  }

  if (genericPort) {
    return `/opt/game-servers/${genericPort}/cod_lnxded +set dedicated 2 +set net_port ${genericPort} +set sv_maxclients ${DEFAULT_MAX_CLIENTS} +map_rotate`;
  }

  if (gamePort) {
    return `/opt/game-servers/${gamePort}/${binaryName} +set dedicated 2 +set net_port ${gamePort} +set sv_maxclients ${DEFAULT_MAX_CLIENTS} +map_rotate`;
  }

  return `/opt/game-servers/${folder}/server_binary`;
}

export function getExecStartExtra(execStart: string, systemdServiceName: string) {
  const base = getExecStartBase(systemdServiceName);

  if (!execStart.startsWith(base)) {
    return "";
  }

  return execStart.slice(base.length).trim();
}

export type StartupSettings = {
  fsGame?: string;
  punkbuster?: boolean;
  configFile?: string;
  rconPassword?: string;
  extraParameters?: string;
};

export function composeExecStart(systemdServiceName: string, settings: StartupSettings) {
  return composeExecStartFromBase(getExecStartBase(systemdServiceName), settings);
}

export function composeExecStartFromExisting(
  existingExecStart: string,
  systemdServiceName: string,
  settings: StartupSettings,
) {
  return composeExecStartFromBase(getExistingExecStartBase(existingExecStart, systemdServiceName), settings);
}

function getExistingExecStartBase(existingExecStart: string, systemdServiceName: string) {
  const mapRotateIndex = existingExecStart.indexOf(" +map_rotate");

  if (mapRotateIndex >= 0) {
    return existingExecStart.slice(0, mapRotateIndex + " +map_rotate".length);
  }

  return getExecStartBase(systemdServiceName);
}

function composeExecStartFromBase(base: string, settings: StartupSettings) {
  const parts = [normalizeExecStartBase(base)];
  const fsGame = settings.fsGame?.trim();
  const configFile = settings.configFile?.trim();
  const rconPassword = settings.rconPassword?.trim();
  const extraParameters = settings.extraParameters?.trim();

  if (fsGame) {
    parts.push(`+set fs_game ${fsGame}`);
  }

  parts.push(`+set sv_punkbuster ${settings.punkbuster ? "1" : "0"}`);

  if (configFile) {
    parts.push(`+exec ${configFile}`);
  }

  if (rconPassword) {
    parts.push(`+set rconpassword "${escapeQuotedValue(rconPassword)}"`);
  }

  if (extraParameters) {
    parts.push(extraParameters);
  }

  return parts.join(" ");
}

function normalizeExecStartBase(base: string) {
  if (base.includes("/ts3/") || !base.includes("/cod")) {
    return base;
  }

  const binaryPath = base.trim().split(/\s+/, 1)[0];
  const workingDirectory = binaryPath.slice(0, binaryPath.lastIndexOf("/"));
  const additions: string[] = [];

  if (!base.match(/\+set\s+fs_homepath\s+/)) {
    additions.push(`+set fs_homepath ${workingDirectory}`);
  }

  if (!base.match(/\+set\s+fs_basepath\s+/)) {
    additions.push(`+set fs_basepath ${workingDirectory}`);
  }

  if (additions.length === 0) {
    return base;
  }

  return `${binaryPath} ${additions.join(" ")} ${base.slice(binaryPath.length).trim()}`.trim();
}

function escapeQuotedValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
