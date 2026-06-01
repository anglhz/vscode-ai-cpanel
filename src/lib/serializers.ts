import { getExecStartBase, getExecStartExtra } from "@/lib/exec-start";

type ServerWithAccess = {
  id: string;
  name: string;
  description: string;
  systemdServiceName: string;
  execStart: string;
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
    assignedUserIds: server.assignedUsers?.map((access) => access.userId) ?? [],
  };
}
