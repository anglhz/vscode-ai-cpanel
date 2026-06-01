import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
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

function assertSafeExecStart(execStart: string) {
  if (!execStart.trim() || /[\r\n]/.test(execStart)) {
    throw new Error("ExecStart must be a single non-empty line.");
  }
}

function getSystemdUnitDir() {
  return process.env.SYSTEMD_UNIT_DIR || "/etc/systemd/system";
}

async function sudoWriteFile(filePath: string, content: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sudo", ["tee", filePath], {
      stdio: ["pipe", "ignore", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `tee exited with code ${code}`));
      }
    });
    child.stdin.end(content);
  });
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

export async function applySystemdExecStart(serviceName: string, execStart: string) {
  assertSafeServiceName(serviceName);
  assertSafeExecStart(execStart);

  if (process.env.SYSTEMD_EXECSTART_WRITE_ENABLED !== "true") {
    return { skipped: true };
  }

  const unitDir = getSystemdUnitDir();
  const overrideDir = path.join(unitDir, `${serviceName}.d`);
  const overridePath = path.join(overrideDir, "override.conf");
  const content = `[Service]\nExecStart=\nExecStart=${execStart}\n`;

  await execFileAsync("sudo", ["mkdir", "-p", overrideDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await sudoWriteFile(overridePath, content);
  await execFileAsync("sudo", ["systemctl", "daemon-reload"], {
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
