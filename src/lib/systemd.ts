import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ALLOWED_ACTIONS = ["start", "stop", "restart"] as const;
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_.@:-]+\.service$/;

export type ServerAction = (typeof ALLOWED_ACTIONS)[number];

export function isServerAction(action: string): action is ServerAction {
  return ALLOWED_ACTIONS.includes(action as ServerAction);
}

function assertSafeServiceName(serviceName: string) {
  if (!SERVICE_NAME_PATTERN.test(serviceName)) {
    throw new Error("Invalid systemd service name.");
  }
}

export async function runSystemdAction(serviceName: string, action: ServerAction) {
  assertSafeServiceName(serviceName);

  if (process.env.SYSTEMD_CONTROL_ENABLED !== "true") {
    return { skipped: true };
  }

  // Security boundary: only call sudo/systemctl with fixed argv values from
  // database configuration and a strict action whitelist. No shell is involved.
  await execFileAsync("sudo", ["systemctl", action, serviceName], {
    timeout: 30_000,
    windowsHide: true,
  });

  return { skipped: false };
}

export type ServerStatus = "ONLINE" | "OFFLINE" | "STARTING" | "STOPPING" | "RESTARTING" | "UNKNOWN";

export async function getSystemdStatus(serviceName: string): Promise<ServerStatus> {
  assertSafeServiceName(serviceName);

  if (process.env.SYSTEMD_CONTROL_ENABLED !== "true") {
    return "UNKNOWN";
  }

  try {
    const { stdout } = await execFileAsync("systemctl", ["is-active", serviceName], {
      timeout: 10_000,
      windowsHide: true,
    });

    return stdout.trim() === "active" ? "ONLINE" : "OFFLINE";
  } catch {
    return "OFFLINE";
  }
}
