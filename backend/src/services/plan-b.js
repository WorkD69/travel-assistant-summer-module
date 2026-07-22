const { ApiError } = require('../errors');
const { fallbackPlanCandidates } = require('./assistant');

function buildPlanCandidates(incident) {
  return fallbackPlanCandidates(incident);
}

function serializeList(value) {
  return JSON.stringify(Array.isArray(value) ? value : [String(value || '')].filter(Boolean));
}

function storedList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch {
    return [String(value)];
  }
}

function publicTripPlan(item) {
  return {
    id: item.id,
    rank: item.rank,
    strategy: item.strategy,
    title: item.title,
    summary: item.summary,
    steps: Array.isArray(item.steps) ? item.steps : [],
    pros: storedList(item.pros),
    cons: storedList(item.cons),
    whenToUse: item.whenToUse,
    timeImpact: item.timeImpact,
    priceImpact: item.priceImpact,
    affectedElements: Array.isArray(item.affectedElements) ? item.affectedElements : [],
    emailDraft: item.emailDraft && typeof item.emailDraft === 'object' ? item.emailDraft : null,
    generationSource: item.generationSource,
    status: item.status,
    visibility: item.visibility,
  };
}

async function generatePlans(prisma, { tripId, incidentId, userId, candidates }) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.monitoringSignal.findFirst({
      where: { id: incidentId, tripId, status: 'confirmed' },
    });
    if (!incident) throw new ApiError(404, 'not_found', 'Подтверждённое событие не найдено.');
    const selectedCandidates = candidates || buildPlanCandidates(incident);
    await tx.tripPlan.deleteMany({ where: { incidentId, rank: { notIn: [1, 2, 3] } } });
    const plans = [];
    for (const candidate of selectedCandidates) {
      const data = {
        ...candidate,
        pros: serializeList(candidate.pros),
        cons: serializeList(candidate.cons),
        tripId,
        incidentId,
        createdByUserId: userId,
        status: 'candidate',
        visibility: 'internal',
      };
      plans.push(await tx.tripPlan.upsert({
        where: { incidentId_rank: { incidentId, rank: candidate.rank } },
        create: data,
        update: {
          strategy: data.strategy,
          title: data.title,
          summary: data.summary,
          steps: data.steps,
          pros: data.pros,
          cons: data.cons,
          whenToUse: data.whenToUse,
          timeImpact: data.timeImpact,
          priceImpact: data.priceImpact,
          affectedElements: data.affectedElements,
          emailDraft: data.emailDraft,
          generationSource: data.generationSource,
          status: 'candidate',
          visibility: 'internal',
          selectedAt: null,
          publishedAt: null,
        },
      }));
    }
    return plans;
  });
}

module.exports = { buildPlanCandidates, generatePlans, publicTripPlan, serializeList, storedList };
