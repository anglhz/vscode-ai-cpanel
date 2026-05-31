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
    assignedUserIds: server.assignedUsers?.map((access) => access.userId) ?? [],
  };
}
