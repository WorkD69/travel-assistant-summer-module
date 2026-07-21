const crypto = require('node:crypto');

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const { SEED_DATA } = require('../src/seed-data');

const prisma = new PrismaClient();

function requiredCredential(name) {
  const value = process.env[name];
  if (!value || value.length < 12) {
    throw new Error(`${name} must be supplied externally and contain at least 12 characters`);
  }
  return value;
}

async function seed() {
  if (SEED_DATA.plans.length !== 3) {
    throw new Error('Safe seed must contain exactly three Plan B candidates');
  }

  const credentials = {
    'u-artem': requiredCredential('DEMO_ORGANIZER_PASSWORD'),
    'u-anna': requiredCredential('DEMO_PARTICIPANT_PASSWORD'),
    'u-no-access': requiredCredential('DEMO_NO_ACCESS_PASSWORD'),
  };
  const hashes = {};
  for (const [userId, value] of Object.entries(credentials)) {
    hashes[userId] = await bcrypt.hash(value, 12);
  }

  await prisma.$transaction(async (tx) => {
    for (const user of SEED_DATA.users) {
      const data = { ...user, passwordHash: hashes[user.id] };
      await tx.user.upsert({ where: { id: user.id }, create: data, update: data });
    }

    const tripData = {
      ...SEED_DATA.trip,
      startDate: new Date(SEED_DATA.trip.startDate),
      endDate: new Date(SEED_DATA.trip.endDate),
    };
    await tx.trip.upsert({
      where: { id: tripData.id },
      create: tripData,
      update: {
        title: tripData.title,
        route: tripData.route,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        timezone: tripData.timezone,
        type: tripData.type,
        status: tripData.status,
        ownerId: tripData.ownerId,
      },
    });

    for (const membership of SEED_DATA.participants) {
      const data = {
        id: membership.id,
        tripId: tripData.id,
        userId: membership.userId,
        role: membership.role,
        status: 'active',
      };
      await tx.participant.upsert({
        where: { tripId_userId: { tripId: tripData.id, userId: membership.userId } },
        create: data,
        update: { role: data.role, status: data.status, revokedAt: null },
      });
    }

    for (const event of SEED_DATA.events) {
      const data = {
        ...event,
        tripId: tripData.id,
        startsAt: new Date(event.startsAt),
        endsAt: event.endsAt ? new Date(event.endsAt) : null,
      };
      await tx.tripEvent.upsert({ where: { id: event.id }, create: data, update: data });
    }

    for (const document of SEED_DATA.documents) {
      const { safeDemo, ...documentData } = document;
      const data = { ...documentData, tripId: tripData.id };
      await tx.document.upsert({ where: { id: document.id }, create: data, update: data });

      const bytes = Buffer.from(document.extractedText, 'utf8');
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      await tx.documentBlob.upsert({
        where: { documentId: document.id },
        create: { documentId: document.id, bytes, sha256 },
        update: { bytes, sha256 },
      });
    }

    const incident = {
      ...SEED_DATA.incident,
      tripId: tripData.id,
      confirmedByUserId: 'u-artem',
      occurredAt: new Date(SEED_DATA.incident.occurredAt),
      confirmedAt: new Date(SEED_DATA.incident.confirmedAt),
    };
    await tx.monitoringSignal.upsert({
      where: { id: incident.id },
      create: incident,
      update: incident,
    });

    for (const plan of SEED_DATA.plans) {
      const data = {
        ...plan,
        tripId: tripData.id,
        incidentId: incident.id,
        createdByUserId: 'u-artem',
        status: 'candidate',
        visibility: 'internal',
      };
      await tx.tripPlan.upsert({ where: { id: plan.id }, create: data, update: data });
    }

    const message = {
      ...SEED_DATA.message,
      tripId: tripData.id,
      publishedAt: new Date(SEED_DATA.message.publishedAt),
    };
    await tx.message.upsert({
      where: { id: message.id },
      create: message,
      update: message,
    });

    for (const preference of SEED_DATA.preferences) {
      await tx.notificationPreference.upsert({
        where: { siteUserId: preference.siteUserId },
        create: preference,
        update: { timezone: preference.timezone },
      });
      await tx.botUserState.upsert({
        where: { siteUserId: preference.siteUserId },
        create: { siteUserId: preference.siteUserId, activeTripId: tripData.id },
        update: { activeTripId: tripData.id },
      });
    }
  });
}

seed()
  .then(() => {
    console.log('Safe demo seed applied.');
  })
  .catch((error) => {
    console.error('Safe demo seed failed:', error && error.name ? error.name : 'Error');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
