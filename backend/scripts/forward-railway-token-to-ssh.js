const { spawnSync } = require('child_process');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (chunk) { input += chunk; });
process.stdin.on('end', function () {
  let variables;
  try {
    variables = JSON.parse(input);
  } catch (error) {
    process.stderr.write('Unable to parse Railway variables\n');
    process.exitCode = 1;
    return;
  }
  if (!variables.BOT_SERVICE_TOKEN) {
    process.stderr.write('BOT_SERVICE_TOKEN is unavailable\n');
    process.exitCode = 1;
    return;
  }

  const updates = {
    BOT_DATA_MODE: 'api',
    BOT_UPDATE_MODE: 'polling',
    TELEGRAM_BOT_USERNAME: 'travel_assistent10_bot',
    TRAVEL_API_BASE_URL:
      'https://travel-assistant-teammate-backend-production.up.railway.app',
    TRAVEL_API_SERVICE_TOKEN: variables.BOT_SERVICE_TOKEN,
  };
  const ssh = spawnSync('ssh.exe', [
    '-i', process.env.CUTOVER_SSH_KEY,
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    process.env.CUTOVER_SSH_HOST,
    'python3', process.env.CUTOVER_REMOTE_HELPER, process.env.CUTOVER_REMOTE_ENV,
  ], {
    input: JSON.stringify(updates),
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  variables = null;
  updates.TRAVEL_API_SERVICE_TOKEN = '';
  input = '';
  if (ssh.status !== 0) {
    process.stderr.write('Secure remote environment update failed\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('{"ok":true}\n');
});
