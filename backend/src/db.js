const { PrismaClient } = require('@prisma/client');
const { AsyncLocalStorage } = require('node:async_hooks');
const { createTeammatePrismaAdapter } = require('./storage/teammate-prisma-adapter');
const { publishAppliedPlanToTelegram } = require('./storage/telegram-plan-bridge');

let prisma;
let teammatePrisma;
const teammateContext = new AsyncLocalStorage();

function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function setPrisma(client) {
  prisma = client;
  teammatePrisma = null;
}

function getTeammatePrisma() {
  const scoped = teammateContext.getStore();
  if (scoped) return scoped;
  if (!teammatePrisma) {
    teammatePrisma = createTeammatePrismaAdapter(getPrisma(), {
      onPlanApplied: publishAppliedPlanToTelegram,
    });
  }
  return teammatePrisma;
}

function runWithTeammatePrisma(callback) {
  const scoped = createTeammatePrismaAdapter(getPrisma(), {
    onPlanApplied: publishAppliedPlanToTelegram,
  });
  return teammateContext.run(scoped, callback);
}

module.exports = new Proxy({ getPrisma, getTeammatePrisma, runWithTeammatePrisma, setPrisma }, {
  get(target, property) {
    if (property in target) return target[property];
    return getTeammatePrisma()[property];
  },
});
