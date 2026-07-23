// Universal AI client using any OpenAI-compatible /chat/completions endpoint.
// Configure the provider via AI_BASE_URL, AI_API_KEY, AI_MODEL in .env.
// Uses the built-in global fetch (Node 18+), so no extra npm dependency is needed.
const config = require('../config');

function hasKey() {
  return !!config.ai.apiKey;
}

async function generate(opts) {
  const system = opts.system;
  const messages = opts.messages || [];
  const json = !!opts.json;

  if (!config.ai.apiKey) {
    const err = new Error('AI_API_KEY not set');
    err.code = 'NO_KEY';
    throw err;
  }

  const chatMessages = [{ role: 'system', content: system }].concat(messages);
  const payload = {
    model: config.ai.model,
    messages: chatMessages,
    temperature: 0.7,
  };
  if (json) {
    payload.response_format = { type: 'json_object' };
  }

  const base = config.ai.baseUrl.replace(/\/+$/, '');
  let resp;
  try {
    resp = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.ai.apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const err = new Error('AI network error: ' + e.message);
    err.code = 'AI_NETWORK';
    throw err;
  }

  if (!resp.ok) {
    let detail = '';
    try { detail = await resp.text(); } catch (e) { detail = ''; }
    const err = new Error('AI provider returned ' + resp.status + ': ' + detail);
    err.code = resp.status === 429 ? 'RATE_LIMIT' : 'AI_ERROR';
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const choice = data && data.choices && data.choices[0];
  const content = choice && choice.message ? choice.message.content : '';
  return content || '';
}

module.exports = { generate: generate, hasKey: hasKey };
