import type { ServerStatus, ServerAction } from "@/lib/systemd";

type ServerNodeConfig = {
  baseUrl: string;
  apiToken: string;
  isLocal: boolean;
};

export type RemoteProvisionPayload = {
  name: string;
  ownerFolder: string;
  game: string;
  port: number;
  maxClients: number;
  binaryName: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function isLocalNode(node?: ServerNodeConfig | null) {
  return !node || node.isLocal || node.baseUrl === "local";
}

async function remoteFetch<T>(node: ServerNodeConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${trimTrailingSlash(node.baseUrl)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${node.apiToken}`,
      ...init.headers,
    },
  });

  const data = (await response.json().catch(() => null)) as T | { error?: string } | null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && data.error
        ? data.error
        : `Remote node returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return data as T;
}

export async function remoteProvisionServer(node: ServerNodeConfig, payload: RemoteProvisionPayload) {
  return remoteFetch<{ serviceName: string; execStart: string }>(node, "/api/provision", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function remoteRunServerAction(node: ServerNodeConfig, serviceName: string, action: ServerAction) {
  return remoteFetch<{ ok: true }>(node, `/api/servers/${encodeURIComponent(serviceName)}/${action}`, {
    method: "POST",
  });
}

export async function remoteGetServerStatus(node: ServerNodeConfig, serviceName: string): Promise<ServerStatus> {
  const data = await remoteFetch<{ status: ServerStatus }>(node, `/api/servers/${encodeURIComponent(serviceName)}/status`);
  return data.status;
}

export async function remoteDeleteServer(node: ServerNodeConfig, serviceName: string, execStart: string) {
  return remoteFetch<{ ok: true }>(node, `/api/servers/${encodeURIComponent(serviceName)}`, {
    method: "DELETE",
    body: JSON.stringify({ execStart }),
  });
}
