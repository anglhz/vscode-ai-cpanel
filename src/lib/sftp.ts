import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GAME_KEYS } from "@/lib/game-profiles";

const execFileAsync = promisify(execFile);
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const SUDO_GROUPADD = "/usr/sbin/groupadd";
const SUDO_USERADD = "/usr/sbin/useradd";
const SUDO_USERMOD = "/usr/sbin/usermod";
const SUDO_CHPASSWD = "/usr/sbin/chpasswd";
const SUDO_PASSWD = "/usr/bin/passwd";
const SUDO_MKDIR = "/usr/bin/mkdir";
const SUDO_CHOWN = "/usr/bin/chown";
const SUDO_CHMOD = "/usr/bin/chmod";

function getGameServersRoot() {
  return process.env.GAME_SERVERS_ROOT || "/opt/game-servers";
}

function getGameServerGroup() {
  return process.env.GAME_SERVER_RUN_GROUP || "gamepanel-games";
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

  await sudo(SUDO_GROUPADD, ["-f", sftpGroup]);
  await sudo(SUDO_GROUPADD, ["-f", gameGroup]);
  await execFileAsync("id", ["-u", username]).catch(async () => {
    await sudo(SUDO_USERADD, ["-m", "-d", userRoot, "-s", "/usr/sbin/nologin", username]);
  });
  await sudo(SUDO_USERMOD, ["-d", userRoot, "-s", "/usr/sbin/nologin", username]);
  await sudo(SUDO_USERMOD, ["-aG", sftpGroup, username]);
  await sudo(SUDO_USERMOD, ["-aG", gameGroup, username]);

  await sudoWithInput(SUDO_CHPASSWD, [], `${username}:${password}`);
  await sudo(SUDO_PASSWD, ["-u", username]).catch(() => undefined);

  for (const gameDir of gameDirs) {
    await sudo(SUDO_MKDIR, ["-p", gameDir]);
  }
  await sudo(SUDO_CHOWN, ["root:root", userRoot]);
  await sudo(SUDO_CHMOD, ["755", userRoot]);
  for (const gameDir of gameDirs) {
    await sudo(SUDO_CHOWN, ["-R", `${username}:${gameGroup}`, gameDir]);
    await sudo(SUDO_CHMOD, ["-R", "775", gameDir]);
  }

  return { skipped: false };
}
