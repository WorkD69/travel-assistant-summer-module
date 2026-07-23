-- Additive Version B2 migration. Apply to staging first and back up SQLite
-- immediately before any separately approved production migration.
ALTER TABLE "Trip" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "Trip" SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP);

CREATE TABLE "TripChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tripId" TEXT NOT NULL,
  "actorId" TEXT,
  "type" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "details" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TripChange_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TripChange_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TripChange_tripId_createdAt_idx" ON "TripChange"("tripId", "createdAt");
CREATE INDEX "TripChange_type_idx" ON "TripChange"("type");

ALTER TABLE "TripPlan" ADD COLUMN "strategy" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "revisedRoute" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "segments" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "totalDuration" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "estimatedCost" REAL;
ALTER TABLE "TripPlan" ADD COLUMN "currency" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "delayComparedToOriginal" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "transferCount" INTEGER;
ALTER TABLE "TripPlan" ADD COLUMN "reliability" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "risks" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "assumptions" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "requiredActions" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "hotelImpact" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "transferImpact" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "activitiesImpact" TEXT;
ALTER TABLE "TripPlan" ADD COLUMN "isDemoData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TripPlan" ADD COLUMN "appliedAt" DATETIME;

ALTER TABLE "Invitation" ADD COLUMN "acceptedAt" DATETIME;
ALTER TABLE "Invitation" ADD COLUMN "acceptedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invitation_acceptedById_idx" ON "Invitation"("acceptedById");
