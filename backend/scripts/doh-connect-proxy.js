const net = require('net');
const https = require('https');

function resolveHost(host, done) {
  if (net.isIP(host)) return done(null, host);
  const request = https.get({
    host: '1.1.1.1',
    servername: 'cloudflare-dns.com',
    path: '/dns-query?name=' + encodeURIComponent(host) + '&type=A',
    headers: { Host: 'cloudflare-dns.com', Accept: 'application/dns-json' },
  }, function (response) {
    let body = '';
    response.on('data', function (chunk) { body += chunk; });
    response.on('end', function () {
      try {
        const parsed = JSON.parse(body);
        const answer = (parsed.Answer || []).find(function (item) { return item.type === 1; });
        if (!answer) return done(new Error('No A record'));
        return done(null, answer.data);
      } catch (error) {
        return done(error);
      }
    });
  });
  request.on('error', done);
}

const server = net.createServer(function (client) {
  client.once('data', function (data) {
    const firstLine = data.toString('ascii').split('\r\n')[0];
    const match = /^CONNECT ([^:]+):(\d+)/.exec(firstLine);
    if (!match || Number(match[2]) !== 443) {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    resolveHost(match[1], function (error, address) {
      if (error) {
        client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        return;
      }
      const upstream = net.connect(443, address, function () {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on('error', function () { client.destroy(); });
      client.on('error', function () { upstream.destroy(); });
    });
  });
});

server.listen(48765, '127.0.0.1');
