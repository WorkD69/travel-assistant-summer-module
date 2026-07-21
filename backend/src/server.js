require('dotenv').config();

const { createApp } = require('./app');
const { loadConfig } = require('./config');
const { getPrisma } = require('./db');

const config = loadConfig();
const app = createApp({ config, prisma: getPrisma() });

app.listen(config.port, () => {
  console.log(`Travel Assistant API listening on port ${config.port}`);
});
