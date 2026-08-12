import { spawn } from "node:child_process";
import dgram from "node:dgram";

const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_.@:-]+\.service$/;
const SUDO_JOURNALCTL = "/usr/bin/journalctl";

function assertSafeServiceName(serviceName: string) {
  if (!SERVICE_NAME_PATTERN.test(serviceName)) {
    throw new Error("Invalid systemd service name.");
  }
}

export function streamSystemdLogs(serviceName: string, signal: AbortSignal) {
  assertSafeServiceName(serviceName);

  const encoder = new TextEncoder();
  let child: ReturnType<typeof spawn> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      child = spawn(
        "sudo",
        [SUDO_JOURNALCTL, "-u", serviceName, "-n", "200", "-f", "--no-pager", "-o", "short-iso"],
        {
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      );
      const journalctl = child;
      const stdout = journalctl.stdout;
      const stderr = journalctl.stderr;

      if (!stdout || !stderr) {
        throw new Error("Could not open journalctl output streams.");
      }

      const send = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      const close = () => {
        if (!journalctl.killed) {
          journalctl.kill("SIGTERM");
        }
      };

      signal.addEventListener("abort", close, { once: true });

      stdout.on("data", (chunk) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          if (line.trim()) {
            send("log", { line });
          }
        }
      });

      stderr.on("data", (chunk) => {
        const message = chunk.toString().trim();
        if (message) {
          send("console-error", { message });
        }
      });

      journalctl.on("error", (error) => {
        send("console-error", { message: error.message });
        controller.close();
      });

      journalctl.on("close", (code) => {
        send("close", { code });
        controller.close();
      });
    },
    cancel() {
      if (child && !child.killed) {
        child.kill("SIGTERM");
      }
    },
  });
}

export function sendCodRcon({
  host,
  port,
  password,
  command,
}: {
  host: string;
  port: number;
  password: string;
  command: string;
}) {
  return new Promise<string>((resolve, reject) => {
    const trimmedCommand = command.trim();

    if (!trimmedCommand || /[\r\n]/.test(trimmedCommand) || trimmedCommand.length > 200) {
      reject(new Error("RCON command must be a single line under 200 characters."));
      return;
    }

    if (!password.trim()) {
      reject(new Error("This server does not have an RCON password configured in the panel."));
      return;
    }

    const socket = dgram.createSocket("udp4");
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("RCON request timed out."));
    }, 5_000);
    const packet = Buffer.from(`\xff\xff\xff\xffrcon ${password} ${trimmedCommand}`, "binary");
    const responses: string[] = [];

    socket.on("message", (message) => {
      responses.push(message.toString("utf8").replace(/^\xff\xff\xff\xffprint\n?/, "").trim());
      clearTimeout(timeout);
      setTimeout(() => {
        socket.close();
        resolve(responses.filter(Boolean).join("\n") || "RCON command sent.");
      }, 150);
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });

    socket.send(packet, port, host, (error) => {
      if (error) {
        clearTimeout(timeout);
        socket.close();
        reject(error);
      }
    });
  });
}
