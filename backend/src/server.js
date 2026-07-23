const app = require('./app');
const config = require('./config');
const ai = require('./services/ai');

app.listen(config.port, () => {
  console.log('Travel-pomoshchnik API: http://localhost:' + config.port);
  console.log('AI provider key: ' + (ai.hasKey() ? 'connected' : 'NOT set (AI will return a hint about .env)'));
});
