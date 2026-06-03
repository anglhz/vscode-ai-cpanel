import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GAME_KEYS } from "@/lib/game-profiles";

const execFileAsync = promisify(execFile);
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;

function getGameServersRoot() {
  return process.env.GAME_SERVERS_ROOT || "/opt/game-servers";
}

function getGameServerGroup() {
  return process.env.GAME_SERVER_RUN_GROUP || process.env.GAME_SERVER_RUN_USER || "cod1";
}

function getSftpGroup() {
  return process.env.SFTP_GROUP || "gamepanel-sftp";
}

function assertSafeSftpUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Invalid SFTP username.");
  }
}

async function sudo(command: string, args: string[]) {
  await execFileAsync("sudo", [command, ...args], {
    timeout: 30_000,
    windowsHide: true,
  });
}

async function sudoWithInput(command: string, args: string[], input: string) {
  await new Promise<void>((resolve, reject) => {
    const child = execFile("sudo", [command, ...args], {
      timeout: 30_000,
      windowsHide: true,
    });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      }
    });
    child.stdin?.end(input);
  });
}

export async function provisionSftpUser({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  assertSafeSftpUsername(username);

  if (password.length < 8 || /[\r\n]/.test(password)) {
    throw new Error("Invalid SFTP password.");
  }

  if (process.env.SFTP_USER_PROVISIONING_ENABLED !== "true") {
    return { skipped: true };
  }

  const root = getGameServersRoot();
  const userRoot = `${root}/${username}`;
  const gameDirs = GAME_KEYS.map((game) => `${userRoot}/${game}`);
  const sftpGroup = getSftpGroup();
  const gameGroup = getGameServerGroup();

  await sudo("groupadd", ["-f", sftpGroup]);
  await execFileAsync("id", ["-u", username]).catch(async () => {
    await sudo("useradd", ["-m", "-d", userRoot, "-s", "/usr/sbin/nologin", username]);
  });
  await sudo("usermod", ["-aG", sftpGroup, username]);
  await sudo("usermod", ["-aG", gameGroup, username]);

  await sudoWithInput("chpasswd", [], `${username}:${password}`);

  await sudo("mkdir", ["-p", ...gameDirs]);
  await sudo("chown", ["root:root", userRoot]);
  await sudo("chmod", ["755", userRoot]);
  await sudo("chown", ["-R", `${username}:${gameGroup}`, ...gameDirs]);
  await sudo("chmod", ["-R", "775", ...gameDirs]);

  return { skipped: false };
}
