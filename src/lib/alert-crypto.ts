import crypto from "node:crypto";

/**
 * Symmetric encryption for alert destinations (per-user Discord webhook URLs).
 *
 * A webhook URL is a bearer secret: anyone holding it can post into that channel.
 * The panel database has already been clobbered once during a deploy, so treat every
 * row in `AlertChannel` as something that could leak.
 *
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>  (AES-256-GCM)
 */

const VERSION = "v1";
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.ALERT_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "ALERT_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }

  // Accept a base64 key (preferred) or a long passphrase, normalised to 32 bytes.
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    key = Buffer.from(raw, "utf8");
  }

  if (key.length !== 32) {
    // Fall back to a SHA-256 digest of the provided material so a passphrase still works.
    key = crypto.createHash("sha256").update(raw, "utf8").digest();
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored alert destination is not in a recognised format.");
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Discord webhooks look like:
 *   https://discord.com/api/webhooks/<id>/<token>
 *   https://discordapp.com/api/webhooks/<id>/<token>
 *   https://canary.discord.com/api/webhooks/<id>/<token>
 * Restricting the host is what stops a user from pointing the alert worker at an
 * internal address (SSRF).
 */
const DISCORD_WEBHOOK_PATTERN =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{15,25})\/([A-Za-z0-9_\-.]{50,120})$/;

export function parseDiscordWebhook(url: string) {
  const match = DISCORD_WEBHOOK_PATTERN.exec(url.trim());

  if (!match) {
    return null;
  }

  const [, id] = match;
  return { id };
}

/** A redacted label safe to return to the browser. Never leaks the token. */
export function describeDestination(url: string) {
  const parsed = parseDiscordWebhook(url);

  if (!parsed) {
    return "Discord webhook";
  }

  return `Discord · …${parsed.id.slice(-6)}`;
}
