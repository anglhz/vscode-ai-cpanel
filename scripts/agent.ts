import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { z } from "zod";
import { GAME_KEYS } from "@/lib/game-profiles";
import {
  deleteProvisionedServerDirectory,
  getSystemdStatus,
  isServerAction,
  provisionSystemdServer,
  runSystemdAction,
} from "@/lib/systemd";

loadEnvConfig(process.cwd());

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 20_000;
const serviceNameSchema = z.string().regex(/^[a-zA-Z0-9_.@:-]+\.service$/);
const provisionSchema = z.object({
  name: z.string().min(2),
  ownerFolder: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  game: z.enum(GAME_KEYS),
  port: z.coerce.number().int().min(1024).max(65535),
  maxClients: z.coerce.number().int().min(1).max(128),
  binaryName: z.string().min(1).max(120).regex(/^[a-zA-Z0-9_.\/-]+$/),
});
const deleteSchema = z.object({
  execStart: z.string().min(1).max(1000).refine((value) => !/[\r\n]/.test(value)),
});

function getAgentToken() {
  const token = process.env.AGENT_TOKEN || "";

  if (!token) {
    throw new Error("AGENT_TOKEN must be configured before starting the agent.");
  }

  return token;
}

function isAuthorized(request: IncomingMessage) {
  const expected = Buffer.from(getAgentToken());
  const authorization = request.headers.authorization ?? "";
  const actual = Buffer.from(authorization.replace(/^Bearer\s+/i, ""));

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(data));
}

function parsePath(request: IncomingMessage) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  return {
    pathname: url.pathname,
    segments: url.pathname.split("/").filter(Boolean).map(decodeURIComponent),
  };
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const { pathname, segments } = parsePath(request);

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!isAuthorized(request)) {
    sendJson(response, 401, { error: "Unauthorized" });
    return;
  }

  if (request.method === "POST" && pathname === "/api/provision") {
    const payload = provisionSchema.parse(await readJson(request));
    const provisioned = await provisionSystemdServer(payload);
    sendJson(response, 201, {
      serviceName: provisioned.serviceName,
      execStart: provisioned.execStart,
      skipped: provisioned.skipped,
    });
    return;
  }

  if (segments[0] === "api" && segments[1] === "servers" && segments[2]) {
    const serviceName = serviceNameSchema.parse(segments[2]);
    const actionOrStatus = segments[3];

    if (request.method === "GET" && actionOrStatus === "status") {
      sendJson(response, 200, { status: await getSystemdStatus(serviceName) });
      return;
    }

    if (request.method === "POST" && actionOrStatus && isServerAction(actionOrStatus)) {
      await runSystemdAction(serviceName, actionOrStatus);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "DELETE" && segments.length === 3) {
      const payload = deleteSchema.parse(await readJson(request));
      const deleted = await deleteProvisionedServerDirectory(serviceName, payload.execStart);
      sendJson(response, 200, { ok: true, skipped: deleted.skipped, serverDirectory: deleted.serverDirectory });
      return;
    }
  }

  sendJson(response, 404, { error: "Not found" });
}

const host = process.env.AGENT_HOST || DEFAULT_HOST;
const port = Number(process.env.AGENT_PORT || DEFAULT_PORT);
const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    const message = error instanceof Error ? error.message : "Agent request failed.";
    sendJson(response, 500, { error: message });
  });
});

server.listen(port, host, () => {
  console.log(`Intuitive Gamepanel Agent listening on ${host}:${port}`);
});
