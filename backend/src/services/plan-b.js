const { ApiError } = require('../errors');

function buildPlanCandidates(incident) {
  const reason = incident.detail || incident.label || 'изменение маршрута';
  return [
    {
      rank: 1,
      strategy: 'fast',
      title: 'Быстро восстановить маршрут',
      summary: `Минимизировать задержку после события: ${reason}`,
      steps: ['Связаться с перевозчиком или принимающей стороной', 'Забронировать ближайший подтверждённый вариант', 'Сообщить участникам новое время'],
      pros: 'Минимальная потеря времени',
      cons: 'Стоимость может быть выше',
      whenToUse: 'Когда критично продолжить поездку как можно быстрее',
    },
    {
      rank: 2,
      strategy: 'reliable',
      title: 'Надёжный подтверждённый вариант',
      summary: `Выбрать решение с подтверждёнными местами и условиями после: ${reason}`,
      steps: ['Проверить официальные альтернативы', 'Подтвердить места и правила возврата', 'Обновить маршрут и документы участников'],
      pros: 'Ниже риск повторного сбоя',
      cons: 'Может потребоваться больше времени',
      whenToUse: 'Когда важнее предсказуемость и подтверждение',
    },
    {
      rank: 3,
      strategy: 'delegate',
      title: 'Передать решение поддержке',
      summary: `Подключить организатора, агента или поддержку к ситуации: ${reason}`,
      steps: ['Собрать номера бронирований и факты', 'Передать единый запрос ответственному', 'Зафиксировать подтверждённое решение для группы'],
      pros: 'Снижает нагрузку на участника',
      cons: 'Зависит от скорости внешней поддержки',
      whenToUse: 'Когда требуется согласование нескольких бронирований',
    },
  ];
}

async function generatePlans(prisma, { tripId, incidentId, userId }) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.monitoringSignal.findFirst({
      where: { id: incidentId, tripId, status: 'confirmed' },
    });
    if (!incident) throw new ApiError(404, 'not_found', 'Подтверждённое событие не найдено.');
    const candidates = buildPlanCandidates(incident);
    await tx.tripPlan.deleteMany({ where: { incidentId, rank: { notIn: [1, 2, 3] } } });
    const plans = [];
    for (const candidate of candidates) {
      const data = {
        ...candidate,
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

module.exports = { buildPlanCandidates, generatePlans };
