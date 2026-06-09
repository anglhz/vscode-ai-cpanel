CREATE TABLE "TeamSpeakServer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "host" TEXT NOT NULL,
  "queryPort" INTEGER NOT NULL DEFAULT 10011,
  "voicePort" INTEGER NOT NULL DEFAULT 9987,
  "apiKey" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "UserTeamSpeakAccess" (
  "userId" TEXT NOT NULL,
  "teamspeakId" TEXT NOT NULL,
  PRIMARY KEY ("userId", "teamspeakId"),
  CONSTRAINT "UserTeamSpeakAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserTeamSpeakAccess_teamspeakId_fkey" FOREIGN KEY ("teamspeakId") REFERENCES "TeamSpeakServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
