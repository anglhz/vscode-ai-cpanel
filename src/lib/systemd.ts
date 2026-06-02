import { execFile } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ALLOWED_ACTIONS = ["start", "stop", "restart"] as const;
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_.@:-]+\.service$/;
const BINARY_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const GAME_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;

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

function getGameServersRoot() {
  return process.env.GAME_SERVERS_ROOT || "/opt/game-servers";
}

function getGameServerUser() {
  return process.env.GAME_SERVER_RUN_USER || "cod1";
}

function assertSafePort(port: number) {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("Invalid server port.");
  }
}

function assertSafeBinaryName(binaryName: string) {
  if (!BINARY_NAME_PATTERN.test(binaryName)) {
    throw new Error("Invalid server binary name.");
  }
}

function assertSafeGameKey(game: string) {
  if (!GAME_KEY_PATTERN.test(game)) {
    throw new Error("Invalid game key.");
  }
}

function assertSafePathSegment(value: string, label: string) {
  if (!PATH_SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function getWorkingDirectoryFromExecStart(execStart: string) {
  const binaryPath = execStart.trim().split(/\s+/, 1)[0];

  if (!binaryPath.startsWith(`${getGameServersRoot()}/`) || binaryPath.includes("..")) {
    throw new Error("ExecStart binary must be inside the game servers root.");
  }

  const lastSlash = binaryPath.lastIndexOf("/");

  if (lastSlash <= 0) {
    throw new Error("ExecStart binary path is invalid.");
  }

  return binaryPath.slice(0, lastSlash);
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
  const overrideDir = `${unitDir}/${serviceName}.d`;
  const overridePath = `${overrideDir}/override.conf`;
  const workingDirectory = getWorkingDirectoryFromExecStart(execStart);
  const content = `[Service]\nWorkingDirectory=${workingDirectory}\nExecStart=\nExecStart=${execStart}\n`;

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

export function buildProvisionedServerConfig({
  name,
  ownerFolder,
  game,
  port,
  maxClients,
  binaryName,
}: {
  name: string;
  ownerFolder: string;
  game: string;
  port: number;
  maxClients: number;
  binaryName: string;
}) {
  assertSafePathSegment(ownerFolder, "owner folder");
  assertSafeGameKey(game);
  assertSafePort(port);
  assertSafeBinaryName(binaryName);

  if (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 128) {
    throw new Error("Invalid max clients value.");
  }

  const root = getGameServersRoot();
  const runUser = getGameServerUser();
  const serverDir = `${root}/${ownerFolder}/${game}/${port}`;
  const serviceName = `${game}-${port}.service`;
  const execStart = `${serverDir}/${binaryName} +set dedicated 2 +set net_port ${port} +set sv_maxclients ${maxClients} +map_rotate`;
  const serviceContent = `[Unit]
Description=${name}
After=network.target

[Service]
Type=simple
User=${runUser}
Group=${runUser}
WorkingDirectory=${serverDir}
ExecStart=${execStart}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

  return { serverDir, serviceName, execStart, serviceContent };
}

export async function provisionSystemdServer(config: {
  name: string;
  ownerFolder: string;
  game: string;
  port: number;
  maxClients: number;
  binaryName: string;
}) {
  const built = buildProvisionedServerConfig(config);

  if (process.env.SYSTEMD_SERVER_PROVISIONING_ENABLED !== "true") {
    return { ...built, skipped: true };
  }

  const servicePath = `${getSystemdUnitDir()}/${built.serviceName}`;
  const owner = `${getGameServerUser()}:${getGameServerUser()}`;

  await execFileAsync("sudo", ["mkdir", "-p", built.serverDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", ["chown", owner, built.serverDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await sudoWriteFile(servicePath, built.serviceContent);
  await execFileAsync("sudo", ["systemctl", "daemon-reload"], {
    timeout: 30_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", ["systemctl", "enable", built.serviceName], {
    timeout: 30_000,
    windowsHide: true,
  });

  return { ...built, skipped: false };
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
