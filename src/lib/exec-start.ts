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

  if (port) {
    return `/opt/game-servers/${folder}/cod_lnxded +set dedicated 2 +set net_port ${port} +set sv_maxclients ${DEFAULT_MAX_CLIENTS} +map_rotate`;
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
  const base = getExecStartBase(systemdServiceName);
  const parts = [base];
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

function escapeQuotedValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
