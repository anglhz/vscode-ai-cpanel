import { execFile } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { GAME_PROFILES, isGameKey, type GameKey } from "@/lib/game-profiles";

const execFileAsync = promisify(execFile);
const ALLOWED_ACTIONS = ["start", "stop", "restart"] as const;
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_.@:-]+\.service$/;
const BINARY_NAME_PATTERN = /^[a-zA-Z0-9_.\/-]+$/;
const PATH_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SUDO_MKDIR = "/usr/bin/mkdir";
const SUDO_CHOWN = "/usr/bin/chown";
const SUDO_CHMOD = "/usr/bin/chmod";
const SUDO_CP = "/usr/bin/cp";
const SUDO_LN = "/usr/bin/ln";
const SUDO_RM = "/usr/bin/rm";
const SUDO_SYSTEMCTL = "/usr/bin/systemctl";
const SUDO_TEE = "/usr/bin/tee";
const SUDO_GROUPADD = "/usr/sbin/groupadd";

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

function getCallOfDutyTemplateRoot() {
  return process.env.CALL_OF_DUTY_TEMPLATE_ROOT || `${getGameServersRoot()}/game_root/callofduty`;
}

function getCallOfDuty2TemplateRoot() {
  return process.env.CALL_OF_DUTY2_TEMPLATE_ROOT || `${getGameServersRoot()}/game_root/callofduty2`;
}

function getCallOfDuty16TemplateRoot() {
  return process.env.CALL_OF_DUTY16_TEMPLATE_ROOT || `${getGameServersRoot()}/game_root/cod1.6`;
}

function getGameServerGroup() {
  return process.env.GAME_SERVER_RUN_GROUP || "gamepanel-games";
}

function assertSafePort(port: number) {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error("Invalid server port.");
  }
}

function assertSafeBinaryName(binaryName: string) {
  if (!BINARY_NAME_PATTERN.test(binaryName) || binaryName.includes("..") || binaryName.startsWith("/")) {
    throw new Error("Invalid server binary name.");
  }
}

function assertSafeGameKey(game: string): asserts game is GameKey {
  if (!isGameKey(game)) {
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

function getServerDirectoryFromExecStart(execStart: string) {
  const binaryPath = execStart.trim().split(/\s+/, 1)[0];
  const root = getGameServersRoot();

  if (!binaryPath.startsWith(`${root}/`) || binaryPath.includes("..")) {
    throw new Error("Server path must be inside the game servers root.");
  }

  const parts = binaryPath.slice(root.length + 1).split("/");
  const [ownerFolder, game, port] = parts;

  assertSafePathSegment(ownerFolder, "owner folder");
  assertSafeGameKey(game);
  assertSafePort(Number(port));

  return `${root}/${ownerFolder}/${game}/${port}`;
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function sudoSymlinkContents(sourceDirectory: string, targetDirectory: string, excludeNames: string[] = []) {
  const entries = await readdir(sourceDirectory);

  for (const entry of entries) {
    if (excludeNames.includes(entry)) {
      continue;
    }

    const sourcePath = `${sourceDirectory}/${entry}`;
    const targetPath = `${targetDirectory}/${entry}`;

    if (await pathExists(targetPath)) {
      continue;
    }

    await execFileAsync("sudo", [SUDO_LN, "-s", sourcePath, targetPath], {
      timeout: 10_000,
      windowsHide: true,
    });
  }
}

export async function updateCodbaseLinkedFiles({
  masterExecStart,
  targetExecStarts,
}: {
  masterExecStart: string;
  targetExecStarts: string[];
}) {
  const masterDirectory = getServerDirectoryFromExecStart(masterExecStart);
  const masterParts = masterDirectory.slice(getGameServersRoot().length + 1).split("/");

  if (masterParts[1] !== "cod1" || masterParts[2] !== "28901") {
    throw new Error("CoDBase update source must be cod1 port 28901.");
  }

  if (process.env.SYSTEMD_SERVER_PROVISIONING_ENABLED !== "true") {
    return { skipped: true, updated: 0 };
  }

  const owner = `${masterParts[0]}:${getGameServerGroup()}`;
  let updated = 0;

  await execFileAsync("sudo", [SUDO_CHOWN, "-R", owner, masterDirectory], {
    timeout: 30_000,
    windowsHide: true,
  });

  for (const targetExecStart of targetExecStarts) {
    const targetDirectory = getServerDirectoryFromExecStart(targetExecStart);
    const targetParts = targetDirectory.slice(getGameServersRoot().length + 1).split("/");
    const port = Number(targetParts[2]);

    if (targetParts[0] !== masterParts[0] || targetParts[1] !== "cod1" || ![28902, 28903, 28904, 28905, 28906, 28907, 28908, 28909, 28913].includes(port)) {
      continue;
    }

    for (const directory of ["main", "pb", "__rPAMv115b5"]) {
      await execFileAsync("sudo", [SUDO_MKDIR, "-p", `${targetDirectory}/${directory}`], {
        timeout: 10_000,
        windowsHide: true,
      });
    }
    await sudoSymlinkContents(`${masterDirectory}/main`, `${targetDirectory}/main`, ["server_config.cfg"]);
    await sudoSymlinkContents(`${masterDirectory}/pb`, `${targetDirectory}/pb`);
    await sudoSymlinkContents(`${masterDirectory}/__rPAMv115b5`, `${targetDirectory}/__rPAMv115b5`, ["config_mp_server.cfg"]);
    await execFileAsync("sudo", [SUDO_CHOWN, "-R", owner, targetDirectory], {
      timeout: 30_000,
      windowsHide: true,
    });
    updated += 1;
  }

  return { skipped: false, updated };
}

async function sudoCopyFile(sourcePath: string, targetPath: string) {
  await execFileAsync("sudo", [SUDO_CP, sourcePath, targetPath], {
    timeout: 10_000,
    windowsHide: true,
  });
}

async function sudoCopyFileIfExists(sourcePath: string, targetPath: string) {
  if (!(await pathExists(sourcePath)) || (await pathExists(targetPath))) {
    return;
  }

  await sudoCopyFile(sourcePath, targetPath);
}

async function sudoSymlinkFile(sourcePath: string, targetPath: string) {
  if (await pathExists(targetPath)) {
    return;
  }

  await execFileAsync("sudo", [SUDO_LN, "-s", sourcePath, targetPath], {
    timeout: 10_000,
    windowsHide: true,
  });
}

async function sudoMakeExecutable(filePath: string) {
  await execFileAsync("sudo", [SUDO_CHMOD, "+x", filePath], {
    timeout: 10_000,
    windowsHide: true,
  });
}

async function sudoChownSymlink(owner: string, linkPath: string) {
  await execFileAsync("sudo", [SUDO_CHOWN, "-h", owner, linkPath], {
    timeout: 10_000,
    windowsHide: true,
  });
}

async function sudoSymlinkTopLevelFiles(sourceDirectory: string, targetDirectory: string, excludeNames: string[] = []) {
  const entries = await readdir(sourceDirectory);

  for (const entry of entries) {
    if (excludeNames.includes(entry)) {
      continue;
    }

    const sourcePath = `${sourceDirectory}/${entry}`;
    const targetPath = `${targetDirectory}/${entry}`;
    const stats = await lstat(sourcePath);

    if (stats.isDirectory()) {
      continue;
    }

    await sudoSymlinkFile(sourcePath, targetPath);
  }
}

async function provisionCallOfDutyFiles({
  game,
  serverDir,
  ownerFolder,
}: {
  game: GameKey;
  serverDir: string;
  ownerFolder: string;
}) {
  if (game !== "cod1" && game !== "coduo" && game !== "cod2") {
    return;
  }

  const templateRoot = game === "cod2" ? getCallOfDuty2TemplateRoot() : getCallOfDutyTemplateRoot();
  const owner = `${ownerFolder}:${getGameServerGroup()}`;
  const linkedDirectories = game === "coduo" ? ["main", "pb", "uo"] : ["main", "pb"];
  const binaryName = GAME_PROFILES[game].defaultBinaryName;
  const configSource =
    game === "cod2"
      ? `${templateRoot}/main/server_config.cfg`
      : game === "coduo"
      ? `${templateRoot}/server_uo_config.cfg`
      : `${templateRoot}/server_cod1_config.cfg`;
  const configTarget =
    game === "coduo"
      ? `${serverDir}/uo/server_config.cfg`
      : `${serverDir}/main/server_config.cfg`;
  const symlinkExcludesByDirectory: Record<string, string[]> = {
    main: ["server_config.cfg"],
  };

  for (const directory of linkedDirectories) {
    await execFileAsync("sudo", [SUDO_MKDIR, "-p", `${serverDir}/${directory}`], {
      timeout: 10_000,
      windowsHide: true,
    });
    await execFileAsync("sudo", [SUDO_CHOWN, owner, `${serverDir}/${directory}`], {
      timeout: 10_000,
      windowsHide: true,
    });
  }

  if (!(await pathExists(`${serverDir}/${binaryName}`))) {
    await sudoSymlinkFile(`${templateRoot}/${binaryName}`, `${serverDir}/${binaryName}`);
  }
  await sudoMakeExecutable(`${serverDir}/${binaryName}`);
  await sudoChownSymlink(owner, `${serverDir}/${binaryName}`);

  if (game === "cod2") {
    const cod2LibraryName = "libCoD2x.so";
    const libraryPath = `${serverDir}/${cod2LibraryName}`;

    await sudoSymlinkFile(`${templateRoot}/${cod2LibraryName}`, libraryPath);
    await sudoMakeExecutable(libraryPath);
    await sudoChownSymlink(owner, libraryPath);
  }

  if (!(await pathExists(configTarget))) {
    await sudoCopyFile(configSource, configTarget);
    await execFileAsync("sudo", [SUDO_CHOWN, owner, configTarget], {
      timeout: 10_000,
      windowsHide: true,
    });
    await execFileAsync("sudo", [SUDO_CHMOD, "664", configTarget], {
      timeout: 10_000,
      windowsHide: true,
    });
  }

  for (const directory of linkedDirectories) {
    await sudoSymlinkContents(`${templateRoot}/${directory}`, `${serverDir}/${directory}`, symlinkExcludesByDirectory[directory]);
  }
}

async function sudoWriteFile(filePath: string, content: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("sudo", [SUDO_TEE, filePath], {
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

async function applySystemdServiceOverride({
  serviceName,
  user,
  group,
  workingDirectory,
  execStart,
  environment = {},
}: {
  serviceName: string;
  user?: string;
  group?: string;
  workingDirectory: string;
  execStart: string;
  environment?: Record<string, string>;
}) {
  const unitDir = getSystemdUnitDir();
  const overrideDir = `${unitDir}/${serviceName}.d`;
  const overridePath = `${overrideDir}/override.conf`;
  const environmentLines = Object.entries(environment)
    .map(([key, value]) => `Environment=${key}=${value}`)
    .join("\n");
  const identityLines = `${user ? `User=${user}\n` : ""}${group ? `Group=${group}\n` : ""}`;
  const content = `[Service]\n${identityLines}Environment=HOME=${workingDirectory}\n${environmentLines ? `${environmentLines}\n` : ""}WorkingDirectory=${workingDirectory}\nExecStart=\nExecStart=${execStart}\n`;

  await execFileAsync("sudo", [SUDO_MKDIR, "-p", overrideDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await sudoWriteFile(overridePath, content);
  await execFileAsync("sudo", [SUDO_SYSTEMCTL, "daemon-reload"], {
    timeout: 30_000,
    windowsHide: true,
  });
}

export async function runSystemdAction(serviceName: string, action: ServerAction) {
  assertSafeServiceName(serviceName);

  if (process.env.SYSTEMD_CONTROL_ENABLED !== "true") {
    return { skipped: true };
  }

  // Security boundary: only call sudo/systemctl with fixed argv values from
  // database configuration and a strict action whitelist. No shell is involved.
  await execFileAsync("sudo", [SUDO_SYSTEMCTL, action, serviceName], {
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

  const workingDirectory = getWorkingDirectoryFromExecStart(execStart);
  await applySystemdServiceOverride({ serviceName, workingDirectory, execStart });

  return { skipped: false };
}

export async function getEffectiveSystemdExecStart(serviceName: string, fallbackExecStart: string) {
  assertSafeServiceName(serviceName);

  const overridePath = `${getSystemdUnitDir()}/${serviceName}.d/override.conf`;

  try {
    const content = await readFile(overridePath, "utf8");
    const execStart = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("ExecStart=") && line !== "ExecStart=")
      .at(-1)
      ?.slice("ExecStart=".length)
      .trim();

    return execStart || fallbackExecStart;
  } catch {
    return fallbackExecStart;
  }
}

export async function deleteProvisionedServerDirectory(serviceName: string, fallbackExecStart: string) {
  const effectiveExecStart = await getEffectiveSystemdExecStart(serviceName, fallbackExecStart);
  const serverDirectory = getServerDirectoryFromExecStart(effectiveExecStart);

  if (process.env.SYSTEMD_SERVER_PROVISIONING_ENABLED !== "true") {
    return { skipped: true, serverDirectory };
  }

  await execFileAsync("sudo", [SUDO_RM, "-rf", serverDirectory], {
    timeout: 30_000,
    windowsHide: true,
  });

  return { skipped: false, serverDirectory };
}

export async function upgradeCod1ServerTo16(serviceName: string, fallbackExecStart: string) {
  assertSafeServiceName(serviceName);

  const serviceMatch = serviceName.match(/^cod1-(\d+)\.service$/);

  if (!serviceMatch) {
    throw new Error("CoD1 1.6 upgrade is only available for cod1 services.");
  }

  const port = Number(serviceMatch[1]);
  assertSafePort(port);

  const effectiveExecStart = await getEffectiveSystemdExecStart(serviceName, fallbackExecStart);
  const serverDirectory = getServerDirectoryFromExecStart(effectiveExecStart);
  const [ownerFolder, game] = serverDirectory.slice(getGameServersRoot().length + 1).split("/");

  assertSafePathSegment(ownerFolder, "owner folder");

  if (game !== "cod1") {
    throw new Error("CoD1 1.6 upgrade is only available for cod1 server folders.");
  }

  const templateRoot = getCallOfDuty16TemplateRoot();
  const runtimeDirectory = `${serverDirectory}/cod16`;
  const owner = `${ownerFolder}:${getGameServerGroup()}`;
  const execStart = `${runtimeDirectory}/start.sh`;

  if (process.env.SYSTEMD_SERVER_PROVISIONING_ENABLED !== "true") {
    return { skipped: true, runtimeDirectory, execStart };
  }

  for (const directory of [runtimeDirectory, `${runtimeDirectory}/main`, `${runtimeDirectory}/__rPAMv115b5`]) {
    await execFileAsync("sudo", [SUDO_MKDIR, "-p", directory], {
      timeout: 10_000,
      windowsHide: true,
    });
    await execFileAsync("sudo", [SUDO_CHOWN, owner, directory], {
      timeout: 10_000,
      windowsHide: true,
    });
  }

  await sudoSymlinkTopLevelFiles(templateRoot, runtimeDirectory, ["matchdata.cfg", "competitive.cfg"]);
  await sudoCopyFileIfExists(`${templateRoot}/matchdata.cfg`, `${runtimeDirectory}/matchdata.cfg`);
  await sudoCopyFileIfExists(`${templateRoot}/competitive.cfg`, `${runtimeDirectory}/competitive.cfg`);
  await sudoSymlinkContents(`${templateRoot}/main`, `${runtimeDirectory}/main`, [
    "config_mp_server.cfg",
    "games_mp.log",
    "console_mp_server.log",
  ]);
  await sudoSymlinkContents(`${templateRoot}/__rPAMv115b5`, `${runtimeDirectory}/__rPAMv115b5`, [
    "config_mp_server.cfg",
    "games_mp.log",
    "console_mp_server.log",
    "screenshots",
    "demos",
  ]);
  await sudoCopyFileIfExists(`${templateRoot}/main/config_mp_server.cfg`, `${runtimeDirectory}/main/config_mp_server.cfg`);
  await sudoCopyFileIfExists(`${templateRoot}/__rPAMv115b5/config_mp_server.cfg`, `${runtimeDirectory}/__rPAMv115b5/config_mp_server.cfg`);

  for (const filePath of [
    execStart,
    `${runtimeDirectory}/cod_lnxded`,
    `${runtimeDirectory}/cod1plus.so`,
    `${runtimeDirectory}/main/config_mp_server.cfg`,
    `${runtimeDirectory}/__rPAMv115b5/config_mp_server.cfg`,
    `${runtimeDirectory}/matchdata.cfg`,
    `${runtimeDirectory}/competitive.cfg`,
  ]) {
    if (await pathExists(filePath)) {
      await execFileAsync("sudo", [SUDO_CHOWN, "-h", owner, filePath], {
        timeout: 10_000,
        windowsHide: true,
      });
    }
  }

  for (const filePath of [execStart, `${runtimeDirectory}/cod_lnxded`, `${runtimeDirectory}/cod1plus.so`]) {
    if (await pathExists(filePath)) {
      await sudoMakeExecutable(filePath);
    }
  }

  await applySystemdServiceOverride({
    serviceName,
    user: ownerFolder,
    group: getGameServerGroup(),
    workingDirectory: runtimeDirectory,
    execStart,
    environment: {
      SERVER_DIR: runtimeDirectory,
      NET_PORT: String(port),
      FS_GAME: "__rPAMv115b5",
      GAMETYPE: "sd",
      START_MAP: "mp_harbor",
    },
  });

  return { skipped: false, runtimeDirectory, execStart };
}

export async function downgradeCod1ServerTo15(serviceName: string, fallbackExecStart: string) {
  assertSafeServiceName(serviceName);

  const serviceMatch = serviceName.match(/^cod1-(\d+)\.service$/);

  if (!serviceMatch) {
    throw new Error("CoD1 1.5 downgrade is only available for cod1 services.");
  }

  const port = Number(serviceMatch[1]);
  assertSafePort(port);

  const effectiveExecStart = await getEffectiveSystemdExecStart(serviceName, fallbackExecStart);
  const serverDirectory = getServerDirectoryFromExecStart(effectiveExecStart);
  const [ownerFolder, game] = serverDirectory.slice(getGameServersRoot().length + 1).split("/");

  assertSafePathSegment(ownerFolder, "owner folder");

  if (game !== "cod1") {
    throw new Error("CoD1 1.5 downgrade is only available for cod1 server folders.");
  }

  const maxClients = Number(effectiveExecStart.match(/\+set\s+sv_maxclients\s+(\d+)/)?.[1] ?? 16);
  const binaryPath = `${serverDirectory}/cod_lnxded`;
  const execStart = `${binaryPath} +set fs_homepath ${serverDirectory} +set fs_basepath ${serverDirectory} +set dedicated 2 +set net_port ${port} +set sv_maxclients ${maxClients} +exec server_config.cfg +map_rotate`;

  if (process.env.SYSTEMD_SERVER_PROVISIONING_ENABLED !== "true") {
    return { skipped: true, serverDirectory, execStart };
  }

  await applySystemdServiceOverride({
    serviceName,
    user: ownerFolder,
    group: getGameServerGroup(),
    workingDirectory: serverDirectory,
    execStart,
  });

  return { skipped: false, serverDirectory, execStart };
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
  const profile = GAME_PROFILES[game];
  const runUser = ownerFolder;
  const runGroup = getGameServerGroup();
  const serverDir = `${root}/${ownerFolder}/${game}/${port}`;
  const serviceName = `${game}-${port}.service`;
  const effectiveBinaryName = binaryName || profile.defaultBinaryName;
  const binaryPath = `${serverDir}/${effectiveBinaryName}`;
  const workingDirectory = getWorkingDirectoryFromExecStart(binaryPath);
  const execStart =
    game === "ts3"
      ? `${binaryPath} start default_voice_port=${port} query_port=10011 filetransfer_port=30033`
      : `${binaryPath} +set fs_homepath ${workingDirectory} +set fs_basepath ${workingDirectory} +set dedicated 2 +set net_port ${port} +set sv_maxclients ${maxClients} +exec server_config.cfg +map_rotate`;
  const serviceExtra =
    game === "ts3"
      ? `Environment=TS3SERVER_LICENSE=accept\nExecStop=${binaryPath} stop\nExecReload=${binaryPath} restart\n`
      : "";
  const serviceContent = `[Unit]
Description=${name}
After=network.target

[Service]
Type=${profile.serviceType}
User=${runUser}
Group=${runGroup}
Environment=HOME=${workingDirectory}
WorkingDirectory=${workingDirectory}
ExecStart=${execStart}
${serviceExtra}Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
`;

  return { serverDir, workingDirectory, serviceName, execStart, serviceContent };
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
  const owner = `${config.ownerFolder}:${getGameServerGroup()}`;

  await execFileAsync("sudo", [SUDO_GROUPADD, "-f", getGameServerGroup()], {
    timeout: 10_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", [SUDO_MKDIR, "-p", built.serverDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", [SUDO_MKDIR, "-p", built.workingDirectory], {
    timeout: 10_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", [SUDO_CHOWN, owner, built.serverDir], {
    timeout: 10_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", [SUDO_CHOWN, owner, built.workingDirectory], {
    timeout: 10_000,
    windowsHide: true,
  });
  await provisionCallOfDutyFiles({
    game: config.game as GameKey,
    serverDir: built.serverDir,
    ownerFolder: config.ownerFolder,
  });
  await sudoWriteFile(servicePath, built.serviceContent);
  await execFileAsync("sudo", [SUDO_SYSTEMCTL, "daemon-reload"], {
    timeout: 30_000,
    windowsHide: true,
  });
  await execFileAsync("sudo", [SUDO_SYSTEMCTL, "enable", built.serviceName], {
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
