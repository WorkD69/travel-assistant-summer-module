const { PrismaClient } = require('@prisma/client');

const prisma = global.__travelPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__travelPrisma = prisma;

module.exports = prisma;
