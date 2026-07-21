-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('draft', 'active', 'completed');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('organizer', 'participant', 'viewer');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'revoked');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'rejected', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('shared', 'personal', 'organizer_only');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'confirmed', 'revoked', 'deleted');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('not_requested', 'extracted', 'manual_review', 'failed');

-- CreateEnum
CREATE TYPE "MonitoringStatus" AS ENUM ('detected', 'confirmed', 'resolved');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('candidate', 'selected', 'published', 'archived');

-- CreateEnum
CREATE TYPE "PlanVisibility" AS ENUM ('internal', 'published');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "SosStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "route" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "type" TEXT NOT NULL DEFAULT 'group',
    "status" "TripStatus" NOT NULL DEFAULT 'draft',
    "ownerId" TEXT NOT NULL,
    "selectedPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'participant',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "displayName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'participant',
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "departure" TEXT,
    "arrival" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSignal" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "segment" TEXT,
    "source" TEXT,
    "status" "MonitoringStatus" NOT NULL DEFAULT 'detected',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPlan" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "rank" INTEGER NOT NULL,
    "strategy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "steps" JSONB NOT NULL,
    "pros" TEXT,
    "cons" TEXT,
    "whenToUse" TEXT,
    "status" "PlanStatus" NOT NULL DEFAULT 'candidate',
    "visibility" "PlanVisibility" NOT NULL DEFAULT 'internal',
    "selectedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "allowedUserId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'shared',
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "segment" TEXT,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'not_requested',
    "extractedText" TEXT,
    "revokedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentBlob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentBlob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentDownloadToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentDownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "planId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "audience" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineCopy" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineCopy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'dialog',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAccountLink" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "siteUserId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "siteUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotUserState" (
    "siteUserId" TEXT NOT NULL,
    "activeTripId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotUserState_pkey" PRIMARY KEY ("siteUserId")
);

-- CreateTable
CREATE TABLE "SosTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SosStatus" NOT NULL DEFAULT 'open',
    "segment" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SosTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "siteUserId" TEXT NOT NULL,
    "segmentReminders" BOOLEAN NOT NULL DEFAULT true,
    "timeChanges" BOOLEAN NOT NULL DEFAULT true,
    "departureChanges" BOOLEAN NOT NULL DEFAULT true,
    "delaysCancellations" BOOLEAN NOT NULL DEFAULT true,
    "transferChanges" BOOLEAN NOT NULL DEFAULT true,
    "hotelChanges" BOOLEAN NOT NULL DEFAULT true,
    "newDocuments" BOOLEAN NOT NULL DEFAULT true,
    "invitations" BOOLEAN NOT NULL DEFAULT true,
    "ownSos" BOOLEAN NOT NULL DEFAULT true,
    "violations" BOOLEAN NOT NULL DEFAULT true,
    "planB" BOOLEAN NOT NULL DEFAULT true,
    "organizerMessages" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT NOT NULL DEFAULT '23:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("siteUserId")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientTelegramId" TEXT NOT NULL,
    "recipientSiteUserId" TEXT,
    "tripId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_selectedPlanId_key" ON "Trip"("selectedPlanId");

-- CreateIndex
CREATE INDEX "Trip_ownerId_status_idx" ON "Trip"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Trip_startDate_endDate_idx" ON "Trip"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Participant_userId_status_idx" ON "Participant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tripId_userId_key" ON "Participant"("tripId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tripId_status_idx" ON "Invitation"("tripId", "status");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "TripEvent_tripId_startsAt_idx" ON "TripEvent"("tripId", "startsAt");

-- CreateIndex
CREATE INDEX "MonitoringSignal_tripId_status_occurredAt_idx" ON "MonitoringSignal"("tripId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "TripPlan_tripId_status_visibility_idx" ON "TripPlan"("tripId", "status", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "TripPlan_incidentId_rank_key" ON "TripPlan"("incidentId", "rank");

-- CreateIndex
CREATE INDEX "Document_tripId_status_visibility_idx" ON "Document"("tripId", "status", "visibility");

-- CreateIndex
CREATE INDEX "Document_allowedUserId_idx" ON "Document"("allowedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentBlob_documentId_key" ON "DocumentBlob"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDownloadToken_tokenHash_key" ON "DocumentDownloadToken"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentDownloadToken_expiresAt_revokedAt_idx" ON "DocumentDownloadToken"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "Message_tripId_status_publishedAt_idx" ON "Message"("tripId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineCopy_tripId_userId_key" ON "OfflineCopy"("tripId", "userId");

-- CreateIndex
CREATE INDEX "AssistantMessage_tripId_userId_createdAt_idx" ON "AssistantMessage"("tripId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccountLink_telegramUserId_key" ON "TelegramAccountLink"("telegramUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccountLink_siteUserId_key" ON "TelegramAccountLink"("siteUserId");

-- CreateIndex
CREATE INDEX "TelegramAccountLink_revokedAt_idx" ON "TelegramAccountLink"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_siteUserId_expiresAt_idx" ON "TelegramLinkToken"("siteUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "BotUserState_activeTripId_idx" ON "BotUserState"("activeTripId");

-- CreateIndex
CREATE UNIQUE INDEX "SosTicket_number_key" ON "SosTicket"("number");

-- CreateIndex
CREATE INDEX "SosTicket_tripId_status_createdAt_idx" ON "SosTicket"("tripId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SosTicket_authorUserId_idempotencyKey_key" ON "SosTicket"("authorUserId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEvent_eventId_key" ON "NotificationEvent"("eventId");

-- CreateIndex
CREATE INDEX "NotificationEvent_status_availableAt_createdAt_idx" ON "NotificationEvent"("status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationEvent_recipientTelegramId_status_idx" ON "NotificationEvent"("recipientTelegramId", "status");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_selectedPlanId_fkey" FOREIGN KEY ("selectedPlanId") REFERENCES "TripPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSignal" ADD CONSTRAINT "MonitoringSignal_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringSignal" ADD CONSTRAINT "MonitoringSignal_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "MonitoringSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlan" ADD CONSTRAINT "TripPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_allowedUserId_fkey" FOREIGN KEY ("allowedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBlob" ADD CONSTRAINT "DocumentBlob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownloadToken" ADD CONSTRAINT "DocumentDownloadToken_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDownloadToken" ADD CONSTRAINT "DocumentDownloadToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TripPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCopy" ADD CONSTRAINT "OfflineCopy_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCopy" ADD CONSTRAINT "OfflineCopy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAccountLink" ADD CONSTRAINT "TelegramAccountLink_siteUserId_fkey" FOREIGN KEY ("siteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_siteUserId_fkey" FOREIGN KEY ("siteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotUserState" ADD CONSTRAINT "BotUserState_siteUserId_fkey" FOREIGN KEY ("siteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotUserState" ADD CONSTRAINT "BotUserState_activeTripId_fkey" FOREIGN KEY ("activeTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosTicket" ADD CONSTRAINT "SosTicket_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosTicket" ADD CONSTRAINT "SosTicket_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_siteUserId_fkey" FOREIGN KEY ("siteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_recipientSiteUserId_fkey" FOREIGN KEY ("recipientSiteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
