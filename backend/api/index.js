const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { getPrisma } = require('../src/db');

module.exports = createApp({ config: loadConfig(), prisma: getPrisma() });
