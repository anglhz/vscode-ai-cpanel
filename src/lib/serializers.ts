import { getExecStartBase, getExecStartExtra } from "@/lib/exec-start";
import { getEffectiveSystemdExecStart } from "@/lib/systemd";

type ServerWithAccess = {
  id: string;
  name: string;
  description: string;
  systemdServiceName: string;
  execStart: string;
  fsGame: string;
  punkbuster: boolean;
  configFile: string;
  rconPassword: string;
  extraParameters: string;
  status: string;
  displayOrder: number;
  assignedUsers?: { userId: string }[];
};

export function serializeServer(server: ServerWithAccess, role?: string) {
  return serializeServerWithExecStart(server, server.execStart, role);
}

export async function serializeServerWithEffectiveExecStart(server: ServerWithAccess, role?: string) {
  return serializeServerWithExecStart(
    server,
    await getEffectiveSystemdExecStart(server.systemdServiceName, server.execStart),
    role,
  );
}

function serializeServerWithExecStart(server: ServerWithAccess, execStart: string, role?: string) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    status: server.status,
    displayOrder: server.displayOrder,
    systemdServiceName: role === "ADMIN" ? server.systemdServiceName : undefined,
    execStart,
    execStartBase: getExecStartBase(server.systemdServiceName),
    execStartExtra: getExecStartExtra(execStart, server.systemdServiceName),
    startupSettings: {
      fsGame: server.fsGame,
      punkbuster: server.punkbuster,
      configFile: server.configFile,
      rconPassword: server.rconPassword,
      extraParameters: server.extraParameters,
    },
    assignedUserIds: server.assignedUsers?.map((access) => access.userId) ?? [],
  };
}
