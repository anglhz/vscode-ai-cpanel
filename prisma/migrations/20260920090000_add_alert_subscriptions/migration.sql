-- Per-user downtime alerting: incidents, personal Discord webhooks, subscriptions.

CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DOWN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "durationSeconds" INTEGER,
    "alertCount" INTEGER NOT NULL DEFAULT 0,
    "lastAlertAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "acknowledgedById" TEXT,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Incident_serverId_resolvedAt_idx" ON "Incident"("serverId", "resolvedAt");
CREATE INDEX "Incident_resolvedAt_startedAt_idx" ON "Incident"("resolvedAt", "startedAt");

CREATE TABLE "AlertChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'DISCORD_WEBHOOK',
    "label" TEXT NOT NULL DEFAULT 'Discord',
    "destination" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "verifiedAt" DATETIME,
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertChannel_userId_idx" ON "AlertChannel"("userId");

CREATE TABLE "AlertSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "minDowntimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "repeatMinutes" INTEGER NOT NULL DEFAULT 60,
    "notifyOnRecovery" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertSubscription_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "AlertChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertSubscription_userId_idx" ON "AlertSubscription"("userId");
CREATE INDEX "AlertSubscription_channelId_idx" ON "AlertSubscription"("channelId");
CREATE INDEX "AlertSubscription_enabled_idx" ON "AlertSubscription"("enabled");

CREATE TABLE "AlertSubscriptionServer" (
    "subscriptionId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,

    PRIMARY KEY ("subscriptionId", "serverId"),
    CONSTRAINT "AlertSubscriptionServer_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AlertSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertSubscriptionServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "GameServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertSubscriptionServer_serverId_idx" ON "AlertSubscriptionServer"("serverId");

CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    CONSTRAINT "AlertDelivery_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AlertSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AlertDelivery_incidentId_subscriptionId_idx" ON "AlertDelivery"("incidentId", "subscriptionId");
CREATE INDEX "AlertDelivery_sentAt_idx" ON "AlertDelivery"("sentAt");

-- Carry existing "this server is down" state over into an open incident, so a server that
-- was already offline when this migration lands does not go unnoticed.
INSERT INTO "Incident" ("id", "serverId", "kind", "startedAt", "alertCount", "lastAlertAt", "createdAt", "updatedAt")
SELECT
    'inc_migrated_' || "id",
    "id",
    'DOWN',
    "lastDownAlertAt",
    1,
    "lastDownAlertAt",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "GameServer"
WHERE "lastDownAlertAt" IS NOT NULL;
