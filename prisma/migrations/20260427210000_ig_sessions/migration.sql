-- Manageable IG session pool. Replaces the env-only IG_SESSIONID*/IG_COOKIES*
-- bootstrap with a DB-backed list the user can edit from the frontend.
CREATE TABLE "ig_sessions" (
    "id"             TEXT PRIMARY KEY,
    "label"          TEXT,
    "sessionid"      TEXT,
    "dsUserId"       TEXT,
    "cookies"        TEXT,
    "wwwClaim"       TEXT,
    "enabled"        BOOLEAN NOT NULL DEFAULT TRUE,
    "cold"           BOOLEAN NOT NULL DEFAULT FALSE,
    "cooldownEndsAt" TIMESTAMP(3),
    "lastUsedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL
);

CREATE INDEX "ig_sessions_enabled_idx" ON "ig_sessions" ("enabled");
