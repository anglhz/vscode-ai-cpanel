const SERVICE_PORTS: Record<string, number> = {
  "codbase-public.service": 28960,
  "codbase-soloq-1.service": 28971,
};

for (let index = 1; index <= 10; index += 1) {
  SERVICE_PORTS[`codbase-${index}.service`] = 28960 + index;
}

export function getExecStartBase(systemdServiceName: string) {
  const port = SERVICE_PORTS[systemdServiceName];
  const folder = systemdServiceName.replace(/\.service$/, "");

  if (port) {
    return `/opt/game-servers/${folder}/cod_lnxded +set dedicated 2 +set net_port ${port} sv_maxclients 12`;
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

export function composeExecStart(systemdServiceName: string, extra: string) {
  const base = getExecStartBase(systemdServiceName);

  if (!base) {
    throw new Error("This server does not have a supported hardcoded startup base.");
  }

  const cleanExtra = extra.trim();
  return cleanExtra ? `${base} ${cleanExtra}` : base;
}
