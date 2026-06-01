import { getExecStartBase, getExecStartExtra } from "@/lib/exec-start";

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
  assignedUsers?: { userId: string }[];
};

export function serializeServer(server: ServerWithAccess, role?: string) {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    status: server.status,
    systemdServiceName: role === "ADMIN" ? server.systemdServiceName : undefined,
    execStart: server.execStart,
    execStartBase: getExecStartBase(server.systemdServiceName),
    execStartExtra: getExecStartExtra(server.execStart, server.systemdServiceName),
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
