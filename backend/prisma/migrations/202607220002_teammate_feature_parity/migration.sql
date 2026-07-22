-- Additive feature-parity migration. Existing production rows remain valid.
CREATE TABLE "RoutePoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'nominatim',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutePoint_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TripEvent"
    ADD COLUMN "source" TEXT,
    ADD COLUMN "reference" TEXT,
    ADD COLUMN "sortOrder" INTEGER;

ALTER TABLE "TripPlan"
    ADD COLUMN "timeImpact" TEXT,
    ADD COLUMN "priceImpact" TEXT,
    ADD COLUMN "affectedElements" JSONB,
    ADD COLUMN "emailDraft" JSONB,
    ADD COLUMN "generationSource" TEXT;

ALTER TABLE "Document"
    ADD COLUMN "extractedData" JSONB,
    ADD COLUMN "ocrErrorCode" TEXT,
    ADD COLUMN "processedAt" TIMESTAMP(3),
    ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RoutePoint_tripId_sortOrder_key" ON "RoutePoint"("tripId", "sortOrder");
CREATE INDEX "RoutePoint_tripId_idx" ON "RoutePoint"("tripId");

ALTER TABLE "RoutePoint"
    ADD CONSTRAINT "RoutePoint_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
