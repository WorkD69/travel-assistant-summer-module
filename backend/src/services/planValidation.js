function validationError(message) {
  const error = new Error(message);
  error.code = 'AI_INVALID_PLANS';
  error.status = 502;
  return error;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validatePlansPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Ответ Plan B должен быть JSON-объектом');
  }
  if (!Array.isArray(payload.plans) || payload.plans.length !== 3) {
    throw validationError('Ответ Plan B должен содержать ровно 3 плана');
  }

  payload.plans.forEach(function (plan, index) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      throw validationError('План ' + (index + 1) + ' должен быть объектом');
    }
    [
      'id', 'strategy', 'title', 'revisedRoute', 'totalDuration', 'currency',
      'delayComparedToOriginal', 'reliability', 'hotelImpact', 'transferImpact',
      'activitiesImpact', 'source', 'pros', 'cons', 'whenToUse',
    ].forEach(function (field) {
      if (!nonEmptyString(plan[field])) {
        throw validationError(
          'План ' + (index + 1) + ' содержит пустое поле ' + field,
        );
      }
    });
    if (!Array.isArray(plan.steps) || !plan.steps.length ||
        plan.steps.some(function (step) { return !nonEmptyString(step); })) {
      throw validationError(
        'План ' + (index + 1) + ' содержит пустое поле steps',
      );
    }
    if (!Array.isArray(plan.segments) || !plan.segments.length) {
      throw validationError('План ' + (index + 1) + ' содержит пустое поле segments');
    }
    plan.segments.forEach(function (segment) {
      ['transportType', 'departurePlace', 'arrivalPlace', 'departureAt', 'arrivalAt'].forEach(function (field) {
        if (!nonEmptyString(segment && segment[field])) {
          throw validationError('План ' + (index + 1) + ' содержит пустое поле segments.' + field);
        }
      });
    });
    ['risks', 'assumptions', 'requiredActions'].forEach(function (field) {
      if (!Array.isArray(plan[field]) || !plan[field].length ||
          plan[field].some(function (item) { return !nonEmptyString(item); })) {
        throw validationError('План ' + (index + 1) + ' содержит пустое поле ' + field);
      }
    });
    if (typeof plan.estimatedCost !== 'number' || !Number.isFinite(plan.estimatedCost)) {
      throw validationError('План ' + (index + 1) + ' содержит пустое поле estimatedCost');
    }
    if (!Number.isInteger(plan.transferCount) || plan.transferCount < 0) {
      throw validationError('План ' + (index + 1) + ' содержит пустое поле transferCount');
    }
    if (plan.isDemoData !== true) {
      throw validationError('План ' + (index + 1) + ' должен явно отмечать demo-данные');
    }
  });

  const strategies = payload.plans.map(function (plan) { return plan.strategy; });
  if (strategies.join(',') !== 'fastest,cheapest,reliable') {
    throw validationError('Plan B должен содержать стратегии fastest, cheapest, reliable в этом порядке');
  }

  return payload;
}

function validateSelectedPlan(plan) {
  const fastest = Object.assign({}, plan, { strategy: 'fastest' });
  const cheapest = Object.assign({}, plan, { strategy: 'cheapest' });
  const reliable = Object.assign({}, plan, { strategy: 'reliable' });
  validatePlansPayload({ plans: [fastest, cheapest, reliable] });
  if (!['fastest', 'cheapest', 'reliable'].includes(plan.strategy)) {
    throw validationError('Неизвестная стратегия Plan B');
  }
  return plan;
}

module.exports = {
  validatePlansPayload: validatePlansPayload,
  validateSelectedPlan: validateSelectedPlan,
};
