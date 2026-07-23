function routePoints(route) {
  const points = String(route || '')
    .split(/\s*(?:→|->|—>)\s*/)
    .map(function (point) { return point.trim(); })
    .filter(Boolean);
  return {
    origin: points[0] || 'Пункт отправления',
    destination: points[points.length - 1] || 'Пункт назначения',
  };
}

function baseDeparture(trip) {
  const value = trip && trip.startDate ? new Date(trip.startDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(value.getTime())) return new Date(Date.now() + 24 * 60 * 60 * 1000);
  return value;
}

function at(start, hours) {
  return new Date(start.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function segment(id, transportType, from, to, start, departHour, arriveHour) {
  return {
    id: id,
    transportType: transportType,
    departurePlace: from,
    arrivalPlace: to,
    departureAt: at(start, departHour),
    arrivalAt: at(start, arriveHour),
    source: 'Mock GDS demo catalog',
    isDemoData: true,
  };
}

function common(trip, strategy, values) {
  const requiredActions = [
    'Проверить фактическое расписание и наличие мест у перевозчика',
    'Подтвердить новый маршрут организатору и участникам',
    'Обновить связанные бронирования после подтверждения',
  ];
  return Object.assign({
    id: 'demo-' + String((trip && trip.id) || 'trip') + '-' + strategy,
    strategy: strategy,
    currency: 'RUB',
    risks: ['Демонстрационное расписание может не совпадать с фактическим'],
    assumptions: [
      'Это демонстрационный маршрут без проверки live-расписания и наличия мест',
      'Перед покупкой требуется подтверждение у реального перевозчика',
    ],
    requiredActions: requiredActions,
    steps: requiredActions.slice(),
    hotelImpact: 'Сообщить отелю расчётное время прибытия после подтверждения билетов',
    transferImpact: 'Перенести трансфер под подтверждённое время прибытия',
    activitiesImpact: 'Скорректировать первую активность по фактическому времени прибытия',
    source: 'Mock GDS demo catalog',
    isDemoData: true,
    emailDraft: null,
  }, values);
}

function buildDemoAlternatives(trip) {
  const points = routePoints(trip && trip.route);
  const start = baseDeparture(trip || {});
  const fastSegments = [segment('fast-direct', 'flight', points.origin, points.destination, start, 2, 4.5)];
  const cheapHub = 'Тверь';
  const cheapSegments = [
    segment('cheap-train-1', 'train', points.origin, cheapHub, start, 3, 8),
    segment('cheap-train-2', 'train', cheapHub, points.destination, start, 10, 13),
  ];
  const reliableHub = 'Великий Новгород';
  const reliableSegments = [
    segment('reliable-train-1', 'train', points.origin, reliableHub, start, 4, 7),
    segment('reliable-train-2', 'train', reliableHub, points.destination, start, 9, 16),
  ];

  return {
    summary: 'Три контролируемых демонстрационных варианта маршрута. Это не live-наличие: расписание и места нужно проверить у перевозчика.',
    clarifyingQuestions: [],
    plans: [
      common(trip, 'fastest', {
        title: 'Самый быстрый: прямой перелёт',
        revisedRoute: points.origin + ' → ' + points.destination,
        segments: fastSegments,
        totalDuration: '2 ч 30 мин',
        estimatedCost: 18000,
        delayComparedToOriginal: 'минимальная, ориентировочно 0–2 ч',
        transferCount: 0,
        reliability: 'medium',
        pros: 'Минимальное расчётное время в пути и без пересадок',
        cons: 'Самая высокая демонстрационная стоимость; требуется live-проверка',
        whenToUse: 'Когда важнее всего прибыть как можно раньше',
      }),
      common(trip, 'cheapest', {
        title: 'Самый дешёвый: поезд через Тверь',
        revisedRoute: points.origin + ' → ' + cheapHub + ' → ' + points.destination,
        segments: cheapSegments,
        totalDuration: '10 ч',
        estimatedCost: 4500,
        delayComparedToOriginal: 'ориентировочно +5–8 ч',
        transferCount: 1,
        reliability: 'medium',
        pros: 'Минимальная демонстрационная стоимость',
        cons: 'Дольше в пути и одна самостоятельная пересадка',
        whenToUse: 'Когда бюджет важнее времени прибытия',
      }),
      common(trip, 'reliable', {
        title: 'Самый надёжный: железная дорога с запасом на пересадку',
        revisedRoute: points.origin + ' → ' + reliableHub + ' → ' + points.destination,
        segments: reliableSegments,
        totalDuration: '12 ч',
        estimatedCost: 9800,
        delayComparedToOriginal: 'ориентировочно +7–10 ч',
        transferCount: 1,
        reliability: 'high',
        pros: 'Большой демонстрационный запас между сегментами и минимум аэропортовых рисков',
        cons: 'Самое долгое расчётное время в пути',
        whenToUse: 'Когда важнее предсказуемость и минимум усилий',
      }),
    ],
    emailDraft: null,
  };
}

module.exports = { buildDemoAlternatives, routePoints };

