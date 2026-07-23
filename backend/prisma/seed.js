const bcrypt = require('bcryptjs');
const prisma = require('../src/db');

async function main() {
  console.log('Seeding demo data...');
  const passwordHash = await bcrypt.hash('Password2026!', 10);

  const artem = await prisma.user.upsert({
    where: { email: 'artem@example.test' },
    update: {},
    create: { email: 'artem@example.test', passwordHash: passwordHash, name: 'Артём Иванов', initials: 'А', telegram: 'Подключён' },
  });
  const anna = await prisma.user.upsert({
    where: { email: 'anna@example.test' },
    update: {},
    create: { email: 'anna@example.test', passwordHash: passwordHash, name: 'Анна Соколова', initials: 'А', telegram: 'Не подключён' },
  });

  await prisma.trip.deleteMany({ where: { id: 'trip-turkey-2026' } });

  const trip = await prisma.trip.create({
    data: {
      id: 'trip-turkey-2026',
      title: 'Отпуск в Турции',
      route: 'Сыктывкар - Москва - Анталья',
      startDate: new Date('2026-07-19'),
      endDate: new Date('2026-07-25'),
      status: 'active',
      type: 'group',
      ownerId: artem.id,
      participants: {
        create: [
          { userId: artem.id, name: 'Артём', initials: 'А', shortLabel: 'Ар', role: 'organizer', access: 'Активен', telegram: 'Подключён', tone: 'a' },
          { name: 'Станислав', initials: 'С', shortLabel: 'Ст', role: 'participant', access: 'Активен', telegram: 'Подключён', tone: 'b' },
          { userId: anna.id, name: 'Анна', initials: 'А', shortLabel: 'Ан', role: 'participant', access: 'Активен', telegram: 'Не подключён', tone: 'c' },
          { name: 'Михаил', initials: 'М', shortLabel: 'Ми', role: 'participant', access: 'Активен', telegram: 'Подключён', tone: 'd' },
        ],
      },
      invitations: {
        create: [
          { email: 'nina@example.com', status: 'pending', active: true, expiresAt: new Date('2026-07-20T12:30:00') },
          { email: 'sergey@example.com', status: 'expired', active: false, expiresAt: new Date('2026-07-15T00:00:00') },
        ],
      },
      // демо-документы убраны — реальная загрузка через POST /api/trips/:id/documents/upload
      monitoringSignals: {
        create: [
          { label: 'Мониторинг включён', status: 'Активно', severity: 'info', segment: 'Маршрут целиком', source: 'Система', detail: 'Мониторинг поездки запущен.' },
          { label: 'Проверка трансфера', status: 'Требует внимания', severity: 'warning', segment: 'Анталья - Отель', source: 'Демо-источник', detail: 'Требуется проверка деталей трансфера.' },
        ],
      },
      offlineCopy: {
        create: {
          status: 'saved',
          savedAt: new Date('2026-07-17T14:30:00'),
          size: 8.4,
          includeRouteMap: true,
          includeObservations: true,
          includeDocuments: true,
          selectedDocuments: JSON.stringify([]),
        },
      },
    },
  });

  console.log('Done. Trip:', trip.id, '| Users: artem@example.test / anna@example.test (password Password2026!)');
}

main()
  .catch(function (e) { console.error(e); process.exit(1); })
  .finally(async function () { await prisma.$disconnect(); });
